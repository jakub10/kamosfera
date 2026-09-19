// Spoločný základ pre AI chat v Kamosfére.
//
// Funkcie `ai-chat` a `groq-chat` boli doteraz dve takmer identické kópie —
// oprava v jednej sa musela ručne preniesť do druhej a raz sa na to zabudlo.
// Tu je logika na jednom mieste a každá funkcia si dodá len svoj prompt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 2000;

/** Koľko volaní smie jeden účet spraviť za hodinu. Chráni kredit u Groqu. */
const HOURLY_LIMIT = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  /** Názov funkcie — oddeľuje limity jednotlivých AI funkcií od seba. */
  feature: string;
  systemPrompt: string;
  maxTokens: number;
  temperature?: number;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateMessages(input: unknown): ChatMessage[] | Response {
  if (!Array.isArray(input) || input.length === 0) {
    return json({ error: "Invalid messages" }, 400);
  }
  if (input.length > MAX_MESSAGES) {
    return json({ error: `Too many messages (max ${MAX_MESSAGES})` }, 400);
  }
  for (const m of input) {
    if (
      !m || typeof m !== "object" ||
      typeof m.content !== "string" ||
      !["user", "assistant"].includes(m.role) ||
      m.content.length > MAX_MESSAGE_LENGTH
    ) {
      return json(
        { error: `Invalid message format or content too long (max ${MAX_MESSAGE_LENGTH} chars)` },
        400,
      );
    }
  }
  return input as ChatMessage[];
}

/**
 * Overí prihlásenie, limity aj vstup a prestreamuje odpoveď z Groqu.
 * Funkcia, ktorá to volá, rieši už len svoj systémový prompt.
 */
export async function handleChatRequest(req: Request, options: ChatOptions): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Tieto funkcie bežia s verify_jwt = false, prihlásenie si overujeme sami.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await authClient.auth.getUser(token);
    const userId = userData.user?.id;
    if (authErr || !userId) return json({ error: "Unauthorized" }, 401);

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      console.error("GROQ_API_KEY is not configured");
      return json({ error: "Chyba AI služby" }, 500);
    }

    // Strop na používateľa a hodinu. Bez neho dokáže jeden účet minúť
    // celý kredit za jedno popoludnie.
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed, error: limitErr } = await admin.rpc("record_ai_usage", {
      _user_id: userId,
      _feature: options.feature,
      _limit: HOURLY_LIMIT,
    });
    if (limitErr) {
      console.error("record_ai_usage failed:", limitErr);
    } else if (allowed === false) {
      return json({ error: "Dneska už jsme si povídali hodně. Zkus to za chvíli." }, 429);
    }

    const body = await req.json();
    const messages = validateMessages(body?.messages);
    if (messages instanceof Response) return messages;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: options.systemPrompt }, ...messages],
        stream: true,
        max_tokens: options.maxTokens,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq API error:", response.status, errorText);
      if (response.status === 429) {
        return json({ error: "Příliš mnoho požadavků, zkus to později." }, 429);
      }
      return json({ error: "Chyba AI služby" }, 500);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error(`${options.feature} error:`, error);
    return json({ error: "Internal server error" }, 500);
  }
}

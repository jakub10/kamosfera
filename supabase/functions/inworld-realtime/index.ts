// Inworld Realtime Speech-to-Speech WebSocket proxy
// Browser <-> this edge function (WS) <-> Inworld Realtime API (WS)
// Uses npm:ws because Deno's native WebSocket cannot set custom headers.
//
// POZOR: `npm:` si rieši Deno sám při nasazení edge funkce. `ws` proto
// NEPATŘÍ do package.json frontendu — když se tam přidá, přestane sedět
// package-lock.json a `npm ci` na Vercelu spadne na EUSAGE (build se
// rozbije, aniž by se v kódu cokoli změnilo).

import WS from "npm:ws@8.18.0";

const CZECH_VOICE = "Hana";

const SYSTEM_PROMPTS: Record<string, string> = {
  cs:
    "Jsi přátelský AI hlasový asistent pro českou dětskou sociální síť Kamosféra. KRITICKÉ: Mluvíš VÝHRADNĚ ČESKY – nikdy nepoužívej angličtinu, slovenštinu ani jiný jazyk. Anglická slova nahrazuj českými ekvivalenty (např. ne 'cool', ale 'super'). Používej českou výslovnost, českou větnou melodii a krátké dětsky bezpečné odpovědi. Vždy navazuj na uloženou paměť této konverzace.",
};


Deno.serve(async (req) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const INWORLD_API_KEY = Deno.env.get("INWORLD_API_KEY");
  if (!INWORLD_API_KEY) {
    return new Response("INWORLD_API_KEY not configured", { status: 500 });
  }

  const url = new URL(req.url);

  // Authenticate via one-time ticket (browsers can't set custom headers on WS).
  // The client must first call the `create_realtime_ws_ticket` RPC to obtain
  // a short-lived ticket UUID and pass it here. The ticket is consumed on use.
  const ticket = url.searchParams.get("ticket");
  if (!ticket || !/^[0-9a-f-]{36}$/i.test(ticket)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Atomically consume the ticket if not expired
    const { data: rows, error } = await admin
      .from("realtime_ws_tickets")
      .delete()
      .eq("ticket", ticket)
      .gt("expires_at", new Date().toISOString())
      .select("user_id");
    if (error || !rows || rows.length === 0) {
      return new Response("Unauthorized", { status: 401 });
    }
  } catch (_) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Vynucená čeština – ignorujeme query parametr lang, aby asistent neměl anglickou výslovnost
  const lang = "cs";
  const voice = CZECH_VOICE;
  const instructions = SYSTEM_PROMPTS.cs;

  const { socket: browser, response } = Deno.upgradeWebSocket(req);

  const sessionId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inworldUrl = `wss://api.inworld.ai/api/v1/realtime/session?key=${sessionId}&protocol=realtime`;

  const SESSION_CFG = JSON.stringify({
    type: "session.update",
    session: {
      instructions,
      voice,
      language: "cs",
      modalities: ["text", "audio"],
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: { model: "whisper-1", language: lang },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 600,
        create_response: false,
      },
    },
  });

  let api: WS | null = null;
  let setup = 0;
  const pending: string[] = [];
  const memory: Array<{ role: "user" | "assistant"; content: string }> = [];
  let assistantDraft = "";

  const remember = (role: "user" | "assistant", content?: string) => {
    const clean = (content || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    memory.push({ role, content: clean });
    if (memory.length > 12) memory.splice(0, memory.length - 12);
  };

  const memoryInstructions = (task: string) => {
    const history = memory.length
      ? memory.map((m) => `${m.role === "user" ? "Uživatel" : "Asistent"}: ${m.content}`).join("\n")
      : "Zatím žádná předchozí replika.";
    return `${instructions}\n\nPAMĚŤ AKTUÁLNÍ KONVERZACE:\n${history}\n\n${task} Mluv česky a navazuj na to, co už uživatel řekl.`;
  };

  const createResponse = (task = "Odpověz uživateli.") => {
    if (!api || api.readyState !== WS.OPEN) return;
    api.send(JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: memoryInstructions(task),
      },
    }));
  };

  const connectInworld = () => {
    api = new WS(inworldUrl, {
      headers: { Authorization: `Basic ${INWORLD_API_KEY}` },
    });

    api.on("open", () => {
      console.log("Connected to Inworld", { lang, voice });
      while (pending.length && api && api.readyState === WS.OPEN) {
        api.send(pending.shift()!);
      }
    });

    api.on("message", (raw: Uint8Array | string) => {
      const data = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      try {
        const event = JSON.parse(data);
        const t = event.type;
        if (setup < 2) {
          if (t === "session.created") {
            api!.send(SESSION_CFG);
            setup = 1;
          } else if (t === "session.updated" && setup === 1) {
            createResponse("Krátce pozdrav uživatele česky a řekni, že si budeš pamatovat průběh tohoto hovoru.");
            setup = 2;
          }
        }

        if (t === "conversation.item.input_audio_transcription.completed") {
          remember("user", event.transcript);
          createResponse("Odpověz na poslední repliku uživatele.");
        } else if (t === "response.output_audio_transcript.delta" || t === "response.audio_transcript.delta") {
          assistantDraft += event.delta || "";
        } else if (t === "response.output_audio_transcript.done" || t === "response.audio_transcript.done") {
          remember("assistant", event.transcript || assistantDraft);
          assistantDraft = "";
        }
      } catch (_) { /* ignore */ }
      if (browser.readyState === WebSocket.OPEN) {
        browser.send(data);
      }
    });

    api.on("error", (e: Error) => console.error("Inworld WS error:", e?.message || e));
    api.on("close", (code: number, reason: Uint8Array) => {
      console.log("Inworld WS closed:", code, new TextDecoder().decode(reason));
      if (browser.readyState === WebSocket.OPEN) browser.close();
    });
  };

  browser.onopen = () => {
    connectInworld();
  };

  // Allow-list of message types the browser may forward to Inworld.
  // Anything else (especially session.update / session.create / response.create
  // with custom instructions) would let the client override the child-safety
  // system prompt and is rejected.
  const ALLOWED_CLIENT_TYPES = new Set([
    "input_audio_buffer.append",
    "input_audio_buffer.commit",
    "input_audio_buffer.clear",
    "conversation.item.create",
    "response.cancel",
  ]);

  browser.onmessage = (ev) => {
    const raw = typeof ev.data === "string" ? ev.data : "";
    if (!raw) return;
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // drop non-JSON
    }
    const t = parsed?.type;
    if (typeof t !== "string" || !ALLOWED_CLIENT_TYPES.has(t)) {
      console.warn("Blocked client message type:", t);
      return;
    }
    // For conversation.item.create, ensure no embedded instructions override
    const item = parsed?.item;
    if (
      t === "conversation.item.create" &&
      typeof item === "object" &&
      item !== null &&
      "role" in item &&
      item.role === "system"
    ) {
      console.warn("Blocked client attempt to inject system item");
      return;
    }
    const msg = JSON.stringify(parsed);
    if (api && api.readyState === WS.OPEN) {
      api.send(msg);
    } else {
      pending.push(msg);
    }
  };

  browser.onclose = () => {
    try { api?.close(); } catch (_) { /* ignore */ }
  };
  browser.onerror = (e) => console.error("Browser WS error:", e);

  return response;
});

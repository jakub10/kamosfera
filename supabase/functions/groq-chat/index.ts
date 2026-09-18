import { handleChatRequest } from "../_shared/groq-chat.ts";

const SYSTEM_PROMPT =
  "Jsi přátelský AI asistent pro dětskou sociální síť Kamosféra. Odpovídej česky, " +
  "buď milý, vstřícný a bezpečný pro děti. Pomáhej s otázkami, kreativními nápady a buď pozitivní.";

Deno.serve((req) =>
  handleChatRequest(req, {
    feature: "groq-chat",
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 1024,
  })
);

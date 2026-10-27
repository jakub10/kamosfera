# Kamosféra

Bezpečná sociální síť pro děti (React + Supabase). Podrobnosti o funkcích a
nastavení jsou v `README.md` — tady jen to, co je potřeba vědět při práci na kódu.

## Příkazy

```bash
npm install
npm run dev         # http://localhost:8080
npm run typecheck   # tsc -b --force — NE `npx tsc --noEmit` (viz Pasti)
npm run lint
npm test            # vitest, jsdom, testy v src/test/
npm run build       # vite build + SSR prerender úvodní stránky (scripts/prerender.mjs)
```

Testy databáze (PostgreSQL 16, bez Dockeru a Supabase CLI) — postup v
`supabase/tests/README.md`: shim `00_supabase_shim.sql` → všechny migrace → testy.

## Struktura

- `src/pages/` obrazovky, `src/components/` UI (`ui/` = shadcn), `src/hooks/`
- `src/lib/safety.ts`, `childSafety.ts`, `messageGuard.ts` — bezpečnostní pravidla
  zrcadlená z databáze
- `src/games/` — deterministické herní enginy (Pevnost); žádné LLM v herní logice
- `supabase/migrations/` — celé schéma, přehratelné od nuly; RLS na každé tabulce
- `supabase/functions/` — Edge funkce (Deno): `message-guard` (Liquid AI),
  `ai-chat`/`groq-chat`, `ai-moderation`, `translate-content`, `inworld-realtime`
- `supabase/manual/` — migrace sloučené do jednoho souboru pro ruční vložení do SQL Editoru
- Alias `@/` → `src/`

## Pasti

- **`tsc --noEmit` nezkontroluje nic** — kořenový `tsconfig.json` má `"files": []`.
  Vždy `npm run typecheck`.
- **Databáze má poslední slovo.** Změna pravidla v `src/lib/safety.ts` (a spol.) musí
  jít i do migrace — a naopak. Klient jen dává dítěti srozumitelnou hlášku dřív.
- **Nový SQL test v `supabase/tests/` nestačí přidat** — CI (`.github/workflows/ci.yml`)
  má každý soubor vypsaný zvlášť, přidej tam krok.
- **Migrace musí projít na čisté databázi** — CI je přehraje všechny od začátku.
  Novou migraci nikdy needituj zpětně, přidej další.
- **`src/integrations/supabase/client.ts` už není generovaný** (dřív Lovable).
  Drží hlášení chybějícího nastavení — nepřepisovat generátorem.
- **Lovable commituje přímo do `main`** a aktualizuje jen `bun.lockb`. Po změně
  závislostí aktualizuj i `package-lock.json` — CI běží na `npm ci`.
- **`vercel.json` bez komentářů** — Vercel validuje schéma, hlídá to
  `src/test/vercelConfig.test.ts`. `installCommand` je záměrně `npm install`, ne `npm ci`.
- **`.env` jen s veřejným (anon) klíčem** — všechno `VITE_*` končí v prohlížeči.
- Noční režim 22:00–6:30 (Praha) vynucuje databáze; testy času v `nightMode.test.ts`.

## Konvence

- Jazyk: UI, komentáře i commity česky (část dokumentace slovensky). Výchozí
  jazyk i18n je `cs` (`src/i18n/`, překlady `cs`/`sk`/`en`) — menu je vždy česky.
- Komentáře vysvětlují *proč*, ne *co* — styl viz `src/lib/safety.ts`.
- Nasazení databáze a Edge funkcí dělá vlastník ručně přes Supabase dashboard;
  když změna vyžaduje krok navíc (secret, deploy funkce, SQL), napiš ho do `README.md`.

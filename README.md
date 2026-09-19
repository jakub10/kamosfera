# Kamosféra

Bezpečná sociální síť pro děti — příspěvky, stories, skupiny, zprávy, hry
a AI kamarád. Česky, pro kamarády ze školy.

## Spuštění

Potřebuješ Node.js 20 nebo novější.

```bash
npm install
cp .env.example .env     # a doplň hodnoty ze Supabase
npm run dev
```

Aplikace pak běží na `http://localhost:8080`.

Do `.env` patří **jen** veřejný (anon) klíč ze Supabase. Všechno s prefixem
`VITE_` se zabalí do JavaScriptu v prohlížeči, takže service-role klíč by
si odtud kdokoli přečetl. Soubor `.env` je schválně v `.gitignore`.

## Příkazy

| Příkaz | Co dělá |
|---|---|
| `npm run dev` | Vývojový server |
| `npm run build` | Produkční build |
| `npm run typecheck` | Kontrola typů (`tsc -b`, ne `tsc --noEmit` — viz níže) |
| `npm run lint` | ESLint |
| `npm test` | Testy v prohlížečovém prostředí |

> **Pozor na typovou kontrolu.** Kořenový `tsconfig.json` má `"files": []`
> a jen odkazuje na dílčí projekty. `npx tsc --noEmit` proto **nezkontroluje
> vůbec nic** a tváří se, že je všechno v pořádku. Skutečnou kontrolu dělá
> `npm run typecheck`.

## Nasazení na Vercel

Konfigurace je v `vercel.json`. Dvě věci v ní nejsou samozřejmé:

**`installCommand` je `npm install`, ne `npm ci`.** Lovable commituje přímo
do `main` a aktualizuje jen `bun.lockb`, takže `package-lock.json` občas
přestane sedět. `npm ci` na to spadne (`EUSAGE`) a web je dole, aniž by se
v kódu cokoli změnilo — přesně to se už jednou stalo. `npm install` to
přežije. Přísné `npm ci` zůstává v CI, kde se rozejití zámků pozná dřív:
**produkce shovívavá, kontrola přísná.**

**`rewrites` na `index.html`.** Routování běží v prohlížeči; bez tohohle
vrací přímé otevření `/svet` nebo `/messages` chybu 404. Statické soubory
se servírují dřív, takže se to nedotkne `/assets`.

> Do `vercel.json` nepatří komentáře. JSON je nemá a Vercel validuje schéma —
> neznámá vlastnost (třeba `"//"`) shodí build dřív, než vůbec začne.
> Hlídá to test `src/test/vercelConfig.test.ts`.

Aplikace potřebuje `VITE_SUPABASE_URL` a `VITE_SUPABASE_PUBLISHABLE_KEY`
(Settings → Environment Variables). Bez nich se místo aplikace ukáže
stránka, která řekne, co doplnit.

## Jak je to postavené

- **Frontend** — React 18, Vite, TypeScript, Tailwind, shadcn/ui
- **Backend** — Supabase: PostgreSQL s Row Level Security, Auth, Storage, Realtime
- **Edge funkce** (Deno) — AI chat přes Groq, hlasový agent přes Inworld,
  moderace obsahu, překlady, správa rolí

```
src/
  components/   UI — social, profile, games, auth, ui (shadcn)
  pages/        Obrazovky (Index, Messages, Groups, Profile, …)
  hooks/        useAuth, useUserRole, useAchievements, …
  lib/safety.ts Bezpečnostní pravidla sdílená s databází
supabase/
  migrations/   Historie schématu — celá, přehratelná od nuly
  functions/    Edge funkce
  tests/        Testy RLS a ochrany zpráv (README uvnitř)
```

## Bezpečnost

Síť je pro děti, takže pár pravidel platí bez výjimky:

- **Soukromé zprávy.** Kamarádi si píšou bez omezení. Kdo kamarád není, pošle
  jednu krátkou zprávu bez odkazů a druhá strana rozhodne, jestli konverzace
  začne. Druhá zpráva neprojde — brání tomu databáze, ne tlačítko v UI.
- **Blokování.** Obousměrné, schová i příspěvky a komentáře. Spravuje se
  v Nastavení.
- **Role.** Nikdo si nepřidělí roli sám — chrání to restriktivní RLS politika
  i databázový trigger.
- **Bezpečnostní deník.** Creator vidí, kdo koho oslovil a kdo koho zablokoval,
  ale **nikdy obsah zpráv**. Dohled bez čtení soukromé komunikace.

Tahle pravidla hlídají testy v `supabase/tests/` a běží i v CI. Když někdo
sáhne do migrací tak, že se ochrana dá obejít, build spadne.

Pravidla, která platí na obou stranách (délka první zprávy, odkazy, přezdívky),
jsou v `src/lib/safety.ts` a zároveň v migraci. **Změna na jedné straně bez
druhé je chyba** — poslední slovo má vždycky databáze.

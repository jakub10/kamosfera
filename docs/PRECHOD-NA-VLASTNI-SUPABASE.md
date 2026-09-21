# Přechod z Lovable Cloud na vlastní Supabase

Kamosféra doteď běžela na databázi, kterou pro projekt založilo Lovable
(„Lovable Cloud"). Je to skutečný Supabase projekt, ale **není vidět ve
vlastním Supabase účtu** — nejde tam pustit migrace, nastavit Google
přihlášení ani doplnit tajné klíče. Přesně na tom jsme se točili v kruhu.

Tenhle návod tu databázi postaví znovu pod vlastním účtem. Repozitář na to
má všechno: 44 migrací, které schéma postaví od nuly, včetně úložišť na
obrázky. Testy v `supabase/tests/` to ověřují při každém CI běhu.

> **Co to znamená pro data.** Nový projekt začíná prázdný — účty ani
> příspěvky se samy nepřenesou. Když v Lovable Cloudu něco je a má to
> zůstat, je potřeba to vyexportovat **dřív**, než se Kamosféra přepne
> (Lovable → Cloud → databáze). Když tam je jen pár zkušebních účtů, je
> nejrychlejší založit je znovu.

---

## 1. Nový projekt v Supabase

<https://supabase.com/dashboard> → **New project**.

- Účet: **Jakubův** — ten, pod kterým je repozitář.
- Název: `kamosfera`
- Region: **Frankfurt (eu-central-1)** — nejblíž.
- **Database password**: vygenerovat a hned uložit do správce hesel.
  Ukáže se jen jednou a bez něj se migrace nenahrají.

Po založení: **Project Settings → API**. Odtud jsou potřeba dvě hodnoty:

| Co | Kam patří |
|---|---|
| **Project URL** (`https://<ref>.supabase.co`) | `VITE_SUPABASE_URL` |
| **anon / publishable key** | `VITE_SUPABASE_PUBLISHABLE_KEY` |

`<ref>` je ta krátká náhodná část v adrese — bude se hodit dál.

> **`service_role` klíč zůstane v Supabase.** Do `VITE_` proměnných nikdy —
> zabalil by se do stránky a přečetl by si ho kdokoli.

---

## 2. Schéma databáze

V terminálu, v adresáři s repozitářem:

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push --include-all
```

`--include-all` je důležité: bez něj Supabase CLI přeskočí migrace starší,
než je poslední zaznamenaná — a tady se nahrává celá historie najednou.

Projde-li to bez chyby, stojí kompletní schéma: profily, příspěvky, zprávy
se žádostmi o konverzaci, blokování, bezpečnostní deník, reakce, hry
i `world_seed()` pro Kamosvět.

> **Export z Lovable má rozbité kódování.** Soubor, co odtamtud spadne,
> má českou diakritiku převedenou přes čínskou znakovou sadu — „První
> příspěvek" v něm vypadá jako „Prvn铆 p艡铆sp臎vek". Nahrát se takhle nesmí,
> jinak v aplikaci zůstanou čínské znaky. Schéma i obsah tabulky
> `achievements` staví migrace správně, takže tenhle export není potřeba.

Kontrola v dashboardu: **Table Editor** → mají tam být tabulky `profiles`,
`posts`, `conversations`, `user_blocks`, `safety_events`; **Storage** → 
úložiště na avatary a obrázky.

---

## 3. Přihlášení

**Authentication → URL Configuration**

- *Site URL*: `https://kamosfera.vercel.app`
- *Redirect URLs*: přidat i adresy náhledů z Vercelu
  (`https://kamosfera-*.vercel.app`), jinak se z nich nejde přihlásit.

**Authentication → Providers → Email**

- *Confirm email* — zapnuto znamená, že každý nový účet čeká na klik
  v mailu. Pro pár kamarádů ze školy je jednodušší to **vypnout**; pak
  registrace končí rovnou přihlášením.

**Authentication → Providers → Google** (volitelné, e-mail funguje i bez toho)

1. Google Cloud Console → *Credentials* → OAuth client, typ *Web application*.
2. Mezi *Authorized redirect URIs*: `https://<ref>.supabase.co/auth/v1/callback`
3. Client ID a Client Secret vložit v Supabase a providera zapnout.

Dokud Google zapnutý není, tlačítko to řekne a pošle uživatele na
přihlášení e-mailem — nerozbije se tím nic.

---

## 4. Edge funkce

```bash
npx supabase functions deploy
```

Nasadí všech sedm najednou. `supabase/config.toml` u nich drží, která
vyžaduje přihlášení (`verify_jwt`) — soubor se nahrává s nimi, takže se
o to není potřeba starat.

Pak **Edge Functions → Secrets** (nebo `npx supabase secrets set KLÍČ=hodnota`):

| Klíč | K čemu | Odkud |
|---|---|---|
| `GROQ_API_KEY` | AI kamarád, moderace, překlady | <https://console.groq.com> |
| `INWORLD_API_KEY` | hlasový agent | <https://inworld.ai> |
| `VIP_ACTIVATION_CODE` | aktivace role VIP | vymyslet |
| `CREATOR_ACTIVATION_CODE` | aktivace role Creator | vymyslet |
| `VIP_PRO_MAX_ACTIVATION_CODE` | aktivace role VIP Pro Max | vymyslet |

> **`LOVABLE_API_KEY` už není potřeba.** Moderace i překlady jezdily přes
> bránu Lovable, jejíž klíč patří k projektu v Lovable Cloud a po přechodu
> by přestal platit. Obě funkce teď volají Groq — stejně jako AI kamarád,
> takže stačí jeden klíč.

> **Aktivační kódy vymyslet nové.** Ten původní byl natvrdo v kódu, takže
> ho zná každý, kdo se podíval do repozitáře.

---

## 5. Vercel

**Settings → Environment Variables** — přepsat na nové hodnoty z kroku 1:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
```

Vite zapéká proměnné **při buildu**, takže po změně je nutné pustit
**Redeploy**. Bez toho web dál mluví se starou databází.

---

## 6. Zkouška

1. Otevřít `https://kamosfera.vercel.app`, založit nový účet.
2. Napsat příspěvek, přidat reakci, nahrát obrázek.
3. Zkusit poslat zprávu někomu, kdo není kamarád — musí projít jedna
   krátká zpráva bez odkazu a druhá už ne.

Kdyby registrace selhala, hláška v aplikaci teď ukáže i to, co odpověděl
server, a v konzoli prohlížeče (F12) je celá chyba. To je ten rozdíl oproti
„zkus to prosím znovu za chvíli", na kterém jsme ztratili večer.

---

## Co v repozitáři zbylo z Lovable

`lovable-tagger` ve `vite.config.ts` — značkuje komponenty ve vývojovém
režimu, aby se v editoru Lovable dalo klikat do kódu. S databází nemá nic
společného a produkčního buildu se netýká, takže může zůstat.

Co odešlo: `@lovable.dev/cloud-auth-js` (posílal přihlášení na relativní
`/~oauth/initiate`, což mimo jejich hosting končilo na 404), sdílení sezení
s editorem přes `postMessage` a volání `ai.gateway.lovable.dev`.

**Editor Lovable po přechodu ztratí sdílené přihlášení s náhledem** — v jeho
preview bude potřeba se přihlásit normálně. Kód upravovat dál může.

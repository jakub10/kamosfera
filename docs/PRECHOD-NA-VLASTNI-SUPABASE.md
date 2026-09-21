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

**Bez terminálu.** V Supabase vlevo **SQL editor** → **New query** → vložit
celý soubor `1-schema.sql` → **Run**. Chvíli to běží, pak se dole ukáže
`Success`. Hotovo.

Ten soubor je všech 46 migrací slepených za sebou; vyrobí ho
`scripts/schema_do_jedneho_suboru.sh`. Kdo terminál má, může místo toho:

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push --include-all
```

`--include-all` je tam důležité: bez něj CLI přeskočí migrace starší, než
je poslední zaznamenaná, a tady se nahrává celá historie najednou.

Ať tak nebo tak, po doběhnutí stojí kompletní schéma: profily, příspěvky,
zprávy se žádostmi o konverzaci, blokování, bezpečnostní deník, reakce,
hry i `world_seed()` pro Kamosvět.

> **Export z Lovable má rozbité kódování.** Soubor, co odtamtud spadne,
> má českou diakritiku převedenou přes čínskou znakovou sadu — „První
> příspěvek" v něm vypadá jako „Prvn铆 p艡铆sp臎vek". Nahrát se takhle nesmí,
> jinak v aplikaci zůstanou čínské znaky. Obsah tabulky `achievements`
> staví migrace správně, takže tenhle export není potřeba.

### Ochrana odběrů naživo

Na konci schématu se ozve jedna kontrola. Když řekne **„Odběry naživo jsou
chráněné"**, je vše v pořádku a tuhle část přeskoč.

Když se ozve varování, že politika **nevznikla**: tabulka `realtime.messages`
patří Supabase, ne nám, a SQL editor na ni nemusí mít práva. Jde o pravidlo,
které drží, že dítě si může přihlásit odběr jen svých konverzací a skupin.
Bez něj si kdokoli přihlásí odběr cizího kanálu a čte zprávy, jak přicházejí —
RLS nad `public.messages` to nezachytí, protože ta hlídá čtení tabulky,
ne odběr kanálu.

Zbytek databáze je v pořádku a aplikace poběží. Dorovnat to jde dvěma
způsoby:

- **Supabase CLI** (`npx supabase db push --include-all`) běží pod rolí,
  která na tu tabulku dosáhne, a politiku vytvoří.
- Nebo **Realtime úplně vypnout**, dokud to není nastavené: Database →
  Replication → odebrat tabulky z publikace. Aplikace pak neaktualizuje
  živě, ale nic neuniká.

Kontrola se dá spustit kdykoli znovu:

```sql
SELECT policyname FROM pg_policies
WHERE schemaname = 'realtime' AND tablename = 'messages';
```

Kontrola v dashboardu: **Table Editor** → mají tam být tabulky `profiles`,
`posts`, `conversations`, `user_blocks`, `safety_events`; **Storage** →
úložiště na avatary a obrázky.

## 3. Přihlášení

**Authentication → URL Configuration**

- *Site URL*: `https://kamosfera.online`
- *Redirect URLs*: k tomu ještě `https://kamosfera.vercel.app` a adresy
  náhledů (`https://kamosfera-*.vercel.app`) — jinak se z nich nejde
  přihlásit a testovat před ostrým nasazením nejde.

Adresa v *Site URL* je ta, na kterou se posílají odkazy z e-mailů. Patří
sem doména, ne `vercel.app`, jinak dětem chodí odkazy jinam, než na čem
web běží.

**Authentication → Providers → Email**

- *Confirm email* — zapnuto znamená, že každý nový účet čeká na klik
  v mailu. Pro pár kamarádů ze školy je jednodušší to **vypnout**; pak
  registrace končí rovnou přihlášením.

**Authentication → Providers → Google** (volitelné, e-mail funguje i bez toho)

1. Google Cloud Console → *Credentials* → OAuth client, typ *Web application*.
2. Mezi *Authorized redirect URIs*: `https://<ref>.supabase.co/auth/v1/callback`
   (adresa Supabase, ne `kamosfera.online` — Google se baví se Supabase,
   teprve ten pak pustí dítě zpátky na web)
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

**Settings → Domains** → přidat `kamosfera.online` a `www.kamosfera.online`.
Vercel ukáže, co nastavit u registrátora domény — většinou `A` záznam pro
kořen a `CNAME` pro `www`. Než se změna rozejde po internetu, může to
trvat i pár hodin; do té doby dál funguje adresa na `vercel.app`.

Certifikát (HTTPS) si Vercel vystaví sám, jakmile záznamy sedí. Žádné
`http://` — prohlížeče by u přihlašování nadávaly a právem.

**Settings → Environment Variables** — přepsat na nové hodnoty z kroku 1:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
```

Vite zapéká proměnné **při buildu**, takže po změně je nutné pustit
**Redeploy**. Bez toho web dál mluví se starou databází.

---

## 6. Data ze staré Kamosféry

Nová databáze startuje prázdná. Účty, příspěvky a zprávy se přenesou
jedním SQL souborem, který vyrobí `scripts/prenos_dat.py` z exportu
(jednotlivé tabulky jako CSV ze záložky Cloud → Database).

```bash
python3 scripts/prenos_dat.py export/ ucty.txt > 2-import.sql
```

`ucty.txt` je seznam e-mailů, jeden na řádek, ze záložky **Users**.
K profilům se přiřadí podle toho, že stará Kamosféra odvozovala přezdívku
z e-mailu — kdo se hlásil jako `karel.vomacka@…`, měl přezdívku
`karel.vomacka`. Byla to
díra do soukromí a je zalepená; tady se naposled hodí.

Výsledný `2-import.sql` pak — stejně jako schéma — celý najednou do
**SQL editoru**. Je to jedna
transakce a na konci si sám zkontroluje počty — když něco nesedí, vypíše
to a nic se neuloží.

> **Ten soubor obsahuje e-maily dětí a obsah jejich soukromých zpráv.**
> Po použití ho smaž. Proto ho taky hlídá `.gitignore`.

**Hesla se přenést nedají** — v exportu nejsou. Každý dostane stejné
dočasné heslo a hned si ho změní. Kdo se dosud hlásil přes Google, může
dál: účet se spáruje podle e-mailu, jakmile je Google nastavený podle
kroku 3.

**Obrázky** (5 avatarů, 8 v příspěvcích) leží ve starém úložišti. Skript
`stiahni-obrazky.sh`, který vznikne vedle, je stáhne; nahrát se musí do
stejnojmenných bucketů (`avatars`, `posts`) a na stejnou cestu. Adresy
pak přepíše `UPDATE` na konci toho skriptu.

## 7. Zkouška

1. Otevřít `https://kamosfera.online` a přihlásit se dočasným heslem —
   měly by být vidět staré příspěvky i konverzace.
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

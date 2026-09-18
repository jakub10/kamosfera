# Testy databázy

Overujú, že pravidlá chrániace deti naozaj platia — nie že je na ne napísaný kód.
Každý test popisuje jednu vec, ktorá sa **nesmie** podariť: cudzí človek nesmie
poslať druhou správu, zablokovaný se nesmie vrátit, nikdo si nesmí přidělit roli.

Testy běží v obyčejném PostgreSQL, bez Dockeru a bez Supabase CLI. Soubor
`00_supabase_shim.sql` nahrazuje to, co jinak dodává Supabase (schéma `auth`,
`storage`, `realtime`, funkce `auth.uid()` a role `anon` / `authenticated`).

## Spuštění

Potřebuješ PostgreSQL 16 a prázdnou databázi:

```bash
createdb kamosfera_test

# 1) prostředí, které jinak dodává Supabase
psql -d kamosfera_test -v ON_ERROR_STOP=1 -f supabase/tests/00_supabase_shim.sql

# 2) celá historie migrací, od začátku
for f in supabase/migrations/*.sql; do
  psql -d kamosfera_test -q -v ON_ERROR_STOP=1 -f "$f" || { echo "ZLYHALO: $f"; break; }
done

# 3) samotné testy
psql -d kamosfera_test -v ON_ERROR_STOP=1 -f supabase/tests/01_messaging_security.sql
```

Každý test, který projde, vypíše `OK`. Když něco selže, skript skončí chybou
`ZLYHALO:` a jménem testu.

## Co se testuje

| # | Co musí platit |
|---|---|
| 1 | Konverzaci nejde založit přímo, jen přes `start_conversation` |
| 2 | První zpráva nesmí obsahovat odkaz |
| 3 | Cizí člověk založí konverzaci ve stavu `pending` s jedinou zprávou |
| 4 | Druhá zpráva do čekající konverzace neprojde |
| 5 | Kamarádi si píšou rovnou, bez žádosti |
| 6 | Po přijetí žádosti už zprávy procházejí |
| 7 | Odesílatel si vlastní žádost nepřijme sám |
| 8 | Blokování schová konverzace i příspěvky |
| 9 | Zablokovaný nezaloží novou konverzaci |
| 10 | Hromadné rozesílání žádostí narazí na limit |
| 11 | Nikdo si nepřidělí roli `creator` (starší ochrana stále drží) |
| 12 | Bezpečnostní deník vidí jen creator |

Tyhle testy běží i v CI — workflow `.github/workflows/ci.yml`, úloha
`database`, si pro ně nastartuje PostgreSQL a projde celou historii migrací
od nuly. Pravidla, která jdou ověřit v prohlížeči (délka první zprávy, odkazy,
přezdívky), hlídá `npm test`.

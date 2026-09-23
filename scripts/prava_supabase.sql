-- ============================================================================
-- Vráti prístupové práva, ktoré zmizli s upratovacím skriptom.
--
-- Nové Supabase má v schéme `public` nastavené, že každá novo vytvorená
-- tabuľka automaticky dostane práva pre roly `anon`, `authenticated`
-- a `service_role`. Skript 0-vycisti schému zmazal a založil znova —
-- a to nastavenie odišlo s ňou. Tabuľky potom vznikli bez práv a prihlásený
-- človek dostal „permission denied" na všetko. Stránka bola prázdna.
--
-- Je to presne stav, v akom Supabase projekt normálne je. Kto čo smie
-- vidieť, o tom aj tak rozhodujú ochranné pravidlá (RLS), ktoré má každá
-- tabuľka zapnuté.
--
-- Funkcie sa zámerne NEOTVÁRAJÚ pre anon ani authenticated: viaceré sú
-- v migráciách úmyselne zavreté (správa rolí, udeľovanie odznakov, ...)
-- a tak aj zostanú. Iba service_role — kľúč, ktorý žije len na serveri —
-- dostane právo volať všetky, ako je v Supabase zvykom.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- A aby to platilo aj pre tabuľky, ktoré pribudnú neskôr. V Supabase ich
-- zakladá rola `postgres`; keby tam nebola, nech to aspoň nezhodí kontrolu.
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'Rola postgres neexistuje — predvolené práva preskočené.';
END $$;

-- Kontrola: čo teraz uvidí prihlásený človek. Musí sedieť s počtami z importu.
SELECT
  has_table_privilege('authenticated', 'public.posts', 'SELECT')    AS moze_citat_prispevky,
  has_table_privilege('authenticated', 'public.messages', 'SELECT') AS moze_citat_spravy,
  has_function_privilege('authenticated', 'public.check_user_achievements(uuid)', 'EXECUTE')
                                                                     AS moze_si_sam_udelit_odznak;
-- Očakávané: true, true, false.

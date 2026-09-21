-- ============================================================================
-- Testy odznakov za hry: dajú sa naozaj získať.
--
-- Desať odznakov za hry roky existovalo v databáze, zobrazovalo sa v zozname
-- a nikto ich nikdy nedostal — prahy sa porovnávali iba proti `user_stats`,
-- kde skóre z hier nie je. Tieto testy držia, že to platí aj naďalej.
--
-- Spúšťa sa po 01_messaging_security.sql — používa jeho `chk`.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

INSERT INTO auth.users (id, email) VALUES
  ('55555555-5555-5555-5555-555555555555', 'hrac@test.local')
ON CONFLICT DO NOTHING;

\echo ''
\echo '--- H1. Každý odznak za hru vie, ktorej hry sa týka ---'
DO $$
DECLARE bez_hry int; spolu int;
BEGIN
  SELECT count(*) INTO bez_hry FROM public.achievements
   WHERE category = 'games' AND game_type IS NULL;
  SELECT count(*) INTO spolu FROM public.achievements WHERE category = 'games';
  PERFORM chk('odznaky za hry existujú', spolu = 10, true);
  PERFORM chk('žiadny z nich nie je bez game_type', bez_hry = 0, true);
END$$;

\echo '--- H2. Skóre pod prahom odznak nedá ---'
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
  PERFORM public.submit_game_score('snake', 99);

  SELECT count(*) INTO n
    FROM public.user_achievements ua
    JOIN public.achievements a ON a.id = ua.achievement_id
   WHERE ua.user_id = '55555555-5555-5555-5555-555555555555'
     AND a.category = 'games';
  PERFORM chk('99 bodov v Snake ešte na nič nestačí', n = 0, true);
END$$;

\echo '--- H3. Prekročenie prahu odznak dá, a to sám od seba ---'
DO $$
DECLARE ma_odznak boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
  PERFORM public.submit_game_score('snake', 120);

  SELECT EXISTS (
    SELECT 1 FROM public.user_achievements ua
      JOIN public.achievements a ON a.id = ua.achievement_id
     WHERE ua.user_id = '55555555-5555-5555-5555-555555555555'
       AND a.name = 'Had začátečník'
  ) INTO ma_odznak;
  PERFORM chk('120 bodov v Snake dalo odznak Had začátečník', ma_odznak, true);
END$$;

\echo '--- H4. Odznak platí len za svoju hru ---'
DO $$
DECLARE ma_vezu boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_achievements ua
      JOIN public.achievements a ON a.id = ua.achievement_id
     WHERE ua.user_id = '55555555-5555-5555-5555-555555555555'
       AND a.game_type = 'tower_defense'
  ) INTO ma_vezu;
  PERFORM chk('Snake nedal odznak za Tower Defense', ma_vezu, false);
END$$;

\echo '--- H5. Body za odznak sa pripíšu do total_points ---'
DO $$
DECLARE body int;
BEGIN
  SELECT total_points INTO body FROM public.user_stats
   WHERE user_id = '55555555-5555-5555-5555-555555555555';
  PERFORM chk('Had začátečník pripísal svojich 15 bodov', body = 15, true);
END$$;

\echo '--- H6. Kto iba hrá, o odznaky nepríde ---'
-- Riadok v `user_stats` zakladajú až triggery od príspevkov a správ. Skôr sa
-- prepočet bez neho končil hneď na začiatku — teda práve tomu, kto len hrá.
DO $$
DECLARE ma_odznak boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    ('66666666-6666-6666-6666-666666666666', 'ibahrac@test.local')
  ON CONFLICT DO NOTHING;
  DELETE FROM public.user_stats WHERE user_id = '66666666-6666-6666-6666-666666666666';

  PERFORM set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
  PERFORM public.submit_game_score('clicker', 600);

  SELECT EXISTS (
    SELECT 1 FROM public.user_achievements ua
      JOIN public.achievements a ON a.id = ua.achievement_id
     WHERE ua.user_id = '66666666-6666-6666-6666-666666666666'
       AND a.name = 'Rychlé prsty'
  ) INTO ma_odznak;
  PERFORM chk('bez jediného príspevku dostal odznak za Clicker', ma_odznak, true);
END$$;

\echo '--- H7. Vyšší rekord dá aj vyššie odznaky, nižší nič nezoberie ---'
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
  PERFORM public.submit_game_score('snake', 1000);
  PERFORM public.submit_game_score('snake', 5);

  SELECT count(*) INTO n
    FROM public.user_achievements ua
    JOIN public.achievements a ON a.id = ua.achievement_id
   WHERE ua.user_id = '55555555-5555-5555-5555-555555555555'
     AND a.game_type = 'snake';
  PERFORM chk('1000 bodov dalo všetky tri odznaky za Snake', n = 3, true);
END$$;

\echo ''
\echo 'Odznaky za hry: všetko prešlo.'

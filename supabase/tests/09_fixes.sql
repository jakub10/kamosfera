-- ============================================================================
-- Opravy z 16. 10. 2026: obsazená přezdívka při registraci, přečtené zprávy,
-- „Potřebuju pomoct" pro důvěrníka.
--
--   h1 Lukáš — píše
--   h2 Marta — dostává (má důvěrníka)
--   h3 Ota   — cizí, v konverzaci nesedí
-- Spouští se po 08_message_guard.sql — používá `chk`, `ako` a `ako_chyba`.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo ''
\echo '--- H1. Obsazená přezdívka registraci neshodí ---'
DO $$
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('a9000000-0000-0000-0000-000000000001', 'nick1@test.local', '{"username": "Dvojnik", "full_name": "Prvni"}'),
    ('a9000000-0000-0000-0000-000000000002', 'nick2@test.local', '{"username": "dvojnik"}'),
    ('a9000000-0000-0000-0000-000000000003', 'nick3@test.local', '{}');
  PERFORM chk('první dostane přezdívku, jak ji napsal (malými písmeny)',
    (SELECT username FROM public.profiles WHERE user_id = 'a9000000-0000-0000-0000-000000000001') = 'dvojnik', true);
  PERFORM chk('druhý dostane volnou variantu',
    (SELECT username FROM public.profiles WHERE user_id = 'a9000000-0000-0000-0000-000000000002') = 'dvojnik2', true);
  PERFORM chk('bez přezdívky (Google) vznikne kamos_…',
    (SELECT username FROM public.profiles WHERE user_id = 'a9000000-0000-0000-0000-000000000003') LIKE 'kamos\_%', true);
END $$;

INSERT INTO auth.users (id, email)
SELECT ('a9100000-0000-0000-0000-00000000000' || g)::uuid, 'fix' || g || '@test.local'
  FROM generate_series(1, 3) g;
UPDATE public.member_safety SET approved = true, consent_at = now()
 WHERE user_id::text LIKE 'a9100000-%';
INSERT INTO public.conversations (id, participant_1, participant_2, status)
VALUES ('a9200000-0000-0000-0000-000000000001', 'a9100000-0000-0000-0000-000000000001',
        'a9100000-0000-0000-0000-000000000002', 'accepted');
INSERT INTO public.messages (conversation_id, sender_id, content, read) VALUES
  ('a9200000-0000-0000-0000-000000000001', 'a9100000-0000-0000-0000-000000000001', 'ahoj', false),
  ('a9200000-0000-0000-0000-000000000001', 'a9100000-0000-0000-0000-000000000001', 'jak se máš', false),
  ('a9200000-0000-0000-0000-000000000001', 'a9100000-0000-0000-0000-000000000002', 'dobře', false);

\echo ''
\echo '--- H2. Přečtené zprávy zůstanou přečtené ---'
DO $$
DECLARE
  konv uuid := 'a9200000-0000-0000-0000-000000000001';
  lukas uuid := 'a9100000-0000-0000-0000-000000000001';
  marta uuid := 'a9100000-0000-0000-0000-000000000002';
  ota uuid := 'a9100000-0000-0000-0000-000000000003';
BEGIN
  PERFORM chk('cizí konverzaci si přečíst nejde',
    ako_chyba(ota, format('SELECT to_jsonb(public.mark_conversation_read(%L))', konv)) LIKE '%nejsi%', true);
  PERFORM chk('příjemkyně si označí obě zprávy jako přečtené',
    ako(marta, format('SELECT to_jsonb(public.mark_conversation_read(%L))', konv)) = '2'::jsonb, true);
  PERFORM chk('v databázi jsou opravdu přečtené',
    (SELECT count(*) FROM public.messages WHERE conversation_id = konv AND sender_id = lukas AND NOT read) = 0, true);
  PERFORM chk('vlastní zprávu si „přečíst" nejde — tu čte ten druhý',
    (SELECT read FROM public.messages WHERE conversation_id = konv AND sender_id = marta), false);
  PERFORM chk('nepřihlášený nic',
    ako_chyba(NULL, format('SELECT to_jsonb(public.mark_conversation_read(%L))', konv)) IS NOT NULL, true);
END $$;

\echo ''
\echo '--- H3. „Potřebuju pomoct" ---'
DO $$
DECLARE
  marta uuid := 'a9100000-0000-0000-0000-000000000002';
  ota uuid := 'a9100000-0000-0000-0000-000000000003';
BEGIN
  PERFORM chk('bez důvěrníka odpoví „guardian: false"',
    ako(ota, 'SELECT public.ask_guardian_help()') = '{"guardian": false}'::jsonb, true);
  PERFORM chk('a nic se nezapíše',
    NOT EXISTS (SELECT 1 FROM public.guardian_signals WHERE child_id = ota), true);
  INSERT INTO public.guardians (child_id, label, token) VALUES (marta, 'důvěrník', repeat('h', 64));
  PERFORM chk('s důvěrníkem odpoví „guardian: true"',
    ako(marta, 'SELECT public.ask_guardian_help()') = '{"guardian": true}'::jsonb, true);
  PERFORM chk('a důvěrník dostane signál',
    EXISTS (SELECT 1 FROM public.guardian_signals WHERE child_id = marta AND kind = 'help'), true);
  PERFORM chk('důvěrník signál vidí',
    (SELECT public.guardian_view(repeat('h', 64)) -> 'signals' -> 0 ->> 'kind') = 'help', true);
  PERFORM chk('nepřihlášený nic', ako_chyba(NULL, 'SELECT public.ask_guardian_help()') IS NOT NULL, true);
END $$;

\echo ''
\echo '--- H4. Role přiděluje databáze (bez Edge funkcí) ---'
-- Na Supabase je pgcrypto ve schématu extensions vždy; v testovací databázi ne.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
BEGIN
  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL THEN
    EXECUTE 'CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS ''SELECT public.gen_random_bytes($1)''';
  END IF;
END $$;
GRANT USAGE ON SCHEMA extensions TO authenticated;
DO $$
DECLARE
  tvurce uuid := 'a9100000-0000-0000-0000-000000000001';
  dite uuid := 'a9100000-0000-0000-0000-000000000002';
  cizi uuid := 'a9100000-0000-0000-0000-000000000003';
  kod text;
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (tvurce, 'creator');

  PERFORM chk('obyčejný uživatel VIP rozdávat nesmí',
    ako_chyba(cizi, format('SELECT public.admin_set_role(%L, ''vip'', ''grant'')', dite)) LIKE '%Jen pro tvůrce%', true);
  PERFORM chk('tvůrce dá VIP PRO MAX (s ním i VIP)',
    ako(tvurce, format('SELECT public.admin_set_role(%L, ''vip_pro_max'', ''grant'')', dite)) = '{"success": true}'::jsonb, true);
  PERFORM chk('dítě má vip i vip_pro_max',
    (SELECT count(*) FROM public.user_roles WHERE user_id = dite AND role IN ('vip', 'vip_pro_max')) = 2, true);
  PERFORM chk('druhé udělení nic nezdvojí',
    ako(tvurce, format('SELECT public.admin_set_role(%L, ''vip'', ''grant'')', dite)) = '{"success": true}'::jsonb, true);
  PERFORM chk('… pořád dvě role',
    (SELECT count(*) FROM public.user_roles WHERE user_id = dite AND role IN ('vip', 'vip_pro_max')) = 2, true);
  PERFORM chk('odebrání VIP vezme i PRO MAX',
    ako(tvurce, format('SELECT public.admin_set_role(%L, ''vip'', ''revoke'')', dite)) = '{"success": true}'::jsonb, true);
  PERFORM chk('… a nic nezbude',
    NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = dite AND role IN ('vip', 'vip_pro_max')), true);
  PERFORM chk('tvůrce si vlastní roli tvůrce nevezme',
    ako_chyba(tvurce, format('SELECT public.admin_set_role(%L, ''creator'', ''revoke'')', tvurce)) IS NOT NULL, true);
  PERFORM chk('zapsat si roli přímo nejde',
    ako_chyba(cizi, format('INSERT INTO public.user_roles (user_id, role) VALUES (%L, ''vip'') RETURNING ''1''::jsonb', cizi)) IS NOT NULL, true);

  kod := (ako(tvurce, 'SELECT to_jsonb(public.create_activation_code(''vip''))') #>> '{}');
  PERFORM chk('špatný kód neprojde',
    ako(cizi, 'SELECT public.activate_role_code(''vip'', ''SPATNYKOD123'')') ->> 'success' = 'false', true);
  PERFORM chk('správný kód (i malými písmeny) dá VIP',
    ako(cizi, format('SELECT public.activate_role_code(''vip'', %L)', lower(kod))) ->> 'success' = 'true', true);
  PERFORM chk('… opravdu má VIP', public.has_role(cizi, 'vip'), true);
  PERFORM chk('kód je jednorázový',
    ako(dite, format('SELECT public.activate_role_code(''vip'', %L)', kod)) ->> 'success' = 'false', true);
END $$;

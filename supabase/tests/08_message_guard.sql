-- ============================================================================
-- Testy AI strážcu správ (20261002100000_message_guard.sql).
--
-- Samotné volanie Liquid AI testuje src/test/messageGuard.test.ts. Tu sa
-- overuje, že databáza bez lístka od strážcu správu nepustí (keď je zapnutý)
-- a že signály idú dôverníkovi toho, kto správu DOSTANE.
--
--   g1 Hana  — píše
--   g2 Ivo   — dostáva (má dôverníka)
--   g3 Jana  — správkyňa
-- Spúšťa sa po 07_child_safety.sql — používa `chk`, `ako` a `ako_chyba`.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

INSERT INTO auth.users (id, email)
SELECT ('f0000000-0000-0000-0000-00000000000' || g)::uuid, 'guard' || g || '@test.local'
  FROM generate_series(1, 3) g
ON CONFLICT DO NOTHING;
UPDATE public.member_safety SET approved = true, consent_at = now()
 WHERE user_id::text LIKE 'f0000000-%';
INSERT INTO public.user_roles (user_id, role) VALUES ('f0000000-0000-0000-0000-000000000003', 'creator');
INSERT INTO public.friendships (requester_id, addressee_id, status)
VALUES ('f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'accepted');
INSERT INTO public.conversations (id, participant_1, participant_2, status)
VALUES ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000002', 'accepted');
INSERT INTO public.guardians (child_id, label, token)
VALUES ('f0000000-0000-0000-0000-000000000002', 'mama Iva', repeat('b', 64));

CREATE OR REPLACE FUNCTION g(_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('f0000000-0000-0000-0000-00000000000' || _n)::uuid;
$$;
CREATE OR REPLACE FUNCTION konv() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT 'f1000000-0000-0000-0000-000000000001'::uuid;
$$;
CREATE OR REPLACE FUNCTION napis(_kto uuid, _text text) RETURNS text LANGUAGE sql AS $$
  SELECT ako_chyba(_kto, format(
    'INSERT INTO public.messages (conversation_id, sender_id, content) VALUES (%L, %L, %L) RETURNING ''1''::jsonb',
    konv(), _kto, _text));
$$;
-- Ako serverová funkcia (service_role).
CREATE OR REPLACE FUNCTION ako_server(_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE res jsonb;
BEGIN
  SET LOCAL ROLE service_role;
  EXECUTE _sql INTO res;
  RESET ROLE;
  RETURN res;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE;
END $$;

\echo ''
\echo '--- G1. Kým je strážca vypnutý, správy chodia ako doteraz ---'
DO $$
BEGIN
  PERFORM chk('strážca je na začiatku vypnutý', public.message_guard_enabled(), false);
  PERFORM chk('správa bez lístka prejde', napis(g(1), 'ahoj Ivo') IS NULL, true);
END$$;

\echo '--- G2. Zapína len správca; deti sa k strážcovi nedostanú ---'
DO $$
BEGIN
  PERFORM chk('dieťa strážcu nezapne ani nevypne',
    ako_chyba(g(1), 'SELECT to_jsonb(true) FROM public.admin_set_message_guard(false)') IS NOT NULL, true);
  PERFORM chk('dieťa nezapíše lístok ani nevyrobí kontext',
    ako_chyba(g(1), format('SELECT to_jsonb(public.guard_record(%L, %L, ''x'', ''send'', ''{}'', false))', g(1), konv())) IS NOT NULL
    AND ako_chyba(g(1), format('SELECT public.guard_prepare(%L, %L)', g(1), konv())) IS NOT NULL, true);
  PERFORM chk('dieťa nevidí lístky ani nastavenia',
    ako_chyba(g(1), 'SELECT to_jsonb(count(*)) FROM public.message_checks') IS NOT NULL
    AND ako_chyba(g(1), 'SELECT to_jsonb(count(*)) FROM public.app_settings') IS NOT NULL, true);
  PERFORM ako(g(3), 'SELECT to_jsonb(true) FROM public.admin_set_message_guard(true)');
  PERFORM chk('správkyňa strážcu zapne', public.message_guard_enabled(), true);
  PERFORM chk('správkyňa vidí štatistiku',
    (ako(g(3), 'SELECT public.admin_guard_status()'))->>'enabled' = 'true', true);
END$$;

\echo '--- G3. Zapnutý strážca: bez lístka sa nepíše ---'
DO $$
DECLARE e text;
BEGIN
  PERFORM chk('správa bez lístka neprejde', napis(g(1), 'obídem strážcu') IS NOT NULL, true);

  PERFORM ako_server(format('SELECT to_jsonb(public.guard_record(%L, %L, %L, ''send'', ''{"zavaznost":0.1}'', false))', g(1), konv(), 'ideš von?'));
  PERFORM chk('s lístkom „send" prejde presne tá správa', napis(g(1), 'ideš von?') IS NULL, true);
  PERFORM chk('lístok neplatí na iný text', napis(g(1), 'iný text') IS NOT NULL, true);
  PERFORM chk('lístok neplatí pre druhého v konverzácii', napis(g(2), 'ideš von?') IS NOT NULL, true);

  PERFORM ako_server(format('SELECT to_jsonb(public.guard_record(%L, %L, %L, ''confirm'', ''{}'', false))', g(1), konv(), 'si trochu pomalý'));
  PERFORM chk('po „Naozaj to chceš poslať?" sa dá poslať', napis(g(1), 'si trochu pomalý') IS NULL, true);

  PERFORM ako_server(format('SELECT to_jsonb(public.guard_record(%L, %L, %L, ''unchecked'', ''{"error":"liquid 503"}'', false))', g(1), konv(), 'keď cloud spadne'));
  PERFORM chk('keď Liquid AI vypadne, správa prejde ako neskontrolovaná', napis(g(1), 'keď cloud spadne') IS NULL, true);

  PERFORM ako_server(format('SELECT to_jsonb(public.guard_record(%L, %L, %L, ''send'', ''{}'', false))', g(1), konv(), 'starý lístok'));
  UPDATE public.message_checks SET created_at = now() - interval '6 minutes' WHERE content_md5 = md5('starý lístok');
  PERFORM chk('starý lístok (nad 5 minút) neplatí', napis(g(1), 'starý lístok') IS NOT NULL, true);
END$$;

\echo '--- G4. Ubližujúca správa a tlak na tajomstvo → dôverník príjemcu ---'
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM ako_server(format('SELECT to_jsonb(public.guard_record(%L, %L, %L, ''hide'', ''{"zavaznost":2.5}'', false))', g(1), konv(), 'zlá správa'));
  PERFORM chk('skrytá správa sa nedá poslať', napis(g(1), 'zlá správa') IS NOT NULL, true);
  PERFORM chk('dôverník PRÍJEMCU dostal signál, odosielateľov nie',
    EXISTS (SELECT 1 FROM public.guardian_signals WHERE child_id = g(2) AND kind = 'ai_harmful')
    AND NOT EXISTS (SELECT 1 FROM public.guardian_signals WHERE child_id = g(1)), true);

  PERFORM ako_server(format('SELECT to_jsonb(public.guard_record(%L, %L, %L, ''send'', ''{}'', true))', g(1), konv(), 'nehovor to mame'));
  PERFORM chk('tlak na tajomstvo dá signál, aj keď správa prejde',
    EXISTS (SELECT 1 FROM public.guardian_signals WHERE child_id = g(2) AND kind = 'ai_secret')
    AND napis(g(1), 'nehovor to mame') IS NULL, true);

  v := ako(NULL, format('SELECT public.guardian_view(%L)', repeat('b', 64)));
  PERFORM chk('dôverník vidí oba signály, bez textu a bez mena odosielateľa',
    (SELECT count(*) FROM jsonb_array_elements(v->'signals')) = 2
    AND position('zlá správa' IN v::text) = 0
    AND position((SELECT username FROM public.profiles WHERE user_id = g(1)) IN v::text) = 0, true);
  PERFORM chk('v databáze nie je text správy, len odtlačok',
    NOT EXISTS (SELECT 1 FROM public.message_checks WHERE scores::text LIKE '%zlá%'), true);
END$$;

\echo '--- G5. Kontext pre strážcu ---'
DO $$
DECLARE r jsonb;
BEGIN
  r := ako_server(format('SELECT public.guard_prepare(%L, %L)', g(1), konv()));
  PERFORM chk('kontext: príjemca, kamaráti a najviac 3 predošlé správy (len text)',
    r->>'recipient' = g(2)::text AND (r->>'friends')::boolean AND jsonb_array_length(r->'previous') = 3, true);
  r := ako_server(format('SELECT public.guard_prepare(%L, %L)', g(3), konv()));
  PERFORM chk('kto v konverzácii nie je, kontext nedostane', r ? 'error', true);

  INSERT INTO public.message_checks (sender_id, conversation_id, content_md5, verdict)
  SELECT g(1), konv(), md5(i::text), 'send' FROM generate_series(1, 30) i;
  r := ako_server(format('SELECT public.guard_prepare(%L, %L)', g(1), konv()));
  PERFORM chk('priveľa správ za minútu zastaví limit', r->>'error' LIKE '%rýchlo%', true);
END$$;

-- Ďalšie testy nech bežia s vypnutým strážcom.
UPDATE public.app_settings SET value = 'false' WHERE key = 'message_guard';

\echo ''
\echo 'Strážca správ: všetko OK'

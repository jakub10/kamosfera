-- ============================================================================
-- Testy: AI strážce u první zprávy cizímu a ve skupinách
-- (20261116110000_guard_everywhere.sql).
--
--   h1 Lukáš, h2 Marta, h3 Ota — členové z 09_fixes.sql
-- Spouští se po 10_message_edit_lock.sql — používá `chk`, `ako`, `ako_chyba`
-- a `ako_server` (z 08_message_guard.sql).
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

INSERT INTO auth.users (id, email)
SELECT ('b9100000-0000-0000-0000-00000000000' || g)::uuid, 'gw' || g || '@test.local'
  FROM generate_series(1, 3) g;
UPDATE public.member_safety SET approved = true, consent_at = now() WHERE user_id::text LIKE 'b9100000-%';
INSERT INTO public.friendships (requester_id, addressee_id, status)
VALUES ('b9100000-0000-0000-0000-000000000001', 'b9100000-0000-0000-0000-000000000003', 'accepted');
INSERT INTO public.guardians (child_id, label, token)
VALUES ('b9100000-0000-0000-0000-000000000002', 'táta', repeat('c', 64));
INSERT INTO public.groups (id, name, owner_id, is_private)
VALUES ('b9200000-0000-0000-0000-000000000001', 'parta', 'b9100000-0000-0000-0000-000000000001', false);
INSERT INTO public.group_members (group_id, user_id)
VALUES ('b9200000-0000-0000-0000-000000000001', 'b9100000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'message_guard';

\echo ''
\echo '--- K1. Skupina: bez lístku od strážce se nepíše ---'
DO $$
DECLARE
  w1 uuid := 'b9100000-0000-0000-0000-000000000001';
  w2 uuid := 'b9100000-0000-0000-0000-000000000002';
  sk uuid := 'b9200000-0000-0000-0000-000000000001';
  pis text := 'INSERT INTO public.group_messages (group_id, sender_id, content) VALUES (%L, %L, %L) RETURNING ''1''::jsonb';
BEGIN
  PERFORM chk('zpráva do skupiny bez lístku neprojde',
    ako_chyba(w1, format(pis, sk, w1, 'ahoj parto')) IS NOT NULL, true);
  PERFORM chk('strážce dostane poslední zprávy skupiny, ne jména',
    (ako_server(format('SELECT public.guard_prepare_group(%L, %L)', w1, sk)))->>'relation' = 'skupina', true);
  PERFORM chk('kdo ve skupině není, lístek nedostane',
    (ako_server(format('SELECT public.guard_prepare_group(%L, %L)', w2, sk))) ? 'error', true);
  PERFORM ako_server(format('SELECT to_jsonb(public.guard_record_scope(%L, %L, ''group'', %L, ''send'', ''{}'', false))', w1, sk, 'ahoj parto'));
  PERFORM chk('s lístkem projde přesně ta zpráva',
    ako_chyba(w1, format(pis, sk, w1, 'ahoj parto')) IS NULL, true);
  PERFORM chk('lístek neplatí na jiný text',
    ako_chyba(w1, format(pis, sk, w1, 'něco jiného')) IS NOT NULL, true);
  PERFORM ako_server(format('SELECT to_jsonb(public.guard_record_scope(%L, %L, ''group'', %L, ''hide'', ''{}'', false))', w1, sk, 'ošklivá zpráva'));
  PERFORM chk('zprávu, kterou strážce skryl, databáze nepustí',
    ako_chyba(w1, format(pis, sk, w1, 'ošklivá zpráva')) IS NOT NULL, true);
  PERFORM chk('dítě si lístek nevyrobí samo',
    ako_chyba(w1, format('SELECT to_jsonb(public.guard_record_scope(%L, %L, ''group'', ''x'', ''send'', ''{}'', false))', w1, sk)) IS NOT NULL
    AND ako_chyba(w1, format('SELECT public.guard_prepare_group(%L, %L)', w1, sk)) IS NOT NULL, true);
END $$;

\echo ''
\echo '--- K2. První zpráva cizímu: bez lístku žádost nevznikne ---'
DO $$
DECLARE
  w1 uuid := 'b9100000-0000-0000-0000-000000000001';
  w2 uuid := 'b9100000-0000-0000-0000-000000000002';
  w3 uuid := 'b9100000-0000-0000-0000-000000000003';
  zacni text := 'SELECT to_jsonb(s.status) FROM public.start_conversation(%L, %L) s';
BEGIN
  PERFORM chk('první zpráva bez lístku neprojde',
    ako_chyba(w1, format(zacni, w2, 'Ahoj, jsem Lukáš ze 4.B')) LIKE '%strážce%', true);
  PERFORM chk('žádost nevznikla',
    (SELECT count(*) FROM public.conversations WHERE w1 IN (participant_1, participant_2) AND w2 IN (participant_1, participant_2)) = 0, true);

  PERFORM ako_server(format('SELECT to_jsonb(public.guard_record_scope(%L, %L, ''intro'', %L, ''hide'', ''{}'', true))', w1, w2, 'pošli mi fotku a nikomu to neříkej'));
  PERFORM chk('skrytá první zpráva neprojde',
    ako_chyba(w1, format(zacni, w2, 'pošli mi fotku a nikomu to neříkej')) IS NOT NULL, true);
  PERFORM chk('důvěrník příjemce dostal oba signály',
    (SELECT count(*) FROM public.guardian_signals WHERE child_id = w2 AND kind IN ('ai_harmful', 'ai_secret')) = 2, true);

  PERFORM ako_server(format('SELECT to_jsonb(public.guard_record_scope(%L, %L, ''intro'', %L, ''send'', ''{}'', false))', w1, w2, 'Ahoj, jsem Lukáš ze 4.B'));
  PERFORM chk('s lístkem žádost vznikne',
    ako(w1, format(zacni, w2, '  Ahoj, jsem Lukáš ze 4.B  ')) = '"pending"'::jsonb, true);
  PERFORM chk('kamarádovi se píše bez první zprávy i bez lístku',
    ako(w1, format('SELECT to_jsonb(s.status) FROM public.start_conversation(%L) s', w3)) = '"accepted"'::jsonb, true);
END $$;

UPDATE public.app_settings SET value = 'false'::jsonb WHERE key = 'message_guard';

\echo ''
\echo '--- K3. Vypnutý strážce: všechno jako dřív ---'
DO $$
DECLARE
  w1 uuid := 'b9100000-0000-0000-0000-000000000001';
  sk uuid := 'b9200000-0000-0000-0000-000000000001';
BEGIN
  PERFORM chk('do skupiny se píše bez lístku',
    ako_chyba(w1, format('INSERT INTO public.group_messages (group_id, sender_id, content) VALUES (%L, %L, ''bez strážce'') RETURNING ''1''::jsonb', sk, w1)) IS NULL, true);
END $$;

\echo ''
\echo 'AI strážce u skupin a první zprávy: všechno OK'

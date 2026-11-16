-- ============================================================================
-- Testy oprav z 16. 11. 2026 (20261116100000_message_edit_lock.sql):
-- odeslaná zpráva nejde přepsat a příběhy se schovají zablokovaným.
--
--   h1 Lukáš, h2 Marta — konverzace z 09_fixes.sql;  h3 Ota — třetí člen
-- Spouští se po 09_fixes.sql — používá `chk`, `ako` a `ako_chyba`.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo ''
\echo '--- J1. Odeslanou zprávu nejde přepsat (obešlo by to AI strážce) ---'
DO $$
DECLARE
  h1 uuid := 'a9100000-0000-0000-0000-000000000001';
  h2 uuid := 'a9100000-0000-0000-0000-000000000002';
  konv uuid := 'a9200000-0000-0000-0000-000000000001';
  gid uuid;
BEGIN
  PERFORM chk('odesílatel text zprávy nezmění',
    ako_chyba(h1, format('UPDATE public.messages SET content = ''přepsáno'' WHERE sender_id = %L AND conversation_id = %L RETURNING ''1''::jsonb', h1, konv))
      LIKE '%nejde změnit%', true);
  PERFORM chk('v databázi zůstal původní text',
    (SELECT count(*) FROM public.messages WHERE conversation_id = konv AND content = 'přepsáno') = 0, true);
  PERFORM chk('označit zprávy jako přečtené jde dál',
    ako_chyba(h2, format('SELECT to_jsonb(public.mark_conversation_read(%L)::text)', konv)) IS NULL, true);

  INSERT INTO public.groups (name, owner_id, is_private) VALUES ('test úprav', h1, false) RETURNING id INTO gid;
  INSERT INTO public.group_members (group_id, user_id) VALUES (gid, h1) ON CONFLICT DO NOTHING;
  INSERT INTO public.group_messages (group_id, sender_id, content) VALUES (gid, h1, 'ahoj parto');
  PERFORM chk('ani zprávu ve skupině nejde přepsat',
    ako_chyba(h1, format('UPDATE public.group_messages SET content = ''přepsáno'' WHERE group_id = %L RETURNING ''1''::jsonb', gid))
      LIKE '%nejde změnit%', true);
END $$;

\echo ''
\echo '--- J2. Příběh nevidí ten, koho jsem zablokoval ---'
DO $$
DECLARE
  h2 uuid := 'a9100000-0000-0000-0000-000000000002';
  h3 uuid := 'a9100000-0000-0000-0000-000000000003';
  vidi text := 'SELECT to_jsonb(count(*)) FROM public.stories WHERE user_id = ''a9100000-0000-0000-0000-000000000002''';
BEGIN
  INSERT INTO public.stories (user_id, image_url) VALUES (h2, 'https://example.test/s.jpg');
  PERFORM chk('ostatní členové příběh vidí', ako(h3, vidi) = '1'::jsonb, true);
  PERFORM ako(h2, format('SELECT to_jsonb(public.block_user(%L)::text)', h3));
  PERFORM chk('zablokovaný ho nevidí', ako(h3, vidi) = '0'::jsonb, true);
  PERFORM chk('autorka svůj příběh vidí dál', ako(h2, vidi) = '1'::jsonb, true);
END $$;

\echo ''
\echo 'Všechny testy oprav z 16. 11. prošly.'

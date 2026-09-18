-- ============================================================================
-- Testy ochrany súkromných správ a blokovania v Kamosfére.
--
-- Spúšťa sa na čistej databáze, po prehratí `00_supabase_shim.sql` a všetkých
-- migrácií — presný postup je v README.md vedľa tohto súboru.
--
-- Každý test popisuje jednu vec, ktorá sa NESMIE podariť. Keď niektorý spadne,
-- neznamená to, že je test prísny — znamená to, že sa dá obísť ochrana detí.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

-- ---------------------------------------------------------------------------
-- Príprava: traja používatelia. Adam a Bob sú kamaráti, Cudzi nie je nikoho.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'adam@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'cudzi@test.local');

-- Profily vytvoril trigger handle_new_user. Prezývky si prepíšeme na čitateľné,
-- ale najprv overíme, že sa NEODVODILI z e-mailu.
DO $$
DECLARE leaked int;
BEGIN
  SELECT count(*) INTO leaked FROM public.profiles
   WHERE username IN ('adam', 'bob', 'cudzi');
  IF leaked > 0 THEN
    RAISE EXCEPTION 'ZLYHALO: prezývka sa odvodila z e-mailu (únik osobných údajov)';
  END IF;
  RAISE NOTICE 'OK   prezývka sa neodvodzuje z e-mailu';
END$$;

UPDATE public.profiles SET username = 'adam',  full_name = 'Adam'
 WHERE user_id = '11111111-1111-1111-1111-111111111111';
UPDATE public.profiles SET username = 'bob',   full_name = 'Bob'
 WHERE user_id = '22222222-2222-2222-2222-222222222222';
UPDATE public.profiles SET username = 'cudzi', full_name = 'Cudzi'
 WHERE user_id = '33333333-3333-3333-3333-333333333333';

INSERT INTO public.friendships (requester_id, addressee_id, status)
VALUES ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 'accepted');

-- V Supabase tieto práva nastavuje platforma; tu si ich dodáme sami.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

CREATE OR REPLACE FUNCTION chk(_name text, _got boolean, _want boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _got IS DISTINCT FROM _want THEN
    RAISE EXCEPTION 'ZLYHALO: %', _name;
  END IF;
  RAISE NOTICE 'OK   %', _name;
END$$;


\echo ''
\echo '--- 1. Konverzáciu nejde založiť priamo, iba cez start_conversation ---'
DO $$
DECLARE blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.conversations (participant_1, participant_2)
    VALUES ('33333333-3333-3333-3333-333333333333',
            '11111111-1111-1111-1111-111111111111');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN blocked := true;
  END;
  RESET ROLE;
  PERFORM chk('priamy INSERT do conversations je zablokovaný', blocked, true);
END$$;


\echo '--- 2. Prvá správa nesmie obsahovať odkaz ---'
DO $$
DECLARE rejected boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  BEGIN
    PERFORM public.start_conversation(
      '11111111-1111-1111-1111-111111111111', 'pozri www.zlyweb.cz');
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  PERFORM chk('žiadosť s odkazom je odmietnutá', rejected, true);
END$$;


\echo '--- 3. Cudzí človek založí žiadosť: stav pending, práve jedna správa ---'
DO $$
DECLARE cid uuid; st text; cnt int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  SELECT conversation_id, status INTO cid, st
    FROM public.start_conversation(
      '11111111-1111-1111-1111-111111111111', 'Ahoj, som Cudzi z 5.B');

  PERFORM chk('konverzácia je v stave pending', st = 'pending', true);

  SELECT count(*) INTO cnt FROM public.messages WHERE conversation_id = cid;
  PERFORM chk('zoznamovacia správa je práve jedna', cnt = 1, true);
END$$;


\echo '--- 4. Druhá správa do čakajúcej konverzácie neprejde ---'
DO $$
DECLARE cid uuid; blocked boolean := false;
BEGIN
  SELECT id INTO cid FROM public.conversations WHERE status = 'pending' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES (cid, '33333333-3333-3333-3333-333333333333', 'a ešte toto...');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN blocked := true;
  END;
  RESET ROLE;
  PERFORM chk('druhá správa do čakajúcej konverzácie NEPREŠLA', blocked, true);
END$$;


\echo '--- 5. Kamaráti si píšu rovno, bez žiadosti ---'
DO $$
DECLARE st text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  SELECT status INTO st
    FROM public.start_conversation('11111111-1111-1111-1111-111111111111');
  PERFORM chk('kamarátska konverzácia je rovno accepted', st = 'accepted', true);
END$$;


\echo '--- 6. Po prijatí žiadosti už správy prechádzajú ---'
DO $$
DECLARE cid uuid; st text; sent boolean := true;
BEGIN
  SELECT id INTO cid FROM public.conversations WHERE status = 'pending' LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  PERFORM public.respond_to_conversation_request(cid, 'accept');

  SELECT status INTO st FROM public.conversations WHERE id = cid;
  PERFORM chk('po prijatí je konverzácia accepted', st = 'accepted', true);

  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES (cid, '33333333-3333-3333-3333-333333333333', 'ďakujem!');
  EXCEPTION WHEN OTHERS THEN sent := false;
  END;
  RESET ROLE;
  PERFORM chk('v prijatej konverzácii už správa prešla', sent, true);
END$$;


\echo '--- 7. Odosielateľ si vlastnú žiadosť neprijme sám ---'
DO $$
DECLARE cid uuid; blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  SELECT conversation_id INTO cid
    FROM public.start_conversation(
      '22222222-2222-2222-2222-222222222222', 'Ahoj Bob, som Cudzi');
  BEGIN
    PERFORM public.respond_to_conversation_request(cid, 'accept');
  EXCEPTION WHEN OTHERS THEN blocked := true;
  END;
  PERFORM chk('odosielateľ si vlastnú žiadosť neprijme', blocked, true);
END$$;


\echo '--- 8. Blokovanie schová konverzácie aj príspevky ---'
DO $$
DECLARE visible_posts int; visible_convs int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  INSERT INTO public.posts (user_id, content)
  VALUES ('33333333-3333-3333-3333-333333333333', 'príspevok od Cudzieho');

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  PERFORM public.block_user('33333333-3333-3333-3333-333333333333');

  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO visible_posts FROM public.posts
   WHERE user_id = '33333333-3333-3333-3333-333333333333';
  SELECT count(*) INTO visible_convs FROM public.conversations
   WHERE participant_1 = '33333333-3333-3333-3333-333333333333'
      OR participant_2 = '33333333-3333-3333-3333-333333333333';
  RESET ROLE;

  PERFORM chk('zablokovanému nevidno príspevky', visible_posts = 0, true);
  PERFORM chk('zablokovanému nevidno konverzácie', visible_convs = 0, true);
END$$;


\echo '--- 9. Zablokovaný nezaloží novú konverzáciu ---'
DO $$
DECLARE blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  BEGIN
    PERFORM public.start_conversation(
      '11111111-1111-1111-1111-111111111111', 'ešte raz ahoj');
  EXCEPTION WHEN OTHERS THEN blocked := true;
  END;
  PERFORM chk('zablokovaný sa už nedostane späť', blocked, true);
END$$;


\echo '--- 10. Hromadné rozosielanie žiadostí narazí na limit ---'
DO $$
DECLARE i int; uid uuid; limited boolean := false;
BEGIN
  FOR i IN 1..7 LOOP
    INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(), 'spam' || i || '@test.local');
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  BEGIN
    FOR uid IN SELECT id FROM auth.users WHERE email LIKE 'spam%' LOOP
      PERFORM public.start_conversation(uid, 'ahoj, poznáme sa?');
    END LOOP;
  EXCEPTION WHEN OTHERS THEN limited := true;
  END;
  PERFORM chk('hromadné rozosielanie narazí na limit', limited, true);
END$$;


\echo '--- 11. Staršia ochrana stále drží: nikto si nepridelí rolu ---'
DO $$
DECLARE blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES ('33333333-3333-3333-3333-333333333333', 'creator');
  EXCEPTION WHEN OTHERS THEN blocked := true;
  END;
  RESET ROLE;
  PERFORM chk('samopridelenie roly creator je zablokované', blocked, true);
END$$;


\echo '--- 12. Bezpečnostný denník vidí iba creator ---'
DO $$
DECLARE seen_by_user int; total int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO seen_by_user FROM public.safety_events;
  RESET ROLE;

  SELECT count(*) INTO total FROM public.safety_events;

  PERFORM chk('bežný používateľ nevidí denník', seen_by_user = 0, true);
  PERFORM chk('denník ale záznamy obsahuje', total > 0, true);
END$$;

\echo ''
\echo '=== Všetky kontroly prešli ==='

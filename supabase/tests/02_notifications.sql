-- ============================================================================
-- Testy notifikací: vznikají v databázi a chodí správným lidem.
-- Spouští se po 01_messaging_security.sql — používá jeho uživatele
-- (Adam 1111…, Bob 2222…, Cudzi 3333…; Adam a Bob jsou kamarádi,
-- Adam má Cudzího zablokovaného).
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

-- Nový člověk bez historie, ať se testy nepletou s předchozími.
INSERT INTO auth.users (id, email) VALUES ('44444444-4444-4444-4444-444444444444', 'dana@test.local');
DELETE FROM public.notifications;

\echo '--- N1. Žádost o přátelství se ukáže příjemci ---'
DO $$
DECLARE n int;
BEGIN
  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'pending');
  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id = '22222222-2222-2222-2222-222222222222' AND type = 'friend_request'
     AND from_user_id = '44444444-4444-4444-4444-444444444444';
  PERFORM chk('friend_request přišel Bobovi', n = 1, true);
END$$;

\echo '--- N2. Přijetí ohlásí žadateli a uklidí žádost ---'
DO $$
DECLARE n int; left_over int;
BEGIN
  UPDATE public.friendships SET status = 'accepted'
   WHERE requester_id = '44444444-4444-4444-4444-444444444444'
     AND addressee_id = '22222222-2222-2222-2222-222222222222';
  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id = '44444444-4444-4444-4444-444444444444' AND type = 'friend_accepted';
  SELECT count(*) INTO left_over FROM public.notifications
   WHERE user_id = '22222222-2222-2222-2222-222222222222' AND type = 'friend_request';
  PERFORM chk('friend_accepted přišel Daně', n = 1, true);
  PERFORM chk('vyřízená žádost zmizela Bobovi z oznámení', left_over = 0, true);
END$$;

\echo '--- N3. Reakce ohlásí autorovi, i s druhem; vlastní reakce ne ---'
DO $$
DECLARE pid uuid := gen_random_uuid(); n int; msg text;
BEGIN
  INSERT INTO public.posts (id, user_id, content) VALUES (pid, '22222222-2222-2222-2222-222222222222', 'ahoj');
  INSERT INTO public.likes (post_id, user_id, kind) VALUES (pid, '44444444-4444-4444-4444-444444444444', 'with_you');
  INSERT INTO public.likes (post_id, user_id, kind) VALUES (pid, '22222222-2222-2222-2222-222222222222', 'super');
  SELECT count(*), max(message) INTO n, msg FROM public.notifications
   WHERE user_id = '22222222-2222-2222-2222-222222222222' AND type = 'like' AND post_id = pid;
  PERFORM chk('reakce přišla autorovi právě jednou', n = 1, true);
  PERFORM chk('oznámení nese druh reakce', msg = 'with_you', true);

  UPDATE public.likes SET kind = 'rooting' WHERE post_id = pid AND user_id = '44444444-4444-4444-4444-444444444444';
  SELECT count(*), max(message) INTO n, msg FROM public.notifications
   WHERE user_id = '22222222-2222-2222-2222-222222222222' AND type = 'like' AND post_id = pid;
  PERFORM chk('změna reakce nespamuje, jen opraví druh', n = 1 AND msg = 'rooting', true);

  DELETE FROM public.likes WHERE post_id = pid AND user_id = '44444444-4444-4444-4444-444444444444';
  SELECT count(*) INTO n FROM public.notifications WHERE type = 'like' AND post_id = pid;
  PERFORM chk('vzatá zpět reakce vezme i oznámení', n = 0, true);
END$$;

\echo '--- N4. Komentář ohlásí autorovi ---'
DO $$
DECLARE pid uuid := gen_random_uuid(); n int;
BEGIN
  INSERT INTO public.posts (id, user_id, content) VALUES (pid, '22222222-2222-2222-2222-222222222222', 'druhý');
  INSERT INTO public.comments (post_id, user_id, content) VALUES (pid, '44444444-4444-4444-4444-444444444444', 'super!');
  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id = '22222222-2222-2222-2222-222222222222' AND type = 'comment' AND post_id = pid;
  PERFORM chk('komentář přišel autorovi', n = 1, true);
END$$;

\echo '--- N5. Zablokovaná dvojice si nic nepošle ---'
DO $$
DECLARE pid uuid := gen_random_uuid(); n int;
BEGIN
  -- Adam (1111) zablokoval Cudzího (3333) v testu 8.
  INSERT INTO public.posts (id, user_id, content) VALUES (pid, '11111111-1111-1111-1111-111111111111', 'adamův');
  INSERT INTO public.likes (post_id, user_id, kind) VALUES (pid, '33333333-3333-3333-3333-333333333333', 'super');
  INSERT INTO public.comments (post_id, user_id, content) VALUES (pid, '33333333-3333-3333-3333-333333333333', 'hm');
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = '11111111-1111-1111-1111-111111111111' AND post_id = pid;
  PERFORM chk('od zablokovaného nepřijde ani reakce, ani komentář', n = 0, true);
END$$;

\echo '--- N6. Klient notifikaci nevloží přímo ---'
DO $$
DECLARE blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.notifications (user_id, type, from_user_id)
    VALUES ('22222222-2222-2222-2222-222222222222', 'friend_request', '44444444-4444-4444-4444-444444444444');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN blocked := true;
  END;
  RESET ROLE;
  PERFORM chk('přímý INSERT do notifications je zamčený', blocked, true);
END$$;

\echo ''
\echo '=== Notifikace: všechny kontroly prošly ==='

-- Jednotný jazyk: chybové hlášky, které vidí děti, jsou teď česky.
--
-- Funkce jsou zkopírované beze změny logiky (CREATE OR REPLACE ponechá
-- oprávnění i vlastníka); liší se jen texty v uvozovkách.

ALTER TABLE public.guardians ALTER COLUMN label SET DEFAULT 'důvěrník';
UPDATE public.guardians SET label = 'důvěrník' WHERE label = 'dôverník';
UPDATE public.member_safety SET consent_name = 'původní člen' WHERE consent_name = 'pôvodný člen';

CREATE OR REPLACE FUNCTION public.start_conversation__ungated(_target_user_id uuid, _intro text DEFAULT NULL::text)
 RETURNS TABLE(conversation_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _me uuid := auth.uid();
  _conv public.conversations%ROWTYPE;
  _is_friend boolean;
  _recent_requests integer;
  _open_requests integer;
  _clean_intro text;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Musíš být přihlášený.' USING ERRCODE = '28000';
  END IF;

  IF _target_user_id IS NULL OR _target_user_id = _me THEN
    RAISE EXCEPTION 'Neplatný příjemce.' USING ERRCODE = '22023';
  END IF;

  IF public.is_user_banned(_me) THEN
    RAISE EXCEPTION 'Tvůj účet má pozastavené posílání zpráv.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = _target_user_id) THEN
    RAISE EXCEPTION 'Takový uživatel neexistuje.' USING ERRCODE = '22023';
  END IF;

  -- Zablokovanému nepovieme, že je zablokovaný. Dostane tú istú odpoveď,
  -- akú by dostal pri nedostupnom používateľovi.
  IF public.is_blocked_between(_me, _target_user_id) THEN
    RAISE EXCEPTION 'Tomuhle uživateli teď nejde napsat.' USING ERRCODE = '42501';
  END IF;

  -- Konverzácia už existuje: vrátime ju v akomkoľvek stave.
  SELECT * INTO _conv
    FROM public.conversations c
   WHERE least(c.participant_1, c.participant_2) = least(_me, _target_user_id)
     AND greatest(c.participant_1, c.participant_2) = greatest(_me, _target_user_id);

  IF FOUND THEN
    conversation_id := _conv.id;
    status := _conv.status;
    RETURN NEXT;
    RETURN;
  END IF;

  _is_friend := public.are_friends(_me, _target_user_id);

  IF _is_friend THEN
    -- Kamaráti: konverzácia rovno otvorená, žiadne zdržovanie.
    INSERT INTO public.conversations (participant_1, participant_2, status, initiator_id)
    VALUES (_me, _target_user_id, 'accepted', _me)
    RETURNING * INTO _conv;
  ELSE
    -- Cudzí človek: limity najprv, až potom žiadosť.
    SELECT count(*) INTO _recent_requests
      FROM public.safety_events se
     WHERE se.kind = 'request_sent'
       AND se.actor_id = _me
       AND se.created_at > now() - interval '1 hour';

    IF _recent_requests >= 5 THEN
      INSERT INTO public.safety_events (kind, actor_id, target_id)
      VALUES ('request_rate_limited', _me, _target_user_id);
      RAISE EXCEPTION 'Poslal(a) jsi moc žádostí najednou. Zkus to za hodinu.' USING ERRCODE = '53400';
    END IF;

    SELECT count(*) INTO _open_requests
      FROM public.conversations c
     WHERE c.status = 'pending'
       AND c.initiator_id = _me;

    IF _open_requests >= 15 THEN
      INSERT INTO public.safety_events (kind, actor_id, target_id)
      VALUES ('request_rate_limited', _me, _target_user_id);
      RAISE EXCEPTION 'Máš moc nevyřízených žádostí. Počkej, až na ně odpoví.' USING ERRCODE = '53400';
    END IF;

    _clean_intro := nullif(trim(coalesce(_intro, '')), '');

    IF _clean_intro IS NULL THEN
      RAISE EXCEPTION 'Napiš krátkou zprávu, ať ví, kdo jsi.' USING ERRCODE = '22023';
    END IF;

    IF length(_clean_intro) > 300 THEN
      RAISE EXCEPTION 'První zpráva může mít nejvýš 300 znaků.' USING ERRCODE = '22023';
    END IF;

    IF public.contains_link(_clean_intro) THEN
      RAISE EXCEPTION 'V první zprávě nemůžou být odkazy.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.conversations (participant_1, participant_2, status, initiator_id)
    VALUES (_me, _target_user_id, 'pending', _me)
    RETURNING * INTO _conv;

    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES (_conv.id, _me, _clean_intro);

    INSERT INTO public.notifications (user_id, type, from_user_id, message)
    VALUES (_target_user_id, 'message_request', _me, 'ti chce psát');

    INSERT INTO public.safety_events (kind, actor_id, target_id)
    VALUES ('request_sent', _me, _target_user_id);
  END IF;

  conversation_id := _conv.id;
  status := _conv.status;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_conversation_request__ungated(_conversation_id uuid, _action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _me uuid := auth.uid();
  _conv public.conversations%ROWTYPE;
  _other uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Musíš být přihlášený.' USING ERRCODE = '28000';
  END IF;

  IF _action NOT IN ('accept', 'ignore', 'block') THEN
    RAISE EXCEPTION 'Neplatná akce.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _conv FROM public.conversations c WHERE c.id = _conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Konverzace neexistuje.' USING ERRCODE = '22023';
  END IF;

  IF _me NOT IN (_conv.participant_1, _conv.participant_2) THEN
    RAISE EXCEPTION 'Tohle není tvoje konverzace.' USING ERRCODE = '42501';
  END IF;

  -- Na žiadosť odpovedá ten, komu prišla — nie ten, kto ju poslal.
  IF _conv.status <> 'pending' OR _conv.initiator_id = _me THEN
    RAISE EXCEPTION 'Na tuhle konverzaci se nedá takhle odpovědět.' USING ERRCODE = '22023';
  END IF;

  _other := CASE WHEN _conv.participant_1 = _me THEN _conv.participant_2 ELSE _conv.participant_1 END;

  IF _action = 'accept' THEN
    UPDATE public.conversations SET status = 'accepted', updated_at = now()
     WHERE id = _conv.id;

    INSERT INTO public.notifications (user_id, type, from_user_id, message)
    VALUES (_other, 'message_accepted', _me, 'přijal/a tvou zprávu');

    INSERT INTO public.safety_events (kind, actor_id, target_id)
    VALUES ('request_accepted', _me, _other);

  ELSIF _action = 'ignore' THEN
    -- Konverzácia zmizne aj s prvou správou. Odosielateľ sa nedozvie nič
    -- a rate limit mu bráni skúšať donekonečna.
    DELETE FROM public.conversations WHERE id = _conv.id;

    INSERT INTO public.safety_events (kind, actor_id, target_id)
    VALUES ('request_ignored', _me, _other);

  ELSE -- block
    DELETE FROM public.conversations WHERE id = _conv.id;

    INSERT INTO public.user_blocks (blocker_id, blocked_id)
    VALUES (_me, _other)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.safety_events (kind, actor_id, target_id)
    VALUES ('user_blocked', _me, _other);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.block_user(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Musíš být přihlášený.' USING ERRCODE = '28000';
  END IF;

  IF _user_id IS NULL OR _user_id = _me THEN
    RAISE EXCEPTION 'Neplatný uživatel.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (_me, _user_id)
  ON CONFLICT DO NOTHING;

  -- Blokovanie ruší aj priateľstvo a čakajúcu žiadosť o priateľstvo.
  DELETE FROM public.friendships f
   WHERE (f.requester_id = _me AND f.addressee_id = _user_id)
      OR (f.requester_id = _user_id AND f.addressee_id = _me);

  -- Čakajúca žiadosť o konverzáciu zmizne. Rozbehnutá konverzácia zostane,
  -- ale ani jedna strana ju odteraz neuvidí.
  DELETE FROM public.conversations c
   WHERE c.status = 'pending'
     AND least(c.participant_1, c.participant_2) = least(_me, _user_id)
     AND greatest(c.participant_1, c.participant_2) = greatest(_me, _user_id);

  INSERT INTO public.safety_events (kind, actor_id, target_id)
  VALUES ('user_blocked', _me, _user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.unblock_user(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Musíš být přihlášený.' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.user_blocks
   WHERE blocker_id = _me AND blocked_id = _user_id;

  INSERT INTO public.safety_events (kind, actor_id, target_id)
  VALUES ('user_unblocked', _me, _user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.world_seed__ungated(_user_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _me uuid := auth.uid();
  _since timestamptz := now() - interval '28 days';
  _p public.profiles%ROWTYPE;
  _stats public.user_stats%ROWTYPE;
  _kind record;
  _active_days int;
  _first_seen timestamptz;
  _score numeric;
  _growth numeric;
  _blocked_by_others int;
  _banned boolean;
  _friends jsonb;
  _shared jsonb;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Musíš být přihlášený.' USING ERRCODE = '28000';
  END IF;

  -- Svoj seed vidí každý. Cudzí seed vidia iba kamaráti — a nikdy ten,
  -- kto je s ním v blokovaní.
  IF _user_id <> _me AND (
       NOT public.are_friends(_me, _user_id)
       OR public.is_blocked_between(_me, _user_id)
     ) THEN
    RAISE EXCEPTION 'Tenhle svět ti není otevřený.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _p FROM public.profiles WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Takový uživatel neexistuje.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _stats FROM public.user_stats WHERE user_id = _user_id;
  SELECT * INTO _kind FROM public.kindness_given(_user_id, _since);

  -- Rytmus: v koľkých rôznych dňoch za 28 dní bol človek prítomný.
  SELECT count(DISTINCT d) INTO _active_days FROM (
    SELECT date_trunc('day', created_at) AS d FROM public.posts    WHERE user_id = _user_id AND created_at >= _since
    UNION ALL
    SELECT date_trunc('day', created_at)      FROM public.comments WHERE user_id = _user_id AND created_at >= _since
    UNION ALL
    SELECT date_trunc('day', created_at)      FROM public.likes    WHERE user_id = _user_id AND created_at >= _since
  ) t;

  _first_seen := _p.created_at;

  -- Growth: koľko sveta život dovolil. Sýti sa — prvé týždne dajú veľa,
  -- ďalšie roky pomaly. Váhy sú na jednom mieste, nech sa dajú ladiť.
  -- Vľúdnosť, ktorú človek DAL, váži najviac; to, čo dostal, sa neráta.
  _score :=
      coalesce(_stats.posts_count, 0)    * 1.0
    + coalesce(_stats.comments_count, 0) * 1.5
    + coalesce(_stats.friends_count, 0)  * 4.0
    + coalesce(_kind.given, 0)           * 2.0
    + coalesce(_kind.supportive, 0)      * 4.0
    + coalesce(_active_days, 0)          * 3.0
    + least(extract(epoch FROM (now() - _first_seen)) / 86400.0, 365) * 0.15;

  _growth := round((1 - exp(-_score / 120.0))::numeric, 4);

  -- Správanie, zvlášť od všetkého ostatného.
  SELECT count(*) INTO _blocked_by_others
    FROM public.user_blocks WHERE blocked_id = _user_id;
  _banned := public.is_user_banned(_user_id);

  -- Kamaráti: to, čo svet potrebuje na spoločnú zem — ich growth.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'identity', f.other::text,
           'name', fp.username,
           'avatar_url', fp.avatar_url
         )), '[]'::jsonb)
    INTO _friends
    FROM (
      SELECT CASE WHEN requester_id = _user_id THEN addressee_id ELSE requester_id END AS other
        FROM public.friendships
       WHERE status = 'accepted' AND (requester_id = _user_id OR addressee_id = _user_id)
    ) f
    JOIN public.profiles fp ON fp.user_id = f.other
   WHERE NOT public.is_blocked_between(_user_id, f.other);

  -- Spoločný čas: koľko si dvaja ľudia písali. Iba počet, nikdy obsah.
  SELECT coalesce(jsonb_agg(jsonb_build_object('with', other::text, 'weight', w)), '[]'::jsonb)
    INTO _shared
    FROM (
      SELECT CASE WHEN c.participant_1 = _user_id THEN c.participant_2 ELSE c.participant_1 END AS other,
             round((1 - exp(-count(m.id) / 40.0))::numeric, 3) AS w
        FROM public.conversations c
        JOIN public.messages m ON m.conversation_id = c.id AND m.created_at >= now() - interval '90 days'
       WHERE c.status = 'accepted'
         AND (c.participant_1 = _user_id OR c.participant_2 = _user_id)
       GROUP BY 1
    ) s
   WHERE w > 0;

  RETURN jsonb_build_object(
    'version', 1,
    -- Stabilný neprezradzujúci kľúč. DreamWorld ho hashuje na traits.
    'identity', _user_id::text,
    'name', _p.username,
    'avatar_url', _p.avatar_url,
    -- Ten istý človek o rok neskôr nemá tú istú zem: epocha = ročné obdobie.
    'epoch', (extract(year FROM now())::int * 4 + extract(quarter FROM now())::int - 1),
    'growth', _growth,
    'traits', jsonb_build_object(
      'kindness',   round((1 - exp(-coalesce(_kind.given, 0) / 15.0))::numeric, 3),
      'breadth',    round((1 - exp(-coalesce(_kind.people, 0) / 6.0))::numeric, 3),
      'supportive', round((1 - exp(-coalesce(_kind.supportive, 0) / 4.0))::numeric, 3),
      'rhythm',     round((coalesce(_active_days, 0) / 28.0)::numeric, 3),
      'mood',       NULL
    ),
    'conduct', jsonb_build_object(
      'withdrawn', _banned,
      'blocked_by', _blocked_by_others
    ),
    'friends', _friends,
    'shared', _shared
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fortress_raid_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  f public.fortresses%ROWTYPE;
  recent integer;
BEGIN
  -- Trigger beží pred kontrolou RLS, takže totožnosť overíme sami a hneď
  -- ako prvú — inak by pokus zapísať nájazd za majiteľa skončil hláškou
  -- o vlastnej pevnosti, čo je pravda, ale nie ten dôvod.
  IF NEW.raider_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Nájezd se dá zapsat jen za sebe.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO f FROM public.fortresses WHERE id = NEW.fortress_id;

  IF NOT FOUND OR NOT f.published THEN
    RAISE EXCEPTION 'Tahle pevnost se teď nedá vykrást.' USING ERRCODE = 'check_violation';
  END IF;
  IF f.owner_id = NEW.raider_id THEN
    RAISE EXCEPTION 'Vlastní pevnost vykrást nejde.' USING ERRCODE = 'check_violation';
  END IF;
  IF public.is_blocked_between(f.owner_id, NEW.raider_id) THEN
    RAISE EXCEPTION 'Tahle pevnost se teď nedá vykrást.' USING ERRCODE = 'check_violation';
  END IF;
  -- Nájazd sa musel hrať na mape, ktorá v pevnosti naozaj je.
  IF NEW.replay->>'cells' IS DISTINCT FROM f.grid->>'cells' THEN
    RAISE EXCEPTION 'Pevnost se mezitím změnila. Zkus nájezd znovu.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO recent
    FROM public.fortress_raids
   WHERE raider_id = NEW.raider_id
     AND created_at > now() - interval '10 minutes';
  IF recent >= 30 THEN
    RAISE EXCEPTION 'Pomalu — dej si chvilku pauzu a pak útoč dál.' USING ERRCODE = 'check_violation';
  END IF;

  NEW.created_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hh__end_turn(_room uuid, _seat integer, _discard integer[], _auto boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e integer;
  h integer;
  need integer;
  picked integer[];
BEGIN
  SELECT energy INTO e FROM public.hh_players WHERE room_id = _room AND seat = _seat;
  SELECT count(*) INTO h FROM public.hh_cards WHERE room_id = _room AND zone = 'hand' AND owner_seat = _seat;
  need := GREATEST(0, h - e);

  IF _auto THEN
    SELECT COALESCE(array_agg(id), '{}') INTO picked FROM (
      SELECT id FROM public.hh_cards
       WHERE room_id = _room AND zone = 'hand' AND owner_seat = _seat
       ORDER BY pos DESC LIMIT need
    ) t;
  ELSE
    SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO picked FROM unnest(COALESCE(_discard, '{}')) x;
    IF COALESCE(array_length(picked, 1), 0) <> need THEN
      RAISE EXCEPTION 'Na konci tahu musíš zahodit přesně % karet (kolik máš energie, tolik karet smíš mít).', need;
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(picked) x
       WHERE NOT EXISTS (SELECT 1 FROM public.hh_cards c
                          WHERE c.room_id = _room AND c.id = x AND c.zone = 'hand' AND c.owner_seat = _seat)
    ) THEN
      RAISE EXCEPTION 'Zahodit můžeš jen karty z vlastní ruky.';
    END IF;
  END IF;

  PERFORM public.hh__discard(_room, x) FROM unnest(picked) x;
  IF need > 0 THEN
    PERFORM public.hh__log(_room, 'discard', _seat, NULL, jsonb_build_object('n', need));
  END IF;
  PERFORM public.hh__advance(_room);
END
$function$;

CREATE OR REPLACE FUNCTION public.hh__start(_room uuid, _seed bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
  roles text[];
  x record;
  cap integer;
BEGIN
  SELECT count(*) INTO n FROM public.hh_players WHERE room_id = _room;
  IF n < 4 OR n > 7 THEN
    RAISE EXCEPTION 'Na hru je potřeba 4 až 7 hráčů (teď: %).', n;
  END IF;
  roles := public.hh_roles_for(n);

  INSERT INTO public.hh_secrets (room_id, seed) VALUES (_room, _seed)
  ON CONFLICT (room_id) DO UPDATE SET seed = EXCLUDED.seed, acts = 0, reshuffles = 0, counter = 0;

  UPDATE public.hh_players SET seat = seat + 1000 WHERE room_id = _room;
  WITH o AS (
    SELECT user_id,
           row_number() OVER (ORDER BY public.hh__rnd(_seed, 'seat:' || user_id)) - 1 AS s,
           row_number() OVER (ORDER BY public.hh__rnd(_seed, 'role:' || user_id)) AS k
      FROM public.hh_players WHERE room_id = _room
  )
  UPDATE public.hh_players p
     SET seat = o.s,
         role = roles[o.k],
         max_energy = CASE WHEN roles[o.k] = 'captain' THEN 5 ELSE 4 END,
         energy = CASE WHEN roles[o.k] = 'captain' THEN 5 ELSE 4 END,
         alive = true,
         timeouts = 0
    FROM o
   WHERE p.room_id = _room AND p.user_id = o.user_id;

  DELETE FROM public.hh_cards WHERE room_id = _room;
  INSERT INTO public.hh_cards (room_id, id, kind, zone, owner_seat, pos)
  SELECT _room, g, public.hh_card_kind(g), 'deck', NULL, public.hh__rnd(_seed, 'deck:' || g)
    FROM generate_series(0, 49) g;

  DELETE FROM public.hh_log WHERE room_id = _room;
  UPDATE public.hh_rooms
     SET status = 'playing', winner = NULL, turn_no = 0, lasers_used = 0, turn_seat = NULL, deadline = NULL
   WHERE id = _room;
  PERFORM public.hh__log(_room, 'start', NULL, NULL, jsonb_build_object('players', n));

  FOR x IN SELECT seat, max_energy FROM public.hh_players WHERE room_id = _room ORDER BY seat LOOP
    PERFORM public.hh__draw(_room, x.seat, x.max_energy);
  END LOOP;

  SELECT seat INTO cap FROM public.hh_players WHERE room_id = _room AND role = 'captain';
  PERFORM public.hh__begin_turn(_room, cap);
END
$function$;

CREATE OR REPLACE FUNCTION public.hh_view__ungated(_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
  p public.hh_players;
  my_reach integer;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tahle hra už neexistuje.';
  END IF;
  SELECT * INTO p FROM public.hh_players WHERE room_id = _room AND user_id = me;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V téhle hře nesedíš.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status = 'playing' AND p.alive THEN
    my_reach := public.hh__reach(_room, p.seat);
  END IF;

  RETURN jsonb_build_object(
    'room', jsonb_build_object(
      'id', r.id, 'code', r.code, 'status', r.status, 'host_id', r.host_id,
      'version', r.version, 'turn_seat', r.turn_seat, 'turn_no', r.turn_no,
      'lasers_used', r.lasers_used, 'deadline', r.deadline, 'winner', r.winner
    ),
    'now', now(),
    'me', jsonb_build_object('seat', p.seat, 'role', p.role, 'alive', p.alive, 'reach', my_reach),
    'players', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'seat', x.seat,
        'user_id', x.user_id,
        'name', COALESCE(pr.username, '?'),
        'avatar', pr.avatar_url,
        'energy', x.energy,
        'max', x.max_energy,
        'alive', x.alive,
        'timeouts', x.timeouts,
        'role', CASE WHEN x.user_id = me OR x.role = 'captain' OR NOT x.alive OR r.status = 'finished'
                     THEN x.role END,
        'hand', (SELECT count(*) FROM public.hh_cards c
                  WHERE c.room_id = _room AND c.zone = 'hand' AND c.owner_seat = x.seat),
        'eq', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind) ORDER BY c.pos), '[]'::jsonb)
                 FROM public.hh_cards c
                WHERE c.room_id = _room AND c.zone = 'eq' AND c.owner_seat = x.seat),
        'dist', CASE WHEN r.status = 'playing' AND p.alive AND x.alive AND x.seat <> p.seat
                     THEN public.hh__dist(_room, p.seat, x.seat) END
      ) ORDER BY x.seat), '[]'::jsonb)
        FROM public.hh_players x
        LEFT JOIN public.profiles pr ON pr.user_id = x.user_id
       WHERE x.room_id = _room
    ),
    'hand', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind) ORDER BY c.pos), '[]'::jsonb)
        FROM public.hh_cards c
       WHERE c.room_id = _room AND c.zone = 'hand' AND c.owner_seat = p.seat
         AND r.status <> 'lobby'
    ),
    'deck', (SELECT count(*) FROM public.hh_cards c WHERE c.room_id = _room AND c.zone = 'deck'),
    'discard_top', (SELECT c.kind FROM public.hh_cards c
                     WHERE c.room_id = _room AND c.zone = 'discard' ORDER BY c.pos DESC LIMIT 1),
    'log', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id, 'turn', l.turn_no, 'kind', l.kind, 'a', l.a, 'b', l.b, 'info', l.info,
        'secret', CASE WHEN me = ANY (COALESCE(l.secret_to, '{}')) THEN l.secret END
      ) ORDER BY l.id), '[]'::jsonb)
        FROM (SELECT * FROM public.hh_log WHERE room_id = _room ORDER BY id DESC LIMIT 40) l
    )
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.hh_create__ungated()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  rid uuid;
  x record;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (SELECT count(*) FROM public.hh_rooms
       WHERE host_id = me AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'Založil/a jsi moc her najednou. Zkus to za chvíli.';
  END IF;

  -- Upratať staré: nezačaté po dni, dohrané po týždni.
  DELETE FROM public.hh_rooms
   WHERE (status = 'lobby' AND updated_at < now() - interval '1 day')
      OR (status <> 'lobby' AND updated_at < now() - interval '7 days');

  -- Z inej predsiene odísť — sedieť sa dá len pri jednom stole naraz.
  FOR x IN SELECT r.id FROM public.hh_rooms r JOIN public.hh_players p ON p.room_id = r.id
            WHERE p.user_id = me AND r.status = 'lobby' LOOP
    PERFORM public.hh__leave_lobby(x.id, me);
  END LOOP;

  LOOP
    c := '';
    FOR i IN 1..5 LOOP
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.hh_rooms WHERE code = c);
  END LOOP;

  INSERT INTO public.hh_rooms (code, host_id) VALUES (c, me) RETURNING id INTO rid;
  INSERT INTO public.hh_secrets (room_id, seed) VALUES (rid, floor(random() * 9e15)::bigint);
  INSERT INTO public.hh_players (room_id, user_id, seat) VALUES (rid, me, 0);
  RETURN jsonb_build_object('id', rid, 'code', c);
END
$function$;

CREATE OR REPLACE FUNCTION public.hh_join__ungated(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
  x record;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.hh_rooms WHERE code = upper(btrim(COALESCE(_code, ''))) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hru s tímhle kódem jsme nenašli.';
  END IF;

  -- Kto už pri stole sedí, len sa vracia (napr. po výpadku internetu).
  IF EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = r.id AND user_id = me) THEN
    RETURN jsonb_build_object('id', r.id, 'code', r.code);
  END IF;
  IF r.status <> 'lobby' THEN
    RAISE EXCEPTION 'Tahle hra už začala — počkej na další.';
  END IF;
  IF (SELECT count(*) FROM public.hh_players WHERE room_id = r.id) >= 7 THEN
    RAISE EXCEPTION 'Loď je plná (nejvýš 7 hráčů).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hh_players p
              WHERE p.room_id = r.id AND public.is_blocked_between(me, p.user_id)) THEN
    RAISE EXCEPTION 'Do téhle hry se přidat nemůžeš.';
  END IF;

  FOR x IN SELECT r2.id FROM public.hh_rooms r2 JOIN public.hh_players p ON p.room_id = r2.id
            WHERE p.user_id = me AND r2.status = 'lobby' LOOP
    PERFORM public.hh__leave_lobby(x.id, me);
  END LOOP;

  INSERT INTO public.hh_players (room_id, user_id, seat)
  SELECT r.id, me, COALESCE(max(seat) + 1, 0) FROM public.hh_players WHERE room_id = r.id;
  PERFORM public.hh__bump(r.id);
  RETURN jsonb_build_object('id', r.id, 'code', r.code);
END
$function$;

CREATE OR REPLACE FUNCTION public.hh_start__ungated(_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
BEGIN
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'Hru spouští ten, kdo ji založil.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status = 'playing' THEN
    RAISE EXCEPTION 'Hra už běží.';
  END IF;
  PERFORM public.hh__start(_room, floor(random() * 9e15)::bigint);
  PERFORM public.hh__bump(_room);
  RETURN public.hh_view(_room);
END
$function$;

CREATE OR REPLACE FUNCTION public.hh_rematch__ungated(_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
BEGIN
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'Novou hru spouští ten, kdo tuhle založil.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status <> 'finished' THEN
    RAISE EXCEPTION 'Hra ještě neskončila.';
  END IF;
  DELETE FROM public.hh_cards WHERE room_id = _room;
  DELETE FROM public.hh_log WHERE room_id = _room;
  UPDATE public.hh_players SET role = NULL, energy = 0, max_energy = 0, alive = true, timeouts = 0
   WHERE room_id = _room;
  UPDATE public.hh_rooms
     SET status = 'lobby', winner = NULL, turn_seat = NULL, turn_no = 0, lasers_used = 0, deadline = NULL
   WHERE id = _room;
  PERFORM public.hh__bump(_room);
  RETURN public.hh_view(_room);
END
$function$;

CREATE OR REPLACE FUNCTION public.hh_invite__ungated(_room uuid, _friend uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
BEGIN
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = _room AND user_id = me) THEN
    RAISE EXCEPTION 'V téhle hře nesedíš.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status <> 'lobby' THEN
    RAISE EXCEPTION 'Hra už začala.';
  END IF;
  IF NOT public.are_friends(me, _friend) OR public.is_blocked_between(me, _friend) THEN
    RAISE EXCEPTION 'Pozvat můžeš jen kamarády.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = _room AND user_id = _friend) THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.notifications
       WHERE from_user_id = me AND type = 'hh_invite' AND created_at > now() - interval '10 minutes') >= 20 THEN
    RAISE EXCEPTION 'Poslal/a jsi moc pozvánek. Zkus to za chvíli.';
  END IF;

  DELETE FROM public.notifications
   WHERE user_id = _friend AND from_user_id = me AND type = 'hh_invite' AND NOT read;
  INSERT INTO public.notifications (user_id, type, from_user_id, message)
  VALUES (_friend, 'hh_invite', me, r.code);
END
$function$;

CREATE OR REPLACE FUNCTION public.hh_act__ungated(_room uuid, _action jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
  p public.hh_players;
  t public.hh_players;
  card public.hh_cards;
  s public.hh_secrets;
  tgt integer;
  d integer;
  reach integer;
  stolen public.hh_cards;
  x record;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tahle hra už neexistuje.';
  END IF;
  SELECT * INTO p FROM public.hh_players WHERE room_id = _room AND user_id = me;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V téhle hře nesedíš.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status <> 'playing' THEN
    RAISE EXCEPTION 'Hra neběží.';
  END IF;
  IF NOT p.alive THEN
    RAISE EXCEPTION 'Jsi vyřazený/á — můžeš se už jen dívat.';
  END IF;
  IF r.turn_seat IS DISTINCT FROM p.seat THEN
    RAISE EXCEPTION 'Nejsi na tahu.';
  END IF;

  UPDATE public.hh_secrets SET acts = acts + 1 WHERE room_id = _room RETURNING * INTO s;
  UPDATE public.hh_players SET timeouts = 0 WHERE room_id = _room AND seat = p.seat;

  IF _action->>'t' = 'end' THEN
    PERFORM public.hh__end_turn(
      _room, p.seat,
      ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_action->'discard', '[]'::jsonb)))::integer),
      false
    );

  ELSIF _action->>'t' = 'play' THEN
    SELECT * INTO card FROM public.hh_cards
     WHERE room_id = _room AND id = (_action->>'card')::integer AND zone = 'hand' AND owner_seat = p.seat;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tuhle kartu nemáš v ruce.';
    END IF;

    IF card.kind IN ('laser', 'tractor') THEN
      tgt := (_action->>'target')::integer;
      SELECT * INTO t FROM public.hh_players WHERE room_id = _room AND seat = tgt AND alive;
      IF NOT FOUND OR tgt = p.seat THEN
        RAISE EXCEPTION 'Vyber jiného hráče, který je ještě ve hře.';
      END IF;
      d := public.hh__dist(_room, p.seat, tgt);
      reach := public.hh__reach(_room, p.seat);
      IF d > reach THEN
        RAISE EXCEPTION 'Hráč je moc daleko (vzdálenost %, tvůj dosah %).', d, reach;
      END IF;
    END IF;

    CASE card.kind
      WHEN 'laser' THEN
        IF r.lasers_used >= 1 THEN
          RAISE EXCEPTION 'Laserem můžeš vystřelit jen jednou za tah.';
        END IF;
        PERFORM public.hh__discard(_room, card.id);
        UPDATE public.hh_rooms SET lasers_used = lasers_used + 1 WHERE id = _room;
        PERFORM public.hh__attack(_room, tgt, p.seat, 'laser');

      WHEN 'shield' THEN
        RAISE EXCEPTION 'Štít se zapne sám, když na tebe někdo vystřelí.';

      WHEN 'repair' THEN
        IF p.energy >= p.max_energy THEN
          RAISE EXCEPTION 'Energii máš plnou.';
        END IF;
        PERFORM public.hh__discard(_room, card.id);
        UPDATE public.hh_players SET energy = energy + 1 WHERE room_id = _room AND seat = p.seat;
        PERFORM public.hh__log(_room, 'repair', p.seat, NULL);

      WHEN 'salva' THEN
        PERFORM public.hh__discard(_room, card.id);
        PERFORM public.hh__log(_room, 'salva', p.seat, NULL);
        -- Po smere hodinových ručičiek od strelca.
        FOR x IN SELECT seat FROM public.hh_players
                  WHERE room_id = _room AND alive AND seat <> p.seat
                  ORDER BY (seat < p.seat), seat LOOP
          EXIT WHEN (SELECT status FROM public.hh_rooms WHERE id = _room) <> 'playing';
          PERFORM public.hh__attack(_room, x.seat, p.seat, 'salva');
        END LOOP;

      WHEN 'tractor' THEN
        IF COALESCE(_action->>'pick', 'hand') = 'hand' THEN
          SELECT * INTO stolen FROM public.hh_cards
           WHERE room_id = _room AND zone = 'hand' AND owner_seat = tgt
           ORDER BY public.hh__rnd(s.seed, 'steal:' || s.acts || ':' || id) LIMIT 1;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Tenhle hráč nemá v ruce žádnou kartu.';
          END IF;
        ELSE
          SELECT * INTO stolen FROM public.hh_cards
           WHERE room_id = _room AND zone = 'eq' AND owner_seat = tgt AND id = (_action->>'pick')::integer;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Takovou věc tenhle hráč na stole nemá.';
          END IF;
        END IF;
        PERFORM public.hh__discard(_room, card.id);
        UPDATE public.hh_cards SET zone = 'hand', owner_seat = p.seat, pos = public.hh__next(_room)
         WHERE room_id = _room AND id = stolen.id;
        IF stolen.zone = 'eq' THEN
          PERFORM public.hh__log(_room, 'steal', p.seat, tgt, jsonb_build_object('from', 'eq', 'kind', stolen.kind));
        ELSE
          PERFORM public.hh__log(_room, 'steal', p.seat, tgt, jsonb_build_object('from', 'hand'),
                                 jsonb_build_object('kind', stolen.kind), ARRAY[me, t.user_id]);
        END IF;

      WHEN 'hyper', 'cloak' THEN
        IF EXISTS (SELECT 1 FROM public.hh_cards
                    WHERE room_id = _room AND zone = 'eq' AND owner_seat = p.seat AND kind = card.kind) THEN
          RAISE EXCEPTION 'Tohle vybavení už máš.';
        END IF;
        UPDATE public.hh_cards SET zone = 'eq', pos = public.hh__next(_room)
         WHERE room_id = _room AND id = card.id;
        PERFORM public.hh__log(_room, 'equip', p.seat, NULL, jsonb_build_object('kind', card.kind));
    END CASE;

  ELSE
    RAISE EXCEPTION 'Neznámá akce.';
  END IF;

  PERFORM public.hh__bump(_room);
  RETURN public.hh_view(_room);
END
$function$;

CREATE OR REPLACE FUNCTION public.hh_tick__ungated(_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
  n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = _room AND user_id = me) THEN
    RAISE EXCEPTION 'V téhle hře nesedíš.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room FOR UPDATE;
  IF r.status = 'playing' AND r.deadline < now() THEN
    UPDATE public.hh_players SET timeouts = timeouts + 1
     WHERE room_id = _room AND seat = r.turn_seat
     RETURNING timeouts INTO n;
    PERFORM public.hh__log(_room, 'timeout', r.turn_seat, NULL, jsonb_build_object('n', n));
    IF n >= 3 THEN
      PERFORM public.hh__eliminate(_room, r.turn_seat, NULL, 'asleep');
      PERFORM public.hh__advance(_room);
    ELSE
      PERFORM public.hh__end_turn(_room, r.turn_seat, NULL, true);
    END IF;
    PERFORM public.hh__bump(_room);
  END IF;
  RETURN public.hh_view(_room);
END
$function$;

CREATE OR REPLACE FUNCTION public.require_member()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.member_ok() THEN
    RAISE EXCEPTION 'Nejdřív je potřeba dokončit vstup do Kamosféry (souhlas rodiče a schválení).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.require_awake()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_night() THEN
    RAISE EXCEPTION 'Kamosféra spí (22:00–6:30). Napiš ráno! 😴' USING ERRCODE = 'check_violation';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.safety_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  m public.member_safety;
  g public.guardians;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.member_safety (user_id) VALUES (me) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO m FROM public.member_safety WHERE user_id = me;
  SELECT * INTO g FROM public.guardians WHERE child_id = me AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'approved', m.approved,
    'consent', m.consent_at IS NOT NULL,
    'consent_token', CASE WHEN m.consent_at IS NULL THEN m.consent_token END,
    'guardian', CASE WHEN g.id IS NOT NULL THEN jsonb_build_object('label', g.label, 'since', g.created_at) END,
    'guardian_invite', m.guardian_invite,
    'onboarded', m.onboarded_at IS NOT NULL,
    'member', m.approved AND m.consent_at IS NOT NULL,
    'night', public.is_night(),
    'is_admin', public.has_role(me, 'creator')
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.guardian_invite_new()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.member_safety SET guardian_invite = t WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Účet není připravený.';
  END IF;
  RETURN t;
END
$function$;

CREATE OR REPLACE FUNCTION public.report_uncomfortable(_other uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  has_guardian boolean;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _other IS NULL OR _other = me THEN
    RAISE EXCEPTION 'Neplatný uživatel.';
  END IF;

  PERFORM public.block_user(_other);
  INSERT INTO public.safety_events (kind, actor_id, target_id) VALUES ('uncomfortable', me, _other);

  -- Najviac 10 signálov za deň, aby dôverníka nezaplavilo opakované ťukanie.
  IF (SELECT count(*) FROM public.guardian_signals
       WHERE child_id = me AND created_at > now() - interval '1 day') < 10 THEN
    INSERT INTO public.guardian_signals (child_id, kind) VALUES (me, 'uncomfortable');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.guardians WHERE child_id = me AND revoked_at IS NULL) INTO has_guardian;
  RETURN jsonb_build_object('guardian', has_guardian);
END
$function$;

CREATE OR REPLACE FUNCTION public.friend_code_use(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  fc public.friend_codes;
  other_name text;
BEGIN
  PERFORM public.require_member();
  -- Hádanie kódov: najviac 10 pokusov za 10 minút.
  IF (SELECT count(*) FROM public.friend_code_attempts
       WHERE user_id = me AND created_at > now() - interval '10 minutes') >= 10 THEN
    RAISE EXCEPTION 'Moc pokusů. Zkus to za chvíli.';
  END IF;
  INSERT INTO public.friend_code_attempts (user_id) VALUES (me);

  -- Neúspech sa vracia ako odpoveď, nie ako chyba: chyba by vrátila späť
  -- aj zápis pokusu a limit by sa dal obísť.
  SELECT * INTO fc FROM public.friend_codes
   WHERE code = upper(btrim(COALESCE(_code, ''))) AND expires_at > now()
   FOR UPDATE;
  IF NOT FOUND
     OR public.is_blocked_between(me, fc.user_id)
     OR NOT EXISTS (SELECT 1 FROM public.member_safety
                     WHERE user_id = fc.user_id AND approved AND consent_at IS NOT NULL) THEN
    RETURN jsonb_build_object('error', 'Tenhle kód neplatí. Popros kamaráda o nový.');
  END IF;
  IF fc.user_id = me THEN
    RETURN jsonb_build_object('error', 'To je tvůj vlastní kód. 🙂');
  END IF;

  DELETE FROM public.friend_codes WHERE code = fc.code;
  UPDATE public.friendships SET status = 'accepted'
   WHERE (requester_id = me AND addressee_id = fc.user_id)
      OR (requester_id = fc.user_id AND addressee_id = me);
  IF NOT FOUND THEN
    INSERT INTO public.friendships (requester_id, addressee_id, status) VALUES (fc.user_id, me, 'accepted');
  END IF;

  INSERT INTO public.notifications (user_id, type, from_user_id) VALUES (fc.user_id, 'friend_accepted', me);
  INSERT INTO public.safety_events (kind, actor_id, target_id) VALUES ('friend_code_used', me, fc.user_id);
  SELECT username INTO other_name FROM public.profiles WHERE user_id = fc.user_id;
  RETURN jsonb_build_object('friend_id', fc.user_id, 'username', other_name);
END
$function$;

CREATE OR REPLACE FUNCTION public.friend_invite_new()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  inv public.friend_invites;
BEGIN
  PERFORM public.require_member();
  IF (SELECT count(*) FROM public.friend_invites
       WHERE inviter_id = me AND used_at IS NULL AND expires_at > now()) >= 5 THEN
    RAISE EXCEPTION 'Máš 5 nepoužitých pozvánek. Počkej, až je kamarádi použijí (nebo vyprší týden).';
  END IF;
  INSERT INTO public.friend_invites (inviter_id) VALUES (me) RETURNING * INTO inv;
  RETURN jsonb_build_object('token', inv.token, 'expires_at', inv.expires_at);
END
$function$;

CREATE OR REPLACE FUNCTION public.friend_invite_use(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  inv public.friend_invites;
  name text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO inv FROM public.friend_invites
   WHERE token = _token AND length(_token) >= 32 FOR UPDATE;
  -- Ten istý človek otvorí odkaz znova (obnovená stránka): žiadna chyba.
  IF FOUND AND inv.used_by = me THEN
    SELECT username INTO name FROM public.profiles WHERE user_id = inv.inviter_id;
    RETURN jsonb_build_object('username', name, 'pending', NOT public.member_ok());
  END IF;
  IF NOT FOUND OR inv.used_at IS NOT NULL OR inv.expires_at <= now()
     OR public.is_blocked_between(me, inv.inviter_id) THEN
    RETURN jsonb_build_object('error', 'Tahle pozvánka už neplatí. Popros kamaráda o novou.');
  END IF;
  IF inv.inviter_id = me THEN
    RETURN jsonb_build_object('error', 'To je tvoje vlastní pozvánka. 🙂 Pošli ji kamarádovi.');
  END IF;

  UPDATE public.friend_invites SET used_by = me, used_at = now() WHERE token = inv.token;
  UPDATE public.friendships SET status = 'accepted'
   WHERE (requester_id = me AND addressee_id = inv.inviter_id)
      OR (requester_id = inv.inviter_id AND addressee_id = me);
  IF NOT FOUND THEN
    INSERT INTO public.friendships (requester_id, addressee_id, status) VALUES (inv.inviter_id, me, 'accepted');
  END IF;
  UPDATE public.member_safety SET invited_by = COALESCE(invited_by, inv.inviter_id)
   WHERE user_id = me AND NOT approved;
  IF public.member_ok() THEN
    INSERT INTO public.notifications (user_id, type, from_user_id) VALUES (inv.inviter_id, 'friend_accepted', me);
  END IF;
  INSERT INTO public.safety_events (kind, actor_id, target_id) VALUES ('friend_invite_used', me, inv.inviter_id);

  SELECT username INTO name FROM public.profiles WHERE user_id = inv.inviter_id;
  RETURN jsonb_build_object('username', name, 'pending', NOT public.member_ok());
END
$function$;

CREATE OR REPLACE FUNCTION public.consent_confirm(_token text, _name text, _guardian boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m public.member_safety;
  g text;
BEGIN
  IF _token IS NULL OR length(_token) < 32 THEN
    RAISE EXCEPTION 'Odkaz není platný.';
  END IF;
  SELECT * INTO m FROM public.member_safety WHERE consent_token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Odkaz není platný.';
  END IF;
  IF m.consent_at IS NOT NULL THEN
    RAISE EXCEPTION 'Souhlas už byl dán. Děkujeme!';
  END IF;

  UPDATE public.member_safety
     SET consent_at = now(), consent_name = NULLIF(left(btrim(COALESCE(_name, '')), 60), '')
   WHERE user_id = m.user_id;
  INSERT INTO public.safety_events (kind, actor_id) VALUES ('parent_consent', m.user_id);

  IF _guardian THEN
    UPDATE public.guardians SET revoked_at = now() WHERE child_id = m.user_id AND revoked_at IS NULL;
    INSERT INTO public.guardians (child_id, label)
    VALUES (m.user_id, COALESCE(NULLIF(left(btrim(COALESCE(_name, '')), 40), ''), 'rodič'))
    RETURNING token INTO g;
    INSERT INTO public.safety_events (kind, actor_id) VALUES ('guardian_added', m.user_id);
  END IF;
  RETURN jsonb_build_object('guardian_token', g);
END
$function$;

CREATE OR REPLACE FUNCTION public.guardian_accept(_invite text, _label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  child uuid;
  g text;
BEGIN
  IF _invite IS NULL OR length(_invite) < 32 THEN
    RAISE EXCEPTION 'Odkaz není platný.';
  END IF;
  UPDATE public.member_safety SET guardian_invite = NULL
   WHERE guardian_invite = _invite
   RETURNING user_id INTO child;
  IF child IS NULL THEN
    RAISE EXCEPTION 'Odkaz není platný nebo už byl použitý.';
  END IF;
  -- Dieťa má jedného dôverníka; nový nahradí predošlého.
  UPDATE public.guardians SET revoked_at = now() WHERE child_id = child AND revoked_at IS NULL;
  INSERT INTO public.guardians (child_id, label)
  VALUES (child, COALESCE(NULLIF(left(btrim(COALESCE(_label, '')), 40), ''), 'důvěrník'))
  RETURNING token INTO g;
  INSERT INTO public.safety_events (kind, actor_id) VALUES ('guardian_added', child);
  RETURN jsonb_build_object('guardian_token', g);
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_members()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'creator') THEN
    RAISE EXCEPTION 'Jen pro správce.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', m.user_id,
      'username', p.username,
      'full_name', p.full_name,
      'created_at', m.created_at,
      'approved', m.approved,
      'consent_at', m.consent_at,
      'consent_name', m.consent_name,
      'guardian', EXISTS (SELECT 1 FROM public.guardians g WHERE g.child_id = m.user_id AND g.revoked_at IS NULL),
      'invited_by', (SELECT ip.username FROM public.profiles ip WHERE ip.user_id = m.invited_by)
    ) ORDER BY (m.approved AND m.consent_at IS NOT NULL), m.approved, m.created_at DESC)
      FROM public.member_safety m JOIN public.profiles p ON p.user_id = m.user_id
  ), '[]'::jsonb);
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_approval(_user uuid, _approved boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m public.member_safety;
BEGIN
  IF NOT public.has_role(auth.uid(), 'creator') THEN
    RAISE EXCEPTION 'Jen pro správce.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO m FROM public.member_safety WHERE user_id = _user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Takový účet neznám.';
  END IF;
  IF _approved AND m.consent_at IS NULL THEN
    RAISE EXCEPTION 'Nejdřív musí dospělý potvrdit souhlas.';
  END IF;
  UPDATE public.member_safety
     SET approved = _approved,
         approved_at = CASE WHEN _approved THEN now() END,
         approved_by = CASE WHEN _approved THEN auth.uid() END
   WHERE user_id = _user;
  INSERT INTO public.safety_events (kind, actor_id, target_id)
  VALUES (CASE WHEN _approved THEN 'member_approved' ELSE 'member_rejected' END, auth.uid(), _user);
END
$function$;

CREATE OR REPLACE FUNCTION public.guard_prepare(_sender uuid, _conversation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.conversations;
  other uuid;
BEGIN
  SELECT * INTO c FROM public.conversations WHERE id = _conversation;
  IF NOT FOUND OR _sender NOT IN (c.participant_1, c.participant_2) THEN
    RETURN jsonb_build_object('error', 'V téhle konverzaci nejsi.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.member_safety
                  WHERE user_id = _sender AND approved AND consent_at IS NOT NULL) THEN
    RETURN jsonb_build_object('error', 'Nejdřív je potřeba dokončit vstup do Kamosféry.');
  END IF;
  IF (SELECT count(*) FROM public.message_checks
       WHERE sender_id = _sender AND created_at > now() - interval '1 minute') >= 30 THEN
    RETURN jsonb_build_object('error', 'Píšeš moc rychle. Chvilku počkej.');
  END IF;
  other := CASE WHEN c.participant_1 = _sender THEN c.participant_2 ELSE c.participant_1 END;
  RETURN jsonb_build_object(
    'recipient', other,
    'friends', public.are_friends(_sender, other),
    'previous', COALESCE((
      SELECT jsonb_agg(m.content ORDER BY m.created_at)
        FROM (SELECT content, created_at FROM public.messages
               WHERE conversation_id = _conversation
               ORDER BY created_at DESC LIMIT 3) m
    ), '[]'::jsonb)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_guard_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'creator') THEN
    RAISE EXCEPTION 'Jen pro správce.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object(
    'enabled', public.message_guard_enabled(),
    'checked_24h', (SELECT count(*) FROM public.message_checks WHERE created_at > now() - interval '1 day'),
    'confirm_24h', (SELECT count(*) FROM public.message_checks WHERE verdict = 'confirm' AND created_at > now() - interval '1 day'),
    'hidden_24h', (SELECT count(*) FROM public.message_checks WHERE verdict = 'hide' AND created_at > now() - interval '1 day'),
    'unchecked_24h', (SELECT count(*) FROM public.message_checks WHERE verdict = 'unchecked' AND created_at > now() - interval '1 day'),
    'last_check', (SELECT max(created_at) FROM public.message_checks)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_message_guard(_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'creator') THEN
    RAISE EXCEPTION 'Jen pro správce.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.app_settings (key, value, updated_at) VALUES ('message_guard', to_jsonb(_enabled), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO public.safety_events (kind, actor_id) VALUES ('guard_switched', auth.uid());
END
$function$;

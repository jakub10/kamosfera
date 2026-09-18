-- ============================================================================
-- world_seed() — zmluva medzi Kamosférou a Kamosvetom
--
-- Kamosvet (DreamWorld) je pravidlo: world = base + Σ deviation(player).
-- Deviation sa počíta z troch čísel — identity, epoch, growth — a pre
-- spoločnú zem z growth každého prítomného. Táto funkcia je JEDINÉ miesto,
-- odkiaľ ich Kamosvet dostane. Nič iné z databázy Kamosféry nečíta.
--
-- Čo prechádza: kto (prezývka, avatar), koľko sveta mu jeho život dovolil
-- (growth), akú má pozornosť (traits), kto sú jeho kamaráti a s kým čo
-- prežil (shared). Identita prechádza — deti sa vo svete spoznajú.
--
-- Čo neprechádza nikdy: skutočné meno, e-mail, text príspevkov a správ,
-- presné miesta. Svet dostane destilát človeka, nikdy jeho dáta.
-- Test 03_world_seed.sql to dokazuje na dátach s vloženými značkami.
--
-- Nálada a správanie sú dve rôzne veci a nikdy sa nemiešajú:
--   traits.mood     — zatiaľ null; príde s AI odhadom tónu (nie obsahu)
--   conduct         — zvlášť, z safety_events; svet ho číta ako ústup,
--                     nikdy ako menší growth. Cit sa netrestá, správanie áno.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.world_seed(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE EXCEPTION 'Musíš byť prihlásený.' USING ERRCODE = '28000';
  END IF;

  -- Svoj seed vidí každý. Cudzí seed vidia iba kamaráti — a nikdy ten,
  -- kto je s ním v blokovaní.
  IF _user_id <> _me AND (
       NOT public.are_friends(_me, _user_id)
       OR public.is_blocked_between(_me, _user_id)
     ) THEN
    RAISE EXCEPTION 'Tento svet ti nie je otvorený.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _p FROM public.profiles WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Taký používateľ neexistuje.' USING ERRCODE = '22023';
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
$$;

REVOKE ALL ON FUNCTION public.world_seed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.world_seed(uuid) TO authenticated;

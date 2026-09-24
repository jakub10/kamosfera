-- ============================================================================
-- Hviezdna Hliadka — kartová hra so skrytými rolami pre 4–7 kamarátov.
--
-- Pravidlá bežia TU, v databáze, nie v prehliadači. Prehliadač len posiela
-- „zahral som kartu X na hráča Y" a dostane späť, čo smie vidieť. Ruky
-- ostatných, ich roly a poradie balíčka nikdy neopustia server — tabuľky
-- s kartami a hráčmi nie sú deťom prístupné vôbec, všetko ide cez funkcie
-- nižšie, ktoré strážia, kto čo vidí.
--
-- Žiadne LLM: každé pravidlo je obyčajný kód, rovnaký vstup = rovnaký výsledok.
-- Náhoda (miešanie balíčka, ukradnutá karta) ide zo „semienka" hry, ktoré
-- nikto z hráčov nepozná.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Tabuľky
-- --------------------------------------------------------------------------

-- Miestnosť: len verejné veci. Prihlásení hráči ju smú čítať (a dostávať
-- zmeny naživo) — `version` sa zvýši pri každom ťahu a prehliadač si potom
-- vypýta, čo sa zmenilo.
CREATE TABLE IF NOT EXISTS public.hh_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-HJ-NP-Z2-9]{5}$'),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished')),
  version bigint NOT NULL DEFAULT 0,
  turn_seat integer,
  turn_no integer NOT NULL DEFAULT 0,
  lasers_used integer NOT NULL DEFAULT 0,
  deadline timestamptz,
  winner text CHECK (winner IN ('crew', 'pirates', 'ai')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tajné: semienko náhody. Kto ho pozná, vie poradie balíčka.
CREATE TABLE IF NOT EXISTS public.hh_secrets (
  room_id uuid PRIMARY KEY REFERENCES public.hh_rooms(id) ON DELETE CASCADE,
  seed bigint NOT NULL,
  acts integer NOT NULL DEFAULT 0,
  reshuffles integer NOT NULL DEFAULT 0,
  counter bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.hh_players (
  room_id uuid NOT NULL REFERENCES public.hh_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat integer NOT NULL,
  role text CHECK (role IN ('captain', 'crew', 'pirate', 'ai')),
  energy integer NOT NULL DEFAULT 0,
  max_energy integer NOT NULL DEFAULT 0,
  alive boolean NOT NULL DEFAULT true,
  timeouts integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (room_id, user_id),
  UNIQUE (room_id, seat)
);

CREATE TABLE IF NOT EXISTS public.hh_cards (
  room_id uuid NOT NULL REFERENCES public.hh_rooms(id) ON DELETE CASCADE,
  id integer NOT NULL CHECK (id BETWEEN 0 AND 49),
  kind text NOT NULL CHECK (kind IN ('laser', 'shield', 'repair', 'salva', 'tractor', 'hyper', 'cloak')),
  zone text NOT NULL CHECK (zone IN ('deck', 'hand', 'eq', 'discard')),
  owner_seat integer,
  pos bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, id),
  CHECK ((zone IN ('hand', 'eq')) = (owner_seat IS NOT NULL))
);

-- Denník hry. `secret` vidia len hráči v `secret_to` (napr. ktorú kartu
-- traktorový lúč ukradol — vie to zlodej a okradnutý, nikto iný).
CREATE TABLE IF NOT EXISTS public.hh_log (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.hh_rooms(id) ON DELETE CASCADE,
  turn_no integer NOT NULL DEFAULT 0,
  kind text NOT NULL,
  a integer,
  b integer,
  info jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret jsonb,
  secret_to uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hh_log_room_idx ON public.hh_log (room_id, id DESC);
CREATE INDEX IF NOT EXISTS hh_players_user_idx ON public.hh_players (user_id);
CREATE INDEX IF NOT EXISTS hh_cards_zone_idx ON public.hh_cards (room_id, zone, owner_seat);

ALTER TABLE public.hh_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hh_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hh_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hh_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hh_log ENABLE ROW LEVEL SECURITY;

-- Nikto z detí nesmie do tabuliek priamo. Jediná výnimka: čítať miestnosť,
-- v ktorej sedí (kvôli upozorneniam naživo). Tá neobsahuje nič tajné.
REVOKE ALL ON public.hh_rooms, public.hh_secrets, public.hh_players, public.hh_cards, public.hh_log
  FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.hh_log_id_seq FROM anon, authenticated;
GRANT SELECT ON public.hh_rooms TO authenticated;

CREATE OR REPLACE FUNCTION public.hh_is_member(_room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = _room AND user_id = auth.uid());
$$;

DROP POLICY IF EXISTS "Hráči vidia svoju miestnosť" ON public.hh_rooms;
CREATE POLICY "Hráči vidia svoju miestnosť" ON public.hh_rooms
  FOR SELECT TO authenticated
  USING (public.hh_is_member(id));

DO $realtime$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.hh_rooms;
EXCEPTION
  WHEN duplicate_object OR insufficient_privilege OR undefined_object THEN NULL;
END
$realtime$;

-- --------------------------------------------------------------------------
-- Karty a pomocníci
-- --------------------------------------------------------------------------

-- Balíček má 50 kariet. Druh je daný číslom karty.
CREATE OR REPLACE FUNCTION public.hh_card_kind(_id integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _id < 22 THEN 'laser'    -- 22×
    WHEN _id < 34 THEN 'shield'   -- 12×
    WHEN _id < 40 THEN 'repair'   --  6×
    WHEN _id < 42 THEN 'salva'    --  2×
    WHEN _id < 46 THEN 'tractor'  --  4×
    WHEN _id < 48 THEN 'hyper'    --  2×
    ELSE 'cloak'                  --  2×
  END;
$$;

-- Rozdelenie rolí podľa počtu hráčov.
CREATE OR REPLACE FUNCTION public.hh_roles_for(_n integer)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _n
    WHEN 4 THEN ARRAY['captain', 'pirate', 'pirate', 'ai']
    WHEN 5 THEN ARRAY['captain', 'crew', 'pirate', 'pirate', 'ai']
    WHEN 6 THEN ARRAY['captain', 'crew', 'pirate', 'pirate', 'pirate', 'ai']
    WHEN 7 THEN ARRAY['captain', 'crew', 'crew', 'pirate', 'pirate', 'pirate', 'ai']
  END;
$$;

-- Deterministické „náhodné" číslo zo semienka a popisu, na čo je.
CREATE OR REPLACE FUNCTION public.hh__rnd(_seed bigint, _salt text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ('x' || substr(md5(_seed::text || ':' || _salt), 1, 15))::bit(60)::bigint;
$$;

CREATE OR REPLACE FUNCTION public.hh__next(_room uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.hh_secrets SET counter = counter + 1 WHERE room_id = _room RETURNING counter;
$$;

CREATE OR REPLACE FUNCTION public.hh__log(
  _room uuid, _kind text, _a integer, _b integer,
  _info jsonb DEFAULT '{}'::jsonb, _secret jsonb DEFAULT NULL, _secret_to uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.hh_log (room_id, turn_no, kind, a, b, info, secret, secret_to)
  SELECT _room, r.turn_no, _kind, _a, _b, COALESCE(_info, '{}'::jsonb), _secret, _secret_to
    FROM public.hh_rooms r WHERE r.id = _room;
$$;

CREATE OR REPLACE FUNCTION public.hh__bump(_room uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.hh_rooms SET version = version + 1, updated_at = now() WHERE id = _room;
$$;

CREATE OR REPLACE FUNCTION public.hh__discard(_room uuid, _card integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.hh_cards
     SET zone = 'discard', owner_seat = NULL, pos = public.hh__next(_room)
   WHERE room_id = _room AND id = _card;
$$;

-- Ťahanie kariet. Keď balíček dôjde, zamieša sa odkladací balíček.
CREATE OR REPLACE FUNCTION public.hh__draw(_room uuid, _seat integer, _n integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c integer;
  got integer := 0;
  s public.hh_secrets;
BEGIN
  FOR i IN 1.._n LOOP
    SELECT id INTO c FROM public.hh_cards
     WHERE room_id = _room AND zone = 'deck' ORDER BY pos, id LIMIT 1;
    IF NOT FOUND THEN
      UPDATE public.hh_secrets SET reshuffles = reshuffles + 1 WHERE room_id = _room RETURNING * INTO s;
      UPDATE public.hh_cards
         SET zone = 'deck', pos = public.hh__rnd(s.seed, 'r' || s.reshuffles || ':' || id)
       WHERE room_id = _room AND zone = 'discard';
      SELECT id INTO c FROM public.hh_cards
       WHERE room_id = _room AND zone = 'deck' ORDER BY pos, id LIMIT 1;
      EXIT WHEN NOT FOUND;
      PERFORM public.hh__log(_room, 'reshuffle', NULL, NULL);
    END IF;
    UPDATE public.hh_cards SET zone = 'hand', owner_seat = _seat, pos = public.hh__next(_room)
     WHERE room_id = _room AND id = c;
    got := got + 1;
  END LOOP;
  RETURN got;
END
$$;

-- Vzdialenosť pri stole: koľko živých hráčov je medzi nami (kratšou
-- stranou). Maskovanie cieľa pridá +1.
CREATE OR REPLACE FUNCTION public.hh__dist(_room uuid, _from integer, _to integer)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seats integer[];
  n integer;
  i integer;
  j integer;
  d integer;
BEGIN
  SELECT array_agg(seat ORDER BY seat) INTO seats
    FROM public.hh_players WHERE room_id = _room AND alive;
  n := COALESCE(array_length(seats, 1), 0);
  i := array_position(seats, _from);
  j := array_position(seats, _to);
  IF i IS NULL OR j IS NULL THEN
    RETURN NULL;
  END IF;
  d := abs(i - j);
  d := LEAST(d, n - d);
  IF EXISTS (SELECT 1 FROM public.hh_cards
              WHERE room_id = _room AND zone = 'eq' AND owner_seat = _to AND kind = 'cloak') THEN
    d := d + 1;
  END IF;
  RETURN d;
END
$$;

-- Dosah: 1, s hyperpohonom 2.
CREATE OR REPLACE FUNCTION public.hh__reach(_room uuid, _seat integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 1 + CASE WHEN EXISTS (
    SELECT 1 FROM public.hh_cards
     WHERE room_id = _room AND zone = 'eq' AND owner_seat = _seat AND kind = 'hyper'
  ) THEN 1 ELSE 0 END;
$$;

-- --------------------------------------------------------------------------
-- Pravidlá
-- --------------------------------------------------------------------------

-- Koniec hry?
--  * Kapitán vypadol → vyhrávajú piráti; ak ostala sama Zblúdilá AI, vyhráva ona.
--  * Všetci piráti aj AI vypadli → vyhráva Kapitán s posádkou.
CREATE OR REPLACE FUNCTION public.hh__check_end(_room uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap_alive boolean;
  bad_alive integer;
  alive_n integer;
  ai_alive boolean;
  w text;
BEGIN
  SELECT COALESCE(bool_or(alive AND role = 'captain'), false),
         count(*) FILTER (WHERE alive AND role IN ('pirate', 'ai')),
         count(*) FILTER (WHERE alive),
         COALESCE(bool_or(alive AND role = 'ai'), false)
    INTO cap_alive, bad_alive, alive_n, ai_alive
    FROM public.hh_players WHERE room_id = _room;

  IF NOT cap_alive THEN
    w := CASE WHEN alive_n = 1 AND ai_alive THEN 'ai' ELSE 'pirates' END;
  ELSIF bad_alive = 0 THEN
    w := 'crew';
  END IF;
  IF w IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.hh_rooms SET status = 'finished', winner = w, deadline = NULL WHERE id = _room;
  PERFORM public.hh__log(_room, 'win', NULL, NULL, jsonb_build_object('winner', w));
  RETURN true;
END
$$;

-- Hráč vypadol: odhalí sa jeho rola, karty idú preč.
--  * Kto zostrelí piráta, ťahá si 3 karty (odmena).
--  * Kapitán, ktorý zostrelí vlastnú posádku, prichádza o všetky karty.
CREATE OR REPLACE FUNCTION public.hh__eliminate(_room uuid, _seat integer, _killer integer, _why text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.hh_players;
  k public.hh_players;
  n integer;
BEGIN
  UPDATE public.hh_players SET alive = false, energy = 0
   WHERE room_id = _room AND seat = _seat AND alive
   RETURNING * INTO v;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM public.hh__discard(_room, c.id)
     FROM public.hh_cards c
    WHERE c.room_id = _room AND c.owner_seat = _seat;

  PERFORM public.hh__log(_room, 'out', _seat, _killer, jsonb_build_object('role', v.role, 'why', _why));

  IF public.hh__check_end(_room) THEN
    RETURN;
  END IF;

  IF _killer IS NULL OR _killer = _seat THEN
    RETURN;
  END IF;
  SELECT * INTO k FROM public.hh_players WHERE room_id = _room AND seat = _killer;
  IF NOT FOUND OR NOT k.alive THEN
    RETURN;
  END IF;

  IF v.role = 'pirate' THEN
    n := public.hh__draw(_room, _killer, 3);
    PERFORM public.hh__log(_room, 'bounty', _killer, _seat, jsonb_build_object('n', n));
  ELSIF v.role = 'crew' AND k.role = 'captain' THEN
    PERFORM public.hh__discard(_room, c.id)
       FROM public.hh_cards c
      WHERE c.room_id = _room AND c.owner_seat = _killer;
    PERFORM public.hh__log(_room, 'oops', _killer, _seat);
  END IF;
END
$$;

-- Útok (laser alebo salva). Štít v ruke sa zapne sám.
CREATE OR REPLACE FUNCTION public.hh__attack(_room uuid, _target integer, _source integer, _what text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sh integer;
  e integer;
BEGIN
  SELECT id INTO sh FROM public.hh_cards
   WHERE room_id = _room AND zone = 'hand' AND owner_seat = _target AND kind = 'shield'
   ORDER BY pos LIMIT 1;
  IF FOUND THEN
    PERFORM public.hh__discard(_room, sh);
    PERFORM public.hh__log(_room, _what || '_blocked', _source, _target);
    RETURN false;
  END IF;

  UPDATE public.hh_players SET energy = energy - 1
   WHERE room_id = _room AND seat = _target AND alive
   RETURNING energy INTO e;
  PERFORM public.hh__log(_room, _what || '_hit', _source, _target);
  IF e IS NOT NULL AND e <= 0 THEN
    PERFORM public.hh__eliminate(_room, _target, _source, _what);
  END IF;
  RETURN true;
END
$$;

-- Začiatok ťahu: hráč si automaticky ťahá 2 karty a má 45 sekúnd.
CREATE OR REPLACE FUNCTION public.hh__begin_turn(_room uuid, _seat integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.hh_rooms
     SET turn_seat = _seat, turn_no = turn_no + 1, lasers_used = 0,
         deadline = now() + interval '45 seconds'
   WHERE id = _room;
  PERFORM public.hh__log(_room, 'turn', _seat, NULL);
  PERFORM public.hh__draw(_room, _seat, 2);
END
$$;

-- Ďalší živý hráč v smere hodinových ručičiek.
CREATE OR REPLACE FUNCTION public.hh__advance(_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur integer;
  nxt integer;
BEGIN
  SELECT turn_seat INTO cur FROM public.hh_rooms WHERE id = _room AND status = 'playing';
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT seat INTO nxt FROM public.hh_players
   WHERE room_id = _room AND alive AND seat > cur ORDER BY seat LIMIT 1;
  IF NOT FOUND THEN
    SELECT seat INTO nxt FROM public.hh_players
     WHERE room_id = _room AND alive ORDER BY seat LIMIT 1;
  END IF;
  IF nxt IS NOT NULL THEN
    PERFORM public.hh__begin_turn(_room, nxt);
  END IF;
END
$$;

-- Koniec ťahu: v ruke smie ostať najviac toľko kariet, koľko má hráč energie.
-- Pri vypršaní času sa zahodia najnovšie karty.
CREATE OR REPLACE FUNCTION public.hh__end_turn(_room uuid, _seat integer, _discard integer[], _auto boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      RAISE EXCEPTION 'Na konci ťahu musíš zahodiť presne % kariet (koľko máš energie, toľko kariet smieš mať).', need;
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(picked) x
       WHERE NOT EXISTS (SELECT 1 FROM public.hh_cards c
                          WHERE c.room_id = _room AND c.id = x AND c.zone = 'hand' AND c.owner_seat = _seat)
    ) THEN
      RAISE EXCEPTION 'Zahodiť môžeš len karty z vlastnej ruky.';
    END IF;
  END IF;

  PERFORM public.hh__discard(_room, x) FROM unnest(picked) x;
  IF need > 0 THEN
    PERFORM public.hh__log(_room, 'discard', _seat, NULL, jsonb_build_object('n', need));
  END IF;
  PERFORM public.hh__advance(_room);
END
$$;

-- Rozdanie: náhodné miesta pri stole, tajné roly, zamiešaný balíček.
-- Semienko sa dá zadať — testy tak vedia hrať stále tú istú hru.
CREATE OR REPLACE FUNCTION public.hh__start(_room uuid, _seed bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
  roles text[];
  x record;
  cap integer;
BEGIN
  SELECT count(*) INTO n FROM public.hh_players WHERE room_id = _room;
  IF n < 4 OR n > 7 THEN
    RAISE EXCEPTION 'Na hru treba 4 až 7 hráčov (teraz: %).', n;
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
$$;

-- Odchod z predsiene (pred začiatkom hry).
CREATE OR REPLACE FUNCTION public.hh__leave_lobby(_room uuid, _user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nh uuid;
BEGIN
  DELETE FROM public.hh_players WHERE room_id = _room AND user_id = _user;
  SELECT user_id INTO nh FROM public.hh_players WHERE room_id = _room ORDER BY joined_at LIMIT 1;
  IF nh IS NULL THEN
    DELETE FROM public.hh_rooms WHERE id = _room;
  ELSE
    UPDATE public.hh_rooms SET host_id = nh WHERE id = _room AND host_id = _user;
    PERFORM public.hh__bump(_room);
  END IF;
END
$$;

-- --------------------------------------------------------------------------
-- Čo vidí hráč
-- --------------------------------------------------------------------------

-- Jediné okno do hry. Každý vidí:
--  * svoju ruku a svoju rolu,
--  * rolu Kapitána, vyradených a — po konci hry — všetkých,
--  * pri ostatných len počet kariet v ruke a vybavenie na stole.
CREATE OR REPLACE FUNCTION public.hh_view(_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
  p public.hh_players;
  my_reach integer;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Najprv sa prihlás.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Táto hra už neexistuje.';
  END IF;
  SELECT * INTO p FROM public.hh_players WHERE room_id = _room AND user_id = me;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V tejto hre nesedíš.' USING ERRCODE = 'insufficient_privilege';
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
$$;

-- --------------------------------------------------------------------------
-- Predsieň: založiť, pridať sa, odísť, pozvať, začať
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hh_create()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  rid uuid;
  x record;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Najprv sa prihlás.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (SELECT count(*) FROM public.hh_rooms
       WHERE host_id = me AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'Založil/a si veľa hier naraz. Skús to o chvíľu.';
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
$$;

CREATE OR REPLACE FUNCTION public.hh_join(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
  x record;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Najprv sa prihlás.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.hh_rooms WHERE code = upper(btrim(COALESCE(_code, ''))) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hru s týmto kódom sme nenašli.';
  END IF;

  -- Kto už pri stole sedí, len sa vracia (napr. po výpadku internetu).
  IF EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = r.id AND user_id = me) THEN
    RETURN jsonb_build_object('id', r.id, 'code', r.code);
  END IF;
  IF r.status <> 'lobby' THEN
    RAISE EXCEPTION 'Táto hra už začala — počkaj na ďalšiu.';
  END IF;
  IF (SELECT count(*) FROM public.hh_players WHERE room_id = r.id) >= 7 THEN
    RAISE EXCEPTION 'Loď je plná (najviac 7 hráčov).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hh_players p
              WHERE p.room_id = r.id AND public.is_blocked_between(me, p.user_id)) THEN
    RAISE EXCEPTION 'Do tejto hry sa pridať nemôžeš.';
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
$$;

CREATE OR REPLACE FUNCTION public.hh_leave(_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
  p public.hh_players;
BEGIN
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT * INTO p FROM public.hh_players WHERE room_id = _room AND user_id = me;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF r.status = 'lobby' THEN
    PERFORM public.hh__leave_lobby(_room, me);
  ELSIF r.status = 'playing' AND p.alive THEN
    -- Odísť z bežiacej hry = vzdať sa. Ostatní hrajú ďalej.
    PERFORM public.hh__eliminate(_room, p.seat, NULL, 'left');
    IF r.turn_seat = p.seat THEN
      PERFORM public.hh__advance(_room);
    END IF;
    PERFORM public.hh__bump(_room);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.hh_start(_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
BEGIN
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'Hru spúšťa ten, kto ju založil.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status = 'playing' THEN
    RAISE EXCEPTION 'Hra už beží.';
  END IF;
  PERFORM public.hh__start(_room, floor(random() * 9e15)::bigint);
  PERFORM public.hh__bump(_room);
  RETURN public.hh_view(_room);
END
$$;

-- Po konci hry: tá istá partia späť do predsiene, kto chce, hrá znova.
CREATE OR REPLACE FUNCTION public.hh_rematch(_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
BEGIN
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room FOR UPDATE;
  IF NOT FOUND OR r.host_id IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'Novú hru spúšťa ten, kto túto založil.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status <> 'finished' THEN
    RAISE EXCEPTION 'Hra ešte neskončila.';
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
$$;

-- Pozvánka pre kamaráta — príde mu ako oznámenie s kódom hry.
CREATE OR REPLACE FUNCTION public.hh_invite(_room uuid, _friend uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
BEGIN
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = _room AND user_id = me) THEN
    RAISE EXCEPTION 'V tejto hre nesedíš.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status <> 'lobby' THEN
    RAISE EXCEPTION 'Hra už začala.';
  END IF;
  IF NOT public.are_friends(me, _friend) OR public.is_blocked_between(me, _friend) THEN
    RAISE EXCEPTION 'Pozvať môžeš len kamarátov.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = _room AND user_id = _friend) THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.notifications
       WHERE from_user_id = me AND type = 'hh_invite' AND created_at > now() - interval '10 minutes') >= 20 THEN
    RAISE EXCEPTION 'Poslal/a si veľa pozvánok. Skús to o chvíľu.';
  END IF;

  DELETE FROM public.notifications
   WHERE user_id = _friend AND from_user_id = me AND type = 'hh_invite' AND NOT read;
  INSERT INTO public.notifications (user_id, type, from_user_id, message)
  VALUES (_friend, 'hh_invite', me, r.code);
END
$$;

-- Moje rozohrané hry (na návrat po výpadku).
CREATE OR REPLACE FUNCTION public.hh_my_rooms()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'code', r.code, 'status', r.status,
           'players', (SELECT count(*) FROM public.hh_players x WHERE x.room_id = r.id),
           'my_turn', r.status = 'playing' AND r.turn_seat = p.seat AND p.alive
         ) ORDER BY r.updated_at DESC), '[]'::jsonb)
    FROM public.hh_rooms r
    JOIN public.hh_players p ON p.room_id = r.id AND p.user_id = auth.uid()
   WHERE r.status IN ('lobby', 'playing');
$$;

-- --------------------------------------------------------------------------
-- Ťah
-- --------------------------------------------------------------------------

-- Jediný vstup do pravidiel: „urob túto akciu". Server skontroluje, či je
-- hráč na ťahu, či kartu naozaj má a či cieľ dosiahne — prehliadaču neverí.
--   {"t": "play", "card": 7, "target": 2}
--   {"t": "play", "card": 43, "target": 2, "pick": "hand" | <id vybavenia>}
--   {"t": "end", "discard": [3, 17]}
CREATE OR REPLACE FUNCTION public.hh_act(_room uuid, _action jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE EXCEPTION 'Najprv sa prihlás.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.hh_rooms WHERE id = _room FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Táto hra už neexistuje.';
  END IF;
  SELECT * INTO p FROM public.hh_players WHERE room_id = _room AND user_id = me;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V tejto hre nesedíš.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status <> 'playing' THEN
    RAISE EXCEPTION 'Hra nebeží.';
  END IF;
  IF NOT p.alive THEN
    RAISE EXCEPTION 'Si vyradený/á — môžeš sa už len pozerať.';
  END IF;
  IF r.turn_seat IS DISTINCT FROM p.seat THEN
    RAISE EXCEPTION 'Nie si na ťahu.';
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
      RAISE EXCEPTION 'Túto kartu nemáš v ruke.';
    END IF;

    IF card.kind IN ('laser', 'tractor') THEN
      tgt := (_action->>'target')::integer;
      SELECT * INTO t FROM public.hh_players WHERE room_id = _room AND seat = tgt AND alive;
      IF NOT FOUND OR tgt = p.seat THEN
        RAISE EXCEPTION 'Vyber iného hráča, ktorý je ešte v hre.';
      END IF;
      d := public.hh__dist(_room, p.seat, tgt);
      reach := public.hh__reach(_room, p.seat);
      IF d > reach THEN
        RAISE EXCEPTION 'Hráč je priďaleko (vzdialenosť %, tvoj dosah %).', d, reach;
      END IF;
    END IF;

    CASE card.kind
      WHEN 'laser' THEN
        IF r.lasers_used >= 1 THEN
          RAISE EXCEPTION 'Laser môžeš vystreliť len raz za ťah.';
        END IF;
        PERFORM public.hh__discard(_room, card.id);
        UPDATE public.hh_rooms SET lasers_used = lasers_used + 1 WHERE id = _room;
        PERFORM public.hh__attack(_room, tgt, p.seat, 'laser');

      WHEN 'shield' THEN
        RAISE EXCEPTION 'Štít sa zapne sám, keď na teba niekto vystrelí.';

      WHEN 'repair' THEN
        IF p.energy >= p.max_energy THEN
          RAISE EXCEPTION 'Energiu máš plnú.';
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
            RAISE EXCEPTION 'Tento hráč nemá v ruke žiadnu kartu.';
          END IF;
        ELSE
          SELECT * INTO stolen FROM public.hh_cards
           WHERE room_id = _room AND zone = 'eq' AND owner_seat = tgt AND id = (_action->>'pick')::integer;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Takú vec tento hráč na stole nemá.';
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
          RAISE EXCEPTION 'Toto vybavenie už máš.';
        END IF;
        UPDATE public.hh_cards SET zone = 'eq', pos = public.hh__next(_room)
         WHERE room_id = _room AND id = card.id;
        PERFORM public.hh__log(_room, 'equip', p.seat, NULL, jsonb_build_object('kind', card.kind));
    END CASE;

  ELSE
    RAISE EXCEPTION 'Neznáma akcia.';
  END IF;

  PERFORM public.hh__bump(_room);
  RETURN public.hh_view(_room);
END
$$;

-- Časovač. Hocikto pri stole môže „zaklopať": ak hráčovi na ťahu vypršal
-- čas, ťah sa ukončí zaňho. Kto zaspí 3× po sebe, vypadne — nikto nečaká večne.
CREATE OR REPLACE FUNCTION public.hh_tick(_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  r public.hh_rooms;
  n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = _room AND user_id = me) THEN
    RAISE EXCEPTION 'V tejto hre nesedíš.' USING ERRCODE = 'insufficient_privilege';
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
$$;

-- --------------------------------------------------------------------------
-- Práva: deti smú volať len verejné funkcie. Vnútorné (hh__*) nie.
-- --------------------------------------------------------------------------

DO $grants$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'hh\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    IF f.proname IN ('hh_view', 'hh_create', 'hh_join', 'hh_leave', 'hh_start', 'hh_rematch',
                     'hh_invite', 'hh_my_rooms', 'hh_act', 'hh_tick', 'hh_is_member',
                     'hh_card_kind', 'hh_roles_for') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END
$grants$;

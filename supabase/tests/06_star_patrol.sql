-- ============================================================================
-- Testy Hviezdnej Hliadky: pravidlá platia a tajné ostáva tajné.
--
-- Deväť testovacích hráčov (a1…a9). Hry sa rozdávajú s pevným semienkom, aby
-- dopadli pri každom spustení rovnako. Pomocníci hh_t_* bežia ako správca a
-- slúžia len na prípravu situácie (dať hráčovi kartu, posunúť ťah); všetky
-- ťahy samotné idú cez hh_act ako prihlásené dieťa.
-- Spúšťa sa po 01_messaging_security.sql — používa jeho `chk`.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

INSERT INTO auth.users (id, email)
SELECT ('a0000000-0000-0000-0000-00000000000' || g)::uuid, 'hh' || g || '@test.local'
  FROM generate_series(1, 9) g
ON CONFLICT DO NOTHING;

-- a9 zablokoval a1 — nesmú sedieť pri jednom stole.
INSERT INTO public.user_blocks (blocker_id, blocked_id)
VALUES ('a0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
-- a1 a a2 sú kamaráti, a1 a a3 nie.
INSERT INTO public.friendships (requester_id, addressee_id, status)
VALUES ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'accepted')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION u(_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a0000000-0000-0000-0000-00000000000' || _n)::uuid;
$$;

-- Spusť SQL ako prihlásený hráč.
CREATE OR REPLACE FUNCTION hh_t_as(_uid uuid, _sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE _sql INTO res;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE;
  END;
  RESET ROLE;
  RETURN res;
END $$;

-- To isté, ale vráti chybovú hlášku (alebo NULL, keď to prešlo).
CREATE OR REPLACE FUNCTION hh_t_err(_uid uuid, _sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM hh_t_as(_uid, _sql);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION hh_t_act(_uid uuid, _room uuid, _a jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT hh_t_as(_uid, format('SELECT public.hh_act(%L::uuid, %L::jsonb)', _room, _a));
$$;
CREATE OR REPLACE FUNCTION hh_t_act_err(_uid uuid, _room uuid, _a jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT hh_t_err(_uid, format('SELECT public.hh_act(%L::uuid, %L::jsonb)', _room, _a));
$$;
CREATE OR REPLACE FUNCTION hh_t_view(_uid uuid, _room uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT hh_t_as(_uid, format('SELECT public.hh_view(%L::uuid)', _room));
$$;

-- Založ stôl s hráčmi a1…aN (a1 je hostiteľ) a rozdaj so semienkom.
CREATE OR REPLACE FUNCTION hh_t_game(_n int, _seed bigint) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE rid uuid; c text;
BEGIN
  SELECT (hh_t_as(u(1), 'SELECT public.hh_create()'))->>'id' INTO rid;
  -- testy zakladajú veľa stolov; limit „10 za hodinu" overuje H14
  UPDATE public.hh_rooms SET created_at = created_at - interval '2 hours' WHERE id = rid;
  SELECT code INTO c FROM public.hh_rooms WHERE id = rid;
  FOR i IN 2.._n LOOP
    PERFORM hh_t_as(u(i), format('SELECT public.hh_join(%L)', c));
  END LOOP;
  PERFORM public.hh__start(rid, _seed);
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION hh_t_seat(_room uuid, _role text) RETURNS int LANGUAGE sql AS $$
  SELECT seat FROM public.hh_players WHERE room_id = _room AND role = _role AND alive ORDER BY seat LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION hh_t_uid(_room uuid, _seat int) RETURNS uuid LANGUAGE sql AS $$
  SELECT user_id FROM public.hh_players WHERE room_id = _room AND seat = _seat;
$$;
CREATE OR REPLACE FUNCTION hh_t_hand(_room uuid, _seat int) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.hh_cards WHERE room_id = _room AND zone = 'hand' AND owner_seat = _seat;
$$;
CREATE OR REPLACE FUNCTION hh_t_energy(_room uuid, _seat int) RETURNS int LANGUAGE sql AS $$
  SELECT energy FROM public.hh_players WHERE room_id = _room AND seat = _seat;
$$;
-- Vyprázdni ruku (karty idú do odhadzovacieho balíčka).
CREATE OR REPLACE FUNCTION hh_t_empty(_room uuid, _seat int) RETURNS void LANGUAGE sql AS $$
  SELECT public.hh__discard(_room, id) FROM public.hh_cards
   WHERE room_id = _room AND zone = 'hand' AND owner_seat = _seat;
$$;
-- Daj hráčovi do ruky kartu daného druhu (z balíčka alebo odpadu).
CREATE OR REPLACE FUNCTION hh_t_give(_room uuid, _seat int, _kind text) RETURNS int LANGUAGE plpgsql AS $$
DECLARE c int;
BEGIN
  SELECT id INTO c FROM public.hh_cards
   WHERE room_id = _room AND kind = _kind AND zone IN ('deck', 'discard') ORDER BY id LIMIT 1;
  IF c IS NULL THEN RAISE EXCEPTION 'test: niet voľnej karty %', _kind; END IF;
  UPDATE public.hh_cards SET zone = 'hand', owner_seat = _seat, pos = public.hh__next(_room)
   WHERE room_id = _room AND id = c;
  RETURN c;
END $$;
CREATE OR REPLACE FUNCTION hh_t_equip(_room uuid, _seat int, _kind text) RETURNS int LANGUAGE plpgsql AS $$
DECLARE c int;
BEGIN
  c := hh_t_give(_room, _seat, _kind);
  UPDATE public.hh_cards SET zone = 'eq' WHERE room_id = _room AND id = c;
  RETURN c;
END $$;
-- Posuň ťah na daného hráča (bez ťahania kariet).
CREATE OR REPLACE FUNCTION hh_t_turn(_room uuid, _seat int) RETURNS void LANGUAGE sql AS $$
  UPDATE public.hh_rooms SET turn_seat = _seat, lasers_used = 0, deadline = now() + interval '45 seconds'
   WHERE id = _room;
$$;
CREATE OR REPLACE FUNCTION hh_t_set_energy(_room uuid, _seat int, _e int) RETURNS void LANGUAGE sql AS $$
  UPDATE public.hh_players SET energy = _e WHERE room_id = _room AND seat = _seat;
$$;
-- Nechaj naživo len vybrané roly/miesta (ostatných vyraď bez pravidiel).
CREATE OR REPLACE FUNCTION hh_t_only(_room uuid, _seats int[]) RETURNS void LANGUAGE sql AS $$
  UPDATE public.hh_players SET alive = false, energy = 0 WHERE room_id = _room AND NOT (seat = ANY (_seats));
$$;

\echo ''
\echo '--- H1. Do tabuliek hry sa deti nedostanú, len cez funkcie ---'
DO $$
DECLARE rid uuid; zly int := 0;
BEGIN
  rid := hh_t_game(4, 101);
  IF hh_t_err(u(1), 'SELECT count(*)::text::jsonb FROM public.hh_cards') IS NOT NULL THEN zly := zly + 1; END IF;
  IF hh_t_err(u(1), 'SELECT count(*)::text::jsonb FROM public.hh_players') IS NOT NULL THEN zly := zly + 1; END IF;
  IF hh_t_err(u(1), 'SELECT count(*)::text::jsonb FROM public.hh_secrets') IS NOT NULL THEN zly := zly + 1; END IF;
  IF hh_t_err(u(1), 'SELECT count(*)::text::jsonb FROM public.hh_log') IS NOT NULL THEN zly := zly + 1; END IF;
  IF hh_t_err(u(1), format('SELECT public.hh__draw(%L::uuid, 0, 5)::text::jsonb', rid)) IS NOT NULL THEN zly := zly + 1; END IF;
  IF hh_t_err(u(1), format('SELECT public.hh__start(%L::uuid, 1)::text::jsonb', rid)) IS NOT NULL THEN zly := zly + 1; END IF;
  IF hh_t_err(u(1), 'UPDATE public.hh_rooms SET status = ''finished'' RETURNING ''1''::jsonb') IS NOT NULL THEN zly := zly + 1; END IF;
  PERFORM chk('karty, hráči, semienko, denník aj vnútorné funkcie sú zamknuté', zly = 7, true);

  PERFORM chk('stôl vidí len ten, kto pri ňom sedí',
    (hh_t_as(u(1), format('SELECT to_jsonb(count(*)) FROM public.hh_rooms WHERE id = %L', rid)))::int = 1
    AND (hh_t_as(u(8), format('SELECT to_jsonb(count(*)) FROM public.hh_rooms WHERE id = %L', rid)))::int = 0,
    true);
  PERFORM chk('cudzí hráč nedostane pohľad do hry',
    hh_t_err(u(8), format('SELECT public.hh_view(%L::uuid)', rid)) IS NOT NULL, true);
END$$;

\echo '--- H2. Predsieň: kód, plná loď, blokovanie, kto spúšťa ---'
DO $$
DECLARE rid uuid; c text; e text;
BEGIN
  SELECT (hh_t_as(u(1), 'SELECT public.hh_create()'))->>'id' INTO rid;
  SELECT code INTO c FROM public.hh_rooms WHERE id = rid;
  PERFORM hh_t_as(u(2), format('SELECT public.hh_join(%L)', '  ' || lower(c) || ' '));
  PERFORM chk('kód funguje aj malými písmenami a s medzerami',
    (SELECT count(*) FROM public.hh_players WHERE room_id = rid) = 2, true);

  e := hh_t_err(u(9), format('SELECT public.hh_join(%L)', c));
  PERFORM chk('zablokovaný hráč sa k stolu nepridá', e IS NOT NULL, true);

  e := hh_t_err(u(2), format('SELECT public.hh_start(%L::uuid)', rid));
  PERFORM chk('hru nespustí nikto okrem hostiteľa', e IS NOT NULL, true);
  e := hh_t_err(u(1), format('SELECT public.hh_start(%L::uuid)', rid));
  PERFORM chk('s dvoma hráčmi sa hra nespustí', e LIKE '%4 až 7%', true);

  FOR i IN 3..8 LOOP
    e := hh_t_err(u(i), format('SELECT public.hh_join(%L)', c));
  END LOOP;
  PERFORM chk('ôsmy hráč sa už nezmestí', e LIKE '%plná%'
    AND (SELECT count(*) FROM public.hh_players WHERE room_id = rid) = 7, true);

  PERFORM hh_t_as(u(1), format('SELECT to_jsonb(true) FROM public.hh_leave(%L::uuid)', rid));
  PERFORM chk('keď hostiteľ odíde, stôl prevezme ďalší',
    (SELECT host_id FROM public.hh_rooms WHERE id = rid) = u(2), true);

  PERFORM hh_t_as(u(2), format('SELECT public.hh_start(%L::uuid)', rid));
  PERFORM chk('nový hostiteľ hru spustí',
    (SELECT status FROM public.hh_rooms WHERE id = rid) = 'playing', true);
  e := hh_t_err(u(1), format('SELECT public.hh_join(%L)', c));
  PERFORM chk('do bežiacej hry sa nový hráč nepridá', e LIKE '%začala%', true);
  PERFORM chk('kto pri stole sedí, vráti sa aj do bežiacej hry',
    (hh_t_as(u(3), format('SELECT public.hh_join(%L)', c)))->>'id' = rid::text, true);
END$$;

\echo '--- H3. Rozdanie: roly, energia, karty ---'
DO $$
DECLARE rid uuid; r2 uuid; ok boolean := true; n int; cap int;
BEGIN
  FOR n IN 4..7 LOOP
    rid := hh_t_game(n, 200 + n);
    ok := ok AND (SELECT array_agg(role ORDER BY role) FROM public.hh_players WHERE room_id = rid)
               = (SELECT array_agg(x ORDER BY x) FROM unnest(public.hh_roles_for(n)) x);
    ok := ok AND (SELECT count(*) FROM public.hh_cards WHERE room_id = rid) = 50;
    cap := hh_t_seat(rid, 'captain');
    ok := ok AND hh_t_energy(rid, cap) = 5 AND hh_t_hand(rid, cap) = 7;
    ok := ok AND NOT EXISTS (SELECT 1 FROM public.hh_players
                              WHERE room_id = rid AND role <> 'captain' AND (energy <> 4 OR hh_t_hand(rid, seat) <> 4));
    ok := ok AND (SELECT turn_seat FROM public.hh_rooms WHERE id = rid) = cap;
    ok := ok AND (SELECT array_agg(seat ORDER BY seat) FROM public.hh_players WHERE room_id = rid)
               = (SELECT array_agg(g) FROM generate_series(0, n - 1) g);
  END LOOP;
  PERFORM chk('pre 4–7 hráčov sedia roly, energia (Kapitán 5), ruky a Kapitán začína', ok, true);

  rid := hh_t_game(4, 777);
  r2 := hh_t_game(4, 777);
  PERFORM chk('rovnaké semienko = rovnaké rozdanie',
    (SELECT array_agg(kind ORDER BY pos) FROM public.hh_cards WHERE room_id = rid AND zone = 'deck')
    = (SELECT array_agg(kind ORDER BY pos) FROM public.hh_cards WHERE room_id = r2 AND zone = 'deck')
    AND (SELECT array_agg(role ORDER BY seat) FROM public.hh_players WHERE room_id = rid)
    = (SELECT array_agg(role ORDER BY seat) FROM public.hh_players WHERE room_id = r2),
    true);
  r2 := hh_t_game(4, 778);
  PERFORM chk('iné semienko = iné rozdanie',
    (SELECT array_agg(kind ORDER BY pos) FROM public.hh_cards WHERE room_id = rid AND zone = 'deck')
    <> (SELECT array_agg(kind ORDER BY pos) FROM public.hh_cards WHERE room_id = r2 AND zone = 'deck'),
    true);
END$$;

\echo '--- H4. Tajné ostáva tajné ---'
DO $$
DECLARE rid uuid; v jsonb; me int; cap int; ok boolean := true; x jsonb;
BEGIN
  rid := hh_t_game(5, 303);
  cap := hh_t_seat(rid, 'captain');
  -- pohľad hráča, ktorý nie je Kapitán
  SELECT seat INTO me FROM public.hh_players WHERE room_id = rid AND role <> 'captain' ORDER BY seat LIMIT 1;
  v := hh_t_view(hh_t_uid(rid, me), rid);

  ok := ok AND (SELECT array_agg((c->>'id')::int ORDER BY (c->>'id')::int) FROM jsonb_array_elements(v->'hand') c)
             = (SELECT array_agg(id ORDER BY id) FROM public.hh_cards WHERE room_id = rid AND zone = 'hand' AND owner_seat = me);
  PERFORM chk('v ruke vidím len svoje karty', ok, true);

  FOR x IN SELECT * FROM jsonb_array_elements(v->'players') LOOP
    IF (x->>'seat')::int = me THEN
      ok := ok AND x->>'role' IS NOT NULL;
    ELSIF (x->>'seat')::int = cap THEN
      ok := ok AND x->>'role' = 'captain';
    ELSE
      ok := ok AND x->>'role' IS NULL;
    END IF;
  END LOOP;
  PERFORM chk('vidím svoju rolu a Kapitána, roly ostatných nie', ok, true);

  PERFORM chk('pohľad neprezradí semienko ani cudzie karty',
    position((SELECT seed::text FROM public.hh_secrets WHERE room_id = rid) IN v::text) = 0
    AND NOT (v ? 'cards') AND NOT (v->'players'->0 ? 'cards'), true);
END$$;

\echo '--- H5. Ťahať smie len ten, kto je na rade, a len kartou, ktorú má ---'
DO $$
DECLARE rid uuid; cap int; other int; c int; e text; mine int;
BEGIN
  rid := hh_t_game(4, 404);
  cap := hh_t_seat(rid, 'captain');
  other := (cap + 1) % 4;
  c := hh_t_give(rid, other, 'repair');
  e := hh_t_act_err(hh_t_uid(rid, other), rid, jsonb_build_object('t', 'play', 'card', c));
  PERFORM chk('hráč mimo ťahu nemôže hrať', e LIKE '%Nie si na ťahu%', true);

  e := hh_t_act_err(hh_t_uid(rid, cap), rid, jsonb_build_object('t', 'play', 'card', c));
  PERFORM chk('kartu z cudzej ruky zahrať nejde', e LIKE '%nemáš%', true);

  mine := hh_t_give(rid, cap, 'shield');
  e := hh_t_act_err(hh_t_uid(rid, cap), rid, jsonb_build_object('t', 'play', 'card', mine));
  PERFORM chk('štít sa nedá zahrať sám od seba', e LIKE '%Štít%', true);

  e := hh_t_act_err(hh_t_uid(rid, cap), rid, '{"t":"hack"}');
  PERFORM chk('neznáma akcia neprejde', e LIKE '%Neznáma%', true);
END$$;

\echo '--- H6. Laser: dosah, raz za ťah, štít ---'
DO $$
DECLARE rid uuid; a int; far int; near int; c int; c2 int; e text; en int;
BEGIN
  rid := hh_t_game(5, 505);
  a := 0; near := 1; far := 2;          -- pri 5 hráčoch je miesto 2 od miesta 0 vo vzdialenosti 2
  PERFORM hh_t_turn(rid, a);
  PERFORM hh_t_empty(rid, a); PERFORM hh_t_empty(rid, near); PERFORM hh_t_empty(rid, far);

  c := hh_t_give(rid, a, 'laser');
  e := hh_t_act_err(hh_t_uid(rid, a), rid, jsonb_build_object('t', 'play', 'card', c, 'target', far));
  PERFORM chk('na hráča mimo dosahu laser nedostrelí', e LIKE '%priďaleko%', true);
  e := hh_t_act_err(hh_t_uid(rid, a), rid, jsonb_build_object('t', 'play', 'card', c, 'target', a));
  PERFORM chk('na seba strieľať nejde', e IS NOT NULL, true);

  en := hh_t_energy(rid, near);
  PERFORM hh_t_act(hh_t_uid(rid, a), rid, jsonb_build_object('t', 'play', 'card', c, 'target', near));
  PERFORM chk('zásah laserom vezme 1 energiu', hh_t_energy(rid, near) = en - 1, true);

  c2 := hh_t_give(rid, a, 'laser');
  e := hh_t_act_err(hh_t_uid(rid, a), rid, jsonb_build_object('t', 'play', 'card', c2, 'target', near));
  PERFORM chk('druhý laser v tom istom ťahu neprejde', e LIKE '%raz za ťah%', true);

  -- ďalší ťah: cieľ má štít
  PERFORM hh_t_turn(rid, a);
  PERFORM hh_t_give(rid, near, 'shield');
  en := hh_t_energy(rid, near);
  PERFORM hh_t_act(hh_t_uid(rid, a), rid, jsonb_build_object('t', 'play', 'card', c2, 'target', near));
  PERFORM chk('štít sa zapne sám a zásah zruší',
    hh_t_energy(rid, near) = en AND hh_t_hand(rid, near) = 0, true);
END$$;

\echo '--- H7. Hyperpohon a maskovanie menia dosah ---'
DO $$
DECLARE rid uuid; c int; e text; h int;
BEGIN
  rid := hh_t_game(5, 606);
  PERFORM hh_t_turn(rid, 0);
  PERFORM hh_t_empty(rid, 0); PERFORM hh_t_empty(rid, 2); PERFORM hh_t_empty(rid, 1);
  h := hh_t_give(rid, 0, 'hyper');
  PERFORM hh_t_act(hh_t_uid(rid, 0), rid, jsonb_build_object('t', 'play', 'card', h));
  c := hh_t_give(rid, 0, 'laser');
  e := hh_t_act_err(hh_t_uid(rid, 0), rid, jsonb_build_object('t', 'play', 'card', c, 'target', 2));
  PERFORM chk('s hyperpohonom dostrelím o miesto ďalej', e IS NULL, true);

  h := hh_t_give(rid, 0, 'hyper');
  e := hh_t_act_err(hh_t_uid(rid, 0), rid, jsonb_build_object('t', 'play', 'card', h));
  PERFORM chk('dva rovnaké kusy vybavenia mať nejde', e LIKE '%už máš%', true);

  PERFORM hh_t_turn(rid, 0);
  PERFORM hh_t_equip(rid, 1, 'cloak');
  PERFORM hh_t_equip(rid, 2, 'cloak');
  c := hh_t_give(rid, 0, 'laser');
  e := hh_t_act_err(hh_t_uid(rid, 0), rid, jsonb_build_object('t', 'play', 'card', c, 'target', 2));
  PERFORM chk('maskovanie cieľa pridá +1 k vzdialenosti', e LIKE '%vzdialenosť 3, tvoj dosah 2%', true);
  e := hh_t_act_err(hh_t_uid(rid, 0), rid, jsonb_build_object('t', 'play', 'card', c, 'target', 1));
  PERFORM chk('maskovaný sused je stále na dosah hyperpohonu', e IS NULL, true);
END$$;

\echo '--- H8. Oprava a salva ---'
DO $$
DECLARE rid uuid; c int; e text; ok boolean := true; before int[];
BEGIN
  rid := hh_t_game(5, 707);
  PERFORM hh_t_turn(rid, 0);
  PERFORM hh_t_set_energy(rid, 0, (SELECT max_energy FROM public.hh_players WHERE room_id = rid AND seat = 0));
  c := hh_t_give(rid, 0, 'repair');
  e := hh_t_act_err(hh_t_uid(rid, 0), rid, jsonb_build_object('t', 'play', 'card', c));
  PERFORM chk('opraviť plnú energiu nejde', e LIKE '%plnú%', true);
  PERFORM hh_t_set_energy(rid, 0, 2);
  PERFORM hh_t_act(hh_t_uid(rid, 0), rid, jsonb_build_object('t', 'play', 'card', c));
  PERFORM chk('oprava pridá 1 energiu', hh_t_energy(rid, 0) = 3, true);

  FOR i IN 1..4 LOOP PERFORM hh_t_empty(rid, i); END LOOP;
  PERFORM hh_t_give(rid, 3, 'shield');
  SELECT array_agg(energy ORDER BY seat) INTO before FROM public.hh_players WHERE room_id = rid;
  c := hh_t_give(rid, 0, 'salva');
  PERFORM hh_t_act(hh_t_uid(rid, 0), rid, jsonb_build_object('t', 'play', 'card', c));
  ok := hh_t_energy(rid, 0) = before[1]
    AND hh_t_energy(rid, 1) = before[2] - 1
    AND hh_t_energy(rid, 2) = before[3] - 1
    AND hh_t_energy(rid, 3) = before[4]
    AND hh_t_energy(rid, 4) = before[5] - 1
    AND hh_t_hand(rid, 3) = 0;
  PERFORM chk('salva zasiahne všetkých ostatných, štít chráni', ok, true);
  PERFORM chk('salva sa neráta ako laser',
    (SELECT lasers_used FROM public.hh_rooms WHERE id = rid) = 0, true);
END$$;

\echo '--- H9. Traktorový lúč: čo sa ukradlo, vedia len dvaja ---'
DO $$
DECLARE rid uuid; c int; loot int; v jsonb; vo jsonb; vx jsonb; e text; eq int;
BEGIN
  rid := hh_t_game(5, 808);
  PERFORM hh_t_turn(rid, 0);
  PERFORM hh_t_empty(rid, 0); PERFORM hh_t_empty(rid, 1);
  c := hh_t_give(rid, 0, 'tractor');
  e := hh_t_act_err(hh_t_uid(rid, 0), rid, jsonb_build_object('t', 'play', 'card', c, 'target', 1));
  PERFORM chk('z prázdnej ruky ukradnúť nejde', e LIKE '%žiadnu kartu%', true);

  loot := hh_t_give(rid, 1, 'repair');
  v := hh_t_act(hh_t_uid(rid, 0), rid, jsonb_build_object('t', 'play', 'card', c, 'target', 1));
  PERFORM chk('ukradnutá karta je v mojej ruke',
    (SELECT owner_seat FROM public.hh_cards WHERE room_id = rid AND id = loot) = 0, true);

  vo := hh_t_view(hh_t_uid(rid, 1), rid);
  vx := hh_t_view(hh_t_uid(rid, 3), rid);
  PERFORM chk('zlodej aj okradnutý vidia, čo sa ukradlo; tretí nie',
    (SELECT l->'secret'->>'kind' FROM jsonb_array_elements(v->'log') l WHERE l->>'kind' = 'steal') = 'repair'
    AND (SELECT l->'secret'->>'kind' FROM jsonb_array_elements(vo->'log') l WHERE l->>'kind' = 'steal') = 'repair'
    AND (SELECT l->'secret' FROM jsonb_array_elements(vx->'log') l WHERE l->>'kind' = 'steal') = 'null'::jsonb
    AND (SELECT l->'info' FROM jsonb_array_elements(vx->'log') l WHERE l->>'kind' = 'steal') = '{"from": "hand"}'::jsonb,
    true);

  PERFORM hh_t_turn(rid, 0);
  eq := hh_t_equip(rid, 1, 'hyper');
  c := hh_t_give(rid, 0, 'tractor');
  PERFORM hh_t_act(hh_t_uid(rid, 0), rid, jsonb_build_object('t', 'play', 'card', c, 'target', 1, 'pick', eq));
  PERFORM chk('ukradnúť sa dá aj vybavenie zo stola',
    (SELECT zone || owner_seat FROM public.hh_cards WHERE room_id = rid AND id = eq) = 'hand0', true);
END$$;

\echo '--- H10. Koniec ťahu: zahodiť presne toľko, koľko treba ---'
DO $$
DECLARE rid uuid; cap int; nxt int; e text; h int; ids int[]; hand_nxt int;
BEGIN
  rid := hh_t_game(4, 909);
  cap := hh_t_seat(rid, 'captain');
  nxt := (cap + 1) % 4;
  h := hh_t_hand(rid, cap);                     -- 7 kariet, energia 5 → zahodiť 2
  e := hh_t_act_err(hh_t_uid(rid, cap), rid, '{"t":"end","discard":[]}');
  PERFORM chk('bez zahodenia nadbytočných kariet ťah neskončí', e LIKE '%presne 2%', true);

  SELECT array_agg(id) INTO ids FROM (SELECT id FROM public.hh_cards
    WHERE room_id = rid AND zone = 'hand' AND owner_seat = nxt LIMIT 2) t;
  e := hh_t_act_err(hh_t_uid(rid, cap), rid, jsonb_build_object('t', 'end', 'discard', to_jsonb(ids)));
  PERFORM chk('zahodiť cudzie karty nejde', e LIKE '%vlastnej ruky%', true);

  hand_nxt := hh_t_hand(rid, nxt);
  SELECT array_agg(id) INTO ids FROM (SELECT id FROM public.hh_cards
    WHERE room_id = rid AND zone = 'hand' AND owner_seat = cap LIMIT 2) t;
  PERFORM hh_t_act(hh_t_uid(rid, cap), rid, jsonb_build_object('t', 'end', 'discard', to_jsonb(ids)));
  PERFORM chk('po ťahu ostane v ruke toľko kariet ako energie', hh_t_hand(rid, cap) = 5, true);
  PERFORM chk('ďalší hráč je na ťahu a potiahol si 2 karty',
    (SELECT turn_seat FROM public.hh_rooms WHERE id = rid) = nxt AND hh_t_hand(rid, nxt) = hand_nxt + 2, true);
END$$;

\echo '--- H11. Vypadnutie: odhalená rola, odmena, trest ---'
DO $$
DECLARE rid uuid; cap int; pir int; pir2 int; crew int; ai int; c int; v jsonb;
BEGIN
  rid := hh_t_game(6, 1111);
  cap := hh_t_seat(rid, 'captain');
  crew := hh_t_seat(rid, 'crew');
  ai := hh_t_seat(rid, 'ai');
  SELECT seat INTO pir FROM public.hh_players WHERE room_id = rid AND role = 'pirate' ORDER BY seat LIMIT 1;
  SELECT seat INTO pir2 FROM public.hh_players WHERE room_id = rid AND role = 'pirate' ORDER BY seat OFFSET 1 LIMIT 1;
  -- 5 hráčov pri stole + hyperpohon = Kapitán dosiahne na každého
  PERFORM hh_t_only(rid, ARRAY[cap, crew, pir, pir2, ai]);
  PERFORM hh_t_turn(rid, cap);
  PERFORM hh_t_empty(rid, cap); PERFORM hh_t_empty(rid, pir);
  PERFORM hh_t_equip(rid, cap, 'hyper');
  PERFORM hh_t_set_energy(rid, pir, 1);
  c := hh_t_give(rid, cap, 'laser');
  PERFORM hh_t_act(hh_t_uid(rid, cap), rid, jsonb_build_object('t', 'play', 'card', c, 'target', pir));
  PERFORM chk('vyradený pirát: nie je v hre a jeho karty sú preč',
    NOT (SELECT alive FROM public.hh_players WHERE room_id = rid AND seat = pir) AND hh_t_hand(rid, pir) = 0, true);
  PERFORM chk('za piráta si strelec ťahá 3 karty', hh_t_hand(rid, cap) = 3, true);

  v := hh_t_view(hh_t_uid(rid, crew), rid);
  PERFORM chk('rola vyradeného je všetkým odhalená',
    (SELECT p->>'role' FROM jsonb_array_elements(v->'players') p WHERE (p->>'seat')::int = pir) = 'pirate', true);

  -- Kapitán zostrelí vlastnú posádku → príde o všetky karty aj vybavenie
  PERFORM hh_t_turn(rid, cap);
  PERFORM hh_t_empty(rid, crew);
  PERFORM hh_t_set_energy(rid, crew, 1);
  c := hh_t_give(rid, cap, 'laser');
  PERFORM hh_t_act(hh_t_uid(rid, cap), rid, jsonb_build_object('t', 'play', 'card', c, 'target', crew));
  PERFORM chk('Kapitán, ktorý zostrelí posádku, príde o karty aj vybavenie',
    NOT (SELECT alive FROM public.hh_players WHERE room_id = rid AND seat = crew)
    AND (SELECT count(*) FROM public.hh_cards WHERE room_id = rid AND owner_seat = cap) = 0, true);
END$$;

\echo '--- H12. Kto vyhrá ---'
DO $$
DECLARE rid uuid; cap int; pir int; ai int; c int; v jsonb;
BEGIN
  -- Piráti: Kapitán padne
  rid := hh_t_game(4, 1212);
  cap := hh_t_seat(rid, 'captain'); pir := hh_t_seat(rid, 'pirate');
  PERFORM hh_t_only(rid, ARRAY[cap, pir, hh_t_seat(rid, 'ai')]);
  PERFORM hh_t_turn(rid, pir); PERFORM hh_t_empty(rid, cap); PERFORM hh_t_set_energy(rid, cap, 1);
  c := hh_t_give(rid, pir, 'laser');
  PERFORM hh_t_act(hh_t_uid(rid, pir), rid, jsonb_build_object('t', 'play', 'card', c, 'target', cap));
  PERFORM chk('Kapitán padol a žije ešte AI → vyhrávajú piráti',
    (SELECT winner FROM public.hh_rooms WHERE id = rid) = 'pirates'
    AND (SELECT status FROM public.hh_rooms WHERE id = rid) = 'finished', true);
  v := hh_t_view(hh_t_uid(rid, pir), rid);
  PERFORM chk('po konci hry vidí každý všetky roly',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'players') p WHERE p->>'role' IS NULL), true);
  PERFORM chk('po konci hry sa už ťahať nedá',
    hh_t_act_err(hh_t_uid(rid, pir), rid, '{"t":"end"}') LIKE '%nebeží%', true);

  -- AI: posledná v súboji s Kapitánom
  rid := hh_t_game(4, 1213);
  cap := hh_t_seat(rid, 'captain'); ai := hh_t_seat(rid, 'ai');
  PERFORM hh_t_only(rid, ARRAY[cap, ai]);
  PERFORM hh_t_turn(rid, ai); PERFORM hh_t_empty(rid, cap); PERFORM hh_t_set_energy(rid, cap, 1);
  c := hh_t_give(rid, ai, 'laser');
  PERFORM hh_t_act(hh_t_uid(rid, ai), rid, jsonb_build_object('t', 'play', 'card', c, 'target', cap));
  PERFORM chk('Zblúdilá AI ostala posledná → vyhráva AI',
    (SELECT winner FROM public.hh_rooms WHERE id = rid) = 'ai', true);

  -- Posádka: padne posledný „zlý"
  rid := hh_t_game(4, 1214);
  cap := hh_t_seat(rid, 'captain'); ai := hh_t_seat(rid, 'ai');
  PERFORM hh_t_only(rid, ARRAY[cap, ai]);
  PERFORM hh_t_turn(rid, cap); PERFORM hh_t_empty(rid, ai); PERFORM hh_t_set_energy(rid, ai, 1);
  c := hh_t_give(rid, cap, 'laser');
  PERFORM hh_t_act(hh_t_uid(rid, cap), rid, jsonb_build_object('t', 'play', 'card', c, 'target', ai));
  PERFORM chk('piráti aj AI sú preč → vyhráva Kapitán s posádkou',
    (SELECT winner FROM public.hh_rooms WHERE id = rid) = 'crew', true);

  -- Salva, ktorá zloží Kapitána, sa hneď zastaví
  rid := hh_t_game(5, 1215);
  cap := hh_t_seat(rid, 'captain'); pir := hh_t_seat(rid, 'pirate');
  PERFORM hh_t_turn(rid, pir);
  FOR i IN 0..4 LOOP PERFORM hh_t_empty(rid, i); END LOOP;
  PERFORM hh_t_set_energy(rid, cap, 1);
  c := hh_t_give(rid, pir, 'salva');
  PERFORM hh_t_act(hh_t_uid(rid, pir), rid, jsonb_build_object('t', 'play', 'card', c));
  PERFORM chk('salva, ktorá zloží Kapitána, ukončí hru',
    (SELECT winner FROM public.hh_rooms WHERE id = rid) = 'pirates'
    AND (SELECT count(*) FROM public.hh_log WHERE room_id = rid AND kind = 'win') = 1, true);
END$$;

\echo '--- H13. Časovač: nikto nezdržuje hru ---'
DO $$
DECLARE rid uuid; cap int; other int; t0 int;
BEGIN
  rid := hh_t_game(4, 1313);
  cap := hh_t_seat(rid, 'captain');
  other := (cap + 1) % 4;
  t0 := (SELECT turn_no FROM public.hh_rooms WHERE id = rid);
  PERFORM hh_t_as(hh_t_uid(rid, other), format('SELECT public.hh_tick(%L::uuid)', rid));
  PERFORM chk('pred uplynutím času sa ťah nepreskočí',
    (SELECT turn_no FROM public.hh_rooms WHERE id = rid) = t0, true);

  UPDATE public.hh_rooms SET deadline = now() - interval '1 second' WHERE id = rid;
  PERFORM hh_t_as(hh_t_uid(rid, other), format('SELECT public.hh_tick(%L::uuid)', rid));
  PERFORM chk('po uplynutí času ťah skončí za hráča a nadbytočné karty sa zahodia',
    (SELECT turn_seat FROM public.hh_rooms WHERE id = rid) = other AND hh_t_hand(rid, cap) = 5, true);

  PERFORM chk('cudzí človek časovač nespustí',
    hh_t_err(u(8), format('SELECT public.hh_tick(%L::uuid)', rid)) IS NOT NULL, true);

  -- ten istý hráč zaspí trikrát
  UPDATE public.hh_players SET timeouts = 2 WHERE room_id = rid AND seat = other;
  UPDATE public.hh_rooms SET deadline = now() - interval '1 second' WHERE id = rid;
  PERFORM hh_t_as(hh_t_uid(rid, cap), format('SELECT public.hh_tick(%L::uuid)', rid));
  PERFORM chk('kto zaspí trikrát po sebe, vypadne a hra ide ďalej',
    NOT (SELECT alive FROM public.hh_players WHERE room_id = rid AND seat = other)
    AND (SELECT turn_seat FROM public.hh_rooms WHERE id = rid) <> other, true);
END$$;

\echo '--- H14. Odchod z hry, pozvánky, odveta ---'
DO $$
DECLARE rid uuid; cap int; who int; e text; r2 uuid;
BEGIN
  rid := hh_t_game(4, 1414);
  cap := hh_t_seat(rid, 'captain');
  who := (cap + 1) % 4;
  PERFORM hh_t_as(hh_t_uid(rid, who), format('SELECT to_jsonb(true) FROM public.hh_leave(%L::uuid)', rid));
  PERFORM chk('kto odíde z bežiacej hry, vzdáva sa — ostatní hrajú ďalej',
    NOT (SELECT alive FROM public.hh_players WHERE room_id = rid AND seat = who)
    AND (SELECT status FROM public.hh_rooms WHERE id = rid) IN ('playing', 'finished'), true);

  SELECT (hh_t_as(u(1), 'SELECT public.hh_create()'))->>'id' INTO r2;
  e := hh_t_err(u(1), format('SELECT to_jsonb(true) FROM public.hh_invite(%L::uuid, %L::uuid)', r2, u(3)));
  PERFORM chk('pozvať sa dá len kamaráta', e LIKE '%kamarátov%', true);
  PERFORM hh_t_as(u(1), format('SELECT to_jsonb(true) FROM public.hh_invite(%L::uuid, %L::uuid)', r2, u(2)));
  PERFORM hh_t_as(u(1), format('SELECT to_jsonb(true) FROM public.hh_invite(%L::uuid, %L::uuid)', r2, u(2)));
  PERFORM chk('kamarát dostane jednu pozvánku s kódom (nie záplavu)',
    (SELECT count(*) FROM public.notifications WHERE user_id = u(2) AND type = 'hh_invite' AND NOT read) = 1
    AND (SELECT message FROM public.notifications WHERE user_id = u(2) AND type = 'hh_invite' LIMIT 1)
        = (SELECT code FROM public.hh_rooms WHERE id = r2), true);
  e := hh_t_err(u(4), format('SELECT to_jsonb(true) FROM public.hh_invite(%L::uuid, %L::uuid)', r2, u(2)));
  PERFORM chk('pozývať môže len ten, kto pri stole sedí', e IS NOT NULL, true);

  FOR i IN 1..12 LOOP
    e := hh_t_err(u(5), 'SELECT public.hh_create()');
  END LOOP;
  PERFORM chk('zakladaním stolov sa nedá nahromadiť smetie: vždy len jedna moja predsieň',
    (SELECT count(*) FROM public.hh_rooms WHERE host_id = u(5)) = 1, true);

  -- odveta po skončenej hre
  rid := hh_t_game(4, 1415);
  UPDATE public.hh_rooms SET status = 'finished', winner = 'crew' WHERE id = rid;
  e := hh_t_err(u(2), format('SELECT public.hh_rematch(%L::uuid)', rid));
  PERFORM chk('odvetu spustí len hostiteľ', e IS NOT NULL, true);
  PERFORM hh_t_as(u(1), format('SELECT public.hh_rematch(%L::uuid)', rid));
  PERFORM chk('odveta vráti partiu do predsiene bez rolí a kariet',
    (SELECT status FROM public.hh_rooms WHERE id = rid) = 'lobby'
    AND NOT EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = rid AND role IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.hh_cards WHERE room_id = rid), true);
END$$;

\echo '--- H15. Celé hry od začiatku po víťaza, len cez hh_act ---'
DO $$
DECLARE
  rid uuid; r record; me uuid; v jsonb; card jsonb; tgt jsonb; done boolean; steps int := 0; total int;
  need int; disc jsonb; n int; seed int; wins text[] := '{}';
BEGIN
 FOR n IN 4..7 LOOP
 FOR seed IN 1..4 LOOP
  steps := 0;
  rid := hh_t_game(n, 1500 + n * 10 + seed);
  LOOP
    SELECT * INTO r FROM public.hh_rooms WHERE id = rid;
    EXIT WHEN r.status <> 'playing' OR steps > 2000;
    steps := steps + 1;
    me := hh_t_uid(rid, r.turn_seat);
    v := hh_t_view(me, rid);
    done := false;
    -- jednoduchý „hráč": zahrá prvú kartu, ktorá ide, inak ukončí ťah
    FOR card IN SELECT * FROM jsonb_array_elements(v->'hand') LOOP
      IF card->>'kind' IN ('laser', 'tractor') THEN
        FOR tgt IN SELECT * FROM jsonb_array_elements(v->'players') p
                    WHERE (p->>'alive')::boolean AND (p->>'dist') IS NOT NULL
                      AND (p->>'dist')::int <= (v->'me'->>'reach')::int
                      AND ((p->>'role') IS DISTINCT FROM 'captain' OR (v->'me'->>'role') IN ('pirate', 'ai')) LOOP
          IF hh_t_act_err(me, rid, jsonb_build_object('t', 'play', 'card', card->'id', 'target', tgt->'seat')) IS NULL THEN
            done := true; EXIT;
          END IF;
        END LOOP;
      ELSIF card->>'kind' <> 'shield' THEN
        done := hh_t_act_err(me, rid, jsonb_build_object('t', 'play', 'card', card->'id')) IS NULL;
      END IF;
      EXIT WHEN done;
    END LOOP;
    IF NOT done AND (SELECT status FROM public.hh_rooms WHERE id = rid) = 'playing' THEN
      v := hh_t_view(me, rid);
      need := GREATEST(0, jsonb_array_length(v->'hand') - (SELECT energy FROM public.hh_players WHERE room_id = rid AND user_id = me));
      SELECT COALESCE(jsonb_agg(c->'id'), '[]') INTO disc FROM (SELECT c FROM jsonb_array_elements(v->'hand') c LIMIT need) t;
      PERFORM hh_t_act(me, rid, jsonb_build_object('t', 'end', 'discard', disc));
    END IF;
    SELECT count(*) INTO total FROM public.hh_cards WHERE room_id = rid;
    IF total <> 50 THEN RAISE EXCEPTION 'ZLYHALO: karty sa stratili (%)', total; END IF;
    IF EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = rid AND alive AND energy <= 0)
       OR EXISTS (SELECT 1 FROM public.hh_players WHERE room_id = rid AND energy > max_energy) THEN
      RAISE EXCEPTION 'ZLYHALO: energia mimo pravidiel';
    END IF;
  END LOOP;
  IF (SELECT status FROM public.hh_rooms WHERE id = rid) <> 'finished' THEN
    RAISE EXCEPTION 'ZLYHALO: hra % hráčov (semienko %) neskončila', n, seed;
  END IF;
  wins := wins || (SELECT winner FROM public.hh_rooms WHERE id = rid);
 END LOOP;
 END LOOP;
  RAISE NOTICE '     (16 hier, víťazi: %)', wins;
  PERFORM chk('16 celých hier (4–7 hráčov) dobehne do konca, žiadna karta sa nestratí, energia ostáva v medziach',
    array_length(wins, 1) = 16, true);
END$$;

\echo ''
\echo 'Hviezdna Hliadka: všetko OK'

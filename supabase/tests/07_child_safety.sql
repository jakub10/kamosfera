-- ============================================================================
-- Testy bezpečnosti detí (20261001100000_child_safety.sql): čo sa NESMIE podariť.
--
--   c1 Cyril  — nový, ešte bez súhlasu a schválenia
--   c2 Dorka  — plnohodnotná členka
--   c3 Emo    — plnohodnotný člen
--   c4 Sára   — správkyňa (creator)
--   c5 Peťo   — schválený, ale bez súhlasu (stav, ktorý by vznikol ručnou úpravou)
-- Spúšťa sa po 01_messaging_security.sql — používa jeho `chk`.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

INSERT INTO auth.users (id, email)
SELECT ('c0000000-0000-0000-0000-00000000000' || g)::uuid, 'safe' || g || '@test.local'
  FROM generate_series(1, 5) g
ON CONFLICT DO NOTHING;
UPDATE public.member_safety SET approved = true, consent_at = now()
 WHERE user_id IN ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003',
                   'c0000000-0000-0000-0000-000000000004');
UPDATE public.member_safety SET approved = true, consent_at = NULL
 WHERE user_id = 'c0000000-0000-0000-0000-000000000005';
INSERT INTO public.user_roles (user_id, role) VALUES ('c0000000-0000-0000-0000-000000000004', 'creator');
INSERT INTO public.posts (user_id, content) VALUES ('c0000000-0000-0000-0000-000000000002', 'Dorkin príspevok');

CREATE OR REPLACE FUNCTION c(_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('c0000000-0000-0000-0000-00000000000' || _n)::uuid;
$$;

-- SQL ako prihlásené dieťa (alebo ako anonym bez prihlásenia, keď _uid je NULL).
CREATE OR REPLACE FUNCTION ako(_uid uuid, _sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(_uid::text, ''), true);
  IF _uid IS NULL THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
  BEGIN
    EXECUTE _sql INTO res;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE;
  END;
  RESET ROLE;
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION ako_chyba(_uid uuid, _sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ako(_uid, _sql);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

\echo ''
\echo '--- B1. Kto nie je plnohodnotný člen, nevidí nikoho a nikto nevidí jeho ---'
DO $$
BEGIN
  PERFORM chk('nový účet začína ako „čaká"',
    (SELECT NOT approved AND consent_at IS NULL FROM public.member_safety WHERE user_id = c(1)), true);
  PERFORM chk('nový nevidí príspevky ostatných',
    (ako(c(1), 'SELECT to_jsonb(count(*)) FROM public.posts'))::int = 0, true);
  PERFORM chk('nový nevidí profily ostatných, len svoj',
    (ako(c(1), 'SELECT to_jsonb(count(*)) FROM public.profiles'))::int = 1, true);
  PERFORM chk('nový nič nezapíše',
    ako_chyba(c(1), format('INSERT INTO public.posts (user_id, content) VALUES (%L, ''ahoj'') RETURNING ''1''::jsonb', c(1))) IS NOT NULL, true);
  PERFORM chk('nový nezačne konverzáciu',
    ako_chyba(c(1), format('SELECT to_jsonb(public.start_conversation(%L::uuid, ''ahoj''))', c(2))) LIKE '%souhlas rodiče%', true);
  PERFORM chk('nový nevidí pevnosti ani svet Kamosvet',
    ako_chyba(c(1), 'SELECT to_jsonb(count(*)) FROM public.fortress_browse()') IS NOT NULL
    AND ako_chyba(c(1), 'SELECT to_jsonb(public.world_seed())') IS NOT NULL, true);
  PERFORM chk('nový nezaloží hru ani nedostane kód kamaráta',
    ako_chyba(c(1), 'SELECT public.hh_create()') IS NOT NULL
    AND ako_chyba(c(1), 'SELECT public.friend_code_new()') IS NOT NULL, true);
  PERFORM chk('člen nového nevidí',
    (ako(c(2), format('SELECT to_jsonb(count(*)) FROM public.profiles WHERE user_id = %L', c(1))))::int = 1, true);
  PERFORM chk('plnohodnotný člen vidí príspevky',
    (ako(c(3), 'SELECT to_jsonb(count(*)) FROM public.posts'))::int >= 1, true);
END$$;

\echo '--- B2. Brána je na každej funkcii, ktorá obchádza pravidlá tabuliek ---'
DO $$
DECLARE chyba text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO chyba
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('start_conversation', 'respond_to_conversation_request', 'fortress_browse',
                       'fortress_leaderboard', 'fortress_profile', 'hh_create', 'hh_join', 'hh_invite',
                       'hh_view', 'hh_act', 'hh_my_rooms', 'hh_start', 'hh_tick', 'hh_rematch', 'hh_leave',
                       'world_seed', 'kindness_given', 'post_reactions', 'submit_game_score',
                       'purchase_vip_item', 'create_realtime_ws_ticket')
     AND position('require_member' IN p.prosrc) = 0;
  IF chyba IS NOT NULL THEN
    RAISE NOTICE 'bez brány: %', chyba;
  END IF;
  PERFORM chk('všetky obchádzajúce funkcie majú bránu (aj po neskorších migráciách)', chyba IS NULL, true);
  PERFORM chk('pôvodné funkcie bez brány sa zavolať nedajú',
    ako_chyba(c(2), 'SELECT public.hh_create__ungated()') IS NOT NULL
    AND ako_chyba(c(2), 'SELECT to_jsonb(public.world_seed__ungated())') IS NOT NULL, true);
  PERFORM chk('plnohodnotný člen cez bránu prejde',
    (ako(c(2), 'SELECT public.hh_create()')) ? 'code', true);
END$$;

\echo '--- B3. Súhlas rodiča: tajný odkaz, bez prihlásenia, raz ---'
DO $$
DECLARE tok text; r jsonb; e text;
BEGIN
  SELECT consent_token INTO tok FROM public.member_safety WHERE user_id = c(1);
  r := ako(NULL, format('SELECT public.consent_info(%L)', tok));
  PERFORM chk('rodič bez účtu vidí, komu dáva súhlas (len prezývku)',
    r->>'username' IS NOT NULL AND (r->>'done')::boolean = false AND (SELECT count(*) FROM jsonb_object_keys(r)) = 2, true);
  PERFORM chk('zlý alebo krátky odkaz nič neprezradí',
    ako(NULL, format('SELECT public.consent_info(%L)', 'abc')) IS NULL
    AND ako(NULL, format('SELECT public.consent_info(%L)', repeat('0', 64))) IS NULL, true);
  PERFORM chk('anonym sa k tabuľkám bezpečnosti nedostane',
    ako_chyba(NULL, 'SELECT to_jsonb(count(*)) FROM public.member_safety') IS NOT NULL
    AND ako_chyba(NULL, 'SELECT to_jsonb(count(*)) FROM public.guardians') IS NOT NULL, true);

  r := ako(NULL, format('SELECT public.consent_confirm(%L, %L, true)', tok, 'Mama Cyrila'));
  PERFORM chk('súhlas sa zapíše a rodič dostane odkaz dôverníka',
    (SELECT consent_at IS NOT NULL FROM public.member_safety WHERE user_id = c(1))
    AND length(r->>'guardian_token') >= 32, true);
  e := ako_chyba(NULL, format('SELECT public.consent_confirm(%L, %L, true)', tok, 'niekto iný'));
  PERFORM chk('ten istý odkaz druhýkrát nefunguje', e LIKE '%už byl dán%', true);
  PERFORM chk('súhlas sám ešte nepustí dnu — čaká sa na správcu',
    (ako(c(1), 'SELECT to_jsonb(count(*)) FROM public.posts'))::int = 0, true);
  PERFORM chk('stav dieťaťa po súhlase: neprezradí už odkaz na súhlas',
    (ako(c(1), 'SELECT public.safety_status()'))->>'consent_token' IS NULL, true);
END$$;

\echo '--- B4. Schvaľuje len správca, a len po súhlase rodiča ---'
DO $$
DECLARE e text;
BEGIN
  PERFORM chk('dieťa zoznam čakajúcich nevidí',
    ako_chyba(c(2), 'SELECT public.admin_members()') LIKE '%správce%', true);
  PERFORM chk('dieťa nikoho neschváli',
    ako_chyba(c(2), format('SELECT to_jsonb(true) FROM public.admin_set_approval(%L::uuid, true)', c(1))) IS NOT NULL, true);
  PERFORM chk('správca vidí čakajúcich, s menom dospelého zo súhlasu',
    (SELECT m->>'consent_name' FROM jsonb_array_elements(ako(c(4), 'SELECT public.admin_members()')) m
      WHERE m->>'user_id' = c(1)::text) = 'Mama Cyrila', true);

  INSERT INTO auth.users (id, email) VALUES ('c0000000-0000-0000-0000-000000000009', 'bezsuhlasu@test.local');
  e := ako_chyba(c(4), format('SELECT to_jsonb(true) FROM public.admin_set_approval(%L::uuid, true)', 'c0000000-0000-0000-0000-000000000009'));
  PERFORM chk('bez súhlasu rodiča sa schváliť nedá', e LIKE '%souhlas%', true);

  PERFORM ako(c(4), format('SELECT to_jsonb(true) FROM public.admin_set_approval(%L::uuid, true)', c(1)));
  PERFORM chk('po schválení je Cyril plnohodnotný člen a vidí príspevky',
    (ako(c(1), 'SELECT to_jsonb(count(*)) FROM public.posts'))::int >= 1, true);
  PERFORM chk('schválenie je v bezpečnostnom denníku',
    EXISTS (SELECT 1 FROM public.safety_events WHERE kind = 'member_approved' AND target_id = c(1)), true);
END$$;

\echo '--- B5. Schválený účet bez súhlasu dospelého je zamknutý ---'
DO $$
DECLARE tok text;
BEGIN
  PERFORM chk('schválený bez súhlasu nevidí príspevky',
    (ako(c(5), 'SELECT to_jsonb(count(*)) FROM public.posts'))::int = 0, true);
  SELECT consent_token INTO tok FROM public.member_safety WHERE user_id = c(5);
  PERFORM ako(NULL, format('SELECT public.consent_confirm(%L, %L, false)', tok, 'Otec'));
  PERFORM chk('po súhlase rodiča je hneď dnu (schválenie už má)',
    (ako(c(5), 'SELECT to_jsonb(count(*)) FROM public.posts'))::int >= 1, true);
  PERFORM chk('bez dôverníka, keď ho rodič nechcel byť',
    (ako(c(5), 'SELECT public.safety_status()'))->'guardian' = 'null'::jsonb, true);
END$$;

\echo '--- B6. „Toto mi nie je príjemné" a dôverník ---'
DO $$
DECLARE gtok text; v jsonb; r jsonb;
BEGIN
  INSERT INTO public.friendships (requester_id, addressee_id, status) VALUES (c(1), c(3), 'accepted');
  SELECT token INTO gtok FROM public.guardians WHERE child_id = c(1) AND revoked_at IS NULL;

  r := ako(c(1), format('SELECT public.report_uncomfortable(%L::uuid)', c(3)));
  PERFORM chk('ťuknutie potichu zablokuje a zruší kamarátstvo',
    EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_id = c(1) AND blocked_id = c(3))
    AND NOT EXISTS (SELECT 1 FROM public.friendships WHERE requester_id = c(1) AND addressee_id = c(3))
    AND (r->>'guardian')::boolean, true);
  PERFORM chk('druhé dieťa nedostane žiadne oznámenie',
    NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = c(3) AND from_user_id = c(1)), true);

  v := ako(NULL, format('SELECT public.guardian_view(%L)', gtok));
  PERFORM chk('dôverník vidí signál', jsonb_array_length(v->'signals') = 1
    AND v->'signals'->0->>'kind' = 'uncomfortable', true);
  PERFORM chk('dôverník nevidí, kto to bol, ani nič iné',
    position(c(3)::text IN v::text) = 0
    AND position((SELECT username FROM public.profiles WHERE user_id = c(3)) IN v::text) = 0
    AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v) k) = ARRAY['label', 'signals', 'since', 'username'], true);
  PERFORM chk('cudzí odkaz dôverníka nič neukáže',
    ako(NULL, format('SELECT public.guardian_view(%L)', repeat('a', 64))) IS NULL, true);

  FOR i IN 1..15 LOOP
    PERFORM ako(c(1), format('SELECT public.report_uncomfortable(%L::uuid)', c(3)));
  END LOOP;
  PERFORM chk('najviac 10 signálov za deň (dôverníka to nezaplaví)',
    (SELECT count(*) FROM public.guardian_signals WHERE child_id = c(1)) = 10, true);
END$$;

\echo '--- B7. Nový dôverník nahradí starého ---'
DO $$
DECLARE stary text; inv text; r jsonb; e text;
BEGIN
  SELECT token INTO stary FROM public.guardians WHERE child_id = c(1) AND revoked_at IS NULL;
  inv := (ako(c(1), 'SELECT to_jsonb(public.guardian_invite_new())'))#>>'{}';
  PERFORM chk('pozvánka ukáže dospelému len prezývku',
    (ako(NULL, format('SELECT public.guardian_invite_info(%L)', inv))) ? 'username', true);
  r := ako(NULL, format('SELECT public.guardian_accept(%L, %L)', inv, 'tréner Juro'));
  PERFORM chk('nový dôverník dostane svoj odkaz, starý prestane fungovať',
    (ako(NULL, format('SELECT public.guardian_view(%L)', r->>'guardian_token')))->>'label' = 'tréner Juro'
    AND ako(NULL, format('SELECT public.guardian_view(%L)', stary)) IS NULL, true);
  e := ako_chyba(NULL, format('SELECT public.guardian_accept(%L, %L)', inv, 'niekto'));
  PERFORM chk('pozvánka sa dá použiť len raz', e LIKE '%platný%', true);
  PERFORM chk('nový dôverník nevidí staré signály spred svojho príchodu',
    jsonb_array_length((ako(NULL, format('SELECT public.guardian_view(%L)', r->>'guardian_token')))->'signals') = 0, true);
END$$;

\echo '--- B8. Kamaráti len naživo, cez kód ---'
DO $$
DECLARE k jsonb; e text;
BEGIN
  PERFORM chk('žiadosť o priateľstvo na diaľku už nejde',
    ako_chyba(c(2), format('INSERT INTO public.friendships (requester_id, addressee_id) VALUES (%L, %L) RETURNING ''1''::jsonb', c(2), c(5))) IS NOT NULL, true);

  k := ako(c(2), 'SELECT public.friend_code_new()');
  PERFORM chk('kód má 6 znakov a platí 3 minúty',
    length(k->>'code') = 6 AND (k->>'expires_at')::timestamptz <= now() + interval '3 minutes', true);
  e := (ako(c(2), format('SELECT public.friend_code_use(%L)', k->>'code')))->>'error';
  PERFORM chk('vlastný kód nefunguje', e LIKE '%vlastní kód%', true);

  PERFORM ako(c(5), format('SELECT public.friend_code_use(%L)', lower(k->>'code')));
  PERFORM chk('kamarát zadá kód a sú kamaráti (aj malými písmenami)',
    public.are_friends(c(2), c(5)), true);
  PERFORM chk('majiteľ kódu dostane oznámenie',
    EXISTS (SELECT 1 FROM public.notifications WHERE user_id = c(2) AND from_user_id = c(5) AND type = 'friend_accepted'), true);
  e := (ako(c(3), format('SELECT public.friend_code_use(%L)', k->>'code')))->>'error';
  PERFORM chk('kód sa dá použiť len raz', e LIKE '%neplatí%', true);

  k := ako(c(2), 'SELECT public.friend_code_new()');
  UPDATE public.friend_codes SET expires_at = now() - interval '1 second' WHERE code = k->>'code';
  e := (ako(c(3), format('SELECT public.friend_code_use(%L)', k->>'code')))->>'error';
  PERFORM chk('starý kód nefunguje', e LIKE '%neplatí%', true);

  k := ako(c(3), 'SELECT public.friend_code_new()');
  e := (ako(c(1), format('SELECT public.friend_code_use(%L)', k->>'code')))->>'error';
  PERFORM chk('zablokovaní sa kódom nespoja', e LIKE '%neplatí%' AND NOT public.are_friends(c(1), c(3)), true);

  FOR i IN 1..12 LOOP
    e := COALESCE(ako_chyba(c(5), 'SELECT public.friend_code_use(''ZZZZZZ'')'), 'bez výnimky');
  END LOOP;
  PERFORM chk('hádanie kódov zastaví limit', e LIKE '%Moc pokusů%', true);
END$$;

\echo '--- B10. Pozývací odkaz na diaľku ---'
DO $$
DECLARE inv jsonb; r jsonb; e text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES ('c0000000-0000-0000-0000-000000000007', 'daleko@test.local');
  PERFORM chk('nový bez vstupu pozvánku nevytvorí',
    ako_chyba('c0000000-0000-0000-0000-000000000007', 'SELECT public.friend_invite_new()') IS NOT NULL, true);

  inv := ako(c(3), 'SELECT public.friend_invite_new()');
  PERFORM chk('pozvánka je dlhý tajný odkaz na 7 dní',
    length(inv->>'token') >= 32 AND (inv->>'expires_at')::timestamptz > now() + interval '6 days', true);
  r := ako(NULL, format('SELECT public.friend_invite_info(%L)', inv->>'token'));
  PERFORM chk('bez prihlásenia ukáže len prezývku pozývajúceho',
    (r->>'valid')::boolean AND (SELECT count(*) FROM jsonb_object_keys(r)) = 2, true);

  r := ako('c0000000-0000-0000-0000-000000000007', format('SELECT public.friend_invite_use(%L)', inv->>'token'));
  PERFORM chk('nový z diaľky použije pozvánku: kamarátstvo vznikne, ale stále čaká na vstup',
    (r->>'pending')::boolean AND public.are_friends(c(3), 'c0000000-0000-0000-0000-000000000007')
    AND (ako('c0000000-0000-0000-0000-000000000007', 'SELECT to_jsonb(count(*)) FROM public.posts'))::int = 0, true);
  PERFORM chk('správca vidí, kto nového pozval',
    (SELECT m->>'invited_by' FROM jsonb_array_elements(ako(c(4), 'SELECT public.admin_members()')) m
      WHERE m->>'user_id' = 'c0000000-0000-0000-0000-000000000007')
    = (SELECT username FROM public.profiles WHERE user_id = c(3)), true);

  e := (ako(c(2), format('SELECT public.friend_invite_use(%L)', inv->>'token')))->>'error';
  PERFORM chk('pozvánka sa dá použiť len raz', e LIKE '%neplatí%', true);
  r := ako('c0000000-0000-0000-0000-000000000007', format('SELECT public.friend_invite_use(%L)', inv->>'token'));
  PERFORM chk('ten istý človek môže odkaz otvoriť znova bez chyby', r ? 'username' AND NOT r ? 'error', true);

  inv := ako(c(3), 'SELECT public.friend_invite_new()');
  e := (ako(c(3), format('SELECT public.friend_invite_use(%L)', inv->>'token')))->>'error';
  PERFORM chk('vlastnú pozvánku použiť nejde', e LIKE '%vlastní pozvánka%', true);
  e := (ako(c(1), format('SELECT public.friend_invite_use(%L)', inv->>'token')))->>'error';
  PERFORM chk('zablokovaný sa cez pozvánku nevráti', e LIKE '%neplatí%' AND NOT public.are_friends(c(1), c(3)), true);

  UPDATE public.friend_invites SET expires_at = now() - interval '1 second' WHERE token = inv->>'token';
  e := (ako(c(5), format('SELECT public.friend_invite_use(%L)', inv->>'token')))->>'error';
  PERFORM chk('stará pozvánka neplatí', e LIKE '%neplatí%', true);

  r := ako(c(5), format('SELECT public.friend_invite_use(%L)', (ako(c(2), 'SELECT public.friend_invite_new()'))->>'token'));
  PERFORM chk('člen z diaľky je hneď kamarát a pozývajúci dostane oznámenie',
    NOT (r->>'pending')::boolean AND public.are_friends(c(2), c(5))
    AND EXISTS (SELECT 1 FROM public.notifications WHERE user_id = c(2) AND from_user_id = c(5)), true);

  FOR i IN 1..6 LOOP
    e := ako_chyba(c(4), 'SELECT public.friend_invite_new()');
  END LOOP;
  PERFORM chk('najviac 5 nepoužitých pozvánok naraz', e LIKE '%5 nepoužitých%', true);
END$$;

\echo '--- B9. Noc 22:00–6:30 ---'
DO $$
DECLARE e text; r jsonb;
BEGIN
  -- 01 nočný režim pre ostatné testy vypol; tu vrátime skutočný.
  CREATE OR REPLACE FUNCTION public.is_night(_at timestamptz DEFAULT now())
  RETURNS boolean LANGUAGE sql STABLE AS $f$
    SELECT (_at AT TIME ZONE 'Europe/Prague')::time >= time '22:00'
        OR (_at AT TIME ZONE 'Europe/Prague')::time < time '06:30';
  $f$;
  PERFORM chk('22:00, 23:59, 3:00 a 6:29 v Prahe je noc',
    public.is_night('2026-10-01 22:00 Europe/Prague') AND public.is_night('2026-10-01 23:59 Europe/Prague')
    AND public.is_night('2026-10-02 03:00 Europe/Prague') AND public.is_night('2026-10-02 06:29 Europe/Prague'), true);
  PERFORM chk('21:59, 6:30 a poludnie nie je noc (aj v zime)',
    NOT public.is_night('2026-10-01 21:59 Europe/Prague') AND NOT public.is_night('2026-10-02 06:30 Europe/Prague')
    AND NOT public.is_night('2026-12-15 12:00 Europe/Prague'), true);

  -- Simulovaná noc.
  CREATE OR REPLACE FUNCTION public.is_night(_at timestamptz DEFAULT now())
  RETURNS boolean LANGUAGE sql STABLE AS $f$ SELECT true $f$;
  e := ako_chyba(c(2), format('INSERT INTO public.posts (user_id, content) VALUES (%L, ''v noci'') RETURNING ''1''::jsonb', c(2)));
  PERFORM chk('v noci sa nedá písať príspevok', e IS NOT NULL, true);
  e := ako_chyba(c(2), format('SELECT to_jsonb(public.start_conversation(%L::uuid, ''ahoj''))', c(3)));
  PERFORM chk('v noci sa nedá začať konverzáciu', e LIKE '%spí%', true);
  PERFORM chk('stav dieťaťa hlási noc', (ako(c(2), 'SELECT public.safety_status()'))->>'night' = 'true', true);
  r := ako(c(2), format('SELECT public.report_uncomfortable(%L::uuid)', c(5)));
  PERFORM chk('„Toto mi nie je príjemné" funguje aj v noci', r ? 'guardian', true);

  -- Pre prípadné ďalšie testy zase deň.
  CREATE OR REPLACE FUNCTION public.is_night(_at timestamptz DEFAULT now())
  RETURNS boolean LANGUAGE sql STABLE AS $f$ SELECT false $f$;
END$$;

\echo ''
\echo 'Bezpečnosť detí: všetko OK'

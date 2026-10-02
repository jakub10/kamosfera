-- ============================================================================
-- Bezpečnosť detí — vrstva 1 a 3 z „Kamosféra — Child Safety Concept".
--
--   * Noví: dnu len so súhlasom dospelého a schválením admina (rola creator).
--     Kým to nie je, nový účet nevidí nikoho a nikto nevidí jeho.
--   * Súčasní členovia (deti aj rodičia, babky…) ostávajú, ako sú — žiadny
--     súhlas ani zamknutie. V appke len raz uvidia, čo je nové.
--   * Pozývací odkaz pre kamaráta na diaľku (iné mesto, ČR/SR): platí 7 dní
--     a raz. Novému pomôže dostať sa dnu, správca vidí, kto ho pozval.
--   * Dôverník: dospelý, ktorého si dieťa vyberie. Nevidí správy, kamarátov
--     ani profily — len signál, že sa niečo deje.
--   * „Toto mi nie je príjemné": jedno ťuknutie potichu zablokuje a dá
--     signál dôverníkovi.
--   * Kamaráti len naživo: krátky kód (alebo QR), ktorý platí 3 minúty.
--   * Noc 22:00–6:30 (Praha/Bratislava): Kamosféra spí, nedá sa písať.
--
-- Dospelí (rodič, dôverník) nemajú účet. Dostanú tajný odkaz; kto ho má,
-- vidí len to málo, čo je preň určené.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Tabuľky
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.member_safety (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  approved_by uuid,
  consent_token text NOT NULL UNIQUE
    DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  consent_at timestamptz,
  consent_name text CHECK (consent_name IS NULL OR length(consent_name) <= 60),
  guardian_invite text UNIQUE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  onboarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE
    DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  label text NOT NULL DEFAULT 'dôverník' CHECK (length(label) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS guardians_child_idx ON public.guardians (child_id) WHERE revoked_at IS NULL;

-- Signál pre dôverníka: len čo a kedy. Žiadne mená, žiadny obsah.
CREATE TABLE IF NOT EXISTS public.guardian_signals (
  id bigserial PRIMARY KEY,
  child_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('uncomfortable')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guardian_signals_child_idx ON public.guardian_signals (child_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.friend_codes (
  code text PRIMARY KEY CHECK (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS friend_codes_user_idx ON public.friend_codes (user_id);

-- Pozývací odkaz na diaľku: dlhý, tajný, 7 dní, jedno použitie.
CREATE TABLE IF NOT EXISTS public.friend_invites (
  token text PRIMARY KEY
    DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS friend_invites_inviter_idx ON public.friend_invites (inviter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.friend_code_attempts (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS friend_code_attempts_idx ON public.friend_code_attempts (user_id, created_at DESC);

ALTER TABLE public.member_safety ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_code_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_safety, public.guardians, public.guardian_signals,
              public.friend_codes, public.friend_code_attempts, public.friend_invites FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.guardian_signals_id_seq, public.friend_code_attempts_id_seq FROM anon, authenticated;

-- Bezpečnostný denník (vidí len creator) dostane nové druhy udalostí.
ALTER TABLE public.safety_events DROP CONSTRAINT IF EXISTS safety_events_kind_check;
ALTER TABLE public.safety_events ADD CONSTRAINT safety_events_kind_check CHECK (kind = ANY (ARRAY[
  'request_sent', 'request_accepted', 'request_ignored', 'user_blocked', 'user_unblocked',
  'request_rate_limited', 'uncomfortable', 'member_approved', 'member_rejected',
  'parent_consent', 'guardian_added', 'friend_code_used', 'friend_invite_used'
]));

-- Súčasní členovia ostávajú plnohodnotní. Sú medzi nimi aj rodičia a starí
-- rodičia, takže súhlas „rodiča" by nemal kto podpísať — a ani netreba,
-- všetkých poznáme. Sprievodca im ukáže len to, čo je nové.
INSERT INTO public.member_safety (user_id, approved, approved_at, consent_at, consent_name)
SELECT p.user_id, true, now(), now(), 'pôvodný člen' FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

-- Každý nový účet začína ako „čaká".
CREATE OR REPLACE FUNCTION public.member_safety_on_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.member_safety (user_id) VALUES (NEW.user_id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS on_profile_created_member_safety ON public.profiles;
CREATE TRIGGER on_profile_created_member_safety
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.member_safety_on_profile();

-- --------------------------------------------------------------------------
-- Brána a noc
-- --------------------------------------------------------------------------

-- Plnohodnotný člen = schválený adminom a dospelý dal súhlas.
CREATE OR REPLACE FUNCTION public.member_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.member_safety
     WHERE user_id = auth.uid() AND approved AND consent_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.require_member()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.member_ok() THEN
    RAISE EXCEPTION 'Najprv treba dokončiť vstup do Kamosféry (súhlas rodiča a schválenie).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;

-- Noc podľa času v Prahe a Bratislave (rovnaké pásmo, aj letný čas).
CREATE OR REPLACE FUNCTION public.is_night(_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (_at AT TIME ZONE 'Europe/Prague')::time >= time '22:00'
      OR (_at AT TIME ZONE 'Europe/Prague')::time < time '06:30';
$$;

CREATE OR REPLACE FUNCTION public.require_awake()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF public.is_night() THEN
    RAISE EXCEPTION 'Kamosféra spí (22:00–6:30). Napíš ráno! 😴' USING ERRCODE = 'check_violation';
  END IF;
END
$$;

-- Reštriktívna politika sa pripočíta (AND) ku všetkým existujúcim. Kto nie je
-- plnohodnotný člen, nevidí a nezapíše nič — okrem vlastného profilu a rolí.
DO $gate$
DECLARE
  t record;
  own text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
       AND c.relname NOT IN ('member_safety', 'guardians', 'guardian_signals', 'friend_codes',
                             'friend_code_attempts', 'friend_invites', 'safety_events')
  LOOP
    own := CASE WHEN t.relname IN ('profiles', 'user_roles') THEN ' OR user_id = auth.uid()' ELSE '' END;
    EXECUTE format('DROP POLICY IF EXISTS "Len plnohodnotní členovia" ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY "Len plnohodnotní členovia" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.member_ok())%s) WITH CHECK ((SELECT public.member_ok())%s)',
      t.relname, own, own);
  END LOOP;
END
$gate$;

-- V noci sa nepíše: príspevky, komentáre, správy, skupiny, príbehy.
DO $night$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['posts', 'comments', 'messages', 'group_messages', 'stories'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "Kamosféra v noci spí" ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY "Kamosféra v noci spí" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated '
        'WITH CHECK (NOT (SELECT public.is_night()))', t);
    END IF;
  END LOOP;
END
$night$;

-- Funkcie, ktoré obchádzajú tabuľkové pravidlá (SECURITY DEFINER), dostanú
-- bránu ako obal: pôvodná sa premenuje na <meno>__ungated a nová ju zavolá
-- až po kontrole. Ak by neskoršia migrácia funkciu prepísala, test
-- 07_child_safety.sql to odhalí.
DO $wrap$
DECLARE
  f record;
  args text;
  body text;
  night_fns text[] := ARRAY['start_conversation', 'respond_to_conversation_request'];
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, p.pronargs, p.proretset, p.prorettype,
           pg_get_function_identity_arguments(p.oid) AS ia,
           pg_get_function_arguments(p.oid) AS fa,
           pg_get_function_result(p.oid) AS res
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'start_conversation', 'respond_to_conversation_request',
         'fortress_browse', 'fortress_leaderboard', 'fortress_profile',
         'hh_create', 'hh_join', 'hh_invite', 'hh_view', 'hh_act', 'hh_my_rooms',
         'hh_start', 'hh_tick', 'hh_rematch', 'hh_leave',
         'world_seed', 'kindness_given', 'post_reactions', 'submit_game_score',
         'purchase_vip_item', 'create_realtime_ws_ticket')
       AND NOT EXISTS (SELECT 1 FROM pg_proc q WHERE q.pronamespace = n.oid AND q.proname = p.proname || '__ungated')
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', f.proname, f.ia, f.proname || '__ungated');
    SELECT COALESCE(string_agg('$' || i, ', ' ORDER BY i), '') INTO args FROM generate_series(1, f.pronargs) i;
    body := 'SELECT public.require_member(); '
         || CASE WHEN f.proname = ANY (night_fns) THEN 'SELECT public.require_awake(); ' ELSE '' END
         || CASE WHEN f.proretset THEN format('SELECT * FROM public.%I(%s);', f.proname || '__ungated', args)
                 ELSE format('SELECT public.%I(%s);', f.proname || '__ungated', args) END;
    EXECUTE format(
      'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS %L',
      f.proname, f.fa, f.res, body);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', f.proname || '__ungated', f.ia);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', f.proname, f.ia);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', f.proname, f.ia);
  END LOOP;
END
$wrap$;

-- Žiadosti o priateľstvo na diaľku končia. Kamaráti vznikajú len naživo,
-- cez kód (friend_code_use). Staré čakajúce žiadosti sa dajú ešte prijať.
REVOKE INSERT ON public.friendships FROM authenticated;

-- --------------------------------------------------------------------------
-- Dieťa
-- --------------------------------------------------------------------------

-- Kde v sprievodcovi som. Vidím len svoje.
CREATE OR REPLACE FUNCTION public.safety_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  m public.member_safety;
  g public.guardians;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Najprv sa prihlás.' USING ERRCODE = 'insufficient_privilege';
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
$$;

CREATE OR REPLACE FUNCTION public.onboarding_done()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.member_safety SET onboarded_at = COALESCE(onboarded_at, now())
   WHERE user_id = auth.uid() AND consent_at IS NOT NULL;
END
$$;

-- Nový odkaz pre dôverníka (QR, ktorý dieťa ukáže dospelému).
CREATE OR REPLACE FUNCTION public.guardian_invite_new()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Najprv sa prihlás.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.member_safety SET guardian_invite = t WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Účet nie je pripravený.';
  END IF;
  RETURN t;
END
$$;

-- „Toto mi nie je príjemné": potichu zablokovať a dať signál dôverníkovi.
-- Funguje aj v noci a aj počas sprievodcu — pomoc sa nezamyká.
CREATE OR REPLACE FUNCTION public.report_uncomfortable(_other uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  has_guardian boolean;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Najprv sa prihlás.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _other IS NULL OR _other = me THEN
    RAISE EXCEPTION 'Neplatný používateľ.';
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
$$;

-- Kamaráti naživo: môj kód platí 3 minúty a len raz.
CREATE OR REPLACE FUNCTION public.friend_code_new()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  exp timestamptz := now() + interval '3 minutes';
BEGIN
  PERFORM public.require_member();
  DELETE FROM public.friend_codes WHERE user_id = me OR expires_at < now();
  LOOP
    c := '';
    FOR i IN 1..6 LOOP
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.friend_codes WHERE code = c);
  END LOOP;
  INSERT INTO public.friend_codes (code, user_id, expires_at) VALUES (c, me, exp);
  RETURN jsonb_build_object('code', c, 'expires_at', exp);
END
$$;

CREATE OR REPLACE FUNCTION public.friend_code_use(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  fc public.friend_codes;
  other_name text;
BEGIN
  PERFORM public.require_member();
  -- Hádanie kódov: najviac 10 pokusov za 10 minút.
  IF (SELECT count(*) FROM public.friend_code_attempts
       WHERE user_id = me AND created_at > now() - interval '10 minutes') >= 10 THEN
    RAISE EXCEPTION 'Priveľa pokusov. Skús to o chvíľu.';
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
    RETURN jsonb_build_object('error', 'Tento kód neplatí. Popros kamaráta o nový.');
  END IF;
  IF fc.user_id = me THEN
    RETURN jsonb_build_object('error', 'To je tvoj vlastný kód. 🙂');
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
$$;

-- Pozývací odkaz na diaľku. Kamarát, ktorý býva ďaleko, sa cez neho stane
-- kamarátom — a ak v Kamosfére ešte nie je, správca uvidí, kto ho pozval.
CREATE OR REPLACE FUNCTION public.friend_invite_new()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  inv public.friend_invites;
BEGIN
  PERFORM public.require_member();
  IF (SELECT count(*) FROM public.friend_invites
       WHERE inviter_id = me AND used_at IS NULL AND expires_at > now()) >= 5 THEN
    RAISE EXCEPTION 'Máš 5 nepoužitých pozvánok. Počkaj, kým ich kamaráti použijú (alebo vyprší týždeň).';
  END IF;
  INSERT INTO public.friend_invites (inviter_id) VALUES (me) RETURNING * INTO inv;
  RETURN jsonb_build_object('token', inv.token, 'expires_at', inv.expires_at);
END
$$;

-- Čo ukáže odkaz, kým sa človek neprihlási: len prezývku toho, kto pozýva.
CREATE OR REPLACE FUNCTION public.friend_invite_info(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('inviter', p.username, 'valid', i.used_at IS NULL AND i.expires_at > now())
    FROM public.friend_invites i JOIN public.profiles p ON p.user_id = i.inviter_id
   WHERE i.token = _token AND length(_token) >= 32;
$$;

-- Použiť pozvánku. Smie aj nový účet, ktorý ešte čaká na vstup — preto bez
-- brány; kamarátstvo vznikne hneď, ale uvidí ho až po schválení.
CREATE OR REPLACE FUNCTION public.friend_invite_use(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  inv public.friend_invites;
  name text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Najprv sa prihlás.' USING ERRCODE = 'insufficient_privilege';
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
    RETURN jsonb_build_object('error', 'Táto pozvánka už neplatí. Popros kamaráta o novú.');
  END IF;
  IF inv.inviter_id = me THEN
    RETURN jsonb_build_object('error', 'To je tvoja vlastná pozvánka. 🙂 Pošli ju kamarátovi.');
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
$$;

-- --------------------------------------------------------------------------
-- Dospelí bez účtu: súhlas rodiča a dôverník (tajný odkaz)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consent_info(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('username', p.username, 'done', m.consent_at IS NOT NULL)
    FROM public.member_safety m JOIN public.profiles p ON p.user_id = m.user_id
   WHERE m.consent_token = _token AND length(_token) >= 32;
$$;

-- Dospelý potvrdí súhlas. Ak chce, stane sa zároveň dôverníkom a dostane
-- svoj tajný odkaz na signály.
CREATE OR REPLACE FUNCTION public.consent_confirm(_token text, _name text, _guardian boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.member_safety;
  g text;
BEGIN
  IF _token IS NULL OR length(_token) < 32 THEN
    RAISE EXCEPTION 'Odkaz nie je platný.';
  END IF;
  SELECT * INTO m FROM public.member_safety WHERE consent_token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Odkaz nie je platný.';
  END IF;
  IF m.consent_at IS NOT NULL THEN
    RAISE EXCEPTION 'Súhlas už bol daný. Ďakujeme!';
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
$$;

CREATE OR REPLACE FUNCTION public.guardian_invite_info(_invite text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('username', p.username)
    FROM public.member_safety m JOIN public.profiles p ON p.user_id = m.user_id
   WHERE m.guardian_invite = _invite AND length(_invite) >= 32;
$$;

CREATE OR REPLACE FUNCTION public.guardian_accept(_invite text, _label text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  child uuid;
  g text;
BEGIN
  IF _invite IS NULL OR length(_invite) < 32 THEN
    RAISE EXCEPTION 'Odkaz nie je platný.';
  END IF;
  UPDATE public.member_safety SET guardian_invite = NULL
   WHERE guardian_invite = _invite
   RETURNING user_id INTO child;
  IF child IS NULL THEN
    RAISE EXCEPTION 'Odkaz nie je platný alebo už bol použitý.';
  END IF;
  -- Dieťa má jedného dôverníka; nový nahradí predošlého.
  UPDATE public.guardians SET revoked_at = now() WHERE child_id = child AND revoked_at IS NULL;
  INSERT INTO public.guardians (child_id, label)
  VALUES (child, COALESCE(NULLIF(left(btrim(COALESCE(_label, '')), 40), ''), 'dôverník'))
  RETURNING token INTO g;
  INSERT INTO public.safety_events (kind, actor_id) VALUES ('guardian_added', child);
  RETURN jsonb_build_object('guardian_token', g);
END
$$;

-- Stránka dôverníka: prezývka dieťaťa a signály. Nič viac.
CREATE OR REPLACE FUNCTION public.guardian_view(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'username', p.username,
    'label', g.label,
    'since', g.created_at,
    'signals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kind', s.kind, 'at', s.created_at) ORDER BY s.created_at DESC)
        FROM (SELECT * FROM public.guardian_signals
               WHERE child_id = g.child_id AND created_at >= g.created_at
               ORDER BY created_at DESC LIMIT 50) s
    ), '[]'::jsonb)
  )
    FROM public.guardians g JOIN public.profiles p ON p.user_id = g.child_id
   WHERE g.token = _token AND g.revoked_at IS NULL AND length(_token) >= 32;
$$;

CREATE OR REPLACE FUNCTION public.guardian_leave(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.guardians SET revoked_at = now()
   WHERE token = _token AND revoked_at IS NULL AND length(_token) >= 32;
$$;

-- --------------------------------------------------------------------------
-- Admin (rola creator): kto čaká na vstup
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_members()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'creator') THEN
    RAISE EXCEPTION 'Len pre správcu.' USING ERRCODE = 'insufficient_privilege';
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
$$;

CREATE OR REPLACE FUNCTION public.admin_set_approval(_user uuid, _approved boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.member_safety;
BEGIN
  IF NOT public.has_role(auth.uid(), 'creator') THEN
    RAISE EXCEPTION 'Len pre správcu.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO m FROM public.member_safety WHERE user_id = _user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Taký účet nepoznám.';
  END IF;
  IF _approved AND m.consent_at IS NULL THEN
    RAISE EXCEPTION 'Najprv musí dospelý potvrdiť súhlas.';
  END IF;
  UPDATE public.member_safety
     SET approved = _approved,
         approved_at = CASE WHEN _approved THEN now() END,
         approved_by = CASE WHEN _approved THEN auth.uid() END
   WHERE user_id = _user;
  INSERT INTO public.safety_events (kind, actor_id, target_id)
  VALUES (CASE WHEN _approved THEN 'member_approved' ELSE 'member_rejected' END, auth.uid(), _user);
END
$$;

-- --------------------------------------------------------------------------
-- Práva
-- --------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.member_safety_on_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_member() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_ok(), public.require_member() TO authenticated;
REVOKE ALL ON FUNCTION public.require_awake(), public.is_night(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_awake(), public.is_night(timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.safety_status(), public.onboarding_done(), public.guardian_invite_new(),
  public.report_uncomfortable(uuid), public.friend_code_new(), public.friend_code_use(text),
  public.friend_invite_new(), public.friend_invite_use(text),
  public.admin_members(), public.admin_set_approval(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safety_status(), public.onboarding_done(), public.guardian_invite_new(),
  public.report_uncomfortable(uuid), public.friend_code_new(), public.friend_code_use(text),
  public.friend_invite_new(), public.friend_invite_use(text),
  public.admin_members(), public.admin_set_approval(uuid, boolean)
  TO authenticated;

-- Stránky pre dospelých fungujú bez prihlásenia; chráni ich len dlhý tajný odkaz.
REVOKE ALL ON FUNCTION public.consent_info(text), public.consent_confirm(text, text, boolean),
  public.guardian_invite_info(text), public.guardian_accept(text, text),
  public.guardian_view(text), public.guardian_leave(text), public.friend_invite_info(text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consent_info(text), public.consent_confirm(text, text, boolean),
  public.guardian_invite_info(text), public.guardian_accept(text, text),
  public.guardian_view(text), public.guardian_leave(text), public.friend_invite_info(text)
  TO anon, authenticated;

-- ============================================================================
-- AI strážca správ (System One od Liquid AI, model d1:free).
--
-- Každá súkromná správa sa pred odoslaním ukáže strážcovi — serverovej
-- funkcii `message-guard`. Tá pošle do Liquid AI len text (novú správu a pár
-- predošlých, bez mien a ID) a dostane späť pravdepodobnosti:
--   * závažnosť < 0.8       → poslať
--   * závažnosť 0.8 – 1.8   → „Naozaj to chceš poslať?"
--   * závažnosť ≥ 1.8       → nedoručiť a dať signál dôverníkovi príjemcu
--   * osobné údaje > 0.7    → „Naozaj chceš zdieľať tieto údaje?"
--   * tlak na tajomstvo > 0.5 → vždy signál dôverníkovi príjemcu
--
-- Strážca vydá „lístok" (message_checks). Keď je strážca zapnutý, databáza
-- pustí správu len s lístkom — obísť ho cez prehliadač nejde. Zapína ho
-- správca na stránke Členovia, až keď je funkcia nahraná a kľúč nastavený;
-- dovtedy správy chodia ako doteraz.
--
-- Ukladá sa len odtlačok textu (md5) a čísla od strážcu, nie text správy.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM anon, authenticated;
INSERT INTO public.app_settings (key, value) VALUES ('message_guard', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.message_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  content_md5 text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('send', 'confirm', 'hide', 'unchecked')),
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_checks_lookup_idx
  ON public.message_checks (sender_id, conversation_id, content_md5, created_at DESC);
ALTER TABLE public.message_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_checks FROM anon, authenticated;

-- Nové druhy signálov pre dôverníka a udalostí v bezpečnostnom denníku.
ALTER TABLE public.guardian_signals DROP CONSTRAINT IF EXISTS guardian_signals_kind_check;
ALTER TABLE public.guardian_signals ADD CONSTRAINT guardian_signals_kind_check
  CHECK (kind IN ('uncomfortable', 'ai_harmful', 'ai_secret'));

ALTER TABLE public.safety_events DROP CONSTRAINT IF EXISTS safety_events_kind_check;
ALTER TABLE public.safety_events ADD CONSTRAINT safety_events_kind_check CHECK (kind = ANY (ARRAY[
  'request_sent', 'request_accepted', 'request_ignored', 'user_blocked', 'user_unblocked',
  'request_rate_limited', 'uncomfortable', 'member_approved', 'member_rejected',
  'parent_consent', 'guardian_added', 'friend_code_used', 'friend_invite_used',
  'ai_hidden', 'ai_secret', 'guard_switched'
]));

CREATE OR REPLACE FUNCTION public.message_guard_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT value = 'true'::jsonb FROM public.app_settings WHERE key = 'message_guard'), false);
$$;

-- Má odosielateľ čerstvý lístok od strážcu presne na tento text?
CREATE OR REPLACE FUNCTION public.message_check_ok(_conversation uuid, _content text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.message_checks
     WHERE sender_id = auth.uid()
       AND conversation_id = _conversation
       AND content_md5 = md5(_content)
       AND verdict IN ('send', 'confirm', 'unchecked')
       AND created_at > now() - interval '5 minutes'
  );
$$;

DROP POLICY IF EXISTS "Správu najprv uvidí strážca" ON public.messages;
CREATE POLICY "Správu najprv uvidí strážca" ON public.messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.message_guard_enabled() OR public.message_check_ok(conversation_id, content));

-- --------------------------------------------------------------------------
-- Pre serverovú funkciu message-guard (len service_role)
-- --------------------------------------------------------------------------

-- Kontext pre strážcu: je odosielateľ v konverzácii, kto je príjemca, sú
-- kamaráti a čo si naposledy písali (len text, bez mien).
CREATE OR REPLACE FUNCTION public.guard_prepare(_sender uuid, _conversation uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.conversations;
  other uuid;
BEGIN
  SELECT * INTO c FROM public.conversations WHERE id = _conversation;
  IF NOT FOUND OR _sender NOT IN (c.participant_1, c.participant_2) THEN
    RETURN jsonb_build_object('error', 'V tejto konverzácii nie si.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.member_safety
                  WHERE user_id = _sender AND approved AND consent_at IS NOT NULL) THEN
    RETURN jsonb_build_object('error', 'Najprv treba dokončiť vstup do Kamosféry.');
  END IF;
  IF (SELECT count(*) FROM public.message_checks
       WHERE sender_id = _sender AND created_at > now() - interval '1 minute') >= 30 THEN
    RETURN jsonb_build_object('error', 'Píšeš priveľmi rýchlo. Chvíľku počkaj.');
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
$$;

-- Zápis verdiktu. Pri skrytej správe alebo tlaku na tajomstvo dostane signál
-- dôverník PRÍJEMCU (to je dieťa, ktoré môže byť v ohrození).
CREATE OR REPLACE FUNCTION public.guard_record(
  _sender uuid, _conversation uuid, _content text, _verdict text, _scores jsonb, _secret boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  id uuid;
  other uuid;
BEGIN
  INSERT INTO public.message_checks (sender_id, conversation_id, content_md5, verdict, scores)
  VALUES (_sender, _conversation, md5(_content), _verdict, COALESCE(_scores, '{}'::jsonb))
  RETURNING message_checks.id INTO id;

  SELECT CASE WHEN participant_1 = _sender THEN participant_2 ELSE participant_1 END
    INTO other FROM public.conversations WHERE conversations.id = _conversation;

  IF _verdict = 'hide' AND other IS NOT NULL THEN
    INSERT INTO public.safety_events (kind, actor_id, target_id) VALUES ('ai_hidden', _sender, other);
    INSERT INTO public.guardian_signals (child_id, kind) VALUES (other, 'ai_harmful');
  END IF;
  IF _secret AND other IS NOT NULL THEN
    INSERT INTO public.safety_events (kind, actor_id, target_id) VALUES ('ai_secret', _sender, other);
    INSERT INTO public.guardian_signals (child_id, kind) VALUES (other, 'ai_secret');
  END IF;
  RETURN id;
END
$$;

-- --------------------------------------------------------------------------
-- Správca: zapnúť/vypnúť strážcu a pozrieť sa, čo robí
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_guard_status()
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
  RETURN jsonb_build_object(
    'enabled', public.message_guard_enabled(),
    'checked_24h', (SELECT count(*) FROM public.message_checks WHERE created_at > now() - interval '1 day'),
    'confirm_24h', (SELECT count(*) FROM public.message_checks WHERE verdict = 'confirm' AND created_at > now() - interval '1 day'),
    'hidden_24h', (SELECT count(*) FROM public.message_checks WHERE verdict = 'hide' AND created_at > now() - interval '1 day'),
    'unchecked_24h', (SELECT count(*) FROM public.message_checks WHERE verdict = 'unchecked' AND created_at > now() - interval '1 day'),
    'last_check', (SELECT max(created_at) FROM public.message_checks)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.admin_set_message_guard(_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'creator') THEN
    RAISE EXCEPTION 'Len pre správcu.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.app_settings (key, value, updated_at) VALUES ('message_guard', to_jsonb(_enabled), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO public.safety_events (kind, actor_id) VALUES ('guard_switched', auth.uid());
END
$$;

-- Práva
REVOKE ALL ON FUNCTION public.message_guard_enabled(), public.message_check_ok(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_guard_enabled(), public.message_check_ok(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_prepare(uuid, uuid), public.guard_record(uuid, uuid, text, text, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_prepare(uuid, uuid), public.guard_record(uuid, uuid, text, text, jsonb, boolean)
  TO service_role;
REVOKE ALL ON FUNCTION public.admin_guard_status(), public.admin_set_message_guard(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_guard_status(), public.admin_set_message_guard(boolean) TO authenticated;

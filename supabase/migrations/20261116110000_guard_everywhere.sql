-- ============================================================================
-- AI strážce i tam, kde dosud chyběl (bezpečnostní čtení 16. 11. 2026).
--
--   * PRVNÍ ZPRÁVA CIZÍMU (žádost o konverzaci) šla mimo strážce, přestože je
--     to nejrizikovější kontakt. Teď ji `start_conversation` bez lístku od
--     strážce nepustí.
--   * ZPRÁVY VE SKUPINÁCH strážce neviděl vůbec. Teď platí totéž co
--     u soukromých zpráv.
--
-- Lístek (message_checks) se pozná podle odesílatele, textu a „místa":
-- u soukromé zprávy je to konverzace, u skupiny skupina, u první zprávy ten,
-- komu se píše. Sloupec conversation_id proto nese kterékoli z těch tří ID.
--
-- Všechno platí jen při zapnutém strážci (Členové → AI strážce zpráv).
--
-- POŘADÍ NASAZENÍ: nejdřív nahrát novou funkci `message-guard`, až potom
-- pustit tenhle soubor. Obráceně by při zapnutém strážci nešlo psát do skupin.
-- ============================================================================

-- Je „dnes už dost" — společný limit pro všechny druhy kontrol.
CREATE OR REPLACE FUNCTION public.guard_sender_problem(_sender uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.member_safety
                  WHERE user_id = _sender AND approved AND consent_at IS NOT NULL) THEN
    RETURN 'Nejdřív je potřeba dokončit vstup do Kamosféry.';
  END IF;
  IF (SELECT count(*) FROM public.message_checks
       WHERE sender_id = _sender AND created_at > now() - interval '1 minute') >= 30 THEN
    RETURN 'Píšeš moc rychle. Chvilku počkej.';
  END IF;
  RETURN NULL;
END
$$;

-- Kontext pro strážce: zpráva do skupiny.
CREATE OR REPLACE FUNCTION public.guard_prepare_group(_sender uuid, _group uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  problem text;
BEGIN
  IF NOT public.is_group_member(_sender, _group) THEN
    RETURN jsonb_build_object('error', 'V téhle skupině nejsi.');
  END IF;
  problem := public.guard_sender_problem(_sender);
  IF problem IS NOT NULL THEN
    RETURN jsonb_build_object('error', problem);
  END IF;
  RETURN jsonb_build_object(
    'relation', 'skupina',
    'previous', COALESCE((
      SELECT jsonb_agg(m.content ORDER BY m.created_at)
        FROM (SELECT content, created_at FROM public.group_messages
               WHERE group_id = _group
               ORDER BY created_at DESC LIMIT 3) m
    ), '[]'::jsonb)
  );
END
$$;

-- Kontext pro strážce: první zpráva někomu, s kým ještě konverzace není.
CREATE OR REPLACE FUNCTION public.guard_prepare_intro(_sender uuid, _target uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  problem text;
BEGIN
  IF _target IS NULL OR _target = _sender
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _target)
     OR public.is_blocked_between(_sender, _target) THEN
    RETURN jsonb_build_object('error', 'Tomuhle uživateli teď nejde napsat.');
  END IF;
  problem := public.guard_sender_problem(_sender);
  IF problem IS NOT NULL THEN
    RETURN jsonb_build_object('error', problem);
  END IF;
  RETURN jsonb_build_object(
    'relation', CASE WHEN public.are_friends(_sender, _target) THEN 'overeny_kamarad' ELSE 'neni_kamarad' END,
    'previous', '[]'::jsonb
  );
END
$$;

-- Zápis verdiktu pro skupinu (_kind = 'group') nebo první zprávu ('intro').
-- U první zprávy dostane signál důvěrník toho, komu se píše. Ve skupině
-- není jeden příjemce, takže se událost zapíše jen do bezpečnostního deníku.
CREATE OR REPLACE FUNCTION public.guard_record_scope(
  _sender uuid, _scope uuid, _kind text, _content text, _verdict text, _scores jsonb, _secret boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  id uuid;
  other uuid := CASE WHEN _kind = 'intro' THEN _scope END;
BEGIN
  IF _kind NOT IN ('group', 'intro') THEN
    RAISE EXCEPTION 'Neznámý druh kontroly.';
  END IF;

  INSERT INTO public.message_checks (sender_id, conversation_id, content_md5, verdict, scores)
  VALUES (_sender, _scope, md5(_content), _verdict, COALESCE(_scores, '{}'::jsonb) || jsonb_build_object('kde', _kind))
  RETURNING message_checks.id INTO id;

  IF _verdict = 'hide' THEN
    INSERT INTO public.safety_events (kind, actor_id, target_id) VALUES ('ai_hidden', _sender, other);
    IF other IS NOT NULL THEN
      INSERT INTO public.guardian_signals (child_id, kind) VALUES (other, 'ai_harmful');
    END IF;
  END IF;
  IF _secret THEN
    INSERT INTO public.safety_events (kind, actor_id, target_id) VALUES ('ai_secret', _sender, other);
    IF other IS NOT NULL THEN
      INSERT INTO public.guardian_signals (child_id, kind) VALUES (other, 'ai_secret');
    END IF;
  END IF;
  RETURN id;
END
$$;

REVOKE ALL ON FUNCTION public.guard_sender_problem(uuid), public.guard_prepare_group(uuid, uuid),
  public.guard_prepare_intro(uuid, uuid),
  public.guard_record_scope(uuid, uuid, text, text, text, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_prepare_group(uuid, uuid), public.guard_prepare_intro(uuid, uuid),
  public.guard_record_scope(uuid, uuid, text, text, text, jsonb, boolean)
  TO service_role;

-- Skupiny: bez lístku od strážce zpráva neprojde (když je strážce zapnutý).
DROP POLICY IF EXISTS "Správu najprv uvidí strážca" ON public.group_messages;
CREATE POLICY "Správu najprv uvidí strážca" ON public.group_messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.message_guard_enabled() OR public.message_check_ok(group_id, content));

-- První zpráva cizímu: brána před start_conversation dostane i kontrolu lístku.
-- Kamarádi a už existující konverzace jdou jako dřív (tam se posílají běžné
-- zprávy, které strážce hlídá sám).
CREATE OR REPLACE FUNCTION public.start_conversation(_target_user_id uuid, _intro text DEFAULT NULL)
RETURNS TABLE(conversation_id uuid, status text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  intro text := btrim(COALESCE(_intro, ''));
BEGIN
  PERFORM public.require_member();
  PERFORM public.require_awake();

  IF public.message_guard_enabled()
     AND intro <> ''
     AND _target_user_id IS NOT NULL
     AND NOT public.are_friends(me, _target_user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.conversations c
        WHERE least(c.participant_1, c.participant_2) = least(me, _target_user_id)
          AND greatest(c.participant_1, c.participant_2) = greatest(me, _target_user_id))
     AND NOT public.message_check_ok(_target_user_id, intro) THEN
    RAISE EXCEPTION 'První zprávu si nejdřív musí přečíst strážce zpráv. Zkus ji odeslat znovu.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY SELECT * FROM public.start_conversation__ungated(_target_user_id, _intro);
END
$$;

REVOKE ALL ON FUNCTION public.start_conversation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_conversation(uuid, text) TO authenticated;

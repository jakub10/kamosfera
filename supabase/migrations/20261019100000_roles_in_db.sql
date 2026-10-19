-- Role (VIP, VIP PRO MAX, tvůrce) se přidělují v databázi, ne v Edge funkcích.
--
-- Dřív to dělaly funkce admin-set-role a activate-role. Na novém Supabase
-- projektu nebyly nahrané, takže tlačítka „Dát VIP" a aktivace kódem končila
-- chybou „Failed to send a request to the Edge Function". Teď stačí migrace.

-- Pojistka proti tomu, aby si někdo roli zapsal sám: výjimku má jen tato
-- migrace (příznak kamos.role_change nastavují jen funkce níže).
CREATE OR REPLACE FUNCTION public.prevent_privileged_role_self_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IN ('vip', 'creator', 'vip_pro_max') AND auth.uid() IS NOT NULL
     AND COALESCE(current_setting('kamos.role_change', true), '') <> 'on' THEN
    IF current_setting('request.jwt.claim.role', true) = 'authenticated'
       OR COALESCE(current_setting('request.jwt.claims', true), '') LIKE '%"role":%"authenticated"%' THEN
      RAISE EXCEPTION 'Privileged role assignment must go through the activation function';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Tvůrce přidělí nebo odebere roli někomu jinému.
CREATE OR REPLACE FUNCTION public.admin_set_role(_target uuid, _role text, _action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_role(me, 'creator') THEN
    RAISE EXCEPTION 'Jen pro tvůrce.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _target IS NULL OR _role NOT IN ('vip', 'vip_pro_max', 'creator') OR _action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'Neplatný požadavek.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _target) THEN
    RAISE EXCEPTION 'Takový uživatel neexistuje.';
  END IF;
  IF _role = 'creator' AND _target = me THEN
    RAISE EXCEPTION 'Svou vlastní roli tvůrce měnit nemůžeš.';
  END IF;
  IF _role <> 'creator' AND public.has_role(_target, 'creator') THEN
    RAISE EXCEPTION 'Tvůrci se VIP nemění — má všechno.';
  END IF;

  PERFORM set_config('kamos.role_change', 'on', true);
  IF _action = 'grant' THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT _target, r::app_role
      FROM unnest(CASE _role WHEN 'vip_pro_max' THEN ARRAY['vip', 'vip_pro_max'] ELSE ARRAY[_role] END) r
     WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _target AND ur.role = r::app_role);
  ELSE
    DELETE FROM public.user_roles
     WHERE user_id = _target
       AND role::text = ANY (CASE _role WHEN 'vip' THEN ARRAY['vip', 'vip_pro_max'] ELSE ARRAY[_role] END);
  END IF;
  PERFORM set_config('kamos.role_change', 'off', true);

  RETURN jsonb_build_object('success', true);
END
$function$;

-- Dítě aktivuje VIP jednorázovým kódem, který vytvořil tvůrce (záložka Kódy).
CREATE OR REPLACE FUNCTION public.activate_role_code(_role text, _code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  code_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _role NOT IN ('vip', 'vip_pro_max', 'creator') THEN
    RAISE EXCEPTION 'Neplatná role.';
  END IF;

  SELECT id INTO code_id FROM public.activation_codes
   WHERE code = upper(btrim(COALESCE(_code, ''))) AND role::text = _role
   FOR UPDATE;
  IF code_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kód neplatí.');
  END IF;

  PERFORM set_config('kamos.role_change', 'on', true);
  INSERT INTO public.user_roles (user_id, role)
  SELECT me, r::app_role
    FROM unnest(CASE _role WHEN 'vip_pro_max' THEN ARRAY['vip', 'vip_pro_max'] ELSE ARRAY[_role] END) r
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = me AND ur.role = r::app_role);
  PERFORM set_config('kamos.role_change', 'off', true);

  DELETE FROM public.activation_codes WHERE id = code_id;
  RETURN jsonb_build_object('success', true);
END
$function$;

REVOKE ALL ON FUNCTION public.admin_set_role(uuid, text, text), public.activate_role_code(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, text, text), public.activate_role_code(text, text) TO authenticated;

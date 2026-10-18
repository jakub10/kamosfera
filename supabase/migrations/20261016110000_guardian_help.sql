-- „Potřebuju pomoct": signál důvěrníkovi bez blokování kohokoli.
--
-- Tlačítko „Tohle mi není příjemné" je u konkrétního člověka (a hned ho
-- zablokuje). Dítě ale někdy potřebuje pomoc, aniž by šlo o jednoho
-- člověka — proto stejný signál i z nastavení důvěrníka.

ALTER TABLE public.guardian_signals DROP CONSTRAINT IF EXISTS guardian_signals_kind_check;
ALTER TABLE public.guardian_signals ADD CONSTRAINT guardian_signals_kind_check
  CHECK (kind IN ('uncomfortable', 'ai_harmful', 'ai_secret', 'help'));

CREATE OR REPLACE FUNCTION public.ask_guardian_help()
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

  SELECT EXISTS (SELECT 1 FROM public.guardians WHERE child_id = me AND revoked_at IS NULL) INTO has_guardian;

  -- Nejvýš 10 signálů za den (společně s „Tohle mi není příjemné").
  IF has_guardian AND (SELECT count(*) FROM public.guardian_signals
       WHERE child_id = me AND created_at > now() - interval '1 day') < 10 THEN
    INSERT INTO public.guardian_signals (child_id, kind) VALUES (me, 'help');
  END IF;

  RETURN jsonb_build_object('guardian', has_guardian);
END
$function$;

REVOKE ALL ON FUNCTION public.ask_guardian_help() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_guardian_help() TO authenticated;

-- Přečtené zprávy zůstanou přečtené.
--
-- Dřív: zprávu směl měnit jen odesílatel (politika „Users can update their
-- own messages"), takže příjemcovo „přečteno" databáze tiše zahodila. V seznamu
-- se pak zpráva po návratu znovu ukázala jako nepřečtená.
--
-- Teď to dělá funkce: označí jako přečtené jen cizí zprávy v konverzaci,
-- ve které volající sedí. Nic jiného na zprávě změnit nejde.

CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation uuid, _message uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  n integer;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.require_member();

  IF NOT EXISTS (SELECT 1 FROM public.conversations c
                  WHERE c.id = _conversation AND me IN (c.participant_1, c.participant_2)) THEN
    RAISE EXCEPTION 'V téhle konverzaci nejsi.';
  END IF;

  UPDATE public.messages m
     SET read = true
   WHERE m.conversation_id = _conversation
     AND m.sender_id <> me
     AND m.read = false
     AND (_message IS NULL OR m.id = _message);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$function$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid, uuid) TO authenticated;

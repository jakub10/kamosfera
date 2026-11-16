-- ============================================================================
-- Opravy z bezpečnostního čtení 16. 11. 2026.
--
-- 1. Odeslaná zpráva se nedá přepsat.
--    AI strážce i noční klid hlídají jen ODESLÁNÍ zprávy. Odesílatel ale směl
--    svou zprávu potom upravit (UPDATE) — stačilo poslat „ahoj", dostat lístek
--    od strážce a text pak přepsat na cokoli. Příjemce viděl přepsaný text,
--    strážce ani důvěrník o ničem nevěděli. Aplikace úpravu zpráv nenabízí,
--    takže se nic neztrácí; šlo to jen mimo aplikaci. Totéž pro skupiny.
--    (Označení „přečteno" funguje dál — mění jiný sloupec.)
--
-- 2. Příběhy (stories) se schovají i zablokovaným.
--    Blokování schovávalo příspěvky a komentáře, ale příběhy viděl dál
--    každý člen — i ten, koho dítě zablokovalo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lock_message_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
    RAISE EXCEPTION 'sender_id is immutable';
  END IF;
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
    RAISE EXCEPTION 'conversation_id is immutable';
  END IF;
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'Odeslanou zprávu už nejde změnit.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at is immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.lock_group_message_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Odeslanou zprávu už nejde změnit.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS lock_group_message_immutable_fields_trg ON public.group_messages;
CREATE TRIGGER lock_group_message_immutable_fields_trg
  BEFORE UPDATE ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.lock_group_message_immutable_fields();

REVOKE ALL ON FUNCTION public.lock_group_message_immutable_fields() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Stories are viewable by authenticated users" ON public.stories;
CREATE POLICY "Stories are viewable by authenticated users" ON public.stories
  FOR SELECT TO authenticated
  USING (NOT public.blocked_for_me(user_id));

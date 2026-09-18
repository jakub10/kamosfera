-- ============================================================================
-- Notifikace vznikají v databázi, ne v prohlížeči
--
-- Stránka Oznámení existovala, zvonek měl počítadlo, kód uměl vykreslit lajky,
-- komentáře i žádosti o přátelství — ale NIKDO je nevytvářel. Ani klient, ani
-- trigger. Bára poslala Kubovi žádost o přátelství a Kuba se to dozvěděl jen
-- tehdy, když sám náhodou otevřel její profil.
--
-- Triggery místo klienta: nejde je obejít, nezapomene se na ně při další
-- změně UI a fungují stejně pro registraci e-mailem i přes Google.
-- Zablokovaná dvojice si žádnou notifikaci nepošle.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_on_friendship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    IF NOT public.is_blocked_between(NEW.requester_id, NEW.addressee_id) THEN
      INSERT INTO public.notifications (user_id, type, from_user_id)
      VALUES (NEW.addressee_id, 'friend_request', NEW.requester_id);
    END IF;

  ELSIF TG_OP = 'UPDATE' AND OLD.status <> 'accepted' AND NEW.status = 'accepted' THEN
    INSERT INTO public.notifications (user_id, type, from_user_id)
    VALUES (NEW.requester_id, 'friend_accepted', NEW.addressee_id);

    -- Vyřízená žádost už nemá co viset v oznámeních příjemce.
    DELETE FROM public.notifications
     WHERE user_id = NEW.addressee_id
       AND from_user_id = NEW.requester_id
       AND type = 'friend_request';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendship_notify ON public.friendships;
CREATE TRIGGER friendship_notify
  AFTER INSERT OR UPDATE OF status ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_friendship();


-- Reakce: do `message` se ukládá druh reakce, aby oznámení mohlo říct
-- „Bára je s tebou u tvého příspěvku", ne jen „dala like".
CREATE OR REPLACE FUNCTION public.notify_on_reaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
BEGIN
  SELECT p.user_id INTO _owner FROM public.posts p WHERE p.id = NEW.post_id;

  IF _owner IS NULL OR _owner = NEW.user_id THEN
    RETURN NEW;
  END IF;
  IF public.is_blocked_between(_owner, NEW.user_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, type, from_user_id, post_id, message)
    VALUES (_owner, 'like', NEW.user_id, NEW.post_id, NEW.kind);
  ELSIF TG_OP = 'UPDATE' AND OLD.kind <> NEW.kind THEN
    -- Změna reakce nemá spamovat; jen se opraví, co oznámení říká.
    UPDATE public.notifications
       SET message = NEW.kind
     WHERE user_id = _owner AND from_user_id = NEW.user_id
       AND post_id = NEW.post_id AND type = 'like';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reaction_notify ON public.likes;
CREATE TRIGGER reaction_notify
  AFTER INSERT OR UPDATE OF kind ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_reaction();

-- Vzatá zpět reakce s sebou vezme i oznámení.
CREATE OR REPLACE FUNCTION public.unnotify_on_reaction_removed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE from_user_id = OLD.user_id AND post_id = OLD.post_id AND type = 'like';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS reaction_unnotify ON public.likes;
CREATE TRIGGER reaction_unnotify
  AFTER DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.unnotify_on_reaction_removed();


CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
BEGIN
  SELECT p.user_id INTO _owner FROM public.posts p WHERE p.id = NEW.post_id;

  IF _owner IS NOT NULL AND _owner <> NEW.user_id
     AND NOT public.is_blocked_between(_owner, NEW.user_id) THEN
    INSERT INTO public.notifications (user_id, type, from_user_id, post_id)
    VALUES (_owner, 'comment', NEW.user_id, NEW.post_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comment_notify ON public.comments;
CREATE TRIGGER comment_notify
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();


REVOKE EXECUTE ON FUNCTION public.notify_on_friendship() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_on_reaction() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.unnotify_on_reaction_removed() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_on_comment() FROM anon, authenticated, public;

-- Klient už notifikace nevkládá; jediná cesta jsou triggery a RPC.
-- Stará politika zůstává kvůli zpětné kompatibilitě, ale zamkne se.
DROP POLICY IF EXISTS "No direct notification inserts" ON public.notifications;
CREATE POLICY "No direct notification inserts"
  ON public.notifications AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

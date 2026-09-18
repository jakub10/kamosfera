-- ============================================================================
-- Ochrana súkromných správ v Kamosfére
--
-- Problém, ktorý to rieši:
--   Doterajšia politika povoľovala založiť konverzáciu komukoľvek s kýmkoľvek.
--   Ktokoľvek s účtom mohol napísať ktorémukoľvek dieťaťu a nedalo sa tomu brániť.
--
-- Ako to funguje po tejto zmene:
--   * Kamaráti (prijaté priateľstvo) si píšu bez akéhokoľvek obmedzenia.
--   * Kto nie je kamarát, pošle JEDNU krátku zoznamovaciu správu bez odkazov.
--     Konverzácia zostane v stave 'pending', kým ju druhá strana neprijme.
--     Druhá správa neprejde ani teoreticky — bráni tomu RLS, nie tlačidlo v UI.
--   * Dieťa žiadosť prijme, ignoruje alebo odosielateľa zablokuje.
--   * Blokovanie je obojsmerné a schová aj príspevky a komentáre.
--   * Kto rozosiela žiadosti hromadne, narazí na limit skôr, než obťažuje ďalších.
--   * Creator vidí metadáta (kto koho oslovil, kto koho zablokoval), nikdy nie
--     obsah správ — dohľad bez čítania súkromnej komunikácie.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Blokovanie používateľov
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Každý vidí len svoj vlastný zoznam blokovaných. Zablokovaný sa nedozvie,
-- že je zablokovaný — to je zámer, nie opomenutie.
DROP POLICY IF EXISTS "Users can view their own blocks" ON public.user_blocks;
CREATE POLICY "Users can view their own blocks"
  ON public.user_blocks FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);

-- Zápis prebieha výhradne cez RPC block_user / unblock_user nižšie.
DROP POLICY IF EXISTS "No direct writes to user_blocks" ON public.user_blocks;
CREATE POLICY "No direct writes to user_blocks"
  ON public.user_blocks AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);


-- ---------------------------------------------------------------------------
-- 2) Bezpečnostný denník — metadáta, nikdy nie obsah správ
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.safety_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN (
    'request_sent', 'request_accepted', 'request_ignored',
    'user_blocked', 'user_unblocked', 'request_rate_limited'
  )),
  actor_id uuid,
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS safety_events_created_idx ON public.safety_events (created_at DESC);
CREATE INDEX IF NOT EXISTS safety_events_actor_idx ON public.safety_events (actor_id, created_at DESC);

ALTER TABLE public.safety_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only creators can read safety events" ON public.safety_events;
CREATE POLICY "Only creators can read safety events"
  ON public.safety_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'creator'::app_role));

DROP POLICY IF EXISTS "No direct writes to safety events" ON public.safety_events;
CREATE POLICY "No direct writes to safety events"
  ON public.safety_events AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);


-- ---------------------------------------------------------------------------
-- 3) Konverzácie dostávajú stav a autora žiadosti
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS initiator_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_status_check'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_status_check CHECK (status IN ('pending', 'accepted'));
  END IF;
END$$;

-- Existujúce konverzácie sú rozbehnuté a zostávajú prijaté — deťom sa nič
-- neprestane zobrazovať. Nové pravidlá platia až pre konverzácie odteraz.
UPDATE public.conversations
   SET initiator_id = participant_1
 WHERE initiator_id IS NULL;

-- Dvojica (A,B) a (B,A) mohla doteraz vzniknúť dvakrát. Zlúčime ich do tej
-- staršej, aby sa blokovanie nedalo obísť založením konverzácie naopak.
WITH ranked AS (
  SELECT id,
         least(participant_1, participant_2)    AS a,
         greatest(participant_1, participant_2) AS b,
         row_number() OVER (
           PARTITION BY least(participant_1, participant_2),
                        greatest(participant_1, participant_2)
           ORDER BY created_at, id
         ) AS rn
    FROM public.conversations
),
keepers AS (
  SELECT a, b, id AS keep_id FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, k.keep_id
    FROM ranked r
    JOIN keepers k ON k.a = r.a AND k.b = r.b
   WHERE r.rn > 1
)
UPDATE public.messages m
   SET conversation_id = d.keep_id
  FROM dupes d
 WHERE m.conversation_id = d.dupe_id;

DELETE FROM public.conversations c
 WHERE EXISTS (
   SELECT 1
     FROM public.conversations o
    WHERE least(o.participant_1, o.participant_2) = least(c.participant_1, c.participant_2)
      AND greatest(o.participant_1, o.participant_2) = greatest(c.participant_1, c.participant_2)
      AND (o.created_at, o.id) < (c.created_at, c.id)
 );

-- Od tejto chvíle existuje medzi dvoma deťmi vždy najviac jedna konverzácia,
-- bez ohľadu na to, kto ju založil.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_uniq
  ON public.conversations (least(participant_1, participant_2), greatest(participant_1, participant_2));

CREATE INDEX IF NOT EXISTS conversations_status_idx ON public.conversations (status);


-- ---------------------------------------------------------------------------
-- 4) Pomocné funkcie
-- ---------------------------------------------------------------------------

-- Sú títo dvaja kamaráti? (prijaté priateľstvo v ľubovoľnom smere)
CREATE OR REPLACE FUNCTION public.are_friends(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
     WHERE f.status = 'accepted'
       AND ((f.requester_id = _a AND f.addressee_id = _b)
         OR (f.requester_id = _b AND f.addressee_id = _a))
  );
$$;

-- Blokuje niektorý z tých dvoch toho druhého? Blokovanie platí oboma smermi:
-- kto zablokuje, ten druhého nevidí, a zároveň sa mu ten druhý nedostane.
CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks ub
     WHERE (ub.blocker_id = _a AND ub.blocked_id = _b)
        OR (ub.blocker_id = _b AND ub.blocked_id = _a)
  );
$$;

-- Blokuje ma tento používateľ, alebo ja jeho? Pre použitie v RLS politikách.
CREATE OR REPLACE FUNCTION public.blocked_for_me(_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_blocked_between(auth.uid(), _other);
$$;

-- Zoznamovacia správa nesmie obsahovať odkaz. Prvý kontakt od cudzieho človeka
-- je najčastejší nosič phishingu a lákania mimo platformu.
CREATE OR REPLACE FUNCTION public.contains_link(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _text ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|sk|cz|eu|io|me|ru|xyz|top|info|app|link|gg|tv)\M)';
$$;


-- ---------------------------------------------------------------------------
-- 5) Politiky: konverzácie
-- ---------------------------------------------------------------------------

-- Zakladanie konverzácií priamo z klienta končí. Všetko ide cez RPC
-- start_conversation, kde sú kontroly na jednom mieste a nedajú sa obísť.
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;

DROP POLICY IF EXISTS "No direct conversation inserts" ON public.conversations;
CREATE POLICY "No direct conversation inserts"
  ON public.conversations AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

-- Stav konverzácie mení výhradne RPC respond_to_conversation_request.
DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;
DROP POLICY IF EXISTS "No direct conversation status changes" ON public.conversations;
CREATE POLICY "No direct conversation status changes"
  ON public.conversations AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
CREATE POLICY "Users can view their conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    (auth.uid() = participant_1 OR auth.uid() = participant_2)
    AND NOT public.blocked_for_me(
      CASE WHEN auth.uid() = participant_1 THEN participant_2 ELSE participant_1 END
    )
  );

DROP POLICY IF EXISTS "Users can delete their conversations" ON public.conversations;
CREATE POLICY "Users can delete their conversations"
  ON public.conversations FOR DELETE TO authenticated
  USING (auth.uid() = participant_1 OR auth.uid() = participant_2);


-- ---------------------------------------------------------------------------
-- 6) Politiky: správy
-- ---------------------------------------------------------------------------

-- Zoznamovaciu správu zapisuje RPC start_conversation. Bežné správy sa dajú
-- posielať až v prijatej konverzácii — v čakajúcej neprejde ani jedna navyše.
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND NOT public.is_user_banned(auth.uid())
    AND length(trim(content)) > 0
    AND length(content) <= 2000
    AND EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = messages.conversation_id
         AND c.status = 'accepted'
         AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
         AND NOT public.is_blocked_between(c.participant_1, c.participant_2)
    )
  );

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = messages.conversation_id
         AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
         AND NOT public.is_blocked_between(c.participant_1, c.participant_2)
    )
  );


-- ---------------------------------------------------------------------------
-- 7) Blokovanie schová aj príspevky a komentáre
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Posts are viewable by authenticated users" ON public.posts;
CREATE POLICY "Posts are viewable by authenticated users"
  ON public.posts FOR SELECT TO authenticated
  USING (NOT public.blocked_for_me(user_id));

DROP POLICY IF EXISTS "Comments are viewable by authenticated users" ON public.comments;
CREATE POLICY "Comments are viewable by authenticated users"
  ON public.comments FOR SELECT TO authenticated
  USING (NOT public.blocked_for_me(user_id));


-- ---------------------------------------------------------------------------
-- 8) RPC: založenie konverzácie alebo odoslanie žiadosti
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_conversation(_target_user_id uuid, _intro text DEFAULT NULL)
RETURNS TABLE (conversation_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _conv public.conversations%ROWTYPE;
  _is_friend boolean;
  _recent_requests integer;
  _open_requests integer;
  _clean_intro text;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Musíš byť prihlásený.' USING ERRCODE = '28000';
  END IF;

  IF _target_user_id IS NULL OR _target_user_id = _me THEN
    RAISE EXCEPTION 'Neplatný príjemca.' USING ERRCODE = '22023';
  END IF;

  IF public.is_user_banned(_me) THEN
    RAISE EXCEPTION 'Tvoj účet má pozastavené posielanie správ.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = _target_user_id) THEN
    RAISE EXCEPTION 'Taký používateľ neexistuje.' USING ERRCODE = '22023';
  END IF;

  -- Zablokovanému nepovieme, že je zablokovaný. Dostane tú istú odpoveď,
  -- akú by dostal pri nedostupnom používateľovi.
  IF public.is_blocked_between(_me, _target_user_id) THEN
    RAISE EXCEPTION 'Tomuto používateľovi sa teraz nedá napísať.' USING ERRCODE = '42501';
  END IF;

  -- Konverzácia už existuje: vrátime ju v akomkoľvek stave.
  SELECT * INTO _conv
    FROM public.conversations c
   WHERE least(c.participant_1, c.participant_2) = least(_me, _target_user_id)
     AND greatest(c.participant_1, c.participant_2) = greatest(_me, _target_user_id);

  IF FOUND THEN
    conversation_id := _conv.id;
    status := _conv.status;
    RETURN NEXT;
    RETURN;
  END IF;

  _is_friend := public.are_friends(_me, _target_user_id);

  IF _is_friend THEN
    -- Kamaráti: konverzácia rovno otvorená, žiadne zdržovanie.
    INSERT INTO public.conversations (participant_1, participant_2, status, initiator_id)
    VALUES (_me, _target_user_id, 'accepted', _me)
    RETURNING * INTO _conv;
  ELSE
    -- Cudzí človek: limity najprv, až potom žiadosť.
    SELECT count(*) INTO _recent_requests
      FROM public.safety_events se
     WHERE se.kind = 'request_sent'
       AND se.actor_id = _me
       AND se.created_at > now() - interval '1 hour';

    IF _recent_requests >= 5 THEN
      INSERT INTO public.safety_events (kind, actor_id, target_id)
      VALUES ('request_rate_limited', _me, _target_user_id);
      RAISE EXCEPTION 'Poslal si priveľa žiadostí naraz. Skús to o hodinu.' USING ERRCODE = '53400';
    END IF;

    SELECT count(*) INTO _open_requests
      FROM public.conversations c
     WHERE c.status = 'pending'
       AND c.initiator_id = _me;

    IF _open_requests >= 15 THEN
      INSERT INTO public.safety_events (kind, actor_id, target_id)
      VALUES ('request_rate_limited', _me, _target_user_id);
      RAISE EXCEPTION 'Máš priveľa nevybavených žiadostí. Počkaj, kým na ne odpovedia.' USING ERRCODE = '53400';
    END IF;

    _clean_intro := nullif(trim(coalesce(_intro, '')), '');

    IF _clean_intro IS NULL THEN
      RAISE EXCEPTION 'Napíš krátku správu, nech vie, kto si.' USING ERRCODE = '22023';
    END IF;

    IF length(_clean_intro) > 300 THEN
      RAISE EXCEPTION 'Prvá správa môže mať najviac 300 znakov.' USING ERRCODE = '22023';
    END IF;

    IF public.contains_link(_clean_intro) THEN
      RAISE EXCEPTION 'V prvej správe nemôžu byť odkazy.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.conversations (participant_1, participant_2, status, initiator_id)
    VALUES (_me, _target_user_id, 'pending', _me)
    RETURNING * INTO _conv;

    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES (_conv.id, _me, _clean_intro);

    INSERT INTO public.notifications (user_id, type, from_user_id, message)
    VALUES (_target_user_id, 'message_request', _me, 'ti chce psát');

    INSERT INTO public.safety_events (kind, actor_id, target_id)
    VALUES ('request_sent', _me, _target_user_id);
  END IF;

  conversation_id := _conv.id;
  status := _conv.status;
  RETURN NEXT;
END;
$$;


-- ---------------------------------------------------------------------------
-- 9) RPC: odpoveď na žiadosť — prijať, ignorovať, zablokovať
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_conversation_request(_conversation_id uuid, _action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _conv public.conversations%ROWTYPE;
  _other uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Musíš byť prihlásený.' USING ERRCODE = '28000';
  END IF;

  IF _action NOT IN ('accept', 'ignore', 'block') THEN
    RAISE EXCEPTION 'Neplatná akcia.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _conv FROM public.conversations c WHERE c.id = _conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Konverzácia neexistuje.' USING ERRCODE = '22023';
  END IF;

  IF _me NOT IN (_conv.participant_1, _conv.participant_2) THEN
    RAISE EXCEPTION 'Toto nie je tvoja konverzácia.' USING ERRCODE = '42501';
  END IF;

  -- Na žiadosť odpovedá ten, komu prišla — nie ten, kto ju poslal.
  IF _conv.status <> 'pending' OR _conv.initiator_id = _me THEN
    RAISE EXCEPTION 'Na túto konverzáciu sa nedá takto odpovedať.' USING ERRCODE = '22023';
  END IF;

  _other := CASE WHEN _conv.participant_1 = _me THEN _conv.participant_2 ELSE _conv.participant_1 END;

  IF _action = 'accept' THEN
    UPDATE public.conversations SET status = 'accepted', updated_at = now()
     WHERE id = _conv.id;

    INSERT INTO public.notifications (user_id, type, from_user_id, message)
    VALUES (_other, 'message_accepted', _me, 'přijal/a tvou zprávu');

    INSERT INTO public.safety_events (kind, actor_id, target_id)
    VALUES ('request_accepted', _me, _other);

  ELSIF _action = 'ignore' THEN
    -- Konverzácia zmizne aj s prvou správou. Odosielateľ sa nedozvie nič
    -- a rate limit mu bráni skúšať donekonečna.
    DELETE FROM public.conversations WHERE id = _conv.id;

    INSERT INTO public.safety_events (kind, actor_id, target_id)
    VALUES ('request_ignored', _me, _other);

  ELSE -- block
    DELETE FROM public.conversations WHERE id = _conv.id;

    INSERT INTO public.user_blocks (blocker_id, blocked_id)
    VALUES (_me, _other)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.safety_events (kind, actor_id, target_id)
    VALUES ('user_blocked', _me, _other);
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 10) RPC: blokovanie kedykoľvek, nielen pri žiadosti
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Musíš byť prihlásený.' USING ERRCODE = '28000';
  END IF;

  IF _user_id IS NULL OR _user_id = _me THEN
    RAISE EXCEPTION 'Neplatný používateľ.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (_me, _user_id)
  ON CONFLICT DO NOTHING;

  -- Blokovanie ruší aj priateľstvo a čakajúcu žiadosť o priateľstvo.
  DELETE FROM public.friendships f
   WHERE (f.requester_id = _me AND f.addressee_id = _user_id)
      OR (f.requester_id = _user_id AND f.addressee_id = _me);

  -- Čakajúca žiadosť o konverzáciu zmizne. Rozbehnutá konverzácia zostane,
  -- ale ani jedna strana ju odteraz neuvidí.
  DELETE FROM public.conversations c
   WHERE c.status = 'pending'
     AND least(c.participant_1, c.participant_2) = least(_me, _user_id)
     AND greatest(c.participant_1, c.participant_2) = greatest(_me, _user_id);

  INSERT INTO public.safety_events (kind, actor_id, target_id)
  VALUES ('user_blocked', _me, _user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Musíš byť prihlásený.' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.user_blocks
   WHERE blocker_id = _me AND blocked_id = _user_id;

  INSERT INTO public.safety_events (kind, actor_id, target_id)
  VALUES ('user_unblocked', _me, _user_id);
END;
$$;


-- ---------------------------------------------------------------------------
-- 11) Notifikácie
--
-- Typ 'message_request' zámerne NIE JE v zozname nižšie: vytvára ho výhradne
-- RPC start_conversation, takže si ho nikto nevyrobí ručne. Zároveň pribudla
-- podmienka, že notifikácia neprejde medzi zablokovanou dvojicou, a že správu
-- ohlási len prijatá konverzácia.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create valid notifications" ON public.notifications;
CREATE POLICY "Users can create valid notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = from_user_id)
  AND (type = ANY (ARRAY['like','comment','friend_request','friend_accepted','message','mention','story_view']))
  AND (user_id <> from_user_id)
  AND NOT public.is_blocked_between(auth.uid(), user_id)
  AND (
    ((type = ANY (ARRAY['like','comment','mention'])) AND post_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.posts p WHERE p.id = notifications.post_id AND p.user_id = notifications.user_id
    ))
    OR ((type = ANY (ARRAY['friend_request','friend_accepted'])) AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE ((f.requester_id = auth.uid() AND f.addressee_id = notifications.user_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = notifications.user_id))
    ))
    OR ((type = 'message') AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.status = 'accepted'
        AND ((c.participant_1 = auth.uid() AND c.participant_2 = notifications.user_id)
          OR (c.participant_2 = auth.uid() AND c.participant_1 = notifications.user_id))
    ))
    OR ((type = 'story_view') AND EXISTS (
      SELECT 1 FROM public.story_views sv
      JOIN public.stories s ON s.id = sv.story_id
      WHERE sv.user_id = auth.uid() AND s.user_id = notifications.user_id
    ))
  )
);


-- ---------------------------------------------------------------------------
-- 12) Oprávnenia
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.start_conversation(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_to_conversation_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unblock_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_blocked_between(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.blocked_for_me(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_conversation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_conversation_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blocked_for_me(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;

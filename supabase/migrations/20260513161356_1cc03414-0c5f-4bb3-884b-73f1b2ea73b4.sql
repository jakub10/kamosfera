
-- 1. user_roles: add explicit restrictive INSERT/UPDATE/DELETE deny for non-service contexts
-- (Trigger already blocks privileged self-assign; add explicit policies to make intent clear)
CREATE POLICY "No direct inserts to user_roles"
ON public.user_roles AS RESTRICTIVE
FOR INSERT TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "No direct updates to user_roles"
ON public.user_roles AS RESTRICTIVE
FOR UPDATE TO authenticated, anon
USING (false);

CREATE POLICY "No direct deletes from user_roles"
ON public.user_roles AS RESTRICTIVE
FOR DELETE TO authenticated, anon
USING (false);

-- 2. messages: remove overly permissive realtime SELECT policy
DROP POLICY IF EXISTS "Authenticated users can subscribe to realtime" ON public.messages;

-- 3. realtime.messages: scope channel access to topics owned by the user
--
-- Toto je tá ochrana, ktorá bráni dieťaťu prihlásiť sa na odber cudzej
-- konverzácie a čítať ju naživo. `realtime.messages` však patrí Supabase
-- a SQL editor na ňu nemusí mať práva — vtedy sa to nedá spraviť tadeto
-- a treba to dohnať inak. Kontrola úplne na konci schémy o tom povie.
DO $rt$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can subscribe to realtime" ON realtime.messages';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_can_select_realtime" ON realtime.messages';
  EXECUTE $sql$
    CREATE POLICY "Users can subscribe to their own realtime topics"
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING (
      -- User's own topic by uid
      (realtime.topic() = (SELECT auth.uid())::text)
      -- Conversation channels: topic format conversation:<id>
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE 'conversation:' || c.id::text = realtime.topic()
          AND (c.participant_1 = (SELECT auth.uid()) OR c.participant_2 = (SELECT auth.uid()))
      )
      -- Group channels: topic format group:<id>
      OR EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE 'group:' || gm.group_id::text = realtime.topic()
          AND gm.user_id = (SELECT auth.uid())
      )
      -- Public broadcast topics (posts/stories feed)
      OR realtime.topic() IN ('posts', 'stories', 'public')
    )
  $sql$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'realtime.messages: politika odberov sa NEVYTVORILA (chýbajú práva). Bez nej si môže ktokoľvek prihlásiť odber cudzej konverzácie.';
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $rt$;

-- 4. notifications: restrict types and require valid context
DROP POLICY IF EXISTS "Users can create notifications for others" ON public.notifications;

CREATE POLICY "Users can create valid notifications"
ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = from_user_id OR from_user_id IS NULL)
  AND type IN ('like', 'comment', 'friend_request', 'friend_accepted', 'message', 'mention', 'moderation', 'achievement', 'story_view')
  AND user_id <> COALESCE(from_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND (
    -- Post-related notifications must reference an existing post
    (type IN ('like', 'comment', 'mention') AND post_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = notifications.user_id))
    -- Friend notifications must have an existing friendship
    OR (type IN ('friend_request', 'friend_accepted')
      AND EXISTS (SELECT 1 FROM public.friendships f
        WHERE (f.requester_id = auth.uid() AND f.addressee_id = notifications.user_id)
           OR (f.addressee_id = auth.uid() AND f.requester_id = notifications.user_id)))
    -- Message notifications must share a conversation
    OR (type = 'message'
      AND EXISTS (SELECT 1 FROM public.conversations c
        WHERE (c.participant_1 = auth.uid() AND c.participant_2 = notifications.user_id)
           OR (c.participant_2 = auth.uid() AND c.participant_1 = notifications.user_id)))
    -- Story view notifications
    OR (type = 'story_view'
      AND EXISTS (SELECT 1 FROM public.stories s WHERE s.user_id = notifications.user_id))
    -- System notifications (from_user_id is NULL) — moderation/achievement
    OR (from_user_id IS NULL AND type IN ('moderation', 'achievement'))
  )
);

-- 5. group_members: restrict SELECT to authenticated users only
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;

CREATE POLICY "Members can view group members"
ON public.group_members
FOR SELECT TO authenticated
USING (is_group_member(auth.uid(), group_id) OR is_group_public(group_id));

-- 6. story_views: allow story owners to see who viewed their stories
CREATE POLICY "Story owners can view their story views"
ON public.story_views
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_views.story_id AND s.user_id = auth.uid()));

-- 7. SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated for internal-only ones
-- These are meant for triggers/internal use; not for direct API calls
REVOKE EXECUTE ON FUNCTION public.update_user_stats_on_post() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_user_stats_on_like() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_user_stats_on_comment() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_user_stats_on_friendship_accepted() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_user_stats_on_message() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_conversation_timestamp() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_user_achievements(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_achievements_on_stats_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prevent_privileged_role_self_assign() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_user_banned(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_group_public(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;

-- 8. Storage: prevent public listing of buckets while keeping direct URL access working
-- Public buckets serve files via public URLs regardless of RLS; removing broad SELECT
-- policies blocks list() enumeration.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Post images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Stories are publicly viewable" ON storage.objects;

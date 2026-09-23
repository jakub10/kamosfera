-- Fix security issue: Profiles should only be viewable by authenticated users
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Add story_views table to track who has seen stories
CREATE TABLE IF NOT EXISTS public.story_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  viewed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(story_id, user_id)
);

-- Enable RLS on story_views
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- RLS policies for story_views
CREATE POLICY "Users can view their own story views"
ON public.story_views
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert story views"
ON public.story_views
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for stories
DO $realtime$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
EXCEPTION
  -- Tabuľka už v publikácii je (migrácie sa prehrávajú aj na hotovej databáze).
  WHEN duplicate_object THEN NULL;
  -- SQL editor v Supabase beží pod rolou, ktorá na publikáciu nesiaha.
  -- Realtime sa dá zapnúť klikom v Database → Replication; kvôli tomuto
  -- nemá padnúť celá schéma.
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Realtime: % — zapni ručne v Database → Replication.', 'public.stories';
  WHEN undefined_object THEN NULL;
END $realtime$;
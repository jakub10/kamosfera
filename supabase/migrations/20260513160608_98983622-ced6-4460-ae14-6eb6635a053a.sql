-- 1. Remove privilege escalation: drop self-insert on user_roles
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;

-- Optional safety trigger: block any direct client insert of privileged roles even if a future policy is added
CREATE OR REPLACE FUNCTION public.prevent_privileged_role_self_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('vip', 'creator') AND auth.uid() IS NOT NULL THEN
    -- Allow only when called from a SECURITY DEFINER context (no JWT role check needed at DB level
    -- because the edge function uses service role to insert).
    -- If invoked from a normal authenticated session, reject.
    IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
      RAISE EXCEPTION 'Privileged role assignment must go through the activation function';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_role_escalation ON public.user_roles;
CREATE TRIGGER prevent_role_escalation
BEFORE INSERT ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_privileged_role_self_assign();

-- 2. Restrict public-readable tables to authenticated users only
DROP POLICY IF EXISTS "User game stats are viewable by everyone" ON public.user_game_stats;
CREATE POLICY "Authenticated users can view game stats"
ON public.user_game_stats
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "User achievements are viewable by everyone" ON public.user_achievements;
CREATE POLICY "Authenticated users can view achievements"
ON public.user_achievements
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Anyone can view presence" ON public.user_presence;
CREATE POLICY "Authenticated users can view presence"
ON public.user_presence
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "User stats are viewable by everyone" ON public.user_stats;
CREATE POLICY "Authenticated users can view user stats"
ON public.user_stats
FOR SELECT
TO authenticated
USING (true);

-- 3. Realtime: require authentication for channel topic subscriptions
--
-- `realtime.messages` nie je naša tabuľka — patrí Supabase a v novom projekte
-- ju vlastní `supabase_realtime_admin`. SQL editor beží pod rolou, ktorá na ňu
-- nesiaha, a celá schéma by na tom spadla („must be owner of table messages").
-- Preto to skúsime a keď sa nedá, povieme to nahlas namiesto pádu.
DO $rt$
BEGIN
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION
  -- Nové projekty Supabase majú RLS na tejto tabuľke zapnuté už od začiatku,
  -- takže keď sa nedá siahnuť, spravidla je aj tak zapnuté.
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'realtime.messages: RLS sa nedalo zapnúť (chýbajú práva).';
  WHEN undefined_table THEN NULL;
END $rt$;

DO $rt$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can subscribe to realtime" ON realtime.messages';
  EXECUTE $sql$
    CREATE POLICY "Authenticated users can subscribe to realtime"
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING (true)
  $sql$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'realtime.messages: politiku nešlo vytvoriť (chýbajú práva).';
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $rt$;

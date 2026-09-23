-- Enable realtime for user_achievements to show notifications
DO $realtime$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_achievements;
EXCEPTION
  -- Tabuľka už v publikácii je (migrácie sa prehrávajú aj na hotovej databáze).
  WHEN duplicate_object THEN NULL;
  -- SQL editor v Supabase beží pod rolou, ktorá na publikáciu nesiaha.
  -- Realtime sa dá zapnúť klikom v Database → Replication; kvôli tomuto
  -- nemá padnúť celá schéma.
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Realtime: % — zapni ručne v Database → Replication.', 'public.user_achievements';
  WHEN undefined_object THEN NULL;
END $realtime$;
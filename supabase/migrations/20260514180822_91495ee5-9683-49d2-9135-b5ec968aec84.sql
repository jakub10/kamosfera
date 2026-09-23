DO $realtime$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_unlocked_items;
EXCEPTION
  -- Tabuľka už v publikácii je (migrácie sa prehrávajú aj na hotovej databáze).
  WHEN duplicate_object THEN NULL;
  -- SQL editor v Supabase beží pod rolou, ktorá na publikáciu nesiaha.
  -- Realtime sa dá zapnúť klikom v Database → Replication; kvôli tomuto
  -- nemá padnúť celá schéma.
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Realtime: % — zapni ručne v Database → Replication.', 'public.user_unlocked_items';
  WHEN undefined_object THEN NULL;
END $realtime$;
DO $realtime$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_stats;
EXCEPTION
  -- Tabuľka už v publikácii je (migrácie sa prehrávajú aj na hotovej databáze).
  WHEN duplicate_object THEN NULL;
  -- SQL editor v Supabase beží pod rolou, ktorá na publikáciu nesiaha.
  -- Realtime sa dá zapnúť klikom v Database → Replication; kvôli tomuto
  -- nemá padnúť celá schéma.
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Realtime: % — zapni ručne v Database → Replication.', 'public.user_stats';
  WHEN undefined_object THEN NULL;
END $realtime$;
DO $realtime$
BEGIN
  ALTER TABLE public.user_unlocked_items REPLICA IDENTITY FULL;
EXCEPTION
  -- Tabuľka už v publikácii je (migrácie sa prehrávajú aj na hotovej databáze).
  WHEN duplicate_object THEN NULL;
  -- SQL editor v Supabase beží pod rolou, ktorá na publikáciu nesiaha.
  -- Realtime sa dá zapnúť klikom v Database → Replication; kvôli tomuto
  -- nemá padnúť celá schéma.
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Realtime: % — zapni ručne v Database → Replication.', 'public.user_unlocked_items';
  WHEN undefined_object THEN NULL;
END $realtime$;
DO $realtime$
BEGIN
  ALTER TABLE public.user_stats REPLICA IDENTITY FULL;
EXCEPTION
  -- Tabuľka už v publikácii je (migrácie sa prehrávajú aj na hotovej databáze).
  WHEN duplicate_object THEN NULL;
  -- SQL editor v Supabase beží pod rolou, ktorá na publikáciu nesiaha.
  -- Realtime sa dá zapnúť klikom v Database → Replication; kvôli tomuto
  -- nemá padnúť celá schéma.
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Realtime: % — zapni ručne v Database → Replication.', 'public.user_stats';
  WHEN undefined_object THEN NULL;
END $realtime$;
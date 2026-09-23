-- ============================================================================
-- Pevnosť & Nájazd
--
-- Každý hráč si postaví jednu pevnosť a schová v nej poklad. Kamaráti ju
-- vykrádajú v 60-sekundovom nájazde, majiteľ si pozerá záznamy a pevnosť
-- vylepšuje. Asynchrónne — nikto nemusí byť online v rovnakom čase.
--
-- Logika hry žije v src/games/fortress/engine.ts a je deterministická.
-- Databáza nesimuluje; stráži to, čo sa dá overiť bez simulácie:
--
--   * mapa má správny tvar, jeden vchod, jeden poklad, pár teleportov
--     a zmestí sa do rozpočtu — tie isté pravidlá ako v editore,
--   * zverejniť sa dá len s dôkazom (záznamom behu majiteľa) na presne
--     tejto mape, a každá zmena mapy pevnosť stiahne, kým ju majiteľ
--     znova neprejde,
--   * dôkaz nevidí nikto — bol by to návod, ako pevnosť vykradnúť,
--   * nájazd sa hrá na aktuálnej mape, nie na vymyslenej,
--   * vlastnú pevnosť vykradnúť nejde, a kto je zablokovaný, ten pevnosť
--     toho druhého nevidí ani nevykradne.
-- ============================================================================

-- --- pravidlá mapy (tie isté ako gridProblems v engine.ts) -----------------

CREATE OR REPLACE FUNCTION public.fortress_count(_cells text, _ch text)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT length(_cells) - length(replace(_cells, _ch, ''));
$$;

CREATE OR REPLACE FUNCTION public.fortress_cost(_cells text)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT 1 * public.fortress_count(_cells, '#')
       + 1 * public.fortress_count(_cells, 'b')
       + 2 * public.fortress_count(_cells, 'D')
       + 2 * public.fortress_count(_cells, '^')
       + 4 * public.fortress_count(_cells, 'S')
       + 4 * public.fortress_count(_cells, 'V')
       + 3 * public.fortress_count(_cells, 'o')
       + 3 * public.fortress_count(_cells, 'T');
$$;

CREATE OR REPLACE FUNCTION public.fortress_grid_ok(_grid jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE c text := _grid->>'cells';
BEGIN
  RETURN c IS NOT NULL
     -- Dĺžka zvlášť: PostgreSQL povolí v regulárnom výraze opakovanie
     -- najviac 255-krát, takže {256} tu nejde.
     AND length(c) = 256
     AND c ~ '^[.#bDk^SVoTE$]+$'
     AND public.fortress_count(c, 'E') = 1
     AND public.fortress_count(c, '$') = 1
     AND public.fortress_count(c, 'T') IN (0, 2)
     AND public.fortress_cost(c) <= 80;
END;
$$;

-- --- pevnosti ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fortresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Jedna pevnosť na hráča.
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  grid jsonb NOT NULL,
  -- Záznam behu, ktorým majiteľ dokázal, že sa pevnosť dá prejsť.
  proof jsonb,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fortress_grid_valid CHECK (public.fortress_grid_ok(grid)),
  CONSTRAINT fortress_published_needs_proof
    CHECK (NOT published OR (proof IS NOT NULL AND proof->>'cells' = grid->>'cells')),
  CONSTRAINT fortress_proof_size CHECK (proof IS NULL OR octet_length(proof::text) <= 32000)
);

ALTER TABLE public.fortresses ENABLE ROW LEVEL SECURITY;

-- Zmena mapy bez nového dôkazu pevnosť stiahne. Inak by sa dala zverejniť
-- prejditeľná pevnosť a potom potichu zamurovať poklad.
CREATE OR REPLACE FUNCTION public.fortress_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.owner_id := OLD.owner_id;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  IF NEW.grid IS DISTINCT FROM OLD.grid AND NEW.proof IS NOT DISTINCT FROM OLD.proof THEN
    NEW.proof := NULL;
    NEW.published := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fortress_before_update ON public.fortresses;
CREATE TRIGGER fortress_before_update
  BEFORE UPDATE ON public.fortresses
  FOR EACH ROW EXECUTE FUNCTION public.fortress_before_update();

DROP POLICY IF EXISTS "Fortress: owner or published" ON public.fortresses;
CREATE POLICY "Fortress: owner or published"
  ON public.fortresses FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR (published AND NOT public.blocked_for_me(owner_id)));

DROP POLICY IF EXISTS "Fortress: owner inserts" ON public.fortresses;
CREATE POLICY "Fortress: owner inserts"
  ON public.fortresses FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Fortress: owner updates" ON public.fortresses;
CREATE POLICY "Fortress: owner updates"
  ON public.fortresses FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Fortress: owner deletes" ON public.fortresses;
CREATE POLICY "Fortress: owner deletes"
  ON public.fortresses FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Dôkaz sa dá zapísať, ale nie prečítať — ani majiteľom cez API. Je to
-- záznam cesty k pokladu; kto by ho videl, pevnosť by prešiel naslepo.
-- RLS stráži riadky, nie stĺpce, preto práva na stĺpce.
REVOKE ALL ON public.fortresses FROM anon;
REVOKE SELECT ON public.fortresses FROM authenticated;
GRANT SELECT (id, owner_id, grid, published, created_at, updated_at)
  ON public.fortresses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fortresses TO authenticated;

-- --- nájazdy ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fortress_raids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fortress_id uuid NOT NULL REFERENCES public.fortresses(id) ON DELETE CASCADE,
  raider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  success boolean NOT NULL,
  time_ms integer NOT NULL CHECK (time_ms BETWEEN 0 AND 60000),
  trap_hits integer NOT NULL DEFAULT 0 CHECK (trap_hits BETWEEN 0 AND 500),
  replay jsonb NOT NULL CHECK (octet_length(replay::text) <= 32000),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Neúspešný nájazd je vždy celých 60 sekúnd — tak to počíta engine.
  CONSTRAINT raid_fail_is_full_time CHECK (success OR time_ms = 60000)
);

CREATE INDEX IF NOT EXISTS fortress_raids_fortress_idx
  ON public.fortress_raids (fortress_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fortress_raids_raider_idx
  ON public.fortress_raids (raider_id, created_at DESC);

ALTER TABLE public.fortress_raids ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fortress_raid_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.fortresses%ROWTYPE;
  recent integer;
BEGIN
  -- Trigger beží pred kontrolou RLS, takže totožnosť overíme sami a hneď
  -- ako prvú — inak by pokus zapísať nájazd za majiteľa skončil hláškou
  -- o vlastnej pevnosti, čo je pravda, ale nie ten dôvod.
  IF NEW.raider_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Nájazd sa dá zapísať len za seba.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO f FROM public.fortresses WHERE id = NEW.fortress_id;

  IF NOT FOUND OR NOT f.published THEN
    RAISE EXCEPTION 'Táto pevnosť sa teraz nedá vykradnúť.' USING ERRCODE = 'check_violation';
  END IF;
  IF f.owner_id = NEW.raider_id THEN
    RAISE EXCEPTION 'Vlastnú pevnosť vykradnúť nejde.' USING ERRCODE = 'check_violation';
  END IF;
  IF public.is_blocked_between(f.owner_id, NEW.raider_id) THEN
    RAISE EXCEPTION 'Táto pevnosť sa teraz nedá vykradnúť.' USING ERRCODE = 'check_violation';
  END IF;
  -- Nájazd sa musel hrať na mape, ktorá v pevnosti naozaj je.
  IF NEW.replay->>'cells' IS DISTINCT FROM f.grid->>'cells' THEN
    RAISE EXCEPTION 'Pevnosť sa medzitým zmenila. Skús nájazd znova.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO recent
    FROM public.fortress_raids
   WHERE raider_id = NEW.raider_id
     AND created_at > now() - interval '10 minutes';
  IF recent >= 30 THEN
    RAISE EXCEPTION 'Pomaly — daj si chvíľu pauzu a potom útoč ďalej.' USING ERRCODE = 'check_violation';
  END IF;

  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fortress_raid_before_insert ON public.fortress_raids;
CREATE TRIGGER fortress_raid_before_insert
  BEFORE INSERT ON public.fortress_raids
  FOR EACH ROW EXECUTE FUNCTION public.fortress_raid_before_insert();

-- Úspešný nájazd dá majiteľovi vedieť: „Jakub vykradol tvoju pevnosť za 34 s!"
-- Ako oznámenie, nie ako príspevok do spoločného feedu: veta je písaná
-- majiteľovi („tvoju") a pri desiatich pokusoch za večer by feed zaplavila.
-- Neprečítané oznámenie od toho istého nájazdníka sa nahradí najnovším.
CREATE OR REPLACE FUNCTION public.fortress_raid_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE owner uuid;
BEGIN
  IF NOT NEW.success THEN
    RETURN NEW;
  END IF;
  SELECT owner_id INTO owner FROM public.fortresses WHERE id = NEW.fortress_id;

  DELETE FROM public.notifications
   WHERE user_id = owner AND from_user_id = NEW.raider_id
     AND type = 'fortress_raid' AND NOT read;

  INSERT INTO public.notifications (user_id, type, from_user_id, message)
  VALUES (owner, 'fortress_raid', NEW.raider_id, NEW.time_ms::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fortress_raid_after_insert ON public.fortress_raids;
CREATE TRIGGER fortress_raid_after_insert
  AFTER INSERT ON public.fortress_raids
  FOR EACH ROW EXECUTE FUNCTION public.fortress_raid_after_insert();

DROP POLICY IF EXISTS "Raid: raider inserts own" ON public.fortress_raids;
CREATE POLICY "Raid: raider inserts own"
  ON public.fortress_raids FOR INSERT TO authenticated
  WITH CHECK (raider_id = auth.uid());

-- Nájazd vidí ten, kto útočil, a majiteľ pevnosti. Nikto iný.
DROP POLICY IF EXISTS "Raid: raider or owner reads" ON public.fortress_raids;
CREATE POLICY "Raid: raider or owner reads"
  ON public.fortress_raids FOR SELECT TO authenticated
  USING (
    raider_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.fortresses f
               WHERE f.id = fortress_raids.fortress_id AND f.owner_id = auth.uid())
  );

-- Výsledok nájazdu sa neprepisuje a nemaže.
REVOKE ALL ON public.fortress_raids FROM anon;
REVOKE UPDATE, DELETE ON public.fortress_raids FROM authenticated;
GRANT SELECT, INSERT ON public.fortress_raids TO authenticated;

-- --- štatistiky -------------------------------------------------------------
-- Počty sa rátajú zo všetkých nájazdov, ktoré jednotlivec sám nevidí, preto
-- SECURITY DEFINER. Vracajú len čísla, nikdy záznamy ani mená nájazdníkov.

CREATE OR REPLACE FUNCTION public.fortress_profile(_owner uuid)
RETURNS TABLE (id uuid, grid jsonb, published boolean, raids integer, successes integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.grid, f.published,
         (SELECT count(*)::int FROM public.fortress_raids r WHERE r.fortress_id = f.id),
         (SELECT count(*)::int FROM public.fortress_raids r WHERE r.fortress_id = f.id AND r.success)
    FROM public.fortresses f
   WHERE f.owner_id = _owner
     AND (f.owner_id = auth.uid() OR (f.published AND NOT public.blocked_for_me(f.owner_id)));
$$;

-- Pevnosti na vykradnutie: kamaráti prví, potom ostatní. Vlastná nie.
CREATE OR REPLACE FUNCTION public.fortress_browse()
RETURNS TABLE (
  id uuid, owner_id uuid, username text, full_name text, avatar_url text,
  grid jsonb, updated_at timestamptz, is_friend boolean,
  raids integer, successes integer, my_best_ms integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.owner_id, p.username, p.full_name, p.avatar_url,
         f.grid, f.updated_at,
         public.are_friends(auth.uid(), f.owner_id),
         (SELECT count(*)::int FROM public.fortress_raids r WHERE r.fortress_id = f.id),
         (SELECT count(*)::int FROM public.fortress_raids r WHERE r.fortress_id = f.id AND r.success),
         (SELECT min(r.time_ms)::int FROM public.fortress_raids r
           WHERE r.fortress_id = f.id AND r.raider_id = auth.uid() AND r.success)
    FROM public.fortresses f
    JOIN public.profiles p ON p.user_id = f.owner_id
   WHERE f.published
     AND f.owner_id <> auth.uid()
     AND NOT public.blocked_for_me(f.owner_id)
   ORDER BY public.are_friends(auth.uid(), f.owner_id) DESC, f.updated_at DESC
   LIMIT 60;
$$;

-- Najtvrdšie pevnosti: najnižšia úspešnosť nájazdov, aspoň 5 nájazdov —
-- aby na vrchu nebola pevnosť, ktorú raz niekto nestihol.
CREATE OR REPLACE FUNCTION public.fortress_leaderboard(_limit integer DEFAULT 10)
RETURNS TABLE (
  id uuid, owner_id uuid, username text, full_name text, avatar_url text,
  raids integer, successes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.owner_id, p.username, p.full_name, p.avatar_url,
         s.raids, s.successes
    FROM public.fortresses f
    JOIN public.profiles p ON p.user_id = f.owner_id
    JOIN LATERAL (
      SELECT count(*)::int AS raids, count(*) FILTER (WHERE r.success)::int AS successes
        FROM public.fortress_raids r WHERE r.fortress_id = f.id
    ) s ON true
   WHERE f.published
     AND s.raids >= 5
     AND NOT public.blocked_for_me(f.owner_id)
   ORDER BY s.successes::numeric / s.raids ASC, s.raids DESC
   LIMIT least(greatest(_limit, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.fortress_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fortress_browse() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fortress_leaderboard(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fortress_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fortress_browse() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fortress_leaderboard(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.fortress_raid_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fortress_raid_after_insert() FROM PUBLIC, anon, authenticated;

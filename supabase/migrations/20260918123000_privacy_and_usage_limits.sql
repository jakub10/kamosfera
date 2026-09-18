-- ============================================================================
-- Súkromie detí a stropy na zneužitie
--
--   1) Prezývka sa už neodvodzuje z e-mailu. Z adresy `jan.novak2013@…` doteraz
--      vznikol verejný profil `jan.novak2013` — celé meno aj ročník narodenia,
--      viditeľné každému prihlásenému. Nová záloha je neutrálna.
--   2) Volania platených AI služieb dostávajú strop na používateľa a hodinu,
--      aby jeden účet nedokázal prepáliť celý kredit.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Registrácia už neprezrádza e-mail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _username text;
  _full_name text;
  _suffix text;
  _attempt integer := 0;
BEGIN
  _username := nullif(trim(NEW.raw_user_meta_data->>'username'), '');
  _full_name := nullif(trim(NEW.raw_user_meta_data->>'full_name'), '');

  -- Registrácia cez Google neposiela vlastnú prezývku. Radšej neutrálne meno
  -- ako kus e-mailovej adresy na verejnom profile.
  IF _username IS NULL THEN
    LOOP
      _suffix := lpad((floor(random() * 10000))::int::text, 4, '0');
      _username := 'kamos_' || _suffix;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = _username);
      _attempt := _attempt + 1;
      IF _attempt > 20 THEN
        _username := 'kamos_' || replace(NEW.id::text, '-', '');
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF _full_name IS NULL THEN
    _full_name := _username;
  END IF;

  INSERT INTO public.profiles (user_id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    _username,
    _full_name,
    'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;


-- ---------------------------------------------------------------------------
-- 2) Stropy na volania platených AI služieb
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_feature_idx
  ON public.ai_usage (user_id, feature, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Zapisuje a číta výhradne edge funkcia cez service-role kľúč.
DROP POLICY IF EXISTS "No direct access to ai usage" ON public.ai_usage;
CREATE POLICY "No direct access to ai usage"
  ON public.ai_usage AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Zaznamená volanie a povie, či je používateľ ešte pod limitom.
-- Vracia true, keď volanie prejsť smie.
CREATE OR REPLACE FUNCTION public.record_ai_usage(
  _user_id uuid,
  _feature text,
  _limit integer,
  _window interval DEFAULT interval '1 hour'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _used integer;
BEGIN
  DELETE FROM public.ai_usage WHERE created_at < now() - interval '24 hours';

  SELECT count(*) INTO _used
    FROM public.ai_usage u
   WHERE u.user_id = _user_id
     AND u.feature = _feature
     AND u.created_at > now() - _window;

  IF _used >= _limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_usage (user_id, feature) VALUES (_user_id, _feature);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_usage(uuid, text, integer, interval)
  FROM PUBLIC, anon, authenticated;

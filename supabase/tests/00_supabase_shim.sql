-- Minimálna náhrada Supabase prostredia pre lokálne testy.
-- Nepoužíva sa v produkcii — slúži len na to, aby sa dali migrácie prehrať
-- a otestovať v obyčajnom Postgrese, bez Supabase CLI a Dockeru.
-- Postup spustenia je v supabase/tests/README.md

-- Role jsou na úrovni celého clusteru, ne databáze — ať jde shim pustit
-- vícekrát na jednom serveru.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','supabase_auth_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Prepínateľná identita pre testy.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;

CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text, public boolean DEFAULT false
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  metadata jsonb
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE TABLE realtime.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text,
  extension text,
  inserted_at timestamptz DEFAULT now()
);
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;

GRANT USAGE ON SCHEMA public, auth, storage, realtime TO anon, authenticated, service_role;

CREATE PUBLICATION supabase_realtime;
CREATE OR REPLACE FUNCTION realtime.topic() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT current_setting('realtime.topic', true) $$;

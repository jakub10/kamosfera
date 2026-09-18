-- ============================================================================
-- Testy zmluvy world_seed(): svet dostane destilát človeka, nikdy jeho dáta.
-- Spúšťa sa po 01 a 02 (používa ich ľudí: Adam 1111, Bob 2222, Cudzi 3333,
-- Dana 4444; Adam–Bob a Dana–Bob sú kamaráti, Adam má Cudzího zablokovaného).
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

-- Značky, ktoré sa NESMÚ objaviť v seede. Vložíme ich všade, kde sú dáta.
UPDATE auth.users SET email = 'SENTINEL_EMAIL@test.local' WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE public.profiles SET full_name = 'SENTINEL_FULLNAME', bio = 'SENTINEL_BIO', location = 'SENTINEL_LOCATION'
 WHERE user_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO public.posts (user_id, content) VALUES ('22222222-2222-2222-2222-222222222222', 'SENTINEL_POST umřel mi králík');
DO $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM public.conversations
   WHERE least(participant_1, participant_2) = '11111111-1111-1111-1111-111111111111'
     AND greatest(participant_1, participant_2) = '22222222-2222-2222-2222-222222222222';
  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (cid, '22222222-2222-2222-2222-222222222222', 'SENTINEL_MESSAGE tajné');
END$$;

\echo '--- W1. Seed neobsahuje meno, e-mail, text príspevku ani správy ---'
DO $$
DECLARE s text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  s := public.world_seed()::text;
  PERFORM chk('seed neobsahuje e-mail',         s NOT LIKE '%SENTINEL_EMAIL%', true);
  PERFORM chk('seed neobsahuje skutočné meno',  s NOT LIKE '%SENTINEL_FULLNAME%', true);
  PERFORM chk('seed neobsahuje bio ani miesto', s NOT LIKE '%SENTINEL_BIO%' AND s NOT LIKE '%SENTINEL_LOCATION%', true);
  PERFORM chk('seed neobsahuje text príspevku', s NOT LIKE '%SENTINEL_POST%', true);
  PERFORM chk('seed neobsahuje text správy',    s NOT LIKE '%SENTINEL_MESSAGE%', true);
END$$;

\echo '--- W2. Identita prechádza: prezývka, avatar, kamaráti, spoločný čas ---'
DO $$
DECLARE j jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  j := public.world_seed();
  PERFORM chk('prezývka je v seede', j->>'name' = 'bob', true);
  PERFORM chk('growth je medzi 0 a 1', (j->>'growth')::numeric > 0 AND (j->>'growth')::numeric < 1, true);
  PERFORM chk('kamaráti sú v seede (Adam aj Dana)', jsonb_array_length(j->'friends') = 2, true);
  PERFORM chk('spoločný čas s Adamom má váhu, nie obsah',
              (SELECT count(*) FROM jsonb_array_elements(j->'shared') e
                WHERE e->>'with' = '11111111-1111-1111-1111-111111111111'
                  AND (e->>'weight')::numeric > 0) = 1, true);
  PERFORM chk('nálada je zatiaľ null (nie 0 — neznáme nie je smutné)', j->'traits'->'mood' = 'null'::jsonb, true);
  PERFORM chk('správanie je oddelené od growth', j ? 'conduct' AND j->'conduct' ? 'withdrawn', true);
END$$;

\echo '--- W3. Cudzí seed vidí len kamarát; blokovaný nikdy ---'
DO $$
DECLARE denied boolean := false; j jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  j := public.world_seed('22222222-2222-2222-2222-222222222222');
  PERFORM chk('kamarát dostane seed kamaráta', j->>'name' = 'bob', true);

  BEGIN
    PERFORM public.world_seed('44444444-4444-4444-4444-444444444444'); -- Dana nie je Adamov kamarát
  EXCEPTION WHEN OTHERS THEN denied := true;
  END;
  PERFORM chk('nekamarát seed nedostane', denied, true);

  denied := false;
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  BEGIN
    PERFORM public.world_seed('11111111-1111-1111-1111-111111111111');
  EXCEPTION WHEN OTHERS THEN denied := true;
  END;
  PERFORM chk('zablokovaný sa k seedu nedostane', denied, true);
END$$;

\echo '--- W4. Growth rastie z toho, čo človek dal ---'
DO $$
DECLARE before numeric; after numeric; pid uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
  before := (public.world_seed()->>'growth')::numeric;
  INSERT INTO public.posts (id, user_id, content) VALUES (pid, '22222222-2222-2222-2222-222222222222', 'ťažký deň');
  INSERT INTO public.likes (post_id, user_id, kind) VALUES (pid, '44444444-4444-4444-4444-444444444444', 'with_you');
  after := (public.world_seed()->>'growth')::numeric;
  PERFORM chk('„Jsem s tebou" zväčší svet toho, kto to dal', after > before, true);
END$$;

\echo ''
\echo '=== world_seed: všetky kontroly prešli ==='

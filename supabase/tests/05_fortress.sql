-- ============================================================================
-- Testy Pevnosti & Nájazdu: čo sa NESMIE podariť.
--
-- Eva (7777…) stavia pevnosť, Fero (8888…) ju vykráda, Gabo (9999…) je
-- Evou zablokovaný. Spúšťa sa po 01_messaging_security.sql — používa jeho `chk`.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

INSERT INTO auth.users (id, email) VALUES
  ('77777777-7777-7777-7777-777777777777', 'eva@test.local'),
  ('88888888-8888-8888-8888-888888888888', 'fero@test.local'),
  ('99999999-9999-9999-9999-999999999999', 'gabo@test.local')
ON CONFLICT DO NOTHING;
INSERT INTO public.user_blocks (blocker_id, blocked_id)
VALUES ('77777777-7777-7777-7777-777777777777', '99999999-9999-9999-9999-999999999999')
ON CONFLICT DO NOTHING;

-- Platná mapa: vchod, podlaha, poklad; zvyšok podlaha.
CREATE OR REPLACE FUNCTION pevnost_mapa(_zvysok text DEFAULT '') RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object('cells', rpad('E.$' || _zvysok, 256, '.'));
$$;
CREATE OR REPLACE FUNCTION pevnost_zaznam(_grid jsonb) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object('v', 1, 'cells', _grid->>'cells', 'ticks', 10,
                            'runs', '[[0,4],[6,8]]'::jsonb);
$$;

CREATE OR REPLACE FUNCTION ako(_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, false);
END $$;

\echo ''
\echo '--- P1. Mapa musí dávať zmysel — aj keď ju nepošle editor ---'
DO $$
DECLARE zly int := 0;
BEGIN
  PERFORM ako('77777777-7777-7777-7777-777777777777');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.fortresses (owner_id, grid)
    VALUES ('77777777-7777-7777-7777-777777777777', jsonb_build_object('cells', rpad('..$', 256, '.')));
  EXCEPTION WHEN check_violation THEN zly := zly + 1; END;
  BEGIN
    INSERT INTO public.fortresses (owner_id, grid)
    VALUES ('77777777-7777-7777-7777-777777777777', pevnost_mapa(repeat('#', 90)));
  EXCEPTION WHEN check_violation THEN zly := zly + 1; END;
  BEGIN
    INSERT INTO public.fortresses (owner_id, grid)
    VALUES ('77777777-7777-7777-7777-777777777777', pevnost_mapa('T'));
  EXCEPTION WHEN check_violation THEN zly := zly + 1; END;
  INSERT INTO public.fortresses (owner_id, grid)
  VALUES ('77777777-7777-7777-7777-777777777777', pevnost_mapa('#b^'));
  RESET ROLE;
  PERFORM chk('mapa bez vchodu, nad rozpočet a s osamelým teleportom neprejde', zly = 3, true);
END$$;

\echo '--- P2. Zverejniť sa dá len s dôkazom na presne tejto mape ---'
DO $$
DECLARE bez int := 0; cudzi int := 0; ok boolean;
BEGIN
  PERFORM ako('77777777-7777-7777-7777-777777777777');
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.fortresses SET published = true
     WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  EXCEPTION WHEN check_violation THEN bez := 1; END;
  BEGIN
    UPDATE public.fortresses
       SET published = true, proof = pevnost_zaznam(pevnost_mapa('###'))
     WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  EXCEPTION WHEN check_violation THEN cudzi := 1; END;
  UPDATE public.fortresses
     SET published = true, proof = pevnost_zaznam(grid)
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  SELECT published INTO ok FROM public.fortresses
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  RESET ROLE;
  PERFORM chk('bez dôkazu sa nezverejní', bez = 1, true);
  PERFORM chk('dôkaz z inej mapy neplatí', cudzi = 1, true);
  PERFORM chk('s dôkazom na tejto mape sa zverejní', ok, true);
END$$;

\echo '--- P3. Dôkaz nevidí nikto, ani majiteľ — je to návod k pokladu ---'
DO $$
DECLARE zakazane boolean := false; x jsonb;
BEGIN
  PERFORM ako('88888888-8888-8888-8888-888888888888');
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT proof INTO x FROM public.fortresses LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN zakazane := true; END;
  RESET ROLE;
  PERFORM chk('nájazdník si dôkaz neprečíta', zakazane, true);

  zakazane := false;
  PERFORM ako('77777777-7777-7777-7777-777777777777');
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT proof INTO x FROM public.fortresses LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN zakazane := true; END;
  RESET ROLE;
  PERFORM chk('ani majiteľ si ho cez API neprečíta', zakazane, true);
END$$;

\echo '--- P4. Zablokovaný pevnosť nevidí ---'
DO $$
DECLARE fero int; gabo int;
BEGIN
  PERFORM ako('88888888-8888-8888-8888-888888888888');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO fero FROM public.fortresses
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  RESET ROLE;
  PERFORM ako('99999999-9999-9999-9999-999999999999');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO gabo FROM public.fortresses
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  RESET ROLE;
  PERFORM chk('Fero Evinu pevnosť vidí', fero = 1, true);
  PERFORM chk('zablokovaný Gabo ju nevidí', gabo = 0, true);
END$$;

\echo '--- P5. Nájazd: len vlastným menom, len na skutočnej mape ---'
DO $$
DECLARE fid uuid; g jsonb; cudzie_meno boolean := false; zla_mapa boolean := false; n int;
BEGIN
  SELECT id, grid INTO fid, g FROM public.fortresses
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  PERFORM ako('88888888-8888-8888-8888-888888888888');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.fortress_raids (fortress_id, raider_id, success, time_ms, trap_hits, replay)
    VALUES (fid, '77777777-7777-7777-7777-777777777777', true, 5000, 0, pevnost_zaznam(g));
  EXCEPTION WHEN insufficient_privilege THEN cudzie_meno := true; END;
  BEGIN
    INSERT INTO public.fortress_raids (fortress_id, raider_id, success, time_ms, trap_hits, replay)
    VALUES (fid, '88888888-8888-8888-8888-888888888888', true, 5000, 0, pevnost_zaznam(pevnost_mapa()));
  EXCEPTION WHEN check_violation THEN zla_mapa := true; END;
  INSERT INTO public.fortress_raids (fortress_id, raider_id, success, time_ms, trap_hits, replay)
  VALUES (fid, '88888888-8888-8888-8888-888888888888', true, 12500, 1, pevnost_zaznam(g));
  RESET ROLE;

  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id = '77777777-7777-7777-7777-777777777777'
     AND from_user_id = '88888888-8888-8888-8888-888888888888'
     AND type = 'fortress_raid' AND message = '12500';
  PERFORM chk('nájazd za niekoho iného neprejde', cudzie_meno, true);
  PERFORM chk('nájazd na vymyslenej mape neprejde', zla_mapa, true);
  PERFORM chk('úspešný nájazd dá Eve vedieť, aj s časom', n = 1, true);
END$$;

\echo '--- P6. Vlastnú pevnosť vykradnúť nejde ---'
DO $$
DECLARE fid uuid; g jsonb; vlastna boolean := false;
BEGIN
  SELECT id, grid INTO fid, g FROM public.fortresses
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  PERFORM ako('77777777-7777-7777-7777-777777777777');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.fortress_raids (fortress_id, raider_id, success, time_ms, trap_hits, replay)
    VALUES (fid, '77777777-7777-7777-7777-777777777777', true, 1000, 0, pevnost_zaznam(g));
  EXCEPTION WHEN check_violation THEN vlastna := true; END;
  RESET ROLE;
  PERFORM chk('Eva si vlastnú pevnosť nevykradne', vlastna, true);
END$$;

\echo '--- P7. Zablokovaný nevykradne ani s presnou mapou ---'
DO $$
DECLARE fid uuid; g jsonb; zakazane boolean := false;
BEGIN
  SELECT id, grid INTO fid, g FROM public.fortresses
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  PERFORM ako('99999999-9999-9999-9999-999999999999');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.fortress_raids (fortress_id, raider_id, success, time_ms, trap_hits, replay)
    VALUES (fid, '99999999-9999-9999-9999-999999999999', true, 1000, 0, pevnost_zaznam(g));
  EXCEPTION WHEN check_violation THEN zakazane := true; END;
  RESET ROLE;
  PERFORM chk('Gabo pevnosť nevykradne', zakazane, true);
END$$;

\echo '--- P8. Kto nájazd vidí, a že sa nedá prepísať ---'
DO $$
DECLARE eva int; gabo int; prepis int;
BEGIN
  PERFORM ako('77777777-7777-7777-7777-777777777777');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO eva FROM public.fortress_raids;
  RESET ROLE;
  PERFORM ako('99999999-9999-9999-9999-999999999999');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO gabo FROM public.fortress_raids;
  RESET ROLE;

  PERFORM ako('88888888-8888-8888-8888-888888888888');
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.fortress_raids SET time_ms = 1;
    GET DIAGNOSTICS prepis = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN prepis := 0; END;
  RESET ROLE;
  PERFORM chk('majiteľka vidí nájazd na svoju pevnosť', eva = 1, true);
  PERFORM chk('cudzí nevidí nič', gabo = 0, true);
  PERFORM chk('výsledok nájazdu sa nedá prepísať', prepis = 0, true);
END$$;

\echo '--- P9. Neúspech je vždy celých 60 s ---'
DO $$
DECLARE fid uuid; g jsonb; zly boolean := false;
BEGIN
  SELECT id, grid INTO fid, g FROM public.fortresses
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  PERFORM ako('88888888-8888-8888-8888-888888888888');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.fortress_raids (fortress_id, raider_id, success, time_ms, trap_hits, replay)
    VALUES (fid, '88888888-8888-8888-8888-888888888888', false, 30000, 0, pevnost_zaznam(g));
  EXCEPTION WHEN check_violation THEN zly := true; END;
  RESET ROLE;
  PERFORM chk('neúspech s kratším časom neprejde', zly, true);
END$$;

\echo '--- P10. Rebríček až od 5 nájazdov; štatistika pre profil ---'
DO $$
DECLARE fid uuid; g jsonb; pred int; po int; r int; s int; gabo int;
BEGIN
  SELECT id, grid INTO fid, g FROM public.fortresses
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  PERFORM ako('88888888-8888-8888-8888-888888888888');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO pred FROM public.fortress_leaderboard(10) WHERE id = fid;
  FOR i IN 1..4 LOOP
    INSERT INTO public.fortress_raids (fortress_id, raider_id, success, time_ms, trap_hits, replay)
    VALUES (fid, '88888888-8888-8888-8888-888888888888', false, 60000, 2, pevnost_zaznam(g));
  END LOOP;
  SELECT count(*) INTO po FROM public.fortress_leaderboard(10) WHERE id = fid;
  SELECT raids, successes INTO r, s FROM public.fortress_profile('77777777-7777-7777-7777-777777777777');
  RESET ROLE;
  PERFORM ako('99999999-9999-9999-9999-999999999999');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO gabo FROM public.fortress_profile('77777777-7777-7777-7777-777777777777');
  RESET ROLE;
  PERFORM chk('s 1 nájazdom v rebríčku nie je', pred = 0, true);
  PERFORM chk('s 5 nájazdmi v rebríčku je', po = 1, true);
  PERFORM chk('profil ukáže 5 nájazdov, 1 úspešný', r = 5 AND s = 1, true);
  PERFORM chk('zablokovaný nevidí ani štatistiku', gabo = 0, true);
END$$;

\echo '--- P11. Oznámenie od toho istého nájazdníka sa nezdvojí ---'
DO $$
DECLARE fid uuid; g jsonb; n int;
BEGIN
  SELECT id, grid INTO fid, g FROM public.fortresses
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  PERFORM ako('88888888-8888-8888-8888-888888888888');
  SET LOCAL ROLE authenticated;
  INSERT INTO public.fortress_raids (fortress_id, raider_id, success, time_ms, trap_hits, replay)
  VALUES (fid, '88888888-8888-8888-8888-888888888888', true, 9000, 0, pevnost_zaznam(g));
  RESET ROLE;
  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id = '77777777-7777-7777-7777-777777777777'
     AND type = 'fortress_raid' AND NOT read;
  PERFORM chk('stále jedno neprečítané oznámenie, s novým časom', n = 1, true);
END$$;

\echo '--- P12. Zmena mapy bez nového dôkazu pevnosť stiahne ---'
DO $$
DECLARE fid uuid; pub boolean; fero int; zakazane boolean := false; g jsonb;
BEGIN
  PERFORM ako('77777777-7777-7777-7777-777777777777');
  SET LOCAL ROLE authenticated;
  UPDATE public.fortresses SET grid = pevnost_mapa('##')
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  SELECT id, published, grid INTO fid, pub, g FROM public.fortresses
   WHERE owner_id = '77777777-7777-7777-7777-777777777777';
  RESET ROLE;
  PERFORM ako('88888888-8888-8888-8888-888888888888');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO fero FROM public.fortresses WHERE id = fid;
  BEGIN
    INSERT INTO public.fortress_raids (fortress_id, raider_id, success, time_ms, trap_hits, replay)
    VALUES (fid, '88888888-8888-8888-8888-888888888888', true, 1000, 0, pevnost_zaznam(g));
  EXCEPTION WHEN check_violation THEN zakazane := true; END;
  RESET ROLE;
  PERFORM chk('prestavaná pevnosť je stiahnutá', pub, false);
  PERFORM chk('Fero ju teraz nevidí', fero = 0, true);
  PERFORM chk('ani ju nevykradne', zakazane, true);
END$$;

\echo '--- P13. Limit nájazdov: 30 za 10 minút ---'
DO $$
DECLARE fid uuid; g jsonb; urobene int := 0; stop boolean := false; uz_mal int;
BEGIN
  SELECT count(*) INTO uz_mal FROM public.fortress_raids
   WHERE raider_id = '88888888-8888-8888-8888-888888888888'
     AND created_at > now() - interval '10 minutes';
  UPDATE public.fortresses SET proof = pevnost_zaznam(grid), published = true
   WHERE owner_id = '77777777-7777-7777-7777-777777777777'
   RETURNING id, grid INTO fid, g;
  PERFORM ako('88888888-8888-8888-8888-888888888888');
  SET LOCAL ROLE authenticated;
  FOR i IN 1..40 LOOP
    BEGIN
      INSERT INTO public.fortress_raids (fortress_id, raider_id, success, time_ms, trap_hits, replay)
      VALUES (fid, '88888888-8888-8888-8888-888888888888', false, 60000, 0, pevnost_zaznam(g));
      urobene := urobene + 1;
    EXCEPTION WHEN check_violation THEN stop := true; EXIT;
    END;
  END LOOP;
  RESET ROLE;
  PERFORM chk('po 30 nájazdoch za 10 minút stop', stop AND uz_mal + urobene = 30, true);
END$$;

DROP FUNCTION pevnost_mapa(text);
DROP FUNCTION pevnost_zaznam(jsonb);
DROP FUNCTION ako(text);

\echo ''
\echo 'Pevnosť & Nájazd: všetko prešlo.'

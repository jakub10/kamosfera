-- ============================================================================
-- Odznaky za hry sa konečne dajú získať
--
-- Desať odznakov za hry bolo v databáze, zobrazovali sa v zozname — a nikto
-- ich nikdy nedostal. `check_user_achievements` porovnávala prahy iba proti
-- `user_stats` (príspevky, lajky, komentáre, kamaráti, správy) a pre každú
-- inú kategóriu vracala `false`. Skóre z hier pritom žije inde,
-- v `user_game_stats`, a nikto tú funkciu po hre ani nevolal.
--
-- Dve diery, dve opravy:
--
-- 1. Samotná kategória `games` nepovie, o ktorú hru ide — „Dosáhni 500 bodů"
--    platí pre Snake aj pre Tower Defense, len s iným významom. Preto pribudol
--    stĺpec `game_type`. Odvodzovať to z textu popisu by fungovalo do prvého
--    preklepu.
-- 2. Po zapísaní skóre sa odznaky prepočítajú. Rovnako, ako to už roky robí
--    trigger nad `user_stats` — nie volaním zvnútra `submit_game_score`, aby
--    to platilo aj pri zmene skóre odinakiaľ.
--
-- Body za tieto odznaky (spolu 280) vstupujú do `total_points`, za ktoré sa
-- v obchode kupujú VIP veci. To je zámer: kto hrá, má si za čo kúpiť.
-- ============================================================================

-- 1) Ktorej hry sa odznak týka ------------------------------------------------
ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS game_type text;

DO $$
BEGIN
  ALTER TABLE public.achievements
    ADD CONSTRAINT achievements_game_type_valid
    CHECK (
      game_type IS NULL
      OR game_type IN ('snake', 'memory', 'tower_defense', 'clicker')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.achievements SET game_type = 'snake'
  WHERE category = 'games' AND game_type IS NULL AND description ILIKE '%Snake%';
UPDATE public.achievements SET game_type = 'tower_defense'
  WHERE category = 'games' AND game_type IS NULL AND description ILIKE '%Tower Defense%';
UPDATE public.achievements SET game_type = 'memory'
  WHERE category = 'games' AND game_type IS NULL AND description ILIKE '%Memory%';
UPDATE public.achievements SET game_type = 'clicker'
  WHERE category = 'games' AND game_type IS NULL AND description ILIKE '%Clicker%';

-- Odznak za hru bez určenej hry je odznak, ktorý nikto nezíska — presne to,
-- čo táto migrácia opravuje. Nech sa to nevráti potichu.
DO $$
DECLARE orphan text;
BEGIN
  SELECT string_agg(name, ', ') INTO orphan
  FROM public.achievements
  WHERE category = 'games' AND game_type IS NULL;

  IF orphan IS NOT NULL THEN
    RAISE EXCEPTION 'Odznak za hru bez game_type: %', orphan;
  END IF;
END $$;

-- 2) Prepočet odznakov pozná aj hry -------------------------------------------
CREATE OR REPLACE FUNCTION public.check_user_achievements(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stats_row public.user_stats%ROWTYPE;
  games_row public.user_game_stats%ROWTYPE;
  new_points integer;
BEGIN
  IF _user_id IS NULL THEN
    RETURN;
  END IF;

  -- Dieťa, ktoré zatiaľ iba hralo, nemusí mať riadok v `user_stats` — ten
  -- zakladajú až triggery od príspevkov a správ. Skôr sa tu končilo s
  -- `RETURN` a odznaky za hry by tak minulo práve toho, kto hrá najviac.
  INSERT INTO public.user_stats (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO stats_row FROM public.user_stats WHERE user_id = _user_id;
  SELECT * INTO games_row FROM public.user_game_stats WHERE user_id = _user_id;

  INSERT INTO public.user_achievements (user_id, achievement_id)
  SELECT _user_id, a.id
  FROM public.achievements a
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_achievements ua
    WHERE ua.user_id = _user_id
      AND ua.achievement_id = a.id
  )
  AND CASE a.category
    WHEN 'posts' THEN stats_row.posts_count >= a.threshold
    WHEN 'likes' THEN stats_row.likes_given >= a.threshold
    WHEN 'comments' THEN stats_row.comments_count >= a.threshold
    WHEN 'friends' THEN stats_row.friends_count >= a.threshold
    WHEN 'messages' THEN stats_row.messages_sent >= a.threshold
    WHEN 'games' THEN CASE a.game_type
      WHEN 'snake' THEN COALESCE(games_row.snake_best, 0) >= a.threshold
      WHEN 'memory' THEN COALESCE(games_row.memory_best, 0) >= a.threshold
      WHEN 'tower_defense' THEN COALESCE(games_row.tower_defense_best, 0) >= a.threshold
      WHEN 'clicker' THEN COALESCE(games_row.clicker_best, 0) >= a.threshold
      ELSE false
    END
    ELSE false
  END
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  SELECT COALESCE(sum(a.points), 0)::integer INTO new_points
  FROM public.user_achievements ua
  JOIN public.achievements a ON a.id = ua.achievement_id
  WHERE ua.user_id = _user_id;

  IF COALESCE(stats_row.total_points, 0) <> new_points THEN
    UPDATE public.user_stats
    SET total_points = new_points,
        updated_at = now()
    WHERE user_id = _user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_user_achievements(uuid) FROM PUBLIC, anon, authenticated;

-- 3) Po zapísaní skóre sa odznaky prepočítajú ---------------------------------
CREATE OR REPLACE FUNCTION public.check_achievements_on_game_stats_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_user_achievements(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_game_stats_changed_check_achievements ON public.user_game_stats;
CREATE TRIGGER on_user_game_stats_changed_check_achievements
  AFTER INSERT OR UPDATE OF snake_best, memory_best, tower_defense_best, clicker_best
  ON public.user_game_stats
  FOR EACH ROW EXECUTE FUNCTION public.check_achievements_on_game_stats_change();

-- 4) Doplnenie tým, ktorí už hrali ------------------------------------------
-- Rekordy v `user_game_stats` už existujú, len za ne nikto nič nedostal.
DO $$
DECLARE player uuid;
BEGIN
  FOR player IN SELECT user_id FROM public.user_game_stats LOOP
    PERFORM public.check_user_achievements(player);
  END LOOP;
END $$;

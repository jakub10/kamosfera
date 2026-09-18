-- ============================================================================
-- Doplnenie chýbajúcich tabuliek pre hry
--
-- `game_scores` a `user_game_stats` vznikli priamo v Supabase, nie migráciou.
-- V repozitári na ne odkazovali politiky aj funkcie, ale samotné tabuľky tam
-- neboli — čerstvá databáza sa preto z repozitára nedala postaviť a migrácie
-- sa nedali prehrať od začiatku.
--
-- Časová značka je zámerne skorá, aby sa tabuľky vytvorili skôr, než na ne
-- siahnu migrácie z mája. Na existujúcej databáze je to vďaka IF NOT EXISTS
-- prázdna operácia — nič sa neprepíše ani nezmaže.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_type text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_scores_leaderboard_idx
  ON public.game_scores (game_type, score DESC);

CREATE TABLE IF NOT EXISTS public.user_game_stats (
  user_id uuid PRIMARY KEY,
  snake_best integer NOT NULL DEFAULT 0,
  memory_best integer NOT NULL DEFAULT 0,
  tower_defense_best integer NOT NULL DEFAULT 0,
  clicker_best integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_game_stats ENABLE ROW LEVEL SECURITY;

-- Zápis prebieha výhradne cez SECURITY DEFINER funkciu submit_game_score,
-- ktorá kontroluje stropy skóre. Priamy zápis z klienta by znamenal,
-- že si rekord napíše ktokoľvek a akýkoľvek.
DROP POLICY IF EXISTS "No direct writes to game scores" ON public.game_scores;
CREATE POLICY "No direct writes to game scores"
  ON public.game_scores AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "No direct writes to game stats" ON public.user_game_stats;
CREATE POLICY "No direct writes to game stats"
  ON public.user_game_stats AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

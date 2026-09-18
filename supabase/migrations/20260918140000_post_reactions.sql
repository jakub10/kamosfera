-- ============================================================================
-- Reakcie namiesto jedného lajku
--
-- Prečo:
--   Doteraz bola jediná možná odpoveď srdiečko s počítadlom. Keď dieťa napísalo
--   niečo ťažké, kamarát mohol iba „dať tomu lajk" — čo je sociálne nesprávne,
--   takže radšej neurobil nič a ten, kto sa zveril, videl ticho.
--
--   Zároveň je počítadlo lajkov poradie, a poradie sa do Kamosveta nesmie
--   dostať v žiadnej podobe. Reakcia preto nie je skóre, ktoré zbieraš, ale
--   záznam o tom, ako si všímaš druhých: rastie z nej svet TOHO, KTO JU DAL.
--
-- Poznámka k názvu tabuľky:
--   Zostáva `likes`, hoci už nejde o lajky. Odkazujú sa na ňu triggery
--   štatistík, achievementy aj politika notifikácií — premenovanie by sa
--   rozlialo do desiatok miest bez úžitku. V UI sa hovorí o reakciách.
-- ============================================================================

-- Jedna reakcia na príspevok a človeka. Reakcia je odpoveď, nie zbierka —
-- pôvodné UNIQUE(user_id, post_id) preto zostáva v platnosti.
ALTER TABLE public.likes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'super';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'likes_kind_check') THEN
    ALTER TABLE public.likes ADD CONSTRAINT likes_kind_check CHECK (kind IN (
      'with_you',   -- 🫂 Jsem s tebou      — niekto napísal niečo ťažké
      'super',      -- ✨ To je super       — zdieľaná radosť (pôvodné srdiečko)
      'laugh',      -- 😄 Rozesmálo mě to   — humor
      'rooting',    -- 💪 Držím ti palce    — niekto do niečoho ide
      'curious'     -- 🔍 Tohle mě zaujalo  — niekto niečo ukázal alebo naučil
    ));
  END IF;
END$$;

-- Existujúce lajky sú zdieľaná radosť. Nič sa nestráca.
UPDATE public.likes SET kind = 'super' WHERE kind IS NULL;

CREATE INDEX IF NOT EXISTS likes_post_kind_idx ON public.likes (post_id, kind);

-- Zmena reakcie je bežná vec (kliknem vedľa, alebo si to rozmyslím),
-- ale vždy len na vlastnej.
DROP POLICY IF EXISTS "Users can change their own reaction" ON public.likes;
CREATE POLICY "Users can change their own reaction"
  ON public.likes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Kto reagoval, nie koľko ich bolo
--
-- V sieti pár kamarátov zo školy je „Tomáš a Bára sú s tebou" cennejšie ako
-- „7" — a zmizne tým posledné miesto, kde sa dá medzi sebou niečo porovnávať.
-- Funkcia vracia pre príspevok zoznam ľudí podľa druhu reakcie, s rešpektom
-- k blokovaniu.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_reactions(_post_id uuid)
RETURNS TABLE (
  kind text,
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  reacted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.kind, l.user_id, p.username, p.full_name, p.avatar_url, l.created_at
    FROM public.likes l
    JOIN public.profiles p ON p.user_id = l.user_id
   WHERE l.post_id = _post_id
     AND NOT public.is_blocked_between(auth.uid(), l.user_id)
   ORDER BY l.created_at;
$$;

REVOKE ALL ON FUNCTION public.post_reactions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_reactions(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- Vľúdnosť, ktorú si dal
--
-- Prvá polovica toho, z čoho raz vyrastie Kamosvet. Register správania už
-- existuje (safety_events, pridaný pri blokovaní); toto je register vľúdnosti.
-- Zámerne počíta iba to, čo človek DAL — nikdy to, čo dostal.
--
-- Vracia tvar pozornosti za obdobie, nie jednotlivé kliknutia:
--   given          — koľko reakcií rozdal
--   people         — koľkým rôznym ľuďom
--   supportive     — koľkokrát sa ozval niekomu, komu nebolo dobre
--   active_days    — v koľkých rôznych dňoch (rytmus)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kindness_given(
  _user_id uuid,
  _since timestamptz DEFAULT now() - interval '28 days'
)
RETURNS TABLE (
  given integer,
  people integer,
  supportive integer,
  active_days integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::int,
    count(DISTINCT p.user_id)::int,
    count(*) FILTER (WHERE l.kind IN ('with_you', 'rooting'))::int,
    count(DISTINCT date_trunc('day', l.created_at))::int
  FROM public.likes l
  JOIN public.posts p ON p.id = l.post_id
 WHERE l.user_id = _user_id
   AND p.user_id <> _user_id      -- reakcia na vlastný príspevok sa neráta
   AND l.created_at >= _since;
$$;

REVOKE ALL ON FUNCTION public.kindness_given(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kindness_given(uuid, timestamptz) TO authenticated;

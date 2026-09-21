-- ============================================================================
-- Doplnenie odznakov za hry
--
-- Rovnaký príbeh ako pri `game_scores` a `user_game_stats`: týchto desať
-- riadkov vzniklo 1. 2. 2026 priamo v databáze, nie migráciou. V repozitári
-- nikdy neboli, takže čerstvo postavená Kamosféra mala hry, ale žiadne
-- odznaky za ne. Vyšlo to najavo až z exportu tabuľky `achievements`.
--
-- ID sú prevzaté z toho exportu zámerne. Keby sa niekedy dotiahli aj staré
-- riadky `user_achievements`, pri hrách budú na čo ukazovať.
--
-- `WHERE NOT EXISTS` podľa názvu: na databáze, kde odznaky už sú, je to
-- prázdna operácia — nič sa neprepíše ani nezduplikuje.
--
-- POZOR: týmto odznaky ešte nikto nezískava. `check_user_achievements`
-- pozná iba kategórie posts/likes/comments/friends/messages a pre všetko
-- ostatné vracia `false`, takže kategória `games` je zatiaľ slepá vetva.
-- Tá oprava je samostatná úloha — tu ide len o to, aby sa dala databáza
-- postaviť z repozitára presne taká, aká je naživo.
-- ============================================================================

INSERT INTO public.achievements (id, name, description, icon, category, threshold, points)
SELECT v.id, v.name, v.description, v.icon, v.category, v.threshold, v.points
FROM (VALUES
  ('1777b5fe-60d5-4c3a-8ccf-f722890d38c8'::uuid, 'Had začátečník', 'Dosáhni 100 bodů ve hře Snake', '🐍', 'games', 100, 15),
  ('d79ef4cd-576c-4e91-a61b-8e9a6c1c42a7'::uuid, 'Had expert', 'Dosáhni 500 bodů ve hře Snake', '🐍', 'games', 500, 30),
  ('b9ed69d2-b5b6-48cd-8bd2-de06d3fe8997'::uuid, 'Had mistr', 'Dosáhni 1000 bodů ve hře Snake', '🐍', 'games', 1000, 50),
  ('50943793-8d1d-47a1-8ff5-248927adfe79'::uuid, 'Obránce věže', 'Dosáhni 500 bodů v Tower Defense', '🏰', 'games', 500, 15),
  ('f20b8929-fd1f-4470-bd69-7295d1817a72'::uuid, 'Strážce hradu', 'Dosáhni 2000 bodů v Tower Defense', '🏰', 'games', 2000, 30),
  ('70f94087-ad23-4df1-ad49-f3c4d5decdfd'::uuid, 'Legendární obránce', 'Dosáhni 5000 bodů v Tower Defense', '🏰', 'games', 5000, 50),
  ('43101eb7-9c47-4e7b-a281-eebdbd588bf4'::uuid, 'Paměťový nováček', 'Dosáhni 200 bodů v Memory Game', '🧠', 'games', 200, 15),
  ('0d4bc6de-c280-4c72-8271-7b4a140f843c'::uuid, 'Paměťový expert', 'Dosáhni 800 bodů v Memory Game', '🧠', 'games', 800, 30),
  ('e6e593ae-3341-4c6d-950f-c4cb4540cfd5'::uuid, 'Rychlé prsty', 'Dosáhni 500 bodů v Clicker Game', '👆', 'games', 500, 15),
  ('bfdcc7f3-4b44-4c53-a6b0-734b63755d20'::uuid, 'Klikací šampion', 'Dosáhni 2000 bodů v Clicker Game', '👆', 'games', 2000, 30)
) AS v(id, name, description, icon, category, threshold, points)
WHERE NOT EXISTS (
  SELECT 1 FROM public.achievements a WHERE a.name = v.name
);

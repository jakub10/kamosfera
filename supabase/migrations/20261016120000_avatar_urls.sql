-- Avatary uložené dřív: César (top=caesar) se nevykreslil vůbec a vousy
-- s doplňky jen náhodně (DiceBear je bez „…Probability=100" kreslí v 10 %).
UPDATE public.profiles
   SET avatar_url = regexp_replace(avatar_url, '([?&])top=caesar(&|$)', '\1top=theCaesar\2')
 WHERE avatar_url ~ '[?&]top=caesar(&|$)';

UPDATE public.profiles
   SET avatar_url = regexp_replace(avatar_url, '([?&])eyes=close(&|$)', '\1eyes=closed\2')
 WHERE avatar_url ~ '[?&]eyes=close(&|$)';

UPDATE public.profiles
   SET avatar_url = avatar_url || '&facialHairProbability=100'
 WHERE avatar_url LIKE 'https://api.dicebear.com/%'
   AND avatar_url ~ '[?&]facialHair=' AND avatar_url !~ 'facialHairProbability=';

UPDATE public.profiles
   SET avatar_url = avatar_url || '&accessoriesProbability=100'
 WHERE avatar_url LIKE 'https://api.dicebear.com/%'
   AND avatar_url ~ '[?&]accessories=' AND avatar_url !~ 'accessoriesProbability=';

UPDATE public.profiles
   SET avatar_config = jsonb_set(avatar_config, '{hair}', '"theCaesar"')
 WHERE avatar_config->>'hair' = 'caesar';

UPDATE public.profiles
   SET avatar_config = jsonb_set(avatar_config, '{eyes}', '"closed"')
 WHERE avatar_config->>'eyes' = 'close';

-- Výchozí nastavení avatara bylo z jiného stylu („variant01", „short01"…),
-- se kterým DiceBear avataaars nic nenakreslí. Editor teď neznámé hodnoty
-- nahradí sám, nové účty začínají s prázdným nastavením.
ALTER TABLE public.profiles ALTER COLUMN avatar_config SET DEFAULT '{}'::jsonb;

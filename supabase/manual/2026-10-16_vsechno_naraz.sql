-- Všechny migrace z 16. 10. 2026 najednou — pro vložení do Supabase → SQL Editor → Run.
-- Dá se spustit i opakovaně (nic se nezdvojí). Zdroj: supabase/migrations/20261016*.sql

-- ===== 20261016100000_signup_username.sql =====
-- Registrace nesmí spadnout kvůli obsazené přezdívce.
--
-- Dřív: dvě děti si vybraly „jakub" → druhému registrace skončila chybou
-- „Database error saving new user" a nevědělo proč. Teď dostane volnou
-- variantu (jakub2, jakub3, …) a přezdívku si může později změnit.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _wanted text;
  _username text;
  _full_name text;
  _n integer := 1;
BEGIN
  _wanted := lower(nullif(trim(NEW.raw_user_meta_data->>'username'), ''));
  _full_name := nullif(left(trim(NEW.raw_user_meta_data->>'full_name'), 100), '');

  -- Registrace přes Google neposílá vlastní přezdívku. Raději neutrální jméno
  -- než kus e-mailové adresy na veřejném profilu.
  IF _wanted IS NULL THEN
    _wanted := 'kamos_' || lpad((floor(random() * 10000))::int::text, 4, '0');
  END IF;
  _wanted := left(_wanted, 17);

  _username := _wanted;
  WHILE EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = _username) LOOP
    _n := _n + 1;
    _username := _wanted || _n;
    IF _n > 500 THEN
      _username := 'kamos_' || left(replace(NEW.id::text, '-', ''), 12);
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.profiles (user_id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    _username,
    COALESCE(_full_name, _username),
    'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id
  );

  RETURN NEW;
END;
$function$;

-- ===== 20261016110000_guardian_help.sql =====
-- „Potřebuju pomoct": signál důvěrníkovi bez blokování kohokoli.
--
-- Tlačítko „Tohle mi není příjemné" je u konkrétního člověka (a hned ho
-- zablokuje). Dítě ale někdy potřebuje pomoc, aniž by šlo o jednoho
-- člověka — proto stejný signál i z nastavení důvěrníka.

ALTER TABLE public.guardian_signals DROP CONSTRAINT IF EXISTS guardian_signals_kind_check;
ALTER TABLE public.guardian_signals ADD CONSTRAINT guardian_signals_kind_check
  CHECK (kind IN ('uncomfortable', 'ai_harmful', 'ai_secret', 'help'));

CREATE OR REPLACE FUNCTION public.ask_guardian_help()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  has_guardian boolean;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.guardians WHERE child_id = me AND revoked_at IS NULL) INTO has_guardian;

  -- Nejvýš 10 signálů za den (společně s „Tohle mi není příjemné").
  IF has_guardian AND (SELECT count(*) FROM public.guardian_signals
       WHERE child_id = me AND created_at > now() - interval '1 day') < 10 THEN
    INSERT INTO public.guardian_signals (child_id, kind) VALUES (me, 'help');
  END IF;

  RETURN jsonb_build_object('guardian', has_guardian);
END
$function$;

REVOKE ALL ON FUNCTION public.ask_guardian_help() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_guardian_help() TO authenticated;

-- ===== 20261016120000_avatar_urls.sql =====
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

-- ===== 20261016130000_messages_read.sql =====
-- Přečtené zprávy zůstanou přečtené.
--
-- Dřív: zprávu směl měnit jen odesílatel (politika „Users can update their
-- own messages"), takže příjemcovo „přečteno" databáze tiše zahodila. V seznamu
-- se pak zpráva po návratu znovu ukázala jako nepřečtená.
--
-- Teď to dělá funkce: označí jako přečtené jen cizí zprávy v konverzaci,
-- ve které volající sedí. Nic jiného na zprávě změnit nejde.

CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation uuid, _message uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  n integer;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.require_member();

  IF NOT EXISTS (SELECT 1 FROM public.conversations c
                  WHERE c.id = _conversation AND me IN (c.participant_1, c.participant_2)) THEN
    RAISE EXCEPTION 'V téhle konverzaci nejsi.';
  END IF;

  UPDATE public.messages m
     SET read = true
   WHERE m.conversation_id = _conversation
     AND m.sender_id <> me
     AND m.read = false
     AND (_message IS NULL OR m.id = _message);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$function$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid, uuid) TO authenticated;

-- ===== 20261016140000_group_style.sql =====
-- Skupiny dostanou vlastní ikonu a barvu, aby nebyly všechny stejné.
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS emoji text NOT NULL DEFAULT '👥'
  CHECK (char_length(emoji) BETWEEN 1 AND 8);
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'violet'
  CHECK (color IN ('violet', 'sky', 'emerald', 'amber', 'rose', 'orange', 'teal', 'indigo'));

-- ===== 20261016150000_kamos_stickers.sql =====
-- Nálepky Kamosféry v obchodě (placené). Zdarma jsou kamos-wave, kamos-thumbsup
-- a kamos-celebrate — ty v ceníku být nemusí.
INSERT INTO public.vip_items (item_id, item_type, price) VALUES
  ('kamos-chat', 'emoji', 25),
  ('kamos-thinking', 'emoji', 25),
  ('kamos-surprised', 'emoji', 25),
  ('kamos-sad', 'emoji', 25),
  ('kamos-sleep', 'emoji', 25),
  ('kamos-reading', 'emoji', 25),
  ('kamos-search', 'emoji', 25),
  ('kamos-gaming', 'emoji', 50),
  ('kamos-friends', 'emoji', 50),
  ('kamos-paint', 'emoji', 50),
  ('kamos-lost', 'emoji', 50),
  ('kamos-trophy', 'emoji', 75),
  ('kamos-vip', 'emoji', 100)
ON CONFLICT (item_id) DO UPDATE SET price = EXCLUDED.price, item_type = EXCLUDED.item_type;

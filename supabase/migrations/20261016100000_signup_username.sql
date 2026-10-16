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

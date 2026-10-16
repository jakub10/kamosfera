-- Skupiny dostanou vlastní ikonu a barvu, aby nebyly všechny stejné.
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS emoji text NOT NULL DEFAULT '👥'
  CHECK (char_length(emoji) BETWEEN 1 AND 8);
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'violet'
  CHECK (color IN ('violet', 'sky', 'emerald', 'amber', 'rose', 'orange', 'teal', 'indigo'));

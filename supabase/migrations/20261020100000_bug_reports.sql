-- Hlášení chyb z aplikace.
--
-- Kdokoli přihlášený nahlásí chybu tlačítkem „Nahlásit chybu". Hlášení vidí
-- jen tvůrci v Panelu tvůrce a odtud ho jedním klikem pošlou na GitHub
-- (repozitář je veřejný, proto ne rovnou — dítě může napsat jméno).

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 3 AND 2000),
  page text CHECK (char_length(page) <= 300),
  context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(context::text) <= 20000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'sent', 'done', 'junk')),
  github_issue integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bug_reports_status_idx ON public.bug_reports (status, created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bug_reports FROM anon, authenticated;
GRANT SELECT, UPDATE (status, github_issue), DELETE ON public.bug_reports TO authenticated;

DROP POLICY IF EXISTS "Tvůrci vidí hlášení" ON public.bug_reports;
CREATE POLICY "Tvůrci vidí hlášení" ON public.bug_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'creator'));
DROP POLICY IF EXISTS "Tvůrci mění stav" ON public.bug_reports;
CREATE POLICY "Tvůrci mění stav" ON public.bug_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'creator')) WITH CHECK (public.has_role(auth.uid(), 'creator'));
DROP POLICY IF EXISTS "Tvůrci mažou" ON public.bug_reports;
CREATE POLICY "Tvůrci mažou" ON public.bug_reports FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'creator'));

-- Zápis jen přes funkci: nejvýš 10 hlášení za hodinu od jednoho člověka.
CREATE OR REPLACE FUNCTION public.report_bug(_message text, _page text DEFAULT NULL, _context jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  new_id bigint;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nejdřív se přihlas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(btrim(COALESCE(_message, ''))) < 3 THEN
    RAISE EXCEPTION 'Napiš aspoň pár slov, co se stalo.';
  END IF;
  IF (SELECT count(*) FROM public.bug_reports WHERE user_id = me AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'Moc hlášení za sebou. Zkus to za chvíli.';
  END IF;

  INSERT INTO public.bug_reports (user_id, message, page, context)
  VALUES (me, left(btrim(_message), 2000), left(_page, 300),
          CASE WHEN octet_length(COALESCE(_context, '{}'::jsonb)::text) <= 20000 THEN COALESCE(_context, '{}'::jsonb)
               ELSE jsonb_build_object('note', 'kontext byl moc dlouhý') END)
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('id', new_id);
END
$function$;

REVOKE ALL ON FUNCTION public.report_bug(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_bug(text, text, jsonb) TO authenticated;

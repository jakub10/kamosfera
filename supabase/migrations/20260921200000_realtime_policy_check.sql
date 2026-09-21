-- ============================================================================
-- Posledné slovo: platí ochrana odberov naživo?
--
-- Politika na `realtime.messages` drží, že dieťa si môže prihlásiť odber iba
-- svojich konverzácií a skupín. Bez nej si ktokoľvek prihlási odber cudzieho
-- kanála a číta správy, ako prichádzajú — RLS na `public.messages` to
-- nezachytí, lebo tá stráži čítanie tabuľky, nie odber kanála.
--
-- Tá tabuľka patrí Supabase a v novom projekte na ňu SQL editor nemusí mať
-- práva. Vtedy sa politika nevytvorí a je lepšie to vedieť hneď, než na to
-- prísť, keď si deti začnú písať.
-- ============================================================================

DO $$
DECLARE ma_politiku boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
      AND policyname = 'Users can subscribe to their own realtime topics'
  ) INTO ma_politiku;

  IF ma_politiku THEN
    RAISE NOTICE 'Odbery naživo sú chránené. Všetko v poriadku.';
  ELSE
    RAISE WARNING '%', E'\n'
      || '  ============================================================\n'
      || '  POZOR: ochrana odberov naživo NEPLATÍ.\n'
      || '\n'
      || '  Politika na realtime.messages sa nevytvorila — na tú tabuľku\n'
      || '  nemá SQL editor práva. Kým to neplatí, môže si ktokoľvek\n'
      || '  prihlásiť odber cudzej konverzácie a čítať ju, ako prichádza.\n'
      || '\n'
      || '  Zvyšok databázy je v poriadku a appka pobeží. Toto treba\n'
      || '  dorobiť zvlášť — postup je v docs/PRECHOD-NA-VLASTNI-SUPABASE.md\n'
      || '  v časti "Ochrana odberov naživo".\n'
      || '  ============================================================';
  END IF;
END $$;

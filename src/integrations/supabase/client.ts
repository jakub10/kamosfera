// Tenhle soubor kdysi generovalo Lovable ("do not edit directly"). Od
// přechodu na vlastní Supabase projekt ho držíme my — a stojí v něm věci,
// které generátor neumí (hlášení chybějícího nastavení, úložiště sezení).
// Když ho něco přepíše, je potřeba to sem vrátit.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { cleanEnvValue, describeConfig } from './config';

// Kopírování z dashboardu občas přinese i neviditelné znaky. Ty pryč —
// s nimi klíč funguje dál. Co zbude, prověří `describeConfig`.
const SUPABASE_URL = cleanEnvValue(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_PUBLISHABLE_KEY = cleanEnvValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

/**
 * Chybí nastavení? Řekni to nahlas.
 *
 * Hodnoty se do aplikace zapékají při buildu. Když je prostředí nemá (na
 * Vercelu chybí proměnné, lokálně chybí `.env`), `createClient` by rovnou
 * vyhodil výjimku, celý modul by se nenačetl a dítě by vidělo bílou
 * obrazovku bez jediného vodítka. Tenhle příznak čte `main.tsx` a místo
 * prázdna ukáže, co je potřeba nastavit.
 */
export const supabaseConfig = describeConfig(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
export const supabaseConfigMissing = supabaseConfig.kind !== 'ok';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// Zástupné hodnoty drží modul při životě, aby se aplikace vůbec načetla a
// stihla vysvětlit, co chybí. Žádný požadavek se s nimi nikam nedostane.
export const supabase = createClient<Database>(
  supabaseConfig.kind === 'ok' ? SUPABASE_URL : 'https://nenastaveno.invalid',
  supabaseConfig.kind === 'ok' ? SUPABASE_PUBLISHABLE_KEY : 'nenastaveno',
  {
    auth: {
      // Sezení drží prohlížeč. Dřív tu byl broker, který ho přes postMessage
      // sdílel s editorem Lovable — to dávalo smysl jen na jejich hostingu.
      // Vlastní Supabase projekt nic takového nepotřebuje.
      storage: typeof window === 'undefined' ? undefined : window.localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

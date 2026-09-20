import { supabase } from '@/integrations/supabase/client';

/**
 * Přihlášení přes Google.
 *
 * Dřív to tudy neteklo přímo: balík `@lovable.dev/cloud-auth-js` posílal
 * prohlížeč na **relativní** cestu `/~oauth/initiate`, což je serverová
 * infrastruktura Lovable. Na jejich hostingu existuje, na Vercelu ne —
 * a přihlášení končilo na 404.
 *
 * Od chvíle, kdy Kamosféra běží na vlastním Supabase projektu, není důvod
 * mít dvě cesty. Zůstala jedna, nativní, která funguje na libovolné doméně.
 * Podmínkou je nastavený Google provider v Supabase (viz README).
 */

/** Hláška ze Supabase, když Google není v projektu zapnutý. */
export function isProviderDisabled(message: string | undefined): boolean {
  return /provider is not enabled|unsupported provider/i.test(message ?? '');
}

export interface GoogleSignInResult {
  error: Error | null;
  /** Prohlížeč odchází pryč — komponenta už nemá co dělat. */
  redirected: boolean;
  /** Google není v Supabase zapnutý; potřeba nastavení, ne další pokus. */
  needsSetup: boolean;
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });

  return {
    error,
    redirected: !error,
    needsSetup: isProviderDisabled(error?.message),
  };
}

import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';

/**
 * Přihlášení přes Google, ať aplikace běží kdekoli.
 *
 * Proč to není jednořádkové: balík @lovable.dev/cloud-auth-js posílá
 * prohlížeč na **relativní** cestu `/~oauth/initiate`. To je Lovableova
 * serverová infrastruktura — na jejich hostingu ta cesta existuje, na
 * Vercelu ne, takže přihlášení skončilo na 404.
 *
 * Takže: na Lovable surface necháme broker (sdílí přihlášení s editorem),
 * všude jinde jdeme nativně přes Supabase, což funguje na libovolné doméně.
 */

// Stejný seznam, jaký používá previewAuthStorage.ts.
const LOVABLE_ZONES = [
  'lovableproject.com',
  'lovableproject-dev.com',
  'lovable.app',
  'gpt-eng.com',
  'gptengineer.run',
];

export function onLovableHost(host = typeof window === 'undefined' ? '' : window.location.hostname): boolean {
  return LOVABLE_ZONES.some((zone) => host === zone || host.endsWith('.' + zone));
}

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
  if (onLovableHost()) {
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
    });
    return {
      error: result.error ?? null,
      redirected: Boolean(result.redirected),
      needsSetup: false,
    };
  }

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

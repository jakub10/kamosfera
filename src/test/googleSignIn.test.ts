import { describe, it, expect } from 'vitest';
import { isProviderDisabled } from '@/lib/googleSignIn';

/**
 * Přihlášení přes Google jde jednou cestou — nativně přes Supabase. Dřív tu
 * byla ještě druhá, Lovable broker na relativní `/~oauth/initiate`; mimo
 * jejich hosting ta cesta neexistuje a uživatel skončil na 404. S vlastním
 * Supabase projektem není co větvit.
 */
describe('Google není zapnutý v Supabase', () => {
  it('pozná hlášku a nabídne nastavení místo dalšího pokusu', () => {
    expect(isProviderDisabled('Unsupported provider: provider is not enabled')).toBe(true);
    expect(isProviderDisabled('provider is not enabled')).toBe(true);
  });

  it('běžnou chybu za to nepovažuje', () => {
    expect(isProviderDisabled('Network request failed')).toBe(false);
    expect(isProviderDisabled(undefined)).toBe(false);
  });
});

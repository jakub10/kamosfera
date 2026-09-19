import { describe, it, expect } from 'vitest';
import { onLovableHost, isProviderDisabled } from '@/lib/googleSignIn';

/**
 * Lovable posílá přihlášení na relativní `/~oauth/initiate`, což je jejich
 * serverová cesta. Mimo jejich hosting neexistuje a uživatel skončí na 404 —
 * přesně to se stalo na Vercelu. Tohle hlídá, že broker použijeme jen tam,
 * kde opravdu je.
 */
describe('kde použít Lovable broker', () => {
  it.each([
    'preview--abc.lovable.app',
    'id-preview--x.lovableproject.com',
    'lovable.app',
    'neco.gpt-eng.com',
  ])('na Lovable hostingu ano: %s', (host) => {
    expect(onLovableHost(host)).toBe(true);
  });

  it.each([
    'kamosfera.vercel.app',
    'kamosfera.cz',
    'localhost',
    'lovable.app.zlyweb.cz',
  ])('jinde ne: %s', (host) => {
    expect(onLovableHost(host)).toBe(false);
  });
});

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

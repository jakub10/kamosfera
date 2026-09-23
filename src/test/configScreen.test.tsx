import { describe, it, expect, vi } from 'vitest';

/**
 * Když nastavení nesedí, nesmí zbýt bílá obrazovka. A u poškozeného klíče
 * nesmí zbýt ani hláška o ISO-8859-1, ze které nikdo nepozná, že jde o klíč.
 */
vi.mock('@/integrations/supabase/client', () => ({
  supabaseConfig: { kind: 'key-not-header-safe', bad: '…', code: 'U+2026' },
  supabaseConfigMissing: true,
  supabase: {},
}));

describe('poškozený klíč', () => {
  it('řekne, co je špatně, a jak to spravit', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('@/main');
    await new Promise((r) => setTimeout(r, 50));
    const t = document.getElementById('root')!.textContent || '';

    expect(t).toContain('Klíč k databázi je poškozený');
    expect(t).toContain('U+2026');
    // Musí padnout návod, ne jen konstatování.
    expect(t).toContain('Copy');
    expect(t).toContain('Environment Variables');
    // A připomínka, že bez nového nasazení se nic nezmění.
    expect(t).toContain('zapékají');
  });
});

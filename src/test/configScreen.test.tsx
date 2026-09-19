import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabaseConfigMissing: true, supabase: {} }));
describe('chybejici nastaveni', () => {
  it('ukaze stranku misto bile obrazovky', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('@/main');
    await new Promise(r => setTimeout(r, 50));
    const t = document.getElementById('root')!.textContent || '';
    expect(t).toContain('chybí nastavení');
    expect(t).toContain('VITE_SUPABASE_URL');
    expect(t).toContain('Environment Variables');
  });
});

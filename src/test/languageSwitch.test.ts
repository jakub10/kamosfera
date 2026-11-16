import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';

describe('přepínání jazyka', () => {
  it('začíná česky, ať má prohlížeč nastavené cokoli', () => {
    expect(i18n.language).toBe('cs');
  });

  it('po přepnutí překládá a volbu si zapamatuje', async () => {
    const cesky = i18n.t('common.language');
    await i18n.changeLanguage('en');
    expect(i18n.t('common.language')).toBe('Language');
    expect(window.localStorage.getItem('kamosfera-lang')).toBe('en');
    await i18n.changeLanguage('cs');
    expect(i18n.t('common.language')).toBe(cesky);
  });
});

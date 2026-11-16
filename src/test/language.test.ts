import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';

describe('jazyk', () => {
  it('je vždy čeština, ať má prohlížeč nastavené cokoli', () => {
    expect(i18n.language).toBe('cs');
  });
});

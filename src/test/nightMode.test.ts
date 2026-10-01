import { describe, expect, it } from 'vitest';
import { isNightNow } from '@/lib/childSafety';

// Čas v Prahe a Bratislave: v októbri UTC+2, v decembri UTC+1.
describe('nočný režim 22:00 – 6:30', () => {
  it('večer od 22:00 je noc', () => {
    expect(isNightNow(new Date('2026-10-01T19:59:00Z'))).toBe(false); // 21:59
    expect(isNightNow(new Date('2026-10-01T20:00:00Z'))).toBe(true); // 22:00
  });

  it('ráno o 6:30 sa Kamosféra zobudí', () => {
    expect(isNightNow(new Date('2026-10-02T04:29:00Z'))).toBe(true); // 6:29
    expect(isNightNow(new Date('2026-10-02T04:30:00Z'))).toBe(false); // 6:30
  });

  it('platí aj v zimnom čase', () => {
    expect(isNightNow(new Date('2026-12-15T21:30:00Z'))).toBe(true); // 22:30
    expect(isNightNow(new Date('2026-12-15T11:00:00Z'))).toBe(false); // 12:00
  });
});

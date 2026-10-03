import { describe as suite, expect, it } from 'vitest';
import { describe, type LogEntry } from '@/games/starpatrol/api';

const names = ['Jakub', 'Evka', 'Fero', 'Maja'];
const name = (s: number | null) => (s == null ? '?' : names[s]);
const entry = (e: Partial<LogEntry>): LogEntry => ({ id: 1, turn: 1, kind: 'turn', a: null, b: null, info: {}, secret: null, ...e });

suite('Hvězdná hlídka — deník', () => {
  it('popíše zásah laserem jmény hráčů', () => {
    expect(describe(entry({ kind: 'laser_hit', a: 0, b: 2 }), name)).toBe('⚡ Jakub → Fero: zásah laserem, −1 energie');
  });

  it('ukradenou kartu z ruky pojmenuje jen tomu, kdo ji smí vidět', () => {
    const pub = entry({ kind: 'steal', a: 1, b: 3, info: { from: 'hand' } });
    expect(describe(pub, name)).toBe('🧲 Evka → Maja: ukradená karta z ruky');
    expect(describe({ ...pub, secret: { kind: 'shield' } }, name)).toContain('(Štít)');
  });

  it('při vypadnutí prozradí roli', () => {
    expect(describe(entry({ kind: 'out', a: 2, info: { role: 'pirate', why: 'laser' } }), name)).toContain('Pirát');
  });

  it('zná všechny tři konce hry', () => {
    for (const w of ['crew', 'pirates', 'ai']) {
      expect(describe(entry({ kind: 'win', info: { winner: w } }), name)).not.toContain('Konec hry');
    }
  });
});

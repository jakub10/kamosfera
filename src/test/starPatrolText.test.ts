import { describe as suite, expect, it } from 'vitest';
import { describe, type LogEntry } from '@/games/starpatrol/api';

const names = ['Jakub', 'Evka', 'Fero', 'Maja'];
const name = (s: number | null) => (s == null ? '?' : names[s]);
const entry = (e: Partial<LogEntry>): LogEntry => ({ id: 1, turn: 1, kind: 'turn', a: null, b: null, info: {}, secret: null, ...e });

suite('Hviezdna Hliadka — denník', () => {
  it('opíše zásah laserom menami hráčov', () => {
    expect(describe(entry({ kind: 'laser_hit', a: 0, b: 2 }), name)).toBe('⚡ Jakub → Fero: zásah laserom, −1 energia');
  });

  it('ukradnutú kartu z ruky pomenuje len tomu, kto ju smie vidieť', () => {
    const pub = entry({ kind: 'steal', a: 1, b: 3, info: { from: 'hand' } });
    expect(describe(pub, name)).toBe('🧲 Evka → Maja: ukradnutá karta z ruky');
    expect(describe({ ...pub, secret: { kind: 'shield' } }, name)).toContain('(Štít)');
  });

  it('pri vypadnutí prezradí rolu', () => {
    expect(describe(entry({ kind: 'out', a: 2, info: { role: 'pirate', why: 'laser' } }), name)).toContain('Pirát');
  });

  it('pozná všetky tri konce hry', () => {
    for (const w of ['crew', 'pirates', 'ai']) {
      expect(describe(entry({ kind: 'win', info: { winner: w } }), name)).not.toContain('Koniec hry');
    }
  });
});

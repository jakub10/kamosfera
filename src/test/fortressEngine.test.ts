import { describe, it, expect } from 'vitest';
import {
  W, H, BUDGET, RUN_TICKS, MOVE_EVERY, SPIKE_PENALTY, SAW_PENALTY, TICK_MS,
  emptyCells, gridProblems, gridCost, initRun, step, simulate, resultOf, encodeInput,
  compressInputs, expandInputs, makeReplay, replayResult, replayMatches, remainingTicks,
  type Dir,
} from '@/games/fortress/engine';

/** Mapa z niekoľkých riadkov; zvyšok doplní podlahou. */
function map(rows: string[]): string {
  const out: string[] = [];
  for (let y = 0; y < H; y++) out.push((rows[y] ?? '').padEnd(W, '.').slice(0, W));
  return out.join('');
}

const U = 1 as Dir, R = 2 as Dir, D = 3 as Dir, L = 4 as Dir;
const idle = (n: number) => Array(n).fill(encodeInput({ dir: 0, act: false }));
/** Drží smer presne na `n` krokov po políčkach. */
const hold = (dir: Dir, n: number) => Array(n * MOVE_EVERY).fill(encodeInput({ dir, act: false }));
const holdAct = (dir: Dir, ticks: number) => Array(ticks).fill(encodeInput({ dir, act: true }));

describe('mapa', () => {
  it('prázdna pevnosť sa dá hrať', () => {
    expect(gridProblems(emptyCells())).toEqual([]);
  });
  it('bez vchodu, s dvoma pokladmi a s osamelým teleportom nie', () => {
    expect(gridProblems(map(['$..$', 'T']))).toEqual([
      'Chýba vchod.',
      'Poklad môže byť len jeden.',
      'Teleport potrebuje pár — polož ešte jeden.',
    ]);
  });
  it('stráži rozpočet', () => {
    const walls = Math.ceil(BUDGET / 1) + 1;
    const cells = map(['E$' + '#'.repeat(14)]).split('');
    for (let i = 16; i < 16 + walls; i++) cells[i] = '#';
    const c = cells.join('');
    expect(gridCost(c)).toBeGreaterThan(BUDGET);
    expect(gridProblems(c).some((p) => p.startsWith('Prekročený rozpočet'))).toBe(true);
  });
});

describe('pohyb', () => {
  it('jeden krok po políčku za MOVE_EVERY tickov', () => {
    const s = simulate(map(['E']), hold(R, 5));
    expect([s.px, s.py]).toEqual([5, 0]);
  });
  it('stena ani okraj mapy nepustia', () => {
    expect(simulate(map(['E#']), hold(R, 3)).px).toBe(0);
    expect(simulate(map(['E']), hold(U, 3)).py).toBe(0);
  });
});

describe('bloky', () => {
  it('lámateľná stena padne na druhý úder', () => {
    const s = initRun(map(['Eb']));
    step(s, { dir: R, act: true });
    expect(s.cells[1]).toBe('b');
    expect(s.events).toContain('crack');
    const rest = simulate(map(['Eb']), holdAct(R, 7));
    expect(rest.cells[1]).toBe('.');
    expect(rest.px).toBe(1);
  });
  it('dvere bez kľúča nepustia, s kľúčom sa otvoria a kľúč sa minie', () => {
    const cells = map(['ED', 'k']);
    expect(simulate(cells, hold(R, 2)).px).toBe(0);
    const s = simulate(cells, [...hold(D, 1), ...hold(U, 1), ...hold(R, 1)]);
    expect([s.px, s.py]).toEqual([1, 0]);
    expect(s.keys).toBe(0);
  });
});

describe('pasce', () => {
  it('bodce uberú čas raz, nie za každý tick státia', () => {
    const s = simulate(map(['E^']), [...hold(R, 1), ...idle(20)]);
    expect(s.penalty).toBe(SPIKE_PENALTY);
    expect(s.hits).toBe(1);
  });

  it('falošná podlaha: pád, späť k vchodu, a diera je odteraz vidieť', () => {
    const s = simulate(map(['Eo']), [...hold(R, 1), ...idle(15), ...hold(R, 2)]);
    expect([s.px, s.py]).toEqual([0, 0]);
    expect(s.hits).toBe(1);
    expect(s.revealed[1]).toBe(true);
  });

  it('teleport prenesie na pár a hneď nevráti späť', () => {
    const cells = map(['ET', '', '', '', '', '.....T']);
    const s = simulate(cells, hold(R, 1));
    expect([s.px, s.py]).toEqual([5, 5]);
    const s2 = simulate(cells, [...hold(R, 1), ...idle(5)]);
    expect([s2.px, s2.py]).toEqual([5, 5]);
    const s3 = simulate(cells, [...hold(R, 2), ...hold(L, 1)]);
    expect([s3.px, s3.py]).toEqual([1, 0]);
  });

  it('píla hliadkuje: na konci trasy sa otočí', () => {
    const s = initRun(map(['E....S..#']));
    const xs: number[] = [];
    for (let t = 1; t <= 20; t++) {
      step(s, { dir: 0, act: false });
      if (t % 4 === 0) xs.push(s.saws[0].x);
    }
    expect(xs).toEqual([6, 7, 6, 5, 4]);
  });

  it('píla zasiahne raz a potom chvíľu nie — inak by zjedla celý čas', () => {
    const s = initRun(map(['E.S#']));
    for (let t = 0; t < 30; t++) step(s, { dir: 0, act: false });
    expect(s.hits).toBe(1);
    expect(s.penalty).toBe(SAW_PENALTY);
    for (let t = 0; t < 11; t++) step(s, { dir: 0, act: false });
    expect(s.hits).toBe(2);
  });

  it('cez pílu sa nedá prekĺznuť — výmena miest v jednom kroku je tiež zásah', () => {
    const s = simulate(map(['.ES#']), [...idle(3), encodeInput({ dir: R, act: false })]);
    expect(s.hits).toBe(1);
  });
});

describe('nájazd', () => {
  it('poklad a späť k vchodu = výhra; čas sa počíta v tickoch', () => {
    const s = simulate(map(['E.$']), [...hold(R, 2), ...hold(L, 2)]);
    expect(s.status).toBe('won');
    expect(resultOf(s)).toEqual({ success: true, timeMs: 10 * TICK_MS, hits: 0 });
  });
  it('vchod bez pokladu nie je výhra', () => {
    const s = simulate(map(['E.$']), [...hold(R, 1), ...hold(L, 1)]);
    expect(s.status).toBe('running');
  });
  it('po 60 sekundách koniec', () => {
    const s = simulate(emptyCells(), idle(RUN_TICKS + 50));
    expect(s.status).toBe('lost');
    expect(resultOf(s)).toEqual({ success: false, timeMs: 60000, hits: 0 });
  });
  it('bodce skrátia čas — koniec príde skôr', () => {
    const s = simulate(map(['E^']), [...hold(R, 1), ...idle(RUN_TICKS)]);
    expect(s.status).toBe('lost');
    expect(s.tick).toBe(RUN_TICKS - SPIKE_PENALTY);
    expect(remainingTicks(s)).toBe(0);
  });
});

describe('záznam', () => {
  // Pseudonáhodné vstupy, ale deterministicky — test musí byť opakovateľný.
  function noisy(n: number, seed = 7): number[] {
    let x = seed;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      out.push(i % 9 === 0 ? (x >> 8) % 10 : out[i - 1] ?? 0);
    }
    return out;
  }
  const busy = map(['E..b....^.......', '.##.#.o...S..#..', '..k.D..T........', '', '.......V', '', '', '', '', '', '', '', '', '', '....T.........$.']);

  it('rovnaké vstupy → presne rovnaký beh', () => {
    const codes = noisy(900);
    const a = simulate(busy, codes);
    const b = simulate(busy, codes);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('kompresia vstupov nič nestratí a je skromná', () => {
    const codes = noisy(1200);
    const runs = compressInputs(codes);
    expect(expandInputs(runs, codes.length)).toEqual(codes);
    expect(runs.length).toBeLessThan(codes.length / 5);
  });

  it('prehratý záznam dá ten istý výsledok', () => {
    const codes = [...hold(R, 2), ...hold(L, 2)];
    const cells = map(['E.$']);
    const replay = makeReplay(cells, codes);
    expect(replayResult(replay)).toEqual(resultOf(simulate(cells, codes)));
  });

  it('vymyslený výsledok neprejde', () => {
    const replay = makeReplay(map(['E.$']), [...hold(R, 2), ...hold(L, 2)]);
    expect(replayMatches(replay, { success: true, timeMs: 500, hits: 0 })).toBe(true);
    expect(replayMatches(replay, { success: true, timeMs: 100, hits: 0 })).toBe(false);
    expect(replayMatches(replay, { success: true, timeMs: 500, hits: 3 })).toBe(false);
  });
});

/**
 * Pevnosť & Nájazd — herný engine.
 *
 * Zlaté pravidlo z briefu: všetka logika hry je deterministický kód, nikdy
 * LLM. Tento modul je preto čistý — žiadny React, žiadny čas z hodín, žiadna
 * náhoda. Beh sa posúva po pevných krokoch (tick = 50 ms) a rovnaká mapa
 * s rovnakými vstupmi dá vždy presne rovnaký výsledok, bit po bite.
 *
 * Z toho plynú dve veci, na ktorých hra stojí:
 *
 * - **Záznam nájazdu nie je video, ale zoznam stlačení.** Pri prehrávaní sa
 *   nájazd odohrá znova na tej istej mape a dopadne presne rovnako. Pár
 *   stoviek bajtov namiesto megabajtov.
 * - **Výsledok sa dá overiť.** Kto tvrdí, že pevnosť vykradol za 12 sekúnd,
 *   musí mať záznam, z ktorého to vyjde. Prehrávač to prepočíta a nesúlad
 *   ukáže.
 *
 * Pohyb je po políčkach (ako Bomberman), nie plynulý. Pre 11-ročného na
 * mobile je to presnejšie a pre determinizmus bezpečnejšie — žiadne
 * desatinné čísla, žiadne rozdiely medzi prehliadačmi.
 */

export const W = 16;
export const H = 16;
export const CELLS = W * H;

export const TICK_MS = 50;
/** 60 sekúnd na nájazd. */
export const RUN_TICKS = 1200;
/** Nájazdník sa pohne o políčko každé 3 ticky (≈ 6,7 políčka za sekundu). */
export const MOVE_EVERY = 3;
/** Píla je o kúsok pomalšia než nájazdník — dá sa jej utiecť. */
export const SAW_EVERY = 4;
/** Ako často sa dá udrieť do steny. */
export const ACT_EVERY = 6;
/** Bodce uberú 3 sekundy. */
export const SPIKE_PENALTY = 60;
/** Píla uberie 5 sekúnd. */
export const SAW_PENALTY = 100;
/** Po zásahu pílou chvíľu nemôže zasiahnuť znova — inak by jedna píla zjedla celý čas. */
export const INVULN_TICKS = 20;
/** Po páde do diery chvíľu trvá, kým sa nájazdník pri vchode spamätá. */
export const FALL_STUN = 10;
/** Koľko sa dá minúť na stavbu. */
export const BUDGET = 80;

/**
 * Políčka mapy. Mapa je reťazec 256 znakov, riadok po riadku.
 *
 * `S` a `V` sú štartové miesta píl (vodorovná / zvislá). Pri behu sa z nich
 * stane podlaha a píla sa hýbe ako samostatná vec.
 */
export type Tile =
  | '.' // podlaha
  | '#' // stena
  | 'b' // lámateľná stena (2 údery)
  | 'D' // dvere (otvorí kľúč)
  | 'k' // kľúč
  | '^' // bodce
  | 'S' // píla ↔
  | 'V' // píla ↕
  | 'o' // falošná podlaha (skrytá diera)
  | 'T' // teleport (vždy pár)
  | 'E' // vchod aj východ
  | '$'; // poklad

export const TILES: readonly Tile[] = ['.', '#', 'b', 'D', 'k', '^', 'S', 'V', 'o', 'T', 'E', '$'];

export const COST: Record<Tile, number> = {
  '.': 0,
  '#': 1,
  b: 1,
  D: 2,
  k: 0,
  '^': 2,
  S: 4,
  V: 4,
  o: 3,
  T: 3,
  E: 0,
  $: 0,
};

/** Smery: 0 žiadny, 1 hore, 2 vpravo, 3 dole, 4 vľavo. */
export type Dir = 0 | 1 | 2 | 3 | 4;
export const DX = [0, 0, 1, 0, -1] as const;
export const DY = [0, -1, 0, 1, 0] as const;

export interface Input {
  dir: Dir;
  act: boolean;
}

/** Vstup ako jedno číslo 0–9, aby sa záznam dal uložiť skromne. */
export function encodeInput(i: Input): number {
  return i.dir * 2 + (i.act ? 1 : 0);
}
export function decodeInput(code: number): Input {
  return { dir: (Math.floor(code / 2) as Dir), act: code % 2 === 1 };
}

export const idx = (x: number, y: number) => y * W + x;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

// ---------------------------------------------------------------------------
// Mapa
// ---------------------------------------------------------------------------

/** Prázdna pevnosť: vchod vľavo dole, poklad vpravo hore. */
export function emptyCells(): string {
  const c = Array<Tile>(CELLS).fill('.');
  c[idx(1, 14)] = 'E';
  c[idx(14, 1)] = '$';
  return c.join('');
}

export function gridCost(cells: string): number {
  let sum = 0;
  for (const ch of cells) sum += COST[ch as Tile] ?? 0;
  return sum;
}

const count = (cells: string, ch: string) => {
  let n = 0;
  for (const c of cells) if (c === ch) n++;
  return n;
};

/**
 * Čo s mapou nie je v poriadku, po ľudsky. Prázdny zoznam = dá sa hrať.
 * Tie isté pravidlá stráži aj databáza, takže sa neobídu ani mimo appky.
 */
export function gridProblems(cells: string): string[] {
  const p: string[] = [];
  if (cells.length !== CELLS) return ['Mapa má zlú veľkosť.'];
  for (const ch of cells) {
    if (!TILES.includes(ch as Tile)) return ['Mapa obsahuje neznámy kúsok.'];
  }
  const e = count(cells, 'E');
  if (e === 0) p.push('Chýba vchod.');
  if (e > 1) p.push('Vchod môže byť len jeden.');
  const t = count(cells, '$');
  if (t === 0) p.push('Chýba poklad.');
  if (t > 1) p.push('Poklad môže byť len jeden.');
  const tp = count(cells, 'T');
  if (tp === 1) p.push('Teleport potrebuje pár — polož ešte jeden.');
  if (tp > 2) p.push('Teleporty môžu byť len dva.');
  const cost = gridCost(cells);
  if (cost > BUDGET) p.push(`Prekročený rozpočet: ${cost} z ${BUDGET}.`);
  return p;
}

// ---------------------------------------------------------------------------
// Beh
// ---------------------------------------------------------------------------

export interface Saw {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Odkiaľ sa naposledy pohla — pre plynulé vykreslenie. */
  fromX: number;
  fromY: number;
}

export type FxEvent =
  | 'move' | 'bump' | 'crack' | 'break' | 'key' | 'door' | 'spike'
  | 'saw' | 'fall' | 'tp' | 'treasure' | 'win' | 'lose';

export interface RunState {
  cells: Tile[];
  /** Zostávajúce údery lámateľných stien, podľa indexu políčka. */
  hp: Record<number, number>;
  /** Diery, do ktorých už nájazdník spadol — odteraz ich vidí a nevojde do nich. */
  revealed: boolean[];
  saws: Saw[];
  entrance: number;
  tpA: number;
  tpB: number;

  px: number;
  py: number;
  fromX: number;
  fromY: number;
  facing: Dir;

  moveCd: number;
  actCd: number;
  invuln: number;
  stun: number;
  /** Políčko, na ktoré práve priletel teleport — kým z neho neodíde, nespustí sa znova. */
  tpLock: number;

  keys: number;
  hasTreasure: boolean;

  tick: number;
  penalty: number;
  hits: number;
  status: 'running' | 'won' | 'lost';
  /** Čo sa stalo v poslednom kroku — pre zvuky a efekty. Na výsledok nemá vplyv. */
  events: FxEvent[];
}

export function initRun(cells: string): RunState {
  const tiles = cells.split('') as Tile[];
  const saws: Saw[] = [];
  let entrance = -1;
  let tpA = -1;
  let tpB = -1;
  tiles.forEach((t, i) => {
    const x = i % W;
    const y = Math.floor(i / W);
    if (t === 'S' || t === 'V') {
      saws.push({ x, y, dx: t === 'S' ? 1 : 0, dy: t === 'V' ? 1 : 0, fromX: x, fromY: y });
      tiles[i] = '.';
    }
    if (t === 'E') entrance = i;
    if (t === 'T') {
      if (tpA < 0) tpA = i;
      else tpB = i;
    }
  });
  if (entrance < 0) entrance = 0;
  const px = entrance % W;
  const py = Math.floor(entrance / W);
  return {
    cells: tiles,
    hp: {},
    revealed: Array(CELLS).fill(false),
    saws,
    entrance,
    tpA,
    tpB,
    px,
    py,
    fromX: px,
    fromY: py,
    facing: 1,
    moveCd: 0,
    actCd: 0,
    invuln: 0,
    stun: 0,
    tpLock: -1,
    keys: 0,
    hasTreasure: false,
    tick: 0,
    penalty: 0,
    hits: 0,
    status: 'running',
    events: [],
  };
}

const SAW_PASSABLE = new Set<Tile>(['.', 'k', '^', 'o', 'T', 'E', '$']);

function sawCanEnter(s: RunState, x: number, y: number): boolean {
  return inBounds(x, y) && SAW_PASSABLE.has(s.cells[idx(x, y)]);
}

function moveSaws(s: RunState) {
  for (const saw of s.saws) {
    saw.fromX = saw.x;
    saw.fromY = saw.y;
    let nx = saw.x + saw.dx;
    let ny = saw.y + saw.dy;
    if (!sawCanEnter(s, nx, ny)) {
      // Na konci trasy sa otočí a ide späť — hliadkuje po čiare.
      saw.dx = -saw.dx;
      saw.dy = -saw.dy;
      nx = saw.x + saw.dx;
      ny = saw.y + saw.dy;
      if (!sawCanEnter(s, nx, ny)) continue;
    }
    saw.x = nx;
    saw.y = ny;
  }
}

function placeAt(s: RunState, i: number) {
  s.px = i % W;
  s.py = Math.floor(i / W);
  s.fromX = s.px;
  s.fromY = s.py;
}

function tryMove(s: RunState, dir: Dir) {
  s.facing = dir;
  const nx = s.px + DX[dir];
  const ny = s.py + DY[dir];
  if (!inBounds(nx, ny)) {
    s.events.push('bump');
    return;
  }
  const n = idx(nx, ny);
  const t = s.cells[n];
  if (t === '#' || t === 'b' || (t === 'o' && s.revealed[n])) {
    s.events.push('bump');
    return;
  }
  if (t === 'D') {
    if (s.keys === 0) {
      s.events.push('bump');
      return;
    }
    s.keys--;
    s.cells[n] = '.';
    s.events.push('door');
  }

  s.fromX = s.px;
  s.fromY = s.py;
  s.px = nx;
  s.py = ny;
  s.moveCd = MOVE_EVERY;
  s.events.push('move');
  if (s.tpLock !== n) s.tpLock = -1;

  switch (s.cells[n]) {
    case 'k':
      s.keys++;
      s.cells[n] = '.';
      s.events.push('key');
      break;
    case '$':
      s.hasTreasure = true;
      s.cells[n] = '.';
      s.events.push('treasure');
      break;
    case '^':
      s.penalty += SPIKE_PENALTY;
      s.hits++;
      s.events.push('spike');
      break;
    case 'o':
      s.hits++;
      s.revealed[n] = true;
      s.stun = FALL_STUN;
      placeAt(s, s.entrance);
      s.events.push('fall');
      break;
    case 'T':
      if (s.tpB >= 0 && s.tpLock !== n) {
        const other = n === s.tpA ? s.tpB : s.tpA;
        placeAt(s, other);
        s.tpLock = other;
        s.events.push('tp');
      }
      break;
    case 'E':
      if (s.hasTreasure) s.status = 'won';
      break;
  }
}

/**
 * Jeden krok hry. Mení stav na mieste — rýchlejšie než kopírovať 256 políčok
 * dvadsaťkrát za sekundu, a pre determinizmus na tom nezáleží.
 */
export function step(s: RunState, input: Input): void {
  if (s.status !== 'running') return;
  s.tick++;
  s.events = [];

  const prevX = s.px;
  const prevY = s.py;
  const sawPrev = s.saws.map((w) => [w.x, w.y]);

  if (s.tick % SAW_EVERY === 0) moveSaws(s);
  if (s.stun > 0) s.stun--;

  if (input.act && s.actCd === 0 && s.stun === 0) {
    s.actCd = ACT_EVERY;
    const dir = input.dir || s.facing;
    const tx = s.px + DX[dir];
    const ty = s.py + DY[dir];
    if (inBounds(tx, ty)) {
      const t = idx(tx, ty);
      if (s.cells[t] === 'b') {
        const left = (s.hp[t] ?? 2) - 1;
        if (left <= 0) {
          s.cells[t] = '.';
          delete s.hp[t];
          s.events.push('break');
        } else {
          s.hp[t] = left;
          s.events.push('crack');
        }
      }
    }
  }

  if (input.dir && s.moveCd === 0 && s.stun === 0) tryMove(s, input.dir);

  // `tryMove` mohol stav zmeniť; TypeScript to po kontrole na začiatku nevie.
  if ((s.status as RunState['status']) === 'won') {
    s.events.push('win');
    return;
  }

  // Píla zasiahne, keď stojí na tom istom políčku — alebo keď sa s ňou
  // nájazdník v jednom kroku prehodí. Bez toho by sa cez pílu dalo prejsť.
  if (s.invuln === 0) {
    const hit = s.saws.some((w, i) => {
      const same = w.x === s.px && w.y === s.py;
      const swap =
        sawPrev[i][0] === s.px && sawPrev[i][1] === s.py && w.x === prevX && w.y === prevY;
      return same || swap;
    });
    if (hit) {
      s.penalty += SAW_PENALTY;
      s.hits++;
      s.invuln = INVULN_TICKS;
      s.events.push('saw');
    }
  }

  if (s.moveCd > 0) s.moveCd--;
  if (s.actCd > 0) s.actCd--;
  if (s.invuln > 0) s.invuln--;

  if (s.tick + s.penalty >= RUN_TICKS) {
    s.status = 'lost';
    s.events.push('lose');
  }
}

/** Zostávajúci čas v tickoch — bodce a píly ho uberajú. */
export function remainingTicks(s: RunState): number {
  return Math.max(0, RUN_TICKS - s.tick - s.penalty);
}

export interface RunResult {
  success: boolean;
  /** Čas vrátane trestov. Pri neúspechu vždy celých 60 s. */
  timeMs: number;
  hits: number;
}

export function resultOf(s: RunState): RunResult {
  return {
    success: s.status === 'won',
    timeMs: Math.min(RUN_TICKS, s.tick + s.penalty) * TICK_MS,
    hits: s.hits,
  };
}

// ---------------------------------------------------------------------------
// Záznam
// ---------------------------------------------------------------------------

/**
 * Záznam nájazdu: mapa, na ktorej sa hral, a vstupy.
 *
 * Mapa je v zázname celá. Keď majiteľ pevnosť neskôr prestavia, starý
 * záznam sa aj tak prehrá na tom, na čom sa naozaj hralo.
 *
 * Vstupy sú uložené ako zmeny: `[tick, kód]` iba keď sa niečo zmení. Kto
 * drží šípku dve sekundy, to je jeden záznam, nie štyridsať.
 */
export interface Replay {
  v: 1;
  cells: string;
  ticks: number;
  runs: [number, number][];
}

export function compressInputs(codes: number[]): [number, number][] {
  const runs: [number, number][] = [];
  let last = -1;
  codes.forEach((c, t) => {
    if (c !== last) {
      runs.push([t, c]);
      last = c;
    }
  });
  return runs;
}

export function expandInputs(runs: [number, number][], ticks: number): number[] {
  const out: number[] = Array(ticks).fill(0);
  for (let r = 0; r < runs.length; r++) {
    const [start, code] = runs[r];
    const end = r + 1 < runs.length ? runs[r + 1][0] : ticks;
    for (let t = Math.max(0, start); t < Math.min(end, ticks); t++) out[t] = code;
  }
  return out;
}

export function makeReplay(cells: string, codes: number[]): Replay {
  return { v: 1, cells, ticks: codes.length, runs: compressInputs(codes) };
}

/** Odohrá celý beh zo záznamu. Rovnaký záznam → rovnaký výsledok. */
export function simulate(cells: string, codes: number[]): RunState {
  const s = initRun(cells);
  for (const c of codes) {
    if (s.status !== 'running') break;
    step(s, decodeInput(c));
  }
  return s;
}

export function replayResult(r: Replay): RunResult {
  return resultOf(simulate(r.cells, expandInputs(r.runs, r.ticks)));
}

/** Sedí tvrdený výsledok so záznamom? */
export function replayMatches(r: Replay, claimed: { success: boolean; timeMs: number; hits: number }): boolean {
  const real = replayResult(r);
  return real.success === claimed.success && real.timeMs === claimed.timeMs && real.hits === claimed.hits;
}

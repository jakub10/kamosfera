/**
 * Kreslenie pevnosti — pohľad zhora, kocky ako z Lega (vlastný dizajn).
 *
 * Kreslenie je čisto vizuálne: berie stav z enginu a nič v ňom nemení.
 * Animácie (točiaca sa píla, pulzujúci poklad) idú z času obrazovky, nie
 * z ticku hry — na výsledok nemajú vplyv.
 */
import { W, H, type Tile, type RunState, MOVE_EVERY, SAW_EVERY } from './engine';

export interface DrawOpts {
  /** Veľkosť jedného políčka v CSS pixeloch. */
  ts: number;
  /** Čas v ms pre animácie. */
  time: number;
  /** Majiteľ vidí falošné podlahy; nájazdník nie. */
  ownerView: boolean;
  /** Políčko pod myšou v editore. */
  hover?: number | null;
}

const C = {
  floor: '#dfe6ee',
  floorStud: '#cfd8e3',
  floorLine: '#c6d0dc',
  stone: ['#7d8fa3', '#74869a', '#8698ac'],
  sand: '#e2b27c',
  sandDark: '#b9824a',
  door: '#9b5a2c',
  gold: '#f5c542',
  goldDark: '#c9971a',
  spike: '#9aa5b1',
  spikeDark: '#5f6b77',
  portal: '#8e5cf7',
  entrance: '#3fbf6b',
  pit: '#1b1f2a',
  danger: '#ef4444',
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/** Nop zhora: kruh s odleskom. Bez nich by to boli len štvorčeky. */
function stud(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = shade(color, -28);
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.18, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(color, 12);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function brick(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number, color: string) {
  const p = Math.max(1, ts * 0.04);
  rr(ctx, x + p, y + p, ts - 2 * p, ts - 2 * p, ts * 0.14);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  rr(ctx, x + p, y + ts - p - ts * 0.14, ts - 2 * p, ts * 0.14, ts * 0.08);
  ctx.fill();
  stud(ctx, x + ts / 2, y + ts / 2 - ts * 0.03, ts * 0.22, color);
}

function floor(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  ctx.fillStyle = C.floor;
  ctx.fillRect(x, y, ts, ts);
  ctx.strokeStyle = C.floorLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
  ctx.fillStyle = C.floorStud;
  ctx.beginPath();
  ctx.arc(x + ts / 2, y + ts / 2, ts * 0.17, 0, Math.PI * 2);
  ctx.fill();
}

function hash(x: number, y: number) {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function drawKey(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number, t: number) {
  const bob = Math.sin(t / 300 + x) * ts * 0.04;
  const cx = x + ts / 2;
  const cy = y + ts / 2 + bob;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.6);
  ctx.fillStyle = C.gold;
  ctx.strokeStyle = C.goldDark;
  ctx.lineWidth = Math.max(1, ts * 0.05);
  ctx.beginPath();
  ctx.arc(-ts * 0.16, 0, ts * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(-ts * 0.04, -ts * 0.05, ts * 0.34, ts * 0.1);
  ctx.fillRect(ts * 0.18, 0, ts * 0.07, ts * 0.13);
  ctx.fillStyle = C.floor;
  ctx.beginPath();
  ctx.arc(-ts * 0.16, 0, ts * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpikes(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  const pts = [
    [0.3, 0.32],
    [0.7, 0.32],
    [0.5, 0.68],
    [0.22, 0.72],
    [0.78, 0.72],
  ];
  for (const [px, py] of pts) {
    const cx = x + px * ts;
    const cy = y + py * ts;
    const s = ts * 0.15;
    ctx.fillStyle = C.spikeDark;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy + s * 0.8);
    ctx.lineTo(cx + s, cy + s * 0.8);
    ctx.lineTo(cx, cy - s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.spike;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.6, cy + s * 0.6);
    ctx.lineTo(cx, cy + s * 0.6);
    ctx.lineTo(cx, cy - s * 0.85);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number, t: number) {
  const cx = x + ts / 2;
  const cy = y + ts / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ts * 0.45);
  g.addColorStop(0, '#f0e6ff');
  g.addColorStop(0.5, C.portal);
  g.addColorStop(1, 'rgba(142,92,247,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, ts * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = Math.max(1, ts * 0.06);
  for (let k = 0; k < 3; k++) {
    const a = t / 400 + (k * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.arc(cx, cy, ts * (0.14 + k * 0.08), a, a + 1.6);
    ctx.stroke();
  }
}

function drawEntrance(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  const p = ts * 0.08;
  rr(ctx, x + p, y + p, ts - 2 * p, ts - 2 * p, ts * 0.18);
  ctx.fillStyle = C.entrance;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = Math.max(1.5, ts * 0.09);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // domček = vchod aj východ
  ctx.beginPath();
  ctx.moveTo(x + ts * 0.3, y + ts * 0.5);
  ctx.lineTo(x + ts * 0.5, y + ts * 0.3);
  ctx.lineTo(x + ts * 0.7, y + ts * 0.5);
  ctx.moveTo(x + ts * 0.36, y + ts * 0.46);
  ctx.lineTo(x + ts * 0.36, y + ts * 0.7);
  ctx.lineTo(x + ts * 0.64, y + ts * 0.7);
  ctx.lineTo(x + ts * 0.64, y + ts * 0.46);
  ctx.stroke();
}

export function drawChest(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, t: number, glow = true) {
  if (glow) {
    const pulse = 0.55 + Math.sin(t / 260) * 0.2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.9);
    g.addColorStop(0, `rgba(255,214,90,${pulse})`);
    g.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  const w = s * 0.72;
  const h = s * 0.52;
  rr(ctx, cx - w / 2, cy - h / 2, w, h, s * 0.08);
  ctx.fillStyle = '#9b5a2c';
  ctx.fill();
  ctx.fillStyle = '#7a4420';
  ctx.fillRect(cx - w / 2, cy - h * 0.08, w, h * 0.16);
  ctx.fillStyle = C.gold;
  ctx.fillRect(cx - w * 0.07, cy - h / 2, w * 0.14, h);
  ctx.fillStyle = C.goldDark;
  ctx.fillRect(cx - w * 0.1, cy - h * 0.12, w * 0.2, h * 0.24);
}

function drawDoor(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  brick(ctx, x, y, ts, C.door);
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.arc(x + ts / 2, y + ts * 0.44, ts * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + ts * 0.46, y + ts * 0.46, ts * 0.08, ts * 0.2);
}

function drawCracks(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number, heavy: boolean) {
  ctx.strokeStyle = C.sandDark;
  ctx.lineWidth = Math.max(1, ts * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + ts * 0.15, y + ts * 0.3);
  ctx.lineTo(x + ts * 0.32, y + ts * 0.42);
  ctx.lineTo(x + ts * 0.27, y + ts * 0.6);
  ctx.moveTo(x + ts * 0.85, y + ts * 0.72);
  ctx.lineTo(x + ts * 0.7, y + ts * 0.64);
  if (heavy) {
    ctx.moveTo(x + ts * 0.5, y + ts * 0.12);
    ctx.lineTo(x + ts * 0.58, y + ts * 0.3);
    ctx.lineTo(x + ts * 0.8, y + ts * 0.35);
    ctx.moveTo(x + ts * 0.2, y + ts * 0.85);
    ctx.lineTo(x + ts * 0.42, y + ts * 0.78);
  }
  ctx.stroke();
}

export function drawSaw(ctx: CanvasRenderingContext2D, cx: number, cy: number, ts: number, t: number) {
  const r = ts * 0.38;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t / 90);
  ctx.fillStyle = '#c3ccd6';
  ctx.beginPath();
  const teeth = 10;
  for (let k = 0; k < teeth * 2; k++) {
    const a = (k * Math.PI) / teeth;
    const rad = k % 2 === 0 ? r : r * 0.78;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#6b7785';
  ctx.lineWidth = Math.max(1, ts * 0.03);
  ctx.stroke();
  ctx.fillStyle = C.danger;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSawAxis(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number, vertical: boolean) {
  ctx.strokeStyle = 'rgba(239,68,68,.75)';
  ctx.lineWidth = Math.max(1.5, ts * 0.07);
  ctx.lineCap = 'round';
  const cx = x + ts / 2;
  const cy = y + ts / 2;
  const a = ts * 0.46;
  ctx.beginPath();
  if (vertical) {
    ctx.moveTo(cx, cy - a);
    ctx.lineTo(cx, cy + a);
  } else {
    ctx.moveTo(cx - a, cy);
    ctx.lineTo(cx + a, cy);
  }
  ctx.stroke();
}

function drawFakeFloorHint(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  ctx.save();
  ctx.setLineDash([ts * 0.12, ts * 0.1]);
  ctx.strokeStyle = C.danger;
  ctx.lineWidth = Math.max(1, ts * 0.06);
  rr(ctx, x + ts * 0.14, y + ts * 0.14, ts * 0.72, ts * 0.72, ts * 0.12);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = C.danger;
  ctx.font = `bold ${Math.round(ts * 0.42)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', x + ts / 2, y + ts / 2 + ts * 0.02);
}

function drawPit(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number) {
  const g = ctx.createRadialGradient(x + ts / 2, y + ts / 2, 0, x + ts / 2, y + ts / 2, ts * 0.55);
  g.addColorStop(0, '#000');
  g.addColorStop(1, C.pit);
  ctx.fillStyle = g;
  rr(ctx, x + ts * 0.06, y + ts * 0.06, ts * 0.88, ts * 0.88, ts * 0.2);
  ctx.fill();
}

/**
 * Vrstvy kreslenia: `base` je všetko, čo sa medzi snímkami nemení (dá sa
 * nakresliť raz a potom len kopírovať), `anim` sú len živé kúsky navrch.
 */
type Layer = 'all' | 'base' | 'anim';

/** Políčka, ktoré majú niečo živé (hýbe sa, bliká, točí). */
const ANIMATED = new Set<string>(['k', 'T', '$', 'S', 'V']);

function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  x: number,
  y: number,
  ts: number,
  o: DrawOpts,
  extra: { hp?: number; revealed?: boolean },
  layer: Layer = 'all'
) {
  const px = x * ts;
  const py = y * ts;
  if (layer !== 'anim') {
    switch (tile) {
      case '#':
        brick(ctx, px, py, ts, C.stone[hash(x, y) % 3]);
        return;
      case 'b':
        brick(ctx, px, py, ts, C.sand);
        drawCracks(ctx, px, py, ts, extra.hp === 1);
        return;
      case 'D':
        drawDoor(ctx, px, py, ts);
        return;
    }
    floor(ctx, px, py, ts);
    switch (tile) {
      case '^':
        drawSpikes(ctx, px, py, ts);
        break;
      case 'o':
        if (extra.revealed) drawPit(ctx, px, py, ts);
        else if (o.ownerView) drawFakeFloorHint(ctx, px, py, ts);
        break;
      case 'E':
        drawEntrance(ctx, px, py, ts);
        break;
      case 'S':
      case 'V':
        drawSawAxis(ctx, px, py, ts, tile === 'V');
        break;
    }
  }
  if (layer === 'base') return;
  switch (tile) {
    case 'k':
      drawKey(ctx, px, py, ts, o.time);
      break;
    case 'T':
      drawPortal(ctx, px, py, ts, o.time);
      break;
    case '$':
      drawChest(ctx, px + ts / 2, py + ts / 2, ts, o.time);
      break;
    case 'S':
    case 'V':
      drawSaw(ctx, px + ts / 2, py + ts / 2, ts, o.time);
      break;
  }
}

/**
 * Predkreslená nemenná vrstva mapy. Kresliť 256 kociek s nopmi a
 * prechodmi farieb 60× za sekundu starší notebook nestíha — takto sa
 * nakreslia raz a každý snímok sa len prekopíruje jeden obrázok.
 * Prekreslí sa iba keď sa mapa zmení (rozbitý múr, otvorené dvere…).
 */
export interface BoardCache {
  canvas: HTMLCanvasElement | null;
  key: string;
}

export const newBoardCache = (): BoardCache => ({ canvas: null, key: '' });

function paintBase(
  ctx: CanvasRenderingContext2D,
  cache: BoardCache | undefined,
  key: string,
  ts: number,
  paint: (c: CanvasRenderingContext2D) => void
) {
  if (!cache || typeof document === 'undefined') {
    paint(ctx);
    return;
  }
  // Rozlíšenie obrazovky (zväčšenie v prehliadači, Retina) čítame z plátna,
  // aby kópia bola rovnako ostrá ako kreslenie priamo.
  const m = ctx.getTransform();
  const scale = m.a || 1;
  const fullKey = `${ts}|${scale}|${key}`;
  if (cache.key !== fullKey || !cache.canvas) {
    const c = cache.canvas ?? document.createElement('canvas');
    c.width = Math.round(ts * W * scale);
    c.height = Math.round(ts * H * scale);
    const cx = c.getContext('2d');
    if (!cx) {
      paint(ctx);
      return;
    }
    cx.setTransform(scale, 0, 0, scale, 0, 0);
    cx.clearRect(0, 0, ts * W, ts * H);
    paint(cx);
    cache.canvas = c;
    cache.key = fullKey;
  }
  ctx.drawImage(cache.canvas, 0, 0, ts * W, ts * H);
}

/** Mapa bez nájazdníka — editor a náhľady. */
export function drawCells(ctx: CanvasRenderingContext2D, cells: string, o: DrawOpts, cache?: BoardCache) {
  paintBase(ctx, cache, `${o.ownerView ? 1 : 0}|${cells}`, o.ts, (c) => {
    for (let i = 0; i < W * H; i++) drawTile(c, cells[i] as Tile, i % W, Math.floor(i / W), o.ts, o, {}, 'base');
  });
  for (let i = 0; i < W * H; i++) {
    if (ANIMATED.has(cells[i])) drawTile(ctx, cells[i] as Tile, i % W, Math.floor(i / W), o.ts, o, {}, 'anim');
  }
  if (o.hover != null && o.hover >= 0) {
    const hx = (o.hover % W) * o.ts;
    const hy = Math.floor(o.hover / W) * o.ts;
    ctx.strokeStyle = 'rgba(59,130,246,.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(hx + 1, hy + 1, o.ts - 2, o.ts - 2);
  }
}

/** Plynulý posun medzi políčkami: 0 → 1 počas jedného kroku. */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Beh: mapa, píly, nájazdník. `sub` je zlomok ticku (0–1), aby pohyb
 * medzi krokmi hry nebol trhaný.
 */
export function drawRun(ctx: CanvasRenderingContext2D, s: RunState, o: DrawOpts, sub: number, cache?: BoardCache) {
  const ts = o.ts;
  const cells = s.cells.join('');
  let hp = '';
  for (const k in s.hp) hp += `${k}:${s.hp[k]},`;
  let revealed = '';
  for (let i = 0; i < s.revealed.length; i++) if (s.revealed[i]) revealed += `${i},`;
  paintBase(ctx, cache, `${o.ownerView ? 1 : 0}|${cells}|${hp}|${revealed}`, ts, (c) => {
    for (let i = 0; i < W * H; i++) {
      drawTile(c, s.cells[i], i % W, Math.floor(i / W), ts, o, { hp: s.hp[i], revealed: s.revealed[i] }, 'base');
    }
  });
  for (let i = 0; i < W * H; i++) {
    if (ANIMATED.has(s.cells[i])) drawTile(ctx, s.cells[i], i % W, Math.floor(i / W), ts, o, {}, 'anim');
  }

  const sawT = Math.min(1, ((s.tick % SAW_EVERY) + sub) / SAW_EVERY);
  for (const w of s.saws) {
    const cx = lerp(w.fromX, w.x, sawT) * ts + ts / 2;
    const cy = lerp(w.fromY, w.y, sawT) * ts + ts / 2;
    drawSaw(ctx, cx, cy, ts, o.time);
  }

  const moveT = s.moveCd > 0 ? Math.min(1, 1 - (s.moveCd - sub) / MOVE_EVERY) : 1;
  const rx = lerp(s.fromX, s.px, moveT) * ts + ts / 2;
  const ry = lerp(s.fromY, s.py, moveT) * ts + ts / 2;
  const blink = s.invuln > 0 && Math.floor(o.time / 80) % 2 === 0;
  if (!blink) drawRaider(ctx, rx, ry, ts, s.facing, s.hasTreasure, o.time, s.stun > 0);
}

export function drawRaider(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ts: number,
  facing: number,
  carrying: boolean,
  t: number,
  dizzy: boolean
) {
  // tieň
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + ts * 0.3, ts * 0.32, ts * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  // telo (trup figúrky)
  rr(ctx, cx - ts * 0.3, cy - ts * 0.05, ts * 0.6, ts * 0.36, ts * 0.1);
  ctx.fillStyle = '#2f6fe4';
  ctx.fill();
  // hlava
  const hx = cx;
  const hy = cy - ts * 0.12;
  ctx.fillStyle = '#ffd43b';
  ctx.beginPath();
  ctx.arc(hx, hy, ts * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d9a90f';
  ctx.lineWidth = Math.max(1, ts * 0.03);
  ctx.stroke();
  // oči sa pozerajú tam, kam ide
  const dx = [0, 0, 1, 0, -1][facing] ?? 0;
  const dy = [0, -1, 0, 1, 0][facing] ?? 0;
  ctx.fillStyle = '#1f2937';
  if (dizzy) {
    ctx.font = `bold ${Math.round(ts * 0.22)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('@ @', hx, hy);
  } else {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + side * ts * 0.08 + dx * ts * 0.06, hy + dy * ts * 0.05, ts * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (carrying) drawChest(ctx, cx, cy - ts * 0.55, ts * 0.6, t, false);
}

/** Jedno políčko samostatne — ikonky v palete editora. */
export function drawSwatch(ctx: CanvasRenderingContext2D, tile: Tile, ts: number) {
  drawTile(ctx, tile, 0, 0, ts, { ts, time: 0, ownerView: true }, {});
}

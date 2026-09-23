import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Flame, Layers, Trophy, X } from 'lucide-react';

/**
 * Kamostavba — stavíš Kamosféru, blok po bloku, až k vlajce.
 *
 * Bonusová hra k tomu, že jsme doopravdy online. Blok jezdí sem a tam,
 * klepnutím ho položíš. Co přečuhuje, spadne dolů a další blok je o to užší —
 * takže se vyplatí trefit se přesně. Trefa naopak kousek vrátí, aby se dalo
 * pokračovat i po jednom uklouznutí.
 *
 * Skóre se nikam neposílá, nejlepší výsledek si pamatuje prohlížeč. Je to
 * hra na pět minut, ne závod v tabulce.
 */

interface KamostavbaGameProps {
  isOpen: boolean;
  onClose: () => void;
}

const W = 320;
const H = 460;
const BLOCK_H = 26;
const GROUND_Y = H - 44;
const BASE_W = 168;
/**
 * Do téhle vzdálenosti se to počítá jako trefa. Radši velkoryse — na telefonu
 * se prstem na pixel netrefí nikdo a hra je pro děti, ne pro hodináře.
 */
const PERFECT_PX = 9;
/** Kolik šířky trefa vrátí zpátky. Bez toho hra končí dřív, než začne bavit. */
const FORGIVE_PX = 10;
/** Patro, na kterém se vytáhne vlajka. */
const FLAG_FLOOR = 20;

const COLORS = [
  '#e63946', '#f4a261', '#ffd166', '#06d6a0',
  '#4cc9f0', '#4361ee', '#9b5de5', '#f15bb5',
];

/** Duolingo by byl hrdý. Hláška za každých pět pater. */
const CHEERS = [
  'Pěkně to drží!',
  'To je výška!',
  'Stavíš jako tesař.',
  'Nahoře je vzduch řidší.',
  'Tohle už je mrakodrap.',
  'Sousedi závidí.',
];

interface Row {
  x: number;
  w: number;
  color: string;
}

interface Falling {
  x: number;
  y: number;
  w: number;
  color: string;
  vy: number;
  vx: number;
}

interface Game {
  rows: Row[];
  cur: { x: number; w: number; color: string; dir: 1 | -1; speed: number };
  falling: Falling[];
  camera: number;
  cameraTarget: number;
  over: boolean;
  score: number;
  streak: number;
  flash: number;
  cheer: { text: string; life: number } | null;
}

function freshGame(): Game {
  return {
    rows: [{ x: (W - BASE_W) / 2, w: BASE_W, color: COLORS[0] }],
    cur: { x: 0, w: BASE_W, color: COLORS[1], dir: 1, speed: 1.35 },
    falling: [],
    camera: 0,
    cameraTarget: 0,
    over: false,
    score: 0,
    streak: 0,
    flash: 0,
    cheer: null,
  };
}

function readBest(): number {
  try {
    return Number(localStorage.getItem('kamostavba-best') ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeBest(v: number) {
  try {
    localStorage.setItem('kamostavba-best', String(v));
  } catch {
    /* soukromé okno, zablokovaná data — hra tím nemá padat */
  }
}

/** Kostka s nopy nahoře. Bez nich to nejsou lego kostky, jen obdélníky. */
function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color: string,
  alpha = 1
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = color;
  const r = 4;
  ctx.beginPath();
  ctx.roundRect(x, y, w, BLOCK_H, r);
  ctx.fill();

  // Horní hrana o kousek světlejší, spodní tmavší — kostka pak vypadá jako těleso.
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 6, [r, r, 0, 0]);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath();
  ctx.roundRect(x, y + BLOCK_H - 5, w, 5, [0, 0, r, r]);
  ctx.fill();

  const studs = Math.max(1, Math.floor(w / 26));
  const gap = w / studs;
  ctx.fillStyle = 'rgba(255,255,255,.34)';
  for (let i = 0; i < studs; i++) {
    const cx = x + gap * (i + 0.5);
    if (cx - 5 < x || cx + 5 > x + w) continue;
    ctx.beginPath();
    ctx.ellipse(cx, y + 3, 5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function KamostavbaGame({ isOpen, onClose }: KamostavbaGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const gameRef = useRef<Game>(freshGame());
  const rafRef = useRef<number>();

  const [best, setBest] = useState(0);
  // Kreslí canvas, ale nadpis nad ním je React — tyhle tři se proto zrcadlí.
  const [hud, setHud] = useState({ score: 0, floors: 0, streak: 0, over: false });

  useEffect(() => {
    if (isOpen) setBest(readBest());
  }, [isOpen]);

  // Plátno sa dřív natáhlo na celou šířku okna a výšku dopočítalo z poměru
  // stran — na výšku obrazovky se nedívalo vůbec. Na notebooku tak okno
  // přeteklo o 74 px a spodek věže i tlačítko po pádu byly mimo obrazovku.
  // Teď se velikost počítá z místa, které opravdu zbývá: šířka karty, nebo
  // výška okna bez hlavičky a patičky — co je menší. Poměr stran zůstává.
  useEffect(() => {
    if (!isOpen) return;
    const fit = () => {
      const card = cardRef.current;
      const stage = stageRef.current;
      if (!card || !stage) return;
      const viewH = window.visualViewport?.height ?? window.innerHeight;
      const pad = window.innerWidth < 640 ? 16 : 32;
      const chrome = card.offsetHeight - stage.offsetHeight;
      const maxW = card.clientWidth;
      const maxH = Math.max(220, viewH - pad - chrome);
      const h = Math.min(maxW * (H / W), maxH);
      setSize({ w: Math.floor(h * (W / H)), h: Math.floor(h) });
    };
    fit();
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
    };
  }, [isOpen]);

  const drop = useCallback(() => {
    const g = gameRef.current;
    if (g.over) {
      gameRef.current = freshGame();
      setHud({ score: 0, floors: 0, streak: 0, over: false });
      return;
    }

    const prev = g.rows[g.rows.length - 1];
    const cur = g.cur;
    const left = Math.max(cur.x, prev.x);
    const right = Math.min(cur.x + cur.w, prev.x + prev.w);
    const overlap = right - left;

    if (overlap <= 0) {
      g.falling.push({ x: cur.x, y: GROUND_Y - g.rows.length * BLOCK_H + g.camera, w: cur.w, color: cur.color, vy: 0, vx: 0 });
      g.over = true;
      const floors = g.rows.length - 1;
      if (g.score > readBest()) {
        writeBest(g.score);
        setBest(g.score);
      }
      setHud({ score: g.score, floors, streak: 0, over: true });
      return;
    }

    const off = Math.abs(cur.x - prev.x);
    const perfect = off <= PERFECT_PX;
    const y = GROUND_Y - g.rows.length * BLOCK_H + g.camera;

    if (perfect) {
      g.streak += 1;
      g.score += 10 + g.streak * 5;
      g.flash = 1;
      g.rows.push({
        x: prev.x - (Math.min(FORGIVE_PX, BASE_W - prev.w)) / 2,
        w: Math.min(BASE_W, prev.w + FORGIVE_PX),
        color: cur.color,
      });
    } else {
      g.streak = 0;
      g.score += 5;
      // Přečuhující kus se odlomí a spadne — je vidět, o kolik jsi minul.
      const overX = cur.x < prev.x ? cur.x : right;
      g.falling.push({ x: overX, y, w: cur.w - overlap, color: cur.color, vy: 0, vx: cur.x < prev.x ? -0.6 : 0.6 });
      g.rows.push({ x: left, w: overlap, color: cur.color });
    }

    const floors = g.rows.length - 1;
    if (floors > 0 && floors % 5 === 0) {
      g.cheer = {
        text: floors === FLAG_FLOOR ? 'kamosfera.online 🎉' : CHEERS[(floors / 5 - 1) % CHEERS.length],
        life: 1,
      };
    }

    const top = g.rows[g.rows.length - 1];
    g.cur = {
      x: 0,
      w: top.w,
      color: COLORS[g.rows.length % COLORS.length],
      dir: 1,
      speed: Math.min(4, 1.35 + floors * 0.09),
    };
    g.cameraTarget = Math.max(0, (g.rows.length + 2) * BLOCK_H - (H - 150));
    setHud({ score: g.score, floors, streak: g.streak, over: false });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    gameRef.current = freshGame();
    setHud({ score: 0, floors: 0, streak: 0, over: false });

    const frame = () => {
      const g = gameRef.current;

      if (!g.over) {
        g.cur.x += g.cur.dir * g.cur.speed;
        if (g.cur.x <= 0) {
          g.cur.x = 0;
          g.cur.dir = 1;
        } else if (g.cur.x + g.cur.w >= W) {
          g.cur.x = W - g.cur.w;
          g.cur.dir = -1;
        }
      }
      g.camera += (g.cameraTarget - g.camera) * 0.12;
      g.flash = Math.max(0, g.flash - 0.04);
      if (g.cheer) {
        g.cheer.life -= 0.012;
        if (g.cheer.life <= 0) g.cheer = null;
      }
      for (const f of g.falling) {
        f.vy += 0.55;
        f.y += f.vy;
        f.x += f.vx * 4;
      }
      g.falling = g.falling.filter((f) => f.y < H + 60);

      // --- kreslení ---
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      const high = Math.min(1, (g.rows.length - 1) / 26);
      sky.addColorStop(0, `hsl(${222 - high * 14}, ${58 + high * 18}%, ${14 + high * 6}%)`);
      sky.addColorStop(1, `hsl(${262 - high * 20}, 44%, ${22 + high * 8}%)`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Hvězdy přibývají s výškou — čím výš stavíš, tím je jich vidět víc.
      ctx.fillStyle = `rgba(255,255,255,${0.12 + high * 0.5})`;
      for (let i = 0; i < 40; i++) {
        const sx = (i * 97) % W;
        const sy = (i * 53) % (H - 90);
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }

      if (g.flash > 0) {
        ctx.fillStyle = `rgba(255,214,102,${g.flash * 0.22})`;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(0, GROUND_Y + g.camera, W, H);

      g.rows.forEach((r, i) => {
        const y = GROUND_Y - i * BLOCK_H + g.camera;
        if (y > H + BLOCK_H || y < -BLOCK_H) return;
        drawBlock(ctx, r.x, y, r.w, r.color);
      });

      for (const f of g.falling) drawBlock(ctx, f.x, f.y, f.w, f.color, 0.75);

      if (!g.over) {
        const y = GROUND_Y - g.rows.length * BLOCK_H + g.camera;
        drawBlock(ctx, g.cur.x, y, g.cur.w, g.cur.color);
      }

      // Vlajka na vrcholu, jakmile se doleze dost vysoko.
      if (g.rows.length - 1 >= FLAG_FLOOR) {
        const top = g.rows[g.rows.length - 1];
        const y = GROUND_Y - (g.rows.length - 1) * BLOCK_H + g.camera;
        const fx = top.x + top.w / 2;
        ctx.strokeStyle = '#e9ecef';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fx, y);
        ctx.lineTo(fx, y - 30);
        ctx.stroke();
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(fx, y - 30);
        ctx.lineTo(fx + 26, y - 24);
        ctx.lineTo(fx, y - 18);
        ctx.closePath();
        ctx.fill();
      }

      if (g.cheer) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, g.cheer.life * 2);
        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 19px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(g.cheer.text, W / 2, 56);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        drop();
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, drop, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div ref={cardRef} className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-3 border-b border-border bg-gradient-to-r from-amber-500/10 to-rose-500/10">
          <h3 className="font-semibold">🧱 Kamostavba</h3>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1">
              <Trophy className="h-4 w-4 text-yellow-500" />
              {best}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3 text-center text-sm bg-secondary/30">
          <div>
            <div className="text-xs text-muted-foreground">Body</div>
            <div className="text-lg font-bold">{hud.score}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Patra</div>
            <div className="flex items-center justify-center gap-1 font-bold text-cyan-400">
              <Layers className="h-4 w-4" />
              {hud.floors}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Série</div>
            <div className="flex items-center justify-center gap-1 font-bold text-orange-400">
              <Flame className="h-4 w-4" />
              {hud.streak}
            </div>
          </div>
        </div>

        <div ref={stageRef} className="relative flex justify-center bg-gradient-to-b from-[#0f1a38] to-[#2e2051]">
          <canvas
            ref={canvasRef}
            onPointerDown={(e) => {
              e.preventDefault();
              drop();
            }}
            style={{
              width: size ? `${size.w}px` : '100%',
              height: size ? `${size.h}px` : 'auto',
              display: 'block',
              touchAction: 'none',
            }}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label="Položit blok"
          />

          {hud.over && (
            <div className="absolute inset-0 grid place-items-center bg-black/65 p-6 text-center">
              <div>
                <div className="text-3xl">🧱</div>
                <h4 className="mt-2 text-xl font-bold text-white">
                  {hud.floors >= FLAG_FLOOR ? 'Až nahoru!' : 'Spadlo to'}
                </h4>
                <p className="mt-1 text-sm text-white/80">
                  {hud.floors} {hud.floors === 1 ? 'patro' : hud.floors < 5 ? 'patra' : 'pater'} · {hud.score} bodů
                </p>
                <Button className="mt-4" onClick={drop}>
                  Stavět znovu
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="px-3 py-2 text-center text-xs text-muted-foreground">
          Klepni, nebo zmáčkni mezerník. Trefíš-li se přesně, kostka se ti kousek vrátí.
        </p>
      </div>
    </div>
  );
}

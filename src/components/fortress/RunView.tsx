import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X, Volume2, VolumeX, RotateCcw, KeyRound, Timer, HeartCrack } from 'lucide-react';
import {
  W, H, TICK_MS, initRun, step, resultOf, encodeInput, decodeInput, makeReplay,
  expandInputs, replayMatches, remainingTicks, DX, DY,
  type Dir, type Replay, type RunResult, type RunState, type FxEvent,
} from '@/games/fortress/engine';
import { drawRun, newBoardCache } from '@/games/fortress/render';
import { play, countdownBeep, isMuted, setMuted } from '@/games/fortress/sfx';
import { formatTime } from '@/games/fortress/api';
import { Joystick, ActionButton } from './Joystick';

export type RunMode = 'test' | 'raid' | 'replay';

interface Props {
  cells: string;
  mode: RunMode;
  title: string;
  replay?: Replay;
  claimed?: RunResult;
  onFinish?: (result: RunResult, replay: Replay) => void;
  onClose: () => void;
  /** Čo ukázať pod výsledkom — napr. „Ukladám…" alebo chybu. */
  resultNote?: ReactNode;
  /** Tlačidlo pod výsledkom navyše (napr. „Zverejniť"). */
  resultAction?: ReactNode;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 1, w: 1, W: 1,
  ArrowRight: 2, d: 2, D: 2,
  ArrowDown: 3, s: 3, S: 3,
  ArrowLeft: 4, a: 4, A: 4,
};
const ACT_KEYS = new Set([' ', 'Enter', 'j', 'J', 'e', 'E']);

const isTouch = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

export function RunView({ cells, mode, title, replay, claimed, onFinish, onClose, resultNote, resultAction }: Props) {
  const replayCodes = useMemo(() => (replay ? expandInputs(replay.runs, replay.ticks) : []), [replay]);
  const playCells = mode === 'replay' && replay ? replay.cells : cells;

  const stateRef = useRef<RunState>(initRun(playCells));
  const codesRef = useRef<number[]>([]);
  const particles = useRef<Particle[]>([]);
  const boardCache = useRef(newBoardCache());
  const shake = useRef(0);
  const flash = useRef(0);

  const held = useRef<Dir[]>([]);
  const joy = useRef<Dir>(0);
  const actKey = useRef(false);
  const actBtn = useRef(false);

  const [phase, setPhase] = useState<'countdown' | 'running' | 'done'>(mode === 'replay' ? 'running' : 'countdown');
  const [count, setCount] = useState(3);
  const [hud, setHud] = useState(() => hudOf(stateRef.current));
  const [result, setResult] = useState<RunResult | null>(null);
  const [speed, setSpeed] = useState(1);
  const [muted, setMutedState] = useState(isMuted());
  const [runId, setRunId] = useState(0);
  const touch = useMemo(isTouch, []);

  // Len pri vývoji: automatický test v prehliadači potrebuje vidieť, kde
  // postavička stojí, aby pustil šípku na správnom políčku. Do ostrého
  // buildu sa to nedostane — `import.meta.env.DEV` je tam false a Vite
  // vetvu vyhodí.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pevnost = stateRef;
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ts, setTs] = useState(24);
  const tsRef = useRef(ts);
  tsRef.current = ts;

  // Veľkosť políčka podľa miesta, ktoré naozaj je — celé číslo, aby boli
  // kocky ostré.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setTs(Math.max(12, Math.floor(Math.min(r.width / W, r.height / H))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const restart = useCallback(() => {
    stateRef.current = initRun(playCells);
    codesRef.current = [];
    particles.current = [];
    setHud(hudOf(stateRef.current));
    setResult(null);
    setCount(3);
    setPhase(mode === 'replay' ? 'running' : 'countdown');
    setRunId((n) => n + 1);
  }, [playCells, mode]);

  // Odpočet 3-2-1, aby nájazd nezačal skôr, než dieťa položí prst na joystick.
  useEffect(() => {
    if (phase !== 'countdown') return;
    countdownBeep(false);
    let n = 3;
    const id = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(id);
        countdownBeep(true);
        setPhase('running');
      } else {
        countdownBeep(false);
        setCount(n);
      }
    }, 650);
    return () => window.clearInterval(id);
  }, [phase, runId]);

  // Klávesnica
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const d = KEY_DIR[e.key];
      if (d) {
        e.preventDefault();
        held.current = [...held.current.filter((x) => x !== d), d];
      } else if (ACT_KEYS.has(e.key)) {
        e.preventDefault();
        actKey.current = true;
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    const up = (e: KeyboardEvent) => {
      const d = KEY_DIR[e.key];
      if (d) held.current = held.current.filter((x) => x !== d);
      if (ACT_KEYS.has(e.key)) actKey.current = false;
    };
    const blur = () => {
      held.current = [];
      actKey.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [onClose]);

  const spawn = useCallback((x: number, y: number, n: number, color: string, speedK = 1, size = 0.12) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.02 + Math.random() * 0.06) * speedK;
      particles.current.push({
        x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.02,
        life: 0, max: 26 + Math.random() * 18, color, size: size * (0.6 + Math.random() * 0.8),
      });
    }
  }, []);

  const react = useCallback((s: RunState, events: FxEvent[]) => {
    for (const e of events) {
      if (e !== 'move') play(e);
      switch (e) {
        case 'break':
        case 'crack': {
          const tx = s.px + DX[s.facing];
          const ty = s.py + DY[s.facing];
          spawn(tx, ty, e === 'break' ? 16 : 6, e === 'break' ? '#e2b27c' : '#c9a37a', e === 'break' ? 1.4 : 0.7, e === 'break' ? 0.16 : 0.08);
          break;
        }
        case 'key':
        case 'treasure':
          spawn(s.px, s.py, 18, '#f5c542', 1.1, 0.1);
          break;
        case 'spike':
          spawn(s.px, s.py, 10, '#ef4444', 1, 0.09);
          flash.current = 0.35;
          break;
        case 'saw':
          spawn(s.px, s.py, 14, '#ef4444', 1.3, 0.1);
          shake.current = 12;
          flash.current = 0.5;
          break;
        case 'fall':
          shake.current = 8;
          break;
        case 'tp':
          spawn(s.px, s.py, 16, '#b794f6', 1.2, 0.1);
          break;
        case 'win':
          for (let k = 0; k < 6; k++) {
            spawn(Math.random() * W, Math.random() * H * 0.5, 12, ['#f5c542', '#3fbf6b', '#2f6fe4', '#ef4444'][k % 4], 1.6, 0.14);
          }
          break;
      }
    }
  }, [spawn]);

  const finish = useCallback((s: RunState) => {
    const r = resultOf(s);
    setResult(r);
    setPhase('done');
    if (mode !== 'replay') onFinish?.(r, makeReplay(playCells, codesRef.current));
  }, [mode, onFinish, playCells]);

  // Kreslenie je stabilná funkcia: veľkosť políčka číta z refu, takže zmena
  // veľkosti okna nereštartuje slučku hry a doznievanie po konci má čím kresliť.
  const draw = useCallback((sub: number, now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ts = tsRef.current;
    const px = ts * W;
    if (canvas.width !== px * dpr) {
      canvas.width = px * dpr;
      canvas.height = ts * H * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, px, ts * H);
    ctx.save();
    if (shake.current > 0) {
      ctx.translate((Math.random() - 0.5) * shake.current, (Math.random() - 0.5) * shake.current);
      shake.current *= 0.85;
      if (shake.current < 0.4) shake.current = 0;
    }
    drawRun(ctx, stateRef.current, { ts, time: now, ownerView: mode === 'test' }, sub, boardCache.current);

    particles.current = particles.current.filter((p) => p.life < p.max);
    for (const p of particles.current) {
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.004;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect((p.x - p.size / 2) * ts, (p.y - p.size / 2) * ts, p.size * ts, p.size * ts);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (flash.current > 0) {
      ctx.fillStyle = `rgba(239,68,68,${flash.current * 0.35})`;
      ctx.fillRect(0, 0, px, ts * H);
      flash.current = Math.max(0, flash.current - 0.03);
    }
  }, [mode]);

  // Hlavná slučka: simulácia po pevných krokoch, kreslenie podľa obrazovky.
  useEffect(() => {
    if (phase !== 'running') return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudKey = '';

    const loop = (now: number) => {
      const s = stateRef.current;
      acc += Math.min(250, now - last) * (mode === 'replay' ? speed : 1);
      last = now;

      while (acc >= TICK_MS && s.status === 'running') {
        let code: number;
        if (mode === 'replay') {
          if (s.tick >= replayCodes.length) break;
          code = replayCodes[s.tick];
        } else {
          const dir = (joy.current || held.current[held.current.length - 1] || 0) as Dir;
          code = encodeInput({ dir, act: actKey.current || actBtn.current });
          codesRef.current.push(code);
        }
        step(s, decodeInput(code));
        react(s, s.events);
        acc -= TICK_MS;
      }

      // Panel nad hrou prekresliť len keď sa na ňom niečo naozaj zmení
      // (sekunda, kľúč, zásah) — nie 20× za sekundu. Na slabšom notebooku
      // to bol hlavný dôvod sekania.
      const h = hudOf(s);
      const key = `${Math.ceil((h.remaining * TICK_MS) / 1000)}|${h.keys}|${h.hits}|${h.treasure}`;
      if (key !== hudKey) {
        hudKey = key;
        setHud(h);
      }

      draw(Math.min(1, acc / TICK_MS), now);

      const replayOver = mode === 'replay' && s.tick >= replayCodes.length;
      if (s.status !== 'running' || replayOver) {
        finish(s);
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, mode, speed, replayCodes, react, finish, draw, runId]);

  // Po konci nechať úlomky a konfety dopadnúť. Vlastný efekt, lebo slučku
  // hry React pri zmene fázy zruší — a s ňou by na plátne zamrzli.
  useEffect(() => {
    if (phase !== 'done') return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      draw(1, t);
      if (particles.current.length && t - t0 < 4000) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, draw, ts]);

  // Pred štartom aspoň nakresliť mapu, aby odpočet nebežal nad prázdnom.
  useEffect(() => {
    if (phase !== 'countdown') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = ts * W * dpr;
    canvas.height = ts * H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRun(ctx, stateRef.current, { ts, time: 0, ownerView: mode === 'test' }, 0, boardCache.current);
  }, [phase, ts, mode, runId]);

  const verified = mode === 'replay' && replay && claimed ? replayMatches(replay, claimed) : null;
  const secs = Math.ceil(hud.remaining * TICK_MS / 1000);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate font-bold">{title}</h2>
        {mode === 'replay' && (
          <div className="flex items-center gap-1 rounded-full bg-white/10 p-1 text-xs">
            {[1, 2, 4].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSpeed(v)}
                className={`rounded-full px-2 py-0.5 font-semibold ${speed === v ? 'bg-white text-slate-900' : ''}`}
              >
                {v}×
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="rounded-full p-2 hover:bg-white/10"
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
          }}
          aria-label={muted ? 'Zapnúť zvuk' : 'Vypnúť zvuk'}
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <button type="button" className="rounded-full p-2 hover:bg-white/10" onClick={onClose} aria-label="Zavrieť">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-4 px-3 pb-2 text-sm font-semibold sm:gap-6">
        <span className={`flex items-center gap-1 tabular-nums ${secs <= 10 ? 'text-red-400' : ''}`}>
          <Timer className="h-4 w-4" /> {secs} s
        </span>
        <span className="flex items-center gap-1">
          <KeyRound className="h-4 w-4 text-amber-300" /> {hud.keys}
        </span>
        <span className="flex items-center gap-1">
          <HeartCrack className="h-4 w-4 text-red-400" /> {hud.hits}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${hud.treasure ? 'bg-amber-400 text-amber-950' : 'bg-white/10'}`}
        >
          {hud.treasure ? 'Poklad máš — utekaj k vchodu!' : 'Nájdi poklad'}
        </span>
      </div>

      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <canvas
          ref={canvasRef}
          style={{ width: ts * W, height: ts * H }}
          className="rounded-lg shadow-2xl"
          aria-label="Pevnosť"
        />

        {phase === 'countdown' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div key={count} className="animate-in zoom-in-50 fade-in text-8xl font-black drop-shadow-[0_4px_0_rgba(0,0,0,.4)]">
              {count}
            </div>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="absolute inset-0 grid place-items-center bg-slate-950/70 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center text-slate-900 shadow-2xl animate-in zoom-in-95 fade-in">
              <ResultHeading mode={mode} success={result.success} />
              <p className="mt-2 text-lg font-bold tabular-nums">
                {result.success ? formatTime(result.timeMs) : 'Čas vypršal'}
                <span className="mx-2 text-slate-300">·</span>
                {result.hits} {result.hits === 1 ? 'pasca' : result.hits >= 2 && result.hits <= 4 ? 'pasce' : 'pascí'}
              </p>
              {verified !== null && (
                <p className={`mt-2 text-sm font-semibold ${verified ? 'text-emerald-600' : 'text-red-600'}`}>
                  {verified ? '✓ Záznam sedí s výsledkom' : '⚠ Záznam nesedí s výsledkom'}
                </p>
              )}
              {resultNote && <div className="mt-3 text-sm text-slate-600">{resultNote}</div>}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {resultAction}
                <button
                  type="button"
                  onClick={restart}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-4 py-2 font-semibold hover:bg-slate-200"
                >
                  <RotateCcw className="h-4 w-4" /> {mode === 'replay' ? 'Pozrieť znova' : 'Znova'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
                >
                  Späť
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {mode !== 'replay' &&
        (touch ? (
          <div className="flex shrink-0 items-center justify-between px-6 pb-6 pt-3">
            <Joystick onDir={(d) => (joy.current = d)} />
            <ActionButton onAct={(v) => (actBtn.current = v)} />
          </div>
        ) : (
          <p className="shrink-0 pb-3 pt-2 text-center text-xs text-white/60">
            Šípky alebo WASD — pohyb · Medzerník — rozbiť stenu · Esc — späť
          </p>
        ))}
    </div>
  );
}

function hudOf(s: RunState) {
  return { remaining: remainingTicks(s), keys: s.keys, hits: s.hits, treasure: s.hasTreasure };
}

function ResultHeading({ mode, success }: { mode: RunMode; success: boolean }) {
  const [text, sub] =
    mode === 'test'
      ? success
        ? ['Dá sa prejsť! ✅', 'Pevnosť je overená — môžeš ju zverejniť.']
        : ['Tentoraz to nevyšlo', 'Pevnosť treba vedieť prejsť vlastnými silami. Skús znova, alebo ju uľahči.']
      : mode === 'raid'
        ? success
          ? ['Vykradnuté! 🏆', 'Poklad je tvoj.']
          : ['Tentoraz nie', 'Obrancovia vyhrali. Skús to znova!']
        : success
          ? ['Pevnosť padla', 'Nájazdník sa dostal k pokladu a späť.']
          : ['Pevnosť vydržala 🛡️', 'Nájazdník to nestihol.'];
  return (
    <div>
      {success && (
        <svg viewBox="0 0 40 40" className="mx-auto mb-2 h-14 w-14" aria-hidden>
          <ChestIcon />
        </svg>
      )}
      <h3 className="text-2xl font-black">{text}</h3>
      <p className="mt-1 text-sm text-slate-500">{sub}</p>
    </div>
  );
}

function ChestIcon() {
  return (
    <g>
      <rect x="6" y="14" width="28" height="18" rx="3" fill="#9b5a2c" />
      <rect x="6" y="20" width="28" height="4" fill="#7a4420" />
      <rect x="18" y="14" width="4" height="18" fill="#f5c542" />
      <rect x="16.5" y="19" width="7" height="6" fill="#c9971a" />
    </g>
  );
}


import { useRef, useState } from 'react';
import type { Dir } from '@/games/fortress/engine';

/**
 * Joystick na obrazovke pre mobil. Palec potiahne guličku; hra dostane
 * prevládajúci smer (hore/dole/vľavo/vpravo), pretože pohyb je po políčkach.
 * Mŕtva zóna v strede, aby jemné chvenie prsta nehýbalo postavičkou.
 */
export function Joystick({ onDir }: { onDir: (d: Dir) => void }) {
  const padRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  const R = 52;

  const update = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const r = pad.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy });
    if (len < 14) return onDir(0);
    if (Math.abs(dx) > Math.abs(dy)) onDir(dx > 0 ? 2 : 4);
    else onDir(dy > 0 ? 3 : 1);
  };

  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    onDir(0);
  };

  return (
    <div
      ref={padRef}
      className="relative h-36 w-36 shrink-0 touch-none select-none rounded-full border-4 border-white/25 bg-white/10"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Pohyb"
      role="application"
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 rounded-full border-4 border-white/60 bg-white/40 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

/** Tlačidlo akcie — rozbíjanie stien. Drží sa, kým je prst na ňom. */
export function ActionButton({ onAct }: { onAct: (down: boolean) => void }) {
  return (
    <button
      type="button"
      className="grid h-24 w-24 shrink-0 touch-none select-none place-items-center rounded-full border-4 border-orange-200/60 bg-orange-500 text-3xl font-black text-white shadow-lg active:scale-95"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        onAct(true);
      }}
      onPointerUp={() => onAct(false)}
      onPointerCancel={() => onAct(false)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Rozbiť stenu"
    >
      💥
    </button>
  );
}

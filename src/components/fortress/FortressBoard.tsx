import { useEffect, useRef } from 'react';
import { W, H } from '@/games/fortress/engine';
import { drawCells } from '@/games/fortress/render';

interface Props {
  cells: string;
  /** Veľkosť políčka v px. */
  ts: number;
  ownerView?: boolean;
  /** Živé animácie (píla, portál). Náhľady v zoznamoch ich nepotrebujú. */
  animate?: boolean;
  hover?: number | null;
  className?: string;
  onPointerDown?: (i: number, e: React.PointerEvent) => void;
  onPointerMove?: (i: number, e: React.PointerEvent) => void;
  onPointerUp?: () => void;
  onHover?: (i: number | null) => void;
}

/** Pevnosť bez nájazdníka: editor, náhľad v zozname, profil. */
export function FortressBoard({
  cells, ts, ownerView = false, animate = false, hover = null, className,
  onPointerDown, onPointerMove, onPointerUp, onHover,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = ts * W * dpr;
    canvas.height = ts * H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCells(ctx, cells, { ts, time: t, ownerView, hover });
      if (animate) raf = requestAnimationFrame(draw);
    };
    draw(0);
    if (animate) raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cells, ts, ownerView, animate, hover]);

  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * H);
    if (x < 0 || y < 0 || x >= W || y >= H) return -1;
    return y * W + x;
  };

  return (
    <canvas
      ref={ref}
      style={{ width: ts * W, height: ts * H, touchAction: onPointerDown ? 'none' : undefined }}
      className={className}
      onPointerDown={
        onPointerDown &&
        ((e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          const i = at(e);
          if (i >= 0) onPointerDown(i, e);
        })
      }
      onPointerMove={(e) => {
        const i = at(e);
        onHover?.(i >= 0 ? i : null);
        if (onPointerMove && i >= 0) onPointerMove(i, e);
      }}
      onPointerUp={onPointerUp}
      onPointerLeave={() => onHover?.(null)}
    />
  );
}

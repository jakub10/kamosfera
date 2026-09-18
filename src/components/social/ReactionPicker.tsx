import { useEffect, useRef, useState } from 'react';
import { REACTIONS, getReaction, type ReactionKind } from '@/lib/reactions';

interface ReactionPickerProps {
  /** Reakce, kterou už dítě dalo — nebo null, když ještě žádnou. */
  current: ReactionKind | null;
  onPick: (kind: ReactionKind) => void;
  disabled?: boolean;
}

/**
 * Výběr reakce na příspěvek.
 *
 * Otevře se kliknutím a zavře kliknutím vedle, Escapem nebo odchodem fokusu —
 * ne najetím myši. Na telefonu myš není a děti jsou hlavně na telefonu; pokud
 * by se zavíralo odjetím kurzoru, na mobilu by zůstávalo viset otevřené.
 *
 * Bublinky vylétnou postupně, každá o chlup později. Je to jediná ozdoba,
 * kterou si tahle komponenta bere, a při `prefers-reduced-motion` se vypne.
 */
export function ReactionPicker({ current, onPick, disabled }: ReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  const picked = getReaction(current);

  // Zavřít při kliknutí mimo a při Escapu.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) firstOptionRef.current?.focus();
  }, [open]);

  const choose = (kind: ReactionKind) => {
    onPick(kind);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={picked ? `Tvoje reakce: ${picked.label}. Změnit` : 'Přidat reakci'}
        className={`reaction-trigger inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm
          font-medium transition-colors disabled:opacity-50
          ${picked
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
        style={picked ? { boxShadow: `inset 0 0 0 1.5px ${picked.tint}` } : undefined}
      >
        <span className={`text-lg leading-none ${picked ? 'reaction-pop' : ''}`} key={picked?.kind}>
          {picked ? picked.glyph : '＋'}
        </span>
        <span>{picked ? picked.label : 'Reagovat'}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Vyber reakci"
          className="reaction-tray absolute bottom-full left-0 z-30 mb-2 flex gap-1 rounded-2xl
            border border-border bg-popover p-2 shadow-lg"
        >
          {REACTIONS.map((r, i) => {
            const isCurrent = r.kind === current;
            return (
              <button
                key={r.kind}
                ref={i === 0 ? firstOptionRef : undefined}
                type="button"
                role="menuitem"
                onClick={() => choose(r.kind)}
                title={`${r.label} — ${r.hint}`}
                aria-label={`${r.label}, ${r.hint}`}
                aria-current={isCurrent}
                style={{ '--delay': `${i * 45}ms`, '--tint': r.tint } as React.CSSProperties}
                className={`reaction-option group relative grid h-11 w-11 place-items-center rounded-full
                  text-2xl transition-transform focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-ring hover:scale-125 focus-visible:scale-125
                  ${isCurrent ? 'bg-accent' : ''}`}
              >
                <span aria-hidden="true">{r.glyph}</span>
                {/* Popisek se ukáže až nad vybranou bublinou, ať jich nesvítí pět naráz. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-9 left-1/2 hidden -translate-x-1/2
                    whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium text-white
                    shadow-sm group-hover:block group-focus-visible:block"
                  style={{ backgroundColor: r.tint }}
                >
                  {r.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

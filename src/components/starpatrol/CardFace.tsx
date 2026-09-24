import { CARD_INFO, type CardKind } from '@/games/starpatrol/api';
import { cn } from '@/lib/utils';

interface Props {
  kind: CardKind;
  selected?: boolean;
  /** Karta sa teraz nedá zahrať (napr. štít) — len stlmiť, nie skryť. */
  muted?: boolean;
  /** Označená na zahodenie. */
  marked?: boolean;
  small?: boolean;
  onClick?: () => void;
}

/** Karta ako z balíčka: farba podľa druhu, veľká ikonka, krátke pravidlo. */
export function CardFace({ kind, selected, muted, marked, small, onClick }: Props) {
  const c = CARD_INFO[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={`${c.name}: ${c.text}`}
      className={cn(
        'relative shrink-0 select-none overflow-hidden rounded-xl border-2 bg-gradient-to-br text-left text-white shadow-lg transition',
        c.color,
        small ? 'h-16 w-12 p-1' : 'h-[7.5rem] w-[5.5rem] p-1.5 sm:h-32 sm:w-24 [@media(max-height:640px)]:h-[5.5rem] [@media(max-height:640px)]:w-[4.75rem]',
        selected ? '-translate-y-3 border-yellow-300 ring-4 ring-yellow-300/60' : 'border-white/30',
        marked && 'translate-y-1 border-red-400 opacity-60 ring-4 ring-red-500/60',
        muted && !selected && !marked && 'opacity-60',
        onClick && !selected && 'hover:-translate-y-1'
      )}
    >
      {/* hviezdičky v pozadí */}
      <span className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:12px_12px]" />
      <span className={cn('relative block text-center leading-none', small ? 'text-2xl' : 'mt-1 text-4xl [@media(max-height:640px)]:text-3xl')}>{c.icon}</span>
      {!small && (
        <>
          <span className="relative mt-1 block text-center text-[11px] font-black uppercase leading-tight tracking-wide drop-shadow [overflow-wrap:anywhere] [@media(max-height:640px)]:text-[10px]">
            {c.name}
          </span>
          <span className="relative mt-0.5 block text-center text-[9px] leading-tight text-white/90 sm:text-[10px] [@media(max-height:640px)]:hidden">{c.text}</span>
        </>
      )}
      {marked && <span className="absolute right-1 top-1 rounded bg-red-600 px-1 text-[10px] font-bold">✕</span>}
    </button>
  );
}

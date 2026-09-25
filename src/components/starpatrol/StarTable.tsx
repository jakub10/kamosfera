import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Flag, Loader2, ScrollText, X } from 'lucide-react';
import {
  CARD_INFO, ROLE_INFO, WINNER_TEXT, describe, winnerRoles,
  type Action, type Card, type Player, type View,
} from '@/games/starpatrol/api';
import { CardFace } from './CardFace';
import { cn } from '@/lib/utils';

interface Props {
  view: View;
  busy: boolean;
  error: string | null;
  offset: number;
  onAct: (a: Action) => Promise<boolean>;
  onClearError: () => void;
  onLeave: () => void;
  onRematch: () => void;
  onBack: () => void;
  isHost: boolean;
}

const TURN_SECONDS = 45;

/**
 * Kde pri oválnom stole sedí hráč. Ja vždy dole, ostatní v smere ťahov.
 * Počíta sa z naozajstnej veľkosti stola, aby sa dlaždice nezrezali ani na
 * nízkej obrazovke starého notebooku.
 */
function seatPos(i: number, n: number, box: { w: number; h: number }) {
  const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
  const tileW = box.w >= 640 ? 112 : 90;
  const tileH = box.w >= 640 ? 104 : 90;
  const rx = Math.max(0, box.w / 2 - tileW / 2 - 6);
  const ry = Math.max(0, box.h / 2 - tileH / 2 - 4);
  return { left: box.w / 2 + rx * Math.cos(a), top: box.h / 2 + ry * Math.sin(a) };
}

function Energy({ p }: { p: Player }) {
  return (
    <span className="flex justify-center gap-0.5" aria-label={`energia ${p.energy} z ${p.max}`}>
      {Array.from({ length: p.max }, (_, i) => (
        <span
          key={i}
          className={cn('h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5', i < p.energy ? 'bg-yellow-300 shadow-[0_0_6px_#fde047]' : 'bg-white/15')}
        />
      ))}
    </span>
  );
}

export function StarTable({ view, busy, error, offset, onAct, onClearError, onLeave, onRematch, onBack, isHost }: Props) {
  const { room, me, players, hand } = view;
  const n = players.length;
  const byseat = useMemo(() => new Map(players.map((p) => [p.seat, p])), [players]);
  const name = (seat: number | null) => (seat == null ? '?' : byseat.get(seat)?.name ?? '?');
  const mine = byseat.get(me.seat);
  const myTurn = room.status === 'playing' && room.turn_seat === me.seat && me.alive;
  const current = room.turn_seat != null ? byseat.get(room.turn_seat) : undefined;

  const [selected, setSelected] = useState<Card | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [marked, setMarked] = useState<number[]>([]);
  const [showRole, setShowRole] = useState(false);
  const [roleIntro, setRoleIntro] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const logRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Nová hra → ukáž tajnú rolu raz veľkou kartou. Každá hra (aj odveta pri
  // tom istom stole) má vlastný záznam „štart" v denníku.
  const startId = view.log.find((l) => l.kind === 'start')?.id;
  useEffect(() => {
    if (room.status !== 'playing' || !me.role || !startId) return;
    try {
      const key = `hh-role-${startId}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        setRoleIntro(true);
      }
    } catch {
      /* bez úložiska jednoducho bez úvodu */
    }
  }, [room.status, me.role, startId]);

  // Zmena ťahu zruší rozrobený výber.
  useEffect(() => {
    setSelected(null);
    setTarget(null);
    setDiscarding(false);
    setMarked([]);
  }, [room.turn_no, room.status]);

  // Vybraná karta mohla medzitým zmiznúť (ukradli ju).
  useEffect(() => {
    if (selected && !hand.some((c) => c.id === selected.id)) setSelected(null);
  }, [hand, selected]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [view.log.length, logOpen]);

  const left = room.deadline ? Math.max(0, (new Date(room.deadline).getTime() - (now + offset)) / 1000) : 0;
  const needDiscard = mine ? Math.max(0, hand.length - mine.energy) : 0;
  const info = selected ? CARD_INFO[selected.kind] : null;
  const canTarget = (p: Player) =>
    !!info?.target && p.alive && p.seat !== me.seat && p.dist != null && me.reach != null && p.dist <= me.reach;

  const play = async (card: Card, tgt?: number, pick?: 'hand' | number) => {
    const ok = await onAct({ t: 'play', card: card.id, target: tgt, pick });
    if (ok) {
      setSelected(null);
      setTarget(null);
    }
  };

  const clickCard = (c: Card) => {
    onClearError();
    if (discarding) {
      setMarked((m) => (m.includes(c.id) ? m.filter((x) => x !== c.id) : m.length < needDiscard ? [...m, c.id] : m));
      return;
    }
    if (!myTurn) return;
    setTarget(null);
    setSelected((s) => (s?.id === c.id ? null : c));
  };

  const clickPlayer = (p: Player) => {
    if (!selected || !canTarget(p)) return;
    if (selected.kind === 'tractor' && p.eq.length > 0) {
      setTarget(p.seat);
      return;
    }
    void play(selected, p.seat, selected.kind === 'tractor' ? 'hand' : undefined);
  };

  const endTurn = async () => {
    onClearError();
    if (needDiscard > 0 && !discarding) {
      setSelected(null);
      setDiscarding(true);
      setMarked([]);
      return;
    }
    await onAct({ t: 'end', discard: marked });
  };

  const lasersLeft = room.lasers_used < 1;
  const cardHint = (c: Card) =>
    c.kind === 'shield' || (c.kind === 'laser' && !lasersLeft) || (c.kind === 'repair' && mine && mine.energy >= mine.max);

  const myIndexOrder = (p: Player) => (p.seat - me.seat + n) % n;
  const winners = room.winner ? winnerRoles(room.winner) : [];
  const iWon = !!room.winner && !!me.role && winners.includes(me.role);

  const lastLines = view.log.slice(-2);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#070b1f] text-white">
      {/* hviezdne pozadie */}
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(1px_1px_at_20px_30px,white,transparent),radial-gradient(1px_1px_at_140px_80px,#c7d2fe,transparent),radial-gradient(1.5px_1.5px_at_90px_150px,white,transparent),radial-gradient(1px_1px_at_200px_190px,#fde68a,transparent)] [background-size:240px_220px]" />
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl" />

      {/* horná lišta */}
      <header className="relative flex items-center gap-2 px-3 py-2 sm:px-4">
        <span className="text-lg">🌌</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black sm:text-base">Hviezdna Hliadka</p>
          <p className="truncate text-[11px] text-white/60">
            Stôl {room.code} · balíček {view.deck}
          </p>
        </div>
        {room.status === 'playing' && current && (
          <div className="min-w-[7.5rem] text-right">
            <p className="truncate text-xs font-bold sm:text-sm">
              {myTurn ? 'Si na ťahu!' : `Ťahá: ${current.name}`}
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className={cn('h-full rounded-full transition-[width] duration-300', left <= 10 ? 'bg-red-400' : 'bg-emerald-400')}
                style={{ width: `${Math.min(100, (left / TURN_SECONDS) * 100)}%` }}
              />
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setLogOpen((o) => !o)}
          className="rounded-lg p-2 hover:bg-white/10 lg:hidden"
          aria-label="Denník hry"
        >
          <ScrollText className="h-5 w-5" />
        </button>
        {room.status === 'playing' && me.alive ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Naozaj sa vzdáš? Vypadneš z hry a ostatní budú hrať ďalej.')) onLeave();
            }}
            className="rounded-lg p-2 hover:bg-white/10"
            aria-label="Vzdať sa"
            title="Vzdať sa"
          >
            <Flag className="h-5 w-5" />
          </button>
        ) : (
          <button type="button" onClick={onBack} className="rounded-lg p-2 hover:bg-white/10" aria-label="Zavrieť">
            <X className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* stôl */}
        <section ref={tableRef} className="relative min-h-0 flex-1">
          <div className="absolute inset-2 rounded-[50%] border border-indigo-300/20 bg-indigo-500/5 shadow-[inset_0_0_60px_rgba(99,102,241,0.25)] sm:inset-6" />
          {/* stred stola: balíček a posledná akcia */}
          <div className="absolute left-1/2 top-1/2 flex w-[46%] max-w-xs -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center">
            <div className="flex items-end gap-2">
              <div className="grid h-14 w-10 place-items-center rounded-lg border-2 border-white/30 bg-gradient-to-br from-indigo-500 to-violet-800 text-lg shadow-lg sm:h-16 sm:w-12">
                🌌
              </div>
              {view.discard_top && <CardFace kind={view.discard_top} small />}
            </div>
            {lastLines.map((l) => (
              <p key={l.id} className="line-clamp-2 text-[11px] leading-tight text-white/80 sm:text-xs lg:hidden">
                {describe(l, name)}
              </p>
            ))}
          </div>

          {players.map((p) => {
            const pos = seatPos(myIndexOrder(p), n, box);
            const turn = room.status === 'playing' && room.turn_seat === p.seat;
            const targetable = canTarget(p);
            const out = !!selected && info?.target && !targetable && p.seat !== me.seat && p.alive;
            const role = p.role ? ROLE_INFO[p.role] : null;
            const won = room.winner && p.role && winners.includes(p.role);
            return (
              <button
                key={p.seat}
                type="button"
                onClick={() => clickPlayer(p)}
                disabled={!targetable}
                style={pos}
                className={cn(
                  'absolute w-[5.6rem] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-slate-900/85 p-1.5 text-center shadow-lg backdrop-blur transition sm:w-28 sm:p-2',
                  turn ? 'border-emerald-400 ring-2 ring-emerald-400/60' : 'border-white/15',
                  p.seat === me.seat && 'bg-indigo-950/90',
                  !p.alive && 'opacity-50 grayscale',
                  targetable && 'animate-pulse cursor-pointer border-yellow-300 ring-4 ring-yellow-300/70',
                  target === p.seat && 'border-yellow-300 ring-4 ring-yellow-300',
                  out && 'opacity-40',
                  won && 'border-amber-300 ring-4 ring-amber-300/70'
                )}
              >
                <div className="flex items-center justify-center gap-1">
                  {p.avatar ? (
                    <img src={p.avatar} alt="" className="h-6 w-6 rounded-full bg-white/10 sm:h-7 sm:w-7" />
                  ) : (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-xs">🧑</span>
                  )}
                  {role && (
                    <span title={role.name} className="text-base leading-none">
                      {role.icon}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] font-bold sm:text-xs">
                  {p.seat === me.seat ? 'Ty' : p.name}
                </p>
                {room.status !== 'lobby' && <Energy p={p} />}
                <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-white/70">
                  {p.alive ? (
                    <>
                      <span title="karty v ruke">🂠{p.hand}</span>
                      {p.eq.map((c) => (
                        <span key={c.id} title={CARD_INFO[c.kind].name}>
                          {CARD_INFO[c.kind].icon}
                        </span>
                      ))}
                      {p.dist != null && (
                        <span title="vzdialenosť" className="rounded bg-white/10 px-1">
                          ↔{p.dist}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>💀 {role?.name ?? 'mimo hry'}</span>
                  )}
                </div>
              </button>
            );
          })}
        </section>

        {/* denník */}
        <aside
          className={cn(
            'absolute inset-y-0 right-0 z-10 w-72 flex-col border-l border-white/10 bg-slate-950/95 p-3 lg:static lg:flex lg:bg-slate-950/60',
            logOpen ? 'flex' : 'hidden'
          )}
        >
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/60">
            <ScrollText className="h-4 w-4" /> Denník
          </p>
          <div ref={logRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-xs">
            {view.log.map((l) => (
              <p key={l.id} className={cn('leading-snug', l.kind === 'turn' ? 'pt-1 font-bold text-emerald-300' : 'text-white/85')}>
                {describe(l, name)}
              </p>
            ))}
          </div>
        </aside>
      </div>

      {/* moja časť: rola, ruka, tlačidlá */}
      <footer className="relative border-t border-white/10 bg-slate-950/70 px-2 pb-2 pt-1 backdrop-blur sm:px-4">
        {error && (
          <button
            type="button"
            onClick={onClearError}
            className="mx-auto mb-1 block max-w-lg rounded-lg bg-red-500/90 px-3 py-1 text-center text-xs font-semibold"
          >
            {error}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2 py-1">
          {me.role && (
            <button
              type="button"
              onClick={() => setShowRole((s) => !s)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-xs font-bold',
                showRole ? `bg-gradient-to-r ${ROLE_INFO[me.role].color}` : 'bg-white/10'
              )}
              title="Tvoja tajná rola — klikni na zobrazenie/skrytie"
            >
              {showRole ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showRole ? `${ROLE_INFO[me.role].icon} ${ROLE_INFO[me.role].name}` : 'Moja rola'}
            </button>
          )}
          {me.reach != null && <span className="text-xs text-white/60">dosah {me.reach}</span>}

          <div className="ml-auto flex items-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {myTurn && selected && info && !info.target && (
              <button
                type="button"
                onClick={() => void play(selected)}
                disabled={busy}
                className="rounded-full bg-yellow-300 px-4 py-1.5 text-sm font-black text-slate-900 shadow hover:bg-yellow-200"
              >
                Zahrať: {info.name}
              </button>
            )}
            {myTurn && selected && info?.target && target == null && (
              <span className="rounded-full bg-yellow-300/20 px-3 py-1 text-xs font-bold text-yellow-200">
                Klikni na hráča so žltým rámikom
              </span>
            )}
            {myTurn && discarding && (
              <span className="text-xs font-bold text-red-200">
                Zahoď {needDiscard} {needDiscard === 1 ? 'kartu' : needDiscard < 5 ? 'karty' : 'kariet'} ({marked.length}/{needDiscard})
              </span>
            )}
            {myTurn && (
              <button
                type="button"
                onClick={() => void endTurn()}
                disabled={busy || (discarding && marked.length !== needDiscard)}
                className="rounded-full bg-emerald-400 px-4 py-1.5 text-sm font-black text-slate-900 shadow hover:bg-emerald-300 disabled:opacity-50"
              >
                {discarding ? 'Zahodiť a ukončiť' : 'Ukončiť ťah'}
              </button>
            )}
          </div>
        </div>

        {/* traktor: čo ukradnúť */}
        {selected?.kind === 'tractor' && target != null && (
          <div className="mb-1 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="font-bold">Čo ukradneš ({name(target)})?</span>
            <button
              type="button"
              onClick={() => void play(selected, target, 'hand')}
              className="rounded-full bg-fuchsia-500 px-3 py-1 font-bold"
            >
              🂠 Náhodnú kartu z ruky
            </button>
            {byseat.get(target)?.eq.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void play(selected, target, c.id)}
                className="rounded-full bg-fuchsia-500 px-3 py-1 font-bold"
              >
                {CARD_INFO[c.kind].icon} {CARD_INFO[c.kind].name}
              </button>
            ))}
            <button type="button" onClick={() => setTarget(null)} className="rounded-full bg-white/10 px-3 py-1">
              Späť
            </button>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto px-1 pb-1 pt-3 sm:justify-center [@media(max-height:640px)]:pt-2">
          {hand.length === 0 && room.status === 'playing' && (
            <p className="py-6 text-center text-xs text-white/50">{me.alive ? 'Nemáš žiadne karty.' : 'Si mimo hry — sleduj, ako to dopadne.'}</p>
          )}
          {hand.map((c) => (
            <CardFace
              key={c.id}
              kind={c.kind}
              selected={selected?.id === c.id}
              marked={marked.includes(c.id)}
              muted={myTurn && !discarding && cardHint(c)}
              onClick={myTurn || discarding ? () => clickCard(c) : undefined}
            />
          ))}
        </div>
      </footer>

      {/* úvod: tajná rola */}
      {roleIntro && me.role && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-4">
          <div className={cn('w-full max-w-xs rounded-3xl bg-gradient-to-br p-6 text-center shadow-2xl', ROLE_INFO[me.role].color)}>
            <p className="text-xs font-bold uppercase tracking-widest text-white/80">Tvoja tajná rola</p>
            <p className="my-3 text-7xl">{ROLE_INFO[me.role].icon}</p>
            <p className="text-2xl font-black">{ROLE_INFO[me.role].name}</p>
            <p className="mt-2 text-sm">{ROLE_INFO[me.role].goal}</p>
            {me.role !== 'captain' && <p className="mt-2 text-xs text-white/80">Nikomu ju neprezraď! 🤫</p>}
            <button
              type="button"
              onClick={() => setRoleIntro(false)}
              className="mt-4 rounded-full bg-white px-6 py-2 font-black text-slate-900"
            >
              Rozumiem
            </button>
          </div>
        </div>
      )}

      {/* koniec hry */}
      {room.status === 'finished' && room.winner && (
        <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-black/75 p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/20 bg-slate-900 p-5 text-center shadow-2xl">
            <p className="text-5xl">{iWon ? '🏆' : '🌠'}</p>
            <p className="mt-2 text-xl font-black">{iWon ? 'Vyhrali ste!' : 'Tentoraz nie…'}</p>
            <p className="mt-1 text-sm text-white/80">{WINNER_TEXT[room.winner]}</p>
            <ul className="mt-4 grid grid-cols-2 gap-2 text-left text-xs">
              {players.map((p) => (
                <li
                  key={p.seat}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-2 py-1.5',
                    p.role && winners.includes(p.role) ? 'border-amber-300 bg-amber-300/10' : 'border-white/10'
                  )}
                >
                  <span className="text-lg">{p.role ? ROLE_INFO[p.role].icon : '?'}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{p.seat === me.seat ? 'Ty' : p.name}</span>
                    <span className="text-white/60">{p.role ? ROLE_INFO[p.role].name : ''}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {isHost ? (
                <button
                  type="button"
                  onClick={onRematch}
                  disabled={busy}
                  className="rounded-full bg-emerald-400 px-5 py-2 font-black text-slate-900"
                >
                  Hrať znova s touto partiou
                </button>
              ) : (
                <p className="w-full text-xs text-white/60">Novú hru môže spustiť ten, kto stôl založil.</p>
              )}
              <button type="button" onClick={onBack} className="rounded-full bg-white/10 px-5 py-2 font-bold">
                Späť do menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

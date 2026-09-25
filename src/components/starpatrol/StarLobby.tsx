import { useEffect, useState } from 'react';
import { Check, Copy, Crown, Loader2, LogOut, Rocket, UserPlus } from 'lucide-react';
import { loadFriends, inviteFriend, MAX_PLAYERS, MIN_PLAYERS, type Friend, type View } from '@/games/starpatrol/api';
import { cn } from '@/lib/utils';

interface Props {
  view: View;
  uid: string;
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onLeave: () => void;
}

/** Predsieň: kód stola, kto už sedí, pozvánky pre kamarátov, štart. */
export function StarLobby({ view, uid, busy, error, onStart, onLeave }: Props) {
  const { room, players } = view;
  const isHost = room.host_id === uid;
  const n = players.length;
  const link = `${window.location.origin}/hliadka?kod=${room.code}`;
  const [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [invited, setInvited] = useState<Record<string, 'sending' | 'sent' | string>>({});

  useEffect(() => {
    loadFriends(uid)
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [uid]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Skopíruj si odkaz:', link);
    }
  };

  const invite = async (f: Friend) => {
    setInvited((s) => ({ ...s, [f.user_id]: 'sending' }));
    try {
      await inviteFriend(room.id, f.user_id);
      setInvited((s) => ({ ...s, [f.user_id]: 'sent' }));
    } catch (e) {
      setInvited((s) => ({ ...s, [f.user_id]: (e as Error).message }));
    }
  };

  const seated = new Set(players.map((p) => p.user_id));
  const missing = Math.max(0, MIN_PLAYERS - n);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-4 rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 p-5 text-white shadow-xl">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-white/60">Kód stola</p>
          <p className="my-1 font-mono text-5xl font-black tracking-[0.25em] text-yellow-300 drop-shadow">{room.code}</p>
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold hover:bg-white/20"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Skopírované!' : 'Kopírovať odkaz'}
          </button>
        </div>

        <div>
          <p className="mb-2 text-sm font-bold">
            Na palube: {n}/{MAX_PLAYERS}
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {players.map((p) => (
              <li key={p.user_id} className="flex items-center gap-2 rounded-xl bg-white/10 px-2 py-1.5">
                {p.avatar ? (
                  <img src={p.avatar} alt="" className="h-7 w-7 rounded-full bg-white/10" />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10">🧑</span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.user_id === uid ? 'Ty' : p.name}</span>
                {p.user_id === room.host_id && <Crown className="h-4 w-4 shrink-0 text-yellow-300" aria-label="hostiteľ" />}
              </li>
            ))}
            {Array.from({ length: missing }, (_, i) => (
              <li key={`e${i}`} className="grid place-items-center rounded-xl border border-dashed border-white/20 py-2 text-xs text-white/40">
                voľné miesto
              </li>
            ))}
          </ul>
        </div>

        {error && <p className="rounded-lg bg-red-500/90 px-3 py-1.5 text-center text-sm font-semibold">{error}</p>}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {isHost ? (
            <button
              type="button"
              onClick={onStart}
              disabled={busy || n < MIN_PLAYERS}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-2.5 font-black text-slate-900 shadow-lg transition hover:bg-emerald-300 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
              {n < MIN_PLAYERS ? `Ešte ${missing} ${missing === 1 ? 'hráč' : 'hráči'}` : 'Štart!'}
            </button>
          ) : (
            <p className="text-sm text-white/70">Čakáme, kým hostiteľ spustí hru… 🚀</p>
          )}
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
          >
            <LogOut className="h-4 w-4" /> Odísť
          </button>
        </div>
      </section>

      <section className="rounded-3xl border p-5">
        <p className="mb-3 flex items-center gap-2 font-bold">
          <UserPlus className="h-5 w-5" /> Pozvi kamarátov
        </p>
        {friends === null ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        ) : friends.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Zatiaľ nemáš kamarátov v Kamosfére. Pošli im kód <b>{room.code}</b> alebo odkaz.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {friends.map((f) => {
              const st = invited[f.user_id];
              const here = seated.has(f.user_id);
              return (
                <li key={f.user_id} className="flex items-center gap-2 rounded-xl bg-muted/60 px-2 py-1.5">
                  {f.avatar_url ? (
                    <img src={f.avatar_url} alt="" className="h-8 w-8 rounded-full" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-muted">🧑</span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.username}</span>
                  {here ? (
                    <span className="text-xs font-semibold text-emerald-600">pri stole ✓</span>
                  ) : st === 'sent' ? (
                    <span className="text-xs font-semibold text-emerald-600">pozvaný ✓</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void invite(f)}
                      disabled={st === 'sending' || room.status !== 'lobby'}
                      className={cn(
                        'rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground',
                        st === 'sending' && 'opacity-60'
                      )}
                    >
                      Pozvať
                    </button>
                  )}
                  {st && st !== 'sent' && st !== 'sending' && <span className="text-[10px] text-red-600">{st}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

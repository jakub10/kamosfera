import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Loader2, LogIn, Plus, Rocket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/social/Sidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { StarLobby } from '@/components/starpatrol/StarLobby';
import { StarTable } from '@/components/starpatrol/StarTable';
import { StarRules } from '@/components/starpatrol/StarRules';
import {
  createRoom, joinRoom, leaveRoom, myRooms, rematch, startRoom, type MyRoom,
} from '@/games/starpatrol/api';
import { useStarRoom } from '@/games/starpatrol/useStarRoom';

/**
 * Hviezdna Hliadka — kartová hra so skrytými rolami pre 4–7 kamarátov.
 *
 * Stôl sa volá kódom z URL (`/hliadka?kod=ABCDE`), takže odkaz sa dá poslať
 * kamarátovi a po výpadku internetu stačí stránku obnoviť — hráč sa vráti
 * na svoje miesto.
 */

interface Profile {
  username: string;
  full_name: string;
  avatar_url: string | null;
}

const Hliadka = () => {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const code = params.get('kod')?.toUpperCase() ?? null;
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [typed, setTyped] = useState('');
  const [rooms, setRooms] = useState<MyRoom[]>([]);
  const [showRules, setShowRules] = useState(false);
  const { view, error, setError, busy, act, apply, refresh, offset } = useStarRoom(roomId);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setCurrentProfile(data));
  }, [user]);

  const goHome = useCallback(() => {
    setRoomId(null);
    params.delete('kod');
    setParams(params, { replace: true });
  }, [params, setParams]);

  // Kód v URL → sadnúť si k stolu (alebo sa k nemu vrátiť).
  useEffect(() => {
    if (!user || !code) {
      setRoomId(null);
      return;
    }
    let live = true;
    setJoining(true);
    setJoinError(null);
    joinRoom(code)
      .then((r) => live && setRoomId(r.id))
      .catch((e: Error) => {
        if (!live) return;
        setJoinError(e.message);
        setRoomId(null);
      })
      .finally(() => live && setJoining(false));
    return () => {
      live = false;
    };
  }, [user, code]);

  // Stôl zmizol (všetci z predsiene odišli) → späť na úvod.
  useEffect(() => {
    if (roomId && error && /neexistuje|nesedíš/.test(error)) {
      setJoinError(error);
      goHome();
    }
  }, [roomId, error, goHome]);

  useEffect(() => {
    if (!user || code) return;
    myRooms().then(setRooms).catch(() => setRooms([]));
  }, [user, code]);

  const open = (c: string) => {
    params.set('kod', c);
    setParams(params);
  };

  const create = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const r = await createRoom();
      open(r.code);
    } catch (e) {
      setJoinError((e as Error).message);
      setJoining(false);
    }
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    const c = typed.trim().toUpperCase();
    if (c.length === 5) open(c);
    else setJoinError('Kód má 5 znakov.');
  };

  const run = async (fn: () => Promise<unknown>) => {
    try {
      const v = await fn();
      if (v && typeof v === 'object' && 'room' in v) apply(v as Parameters<typeof apply>[0]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const inGame = view && view.room.status !== 'lobby';

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={currentProfile} />
      <Sidebar currentProfile={currentProfile} />

      <main className="px-4 pb-24 pt-16 md:ml-64 md:px-8 md:pb-8 md:pt-6">
        <div className="mx-auto max-w-4xl space-y-5">
          <header className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-900 text-3xl shadow">
              🌌
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black">Hviezdna Hliadka</h1>
              <p className="text-muted-foreground">Kartová hra so skrytými rolami pre 4–7 kamarátov.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowRules((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
            >
              <BookOpen className="h-4 w-4" /> Pravidlá
            </button>
          </header>

          {showRules && (
            <div className="rounded-3xl border p-5">
              <StarRules />
            </div>
          )}

          {loading ? (
            <div className="grid place-items-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !user ? (
            <div className="rounded-2xl border p-8 text-center">
              <p className="mb-3">Na hranie sa treba prihlásiť.</p>
              <Link to="/" className="font-semibold text-primary underline">
                Prihlásiť sa
              </Link>
            </div>
          ) : code && (joining || (roomId && !view)) ? (
            <div className="grid place-items-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : view && view.room.status === 'lobby' ? (
            <StarLobby
              view={view}
              uid={user.id}
              busy={busy}
              error={error}
              onStart={() => void run(() => startRoom(view.room.id))}
              onLeave={() => void leaveRoom(view.room.id).finally(goHome)}
            />
          ) : (
            <div className="space-y-4">
              {joinError && (
                <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 dark:bg-red-950 dark:text-red-200">
                  {joinError}
                </p>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <section className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 p-6 text-center text-white shadow-xl">
                  <p className="text-5xl">🚀</p>
                  <p className="text-lg font-black">Založ novú loď</p>
                  <p className="text-sm text-white/70">Dostaneš kód, pošleš ho kamarátom a keď vás je 4 až 7, štart!</p>
                  <button
                    type="button"
                    onClick={() => void create()}
                    disabled={joining}
                    className="inline-flex items-center gap-2 rounded-full bg-yellow-300 px-6 py-2.5 font-black text-slate-900 shadow-lg hover:bg-yellow-200 disabled:opacity-60"
                  >
                    <Plus className="h-5 w-5" /> Založiť stôl
                  </button>
                </section>

                <section className="space-y-4 rounded-3xl border p-6">
                  <form onSubmit={submitCode} className="space-y-2">
                    <p className="font-bold">Mám kód od kamaráta</p>
                    <div className="flex gap-2">
                      <input
                        value={typed}
                        onChange={(e) => setTyped(e.target.value.toUpperCase().slice(0, 5))}
                        placeholder="ABCDE"
                        aria-label="Kód stola"
                        className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-center font-mono text-xl font-black tracking-[0.3em] uppercase"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 font-bold text-primary-foreground"
                      >
                        <LogIn className="h-4 w-4" /> Pridať sa
                      </button>
                    </div>
                  </form>

                  {rooms.length > 0 && (
                    <div>
                      <p className="mb-2 font-bold">Moje stoly</p>
                      <ul className="space-y-1.5">
                        {rooms.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => open(r.code)}
                              className="flex w-full items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              <Rocket className="h-4 w-4 text-indigo-500" />
                              <span className="font-mono font-bold">{r.code}</span>
                              <span className="text-muted-foreground">
                                {r.status === 'lobby' ? 'čaká sa' : 'hrá sa'} · {r.players} hráčov
                              </span>
                              {r.my_turn && (
                                <span className="ml-auto rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">
                                  si na ťahu!
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              </div>
              {!showRules && (
                <div className="rounded-3xl border p-5">
                  <StarRules />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <MobileNav />

      {user && view && inGame && (
        <StarTable
          view={view}
          busy={busy}
          error={error}
          offset={offset}
          onAct={act}
          onClearError={() => setError(null)}
          onLeave={() => void run(() => leaveRoom(view.room.id)).then(refresh)}
          onRematch={() => void run(() => rematch(view.room.id))}
          onBack={goHome}
          isHost={view.room.host_id === user.id}
        />
      )}
    </div>
  );
};

export default Hliadka;

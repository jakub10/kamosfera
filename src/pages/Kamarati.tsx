import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Link2, Loader2, QrCode as QrIcon, RefreshCw, UserPlus, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/social/Sidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { QrCode } from '@/components/safety/QrCode';
import { appUrl, friendCodeNew, friendCodeUse, friendInviteNew } from '@/lib/childSafety';
import { CopyLink } from '@/components/safety/CopyLink';
import { cn } from '@/lib/utils';

interface Profile {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

/**
 * Kamaráti — len naživo. Nikoho sa nedá vyhľadať; kamarátstvo vznikne, keď
 * jeden ukáže svoj kód (alebo QR) a druhý ho zadá. Kód platí 3 minúty.
 */
const Kamarati = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [me, setMe] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Profile[] | null>(null);
  const [mode, setMode] = useState<'show' | 'enter' | 'remote'>('show');
  const [invite, setInvite] = useState<{ token: string; expires_at: string } | null>(null);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    const { data: rows } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    const ids = (rows ?? []).map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
    if (!ids.length) return setFriends([]);
    const { data } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url')
      .in('user_id', ids)
      .order('username');
    setFriends(data ?? []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setMe(data));
    void loadFriends();
  }, [user, loadFriends]);

  const newCode = useCallback(async () => {
    setMsg(null);
    try {
      setCode(await friendCodeNew());
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    if (mode === 'show' && user && !code) void newCode();
  }, [mode, user, code, newCode]);

  // Odpočet platnosti kódu; každých pár sekúnd sa pozrieme, či ho niekto použil.
  useEffect(() => {
    if (!code) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(code.expires_at).getTime() - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 1000);
    const f = window.setInterval(() => void loadFriends(), 4000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(f);
    };
  }, [code, loadFriends]);

  const redeem = useCallback(
    async (c: string) => {
      setBusy(true);
      setMsg(null);
      try {
        const r = await friendCodeUse(c);
        if (r.error) setMsg({ ok: false, text: r.error });
        else {
          setMsg({ ok: true, text: `Ty a ${r.username} ste kamaráti! 🎉` });
          setTyped('');
          void loadFriends();
        }
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      } finally {
        setBusy(false);
      }
    },
    [loadFriends]
  );

  // QR od kamaráta otvorí /kamarati?kod=XXXXXX — kód sa použije sám.
  useEffect(() => {
    const c = params.get('kod');
    if (!c || !user) return;
    setMode('enter');
    params.delete('kod');
    setParams(params, { replace: true });
    void redeem(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim().length === 6) void redeem(typed);
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={me} />
      <Sidebar currentProfile={me} />
      <main className="px-4 pb-24 pt-16 md:ml-64 md:px-8 md:pb-8 md:pt-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <header className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow">
              <Users className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Kamaráti</h1>
              <p className="text-muted-foreground">Kamaráta si pridáš naživo, keď ste spolu — alebo pozvánkou, keď býva ďaleko.</p>
            </div>
          </header>

          <section className="rounded-3xl border p-5">
            <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
              {(
                [
                  ['show', 'Môj kód', QrIcon],
                  ['enter', 'Zadať kód', UserPlus],
                  ['remote', 'Na diaľku', Link2],
                ] as const
              ).map(([m, label, Icon]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold sm:text-sm',
                    mode === m ? 'bg-background shadow' : 'text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>

            {mode === 'remote' ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-muted-foreground">
                  Kamarát býva ďaleko (iné mesto, Česko, Slovensko)? Pošli mu pozývací odkaz. Keď ho otvorí, budete
                  kamaráti — a ak v Kamosfére ešte nie je, môže sa zaregistrovať.
                </p>
                {invite ? (
                  <>
                    <p className="w-full break-all rounded-xl bg-muted px-3 py-2 font-mono text-xs">{appUrl(`/pozvanka/${invite.token}`)}</p>
                    <CopyLink link={appUrl(`/pozvanka/${invite.token}`)} />
                    <p className="text-xs text-muted-foreground">
                      Platí 7 dní a dá sa použiť len raz. Pošli ho len kamarátovi, ktorého naozaj poznáš. 💛
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      setMsg(null);
                      try {
                        setInvite(await friendInviteNew());
                      } catch (e) {
                        setMsg({ ok: false, text: (e as Error).message });
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 font-bold text-white"
                  >
                    <Link2 className="h-4 w-4" /> Vytvoriť pozývací odkaz
                  </button>
                )}
              </div>
            ) : mode === 'show' ? (
              <div className="flex flex-col items-center gap-3 text-center">
                {code && left > 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">Ukáž to kamarátovi, ktorý stojí pri tebe:</p>
                    <p className="font-mono text-5xl font-black tracking-[0.2em] text-emerald-600">{code.code}</p>
                    <QrCode value={appUrl(`/kamarati?kod=${code.code}`)} size={180} />
                    <p className="text-xs text-muted-foreground">
                      Platí ešte {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} · dá sa použiť raz
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void newCode()}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 font-bold text-white"
                  >
                    <RefreshCw className="h-4 w-4" /> {code ? 'Kód vypršal — nový kód' : 'Ukázať môj kód'}
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col items-center gap-3">
                <p className="text-sm text-muted-foreground">Napíš kód, ktorý ti ukazuje kamarát na svojej obrazovke:</p>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="ABC123"
                  aria-label="Kód kamaráta"
                  className="w-56 rounded-xl border bg-background px-3 py-2 text-center font-mono text-3xl font-black tracking-[0.25em]"
                />
                <button
                  type="submit"
                  disabled={busy || typed.length !== 6}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-2 font-bold text-white disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sme kamaráti!
                </button>
                <p className="text-xs text-muted-foreground">Alebo naskenuj kamarátov QR fotoaparátom v mobile.</p>
              </form>
            )}

            {msg && (
              <p
                className={cn(
                  'mt-4 rounded-xl px-4 py-2 text-center text-sm font-semibold',
                  msg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200'
                )}
              >
                {msg.text}
              </p>
            )}
          </section>

          <section className="rounded-3xl border p-5">
            <p className="mb-3 font-bold">Moji kamaráti {friends ? `(${friends.length})` : ''}</p>
            {friends === null ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            ) : friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">Zatiaľ žiadni. Keď budeš s kamarátom, ukáž mu svoj kód. 🙂</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {friends.map((f) => (
                  <li key={f.user_id}>
                    <Link to={`/profile/${f.user_id}`} className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2 hover:bg-muted">
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-muted">🧑</span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{f.full_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">@{f.username}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
      <MobileNav />
    </div>
  );
};

export default Kamarati;

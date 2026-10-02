import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AuthModal } from '@/components/auth/AuthModal';
import { friendInviteInfo, friendInviteUse, INVITE_KEY } from '@/lib/childSafety';
import mascotFriends from '@/assets/mascot-friends.png';

/**
 * Pozývací odkaz od kamaráta, ktorý býva ďaleko. Kto ešte nemá účet, uvidí,
 * kto ho pozýva, a zaregistruje sa; odkaz sa použije hneď po prihlásení.
 */
const Pozvanka = () => {
  const { token = '' } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ inviter: string; valid: boolean } | null | undefined>(undefined);
  const [auth, setAuth] = useState<'login' | 'signup' | null>(null);
  const [result, setResult] = useState<{ username?: string; pending?: boolean; error?: string } | null>(null);

  useEffect(() => {
    friendInviteInfo(token)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [token]);

  // Prihlásený → použiť hneď.
  useEffect(() => {
    if (!user || !info?.valid || result) return;
    friendInviteUse(token)
      .then(setResult)
      .catch((e: Error) => setResult({ error: e.message }));
    try {
      localStorage.removeItem(INVITE_KEY);
    } catch {
      /* nevadí */
    }
  }, [user, info, token, result]);

  const openAuth = (tab: 'login' | 'signup') => {
    try {
      localStorage.setItem(INVITE_KEY, token);
    } catch {
      /* bez úložiska sa odkaz po registrácii otvorí znova ručne */
    }
    setAuth(tab);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-sky-50 px-4 py-8 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-md rounded-3xl bg-card p-6 text-center shadow-xl sm:p-8">
        <img src={mascotFriends} alt="" className="mx-auto h-28 w-28 object-contain" />
        {info === undefined || loading ? (
          <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-muted-foreground" />
        ) : !info || !info.valid ? (
          <p className="mt-4">Táto pozvánka už neplatí. Popros kamaráta o novú. 🙂</p>
        ) : result ? (
          result.error ? (
            <p className="mt-4 font-semibold text-red-600">{result.error}</p>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-2xl font-black">Ty a {result.username} ste kamaráti! 🎉</p>
              {result.pending && (
                <p className="text-sm text-muted-foreground">
                  Ešte treba súhlas rodiča a správca ťa pustí dnu. Potom sa uvidíte v Kamosfére.
                </p>
              )}
              <button
                type="button"
                onClick={() => navigate(result.pending ? '/' : '/kamarati')}
                className="rounded-full bg-emerald-500 px-6 py-2 font-bold text-white"
              >
                Pokračovať
              </button>
            </div>
          )
        ) : user ? (
          <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <div className="mt-4 space-y-4">
            <h1 className="text-2xl font-black">
              <span className="text-emerald-600">{info.inviter}</span> ťa volá do Kamosféry!
            </h1>
            <p className="text-sm text-muted-foreground">
              Kamosféra je sociálna sieť pre partiu kamarátov. Po registrácii budete kamaráti. Dnu ťa pustí správca, keď
              rodič potvrdí súhlas.
            </p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => openAuth('signup')} className="rounded-full bg-emerald-500 py-3 text-lg font-black text-white">
                Zaregistrovať sa
              </button>
              <button type="button" onClick={() => openAuth('login')} className="rounded-full border py-2 font-semibold">
                Už mám účet — prihlásiť sa
              </button>
            </div>
          </div>
        )}
      </div>
      <AuthModal open={!!auth} onOpenChange={(o) => !o && setAuth(null)} defaultTab={auth ?? 'signup'} />
    </div>
  );
};

export default Pozvanka;

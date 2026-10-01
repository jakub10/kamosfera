import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { isNightNow, safetyStatus, type SafetyStatus } from '@/lib/childSafety';
import { Onboarding } from './Onboarding';
import { NightScreen } from './NightScreen';

interface SafetyCtx {
  status: SafetyStatus | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SafetyCtx>({ status: null, refresh: async () => {} });

// eslint-disable-next-line react-refresh/only-export-components
export const useSafety = () => useContext(Ctx);

/** Stránky pre dospelých bez účtu — tie brána nechá tak. */
const PUBLIC_PREFIXES = ['/suhlas/', '/dovernik/'];

/**
 * Brána pred celou appkou. Prihlásené dieťa ide ďalej, len keď:
 *  1. dospelý dal súhlas a správca ho pustil dnu (inak sprievodca),
 *  2. nie je noc 22:00–6:30 (inak spiaca obrazovka).
 *
 * Databáza to isté stráži aj sama — brána je tu preto, aby dieťa videlo
 * zrozumiteľnú obrazovku, a nie prázdnu appku.
 */
export function SafetyGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [status, setStatus] = useState<SafetyStatus | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [night, setNight] = useState(isNightNow);

  const refresh = useCallback(async () => {
    try {
      setStatus(await safetyStatus());
      setFailed(null);
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setStatus(null);
    if (user) void refresh();
  }, [user, refresh]);

  useEffect(() => {
    const t = window.setInterval(() => setNight(isNightNow()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const isPublic = PUBLIC_PREFIXES.some((p) => location.pathname.startsWith(p));
  if (isPublic || (!loading && !user)) return <>{children}</>;

  if (loading || (!status && !failed)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="font-semibold">Nepodarilo sa načítať Kamosféru.</p>
        <p className="text-sm text-muted-foreground">{failed}</p>
        <button type="button" onClick={() => void refresh()} className="rounded-full bg-primary px-5 py-2 font-bold text-primary-foreground">
          Skúsiť znova
        </button>
      </div>
    );
  }

  if (!status.member || !status.onboarded) {
    return (
      <Ctx.Provider value={{ status, refresh }}>
        <Onboarding status={status} refresh={refresh} />
      </Ctx.Provider>
    );
  }

  // Správca môže v noci schvaľovať nových — inak spí celá Kamosféra.
  const adminAtNight = status.is_admin && location.pathname.startsWith('/admin');
  if ((night || status.night) && !adminAtNight) return <NightScreen />;

  return <Ctx.Provider value={{ status, refresh }}>{children}</Ctx.Provider>;
}

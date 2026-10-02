import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { guardianAccept, guardianInviteInfo, guardianLeave, guardianView, type GuardianView } from '@/lib/childSafety';

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-gradient-to-b from-amber-50 to-rose-50 px-4 py-8 dark:from-slate-950 dark:to-slate-900">
    <div className="mx-auto max-w-lg rounded-3xl bg-card p-6 shadow-xl sm:p-8">
      <p className="font-black text-amber-700 dark:text-amber-300">Kamosféra · dôverník 💛</p>
      {children}
    </div>
  </div>
);

const SIGNAL_TEXT: Record<GuardianView['signals'][number]['kind'], (name: string) => string> = {
  uncomfortable: (n) => `${n} stlačil(a) „Toto mi nie je príjemné".`,
  ai_harmful: (n) => `${n} mal(a) dostať správu, ktorá by mohla ublížiť. Strážca ju nedoručil.`,
  ai_secret: (n) => `Niekto sa snažil ${n} presvedčiť, aby niečo tajil(a) pred dospelými, prešiel/prešla do inej aplikácie, poslal(a) fotku alebo sa stretol(a).`,
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(iso));

/** Pozvánka od dieťaťa: dospelý potvrdí, že bude dôverník. */
export const DovernikPozvanka = () => {
  const { invite = '' } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ username: string } | null | undefined>(undefined);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    guardianInviteInfo(invite)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [invite]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await guardianAccept(invite, label);
      navigate(`/dovernik/${r.guardian_token}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Shell>
      {info === undefined ? (
        <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" />
      ) : info === null ? (
        <p className="mt-6">Tento odkaz nie je platný alebo už bol použitý. Požiadajte dieťa o nový QR kód.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <h1 className="text-2xl font-black">
            <span className="text-amber-700 dark:text-amber-300">{info.username}</span> si vás vybral(a) za dôverníka
          </h1>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Dieťa vám verí. Čo to znamená:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Neuvidíte jeho správy, kamarátov ani profil. Je to tak schválne.</li>
              <li>
                Keď v Kamosfére stlačí „Toto mi nie je príjemné", uvidíte tu signál s časom. Vtedy sa ho, prosím, v
                pokoji opýtajte, čo sa stalo.
              </li>
              <li>Ak ste doteraz mali dôverníka iného, týmto ho nahradíte.</li>
            </ul>
          </div>
          <label className="block text-sm font-semibold">
            Ako vás dieťa volá (nepovinné)
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 40))}
              placeholder="napr. babka, tréner Juro"
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2 font-normal"
            />
          </label>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => void accept()}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 py-3 text-lg font-black text-white shadow"
          >
            {busy && <Loader2 className="h-5 w-5 animate-spin" />} Budem dôverník
          </button>
        </div>
      )}
    </Shell>
  );
};

/** Stránka dôverníka: len signály, žiadne mená ani obsah. */
const Dovernik = () => {
  const { token = '' } = useParams();
  const [view, setView] = useState<GuardianView | null | undefined>(undefined);
  const [left, setLeft] = useState(false);

  useEffect(() => {
    const load = () =>
      guardianView(token)
        .then(setView)
        .catch(() => setView(null));
    void load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [token]);

  const leave = async () => {
    if (!window.confirm('Naozaj už nechcete byť dôverník? Dieťa si bude musieť vybrať nového.')) return;
    await guardianLeave(token);
    setLeft(true);
  };

  return (
    <Shell>
      {left ? (
        <p className="mt-6">Už nie ste dôverník. Ďakujeme za vašu pomoc.</p>
      ) : view === undefined ? (
        <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" />
      ) : view === null ? (
        <p className="mt-6">Tento odkaz už neplatí. Možno si dieťa vybralo iného dôverníka.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <h1 className="text-2xl font-black">
            Ste dôverník: <span className="text-amber-700 dark:text-amber-300">{view.username}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Uložte si túto stránku medzi záložky. Obnovuje sa sama. Nikomu ju neposielajte — kto má odkaz, vidí signály.
          </p>
          {view.signals.length === 0 ? (
            <p className="rounded-2xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              Zatiaľ žiadny signál. 🌤️ To je dobrá správa.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="font-bold">Signály</p>
              <ul className="space-y-2">
                {view.signals.map((s) => (
                  <li key={s.at} className="rounded-2xl border-l-4 border-rose-400 bg-rose-50 p-3 text-sm dark:bg-rose-950">
                    <b>{fmt(s.at)}</b> — {SIGNAL_TEXT[s.kind](view.username)}
                  </li>
                ))}
              </ul>
              <div className="rounded-2xl bg-muted/60 p-3 text-sm text-muted-foreground">
                <b>Čo teraz?</b> V pokoji sa dieťaťa opýtajte, ako sa má a či sa niečo nestalo. Nekárajte ho — dobre
                urobilo, že to dalo vedieť. Keď stlačilo tlačidlo, toho druhého už v Kamosfére zablokovalo.
              </div>
            </div>
          )}
          <button type="button" onClick={() => void leave()} className="text-xs text-muted-foreground underline">
            Už nechcem byť dôverník
          </button>
        </div>
      )}
    </Shell>
  );
};

export default Dovernik;

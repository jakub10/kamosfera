import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { guardianAccept, guardianInviteInfo, guardianLeave, guardianView, type GuardianView } from '@/lib/childSafety';

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-gradient-to-b from-amber-50 to-rose-50 px-4 py-8 dark:from-slate-950 dark:to-slate-900">
    <div className="mx-auto max-w-lg rounded-3xl bg-card p-6 shadow-xl sm:p-8">
      <p className="font-black text-amber-700 dark:text-amber-300">Kamosféra · důvěrník 💛</p>
      {children}
    </div>
  </div>
);

const SIGNAL_TEXT: Record<GuardianView['signals'][number]['kind'], (name: string) => string> = {
  uncomfortable: (n) => `${n} zmáčkl(a) „Tohle mi není příjemné".`,
  ai_harmful: (n) => `${n} měl(a) dostat zprávu, která by mohla ublížit. Strážce ji nedoručil.`,
  ai_secret: (n) => `Někdo se snažil ${n} přemluvit, aby něco tajil(a) před dospělými, přešel/přešla do jiné aplikace, poslal(a) fotku nebo se sešel/sešla.`,
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(iso));

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
        <p className="mt-6">Tento odkaz není platný nebo už byl použit. Požádejte dítě o nový QR kód.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <h1 className="text-2xl font-black">
            <span className="text-amber-700 dark:text-amber-300">{info.username}</span> si vás vybral(a) za důvěrníka
          </h1>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Dítě vám věří. Co to znamená:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Neuvidíte jeho zprávy, kamarády ani profil. Je to tak schválně.</li>
              <li>
                Když v Kamosféře zmáčkne „Tohle mi není příjemné", uvidíte tu signál s časem. Pak se ho, prosím, v
                klidu zeptejte, co se stalo.
              </li>
              <li>Pokud mělo dítě dosud jiného důvěrníka, tímto ho nahradíte.</li>
            </ul>
          </div>
          <label className="block text-sm font-semibold">
            Jak vám dítě říká (nepovinné)
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 40))}
              placeholder="např. babička, trenér Jura"
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
            {busy && <Loader2 className="h-5 w-5 animate-spin" />} Budu důvěrník
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
    if (!window.confirm('Opravdu už nechcete být důvěrník? Dítě si bude muset vybrat nového.')) return;
    await guardianLeave(token);
    setLeft(true);
  };

  return (
    <Shell>
      {left ? (
        <p className="mt-6">Už nejste důvěrník. Děkujeme za vaši pomoc.</p>
      ) : view === undefined ? (
        <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" />
      ) : view === null ? (
        <p className="mt-6">Tento odkaz už neplatí. Možná si dítě vybralo jiného důvěrníka.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <h1 className="text-2xl font-black">
            Jste důvěrník: <span className="text-amber-700 dark:text-amber-300">{view.username}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Uložte si tuto stránku do záložek. Obnovuje se sama. Nikomu ji neposílejte — kdo má odkaz, vidí signály.
          </p>
          {view.signals.length === 0 ? (
            <p className="rounded-2xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              Zatím žádný signál. 🌤️ To je dobrá zpráva.
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
                <b>Co teď?</b> V klidu se dítěte zeptejte, jak se má a jestli se něco nestalo. Nekárejte ho — udělalo
                dobře, že se ozvalo. Když zmáčklo tlačítko, toho druhého už v Kamosféře zablokovalo.
              </div>
            </div>
          )}
          <button type="button" onClick={() => void leave()} className="text-xs text-muted-foreground underline">
            Už nechci být důvěrník
          </button>
        </div>
      )}
    </Shell>
  );
};

export default Dovernik;

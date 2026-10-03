import { useEffect, useState } from 'react';
import { Check, Loader2, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { appUrl, NIGHT_TEXT, onboardingDone, type SafetyStatus } from '@/lib/childSafety';
import mascotLock from '@/assets/mascot-lock.png';
import mascotWave from '@/assets/mascot-wave.png';
import { QrCode } from './QrCode';
import { CopyLink } from './CopyLink';
import { GuardianInvite } from './GuardianInvite';
import { cn } from '@/lib/utils';

type Step = 'intro' | 'consent' | 'guardian' | 'approval';

/** Co je v Kamosféře nového — pre všetkých, aj pre rodičov a starých rodičov. */
const NEWS: [string, string, string][] = [
  ['🤝', 'Kamarádi naživo', 'Kamaráda si přidáš, když jste spolu: ukážeš mu svůj kód nebo QR (sekce Kamarádi).'],
  ['🔗', 'Kamarád daleko?', 'Pošli mu pozvánku (Kamarádi → Na dálku). Platí týden a jen jednou.'],
  ['🔍', 'Nikdo tě nenajde', 'Hledání zmizelo. Profil vidí jen tvoji kamarádi.'],
  ['🙋', '„Tohle mi není příjemné"', 'Když ti někdo ubližuje, jedno ťuknutí ho zablokuje a tvůj důvěrník se to dozví. Ten druhý nic neví.'],
  ['💛', 'Důvěrník', 'Dospělý, kterému věříš. Nevidí tvoje zprávy — jen signál, když potřebuješ pomoc. Vybereš si ho v Nastavení.'],
  ['🌙', 'V noci Kamosféra spí', `Každý večer ${NIGHT_TEXT}. Ráno tu bude všechno, co ti kamarádi napíšou.`],
];

/** Ako sa nový človek dostane dnu. */
const JOIN: [string, string, string][] = [
  ['1️⃣', 'Souhlas rodiče', 'Rodič nebo jiný dospělý, který se o tebe stará, naskenuje QR a potvrdí souhlas.'],
  ['2️⃣', 'Důvěrník', 'Vybereš si dospělého, kterému věříš. Můžeš to udělat i později.'],
  ['3️⃣', 'Správce tě pustí dovnitř', 'Kamosféra je parta kamarádů. Správce zná rodiny a pustí tě, když tě někdo zná.'],
];

/**
 * Sprievodca.
 *  * Súčasní členovia (deti aj rodičia) uvidia raz, čo je nové — nič viac.
 *  * Noví prejdú súhlasom rodiča, dôverníkom a čakajú na správcu.
 */
export function Onboarding({ status, refresh }: { status: SafetyStatus; refresh: () => Promise<void> }) {
  const { signOut } = useAuth();
  const [step, setStep] = useState<Step>('intro');
  const [skipGuardian, setSkipGuardian] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !status.member;

  const finish = () => {
    if (finishing) return;
    setFinishing(true);
    onboardingDone()
      .then(refresh)
      .catch((e: Error) => {
        setError(e.message);
        setFinishing(false);
      });
  };

  // Kým sa čaká na dospelého alebo správcu, stav sa obnovuje sám.
  useEffect(() => {
    if (step === 'intro') return;
    const t = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(t);
  }, [step, refresh]);

  // Noví: ďalší krok podľa toho, čo už je hotové.
  useEffect(() => {
    if (step === 'intro') return;
    if (!status.consent) setStep('consent');
    else if (!status.guardian && !skipGuardian) setStep('guardian');
    else if (!status.approved) setStep('approval');
    else finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, status, skipGuardian]);

  const steps: { id: Step; label: string; done: boolean }[] = [
    { id: 'consent', label: 'Souhlas rodiče', done: status.consent },
    { id: 'guardian', label: 'Důvěrník', done: !!status.guardian || skipGuardian },
    { id: 'approval', label: 'Vstup', done: status.approved },
  ];

  const List = ({ items }: { items: [string, string, string][] }) => (
    <ul className="space-y-2">
      {items.map(([icon, title, text]) => (
        <li key={title} className="flex gap-3 rounded-2xl bg-muted/60 p-3">
          <span className="text-2xl">{icon}</span>
          <span>
            <b>{title}</b>
            <br />
            <span className="text-sm text-muted-foreground">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-sky-50 px-4 py-6 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-black text-violet-700 dark:text-violet-300">Kamosféra</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Odhlásit
          </button>
        </div>

        {isNew && step !== 'intro' && (
          <ol className="mb-4 flex gap-2">
            {steps.map((s, i) => (
              <li
                key={s.id}
                className={cn(
                  'flex flex-1 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold',
                  s.done ? 'bg-emerald-500 text-white' : step === s.id ? 'bg-violet-600 text-white' : 'bg-white/70 text-muted-foreground dark:bg-white/10'
                )}
              >
                {s.done ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}.</span>} {s.label}
              </li>
            ))}
          </ol>
        )}

        <div className="rounded-3xl bg-card p-5 shadow-xl sm:p-7">
          {step === 'intro' && !isNew && (
            <div className="space-y-4">
              <div className="text-center">
                <img src={mascotLock} alt="" className="mx-auto h-24 w-24 object-contain" />
                <h1 className="mt-2 text-2xl font-black">Co je v Kamosféře nového</h1>
                <p className="text-muted-foreground">Kamosféra je ještě bezpečnější. Přečti si to — je to krátké.</p>
              </div>
              <List items={NEWS} />
              <button
                type="button"
                onClick={finish}
                disabled={finishing}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 py-3 text-lg font-black text-white shadow hover:bg-violet-700"
              >
                {finishing && <Loader2 className="h-5 w-5 animate-spin" />} Rozumím, jdeme dál!
              </button>
            </div>
          )}

          {step === 'intro' && isNew && (
            <div className="space-y-4">
              <div className="text-center">
                <img src={mascotWave} alt="" className="mx-auto h-24 w-24 object-contain" />
                <h1 className="mt-2 text-2xl font-black">Vítej! Takhle se dostaneš dovnitř</h1>
                <p className="text-muted-foreground">Kamosféra je parta kamarádů, kam se nedostane cizí člověk. Proto 3 kroky:</p>
              </div>
              <List items={JOIN} />
              <details className="rounded-2xl border p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Jaká tu platí pravidla</summary>
                <div className="mt-3">
                  <List items={NEWS} />
                </div>
              </details>
              <button
                type="button"
                onClick={() => setStep('consent')}
                className="w-full rounded-full bg-violet-600 py-3 text-lg font-black text-white shadow hover:bg-violet-700"
              >
                Jdeme na to!
              </button>
            </div>
          )}

          {step === 'consent' && status.consent_token && (
            <div className="flex flex-col items-center gap-3 text-center">
              <h2 className="text-xl font-black">Ukaž tenhle QR rodiči 👨‍👩‍👧</h2>
              <p className="text-sm text-muted-foreground">
                Rodič (nebo jiný dospělý, který se o tebe stará) ho naskenuje fotoaparátem v mobilu a ťukne na
                „Souhlasím". Nepotřebuje žádnou aplikaci ani účet.
              </p>
              <QrCode value={appUrl(`/suhlas/${status.consent_token}`)} />
              <p className="text-xs text-muted-foreground">Není rodič u tebe? Pošli mu odkaz:</p>
              <CopyLink link={appUrl(`/suhlas/${status.consent_token}`)} />
              <p className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Čekám na souhlas…
              </p>
            </div>
          )}

          {step === 'guardian' && (
            <div className="flex flex-col items-center gap-3 text-center">
              <h2 className="text-xl font-black">Vyber si důvěrníka 💛</h2>
              <p className="text-sm text-muted-foreground">
                Důvěrník je dospělý, kterému věříš — rodič, prarodič, trenér… Nikdy neuvidí tvoje zprávy ani
                kamarády. Dozví se jen to, když zmáčkneš „Tohle mi není příjemné", aby ti mohl pomoct.
              </p>
              <GuardianInvite existing={status.guardian_invite} />
              <p className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Čekám na důvěrníka…
              </p>
              <button type="button" onClick={() => setSkipGuardian(true)} className="text-xs text-muted-foreground underline">
                Teď ne, vyberu si později v Nastavení
              </button>
            </div>
          )}

          {step === 'approval' && (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-5xl">🚪</span>
              <h2 className="text-xl font-black">Už jen poslední krok</h2>
              <p className="text-sm text-muted-foreground">
                Souhlas máme, děkujeme! Teď tě správce Kamosféry pustí dovnitř. Až se to stane, Kamosféra se ti otevře
                sama. Pomůže, když tě do Kamosféry pozval kamarád, kterého správce zná.
              </p>
              <p className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Čekám na správce…
              </p>
            </div>
          )}

          {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}

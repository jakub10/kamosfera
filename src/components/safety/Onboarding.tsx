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

/** Čo je v Kamosfére nové — pre všetkých, aj pre rodičov a starých rodičov. */
const NEWS: [string, string, string][] = [
  ['🤝', 'Kamaráti naživo', 'Kamaráta si pridáš, keď ste spolu: ukážeš mu svoj kód alebo QR (časť Kamaráti).'],
  ['🔗', 'Kamarát ďaleko?', 'Pošli mu pozývací odkaz (Kamaráti → Na diaľku). Platí týždeň a len raz.'],
  ['🔍', 'Nikto ťa nenájde', 'Hľadanie zmizlo. Profil vidia len tvoji kamaráti.'],
  ['🙋', '„Toto mi nie je príjemné"', 'Keď ti niekto ubližuje, jedno ťuknutie ho zablokuje a tvoj dôverník sa to dozvie. Ten druhý nič nevie.'],
  ['💛', 'Dôverník', 'Dospelý, ktorému veríš. Nevidí tvoje správy — len signál, keď potrebuješ pomoc. Vyberieš si ho v Nastaveniach.'],
  ['🌙', 'V noci Kamosféra spí', `Každý večer ${NIGHT_TEXT}. Ráno je tu všetko, čo ti kamaráti napíšu.`],
];

/** Ako sa nový človek dostane dnu. */
const JOIN: [string, string, string][] = [
  ['1️⃣', 'Súhlas rodiča', 'Rodič alebo iný dospelý, ktorý sa o teba stará, naskenuje QR a potvrdí súhlas.'],
  ['2️⃣', 'Dôverník', 'Vyberieš si dospelého, ktorému veríš. Môžeš to urobiť aj neskôr.'],
  ['3️⃣', 'Správca ťa pustí dnu', 'Kamosféra je partia kamarátov. Správca pozná rodiny a pustí ťa, keď ťa niekto pozná.'],
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
    { id: 'consent', label: 'Súhlas rodiča', done: status.consent },
    { id: 'guardian', label: 'Dôverník', done: !!status.guardian || skipGuardian },
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
            <LogOut className="h-4 w-4" /> Odhlásiť
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
                <h1 className="mt-2 text-2xl font-black">Čo je v Kamosfére nové</h1>
                <p className="text-muted-foreground">Kamosféra je ešte bezpečnejšia. Prečítaj si to — je to krátke.</p>
              </div>
              <List items={NEWS} />
              <button
                type="button"
                onClick={finish}
                disabled={finishing}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 py-3 text-lg font-black text-white shadow hover:bg-violet-700"
              >
                {finishing && <Loader2 className="h-5 w-5 animate-spin" />} Rozumiem, ideme ďalej!
              </button>
            </div>
          )}

          {step === 'intro' && isNew && (
            <div className="space-y-4">
              <div className="text-center">
                <img src={mascotWave} alt="" className="mx-auto h-24 w-24 object-contain" />
                <h1 className="mt-2 text-2xl font-black">Vitaj! Takto sa dostaneš dnu</h1>
                <p className="text-muted-foreground">Kamosféra je partia kamarátov, kam sa nedostane cudzí človek. Preto 3 kroky:</p>
              </div>
              <List items={JOIN} />
              <details className="rounded-2xl border p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Aké pravidlá tu platia</summary>
                <div className="mt-3">
                  <List items={NEWS} />
                </div>
              </details>
              <button
                type="button"
                onClick={() => setStep('consent')}
                className="w-full rounded-full bg-violet-600 py-3 text-lg font-black text-white shadow hover:bg-violet-700"
              >
                Poďme na to!
              </button>
            </div>
          )}

          {step === 'consent' && status.consent_token && (
            <div className="flex flex-col items-center gap-3 text-center">
              <h2 className="text-xl font-black">Ukáž tento QR rodičovi 👨‍👩‍👧</h2>
              <p className="text-sm text-muted-foreground">
                Rodič (alebo iný dospelý, ktorý sa o teba stará) ho naskenuje fotoaparátom v mobile a ťukne na
                „Súhlasím". Nepotrebuje žiadnu aplikáciu ani účet.
              </p>
              <QrCode value={appUrl(`/suhlas/${status.consent_token}`)} />
              <p className="text-xs text-muted-foreground">Nie je rodič pri tebe? Pošli mu odkaz:</p>
              <CopyLink link={appUrl(`/suhlas/${status.consent_token}`)} />
              <p className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Čakám na súhlas…
              </p>
            </div>
          )}

          {step === 'guardian' && (
            <div className="flex flex-col items-center gap-3 text-center">
              <h2 className="text-xl font-black">Vyber si dôverníka 💛</h2>
              <p className="text-sm text-muted-foreground">
                Dôverník je dospelý, ktorému veríš — rodič, starý rodič, tréner… Nikdy neuvidí tvoje správy ani
                kamarátov. Dozvie sa len to, keď stlačíš „Toto mi nie je príjemné", aby ti mohol pomôcť.
              </p>
              <GuardianInvite existing={status.guardian_invite} />
              <p className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Čakám na dôverníka…
              </p>
              <button type="button" onClick={() => setSkipGuardian(true)} className="text-xs text-muted-foreground underline">
                Teraz nie, vyberiem si neskôr v Nastaveniach
              </button>
            </div>
          )}

          {step === 'approval' && (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-5xl">🚪</span>
              <h2 className="text-xl font-black">Už len posledný krok</h2>
              <p className="text-sm text-muted-foreground">
                Súhlas máme, ďakujeme! Teraz ťa správca Kamosféry pustí dnu. Keď sa to stane, Kamosféra sa ti otvorí
                sama. Pomôže, keď ťa do Kamosféry pozval kamarát, ktorého správca pozná.
              </p>
              <p className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Čakám na správcu…
              </p>
            </div>
          )}

          {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}

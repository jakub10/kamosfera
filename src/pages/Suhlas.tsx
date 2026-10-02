import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { appUrl, consentConfirm, consentInfo } from '@/lib/childSafety';
import { CopyLink } from '@/components/safety/CopyLink';

/**
 * Súhlas rodiča. Dospelý naskenuje QR z mobilu dieťaťa a ťukne „Súhlasím".
 * Bez účtu a bez aplikácie. Kamosféra neoveruje, že je to naozaj rodič —
 * zaznamená, že dospelý súhlas potvrdil (rozumná snaha podľa GDPR).
 */
const Suhlas = () => {
  const { token = '' } = useParams();
  const [info, setInfo] = useState<{ username: string; done: boolean } | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [guardian, setGuardian] = useState(true);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ guardian_token: string | null } | null>(null);

  useEffect(() => {
    consentInfo(token)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await consentConfirm(token, name, guardian));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-sky-50 px-4 py-8 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-lg rounded-3xl bg-card p-6 shadow-xl sm:p-8">
        <p className="font-black text-violet-700 dark:text-violet-300">Kamosféra · súhlas rodiča</p>

        {info === undefined ? (
          <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" />
        ) : info === null ? (
          <p className="mt-6">Tento odkaz nie je platný. Požiadajte dieťa, aby vám ukázalo QR kód znova.</p>
        ) : result ? (
          <div className="mt-6 space-y-4">
            <p className="flex items-center gap-2 text-xl font-black text-emerald-600">
              <Check className="h-6 w-6" /> Ďakujeme, súhlas je zaznamenaný.
            </p>
            {result.guardian_token ? (
              <>
                <p>
                  Ste dôverník dieťaťa <b>{info.username}</b>. Keď v Kamosfére stlačí „Toto mi nie je príjemné", uvidíte to
                  na tejto stránke:
                </p>
                <Link to={`/dovernik/${result.guardian_token}`} className="block rounded-2xl bg-violet-600 px-4 py-3 text-center font-bold text-white">
                  Otvoriť stránku dôverníka
                </Link>
                <p className="text-sm text-muted-foreground">
                  Uložte si ju medzi záložky alebo na plochu mobilu. Kto má tento odkaz, vidí signály — nikomu ho
                  neposielajte.
                </p>
                <CopyLink link={appUrl(`/dovernik/${result.guardian_token}`)} label="Kopírovať môj odkaz" />
              </>
            ) : (
              <p className="text-muted-foreground">Dieťa si môže dôverníka vybrať neskôr v nastaveniach.</p>
            )}
          </div>
        ) : info.done ? (
          <p className="mt-6">Súhlas pre <b>{info.username}</b> už bol daný. Ďakujeme!</p>
        ) : (
          <div className="mt-4 space-y-4">
            <h1 className="text-2xl font-black">
              Môže <span className="text-violet-700 dark:text-violet-300">{info.username}</span> používať Kamosféru?
            </h1>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Kamosféra je malá sociálna sieť pre deti okolo 11 rokov. Vznikla ako rodinný projekt a je postavená tak,
                aby sa k deťom nedostal cudzí človek:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>kamarátov si deti pridávajú len naživo, keď sú spolu; nikoho sa nedá vyhľadať,</li>
                <li>každý nový člen musí mať súhlas dospelého a schválenie správcu,</li>
                <li>v noci (22:00 – 6:30) Kamosféra spí,</li>
                <li>dieťa môže jedným ťuknutím zablokovať toho, kto mu ubližuje, a jeho dôverník dostane signál.</li>
              </ul>
              <p>
                <b>Aké údaje ukladáme:</b> prezývku, e-mail na prihlásenie, príspevky, správy a fotky, ktoré dieťa samo
                pridá. Nepýtame sa na polohu ani školu. Údaje nepredávame a neposielame reklamným firmám. Keď dieťa
                píše s AI kamarátom v hrách, text rozhovoru spracuje služba umelej inteligencie. Ochranu správ môže v
                budúcnosti doplniť automatická kontrola textu (AI v cloude) — posiela sa len text, bez mien.
              </p>
            </div>

            <label className="block text-sm font-semibold">
              Vaše meno alebo vzťah k dieťaťu (nepovinné)
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 40))}
                placeholder="napr. mama, otec, babka Eva"
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 font-normal"
              />
            </label>

            <label className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3 text-sm">
              <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} className="mt-1 h-4 w-4" />
              <span>
                <b>Chcem byť aj dôverníkom.</b> Neuvidím správy, kamarátov ani profily dieťaťa — len signál, keď stlačí
                „Toto mi nie je príjemné", aby som mu mohol/mohla pomôcť.
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1 h-4 w-4" />
              <span>Som dospelý/á, starám sa o toto dieťa a súhlasím, aby používalo Kamosféru.</span>
            </label>

            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

            <button
              type="button"
              onClick={() => void confirm()}
              disabled={!adult || busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 py-3 text-lg font-black text-white shadow disabled:opacity-50"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" />} Súhlasím
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Suhlas;

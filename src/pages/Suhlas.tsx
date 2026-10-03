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
        <p className="font-black text-violet-700 dark:text-violet-300">Kamosféra · souhlas rodiče</p>

        {info === undefined ? (
          <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" />
        ) : info === null ? (
          <p className="mt-6">Tento odkaz není platný. Požádejte dítě, aby vám QR kód ukázalo znovu.</p>
        ) : result ? (
          <div className="mt-6 space-y-4">
            <p className="flex items-center gap-2 text-xl font-black text-emerald-600">
              <Check className="h-6 w-6" /> Děkujeme, souhlas je zaznamenaný.
            </p>
            {result.guardian_token ? (
              <>
                <p>
                  Jste důvěrník dítěte <b>{info.username}</b>. Když v Kamosféře zmáčkne „Tohle mi není příjemné", uvidíte to
                  na této stránce:
                </p>
                <Link to={`/dovernik/${result.guardian_token}`} className="block rounded-2xl bg-violet-600 px-4 py-3 text-center font-bold text-white">
                  Otevřít stránku důvěrníka
                </Link>
                <p className="text-sm text-muted-foreground">
                  Uložte si ji do záložek nebo na plochu mobilu. Kdo má tento odkaz, vidí signály — nikomu ho
                  neposílejte.
                </p>
                <CopyLink link={appUrl(`/dovernik/${result.guardian_token}`)} label="Kopírovat můj odkaz" />
              </>
            ) : (
              <p className="text-muted-foreground">Dítě si může důvěrníka vybrat později v nastavení.</p>
            )}
          </div>
        ) : info.done ? (
          <p className="mt-6">Souhlas pro <b>{info.username}</b> už byl dán. Děkujeme!</p>
        ) : (
          <div className="mt-4 space-y-4">
            <h1 className="text-2xl font-black">
              Může <span className="text-violet-700 dark:text-violet-300">{info.username}</span> používat Kamosféru?
            </h1>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Kamosféra je malá sociální síť pro děti kolem 11 let. Vznikla jako rodinný projekt a je postavená tak,
                aby se k dětem nedostal cizí člověk:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>kamarády si děti přidávají naživo, když jsou spolu, nebo jednorázovou pozvánkou; nikoho nejde vyhledat,</li>
                <li>každý nový člen musí mít souhlas dospělého a schválení správce,</li>
                <li>v noci (22:00 – 6:30) Kamosféra spí,</li>
                <li>dítě může jedním ťuknutím zablokovat toho, kdo mu ubližuje, a jeho důvěrník dostane signál.</li>
              </ul>
              <p>
                <b>Jaké údaje ukládáme:</b> přezdívku, e-mail pro přihlášení, příspěvky, zprávy a fotky, které dítě samo
                přidá. Neptáme se na polohu ani školu. Údaje neprodáváme a neposíláme reklamním firmám. Když dítě
                píše s AI kamarádem ve hrách, text rozhovoru zpracuje služba umělé inteligence. Soukromé zprávy před
                odesláním kontroluje AI strážce (System One od Liquid AI v cloudu) — posílá se jen text, bez jmen.
              </p>
            </div>

            <label className="block text-sm font-semibold">
              Vaše jméno nebo vztah k dítěti (nepovinné)
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 40))}
                placeholder="např. máma, táta, babička Eva"
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 font-normal"
              />
            </label>

            <label className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3 text-sm">
              <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} className="mt-1 h-4 w-4" />
              <span>
                <b>Chci být i důvěrníkem.</b> Neuvidím zprávy, kamarády ani profily dítěte — jen signál, když zmáčkne
                „Tohle mi není příjemné", abych mu mohl/mohla pomoct.
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1 h-4 w-4" />
              <span>Jsem dospělý/á, starám se o toto dítě a souhlasím, aby používalo Kamosféru.</span>
            </label>

            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

            <button
              type="button"
              onClick={() => void confirm()}
              disabled={!adult || busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 py-3 text-lg font-black text-white shadow disabled:opacity-50"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" />} Souhlasím
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Suhlas;

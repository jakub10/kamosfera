import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { appUrl, guardianInviteNew } from '@/lib/childSafety';
import { QrCode } from './QrCode';
import { CopyLink } from './CopyLink';

/**
 * Pozvánka pre dôverníka: dieťa ukáže QR dospelému, ktorému verí
 * (nemusí to byť rodič). Dospelý ho naskenuje fotoaparátom a potvrdí.
 */
export function GuardianInvite({ existing }: { existing: string | null }) {
  const [invite, setInvite] = useState<string | null>(existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      setInvite(await guardianInviteNew());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!invite) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => void make()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 font-bold text-primary-foreground"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Ukázat QR pro důvěrníka
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  const link = appUrl(`/dovernik/pozvanka/${invite}`);
  return (
    <div className="flex flex-col items-center gap-3">
      <QrCode value={link} />
      <p className="max-w-xs text-center text-sm text-muted-foreground">
        Dospělý, kterému věříš, naskenuje QR fotoaparátem v mobilu a potvrdí, že bude tvůj důvěrník.
      </p>
      <CopyLink link={link} />
    </div>
  );
}

import { useState } from 'react';
import { HandHeart, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { askGuardianHelp, guardianName } from '@/lib/childSafety';
import { useSafety } from './SafetyGate';
import { GuardianInvite } from './GuardianInvite';

/** Nastavení: kdo je můj důvěrník, jak si vybrat jiného a jak ho poprosit o pomoc. */
export function GuardianCard() {
  const { status } = useSafety();
  const { toast } = useToast();
  const [change, setChange] = useState(false);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!status) return null;

  const name = guardianName(status.guardian?.label);
  const since = status.guardian
    ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium' }).format(new Date(status.guardian.since))
    : '';

  const sendHelp = async () => {
    setBusy(true);
    try {
      await askGuardianHelp();
      toast({ title: 'Důvěrník to ví 💛', description: 'Uvidí, že potřebuješ pomoct. Klidně mu to řekni i osobně.' });
    } catch (e) {
      toast({ title: 'Nepovedlo se', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
      setAsk(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HandHeart className="h-5 w-5" />
          Můj důvěrník
        </CardTitle>
        <CardDescription>
          Dospělý, kterému věříš. Nevidí tvoje zprávy ani kamarády — dozví se jen to, když potřebuješ pomoct.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.guardian ? (
          <>
            <p>
              {name ? (
                <>
                  Tvůj důvěrník: <b>{name}</b> 💛
                </>
              ) : (
                <>Důvěrníka máš 💛</>
              )}{' '}
              <span className="text-sm text-muted-foreground">(od {since})</span>
            </p>
            <button
              type="button"
              onClick={() => setAsk(true)}
              className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
            >
              🙋 Potřebuju pomoct
            </button>
          </>
        ) : (
          <p className="text-muted-foreground">Zatím nemáš důvěrníka.</p>
        )}
        {change || !status.guardian ? (
          <GuardianInvite existing={status.guardian_invite} />
        ) : (
          <div>
            <button type="button" onClick={() => setChange(true)} className="text-sm font-semibold text-primary underline">
              Vybrat jiného důvěrníka
            </button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={ask} onOpenChange={setAsk}>
        <AlertDialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Dát vědět důvěrníkovi?</AlertDialogTitle>
            <AlertDialogDescription>
              Důvěrník uvidí jen to, že potřebuješ pomoct — žádné zprávy ani jména. Pak se ti ozve.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zpět</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void sendHelp(); }}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ano, dát vědět
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

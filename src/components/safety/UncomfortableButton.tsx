import { useState } from 'react';
import { HandHeart, Loader2 } from 'lucide-react';
import { reportUncomfortable } from '@/lib/childSafety';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/**
 * „Toto mi nie je príjemné". Jedno ťuknutie: druhé dieťa sa potichu
 * zablokuje (nič sa nedozvie) a dôverník dostane signál. Bez otázok —
 * dieťa, ktorému je zle, sa nemá preklikávať cez potvrdenia.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useUncomfortable(onDone?: () => void) {
  const [result, setResult] = useState<{ name: string; guardian: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const report = async (userId: string, name: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await reportUncomfortable(userId);
      setResult({ name, guardian: r.guardian });
    } catch (e) {
      setError((e as Error).message);
      setResult({ name, guardian: false });
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <AlertDialog
      open={!!result}
      onOpenChange={(o) => {
        if (!o) {
          setResult(null);
          onDone?.();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{error ? 'Něco se pokazilo' : 'Dobře, že ses ozval(a) 💛'}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {error ? (
                <p>{error} Řekni to prosím rodiči nebo jinému dospělému.</p>
              ) : (
                <>
                  <p>
                    <b>{result?.name}</b> ti už nemůže psát a v Kamosféře se s ním neuvidíš. Nic se o tom nedozví.
                  </p>
                  <p>
                    {result?.guardian
                      ? 'Tvůj důvěrník dostal upozornění. Můžeš si s ním o tom v klidu promluvit.'
                      : 'Zatím nemáš důvěrníka. Řekni to prosím rodiči nebo jinému dospělému, kterému věříš.'}
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Rozumím</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { report, busy, dialog };
}

export function UncomfortableButton({
  userId,
  name,
  onDone,
  className,
}: {
  userId: string;
  name: string;
  onDone?: () => void;
  className?: string;
}) {
  const { report, busy, dialog } = useUncomfortable(onDone);
  return (
    <>
      <button
        type="button"
        onClick={() => void report(userId, name)}
        disabled={busy}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200',
          className
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HandHeart className="h-3.5 w-3.5" />}
        Tohle mi není příjemné
      </button>
      {dialog}
    </>
  );
}

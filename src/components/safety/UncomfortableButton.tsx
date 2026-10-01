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
          <AlertDialogTitle>{error ? 'Niečo sa pokazilo' : 'Dobre, že si to povedal(a) 💛'}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {error ? (
                <p>{error} Povedz to, prosím, rodičovi alebo inému dospelému.</p>
              ) : (
                <>
                  <p>
                    <b>{result?.name}</b> ti už nemôže písať a neuvidíš sa s ním v Kamosfére. Nič sa o tom nedozvie.
                  </p>
                  <p>
                    {result?.guardian
                      ? 'Tvoj dôverník dostal upozornenie. Môžeš sa s ním o tom pokojne porozprávať.'
                      : 'Zatiaľ nemáš dôverníka. Povedz to, prosím, rodičovi alebo inému dospelému, ktorému veríš.'}
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Rozumiem</AlertDialogAction>
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
        Toto mi nie je príjemné
      </button>
      {dialog}
    </>
  );
}

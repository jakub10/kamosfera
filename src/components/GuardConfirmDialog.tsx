import { useEffect, useState } from 'react';
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
import { GUARD_CONFIRM_EVENT, type GuardConfirmRequest } from '@/lib/guardConfirm';

/** Stejný dialog jako v soukromých zprávách — pro skupiny a první zprávu. */
export function GuardConfirmDialog() {
  const [req, setReq] = useState<GuardConfirmRequest | null>(null);

  useEffect(() => {
    window.__kamosGuardDialog = true;
    const on = (e: Event) => setReq((e as CustomEvent<GuardConfirmRequest>).detail);
    window.addEventListener(GUARD_CONFIRM_EVENT, on);
    return () => {
      window.__kamosGuardDialog = false;
      window.removeEventListener(GUARD_CONFIRM_EVENT, on);
    };
  }, []);

  const answer = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  return (
    <AlertDialog open={!!req} onOpenChange={(o) => !o && answer(false)}>
      {/* Enter nesmí potvrdit tlačítko, které dostalo fokus jako první. */}
      <AlertDialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Opravdu to chceš poslat? 🤔</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">{req?.text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => answer(false)}>Ne, upravím to</AlertDialogCancel>
          <AlertDialogAction onClick={() => answer(true)}>Ano, poslat</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

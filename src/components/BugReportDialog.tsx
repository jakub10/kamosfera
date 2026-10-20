import { useEffect, useState } from 'react';
import { Bug, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { OPEN_BUG_REPORT, reportBug } from '@/lib/bugReport';

/** Okno „Nahlásit chybu". Otevře se odkudkoli přes openBugReport(). */
export function BugReportDialog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_BUG_REPORT, show);
    return () => window.removeEventListener(OPEN_BUG_REPORT, show);
  }, []);

  const send = async () => {
    setBusy(true);
    try {
      await reportBug(text);
      toast({ title: 'Díky, hlášení odešlo! 🐞', description: 'Podíváme se na to a opravíme to.' });
      setText('');
      setOpen(false);
    } catch (e) {
      toast({ title: 'Hlášení neodešlo', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-rose-500" /> Nahlásit chybu
          </DialogTitle>
          <DialogDescription>
            Co nefunguje nebo vypadá divně? Napiš, co jsi dělal(a) a co se stalo. Technické detaily (stránku, prohlížeč)
            přidáme sami.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={2000}
          autoFocus
          placeholder="Např.: Kliknul jsem na Uložit u avatara a nic se nestalo."
        />
        <p className="text-xs text-muted-foreground">Nepiš sem hesla ani adresy. Hlášení uvidí jen správci Kamosféry.</p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Zpět
          </Button>
          <Button onClick={() => void send()} disabled={busy || text.trim().length < 3}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Odeslat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

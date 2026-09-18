import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import mascotWave from '@/assets/mascot-wave.png';
import { MAX_INTRO_LENGTH, checkIntroMessage } from '@/lib/safety';

interface MessageRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientName: string;
  sending: boolean;
  onSend: (intro: string) => void;
}

/**
 * Prvá správa niekomu, kto ešte nie je kamarát.
 *
 * Nejde len o formulár — dieťa tu má vidieť, že cudziemu človeku sa píše inak
 * ako kamarátovi: jedna krátka správa, bez odkazov, a druhá strana rozhoduje,
 * či konverzácia vôbec začne.
 */
export function MessageRequestDialog({
  open,
  onOpenChange,
  recipientName,
  sending,
  onSend,
}: MessageRequestDialogProps) {
  const [intro, setIntro] = useState('');

  const trimmed = intro.trim();
  const remaining = MAX_INTRO_LENGTH - intro.length;
  const problem = checkIntroMessage(intro);
  const canSend = problem === null && !sending;

  const handleOpenChange = (next: boolean) => {
    if (!next) setIntro('');
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center -mt-2">
            <img src={mascotWave} alt="" className="w-20 h-20 object-contain" loading="lazy" />
          </div>
          <DialogTitle className="text-center">Napiš {recipientName}</DialogTitle>
          <DialogDescription className="text-center">
            Ještě nejste kamarádi, tak pošleš jednu krátkou zprávu. {recipientName} si
            pak vybere, jestli si chce psát dál.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            id="message-request-intro"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder="Ahoj! Jsem Kuba ze 4.B, hrajeme spolu fotbal…"
            maxLength={MAX_INTRO_LENGTH}
            rows={4}
            autoFocus
          />
          <div className="flex items-start justify-between gap-3 text-xs">
            <p className={problem === 'has_link' ? 'text-destructive' : 'text-muted-foreground'}>
              {problem === 'has_link'
                ? 'V první zprávě nemůžou být odkazy. Napiš to vlastními slovy.'
                : 'Odkazy v první zprávě nefungují — napiš to vlastními slovy.'}
            </p>
            <span
              className={
                remaining < 40 ? 'shrink-0 text-amber-600' : 'shrink-0 text-muted-foreground'
              }
            >
              {remaining}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={sending}>
            Zrušit
          </Button>
          <Button onClick={() => onSend(trimmed)} disabled={!canSend}>
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Odeslat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { HandHeart } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSafety } from './SafetyGate';
import { GuardianInvite } from './GuardianInvite';

/** Nastavenia: kto je môj dôverník a ako si vybrať iného. */
export function GuardianCard() {
  const { status } = useSafety();
  const [change, setChange] = useState(false);
  if (!status) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HandHeart className="h-5 w-5" />
          Môj dôverník
        </CardTitle>
        <CardDescription>
          Dospelý, ktorému veríš. Nevidí tvoje správy ani kamarátov — dozvie sa len to, keď stlačíš „Toto mi nie je
          príjemné".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.guardian ? (
          <p>
            Tvoj dôverník: <b>{status.guardian.label}</b> 💛
          </p>
        ) : (
          <p className="text-muted-foreground">Zatiaľ nemáš dôverníka.</p>
        )}
        {change || !status.guardian ? (
          <GuardianInvite existing={status.guardian_invite} />
        ) : (
          <button type="button" onClick={() => setChange(true)} className="text-sm font-semibold text-primary underline">
            Vybrať iného dôverníka
          </button>
        )}
      </CardContent>
    </Card>
  );
}

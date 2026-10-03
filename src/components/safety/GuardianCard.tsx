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
          Můj důvěrník
        </CardTitle>
        <CardDescription>
          Dospělý, kterému věříš. Nevidí tvoje zprávy ani kamarády — dozví se jen to, když zmáčkneš „Tohle mi není
          příjemné".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.guardian ? (
          <p>
            Tvůj důvěrník: <b>{status.guardian.label}</b> 💛
          </p>
        ) : (
          <p className="text-muted-foreground">Zatím nemáš důvěrníka.</p>
        )}
        {change || !status.guardian ? (
          <GuardianInvite existing={status.guardian_invite} />
        ) : (
          <button type="button" onClick={() => setChange(true)} className="text-sm font-semibold text-primary underline">
            Vybrat jiného důvěrníka
          </button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Strážca správ (serverová funkcia `message-guard`, System One od Liquid AI).
 * Správu pred odoslaním ukážeme strážcovi; databáza ju pri zapnutom strážcovi
 * bez jeho lístka aj tak nepustí.
 */
import { supabase } from '@/integrations/supabase/client';
import { askGuardConfirm } from './guardConfirm';

export type GuardVerdict = 'send' | 'confirm' | 'hide' | 'unchecked';
export type GuardReason = 'mean' | 'personal';

export interface GuardResult {
  verdict: GuardVerdict;
  reasons: GuardReason[];
}

/** Kam zpráva jde: soukromá konverzace, skupina, nebo první zpráva někomu. */
export type GuardScope = { conversation_id: string } | { group_id: string } | { target_user_id: string };

/** null = strážca nie je nahraný alebo neodpovedá; správa sa skúsi poslať aj tak. */
export async function checkMessage(scope: string | GuardScope, content: string): Promise<GuardResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('message-guard', {
      body: { ...(typeof scope === 'string' ? { conversation_id: scope } : scope), content },
    });
    if (error || !data?.verdict) return null;
    return data as GuardResult;
  } catch {
    return null;
  }
}

export const REASON_TEXT: Record<GuardReason, string> = {
  mean: 'Tahle zpráva by mohla kamaráda zamrzet. Zkus si ji přečíst ještě jednou jeho očima.',
  personal:
    'Vypadá to, že posíláš osobní údaje (adresu, telefon, školu nebo kde zrovna jsi). Posílej je jen tomu, komu opravdu věříš.',
};

export const HIDDEN_TEXT = 'Tahle zpráva by mohla někomu ublížit, tak jsme ji neodeslali. Zkus to napsat jinak.';

/**
 * Zeptá se strážce a vrátí, jestli se má zpráva odeslat. U „opravdu to chceš
 * poslat?" se zeptá dítěte; ubližující zprávu neodešle a řekne proč.
 */
export async function guardAllows(
  scope: GuardScope,
  content: string,
  tell: (text: string) => void
): Promise<boolean> {
  const guard = await checkMessage(scope, content);
  if (guard?.verdict === 'hide') {
    tell(HIDDEN_TEXT);
    return false;
  }
  if (guard?.verdict === 'confirm') {
    const why = guard.reasons.map((r) => REASON_TEXT[r]).join('\n\n');
    return askGuardConfirm(why);
  }
  return true;
}

/**
 * Strážca správ (serverová funkcia `message-guard`, System One od Liquid AI).
 * Správu pred odoslaním ukážeme strážcovi; databáza ju pri zapnutom strážcovi
 * bez jeho lístka aj tak nepustí.
 */
import { supabase } from '@/integrations/supabase/client';

export type GuardVerdict = 'send' | 'confirm' | 'hide' | 'unchecked';
export type GuardReason = 'mean' | 'personal';

export interface GuardResult {
  verdict: GuardVerdict;
  reasons: GuardReason[];
}

/** null = strážca nie je nahraný alebo neodpovedá; správa sa skúsi poslať aj tak. */
export async function checkMessage(conversationId: string, content: string): Promise<GuardResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('message-guard', {
      body: { conversation_id: conversationId, content },
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

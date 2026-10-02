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
  mean: 'Táto správa by mohla kamaráta zamrzieť. Skús si ju ešte raz prečítať jeho očami.',
  personal:
    'Vyzerá to, že posielaš osobné údaje (adresu, telefón, školu alebo kde práve si). Posielaj ich len tomu, komu naozaj veríš.',
};

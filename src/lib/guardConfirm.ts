/**
 * „Opravdu to chceš poslat?" od AI strážce jako dialog Kamosféry, ne jako
 * systémové okno prehliadača. Dialog (GuardConfirmDialog) je v App jen jednou;
 * kdokoli se zeptá přes askGuardConfirm a dostane odpověď.
 */
export const GUARD_CONFIRM_EVENT = 'kamosfera:guard-confirm';

export interface GuardConfirmRequest {
  text: string;
  resolve: (ok: boolean) => void;
}

export function askGuardConfirm(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Bez dialogu (např. v testech) rozhodne prohlížeč jako dřív.
    if (!window.__kamosGuardDialog) {
      resolve(window.confirm(`${text}\n\nOpravdu to chceš poslat?`));
      return;
    }
    window.dispatchEvent(new CustomEvent<GuardConfirmRequest>(GUARD_CONFIRM_EVENT, { detail: { text, resolve } }));
  });
}

declare global {
  interface Window {
    __kamosGuardDialog?: boolean;
  }
}

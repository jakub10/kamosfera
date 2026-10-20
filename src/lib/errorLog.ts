/**
 * Posledních pár chyb z prohlížeče — přiloží se k hlášení chyby, aby se dalo
 * zjistit, co se pokazilo, i když dítě napíše jen „nejde to".
 */
export interface LoggedError {
  at: string;
  kind: 'error' | 'promise' | 'console';
  message: string;
}

const MAX = 15;
const log: LoggedError[] = [];
let installed = false;

const text = (v: unknown): string => {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

export function pushError(kind: LoggedError['kind'], parts: unknown[]) {
  const message = parts.map(text).join(' ').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]').slice(0, 500);
  log.push({ at: new Date().toISOString(), kind, message });
  if (log.length > MAX) log.shift();
}

export const recentErrors = (): LoggedError[] => [...log];

export function installErrorLog() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => pushError('error', [e.message, e.filename ? `(${e.filename}:${e.lineno})` : '']));
  window.addEventListener('unhandledrejection', (e) => pushError('promise', [e.reason]));
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    pushError('console', args);
    orig(...args);
  };
}

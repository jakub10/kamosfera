/**
 * Hlášení chyb: dítě popíše, co se stalo, a aplikace přidá technické detaily.
 * Hlášení jde do databáze (bug_reports); tvůrce ho v Panelu tvůrce
 * zkontroluje a pošle na GitHub, kde ho uvidí ten, kdo Kamosféru opravuje.
 */
import { supabase } from '@/integrations/supabase/client';
import { recentErrors, type LoggedError } from './errorLog';

export const GITHUB_REPO = 'jakub10/kamosfera';
export const OPEN_BUG_REPORT = 'kamosfera:bug-report';

declare const __APP_VERSION__: string;

export interface BugContext {
  version: string;
  browser: string;
  screen: string;
  viewport: string;
  language: string;
  online: boolean;
  errors: LoggedError[];
}

/** /profile/3f2a… → /profile/:id — v adrese nemají být čísla lidí. */
export const cleanPath = (path: string) =>
  path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').replace(/\/[A-Za-z0-9_-]{24,}/g, '/:token');

export function collectContext(): BugContext {
  return {
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    browser: navigator.userAgent,
    screen: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    language: navigator.language,
    online: navigator.onLine,
    errors: recentErrors(),
  };
}

export const openBugReport = () => window.dispatchEvent(new Event(OPEN_BUG_REPORT));

export async function reportBug(message: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('report_bug', {
    _message: message,
    _page: cleanPath(window.location.pathname + window.location.search),
    _context: collectContext(),
  });
  if (error) throw new Error(error.message || 'Hlášení se nepodařilo odeslat.');
  return (data as { id: number }).id;
}

export interface BugReportRow {
  id: number;
  message: string;
  page: string | null;
  context: Partial<BugContext>;
  status: 'new' | 'sent' | 'done' | 'junk';
  created_at: string;
}

/** Odkaz na nový issue na GitHubu s předvyplněným textem — bez jména dítěte. */
export function githubIssueUrl(r: BugReportRow): string {
  const c = r.context ?? {};
  const firstLine = r.message.split('\n')[0].slice(0, 70);
  const errors = (c.errors ?? []).slice(-8).map((e) => `- ${e.at.slice(11, 19)} [${e.kind}] ${e.message}`).join('\n');
  const body = [
    '## Co se stalo',
    r.message,
    '',
    '## Kde',
    `- Stránka: \`${r.page ?? '?'}\``,
    `- Nahlášeno: ${new Date(r.created_at).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })} (hlášení #${r.id})`,
    `- Verze: ${c.version ?? '?'}`,
    `- Prohlížeč: ${c.browser ?? '?'}`,
    `- Obrazovka: ${c.screen ?? '?'}, okno ${c.viewport ?? '?'}, jazyk ${c.language ?? '?'}${c.online === false ? ', OFFLINE' : ''}`,
    '',
    '## Chyby v prohlížeči',
    errors || '_žádné_',
    '',
    '_Nahlášeno z aplikace (Panel tvůrce → Chyby)._',
  ].join('\n');
  const q = new URLSearchParams({ title: `[Chyba] ${firstLine}`, body: body.slice(0, 6000), labels: 'bug' });
  return `https://github.com/${GITHUB_REPO}/issues/new?${q.toString()}`;
}

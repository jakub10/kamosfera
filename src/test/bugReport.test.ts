import { describe, expect, it } from 'vitest';
import { cleanPath, githubIssueUrl, type BugReportRow } from '@/lib/bugReport';
import { pushError, recentErrors } from '@/lib/errorLog';

describe('hlášení chyb', () => {
  it('z adresy zmizí ID lidí i tokeny', () => {
    expect(cleanPath('/profile/3f2a9c1e-1111-4222-8333-444455556666')).toBe('/profile/:id');
    expect(cleanPath('/dovernik/' + 'a'.repeat(64))).toBe('/dovernik/:token');
    expect(cleanPath('/hliadka?kod=ABCDE')).toBe('/hliadka?kod=ABCDE');
  });

  it('GitHub issue má popis, stránku, verzi a chyby — ale ne jméno dítěte', () => {
    const r: BugReportRow & { reporter: string } = {
      id: 7,
      message: 'Avatar se neuloží\nkliknul jsem na Uložit',
      page: '/settings',
      status: 'new',
      created_at: '2026-10-20T10:00:00Z',
      reporter: 'jakub',
      context: { version: 'abc1234', browser: 'Chrome', errors: [{ at: '2026-10-20T09:59:58Z', kind: 'console', message: 'save failed' }] },
    };
    const url = new URL(githubIssueUrl(r));
    expect(url.pathname).toBe('/jakub10/kamosfera/issues/new');
    expect(url.searchParams.get('title')).toBe('[Chyba] Avatar se neuloží');
    const body = url.searchParams.get('body')!;
    expect(body).toContain('/settings');
    expect(body).toContain('abc1234');
    expect(body).toContain('save failed');
    expect(body).not.toContain('jakub');
  });

  it('přihlašovací token se do záznamu chyb nedostane', () => {
    pushError('console', ['chyba', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_def-123']);
    expect(recentErrors().at(-1)!.message).toBe('chyba [token]');
  });
});

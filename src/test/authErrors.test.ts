import { describe, it, expect, vi, beforeEach } from 'vitest';
import { explainAuthError } from '@/lib/authErrors';

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

describe('chyby přihlášení', () => {
  it('skutečnou chybu vždy vypíše do konzole', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    explainAuthError(new Error('Database error saving new user'), 'registrace');
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0])).toContain('registrace');
  });

  it.each([
    ['Database error saving new user', /databáze/i],
    ['Invalid API key', /klíč/i],
    ['User already registered', /už tu je/i],
    ['Password should be at least 6 characters', /heslo/i],
    ['Signups not allowed for this instance', /zavřená/i],
    ['Invalid login credentials', /nesprávn/i],
    ['Email not confirmed', /potvrzen/i],
    ['Failed to fetch', /připojit/i],
  ])('pozná %s', (message, expected) => {
    const friendly = explainAuthError(new Error(message), 'test');
    expect(`${friendly.title} ${friendly.description}`).toMatch(expected);
  });

  it('neznámou chybu ukáže i s tím, co řekl server', () => {
    const friendly = explainAuthError(new Error('něco úplně jiného'), 'test');
    expect(friendly.title).toBe('Nepovedlo se');
    expect(friendly.description).toContain('něco úplně jiného');
  });

  it('rozpoznanou chybu technickým textem nezatěžuje', () => {
    const friendly = explainAuthError(new Error('Invalid API key'), 'test');
    expect(friendly.description).not.toContain('Invalid API key');
  });
});

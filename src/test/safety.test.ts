import { describe, it, expect } from 'vitest';
import {
  MAX_INTRO_LENGTH,
  checkIntroMessage,
  containsLink,
  isValidUsername,
} from '@/lib/safety';

/**
 * Tyhle testy hlídají pravidla, na kterých stojí bezpečí dětí v Kamosféře.
 * Když některý spadne, znamená to, že se dá obejít ochrana — ne že je test
 * moc přísný. Stejná pravidla platí i v databázi (migrace
 * 20260918120000_conversation_requests_and_blocking.sql); změna na jedné
 * straně bez druhé je chyba.
 */

describe('první zpráva cizímu člověku', () => {
  it('projde, když je krátká a bez odkazu', () => {
    expect(checkIntroMessage('Ahoj! Jsem Kuba ze 4.B.')).toBeNull();
  });

  it('neprojde prázdná ani z mezer', () => {
    expect(checkIntroMessage('')).toBe('empty');
    expect(checkIntroMessage('   \n  ')).toBe('empty');
  });

  it('neprojde delší než povolený limit', () => {
    expect(checkIntroMessage('a'.repeat(MAX_INTRO_LENGTH))).toBeNull();
    expect(checkIntroMessage('a'.repeat(MAX_INTRO_LENGTH + 1))).toBe('too_long');
  });

  it.each([
    'mrkni na https://neco.example',
    'najdeš mě na www.stranka.cz',
    'pojď na discord.gg',
    'http://192.0.2.1/vyhra',
    'napiš mi na mojedomena.xyz',
  ])('nepustí odkaz: %s', (text) => {
    expect(checkIntroMessage(text)).toBe('has_link');
  });

  it('nepovažuje běžnou větu za odkaz', () => {
    expect(containsLink('Mám rád fotbal a hraju za 4.B')).toBe(false);
    expect(containsLink('Je to super. Ahoj!')).toBe(false);
  });
});

describe('přezdívka', () => {
  it('přijme jednoduchou přezdívku', () => {
    expect(isValidUsername('kamos_kuba')).toBe(true);
    expect(isValidUsername('Kamos.Kuba')).toBe(true); // velká písmena se srovnají
    expect(isValidUsername('hrac2')).toBe(true);
  });

  it('odmítne příliš krátkou nebo dlouhou', () => {
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(21))).toBe(false);
  });

  it('odmítne mezery, diakritiku a zavináč', () => {
    expect(isValidUsername('kamos kuba')).toBe(false);
    expect(isValidUsername('kubíček')).toBe(false);
    expect(isValidUsername('jan.novak@gmail.com')).toBe(false);
  });
});

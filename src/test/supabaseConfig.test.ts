import { describe, it, expect } from 'vitest';
import { cleanEnvValue, headerSafe, describeConfig } from '@/integrations/supabase/config';

/**
 * Klíč putuje v HTTP hlavičce, kam smí jen ISO-8859-1. Když se do něj při
 * kopírování sveze něco jiného, prohlížeč shodí úplně první požadavek
 * hláškou o hlavičkách, ze které se o klíči nedá poznat vůbec nic.
 * Přesně to se jednou stalo a stálo to večer.
 */

const KLIC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.abc-123_XYZ';
const URL_OK = 'https://abcdefgh.supabase.co';

describe('úklid hodnot z prostředí', () => {
  it('odstraní mezery a konce řádků', () => {
    expect(cleanEnvValue(`  ${KLIC}\n`)).toBe(KLIC);
  });

  it('odstraní neviditelné znaky, které se svezou s kopírováním', () => {
    // nulová šířka, BOM, měkký spojovník — vidět nejsou, klíč rozbijí
    expect(cleanEnvValue(`${KLIC}\u200B`)).toBe(KLIC);
    expect(cleanEnvValue(`\uFEFF${KLIC}`)).toBe(KLIC);
    expect(cleanEnvValue(`${KLIC}\u00AD`)).toBe(KLIC);
  });

  it('nezmění klíč, který je v pořádku', () => {
    expect(cleanEnvValue(KLIC)).toBe(KLIC);
  });

  it('z prázdna udělá prázdno, ne výjimku', () => {
    expect(cleanEnvValue(undefined)).toBe('');
  });
});

describe('co projde HTTP hlavičkou', () => {
  it('běžný klíč ano', () => {
    expect(headerSafe(KLIC)).toBe(true);
  });

  it('tři tečky z useknutého zobrazení ne', () => {
    expect(headerSafe(`eyJhbGci…UzI1NiJ9`)).toBe(false);
  });

  it('tečky, kterými dashboard klíč zakrývá, ne', () => {
    expect(headerSafe('••••••••••••')).toBe(false);
  });
});

describe('posudek nastavení', () => {
  it('správné hodnoty projdou', () => {
    expect(describeConfig(URL_OK, KLIC)).toEqual({ kind: 'ok' });
  });

  it('chybějící hodnoty pozná', () => {
    expect(describeConfig('', KLIC).kind).toBe('missing');
    expect(describeConfig(URL_OK, '').kind).toBe('missing');
  });

  it('pojmenuje znak, kvůli kterému by spadl první požadavek', () => {
    const r = describeConfig(URL_OK, `eyJhbGci…UzI1NiJ9`);
    expect(r).toEqual({ kind: 'key-not-header-safe', bad: '…', code: 'U+2026' });
  });

  it('pozná i nezlomitelnou mezeru uvnitř klíče', () => {
    // U+00A0 do ISO-8859-1 patří, takže hlavičku nerozbije — ale klíč ano.
    // Proto ji `cleanEnvValue` maže dřív, než se sem dostane.
    expect(cleanEnvValue('abc\u00A0def')).toBe('abcdef');
  });

  it('nesmyslnou adresu pozná', () => {
    expect(describeConfig('nenastaveno', KLIC).kind).toBe('url-invalid');
    expect(describeConfig('http://neco.supabase.co', KLIC).kind).toBe('url-invalid');
  });

  it('localhost na http projde, kvůli vývoji', () => {
    expect(describeConfig('http://localhost:54321', KLIC).kind).toBe('ok');
  });
});

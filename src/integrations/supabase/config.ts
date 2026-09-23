/**
 * Kontrola nastavení, kým se s ním vůbec zkusí někam zavolat.
 *
 * Adresa a klíč se do aplikace zapékají při buildu. Když se klíč kopíruje
 * z dashboardu, občas se s ním sveze něco navíc — nezlomitelná mezera,
 * znak nulové šířky, BOM, nebo rovnou tři tečky z useknutého zobrazení.
 * Vidět to není a vypadá to správně.
 *
 * Klíč ale putuje v HTTP hlavičce, a tam smí jen ISO-8859-1. Prohlížeč pak
 * shodí úplně první požadavek s hláškou
 *
 *     Failed to read the 'headers' property from 'RequestInit':
 *     String contains non ISO-8859-1 code point
 *
 * což o překlepu v klíči neřekne vůbec nic. Půl večera hledání.
 *
 * Neviditelné znaky tu proto zmizí — s těmi klíč funguje dál. Co zbude
 * a do hlavičky se nevejde, se nepřehlíží: aplikace to řekne rovnou.
 */

/** Znaky, které se svezou s kopírováním a nic neznamenají. */
const NEVIDITELNE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

/** Uklidí hodnotu z prostředí. Mezery ani neviditelné znaky do klíče nepatří. */
export function cleanEnvValue(raw: string | undefined): string {
  return (raw ?? '').replace(NEVIDITELNE, '').replace(/\s+/g, '');
}

/** Projde hodnota jako HTTP hlavička? Prohlížeč jinam než do ISO-8859-1 nesáhne. */
export function headerSafe(value: string): boolean {
  for (const ch of value) {
    if ((ch.codePointAt(0) ?? 0) > 0xff) return false;
  }
  return true;
}

/** První znak, který se do hlavičky nevejde — ať je v hlášce vidět který. */
export function firstBadChar(value: string): string | null {
  for (const ch of value) {
    if ((ch.codePointAt(0) ?? 0) > 0xff) return ch;
  }
  return null;
}

export type ConfigProblem =
  | { kind: 'ok' }
  | { kind: 'missing' }
  | { kind: 'url-invalid'; value: string }
  | { kind: 'key-not-header-safe'; bad: string; code: string };

export function describeConfig(url: string, key: string): ConfigProblem {
  if (!url || !key) return { kind: 'missing' };

  if (!headerSafe(key)) {
    const bad = firstBadChar(key) ?? '?';
    return {
      kind: 'key-not-header-safe',
      bad,
      code: 'U+' + (bad.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0'),
    };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      return { kind: 'url-invalid', value: url };
    }
  } catch {
    return { kind: 'url-invalid', value: url };
  }

  return { kind: 'ok' };
}

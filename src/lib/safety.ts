/**
 * Bezpečnostní pravidla, která musí platit na obou stranách.
 *
 * Poslední slovo má vždycky databáze — RLS a RPC funkce kontrolují totéž znovu,
 * takže obejít prohlížeč nikomu nepomůže. Tyhle funkce jsou tu proto, aby dítě
 * dostalo srozumitelnou odpověď hned, a ne až chybou ze serveru.
 *
 * Když se změní pravidlo tady, musí se změnit i v migraci — a naopak.
 */

/** Maximální délka první zprávy někomu, kdo ještě není kamarád. */
export const MAX_INTRO_LENGTH = 300;

/** Přezdívka je veřejná, proto jednoduchá, čitelná a bez diakritiky. */
export const USERNAME_PATTERN = /^[a-z0-9._]{3,20}$/;

/**
 * Zrcadlí `public.contains_link()` z migrace.
 * První kontakt od cizího člověka je nejčastější nosič phishingu a lákání
 * mimo platformu, takže odkazy v něm nemají co dělat.
 */
const LINK_PATTERN =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|sk|cz|eu|io|me|ru|xyz|top|info|app|link|gg|tv)\b)/i;

export function containsLink(text: string): boolean {
  return LINK_PATTERN.test(text);
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username.trim().toLowerCase());
}

export type IntroProblem = 'empty' | 'too_long' | 'has_link';

/** Vrátí, co je s první zprávou špatně — nebo null, když je v pořádku. */
export function checkIntroMessage(text: string): IntroProblem | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'empty';
  if (trimmed.length > MAX_INTRO_LENGTH) return 'too_long';
  if (containsLink(trimmed)) return 'has_link';
  return null;
}

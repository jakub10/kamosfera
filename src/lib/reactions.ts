/**
 * Reakce na příspěvky — jediný zdroj pravdy pro celou aplikaci.
 *
 * Reakce není skóre, které sbíráš. Je to záznam o tom, jak si všímáš druhých:
 * proto u každé stojí, co říká o tom, KDO JI DAL. Odsud jednou vyroste
 * Kamosvět — z dané pozornosti, nikdy z přijaté.
 *
 * Seznam musí souhlasit s CHECK constraintem v migraci
 * 20260918140000_post_reactions.sql. Změna na jedné straně bez druhé je chyba.
 */

export type ReactionKind = 'with_you' | 'super' | 'laugh' | 'rooting' | 'curious';

export interface Reaction {
  kind: ReactionKind;
  glyph: string;
  /** Co dítě vybírá. */
  label: string;
  /** Kdy se hodí — ukazuje se v pickeru pod názvem. */
  hint: string;
  /** Jak se to čte u příspěvku pro jednoho: „Tomáš <řádek>". */
  sentenceOne: string;
  /** … a pro víc lidí: „Tomáš a Bára <řádek>". */
  sentenceMany: string;
  /** Barva zvýraznění. Odstíny z palety aplikace, ne náhodné. */
  tint: string;
}

/**
 * Pořadí není libovolné. „Jsem s tebou" je první schválně — je to jediná
 * reakce, kterou dneska nejde dát, a zároveň ta nejdůležitější.
 */
export const REACTIONS: Reaction[] = [
  {
    kind: 'with_you',
    glyph: '🫂',
    label: 'Jsem s tebou',
    hint: 'když je někomu těžko',
    sentenceOne: 'je s tebou',
    sentenceMany: 'jsou s tebou',
    tint: 'hsl(210 70% 55%)',
  },
  {
    kind: 'super',
    glyph: '✨',
    label: 'To je super',
    hint: 'sdílená radost',
    sentenceOne: 'to má za super',
    sentenceMany: 'to mají za super',
    tint: 'hsl(45 95% 50%)',
  },
  {
    kind: 'laugh',
    glyph: '😄',
    label: 'Rozesmálo mě to',
    hint: 'dobrý vtip',
    sentenceOne: 'to rozesmálo',
    sentenceMany: 'to rozesmálo',
    tint: 'hsl(25 90% 55%)',
  },
  {
    kind: 'rooting',
    glyph: '💪',
    label: 'Držím ti palce',
    hint: 'když do něčeho jdeš',
    sentenceOne: 'ti drží palce',
    sentenceMany: 'ti drží palce',
    tint: 'hsl(150 55% 42%)',
  },
  {
    kind: 'curious',
    glyph: '🔍',
    label: 'Tohle mě zaujalo',
    hint: 'něco jsem se dozvěděl',
    sentenceOne: 'to zaujalo',
    sentenceMany: 'to zaujalo',
    tint: 'hsl(270 55% 58%)',
  },
];

const BY_KIND = new Map(REACTIONS.map((r) => [r.kind, r]));

export function getReaction(kind: string | null | undefined): Reaction | undefined {
  return kind ? BY_KIND.get(kind as ReactionKind) : undefined;
}

/**
 * „Tomáš a Bára jsou s tebou", „Tomáš, Bára a další 2 to mají za super".
 * Jména, ne čísla — v síti pár kamarádů ze školy je počet k ničemu.
 */
export function describeReactors(names: string[], reaction: Reaction): string {
  const [first, second, ...rest] = names;
  if (!first) return '';

  let who: string;
  if (!second) who = first;
  else if (rest.length === 0) who = `${first} a ${second}`;
  else if (rest.length === 1) who = `${first}, ${second} a další 1`;
  else who = `${first}, ${second} a další ${rest.length}`;

  return `${who} ${names.length === 1 ? reaction.sentenceOne : reaction.sentenceMany}`;
}

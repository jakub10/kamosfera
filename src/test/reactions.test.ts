import { describe, it, expect } from 'vitest';
import { REACTIONS, describeReactors, getReaction } from '@/lib/reactions';

describe('reakce', () => {
  it('„Jsem s tebou" je první — jediná reakce, kterou dřív nešlo dát', () => {
    expect(REACTIONS[0].kind).toBe('with_you');
  });

  it('druhy reakcí odpovídají CHECK constraintu v databázi', () => {
    expect(REACTIONS.map((r) => r.kind).sort()).toEqual(
      ['curious', 'laugh', 'rooting', 'super', 'with_you']
    );
  });

  it('skládá věty ze jmen, ne z čísel', () => {
    const withYou = getReaction('with_you')!;
    expect(describeReactors(['Tomáš'], withYou)).toBe('Tomáš je s tebou');
    expect(describeReactors(['Tomáš', 'Bára'], withYou)).toBe('Tomáš a Bára jsou s tebou');
    expect(describeReactors(['Tomáš', 'Bára', 'Kuba'], withYou)).toBe('Tomáš, Bára a další 1 jsou s tebou');
    expect(describeReactors(['A', 'B', 'C', 'D'], withYou)).toBe('A, B a další 2 jsou s tebou');
    expect(describeReactors([], withYou)).toBe('');
  });
});

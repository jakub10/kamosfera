import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Vercel validuje vercel.json proti schématu a neznámé vlastnosti odmítne —
 * build pak spadne ještě než se začne stavět, s hláškou
 * „should NOT have additional property". Stalo se to kvůli klíči "//"
 * použitému jako komentář: JSON komentáře nemá a tohle obejití Vercel nebere.
 *
 * Vysvětlení patří do README, ne do konfigurace.
 */
const ALLOWED_KEYS = new Set([
  '$schema', 'buildCommand', 'devCommand', 'installCommand', 'ignoreCommand',
  'outputDirectory', 'framework', 'rewrites', 'redirects', 'headers',
  'cleanUrls', 'trailingSlash', 'regions', 'functions', 'crons', 'git',
  'public', 'images',
]);

describe('vercel.json', () => {
  // Vitest běží v jsdom, kde import.meta.url není file://; cesta se bere
  // od kořene projektu, odkud se testy spouštějí.
  const raw = readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8');

  it('je platný JSON', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('nemá vlastnost, kterou Vercel nezná', () => {
    const unknown = Object.keys(JSON.parse(raw)).filter((k) => !ALLOWED_KEYS.has(k));
    expect(unknown).toEqual([]);
  });

  it('staví do dist a routuje SPA na index.html', () => {
    const cfg = JSON.parse(raw);
    expect(cfg.outputDirectory).toBe('dist');
    expect(cfg.rewrites?.[0]?.destination).toBe('/index.html');
  });
});

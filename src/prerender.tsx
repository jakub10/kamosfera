/**
 * Vstup pro předrenderování úvodní stránky při buildu (scripts/prerender.mjs).
 *
 * Kamosféra je React aplikace — bez JavaScriptu by vyhledávače a AI asistenti
 * viděli prázdnou stránku. Úvodní stránku proto při buildu vykreslíme do
 * obyčejného HTML a vložíme do dist/index.html. Po načtení ji React nahradí.
 */
import { renderToString } from 'react-dom/server';
import { Landing } from '@/components/landing/Landing';

export function render(): string {
  return renderToString(<Landing onJoin={() => {}} onLogin={() => {}} />);
}

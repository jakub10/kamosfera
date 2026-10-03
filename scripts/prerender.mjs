// Vloží předrenderovanou úvodní stránku do dist/index.html.
// Spouští se po `vite build` a `vite build --ssr` (viz package.json).
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ssr = await import(pathToFileURL(resolve('dist-ssr/prerender.js')).href);
const html = ssr.render();
if (!html || html.length < 1000) throw new Error('Předrenderování úvodní stránky vrátilo prázdný výsledek.');

const file = resolve('dist/index.html');
const page = readFileSync(file, 'utf8');
const marker = '<div id="root"></div>';
if (!page.includes(marker)) throw new Error('V dist/index.html chybí <div id="root"></div>.');

// Na jiných adresách než „/" a u přihlášených předrenderovanou úvodní stránku
// hned schovat, ať neprobliká, než naběhne aplikace.
const guard = `<script>(function(){try{var r=document.getElementById('root');var s=Object.keys(localStorage).some(function(k){return /^sb-.*-auth-token$/.test(k)});if(location.pathname!=='/'||s){r.innerHTML=''}}catch(e){}})()</script>`;
writeFileSync(file, page.replace(marker, `<div id="root">${html}</div>${guard}`));
rmSync(resolve('dist-ssr'), { recursive: true, force: true });
console.log(`Úvodní stránka předrenderována (${Math.round(html.length / 1024)} kB HTML).`);

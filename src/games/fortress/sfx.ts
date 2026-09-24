/**
 * Zvuky — syntetizované cez Web Audio, žiadne súbory na stiahnutie.
 *
 * AudioContext sa vytvorí až pri prvom zvuku; prehliadače ho pred prvým
 * kliknutím aj tak nepustia. Stlmenie si pamätá prehliadač.
 */
import type { FxEvent } from './engine';

let ac: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('pevnost-ticho') === '1';
  } catch {
    return false;
  }
})();

export function isMuted() {
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem('pevnost-ticho', v ? '1' : '0');
  } catch {
    /* súkromné okno — nevadí */
  }
}

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ac) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ac = new Ctor();
  }
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.06, to?: number, delay = 0) {
  const a = ctx();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function play(e: FxEvent) {
  if (muted) return;
  switch (e) {
    case 'bump':
      tone(110, 0.06, 'triangle', 0.05);
      break;
    case 'crack':
      tone(180, 0.08, 'sawtooth', 0.05, 90);
      break;
    case 'break':
      tone(240, 0.18, 'sawtooth', 0.06, 60);
      tone(120, 0.12, 'square', 0.04, 50, 0.04);
      break;
    case 'key':
      tone(880, 0.08, 'square', 0.05);
      tone(1320, 0.12, 'square', 0.05, undefined, 0.08);
      break;
    case 'door':
      tone(330, 0.1, 'triangle', 0.06, 440);
      break;
    case 'spike':
      tone(520, 0.12, 'sawtooth', 0.06, 180);
      break;
    case 'saw':
      tone(90, 0.25, 'sawtooth', 0.08, 60);
      tone(700, 0.15, 'square', 0.04, 300);
      break;
    case 'fall':
      tone(600, 0.45, 'triangle', 0.07, 80);
      break;
    case 'tp':
      tone(300, 0.2, 'sine', 0.07, 1200);
      break;
    case 'treasure':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.05, undefined, i * 0.07));
      break;
    case 'win':
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.055, undefined, i * 0.1));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, undefined, i * 0.18));
      break;
  }
}

export function countdownBeep(last: boolean) {
  if (muted) return;
  tone(last ? 880 : 440, last ? 0.25 : 0.12, 'square', 0.05);
}

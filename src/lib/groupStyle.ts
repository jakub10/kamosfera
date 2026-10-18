/** Vzhled skupin: ikona a barva, kterou si zakladatel vybere. */

export const GROUP_EMOJIS = ['👥', '🎮', '⚽', '🎨', '🎵', '📚', '🚀', '🐶', '🏰', '🍕', '🎬', '🧪'];

export const GROUP_COLORS = {
  violet: { name: 'Fialová', tile: 'from-violet-500 to-fuchsia-600', soft: 'bg-violet-50 dark:bg-violet-950/40', ring: 'ring-violet-400', bubble: 'bg-violet-600 text-white' },
  sky: { name: 'Modrá', tile: 'from-sky-400 to-blue-600', soft: 'bg-sky-50 dark:bg-sky-950/40', ring: 'ring-sky-400', bubble: 'bg-sky-600 text-white' },
  emerald: { name: 'Zelená', tile: 'from-emerald-400 to-green-600', soft: 'bg-emerald-50 dark:bg-emerald-950/40', ring: 'ring-emerald-400', bubble: 'bg-emerald-600 text-white' },
  amber: { name: 'Žlutá', tile: 'from-amber-300 to-yellow-500', soft: 'bg-amber-50 dark:bg-amber-950/40', ring: 'ring-amber-400', bubble: 'bg-amber-500 text-slate-900' },
  rose: { name: 'Růžová', tile: 'from-rose-400 to-pink-600', soft: 'bg-rose-50 dark:bg-rose-950/40', ring: 'ring-rose-400', bubble: 'bg-rose-600 text-white' },
  orange: { name: 'Oranžová', tile: 'from-orange-400 to-red-500', soft: 'bg-orange-50 dark:bg-orange-950/40', ring: 'ring-orange-400', bubble: 'bg-orange-500 text-white' },
  teal: { name: 'Tyrkysová', tile: 'from-teal-400 to-cyan-600', soft: 'bg-teal-50 dark:bg-teal-950/40', ring: 'ring-teal-400', bubble: 'bg-teal-600 text-white' },
  indigo: { name: 'Noční', tile: 'from-indigo-500 to-slate-800', soft: 'bg-indigo-50 dark:bg-indigo-950/40', ring: 'ring-indigo-400', bubble: 'bg-indigo-600 text-white' },
} as const;

export type GroupColor = keyof typeof GROUP_COLORS;

/** Skupiny založené dřív barvu nemají — dostanou ji podle jména, ať nejsou všechny stejné. */
export function groupStyle(g: { id: string; color?: string | null; emoji?: string | null }) {
  const keys = Object.keys(GROUP_COLORS) as GroupColor[];
  let color = g.color as GroupColor | undefined;
  if (!color || !(color in GROUP_COLORS) || (color === 'violet' && (!g.emoji || g.emoji === '👥'))) {
    let h = 0;
    for (const ch of g.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    color = keys[h % keys.length];
  }
  return { ...GROUP_COLORS[color], key: color, emoji: g.emoji || '👥' };
}

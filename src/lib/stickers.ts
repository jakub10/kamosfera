/**
 * Nálepky Kamosféry — vlastní obrázky robota Kamoše, které v telefonu nenajdeš.
 * Placené se odemykají body v obchodě (ceny hlídá i databáze: vip_items).
 */
import wave from '@/assets/stickers/wave.webp';
import thumbsup from '@/assets/stickers/thumbsup.webp';
import celebrate from '@/assets/stickers/celebrate.webp';
import chat from '@/assets/stickers/chat.webp';
import thinking from '@/assets/stickers/thinking.webp';
import surprised from '@/assets/stickers/surprised.webp';
import sad from '@/assets/stickers/sad.webp';
import sleep from '@/assets/stickers/sleep.webp';
import reading from '@/assets/stickers/reading.webp';
import search from '@/assets/stickers/search.webp';
import gaming from '@/assets/stickers/gaming.webp';
import friends from '@/assets/stickers/friends.webp';
import paint from '@/assets/stickers/paint.webp';
import lost from '@/assets/stickers/lost.webp';
import trophy from '@/assets/stickers/trophy.webp';
import vip from '@/assets/stickers/vip.webp';

export interface Sticker {
  id: string;
  name: string;
  url: string;
  cost: number;
  sticker: true;
}

const s = (id: string, name: string, url: string, cost: number): Sticker => ({ id: `kamos-${id}`, name, url, cost, sticker: true });

export const KAMOS_STICKERS: Sticker[] = [
  s('wave', 'Ahoj!', wave, 0),
  s('thumbsup', 'Palec nahoru', thumbsup, 0),
  s('celebrate', 'Hurá!', celebrate, 0),
  s('chat', 'Pokecáme?', chat, 25),
  s('thinking', 'Hmm…', thinking, 25),
  s('surprised', 'Cože?!', surprised, 25),
  s('sad', 'Smutno', sad, 25),
  s('sleep', 'Dobrou noc', sleep, 25),
  s('reading', 'Čtu si', reading, 25),
  s('search', 'Hledám', search, 25),
  s('gaming', 'Hrajem!', gaming, 50),
  s('friends', 'Kamarádi', friends, 50),
  s('paint', 'Malíř', paint, 50),
  s('lost', 'Ztratil jsem se', lost, 50),
  s('trophy', 'Vítěz', trophy, 75),
  s('vip', 'VIP Kamoš', vip, 100),
];

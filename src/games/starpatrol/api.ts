/**
 * Hviezdna Hliadka — rozhovor s databázou.
 *
 * Pravidlá bežia v databáze (funkcie `hh_*`). Prehliadač nič nepočíta, len
 * pošle akciu a vykreslí, čo mu server ukáže. Cudzie karty a roly sem vôbec
 * nedorazia, takže sa nedajú ani vyšpehovať cez vývojárske nástroje.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type CardKind = 'laser' | 'shield' | 'repair' | 'salva' | 'tractor' | 'hyper' | 'cloak';
export type Role = 'captain' | 'crew' | 'pirate' | 'ai';
export type Winner = 'crew' | 'pirates' | 'ai';

export interface Card {
  id: number;
  kind: CardKind;
}

export interface Player {
  seat: number;
  user_id: string;
  name: string;
  avatar: string | null;
  energy: number;
  max: number;
  alive: boolean;
  timeouts: number;
  role: Role | null;
  hand: number;
  eq: Card[];
  /** Vzdialenosť odo mňa (len počas hry, len k živým). */
  dist: number | null;
}

export interface LogEntry {
  id: number;
  turn: number;
  kind: string;
  a: number | null;
  b: number | null;
  info: Record<string, unknown>;
  secret: { kind?: CardKind } | null;
}

export interface View {
  room: {
    id: string;
    code: string;
    status: 'lobby' | 'playing' | 'finished';
    host_id: string;
    version: number;
    turn_seat: number | null;
    turn_no: number;
    lasers_used: number;
    deadline: string | null;
    winner: Winner | null;
  };
  now: string;
  me: { seat: number; role: Role | null; alive: boolean; reach: number | null };
  players: Player[];
  hand: Card[];
  deck: number;
  discard_top: CardKind | null;
  log: LogEntry[];
}

export interface MyRoom {
  id: string;
  code: string;
  status: 'lobby' | 'playing';
  players: number;
  my_turn: boolean;
}

export type Action =
  | { t: 'play'; card: number; target?: number; pick?: 'hand' | number }
  | { t: 'end'; discard: number[] };

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 7;

/** Chybu z databázy ukázať po slovensky, nie ako technický kód. */
function fail(error: { message?: string } | null): never {
  throw new Error(error?.message || 'Niečo sa pokazilo. Skús to znova.');
}

export async function createRoom(): Promise<{ id: string; code: string }> {
  const { data, error } = await supabase.rpc('hh_create');
  if (error) fail(error);
  return data as unknown as { id: string; code: string };
}

export async function joinRoom(code: string): Promise<{ id: string; code: string }> {
  const { data, error } = await supabase.rpc('hh_join', { _code: code });
  if (error) fail(error);
  return data as unknown as { id: string; code: string };
}

export async function leaveRoom(room: string): Promise<void> {
  const { error } = await supabase.rpc('hh_leave', { _room: room });
  if (error) fail(error);
}

export async function startRoom(room: string): Promise<View> {
  const { data, error } = await supabase.rpc('hh_start', { _room: room });
  if (error) fail(error);
  return data as unknown as View;
}

export async function rematch(room: string): Promise<View> {
  const { data, error } = await supabase.rpc('hh_rematch', { _room: room });
  if (error) fail(error);
  return data as unknown as View;
}

export async function loadView(room: string): Promise<View> {
  const { data, error } = await supabase.rpc('hh_view', { _room: room });
  if (error) fail(error);
  return data as unknown as View;
}

export async function act(room: string, action: Action): Promise<View> {
  const { data, error } = await supabase.rpc('hh_act', { _room: room, _action: action as unknown as Json });
  if (error) fail(error);
  return data as unknown as View;
}

export async function tick(room: string): Promise<View> {
  const { data, error } = await supabase.rpc('hh_tick', { _room: room });
  if (error) fail(error);
  return data as unknown as View;
}

export async function inviteFriend(room: string, friend: string): Promise<void> {
  const { error } = await supabase.rpc('hh_invite', { _room: room, _friend: friend });
  if (error) fail(error);
}

export async function myRooms(): Promise<MyRoom[]> {
  const { data, error } = await supabase.rpc('hh_my_rooms');
  if (error) fail(error);
  return (data as unknown as MyRoom[]) ?? [];
}

export interface Friend {
  user_id: string;
  username: string;
  avatar_url: string | null;
}

export async function loadFriends(uid: string): Promise<Friend[]> {
  const { data: rows, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
  if (error) fail(error);
  const ids = (rows ?? []).map((f) => (f.requester_id === uid ? f.addressee_id : f.requester_id));
  if (!ids.length) return [];
  const { data: ppl, error: e2 } = await supabase
    .from('profiles')
    .select('user_id, username, avatar_url')
    .in('user_id', ids)
    .order('username');
  if (e2) fail(e2);
  return ppl ?? [];
}

// ---------------------------------------------------------------------------
// Texty
// ---------------------------------------------------------------------------

export const CARD_INFO: Record<CardKind, { name: string; icon: string; text: string; color: string; target?: boolean; equip?: boolean }> = {
  laser: { name: 'Laser', icon: '⚡', text: 'Zasiahni hráča na dosah: −1 energia. Raz za ťah.', color: 'from-rose-500 to-red-700', target: true },
  shield: { name: 'Štít', icon: '🛡️', text: 'Zapne sa sám, keď ťa niekto zasiahne.', color: 'from-sky-400 to-blue-700' },
  repair: { name: 'Oprava', icon: '🔧', text: '+1 energia (najviac do plnej).', color: 'from-emerald-400 to-green-700' },
  salva: { name: 'Salva', icon: '💥', text: 'Všetci ostatní: štít, alebo −1 energia.', color: 'from-orange-400 to-red-600' },
  tractor: { name: 'Traktorový lúč', icon: '🧲', text: 'Ukradni kartu hráčovi na dosah.', color: 'from-fuchsia-500 to-purple-700', target: true },
  hyper: { name: 'Hyperpohon', icon: '🚀', text: 'Vybavenie: tvoj dosah +1.', color: 'from-amber-400 to-orange-600', equip: true },
  cloak: { name: 'Maskovanie', icon: '👻', text: 'Vybavenie: na teba treba dosah +1.', color: 'from-slate-400 to-slate-700', equip: true },
};

export const ROLE_INFO: Record<Role, { name: string; icon: string; goal: string; color: string }> = {
  captain: { name: 'Kapitán', icon: '👨‍✈️', goal: 'Znič všetkých pirátov aj Zblúdilú AI. Všetci vedia, že si Kapitán.', color: 'from-amber-300 to-yellow-600' },
  crew: { name: 'Posádka', icon: '🧑‍🚀', goal: 'Chráň Kapitána. Keď vyhrá on, vyhráš aj ty.', color: 'from-sky-400 to-blue-700' },
  pirate: { name: 'Pirát', icon: '🏴‍☠️', goal: 'Zostreľ Kapitána!', color: 'from-rose-500 to-red-800' },
  ai: { name: 'Zblúdilá AI', icon: '🤖', goal: 'Ostaň posledná pri stole. Najprv pirátov, potom Kapitána.', color: 'from-lime-400 to-emerald-700' },
};

export const WINNER_TEXT: Record<Winner, string> = {
  crew: 'Kapitán a posádka ubránili loď! 👨‍✈️🧑‍🚀',
  pirates: 'Piráti zostrelili Kapitána! 🏴‍☠️',
  ai: 'Zblúdilá AI ostala sama. Ovládla loď! 🤖',
};

export function winnerRoles(w: Winner): Role[] {
  return w === 'crew' ? ['captain', 'crew'] : w === 'pirates' ? ['pirate'] : ['ai'];
}

/** Záznam z denníka ako veta. Rod neriešime — šípky sú pre všetkých. */
export function describe(l: LogEntry, name: (seat: number | null) => string): string {
  const A = name(l.a);
  const B = name(l.b);
  const card = (k: unknown) => CARD_INFO[k as CardKind]?.name ?? 'kartu';
  switch (l.kind) {
    case 'start':
      return `🚀 Štart! ${l.info.players} hráčov, Kapitán ťahá prvý.`;
    case 'turn':
      return `▶ Na ťahu: ${A}`;
    case 'laser_hit':
      return `⚡ ${A} → ${B}: zásah laserom, −1 energia`;
    case 'laser_blocked':
      return `🛡️ ${A} → ${B}: laser zastavil štít`;
    case 'salva':
      return `💥 ${A} púšťa salvu na všetkých!`;
    case 'salva_hit':
      return `💥 ${B}: zásah salvou, −1 energia`;
    case 'salva_blocked':
      return `🛡️ ${B}: salvu zastavil štít`;
    case 'repair':
      return `🔧 ${A}: oprava, +1 energia`;
    case 'steal':
      return l.info.from === 'eq'
        ? `🧲 ${A} → ${B}: ukradnuté vybavenie ${card(l.info.kind)}`
        : `🧲 ${A} → ${B}: ukradnutá karta z ruky${l.secret?.kind ? ` (${card(l.secret.kind)})` : ''}`;
    case 'equip':
      return `🔩 ${A}: nové vybavenie ${card(l.info.kind)}`;
    case 'discard':
      return `🗑️ ${A}: zahodené karty (${l.info.n})`;
    case 'out': {
      const role = ROLE_INFO[l.info.role as Role];
      const why = l.info.why === 'left' ? 'odchádza z hry' : l.info.why === 'asleep' ? 'zaspal(a) a vypadáva' : 'vypadáva';
      return `💀 ${A} ${why}! Bol(a) to ${role?.icon ?? ''} ${role?.name ?? '?'}`;
    }
    case 'bounty':
      return `🎁 ${A}: odmena za piráta, ${l.info.n} karty`;
    case 'oops':
      return `😱 Kapitán zostrelil vlastnú posádku a prišiel o všetky karty!`;
    case 'timeout':
      return `⏰ ${A} nestihol(-la) ťah (${l.info.n}/3)`;
    case 'reshuffle':
      return '🔀 Balíček došiel — odhodené karty sa zamiešali';
    case 'win':
      return `🏆 ${WINNER_TEXT[l.info.winner as Winner] ?? 'Koniec hry'}`;
    default:
      return l.kind;
  }
}

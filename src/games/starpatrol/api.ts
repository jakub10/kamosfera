/**
 * Hvězdná hlídka — rozhovor s databází.
 *
 * Pravidla běží v databázi (funkce `hh_*`). Prohlížeč nic nepočítá, jen
 * pošle akci a vykreslí, co mu server ukáže. Cizí karty a role sem vůbec
 * nedorazí, takže se nedají ani vyšpehovat přes vývojářské nástroje.
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
  /** Vzdálenost ode mě (jen během hry, jen k živým). */
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

/** Chybu z databáze ukázat česky, ne jako technický kód. */
function fail(error: { message?: string } | null): never {
  throw new Error(error?.message || 'Něco se pokazilo. Zkus to znovu.');
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
  laser: { name: 'Laser', icon: '⚡', text: 'Zasáhni hráče na dosah: −1 energie. Jednou za tah.', color: 'from-rose-500 to-red-700', target: true },
  shield: { name: 'Štít', icon: '🛡️', text: 'Zapne se sám, když tě někdo zasáhne.', color: 'from-sky-400 to-blue-700' },
  repair: { name: 'Oprava', icon: '🔧', text: '+1 energie (nejvýš do plna).', color: 'from-emerald-400 to-green-700' },
  salva: { name: 'Salva', icon: '💥', text: 'Všichni ostatní: štít, nebo −1 energie.', color: 'from-orange-400 to-red-600' },
  tractor: { name: 'Vlečný paprsek', icon: '🧲', text: 'Ukradni kartu hráči na dosah.', color: 'from-fuchsia-500 to-purple-700', target: true },
  hyper: { name: 'Hyperpohon', icon: '🚀', text: 'Vybavení: tvůj dosah +1.', color: 'from-amber-400 to-orange-600', equip: true },
  cloak: { name: 'Maskování', icon: '👻', text: 'Vybavení: na tebe je potřeba dosah +1.', color: 'from-slate-400 to-slate-700', equip: true },
};

export const ROLE_INFO: Record<Role, { name: string; icon: string; goal: string; color: string }> = {
  captain: { name: 'Kapitán', icon: '👨‍✈️', goal: 'Znič všechny piráty i Zbloudilou AI. Všichni vědí, že jsi Kapitán.', color: 'from-amber-300 to-yellow-600' },
  crew: { name: 'Posádka', icon: '🧑‍🚀', goal: 'Chraň Kapitána. Když vyhraje on, vyhraješ i ty.', color: 'from-sky-400 to-blue-700' },
  pirate: { name: 'Pirát', icon: '🏴‍☠️', goal: 'Sestřel Kapitána!', color: 'from-rose-500 to-red-800' },
  ai: { name: 'Zbloudilá AI', icon: '🤖', goal: 'Zůstaň poslední u stolu. Nejdřív piráty, pak Kapitána.', color: 'from-lime-400 to-emerald-700' },
};

export const WINNER_TEXT: Record<Winner, string> = {
  crew: 'Kapitán a posádka ubránili loď! 👨‍✈️🧑‍🚀',
  pirates: 'Piráti sestřelili Kapitána! 🏴‍☠️',
  ai: 'Zbloudilá AI zůstala sama. Ovládla loď! 🤖',
};

export function winnerRoles(w: Winner): Role[] {
  return w === 'crew' ? ['captain', 'crew'] : w === 'pirates' ? ['pirate'] : ['ai'];
}

/** Záznam z deníku jako věta. Rod neřešíme — šipky jsou pro všechny. */
export function describe(l: LogEntry, name: (seat: number | null) => string): string {
  const A = name(l.a);
  const B = name(l.b);
  const card = (k: unknown) => CARD_INFO[k as CardKind]?.name ?? 'kartu';
  switch (l.kind) {
    case 'start':
      return `🚀 Start! ${l.info.players} hráčů, Kapitán táhne první.`;
    case 'turn':
      return `▶ Na tahu: ${A}`;
    case 'laser_hit':
      return `⚡ ${A} → ${B}: zásah laserem, −1 energie`;
    case 'laser_blocked':
      return `🛡️ ${A} → ${B}: laser zastavil štít`;
    case 'salva':
      return `💥 ${A} pouští salvu na všechny!`;
    case 'salva_hit':
      return `💥 ${B}: zásah salvou, −1 energie`;
    case 'salva_blocked':
      return `🛡️ ${B}: salvu zastavil štít`;
    case 'repair':
      return `🔧 ${A}: oprava, +1 energie`;
    case 'steal':
      return l.info.from === 'eq'
        ? `🧲 ${A} → ${B}: ukradené vybavení ${card(l.info.kind)}`
        : `🧲 ${A} → ${B}: ukradená karta z ruky${l.secret?.kind ? ` (${card(l.secret.kind)})` : ''}`;
    case 'equip':
      return `🔩 ${A}: nové vybavení ${card(l.info.kind)}`;
    case 'discard':
      return `🗑️ ${A}: zahozené karty (${l.info.n})`;
    case 'out': {
      const role = ROLE_INFO[l.info.role as Role];
      const why = l.info.why === 'left' ? 'odchází ze hry' : l.info.why === 'asleep' ? 'usnul(a) a vypadává' : 'vypadává';
      return `💀 ${A} ${why}! Byl(a) to ${role?.icon ?? ''} ${role?.name ?? '?'}`;
    }
    case 'bounty':
      return `🎁 ${A}: odměna za piráta, ${l.info.n} karty`;
    case 'oops':
      return `😱 Kapitán sestřelil vlastní posádku a přišel o všechny karty!`;
    case 'timeout':
      return `⏰ ${A} nestihl(a) tah (${l.info.n}/3)`;
    case 'reshuffle':
      return '🔀 Balíček došel — odhozené karty se zamíchaly';
    case 'win':
      return `🏆 ${WINNER_TEXT[l.info.winner as Winner] ?? 'Konec hry'}`;
    default:
      return l.kind;
  }
}

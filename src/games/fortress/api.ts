/**
 * Pevnosť & Nájazd — rozhovor s databázou.
 *
 * Stĺpec `proof` (záznam behu, ktorým majiteľ pevnosť overil) sa dá zapísať,
 * ale nie prečítať — ani majiteľom. Preto sa tu nikdy nepíše `select('*')`:
 * PostgreSQL by celý dotaz odmietol kvôli jedinému zakázanému stĺpcu.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { Replay, RunResult } from './engine';

export const FORTRESS_COLS = 'id, owner_id, grid, published, created_at, updated_at';

export interface Fortress {
  id: string;
  owner_id: string;
  grid: { cells: string };
  published: boolean;
  updated_at: string;
}

export interface MiniProfile {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

export interface RaidRow {
  id: string;
  fortress_id: string;
  raider_id: string;
  success: boolean;
  time_ms: number;
  trap_hits: number;
  replay: Replay;
  created_at: string;
}

export async function loadMyFortress(uid: string): Promise<Fortress | null> {
  const { data, error } = await supabase
    .from('fortresses')
    .select(FORTRESS_COLS)
    .eq('owner_id', uid)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Fortress) ?? null;
}

export async function loadFortress(id: string): Promise<Fortress | null> {
  const { data, error } = await supabase.from('fortresses').select(FORTRESS_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as Fortress) ?? null;
}

/**
 * Uloží pevnosť. Bez dôkazu ako rozpracovanú (databáza ju pri zmene mapy
 * aj tak stiahne), s dôkazom rovno zverejnenú.
 *
 * Nie `upsert`: ten by pri konflikte čítal aj stĺpec `proof`, na ktorý
 * nemá nikto právo čítania.
 */
export async function saveFortress(uid: string, cells: string, proof: Replay | null) {
  const existing = await loadMyFortress(uid);
  const row = {
    grid: { cells },
    proof: proof as unknown as Json,
    published: proof !== null,
  };
  if (!existing) {
    const { error } = await supabase.from('fortresses').insert({ owner_id: uid, ...row });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('fortresses').update(row).eq('owner_id', uid);
    if (error) throw error;
  }
}

export async function browseFortresses() {
  const { data, error } = await supabase.rpc('fortress_browse');
  if (error) throw error;
  return data ?? [];
}

export async function fortressLeaderboard() {
  const { data, error } = await supabase.rpc('fortress_leaderboard', { _limit: 10 });
  if (error) throw error;
  return data ?? [];
}

export async function fortressProfile(owner: string) {
  const { data, error } = await supabase.rpc('fortress_profile', { _owner: owner });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function submitRaid(fortressId: string, uid: string, r: RunResult, replay: Replay) {
  const { error } = await supabase.from('fortress_raids').insert({
    fortress_id: fortressId,
    raider_id: uid,
    success: r.success,
    time_ms: r.timeMs,
    trap_hits: r.hits,
    replay: replay as unknown as Json,
  });
  if (error) throw error;
}

const RAID_COLS = 'id, fortress_id, raider_id, success, time_ms, trap_hits, replay, created_at';

export async function raidsOnFortress(fortressId: string): Promise<RaidRow[]> {
  const { data, error } = await supabase
    .from('fortress_raids')
    .select(RAID_COLS)
    .eq('fortress_id', fortressId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as RaidRow[];
}

export async function myRaids(uid: string): Promise<RaidRow[]> {
  const { data, error } = await supabase
    .from('fortress_raids')
    .select(RAID_COLS)
    .eq('raider_id', uid)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as RaidRow[];
}

export async function profilesByIds(ids: string[]): Promise<Record<string, MiniProfile>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return {};
  const { data } = await supabase
    .from('profiles')
    .select('user_id, username, full_name, avatar_url')
    .in('user_id', unique);
  const out: Record<string, MiniProfile> = {};
  for (const p of (data ?? []) as MiniProfile[]) out[p.user_id] = p;
  return out;
}

export function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

export function successRate(raids: number, successes: number) {
  return raids ? Math.round((successes / raids) * 100) : 0;
}

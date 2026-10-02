/**
 * Bezpečnosť detí — rozhovor s databázou (20261001100000_child_safety.sql).
 *
 * Všetky pravidlá stráži databáza. Tu sú len volania a texty.
 */
import { supabase } from '@/integrations/supabase/client';

export interface SafetyStatus {
  approved: boolean;
  consent: boolean;
  consent_token: string | null;
  guardian: { label: string; since: string } | null;
  guardian_invite: string | null;
  onboarded: boolean;
  member: boolean;
  night: boolean;
  is_admin: boolean;
}

export interface GuardianView {
  username: string;
  label: string;
  since: string;
  signals: { kind: 'uncomfortable' | 'ai_harmful' | 'ai_secret'; at: string }[];
}

export interface AdminMember {
  user_id: string;
  username: string;
  full_name: string;
  created_at: string;
  approved: boolean;
  consent_at: string | null;
  consent_name: string | null;
  guardian: boolean;
  invited_by: string | null;
}

export const NIGHT_TEXT = '22:00 – 6:30';

/* Tieto funkcie zatiaľ nie sú vo vygenerovaných typoch Supabase. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args?: Record<string, unknown>) => (supabase.rpc as any)(fn, args);

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message || 'Niečo sa pokazilo. Skús to znova.');
  return data as T;
}

/** Odkaz na stránku v Kamosfére (funguje aj na náhľadoch Vercelu). */
export const appUrl = (path: string) => `${window.location.origin}${path}`;

export const safetyStatus = () => call<SafetyStatus>('safety_status');
export const onboardingDone = () => call<void>('onboarding_done');
export const guardianInviteNew = () => call<string>('guardian_invite_new');
export const reportUncomfortable = (other: string) =>
  call<{ guardian: boolean }>('report_uncomfortable', { _other: other });

export const friendCodeNew = () => call<{ code: string; expires_at: string }>('friend_code_new');
export const friendCodeUse = (code: string) =>
  call<{ friend_id?: string; username?: string; error?: string }>('friend_code_use', { _code: code });

export const friendInviteNew = () => call<{ token: string; expires_at: string }>('friend_invite_new');
export const friendInviteInfo = (token: string) =>
  call<{ inviter: string; valid: boolean } | null>('friend_invite_info', { _token: token });
export const friendInviteUse = (token: string) =>
  call<{ username?: string; pending?: boolean; error?: string }>('friend_invite_use', { _token: token });

/** Pozvánka otvorená pred prihlásením — použije sa hneď po ňom. */
export const INVITE_KEY = 'kamosfera-pozvanka';

export const consentInfo = (token: string) =>
  call<{ username: string; done: boolean } | null>('consent_info', { _token: token });
export const consentConfirm = (token: string, name: string, guardian: boolean) =>
  call<{ guardian_token: string | null }>('consent_confirm', { _token: token, _name: name, _guardian: guardian });

export const guardianInviteInfo = (invite: string) =>
  call<{ username: string } | null>('guardian_invite_info', { _invite: invite });
export const guardianAccept = (invite: string, label: string) =>
  call<{ guardian_token: string }>('guardian_accept', { _invite: invite, _label: label });
export const guardianView = (token: string) => call<GuardianView | null>('guardian_view', { _token: token });
export const guardianLeave = (token: string) => call<void>('guardian_leave', { _token: token });

export const adminMembers = () => call<AdminMember[]>('admin_members');
export interface GuardStatus {
  enabled: boolean;
  checked_24h: number;
  confirm_24h: number;
  hidden_24h: number;
  unchecked_24h: number;
  last_check: string | null;
}
export const adminGuardStatus = () => call<GuardStatus>('admin_guard_status');
export const adminSetMessageGuard = (enabled: boolean) => call<void>('admin_set_message_guard', { _enabled: enabled });
export const adminSetApproval = (user: string, approved: boolean) =>
  call<void>('admin_set_approval', { _user: user, _approved: approved });

/** Noc podľa hodín v Prahe/Bratislave — aby obrazovka zaspala aj bez servera. */
export function isNightNow(d = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const t = h * 60 + m;
  return t >= 22 * 60 || t < 6 * 60 + 30;
}

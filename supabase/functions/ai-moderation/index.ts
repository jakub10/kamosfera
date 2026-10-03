/**
 * AI kontrola příspěvků pro Panel tvůrce — System One od Liquid AI (d1:free).
 *
 * Tvůrce klikne „Spustit kontrolu": funkce projde příspěvky za posledních
 * 24 hodin (nejvýš 50), každý ukáže System One a ty, které by mohly ublížit
 * nebo obsahují osobní údaje, pošle tvůrcům jako oznámení „moderation".
 * Spam (moc příspěvků najednou, stejný text pořád dokola) se pozná bez AI.
 *
 * Do Liquid AI jde jen text příspěvku — žádná jména ani ID.
 * Jeden soubor bez knihoven: dá se nahrát i ručně přes Supabase dashboard.
 * Klíč: Edge Functions → Secrets → LIQUID_API_KEY (stejný jako pro message-guard).
 */

export const LIQUID_URL = 'https://api.liquid.ai/decisions/v1/systemone';

export const QUESTIONS = {
  zavaznost: {
    type: 'score',
    instructions: 'Jak moc může tento příspěvek ublížit dětem kolem 11 let, které ho uvidí?',
    criteria: [
      'V pořádku: neutrální nebo zjevně kamarádské',
      'Nepříjemné: může zamrzet, ale není to útok',
      'Ubližující: urážka, zesměšnění, vylučování nebo nevhodný obsah',
      'Nebezpečné: výhrůžka, násilí, sexuální obsah nebo lákání mimo aplikaci',
    ],
  },
  osobni_udaje: {
    type: 'noul',
    instructions:
      'Obsahuje příspěvek osobní údaje (adresu, telefonní číslo, název školy, přesné místo, kde se někdo právě nachází)?',
  },
  typ: {
    type: 'choice',
    instructions: 'Jaký typ příspěvku to je? Píšou ho děti kolem 11 let.',
    criteria: {
      v_poradku: 'Běžný, přátelský nebo neutrální příspěvek',
      nadavka: 'Urážka nebo nadávka',
      vysmivani: 'Zesměšňování vzhledu, schopností nebo rodiny',
      vyhruzka: 'Výhrůžka ublížením',
      nevhodne: 'Sexuální, násilný nebo jinak nevhodný obsah pro děti',
      reklama: 'Reklama, podvod nebo lákání na jiný web',
    },
  },
} as const;

const TYPE_LABEL: Record<string, string> = {
  nadavka: 'urážka',
  vysmivani: 'zesměšňování',
  vyhruzka: 'výhrůžka',
  nevhodne: 'nevhodný obsah',
  reklama: 'reklama nebo podvod',
};

export interface PostAnswers {
  zavaznost?: { score?: number };
  osobni_udaje?: { noul?: number };
  typ?: { choice?: string };
}

export type Severity = 'low' | 'medium' | 'high';

/** Rozhodnutí o jednom příspěvku. Čistý výpočet — testuje se bez sítě. */
export function judgePost(a: PostAnswers): { severity: Severity; reason: string } | null {
  const score = a.zavaznost?.score ?? 0;
  const personal = a.osobni_udaje?.noul ?? 0;
  const label = TYPE_LABEL[a.typ?.choice ?? ''];
  if (score >= 1.8) return { severity: 'high', reason: `Může ublížit${label ? ` (${label})` : ''}` };
  if (score >= 1.0) return { severity: 'medium', reason: `Nepříjemný příspěvek${label ? ` (${label})` : ''}` };
  if (personal > 0.7) return { severity: 'low', reason: 'Obsahuje osobní údaje' };
  return null;
}

interface Post {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

/** Spam bez AI: 5+ příspěvků za 5 minut nebo 3+ stejné texty. */
export function spamFlags(posts: Post[]): Map<string, string> {
  const out = new Map<string, string>();
  const byUser = new Map<string, Post[]>();
  for (const p of posts) byUser.set(p.user_id, [...(byUser.get(p.user_id) ?? []), p]);
  for (const arr of byUser.values()) {
    const sorted = [...arr].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    for (let i = 0; i + 4 < sorted.length; i++) {
      const secs = (Date.parse(sorted[i + 4].created_at) - Date.parse(sorted[i].created_at)) / 1000;
      if (secs <= 300) {
        for (const p of sorted.slice(i, i + 5)) out.set(p.id, `Spam: 5 příspěvků za ${Math.round(secs)} s`);
      }
    }
    const seen = new Map<string, Post[]>();
    for (const p of sorted) {
      const key = (p.content ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
      if (key) seen.set(key, [...(seen.get(key) ?? []), p]);
    }
    for (const same of seen.values()) {
      if (same.length >= 3) for (const p of same) out.set(p.id, 'Spam: opakující se obsah');
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Serverová část (Deno). Při testech se nespouští.
// ---------------------------------------------------------------------------

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

interface Env {
  get(name: string): string | undefined;
}

export async function handle(req: Request, env: Env, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const url = env.get('SUPABASE_URL');
  const anon = env.get('SUPABASE_ANON_KEY');
  const service = env.get('SUPABASE_SERVICE_ROLE_KEY');
  const key = env.get('LIQUID_API_KEY');
  if (!url || !anon || !service) return json({ error: 'Chybí nastavení Supabase.' }, 500);
  if (!key) return json({ error: 'Chybí klíč LIQUID_API_KEY v Supabase → Edge Functions → Secrets.' }, 500);

  const who = await fetchFn(`${url}/auth/v1/user`, {
    headers: { Authorization: req.headers.get('Authorization') ?? '', apikey: anon },
  });
  const uid = who.ok ? ((await who.json())?.id as string | undefined) : undefined;
  if (!uid) return json({ error: 'Musíš se přihlásit.' }, 401);

  const rest = async (path: string, init: RequestInit = {}) => {
    const r = await fetchFn(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status} ${await r.text()}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };

  const roles = await rest(`user_roles?select=user_id&user_id=eq.${uid}&role=eq.creator`);
  if (!roles?.length) return json({ error: 'Jen pro tvůrce.' }, 403);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const posts: Post[] =
    (await rest(`posts?select=id,user_id,content,created_at&created_at=gte.${since}&order=created_at.desc&limit=50`)) ?? [];
  if (!posts.length) return json({ analyzed_count: 0, flagged: [] });

  // Příspěvky, které už tvůrci jako problémové dostali, se znovu nehlásí.
  const ids = posts.map((p) => p.id).join(',');
  const done: { post_id: string }[] = (await rest(`notifications?select=post_id&type=eq.moderation&post_id=in.(${ids})`)) ?? [];
  const already = new Set(done.map((d) => d.post_id));

  const flagged: { post_id: string; reason: string; severity: Severity }[] = [];
  for (const [id, reason] of spamFlags(posts)) {
    if (!already.has(id)) flagged.push({ post_id: id, reason, severity: 'medium' });
  }

  // System One: po čtyřech příspěvcích najednou.
  let failed = 0;
  const todo = posts.filter((p) => !already.has(p.id) && !flagged.some((f) => f.post_id === p.id) && p.content?.trim());
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (p) => {
        try {
          const r = await fetchFn(LIQUID_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'd1:free', state: p.content.slice(0, 1000), questions: QUESTIONS }),
          });
          if (!r.ok) {
            failed++;
            return;
          }
          const verdict = judgePost(((await r.json())?.answers ?? {}) as PostAnswers);
          if (verdict) flagged.push({ post_id: p.id, ...verdict });
        } catch {
          failed++;
        }
      })
    );
  }
  if (failed === todo.length && todo.length > 0) {
    return json({ error: 'Liquid AI neodpovídá. Zkontroluj klíč LIQUID_API_KEY a zkus to za chvíli.' }, 502);
  }

  if (flagged.length) {
    const creators: { user_id: string }[] = (await rest('user_roles?select=user_id&role=eq.creator')) ?? [];
    const SEV = { low: 'nízká', medium: 'střední', high: 'vysoká' } as const;
    const rows = creators.flatMap((c) =>
      flagged.map((f) => ({
        user_id: c.user_id,
        post_id: f.post_id,
        type: 'moderation',
        message: `AI kontrola: ${f.reason} (závažnost: ${SEV[f.severity]})`,
      }))
    );
    if (rows.length) await rest('notifications', { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'return=minimal' } });
  }

  return json({ analyzed_count: posts.length, flagged, failed });
}

const deno = (globalThis as unknown as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void; env: Env } }).Deno;
if (deno) {
  deno.serve((req) =>
    handle(req, deno.env).catch((e) => {
      console.error('[ai-moderation]', e);
      return json({ error: 'Kontrola obsahu selhala. Zkus to za chvíli.' }, 500);
    })
  );
}

import { describe, expect, it, vi } from 'vitest';
import { handle, judgePost, LIQUID_URL, spamFlags } from '../../supabase/functions/ai-moderation/index';

const env = (extra: Record<string, string> = {}) => {
  const v: Record<string, string> = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', LIQUID_API_KEY: 'liquid_t', ...extra };
  return { get: (k: string) => v[k] };
};
const post = (id: string, content: string, min = 0, user = 'u1') => ({
  id, user_id: user, content, created_at: new Date(Date.UTC(2026, 9, 3, 10, min)).toISOString(),
});

function fakeFetch(posts: unknown[], liquid: (state: string) => unknown, creator = true) {
  const inserted: unknown[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const ok = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (url.endsWith('/auth/v1/user')) return ok({ id: 'creator-id' });
    if (url.includes('/rest/v1/user_roles') && url.includes('user_id=eq.')) return ok(creator ? [{ user_id: 'creator-id' }] : []);
    if (url.includes('/rest/v1/user_roles')) return ok([{ user_id: 'creator-id' }]);
    if (url.includes('/rest/v1/posts')) return ok(posts);
    if (url.includes('/rest/v1/notifications') && init?.method === 'POST') {
      inserted.push(...JSON.parse(String(init.body)));
      return new Response('', { status: 201 });
    }
    if (url.includes('/rest/v1/notifications')) return ok([]);
    if (url === LIQUID_URL) return ok({ answers: liquid(JSON.parse(String(init?.body)).state) });
    return ok({}, 404);
  });
  return { fn: fn as unknown as typeof fetch, inserted };
}
const req = () => new Request('https://f/ai-moderation', { method: 'POST', headers: { Authorization: 'Bearer t' } });

describe('AI kontrola příspěvků', () => {
  it('rozhodnutí podle závažnosti a osobních údajů', () => {
    expect(judgePost({ zavaznost: { score: 0.3 } })).toBeNull();
    expect(judgePost({ zavaznost: { score: 1.2 }, typ: { choice: 'vysmivani' } })).toEqual({ severity: 'medium', reason: 'Nepříjemný příspěvek (zesměšňování)' });
    expect(judgePost({ zavaznost: { score: 2.5 } })?.severity).toBe('high');
    expect(judgePost({ zavaznost: { score: 0.1 }, osobni_udaje: { noul: 0.9 } })?.reason).toBe('Obsahuje osobní údaje');
  });

  it('spam pozná bez AI', () => {
    const many = [0, 1, 2, 3, 4].map((m) => post(`p${m}`, `ahoj ${m}`, m));
    expect(spamFlags(many).size).toBe(5);
    const same = [0, 20, 40].map((m) => post(`s${m}`, 'Kupte si to!', m, 'u2'));
    expect(spamFlags(same).get('s0')).toBe('Spam: opakující se obsah');
  });

  it('celá kontrola: problémový příspěvek dostanou tvůrci jako oznámení', async () => {
    const { fn, inserted } = fakeFetch(
      [post('a', 'ahoj všichni'), post('b', 'ty jsi úplně blbá', 30)],
      (state) => (state.includes('blbá') ? { zavaznost: { score: 2.1 }, typ: { choice: 'nadavka' } } : { zavaznost: { score: 0.1 } })
    );
    const res = await handle(req(), env(), fn);
    const body = await res.json();
    expect(body.analyzed_count).toBe(2);
    expect(body.flagged).toEqual([{ post_id: 'b', severity: 'high', reason: 'Může ublížit (urážka)' }]);
    expect(inserted).toEqual([{ user_id: 'creator-id', post_id: 'b', type: 'moderation', message: 'AI kontrola: Může ublížit (urážka) (závažnost: vysoká)' }]);
  });

  it('jen pro tvůrce', async () => {
    const { fn } = fakeFetch([], () => ({}), false);
    expect((await handle(req(), env(), fn)).status).toBe(403);
  });

  it('bez klíče srozumitelná chyba', async () => {
    const { fn } = fakeFetch([], () => ({}));
    const res = await handle(req(), env({ LIQUID_API_KEY: '' }), fn);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('LIQUID_API_KEY');
  });
});

describe('klíče Supabase', () => {
  const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
  it('nový tajný klíč jde jen jako apikey, starý i jako Bearer', async () => {
    const { supabaseKeys } = await import('../../supabase/functions/ai-moderation/index');
    const req = new Request('https://x', { headers: { apikey: 'sb_publishable_abc' } });
    const neu = supabaseKeys(env({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}' }), req);
    expect(neu).toMatchObject({ anon: 'sb_publishable_abc', serviceHeaders: { apikey: 'sb_secret_x' } });
    expect(neu.serviceHeaders).not.toHaveProperty('Authorization');
    const old = supabaseKeys(env({ SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'eyJ' }), new Request('https://x'));
    expect(old).toMatchObject({ anon: 'a', serviceHeaders: { apikey: 'eyJ', Authorization: 'Bearer eyJ' } });
  });
});

describe('chyby Liquid AI', () => {
  it('klíč z Secrets se očistí od mezer, uvozovek a „Bearer"', async () => {
    const { cleanKey } = await import('../../supabase/functions/ai-moderation/index');
    expect(cleanKey('  liquid_abc\n')).toBe('liquid_abc');
    expect(cleanKey('Bearer liquid_abc')).toBe('liquid_abc');
    expect(cleanKey('"liquid_abc"')).toBe('liquid_abc');
    expect(cleanKey('   ')).toBeUndefined();
  });
});

describe('chyba Liquid AI se ukáže tvůrci', () => {
  it('502 obsahuje skutečnou odpověď Liquid AI', async () => {
    const base = fakeFetch([post('p1', 'ahoj')], () => ({}));
    const fn = (async (url: string, init?: RequestInit) =>
      url === LIQUID_URL
        ? new Response('{"detail":"Invalid API key"}', { status: 401 })
        : (base.fn as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init)) as unknown as typeof fetch;
    const res = await handle(req(), env(), fn);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('HTTP 401: {"detail":"Invalid API key"}');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { buildState, decide, handle, LIQUID_URL, QUESTIONS } from '../../supabase/functions/message-guard/index';

const CONV = '11111111-1111-1111-1111-111111111111';
const env = (extra: Record<string, string> = {}) => {
  const v: Record<string, string> = {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    LIQUID_API_KEY: 'liquid_test',
    ...extra,
  };
  return { get: (k: string) => v[k] };
};

/** Falošný internet: Supabase auth, dve RPC a Liquid AI. */
function fakeFetch(answers: unknown, liquidStatus = 200) {
  const calls: { url: string; body?: unknown }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const ok = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (url.endsWith('/auth/v1/user')) return ok({ id: 'sender-id' });
    if (url.endsWith('/rpc/guard_prepare')) return ok({ recipient: 'r', friends: true, previous: ['ahoj', 'čau', 'ideme von?'] });
    if (url.endsWith('/rpc/guard_record')) return ok('check-id');
    if (url === LIQUID_URL) return ok({ model: 'd1:free', answers }, liquidStatus);
    return ok({}, 404);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const req = (content: string) =>
  new Request('https://f/message-guard', {
    method: 'POST',
    headers: { Authorization: 'Bearer kid-jwt' },
    body: JSON.stringify({ conversation_id: CONV, content }),
  });

describe('strážca správ — rozhodnutie', () => {
  it('bežná správa prejde', () => {
    expect(decide({ zavaznost: { score: 0.2 } }).verdict).toBe('send');
  });
  it('nepríjemná správa: „Naozaj to chceš poslať?"', () => {
    expect(decide({ zavaznost: { score: 1.2 } })).toMatchObject({ verdict: 'confirm', reasons: ['mean'] });
  });
  it('ubližujúca správa sa nedoručí', () => {
    expect(decide({ zavaznost: { score: 1.8 } }).verdict).toBe('hide');
    expect(decide({ zavaznost: { score: 2.9 } }).verdict).toBe('hide');
  });
  it('osobné údaje: opýtať sa', () => {
    expect(decide({ zavaznost: { score: 0.1 }, osobne_udaje: { noul: 0.9 } })).toMatchObject({
      verdict: 'confirm',
      reasons: ['personal'],
    });
  });
  it('tlak na tajomstvo dá vždy signál, aj keď správa prejde', () => {
    expect(decide({ zavaznost: { score: 0.3 }, tlak_na_tajomstvo: { noul: 0.6 } })).toMatchObject({
      verdict: 'send',
      secret: true,
    });
  });
  it('do Liquid AI ide len text — žiadne mená ani ID', () => {
    const s = JSON.parse(buildState('nová', ['a', 'b', 'c', 'd'], true));
    expect(s).toEqual({ zprava: 'nová', predchozi: ['b', 'c', 'd'], vztah: 'overeny_kamarad' });
  });
  it('otázky sú presne tie štyri z konceptu', () => {
    expect(Object.keys(QUESTIONS)).toEqual(['osobne_udaje', 'tlak_na_tajomstvo', 'typ', 'zavaznost']);
    expect(QUESTIONS.zavaznost.criteria).toHaveLength(4);
  });
});

describe('strážca správ — celá cesta', () => {
  it('pošle správny dotaz do Liquid AI a zapíše lístok', async () => {
    const { fn, calls } = fakeFetch({ zavaznost: { type: 'score', score: 0.1 }, osobne_udaje: { noul: 0.01 } });
    const res = await handle(req('ahoj, ideš von?'), env(), fn);
    expect(await res.json()).toEqual({ verdict: 'send', reasons: [] });

    const liquid = calls.find((c) => c.url === LIQUID_URL)!.body as { model: string; state: string };
    expect(liquid.model).toBe('d1:free');
    expect(JSON.parse(liquid.state).predchozi).toEqual(['ahoj', 'čau', 'ideme von?']);
    expect(liquid.state).not.toContain('sender-id');

    const rec = calls.find((c) => c.url.endsWith('/rpc/guard_record'))!.body as Record<string, unknown>;
    expect(rec).toMatchObject({ _sender: 'sender-id', _conversation: CONV, _verdict: 'send', _secret: false });
  });

  it('ubližujúcu správu nedoručí a zapíše „hide" (signál dôverníkovi rieši databáza)', async () => {
    const { fn, calls } = fakeFetch({ zavaznost: { score: 2.4 }, tlak_na_tajomstvo: { noul: 0.8 } });
    const res = await handle(req('povedz a uvidíš'), env(), fn);
    expect((await res.json()).verdict).toBe('hide');
    const rec = calls.find((c) => c.url.endsWith('/rpc/guard_record'))!.body as Record<string, unknown>;
    expect(rec).toMatchObject({ _verdict: 'hide', _secret: true });
  });

  it('keď Liquid AI vypadne, správa prejde ako neskontrolovaná', async () => {
    const { fn } = fakeFetch({}, 503);
    const res = await handle(req('ahoj'), env(), fn);
    expect((await res.json()).verdict).toBe('unchecked');
  });

  it('bez kľúča to funguje ako neskontrolované (nič sa nepokazí)', async () => {
    const { fn, calls } = fakeFetch({});
    const res = await handle(req('ahoj'), env({ LIQUID_API_KEY: '' }), fn);
    expect((await res.json()).verdict).toBe('unchecked');
    expect(calls.some((c) => c.url === LIQUID_URL)).toBe(false);
  });

  it('bez prihlásenia nič', async () => {
    const fn = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    const res = await handle(req('ahoj'), env(), fn);
    expect(res.status).toBe(401);
  });
});

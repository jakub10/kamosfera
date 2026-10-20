/**
 * Strážca správ — System One od Liquid AI (model d1:free).
 *
 * Prehliadač sem pošle správu ešte pred odoslaním. Strážca:
 *   1. overí, kto píše (jeho prihlásenie) a že sedí v tej konverzácii,
 *   2. pošle do Liquid AI LEN TEXT: novú správu, 3 predošlé a či sú kamaráti
 *      — žiadne mená ani ID,
 *   3. podľa pravdepodobností rozhodne: poslať / opýtať sa / nedoručiť,
 *   4. zapíše „lístok" do databázy (bez textu, len odtlačok) a pri vážnych
 *      veciach dá signál dôverníkovi príjemcu.
 *
 * Keď Liquid AI neodpovie, správa prejde ako „neskontrolovaná" — deti si
 * majú vedieť písať aj vtedy, keď cloud vypadne. Správca to vidí v štatistike.
 *
 * Jeden súbor bez knižníc: dá sa nahrať aj ručne cez Supabase dashboard.
 * Kľúč: Edge Functions → Secrets → LIQUID_API_KEY.
 */

export type Verdict = 'send' | 'confirm' | 'hide' | 'unchecked';
export type Reason = 'mean' | 'personal';

export interface Answers {
  osobne_udaje?: { noul?: number };
  tlak_na_tajomstvo?: { noul?: number };
  typ?: { choice?: string; probabilities?: Record<string, number> };
  zavaznost?: { score?: number };
}

export const LIQUID_URL = 'https://api.liquid.ai/decisions/v1/systemone';

// ---------------------------------------------------------------------------
// Model Liquid AI. Výchozí je d1:free; jiný jde nastavit v Secrets jako
// LIQUID_MODEL. Když Liquid AI model nezná (404), funkce se zeptá na seznam
// dostupných modelů a vybere rozhodovací (System One / d1).
// ---------------------------------------------------------------------------
export const DEFAULT_MODEL = 'd1:free';
export const MODEL = DEFAULT_MODEL;
export const LIQUID_MODELS_URLS = ['https://api.liquid.ai/decisions/v1/models', 'https://api.liquid.ai/v1/models'];
let knownModel: string | undefined;
export const resetKnownModel = () => {
  knownModel = undefined;
};

function collectIds(v: unknown, out: Set<string>) {
  if (Array.isArray(v)) v.forEach((x) => collectIds(x, out));
  else if (typeof v === 'string') out.add(v);
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['id', 'name', 'model', 'slug']) if (typeof o[k] === 'string') out.add(o[k] as string);
    for (const k of ['data', 'models', 'items', 'results']) if (o[k]) collectIds(o[k], out);
  }
}

export async function listLiquidModels(fetchFn: typeof fetch, key: string): Promise<string[]> {
  const ids = new Set<string>();
  for (const u of LIQUID_MODELS_URLS) {
    try {
      const r = await fetchFn(u, { headers: { Authorization: `Bearer ${key}` } });
      if (r.ok) collectIds(await r.json(), ids);
    } catch {
      /* další adresa */
    }
    if (ids.size) break;
  }
  return [...ids];
}

export function pickModel(ids: string[], not?: string): string | undefined {
  const c = ids.filter((m) => m !== not);
  const dec = (m: string) => /d1|decision|system/i.test(m);
  return c.find((m) => dec(m) && /free/i.test(m)) ?? c.find(dec) ?? c[0];
}

/** Jeden dotaz na System One. Vrátí odpovědi, nebo text chyby od Liquid AI. */
export async function askLiquid(
  fetchFn: typeof fetch,
  key: string,
  envModel: string | undefined,
  payload: { state: string; questions: unknown },
  signal?: AbortSignal
): Promise<{ answers: Record<string, unknown>; model: string } | { error: string; status: number }> {
  const send = (model: string) =>
    fetchFn(LIQUID_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, ...payload }),
      signal,
    });
  let model = knownModel ?? (envModel?.trim() || DEFAULT_MODEL);
  let r = await send(model);
  if (r.status === 404) {
    const text = await r.text().catch(() => '');
    if (/model/i.test(text)) {
      const ids = await listLiquidModels(fetchFn, key);
      const alt = pickModel(ids, model);
      if (!alt) {
        return {
          status: 404,
          error: `HTTP 404: ${text.slice(0, 200)} — dostupné modely: ${ids.length ? ids.join(', ') : 'Liquid AI seznam nevrátila'}`,
        };
      }
      model = alt;
      r = await send(model);
    } else {
      return { status: 404, error: `HTTP 404: ${text.slice(0, 300)}` };
    }
  }
  if (!r.ok) return { status: r.status, error: `HTTP ${r.status} (model ${model}): ${(await r.text().catch(() => '')).slice(0, 300)}` };
  knownModel = model;
  return { answers: ((await r.json())?.answers ?? {}) as Record<string, unknown>, model };
}

/** Prahy z konceptu bezpečnosti — doladia sa na skutočných správach. */
export const THRESHOLDS = {
  confirm: 0.8, // závažnosť od tejto hodnoty: „Naozaj to chceš poslať?"
  hide: 1.8, // závažnosť od tejto hodnoty: nedoručiť + signál dôverníkovi
  personal: 0.85, // osobné údaje: „Naozaj chceš zdieľať tieto údaje?"
  secret: 0.5, // tlak na tajomstvo: vždy signál dôverníkovi
};

export const QUESTIONS = {
  osobne_udaje: {
    type: 'noul',
    instructions:
      'Obsahuje nová zpráva KONKRÉTNÍ osobní údaje, podle kterých by cizí člověk dítě našel nebo kontaktoval (celá adresa nebo ulice s číslem domu, telefonní číslo, e-mail, přesný název školy i se třídou, přesné místo a čas, kde dítě právě je nebo bude), nebo žádost o ně? Běžné věci jako „jsem ve škole“, „jdu domů“, „jsme venku“ nebo křestní jméno kamaráda osobní údaje NEJSOU.',
  },
  tlak_na_tajomstvo: {
    type: 'noul',
    instructions:
      'Snaží se pisatel přesvědčit příjemce, aby něco tajil před rodiči nebo jinými dospělými, přešel do jiné aplikace, poslal svou fotku nebo se sešel osobně?',
  },
  typ: {
    type: 'choice',
    instructions:
      'Jaký typ zprávy to je? Ber v úvahu předchozí zprávy a to, že si píšou děti kolem 11 let.',
    criteria: {
      v_poradku: 'Běžná, přátelská nebo neutrální zpráva',
      kamaradske_skadleni: 'Škádlení mezi kamarády, které obě strany berou s humorem',
      nadavka: 'Urážka nebo nadávka mířená na příjemce',
      zesmesnovani: 'Zesměšňování vzhledu, schopností, rodiny nebo něčeho, za co příjemce nemůže',
      vylucovani: 'Vylučování z party, hry nebo skupiny, případně navádění ostatních, aby se s příjemcem nebavili',
      vyhruzka: 'Vyhrožování ublížením, prozrazením něčeho nebo jiným trestem',
    },
  },
  zavaznost: {
    type: 'score',
    instructions: 'Jak moc může tahle zpráva ublížit dítěti, které ji dostane?',
    criteria: [
      'V pořádku: neutrální nebo zjevně kamarádské',
      'Nepříjemné: může zamrzet, ale není to útok',
      'Ubližující: urážka, zesměšnění nebo vyloučení',
      'Nebezpečné: výhrůžka, opakovaný útok nebo tlak na tajemství',
    ],
  },
} as const;

/** Čo vidí Liquid AI: len text. Žiadne mená, ID ani prezývky. */
export function buildState(message: string, previous: string[], friends: boolean): string {
  return JSON.stringify({
    zprava: message,
    predchozi: previous.slice(-3),
    vztah: friends ? 'overeny_kamarad' : 'neni_kamarad',
  });
}

export function buildRequest(state: string) {
  return { model: MODEL, state, questions: QUESTIONS };
}

/** Rozhodnutie podľa prahov. Čisto výpočet — dá sa otestovať bez siete. */
export function decide(a: Answers): { verdict: Verdict; reasons: Reason[]; secret: boolean } {
  const severity = a.zavaznost?.score ?? 0;
  const personal = a.osobne_udaje?.noul ?? 0;
  const secret = (a.tlak_na_tajomstvo?.noul ?? 0) > THRESHOLDS.secret;
  const reasons: Reason[] = [];
  if (severity >= THRESHOLDS.confirm) reasons.push('mean');
  if (personal > THRESHOLDS.personal) reasons.push('personal');
  const verdict: Verdict = severity >= THRESHOLDS.hide ? 'hide' : reasons.length ? 'confirm' : 'send';
  return { verdict, reasons, secret };
}

/** Na uloženie: len čísla, žiadny text. */
export function scoresOf(a: Answers) {
  return {
    zavaznost: a.zavaznost?.score ?? null,
    osobne_udaje: a.osobne_udaje?.noul ?? null,
    tlak_na_tajomstvo: a.tlak_na_tajomstvo?.noul ?? null,
    typ: a.typ?.choice ?? null,
  };
}

// ---------------------------------------------------------------------------
// Serverová časť (Deno). Pri testoch sa nespúšťa.
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

/** Klíče Supabase: starší (JWT) i nové (sb_publishable_… / sb_secret_…). */
export function supabaseKeys(env: Env, req: Request) {
  const pick = (json: string | undefined) => {
    try {
      const o = JSON.parse(json ?? '');
      return (o?.default ?? Object.values(o ?? {})[0]) as string | undefined;
    } catch {
      return undefined;
    }
  };
  const anon = req.headers.get('apikey') || env.get('SUPABASE_ANON_KEY') || pick(env.get('SUPABASE_PUBLISHABLE_KEYS'));
  const service = env.get('SUPABASE_SERVICE_ROLE_KEY') || pick(env.get('SUPABASE_SECRET_KEYS'));
  // Nový tajný klíč není JWT — posílá se jen jako apikey.
  const serviceHeaders: Record<string, string> = service
    ? service.startsWith('sb_')
      ? { apikey: service }
      : { apikey: service, Authorization: `Bearer ${service}` }
    : {};
  return { anon, service, serviceHeaders };
}

export async function handle(req: Request, env: Env, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Jen POST.' }, 405);

  const url = env.get('SUPABASE_URL');
  const { anon, service, serviceHeaders } = supabaseKeys(env, req);
  const liquidKey = env.get('LIQUID_API_KEY')?.trim().replace(/^bearer\s+/i, '').replace(/^["']+|["']+$/g, '').trim();
  if (!url || !anon || !service) return json({ error: 'Chybí nastavení Supabase.' }, 500);

  // 1. Kto píše — podľa jeho prihlásenia, nie podľa toho, čo pošle.
  const auth = req.headers.get('Authorization') ?? '';
  const who = await fetchFn(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
  if (!who.ok) return json({ error: 'Nejdřív se přihlas.' }, 401);
  const sender = (await who.json())?.id as string | undefined;
  if (!sender) return json({ error: 'Nejdřív se přihlas.' }, 401);

  let body: { conversation_id?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Špatný požadavek.' }, 400);
  }
  const content = (body.content ?? '').trim();
  const conversation = body.conversation_id ?? '';
  if (!content || content.length > 5000 || !/^[0-9a-f-]{36}$/i.test(conversation)) {
    return json({ error: 'Špatný požadavek.' }, 400);
  }

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const r = await fetchFn(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { ...serviceHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
    return r.json();
  };

  // 2. Kontext (a overenie, že v konverzácii naozaj sedí).
  const ctx = await rpc('guard_prepare', { _sender: sender, _conversation: conversation });
  if (ctx?.error) return json({ error: ctx.error }, 403);

  // 3. Liquid AI. Pri výpadku správa prejde ako neskontrolovaná.
  let decision: ReturnType<typeof decide> = { verdict: 'unchecked', reasons: [], secret: false };
  let scores: Record<string, unknown> = {};
  if (liquidKey) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await askLiquid(
        fetchFn,
        liquidKey,
        env.get('LIQUID_MODEL'),
        { state: buildState(content, ctx.previous ?? [], !!ctx.friends), questions: QUESTIONS },
        ctrl.signal
      );
      clearTimeout(timer);
      if ('answers' in res) {
        const answers = res.answers as Answers;
        decision = decide(answers);
        scores = scoresOf(answers);
      } else {
        scores = { error: `liquid ${res.status}` };
        console.error('[message-guard] Liquid AI', res.error);
      }
    } catch (e) {
      scores = { error: `liquid ${(e as Error).name}` };
    }
  } else {
    scores = { error: 'chybí LIQUID_API_KEY' };
  }

  // 4. Lístok + signály dôverníkovi príjemcu.
  await rpc('guard_record', {
    _sender: sender,
    _conversation: conversation,
    _content: content,
    _verdict: decision.verdict,
    _scores: scores,
    _secret: decision.secret,
  });

  return json({ verdict: decision.verdict, reasons: decision.reasons });
}

const deno = (globalThis as unknown as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void; env: Env } }).Deno;
if (deno) {
  deno.serve((req) =>
    handle(req, deno.env).catch((e) => {
      console.error('[message-guard]', e);
      return json({ error: 'Strážce zpráv má problém. Zkus to za chvíli.' }, 500);
    })
  );
}

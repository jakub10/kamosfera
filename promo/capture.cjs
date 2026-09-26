// Spustí Kamosféru s vymyslenými demo dátami a nafotí obrazovky do promo/shots/.
// Supabase sa nevolá vôbec: všetky požiadavky na demo.supabase.co odchytí
// Playwright a odpovie dátami nižšie. Mená, príspevky a správy sú vymyslené.
//
// Usage: (v inom termináli) VITE_SUPABASE_URL=https://demo.supabase.co \
//          VITE_SUPABASE_PUBLISHABLE_KEY=demo npm run dev
//        node promo/capture.cjs [http://localhost:8080]
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:8080';
const ASSETS = path.join(__dirname, '..', 'src', 'assets');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const now = Date.now();
const ago = min => new Date(now - min * 60000).toISOString();
const later = min => new Date(now + min * 60000).toISOString();
const img = f => `https://img.demo/${f}`;

// Avatary: emoji na farebnom prechode (žiadne fotky skutočných detí).
const AV = {
  me: ['🦊', '#f97316', '#ec4899'], ema: ['🦄', '#a855f7', '#ec4899'], jakub: ['🐯', '#f59e0b', '#ef4444'],
  sofia: ['🐼', '#06b6d4', '#3b82f6'], lukas: ['🐸', '#22c55e', '#06b6d4'], nela: ['🐙', '#ec4899', '#8b5cf6'],
  filip: ['🦁', '#eab308', '#f97316'], mia: ['🐱', '#3b82f6', '#a855f7'],
};
const avatarSvg = ([e, a, b]) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="68" font-size="54" text-anchor="middle">${e}</text></svg>`;

const U = id => `00000000-0000-4000-8000-00000000000${id}`;
const people = [
  ['me', 1, 'Tomáš Novák', 'tomi'], ['ema', 2, 'Ema Kováčová', 'ema_k'], ['jakub', 3, 'Jakub Horváth', 'kubo'],
  ['sofia', 4, 'Sofia Varga', 'sofi'], ['lukas', 5, 'Lukáš Baláž', 'luky'], ['nela', 6, 'Nela Tóthová', 'nelka'],
  ['filip', 7, 'Filip Molnár', 'fifo'], ['mia', 8, 'Mia Szabó', 'mia'],
];
const P = {};
const profiles = people.map(([k, n, full_name, username]) => {
  P[k] = U(n);
  return {
    id: U(n), user_id: U(n), full_name, username, avatar_url: img(`av/${k}.svg`), avatar_config: null,
    bio: k === 'me' ? 'Futbal ⚽ | Minecraft 🧱 | 4.B' : 'Kamoš zo 4.B', location: 'Bratislava', website: null,
    online_at: ago(n), created_at: ago(90000), updated_at: ago(10),
  };
});
const ME = P.me;

const posts = [
  { id: 'p1', user_id: P.ema, content: 'VYHRALI SME turnaj! ⚽🏆 Ďakujem celej 4.B za povzbudzovanie, boli ste najlepší fanúšikovia!', image_url: img('mascot-trophy.png'), background_style: null, created_at: ago(14) },
  { id: 'p2', user_id: P.jakub, content: 'Kto ide dnes po škole brániť Pevnosť? 🏰 Mám nový rekord 1 240 bodov 🔥', image_url: null, background_style: 'gradient-galaxy', created_at: ago(38) },
  { id: 'p3', user_id: P.sofia, content: 'Namaľovala som nášho robota Kamoša 🎨✨ Páči sa vám?', image_url: img('mascot-paint.png'), background_style: null, created_at: ago(95) },
  { id: 'p4', user_id: P.lukas, content: 'Konečne víkend!!! 🌞🚲', image_url: null, background_style: 'gradient-sunset', created_at: ago(180) },
  { id: 'p5', user_id: P.nela, content: 'Dnes som dočítala celú knihu o vesmíre 📚🚀', image_url: img('mascot-reading.png'), background_style: null, created_at: ago(300) },
].map(p => ({ ...p, updated_at: p.created_at }));

const kinds = ['with_you', 'super', 'laugh', 'rooting', 'curious'];
const likes = [];
posts.forEach((p, i) => people.slice(1, 8 - (i % 3)).forEach(([k], j) =>
  likes.push({ id: `l${i}${j}`, post_id: p.id, user_id: P[k], kind: kinds[(i + j) % (i === 0 ? 2 : 5)], created_at: ago(5) })));
const comments = [
  ['p1', 'jakub', 'Gratulujem!!! 🎉'], ['p1', 'sofia', 'Ste boss 💪'], ['p1', 'filip', 'Ten posledný gól 😱'],
  ['p2', 'me', 'Idem! Beriem aj Filipa'], ['p2', 'lukas', 'Ja tiež 🏰'], ['p3', 'mia', 'Ten je super roztomilý 😍'],
  ['p3', 'ema', 'Wow, ty vieš kresliť!'], ['p5', 'jakub', 'Ktorú? Požičiaš?'],
].map(([post_id, k, content], i) => ({ id: `c${i}`, post_id, user_id: P[k], content, created_at: ago(10 - i) }));

const stories = [
  ['ema', 'mascot-celebrate.png'], ['jakub', 'mascot-gaming.png'], ['sofia', 'mascot-camera.png'],
  ['lukas', 'mascot-friends.png'], ['nela', 'mascot-thumbsup.png'], ['mia', 'mascot-wave.png'],
].map(([k, f], i) => ({ id: `s${i}`, user_id: P[k], image_url: img(f), created_at: ago(20 + i * 30), expires_at: later(600) }));

const friendships = people.slice(1).map(([k], i) => ({
  id: `f${i}`, requester_id: ME, addressee_id: P[k], status: 'accepted', created_at: ago(5000),
}));

const conversations = ['ema', 'jakub', 'sofia', 'filip', 'mia'].map((k, i) => ({
  id: `cv${i}`, participant_1: ME, participant_2: P[k], initiator_id: ME, status: 'accepted',
  created_at: ago(9000), updated_at: ago(2 + i * 17),
}));
const chat = [
  ['cv0', 'ema', 'Ahoj Tomi! Videl si ten gól? 😂', 9],
  ['cv0', 'me', 'Jasné! Bol to najlepší zápas ever ⚽', 8],
  ['cv0', 'ema', 'Zajtra ideme osláviť na zmrzku 🍦 Ideš?', 6],
  ['cv0', 'me', 'Idem! Beriem aj Jakuba 🙌', 5],
  ['cv0', 'ema', 'Super, o 3 pred školou 😊', 2],
  ['cv1', 'jakub', 'Pevnosť o 5? 🏰', 19],
  ['cv2', 'sofia', 'Pošli mi tú úlohu z matiky pls 🙏', 36],
  ['cv3', 'filip', 'Haha 😂😂', 55],
  ['cv4', 'mia', 'Dobrú noc! 🌙', 70],
];
const messages = chat.map(([conversation_id, k, content, m], i) => ({
  id: `m${i}`, conversation_id, sender_id: P[k], content, created_at: ago(m), read: k === 'me' || m > 5,
}));

const groups = [
  ['4.B trieda 🏫', 'Naša trieda — úlohy, výlety a zábava', 'mascot-friends.png'],
  ['Futbalisti ⚽', 'Tréningy a zápasy', 'mascot-trophy.png'],
  ['Malíri 🎨', 'Ukážte, čo ste nakreslili', 'mascot-paint.png'],
  ['Staviteľa Pevnosti 🏰', 'Stratégia a nové rekordy', 'mascot-gaming.png'],
].map(([name, description, a], i) => ({
  id: `g${i}`, name, description, avatar_url: img(a), is_private: false, owner_id: P.ema,
  created_at: ago(20000), updated_at: ago(30),
}));
const group_members = [];
groups.forEach((g, i) => people.slice(0, 8 - i).forEach(([k], j) =>
  group_members.push({ id: `gm${i}${j}`, group_id: g.id, user_id: P[k], role: j === 1 ? 'admin' : 'member', joined_at: ago(9000) })));

const notifications = [
  ['like', 'ema', 'p1'], ['comment', 'jakub', 'p2'], ['friend_request', 'mia', null], ['like', 'sofia', 'p3'],
].map(([type, k, post_id], i) => ({
  id: `n${i}`, user_id: ME, from_user_id: P[k], type, post_id, message: null, read: i > 1, created_at: ago(3 + i * 20),
}));

const T = {
  profiles, posts, likes, comments, stories, friendships, conversations, messages, groups, group_members, notifications,
  user_stats: [{ user_id: ME, posts_count: 24, likes_given: 180, likes_received: 312, comments_count: 57, friends_count: 7, messages_sent: 640, total_points: 1240, updated_at: ago(1) }],
  user_game_stats: people.map(([k], i) => ({ user_id: P[k], snake_best: 80 - i * 7, clicker_best: 900 - i * 60, memory_best: 12 + i, tower_defense_best: 1240 - i * 110, updated_at: ago(60) })),
  user_presence: people.map(([k], i) => ({ user_id: P[k], online_at: i % 2 ? ago(1) : null, typing_in: null })),
  user_roles: [], banned_users: [], user_blocks: [], saved_posts: [], story_views: [], user_achievements: [],
  achievements: [], user_unlocked_items: [], avatars: [], group_messages: [], fortresses: [], fortress_raids: [], activation_codes: [],
};

// Minimum z PostgREST: eq / neq / in / is / gt / lt / order / limit a hlavička pre .single().
function query(table, url, headers) {
  let rows = [...(T[table] || [])];
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'or', 'and'].includes(k)) continue;
    const [op, ...rest] = v.split('.');
    const val = rest.join('.');
    const neg = op === 'not';
    const test = (() => {
      if (op === 'eq') return r => String(r[k]) === val;
      if (op === 'neq') return r => String(r[k]) !== val;
      if (op === 'in') { const set = val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/"/g, '')); return r => set.includes(String(r[k])); }
      if (op === 'is') return r => (val === 'null' ? r[k] == null : String(r[k]) === val);
      return null;
    })();
    if (test && !neg) rows = rows.filter(test);
  }
  const order = url.searchParams.get('order');
  if (order) {
    const [col, dir] = order.split(',')[0].split('.');
    rows.sort((a, b) => (a[col] > b[col] ? 1 : -1) * (dir === 'desc' ? -1 : 1));
  }
  const limit = +url.searchParams.get('limit');
  const total = rows.length;
  if (limit) rows = rows.slice(0, limit);
  const single = (headers.accept || '').includes('vnd.pgrst.object');
  return { body: single ? rows[0] ?? null : rows, total, missing: single && !rows.length };
}

const RPC = {
  post_reactions: ({ _post_id }) => likes.filter(l => l.post_id === _post_id).map(l => {
    const p = profiles.find(x => x.user_id === l.user_id);
    return { kind: l.kind, user_id: l.user_id, full_name: p.full_name, avatar_url: p.avatar_url };
  }),
  are_friends: () => true,
  world_seed: () => 42,
  fortress_leaderboard: () => profiles.slice(0, 6).map((p, i) => ({ user_id: p.user_id, full_name: p.full_name, username: p.username, avatar_url: p.avatar_url, score: 1240 - i * 110, trophies: 1240 - i * 110, level: 9 - i })),
  hh_my_rooms: () => [],
};

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: 'tomi@kamosfera.demo', user_metadata: { full_name: 'Tomáš Novák' }, app_metadata: { provider: 'email' }, created_at: ago(90000) };
const exp = Math.floor(now / 1000) + 86400;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, exp, role: 'authenticated', aud: 'authenticated' })}.sig`;
const session = { access_token: jwt, refresh_token: 'demo', expires_in: 86400, expires_at: exp, token_type: 'bearer', user };

async function mock(context) {
  await context.route('https://img.demo/**', route => {
    const f = new URL(route.request().url()).pathname.slice(1);
    if (f.startsWith('av/')) return route.fulfill({ contentType: 'image/svg+xml', body: avatarSvg(AV[path.basename(f, '.svg')]) });
    return route.fulfill({ path: path.join(ASSETS, f) });
  });
  await context.route('https://demo.supabase.co/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200, extra = {}) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...extra }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const p = url.pathname;
    if (p.startsWith('/auth/v1/user')) return json(user);
    if (p.startsWith('/auth/v1/')) return json(session);
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop();
      let args = {};
      try { args = JSON.parse(req.postData() || '{}'); } catch {}
      return json(RPC[fn] ? RPC[fn](args) : null);
    }
    if (p.startsWith('/rest/v1/')) {
      if (req.method() !== 'GET' && req.method() !== 'HEAD') return json([], 201);
      const { body, total, missing } = query(p.split('/')[3], url, req.headers());
      if (missing) return json({ code: 'PGRST116', message: 'no rows' }, 406);
      return json(body, 200, { 'content-range': `0-${Math.max(total - 1, 0)}/${total}` });
    }
    return json({});
  });
}

async function shoot(context, name, route, { wait = 2500, action, fullPage = false } = {}) {
  const page = await context.newPage();
  await page.goto(BASE + route);
  await page.waitForTimeout(wait);
  if (action) await action(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  console.log('📸', name);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    locale: 'sk-SK', colorScheme: process.env.SCHEME || 'light',
  });
  await context.addInitScript(s => {
    localStorage.setItem('sb-demo-auth-token', s);
    localStorage.setItem('i18nextLng', 'sk');
    localStorage.setItem('language', 'sk');
  }, JSON.stringify(session));
  await mock(context);

  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const list = [
    ['feed', '/'],
    // Bez pevných líšt: v promo videu sa obsah posúva pod lištami z feed.png.
    ['feed-full', '/', { fullPage: true, action: p => p.evaluate(() => document.querySelectorAll('body *').forEach(el => {
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') el.style.visibility = 'hidden';
    })) }],
    ['feed2', '/', { action: p => p.mouse.wheel(0, 700).then(() => p.waitForTimeout(800)) }],
    ['messages', '/messages', { action: async p => { await p.getByText('Ema Kováčová').first().click().catch(() => {}); await p.waitForTimeout(1200); } }],
    ['messages-list', '/messages'],
    ['groups', '/groups'],
    ['games', '/games'],
    ['pevnost', '/pevnost', { wait: 4000 }],
    ['hliadka', '/hliadka'],
    ['profile', '/profile'],
    ['notifications', '/notifications'],
    ['svet', '/svet', { wait: 4000 }],
    ['story', '/', { action: async p => { await p.getByText('ema_k').first().click(); await p.waitForTimeout(700); } }],
  ];
  for (const [name, route, opts] of list) if (!only || only.includes(name)) await shoot(context, name, route, opts);
  await browser.close();
})();

// Локальная проверка НАСТОЯЩЕГО режима рулетки (не демо) без Supabase: supabase/roulette.sql в PGlite + 4 робота-игрока.
// Боты живут только здесь, на сервер не попадают (владелец 20.11: ботов на сервере нет).
// Запуск:  node tools/rr/fake-server.mjs <папка, где node_modules с @electric-sql/pglite> [порт=5201]
// В браузере (http://localhost:5200, консоль) — подменить связь сайта на этот сервер:
//   fetch('http://localhost:5201/hook.js').then(r => r.text()).then(eval)
//   потом: быстрая игра — RRT.quick();  комната друзей — на #/krot «Создать комнату», затем RRT.friends() (роботы войдут по коду и нажмут «Готов»)
// Роботы: на поиск выходят сами, «Принять» — через 1–3 с, в свой ход думают 2–5 с, иногда крутят барабан.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const nm = process.argv[2] || process.env.PGLITE_DIR || '.';
const PORT = +(process.argv[3] || 5201);
const { PGlite } = await import(pathToFileURL(path.join(nm, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.profiles (id uuid primary key, name text, ava text, pid bigint);
  create table public.site_cfg (k text primary key, v jsonb);`);
await db.exec(readFileSync(path.join(here, '../../supabase/roulette.sql'), 'utf8'));
const NAMES = ['Вы (тест)', 'Viper', 'Сова', 'Grizzly', 'Lynx'];
const U = NAMES.map((n, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`);
for (let i = 0; i < U.length; i++) await db.query(`insert into public.profiles (id, name, pid) values ($1, $2, $3)`, [U[i], NAMES[i], 100100 + i]);

let chain = Promise.resolve();   // одно соединение: uid и запрос — строго парой
const rpc = (uid, fn, args = {}) => {
  const run = async () => {
    await db.query(`select set_config('test.uid', $1, false)`, [uid]);
    const k = Object.keys(args);
    const r = await db.query(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) as r`, k.map(x => args[x]));
    return r.rows[0].r;
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
};
const calls = {};
const srv = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'content-type, x-uid');
  if (req.method === 'OPTIONS') return res.end();
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/hook.js') { res.setHeader('content-type', 'text/javascript; charset=utf-8'); return res.end(HOOK); }
  if (u.pathname === '/stats') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(calls)); }
  if (u.pathname === '/bots/join') { mode = 'private'; code = u.searchParams.get('code'); return res.end('ok'); }
  if (u.pathname === '/bots/quick') { mode = 'quick'; return res.end('ok'); }
  if (u.pathname === '/bots/party') { mode = 'party'; code = u.searchParams.get('code'); return res.end('ok'); }
  const m = /^\/rpc\/([a-z_]+)$/.exec(u.pathname);
  if (!m) { res.statusCode = 404; return res.end(); }
  let body = ''; for await (const ch of req) body += ch;
  calls[m[1]] = (calls[m[1]] || 0) + 1;
  try { const d = await rpc(req.headers['x-uid'] || U[0], m[1], body ? JSON.parse(body) : {}); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); }
  catch (e) { res.statusCode = 400; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ message: e.message })); }
});
srv.listen(PORT, () => console.log(`rr fake server: http://localhost:${PORT}  (hook.js, /stats)`));

// ---------- роботы ----------
let mode = 'quick', code = '';
const rnd = n => Math.floor(Math.random() * n);
const bot = U.slice(1).map((uid, i) => ({ uid, i, room: 0, acceptAt: 0, loaded: 0, actAt: 0, n: -1, spun: 0, joined: '' }));
async function botStep(b) {
  try {
    if (mode === 'private') {
      if (code && b.joined !== code) { const s = await rpc(b.uid, 'rr_join', { p_code: code }); b.room = s.room.id; b.joined = code; await rpc(b.uid, 'rr_ready', { p_room: b.room, p_ready: true }); }
    } else {
      if (mode === 'party' && code && b.joined !== code) { await rpc(b.uid, 'rr_party_join', { p_code: code }); b.joined = code; }   // лобби друзей: поиск запускает лидер
      const m = await rpc(b.uid, 'rr_mm_state');
      if (mode === 'quick' && (!m.party || m.party.state === 'idle')) { if (!m.game) await rpc(b.uid, 'rr_search', { p_on: true }); }
      if (m.match && !m.match.me_ready) { if (!b.acceptAt) b.acceptAt = Date.now() + 1000 + rnd(2000); if (Date.now() >= b.acceptAt) { await rpc(b.uid, 'rr_accept'); b.acceptAt = 0; } }
      if (m.game) b.room = m.game;
    }
    if (!b.room) return;
    const s = await rpc(b.uid, 'rr_state', { p_room: b.room, p_after: 1e12 });
    if (s.room.mm && s.room.phase === 'lobby' && s.room.load_at && b.loaded !== b.room) { await rpc(b.uid, 'rr_loaded', { p_room: b.room }); b.loaded = b.room; }
    if (s.room.phase === 'done') { if (mode === 'quick') b.room = 0; return; }
    const g = s.game, me = s.players.find(p => p.me);
    if (!g || s.room.phase !== 'play' || g.turn !== me.seat || !me.alive) return;
    if (b.n !== g.n) { b.n = g.n; b.spun = 0; b.actAt = Math.max(Date.now(), s.room.phase_at - s.now + Date.now()) + 2000 + rnd(3000); }
    if (Date.now() < b.actAt) return;
    const risky = g.clicks > 0;
    if (b.spun < 2 && Math.random() < (risky ? .6 : .25)) { await rpc(b.uid, 'rr_spin', { p_room: b.room, p_turn: g.n }); b.spun++; b.actAt = Date.now() + 1400 + rnd(900); return; }
    await rpc(b.uid, 'rr_shoot', { p_room: b.room, p_turn: g.n });
  } catch (e) { if (!/not your turn|too fast|match pending|party busy/.test(e.message)) console.log(`бот ${b.i + 1}: ${e.message}`); }
}
setInterval(() => bot.forEach(botStep), 700);

// ---------- подмена связи на странице (выполняется в консоли сайта) ----------
const HOOK = `(() => {
  const URL0 = 'http://localhost:${PORT}', UID = '${U[0]}';
  const fake = {
    rpc: async (n, a) => { const r = await fetch(URL0 + '/rpc/' + n, { method: 'POST', headers: { 'content-type': 'application/json', 'x-uid': UID }, body: JSON.stringify(a || {}) });
      const j = await r.json(); return r.ok ? { data: j, error: null } : { data: null, error: { message: j.message } }; },
    channel: () => { const ch = { on() { return ch; }, subscribe(cb) { setTimeout(() => cb && cb('CHANNEL_ERROR'), 20); return ch; }, send() {} }; return ch; },
    removeChannel() {}, auth: { getSession: async () => ({ data: { session: null } }) }, realtime: {} };
  const user = () => ({ sb: true, name: '${NAMES[0]}' });
  const wrap = dep => Object.assign({}, dep || {}, { sb: fake, user });
  const K = window.KROT; if (!K) throw new Error('KROT не загружен: откройте #/krot');
  if (!K._rrHook) { const m0 = K.mount, i0 = K.mmInit; K.mount = (el, arg, dep) => m0(el, arg, wrap(dep)); K.mmInit = dep => i0(wrap(dep)); K._rrHook = true; }
  window.RRT = {
    quick: () => { fetch(URL0 + '/bots/quick'); K.mmInit({}); K.mmPlay(); return 'поиск начат'; },
    // комната друзей: сначала на #/krot нажать «Создать комнату», потом RRT.friends() — роботы войдут по коду и нажмут «Готов»
    friends: async () => { const s = K.dbg.state(); if (!s || !s.room) return 'сначала создайте комнату'; await fetch(URL0 + '/bots/join?code=' + s.room.code); return 'роботы идут в ' + s.room.code; },
    // лобби друзей: «Создать лобби» на сайте, потом RRT.lobby() — роботы войдут по коду лобби; «Найти игру» — стол только из своих, без очков
    lobby: async () => { const m = K.dbg.mm(); if (!m || !m.party) return 'сначала создайте лобби'; await fetch(URL0 + '/bots/party?code=' + m.party.code); return 'роботы идут в лобби ' + m.party.code; },
    stats: () => fetch(URL0 + '/stats').then(r => r.json()) };
  return 'связь подменена на ' + URL0;
})()`;

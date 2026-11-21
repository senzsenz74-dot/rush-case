// Проверка supabase/roulette.sql на PGlite (Postgres в Node, без Supabase): полные партии, таймауты, выход, подбор, честность.
// Запуск:  1) в любой папке: npm i @electric-sql/pglite
//          2) node tools/rr/test-server.mjs <папка, где node_modules>   (или переменная PGLITE_DIR)
// Заглушки Supabase: схема auth с auth.uid() из настройки test.uid, profiles, site_cfg, роли anon/authenticated.
// Время: _rr_now() подменяется — к часам добавляется сдвиг из таблицы t_clock (так «проматываем» 20 с хода, 5 с паузы и т. д.).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

process.on('unhandledRejection', e => { console.log('ОШИБКА: ' + (e && e.message) + (e && e.where ? '\n  где: ' + e.where : '') + (e && e.stack ? '\n' + e.stack.split('\n').filter(l => l.includes('test-server')).slice(0, 3).join('\n') : '')); process.exit(2); });
const here = path.dirname(fileURLToPath(import.meta.url));
const nm = process.argv[2] || process.env.PGLITE_DIR || '.';
const { PGlite } = await import(pathToFileURL(path.join(nm, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();

let fails = 0, checks = 0;
const ok = (cond, msg, extra) => { checks++; if (!cond) { fails++; console.log('  ✗ ' + msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } };
const log = m => console.log(m);

// ---------- заглушки Supabase ----------
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.profiles (id uuid primary key, name text, ava text, pid bigint, data jsonb not null default '{"balance": 1000}'::jsonb);
  create table public.site_cfg (k text primary key, v jsonb);
  create table public.t_clock (shift interval not null);
  insert into public.t_clock values (interval '0');
`);
try { await db.exec(`create publication supabase_realtime`); } catch (e) { log('  (публикация Realtime в PGlite не создана — не важно)'); }
const sql = readFileSync(path.join(here, '../../supabase/roulette.sql'), 'utf8');
const res = await db.exec(sql);
const self = res[res.length - 1].rows[0];
const st0 = Object.values(self)[0];
ok(st0 && st0.ok === true, 'самопроверка rr_selftest при запуске файла', st0);
log('rr_selftest: ' + JSON.stringify(st0));
// повторный запуск безопасен
await db.exec(sql);
ok(true, 'повторный запуск файла');
await db.exec(`create or replace function public._rr_now() returns timestamptz language sql volatile as $$
  select clock_timestamp() + (select shift from public.t_clock limit 1) $$;`);

const U = [];
for (let i = 1; i <= 12; i++) {
  const id = `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
  U.push(id);
  await db.query(`insert into public.profiles (id, name, pid) values ($1, $2, $3)`, [id, 'Игрок' + i, 100000 + i]);
}
const as = async (u, q, args) => {
  await db.query(`select set_config('test.uid', $1, false)`, [u || '']);
  const r = await db.query(q, args || []);
  return r.rows[0] ? Object.values(r.rows[0])[0] : null;
};
const rpc = (u, fn, args = {}) => {
  const keys = Object.keys(args);
  return as(u, `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map(k => args[k]));
};
const err = async (p) => { try { await p; return null; } catch (e) { return e.message; } };
const shift = s => db.query(`update public.t_clock set shift = shift + make_interval(secs => $1)`, [s]);

// ---------- честность: пересчёт как у игрока (только по открытым данным) ----------
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');
const h = (seed, tag) => parseInt(sha(seed + ':' + tag).slice(0, 8), 16);
const chambers = (seed, b) => [0, 1, 2, 3, 4, 5].sort((a, c) => h(seed, 'c' + a) - h(seed, 'c' + c) || a - c).slice(0, b).sort((a, c) => a - c);
async function verifyGame(room) {
  const g = (await db.query(`select * from public.rr_games where room_id = $1`, [room])).rows[0];
  const lg = (await db.query(`select kind, data from public.rr_log where game_id = $1 and kind in ('round', 'spin', 'click', 'bang', 'vote_end') order by id`, [g.id])).rows;
  ok(g.rounds.length === 4, 'раскрыто 4 раунда', g.rounds.length);
  let carried = 0;   // купленные патроны переходят в следующие раунды
  for (const r of g.rounds) {
    ok(sha(r.proof) === r.commit, `раунд ${r.round}: sha256(proof) = commit`);
    ok(r.proof === `RUSHRR|${g.id}|${r.round}|${r.seats.join(',')}|${r.bullets}|${r.seed}`, `раунд ${r.round}: формат proof`);
    ok(JSON.stringify(chambers(r.seed, r.bullets + (r.added || 0))) === JSON.stringify(r.chambers), `раунд ${r.round}: патроны пересчитываются из seed (+ голосования)`, [chambers(r.seed, r.bullets + (r.added || 0)), r.chambers]);
    ok(r.first === r.seats[h(r.seed, 'f') % r.seats.length], `раунд ${r.round}: первый стрелок из seed`);
    ok(r.bullets === Math.min(4, 1 + carried), `раунд ${r.round}: в начале 1 + купленные раньше (${carried}) = ${r.bullets}`); carried += r.added || 0;
    // проигрываем журнал раунда: каждое гнездо выстрела совпадает с пересчётом
    let pos = null, round = null, seen = 0, prevSeat = null, cur = r.bullets;   // cur — патронов сейчас (голосование добавляет следующий по порядку из seed)
    for (const e of lg) {
      const d = e.data;
      if (e.kind === 'round') { round = d.round; if (round === r.round) { pos = h(r.seed, 'p0') % 6; ok(d.commit === r.commit, `раунд ${r.round}: commit в журнале с начала раунда`); } continue; }
      if (d.round !== r.round) continue;
      if (e.kind === 'spin') { pos = h(r.seed, 'p' + d.k) % 6; continue; }
      if (e.kind === 'vote_end') { if (d.ok) cur = d.bullets; continue; }
      seen++;
      ok(d.pos === pos, `раунд ${r.round}: гнездо выстрела №${seen} пересчитано`, [d.pos, pos]);
      const live = chambers(r.seed, cur).includes(pos);
      ok(live === (e.kind === 'bang'), `раунд ${r.round}: ${e.kind} совпадает с патронами`);
      if (prevSeat == null) ok(d.seat === r.first, `раунд ${r.round}: первым стрелял первый стрелок`);
      else ok(d.seat === r.seats[(r.seats.indexOf(prevSeat) + 1) % r.seats.length], `раунд ${r.round}: ход по кругу`, [prevSeat, d.seat, r.seats]);
      prevSeat = d.seat;
      pos = (pos + 1) % 6;
    }
    ok(seen > 0, `раунд ${r.round}: в журнале есть выстрелы`);
  }
}

// ---------- игра: каждый ходящий иногда крутит, потом стреляет ----------
async function play(room, players, opt = {}) {
  let guard = 0, last = null, order = [];
  while (guard++ < 300) {
    const s = await rpc(players[0], 'rr_state', { p_room: room, p_after: 0 });
    last = s;
    if (s.room.phase === 'done') break;
    if (s.room.phase === 'next') { await shift(5.1); continue; }
    if (s.room.phase !== 'play') { await shift(1); continue; }
    const g = s.game, tp = s.players.find(p => p.seat === g.turn), u = players[g.turn - 1] || null;
    ok(tp && tp.alive, 'ход у живого игрока');
    order.push([g.round, g.turn]);
    const who = await seatUid(room, g.turn);
    if (opt.idle) { await shift(20.1); continue; }   // никто не жмёт — выстрел сам по таймеру
    if (Math.random() < .4) {
      ok(await rpc(who, 'rr_spin', { p_room: room, p_turn: g.n }).then(r => r.ok), 'прокрутка');
      ok(/too fast/.test(await err(rpc(who, 'rr_spin', { p_room: room, p_turn: g.n }))), 'вторая прокрутка сразу — too fast');
      await shift(0.9);
    }
    const r = await rpc(who, 'rr_shoot', { p_room: room, p_turn: g.n });
    ok(r && r.ok, 'выстрел');
    ok(/not your turn/.test(await err(rpc(who, 'rr_shoot', { p_room: room, p_turn: g.n }))), 'повтор того же нажатия отклонён');
  }
  return { s: last, order };
}
const bal = async u => +(await db.query(`select data->>'balance' b from public.profiles where id = $1`, [u])).rows[0].b;
// выстрел без смерти: крутим (по честным правилам), пока напротив ствола пусто
async function safeShootIn(room) {
  for (let i = 0; i < 12; i++) {
    const g = (await db.query(`select turn, n, pos, chambers from public.rr_games where room_id = $1`, [room])).rows[0];
    const who = (await db.query(`select uid from public.rr_players where room_id = $1 and seat = $2`, [room, g.turn])).rows[0].uid;
    if (!g.chambers.includes(g.pos)) { await rpc(who, 'rr_shoot', { p_room: room, p_turn: g.n }); return g.turn; }
    await rpc(who, 'rr_spin', { p_room: room, p_turn: g.n }); await shift(0.9);
  }
  throw new Error('не нашлось пустого гнезда');
}
const seatUid = async (room, seat) => (await db.query(`select uid from public.rr_players where room_id = $1 and seat = $2`, [room, seat])).rows[0].uid;

function checkFinal(s, points) {
  const pl = s.players;
  ok(s.room.phase === 'done', 'игра окончена');
  ok(JSON.stringify(pl.map(p => p.place).sort()) === '[1,2,3,4,5]', 'места 1–5 без повторов', pl.map(p => p.place));
  ok(pl.filter(p => p.alive).length === 1 && pl.find(p => p.alive).place === 1, 'жив один — первое место');
  ok(s.room.points === points, 'очки ' + (points ? 'есть' : 'нет'));
  for (const p of pl) ok(points && !p.bot ? p.pts === ({ 1: 10, 2: 6, 3: 3, 4: 1, 5: 0 })[p.place] : p.pts === null, `очки места ${p.place}${p.bot ? ' (бот — без очков)' : ''}`, p.pts);
  const evs = s.game.evs;
  ok(evs.length > 0 && evs.length <= 12 && s.game.ev && s.game.ev.n === evs[evs.length - 1].n, 'события: последние ≤ 12, ev = последнее');
  const keys = ['seat', 'name', 'me', 'ready', 'online', 'left', 'loaded', 'alive', 'place', 'pts', 'clicks', 'spins'];
  ok(keys.every(k => k in pl[0]), 'поля игрока как в демо');
  ok(['id', 'round', 'bullets', 'turn', 'first', 'clicks', 'spins', 'n', 'evs', 'ev'].every(k => k in s.game), 'поля game как в демо');
  ok(['id', 'code', 'kind', 'points', 'phase', 'rev', 'phase_at', 'deadline', 'paused', 'owner', 'turn_sec'].every(k => k in s.room), 'поля room как в демо');
}

// ============ A. Подбор: группы 2 + 1 + 2 → стол из 5, «Принять», загрузка, игра, очки ============
log('A. подбор групп 2+1+2, полная игра с прокрутками');
{
  const [a, b, c, d, e] = U;
  let m = await rpc(a, 'rr_party_open');
  const code = m.party.code;
  m = await rpc(b, 'rr_party_join', { p_code: code });
  ok(m.party.members.length === 2, 'в группе двое');
  m = await rpc(d, 'rr_party_open');
  await rpc(e, 'rr_party_join', { p_code: m.party.code });
  ok(/not leader/.test(await err(rpc(b, 'rr_search', { p_on: true }))), 'поиск запускает только лидер');
  m = await rpc(a, 'rr_search', { p_on: true });
  ok(m.party.state === 'search', 'группа A в поиске');
  await shift(1); await rpc(c, 'rr_search', { p_on: true });
  await shift(1); m = await rpc(d, 'rr_search', { p_on: true });
  ok(m.party.state === 'match' && m.match && m.match.players.length === 5, 'найдено: стол из 5', m);
  const room = m.match.room;
  for (const u of [a, b, c, d, e]) await rpc(u, 'rr_accept');
  m = await rpc(a, 'rr_mm_state');
  ok(m.game === room, 'все приняли — экран загрузки (game)', m);
  let s = await rpc(a, 'rr_state', { p_room: room });
  ok(s.room.phase === 'lobby' && s.room.load_at, 'фаза lobby + load_at');
  ok(s.room.points === true, 'в лобби видно: игра на очки');
  for (const u of [a, b, c, d, e]) await rpc(u, 'rr_loaded', { p_room: room });
  await shift(10.1);
  s = await rpc(a, 'rr_state', { p_room: room });
  ok(s.room.phase === 'next' && s.game && s.game.round === 0 && s.game.ev === null && s.game.turn === null, 'после загрузки — знакомство (next, раунд 0, без событий)', s.game);
  ok(s.room.deadline - s.room.phase_at === 15000, 'знакомство 15 с', s.room.deadline - s.room.phase_at);
  ok(s.room.money === true && s.room.bank === 500 && s.players.every(p => p.bet === 100), 'игра на деньги: у всех по 100, банк 500', [s.room.money, s.room.bank]);
  ok(await bal(a) === 900 && s.me.bal === 900, 'минимальная ставка 100 списана', await bal(a));
  ok(/bad bet/.test(await err(rpc(a, 'rr_bet', { p_room: room, p_amount: 50 }))), 'ставка меньше 100 — нельзя');
  ok(/low balance/.test(await err(rpc(a, 'rr_bet', { p_room: room, p_amount: 5000 }))), 'ставка больше баланса — нельзя');
  let rb = await rpc(a, 'rr_bet', { p_room: room, p_amount: 400 });
  ok(rb.ok && +rb.data.balance === 600, 'ставка 400: баланс 600', rb);
  rb = await rpc(a, 'rr_bet', { p_room: room, p_amount: 300 });
  ok(+rb.data.balance === 700, 'ставку можно уменьшить: 300 → баланс 700', rb);
  await rpc(b, 'rr_bet', { p_room: room, p_amount: 250 });
  await rpc(c, 'rr_bet', { p_room: room, p_amount: 1100 }).catch(() => null);
  ok(await bal(c) === 900, 'на 1100 не хватило (баланс 900) — ставка прежняя');
  await rpc(c, 'rr_bet', { p_room: room, p_amount: 1000 - 100 });
  ok(await bal(c) === 100, 'ставка 900: баланс 100');
  s = await rpc(a, 'rr_state', { p_room: room });
  ok(s.room.bank === 300 + 250 + 900 + 100 + 100, 'банк = сумма ставок', s.room.bank);
  ok(s.room.vote_cost === 50, 'патрон стоит половину самой маленькой ставки (100 → 50)', s.room.vote_cost);
  await shift(14);
  s = await rpc(a, 'rr_state', { p_room: room });
  ok(s.room.phase === 'next' && s.game.round === 0, 'через 14 с ещё знакомство');
  ok(/bets closed/.test(await err(rpc(a, 'rr_bet', { p_room: room, p_amount: 500 }))), 'за секунду до конца знакомства ставки закрыты');
  await shift(1.1);
  s = await rpc(a, 'rr_state', { p_room: room });
  ok(s.room.phase === 'play' && s.game && s.game.round === 1 && s.game.bullets === 1, 'игра началась: раунд 1, 1 патрон', s.room);
  ok(s.game.ev.kind === 'start' && s.game.ev.seat === s.game.first && s.game.turn === s.game.first, 'событие start, ходит первый');
  ok(s.room.deadline - s.room.phase_at === 20000, 'на ход 20 с');
  // чужой ход и неверный номер хода
  const notMe = s.players.find(p => p.seat !== s.game.turn).seat;
  ok(/not your turn/.test(await err(rpc(await seatUid(room, notMe), 'rr_shoot', { p_room: room, p_turn: s.game.n }))), 'стрелять не в свой ход нельзя');
  ok(/not your turn/.test(await err(rpc(await seatUid(room, s.game.turn), 'rr_shoot', { p_room: room, p_turn: s.game.n + 1 }))), 'неверный номер хода');
  {   // купили патрон: из банка −50, событие с ценой
    await shift(4);
    const A = await safeShootIn(room); let v = await rpc(a, 'rr_state', { p_room: room });
    await rpc(await seatUid(room, A), 'rr_vote_start', { p_room: room });
    v = await rpc(a, 'rr_state', { p_room: room });
    ok(v.game.vote && v.game.vote.cost === 50, 'в игре на деньги голосование стоит 50', v.game.vote);
    for (const p of v.players.filter(p => p.seat !== A).slice(0, 2)) await rpc(await seatUid(room, p.seat), 'rr_vote', { p_room: room, p_yes: true });
    v = await rpc(a, 'rr_state', { p_room: room });
    const ve = v.game.evs.find(x => x.kind === 'vote_end');
    ok(!v.game.vote && v.game.bullets === 2 && v.room.bank === 1650 - 50 && ve && ve.ok && ve.cost === 50, 'патрон куплен: банк 1600, в событии −50', [v.room.bank, ve]);
  }
  const r = await play(room, [a, b, c, d, e]);
  checkFinal(r.s, true);
  {   // деньги: победитель берёт с каждого не больше своей ставки, минус 5%; остальное — назад
    const fin = r.s.players, W = fin.find(p => p.place === 1);
    let bank = W.bet, sum = 0;
    for (const p of fin) {
      const u = await seatUid(room, p.seat);
      if (p === W) continue;
      const t = Math.min(p.bet, W.bet); bank += t;
      ok(+p.back === p.bet - t, `место ${p.place}: возврат ${p.bet - t}`, p);
      ok(await bal(u) === 1000 - p.bet + (p.bet - t), `место ${p.place}: баланс после игры`, [await bal(u), p.bet, t]);
    }
    const pay = Math.floor((bank - 50) * 0.95);   // минус купленный патрон
    ok(+W.won === pay && await bal(await seatUid(room, W.seat)) === 1000 - W.bet + pay, 'победитель: банк минус 5%', [W.won, pay, W.bet]);
    for (const p of fin) sum += await bal(await seatUid(room, p.seat));
    ok(Math.abs(5000 - sum - (bank - pay)) < 0.01, 'деньги сходятся: сайту комиссия и патрон', [5000 - sum, bank - pay]);
    const wn = (await db.query(`select sum(won)::numeric w from public.rr_points`)).rows[0];
    ok(+wn.w === pay, 'rr_points.won = выигрыш', wn);
    const t = await rpc(a, 'rr_top', { p_limit: 100 });
    ok(t.rows.some(x => +x.won === pay), 'в рейтинге есть выигрыш', t.rows.map(x => x.won));
  }
  // по кругу: в раунде ходы идут по возрастанию места среди живых
  await verifyGame(room);
  const pts = (await db.query(`select sum(pts)::int s, sum(games)::int g, sum(wins)::int w from public.rr_points`)).rows[0];
  ok(pts.s === 20 && pts.g === 5 && pts.w === 1, 'rr_points: 20 очков, 5 игр, 1 победа', pts);
  // выбывший в игре не пишет, после игры — пишет
  m = await rpc(a, 'rr_mm_state');
  ok(m.party.state === 'idle' && m.game === null, 'после игры группа свободна', m.party);
  ok((await rpc(a, 'rr_chat_send', { p_room: room, p_text: 'gg' })).ok, 'после игры чат открыт всем');
}

// ============ B. Комната друзей: код, «Готов», никто не жмёт — всё по таймеру, без очков ============
log('B. комната друзей, все молчат — выстрелы сами по 20 с');
let roomB;
{
  const P = U.slice(5, 10);
  let s = await rpc(P[0], 'rr_create', { p_private: true });
  roomB = s.room.id;
  ok(s.room.kind === 'private' && s.room.points === false, 'комната друзей без очков');
  for (const u of P.slice(1)) s = await rpc(u, 'rr_join', { p_code: s.room.code });
  ok(s.players.length === 5, 'пятеро за столом');
  ok(/room full/.test(await err(rpc(U[10], 'rr_join', { p_code: s.room.code }))), 'шестой — room full');
  for (const u of P.slice(0, 4)) await rpc(u, 'rr_ready', { p_room: roomB, p_ready: true });
  await shift(5);
  s = await rpc(P[0], 'rr_state', { p_room: roomB });
  ok(s.room.phase === 'lobby' && !s.room.deadline, 'не все готовы — ждём');
  await rpc(P[4], 'rr_ready', { p_room: roomB, p_ready: true });
  await shift(3.1);
  s = await rpc(P[0], 'rr_state', { p_room: roomB });
  ok(s.room.phase === 'next' && s.game.round === 0, 'все готовы — через 3 с знакомство');
  await shift(15.1);
  s = await rpc(P[0], 'rr_state', { p_room: roomB });
  ok(s.room.phase === 'play' && s.game.round === 1, 'через 15 с раунд 1');
  // пульс всех, чтобы никто не считался ушедшим; ходы — только по таймеру
  let guard = 0;
  while (guard++ < 200) {
    for (const u of P) await rpc(u, 'rr_tick', { p_room: roomB });
    s = await rpc(P[0], 'rr_state', { p_room: roomB });
    if (s.room.phase === 'done') break;
    const dead = s.players.find(p => !p.alive);
    if (dead && s.room.phase === 'play') {
      ok(/dead/.test(await err(rpc(await seatUid(roomB, dead.seat), 'rr_chat_send', { p_room: roomB, p_text: 'я тут ' + guard }))), 'выбывший в игре не пишет в чат');
    }
    await shift(s.room.phase === 'next' ? 5.1 : 20.1);
  }
  checkFinal(s, false);
  ok(s.game.evs.filter(e => e.kind === 'click' || e.kind === 'bang').every(e => e.auto === true), 'все выстрелы — сами (auto)');
  ok(s.players.every(p => p.spins === 0), 'без прокруток');
  await verifyGame(roomB);
}

// ============ C. Выход: ходящий выходит — выстрел за него через 2 с; потом все уходят — игра доигрывается сама ============
log('C. выход игроков посреди игры');
{
  const P = U.slice(0, 5);   // открытое лобби быстрой игры без группы
  let s;
  for (const u of P) { await rpc(u, 'rr_party_leave'); s = await rpc(u, 'rr_quick'); }
  const room = s.room.id;
  ok(s.players.length === 5 && s.room.kind === 'quick' && s.room.deadline, 'быстрая игра: пятеро, отсчёт 20 с', s.room);
  await shift(20.1);
  s = await rpc(P[0], 'rr_state', { p_room: room });
  ok(s.room.phase === 'next' && s.game.round === 0, 'старт: знакомство');
  await shift(15.1);
  s = await rpc(P[0], 'rr_state', { p_room: room });
  ok(s.room.phase === 'play', 'раунд 1');
  const t1 = s.game.turn, u1 = await seatUid(room, t1);
  await rpc(u1, 'rr_leave', { p_room: room });
  s = await rpc(P.find(u => u !== u1), 'rr_state', { p_room: room });
  ok(s.room.deadline - Math.max(s.room.phase_at, s.now - 50) <= 2100, 'ходящий вышел — срок хода ≤ 2 с', [s.room.deadline - s.room.phase_at]);
  ok(s.players.find(p => p.seat === t1).left === true, 'отмечен «вышел»');
  await shift((s.room.deadline - s.now) / 1000 + 0.1);   // начало его хода (заставка раунда) + 2 с
  const other = P.find(u => u !== u1);
  s = await rpc(other, 'rr_state', { p_room: room });
  const ev = s.game.evs.filter(e => e.seat === t1 && (e.kind === 'click' || e.kind === 'bang'));
  ok(ev.length >= 1 && ev[0].auto === true, 'за вышедшего выстрелили сами', s.game.evs);
  // вышедший не возвращается в эту игру через «Быструю игру»
  const q = await rpc(u1, 'rr_quick');
  ok(q.room.id !== room, 'вышедший не попадает обратно в игру', q.room);
  await rpc(u1, 'rr_leave', { p_room: q.room.id });
  // остальные тоже уходят; никто не на связи 50 с → первый же вызов доигрывает игру
  for (const u of P) if (u !== u1) await rpc(u, 'rr_leave', { p_room: room });
  await shift(50);
  await rpc(U[11], 'rr_party_open');   // посторонний вызов ничего не двигает
  const g = await as(P[0], `select public._rr_advance(${room})`);
  const rm = (await db.query(`select phase from public.rr_rooms where id = $1`, [room])).rows[0];
  ok(rm.phase === 'done', 'брошенная игра доигрывается сама', rm);
  s = (await db.query(`select array_agg(place order by place) pl from public.rr_players where room_id = $1`, [room])).rows[0];
  ok(JSON.stringify(s.pl) === '[1,2,3,4,5]', 'места розданы', s.pl);
  await verifyGame(room);
}

// ============ D. Подбор: один не принял — его группа вне поиска, остальные снова в поиске ============
log('D. «Принять» не нажал один из пяти');
{
  const P = U.slice(0, 5);
  for (const u of P) await rpc(u, 'rr_search', { p_on: true });
  let m = await rpc(P[0], 'rr_mm_state');
  ok(m.party.state === 'match' && m.match, 'нашлась игра пятерым одиночкам', m);
  for (const u of P.slice(0, 4)) await rpc(u, 'rr_accept');
  await shift(15.1);
  for (const u of P) await rpc(u, 'rr_mm_state');
  const st = []; for (const u of P) st.push((await rpc(u, 'rr_mm_state')).party.state);   // по очереди: uid задаётся на всё соединение
  ok(st.slice(0, 4).every(x => x === 'search' || x === 'match') && st[4] === 'idle', 'принявшие — снова в поиске, не принявший — вне поиска', st);
  const n = (await rpc(P[4], 'rr_mm_state')).party.note;
  ok(n && n.kind === 'missed' && n.me === true, 'не принявшему — пометка missed', n);
  for (const u of P) await rpc(u, 'rr_search', { p_on: false });
}

// ============ E. Группа из 5 друзей в подборе — играет сама с собой, без очков ============
log('E. группа из 5 в подборе — без очков');
{
  const P = U.slice(5, 10);
  for (const u of P) await rpc(u, 'rr_party_leave');
  const m0 = await rpc(P[0], 'rr_party_open');
  for (const u of P.slice(1)) await rpc(u, 'rr_party_join', { p_code: m0.party.code });
  ok(/party full/.test(await err(rpc(U[10], 'rr_party_join', { p_code: m0.party.code }))), 'шестой в группу — party full');
  let m = await rpc(P[0], 'rr_search', { p_on: true });
  ok(m.party.state === 'match', 'группа из 5 сразу нашла игру');
  for (const u of P) await rpc(u, 'rr_accept');
  for (const u of P) await rpc(u, 'rr_loaded', { p_room: m.match.room });
  await shift(10.1);
  const r = await play(m.match.room, P);
  checkFinal(r.s, false);
}

// ============ F. Права: из браузера таблицы и функции-помощники недоступны ============
log('F. права');
{
  const pr = (await db.query(`select has_table_privilege('authenticated', 'public.rr_games', 'select') g, has_table_privilege('authenticated', 'public.rr_rooms', 'update') u,
    has_function_privilege('authenticated', 'public._rr_fire(bigint,int,boolean)', 'execute') f, has_function_privilege('anon', 'public.rr_state(bigint,bigint)', 'execute') a,
    has_function_privilege('authenticated', 'public.rr_spin(bigint,int)', 'execute') s`)).rows[0];
  ok(!pr.g && !pr.u && !pr.f && !pr.a && pr.s, 'rr_games закрыта, помощники и anon — без доступа, rr_spin доступна', pr);
  ok(/not authenticated/.test(await err(rpc(null, 'rr_quick'))), 'без входа — not authenticated');
}

// ============ G. Боты (владелец 20.11): админ добавляет их в комнату друзей; игра без очков; боты сами крутят и стреляют ============
log('G. боты в комнате друзей');
await db.exec(`create or replace function public.is_staff() returns boolean language sql stable as $$ select current_setting('test.staff', true) = '1' $$;`);
const staff = on => db.query(`select set_config('test.staff', $1, false)`, [on ? '1' : '']);
const phaseOf = async room => (await db.query(`select phase from public.rr_rooms where id = $1`, [room])).rows[0].phase;
{
  const A = U[10], H = U[11];
  let s = await rpc(A, 'rr_create', { p_private: true });
  const room = s.room.id, code = s.room.code;
  ok(s.me.admin === false, 'не сотрудник — не админ');
  ok(/forbidden/.test(await err(rpc(A, 'rr_bot_add', { p_room: room }))), 'не админ — ботов не добавить');
  await staff(true);
  s = await rpc(A, 'rr_state', { p_room: room });
  ok(s.me.admin === true, 'сотрудник — админ');
  for (let i = 0; i < 3; i++) await rpc(A, 'rr_bot_add', { p_room: room });
  s = await rpc(A, 'rr_state', { p_room: room });
  const bots = s.players.filter(p => p.bot);
  ok(bots.length === 3 && bots.every(p => p.ready && p.online && p.loaded && !p.me), 'три бота: готовы, на связи', s.players);
  ok(new Set(s.players.map(p => p.name)).size === s.players.length, 'имена ботов не повторяются');
  await rpc(A, 'rr_bot_del', { p_room: room, p_seat: bots[0].seat });
  ok((await rpc(A, 'rr_state', { p_room: room })).players.filter(p => p.bot).length === 2, 'бот убран');
  ok(/not bot/.test(await err(rpc(A, 'rr_bot_del', { p_room: room, p_seat: 1 }))), 'человека «Убрать» нельзя');
  await rpc(H, 'rr_join', { p_code: code });
  await staff(false);
  ok(/forbidden/.test(await err(rpc(H, 'rr_bot_add', { p_room: room }))), 'обычный игрок ботов не добавляет');
  await staff(true);
  await rpc(A, 'rr_bot_add', { p_room: room });
  s = await rpc(A, 'rr_state', { p_room: room });
  ok(s.players.length === 5 && s.players.filter(p => p.bot).length === 3, 'за столом 2 человека и 3 бота');
  ok(/room full/.test(await err(rpc(A, 'rr_bot_add', { p_room: room }))), 'шестому боту нет места');
  ok(/bad player/.test(await err(rpc(A, 'rr_report', { p_room: room, p_seat: s.players.find(p => p.bot).seat, p_reason: 'spam' }))), 'жалоба на бота — нельзя');
  await rpc(A, 'rr_ready', { p_room: room, p_ready: true });
  await rpc(H, 'rr_ready', { p_room: room, p_ready: true });
  await shift(3.1);
  s = await rpc(A, 'rr_state', { p_room: room });
  ok(s.room.phase === 'next' && s.room.points === true && s.room.money === true, 'все готовы — игра; 2 человека и боты — на деньги и очки');
  ok(/not lobby/.test(await err(rpc(A, 'rr_bot_add', { p_room: room }))), 'в игре ботов не добавить');
  await staff(false);
  // люди стреляют, как только их ход; боты — сами; пульс раз в 1 с
  let guard = 0;
  while (guard++ < 800) {
    for (const u of [A, H]) await rpc(u, 'rr_tick', { p_room: room });
    s = await rpc(A, 'rr_state', { p_room: room });
    if (s.room.phase === 'done') break;
    if (s.room.phase === 'play' && s.room.phase_at <= s.now) {
      const tp = s.players.find(p => p.seat === s.game.turn);
      if (!tp.bot) await err(rpc(await seatUid(room, tp.seat), 'rr_shoot', { p_room: room, p_turn: s.game.n }));
    }
    await shift(s.room.phase === 'next' ? 5.1 : 1);
  }
  checkFinal(s, true);   // 2 человека + боты — очки людям (владелец 22.11), ботам нет
  const botSeats = s.players.filter(p => p.bot).map(p => p.seat);
  const lg = (await db.query(`select kind, data, at from public.rr_log where room_id = $1 and kind in ('spin', 'click', 'bang') order by id`, [room])).rows;
  const botShots = lg.filter(e => e.kind !== 'spin' && botSeats.includes(e.data.seat));
  ok(botShots.length > 0 && botShots.every(e => e.data.auto === false), 'боты стреляют сами, не по таймеру', botShots.map(e => e.data.auto));
  await verifyGame(room);
  const chat = (await db.query(`select name from public.rr_chat where room_id = $1 and kind = 'msg'`, [room])).rows;
  ok(chat.every(m => / · БОТ$/.test(m.name)), 'реплики ботов подписаны «БОТ»', chat);
  log(`  ходов ботов: ${botShots.length}, прокруток ботов: ${lg.filter(e => e.kind === 'spin' && botSeats.includes(e.data.seat)).length}, реплик в чате: ${chat.length}`);
}
{   // G2: в игре с ботами человек ушёл — игра доигрывается сразу (боты людей не держат)
  const A = U[10];
  await staff(true);
  let s = await rpc(A, 'rr_create', { p_private: true });
  const room = s.room.id;
  for (let i = 0; i < 4; i++) await rpc(A, 'rr_bot_add', { p_room: room });
  await staff(false);
  await rpc(A, 'rr_ready', { p_room: room, p_ready: true });
  await shift(3.1); await rpc(A, 'rr_tick', { p_room: room }); await shift(15.1);
  s = await rpc(A, 'rr_state', { p_room: room });
  ok(s.room.phase === 'play', 'один человек и 4 бота — игра идёт');
  await rpc(A, 'rr_leave', { p_room: room });
  ok(await phaseOf(room) === 'done', 'человек ушёл — игра доиграна сразу');
}
{   // G3: лобби — люди ушли, остались боты — комната закрывается
  const A = U[10];
  await staff(true);
  const s = await rpc(A, 'rr_create', { p_private: true });
  await rpc(A, 'rr_bot_add', { p_room: s.room.id }); await rpc(A, 'rr_bot_add', { p_room: s.room.id });
  await staff(false);
  await rpc(A, 'rr_leave', { p_room: s.room.id });
  ok(await phaseOf(s.room.id) === 'done', 'в лобби одни боты — комната закрыта');
}

// ============ H. Боты в лобби группы (владелец 20.11): «+ Бот» в лобби, «Найти игру» — стол только из своих и ботов ============
log('H. боты в лобби группы');
{
  const A = U[10], H = U[11];
  ok(/forbidden/.test(await err(rpc(A, 'rr_party_bot', { p_add: true }))), 'не админ — ботов в лобби не добавить');
  await staff(true);
  let m = await rpc(A, 'rr_party_open');
  ok(m.party && m.party.admin === true && m.party.bots.length === 0, 'лобби открыто, я — админ');
  for (let i = 0; i < 3; i++) m = await rpc(A, 'rr_party_bot', { p_add: true });
  ok(m.party.bots.length === 3 && new Set(m.party.bots.map(b => b.name)).size === 3, 'в лобби 3 бота, имена разные', m.party.bots);
  m = await rpc(A, 'rr_party_bot', { p_add: false, p_n: 2 });
  ok(m.party.bots.length === 2 && m.party.bots.map(b => b.n).join() === '1,2', 'бот №2 убран', m.party.bots);
  ok(/not bot/.test(await err(rpc(A, 'rr_party_bot', { p_add: false, p_n: 5 }))), 'убрать несуществующего — not bot');
  await staff(false);
  // параллельно ищет обычный игрок — к столу с ботами его не подмешивают
  await rpc(H, 'rr_search', { p_on: true });
  m = await rpc(A, 'rr_search', { p_on: true });
  ok(m.match && m.match.players.length === 5, 'с ботами — игра найдена сразу, за столом пятеро', m.match);
  const room = m.match.room;
  const pl = (await db.query(`select uid, bot, ready from public.rr_players where room_id = $1 order by seat`, [room])).rows;
  ok(pl.filter(p => p.bot).length === 4 && pl.filter(p => p.bot).every(p => p.ready), '1 человек + 2 бота лобби + 2 бота добора, боты приняли');
  ok(!pl.some(p => p.uid === H), 'чужого игрока к столу с ботами не подмешали');
  ok((await rpc(H, 'rr_mm_state')).party.state === 'search', 'чужой игрок дальше в поиске');
  await rpc(H, 'rr_search', { p_on: false });
  await rpc(A, 'rr_accept');
  await shift(1); await rpc(A, 'rr_loaded', { p_room: room });
  for (let i = 0; i < 20 && (await phaseOf(room)) === 'lobby'; i++) { await shift(1); await rpc(A, 'rr_tick', { p_room: room }); }
  let s = await rpc(A, 'rr_state', { p_room: room });
  ok(['next', 'play'].includes(s.room.phase) && s.room.points === false, 'игра началась, без очков', s.room);
  let guard = 0;
  while (guard++ < 800) {
    await rpc(A, 'rr_tick', { p_room: room });
    s = await rpc(A, 'rr_state', { p_room: room });
    if (s.room.phase === 'done') break;
    if (s.room.phase === 'play' && s.room.phase_at <= s.now) {
      const tp = s.players.find(p => p.seat === s.game.turn);
      if (!tp.bot) await err(rpc(A, 'rr_shoot', { p_room: room, p_turn: s.game.n }));
    }
    await shift(s.room.phase === 'next' ? 5.1 : 1);
  }
  checkFinal(s, false);
  await verifyGame(room);
  m = await rpc(A, 'rr_mm_state');
  ok(m.party && m.party.state === 'idle' && m.party.bots.length === 2, 'после игры лобби свободно, боты остались');
  await staff(true);
  for (let i = 0; i < 2; i++) m = await rpc(A, 'rr_party_bot', { p_add: true });
  ok(/party full/.test(await err(rpc(A, 'rr_party_bot', { p_add: true }))), '1 человек + 4 бота — лобби полное');
  await staff(false);
}

log('I. рейтинг за всё время (rr_top) и очки за всё время');
{
  const t = await rpc(U[0], 'rr_top', { p_limit: 100 });
  ok(t && Array.isArray(t.rows) && t.rows.length > 0, 'rr_top: есть строки', t);
  ok(t.rows.every((r, i, a) => !i || a[i - 1].pts >= r.pts), 'rr_top: по убыванию очков', t.rows.map(r => r.pts));
  const sum = await as(null, `select coalesce(sum(pts), 0)::int from public.rr_points where uid = $1`, [U[0]]);
  ok(t.me && t.me.me === true && t.me.pts === sum, 'rr_top: своё место и очки = сумма rr_points', [t.me, sum]);
  const g = await rpc(null, 'rr_top');
  ok(g && g.me === null && Array.isArray(g.rows) && g.rows.every(r => r.me === false), 'rr_top: гость видит рейтинг без «своего места»', g && g.me);
  const pr = await as(null, `select has_function_privilege('anon', 'public.rr_top(int)', 'execute') and has_function_privilege('authenticated', 'public.rr_top(int)', 'execute')`);
  ok(pr === true, 'rr_top: доступна гостям и игрокам');
}

log('J. голосование за патрон (комната друзей, без денег): предлагает только выживший и только 1 ход');
{
  const P = U.slice(5, 10);
  let s = await rpc(P[0], 'rr_create', { p_private: true });
  const room = s.room.id;
  for (const u of P.slice(1)) s = await rpc(u, 'rr_join', { p_code: s.room.code });
  for (const u of P) await rpc(u, 'rr_ready', { p_room: room, p_ready: true });
  await shift(3.1); s = await rpc(P[0], 'rr_state', { p_room: room });
  ok(s.room.money === false && s.players.every(p => p.bet === null), 'комната друзей — без денег');
  ok(/no money game/.test(await err(rpc(P[0], 'rr_bet', { p_room: room, p_amount: 200 }))), 'ставка в комнате друзей — нельзя');
  await shift(15.1); s = await rpc(P[0], 'rr_state', { p_room: room });
  ok(s.room.phase === 'play' && s.game.bullets === 1 && s.room.max_bul === 4, 'раунд 1: 1 патрон, максимум 4');
  // выстрел без смерти: крутим (по честным правилам), пока напротив ствола пусто
  const safeShoot = async () => {
    for (let i = 0; i < 12; i++) {
      const g = (await db.query(`select turn, n, pos, chambers from public.rr_games where room_id = $1`, [room])).rows[0];
      const who = await seatUid(room, g.turn);
      if (!g.chambers.includes(g.pos)) { await rpc(who, 'rr_shoot', { p_room: room, p_turn: g.n }); return g.turn; }
      await rpc(who, 'rr_spin', { p_room: room, p_turn: g.n }); await shift(0.9);
    }
    throw new Error('не нашлось пустого гнезда');
  };
  const st = () => rpc(P[0], 'rr_state', { p_room: room });
  ok(/vote not yours/.test(await err(rpc(await seatUid(room, s.game.turn), 'rr_vote_start', { p_room: room }))), 'до первого выстрела предложить некому');
  const A = await safeShoot(); s = await st();
  const B = s.game.turn, others = s.players.filter(p => p.seat !== A && p.seat !== B).map(p => p.seat);
  ok(s.game.vby === A && s.game.vn === s.game.n, 'выжил A — он может предложить в ход B', [s.game.vby, s.game.vn, s.game.n]);
  ok(/vote not yours/.test(await err(rpc(await seatUid(room, others[0]), 'rr_vote_start', { p_room: room }))), 'не выживший — нельзя');
  ok(/vote not yours/.test(await err(rpc(await seatUid(room, B), 'rr_vote_start', { p_room: room }))), 'ходящий — нельзя');
  const uA = await seatUid(room, A), uB = await seatUid(room, B);
  await rpc(uA, 'rr_vote_start', { p_room: room });
  s = await st();
  ok(s.game.vote && s.game.vote.by === A && s.game.vote.need === 3 && s.game.vote.yes.length === 1 && s.game.vote.cost === 0, 'голосование: A «за», нужно 3 из 5, бесплатно', s.game.vote);
  ok(s.game.ev.kind === 'vote' && s.game.ev.seat === A, 'событие vote — рука вверх');
  ok(/vote on/.test(await err(rpc(uB, 'rr_shoot', { p_room: room, p_turn: s.game.n }))), 'во время голосования стрелять нельзя');
  ok(/voted/.test(await err(rpc(uA, 'rr_vote', { p_room: room, p_yes: true }))), 'голосовать второй раз — нельзя');
  await rpc(await seatUid(room, others[0]), 'rr_vote', { p_room: room, p_yes: false });
  await rpc(await seatUid(room, others[1]), 'rr_vote', { p_room: room, p_yes: true });
  s = await st();
  ok(s.game.vote && s.game.vote.yes.length === 2 && s.game.vote.no.length === 1, 'пока 2 «за» — голосование идёт');
  await rpc(uB, 'rr_vote', { p_room: room, p_yes: true });
  s = await st();
  ok(!s.game.vote && s.game.bullets === 2 && s.game.added === 1 && s.game.votes === 1, '3 «за» — +1 патрон', s.game);
  ok(s.room.deadline - s.now >= 5900, 'после голосования на ход снова есть время', s.room.deadline - s.now);
  ok(/vote not yours/.test(await err(rpc(uA, 'rr_vote_start', { p_room: room }))), 'второй раз в тот же ход — нельзя');
  // B выжил: A уже не может (ход прошёл), B — может; 3 «против» — не прошло
  await safeShoot(); s = await st();
  ok(/vote not yours/.test(await err(rpc(uA, 'rr_vote_start', { p_room: room }))), 'следующий выстрелил — у A право пропало');
  await rpc(uB, 'rr_vote_start', { p_room: room });
  s = await st();
  for (const p of s.players.filter(p => p.seat !== B).slice(0, 3)) await rpc(await seatUid(room, p.seat), 'rr_vote', { p_room: room, p_yes: false });
  s = await st();
  ok(!s.game.vote && s.game.bullets === 2, '3 «против» — не прошло, патронов 2', s.game);
  // время вышло: 2 «за» из 3 нужных — не прошло, ход продолжается
  const C = await safeShoot(); s = await st();
  await rpc(await seatUid(room, C), 'rr_vote_start', { p_room: room });
  await rpc(uA, 'rr_vote', { p_room: room, p_yes: true });
  await shift(10.1);
  s = await st();
  ok(!s.game.vote && s.game.bullets === 2 && s.room.phase === 'play', 'время голосования вышло — не прошло, ход продолжается', s.game);
  await shift(1);
  const rr = await play(room, P);
  checkFinal(rr.s, false);
  await verifyGame(room);
  const g = (await db.query(`select rounds from public.rr_games where room_id = $1`, [room])).rows[0];
  ok(g.rounds[0].added === 1 && g.rounds[0].final === 2, 'в раскрытом раунде видно: добавлено 1, итого 2', g.rounds[0]);
}

log('K. не хватает баланса');
{
  const x = '00000000-0000-0000-0000-0000000000a1', y = '00000000-0000-0000-0000-0000000000a2';
  await db.query(`insert into public.profiles (id, name, pid) values ($1, 'Бедный', 200001), ($2, 'Друг', 200002)`, [x, y]);
  await db.query(`update public.profiles set data = '{"balance": 50}' where id = $1`, [x]);
  ok(/low balance/.test(await err(rpc(x, 'rr_search', { p_on: true }))), 'поиск с балансом 50 — нельзя');
  let m = await rpc(y, 'rr_party_open');
  await rpc(x, 'rr_party_join', { p_code: m.party.code });
  const e1 = await err(rpc(y, 'rr_search', { p_on: true }));
  ok(/low balance/.test(e1) && e1.includes('Бедный'), 'группа: у друга мало — поиск не идёт, видно кто', e1);
  ok(/low balance/.test(await err(rpc(x, 'rr_quick'))), 'открытое лобби быстрой игры — тоже нельзя');
}

log('M. игра админа с ботами: ставят только люди, банк — лучшему из людей');
{
  const A = '00000000-0000-0000-0000-0000000000b1', B = '00000000-0000-0000-0000-0000000000b2';
  await db.query(`insert into public.profiles (id, name, pid) values ($1, 'Админ', 300001), ($2, 'Друг', 300002)`, [A, B]);
  await staff(true);
  let m = await rpc(A, 'rr_party_open');
  await rpc(B, 'rr_party_join', { p_code: m.party.code });
  m = await rpc(A, 'rr_party_bot', { p_add: true });
  await staff(false);
  m = await rpc(A, 'rr_search', { p_on: true });
  ok(m.match && m.match.players.length === 5, 'с ботами: двое людей + боты — стол собран', m.match);
  const room = m.match.room;
  for (const u of [A, B]) await rpc(u, 'rr_accept');
  await shift(1); for (const u of [A, B]) await rpc(u, 'rr_loaded', { p_room: room });
  for (let i = 0; i < 20 && (await phaseOf(room)) === 'lobby'; i++) { await shift(1); await rpc(A, 'rr_tick', { p_room: room }); }
  let s = await rpc(A, 'rr_state', { p_room: room });
  ok(s.room.money === true && s.room.points === true, 'с ботами и двумя людьми — на деньги и на очки (владелец 22.11)', s.room);
  ok(s.players.filter(p => p.bot).every(p => p.bet === null) && s.players.filter(p => !p.bot).every(p => p.bet === 100), 'ставят только люди (по 100), боты — нет');
  ok(s.room.bank === 200 && await bal(A) === 900 && await bal(B) === 900, 'банк 200 — только люди', [s.room.bank, await bal(A)]);
  await rpc(B, 'rr_bet', { p_room: room, p_amount: 300 });
  let guard = 0;
  while (guard++ < 900) {
    await rpc(A, 'rr_tick', { p_room: room }); await rpc(B, 'rr_tick', { p_room: room });
    s = await rpc(A, 'rr_state', { p_room: room });
    if (s.room.phase === 'done') break;
    if (s.room.phase === 'play' && s.room.phase_at <= s.now && !s.game.vote) {
      const tp = s.players.find(p => p.seat === s.game.turn);
      if (!tp.bot) await err(rpc(await seatUid(room, tp.seat), 'rr_shoot', { p_room: room, p_turn: s.game.n }));
    }
    await shift(s.room.phase === 'next' ? 5.1 : 1);
  }
  checkFinal(s, true);
  { // рейтинг: людям — очки по месту, игра, победа, выигрыш; ботам — ничего
    const r = (await db.query(`select uid, pts, games, wins, won from public.rr_points where uid in ($1, $2)`, [A, B])).rows, PT = { 1: 10, 2: 6, 3: 3, 4: 1, 5: 0 };
    const want = await Promise.all(s.players.filter(p => !p.bot).map(async p => ({ uid: await seatUid(room, p.seat), pts: PT[p.place], win: p.place === 1 ? 1 : 0, won: +p.won || 0 })));
    ok(r.length === 2 && want.every(w => { const x = r.find(y => y.uid === w.uid); return x && x.pts === w.pts && x.games === 1 && x.wins === w.win && +x.won === w.won; }), 'с ботами: людям в рейтинг очки, игра, победа, выигрыш', [r, want]);
    ok(+(await db.query(`select count(*) n from public.rr_points x where not exists (select 1 from public.profiles f where f.id = x.uid)`)).rows[0].n === 0, 'ботов в рейтинге нет');
  }
  const hs = s.players.filter(p => !p.bot).sort((x, y) => x.place - y.place), W = hs[0], L = hs[1];
  const t = Math.min(L.bet, W.bet), pay = Math.floor((W.bet + t) * 0.95);
  ok(+W.won === pay && +L.back === L.bet - t, 'банк забрал лучший из людей (место ' + W.place + '), проигравшему — сверх ставки назад', [W, L]);
  ok(await bal(await seatUid(room, W.seat)) === 1000 - W.bet + pay && await bal(await seatUid(room, L.seat)) === 1000 - L.bet + (L.bet - t), 'балансы людей сходятся');
  ok(s.players.filter(p => p.bot).every(p => p.won === null), 'ботам денег нет');
}

log('L. финал вдвоём — голосовать нельзя');
{
  const P = U.slice(5, 10);
  let s = await rpc(P[0], 'rr_create', { p_private: true });
  const room = s.room.id;
  for (const u of P.slice(1)) s = await rpc(u, 'rr_join', { p_code: s.room.code });
  for (const u of P) await rpc(u, 'rr_ready', { p_room: room, p_ready: true });
  await shift(3.1); await rpc(P[0], 'rr_state', { p_room: room }); await shift(15.1); s = await rpc(P[0], 'rr_state', { p_room: room });
  ok(s.room.phase === 'play', 'игра идёт');
  const t = s.game.turn, others = s.players.map(p => p.seat).filter(x => x !== t);
  await db.query(`update public.rr_players set alive = false, place = 5 where room_id = $1 and seat = any($2::smallint[])`, [room, others.slice(0, 3)]);   // только для проверки: остались двое
  const sv = others[3];
  await db.query(`update public.rr_games set vby = $2, vn = n where room_id = $1`, [room, sv]);
  ok(/final no vote/.test(await err(rpc(await seatUid(room, sv), 'rr_vote_start', { p_room: room }))), 'вдвоём (финал) поднять руку нельзя');
}

log('N. места за столом — случайно (владелец 22.11): подбор группы из 5 и комната друзей, по 20 попыток (каждая — откат)');
{
  const Q = [];
  for (let i = 13; i <= 17; i++) {
    const id = `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
    Q.push(id); await db.query(`insert into public.profiles (id, name, pid) values ($1, $2, $3)`, [id, 'Игрок' + i, 100000 + i]);
  }
  const seatsOf = async room => (await db.query(`select uid, seat from public.rr_players where room_id = $1 order by seat`, [room])).rows;
  const lead = [], perm = [], own = [], perm2 = [];
  for (let k = 0; k < 20; k++) {
    await db.exec('begin');
    try {
      const m0 = await rpc(Q[0], 'rr_party_open');
      for (const u of Q.slice(1)) await rpc(u, 'rr_party_join', { p_code: m0.party.code });
      const m = await rpc(Q[0], 'rr_search', { p_on: true });
      const rows = await seatsOf(m.match.room);
      perm.push(rows.map(r => r.seat).join('')); lead.push(rows.find(r => r.uid === Q[0]).seat);
    } finally { await db.exec('rollback'); }
    await db.exec('begin');
    try {
      let s = await rpc(Q[0], 'rr_create', { p_private: true });
      for (const u of Q.slice(1)) await rpc(u, 'rr_join', { p_code: s.room.code });
      const rows = await seatsOf(s.room.id);
      perm2.push(rows.map(r => r.seat).join('')); own.push(rows.find(r => r.uid === Q[0]).seat);
    } finally { await db.exec('rollback'); }
  }
  ok(perm.every(p => p === '12345'), 'подбор: у всех пятерых места 1–5 без повторов', perm);
  ok(new Set(lead).size >= 3, 'подбор: место лидера группы меняется от игры к игре', lead);
  ok(perm2.every(p => p === '12345'), 'комната друзей: места 1–5 без повторов', perm2);
  ok(new Set(own).size >= 3, 'комната друзей: место создателя меняется', own);
  log('  место лидера (подбор): ' + lead.join(' ') + ' | создателя (комната): ' + own.join(' '));
}

log(`\nПроверок: ${checks}, ошибок: ${fails}`);
process.exit(fails ? 1 : 0);

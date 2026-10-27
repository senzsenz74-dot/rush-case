// Съёмка реального сайта RUSH CASE (десктопная версия) покадрово, в «виртуальном времени» браузера:
// таймеры, requestAnimationFrame и CSS-анимации идут ровно по 1/30 с на кадр — движение плавное и повторяемое.
// Сервер Supabase подменён заглушкой (без денег и аккаунтов); выпадение кейса — по реальным шансам кейса с фиксированным зерном.
// Каждый вызов звукового движка сайта (Snd.*) записывается с временем кадра — потом звук рендерится тем же кодом (audio.js).
// Запуск: node src/capture.js [сцена ...]
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const C = require('./config');

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const f = path.join(C.SITE, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!f.startsWith(C.SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
    }).listen(C.PORT, () => res(srv));
  });
}
const SITE_ORIGIN = 'https://senzsenz74-dot.github.io', SITE_URL = SITE_ORIGIN + '/rush-case/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ME = '00000000-0000-0000-0000-000000000001';
const U = i => `00000000-0000-0000-0000-00000000000${i}`;

// ---------- заглушка сервера ----------
function mockState() {
  const names = ['AWP | Азимов', 'AK-47 | Азимов', 'M4A4 | Азимов', 'Desert Eagle | Золотой карп', 'P90 | Азимов', 'Glock-18 | Градиент', 'MAC-10 | Янтарный градиент', 'USP-S | Оранжевый анолис'];
  const inv = names.map((n, i) => ({ id: 'i' + i, n, st: 'own', from: 'orange', ts: Date.now() - i * 6e4 }));
  inv.push({ id: 'bf', n: C.UPG_STAKE, st: 'own', from: 'karambit', ts: Date.now() - 9e5 });
  const pub = (me = 'p3gasus') => [[ME, me], [U(2), 'Vlad'], [U(3), 's1mpleFan'], [U(4), 'NaVi_Kid'], [U(5), 'Zeus77']].map(([id, name], i) => ({ id, name, ava: null, pid: 100230 + i, steamid: '7656119955635581' + i }));
  return {
    D: { balance: 250000, rcoin: 120, rlog: [], inv, stats: { opened: 37, spent: 9200 }, daily: Date.now(), promos: [], socials: [], trade: 'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEf12' },
    name: 'p3gasus', drop: null, conDrop: null, nid: 0, invite: 'r7Kq2mXa9',
    DB: {
      players_pub: pub(),
      teams: [['team-2', 'Golden Eagles', 'GE'], ['team-3', 'Obsidian', 'OBS'], ['team-4', 'Night Owls', 'OWL'], ['team-5', 'Crown Squad', 'CRWN']]
        .map(([id, name, tag]) => ({ id, name, tag, logo: null, captain: U(9), created_at: '2026-10-27T00:00:00Z' })),
      team_members: [],
      tournaments: [{ id: 1, title: 'RUSH Cup #1', description: 'Первый турнир RUSH CASE по CS2.', rules: '', anticheat: 'Обязателен античит', format: 5, subs_max: 2, max_teams: 16, prize_pool: '50 000 ₽ + скины', prizes: ['AWP | История о драконе', '15 000 ₽', 'Нож на выбор'], banner: '/assets/hero-banner.webp', map_pool: ['Ancient', 'Anubis', 'Dust2', 'Inferno', 'Mirage', 'Nuke', 'Train'], reg_end: new Date(Date.now() + 3 * 864e5).toISOString(), starts_at: new Date(Date.now() + 4 * 864e5).toISOString(), status: 'reg', created_at: '2026-10-27T00:00:00Z' }],
      tournament_teams: ['team-2', 'team-3', 'team-4', 'team-5'].map((t, i) => ({ tournament_id: 1, team_id: t, roster: [U(6), U(7), U(8), U(9), U(6)], subs: [], registered_at: '2026-10-27T0' + i + ':00:00Z' })),
    },
    pub,
  };
}
// своя команда игрока (для сцен регистрации) — капитан ME, 5 игроков
const myTeam = (S, captain = ME, members = [ME, U(2), U(3), U(4), U(5)]) => {
  S.DB.teams.unshift({ id: 'team-me', name: 'Rush Five', tag: 'RUSH', logo: null, captain, created_at: '2026-10-27T00:00:00Z' });
  members.forEach((uid, i) => S.DB.team_members.push({ team_id: 'team-me', uid, joined_at: '2026-10-27T0' + i + ':00:00Z' }));
};
const filt = (rows, q) => { for (const [k, v] of q.entries()) { if (['select', 'order', 'limit', 'offset'].includes(k)) continue; const [op, ...rest] = v.split('.'); const val = rest.join('.');
  if (op === 'eq') rows = rows.filter(r => String(r[k]) === val); else if (op === 'in') { const set = val.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')); rows = rows.filter(r => set.includes(String(r[k]))); } } return rows; };
function attachMock(p, S) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  p.on('request', r => {
    const u = new URL(r.url());
    if (u.pathname.endsWith('/js/app.js')) { // открываем внутренности сайта для съёмки (сам файл сайта не меняется)
      const s = fs.readFileSync(path.join(C.SITE, 'js/app.js'), 'utf8'), i = s.lastIndexOf('})();');
      return r.respond({ status: 200, contentType: 'application/javascript', body: s.slice(0, i) + 'window.__Snd = Snd; window.__d = { SK, CASES, caseById, st, imgUrl };\n' + s.slice(i) });
    }
    // сайт открываем под настоящим адресом (ссылки-приглашения в кадре — как у игроков), файлы — локальные
    if (u.origin === SITE_ORIGIN) { const f = path.join(C.SITE, decodeURIComponent(u.pathname.replace(/^\/rush-case\/?/, '')) || 'index.html'), ff = fs.existsSync(f) && !fs.statSync(f).isDirectory() ? f : path.join(C.SITE, 'index.html');
      return r.respond({ status: 200, contentType: MIME[path.extname(ff)] || 'application/octet-stream', body: fs.readFileSync(ff) }); }
    if (!u.host.includes('supabase')) return r.continue();
    if (r.method() === 'OPTIONS') return r.respond({ status: 200, headers: cors });
    const J = (o, s = 200) => r.respond({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
    const D = S.D, m = u.pathname.match(/\/rpc\/(\w+)/);
    if (m) {
      const a = JSON.parse(r.postData() || '{}'), team = () => S.DB.teams.find(t => t.id === 'team-me');
      switch (m[1]) {
        case 'open_case': { const drops = []; for (let k = 0; k < a.p_n; k++) { const id = 'o' + (++S.nid); D.inv.unshift({ id, n: S.drop, st: 'own', from: a.p_case, ts: Date.now() }); drops.push({ n: S.drop, id }); } D.balance -= S.casePrice * a.p_n; return J({ drops, data: D }); }
        case 'upgrade': { D.inv.forEach(x => { if (a.p_ids.includes(x.id)) x.st = 'upg'; }); const id = 'u' + (++S.nid); D.inv.unshift({ id, n: a.p_target, st: 'own', from: 'upgrade', ts: Date.now() }); return J({ win: true, chance: .19, id, data: D }); }
        case 'contract': { D.inv.forEach(x => { if (a.p_ids.includes(x.id)) x.st = 'con'; }); const id = 'c' + (++S.nid); D.inv.unshift({ id, n: S.conDrop, st: 'own', from: 'contract', ts: Date.now() }); return J({ n: S.conDrop, id, sum: S.conSum, data: D }); }
        case 'withdraw': { D.inv.forEach(x => { if (x.id === a.p_id) x.st = 'out'; }); return J({ data: D }); }
        case 'claim_daily': { D.daily = Date.now(); D.balance += C.DAILY_WIN; return J({ v: C.DAILY_WIN, data: D }); }
        case 'team_create': { S.DB.teams.unshift({ id: 'team-me', name: a.p_name, tag: a.p_tag, logo: null, captain: ME, created_at: new Date().toISOString() }); S.DB.team_members.push({ team_id: 'team-me', uid: ME, joined_at: new Date().toISOString() }); return J('team-me'); }
        case 'team_join': { S.DB.team_members.push({ team_id: 'team-me', uid: ME, joined_at: new Date().toISOString() }); return J('team-me'); }
        case 'team_by_invite': { const t = team(); return J(t ? { id: t.id, name: t.name, tag: t.tag, logo: null, n: S.DB.team_members.filter(x => x.team_id === 'team-me').length } : null); }
        case 'team_invite': return J(S.invite);
        case 'team_contact': return J('@rush_cap');
        case 'tour_register': { S.DB.tournament_teams.push({ tournament_id: a.p_tour, team_id: 'team-me', roster: a.p_roster, subs: a.p_subs, registered_at: new Date().toISOString() }); return J(null); }
        case 'top_players': return J({ list: [], me: null, total: 0 });
        default: return J(null);
      }
    }
    const tm = u.pathname.match(/\/rest\/v1\/(\w+)/);
    if (tm && tm[1] === 'profiles') return J({ id: ME, pid: 100230, luck: 1, name: S.name, steamid: '76561199556355811', is_admin: false, created_at: '2026-10-25T00:00:00Z', data: D });
    if (tm && tm[1] === 'case_settings') return J([]);
    if (tm && S.DB[tm[1]]) { const rows = filt(S.DB[tm[1]], u.searchParams); return J((r.headers().accept || '').includes('vnd.pgrst.object') ? (rows[0] || null) : rows); }
    return J([]);
  });
}

// подпись: автограф по опорным точкам (сплайн Катмулла–Рома) — крупная заглавная, буквы разной высоты с наклоном и длинный росчерк снизу
function signature() {
  const spline = (P, n = 10) => { const out = []; for (let i = 0; i < P.length - 1; i++) { const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))); } }
    out.push(P[P.length - 1]); return out; };
  const A = [[.06, .82], [.09, .40], [.13, .12], [.18, .10], [.21, .22], [.17, .40], [.10, .48], [.19, .50], [.25, .74], [.28, .58], [.31, .44], [.34, .62], [.37, .50], [.40, .40], [.43, .62],
    [.46, .30], [.48, .18], [.50, .34], [.51, .62], [.55, .46], [.58, .40], [.61, .60], [.64, .44], [.66, .26], [.69, .56], [.73, .44], [.79, .30], [.87, .20], [.93, .16]];
  const B = [[.95, .30], [.80, .66], [.55, .82], [.30, .84], [.10, .76]];
  return [spline(A, 6), spline(B, 9)];
}

// ---------- сцены ----------
// prep(S) — данные заглушки; setup — подготовка в обычном времени; actions — {кадр: действие}; frames — сколько кадров снимать
const click = sel => p => p.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); }, sel);
const typeIn = (sel, text, f0, per = 2) => Object.fromEntries([...text].map((_, i) => [f0 + i * per, p => p.evaluate((s, v) => { const e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } }, sel, text.slice(0, i + 1))]));
const scrollTo = (sel, off) => async p => { await p.evaluate((s, o) => { const e = document.querySelector(s); if (e) window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - o, behavior: 'instant' }); }, sel, off); }; // мгновенно: плавная прокрутка в виртуальном времени не доигрывается
const SCENES = {
  catalog: { hash: '#/', frames: 75, focus: ['[data-promo]', '[data-promo-card]'],
    setup: async p => { await p.evaluate(id => { const a = document.querySelector(`a[href="#/case/${id}"]`), b = a.closest('.cs-block'); b.dataset.promo = 1; a.dataset.promoCard = 1; window.scrollTo(0, b.getBoundingClientRect().top + scrollY - 300); }, C.CASE_ID); } },
  open: { hash: '#/case/' + C.CASE_ID, frames: 215, focus: ['.rl-framed', '#rl', '.cp-head h1', '#cc'],
    setup: async p => { await p.evaluate(() => { const f = document.querySelector('#fastChk'); if (f && !f.checked) f.click(); }); await scrollTo('.cp-head', 24)(p); },
    actions: { 8: click('#openBtn') } },
  upgrade: { hash: '#/upgrade', frames: 165, focus: ['.upg-main', '#wheel', '#upgFrom', '#upgTo'],
    setup: async p => { await p.evaluate(() => { const f = document.querySelector('#upgFastChk'); if (f && !f.checked) f.click(); document.querySelector('#upgSrc [data-inv="bf"]').click(); }); await sleep(300);
      await p.evaluate(q => { const i = document.querySelector('#upgQ'); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); }, C.UPG_TARGET.split(' (')[0].split('| ')[1]); await sleep(500);
      await p.evaluate(n => { const e = [...document.querySelectorAll('#upgTargets [data-t]')].find(x => x.dataset.t === n); if (e) e.click(); }, C.UPG_TARGET); await sleep(300);
      await scrollTo('.upg-main', 120)(p); await sleep(600); },
    actions: { 6: click('#upgBtn') } },
  contract: { hash: '#/contracts', frames: 260, focus: ['#dosDesk', '#dosSign', '#dosPadWrap', '.dos-board'],
    prep: S => { S.conSum = 0; },
    setup: async p => { await p.evaluate(() => document.querySelector('#dosAuto').click()); await sleep(800); await scrollTo('#dosDesk', 30)(p); },
    actions: { 6: click('#dosToSign'), 18: scrollTo('#dosSign', 140), 92: click('#dosDoSign') }, sign: [28, 84] },
  withdraw: { hash: '#/profile', frames: 90, focus: ['.toast', '.m-wd', '.wd'],
    setup: async p => { await p.evaluate(() => window.scrollTo(0, 0)); },
    actions: { 4: click('[data-wd="i0"]'), 36: click('#wdGo') } },
  daily: { hash: '#/bonus', frames: 170, focus: ['.bn-daily', '#dailyStrip', '#dailyBtn', '.bn-odds'],
    prep: S => { S.D.daily = 0; },
    setup: scrollTo('.bn-grid', 90), actions: { 6: click('#dailyBtn') } },
  teamCreate: { hash: '#/profile/team', frames: 95, focus: ['.tm-grid', '.tm-card', '.tm-form', '.tm-head', '.tm-inv', '.tm-members'],
    setup: scrollTo('#pfTabs', 40),
    actions: { ...typeIn('#tfName', 'Rush Five', 6), ...typeIn('#tfTag', 'RUSH', 26), ...typeIn('#tfTg', '@rush_cap', 36, 1), 52: click('#tfSave'), 82: click('#tmCopy') } },
  teamJoin: { hash: '#/join/r7Kq2mXa9', frames: 135, focus: ['.tm-join', '.tm-empty', '.tm-members', '.tm-grid'],
    prep: S => { S.name = 'Zeus77'; S.DB.players_pub = S.pub('Zeus77').map(x => x.id === U(5) ? { ...x, name: 'p3gasus' } : x); myTeam(S, U(5), [U(5), U(2), U(3), U(4)]); },
    actions: { 40: click('#jnGo') } },
  tourReg: { hash: '#/tournament/1', frames: 115, focus: ['.trn-hero', '.trn-act', '.trn-rm', '.trn-teams', '.modal'],
    prep: S => { myTeam(S); },
    setup: scrollTo('.trn-hero', 120),
    actions: { 10: click('#trnReg'), 26: p => p.evaluate(() => { const r = [...document.querySelectorAll('.trn-rm-row')]; r[0] && r[0].querySelector('[data-v="main"]').click(); }),
      30: p => p.evaluate(() => { const r = [...document.querySelectorAll('.trn-rm-row')]; r[1] && r[1].querySelector('[data-v="main"]').click(); }),
      34: p => p.evaluate(() => { const r = [...document.querySelectorAll('.trn-rm-row')]; r[2] && r[2].querySelector('[data-v="main"]').click(); }),
      38: p => p.evaluate(() => { const r = [...document.querySelectorAll('.trn-rm-row')]; r[3] && r[3].querySelector('[data-v="main"]').click(); }),
      42: p => p.evaluate(() => { const r = [...document.querySelectorAll('.trn-rm-row')]; r[4] && r[4].querySelector('[data-v="main"]').click(); }),
      56: click('#rmOk') } },
};

// виртуальное время: CSS-анимации/переходы ставим вручную по часам страницы, окончания — сообщаем событиями
const VT_INIT = () => {
  const m = new Map(), done = new WeakSet();
  window.__vt = () => {
    const now = performance.now();
    for (const a of document.getAnimations()) {
      if (!m.has(a)) m.set(a, now - (a.currentTime || 0));
      if (a.playState === 'running') a.pause();
      a.currentTime = Math.max(0, now - m.get(a));
      const tm = a.effect && a.effect.getComputedTiming(), el = a.effect && a.effect.target;
      if (tm && isFinite(tm.endTime) && a.currentTime >= tm.endTime && !done.has(a) && el) {
        done.add(a);
        if (a.transitionProperty) el.dispatchEvent(new TransitionEvent('transitionend', { propertyName: a.transitionProperty, bubbles: true }));
        else if (a.animationName) el.dispatchEvent(new AnimationEvent('animationend', { animationName: a.animationName, bubbles: true }));
      }
    }
  };
};
// звук: вызовы Snd записываем (верхний уровень), сами звуки в браузере съёмки не играем
const SND_HOOK = () => {
  const S = window.__Snd; window.__snd = []; window.__t0 = performance.now(); let depth = 0;
  const skip = new Set(['preload', 'warm', 'preloadSet']);
  for (const k of Object.keys(S)) {
    if (typeof S[k] !== 'function' || skip.has(k)) continue;
    S[k] = function (...args) {
      if (depth === 0) window.__snd.push({ m: k, args: JSON.parse(JSON.stringify(args)), t: (performance.now() - window.__t0) / 1000, kk: document.querySelector('.upg') ? .4 : 1 });
      return k === 'play' ? Promise.resolve(true) : k === 'playCtl' ? Promise.resolve(null) : undefined;
    };
  }
};

async function shoot(browser, name, sc) {
  const p = await browser.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 1600, height: 900, deviceScaleFactor: 3 });
  const S = mockState(); if (sc.prep) sc.prep(S); await p.setRequestInterception(true); attachMock(p, S);
  const base = SITE_URL;
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.evaluate(id => { localStorage.setItem('sb-gkeexoyrxnsarosymdyp-auth-token', JSON.stringify({ access_token: 'x.eyJleHAiOjk5OTk5OTk5OTl9.x', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id, email: 'promo@rushcase.app', aud: 'authenticated' } })); }, ME);
  await p.goto(base + '?promo=1' + sc.hash, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {}); // медленные картинки Steam не должны срывать съёмку
  await p.waitForFunction('window.__d && document.querySelector("#preloader") === null || (document.querySelector("#preloader") || {}).className?.includes("done")', { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  // выпадение: заданный предмет кейса (config.DROP_NAME) или по реальным шансам с фиксированным зерном
  S.casePrice = await p.evaluate(cid => window.__d.caseById(cid).price, C.CASE_ID);
  // результат контракта: оружие в 2–3 раза дороже 5 самых дешёвых предметов (их берёт «Автоподбор»)
  Object.assign(S, await p.evaluate(inv => { const SK = window.__d.SK, ps = inv.map(n => SK[n] ? SK[n].p : 0).sort((a, b) => a - b).slice(0, 5), sum = ps.reduce((a, b) => a + b, 0);
    const c = Object.values(SK).filter(s => s && s.c === 'skin' && /^(AK-47|AWP|M4A4|M4A1-S) |/.test(s.name) && s.p > sum * 2 && s.p < sum * 3).sort((a, b) => b.p - a.p)[0]; return { conSum: Math.round(sum * 100) / 100, conDrop: c ? c.name : 'AWP | Азимов' }; }, S.D.inv.map(x => x.n)));
  S.drop = C.DROP_NAME || await p.evaluate((cid, seed) => { let h = seed >>> 0; const R = () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const c = window.__d.caseById(cid); let r = R(), acc = 0; for (const it of c.items) { acc += it.ch; if (r < acc) return it.name; } return c.items[c.items.length - 1].name; }, C.CASE_ID, C.DROP_SEED);
  await p.evaluate(() => { const l = document.querySelector('.live, #live, .lv'); }); // лента LIVE остаётся как на сайте
  if (sc.setup) await sc.setup(p);
  await sleep(1200);
  // виртуальное время
  const cdp = await p.target().createCDPSession();
  await p.evaluate(VT_INIT); await p.evaluate(SND_HOOK);
  await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  const adv = ms => new Promise(r => { cdp.once('Emulation.virtualTimeBudgetExpired', r); cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: ms }); });
  const dir = path.join(C.FRAMES, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const rects = sels => p.evaluate(sels => Object.fromEntries(sels.map(s => { const e = document.querySelector(s); if (!e) return [s, null]; const q = e.getBoundingClientRect(); return [s, { x: q.left, y: q.top, w: q.width, h: q.height }]; })), sels);
  const clip = await p.evaluate(() => ({ x: scrollX, y: scrollY, w: innerWidth, h: innerHeight })), focus = {};
  // подпись: точки распределяем по кадрам [s0, s1], между штрихами — отрыв пера
  let sig = null;
  for (let f = 0; f < sc.frames; f++) {
    if (sc.actions && sc.actions[f]) await sc.actions[f](p);
    if (sc.sign && f === sc.sign[0]) { const q = await p.evaluate(() => { const c = document.querySelector('#dosPad').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
      const strokes = signature().map(s => s.map(([u, v]) => [q.x + u * q.w, q.y + v * q.h])), total = strokes.reduce((a, s) => a + s.length, 0);
      sig = { strokes, si: 0, pi: 0, per: Math.ceil(total / (sc.sign[1] - sc.sign[0])), down: false }; }
    if (sig && f >= sc.sign[0] && f <= sc.sign[1]) {
      for (let k = 0; k < sig.per && sig.si < sig.strokes.length; k++) {
        const [x, y] = sig.strokes[sig.si][sig.pi];
        await p.mouse.move(x, y);
        if (!sig.down) { await p.mouse.down(); sig.down = true; }
        if (++sig.pi >= sig.strokes[sig.si].length) { await p.mouse.up(); sig.down = false; sig.si++; sig.pi = 0; }
      }
    }
    await adv(1000 / C.FPS);
    await p.evaluate(() => window.__vt());
    if (sc.focus && (f % 10 === 0 || f === sc.frames - 1)) focus[f] = await rects(sc.focus);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 3 }, captureBeyondViewport: false, fromSurface: true });
    fs.writeFileSync(path.join(dir, String(f).padStart(4, '0') + '.jpg'), Buffer.from(shot.data, 'base64'));
  }
  const snd = await p.evaluate(() => window.__snd);
  const prizeImg = await p.evaluate(n => window.__d.SK[n] ? window.__d.imgUrl(window.__d.SK[n], 'l') : '', C.UPG_TARGET);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ clip, focus, frames: sc.frames, dpr: 3, drop: S.drop, conDrop: S.conDrop, prizeImg, snd, errs }, null, 1));
  console.log(`${name}: ${sc.frames} кадров ${Math.round(clip.w * 3)}×${Math.round(clip.h * 3)}, звуков ${snd.length}${name === 'open' ? ', дроп: ' + S.drop : name === 'contract' ? ', контракт: ' + S.conDrop : ''}${errs.length ? ', ошибки: ' + errs.join(' | ') : ''}`);
  await p.close();
}

(async () => {
  const want = process.argv.slice(2), srv = await serve();
  const browser = await puppeteer.launch({ executablePath: C.CHROME, headless: 'new', args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] });
  try { for (const [n, sc] of Object.entries(SCENES)) if (!want.length || want.includes(n)) await shoot(browser, n, sc); }
  finally { await browser.close(); srv.close(); }
})();

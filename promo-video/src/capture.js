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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ME = '00000000-0000-0000-0000-000000000001';
const U = i => `00000000-0000-0000-0000-00000000000${i}`;

// ---------- заглушка сервера ----------
function mockState() {
  const inv = ['AWP | Азимов', 'AK-47 | Азимов', 'M4A4 | Азимов', 'Desert Eagle | Золотой карп', 'P90 | Азимов', 'Glock-18 | Градиент', 'MAC-10 | Янтарный градиент', 'USP-S | Оранжевый анолис']
    .map((n, i) => ({ id: 'i' + i, n, st: 'own', from: 'orange', ts: Date.now() - i * 6e4 }));
  return {
    D: { balance: 4850, rcoin: 120, rlog: [], inv, stats: { opened: 37, spent: 9200 }, daily: Date.now(), promos: [], socials: [], trade: 'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEf12' },
    drop: null, nid: 0,
    DB: {
      players_pub: ['p3gasus', 'Vlad', 's1mpleFan', 'NaVi_Kid', 'Zeus77'].map((n, i) => ({ id: U(i + 1), name: n, ava: null, pid: 100230 + i, steamid: '7656119955635581' + i })),
      teams: [['team-1', 'Rush Five', 'RUSH'], ['team-2', 'Golden Eagles', 'GE'], ['team-3', 'Obsidian', 'OBS'], ['team-4', 'Night Owls', 'OWL'], ['team-5', 'Crown Squad', 'CRWN']]
        .map(([id, name, tag]) => ({ id, name, tag, logo: null, captain: U(9), created_at: '2026-10-27T00:00:00Z' })),
      team_members: [],
      tournaments: [{ id: 1, title: 'RUSH Cup #1', description: 'Первый турнир RUSH CASE по CS2.', rules: '', anticheat: 'Обязателен античит', format: 5, subs_max: 2, max_teams: 16, prize_pool: '50 000 ₽ + скины', prizes: ['Главный приз', '2 место', '3 место'], banner: '/assets/hero-banner.webp', map_pool: ['Ancient', 'Anubis', 'Dust2', 'Inferno', 'Mirage', 'Nuke', 'Train'], reg_end: new Date(Date.now() + 3 * 864e5).toISOString(), starts_at: new Date(Date.now() + 4 * 864e5).toISOString(), status: 'reg', created_at: '2026-10-27T00:00:00Z' }],
      tournament_teams: ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'].map((t, i) => ({ tournament_id: 1, team_id: t, roster: [U(1), U(2), U(3), U(4), U(5)], subs: [], registered_at: '2026-10-27T0' + i + ':00:00Z' })),
    },
  };
}
const filt = (rows, q) => { for (const [k, v] of q.entries()) { if (['select', 'order', 'limit', 'offset'].includes(k)) continue; const [op, ...rest] = v.split('.'); const val = rest.join('.');
  if (op === 'eq') rows = rows.filter(r => String(r[k]) === val); else if (op === 'in') { const set = val.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')); rows = rows.filter(r => set.includes(String(r[k]))); } } return rows; };
function attachMock(p, S) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  p.on('request', r => {
    const u = new URL(r.url());
    if (u.pathname.endsWith('/js/app.js')) { // открываем внутренности сайта для съёмки (сам файл сайта не меняется)
      const s = fs.readFileSync(path.join(C.SITE, 'js/app.js'), 'utf8'), i = s.lastIndexOf('})();');
      return r.respond({ status: 200, contentType: 'application/javascript', body: s.slice(0, i) + 'window.__Snd = Snd; window.__d = { SK, CASES, caseById, st };\n' + s.slice(i) });
    }
    if (!u.host.includes('supabase')) return r.continue();
    if (r.method() === 'OPTIONS') return r.respond({ status: 200, headers: cors });
    const J = (o, s = 200) => r.respond({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
    const D = S.D, m = u.pathname.match(/\/rpc\/(\w+)/);
    if (m) {
      const a = JSON.parse(r.postData() || '{}');
      if (m[1] === 'open_case') { const drops = []; for (let k = 0; k < a.p_n; k++) { const id = 'o' + (++S.nid); D.inv.unshift({ id, n: S.drop, st: 'own', from: a.p_case, ts: Date.now() }); drops.push({ n: S.drop, id }); } D.balance -= 379 * a.p_n; return J({ drops, data: D }); }
      if (m[1] === 'upgrade') { D.inv.forEach(x => { if (a.p_ids.includes(x.id)) x.st = 'upg'; }); const id = 'u' + (++S.nid); D.inv.unshift({ id, n: a.p_target, st: 'own', from: 'upgrade', ts: Date.now() }); return J({ win: true, chance: .45, id, data: D }); }
      if (m[1] === 'withdraw') { D.inv.forEach(x => { if (x.id === a.p_id) x.st = 'out'; }); return J({ data: D }); }
      if (m[1] === 'top_players') return J({ list: [], me: null, total: 0 });
      if (m[1] === 'team_contact' || m[1] === 'team_invite') return J(null);
      return J(null);
    }
    const tm = u.pathname.match(/\/rest\/v1\/(\w+)/);
    if (tm && tm[1] === 'profiles') return J({ id: ME, pid: 100230, luck: 1, name: 'p3gasus', steamid: '76561199556355811', is_admin: false, created_at: '2026-10-25T00:00:00Z', data: D });
    if (tm && tm[1] === 'case_settings') return J([]);
    if (tm && S.DB[tm[1]]) { const rows = filt(S.DB[tm[1]], u.searchParams); return J((r.headers().accept || '').includes('vnd.pgrst.object') ? (rows[0] || null) : rows); }
    return J([]);
  });
}

// ---------- сцены ----------
// setup — подготовка в обычном времени; actions — {кадр: действие}; clip — что снимаем; frames — сколько кадров
const SCENES = {
  catalog: { hash: '#/', frames: 75, focus: ['.cs-block', '.hero3'],
    setup: async p => { await p.evaluate(() => { const b = document.querySelector('.cs-block'); window.scrollTo(0, b.getBoundingClientRect().top + scrollY - 330); }); } },
  open: { hash: '#/case/' + C.CASE_ID, frames: 215, focus: ['.rl-framed', '#rl', '.cp-head h1', '#cc'],
    setup: async p => { await p.evaluate(() => { const f = document.querySelector('#fastChk'); if (f && !f.checked) f.click(); const f2 = document.querySelector('.cp-head'); window.scrollTo(0, f2.getBoundingClientRect().top + scrollY - 24); }); },
    actions: { 8: p => p.evaluate(() => document.querySelector('#openBtn').click()) } },
  upgrade: { hash: '#/upgrade', frames: 150, focus: ['.upg-main', '#wheel', '#upgFrom', '#upgTo'],
    setup: async p => { await p.evaluate(() => { const f = document.querySelector('#upgFastChk'); if (f && !f.checked) f.click(); document.querySelector('#upgSrc [data-inv="i1"]').click(); }); await sleep(300);
      await p.evaluate(() => document.querySelector('#upgMults [data-m="2"]').click()); await sleep(400);
      // цель — оружие около x2 (как выбрал бы игрок), если такое есть в списке
      await p.evaluate(() => { const w = [...document.querySelectorAll('#upgTargets [data-t]')].find(e => /^(AK-47|AWP|M4A4|M4A1-S|Desert Eagle|USP-S|Glock-18) |/.test(e.dataset.t)); if (w) w.click(); const m = document.querySelector('.upg-main'); window.scrollTo(0, m.getBoundingClientRect().top + scrollY - 120); }); await sleep(600); },
    actions: { 6: p => p.evaluate(() => document.querySelector('#upgBtn').click()) } },
  contract: { hash: '#/contracts', frames: 75, focus: ['#dosDesk', '.dos-board', '.dos-side'],
    setup: async p => { await p.evaluate(() => { const d = document.querySelector('#dosDesk'); window.scrollTo(0, d.getBoundingClientRect().top + scrollY - 40); }); },
    actions: { 4: p => p.evaluate(() => document.querySelector('#dosAuto').click()) } },
  withdraw: { hash: '#/profile', frames: 90, focus: ['.toast', '.m-wd', '.wd'],
    setup: async p => { await p.evaluate(() => window.scrollTo(0, 0)); },
    actions: { 4: p => p.evaluate(() => document.querySelector('[data-wd="i0"]').click()),
      36: p => p.evaluate(() => document.querySelector('#wdGo').click()) } },
  tournaments: { hash: '#/tournament/1', frames: 60, focus: ['.trn-hero', '.trn-act', '.trn-hero h1'],
    setup: async p => { await p.evaluate(() => { const h = document.querySelector('.trn-hero'); window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 140); }); } },
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
  const S = mockState(); await p.setRequestInterception(true); attachMock(p, S);
  const base = `http://localhost:${C.PORT}/`;
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.evaluate(id => { localStorage.setItem('sb-gkeexoyrxnsarosymdyp-auth-token', JSON.stringify({ access_token: 'x.eyJleHAiOjk5OTk5OTk5OTl9.x', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id, email: 'promo@rushcase.app', aud: 'authenticated' } })); }, ME);
  await p.goto(base + '?promo=1' + sc.hash, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {}); // медленные картинки Steam не должны срывать съёмку
  await p.waitForFunction('window.__d && document.querySelector("#preloader") === null || (document.querySelector("#preloader") || {}).className?.includes("done")', { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  // выпадение: по реальным шансам выбранного кейса, зерно фиксировано
  S.drop = await p.evaluate((cid, seed) => { let h = seed >>> 0; const R = () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
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
  for (let f = 0; f < sc.frames; f++) {
    if (sc.actions && sc.actions[f]) await sc.actions[f](p);
    await adv(1000 / C.FPS);
    await p.evaluate(() => window.__vt());
    if (sc.focus && [0, 60, 120, 160, sc.frames - 1].includes(f)) focus[f] = await rects(sc.focus);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 3 }, captureBeyondViewport: false, fromSurface: true });
    fs.writeFileSync(path.join(dir, String(f).padStart(4, '0') + '.jpg'), Buffer.from(shot.data, 'base64'));
  }
  const snd = await p.evaluate(() => window.__snd);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ clip, focus, frames: sc.frames, dpr: 3, drop: S.drop, snd, errs }, null, 1));
  console.log(`${name}: ${sc.frames} кадров ${Math.round(clip.w * 3)}×${Math.round(clip.h * 3)}, звуков ${snd.length}${S.drop && name === 'open' ? ', дроп: ' + S.drop : ''}${errs.length ? ', ошибки: ' + errs.join(' | ') : ''}`);
  await p.close();
}

(async () => {
  const want = process.argv.slice(2), srv = await serve();
  const browser = await puppeteer.launch({ executablePath: C.CHROME, headless: 'new', args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] });
  try { for (const [n, sc] of Object.entries(SCENES)) if (!want.length || want.includes(n)) await shoot(browser, n, sc); }
  finally { await browser.close(); srv.close(); }
})();

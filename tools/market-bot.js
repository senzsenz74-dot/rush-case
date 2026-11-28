/* Ночной робот цен: вторая половина после tools/market-sync.js (робот — .github/workflows/market-sync.yml, каждую ночь 4:30 МСК).
   Шансы встроенных кейсов считает сам сайт (js/app.js), поэтому робот открывает сайт в невидимом Chrome (локально, tools/serve.js)
   и берёт оттуда ровно то, что отправил бы на сервер admSync() из #/admin — функцию admSyncData().
     node tools/market-bot.js calc <out.json> [market-db.json]  — открыть сайт из этой папки, посчитать каталог, кейсы, версию и окупаемость всех кейсов;
                                                                  market-db.json — новые составы кейсов из админки (их на сервере ещё нет — подставляются в страницу)
     node tools/market-bot.js report <до.json> <после.json>     — отчёт (Markdown): сколько цен, замен, как сдвинулась окупаемость
     node tools/market-bot.js send <после.json> <market-db.json> — отправить на сервер (supabase/market_bot.sql → market_bot_sync); ключ робота — RC_BOT_KEY (секрет GitHub)
     node tools/market-bot.js check <после.json> <market-db.json> — проверить, что на сервере новая версия и новые составы
   Chrome: переменная CHROME или стандартные пути (Linux google-chrome, Windows Chrome/Edge). Нужен Node 22+ (встроенный WebSocket). */
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const SB_URL = app.match(/SB_URL = '([^']+)'/)[1], SB_KEY = app.match(/SB_KEY = '([^']+)'/)[1];
const [cmd, a1, a2] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const c = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const f = c.find(p => fs.existsSync(p)); if (!f) throw new Error('не нашёл Chrome — укажите путь в переменной CHROME'); return f;
}

async function calc(out, dbFile, volFile) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const db = dbFile && fs.existsSync(dbFile) ? rd(dbFile) : { custom: [], cfg: [] };
  const PORT = 5299, DBG = 9333, kids = [];
  try {
    kids.push(spawn(process.execPath, [path.join(__dirname, 'serve.js'), ROOT, String(PORT)], { stdio: 'ignore' }));
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-bot-'));
    kids.push(spawn(chromePath(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--mute-audio', '--no-first-run', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' }));
    let ws = null;
    for (let i = 0; i < 60 && !ws; i++) {
      await sleep(500);
      try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(), p = l.find(t => t.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { /* ещё запускается */ }
    }
    if (!ws) throw new Error('Chrome не запустился');
    const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
    let id = 0; const wait = new Map();
    sock.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => { const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (m.result.exceptionDetails) throw new Error('страница: ' + JSON.stringify(m.result.exceptionDetails).slice(0, 500)); return m.result.result.value; };
    const load = async () => {
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?bot=1` });
      let ok = false;
      for (let i = 0; i < 180 && !ok; i++) { await sleep(500); ok = await ev(`!!(window.rcBot && rcBot.ready())`).catch(() => false); }
      if (!ok) throw new Error('сайт не загрузился за 90 с: ' + await ev(`JSON.stringify({ url: location.href, bot: !!window.rcBot, body: document.body ? document.body.innerText.slice(0, 120) : '' })`).catch(e => e.message));
    };
    await load();
    // авто-кейсы (buildSet) не должны брать предметы меньше чем с 10 лотами: дописываем такие в window.LOWLOT (js/wears.js) и перезагружаем сайт, пока не останется ни одного
    if (volFile) for (let r = 0; ; r++) {
      const V = rd(volFile), wf = path.join(ROOT, 'js', 'wears.js'), w = fs.readFileSync(wf, 'utf8'), m = w.match(/\nwindow\.LOWLOT = (\[.*\]);\n/);
      const cur = m ? JSON.parse(m[1]) : [], has = new Set(cur), add = new Set();
      for (const g of JSON.parse(await ev('JSON.stringify(rcBot.gen())'))) { const keep = new Set(g.keep); for (const n of g.items) if (!keep.has(n) && !has.has(n) && V[n] != null && V[n] < 10) add.add(n); }
      if (!add.size) { console.log(`LOWLOT: в авто-кейсах редких предметов нет (в списке ${cur.length})`); break; }
      if (r >= 10) throw new Error('LOWLOT: за 10 кругов не сошлось');
      const line = `\nwindow.LOWLOT = ${JSON.stringify([...cur, ...add])};\n`;
      fs.writeFileSync(wf, m ? w.replace(m[0], () => line) : w.replace(/\n?$/, '') + line);
      console.log(`LOWLOT: +${add.size} (${[...add].slice(0, 3).join('; ')}…) — пересчитываю`);
      await load();
    }
    const res = await ev(`rcBot.data(${JSON.stringify(db)})`); // js/app.js, рядом с admSyncData
    sock.close();
    fs.writeFileSync(out, res);
    const d = JSON.parse(res); console.log(`посчитано: каталог ${d.cat.length}, кейсов на сервер ${d.cases.length}, версия ${d.ver}`);
  } finally { kids.forEach(k => { try { k.kill(); } catch (e) { /* */ } }); }
}

async function report(fa, fb) {
  const A = rd(fa), B = rd(fb), sf = path.join(process.env.RC_CACHE || path.join(__dirname, '.cache'), 'market-stat.json'), st = fs.existsSync(sf) ? rd(sf) : null;
  const pa = new Map(A.cat.map(x => [x[0], x[1]])); let up = 0, dn = 0;
  for (const [n, p] of B.cat) { const o = pa.get(n); if (o == null) continue; if (p > o) up++; else if (p < o) dn++; }
  const L = [`## Ночная проверка цен ${st ? st.day : ''}`, ''];
  if (st) L.push(`- Цены с market.csgo × 1.1: ${st.prices.ok} предметов (нет на маркете ${st.prices.miss}, подозрительных — оставлены старые ${st.prices.odd})`,
    `- В кейсах позиций ${st.pos}: к замене ${st.need} (цена уплыла больше 10%, меньше 10 лотов или нет на маркете) → заменено ${st.swap}, оставлено ${st.keep}`,
    `- Кейсов из админки изменено: ${st.custom}, встроенных с составом из админки: ${st.cfg}`);
  L.push(`- Каталог: дороже ${up}, дешевле ${dn}; версия на сервер ${A.ver} → ${B.ver}`);
  const rows = Object.entries(B.rtp).map(([id, b]) => [id, b, A.rtp[id]]).filter(([, b, a]) => a).sort((x, y) => Math.abs(y[1].rtp - y[2].rtp) - Math.abs(x[1].rtp - x[2].rtp));
  const pc = v => (v * 100).toFixed(1) + '%', big = rows.filter(([, b, a]) => Math.abs(b.rtp - a.rtp) > 0.01);
  // окупаемость — сумма шанс × цена по шансам на сайте (с удачей из админки; у кейсов с гарантом без гаранта), «без удачи» — шансы до удачи
  L.push(`- Окупаемость сдвинулась больше чем на 1 п.п. у ${big.length} кейсов из ${rows.length}`, '', '| Кейс | Цена | Окупаемость была → стала | Без удачи была → стала | Удача |', '|---|---|---|---|---|');
  for (const [id, b, a] of rows) L.push(`| ${b.name} (${id})${b.pity ? ' · гарант' : ''} | ${b.price} ₽ | ${pc(a.rtp)} → ${pc(b.rtp)}${Math.abs(b.rtp - a.rtp) > 0.01 ? ' ⚠' : ''} | ${a.rtp0 != null ? pc(a.rtp0) + ' → ' + pc(b.rtp0) : ''} | ${b.luck != null && b.luck !== 1 ? '×' + b.luck : ''} |`);
  console.log(L.join('\n'));
}

async function rpc(name, body) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${name} → ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null;
}
async function sendAll(fb, dbFile) {
  const key = process.env.RC_BOT_KEY; if (!key) throw new Error('нет RC_BOT_KEY (секрет GitHub)');
  const B = rd(fb), db = dbFile && fs.existsSync(dbFile) ? rd(dbFile) : { custom: [], cfg: [] }, N = 4000;
  for (let i = 0; i < B.cat.length; i += N) {
    const last = i + N >= B.cat.length;
    const r = await rpc('market_bot_sync', { p_key: key, p_catalog: B.cat.slice(i, i + N), p_cases: last ? B.cases : null, p_version: last ? B.ver : null, p_custom: last ? db.custom : null, p_cfg: last ? db.cfg : null });
    console.log('сервер:', JSON.stringify(r));
  }
}
async function check(fb, dbFile) {
  const B = rd(fb), db = dbFile && fs.existsSync(dbFile) ? rd(dbFile) : { custom: [], cfg: [] }, h = { headers: { apikey: SB_KEY } };
  const m = await (await fetch(`${SB_URL}/rest/v1/srv_meta?select=v&k=eq.version`, h)).json();
  if (!m[0] || m[0].v !== B.ver) throw new Error(`на сервере версия ${m[0] && m[0].v}, ждали ${B.ver}`);
  const cc = await (await fetch(`${SB_URL}/rest/v1/custom_cases?select=id,items`, h)).json(), bad = [];
  for (const x of db.custom) { const r = cc.find(r => r.id === x.id); if (!r || JSON.stringify(r.items.map(i => i.n)) !== JSON.stringify(x.items.map(i => i.n))) bad.push(x.id); }
  const cf = await (await fetch(`${SB_URL}/rest/v1/site_cfg?select=k,v&k=like.case:*`, h)).json();
  for (const x of db.cfg) { const r = cf.find(r => r.k === x.k); if (!r || JSON.stringify((r.v.items || []).map(i => i.n)) !== JSON.stringify(x.items.map(i => i.n))) bad.push(x.k); }
  if (bad.length) throw new Error('на сервере не те составы: ' + bad.join(', '));
  console.log(`сервер проверен: версия ${B.ver}, кейсов из админки ${db.custom.length}, правок составов ${db.cfg.length} — совпадают`);
}

({ calc: () => calc(a1, a2, process.argv[5]), report: () => report(a1, a2), send: () => sendAll(a1, a2), check: () => check(a1, a2) }[cmd] || (() => { throw new Error('команда: calc | report | send | check'); }))()
  .then(() => process.exit(0), e => { console.error(e.message || e); process.exit(1); });

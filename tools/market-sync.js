/* Цены каталога с market.csgo (+10%) и замена «поплывших» скинов в кейсах. Запуск из корня проекта:  node tools/market-sync.js  [--dry — только отчёт]
   1) качает цены market.csgo (₽: минимальная цена лота и число лотов — prices/RUB.json) и русские названия (class_instance, кэш tools/.cache)
   2) цена на сайте = цена маркета × MUL (1.1: вывод покупается на маркете дешевле, чем стоит на сайте — владелец 18.11.2026).
      Нет на маркете или цена подозрительная (меньше 3 лотов и скачок больше чем в 2,5 раза) — остаётся старая цена (у игроков в инвентаре должна продаваться)
   3) кейсы: позиция, у которой цена сдвинулась больше чем на SWAP (10%) или которой нет на маркете, или у которой меньше MIN_LOTS (10) лотов, меняется на предмет с новой ценой ≈ её старой цене
      (по порядку: тот же скин в другом износе → тот же скин StatTrak/обычный/сувенир → то же оружие той же редкости → то же оружие → та же категория и редкость;
      в кейсе одного оружия (AWP, AK-47…) — только то же оружие). Шанс позиции не меняется. Не нашлось замены — позиция остаётся, шансы подправит сайт (наклон в js/app.js)
      — встроенные кейсы (exact) и PITY_SETS — правятся прямо в js/app.js
      — кейсы из админки (таблица custom_cases) → supabase/market_swap.sql: вставить в Supabase SQL Editor и нажать Run
   4) отчёт о заменах — tools/.cache/market-swap.txt
   После выкладки открыть #/admin на боевом сайте — admSync зальёт на сервер новые цены и кейсы. Lis-Skins (tools/lis-sync.js) больше не запускать — вернёт старые цены. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), JS = path.join(ROOT, 'js'), CACHE = process.env.RC_CACHE || path.join(__dirname, '.cache');
const DRY = process.argv.includes('--dry');
const MUL = 1.1, SWAP = 0.10, MIN_LOTS = 10; // MIN_LOTS: в кейсах только предметы, которых на маркете от 10 лотов (владелец 28.11: редкие сувениры по 1–6 лотов давали завышенную цену)

const SRC = {
  mkt: 'https://market.csgo.com/api/v2/prices/RUB.json',
  ru: 'https://market.csgo.com/api/v2/prices/class_instance/RUB.json',
};
async function get(key, maxAgeH) {
  const f = path.join(CACHE, key + '.json');
  if (fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < maxAgeH * 3600e3) return fs.readFileSync(f, 'utf8');
  console.log('качаю', SRC[key]);
  const r = await fetch(SRC[key], { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(SRC[key] + ' → ' + r.status);
  const t = await r.text(); fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(f, t); return t;
}
const WEAR = { FN: ['Прямо с завода', 'Factory New'], MW: ['Немного поношенное', 'Minimal Wear'], FT: ['После полевых испытаний', 'Field-Tested'], WW: ['Поношенное', 'Well-Worn'], BS: ['Закалённое в боях', 'Battle-Scarred'] };
const r2 = v => Math.round(v * 100) / 100;
const q1 = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`; // строка в одинарных кавычках, как в js/app.js

(async () => {
  const [mktT, ruT] = await Promise.all([get('mkt', 1), get('ru', 24 * 60)]); // названия меняются редко — кэш на 60 дней
  const mk = JSON.parse(mktT); if (!mk.success || !mk.items) throw new Error('market.csgo: пустой ответ');
  const MKT = new Map(mk.items.map(x => [x.market_hash_name, { p: +x.price, v: +x.volume || 0 }]));
  const RU = new Map(); // русское название → market_hash_name
  for (const m of ruT.matchAll(/"market_hash_name":("(?:[^"\\]|\\.)*"),"ru_name":("(?:[^"\\]|\\.)*")/g)) {
    const e = JSON.parse(m[1]), r = JSON.parse(m[2]); if (/[а-яё]/i.test(r) && !RU.has(r)) RU.set(r, e);
  }
  console.log(`market.csgo: ${MKT.size} позиций · русских названий ${RU.size}`);
  const toEn = (name, q) => {
    const full = q ? `${name} (${WEAR[q][0]})` : name;
    if (MKT.has(full)) return full;
    if (RU.has(full)) return RU.get(full);
    const mixed = q ? `${name} (${WEAR[q][1]})` : null; // «AWP | Phobos» с русским износом
    return mixed && MKT.has(mixed) ? mixed : null;
  };

  global.window = {};
  for (const f of ['skins', 'wears', 'extra']) { delete require.cache[path.join(JS, f + '.js')]; require(path.join(JS, f + '.js')); }
  const { SKINS, WEARS, EXTRA } = window;

  // каталог — названия как их строит сайт (js/app.js: addWears / EXTRA): имя на сайте → предмет
  const CAT = new Map(), VAR = new Map();
  const add = (name, base, q, p, en, c, r, set) => { CAT.set(name, { name, base, q, p, en, c, r, set }); if (q) { if (!VAR.has(base)) VAR.set(base, []); VAR.get(base).push(name); } };
  for (const [name, d] of Object.entries(SKINS)) {
    const w = WEARS[name];
    if (w) for (const q of Object.keys(WEAR)) { if (w[q]) add(`${name} (${WEAR[q][0]})`, name, q, w[q], toEn(name, q), 'skin', d.r, v => { w[q] = v; }); }
    else add(name, name, null, d.p, toEn(name), 'skin', d.r, v => { d.p = v; });
  }
  for (const e of EXTRA) {
    const [name, r, p, , c] = e;
    if (CAT.has(name) || VAR.has(name)) continue; // как на сайте: такое имя уже есть в каталоге скинов
    if (typeof p === 'object') for (const q of Object.keys(WEAR)) { if (p[q]) { const n = `${name} (${WEAR[q][1]})`; add(n, name, q, p[q], MKT.has(n) ? n : toEn(name, q), c, r, v => { p[q] = v; }); } }
    else add(name, name, null, p, MKT.has(name) ? name : toEn(name), c, r, v => { e[2] = v; });
  }
  // новые цены
  const st = { ok: 0, up: 0, down: 0, miss: 0, odd: 0 };
  for (const x of CAT.values()) {
    const m = x.en && MKT.get(x.en);
    x.np = x.p; x.ok = false; x.vol = 0;
    if (!m || !(m.p > 0)) { st.miss++; continue; }
    const np = r2(m.p * MUL), k = np / x.p;
    if (m.v < 3 && (k > 2.5 || k < 0.4)) { st.odd++; continue; }
    x.np = np; x.ok = true; x.vol = m.v; st.ok++; if (np > x.p) st.up++; else if (np < x.p) st.down++;
  }
  console.log(`цены: с маркета ${st.ok} (дороже ${st.up}, дешевле ${st.down}) · нет на маркете ${st.miss} · подозрительных (мало лотов, скачок) ${st.odd} — у них старая цена`);

  // ---------- замены в кейсах ----------
  const strip = s => s.replace(/ \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/, '').replace(/^★ /, '').replace(/^(StatTrak™|Souvenir) /, '');
  const fam = x => strip(x.en || x.name), wk = x => fam(x).split(' | ')[0], grp = x => x.c === 'junk' ? 'skin' : x.c;
  const POOL = [...CAT.values()].filter(x => x.ok && x.vol >= MIN_LOTS).sort((a, b) => a.np - b.np);
  const lowIdx = v => { let a = 0, b = POOL.length; while (a < b) { const m = (a + b) >> 1; if (POOL[m].np < v) a = m + 1; else b = m; } return a; };
  // used — названия на сайте, usedEn — market_hash_name (один скин бывает в каталоге и по-русски, и по-английски — в кейс дважды не берём)
  // keep — «лицо» кейса (назван в описании или в тройке самых дорогих на карточке): только тот же скин в другом износе / StatTrak
  function pick(x, used, usedEn, lock, keep) {
    const t = x.p, tiers = [y => y.base === x.base, y => fam(y) === fam(x)];
    if (!keep) tiers.push(y => wk(y) === wk(x) && y.r === x.r, y => wk(y) === wk(x));
    if (!keep && !lock) tiers.push(y => grp(y) === grp(x) && y.r === x.r);
    for (const tol of [SWAP, SWAP * 2]) { // сначала цена ±10%, не нашлось — ±20%
      const win = [];
      for (let i = lowIdx(t * (1 - tol)); i < POOL.length && POOL[i].np <= t * (1 + tol); i++) { const y = POOL[i]; if (!used.has(y.name) && !usedEn.has(y.en) && y.c !== 'cash') win.push(y); }
      for (const f of tiers) {
        let best = null, bd = Infinity;
        for (const y of win) if (f(y)) { const d = Math.abs(Math.log(y.np / t)); if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && y.vol > best.vol)) { best = y; bd = d; } }
        if (best) return best;
      }
    }
    return null;
  }
  const log = [], tot = { pos: 0, need: 0, swap: 0, keep: 0 };
  const ev = (rows, key) => rows.reduce((a, r) => a + r.ch * CAT.get(r.name)[key], 0);
  // rows: [{name, ch, put(newItem), setCh?(шанс)}]; tilt — у кейса нет своего пересчёта (кейсы из админки): шансы наклоняем (шанс × p^t), чтобы окупаемость осталась прежней
  function swapGroup(label, price, rows, tilt = false, sub = '') {
    const used = new Set(rows.map(r => r.name)), usedEn = new Set(rows.map(r => CAT.get(r.name).en).filter(Boolean)), before = ev(rows, 'p');
    const subL = sub.toLowerCase(), top3 = new Set(rows.map(r => CAT.get(r.name)).sort((a, b) => b.p - a.p).slice(0, 3).map(x => x.name));
    const face = x => top3.has(x.name) || [fam(x), strip(x.base)].some(s => { const k = (s.split(' | ')[1] || '').toLowerCase(); return k.length >= 4 && subL.includes(k); });
    const cnt = {}; rows.forEach(r => { const w = wk(CAT.get(r.name)); cnt[w] = (cnt[w] || 0) + 1; });
    const [topW, topN] = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0] || [];
    const lockW = topN >= rows.length * 0.6 ? topW : null;
    const out = [];
    for (const r of rows) {
      const x = CAT.get(r.name); tot.pos++;
      const k = x.np / x.p - 1;
      if (x.ok && Math.abs(k) <= SWAP && x.vol >= MIN_LOTS) continue; // меньше MIN_LOTS лотов — тоже меняем
      tot.need++;
      const fc = face(x), y = pick(x, used, usedEn, lockW && wk(x) === lockW, fc);
      const was = `${x.name}  ${x.p} → ${x.ok ? x.np : 'нет на маркете'}${x.ok ? ` (${k > 0 ? '+' : ''}${(k * 100).toFixed(0)}%, лотов ${x.vol})` : ''}`;
      if (!y) { tot.keep++; out.push(`  оставлен${fc ? ' (джекпот/витрина)' : ''}  ${was}`); continue; }
      tot.swap++; used.add(y.name); if (y.en) usedEn.add(y.en); r.put(y); r.name = y.name;
      out.push(`  ${was}\n      ⇒ ${y.name}  ${y.np} ₽`);
    }
    let after = ev(rows, 'np'), tl = '';
    if (tilt && before > 0 && Math.abs(after / before - 1) > 0.003) {
      const ps = rows.map(r => CAT.get(r.name).np), ch = rows.map(r => r.ch), sum = ch.reduce((a, b) => a + b, 0);
      const w = t => { const v = ch.map((c, i) => c * ps[i] ** t), s = v.reduce((a, b) => a + b, 0); return v.map(x => x / s * sum); };
      const e = t => w(t).reduce((a, c, i) => a + c * ps[i], 0);
      let a = -3, b = 3; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (e(m) < before) a = m; else b = m; }
      w((a + b) / 2).forEach((c, i) => { rows[i].ch = +c.toPrecision(6); rows[i].setCh(rows[i].ch); });
      tl = ` (без подстройки шансов было бы ${(after / price * 100).toFixed(1)}%)`; after = ev(rows, 'np');
    }
    log.push(`${label}${price ? ` · ${price} ₽ · окупаемость по таблице ${(before / price * 100).toFixed(1)}% → ${(after / price * 100).toFixed(1)}%${tl}` : ''}${lockW ? ` · только ${lockW}` : ''}\n${out.join('\n') || '  без замен'}`);
  }

  // встроенные кейсы: exact: [['Скин', 'FT', шанс, 'редкость'?], ...]
  let app = fs.readFileSync(path.join(JS, 'app.js'), 'utf8');
  // кейсы из админки — с сервера, публичным ключом из js/app.js (описание нужно и для PITY_SETS)
  const SB_URL = app.match(/SB_URL = '([^']+)'/)[1], SB_KEY = app.match(/SB_KEY = '([^']+)'/)[1];
  const cr = await fetch(`${SB_URL}/rest/v1/custom_cases?select=id,name,price,sub,items&order=created_at`, { headers: { apikey: SB_KEY } });
  if (!cr.ok) throw new Error('custom_cases → ' + cr.status);
  const custom = await cr.json(), subOf = id => (custom.find(c => c.id === id) || {}).sub || '';
  const edits = []; // [начало, конец, новый текст] в app.js
  const cs = app.indexOf('const CASES = ['), ce = app.indexOf('\n];', cs);
  const ENTRY = /\[\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*,\s*('[A-Z]{2}'|null)\s*,\s*([-+0-9.eE]+)\s*(,\s*'[a-z]+'\s*)?\]/g;
  const resolve = (b, q) => { const v = (VAR.get(b) || []).map(n => CAT.get(n)); return v.find(x => x.q === q) || v.sort((x, y) => x.p - y.p)[0] || CAT.get(b); };
  let nExact = 0;
  for (let at = app.indexOf('exact: [', cs); at > 0 && at < ce; at = app.indexOf('exact: [', at + 1)) {
    const head = app.lastIndexOf("id: '", at), id = app.slice(head + 5, app.indexOf("'", head + 5));
    const hl = app.slice(head, app.indexOf('\n', head)), price = +(hl.match(/price: ([\d.]+)/) || [])[1] || 0;
    let d = 0, j = at + 7; for (; j < ce; j++) { if (app[j] === '[') d++; else if (app[j] === ']') { d--; if (!d) break; } }
    const s0 = at + 7, block = app.slice(s0, j + 1), rows = [];
    for (const m of block.matchAll(ENTRY)) {
      const b = eval(m[1]), q = m[2] === 'null' ? null : m[2].slice(1, 3), it = resolve(b, q);
      if (!it) { console.warn(`${id}: нет в каталоге — ${b}`); continue; }
      const st0 = s0 + m.index, len = m[0].length;
      rows.push({ name: it.name, ch: +m[3], put: y => edits.push([st0, st0 + len, `[${q1(y.base)}, ${y.q ? `'${y.q}'` : 'null'}, ${m[3]}${m[4] ? m[4].replace(/\s+$/, '') : ''}]`]) });
    }
    const sm = app.slice(head, at).match(/sub: ('(?:[^'\\]|\\.)*')/);
    nExact++; swapGroup(`кейс ${id}`, price, rows, false, sm ? eval(sm[1]) : '');
  }
  // PITY_SETS (кейсы из админки с составом из кода): полные названия
  const ps = app.indexOf('const PITY_SETS = {'), pe = app.indexOf('\n};', ps);
  const pblock = app.slice(ps, pe), sets = [...pblock.matchAll(/\n  ([\w$]+): \{/g)];
  sets.forEach((m, i) => {
    const a = m.index, b = i + 1 < sets.length ? sets[i + 1].index : pblock.length, rows = [];
    for (const s of pblock.slice(a, b).matchAll(/'(?:[^'\\]|\\.)*'/g)) {
      const n = eval(s[0]); if (!CAT.has(n)) continue;
      const st0 = ps + a + s.index, len = s[0].length;
      rows.push({ name: n, ch: 0, put: y => edits.push([st0, st0 + len, q1(y.name)]) });
    }
    swapGroup(`PITY_SETS ${m[1]}`, 0, rows, false, subOf(m[1]));
  });
  // кейсы из админки (custom_cases)
  const sql = [];
  for (const c of custom) {
    const rows = [];
    (c.items || []).forEach(it => { if (CAT.has(it.n)) rows.push({ name: it.n, ch: +it.ch, put: y => { it.n = y.name; }, setCh: v => { it.ch = v; } }); });
    const was = JSON.stringify(c.items); swapGroup(`админка ${c.id} «${c.name}»`, +c.price, rows, true, c.sub || '');
    if (JSON.stringify(c.items) !== was) sql.push(`update public.custom_cases set items = $j$${JSON.stringify(c.items)}$j$::jsonb where id = ${q1(c.id)};`);
  }
  console.log(`кейсов: встроенных ${nExact}, PITY_SETS ${sets.length}, из админки ${custom.length}`);
  console.log(`позиций ${tot.pos}: поплыли ${tot.need} → заменено ${tot.swap}, без замены оставлено ${tot.keep}`);

  const day = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(path.join(CACHE, 'market-swap.txt'), `Замены ${day} (цены market.csgo × ${MUL}, порог ${SWAP * 100}%)\n\n` + log.join('\n\n') + '\n');
  console.log('отчёт:', path.join(CACHE, 'market-swap.txt'));
  if (DRY) return console.log('--dry: файлы не менялись');

  // запись: цены
  for (const x of CAT.values()) if (x.ok) x.set(x.np);
  for (const [name, d] of Object.entries(SKINS)) { const w = WEARS[name]; if (w) { const q = ['FT', 'MW', 'WW', 'FN', 'BS'].find(k => w[k]); if (q) d.p = w[q]; } }
  const src = `market.csgo × ${MUL}, ₽ на ${day}, tools/market-sync.js`;
  fs.writeFileSync(path.join(JS, 'skins.js'), `/* Каталог скинов: r — редкость, p — цена ₽ (${src}), i — хэш картинки Steam CDN */\nwindow.SKINS = {` +
    Object.entries(SKINS).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '};\n');
  fs.writeFileSync(path.join(JS, 'wears.js'), `/* Цены скинов каталога по износу (${src}): FN — прямо с завода, MW — немного поношенное, FT — после полевых, WW — поношенное, BS — закалённое в боях */\nwindow.WEARS = ${JSON.stringify(WEARS)};\n`);
  fs.writeFileSync(path.join(JS, 'extra.js'), `/* Доп. предметы (${src}): [название, редкость, цена ₽ или {износ: цена}, хэш картинки Steam, категория] */\nwindow.EXTRA = ${JSON.stringify(EXTRA)};\n`);
  // запись: составы кейсов в js/app.js (с конца, чтобы смещения не съехали)
  edits.sort((a, b) => b[0] - a[0]).forEach(([a, b, t]) => { app = app.slice(0, a) + t + app.slice(b); });
  fs.writeFileSync(path.join(JS, 'app.js'), app);
  // запись: SQL для кейсов из админки
  fs.writeFileSync(path.join(ROOT, 'supabase', 'market_swap.sql'),
    `-- Кейсы из админки: замена скинов, у которых цена сдвинулась больше чем на ${SWAP * 100}% после перехода на цены market.csgo × ${MUL} (tools/market-sync.js, ${day}).\n` +
    `-- Шансы позиций прежние; где окупаемость всё же сдвинулась (замены не нашлось) — шансы чуть наклонены, чтобы она осталась как была.\n` +
    `-- Вставить в Supabase → SQL Editor → Run. Сначала сохраняется копия старых составов (откат: update custom_cases c set items = b.items from <копия> b where b.id = c.id).\n` +
    (sql.length ? `create table if not exists public.custom_cases_bak_${day.replace(/-/g, '')} as select id, items, now() as saved_at from public.custom_cases;\n` +
      `alter table public.custom_cases_bak_${day.replace(/-/g, '')} enable row level security;\n` + sql.join('\n') : '-- замен нет') + '\n');
  console.log(`записано: skins.js, wears.js, extra.js, app.js (${edits.length} замен), supabase/market_swap.sql (${sql.length} кейсов)`);
})().catch(e => { console.error(e); process.exit(1); });

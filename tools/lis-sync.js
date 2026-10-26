/* Цены каталога с Lis-Skins + новые предметы. Запуск из корня проекта:  node tools/lis-sync.js
   1) качает цены Lis-Skins (USD), курс ЦБ, русские названия (market.csgo) и картинки/редкости (ByMykel CSGO-API) — кэш в tools/.cache
   2) обновляет цены в js/skins.js, js/wears.js, js/extra.js (то, чего нет на Lis-Skins, остаётся по старой цене)
   3) добавляет в js/extra.js предметы Lis-Skins, которых ещё нет на сайте (кроме кейсов, ключей и слэбов)
   Кейсы пересобираются на сайте сами по новым ценам; на сервер — открыть админку (admSync). */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), JS = path.join(ROOT, 'js'), CACHE = path.join(__dirname, '.cache');
// какие новые предметы добавлять: от MIN ₽ и не меньше MIN_LOTS лотов на Lis-Skins; наклейки — от STICKER_MIN ₽ (их тысячи)
const MIN = 5, MIN_LOTS = 2, STICKER_MIN = 150;

const SRC = {
  lis: 'https://lis-skins.com/market_export_json/csgo.json',
  ru: 'https://market.csgo.com/api/v2/prices/class_instance/RUB.json',
  ds: 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/all.json',
  cbr: 'https://www.cbr-xml-daily.ru/daily_json.js',
};
async function get(key, maxAgeH = 6) {
  const f = path.join(CACHE, key + '.json');
  if (fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < maxAgeH * 3600e3) return fs.readFileSync(f, 'utf8');
  console.log('качаю', SRC[key]);
  const r = await fetch(SRC[key], { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(SRC[key] + ' → ' + r.status);
  const t = await r.text(); fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(f, t); return t;
}

const WEAR = { FN: ['Прямо с завода', 'Factory New'], MW: ['Немного поношенное', 'Minimal Wear'], FT: ['После полевых испытаний', 'Field-Tested'], WW: ['Поношенное', 'Well-Worn'], BS: ['Закалённое в боях', 'Battle-Scarred'] };
const Q_EN = Object.fromEntries(Object.entries(WEAR).map(([q, [, en]]) => [en, q]));
const splitWear = n => { const m = n.match(/^(.*) \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/); return m ? [m[1], Q_EN[m[2]]] : [n, null]; };
const RAR = { common: 'common', uncommon: 'uncommon', rare: 'milspec', mythical: 'restricted', legendary: 'classified', ancient: 'covert', contraband: 'covert', immortal: 'covert' };
const r2 = v => Math.round(v * 100) / 100;

(async () => {
  const [lisT, ruT, dsT, cbrT] = await Promise.all([get('lis'), get('ru', 24), get('ds', 24 * 7), get('cbr')]);
  const rate = JSON.parse(cbrT).Valute.USD.Value;
  // цена вывода: без трейд-бана (unlocked_price), иначе обычная
  const LIS = new Map(JSON.parse(lisT).map(x => [x.name, { rub: r2((x.unlocked_price || x.price) * rate), n: x.count }]));
  const RU = new Map(); // русское название → market_hash_name
  for (const m of ruT.matchAll(/"market_hash_name":("(?:[^"\\]|\\.)*"),"ru_name":("(?:[^"\\]|\\.)*")/g)) {
    const e = JSON.parse(m[1]), r = JSON.parse(m[2]); if (/[а-яё]/i.test(r) && !RU.has(r)) RU.set(r, e);
  }
  const DS = new Map(); for (const x of Object.values(JSON.parse(dsT))) if (x.market_hash_name && !DS.has(x.market_hash_name)) DS.set(x.market_hash_name, x);
  console.log(`курс ЦБ ${rate} ₽/$ · Lis-Skins ${LIS.size} позиций · русских названий ${RU.size}`);

  global.window = {};
  for (const f of ['skins', 'wears', 'extra']) { delete require.cache[path.join(JS, f + '.js')]; require(path.join(JS, f + '.js')); }
  const { SKINS, WEARS, EXTRA } = window;

  // русское (или смешанное) название с износом → английское
  const toEn = (ruBase, q) => {
    const full = q ? `${ruBase} (${WEAR[q][0]})` : ruBase;
    if (LIS.has(full)) return full;
    if (RU.has(full)) return RU.get(full);
    const mixed = q ? `${ruBase} (${WEAR[q][1]})` : null; // «AWP | Phobos» с русским износом
    return mixed && LIS.has(mixed) ? mixed : null;
  };
  const have = new Set(), enBase = new Map(); // английская база → куда дописывать новые износы
  const st = { upd: 0, keep: 0, up: 0, down: 0 };
  const setP = (en, old, apply) => {
    const l = en && LIS.get(en);
    if (!l) { st.keep++; return; }
    have.add(en); st.upd++; if (l.rub > old) st.up++; else if (l.rub < old) st.down++;
    apply(l.rub);
  };
  for (const [name, d] of Object.entries(SKINS)) {
    const w = WEARS[name];
    if (w) for (const q of Object.keys(w)) { const en = toEn(name, q); setP(en, w[q], v => { w[q] = v; }); if (en) enBase.set(splitWear(en)[0], { w }); }
    else setP(toEn(name), d.p, v => { d.p = v; });
  }
  for (const e of EXTRA) {
    const [name, , p] = e;
    if (typeof p === 'object') { for (const q of Object.keys(p)) setP(`${name} (${WEAR[q][1]})`, p[q], v => { p[q] = v; }); enBase.set(name, { w: p }); }
    else setP(name, p, v => { e[2] = v; });
  }
  // у скинов с износами — цена «по умолчанию» (p в skins.js) = основной износ, как на сайте
  for (const [name, d] of Object.entries(SKINS)) { const w = WEARS[name]; if (w) { const q = ['FT', 'MW', 'WW', 'FN', 'BS'].find(k => w[k]); if (q) d.p = w[q]; } }

  // новые предметы
  const cat = d => {
    const t = d.id.split('-')[0], cid = d.category && d.category.id || '';
    if (t === 'skin') return /melee|knife/i.test(cid) ? 'knife' : /gloves/i.test(cid) ? 'gloves' : /rarity_(common|uncommon)_weapon/.test(d.rarity && d.rarity.id || '') ? 'junk' : 'skin';
    return { agent: 'agent', sticker: 'sticker', graffiti: 'graffiti', collectible: 'pin', music_kit: 'music', patch: 'patch', keychain: 'charm' }[t] || null;
  };
  const rar = (d, c) => {
    if (c === 'knife' || c === 'gloves') return 'rare';
    const m = (d.rarity && d.rarity.id || '').match(/^rarity_([a-z]+)/); return (m && RAR[m[1]]) || 'common';
  };
  const added = new Map(); let addW = 0, skipped = 0;
  for (const [en, l] of LIS) {
    if (have.has(en)) continue;
    const d = DS.get(en), c = d && cat(d);
    const img = d && d.image && (d.image.match(/\/economy\/image\/([^/?#]+)/) || [])[1];
    if (!c || !img || l.rub < (c === 'sticker' ? STICKER_MIN : MIN) || l.n < MIN_LOTS) { skipped++; continue; }
    const [base, q] = splitWear(en);
    const ex = q && enBase.get(base);
    if (ex) { if (!ex.w[q]) { ex.w[q] = l.rub; addW++; } continue; } // недостающий износ уже известного скина
    let a = added.get(base);
    if (!a) { a = [base, rar(d, c), q ? {} : l.rub, img, c]; added.set(base, a); }
    if (q) a[2][q] = l.rub; else if (typeof a[2] === 'object') skipped++;
  }
  const newE = [...added.values()].filter(a => typeof a[2] !== 'object' || Object.keys(a[2]).length);
  const byC = {}; newE.forEach(a => { byC[a[4]] = (byC[a[4]] || 0) + 1; });
  console.log(`цены: обновлено ${st.upd} (дороже ${st.up}, дешевле ${st.down}), нет на Lis-Skins — оставлены ${st.keep}`);
  console.log(`новые: ${newE.length} предметов`, byC, `· износов к старым скинам ${addW} · пропущено ${skipped}`);

  const day = new Date().toISOString().slice(0, 10);
  const skinsSrc = '/* Каталог скинов: r — редкость, p — цена ₽, i — хэш картинки Steam CDN */\nwindow.SKINS = {' +
    Object.entries(SKINS).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '};\n';
  fs.writeFileSync(path.join(JS, 'skins.js'), skinsSrc);
  fs.writeFileSync(path.join(JS, 'wears.js'), `/* Цены скинов каталога по износу (Lis-Skins, ₽ по курсу ЦБ ${rate} на ${day}): FN — прямо с завода, MW — немного поношенное, FT — после полевых, WW — поношенное, BS — закалённое в боях */\nwindow.WEARS = ${JSON.stringify(WEARS)};\n`);
  fs.writeFileSync(path.join(JS, 'extra.js'), `/* Доп. предметы (цены Lis-Skins, ₽ по курсу ЦБ ${rate} на ${day}): [название, редкость, цена ₽ или {износ: цена}, хэш картинки Steam, категория] */\nwindow.EXTRA = ${JSON.stringify([...EXTRA, ...newE])};\n`);
  for (const f of ['skins', 'wears', 'extra']) console.log(f + '.js', (fs.statSync(path.join(JS, f + '.js')).size / 1024).toFixed(0), 'КБ');
})().catch(e => { console.error(e); process.exit(1); });

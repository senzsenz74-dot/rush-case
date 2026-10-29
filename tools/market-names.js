/* Английские названия предметов (market_hash_name) для вывода через market.csgo. Запуск из корня:  node tools/market-names.js
   На сайте предметы называются по-русски («AK-47 | Красная линия (После полевых испытаний)»), маркету нужен market_hash_name.
   Берёт кэш tools/.cache (lis.json, ru.json — их качает tools/lis-sync.js) и пишет supabase/market_names.sql
   (таблица public.market_names: n — название на сайте, h — market_hash_name; только где они различаются — иначе название на сайте и есть market_hash_name). После нового каталога — запустить снова и выполнить SQL. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), JS = path.join(ROOT, 'js'), CACHE = path.join(__dirname, '.cache');
const WEAR = { FN: ['Прямо с завода', 'Factory New'], MW: ['Немного поношенное', 'Minimal Wear'], FT: ['После полевых испытаний', 'Field-Tested'], WW: ['Поношенное', 'Well-Worn'], BS: ['Закалённое в боях', 'Battle-Scarred'] };

const LIS = new Set(JSON.parse(fs.readFileSync(path.join(CACHE, 'lis.json'), 'utf8')).map(x => x.name));
const RU = new Map(), EN = new Set();
for (const m of fs.readFileSync(path.join(CACHE, 'ru.json'), 'utf8').matchAll(/"market_hash_name":("(?:[^"\\]|\\.)*"),"ru_name":("(?:[^"\\]|\\.)*")/g)) {
  const e = JSON.parse(m[1]), r = JSON.parse(m[2]); EN.add(e); if (/[а-яё]/i.test(r) && !RU.has(r)) RU.set(r, e);
}
const known = n => LIS.has(n) || EN.has(n);
const toEn = (name, q) => {
  const full = q ? `${name} (${WEAR[q][0]})` : name;
  if (known(full)) return full;
  if (RU.has(full)) return RU.get(full);
  const mixed = q ? `${name} (${WEAR[q][1]})` : null;
  return mixed && known(mixed) ? mixed : null;
};

global.window = {};
for (const f of ['skins', 'wears', 'extra']) require(path.join(JS, f + '.js'));
const { SKINS, WEARS, EXTRA } = window;
const map = new Map(), miss = [];
const put = (site, en) => { if (en) map.set(site, en); else miss.push(site); };
// названия — как их строит сайт (js/app.js: addWears / EXTRA)
for (const name of Object.keys(SKINS)) {
  const w = WEARS[name];
  if (w) for (const q of Object.keys(WEAR)) { if (w[q]) put(`${name} (${WEAR[q][0]})`, toEn(name, q)); }
  else put(name, toEn(name));
}
for (const [name, , p] of EXTRA) {
  if (typeof p === 'object') for (const q of Object.keys(WEAR)) { if (p[q]) { const n = `${name} (${WEAR[q][1]})`; if (!map.has(n)) put(n, known(n) ? n : toEn(name, q)); } }
  else if (!map.has(name)) put(name, known(name) ? name : toEn(name));
}
// у части износов нет русского названия на маркете — английская база берётся из другого износа того же скина
const enBase = new Map();
for (const [n, h] of map) { const a = n.match(/^(.*) \(([^()]*)\)$/), b = h.match(/^(.*) \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/); if (a && b) enBase.set(a[1], b[1]); }
const WQ = Object.fromEntries(Object.values(WEAR).flatMap(([ru, en]) => [[ru, en], [en, en]]));
for (let i = miss.length - 1; i >= 0; i--) {
  const a = miss[i].match(/^(.*) \(([^()]*)\)$/);
  if (a && enBase.has(a[1]) && WQ[a[2]]) { map.set(miss[i], `${enBase.get(a[1])} (${WQ[a[2]]})`); miss.splice(i, 1); }
}
// ванильные ножи на маркете без износа; скины, чьих русских названий маркет не знает, — вручную (проверяются по списку маркета)
const MANUAL = { 'Galil AR | Водная терраса': 'Galil AR | Aqua Terrace', 'AK-47 | Синий ламинат': 'AK-47 | Blue Laminate', '★ Kukri Knife | Убийство': '★ Kukri Knife | Slaughter', 'ПП-19 «Бизон» | Space Cat': 'PP-Bizon | Space Cat', 'P2000 | Огненный элементаль': 'P2000 | Fire Elemental', 'ПП-19 Бизон | Городская штриховка': 'PP-Bizon | Urban Dashed', 'Galil AR | Смешанный камуфляж': 'Galil AR | Varicamo', 'Sawed-Off | Медь': 'Sawed-Off | Copper', 'Galil AR | Синий титан': 'Galil AR | Blue Titanium', 'AWP | Чёрный Нил': 'AWP | Black Nile', 'MP9 | Гипнотический': 'MP9 | Hypnotic', 'R8 Revolver | Градиент': 'R8 Revolver | Fade', 'USP-S | Убийство подтверждено': 'USP-S | Kill Confirmed' };
for (let i = miss.length - 1; i >= 0; i--) {
  const a = miss[i].match(/^(.*) \(([^()]*)\)$/);
  const h = a && /^★ [^|]+$/.test(a[1]) ? a[1] : a && MANUAL[a[1]] && WQ[a[2]] ? `${MANUAL[a[1]]} (${WQ[a[2]]})` : null;
  if (h && (known(h) || /^★ [^|]+$/.test(h))) { map.set(miss[i], h); miss.splice(i, 1); }
}
const q = s => "'" + s.replace(/'/g, "''") + "'";
const rows = [...map].filter(([n, h]) => n !== h).map(([n, h]) => `(${q(n)},${q(h)})`);
let sql = `-- market_hash_name для вывода через market.csgo (генерирует tools/market-names.js — руками не править)\n`
  + `create table if not exists public.market_names (n text primary key, h text not null);\nalter table public.market_names enable row level security;\n`;
for (let i = 0; i < rows.length; i += 500) sql += `insert into public.market_names (n, h) values\n${rows.slice(i, i + 500).join(',\n')}\non conflict (n) do update set h = excluded.h;\n`;
sql += `select count(*) as market_names from public.market_names;\n`;
fs.writeFileSync(path.join(ROOT, 'supabase', 'market_names.sql'), sql);
console.log(`соответствий ${map.size}, без английского названия ${miss.length}`);
if (miss.length) console.log('скины без названия (их вывод — вручную из админки):\n' + [...new Set(miss.map(n => n.replace(/ \([^()]*\)$/, '')))].join('\n'));

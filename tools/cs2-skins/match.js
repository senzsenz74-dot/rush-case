// Сопоставление: скины из кейсов сайта + каталоги сайта (skins.js, extra.js) → пары игры (оружие, окраска).
// Запуск: node match.js  (после node catalog.js) → C:/Users/Admin/tools/cs2x/site_skins.json
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '../..') + '/', R = 'C:/Users/Admin/tools/cs2x';
const app = fs.readFileSync(S + 'js/app.js', 'utf8');
const inCase = new Map(); for (const [, n] of app.matchAll(/\[\s*'([^']+)',\s*'(?:FN|MW|FT|WW|BS)'/g)) inCase.set(n, (inCase.get(n) || 0) + 1);
global.window = {}; eval(fs.readFileSync(S + 'js/skins.js', 'utf8')); eval(fs.readFileSync(S + 'js/extra.js', 'utf8'));
const price = new Map(); for (const [k, v] of Object.entries(window.SKINS)) price.set(k, v.p);
for (const e of window.EXTRA) { const p = typeof e[2] == 'object' ? Math.max(...Object.values(e[2])) : e[2]; const n = e[0]; if (!price.has(n) || price.get(n) < p) price.set(n, p); }
for (const n of inCase.keys()) if (!price.has(n)) price.set(n, 0);
const cat = require(R + '/catalog.json'); const by = new Map();
for (const c of cat) { const [wr, sr] = c.ru.split(' | '), [we, se] = c.en.split(' | '); for (const a of [wr, we]) for (const b of [sr, se]) by.set((a + ' | ' + b).toLowerCase(), c); }
const norm = n => n.replace(/ \([^)]+\)$/, '').replace(/StatTrak™ /, '').replace(/^Souvenir /, '').replace(/^Сувенирный /, '').toLowerCase();
const res = new Map(); const miss = [];
for (const [n, p] of price) {
  const c = by.get(norm(n)); if (!c) { miss.push(n); continue; }
  const id = c.w + ':' + c.kit; const r = res.get(id) || { ...c, names: new Set(), p: 0, cases: 0 };
  r.names.add(n); r.p = Math.max(r.p, p || 0); r.cases += inCase.get(n) || 0; res.set(id, r);
}
const arr = [...res.values()].map(r => ({ ...r, names: [...r.names] }));
fs.writeFileSync(R + '/site_skins.json', JSON.stringify(arr));
console.log('site names', price.size, 'matched skins', arr.length, 'miss', miss.length, 'inCase', inCase.size, 'case matched', arr.filter(r => r.cases).length);
console.log(miss.filter(x => /^(AK-47|AWP|M4A|Desert|USP|Glock|★ [^|]+\|)/.test(x)).slice(0, 30).join('\n'));

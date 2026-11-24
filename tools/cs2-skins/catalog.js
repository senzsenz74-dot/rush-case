// Каталог всех скинов CS2 из файлов игры: «оружие | окраска» (рус. и англ.) → weapon_*, paint kit.
// Пары оружие×окраска — по иконкам econ/default_generated в списке VPK (там есть и ножи, и перчатки).
// Запуск: node catalog.js  → C:/Users/Admin/tools/cs2x/catalog.json
const fs = require('fs');
const R = 'C:/Users/Admin/tools/cs2x';
const IG = fs.readFileSync(R + '/scripts/items/items_game.txt', 'utf8');
const loc = f => { const m = new Map(); for (const [, k, v] of fs.readFileSync(R + '/resource/' + f, 'utf8').matchAll(/^\s*"([^"]+)"\s+"([^"]*)"/gm)) m.set(k.toLowerCase(), v); return m; };
const RU = loc('csgo_russian.txt'), EN = loc('csgo_english.txt');
const T = (m, tag) => tag && m.get(tag.replace(/^#/, '').toLowerCase());
// окраски: name → {tag, legacy, style}
const kits = new Map();
for (const b of IG.matchAll(/"name"\s+"([a-z0-9_\-]+)"\s*\n((?:[^{}\n]*\n){0,14})/g)) {
  const tag = /"description_tag"\s+"([^"]+)"/.exec(b[2]); if (!tag) continue;
  if (!kits.has(b[1])) kits.set(b[1], { tag: tag[1], legacy: /"use_legacy_model"\s+"1"/.test(b[2]) });
}
// оружие: weapon_* → item_name (у винтовок/пистолетов — в prefab)
const wname = new Map();
for (const b of IG.matchAll(/"(weapon_[a-z0-9_]+?)(_prefab)?"\s*\n\s*\{\s*\n((?:[^{}\n]*\n){0,8})/g)) {
  const n = /"item_name"\s+"([^"]+)"/.exec(b[3]); if (n && !wname.has(b[1])) wname.set(b[1], n[1]);
}
for (const b of IG.matchAll(/"name"\s+"((?:weapon|studded|leather|sporty|slick|motorcycle|specialist)[a-z0-9_]*)"\s*\n((?:[^{}\n]*\n){0,6})/g)) {
  const n = /"item_name"\s+"([^"]+)"/.exec(b[2]); if (n && !wname.has(b[1])) wname.set(b[1], n[1]);
}
const WEAP = [...wname.keys()].sort((a, b) => b.length - a.length);
const out = [];
const seen = new Set();
for (const [, w0] of fs.readFileSync(R + '/vpk_list.txt', 'utf8').matchAll(/econ\/default_generated\/([a-z0-9_\-]+?)_light_png\.vtex_c/g)) {
  const w = WEAP.find(x => w0.startsWith(x + '_')); if (!w) continue;
  const kit = w0.slice(w.length + 1), k = kits.get(kit); if (!k || seen.has(w0)) continue; seen.add(w0);
  const star = /knife|bayonet|glove|hand_wraps/.test(w) || /^(studded|leather|sporty|slick|motorcycle|specialist)/.test(w) ? '★ ' : '';
  out.push({ w, kit, legacy: k.legacy, ru: star + T(RU, wname.get(w)) + ' | ' + T(RU, k.tag), en: star + T(EN, wname.get(w)) + ' | ' + T(EN, k.tag) });
}
fs.writeFileSync(R + '/catalog.json', JSON.stringify(out));
console.log('kits', kits.size, 'weapons', wname.size, 'combos', out.length);

// Выбирает скины-«наполнители» для рулетки баннера из каталога сайта (js/skins.js) → src/items.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'js/skins.js'), 'utf8');
const win = {}; new Function('window', src)(win);
const want = ['AK-47', 'AWP', 'M4A4', 'M4A1-S', 'Desert Eagle', 'USP-S', 'Glock-18', 'MP9', 'MAC-10', 'P250', 'FAMAS', 'Galil AR', 'P90', 'SSG 08'];
const rar = { milspec: 3, restricted: 3, classified: 3, covert: 3 };
const out = [], used = new Set();
for (const w of want) for (const [n, s] of Object.entries(win.SKINS)) {
  if (!n.startsWith(w + ' |') || used.has(w) || !rar[s.r] || !s.k) continue;
  if (!fs.existsSync(path.join(root, 'assets/skins', s.k + '-l.webp'))) continue;
  rar[s.r]--; used.add(w); out.push({ n, r: s.r, img: '../../assets/skins/' + s.k + '-l.webp' }); break;
}
fs.writeFileSync(path.join(__dirname, 'items.js'), '// создано pick-items.js\nwindow.REEL_ITEMS = ' + JSON.stringify(out, null, 1) + ';\n');
console.log(out.map(o => o.r + '  ' + o.n).join('\n'));

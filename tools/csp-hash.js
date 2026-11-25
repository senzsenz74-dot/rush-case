// RUSH CASE — пересчитать отпечаток importmap в защите CSP (index.html). Запуск: node tools/csp-hash.js
// Нужен, только если поменяли текст <script type="importmap"> (например, версию three.js); иначе 3D на сайте не загрузится.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const f = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(f, 'utf8');
const m = s.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!m) { console.log('importmap не найден'); process.exit(1); }
const h = "'sha256-" + crypto.createHash('sha256').update(m[1]).digest('base64') + "'";
s = s.replace(/'sha256-[A-Za-z0-9+/=]+'/, h);
fs.writeFileSync(f, s);
console.log('CSP: importmap', h);

// Звание 10 «Легенда рулетки» — картинка владельца (21.11, tools/rr/src/rank-10-owner.webp, фон уже прозрачный):
// обрезка по содержимому и уменьшение до 400 px (значки на сайте не шире ~150 px) → tools/rr/src/rank-10.webp; дальше tools/rr/ranks.js встраивает её в assets/rr/ranks/rank-10.svg
// Запуск: node tools/rr/rank10-prep.js  (sharp — из promo-video/node_modules)
const path = require('path'); let sharp; try { sharp = require('sharp'); } catch (e) { sharp = require('D:/Кейсы/promo-video/node_modules/sharp'); }
const src = path.join(__dirname, 'src/rank-10-owner.webp'), out = path.join(__dirname, 'src/rank-10.webp');
sharp(src).trim({ threshold: 1 }).resize({ width: 400 }).webp({ quality: 88, alphaQuality: 100 }).toFile(out)
  .then(i => console.log('ok', i.width + '×' + i.height, i.size, 'байт →', out));

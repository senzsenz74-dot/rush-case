// Новогодний ивент: морозный узор для «ледяного слоя» на карточках кейсов (владелец 25.11: лёд на карточке, при наведении тает).
// Рисует иней как на зимнем стекле: «папоротники» растут от краёв внутрь (ствол + боковые ветки под ~60°, 3 уровня),
// мелкие шестилучевые кристаллы, крупинки изморози; по краям плотно, к центру редко — кейс просвечивает.
// Выход: assets/ny/frost.webp (RGBA, 768×720). Запуск: node tools/ny-frost.mjs [seed]
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const sharp = require('D:/Кейсы/promo-video/node_modules/sharp');
const W = 768, H = 720, OUT = 'assets/ny/frost.webp';
let seed = +(process.argv[2] || 2027) >>> 0;
const R = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const f1 = v => v.toFixed(1);
const edgeD = (x, y) => Math.min(x, y, W - x, H - y) / (Math.min(W, H) / 2); // 0 у края … 1 в центре

const paths = [], dots = [], stars = [];
// ветка-«перо»: ствол слегка изгибается, по нему часто растут короткие бородки под ~60° (поочерёдно в обе стороны),
// бородки уровня выше сами в бородках — так выглядит настоящий иней на стекле. d — уровень (2 → 1 → 0)
function branch(x, y, a, len, w, d) {
  const step = d === 2 ? 5 : d === 1 ? 3.2 : 2.4, seg = Math.max(2, Math.round(len / step)), pts = [[x, y]];
  let cx = x, cy = y, ca = a, bend = (R() - .5) * .025;
  for (let i = 1; i <= seg; i++) {
    ca += bend + (R() - .5) * .06; const st = len / seg;
    cx += Math.cos(ca) * st; cy += Math.sin(ca) * st; pts.push([cx, cy]);
    if (cx < -30 || cy < -30 || cx > W + 30 || cy > H + 30) break;
    const k = 1 - i / seg;                                              // к концу бородки короче
    if (d > 0 && i < seg - 1 && R() < (d === 2 ? .85 : .7)) {
      const side = (i % 2 ? 1 : -1), bl = len * (d === 2 ? .2 + R() * .14 : .3 + R() * .2) * (.25 + k * .9);
      if (bl > 2.5) branch(cx, cy, ca + side * (1.02 + (R() - .5) * .2), bl, w * .5, d - 1);
    }
  }
  const op = d === 2 ? .7 : d === 1 ? .5 : .36;
  paths.push(`<path d="M${pts.map(p => f1(p[0]) + ' ' + f1(p[1])).join(' L')}" stroke-width="${f1(Math.max(.45, w))}" stroke-opacity="${op}"/>`);
}
// перья от краёв (по периметру, гуще и длиннее в углах)
for (let i = 0; i < 96; i++) {
  const side = i % 4, t = R(), corner = Math.pow(Math.abs(t - .5) * 2, 2);
  let x, y, a;
  if (side === 0) { x = t * W; y = -4; a = Math.PI / 2; }
  else if (side === 1) { x = W + 4; y = t * H; a = Math.PI; }
  else if (side === 2) { x = t * W; y = H + 4; a = -Math.PI / 2; }
  else { x = -4; y = t * H; a = 0; }
  a += (R() - .5) * 1.3;
  branch(x, y, a, (45 + R() * 120) * (.7 + corner * .8), 1.7 + R() * .9, 2);
}
for (let i = 0; i < 14; i++) {
  const x = W * (.08 + R() * .84), y = H * (.08 + R() * .84); if (edgeD(x, y) > .5) continue;
  branch(x, y, R() * 6.28, 30 + R() * 60, 1.2, 2);
}
// шестилучевые звёздочки
for (let i = 0; i < 46; i++) {
  const x = R() * W, y = R() * H, e = edgeD(x, y); if (R() < e * 1.3) continue;
  const r = 3 + R() * 9, rot = R(); let d = '';
  for (let k = 0; k < 6; k++) {
    const a = rot + k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a);
    d += `M${f1(x)} ${f1(y)} L${f1(x + c * r)} ${f1(y + s * r)} `;
    const m = r * .55, b = r * .32;
    d += `M${f1(x + c * m)} ${f1(y + s * m)} L${f1(x + c * m + Math.cos(a + .8) * b)} ${f1(y + s * m + Math.sin(a + .8) * b)} M${f1(x + c * m)} ${f1(y + s * m)} L${f1(x + c * m + Math.cos(a - .8) * b)} ${f1(y + s * m + Math.sin(a - .8) * b)} `;
  }
  stars.push(`<path d="${d}" stroke-width="${f1(.6 + r * .06)}" stroke-opacity="${f1(.45 + R() * .35)}"/>`);
}
// крупинки изморози: у краёв гуще
for (let i = 0; i < 9000; i++) {
  const x = R() * W, y = R() * H, e = edgeD(x, y);
  if (R() > Math.pow(1 - e, 2.2) * .95 + .006) continue;
  dots.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(.35 + R() * 1.1)}" fill-opacity="${f1(.25 + R() * .5)}"/>`);
}
const svg = (blur) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><filter id="g" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${blur}"/></filter>
<radialGradient id="fog" cx="50%" cy="48%" r="72%"><stop offset="0" stop-color="#eaf6ff" stop-opacity=".02"/><stop offset=".5" stop-color="#eaf6ff" stop-opacity=".08"/><stop offset=".8" stop-color="#e6f4ff" stop-opacity=".26"/><stop offset="1" stop-color="#f0f8ff" stop-opacity=".5"/></radialGradient></defs>
${blur ? '' : '<rect width="100%" height="100%" fill="url(#fog)"/>'}
<g ${blur ? 'filter="url(#g)"' : ''} fill="none" stroke="#f2faff" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}${stars.join('')}</g>
<g ${blur ? 'filter="url(#g)"' : ''} fill="#ffffff">${dots.join('')}</g></svg>`;
// чёткий узор + мягкое свечение (размытая копия)
const sharpL = await sharp(Buffer.from(svg(0))).png().toBuffer();
const glowL = await sharp(Buffer.from(svg(2.2))).png().toBuffer();
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: glowL }, { input: sharpL }]).webp({ quality: 82, alphaQuality: 85, effort: 6 }).toFile(OUT);
console.log(OUT, fs.statSync(OUT).size >> 10, 'КБ', '| веток', paths.length, 'звёзд', stars.length, 'крупинок', dots.length);

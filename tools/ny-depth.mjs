// Новогодний ивент: «глубина» на фонах главного экрана — даль размыта, ближнее чёткое (владелец 25.11, Nuke: размыть вид за воротами).
// Берёт исходник assets/ny/_src/<id>-orig.webp (если нет — сохраняет туда текущий assets/ny/bg/<id>.webp), пишет assets/ny/bg/<id>.webp.
// keep — где размытия не надо (вычитается из зоны, края мягкие).
// Зона размытия — многоугольник (координаты кадра 2560×1440); сила по высоте: до y0 полная, к y1 сходит на нет. Края зоны мягкие.
// После — пересобрать огоньки: node tools/ny-glow.mjs <id>
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const sharp = require('D:/Кейсы/promo-video/node_modules/sharp');
const W = 2560, H = 1440;
const CFG = {
  // проём ворот: верх по балке с гирляндой, низ — порог; здания и небо — полная размытость, двор к порогу — резче
  nuke: { poly: [[252, 168], [1906, 302], [1906, 955], [252, 955]], sigma: 4.5, y0: 760, y1: 950, near: 0.15, feather: 4,
    keep: [[1176, 488], [1700, 462], [1906, 466], [1906, 800], [1176, 800]] }, // здание с жёлтыми дверями и «A» — чёткое (владелец 25.11)
};
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CFG)) {
  const c = CFG[id], dst = 'assets/ny/bg/' + id + '.webp', src = 'assets/ny/_src/' + id + '-orig.webp';
  if (!fs.existsSync(src)) fs.copyFileSync(dst, src);
  const base = await sharp(src).resize(W, H).removeAlpha().raw().toBuffer();
  const blur = await sharp(base, { raw: { width: W, height: H, channels: 3 } }).blur(c.sigma).raw().toBuffer();
  const pts = c.poly.map(p => p.join(',')).join(' ');
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><polygon points="${pts}" fill="#fff"/></svg>`;
  const mask = await sharp(Buffer.from(svg)).blur(c.feather).extractChannel(0).raw().toBuffer();
  if (c.keep) {
    const ks = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><polygon points="${c.keep.map(p => p.join(',')).join(' ')}" fill="#fff"/></svg>`;
    const km = await sharp(Buffer.from(ks)).blur(10).extractChannel(0).raw().toBuffer();
    for (let p = 0; p < mask.length; p++) mask[p] = mask[p] * (255 - km[p]) / 255;
  }
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const k = y <= c.y0 ? 1 : y >= c.y1 ? c.near : 1 - (1 - c.near) * (y - c.y0) / (c.y1 - c.y0);
    for (let x = 0; x < W; x++) {
      const p = y * W + x, m = mask[p] / 255 * k;
      for (let ch = 0; ch < 3; ch++) out[p * 3 + ch] = base[p * 3 + ch] * (1 - m) + blur[p * 3 + ch] * m;
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 84, effort: 6, smartSubsample: true }).toFile(dst);
  console.log(id, fs.statSync(dst).size >> 10, 'КБ');
}

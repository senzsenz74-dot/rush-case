// Новогодний ивент: светящиеся слои для мигания гирлянд и фонарей на фонах главного экрана.
// Берёт assets/ny/bg/<id>.webp, находит яркие тёплые точки (лампочки, фонари, окна; белый снег не берёт),
// делит их на 3 группы вразнобой (сетка 22 px) → assets/ny/glow/<id>-1..3.webp (огоньки + ореол) и <id>-h.webp (широкий мягкий ореол фонарей).
// Слои чёрные там, где света нет: на сайте кладутся поверх фона с mix-blend-mode: screen и мигают прозрачностью (css/newyear.css).
// Запуск: node tools/ny-glow.mjs [id ...]   (sharp берётся из promo-video/node_modules основной папки)
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const sharp = require('D:/Кейсы/promo-video/node_modules/sharp');
const SRC = 'assets/ny/bg/', OUT = 'assets/ny/glow/', W = 1920, H = 1080, CELL = 22;
fs.mkdirSync(OUT, { recursive: true });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(SRC).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5));
const cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
const toWebp = (buf, sigma, file, gain = 1) => {
  let s = sharp(buf, { raw: { width: W, height: H, channels: 3 } });
  if (sigma) s = s.blur(sigma);
  if (gain !== 1) s = s.linear(gain, 0);
  return s.webp({ quality: 78, effort: 6 }).toFile(file);
};
for (const id of ids) {
  const { data } = await sharp(SRC + id + '.webp').resize(W, H).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // яркость кадра и её размытые копии: огонёк = точка заметно ярче своего окружения (освещённая стена/снег — ровные, не проходят)
  const Lm = Buffer.alloc(W * H); for (let p = 0; p < W * H; p++) Lm[p] = Math.max(data[p * 3], data[p * 3 + 1], data[p * 3 + 2]);
  const blurL = s => sharp(Lm, { raw: { width: W, height: H, channels: 1 } }).blur(s).raw().toBuffer();
  const [B6, B30] = await Promise.all([blurL(6), blurL(30)]);
  const g = [0, 1, 2].map(() => Buffer.alloc(W * H * 3)), all = Buffer.alloc(W * H * 3);
  let n = 0, nl = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 3, r = data[i] / 255, gg = data[i + 1] / 255, b = data[i + 2] / 255;
    const L = Lm[p] / 255, warm = cl((r - b - 0.18) / 0.2);   // тёплое (снег белый/голубой — не проходит)
    const bulb = cl((L - B6[p] / 255 - 0.10) / 0.12) * cl((L - 0.80) / 0.15) * warm;   // лампочка гирлянды
    const lamp = cl((L - B30[p] / 255 - 0.22) / 0.15) * cl((L - 0.88) / 0.1) * warm;  // фонарь/окно — крупное пятно света
    if (lamp > 0.02) { nl++; const k = Math.min(1, lamp); all[i] = data[i] * k; all[i + 1] = data[i + 1] * k * 0.9; all[i + 2] = data[i + 2] * k * 0.6; }
    if (bulb <= 0.02) continue;
    n++;
    const cx = (x / CELL) | 0, cy = (y / CELL) | 0, k = ((cx * 73856093) ^ (cy * 19349663)) >>> 0;
    const o = g[k % 3];
    // цвет огонька — свой, чуть теплее и ярче
    o[i] = Math.min(255, data[i] * bulb * 1.1); o[i + 1] = Math.min(255, data[i + 1] * bulb * 0.95); o[i + 2] = Math.min(255, data[i + 2] * bulb * 0.7);
  }
  // каждая группа: чёткий огонёк + ореол вокруг
  for (let j = 0; j < 3; j++) {
    const core = await sharp(g[j], { raw: { width: W, height: H, channels: 3 } }).blur(1.2).raw().toBuffer();
    const halo = await sharp(g[j], { raw: { width: W, height: H, channels: 3 } }).blur(7).linear(1.4, 0).raw().toBuffer();
    const mix = Buffer.alloc(W * H * 3); for (let i = 0; i < mix.length; i++) mix[i] = Math.min(255, core[i] + halo[i]);
    await toWebp(mix, 0, OUT + id + '-' + (j + 1) + '.webp');
  }
  await toWebp(all, 16, OUT + id + '-h.webp', 2.2);
  const kb = ['1', '2', '3', 'h'].map(s => fs.statSync(OUT + id + '-' + s + '.webp').size >> 10);
  console.log(id, 'точек', n, 'КБ', kb.join('/'));
}

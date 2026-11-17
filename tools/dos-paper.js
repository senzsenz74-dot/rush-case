// Текстуры для страницы «Контракты» (досье): старая бумага, крафт-картон, рваные края, непрокрас штампа, пятна.
// Запуск: node tools/dos-paper.js  → assets/dos/*.webp|png
// Нужен sharp (лежит в promo-video/node_modules); путь можно задать переменной SHARP.
const path = require('path'), fs = require('fs');
const sharp = require(process.env.SHARP || path.join(__dirname, '..', '..', '..', '..', 'promo-video', 'node_modules', 'sharp'));
const OUT = path.join(__dirname, '..', 'assets', 'dos');
fs.mkdirSync(OUT, { recursive: true });

let seed = 1;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const setSeed = s => { seed = s >>> 0; for (let i = 0; i < 8; i++) rnd(); };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sm = t => t * t * (3 - 2 * t);

// бесшовный шум: решётка cells×cells, повторяется через size пикселей
function lattice(cells) { const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g; }
function fbm(size, cells0, oct, pers) {
  const out = new Float32Array(size * size); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const cells = cells0 << o, g = lattice(cells), k = cells / size;
    for (let y = 0; y < size; y++) {
      const fy = y * k, y0 = Math.floor(fy), ty = sm(fy - y0), y1 = (y0 + 1) % cells;
      for (let x = 0; x < size; x++) {
        const fx = x * k, x0 = Math.floor(fx), tx = sm(fx - x0), x1 = (x0 + 1) % cells;
        const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
        out[y * size + x] += amp * (a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty);
      }
    }
    tot += amp; amp *= pers;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
// одномерный бесшовный шум (для профиля края)
function fbm1(len, cells0, oct, pers) {
  const out = new Float32Array(len); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const cells = cells0 << o, g = Array.from({ length: cells }, rnd), k = cells / len;
    for (let x = 0; x < len; x++) { const f = x * k, i = Math.floor(f), t = sm(f - i); out[x] += amp * (g[i % cells] + (g[(i + 1) % cells] - g[i % cells]) * t); }
    tot += amp; amp *= pers;
  }
  return out.map(v => v / tot);
}

// мягкое пятно с переносом через край (бесшовность)
function splat(buf, S, cx, cy, r, col, a) {
  const R = Math.ceil(r + 1.5);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx + (cx - Math.round(cx)), dy + (cy - Math.round(cy)));
    let k = clamp(r + .7 - d, 0, 1); if (!k) continue; k *= a;
    const x = ((Math.round(cx) + dx) % S + S) % S, y = ((Math.round(cy) + dy) % S + S) % S, i = (y * S + x) * 3;
    buf[i] += (col[0] - buf[i]) * k; buf[i + 1] += (col[1] - buf[i + 1]) * k; buf[i + 2] += (col[2] - buf[i + 2]) * k;
  }
}
function fibers(buf, S, n, opt) {
  for (let f = 0; f < n; f++) {
    let x = rnd() * S, y = rnd() * S, ang = rnd() * Math.PI * 2, curv = (rnd() - .5) * opt.curv;
    const L = opt.l0 + Math.pow(rnd(), 2) * opt.l1, w = opt.w0 + rnd() * opt.w1, light = rnd() < opt.light;
    const col = light ? opt.lc : opt.dc, a = light ? opt.la[0] + rnd() * opt.la[1] : opt.da[0] + rnd() * opt.da[1];
    for (let s = 0; s < L; s += .6) {
      const fade = Math.sin(Math.PI * s / L); // тонкие концы
      splat(buf, S, x, y, w * (.4 + .6 * fade), col, a * (.35 + .65 * fade) * .5);
      x += Math.cos(ang) * .6; y += Math.sin(ang) * .6; ang += curv + (rnd() - .5) * .06;
    }
  }
}
function paperTex(S, o) {
  setSeed(o.seed);
  const m1 = fbm(S, 4, 5, .55), m2 = fbm(S, 32, 3, .5), buf = new Float32Array(S * S * 3);
  for (let i = 0; i < S * S; i++) {
    const d = (m1[i] - .5) * o.mot + (m2[i] - .5) * o.floc + (rnd() - .5) * o.grain;
    buf[i * 3] = o.base[0] + d; buf[i * 3 + 1] = o.base[1] + d * 1.06; buf[i * 3 + 2] = o.base[2] + d * 1.32;
  }
  fibers(buf, S, o.fib, o.fibo);
  for (let i = 0; i < o.specks; i++) splat(buf, S, rnd() * S, rnd() * S, .35 + rnd() * .9, o.speckC, .25 + rnd() * .4);
  // «лисьи» пятна: неровные рыжеватые точки с тёмной серединой
  for (let i = 0; i < o.fox; i++) {
    const cx = rnd() * S, cy = rnd() * S, r = 1.5 + rnd() * 5;
    for (let k = 0; k < 6; k++) splat(buf, S, cx + (rnd() - .5) * r, cy + (rnd() - .5) * r, r * (.5 + rnd() * .5), o.foxC, .05 + rnd() * .07);
    splat(buf, S, cx, cy, r * .3, o.foxC2, .12 + rnd() * .12);
  }
  const px = Buffer.alloc(S * S * 3); for (let i = 0; i < px.length; i++) px[i] = clamp(Math.round(buf[i]), 0, 255);
  return px;
}

// край листа: полоса period×H (2× от показа), снаружи (y=0) — рваная кромка с волокнами
function edgeStrip(period, H, s) {
  setSeed(s);
  const p = fbm1(period, 6, 4, .55), q = fbm1(period, 48, 2, .5), a = new Float32Array(period * H);
  for (let x = 0; x < period; x++) {
    const d = 3 + p[x] * 12 + (q[x] - .5) * 3; // глубина кромки, px
    for (let y = 0; y < H; y++) { let v = clamp(y - d + 1, 0, 1); if (y > d && y < d + 4) v *= .82 + .18 * clamp((y - d) / 4, 0, 1); a[y * period + x] = v; }
  }
  // волокна, торчащие из кромки
  for (let f = 0; f < period * .22; f++) {
    const x0 = rnd() * period, d = 3 + p[Math.floor(x0)] * 12, len = 1.5 + rnd() * 3.5, ang = -Math.PI / 2 + (rnd() - .5) * 1.4, al = .25 + rnd() * .4;
    for (let t = 0; t < len; t += .5) {
      const x = Math.round(x0 + Math.cos(ang) * t), y = Math.round(d + 1 + Math.sin(ang) * t); if (y < 0 || y >= H) continue;
      const i = y * period + ((x % period) + period) % period; a[i] = Math.max(a[i], al * (1 - t / len * .6));
    }
  }
  const px = Buffer.alloc(period * H * 2); for (let i = 0; i < a.length; i++) { px[i * 2] = 255; px[i * 2 + 1] = Math.round(clamp(a[i], 0, 1) * 255); }
  return px;
}

// непрокрас краски штампа: белое с прозрачностью (используется как mask-image)
function inkMask(S, s) {
  setSeed(s);
  const hi = fbm(S, 64, 2, .6), mid = fbm(S, 8, 3, .5), px = Buffer.alloc(S * S * 2);
  for (let i = 0; i < S * S; i++) {
    let a = .8 + .35 * (mid[i] - .35);
    if (hi[i] > .66) a *= clamp(1 - (hi[i] - .66) * 7, .25, 1);
    if (rnd() < .025) a *= .35 + rnd() * .4; // поры резины
    px[i * 2] = 255; px[i * 2 + 1] = Math.round(clamp(a, 0, 1) * 255);
  }
  return px;
}

// пятна: прозрачная картинка 640×640 — разводы от воды, «лисьи» точки у края
function stains(S, s) {
  setSeed(s);
  const n = fbm(S, 4, 4, .55), buf = new Float32Array(S * S * 4);
  const add = (x, y, c, a) => { if (x < 0 || y < 0 || x >= S || y >= S) return; const i = (y * S + x) * 4, A = buf[i + 3], na = A + a * (1 - A); if (!na) return; for (let k = 0; k < 3; k++) buf[i + k] = (buf[i + k] * A + c[k] * a * (1 - A)) / na; buf[i + 3] = na; };
  // развод от воды: неровное кольцо с тёмной «линией прилива»
  const cx = S * .58, cy = S * .42, R = S * .26;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ang = Math.atan2(y - cy, x - cx), w = n[y * S + x], r = Math.hypot(x - cx, y - cy) / (R * (.86 + .3 * w + .06 * Math.sin(ang * 3)));
    let a = 0; if (r < 1) a = .035 + .05 * Math.pow(r, 6); if (r >= 1 && r < 1.025) a = .16 * (1 - (r - 1) / .025);
    if (a > 0) add(x, y, [150, 102, 48], a);
  }
  for (let i = 0; i < 26; i++) { // россыпь мелких пятен
    const px = S * (.08 + rnd() * .3), py = S * (.6 + rnd() * .35), r = 1 + rnd() * 4.5;
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) { const d = Math.hypot(x, y); if (d < r) add(Math.round(px + x), Math.round(py + y), [140, 92, 40], (.1 + rnd() * .05) * (1 - d / r * .6)); }
  }
  const px = Buffer.alloc(S * S * 4); for (let i = 0; i < px.length; i++) px[i] = clamp(Math.round(i % 4 === 3 ? buf[i] * 255 : buf[i]), 0, 255);
  return px;
}

(async () => {
  const S = 512;
  const paper = paperTex(S, { seed: 11, base: [228, 214, 178], mot: 24, floc: 9, grain: 6, fib: 1100, specks: 140, fox: 10,
    fibo: { curv: .025, l0: 4, l1: 22, w0: .3, w1: .45, light: .62, lc: [246, 238, 216], dc: [176, 150, 108], la: [.16, .2], da: [.08, .12] },
    speckC: [92, 64, 34], foxC: [184, 128, 64], foxC2: [140, 88, 40] });
  await sharp(paper, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 84 }).toFile(path.join(OUT, 'paper.webp'));

  const kraft = paperTex(S, { seed: 23, base: [150, 110, 68], mot: 30, floc: 14, grain: 11, fib: 2200, specks: 300, fox: 0,
    fibo: { curv: .03, l0: 4, l1: 26, w0: .3, w1: .55, light: .5, lc: [190, 154, 106], dc: [92, 62, 32], la: [.2, .25], da: [.18, .22] },
    speckC: [52, 34, 16], foxC: [0, 0, 0], foxC2: [0, 0, 0] });
  await sharp(kraft, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 80 }).toFile(path.join(OUT, 'kraft.webp'));

  // края: 4 стороны с разным рисунком (верх — как есть, остальные повёрнуты)
  const EP = 384, EH = 24, rot = { t: 0, r: 90, b: 180, l: 270 }, sd = { t: 5, r: 6, b: 7, l: 8 };
  for (const k of Object.keys(rot)) await sharp(edgeStrip(EP, EH, sd[k]), { raw: { width: EP, height: EH, channels: 2 } }).rotate(rot[k]).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'edge-' + k + '.png'));

  await sharp(inkMask(256, 31), { raw: { width: 256, height: 256, channels: 2 } }).webp({ quality: 70, alphaQuality: 70 }).toFile(path.join(OUT, 'ink.webp'));
  await sharp(stains(640, 41), { raw: { width: 640, height: 640, channels: 4 } }).webp({ quality: 82, alphaQuality: 90 }).toFile(path.join(OUT, 'stains.webp'));
  for (const f of fs.readdirSync(OUT)) console.log(f, fs.statSync(path.join(OUT, f)).size);
})();

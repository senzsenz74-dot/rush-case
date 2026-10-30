'use strict';
/* =====================================================================
   Тактика: экран (в стиле 2D-повтора FASTCUP), отрисовка, управление мышью,
   закуп, килл-фид, таймлайн, итоги раунда и разбор игры.
   ===================================================================== */

// силуэты для килл-фида и карточек (viewBox 64×18)
const TICON = (() => {
  const g = (d, w = 64, h = 18) => `<svg viewBox="0 0 ${w} ${h}" class="ico"><path d="${d}"/></svg>`;
  return {
    ak: g('M1 8 9 6.2 12 5H44V3.6h4V5H63V6.6H45L43 8.4H31L29.6 9.4 32 15.6 28.2 16.6 25.4 9.4H20.4L19.6 12.6H16.2L16.4 9 1 11.6Z'),
    m4: g('M1 7 11 5.4 13 4.4H29V3h9v1.4H63V6.2H43L40.6 8.2H29.4V15.4H25.4V8.2H21L20.2 12.4H16.6L17 8.2 1 10.4Z'),
    galil: g('M1 7.4 12 5.6 14 4.6H46V3.8h3V4.6H63V6.4H45L43 8.2H31.6L32.2 14.6H28.4L27.6 8.2H21L20.2 12H16.6L17 8.2 1 10.8Z'),
    famas: g('M2 9 12 6 16 4.8H26L27 2.6h12L40 4.8H62V6.6H44L42 8.6H31V14.2H27.4V8.6H22L21 12.4H17.6L18 9 2 11.4Z'),
    awp: g('M1 8.4 12 6.4 14 5.4H28L29.6 3h14L45 5.4H63V6.8H34L32 8.6H22.6L21.8 12.6H18.2L18.6 8.6 1 11.4Z'),
    smg: g('M8 5h34v3.6H31.2L30 14.6H25.8L26.6 8.6H21.4L20.6 13.2H16.8L17.4 8.6H8Z'),
    pistol: g('M14 5.4H44V9.2H29.6L27.6 15.4H21.6L23.2 9.2H14Z'),
    deagle: g('M10 4.4H48V9.4H31L28.8 16.2H21.8L23.6 9.4H10Z'),
    molotov: g('M29 7h6v3l4 3v5H25v-5l4-3ZM32 0c3 2.4 3 4.4 0 6-3-1.6-3-3.6 0-6Z'),
    c4: g('M18 6H46V16H18ZM22 2h6v4h-6Z'),
    hs: g('M10 1.5A6 6 0 0 1 16 7.5V11L14 12.5V16H6V12.5L4 11V7.5A6 6 0 0 1 10 1.5ZM12.3 6.4a1.6 1.6 0 1 0 .01 0Z', 20, 18),
    blind: g('M2 9C6 3 14 3 18 9 14 15 6 15 2 9ZM10 6a3 3 0 1 0 .01 0ZM3 16 17 2l1 1L4 17Z', 20, 18),
    flash: g('M8 5h6v3h-6ZM7 8h8l1 9H6ZM12 0l2 3h-4Z', 22, 18),
    smoke: g('M5 14a4 4 0 0 1 1-7.8A5 5 0 0 1 15 4.6 4 4 0 0 1 21 8.4 3.2 3.2 0 0 1 20 14Z', 24, 18),
    kit: g('M3 4h10l2 4-2 4H3l2-4ZM6 7h4v2H6Z', 18, 16),
    helmet: g('M2 11a7 7 0 0 1 14 0v2H2ZM9 4v4', 18, 16),
    vest: g('M4 2h3l2 3 2-3h3l2 4-2 2v8H4V8L2 6Z', 18, 18),
  };
})();
const weaponIcon = k => TICON[k === 'c4' ? 'c4' : k === 'molotov' ? 'molotov' : (TWEAP[k] && TWEAP[k].icon) || 'pistol'];
const NADE_COL = { smoke: '#cfd5df', flash: '#fff3a8', molotov: '#ff8a3d' };

const TU = {
  G: null, el: null, cv: null, ctx: null, mapCv: null, dpr: 1,
  cam: { s: 1, ox: 0, oy: 0 }, bbox: null,
  sel: new Set(), throwMode: null, paused: true, speed: 1,
  mouse: { x: 0, y: 0, down: null, box: null, pan: null },
  raf: 0, last: 0, acc: 0, hudAt: 0, endAt: 0, feedKey: '', seen: new Map(), lastSeen: new Map(), shotAt: 0,
};

/* ===================== карта ===================== */
// 1D-проход точного евклидова расстояния (Felzenszwalb–Huttenlocher)
function tacDT1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while ((s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])) <= z[k]) k--;
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
}
// расстояние (в клетках) от каждой клетки до ближайшей клетки, где mask(i) истинно
function tacEDT(n, mask) {
  const D = new Float64Array(n * n), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < n * n; i++) D[i] = mask(i) ? 0 : 1e12;
  for (let x = 0; x < n; x++) { for (let y = 0; y < n; y++) f[y] = D[y * n + x]; tacDT1(f, n, d, v, z); for (let y = 0; y < n; y++) D[y * n + x] = d[y]; }
  for (let y = 0; y < n; y++) { const o = y * n; for (let x = 0; x < n; x++) f[x] = D[o + x]; tacDT1(f, n, d, v, z); for (let x = 0; x < n; x++) D[o + x] = Math.sqrt(d[x]); }
  return D;
}
// знаковое расстояние до границы области (в клетках): >0 внутри, <0 снаружи
function tacSDF(n, inside) {
  const toOut = tacEDT(n, i => !inside(i)), toIn = tacEDT(n, inside), sd = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) sd[i] = inside(i) ? toOut[i] - 0.5 : 0.5 - toIn[i];
  // сглаживание: размываем поле (ядро 1-4-6-4-1), но сдвигаем контур не больше чем на 0.4 клетки —
  // «лесенка» уходит, а тонкие стены и коридоры в одну клетку остаются на месте
  const k = [1, 4, 6, 4, 1], tmp = new Float32Array(n * n), bl = new Float32Array(n * n);
  const at = (F, x, y) => F[Math.max(0, Math.min(n - 1, y)) * n + Math.max(0, Math.min(n - 1, x))];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0; for (let j = 0; j < 5; j++) s += k[j] * at(sd, x + j - 2, y); tmp[y * n + x] = s / 16; }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0; for (let j = 0; j < 5; j++) s += k[j] * at(tmp, x, y + j - 2); bl[y * n + x] = s / 16; }
  for (let i = 0; i < n * n; i++) sd[i] += Math.max(-0.4, Math.min(0.4, bl[i] - sd[i]));
  return sd;
}

// детали радара лежат в данных карты как PNG (data:) — такие пиксели можно читать и с file://.
// Картинка грузится один раз при загрузке скрипта; если карту успели построить раньше — перестраиваем
const TAC_DETAIL = { px: null, size: 0, loading: false };
function tacLoadDetail(map) {
  if (TAC_DETAIL.px || TAC_DETAIL.loading || !map || !map.detail) return;
  TAC_DETAIL.loading = true;
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, im.width, im.height).data, px = new Uint8Array(im.width * im.height);
    for (let i = 0; i < px.length; i++) px[i] = d[i * 4];
    TAC_DETAIL.px = px; TAC_DETAIL.size = im.width;
    if (TU.mapCv) { TU.mapCv = null; tacBuildMap(); }
  };
  im.src = map.detail;
}
if (window.DINK_MAPS && DINK_MAPS.map1) tacLoadDetail(DINK_MAPS.map1);

// высоты клеток 0..1 (светлее — выше) из данных карты: слегка сглажены по полу, стены получают
// высоту соседнего пола (чтобы край не темнел при интерполяции); плюс уклон по x и y
function tacHeights(nav) {
  const n = nav.n, g = nav.grid, H = new Float32Array(n * n), walk = i => g[i] > 0;
  if (nav.map.height) { const bin = atob(nav.map.height); for (let i = 0; i < n * n; i++) H[i] = bin.charCodeAt(i) / 255; }
  else H.fill(0.4);
  const tmp = new Float32Array(n * n);
  for (const [dx, dy] of [[1, 0], [0, n]]) {
    const src = dy ? tmp : H, dst = dy ? H : tmp;
    if (!dy) tmp.set(H); else H.set(tmp);
    for (let i = 0; i < n * n; i++) {
      if (!walk(i)) continue;
      const st = dx + dy;
      let s = 2 * src[i], w = 2;
      if (i - st >= 0 && walk(i - st)) { s += src[i - st]; w++; }
      if (i + st < n * n && walk(i + st)) { s += src[i + st]; w++; }
      dst[i] = s / w;
    }
  }
  const known = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) known[i] = walk(i) ? 1 : 0;
  for (let pass = 0; pass < 3; pass++) {
    const add = [];
    for (let i = 0; i < n * n; i++) {
      if (known[i]) continue;
      let s = 0, w = 0;
      for (const o of [-1, 1, -n, n]) { const j = i + o; if (j >= 0 && j < n * n && known[j]) { s += H[j]; w++; } }
      if (w) add.push([i, s / w]);
    }
    for (const [i, v] of add) { H[i] = v; known[i] = 1; }
  }
  const gx = new Float32Array(n * n), gy = new Float32Array(n * n);
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i = y * n + x;
    gx[i] = (H[i + 1] - H[i - 1]) / 2; gy[i] = (H[i + n] - H[i - n]) / 2;
  }
  return { H, gx, gy };
}

// карта рисуется по знаковому полю расстояний вдвое детальнее сетки: края — гладкие кривые.
// Высота — яркостью пола (выше — светлее, как в 2D-повторе FASTCUP), лестницы и пандусы — штрихами
// ступенек поперёк подъёма, резкие перепады — тёмной кромкой. Зоны плэнтов и спавнов обрезаны по полу.
// Стены вокруг пола — тёмная подложка, дальше просвечивает фон экрана
function tacBuildMap() {
  const nav = tacNav(), S = nav.size, n = nav.n, c = nav.cell, M = nav.map, g = nav.grid;
  const K = 2, R = S * K, cs = c * K;
  const sdF = tacSDF(n, i => g[i] > 0), sdB = tacSDF(n, i => g[i] === 2), { H, gx, gy } = tacHeights(nav);
  let minX = S, minY = S, maxX = 0, maxY = 0;
  for (let i = 0; i < n * n; i++) {
    if (!g[i]) continue;
    const X = (i % n) * c, Y = Math.floor(i / n) * c;
    minX = Math.min(minX, X); minY = Math.min(minY, Y); maxX = Math.max(maxX, X + c); maxY = Math.max(maxY, Y + c);
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = R;
  const x = cv.getContext('2d'), img = x.createImageData(R, R), px = img.data;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  // билинейная выборка: индекс и веса считаются один раз на пиксель, поля читаются по ним
  let o = 0, w00 = 0, w10 = 0, w01 = 0, w11 = 0;
  const at = F => F[o] * w00 + F[o + 1] * w10 + F[o + n] * w01 + F[o + n + 1] * w11;
  const WALL = [13, 15, 20], LOW = [24, 27, 35], HIGH = [116, 122, 142], LINE = [118, 127, 150], STEP = [16, 18, 24],
    BOX = [86, 93, 112], BOX_L = [126, 135, 160];
  const ZONES = [
    [M.zones.A, [200, 55, 60], 0.3, [232, 82, 86], 0.9], [M.zones.B, [200, 55, 60], 0.3, [232, 82, 86], 0.9],
    [M.zones.CT, [70, 130, 220], 0.24, [110, 168, 240], 0.85], [M.zones.T, [210, 160, 60], 0.24, [228, 184, 90], 0.85],
  ];
  const DP = TAC_DETAIL.px, DS = TAC_DETAIL.size;
  for (let Y = 0; Y < R; Y++) {
    const v = (Y + 0.5) / cs - 0.5, j0 = Math.max(0, Math.min(n - 2, Math.floor(v))), fv = v - j0, wy = (Y + 0.5) / K;
    for (let X = 0; X < R; X++) {
      const u = (X + 0.5) / cs - 0.5, i0 = Math.max(0, Math.min(n - 2, Math.floor(u))), fu = u - i0;
      o = j0 * n + i0; w00 = (1 - fu) * (1 - fv); w10 = fu * (1 - fv); w01 = (1 - fu) * fv; w11 = fu * fv;
      const sd = at(sdF), d = sd * cs; // d — в пикселях холста
      // подложка: плотная у пола, растворяется в 6–16 клетках от него
      let a = sd > -16 ? 0.9 * (1 - sstep(6, 16, -sd)) : 0, r = WALL[0], gg = WALL[1], b = WALL[2];
      const over = (col, k) => { if (k <= 0) return; const na = k + a * (1 - k), w = k / na; r += (col[0] - r) * w; gg += (col[1] - gg) * w; b += (col[2] - b) * w; a = na; };
      if (d > -1.5) {
        const wx = (X + 0.5) / K, h = at(H), ao = 0.84 + 0.16 * sstep(0, 2.6, sd); // у стен чуть темнее — объём
        // детали радара: полосы ступенек, штриховка спусков, перила (в единицах яркости)
        let det = 0;
        if (DP) {
          const qx = Math.max(0, Math.min(DS - 2, wx - 0.5)), qy = Math.max(0, Math.min(DS - 2, wy - 0.5)), ix = qx | 0, iy = qy | 0, fx = qx - ix, fy = qy - iy, q = iy * DS + ix;
          det = ((DP[q] * (1 - fx) + DP[q + 1] * fx) * (1 - fy) + (DP[q + DS] * (1 - fx) + DP[q + DS + 1] * fx) * fy - 128) / 3 * 1.1;
        }
        over([(LOW[0] + (HIGH[0] - LOW[0]) * h + det) * ao, (LOW[1] + (HIGH[1] - LOW[1]) * h + det) * ao, (LOW[2] + (HIGH[2] - LOW[2]) * h + det) * ao], clamp01(d + 0.5));
        // обрыв между уровнями — тёмная кромка
        over(STEP, 0.4 * sstep(0.11, 0.2, Math.hypot(at(gx), at(gy))) * clamp01(sd));
        const db = at(sdB) * cs;
        if (db > -1.5) { over(BOX, clamp01(db + 0.5)); over(BOX_L, 0.8 * clamp01(1.2 - Math.abs(db - 0.6))); }
        over(LINE, clamp01(1.4 - Math.abs(d - 0.4)));
        for (const [[zx, zy, zw, zh], fc, fa, lc, la] of ZONES) {
          if (wx < zx - 1 || wx > zx + zw + 1 || wy < zy - 1 || wy > zy + zh + 1) continue;
          const zd = Math.min(Math.min(wx - zx, zx + zw - wx, wy - zy, zy + zh - wy) * K, d);
          over(fc, fa * clamp01(zd + 0.5));
          over(lc, la * clamp01(1.5 - Math.abs(zd - 1.2)));
        }
      }
      const p = (Y * R + X) * 4;
      px[p] = r; px[p + 1] = gg; px[p + 2] = b; px[p + 3] = a * 255;
    }
  }
  x.putImageData(img, 0, 0);
  TU.mapCv = cv;
  TU.bbox = [minX, minY, maxX, maxY];
}

function tacFit() {
  const w = TU.cv.clientWidth, h = TU.cv.clientHeight, [x0, y0, x1, y1] = TU.bbox, pad = 18;
  if (w < 60 || h < 60) return; // окно свёрнуто или ещё не разложено — оставляем прежний вид
  const s = Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0));
  TU.cam = { s, ox: (w - (x1 - x0) * s) / 2 - x0 * s, oy: (h - (y1 - y0) * s) / 2 - y0 * s };
}
const w2s = (x, y) => [x * TU.cam.s + TU.cam.ox, y * TU.cam.s + TU.cam.oy];
const s2w = (x, y) => [(x - TU.cam.ox) / TU.cam.s, (y - TU.cam.oy) / TU.cam.s];

function tacResize() {
  const cv = TU.cv, d = Math.min(window.devicePixelRatio || 1, 2);
  TU.dpr = d;
  cv.width = Math.round(cv.clientWidth * d);
  cv.height = Math.round(cv.clientHeight * d);
}

/* ===================== отрисовка ===================== */
const TEAM_COL = { CT: [110, 168, 236], T: [228, 182, 74] };
const tcol = (team, a = 1) => rgbStr(TEAM_COL[team], a);

// враг виден на экране, только если кто-то из твоих живых игроков его заметил (G.noticed):
// в секторе обзора (≈120°) — сразу, сбоку/сзади — через ~0.8 с или после попадания; вплотную и в перестрелке — тоже
function tacVisibleEnemies() {
  const G = TU.G, set = new Set();
  for (const p of G.players) {
    if (!p.us || !p.alive) continue;
    for (const e of p.vis) {
      if (p.target === e || Math.hypot(e.x - p.x, e.y - p.y) < 45 || G.noticed(p, e)) set.add(e.id);
    }
  }
  return set;
}

/* ---------- звуки тактики ---------- */
function tacSound(type, d) {
  const now = performance.now();
  if (type === 'shot') {
    const mine = d.p.us, seen = mine || tacVisibleEnemies().has(d.p.id);
    if (now - (TU.shotAt || 0) < (mine ? 55 : 85)) return; // не больше ~15 выстрелов в секунду
    TU.shotAt = now;
    // свои — громко, видимые враги — тише, невидимые — далёкая стрельба (слышно, но не видно)
    Sound.play('shot', Sound.VOL.shot * (mine ? 0.85 : seen ? 0.55 : 0.22));
  } else if (type === 'kill') {
    if (d.vic.us) Sound.body();
    else if (d.att && d.att.us) { if (d.hs) Sound.hit(true); else Sound.kill(); }
  } else if (type === 'plant') Sound.planted();
  else if (type === 'defuse') Sound.go();
  else if (type === 'end') Sound.end();
}

function tacRender() {
  const G = TU.G, ctx = TU.ctx, d = TU.dpr, W = TU.cv.width / d, H = TU.cv.height / d, s = TU.cam.s, t = G.t;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.clearRect(0, 0, W, H); // под холстом — фон экрана тактики (CSS)
  ctx.save();
  ctx.translate(TU.cam.ox, TU.cam.oy);
  ctx.scale(s, s);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(TU.mapCv, 0, 0, TU.G.nav.size, TU.G.nav.size);
  ctx.restore();

  const visE = tacVisibleEnemies();
  const shown = p => p.us || p.alive === false || visE.has(p.id);

  // буквы плэнтов
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [name, [x, y]] of Object.entries(G.map.sites)) {
    const [X, Y] = w2s(x, y);
    ctx.font = `800 ${Math.max(16, 30 * s)}px Manrope, sans-serif`;
    ctx.fillStyle = 'rgba(255,120,120,.55)';
    ctx.fillText(name, X, Y);
  }

  // огонь
  for (const f of G.fires) {
    const [X, Y] = w2s(f.x, f.y), R = f.r * s, k = 0.85 + 0.15 * Math.sin(t * 22 + f.x);
    const gr = ctx.createRadialGradient(X, Y, 0, X, Y, R);
    gr.addColorStop(0, `rgba(255,190,90,${0.75 * k})`); gr.addColorStop(0.6, `rgba(255,110,40,${0.5 * k})`); gr.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
    timerRing(X, Y, R + 3, (f.until - t) / TAC.FIRE_TIME, '#ff8a3d');
  }

  // пути своих
  ctx.setLineDash([5, 5]);
  for (const p of G.players) {
    if (!p.us || !p.alive || !p.path.length) continue;
    ctx.strokeStyle = tcol(p.team, TU.sel.has(p.id) ? 0.85 : 0.45);
    ctx.lineWidth = TU.sel.has(p.id) ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(...w2s(p.x, p.y));
    for (const [x, y] of p.path) ctx.lineTo(...w2s(x, y));
    ctx.stroke();
    const [ex, ey] = w2s(...p.path[p.path.length - 1]);
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, Math.PI * 2); ctx.fillStyle = tcol(p.team, 0.8); ctx.fill();
    ctx.setLineDash([5, 5]);
  }
  ctx.setLineDash([]);

  // гранаты в полёте — дуга
  for (const n of G.nades) {
    if (n.team !== G.us && !visE.has(n.owner.id)) continue; // чужую гранату видно, только если видно бросившего
    const q = clamp((t - n.t0) / (n.tLand - n.t0), 0, 1);
    const [x0, y0] = w2s(n.x0, n.y0), [x1, y1] = w2s(n.x, n.y);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.25;
    if (n.team === G.us) {
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke(); ctx.setLineDash([]);
    }
    const bx = (1 - q) * (1 - q) * x0 + 2 * (1 - q) * q * mx + q * q * x1, by = (1 - q) * (1 - q) * y0 + 2 * (1 - q) * q * my + q * q * y1;
    ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fillStyle = NADE_COL[n.type]; ctx.fill();
  }

  // трассеры
  for (const r of G.tracers) {
    if (!shown(r.shooter) && !r.shooter.us) continue;
    const a = 1 - (t - r.t) / 0.12;
    ctx.strokeStyle = r.team === 'CT' ? `rgba(160,205,255,${0.8 * a})` : `rgba(255,220,130,${0.8 * a})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(...w2s(r.x0, r.y0)); ctx.lineTo(...w2s(r.x1, r.y1)); ctx.stroke();
  }

  // погибшие — черепа
  for (const p of G.players) if (!p.alive) skull(...w2s(p.x, p.y), p.team);

  // последние позиции врагов, которых ты сам видел на экране (не то, что «знает» симуляция)
  for (const id of visE) { const e = G.players[id]; TU.lastSeen.set(id, { x: e.x, y: e.y, t }); }
  for (const [id, k] of TU.lastSeen) {
    const e = G.players[id];
    if (!e.alive || visE.has(id) || t - k.t > 4) continue;
    const [X, Y] = w2s(k.x, k.y), a = 1 - (t - k.t) / 4;
    ctx.strokeStyle = tcol(e.team, 0.6 * a); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(X, Y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = tcol(e.team, 0.8 * a); ctx.font = '700 9px Manrope, sans-serif'; ctx.fillText('?', X, Y + 0.5);
  }

  // игроки
  for (const p of G.players) if (p.alive && shown(p)) drawUnit(p, visE);

  // бомба на земле
  const b = G.bomb;
  // упавшую бомбу видят только T (как на радаре); заложенную — все: об этом объявляют
  if ((b.state === 'dropped' && G.us === 'T') || b.state === 'planted' || b.state === 'defused' || b.state === 'exploded') {
    const [X, Y] = w2s(b.x, b.y);
    ctx.fillStyle = b.state === 'planted' && Math.sin(t * (6 + (t - b.plantT) / 3)) > 0 ? '#ff4d4d' : '#c0392b';
    ctx.fillRect(X - 6, Y - 4, 12, 8);
    ctx.strokeStyle = '#ffd0d0'; ctx.lineWidth = 1; ctx.strokeRect(X - 6, Y - 4, 12, 8);
    if (b.state === 'planted') { ctx.fillStyle = '#ff9a9a'; ctx.font = '700 11px "JetBrains Mono", monospace'; ctx.fillText((TAC.BOMB_TIME - (t - b.plantT)).toFixed(1), X, Y - 12); }
  }

  // дым (поверх — как на радаре)
  for (const sm of G.smokes) {
    const age = t - sm.t0, [X, Y] = w2s(sm.x, sm.y), R = sm.r * s * Math.min(1, age / 0.9);
    const gr = ctx.createRadialGradient(X, Y, R * 0.2, X, Y, R);
    gr.addColorStop(0, 'rgba(225,229,236,.92)'); gr.addColorStop(0.8, 'rgba(200,206,216,.85)'); gr.addColorStop(1, 'rgba(190,196,206,.35)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
    timerRing(X, Y, R + 2, (sm.until - t) / TAC.SMOKE_TIME, '#f0a030');
  }
  // вспышки
  for (const f of G.flashes) {
    const q = (t - f.t) / 0.6, [X, Y] = w2s(f.x, f.y);
    ctx.fillStyle = `rgba(255,255,240,${0.7 * (1 - q)})`;
    ctx.beginPath(); ctx.arc(X, Y, (8 + q * 60) * s, 0, Math.PI * 2); ctx.fill();
  }

  // режим броска — куда полетит граната
  if (TU.throwMode) {
    const p = G.players[TU.throwMode.id], [mx, my] = s2w(TU.mouse.x, TU.mouse.y);
    let tx = mx, ty = my;
    const dd = Math.hypot(tx - p.x, ty - p.y), far = dd > TAC.THROW_MAX;
    if (far) { tx = p.x + (tx - p.x) * TAC.THROW_MAX / dd; ty = p.y + (ty - p.y) * TAC.THROW_MAX / dd; }
    const [x0, y0] = w2s(p.x, p.y), [x1, y1] = w2s(tx, ty);
    const mxs = (x0 + x1) / 2, mys = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.25;
    const col = NADE_COL[TU.throwMode.type];
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mxs, mys, x1, y1); ctx.stroke(); ctx.setLineDash([]);
    const R = (TU.throwMode.type === 'smoke' ? TAC.SMOKE_R : TU.throwMode.type === 'molotov' ? TAC.FIRE_R : 10) * s;
    ctx.fillStyle = rgbStr(hexToRgb(col), 0.18); ctx.strokeStyle = far ? '#ff6b6b' : col;
    ctx.beginPath(); ctx.arc(x1, y1, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // рамка выделения
  const bx = TU.mouse.box;
  if (bx) {
    ctx.strokeStyle = 'rgba(140,200,255,.9)'; ctx.fillStyle = 'rgba(140,200,255,.08)'; ctx.lineWidth = 1;
    ctx.fillRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]); ctx.strokeRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]);
  }
}

function timerRing(X, Y, R, frac, col) {
  const ctx = TU.ctx;
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(X, Y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(frac, 0, 1)); ctx.stroke();
}

function skull(X, Y, team) {
  const ctx = TU.ctx;
  ctx.fillStyle = tcol(team, 0.75);
  ctx.beginPath(); ctx.arc(X, Y - 1, 4.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(X - 3, Y + 1.5, 6, 3.2);
  ctx.fillStyle = '#16181f';
  ctx.beginPath(); ctx.arc(X - 1.8, Y - 1.2, 1.3, 0, Math.PI * 2); ctx.arc(X + 1.8, Y - 1.2, 1.3, 0, Math.PI * 2); ctx.fill();
}

function drawUnit(p, visE) {
  const G = TU.G, ctx = TU.ctx, t = G.t, [X, Y] = w2s(p.x, p.y);
  const R = clamp(7 * TU.cam.s, 7, 13), sel = TU.sel.has(p.id), col = TEAM_COL[p.team];
  // сектор обзора своих: врага видно, только если он попал сюда
  if (p.us) {
    const L = 95 * TU.cam.s, g = ctx.createRadialGradient(X, Y, R, X, Y, L);
    g.addColorStop(0, rgbStr(col, sel ? 0.16 : 0.09)); g.addColorStop(1, rgbStr(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.arc(X, Y, L, p.face - TAC.FOV, p.face + TAC.FOV); ctx.closePath(); ctx.fill();
  }
  // направление взгляда — пунктир
  const L = p.target ? Math.hypot(p.target.x - p.x, p.target.y - p.y) * TU.cam.s : 34;
  ctx.strokeStyle = rgbStr(col, p.target ? 0.75 : 0.35); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(p.face) * L, Y + Math.sin(p.face) * L); ctx.stroke(); ctx.setLineDash([]);
  if (sel) { ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y, R + 4, 0, Math.PI * 2); ctx.stroke(); }
  if (t < p.blindUntil) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(X, Y, R + 7, 0, Math.PI * 2); ctx.fill(); }
  // кружок + стрелка взгляда
  ctx.fillStyle = rgbStr(col);
  ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
  const fx = Math.cos(p.face), fy = Math.sin(p.face);
  ctx.beginPath(); ctx.moveTo(X + fx * (R + 5), Y + fy * (R + 5)); ctx.lineTo(X + fx * R - fy * 4, Y + fy * R + fx * 4); ctx.lineTo(X + fx * R + fy * 4, Y + fy * R - fx * 4); ctx.fill();
  // HP по кругу
  ctx.strokeStyle = p.hp > 50 ? '#7dffb0' : p.hp > 20 ? '#ffd166' : '#ff5c5c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(X, Y, R + 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.hp / 100); ctx.stroke();
  ctx.fillStyle = '#10131a'; ctx.font = `800 ${Math.round(R * 1.15)}px Manrope, sans-serif`;
  ctx.fillText(String(p.num), X, Y + 0.5);
  // закладка/дефьюз
  if (p.action) {
    const need = p.action === 'plant' ? TAC.PLANT_TIME : p.kit ? TAC.DEFUSE_KIT : TAC.DEFUSE;
    timerRing(X, Y, R + 8, p.actT / need, p.action === 'plant' ? '#ff5c5c' : '#6ea8ec');
  }
  // подпись: ник + оружие
  const name = p.name, wk = G.weapon(p);
  ctx.font = '600 11px Manrope, sans-serif';
  const tw = ctx.measureText(name).width + 10;
  ctx.fillStyle = 'rgba(14,16,22,.78)';
  roundRect(X - tw / 2, Y - R - 26, tw, 15, 4); ctx.fill();
  ctx.fillStyle = rgbStr(col);
  ctx.fillText(name, X, Y - R - 18);
  ctx.font = '600 9px "JetBrains Mono", monospace';
  ctx.fillStyle = rgbStr(col, 0.85);
  ctx.fillText(TWEAP[wk].name, X, Y - R - 33);
  // бомба у носителя (видна своим)
  if (G.bomb.state === 'carried' && G.bomb.carrier === p.id && (p.us || visE.has(p.id))) {
    ctx.fillStyle = '#e35454'; ctx.fillRect(X + R + 2, Y - 4, 8, 6);
  }
}

function roundRect(x, y, w, h, r) {
  const ctx = TU.ctx;
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* ===================== HUD: карточки, таймер, фид, таймлайн ===================== */
function tacCards() {
  const G = TU.G, visE = tacVisibleEnemies();
  for (const team of ['CT', 'T']) {
    const html = G.team(team).map(p => {
      const mine = p.us, seen = mine || !p.alive || visE.has(p.id);
      if (seen) TU.seen.set(p.id, G.weapon(p));
      const wk = mine ? G.weapon(p) : TU.seen.get(p.id);
      const nades = mine ? ['smoke', 'flash', 'molotov'].flatMap(k => Array(p.nades[k]).fill(k)) : [];
      const hp = p.alive ? (mine ? p.hp : 100) : 0; // HP врагов не показываем — только жив/мёртв
      return `<div class="tcard ${team.toLowerCase()} ${mine ? 'us' : ''} ${p.alive ? '' : 'dead'} ${TU.sel.has(p.id) ? 'sel' : ''}" data-id="${p.id}">
        <div class="tc-top"><b>${p.num}</b><span class="nm">${esc(p.name)}</span><span class="kd">${p.stats.k}<i>/</i>${p.stats.d}</span></div>
        <div class="tc-mid"><span class="money">${mine ? '$' + p.money : ''}</span><span class="role">${TROLES[p.role]}</span>${G.bomb.state === 'carried' && G.bomb.carrier === p.id && mine ? '<span class="bomb">C4</span>' : ''}</div>
        <div class="tc-bar"><div class="hp" style="width:${hp}%"></div>
          <span class="hpv">${!p.alive ? '✕' : mine ? hp : '?'}</span>
          ${mine && p.armor ? `<span class="arm" title="${p.helmet ? 'кевлар + шлем' : 'кевлар'}">${p.helmet ? TICON.helmet : TICON.vest}</span>` : ''}
          ${mine && p.kit ? `<span class="arm">${TICON.kit}</span>` : ''}
          <span class="nd">${nades.map(k => `<i class="n-${k}"></i>`).join('')}</span>
          <span class="wpn" title="${wk ? TWEAP[wk].name : ''}">${wk ? weaponIcon(wk) : '?'}</span>
        </div>
      </div>`;
    }).join('');
    $(team === 'CT' ? '#tacCT' : '#tacT').innerHTML = html;
  }
}

function tacTopbar() {
  const G = TU.G;
  $('#tacScoreCT').textContent = G.score.CT;
  $('#tacScoreT').textContent = G.score.T;
  $('#tacRound').textContent = G.auto ? `Ставка ${money(TU.bet.stake)} на ${G.us} · ×${TU.bet.mult} · соперники: ${TU.bet.name.toLowerCase()}` : `Раунд ${G.roundNo} / ${G.rounds} · ты за ${G.us}`;
  const planted = G.bomb.state === 'planted';
  const left = planted ? TAC.BOMB_TIME - (G.t - G.bomb.plantT) : G.timeLeft;
  const s = Math.max(0, Math.ceil(left));
  const el = $('#tacTimer');
  el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  el.classList.toggle('bomb', planted);
  $('#tacPause').hidden = !(TU.paused && G.phase === 'live');
}

function tacFeed() {
  const G = TU.G, list = G.feed.filter(f => G.t - f.t < 7 || G.phase !== 'live').slice(-5);
  const key = list.map(f => f.t).join(',');
  if (key === TU.feedKey) return;
  TU.feedKey = key;
  const nm = (o, cls = '') => `<span class="kn ${o.team.toLowerCase()} ${cls}">${esc(o.name)}</span>`;
  $('#tacFeed').innerHTML = list.map(f => `<div class="kf ${f.us ? 'mine' : ''}">
    ${f.att && f.att.blind ? `<span class="ki">${TICON.blind}</span>` : ''}
    ${f.att ? nm(f.att) : ''}
    ${f.assist ? `<span class="kp">+</span>${f.assist.flash ? `<span class="ki">${TICON.flash}</span>` : ''}${nm(f.assist)}` : ''}
    <span class="kw">${weaponIcon(f.weapon)}</span>
    ${f.hs ? `<span class="ki hs">${TICON.hs}</span>` : ''}
    ${nm(f.vic)}
  </div>`).join('');
}

function tacTimeline() {
  const G = TU.G, total = G.bomb.plantT ? G.bomb.plantT + TAC.BOMB_TIME : TAC.ROUND_TIME;
  const x = v => clamp(v / Math.max(total, G.t), 0, 1) * 100;
  let h = '';
  if (G.bomb.plantT) h += `<div class="tl-bomb" style="left:${x(G.bomb.plantT)}%;width:${x(G.bomb.plantT + TAC.BOMB_TIME) - x(G.bomb.plantT)}%"></div>`;
  for (const m of G.marks) {
    if (m.kind === 'kill') h += `<i class="tl-k ${m.team.toLowerCase()}" style="left:${x(m.t)}%"></i>`;
    else if (m.kind === 'plant') h += `<b class="tl-p" style="left:${x(m.t)}%">${m.site}</b>`;
  }
  h += `<i class="tl-now" style="left:${x(G.t)}%"></i>`;
  $('#tacTimeline').innerHTML = h;
  $('#tacRounds').innerHTML = G.history.map(r => `<i class="${r.win ? 'w' : 'l'}" title="Раунд ${r.n}: ${r.win ? 'победа' : 'поражение'}">${r.n}</i>`).join('');
}

function tacActions() {
  const G = TU.G, sel = [...TU.sel].map(id => G.players[id]).filter(p => p.alive && p.us);
  const has = k => sel.some(p => p.nades[k]);
  const count = k => sel.reduce((s, p) => s + p.nades[k], 0);
  const one = sel.length === 1 ? sel[0] : null;
  const canPlant = sel.some(p => p.team === 'T' && G.bomb.state === 'carried' && G.bomb.carrier === p.id && G.siteAt(p.x, p.y));
  const canDefuse = sel.some(p => p.team === 'CT' && G.bomb.state === 'planted' && Math.hypot(p.x - G.bomb.x, p.y - G.bomb.y) < 14);
  const btn = (act, key, label, ok, extra = '') => `<button class="tb ${TU.throwMode && TU.throwMode.type === act ? 'on' : ''}" data-act="${act}" ${ok ? '' : 'disabled'}><span class="kbd">${key}</span>${label}${extra}</button>`;
  $('#tacActions').innerHTML = !sel.length
    ? `<span class="tb-hint">${G.auto ? 'Помоги гранатами: выбери своего бота (клик или 1–5), потом Q / E / R и клик по карте' : 'Выбери игрока: клик по нему, цифры 1–5 или рамкой'}</span>`
    : `<span class="tb-who">${one ? `${one.num} · ${esc(one.name)}` : `выбрано: ${sel.length}`}</span>
      ${btn('smoke', 'Q', 'Дым', has('smoke'), count('smoke') ? ` ×${count('smoke')}` : '')}
      ${btn('flash', 'E', 'Флешка', has('flash'), count('flash') ? ` ×${count('flash')}` : '')}
      ${btn('molotov', 'R', nadeName('molotov', G.us), has('molotov'), count('molotov') ? ` ×${count('molotov')}` : '')}
      ${G.auto ? '<span class="tb-hint">боты ходят сами</span>' : `${btn('use', 'F', G.us === 'T' ? 'Заложить' : 'Разминировать', canPlant || canDefuse)}
      ${btn('stop', 'S', 'Стоп', true)}`}`;
}

/* ===================== закуп ===================== */
function tacBuyPanel() {
  const G = TU.G, us = G.team(G.us), T = G.us === 'T';
  const total = us.reduce((s, p) => s + p.money, 0);
  const loss = TAC.LOSS[Math.min(G.lossStreak[G.us], TAC.LOSS.length - 1)];
  const items = [
    ['Пистолет', ['deagle']],
    ['SMG', [T ? 'mac10' : 'mp9']],
    ['Винтовки', T ? ['galil', 'ak47'] : ['famas', 'm4a1s']],
    ['Снайпер', ['awp']],
    ['Броня', ['kevlar', 'helmet', ...(T ? [] : ['kit'])]],
    ['Гранаты', ['smoke', 'flash', 'molotov']],
  ];
  const label = (p, k) => (TWEAP[k] ? TWEAP[k].name : k === 'kevlar' ? 'Кевлар' : k === 'helmet' ? 'Кевлар+шлем' : k === 'kit' ? 'Кусачки' : nadeName(k, p.team));
  const owned = (p, k) => (TWEAP[k] ? p.prim === k || p.pist === k : k === 'kevlar' ? p.armor >= 100 : k === 'helmet' ? p.helmet : k === 'kit' ? p.kit : p.nades[k] > 0);
  $('#tacBuyBody').innerHTML = `
    <div class="tbuy-head">
      <div><span class="lbl">${G.auto ? `Закуп · ставка ${money(TU.bet.stake)} на ${G.us} · ×${TU.bet.mult}` : `Закуп · раунд ${G.roundNo} из ${G.rounds}`}</span><h3>Деньги команды: <b>$${total}</b></h3>
        <p class="hint">${G.auto ? 'Раунд играют боты. Ты решаешь, что им купить, и во время раунда кидаешь купленные гранаты — что не бросишь, боты кинут сами.' : `Проиграете раунд — каждый получит +${loss}${T ? ' (+$800, если бомба заложена)' : ''}. Выиграете — +$3250.`}</p></div>
      <div class="tbuy-presets"><button class="btn sm" data-preset="eco">Эко</button><button class="btn sm" data-preset="force">Форс</button><button class="btn sm" data-preset="full">Фулл бай по ролям</button><button class="btn ghost sm" data-preset="reset">Сбросить</button><button class="btn primary" id="tacGo">В бой <span class="arr">→</span></button></div>
    </div>
    <div class="tbuy-rows">${us.map(p => `
      <div class="tbuy-row">
        <div class="tbuy-who"><b class="${p.team.toLowerCase()}">${p.num}</b><span>${esc(p.name)}<small>${TROLES[p.role]}</small></span><em>$${p.money}</em></div>
        <div class="tbuy-gear">${weaponIcon(G.weapon(p))}<span>${TWEAP[G.weapon(p)].name}</span>${p.armor ? `<span class="chip">${p.helmet ? 'шлем' : 'кевлар'}</span>` : ''}${p.kit ? '<span class="chip">кусачки</span>' : ''}${['smoke', 'flash', 'molotov'].map(k => p.nades[k] ? `<span class="chip">${nadeName(k, p.team)}${p.nades[k] > 1 ? ' ×' + p.nades[k] : ''}</span>` : '').join('')}</div>
        <div class="tbuy-items">${items.map(([cat, keys]) => `<div class="tbuy-cat"><span>${cat}</span>${keys.map(k => `<button class="ti ${owned(p, k) ? 'own' : ''}" data-p="${p.id}" data-item="${k}" ${G.canBuy(p, k) ? '' : 'disabled'}>${label(p, k)}<small>$${G.price(p, k)}</small></button>`).join('')}</div>`).join('')}
          <button class="ti undo" data-undo="${p.id}" title="Вернуть деньги за покупки этого раунда">↺</button></div>
      </div>`).join('')}
    </div>
    <div class="tbuy-foot"><span class="hint">${G.auto ? `Боты противника уже закупились: у всех по ${BET.MONEY}.` : "Боты противника уже закупились. Выжившие сохраняют оружие и гранаты."}</span></div>`;
}

/* ===================== раунды ===================== */
const REASON = { elim: 'устранение', time: 'время вышло', bomb: 'бомба взорвалась', defuse: 'бомба разминирована' };

function tacNextRound() {
  const G = TU.G;
  G.startRound();
  G.markBuyStart();
  TU.sel.clear(); TU.throwMode = null; TU.seen.clear(); TU.lastSeen.clear(); TU.feedKey = ''; TU.endAt = 0;
  TU.paused = true;
  $('#tacRoundEnd').hidden = true;
  $('#tacBuy').hidden = false;
  tacBuyPanel();
  tacFit();
  tacHud(true);
}

function tacGoLive() {
  const G = TU.G;
  $("#tacAuto").hidden = G.auto; // в ставке боты расставляются сами
  $('#tacBuy').hidden = true;
  G.goLive();
  TU.paused = false;
  Sound.init(); Sound.modeStart();
  tacHud(true);
}

function tacHud(all) {
  tacTopbar();
  tacFeed();
  if (all || performance.now() - TU.hudAt > 150) { TU.hudAt = performance.now(); tacCards(); tacTimeline(); tacActions(); }
}

function tacRoundEnd() {
  if (TU.G.auto) return betRoundEnd();
  const G = TU.G, r = G.result, h = G.history[G.history.length - 1];
  const us = G.team(G.us);
  $('#tacRoundEndBody').innerHTML = `
    <div class="tre-top ${r.win ? 'win' : 'lose'}"><span class="lbl">Раунд ${G.roundNo} · ${REASON[r.reason]}</span><h2>${r.win ? 'Раунд за вами' : 'Раунд проигран'}</h2>
      <p>Счёт ${G.us === 'CT' ? `<b>${G.score.CT}</b> : ${G.score.T}` : `${G.score.CT} : <b>${G.score.T}</b>`} · ты за ${G.us}</p></div>
    <div class="tre-facts">
      <div><span>Убийства / смерти</span><b>${h.kills} / ${h.deaths}</b></div>
      <div><span>Первый фраг</span><b>${h.opening === 'won' ? 'ваш' : h.opening === 'lost' ? 'соперника' : '—'}</b></div>
      <div><span>Смерти без размена</span><b>${h.untraded}</b></div>
      <div><span>Клатч</span><b>${h.clutch ? `${h.clutch.name} 1 vs ${h.clutch.vs} — ${h.clutch.won ? 'вывез' : 'не вывез'}` : '—'}</b></div>
    </div>
    <div class="tre-money">${us.map(p => `<span><b class="${p.team.toLowerCase()}">${p.num}</b>${esc(p.name)} <em>$${p.money}</em></span>`).join('')}</div>
    <div class="btns"><button class="btn primary" id="tacNext">${G.roundNo >= G.rounds ? 'Итоги игры' : 'Следующий раунд'} <span class="arr">→</span></button></div>`;
  $('#tacRoundEnd').hidden = false;
}

/* ===================== итоги и разбор ===================== */
function tacResults() {
  const G = TU.G, us = G.team(G.us), H = G.history;
  const won = H.filter(r => r.win).length;
  const sum = f => H.reduce((s, r) => s + f(r), 0);
  const open = H.filter(r => r.opening), openW = open.filter(r => r.opening === 'won').length;
  const clutches = H.filter(r => r.clutch), clutchW = clutches.filter(r => r.clutch.won).length;
  const deaths = sum(r => r.deaths), untraded = sum(r => r.untraded), moving = sum(r => r.deathsMoving), early = sum(r => r.deathsEarly);
  const nadesThrown = us.reduce((s, p) => s + p.stats.nades, 0), fa = us.reduce((s, p) => s + p.stats.fa, 0);
  const leftover = sum(r => r.nadesLeft);
  const tips = [];
  if (open.length >= 3 && openW / open.length < 0.5) tips.push(['Отдаёте первый фраг', `выиграно ${openW} из ${open.length} первых дуэлей`, 'Не выходите на угол в одиночку: работайте парой, выходите под флешку, держите угол, а не идите на него.']);
  if (deaths >= 4 && untraded / deaths > 0.5) tips.push(['Смерти без размена', `${untraded} из ${deaths} смертей никто не разменял`, 'Держите игроков ближе: второй должен успеть выстрелить в того, кто убил первого (≈ 3 секунды).']);
  if (deaths >= 4 && moving / deaths > 0.5) tips.push(['Умираете на ходу', `${moving} из ${deaths} смертей — в движении`, 'Тот, кто стоит на месте и держит угол, стреляет точнее и раньше. Ставьте игроков и разворачивайте взгляд (ПКМ).']);
  if (early >= 3) tips.push(['Ранние смерти', `${early} смертей в первые 20 секунд`, G.us === 'CT' ? 'Не пикайте на старте — дождитесь, пока T сами выйдут на ваши углы.' : 'Не бегите в открытую в начале раунда — сначала соберитесь и раскидайте гранаты.']);
  if (leftover >= 4) tips.push(['Гранаты не используются', `${leftover} гранат осталось у выживших`, 'Каждая граната — это информация или выигранная дуэль. Дым на угол CT, флешка перед выходом, молотов в укрытие.']);
  if (G.us === 'T') { const noPlant = H.filter(r => !r.win && !r.plantT).length; if (noPlant >= 2) tips.push(['Не доходите до закладки', `${noPlant} проигранных раундов без закладки`, 'Выбирайте плэнт раньше и заходите всей командой, а не по одному.']); }
  if (G.us === 'CT') { const lostSites = H.filter(r => !r.win && r.plantT).length; if (lostSites >= 2) tips.push(['Сдаёте плэнт', `${lostSites} раундов: T заложили и выиграли`, 'Когда T заходят на плэнт — ротируйте остальных сразу, а ретейк начинайте вместе, а не по одному.']); }
  const good = [];
  if (fa) good.push(`флеш-ассистов: ${fa}`);
  if (clutchW) good.push(`вывезено клатчей: ${clutchW}`);
  if (open.length && openW / open.length >= 0.6) good.push(`первые дуэли: ${openW} из ${open.length}`);

  $('#tacResultsBody').innerHTML = `
    <div class="tre-top ${won > H.length - won ? 'win' : won === H.length - won ? '' : 'lose'}"><span class="lbl">Тактика · итоги · ты за ${G.us}</span>
      <h2>${won} : ${H.length - won}</h2><p>${won > H.length - won ? 'Победа над ботами' : won === H.length - won ? 'Ничья' : 'Боты сильнее — разберём, почему'}</p></div>
    <div class="tres-rounds">${H.map(r => `<span class="${r.win ? 'w' : 'l'}"><b>${r.n}</b>${r.win ? 'победа' : 'поражение'}<small>${REASON[r.reason]}${r.site ? ' · ' + r.site : ''}</small></span>`).join('')}</div>
    <div class="tres-table">
      <div class="th"><span>Игрок</span><span>K</span><span>D</span><span>A</span><span>ADR</span><span>HS%</span><span>Гранат</span><span>Флеш-асс.</span><span>Первые K/D</span><span>Клатчи</span></div>
      ${us.map(p => `<div><span><b class="${p.team.toLowerCase()}">${p.num}</b>${esc(p.name)}<small>${TROLES[p.role]}</small></span><span>${p.stats.k}</span><span>${p.stats.d}</span><span>${p.stats.a}</span><span>${Math.round(p.stats.dmg / Math.max(1, H.length))}</span><span>${p.stats.k ? Math.round(p.stats.hs / p.stats.k * 100) : 0}%</span><span>${p.stats.nades}</span><span>${p.stats.fa}</span><span>${p.stats.opK}/${p.stats.opD}</span><span>${p.stats.clutchW}/${p.stats.clutchA}</span></div>`).join('')}
    </div>
    <div class="res-cols" style="grid-template-columns:1fr">
      <div><h4>Разбор</h4><div class="issues">${tips.length ? tips.map(([title, val, tip]) => `<div class="issue s2"><i></i><div><b>${title}</b><em>${val}</em><span>${tip}</span></div></div>`).join('') : '<div class="issue ok"><i></i><div><b>Явных тактических ошибок не найдено</b><span>Попробуй ботов посильнее или другую сторону.</span></div></div>'}</div>
      ${good.length ? `<div class="good"><b>Хорошо:</b> ${good.join(' · ')}</div>` : ''}
      <p class="note">Гранат брошено командой: ${nadesThrown}. Клатчи: ${clutchW} из ${clutches.length}.</p></div>
    </div>
    <div class="btns"><button class="btn primary" id="tacAgain">Сыграть ещё</button><button class="btn ghost" id="tacMenu">В меню</button></div>`;
  $('#tacRoundEnd').hidden = true;
  $('#tacResults').hidden = false;
}

/* ===================== настройка игры ===================== */
const TU_SETUP = { mode: 'train', side: null, diff: 'normal', roles: ['igl', 'entry', 'awp', 'support', 'lurk'], names: null, pause: false, tier: 'normal', stake: 100 };
const tacModeTabs = () => `<div class="seg tset-mode" id="tacMode">${[['train', 'Тренировка · 6 раундов'], ['bet', 'Ставка · бот против бота']].map(([k, n]) => `<button data-v="${k}" class="${TU_SETUP.mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;

function tacSetupRender() {
  const st = TU_SETUP;
  if (!st.names) st.names = [nickName() === 'Игрок' ? 'Ты' : nickName(), ...MATE_NAMES];
  if (st.mode === 'bet') return betSetupRender();
  $('#tacSetupBody').innerHTML = `${tacModeTabs()}
    <div class="tset-head"><span class="lbl">Тактика · 6 раундов против ботов</span><h2>За какую сторону играешь?</h2>
      <p>Ты — капитан: двигаешь игроков, раскидываешь гранаты и управляешь закупом. Цель — выиграть раунды и вывозить клатчи.</p></div>
    <div class="tset-sides ${st.side ? '' : 'need'}">
      <button class="tside ct ${st.side === 'CT' ? 'on' : ''}" data-side="CT"><b>CT</b><span>Защита плэнтов: держи углы, ротируйся, ретейк</span></button>
      <button class="tside t ${st.side === 'T' ? 'on' : ''}" data-side="T"><b>T</b><span>Атака: выбери плэнт, раскидай гранаты, заложи бомбу</span></button>
    </div>
    <div class="tset-grid">
      <div>
        <div class="lbl" style="margin-bottom:10px">Команда и роли</div>
        ${st.names.map((n, i) => `<div class="tset-row"><b class="${(st.side || 'CT').toLowerCase()}">${(st.side === 'T' ? 6 : 1) + i}</b>
          <input class="field" data-name="${i}" value="${esc(n)}" maxlength="14">
          <select class="field" data-role="${i}">${TROLE_KEYS.map(k => `<option value="${k}" ${st.roles[i] === k ? 'selected' : ''}>${TROLES[k]}</option>`).join('')}</select></div>`).join('')}
        <p class="hint" style="margin-top:8px">Роль определяет «Фулл бай по ролям»: снайпер берёт AWP, саппорт — дым и молотов, энтри — флешки.</p>
      </div>
      <div>
        <div class="lbl" style="margin-bottom:10px">Боты</div>
        <div class="seg" id="tacDiff">${[['easy', 'Слабые'], ['normal', 'Средние'], ['hard', 'Сильные']].map(([k, n]) => `<button data-v="${k}" class="${st.diff === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <label class="tset-opt"><span class="tg"><input type="checkbox" id="tacPauseOpt" ${st.pause ? 'checked' : ''}><i></i></span>Пауза при первом контакте в раунде</label>
        <div class="tset-keys">
          <div><span class="kbd">ЛКМ</span> по игроку — выбрать, по карте — идти</div>
          <div><span class="kbd">Shift</span>+ЛКМ — добавить точку маршрута</div>
          <div><span class="kbd">Рамка</span> — выбрать нескольких, потом клик — все туда</div>
          <div><span class="kbd">ПКМ</span> — куда смотреть (держать угол)</div>
          <div><span class="kbd">Q</span><span class="kbd">E</span><span class="kbd">R</span> — дым, флешка, молотов → клик, куда бросить</div>
          <div><span class="kbd">F</span> — заложить / разминировать · <span class="kbd">S</span> — стоп</div>
          <div><span class="kbd">Пробел</span> — пауза · колесо — масштаб · ПКМ-тянуть — двигать карту</div>
        </div>
      </div>
    </div>
    <div class="btns"><button class="btn primary big" id="tacStart" ${st.side ? '' : 'disabled'}>${st.side ? `Начать игру за ${st.side}` : 'Сначала выбери сторону'} <span class="arr">→</span></button><button class="btn ghost" id="tacSetupMenu">В меню</button></div>`;
}

/* ===================== режим «Ставка»: бот против бота =====================
   Игрок ставит демо-монеты на CT или T и выбирает силу соперников (×1,5 / ×2 / ×5). Раунд играют боты;
   игрок решает закуп своей пятёрки и во время раунда кидает её гранаты. Баланс — демо, в localStorage.
   Шансы уровней подобраны tools/bet-calibrate.js (BET в sim.js). */
const BET_START = 1000;
const betBal = () => store.get('dink.bet', { bal: BET_START, hist: [] });
const betSave = v => store.set('dink.bet', v);
const money = v => (Math.round(v * 100) / 100).toLocaleString('ru-RU') + ' ◈';
const betTier = () => BET.TIERS.find(t => t.k === TU_SETUP.tier) || BET.TIERS[1];

function betStartBtn() {
  const st = TU_SETUP, b = betBal(), t = betTier(), btn = $('#tacStart');
  if (!btn) return;
  const ok = st.side && st.stake >= 1 && st.stake <= b.bal;
  btn.disabled = !ok;
  btn.innerHTML = !st.side ? 'Сначала выбери сторону' : st.stake > b.bal ? 'Не хватает демо-монет' : st.stake < 1 ? 'Введи ставку' : `Поставить ${money(st.stake)} на ${st.side} → выигрыш ${money(st.stake * t.mult)} <span class="arr">→</span>`;
}

function betSetupRender() {
  const st = TU_SETUP, b = betBal();
  $('#tacSetupBody').innerHTML = `${tacModeTabs()}
    <div class="tset-head"><span class="lbl">Ставка · один раунд · бот против бота</span><h2>На кого ставишь?</h2>
      <p>Раунд играют боты с обеих сторон. Ты закупаешь свою пятёрку и помогаешь ей гранатами — двигать игроков нельзя. Выиграла твоя сторона — ставка умножается.</p></div>
    <div class="tset-sides ${st.side ? '' : 'need'}">
      <button class="tside ct ${st.side === 'CT' ? 'on' : ''}" data-side="CT"><b>CT</b><span>Защита: боты держат плэнты, ротируются, ретейкают</span></button>
      <button class="tside t ${st.side === 'T' ? 'on' : ''}" data-side="T"><b>T</b><span>Атака: боты выходят на плэнт и закладывают бомбу</span></button>
    </div>
    <div class="tset-grid">
      <div>
        <div class="lbl" style="margin-bottom:10px">Соперники</div>
        <div class="bet-tiers">${BET.TIERS.map(t => `<button class="bet-tier ${st.tier === t.k ? 'on' : ''}" data-tier="${t.k}"><b>×${String(t.mult).replace('.', ',')}</b><span>${t.name} боты</span></button>`).join('')}</div>
        <p class="hint" style="margin-top:8px">Твоя пятёрка — всегда средние боты. Чем сильнее соперники, тем реже победа и тем больше множитель.</p>
      </div>
      <div>
        <div class="lbl" style="margin-bottom:10px">Ставка · баланс <b class="bet-bal">${money(b.bal)}</b> <small class="dim">(демо)</small></div>
        <div class="bet-stake"><input class="field" id="betStake" type="number" min="1" step="1" value="${st.stake}">
          ${[50, 100, 250].map(v => `<button class="btn sm" data-stake="${v}">${v}</button>`).join('')}<button class="btn sm" data-stake="all">Всё</button></div>
        ${b.bal < 1 ? '<button class="btn sm" id="betRefill" style="margin-top:8px">Пополнить демо до 1000</button>' : ''}
        ${b.hist.length ? `<div class="bet-hist">${b.hist.slice(-8).reverse().map(h => `<span class="${h.win ? 'w' : 'l'}">${h.side} ×${String(h.mult).replace('.', ',')} · ${h.win ? '+' + money(h.stake * h.mult) : '−' + money(h.stake)}</span>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="btns"><button class="btn primary big" id="tacStart" disabled></button><button class="btn ghost" id="tacSetupMenu">В меню</button></div>`;
  betStartBtn();
}

function betStart() {
  const st = TU_SETUP, b = betBal(), t = betTier();
  if (!st.side || !(st.stake >= 1) || st.stake > b.bal) return;
  b.bal -= st.stake; betSave(b);
  TU.bet = { stake: st.stake, mult: t.mult, name: t.name, k: t.k, side: st.side, done: false };
  Sound.init(); Sound.modeStart();
  TU.G = new TacGame({ side: st.side, auto: true, rounds: 1, money: BET.MONEY, skillUs: BET.US, skillThem: betSkill(t.s[st.side]), roles: st.roles, names: MATE_NAMES.concat('Bot Sanya') });
  TU.G.onEvent = tacSound;
  $('#tacSetup').hidden = true;
  $('#tacResults').hidden = true;
  tacResize();
  tacNextRound();
  // закуп по умолчанию — фулл бай по ролям: можно поменять
  for (const p of TU.G.team(TU.G.us)) TU.G.autoBuy(p, 'full');
  tacBuyPanel(); tacCards();
}

function betRoundEnd() {
  const G = TU.G, B = TU.bet, win = G.result.win;
  if (!B.done) {
    B.done = true;
    const b = betBal();
    if (win) b.bal += B.stake * B.mult;
    b.hist = b.hist.concat({ side: B.side, mult: B.mult, stake: B.stake, win, at: Date.now() }).slice(-50);
    betSave(b);
  }
  const us = G.team(G.us), nades = us.reduce((s, p) => s + p.stats.nades, 0);
  $('#tacRoundEndBody').innerHTML = `
    <div class="tre-top ${win ? 'win' : 'lose'}"><span class="lbl">Ставка · ${REASON[G.result.reason]}</span><h2>${win ? `+${money(B.stake * B.mult)}` : `−${money(B.stake)}`}</h2>
      <p>${win ? `${G.us} выиграли раунд — ставка ×${String(B.mult).replace('.', ',')}` : `${G.us} проиграли раунд`} · баланс ${money(betBal().bal)}</p></div>
    <div class="tre-facts">
      <div><span>Убийства / смерти</span><b>${us.reduce((s, p) => s + p.stats.k, 0)} / ${us.reduce((s, p) => s + p.stats.d, 0)}</b></div>
      <div><span>Первый фраг</span><b>${G.firstKill ? (G.firstKill.att.us ? 'ваш' : 'соперника') : '—'}</b></div>
      <div><span>Гранат брошено</span><b>${nades}</b></div>
      <div><span>Бомба</span><b>${G.bomb.plantT ? 'заложена на ' + G.bomb.site : 'не заложена'}</b></div>
    </div>
    <div class="btns"><button class="btn primary" id="betAgain">Новая ставка <span class="arr">→</span></button><button class="btn ghost" id="betMenu">В меню</button></div>`;
  $('#tacRoundEnd').hidden = false;
}

/* ===================== открыть / закрыть ===================== */
function tacOpen() {
  TU.el = $('#tac');
  TU.cv = $('#tacCv');
  TU.ctx = TU.cv.getContext('2d');
  if (!TU.mapCv) tacBuildMap();
  bgStop();
  TU.el.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#tacResults').hidden = true; $('#tacRoundEnd').hidden = true; $('#tacBuy').hidden = true;
  $('#tacSetup').hidden = false;
  TU_SETUP.side = null; // сторону выбирают каждый раз перед игрой
  tacSetupRender();
  tacResize();
  if (!TU.raf) TU.raf = requestAnimationFrame(tacLoop);
}

function tacClose() {
  TU.el.hidden = true;
  document.body.style.overflow = '';
  cancelAnimationFrame(TU.raf); TU.raf = 0;
  TU.G = null;
  refreshHome();
  bgStart();
}

function tacStart() {
  const st = TU_SETUP;
  if (!st.side) return;
  if (st.mode === 'bet') return betStart();
  TU.bet = null;
  Sound.init(); Sound.modeStart(); // начало игры
  TU.G = new TacGame({ side: st.side, difficulty: st.diff, roles: st.roles, names: st.names, pauseOnContact: st.pause });
  TU.G.onEvent = tacSound;
  $('#tacSetup').hidden = true;
  $('#tacResults').hidden = true;
  tacResize();
  tacNextRound();
}

/* ===================== цикл ===================== */
function tacLoop(now) {
  TU.raf = requestAnimationFrame(tacLoop);
  const G = TU.G;
  const dt = Math.min(0.1, (now - (TU.last || now)) / 1000);
  TU.last = now;
  if (!G) return;
  if (G.phase === 'live' && !TU.paused) {
    TU.acc += dt * TU.speed;
    while (TU.acc >= 1 / 30 && G.phase === 'live') { G.update(1 / 30); TU.acc -= 1 / 30; }
    if (G.requestPause) { G.requestPause = false; TU.paused = true; }
  }
  if (G.phase === 'end' && !TU.endAt) TU.endAt = now;
  if (TU.endAt && now - TU.endAt > 1200 && $('#tacRoundEnd').hidden && $('#tacResults').hidden) tacRoundEnd();
  tacRender();
  tacHud(false);
}

/* ===================== ввод ===================== */
function tacUnitAt(sx, sy) {
  const G = TU.G;
  let best = null, bd = 16;
  for (const p of G.players) {
    if (!p.us || !p.alive) continue;
    const [X, Y] = w2s(p.x, p.y), d = Math.hypot(X - sx, Y - sy);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function tacSelected() { return [...TU.sel].map(id => TU.G.players[id]).filter(p => p && p.alive && p.us); }

function tacOrderMove(wx, wy, append) {
  const G = TU.G, sel = tacSelected();
  if (!sel.length) return;
  // несколько игроков — встают рядом, а не в одну точку
  sel.forEach((p, i) => {
    const a = (i / sel.length) * Math.PI * 2, r = sel.length > 1 ? 14 : 0;
    const [x, y] = sel.length > 1 ? G.nav.nearestFloor(wx + Math.cos(a) * r, wy + Math.sin(a) * r, 2) : [wx, wy];
    G.moveTo(p, x, y, { append });
  });
}

function tacStartThrow(type) {
  const sel = tacSelected().filter(p => p.nades[type]);
  if (!sel.length) return;
  TU.throwMode = TU.throwMode && TU.throwMode.type === type ? null : { type, id: sel[0].id };
  tacActions();
}

function tacAction(act) {
  const G = TU.G;
  if (act === 'smoke' || act === 'flash' || act === 'molotov') return tacStartThrow(act);
  if (G.auto) return;
  for (const p of tacSelected()) {
    if (act === 'use') G.useAction(p);
    else if (act === 'stop') G.stop(p);
  }
  tacActions();
}

function tacInitInput() {
  const cv = $('#tacCv');
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', e => {
    if (!TU.G || TU.G.phase === 'buy') return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    TU.mouse.down = { x, y, b: e.button, shift: e.shiftKey, moved: false, cam: { ...TU.cam } };
  });
  window.addEventListener('mousemove', e => {
    if (!TU.G || TU.el.hidden) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    TU.mouse.x = x; TU.mouse.y = y;
    const d = TU.mouse.down;
    if (!d) return;
    if (Math.hypot(x - d.x, y - d.y) > 5) d.moved = true;
    if (!d.moved) return;
    if (d.b === 2 || d.b === 1) { TU.cam.ox = d.cam.ox + (x - d.x); TU.cam.oy = d.cam.oy + (y - d.y); }
    else if (d.b === 0 && !TU.throwMode) TU.mouse.box = [Math.min(d.x, x), Math.min(d.y, y), Math.max(d.x, x), Math.max(d.y, y)];
  });
  window.addEventListener('mouseup', e => {
    const d = TU.mouse.down;
    TU.mouse.down = null;
    if (!d || !TU.G) return;
    const G = TU.G, r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const [wx, wy] = s2w(x, y);
    if (d.b === 0) {
      if (TU.mouse.box) {
        const [x0, y0, x1, y1] = TU.mouse.box;
        TU.mouse.box = null;
        if (!d.shift) TU.sel.clear();
        for (const p of G.players) { if (!p.us || !p.alive) continue; const [X, Y] = w2s(p.x, p.y); if (X >= x0 && X <= x1 && Y >= y0 && Y <= y1) TU.sel.add(p.id); }
        tacActions();
        return;
      }
      if (d.moved) return;
      if (TU.throwMode) {
        const p = G.players[TU.throwMode.id];
        G.throwNade(p, TU.throwMode.type, wx, wy);
        TU.throwMode = null;
        tacActions();
        return;
      }
      const u = tacUnitAt(x, y);
      if (u) {
        if (d.shift) { if (TU.sel.has(u.id)) TU.sel.delete(u.id); else TU.sel.add(u.id); }
        else { TU.sel.clear(); TU.sel.add(u.id); }
        tacActions();
        return;
      }
      if (!G.auto) tacOrderMove(wx, wy, d.shift);
    } else if (d.b === 2 && !d.moved) {
      if (TU.throwMode) { TU.throwMode = null; tacActions(); return; }
      if (!G.auto) for (const p of tacSelected()) G.lookAt(p, wx, wy);
    }
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * 0.0015), c = TU.cam, s = clamp(c.s * k, 0.4, 6);
    const [wx, wy] = s2w(x, y);
    c.s = s; c.ox = x - wx * s; c.oy = y - wy * s;
  }, { passive: false });

  document.addEventListener('keydown', e => {
    if (!TU.el || TU.el.hidden || !TU.G) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const G = TU.G, k = e.code;
    if (k === 'Space') { e.preventDefault(); if (G.phase === 'live') TU.paused = !TU.paused; return; }
    if (k === 'Tab') { e.preventDefault(); tacFit(); return; }
    if (G.phase !== 'live') return;
    if (/^Digit[1-5]$/.test(k)) {
      const p = G.team(G.us)[+k.slice(5) - 1];
      if (p && p.alive) { if (!e.shiftKey) TU.sel.clear(); TU.sel.add(p.id); tacActions(); }
      return;
    }
    if (k === 'Backquote' || (k === 'KeyA' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); TU.sel = new Set(G.alive(G.us).map(p => p.id)); tacActions(); return; }
    const map = { KeyQ: 'smoke', KeyE: 'flash', KeyR: 'molotov', KeyF: 'use', KeyS: 'stop' };
    if (map[k]) { e.preventDefault(); tacAction(map[k]); return; }
    if (k === 'Escape') { if (TU.throwMode) TU.throwMode = null; else TU.sel.clear(); tacActions(); }
    if (k === 'Minus') TU.speed = Math.max(0.25, TU.speed / 2);
    if (k === 'Equal') TU.speed = Math.min(2, TU.speed * 2);
  });
  window.addEventListener('resize', () => { if (TU.el && !TU.el.hidden) { tacResize(); if (TU.bbox) tacFit(); } });

  // кнопки и делегирование
  $('#tacActions').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) tacAction(b.dataset.act); });
  for (const side of ['#tacCT', '#tacT']) $(side).addEventListener('click', e => {
    const c = e.target.closest('.tcard.us'); if (!c || !TU.G) return;
    const p = TU.G.players[+c.dataset.id]; if (!p.alive) return;
    if (!e.shiftKey) TU.sel.clear(); TU.sel.add(p.id); tacActions();
  });
  $('#tacBuy').addEventListener('click', e => {
    const G = TU.G; if (!G) return;
    const it = e.target.closest('[data-item]');
    if (it && !it.disabled) { G.buy(G.players[+it.dataset.p], it.dataset.item); tacBuyPanel(); tacCards(); return; }
    const u = e.target.closest('[data-undo]');
    if (u) { G.undoBuy(G.players[+u.dataset.undo]); tacBuyPanel(); tacCards(); return; }
    const pr = e.target.closest('[data-preset]');
    if (pr) {
      for (const p of G.team(G.us)) { G.undoBuy(p); if (pr.dataset.preset !== 'reset') G.autoBuy(p, pr.dataset.preset === 'full' ? 'full' : pr.dataset.preset); }
      tacBuyPanel(); tacCards(); return;
    }
    if (e.target.closest('#tacGo')) tacGoLive();
  });
  $('#tacRoundEnd').addEventListener('click', e => {
    if (e.target.closest('#betAgain')) { $('#tacRoundEnd').hidden = true; $('#tacSetup').hidden = false; TU.G = null; tacSetupRender(); return; }
    if (e.target.closest('#betMenu')) { tacClose(); return; }
    if (!e.target.closest('#tacNext')) return;
    if (TU.G.roundNo >= TU.G.rounds) tacResults(); else tacNextRound();
  });
  $('#tacResults').addEventListener('click', e => {
    if (e.target.closest('#tacAgain')) { $('#tacResults').hidden = true; $('#tacSetup').hidden = false; tacSetupRender(); }
    if (e.target.closest('#tacMenu')) tacClose();
  });
  $('#tacSetup').addEventListener('click', e => {
    const s = e.target.closest('[data-side]');
    if (s) { TU_SETUP.side = s.dataset.side; tacSetupRender(); return; }
    const md = e.target.closest('#tacMode [data-v]');
    if (md) { TU_SETUP.mode = md.dataset.v; tacSetupRender(); return; }
    const tr = e.target.closest('[data-tier]');
    if (tr) { TU_SETUP.tier = tr.dataset.tier; tacSetupRender(); return; }
    const sk = e.target.closest('[data-stake]');
    if (sk) { TU_SETUP.stake = sk.dataset.stake === 'all' ? Math.floor(betBal().bal) : +sk.dataset.stake; tacSetupRender(); return; }
    if (e.target.closest('#betRefill')) { betSave({ ...betBal(), bal: BET_START }); tacSetupRender(); return; }
    const dv = e.target.closest('#tacDiff [data-v]');
    if (dv) { TU_SETUP.diff = dv.dataset.v; tacSetupRender(); return; }
    if (e.target.closest('#tacStart')) tacStart();
    if (e.target.closest('#tacSetupMenu')) tacClose();
  });
  $('#tacSetup').addEventListener('input', e => {
    const n = e.target.dataset.name, r = e.target.dataset.role;
    if (n != null) TU_SETUP.names[+n] = e.target.value.trim().slice(0, 14) || TU_SETUP.names[+n];
    if (r != null) TU_SETUP.roles[+r] = e.target.value;
    if (e.target.id === 'tacPauseOpt') TU_SETUP.pause = e.target.checked;
    if (e.target.id === 'betStake') { TU_SETUP.stake = Math.max(0, Math.floor(+e.target.value || 0)); betStartBtn(); }
  });
  $('#tacExit').onclick = () => { if (!TU.G || TU.G.phase === 'end' && TU.G.auto || confirm(TU.G.auto ? 'Выйти? Ставка сгорит.' : 'Выйти из тактики? Текущая игра не сохранится.')) tacClose(); };
  $('#tacAuto').onclick = () => { if (TU.G && TU.G.phase === 'live' && !TU.G.auto) TU.G.autoPlaceUs(); };
  $('#tacSpeed').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { TU.speed = +b.dataset.v; setSeg($('#tacSpeed'), b.dataset.v); } });
  $('#tacPauseBtn').onclick = () => { if (TU.G && TU.G.phase === 'live') TU.paused = !TU.paused; };
  $('#tacOpenBtn').onclick = tacOpen;
}
tacInitInput();

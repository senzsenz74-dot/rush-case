/* Звук заставки (js/intro.js) — синтез с нуля, без чужих записей.
   Ритм и характер повторяют интро CS2 (разобрано по спектру intro.webm): низкий искажённый гул и цифровой треск на сменах кадров,
   удар при появлении короны (у CS2 — «2»), «электрическое» гудение 65 Гц с дрожанием 71 Гц, вспышки цифрового шипения.
   Дальше 3 с — свои: сбои 4,4–5,3 с как на картинке, нарастание, большой удар на осколках, хвост, пока открывается сайт.
   Время событий = кадры заставки (60 в секунду).
   Запуск: node tools/intro-sound.js [ffmpeg]  →  assets/intro.mp3  (ffmpeg по умолчанию — ../promo-video/node_modules/ffmpeg-static) */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const SR = 48000, DUR = 7.3, N = Math.round(SR * DUR), TAU = Math.PI * 2;
const L = new Float64Array(N), R = new Float64Array(N), VL = new Float64Array(N), VR = new Float64Array(N); // сухой звук и посыл в реверб
const S = t => Math.round(t * SR);

function rnd(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 * 2 - 1; }; }
class BQ {
  constructor(type, f, q, g) { this.x1 = this.x2 = this.y1 = this.y2 = 0; if (type) this.set(type, f, q, g); }
  set(type, f, q = .707, gain = 0) {
    f = Math.min(Math.max(f, 10), SR * .45);
    const w = TAU * f / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q), A = Math.pow(10, gain / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (type === 'bp') { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else { b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A; } // 'pk'
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0; return this;
  }
  p(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}
const crush = (x, bits) => { const q = Math.pow(2, bits - 1); return Math.round(x * q) / q; };
const saw = ph => 2 * (ph - Math.floor(ph + .5));
function out(i, l, r, send) { if (i < 0 || i >= N) return; L[i] += l; R[i] += r; if (send) { VL[i] += l * send; VR[i] += r * send; } }
// кривая по точкам [время, дБ]; одинаковое время = ступенька
function curve(pts) {
  return t => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; return t1 === t0 ? v1 : v0 + (v1 - v0) * (t - t0) / (t1 - t0); }
    return pts[pts.length - 1][1];
  };
}
const db = v => Math.pow(10, v / 20);

/* ---------- 1. цифровой треск на сменах кадров ---------- */
function hit(t, k, seed, reps, thump = true) {
  const r = rnd(seed), r2 = rnd(seed + 99), i0 = S(t), pan = r() * .45;
  const len = S(.05 + k * .09), hold = 2 + (Math.abs(r()) * 7 | 0), gap = S(.008 + Math.abs(r()) * .012);
  reps = reps || (k > .6 ? 3 : Math.abs(r()) < .45 ? 2 : 1);
  const hl = new BQ('hp', 700 + 1800 * Math.abs(r()), .8), hr = new BQ('hp', 700 + 1800 * Math.abs(r()), .8);
  const tone = [3100, 4200, 5800, 7300][Math.abs(r()) * 4 | 0];
  let shl = 0, shr = 0;
  for (let n = 0; n < len; n++) {
    const rep = Math.min(reps - 1, Math.floor(n / gap)), tt = (n - rep * gap) / SR;
    const env = Math.exp(-tt / (.007 + .012 * k)) * (rep ? .65 / rep : 1) * Math.min(1, n / 12);
    if (n % hold === 0) { shl = r2(); shr = r2(); }
    const dig = Math.sign(Math.sin(TAU * tone * n / SR)) * .12;
    const xl = hl.p(r()) * .55 + crush(shl, 3) * .45 + dig, xr = hr.p(r()) * .55 + crush(shr, 3) * .45 + dig;
    const g = env * k * .42;
    out(i0 + n, xl * g * (1 - pan), xr * g * (1 + pan), .18);
  }
  if (thump && k >= .8) { // глухой толчок под сильным треском
    let ph = 0; const len2 = S(.16);
    for (let n = 0; n < len2; n++) {
      const tt = n / SR, f = 46 + 130 * k * Math.exp(-tt / .018); ph += TAU * f / SR;
      const v = Math.sin(ph) * Math.exp(-tt / (.05 + .05 * k)) * k * .5 * Math.min(1, n / 24);
      out(i0 + n, v, v, .1);
    }
  }
}

/* ---------- 2. низкий искажённый гул (начало и финал) ---------- */
function braam(t0, t1, f0, envF, cutF, gain, seed, chop) {
  const r = rnd(seed), lpl = new BQ('lp', 200, .9), lpr = new BQ('lp', 200, .9), rum = new BQ('bp', 320, .7), rum2 = new BQ('bp', 300, .7);
  const fl = [new BQ('pk', 352, 2.2, 9), new BQ('pk', 200, 2, 4)], fr = [new BQ('pk', 352, 2.2, 9), new BQ('pk', 200, 2, 4)];
  let p1 = 0, p2 = .31, p3 = .62, p4 = .13, ps = 0;
  for (let i = S(t0); i < S(t1) && i < N; i++) {
    const t = i / SR, e = envF(t) * (chop ? chop(t) : 1);
    p1 += f0 / SR; p2 += f0 * 1.0071 / SR; p3 += f0 * .9932 / SR; p4 += f0 * 2.003 / SR; ps += TAU * f0 / SR;
    if (e < 1e-5) continue;
    if (i % 32 === 0) { const c = cutF(t); lpl.set('lp', c, 1.1); lpr.set('lp', c * 1.04, 1.1); }
    const nz = r();
    const al = saw(p4) + saw(p2 * 2) * .7 + saw(p1) * .45, ar = saw(p4) + saw(p3 * 2) * .7 + saw(p1) * .45;
    const grit = rum.p(nz) * 1.6, grit2 = rum2.p(r()) * 1.6;
    const yl = Math.tanh(fl[1].p(fl[0].p(lpl.p(al))) * 4.2 + grit), yr = Math.tanh(fr[1].p(fr[0].p(lpr.p(ar))) * 4.2 + grit2);
    const sub = Math.sin(ps) * .55;
    out(i, (yl * 1.1 + sub) * e * gain, (yr * 1.1 + sub) * e * gain, .12);
  }
}
// бисерный треск поверх гула
function crackle(t0, t1, rate, envF, gain, seed) {
  const r = rnd(seed), bl = new BQ('bp', 4200, 1.2), br = new BQ('bp', 3600, 1.2);
  let il = 0, ir = 0;
  for (let i = S(t0); i < S(t1); i++) {
    const t = i / SR;
    if (Math.abs(r()) < rate / SR) il = .9 * (1 + r() * .3);
    if (Math.abs(r()) < rate / SR) ir = .9 * (1 + r() * .3);
    const e = envF(t) * gain;
    out(i, bl.p(il) * e, br.p(ir) * e, .05);
    il *= .82; ir *= .82;
  }
}

/* ---------- 3. удар ---------- */
function impact(t, k, seed, fTop = 120, fEnd = 36, tau = .38, subK = .95, zap = 0) {
  const r = rnd(seed), i0 = S(t), len = S(tau * 4.5);
  let ph = 0, ph2 = 0; const zb = new BQ('bp', 1100, .6), hl = new BQ('hp', 1400, .7), hr = new BQ('hp', 1500, .7), ring = [1187, 1733, 2468, 3120];
  for (let n = 0; n < len && i0 + n < N; n++) {
    const tt = n / SR, at = Math.min(1, n / 40);
    const f = fEnd + (fTop - fEnd) * Math.exp(-tt / .09); ph += TAU * f / SR;
    const f2 = 55 + 160 * Math.exp(-tt / .02); ph2 += TAU * f2 / SR;
    const sub = Math.tanh(Math.sin(ph) * 1.8) * Math.exp(-tt / tau);
    const punch = Math.sin(ph2) * Math.exp(-tt / .045);
    const ce = Math.exp(-tt / .022), crl = hl.p(r()) * ce, crr = hr.p(r()) * ce;
    let rg = 0; for (let j = 0; j < ring.length; j++) rg += Math.sin(TAU * ring[j] * tt + j) * Math.exp(-tt / (.09 + j * .02)) / (j + 1);
    const m = (sub * subK + punch * .55) * at * k, g = k;
    const z = zap ? zb.p(Math.tanh((crl + crr) * 3 + Math.sin(TAU * 912 * tt) * 2)) * Math.exp(-tt / .06) * zap : 0;
    out(i0 + n, m + (crl * .5 + rg * .05) * g + z, m + (crr * .5 + rg * .05) * g + z * .9, .35);
  }
}

/* ---------- 4. «электрическое» гудение: 65,4 Гц, гармоники как у CS2 ---------- */
const HARM = [[1, .28], [2, .1], [3, .12], [4, .35], [5, .2], [6, .63], [7, .45], [8, .79], [9, .2], [10, .15], [12, .12], [14, 1], [15, .63], [16, .2], [21, .06]];
function hum(t0, t1, gainDb, pitch, level) {
  const r = rnd(77), phl = HARM.map(() => Math.abs(r()) * TAU), phr = HARM.map(() => Math.abs(r()) * TAU);
  let al = 0, ar = 0; const sm = new BQ('lp', 9000, .7), sm2 = new BQ('lp', 9000, .7);
  let gs = 0; // сглаженная громкость (без щелчков на ступеньках)
  for (let i = S(t0); i < S(t1) && i < N; i++) {
    const t = i / SR, pm = pitch(t), wob = 1 + .0042 * Math.sin(TAU * 3.1 * t) + .0018 * Math.sin(TAU * .7 * t + 1);
    al += TAU * 65.41 * pm * wob / SR; ar += TAU * 65.55 * pm * wob / SR;
    const gt = db(gainDb(t)); gs += (gt - gs) * .012;
    if (gs < 1e-4) continue;
    let sl = 0, sr = 0;
    for (let j = 0; j < HARM.length; j++) { const [h, a] = HARM[j]; if (h * 65.4 * pm > 16000) continue; sl += a * Math.sin(h * al + phl[j]); sr += a * Math.sin(h * ar + phr[j]); }
    const yl = sm.p(Math.tanh(sl * .32)), yr = sm2.p(Math.tanh(sr * .32));
    out(i, yl * gs * level, yr * gs * level, .06);
  }
}

/* ---------- 5. тонкий писк ---------- */
function whine(t0, t1, level, seed) {
  const r = rnd(seed); let on = 1, cnt = 0;
  for (let i = S(t0); i < S(t1); i++) {
    const t = i / SR, n = i - S(t0);
    if (cnt-- <= 0) { cnt = S(.012 + Math.abs(r()) * .03); on = Math.abs(r()) < .82 ? 1 : 0; }
    const e = Math.min(1, n / 200) * Math.min(1, (S(t1) - i) / 4000) * on;
    const v = (Math.sin(TAU * 9146 * t) + .55 * Math.sin(TAU * 6580 * t + 1)) * level * e;
    out(i, v * .9, v * 1.1, 0);
  }
}

/* ---------- 6. цифровое шипение с писками данных ---------- */
function stat(t0, t1, k, seed) {
  const r = rnd(seed), hl = new BQ('hp', 2400, .7), hr = new BQ('hp', 2600, .7), ll = new BQ('lp', 14000, .7), lr = new BQ('lp', 14000, .7);
  const cl = new BQ('hp', 1500, .7), cr = new BQ('hp', 1500, .7);
  let cnt = 0, on = 1, hold = 4, tone = 4000, tOn = 0, shl = 0, shr = 0;
  const a = S(t0), b = S(t1);
  for (let i = a; i < b && i < N; i++) {
    const n = i - a;
    if (cnt-- <= 0) { cnt = S(.008 + Math.abs(r()) * .022); on = Math.abs(r()) < .78 ? 1 : .15; hold = 2 + (Math.abs(r()) * 9 | 0); tone = [4000, 5800, 9300, 7300, 2900][Math.abs(r()) * 5 | 0]; tOn = Math.abs(r()) < .5 ? 1 : 0; }
    if (n % hold === 0) { shl = r(); shr = r(); }
    const edge = Math.min(1, n / 150) * Math.min(1, (b - i) / 150);
    const hs = ll.p(hl.p(r())) * .55, hs2 = lr.p(hr.p(r())) * .55;
    const dg = cl.p(crush(shl, 2)) * .4, dg2 = cr.p(crush(shr, 2)) * .4;
    const tn = Math.sign(Math.sin(TAU * tone * n / SR)) * .16 * tOn;
    const g = k * .11 * on * edge;
    out(i, (hs + dg + tn) * g, (hs2 + dg2 + tn) * g, .08);
  }
}

/* ---------- 7. нарастание перед финалом ---------- */
function riser(t0, t1, level, seed) {
  const r = rnd(seed), bl = new BQ('bp', 300, 2), br = new BQ('bp', 300, 2); let ph = 0;
  for (let i = S(t0); i < S(t1); i++) {
    const t = i / SR, x = (t - t0) / (t1 - t0), f = 300 * Math.pow(18, x);
    if (i % 32 === 0) { bl.set('bp', f, 2.2); br.set('bp', f * 1.08, 2.2); }
    ph += TAU * (180 + 700 * x * x) / SR;
    const e = Math.pow(x, 2.2) * level;
    out(i, (bl.p(r()) * 1.4 + Math.sin(ph) * .08) * e, (br.p(r()) * 1.4 + Math.sin(ph * 1.003) * .08) * e, .2);
  }
}

/* ---------- 8. хвост после финала ---------- */
function tail(t, level, seed) {
  const r = rnd(seed), lp = new BQ('lp', 180, .7), lp2 = new BQ('lp', 160, .7); let ph = 0;
  for (let i = S(t); i < N; i++) {
    const tt = (i - S(t)) / SR; ph += TAU * (40 + 14 * Math.exp(-tt / .15)) / SR;
    const e = Math.exp(-tt / .38) * Math.min(1, tt / .004) * level;
    out(i, (Math.sin(ph) * .8 + lp.p(r()) * 2.2) * e, (Math.sin(ph) * .8 + lp2.p(r()) * 2.2) * e, .4);
  }
}

/* ================= партитура (секунды = кадры / 60) ================= */
// начало: смены кадров глитча (как у CS2: самые сильные — огромная буква, сборка логотипа, появление короны)
[[0, .35], [.067, .5], [.133, .45], [.167, .3], [.2, .5], [.267, .35], [.333, .22], [.367, 1], [.4, .45], [.433, .5], [.467, .45], [.5, .4],
 [.533, .85], [.567, .35], [.767, .32], [.8, .5], [.833, .35], [.867, .3], [.9, .55], [.967, .5], [1, .45], [1.033, .28], [1.1, .35]]
  .forEach(([t, k], i) => hit(t, k, 100 + i));
// гул 0–0,93 с: растёт к 0,42, держится до 0,6, спадает; на сменах кадров — акценты и короткие провалы
const cuts = [0, .067, .133, .2, .267, .333, .367, .4, .433, .467, .5, .533, .567, .767, .8, .833, .867, .9];
const chop = t => { let a = .8; for (const c of cuts) { const d = t - c; if (d >= 0 && d < .06) a += .35 * Math.exp(-d / .02); if (d >= -.012 && d < 0 && (c * 1000 | 0) % 3 === 0) a *= .25; } return a; };
const openEnv = curve([[0, -40], [.1, -28], [.17, -22], [.32, -13], [.42, -5], [.5, -3], [.57, 0], [.62, -3], [.72, -9], [.82, -12], [.92, -14], [.935, -45], [.97, -70]]);
braam(0, .97, 49, t => db(openEnv(t)),
  t => 180 + 1900 * Math.sin(Math.min(1, t / .95) * Math.PI) ** 1.6, .5, 11, chop);
crackle(.25, .78, 380, t => Math.max(0, Math.sin((t - .25) / .53 * Math.PI)), .25, 12);
// появление короны: удар, писк, гудение
impact(.933, .9, 21, 110, 40, .1, .2, .7);
whine(.94, 1.37, .015, 22);
// гудение: 0,93–3,0 — по громкости CS2 (прерывается на сбоях), дальше — своё
const humDb = curve([
  [.93, -60], [.94, 0], [.96, -6], [.98, -11], [1.0, -8], [1.04, -11], [1.08, -14], [1.1, -11], [1.12, -14], [1.16, -7], [1.18, -8], [1.2, -17], [1.22, -23], [1.26, -27], [1.32, -26],
  [1.34, -16], [1.36, -12], [1.4, -15], [1.44, -18], [1.5, -12], [1.54, -10], [1.58, -15], [1.6, -20], [1.62, -30], [1.64, -21], [1.66, -18], [1.7, -23], [1.72, -14], [1.76, -12], [1.82, -15],
  [1.88, -12], [1.92, -9], [1.94, -13], [1.96, -21], [1.98, -28], [2.0, -21], [2.02, -17], [2.06, -25], [2.12, -22], [2.18, -23], [2.22, -16], [2.26, -13], [2.3, -14], [2.34, -26], [2.36, -31],
  [2.42, -24], [2.46, -28], [2.5, -22], [2.54, -17], [2.58, -21], [2.6, -26], [2.64, -16], [2.66, -16], [2.7, -29], [2.74, -24], [2.8, -29], [2.82, -25], [2.86, -34], [2.9, -22], [2.96, -20],
  [3.0, -21], [3.4, -19], [3.9, -21], [4.38, -22], [4.4, -12], [4.44, -12], [4.45, -40], [4.48, -40], [4.5, -21], [4.6, -21], [4.61, -32], [4.63, -21], [4.7, -11], [4.77, -13], [4.78, -40],
  [4.8, -40], [4.81, -14], [4.86, -20], [4.9, -10], [4.95, -12], [4.96, -40], [4.99, -40], [5.0, -8], [5.08, -15], [5.12, -19], [5.2, -12], [5.24, -12], [5.25, -40], [5.28, -40], [5.3, -19],
  [5.6, -18], [5.633, -10], [5.648, -10], [5.65, -50], [5.665, -50], [5.667, -11], [5.7, -15], [5.85, -26], [5.866, -30], [5.867, -90]]);
const humPitch = t => {
  if (t >= 2 && t < 2.05) return 1.06;
  if (t >= 5 && t < 5.08) return 1 - .5 * (t - 5) / .08;               // «магнитофон тормозит»
  if (t >= 5.667 && t < 5.867) return 1 + .06 * Math.sin(TAU * 14 * t) - .2 * (t - 5.667) / .2;
  return 1;
};
hum(.93, 5.88, humDb, humPitch, .48);
(function drone() {
  const g = curve([[2.2, -80], [2.3, -47], [3, -46], [4.3, -48], [5.6, -46], [5.84, -42], [5.866, -60], [5.867, -100]]); let ph = 0, gs = 0;
  for (let i = S(2.2); i < S(5.87); i++) { const t = i / SR; ph += TAU * 65.41 / SR; gs += (db(g(t)) - gs) * .003; const v = (Math.sin(ph) + .1 * Math.sin(2 * ph)) * gs; out(i, v, v, 0); }
})();
// мелкие сбои на «спокойном» логотипе (кадры заставки)
[[1.05, .14], [1.1, .14], [1.45, .2], [1.667, .12], [1.7, .15], [1.9, .12], [2, .5], [2.05, .3], [2.1, .3], [2.2, .2], [2.3, .3], [2.4, .2], [2.5, .35], [2.7, .25], [2.8, .15], [2.917, .1], [3.317, .08],
 [4.4, .32], [4.6, .12], [4.7, .42], [4.75, .2], [4.8, .26], [4.9, .4], [4.95, .2], [5, .6], [5.05, .26], [5.2, .36], [5.25, .2]]
  .forEach(([t, k], i) => hit(t, k * (t < 3 ? .4 : .55), 300 + i, 0, t >= 4.99 && t < 5.01));
// цифровое шипение (1,37–2,92 — как у CS2; 4,4–5,27 — на сбоях картинки)
[[1.37, 1.7, .55], [1.71, 1.78, .65], [2, 2.2, .85], [2.23, 2.4, .7], [2.5, 2.55, .45], [2.75, 2.92, .7],
 [4.4, 4.45, .55], [4.7, 4.83, .75], [4.9, 5, .85], [5, 5.1, .6], [5.2, 5.27, .6]].forEach(([a, b, k], i) => stat(a, b, k * (a < 1.8 ? 1 : a < 3 ? .16 : .3), 500 + i));
whine(4.7, 4.83, .006, 23);
// финал: логотип рассыпается, нарастание, огромные осколки, сайт
[[5.633, .5], [5.65, .2], [5.667, .55], [5.7, .45], [5.733, .4], [5.767, .45], [5.8, .3]].forEach(([t, k], i) => hit(t, k, 700 + i));
stat(5.7, 5.85, .45, 600);
crackle(5.7, 5.86, 520, t => (t - 5.7) / .16, .3, 601);
riser(5.6, 5.867, .2, 602);
impact(5.867, 1.05, 31, 140, 34, .3);
[[5.867, 1, 3], [5.9, .7], [5.933, .72], [5.967, .78]].forEach(([t, k, rp], i) => hit(t, k, 800 + i, rp));
const endEnv = curve([[5.86, -60], [5.867, 0], [5.9, -3], [5.901, -40], [5.903, -2], [5.933, -4], [5.934, -40], [5.936, -2], [5.967, -3], [5.968, -40], [5.97, -1], [6.0, -2], [6.03, -60]]);
braam(5.86, 6.04, 49, t => db(endEnv(t)), t => 700 + 500 * Math.sin((t - 5.86) * 40), .55, 32);
stat(5.867, 6.0, 1, 603);
impact(6, .6, 33, 90, 32, .35);
tail(6, .14, 34);

/* ================= реверб, сведение, лимитер ================= */
function freeverb(inL, inR, room, damp) {
  const sc = SR / 44100, cT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aT = [556, 441, 341, 225], sp = 23;
  const mk = ts => ts.map(t => ({ b: new Float64Array(Math.round(t * sc)), i: 0, f: 0 }));
  const cl = mk(cT), cr = mk(cT.map(t => t + sp)), al = mk(aT), ar = mk(aT.map(t => t + sp));
  const oL = new Float64Array(N), oR = new Float64Array(N);
  const comb = (cs, x) => { let y = 0; for (const c of cs) { const o = c.b[c.i]; c.f = o * (1 - damp) + c.f * damp; c.b[c.i] = x + c.f * room; if (++c.i >= c.b.length) c.i = 0; y += o; } return y; };
  const ap = (as, y) => { for (const a of as) { const b = a.b[a.i]; a.b[a.i] = y + b * .5; if (++a.i >= a.b.length) a.i = 0; y = b - y; } return y; };
  for (let n = 0; n < N; n++) { const x = (inL[n] + inR[n]) * .015; oL[n] = ap(al, comb(cl, x)); oR[n] = ap(ar, comb(cr, x)); }
  return [oL, oR];
}
const [wl, wr] = freeverb(VL, VR, .86, .3);
const mix = [new Float64Array(N), new Float64Array(N)];
const hp = [[new BQ('hp', 26, .7), new BQ('hp', 26, .7)], [new BQ('hp', 26, .7), new BQ('hp', 26, .7)]];
for (let i = 0; i < N; i++) {
  mix[0][i] = hp[0][1].p(hp[0][0].p(L[i] + wl[i] * 1.6));
  mix[1][i] = hp[1][1].p(hp[1][0].p(R[i] + wr[i] * 1.6));
}
// мягкий компрессор + пиковый лимитер с заглядыванием вперёд (потолок −1 дБ)
let env = 0; const thr = db(-16), ratio = 2.5;
for (let i = 0; i < N; i++) {
  const x = Math.max(Math.abs(mix[0][i]), Math.abs(mix[1][i]));
  env = x > env ? env + (x - env) * .02 : env + (x - env) * .0004;
  const g = env > thr ? Math.pow(env / thr, 1 / ratio - 1) : 1;
  mix[0][i] *= g; mix[1][i] *= g;
}
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(mix[0][i]), Math.abs(mix[1][i]));
const pre = db(-1) / peak * db(3); // на 3 дБ громче, лишнее срежет лимитер
const ceil = db(-1), look = 144, gl = new Float64Array(N);
for (let i = 0; i < N; i++) { const x = Math.max(Math.abs(mix[0][i]), Math.abs(mix[1][i])) * pre; gl[i] = x > ceil ? ceil / x : 1; }
const gmin = new Float64Array(N); // минимум усиления в окне впереди
for (let i = N - 1; i >= 0; i--) { let m = gl[i]; for (let j = 1; j < look && i + j < N; j += 8) m = Math.min(m, gl[i + j]); gmin[i] = m; }
let gs = 1; const fade = S(.25);
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  gs += (gmin[i] - gs) * (gmin[i] < gs ? .05 : .0015);
  const fo = i > N - fade ? (N - i) / fade : 1;
  for (let c = 0; c < 2; c++) { const v = Math.max(-1, Math.min(1, mix[c][i] * pre * gs * fo)); pcm.writeInt16LE(Math.round(v * 32767), (i * 2 + c) * 2); }
}
function wav(file, data) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
const root = path.join(__dirname, '..'), wavFile = path.join(root, 'intro-sound.wav'), mp3 = path.join(root, 'assets', 'intro.mp3');
wav(wavFile, pcm);
const ff = process.argv[2] || path.join(root, 'promo-video', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
try {
  execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wavFile, '-c:a', 'libmp3lame', '-b:a', '160k', mp3]);
  fs.unlinkSync(wavFile);
  console.log('готово:', mp3, Math.round(fs.statSync(mp3).size / 1024) + ' КБ');
} catch (e) { console.log('WAV:', wavFile, '(ffmpeg не найден — mp3 не сделан)'); }

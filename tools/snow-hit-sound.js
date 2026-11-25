/* Новогодний звук удара кейса о сугроб (ивент до 19.01.2027, владелец 26.11): играет ПОВЕРХ обычного звука падения
   (assets/cs2case/snd/fall.wav), в момент, когда кейс входит в сугроб (c2NySnow в js/app.js).
   Синтез, без чужих записей: 1) мягкий глухой удар (низкий тон 120→50 Гц); 2) хруст сминаемого снега (сотни коротких
   щелчков шума 2–5 кГц, гуще в начале); 3) шорох снежной пыли (шум без верха, плавно гаснет); 4) тихие шлепки комьев о землю.
   Запуск: node tools/snow-hit-sound.js  →  assets/ny/snow-hit.wav (44,1 кГц, моно, 16 бит) */
'use strict';
const fs = require('fs'), path = require('path');
const SR = 44100, LEN = 1.1, N = Math.round(SR * LEN), out = new Float32Array(N);
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;
// биквад-фильтр (RBJ): тип 'lp' | 'hp' | 'bp'
function biquad(type, f, q) {
  const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
  let b0, b1, b2; const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  else { b0 = al; b1 = 0; b2 = -al; }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
const T0 = 0.012; // небольшой запас до удара
// 1) глухой удар
{ let ph = 0; const lp = biquad('lp', 400, .7);
  for (let i = 0; i < N; i++) { const t = i / SR - T0; if (t < 0) continue; const f = 50 + 70 * Math.exp(-t / .05); ph += 2 * Math.PI * f / SR;
    const env = Math.min(1, t / .004) * Math.exp(-t / .075); out[i] += lp(Math.sin(ph) * .75 + noise() * .25) * env * .9; } }
// 2) хруст: короткие щелчки шума через полосовой фильтр
{ const crunch = new Float32Array(N);
  for (let g = 0; g < 420; g++) {
    const t = T0 + Math.pow(rnd(), 2.2) * .34, d = .0015 + rnd() * .005, a = (.25 + rnd() * .75) * Math.exp(-(t - T0) / .14), i0 = Math.round(t * SR), n = Math.round(d * SR);
    for (let k = 0; k < n && i0 + k < N; k++) crunch[i0 + k] += noise() * a * Math.sin(Math.PI * k / n);
  }
  const bp = biquad('bp', 3200, .8), hp = biquad('hp', 1200, .7);
  for (let i = 0; i < N; i++) out[i] += hp(bp(crunch[i])) * 1.6; }
// 3) шорох снежной пыли
{ const lp = biquad('lp', 1600, .6), hp = biquad('hp', 250, .7); let pink = 0;
  for (let i = 0; i < N; i++) { const t = i / SR - T0; if (t < 0) continue; pink = pink * .97 + noise() * .03;
    const env = Math.min(1, t / .02) * Math.exp(-t / .28); out[i] += hp(lp(noise() * .6 + pink * 8)) * env * .32; } }
// 4) комья падают на землю (как в c2NySnow: ~0,3–0,8 с после удара)
for (let c = 0; c < 9; c++) {
  const t = T0 + .3 + rnd() * .5, a = .12 + rnd() * .18, i0 = Math.round(t * SR), n = Math.round(.03 * SR), lp = biquad('lp', 700 + rnd() * 600, .7);
  for (let k = 0; k < n && i0 + k < N; k++) out[i0 + k] += lp(noise()) * a * Math.exp(-k / SR / .008);
}
// хвост на ноль, нормализация
for (let i = 0; i < N; i++) { const t = i / SR; if (t > LEN - .15) out[i] *= (LEN - t) / .15; }
let pk = 0; for (const v of out) pk = Math.max(pk, Math.abs(v));
const buf = Buffer.alloc(44 + N * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] / pk * .89)) * 32767), 44 + i * 2);
const file = path.join(__dirname, '..', 'assets', 'ny', 'snow-hit.wav');
fs.writeFileSync(file, buf); console.log('готово:', path.relative(path.join(__dirname, '..'), file), (buf.length / 1024).toFixed(0) + ' КБ');

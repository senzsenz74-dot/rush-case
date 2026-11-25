// Звуковая дорожка TikTok-баннера: звуки сайта (assets/cs2case/snd — те же громкости, что в js/app.js C2S) по меткам кадров
// из banner.js (BANNER.cues) + два мягких «вжуха» (синтез: розовый шум через плавающий полосовой фильтр).
//   падение кейсов — fall.wav; ключ и замок — open-lock.mp3 (ускорен ×1,5, как анимация); щелчки ленты — tick.wav;
//   дорогой дроп — хвост полного трека open-full.mp3 с 7,6 с (как на сайте), удар — на вылете ножа; буквы промокода — btn.wav.
// Громкость — −14 LUFS (норма TikTok), пики не выше −1,5 dBFS.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const SR = 48000;

module.exports = function buildAudio({ FFMPEG, SITE, cues, dur, outWav }) {
  const N = Math.ceil(dur * SR), L = new Float32Array(N), R = new Float32Array(N);
  const snd = f => path.join(SITE, 'assets', 'cs2case', 'snd', f);
  const dec = (file, af) => { // → стерео float32, 48 кГц, чередование L R
    const a = ['-hide_banner', '-loglevel', 'error', '-i', file];
    if (af) a.push('-af', af);
    a.push('-ac', '2', '-ar', String(SR), '-f', 'f32le', '-');
    const b = execFileSync(FFMPEG, a, { maxBuffer: 1 << 28 });
    return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  };
  const add = (pcm, at, gain, from = 0) => {
    const i0 = Math.round(at * SR), s0 = Math.round(from * SR), frames = pcm.length / 2;
    for (let j = 0; s0 + j < frames; j++) {
      const k = i0 + j;
      if (k < 0) continue;
      if (k >= N) break;
      L[k] += pcm[(s0 + j) * 2] * gain; R[k] += pcm[(s0 + j) * 2 + 1] * gain;
    }
  };
  // мягкий «вжух»: розовый шум, полосовой фильтр плывёт f0→f1, огибающая с пиком в доле peak; L и R — разный шум (объём)
  function whoosh(len, f0, f1, peak, seed) {
    const n = Math.round(len * SR), out = new Float32Array(n * 2);
    for (let ch = 0; ch < 2; ch++) {
      let s = (seed + ch * 7919) >>> 0;
      const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296 * 2 - 1;
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0, A = 0, C = 0, D = 0, E = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        if (i % 32 === 0) {
          const w = 2 * Math.PI * f0 * Math.pow(f1 / f0, u) / SR, al = Math.sin(w) / (2 * 1.1), a0 = 1 + al;
          A = al / a0; C = -al / a0; D = -2 * Math.cos(w) / a0; E = (1 - al) / a0;
        }
        const wv = rnd();
        b0 = .99886 * b0 + wv * .0555179; b1 = .99332 * b1 + wv * .0750759; b2 = .969 * b2 + wv * .153852;
        b3 = .8665 * b3 + wv * .3104856; b4 = .55 * b4 + wv * .5329522; b5 = -.7616 * b5 - wv * .016898;
        const pk = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + wv * .5362) * .11; b6 = wv * .115926;
        const y = A * pk + C * x2 - D * y1 - E * y2; x2 = x1; x1 = pk; y2 = y1; y1 = y;
        const env = u < peak ? Math.pow(u / peak, 2.2) : Math.pow(1 - (u - peak) / (1 - peak), 2.6);
        out[i * 2 + ch] = y * env;
      }
    }
    let p = 0; for (const v of out) p = Math.max(p, Math.abs(v));
    for (let i = 0; i < out.length; i++) out[i] /= p || 1;
    return out;
  }

  const c = cues;
  // 1) логотип влетает — лёгкий «вжух» вверх; кейсы падают — звук падения кейса с сайта (удар — когда центральный кейс встал)
  add(whoosh(.42, 320, 2600, .8, 11), 0, .12);
  add(dec(snd('fall.wav')), .15, .35);
  // 2) MAJOR летит в центр — «вжух» вниз
  add(whoosh(.32, 2400, 520, .45, 23), c.fly - .02, .09);
  // 3) ключ и замок — «Открытие+замок» сайта, ускорен как анимация (удар замка — на раскрытии лупы)
  add(dec(snd('open-lock.mp3'), `atempo=${c.openSpeed}`), c.open + .03, .35);
  // 4) щелчки ленты (как на сайте: громкость .6); в самом быстром начале — тише, чтобы не трещало
  const tick = dec(snd('tick.wav'));
  c.ticks.forEach((t, i) => { const gap = i ? t - c.ticks[i - 1] : .1; add(tick, t, .6 * Math.min(1, Math.max(.35, gap / .06))); });
  // 5) дорогой дроп — хвост полного трека с 7,6 с (на сайте так звучит выпадение дороже кейса); удар (+0,4 с) — на вылете ножа
  add(dec(snd('open-full.mp3')), c.reveal - .4, .35, 7.6);
  // 6) буквы промокода встают на место — короткие щелчки кнопки сайта
  const btn = dec(snd('btn.wav'));
  c.letters.forEach(t => add(btn, t, .2));
  // хвост: мягко гасим последние 0,15 с (ролик в TikTok идёт по кругу — без щелчка на стыке)
  const fo = Math.round(.15 * SR);
  for (let i = 0; i < fo; i++) { const g = Math.pow(1 - i / fo, 2), k = N - fo + i; L[k] *= g; R[k] *= g; }

  // запись float32 → громкость −14 LUFS → ограничитель пиков → 16 бит
  const raw = outWav + '.f32';
  const inter = Buffer.alloc(N * 8);
  for (let i = 0; i < N; i++) { inter.writeFloatLE(L[i], i * 8); inter.writeFloatLE(R[i], i * 8 + 4); }
  fs.writeFileSync(raw, inter);
  const inA = ['-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', raw];
  let lufs = -20;
  const r = require('child_process').spawnSync(FFMPEG, ['-hide_banner', '-nostats', ...inA, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /I:\s+(-?[\d.]+) LUFS/.exec((r.stderr || '').split('Summary:').pop());
  if (m) lufs = +m[1];
  const gain = -14 - lufs;
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...inA, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.84:attack=2:release=40:level=false`, '-c:a', 'pcm_s16le', outWav]);
  fs.unlinkSync(raw);
  return { lufsIn: lufs, gain };
};

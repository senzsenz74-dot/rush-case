// Звук вставки 9:16 (6,5 с), 48 кГц стерео, 24 бит → assets/insert-sfx.wav
// Звуки сайта (тот же движок Snd в OfflineAudioContext): щелчок кнопки, замок кейса, щелчки ленты по карточкам, джекпот, монета.
// Сверху — звуки монтажа: свист въезда рамки, удар и блеск выигрыша, металлический удар логотипа, блеск промокода.
// Тайминги — те же, что в insert-scene.js (T, ленточная математика).
// Запуск: node src/insert-audio.js (до node src/insert.js — он вклеивает дорожку в видео)
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const C = require('./config');

const DUR = 6.5, T = { in: [0, .5], press: [.55, .85], spin: [.85, 4.25], win: 4.25, out: [5.05, 5.35] };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const spinEase = k => 1 - Math.pow(1 - clamp(k, 0, 1), 4.2);
const WIN = 36, CW = 236 + 8, winW = 961, stop = -(WIN * CW + 118 - winW / 2 - 37);
// щелчки ленты — как на сайте: проверка раз в кадр (60 к/с), щелчок, когда под маркером сменилась карточка
const ticks = []; let last = null;
for (let t = T.spin[0]; t <= T.win + .001; t += 1 / 60) {
  const x = stop * spinEase(seg(t, ...T.spin)), idx = Math.floor((winW / 2 - x) / CW);
  if (last !== null && idx !== last) ticks.push(+t.toFixed(4)); last = idx;
}
const press = T.press[0] + .4 * (T.press[1] - T.press[0]);
const ev = [
  { t: press, m: 'click', args: [] },
  { t: T.spin[0], m: 'lock', args: [] },
  ...ticks.map(t => ({ t, m: 'tickCase', args: [] })),
  { t: T.win, m: 'jackpot', args: [] },
  { t: T.win + .2, m: 'coin', args: [] },
  { t: T.out[0] + .4, m: 'coin', args: [] },
];

function serve(port) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      const f = path.join(C.SITE, u.replace(/^\/+/, '') || 'index.html');
      if (u.endsWith('/js/app.js')) { const s = fs.readFileSync(path.join(C.SITE, 'js/app.js'), 'utf8'), i = s.lastIndexOf('})();'); r.writeHead(200, { 'content-type': 'application/javascript' }); return r.end(s.slice(0, i) + 'window.__Snd = Snd; window.__d = { st };\n' + s.slice(i)); }
      if (!f.startsWith(C.SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200); fs.createReadStream(f).pipe(r);
    }).listen(port, () => res(srv));
  });
}

(async () => {
  const port = C.PORT + 7, srv = await serve(port);
  const browser = await puppeteer.launch({ executablePath: C.CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await browser.newPage();
  await p.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__Snd', { timeout: 30000 });
  const out = await p.evaluate(async (ev, cue) => {
    const SR = 48000, N = Math.ceil(SR * cue.dur), off = new OfflineAudioContext(2, N, SR), Snd = window.__Snd;
    window.__d.st.sound = true;
    const master = off.createDynamicsCompressor(); master.threshold.value = -10; master.knee.value = 6; master.ratio.value = 3; master.attack.value = .002; master.release.value = .15; master.connect(off.destination);
    // --- звуковой движок сайта поверх офлайн-контекста: время «сейчас» = время события
    let TT = 0;
    const prox = new Proxy(off, { get(o, k) {
      if (k === 'currentTime') return TT; if (k === 'state') return 'running'; if (k === 'resume') return () => Promise.resolve(); if (k === 'destination') return master;
      if (k === 'createBufferSource') return () => { const n = o.createBufferSource(), st = n.start.bind(n); n.start = (w, ...r) => st(Math.max(w || 0, TT), ...r); return n; };
      const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; } });
    const comp = off.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .2;
    const sOut = off.createGain(); sOut.gain.value = .9; sOut.connect(comp); comp.connect(master);
    const nb = off.createBuffer(1, SR, SR), nd = nb.getChannelData(0); let sd = 7; for (let i = 0; i < SR; i++) { sd = (sd * 16807) % 2147483647; nd[i] = sd / 1073741823.5 - 1; }
    Snd.ctx = prox; Snd.out = sOut; Snd.nbuf = nb;
    Object.defineProperty(Snd, 'kk', { get: () => 1, configurable: true });
    Snd.warm(['lock', 'tick']);
    for (let i = 0; i < 100 && ['lock', 'tick'].some(k => !Snd.bufs[k]); i++) await new Promise(r => setTimeout(r, 100));
    for (const k of Object.keys(Snd.bufs)) if (Snd.bufs[k] instanceof ArrayBuffer) Snd.bufs[k] = await off.decodeAudioData(Snd.bufs[k]);
    let played = 0;
    for (const e of ev.sort((a, b) => a.t - b.t)) { TT = e.t; try { const r = Snd[e.m](...e.args); if (r && r.then) await r; played++; } catch (er) { /* звук пропущен */ } }

    // --- звуки монтажа (те же, что в audio.js)
    const verb = off.createConvolver(), irL = SR * 2.2, ir = off.createBuffer(2, irL, SR);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let s2 = 99 + c; for (let i = 0; i < irL; i++) { s2 = (s2 * 16807) % 2147483647; d[i] = (s2 / 1073741823.5 - 1) * Math.pow(1 - i / irL, 3.2) * (i < SR * .012 ? i / (SR * .012) : 1); } }
    verb.buffer = ir; const vG = off.createGain(); vG.gain.value = .32; verb.connect(vG); vG.connect(master);
    const fx = off.createGain(); fx.gain.value = .85; fx.connect(master); fx.connect(verb);
    const noise = (t, dur) => { const s = off.createBufferSource(); s.buffer = nb; s.loop = true; s.start(t, (t * 7.3) % .9); s.stop(t + dur + .05); return s; };
    const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };
    function whoosh(t, dur = .42, vol = .55, up = true, panFrom = -.8) {
      const s = noise(t, dur), bp = off.createBiquadFilter(), lp = off.createBiquadFilter(), g = off.createGain(), pn = off.createStereoPanner();
      bp.type = 'bandpass'; bp.Q.value = 1.1; bp.frequency.setValueAtTime(up ? 350 : 4200, t); bp.frequency.exponentialRampToValueAtTime(up ? 4800 : 300, t + dur);
      lp.type = 'lowpass'; lp.frequency.value = 9000;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * .55); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      pn.pan.setValueAtTime(panFrom, t); pn.pan.linearRampToValueAtTime(-panFrom, t + dur);
      s.connect(bp); bp.connect(lp); lp.connect(g); g.connect(pn); pn.connect(fx);
    }
    function sub(t, f0 = 62, f1 = 30, dur = 1.1, vol = .9) { const o = off.createOscillator(), g = off.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); env(g, t, .006, vol, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .1); }
    function burst(t, f = 900, dur = .28, vol = .7, type = 'lowpass') { const s = noise(t, dur), fl = off.createBiquadFilter(), g = off.createGain(); fl.type = type; fl.frequency.value = f; env(g, t, .002, vol, dur); s.connect(fl); fl.connect(g); g.connect(fx); }
    function metal(t, base = 220, vol = .22, dur = 1.6) {
      [1, 2.56, 4.28, 6.3, 8.9, 11.7].forEach((m, i) => { const o = off.createOscillator(), g = off.createGain(), pn = off.createStereoPanner(); o.type = 'sine'; o.frequency.value = base * m * (1 + (i % 2 ? .003 : -.002)); env(g, t, .002, vol / (1 + i * .55), dur / (1 + i * .35)); pn.pan.value = (i % 2 ? .25 : -.25); o.connect(g); g.connect(pn); pn.connect(fx); o.start(t); o.stop(t + dur + .1); });
    }
    function glint(t, vol = .09) { [2637, 3520, 4699, 5274, 7040].forEach((f, i) => { const o = off.createOscillator(), g = off.createGain(); o.frequency.value = f; env(g, t + i * .035, .004, vol / (1 + i * .3), .7 - i * .08); o.connect(g); g.connect(fx); o.start(t + i * .035); o.stop(t + 1); }); }
    function riser(t0, t1, vol = .35) {
      const s = noise(t0, t1 - t0), bp = off.createBiquadFilter(), g = off.createGain(); bp.type = 'bandpass'; bp.Q.value = 2.5; bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(7000, t1);
      g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t1 - .02); g.gain.linearRampToValueAtTime(.0001, t1 + .02); s.connect(bp); bp.connect(g); g.connect(fx);
    }
    function impact(t, power = 1) { sub(t, 64, 28, 1.3 * power, .95 * power); burst(t, 1100, .32, .75 * power); burst(t, 6000, .03, .5 * power, 'highpass'); }
    const W = cue.win, O = cue.out;
    // рамка въезжает снизу и «садится» на место
    whoosh(0, .5, .5, true, -.5); sub(.42, 70, 40, .45, .45); burst(.42, 700, .12, .35);
    // нарастание к концу прокрутки → удар выигрыша
    riser(W - 1.3, W, .22);
    impact(W, .9); glint(W + .03, .1); glint(W + .45, .06);
    // рамка уходит, логотип ударяет сверху, промокод
    whoosh(O - .1, .4, .45, false, .6);
    impact(O + .12, 1); metal(O + .12, 174.6, .22, 2.2); glint(O + .18, .09);
    glint(O + .45, .07); glint(O + 1.1, .05);

    const buf = await off.startRendering();
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1); let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rr[i]));
    const gain = pk > 0 ? .891 / pk : 1, fade = SR * .01;
    const bytes = new Uint8Array(44 + N * 2 * 3), dv = new DataView(bytes.buffer), w = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + N * 6, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true); dv.setUint32(28, SR * 6, true); dv.setUint16(32, 6, true); dv.setUint16(34, 24, true); w(36, 'data'); dv.setUint32(40, N * 6, true);
    let o = 44, rms = 0;
    for (let i = 0; i < N; i++) { const f = Math.min(1, i / fade, (N - 1 - i) / fade); for (const ch of [L, Rr]) { const v = Math.max(-1, Math.min(1, ch[i] * gain * f)), iv = Math.round(v * 8388607); bytes[o] = iv & 255; bytes[o + 1] = (iv >> 8) & 255; bytes[o + 2] = (iv >> 16) & 255; o += 3; rms += v * v; } }
    let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return { b64: btoa(bin), played, total: ev.length, peakDb: (20 * Math.log10(pk)).toFixed(1), rmsDb: (10 * Math.log10(rms / (N * 2))).toFixed(1) };
  }, ev, { dur: DUR, win: T.win, out: T.out[0] });
  const f = path.join(C.ROOT, 'assets', 'insert-sfx.wav'); fs.writeFileSync(f, Buffer.from(out.b64, 'base64'));
  console.log(`щелчков ленты: ${ticks.length}, звуки сайта: ${out.played}/${out.total}, пик до нормализации ${out.peakDb} dBFS, средний ${out.rmsDb} dBFS → ${f}`);
  await browser.close(); srv.close();
})();

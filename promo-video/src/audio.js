// Звуковая дорожка ролика (только эффекты, без музыки и голоса), 48 кГц стерео, 24 бит.
// 1) Звуки сайта: те же вызовы звукового движка RUSH CASE (Snd), что прозвучали при съёмке, — в тех же кадрах,
//    отрендеренные тем же кодом сайта в OfflineAudioContext (звуки файлов сайта + его синтез).
// 2) Звуки монтажа: свисты переходов, нарастание и удар хука, металлический удар логотипа, блеск, финальный акцент —
//    синтез Web Audio (шум с фильтрами, суб-удары, неоднородные металлические обертоны, реверберация).
// Запуск: node src/audio.js → assets/sfx.wav
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const C = require('./config');

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

// события сайта → время итогового ролика (по тем же правилам, что и картинка в compose-scene.js)
function siteEvents() {
  const M = JSON.parse(fs.readFileSync(path.join(C.FRAMES, 'compose-meta.json'), 'utf8')), ev = [];
  for (const [k, [a, b]] of Object.entries(C.SCENES)) {
    const f = path.join(C.FRAMES, k, 'meta.json'); if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, 'utf8')), from = (M[k] && M[k].from) || 0, speed = (M[k] && M[k].speed) || 1, until = M[k] && M[k].until;
    // та же перемотка, что у картинки (compose-scene.js → srcFrame), в обратную сторону: кадр съёмки → время сцены
    const toT = src => until == null || src < until ? (src - from) / (C.FPS * speed) : (until - from) / (C.FPS * speed) + (src - until) / C.FPS;
    for (const e of j.snd) { const t = a + toT(e.t * C.FPS); if (t >= a - .01 && t < b - .05) ev.push({ ...e, t, scene: k }); }
  }
  return { ev, M };
}

(async () => {
  const { ev, M } = siteEvents();
  const rv = C.SCENES.open[0] + (M.open ? M.open.revealT : 3.5);
  const cues = { scenes: Object.fromEntries(Object.entries(C.SCENES).map(([k, v]) => [k, v[0]])), reveal: rv, dur: C.DURATION,
    wdClick: C.SCENES.withdraw[0] + 36 / C.FPS, panels: Object.keys(C.SCENES).filter(k => !['hook', 'cta'].includes(k)), upgWin: (() => { const w = ev.find(e => e.scene === 'upgrade' && e.m === 'play' && e.args[0] === 'upgWin'); return w ? w.t : null; })() };
  const port = C.PORT + 2, srv = await serve(port);
  const browser = await puppeteer.launch({ executablePath: C.CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await browser.newPage();
  await p.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__Snd', { timeout: 30000 });
  const out = await p.evaluate(async (ev, cues) => {
    const SR = 48000, N = Math.ceil(SR * cues.dur), off = new OfflineAudioContext(2, N, SR), Snd = window.__Snd;
    window.__d.st.sound = true;
    // мастер: лёгкая компрессия всего и потолок пиков
    const master = off.createDynamicsCompressor(); Object.assign(master, {}); master.threshold.value = -10; master.knee.value = 6; master.ratio.value = 3; master.attack.value = .002; master.release.value = .15; master.connect(off.destination);
    // --- звуковой движок сайта поверх офлайн-контекста: время «сейчас» = время события
    let T = 0, KK = 1;
    const prox = new Proxy(off, { get(o, k) {
      if (k === 'currentTime') return T; if (k === 'state') return 'running'; if (k === 'resume') return () => Promise.resolve(); if (k === 'destination') return master;
      if (k === 'createBufferSource') return () => { const n = o.createBufferSource(), st = n.start.bind(n); n.start = (w, ...r) => st(Math.max(w || 0, T), ...r); return n; };
      const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; } });
    const comp = off.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .2;
    const sOut = off.createGain(); sOut.gain.value = .9; sOut.connect(comp); comp.connect(master);
    const nb = off.createBuffer(1, SR, SR), nd = nb.getChannelData(0); let sd = 7; for (let i = 0; i < SR; i++) { sd = (sd * 16807) % 2147483647; nd[i] = sd / 1073741823.5 - 1; }
    Snd.ctx = prox; Snd.out = sOut; Snd.nbuf = nb;
    Object.defineProperty(Snd, 'kk', { get: () => KK, configurable: true });
    // файлы звуков сайта: скачиваем и декодируем заранее
    Snd.warm(Object.keys(Snd.urls).filter(k => !k.startsWith('_')));
    for (let i = 0; i < 100 && Object.keys(Snd.urls).filter(k => !k.startsWith('_')).some(k => !Snd.bufs[k]); i++) await new Promise(r => setTimeout(r, 100));
    for (const k of Object.keys(Snd.bufs)) if (Snd.bufs[k] instanceof ArrayBuffer) Snd.bufs[k] = await off.decodeAudioData(Snd.bufs[k]);
    let played = 0;
    for (const e of ev.sort((a, b) => a.t - b.t)) { T = Math.max(0, e.t); KK = e.kk; try { const r = Snd[e.m](...e.args); if (r && r.then) await r; played++; } catch (er) { /* звук пропущен */ } }

    // --- звуки монтажа
    const verb = off.createConvolver(), irL = SR * 2.2, ir = off.createBuffer(2, irL, SR);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let s2 = 99 + c; for (let i = 0; i < irL; i++) { s2 = (s2 * 16807) % 2147483647; d[i] = (s2 / 1073741823.5 - 1) * Math.pow(1 - i / irL, 3.2) * (i < SR * .012 ? i / (SR * .012) : 1); } }
    verb.buffer = ir; const vG = off.createGain(); vG.gain.value = .32; verb.connect(vG); vG.connect(master);
    const fx = off.createGain(); fx.gain.value = .85; fx.connect(master); fx.connect(verb);
    const noise = (t, dur) => { const s = off.createBufferSource(); s.buffer = nb; s.loop = true; s.start(t, (t * 7.3) % .9); s.stop(t + dur + .05); return s; };
    const env = (g, t, a, peak, d, tail = 'exp') => { g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); if (tail === 'exp') g.gain.exponentialRampToValueAtTime(.0001, t + a + d); else g.gain.linearRampToValueAtTime(.0001, t + a + d); };
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
    function metal(t, base = 220, vol = .22, dur = 1.6) { // неоднородные обертоны — звон металла
      [1, 2.56, 4.28, 6.3, 8.9, 11.7].forEach((m, i) => { const o = off.createOscillator(), g = off.createGain(), pn = off.createStereoPanner(); o.type = 'sine'; o.frequency.value = base * m * (1 + (i % 2 ? .003 : -.002)); env(g, t, .002, vol / (1 + i * .55), dur / (1 + i * .35)); pn.pan.value = (i % 2 ? .25 : -.25); o.connect(g); g.connect(pn); pn.connect(fx); o.start(t); o.stop(t + dur + .1); });
    }
    function glint(t, vol = .09) { [2637, 3520, 4699, 5274, 7040].forEach((f, i) => { const o = off.createOscillator(), g = off.createGain(); o.frequency.value = f; env(g, t + i * .035, .004, vol / (1 + i * .3), .7 - i * .08); o.connect(g); g.connect(fx); o.start(t + i * .035); o.stop(t + 1); }); }
    function riser(t0, t1, vol = .35) {
      const s = noise(t0, t1 - t0), bp = off.createBiquadFilter(), g = off.createGain(); bp.type = 'bandpass'; bp.Q.value = 2.5; bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(7000, t1);
      g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t1 - .02); g.gain.linearRampToValueAtTime(.0001, t1 + .02); s.connect(bp); bp.connect(g); g.connect(fx);
      const o = off.createOscillator(), og = off.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(320, t1); const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t0); lp.frequency.exponentialRampToValueAtTime(2400, t1);
      og.gain.setValueAtTime(.0001, t0); og.gain.exponentialRampToValueAtTime(vol * .35, t1 - .02); og.gain.linearRampToValueAtTime(.0001, t1 + .02); o.connect(lp); lp.connect(og); og.connect(fx); o.start(t0); o.stop(t1 + .05);
    }
    function impact(t, power = 1) { sub(t, 64, 28, 1.3 * power, .95 * power); burst(t, 1100, .32, .75 * power); burst(t, 6000, .03, .5 * power, 'highpass'); }
    const S = cues.scenes;
    // хук: вступительный «вдох» → металлический блик по кейсу → нарастание → удар и логотип
    whoosh(0, .55, .45, true, -.6); glint(.22, .07); riser(.2, S.hook + 1.0, .3);
    impact(1.0, 1); metal(1.0, 196, .2, 1.8); glint(1.08, .08);
    // переходы между сценами
    cues.panels.forEach((k, i) => whoosh(S[k] - .2, .42, .5, i % 3 !== 1, i % 2 ? .8 : -.8));
    whoosh(S.cta - .2, .42, .5, true, -.8);
    // победитель турнира: удар, металл и блеск
    if (S.winner != null) { impact(S.winner + .3, .85); metal(S.winner + .3, 233, .18, 1.6); glint(S.winner + .35, .09); glint(S.winner + 1.05, .06); }
    // результат кейса: короткая «тишина» уже в звуке сайта, сверху — мягкий удар и блеск
    sub(cues.reveal, 70, 34, .9, .6); glint(cues.reveal + .02, .085); burst(cues.reveal, 2600, .18, .3, 'bandpass');
    if (cues.upgWin) { sub(cues.upgWin, 66, 32, .7, .45); glint(cues.upgWin + .02, .06); }
    // вывод: «отправка» вправо
    whoosh(cues.wdClick, .5, .45, true, -.9); glint(cues.wdClick + .5, .06);
    // финал: удар логотипа, металл, длинный хвост
    impact(S.cta + .05, 1.1); metal(S.cta + .05, 174.6, .24, 2.6); glint(S.cta + .12, .09); glint(S.cta + .75, .05); glint(S.cta + 1.0, .07);
    const pad = off.createOscillator(), pg = off.createGain(), plp = off.createBiquadFilter(); pad.type = 'sawtooth'; pad.frequency.value = 55; plp.type = 'lowpass'; plp.frequency.value = 260;
    pg.gain.setValueAtTime(.0001, S.cta); pg.gain.linearRampToValueAtTime(.08, S.cta + .4); pg.gain.linearRampToValueAtTime(.06, cues.dur - .9); pg.gain.linearRampToValueAtTime(.0001, cues.dur - .05);
    pad.connect(plp); plp.connect(pg); pg.connect(fx); pad.start(S.cta); pad.stop(cues.dur);

    const buf = await off.startRendering();
    // нормализация пика до −1 dBFS, плавные края
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1); let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rr[i]));
    const gain = pk > 0 ? .891 / pk : 1, fade = SR * .01;
    const bytes = new Uint8Array(44 + N * 2 * 3), dv = new DataView(bytes.buffer), w = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + N * 6, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true); dv.setUint32(28, SR * 6, true); dv.setUint16(32, 6, true); dv.setUint16(34, 24, true); w(36, 'data'); dv.setUint32(40, N * 6, true);
    let o = 44, rms = 0;
    for (let i = 0; i < N; i++) { const f = Math.min(1, i / fade, (N - 1 - i) / fade); for (const ch of [L, Rr]) { const v = Math.max(-1, Math.min(1, ch[i] * gain * f)), iv = Math.round(v * 8388607); bytes[o] = iv & 255; bytes[o + 1] = (iv >> 8) & 255; bytes[o + 2] = (iv >> 16) & 255; o += 3; rms += v * v; } }
    let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return { b64: btoa(bin), played, total: ev.length, peakDb: (20 * Math.log10(pk)).toFixed(1), rmsDb: (10 * Math.log10(rms / (N * 2))).toFixed(1) };
  }, ev, cues);
  const f = path.join(C.ROOT, 'assets', 'sfx.wav'); fs.writeFileSync(f, Buffer.from(out.b64, 'base64'));
  console.log(`звуки сайта: ${out.played}/${out.total}, пик до нормализации ${out.peakDb} dBFS, средний уровень ${out.rmsDb} dBFS → ${f}`);
  await browser.close(); srv.close();
})();

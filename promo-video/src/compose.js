// Рендер итоговых кадров 1920×1080: compose.html + снятые сцены сайта → .frames/final/NNNN.png
// Запуск: node src/compose.js [кадр_с кадр_по]  (без аргументов — весь ролик)
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const C = require('./config');

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
function serve(port) {
  const roots = { site: C.SITE, frames: C.FRAMES, src: __dirname };
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const [, top, ...rest] = decodeURIComponent(q.url.split('?')[0]).split('/');
      const base = roots[top], f = base && path.join(base, ...rest);
      if (!f || !f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=3600' }); fs.createReadStream(f).pipe(r);
    }).listen(port, () => res(srv));
  });
}
// параметры сцен из съёмки: размеры, кадры, момент результата (звук выигрыша сайта) и окно апгрейда
function meta() {
  const M = {};
  for (const k of fs.readdirSync(C.FRAMES)) {
    const f = path.join(C.FRAMES, k, 'meta.json'); if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, 'utf8')); M[k] = { w: j.clip.w, h: j.clip.h, frames: j.frames, focus: j.focus, prizeImg: j.prizeImg, snd: j.snd };
  }
  // перемотка каждой сцены: кадр съёмки = from + t·30·speed (до until), после until — обычная скорость
  const len = k => (C.SCENES[k][1] - C.SCENES[k][0]) * C.FPS, snd = (k, f) => M[k] && M[k].snd.find(f);
  for (const k in M) { if (!C.SCENES[k]) continue; M[k].from = 0; M[k].speed = 1; }
  for (const [k, from] of [['contract', 4], ['teamCreate', 2], ['teamJoin', 20], ['tourReg', 4], ['catalog', 0], ['withdraw', 0]]) if (M[k]) { M[k].from = from; M[k].speed = Math.max(1, (M[k].frames - 1 - from) / len(k)); }
  if (M.open) { const w = snd('open', e => ['win', 'profit', 'jackpot', 'cheap'].includes(e.m)); M.open.until = w ? Math.round(w.t * C.FPS) : 158; M.open.speed = C.OPEN_SPEED; M.open.revealT = M.open.until / C.FPS / C.OPEN_SPEED; }
  if (M.upgrade) { const w = snd('upgrade', e => e.m === 'play' && e.args[0] === 'upgWin'); const end = w ? Math.round(w.t * C.FPS) + 45 : M.upgrade.frames - 1; M.upgrade.from = 5; M.upgrade.speed = Math.max(1, (end - 5) / len('upgrade')); }
  if (M.daily) { const w = [...M.daily.snd].reverse().find(e => ['win', 'coin', 'jackpot', 'profit', 'cheap'].includes(e.m)); const end = w ? Math.round(w.t * C.FPS) + 30 : M.daily.frames - 1; M.daily.from = 4; M.daily.speed = Math.max(1, (end - 4) / len('daily')); }
  for (const k in M) delete M[k].snd;
  return M;
}

(async () => {
  const [a = 0, b = Math.round(C.DURATION * C.FPS) - 1] = process.argv.slice(2).map(Number);
  const port = C.PORT + 1, srv = await serve(port), M = meta();
  fs.writeFileSync(path.join(C.FRAMES, 'compose-meta.json'), JSON.stringify(M, null, 1));
  const out = path.join(C.FRAMES, 'final'); fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: C.CHROME, headless: 'new', args: ['--hide-scrollbars'] });
  const p = await browser.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: C.W, height: C.H, deviceScaleFactor: 1 });
  await p.evaluateOnNewDocument((cfg, m) => { window.CFG = cfg; window.META = m; }, { SCENES: C.SCENES, CAPTIONS: C.CAPTIONS, CTA: C.CTA, WINNER: C.WINNER, PRIZE: C.UPG_TARGET }, M);
  await p.goto(`http://localhost:${port}/src/compose.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  const t0 = Date.now();
  for (let f = a; f <= b; f++) {
    await p.evaluate(t => window.renderFrame(t), f / C.FPS);
    await p.screenshot({ path: path.join(out, String(f).padStart(4, '0') + '.png') });
    if (f % 60 === 0) console.log(`кадр ${f} / ${b} (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
  }
  console.log('готово', b - a + 1, 'кадров', errs.length ? 'ошибки: ' + errs.join(' | ') : '');
  await browser.close(); srv.close();
})();

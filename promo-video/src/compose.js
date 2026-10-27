// Рендер итоговых кадров 1080×1920: compose.html + снятые сцены сайта → .frames/final/NNNN.png
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
    const j = JSON.parse(fs.readFileSync(f, 'utf8')); M[k] = { w: j.clip.w, h: j.clip.h, frames: j.frames, snd: j.snd };
  }
  // момент результата = звук выигрыша сайта
  if (M.open) { const w = M.open.snd.find(e => ['win', 'profit', 'jackpot', 'cheap'].includes(e.m)); M.open.reveal = w ? Math.round(w.t * C.FPS) : 140; }
  if (M.upgrade) {
    const win = M.upgrade.snd.find(e => e.m === 'play' && e.args[0] === 'upgWin') || M.upgrade.snd.find(e => /safeWin/.test(e.m));
    const end = win ? Math.round(win.t * C.FPS) + 16 : M.upgrade.frames - 1, from = 5, len = (C.SCENES.upgrade[1] - C.SCENES.upgrade[0]) * C.FPS;
    M.upgrade.from = from; M.upgrade.speed = Math.max(1, (end - from) / len);
  }
  for (const k in M) delete M[k].snd;
  return M;
}

(async () => {
  const [a = 0, b = C.DURATION * C.FPS - 1] = process.argv.slice(2).map(Number);
  const port = C.PORT + 1, srv = await serve(port), M = meta();
  fs.writeFileSync(path.join(C.FRAMES, 'compose-meta.json'), JSON.stringify(M, null, 1));
  const out = path.join(C.FRAMES, 'final'); fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: C.CHROME, headless: 'new', args: ['--hide-scrollbars'] });
  const p = await browser.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: C.W, height: C.H, deviceScaleFactor: 1 });
  await p.evaluateOnNewDocument((cfg, m) => { window.CFG = cfg; window.META = m; }, { SCENES: C.SCENES, CAPTIONS: C.CAPTIONS, CTA: C.CTA }, M);
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

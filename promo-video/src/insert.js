// Рендер вставки 9:16 на хромакее: прозрачные кадры → output/RUSH_CASE_insert_green.mp4 (зелёный #00FF00) и RUSH_CASE_insert_alpha.mov (ProRes 4444 с альфа-каналом)
// Запуск: node src/insert-data.js (один раз) → node src/insert.js
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core'), ffmpeg = require('ffmpeg-static'), C = require('./config');
const DUR = 6.5, FPS = 30, DIR = path.join(C.FRAMES, 'insert');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const roots = { site: C.SITE, src: __dirname };
const srv = http.createServer((q, r) => { const [, top, ...rest] = decodeURIComponent(q.url.split('?')[0]).split('/'), base = roots[top], f = base && path.join(base, ...rest);
  if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
srv.listen(C.PORT + 6, async () => {
  const [a = 0, b = Math.round(DUR * FPS) - 1] = process.argv.slice(2).map(Number);
  fs.mkdirSync(DIR, { recursive: true });
  const br = await puppeteer.launch({ executablePath: C.CHROME, headless: 'new' }), p = await br.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 1080, height: 1920 });
  await p.evaluateOnNewDocument(d => { window.DATA = d; }, JSON.parse(fs.readFileSync(path.join(C.ROOT, 'assets', 'insert-data.json'), 'utf8')));
  await p.goto(`http://localhost:${C.PORT + 6}/src/insert.html`, { waitUntil: 'networkidle0', timeout: 90000 }); await p.evaluate(() => document.fonts.ready);
  for (let f = a; f <= b; f++) { await p.evaluate(t => window.renderFrame(t), f / FPS); await p.screenshot({ path: path.join(DIR, String(f).padStart(4, '0') + '.png'), omitBackground: true }); }
  console.log('кадров', b - a + 1, errs.length ? 'ошибки: ' + errs.join(' | ') : '');
  await br.close(); srv.close();
  if (a !== 0 || process.argv.length > 2) return;
  const inp = ['-framerate', String(FPS), '-i', path.join(DIR, '%04d.png')];
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=0x00FF00:s=1080x1920:r=${FPS}:d=${DUR}`, ...inp, '-filter_complex', '[0][1]overlay=format=auto,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-movflags', '+faststart', path.join(C.OUT, 'RUSH_CASE_insert_green.mp4')]);
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...inp, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', path.join(C.OUT, 'RUSH_CASE_insert_alpha.mov')]);
  console.log('готово: output/RUSH_CASE_insert_green.mp4 и RUSH_CASE_insert_alpha.mov');
});

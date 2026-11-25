// Покадровая съёмка баннеров (src/banner.html) в Chrome и сборка видео ffmpeg.
//   node src/render.js                 — все форматы
//   node src/render.js stream tiktok   — выбранные
//   node src/render.js --shots         — только контрольные кадры (output/shots/*.png)
// Нужны: Google Chrome (CHROME_PATH) и модули puppeteer-core, ffmpeg-static, sharp
// (берутся из promo-banners/node_modules или из promo-video/node_modules основной папки — MODS).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODS = [path.join(ROOT, 'node_modules'), process.env.MODS, 'D:/Кейсы/promo-video/node_modules', path.join(ROOT, '..', 'promo-video', 'node_modules')].filter(Boolean);
const need = m => { for (const d of MODS) { try { return require(path.join(d, m)); } catch (e) { /* дальше */ } } throw new Error('нет модуля ' + m + ' (npm install в promo-banners)'); };
const puppeteer = need('puppeteer-core'), FFMPEG = need('ffmpeg-static'), sharp = need('sharp');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FPS = 60;
const OUT = path.join(ROOT, 'output'), FR = path.join(ROOT, '.frames');

const NAMES = {
  stream: 'RUSHCASE_stream_plashka_1600x330.webm',
  jinemez: 'RUSHCASE_stream_plashka_JINEMEZ_1600x330.webm', // плашка стримера JINEMEZ (+10%), 24.11
  georg: 'RUSHCASE_stream_plashka_GEORG999_1600x330.webm', // плашка стримера GEORG999 (+10%), 24.11
  corner: 'RUSHCASE_stream_corner_520x470.webm',
  'corner-jinemez': 'RUSHCASE_stream_corner_JINEMEZ_520x470.webm', // значок в углу JINEMEZ (+10%), 24.11
  welcome: 'RUSHCASE_welcome_520x470.webm',   // WELCOME в рамке, как значок для стрима
  'site-welcome': 'news-welcome_640x396.webm', // слайды новостей сайта (владелец 22.11): assets/news-welcome.webm и news-rush35.webm
  'site-corner': 'news-rush35_640x396.webm',
  'site-ny': 'news-new2027_640x396.webm', // НОВЫЙ ГОД (владелец 26.11): слайд NEW2027 → assets/ny/news-new2027.webm
  tiktok: 'RUSHCASE_tiktok_reels_1080x1920.mp4',
  square: 'RUSHCASE_square_1080x1080.mp4',
};
// контрольные кадры для проверки
const SHOTS = { 'site-ny': [.2, .55, .8, 1.4, 2.5, 3.1, 3.5, 4.5, 8.9], stream: [.2, 2.78, 3.7, 4.4, 6.5, 9.6, 10.6, 14.75], georg: [2.78, 6.5, 9.6], jinemez: [9.6], 'corner-jinemez': [6.6, 12.5], corner: [6.6, 7.4, 9.5, 12.5], welcome: [.2, 1.2, 1.75, 1.95, 2.3, 3.4, 7.9], 'site-welcome': [1.2, 3.4], 'site-corner': [2.5, 9.5, 13], tiktok: [.62, .9, 1.05, 1.2, 1.32], square: [.9, 1.2] };

const args = process.argv.slice(2);
const shotsOnly = args.includes('--shots');
const list = args.filter(a => !a.startsWith('--'));
const fmts = list.length ? list : Object.keys(NAMES);

// звук — только TikTok (владелец 15.11); дорожка собирается по меткам кадров страницы (src/audio.js)
const SOUND = { tiktok: true };
const audioOnly = args.includes('--audio');
function addSound(f, B) {
  const out = path.join(OUT, NAMES[f]), wav = path.join(FR, f + '-sfx.wav'), tmp = out.replace(/.mp4$/, '.tmp.mp4');
  fs.mkdirSync(FR, { recursive: true });
  const a = require('./audio.js')({ FFMPEG, SITE: path.join(ROOT, '..'), cues: B.cues, dur: B.dur, outWav: wav });
  ff(['-i', out, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', tmp]);
  fs.copyFileSync(tmp, out); fs.unlinkSync(tmp); // копия, а не переименование: открытый в плеере файл Windows переименовать не даёт
  console.log(`  звук: щелчков ленты ${B.cues.ticks.length}, громкость ${a.lufsIn.toFixed(1)} → −14 LUFS`);
}
const ff = a => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: 'inherit' });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // свой мини-сервер от корня сайта: 3D (three.js-модули, .glb, .hdr) по file:// браузер не грузит
  const SITE = path.join(ROOT, '..');
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = require('http').createServer((req, res) => {
    const p = path.join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(SITE)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' }); res.end(d); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/promo-banners/src/banner.html`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--no-proxy-server', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  for (const f of fmts) {
    const page = await browser.newPage();
    page.on('console', m => { if (m.type() === 'error') console.log('  [страница]', m.text()); });
    page.on('pageerror', e => console.log('  [ошибка]', e.message));
    const url = BASE + `?f=${f}&capture=1`;
    await page.setViewport({ width: 100, height: 100 });
    await page.goto(url, { waitUntil: 'load' });
    const B = await page.evaluate(async () => { await window.BANNER.ready; const b = window.BANNER; return { W: b.W, H: b.H, dur: b.dur, alpha: b.alpha, cues: b.cues }; });
    await page.setViewport({ width: B.W, height: B.H, deviceScaleFactor: 1 });
    const shot = async t => { await page.evaluate(t => window.BANNER.seek(t), t); return page.screenshot({ type: 'png', omitBackground: B.alpha, clip: { x: 0, y: 0, width: B.W, height: B.H } }); };
    if (audioOnly) { if (SOUND[f]) addSound(f, B); await page.close(); continue; }
    if (shotsOnly) {
      const dir = path.join(OUT, 'shots'); fs.mkdirSync(dir, { recursive: true });
      for (const t of SHOTS[f]) fs.writeFileSync(path.join(dir, `${f}-${t.toFixed(2)}.png`), await shot(t));
      console.log(f, 'кадры:', SHOTS[f].join(', '));
      await page.close(); continue;
    }
    const dir = path.join(FR, f);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const N = Math.round(B.dur * FPS), t0 = Date.now();
    for (let i = 0; i < N; i++) {
      fs.writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}.png`), await shot(i / FPS));
      if (i % 120 === 0) process.stdout.write(`${f}: ${i}/${N}\r`);
    }
    console.log(`${f}: ${N} кадров за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
    await page.close();
    const out = path.join(OUT, NAMES[f]), inp = ['-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png')];
    if (B.alpha) ff([...inp, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '18', '-deadline', 'good', '-cpu-used', '1', '-row-mt', '1', '-auto-alt-ref', '0', '-an', out]);
    else ff([...inp, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-an', out]);
    // постер — последний «главный» кадр
    const poster = path.join(OUT, NAMES[f].replace(/\.(webm|mp4)$/, '_poster.png'));
    const pt = { stream: 11.5, georg: 11.5, jinemez: 11.5, 'corner-jinemez': 14, corner: 13, welcome: 7.9, 'site-welcome': 7.9, 'site-corner': 13, 'site-ny': 8.9, tiktok: 3.95, square: 3.95 }[f];
    fs.copyFileSync(path.join(dir, `f${String(Math.round(pt * FPS)).padStart(5, '0')}.png`), poster);
    if (SOUND[f]) addSound(f, B);
    console.log('  →', path.relative(ROOT, out), (fs.statSync(out).size / 1048576).toFixed(2), 'МБ');
  }
  await browser.close();
  server.close();
  // пример, как плашка и значок смотрятся поверх стрима (для показа владельцу, стримерам не нужен)
  const ps = path.join(OUT, NAMES.stream), pc = path.join(OUT, NAMES.corner);
  if (!shotsOnly && fs.existsSync(ps) && fs.existsSync(pc) && (fmts.includes('stream') || fmts.includes('corner'))) {
    const bg = path.join(FR, 'bg.png');
    await sharp(path.join(ROOT, '..', 'assets', 'bg-crash-page.webp')).resize(1920, 1080, { fit: 'cover' }).modulate({ brightness: .8 }).png().toFile(bg);
    const out = path.join(OUT, 'preview_na_strime_1920x1080.mp4');
    ff(['-loop', '1', '-framerate', String(FPS), '-i', bg, '-c:v', 'libvpx-vp9', '-i', ps, '-c:v', 'libvpx-vp9', '-i', pc,
      '-filter_complex', '[0][1]overlay=160:744:shortest=1[t];[t][2]overlay=1392:8', '-t', '15',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
    console.log('  →', path.relative(ROOT, out));
  }
})().catch(e => { console.error(e); process.exit(1); });

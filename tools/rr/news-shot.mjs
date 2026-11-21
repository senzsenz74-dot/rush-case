// Кадры для новости «Русская рулетка» прямо из игры (владелец 21.11: «кадр из самой игры»).
// Демо-комната #/krot/demo в Chrome без окна, 1920×1080, без ников (KROT.dbg.world().tagsOff) и без интерфейса поверх стола.
// Запуск (сервер просмотра на :5200 уже запущен):  node tools/rr/news-shot.mjs <папка для кадров> [кадров=14] [шаг_мс=1100]
import { createRequire } from 'node:module'; const puppeteer = createRequire(import.meta.url)('D:/Кейсы/promo-video/node_modules/puppeteer-core');
import fs from 'node:fs'; import path from 'node:path';
const out = process.argv[2] || '.', N = +process.argv[3] || 14, STEP = +process.argv[4] || 1100, SPEC = process.argv[5] !== 'seat';   // 5-й аргумент seat — вид со своего места
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--window-size=1920,1080', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('ошибка страницы:', e.message));
await page.goto('http://localhost:5200/#/krot/demo', { waitUntil: 'load', timeout: 60000 });
const t0 = Date.now(); let ph = '';
while (Date.now() - t0 < 150000) {   // ждём саму игру: лобби → загрузка → знакомство → раунд
  ph = await page.evaluate(() => { const s = window.KROT && KROT.dbg && KROT.dbg.state(); return s ? s.room.phase + '|' + (s.game ? s.game.turn : '') : ''; }).catch(() => '');
  if (/^play\|\d/.test(ph)) break;
  await page.evaluate(() => { try { KROT.dbg.skip(); } catch (e) { /* */ } }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
}
console.log('фаза:', ph, Math.round((Date.now() - t0) / 1000) + ' с');
await page.evaluate(spec => { const w = KROT.dbg.world(); if (w && w.tagsOff) w.tagsOff(true);
  const st = document.createElement('style'); st.textContent = '#krCv{filter:none!important}body>*:not(#app){display:none!important}.kr-ui,.kr-ov,.kr-shade,#header,header,.sw-fab,.mn-cfg,.krmm-bar,.krmm-note{display:none!important}'; document.head.appendChild(st);
  if (spec) KROT.dbg.die(); }, SPEC);   // объявления, окна, шапка — прочь; die — свой выстрел боевой → камера выбывшего облетает стол сверху
if (SPEC) { const t1 = Date.now(); while (Date.now() - t1 < 60000) { const dead = await page.evaluate(() => { const s = KROT.dbg.state(); return !!(s && s.me && s.me.alive === false); }).catch(() => false); if (dead) break; await new Promise(r => setTimeout(r, 1000)); }
  console.log('выбыл через', Math.round((Date.now() - t1) / 1000) + ' с'); await new Promise(r => setTimeout(r, 5000)); }
const cv = await page.$('#krCv');
for (let i = 0; i < N; i++) {
  await new Promise(r => setTimeout(r, STEP));
  const info = await page.evaluate(() => { const s = KROT.dbg.state(); return s && s.game ? 'ход ' + s.game.turn + ' раунд ' + s.game.round : ''; }).catch(() => '');
  const f = path.join(out, `f${String(i).padStart(2, '0')}.png`); await cv.screenshot({ path: f }); console.log(f, info);
}
await browser.close();

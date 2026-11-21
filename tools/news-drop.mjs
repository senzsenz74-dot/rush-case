// Видео для верхней новости главного экрана (владелец 21.11): кейсы BLAST → MAJOR → «Всемирная элита» падают по очереди,
// ровно как на своих страницах (настоящая 3D-сцена сайта: c2Mount, кадры 1…75, пыль, фон Mirage).
// Как снимается: Chrome без окна (puppeteer-core из promo-video), подменённые часы страницы (performance.now + requestAnimationFrame):
// каждый шаг — ровно 1/30 с анимации, потом снимок сцены. Фон-видео Mirage остановлено на одном кадре, чтобы у всех трёх кейсов он совпадал.
// Запуск (сервер просмотра на :5200 уже запущен):  node tools/news-drop.mjs <папка для кадров> [ширина=1600] [держать_кадров=24]
import { createRequire } from 'node:module'; const puppeteer = createRequire(import.meta.url)('D:/Кейсы/promo-video/node_modules/puppeteer-core');
import fs from 'node:fs'; import path from 'node:path';
const out = process.argv[2] || 'drop-frames', W = +process.argv[3] || 1600, H = Math.round(W * 9 / 16), HOLD = +process.argv[4] || 24;
const CASES = ['cs2', 'major', 'elite'], BG_T = 3.0;   // cs2 = BLAST (имя из админки); BG_T — секунда фонового видео
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: [`--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('ошибка страницы:', e.message));
await page.evaluateOnNewDocument(() => {
  let t = 1000; const q = [];
  performance.now = () => t;
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__vt = { step(ms) { t += ms; q.splice(0).forEach(cb => { try { cb(t); } catch (e) { console.error(e); } }); } };
  addEventListener('DOMContentLoaded', () => {   // только сцена кейса на весь экран, всё остальное спрятать
    const st = document.createElement('style');
    st.textContent = 'body *{visibility:hidden!important;animation:none!important;transition:none!important}#c2Stage,#c2Stage *{visibility:visible!important}#c2Stage{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important;transform:none!important}';
    document.head.appendChild(st);
  });
});
let n = 0;
for (const id of CASES) {
  await page.goto(`http://localhost:5200/#/case/${id}`, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.setItem('rc.live', '0'); } catch (e) { /* */ } });
  const t0 = Date.now(); let ok = false;
  while (Date.now() - t0 < 90000) {   // ждём, пока 3D готово (S.ready → у .c2p класс c2-3d); часы стоят — падение ещё не началось
    ok = await page.evaluate(() => !!document.querySelector('.c2p.c2-3d')).catch(() => false);
    if (ok) break; await new Promise(r => setTimeout(r, 500));
  }
  if (!ok) { console.log(id, '— 3D не загрузилось'); continue; }
  await page.evaluate(async T => { const v = document.querySelector('#c2Stage video'); if (v) { v.pause(); v.currentTime = T; await new Promise(r => { v.onseeked = r; setTimeout(r, 1500); }); } }, BG_T);
  const stage = await page.$('#c2Stage');
  const total = 74 + HOLD;   // кадры падения 1→75 и пауза в покое
  for (let i = 0; i <= total; i++) {
    await page.evaluate(() => window.__vt.step(1000 / 30));
    await stage.screenshot({ path: path.join(out, `d${String(n++).padStart(4, '0')}.png`) });
  }
  console.log(id, 'кадров:', total + 1, 'за', Math.round((Date.now() - t0) / 1000), 'с');
}
await browser.close();
console.log('всего кадров:', n);

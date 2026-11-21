// Кадры экрана загрузки — только пустая комната (владелец 21.11): без персонажей, ников, фишек и интерфейса.
// Демо #/krot/demo в Chrome без окна, 1920×1080; камера — своя для каждого кадра (подмена камеры прямо перед отрисовкой).
// Запуск (сервер просмотра на :5200 уже запущен):  node tools/rr/load-shot.mjs <папка для кадров>
// Потом лучшие кадры → assets/rr/load/N.webp (sharp, качество 80), LOAD_N в js/krot.js — их число.
import { createRequire } from 'node:module'; const req = createRequire(import.meta.url);
const puppeteer = req('D:/Кейсы/promo-video/node_modules/puppeteer-core');
import fs from 'node:fs'; import path from 'node:path';
const out = process.argv[2] || '.'; fs.mkdirSync(out, { recursive: true });
// [имя, камера x y z, куда смотрит x y z, угол обзора]
const VIEWS = [
  ['wide', [3.7, 2.45, 3.7], [0, .75, 0], 55],
  ['wide2', [-3.8, 2.2, 3.2], [0, .8, -.3], 55],
  ['felt', [1.45, 1.02, .6], [-.6, .9, .04], 42],
  ['top', [0, 2.95, 1.75], [0, .76, 0], 48],
  ['tv', [0, 1.55, 2.6], [0, 1.85, -4.9], 50],
  ['gun', [.42, .98, .38], [0, .78, 0], 38],
  ['globe', [1.05, 1.0, .3], [.64, .86, -.14], 36],
  ['seat', [-1.95, 1.25, .05], [1, .82, 0], 50],
  ['corner', [2.6, 1.6, -1.2], [-4.2, 1.1, -3.6], 55],
  ['candle', [-.15, .98, .45], [-.6, 1.0, .04], 40],
];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--window-size=1920,1080', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('ошибка страницы:', e.message));
await page.goto('http://localhost:5200/#/krot/demo', { waitUntil: 'load', timeout: 60000 });
const t0 = Date.now();
while (Date.now() - t0 < 90000) {   // ждём комнату с 3D
  const ok = await page.evaluate(() => { try { const w = KROT.dbg.world(); return !!(w && w.dbg && w.dbg.ren && KROT.dbg.state()); } catch (e) { return false; } }).catch(() => false);
  if (ok) break; await new Promise(r => setTimeout(r, 1000));
}
await new Promise(r => setTimeout(r, 3500));   // текстуры и модели догружаются (до старта раунда — фишки прячем, до хода не доходим)
await page.evaluate(() => {
  const w = KROT.dbg.world(), D = w.dbg, ren = D.ren, cam = D.cam; if (w.tagsOff) w.tagsOff(true);
  const st = document.createElement('style'); st.textContent = '#krCv{filter:none!important}body>*:not(#app){display:none!important}.kr-ui,.kr-ov,.kr-shade,.kr-mid,.kr-top,.kr-rm,#header,header,.sw-fab,.mn-cfg,.krmm-bar,.krmm-note,.rr-bet,.rr-bank,.rr-vt,.rr-vb{display:none!important}'; document.head.appendChild(st);
  window.__shot = null; const orig = ren.render.bind(ren);
  ren.render = (sc, c) => {   // перед кадром: своя камера, людей нет
    if (window.__shot && c === cam) {
      const v = window.__shot; for (const k in D.AV) { const a = D.AV[k]; if (a && a.g) a.g.visible = false; if (a && a.tag) a.tag.visible = false; }
      c.position.set(...v.p); c.up.set(0, 1, 0); c.lookAt(...v.l); c.fov = v.f; c.updateProjectionMatrix();
      sc.traverse(o => { const g = o.isMesh && o.geometry && o.geometry.parameters; if (g && g.radiusTop === .02 && g.height === .0045) o.visible = false; });   // фишки ставок
    }
    const res = orig(sc, c); if (window.__shot && c === cam) window.__shotN = (window.__shotN || 0) + 1; return res;
  };
});
const cv = await page.$('#krCv');
for (const [name, p, l, f] of VIEWS) {
  await page.evaluate(v => { window.__shot = v; window.__shotN = 0; }, { p, l, f });
  const tw = Date.now(); while (Date.now() - tw < 10000 && (await page.evaluate(() => window.__shotN || 0)) < 3) await new Promise(r => setTimeout(r, 120));   // 3 кадра уже с этой камеры
  const ph = await page.evaluate(() => KROT.dbg.state().room.phase); if (ph === 'play') console.log('внимание: уже идёт ход —', name);
  const file = path.join(out, name + '.png'); await cv.screenshot({ path: file }); console.log(file);
}
await browser.close();

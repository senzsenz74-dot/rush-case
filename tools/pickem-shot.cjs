// Снимок страницы пикема для картинки новости (фон «страница под наклоном»): локальный сайт + пробные данные через window.PKDBG.
// node tools/pickem-shot.cjs <url, напр. http://localhost:5210/#/pickem> <выход.png>
const puppeteer = require('D:/Кейсы/promo-video/node_modules/puppeteer-core');
const [url, out] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--window-size=1700,1100'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1700, height: 1100, deviceScaleFactor: 1.5 });
  await p.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await p.waitForFunction(() => /скоро откроется/.test((document.querySelector('#pkBody') || {}).textContent || ''), { timeout: 30000 });
  await p.evaluate(() => {
    const it = document.getElementById('intro'); if (it) it.remove();
    const D = window.PKDBG, { PK, ITEMS } = D, now = Date.now(), H = 3600e3;
    const prize = ITEMS.filter(x => x.p >= 20000 && x.p < 40000 && /AK-47/.test(x.name))[0];
    const R1 = [['heroic', 'imperial'], ['9z', 'lynn'], ['nip', 'm80'], ['100t', 'chinggis'], ['parivision', 'dendele'], ['liquid', 'gosh'], ['faze', 'wildcard'], ['ef', 'flyquest']];
    let id = 1; const M = [];
    R1.forEach(([a, b], k) => M.push({ id: id++, st: 1, sl: '0-0', o: k + 1, a, b, bo: 1, t: now - 20 * H, w: k % 3 ? a : b, s: '1:0', n: 40 + k, na: 25 }));
    [['heroic', 'lynn'], ['liquid', 'faze'], ['nip', '100t'], ['parivision', 'ef']].forEach(([a, b], k) => M.push({ id: id++, st: 1, sl: '1-0', o: k + 1, a, b, bo: 1, t: now + 2 * H, w: null, s: null, n: 30, na: 12 }));
    [['imperial', 'm80'], ['gosh', 'wildcard'], ['9z', 'chinggis'], ['dendele', 'flyquest']].forEach(([a, b], k) => M.push({ id: id++, st: 1, sl: '0-1', o: k + 1, a, b, bo: 1, t: now + 3 * H, w: null, s: null, n: 20, na: 9 }));
    PK.s = { now, dt: 0, cfg: { price: 499, rw: [5, 10], prize: { n: prize.name } }, matches: M, passes: 37, final: null, top: [],
      me: { pass: true, show: true, pts: 0, ok: 0, pos: null, picks: [{ m: 9, w: 'heroic', s: '1:0', ow: null, os: null, pz: [] }, { m: 10, w: 'faze', s: '1:0', ow: null, os: null, pz: [] }], sp: [] } };
    PK.draft = { 0: { '30': ['faze', 'heroic'], '3x': ['liquid', 'nip', 'parivision', '9z'], '03': ['chinggis'] } }; PK.dirty = { 0: true };
    PK.stage = 0; PK.mode = 'grid'; D.draw();
  });
  await new Promise(r => setTimeout(r, 1500));
  await p.evaluate(() => { document.querySelectorAll('#modal-root .modal-ov, .tut, [class^="an-"], [class*=" an-"], .ann, .announce').forEach(e => e.remove()); document.body.classList.remove('no-scroll'); const st = document.createElement('style'); st.textContent = '.modal-ov,.tut{display:none!important}'; document.head.appendChild(st); }); // объявление и обучение — не в кадр (окно объявления открывается заново, поэтому прячем стилем)
  await new Promise(r => setTimeout(r, 400));
  const el = await p.$('.pk-main');
  await el.screenshot({ path: out });
  await b.close();
  console.log('shot', out);
})().catch(e => { console.error(e); process.exit(1); });

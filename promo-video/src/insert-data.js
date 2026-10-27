// Данные для вставки: предметы кейса KARAMBIT с картинками, редкостью и ценами — прямо из кода сайта
const fs = require('fs'), path = require('path'), http = require('http'), puppeteer = require('puppeteer-core'), C = require('./config');
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.endsWith('/js/app.js')) { const s = fs.readFileSync(path.join(C.SITE, 'js/app.js'), 'utf8'), i = s.lastIndexOf('})();'); return r.end(s.slice(0, i) + 'window.__d={SK,caseById,imgUrl,money};' + s.slice(i)); }
  const f = path.join(C.SITE, u.replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.end(fs.readFileSync(f)); }).listen(C.PORT + 5, async () => {
  const b = await puppeteer.launch({ executablePath: C.CHROME, headless: 'new' }), p = await b.newPage();
  await p.goto(`http://localhost:${C.PORT + 5}/`, { waitUntil: 'domcontentloaded' }); await p.waitForFunction('window.__d');
  const d = await p.evaluate((cid, win) => { const c = __d.caseById(cid), it = s => ({ n: s.name, w: s.w, f: s.f, r: s.r, p: __d.money(s.p), img: __d.imgUrl(s, 'l') });
    return { items: c.items.map(it), win: it(__d.SK[win]) }; }, C.CASE_ID, C.DROP_NAME);
  fs.writeFileSync(path.join(C.ROOT, 'assets', 'insert-data.json'), JSON.stringify(d, null, 1)); console.log(d.items.length, 'предметов, выигрыш:', d.win.n, d.win.p);
  await b.close(); srv.close(); });

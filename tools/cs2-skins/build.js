// Сборка партии скинов в Blender (фоном, -b; GUI владельца не трогает).
// Запуск: node build.js <партия.x.json> [потоков=3]   (партия.x.json пишет extract.js)
// Выход: C:/Users/Admin/tools/cs2x/out/tex/<id>_albedo.png, _mr.png, [_nrm.png]; out/base/<оружие>-hd|leg.glb; out/built.json
// Ручная подгонка рисунка: cfg/<id>.json → {"tune": {...}} (k — масштаб, du/dv — сдвиг, vflip, bright), подмешивается в задание.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const R = 'C:/Users/Admin/tools/cs2x', BL = 'D:/SteamLibrary/steamapps/common/Blender/blender.exe';
const OUT = R + '/out', TEX = OUT + '/tex', BASE = OUT + '/base', JOB = OUT + '/jobs';
for (const d of [TEX, BASE, JOB]) fs.mkdirSync(d, { recursive: true });
const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), N = +process.argv[3] || 3;
const BF = OUT + '/built.json', built = fs.existsSync(BF) ? JSON.parse(fs.readFileSync(BF, 'utf8')) : {};
const idOf = it => it.w.replace(/^weapon_/, '') + '--' + it.kit;
const todo = list.filter(it => it.model && it.ci && it.paint_vmat && !(built[idOf(it)] && fs.existsSync(TEX + '/' + idOf(it) + '_albedo.png')) || process.env.FORCE && it.model);
// базовые модели строим по одной на оружие первыми (иначе параллельные задания пишут один файл)
const firstOf = new Set(); const q = [];
for (const it of todo) { const w = it.w + (it.legacy ? 'L' : 'H'); if (!firstOf.has(w)) { firstOf.add(w); q.unshift(it); } else q.push(it); }
let run = 0, done = 0; const t0 = Date.now();
function next() {
  if (!q.length) { if (!run) finish(); return; }
  const it = q.shift(), id = idOf(it); run++;
  const tune = fs.existsSync(__dirname + '/cfg/' + id + '.json') ? JSON.parse(fs.readFileSync(__dirname + '/cfg/' + id + '.json', 'utf8')).tune : undefined;
  const cfg = { id, name: it.en, wshort: it.w.replace(/^weapon_/, ''), legacy: !!it.legacy, model: it.model, ci_vmat: it.ci, paint_vmat: it.paint_vmat, tmp: TEX, base_dir: BASE, res: 2048, tune };
  const jf = JOB + '/' + id + '.json'; fs.writeFileSync(jf, JSON.stringify(cfg, null, 1));
  const p = spawn(BL, ['-b', '--factory-startup', '--python', __dirname + '/build_skin3.py', '--', jf], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d);
  const ts = Date.now();
  p.on('close', code => {
    run--; done++;
    const m = /BUILT (\S+) base (\S+) style (\d+) leg (\w+)/.exec(log);
    if (m) built[id] = { name: it.en, ru: it.ru, base: m[2].replace(/\.glb$/, ''), style: +m[3], nrm: fs.existsSync(TEX + '/' + id + '_nrm.png') };
    else fs.writeFileSync(JOB + '/' + id + '.err.log', log);
    console.log(`${done}/${todo.length}`, m ? 'ok ' : 'ERR', id, ((Date.now() - ts) / 1000).toFixed(0) + 's');
    fs.writeFileSync(BF, JSON.stringify(built, null, 1));
    next();
  });
}
function start() { for (let i = 0; i < N; i++) next(); }
function finish() { console.log('done', done, 'за', ((Date.now() - t0) / 60000).toFixed(1), 'мин; всего собрано', Object.keys(built).length); }
start();

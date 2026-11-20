// «Русская рулетка»: подготовка текстур (запуск из папки проекта: node tools/rr/prep_textures.mjs).
// 1) револьвер: из tools/rr/src/rev-zip/textures (2048) → tools/rr/src/rev-prep (1024): base = цвет × AO, orm = R AO / G шероховатость (1 − gloss) / B металл, normal;
//    потом Blender: tools/rr/revolver_export.py → assets/rr/revolver.glb.
// 2) стены/пол/стол: Poly Haven 1k (tools/rr/src/ph/<id>/<id>_(diff|nor_gl|arm)…) → assets/rr/<имя>_(diff|nor|arm).webp.
// sharp берём из основной папки проекта (D:\Кейсы\promo-video\node_modules), в репозиторий не ставим.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const sharp = require('D:/Кейсы/promo-video/node_modules/sharp');
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(HERE, 'src'), OUT = path.join(HERE, '..', '..', 'assets', 'rr');

// 1. револьвер
{
  const T = path.join(SRC, 'rev-zip', 'textures'), O = path.join(SRC, 'rev-prep'), S = 1024; fs.mkdirSync(O, { recursive: true });
  const ao = await sharp(path.join(T, 'rev_a.tga.png')).extractChannel(0).resize(S, S).raw().toBuffer();
  const d = await sharp(path.join(T, 'rev_d.tga.png')).removeAlpha().resize(S, S).raw().toBuffer();
  const b = Buffer.alloc(S * S * 3); for (let i = 0; i < S * S; i++) { const a = .35 + .65 * ao[i] / 255; for (let c = 0; c < 3; c++) b[i * 3 + c] = Math.round(d[i * 3 + c] * a); }
  await sharp(b, { raw: { width: S, height: S, channels: 3 } }).png().toFile(path.join(O, 'base.png'));
  const g = await sharp(path.join(T, 'rev_g.tga.png')).removeAlpha().greyscale().resize(S, S).raw().toBuffer();
  const m = await sharp(path.join(T, 'rev_m.tga.png')).extractChannel(0).resize(S, S).raw().toBuffer();
  const o = Buffer.alloc(S * S * 3); for (let i = 0; i < S * S; i++) { o[i * 3] = ao[i]; o[i * 3 + 1] = 255 - g[i]; o[i * 3 + 2] = m[i]; }
  await sharp(o, { raw: { width: S, height: S, channels: 3 } }).png().toFile(path.join(O, 'orm.png'));
  await sharp(path.join(T, 'rev_n.tga.png')).removeAlpha().resize(S, S).png().toFile(path.join(O, 'normal.png'));
  console.log('revolver textures → tools/rr/src/rev-prep');
}
// 2. Poly Haven → WebP (Poly Haven, CC0): какая текстура для чего
const PH = [['dark_wooden_planks', 'floor'], ['quatrefoil_jacquard_fabric', 'paper'], ['lacquered_cherry_wood', 'cherry'], ['dark_wood', 'dwood'], ['brown_leather', 'leather']];
for (const [id, name] of PH) {
  const dir = path.join(SRC, 'ph', id); if (!fs.existsSync(dir)) { console.log('нет', dir, '— скачать 1k с polyhaven.com (Diffuse, nor_gl, arm)'); continue; }
  for (const [k, s] of [['diff', 'diff'], ['nor_gl', 'nor'], ['arm', 'arm']]) {
    const f = fs.readdirSync(dir).find(x => x.startsWith(id + '_' + k) || x.startsWith(id + '_' + (k === 'diff' ? 'Diffuse' : k)));
    if (!f) { console.log('нет', id, k); continue; }
    await sharp(path.join(dir, f)).resize(1024, 1024, { fit: 'inside' }).webp({ quality: k === 'diff' ? 84 : 80 }).toFile(path.join(OUT, name + '_' + s + '.webp'));
  }
  console.log(id, '→ assets/rr/' + name + '_*.webp');
}

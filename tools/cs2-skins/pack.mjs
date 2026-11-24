// Упаковка собранных скинов для сайта (assets/skins3d): 25.11.2026.
//   base/<оружие>-hd|leg.glb    — сетка (meshopt) + рельеф оружия 1024; -lo.glb — рельеф 512 (телефон / экономная графика)
//   t/<id>.webp (цвет 1024), t/<id>-lo.webp (512), t/<id>-mr.webp (тени/шероховатость/металл 512), t/<id>-n.webp (свой рельеф 512, если есть)
//   index.json — { "название без износа": [id, база, есть_рельеф] } (и рус., и англ. названия)
// Зависимости — во временной папке (C:/Users/Admin/tools/cs2x/node), скрипт копируется туда:
//   cp pack.mjs C:/Users/Admin/tools/cs2x/node/ && node C:/Users/Admin/tools/cs2x/node/pack.mjs <проект>/assets/skins3d
// sharp — тот же, что тянет @gltf-transform/functions (две копии libvips в одном процессе ломаются).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, weld, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
const sharp = (await import('sharp')).default;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const R = 'C:/Users/Admin/tools/cs2x/out', DST = process.argv[2];
fs.mkdirSync(DST + '/base', { recursive: true }); fs.mkdirSync(DST + '/t', { recursive: true });
const built = JSON.parse(fs.readFileSync(R + '/built.json', 'utf8'));
const newer = (src, dst) => !fs.existsSync(dst) || fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs;
// базовые модели
for (const f of fs.readdirSync(R + '/base').filter(f => f.endsWith('.glb'))) {
  for (const [suf, nsz] of [['', 1024], ['-lo', 512]]) {
    const out = `${DST}/base/${f.replace('.glb', suf + '.glb')}`; if (!newer(`${R}/base/${f}`, out)) continue;
    const doc = await io.read(`${R}/base/${f}`);
    for (const m of doc.getRoot().listMaterials()) { m.setBaseColorTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null); }
    await doc.transform(prune(), dedup(), weld(), reorder({ encoder: MeshoptEncoder }), quantize({ quantizeNormal: 10, quantizePosition: 14, quantizeTexcoord: 12 }));
    for (const t of doc.getRoot().listTextures()) {
      const buf = await sharp(Buffer.from(t.getImage())).resize(nsz, nsz, { fit: 'fill' }).webp({ quality: 88 }).toBuffer();
      t.setImage(new Uint8Array(buf)).setMimeType('image/webp');
    }
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    doc.createExtension(ALL_EXTENSIONS.find(e => e.EXTENSION_NAME === 'EXT_texture_webp')).setRequired(true);
    await io.write(out, doc);
    console.log('base', out.split('/').pop(), (fs.statSync(out).size / 1024).toFixed(0), 'КБ');
  }
}
// окраски
let n = 0;
const index = {};
for (const [id, b] of Object.entries(built)) {
  const src = `${R}/tex/${id}`;
  if (!fs.existsSync(src + '_albedo.png')) continue;
  const jobs = [[src + '_albedo.png', `${DST}/t/${id}.webp`, 1024, 80], [src + '_albedo.png', `${DST}/t/${id}-lo.webp`, 512, 78], [src + '_mr.png', `${DST}/t/${id}-mr.webp`, 512, 80]];
  if (b.nrm && fs.existsSync(src + '_nrm.png')) jobs.push([src + '_nrm.png', `${DST}/t/${id}-n.webp`, 512, 85]);
  for (const [i, o, sz, q] of jobs) if (newer(i, o)) { await sharp(i).resize(sz, sz, { fit: 'fill' }).webp({ quality: q, effort: 5 }).toFile(o); n++; }
  const rec = [id, b.base, b.nrm ? 1 : 0];
  for (const nm of [b.name, b.ru]) if (nm) index[nm.replace(/^★ /, '★ ')] = rec;
}
fs.writeFileSync(DST + '/index.json', JSON.stringify(index));
let tot = 0; for (const d of ['base', 't']) for (const f of fs.readdirSync(`${DST}/${d}`)) tot += fs.statSync(`${DST}/${d}/${f}`).size;
console.log('картинок', n, 'скинов', Object.keys(built).length, 'всего', (tot / 1048576).toFixed(1), 'МБ');

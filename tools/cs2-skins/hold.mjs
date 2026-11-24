// Оружие со скином для рук агента на главном экране (25.11.2026): модель из игры СО СКЕЛЕТОМ (крепится к кости wpn агента,
// как в blender/assets/cs2/README.md) + окраска скина из конвейера 3D-скинов (out/tex/<id>_albedo|_mr|_nrm.png).
// Оставляет сетку body_legacy (под неё нарисованы «свои» скины), body_hd убирает. Текстуры — WebP 2048.
// Запуск (зависимости в C:/Users/Admin/tools/cs2x/node, скрипт копировать туда):
//   node hold.mjs <модель.glb из игры> <id скина> <выход.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import fs from 'node:fs';
const sharp = (await import('sharp')).default;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [src, id, out] = process.argv.slice(2), T = 'C:/Users/Admin/tools/cs2x/out/tex/' + id;
const doc = await io.read(src), root = doc.getRoot();
for (const n of root.listNodes()) { const m = n.getMesh(); if (m && /body_hd$/.test(m.getName())) n.setMesh(null); }
const tex = async (p, srgb) => {
  const t = doc.createTexture(id + p).setMimeType('image/webp').setImage(new Uint8Array(await sharp(T + p + '.png').resize(2048, 2048, { fit: 'fill' }).webp({ quality: 90 }).toBuffer()));
  return t;
};
const leg = root.listMeshes().find(m => /body_legacy$/.test(m.getName()));
const mat = leg.listPrimitives()[0].getMaterial(); // окраска легла на первый материал сетки (как слот 0 в build_skin3.py)
mat.setBaseColorTexture(await tex('_albedo')).setBaseColorFactor([1, 1, 1, 1]);
mat.setMetallicRoughnessTexture(await tex('_mr')).setMetallicFactor(1).setRoughnessFactor(1);
mat.setOcclusionTexture(null);
if (fs.existsSync(T + '_nrm.png')) mat.setNormalTexture(await tex('_nrm'));
doc.createExtension(ALL_EXTENSIONS.find(e => e.EXTENSION_NAME === 'EXT_texture_webp')).setRequired(true);
await doc.transform(prune());
await io.write(out, doc);
console.log(out.split('/').pop(), (fs.statSync(out).size / 1048576).toFixed(2), 'МБ');

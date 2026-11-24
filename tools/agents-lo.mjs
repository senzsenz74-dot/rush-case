// Главный экран: лёгкие копии агентов для телефона и экономной графики (GFX.low) — assets/main/agent*-lo.glb.
// 25.11.2026 (владелец: «сразу оптимизировать для телефонов и для ПК»). Сетка, скелет и анимации — те же (meshopt остаётся),
// картинки вдвое меньше по стороне: цвет и нормали 512, ORM 256, WebP — скачивание и видеопамять примерно в 4 раза меньше.
// Запуск (зависимости — как у tools/agents-build.mjs, скрипт скопировать во временную папку с node_modules):
//   node agents-lo.mjs "<проект>/assets/main" agent.glb agent-vypa.glb ...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
const sharp = (await import('sharp')).default;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const SIZE = { base: 512, normal: 512, orm: 256 };
const [dir, ...files] = process.argv.slice(2);
for (const f of files) {
  const doc = await io.read(`${dir}/${f}`);
  for (const t of doc.getRoot().listTextures()) {
    let kind = 'base';
    for (const m of t.listParents().filter(p => p.propertyType === 'Material')) {
      if (m.getNormalTexture() === t) kind = 'normal'; else if (kind === 'base' && (m.getMetallicRoughnessTexture() === t || m.getOcclusionTexture() === t)) kind = 'orm';
    }
    t.setImage(await sharp(Buffer.from(t.getImage())).resize(SIZE[kind], SIZE[kind], { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: kind === 'normal' ? 85 : 75, effort: 6 }).toBuffer()).setMimeType('image/webp');
  }
  const out = `${dir}/${f.replace(/\.glb$/, '-lo.glb')}`; await io.write(out, doc);
  console.log(f, (fs.statSync(`${dir}/${f}`).size / 1048576).toFixed(2), '→', (fs.statSync(out).size / 1048576).toFixed(2), 'МБ');
}

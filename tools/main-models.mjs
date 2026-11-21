// Главный экран: ужать 3D-модели агента для сайта (assets/main/*.glb) — сетка и анимации сжимаются meshopt, текстуры не трогаем.
// 22.11.2026 (оптимизация, владелец: «на телефоне греется, на ПК не у всех вывозит»): agent.glb 3,2 МБ, awp-dragon-lore.glb 1,5 МБ,
// snowman.glb 0,5 МБ — на телефоне это долго качать. На сайте загрузчику нужен MeshoptDecoder (js/app.js, mnaLoad).
// Имена костей и узлов не меняются (код ищет wpn, pelvis), анимации остаются (лишние ключи убирает resample).
// Однотонные текстуры не заменять цветом (keepSolidTextures): у снеговика замена перепутала цвета тела и носа.
// Запуск (зависимости — во временную папку, не в проект; скрипт скопировать туда же):
//   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
//   node main-models.mjs "<проект>/assets/main/agent.glb" "<куда>/agent.glb"
// Повторно на уже сжатой модели не запускать — сжимать исходник (из истории git, до 22.11.2026).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, weld, reorder, quantize, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [src, out] = process.argv.slice(2);
const doc = await io.read(src);
await doc.transform(resample(), prune({ keepLeaves: true, keepSolidTextures: true }), dedup(), weld(), reorder({ encoder: MeshoptEncoder }),
  quantize({ quantizeNormal: 10, quantizePosition: 14, quantizeTexcoord: 12 }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(out, doc);
console.log(out.split(/[\\/]/).pop(), (fs.statSync(src).size / 1048576).toFixed(2), '→', (fs.statSync(out).size / 1048576).toFixed(2), 'MB');

// «КРОТ»: ужать модель персонажа CS2 для сайта → assets/krot/<имя>.glb (~1 МБ).
// Убирает анимации и морфы, имена костей — строчными (у «Профессионала» были _L/_R), второй UV, текстуры → WebP
// (цвет/нормаль тела и головы 1024, остальное 512), сетка — квантование + meshopt (на сайте нужен MeshoptDecoder).
// Запуск (зависимости ставить во временную папку, не в проект):
//   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
//   node krot-models.mjs "<источник>.glb" assets/krot/<имя>.glb [--drop-back-bag]
// --drop-back-bag — только для «Профессионала» (assets/main/agent.glb): сумка за поясом протыкает спинку стула.
// Источники 12.11.2026: Загрузки владельца balkan-cs2-agent-model-romanov / -dragomir-no2 / fbi-cs2-agent-model-no2 (source/*.glb),
// «Профессионал» — assets/main/agent.glb.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, weld, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [src, out] = process.argv.slice(2).filter(x => !x.startsWith('--'));
const doc = await io.read(src), R = doc.getRoot();

R.listAnimations().forEach(a => { a.listSamplers().forEach(s => { s.getInput()?.dispose(); s.getOutput()?.dispose(); s.dispose(); }); a.listChannels().forEach(c => c.dispose()); a.dispose(); });
for (const m of R.listMeshes()) for (const p of m.listPrimitives()) p.listTargets().forEach(t => { t.listAttributes().forEach(x => x.dispose()); t.dispose(); });
R.listNodes().forEach(n => n.setName(n.getName().toLowerCase()));
// --drop-back-bag: у «Профессионала» сумка за поясом (материал head, кость pelvis) протыкает спинку стула — убрать её треугольники
if (process.argv.includes('--drop-back-bag')) for (const m of R.listMeshes()) for (const p of m.listPrimitives()) {
  if (!/head/.test(p.getMaterial()?.getName() || '')) continue;
  const skin = R.listNodes().find(n => n.getMesh() === m)?.getSkin(), pel = skin.listJoints().findIndex(j => j.getName() === 'pelvis');
  const J = p.getAttribute('JOINTS_0'), Wt = p.getAttribute('WEIGHTS_0'), idx = p.getIndices(), a = idx.getArray(), j = [], w = [];
  const isBag = v => { J.getElement(v, j); Wt.getElement(v, w); let s = 0; for (let k = 0; k < 4; k++) if (j[k] === pel) s += w[k]; return s > .5; };
  const keep = []; let cut = 0; for (let t = 0; t < a.length; t += 3) { if (isBag(a[t]) && isBag(a[t + 1]) && isBag(a[t + 2])) { cut++; continue; } keep.push(a[t], a[t + 1], a[t + 2]); }
  idx.setArray(new a.constructor(keep)); console.log('  back bag: removed tris', cut);
}
// второй набор UV не нужен, если ни одна текстура его не читает
const infos = m => [m.getBaseColorTextureInfo(), m.getNormalTextureInfo(), m.getOcclusionTextureInfo(), m.getMetallicRoughnessTextureInfo(), m.getEmissiveTextureInfo()].filter(Boolean);
const uv1 = R.listMaterials().some(m => infos(m).some(i => i.getTexCoord() > 0));
if (!uv1) for (const m of R.listMeshes()) for (const p of m.listPrimitives()) { const a = p.getAttribute('TEXCOORD_1'); if (a) p.setAttribute('TEXCOORD_1', null); }

// размер текстуры: цвет/нормаль тела и головы — 1024, всё остальное (ORM, перчатки, низ, шляпа/очки) — 512
for (const t of R.listTextures()) {
  const mats = t.listParents().filter(p => p.propertyType === 'Material');
  const big = mats.some(m => /body|head|mask/.test(m.getName()) && !/lower/.test(m.getName()) && (m.getBaseColorTexture() === t || m.getNormalTexture() === t));
  const size = big ? 1024 : 512, isN = mats.some(m => m.getNormalTexture() === t), isC = mats.some(m => m.getBaseColorTexture() === t);
  const img = sharp(Buffer.from(t.getImage())), meta = await img.metadata();
  const s = Math.min(size, meta.width);
  const buf = await img.resize(s, s, { kernel: 'lanczos3' }).removeAlpha().webp({ quality: isN ? 90 : isC ? 82 : 80, effort: 6, smartSubsample: true }).toBuffer();
  t.setImage(new Uint8Array(buf)).setMimeType('image/webp').setURI('');
}
doc.createExtension(EXTTextureWebP).setRequired(true);
R.listMaterials().forEach(m => { if (m.getAlphaMode() === 'BLEND') console.log('  blend material:', m.getName()); });

await doc.transform(prune(), dedup(), weld(), reorder({ encoder: MeshoptEncoder }), quantize({ quantizeNormal: 10, quantizePosition: 14, quantizeTexcoord: 12 }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(out, doc);
const fs = await import('node:fs');
console.log(out.split(/[\\/]/).pop(), (fs.statSync(out).size / 1048576).toFixed(2), 'MB');

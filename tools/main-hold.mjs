// Главный экран: оружие в руках агента и его анимации меню CS2 (25.11.2026, владелец: «Бабочка Легенды, USP-S Поток информации,
// АК-47 Азимов; смена оружия; осмотр оружия раз в 20 с»).
//   assets/main/wpn-<id>.glb, -lo.glb — ствол со скином и скелетом (картинки WebP 1024 / 512, meshopt). Источник: blender/assets/cs2/agent-hold/weapons
//     (собран tools/cs2-skins/hold.mjs). На сайте крепится к кости wpn агента: корневая кость оружия weapon совпадает с wpn.
//   assets/main/anim-<набор>-<t|ct>.glb — только скелет + клипы: idle (стойка), walkup (выход), i_<имя> (осмотр оружия).
//     Клипы из animation/anims/ui_anims/main_menu (blender/assets/cs2/agent-hold/anims). Каналы масштаба и скелет оружия выброшены.
// Запуск (зависимости — во временной папке, как tools/main-models.mjs; скрипт скопировать туда):
//   node main-hold.mjs "D:/Кейсы/blender/assets/cs2/agent-hold" "<проект>/assets/main"
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { prune, dedup, weld, reorder, quantize, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
const sharp = (await import('sharp')).default;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [SRC, OUT] = process.argv.slice(2);
const mb = f => (fs.statSync(f).size / 1048576).toFixed(2) + ' МБ';
const meshopt = doc => doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });

// ---- стволы
const WPN = { butterfly: 'butterfly-lore', usp: 'usp-printstream', ak47: 'ak47-asiimov' };
for (const [id, f] of Object.entries(WPN)) for (const [suf, sz] of [['', 1024], ['-lo', 512]]) {
  const doc = await io.read(`${SRC}/weapons/${f}.glb`);
  for (const t of doc.getRoot().listTextures()) {
    const nrm = t.listParents().some(p => p.propertyType === 'Material' && p.getNormalTexture() === t);
    t.setImage(await sharp(Buffer.from(t.getImage())).resize(sz, sz, { fit: 'inside', withoutEnlargement: true }).webp({ quality: nrm ? 88 : 82, effort: 6 }).toBuffer()).setMimeType('image/webp').setURI('');
  }
  doc.createExtension(EXTTextureWebP).setRequired(true);
  await doc.transform(prune({ keepLeaves: true }), dedup(), weld(), reorder({ encoder: MeshoptEncoder }), quantize({ quantizeNormal: 10, quantizePosition: 14, quantizeTexcoord: 12 }));
  meshopt(doc);
  const out = `${OUT}/wpn-${id}${suf}.glb`; await io.write(out, doc); console.log(out.split('/').pop(), mb(out));
}

// ---- наборы клипов
const K = (s, n) => `knife/${s}_main_menu_knife_${n}.glb`;
const SETS = {
  'knife-t': { idle: K('t', 'idle'), walkup: K('t', 'walkup'), ...Object.fromEntries(['bladewipe', 'fancymoves', 'flipandslice', 'flip_frontandback', 'slicedice01', 'slicedice02', 'threaten'].map(n => ['i_' + n, K('t', n)])) },
  'knife-ct': { idle: K('ct', 'idle'), walkup: K('ct', 'walkup'), ...Object.fromEntries(['lookat01', 'lookat02', 'flip01', 'backflip', 'slicedice01', 'slicedice02'].map(n => ['i_' + n, K('ct', n)])) },
  'usp-t': { idle: 'usp/t_main_menu_pistol_idle.glb', walkup: 'usp/t_main_menu_pistol_walkup.glb', i_lookat_pistol: 'usp/t_main_menu_pistol_lookat_pistol.glb', i_lookat_pistol02: 'usp/t_main_menu_pistol_lookat_pistol02.glb', i_slidepull: 'usp/t_main_menu_pistol_slidepull.glb' },
  'usp-ct': { idle: 'usp/ct_main_menu_pistol01_idle.glb', walkup: 'usp/ct_main_menu_pistol01_walkup.glb', i_lookatgun: 'usp/ct_main_menu_pistol01_lookatgun.glb' },
  'ak47-t': { idle: 'ak47/t_main_menu_rifle02_idle.glb', walkup: 'ak47/t_main_menu_rifle02_walkup.glb', i_lookatgun: 'ak47/t_main_menu_rifle02_lookatgun.glb' }, // у CT AK-47 в игре нет — сайт берёт набор T
};
for (const [set, clips] of Object.entries(SETS)) {
  let doc = null, byName = null, buf = null;
  for (const [name, file] of Object.entries(clips)) {
    const cd = await io.read(`${SRC}/anims/${file}`);
    if (!doc) { // скелет — из первого клипа; скелет оружия (animation/skeletons/weapons/…) и пустые сетки убираем
      doc = cd; const r = doc.getRoot();
      for (const n of r.listNodes()) { n.setMesh(null); n.setSkin(null); }
      const drop = n => { n.listChildren().forEach(drop); n.dispose(); };
      r.listNodes().filter(n => /^animation\/skeletons\/weapons/.test(n.getName())).forEach(drop);
      r.listAnimations()[0].setName(name);
      for (const ch of r.listAnimations()[0].listChannels()) if (ch.getTargetPath() === 'scale' || !ch.getTargetNode()) { ch.getSampler().dispose(); ch.dispose(); }
      byName = new Map(r.listNodes().map(n => [n.getName(), n])); buf = r.listBuffers()[0];
      continue;
    }
    const src = cd.getRoot().listAnimations()[0], anim = doc.createAnimation(name);
    for (const ch of src.listChannels()) {
      if (ch.getTargetPath() === 'scale') continue;
      const tn = byName.get(ch.getTargetNode().getName()); if (!tn) continue;
      const s = ch.getSampler(), inp = s.getInput(), o = s.getOutput();
      const si = doc.createAnimationSampler().setInterpolation(s.getInterpolation())
        .setInput(doc.createAccessor().setType('SCALAR').setArray(inp.getArray().slice()).setBuffer(buf))
        .setOutput(doc.createAccessor().setType(o.getType()).setArray(o.getArray().slice()).setBuffer(buf));
      anim.addSampler(si).addChannel(doc.createAnimationChannel().setTargetNode(tn).setTargetPath(ch.getTargetPath()).setSampler(si));
    }
  }
  await doc.transform(resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }), dedup());
  meshopt(doc);
  const out = `${OUT}/anim-${set}.glb`; await io.write(out, doc);
  console.log(out.split('/').pop(), mb(out), Object.keys(clips).join(' '));
}

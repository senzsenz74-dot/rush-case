// Главный экран: сборка новых агентов (девушки из CS2) в assets/main/agent-<id>.glb — как agent.glb (Darryl):
// сетка + скелет из игры, кости wpnPivot/wpn (к wpn крепится AWP), 5–7 клипов меню с короткими именами, картинки WebP, meshopt.
// 25.11.2026. Исходники — папка blender/assets/cs2 (не в git, см. её README): agents-female/*.glb, menu-anims/, eyes/.
// Глаза: в CS2 радужку рисует шейдер (F_EYEBALLS) — в glTF она теряется и глаза белые. Здесь текстура глаза из игры
// проецируется от костей eyeball_l / eyeball_r вперёд (радиус глаза и размер радужки — из материала головы, .vmat) и
// впекается в текстуру лица по маске глаз (eyemask).
// Запуск (зависимости — во временную папку, скрипт скопировать туда же, как tools/main-models.mjs):
//   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
//   node agents-build.mjs "D:/Кейсы/blender/assets/cs2" "<проект>/assets/main" [id ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, weld, reorder, quantize, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
const sharp = (await import('sharp')).default; // тот же sharp, что тянет @gltf-transform/functions (две копии libvips в одном процессе ломают друг друга)

const [SRC, OUT, ...only] = process.argv.slice(2);
const T = n => `menu-anims/t/t_main_menu_rifle02_${n}_awp_galil.glb`, C = n => `menu-anims/ct/ct_main_menu_rifle_awp_${n}.glb`;
const CLIPS = {
  t: { idle: T('idle'), weightshift: T('weightshift'), lookaround: T('lookaround'), lookback: T('lookback'), lookback02: T('lookback02'), lookbatgun: T('lookbatgun'), walkup: T('walkup') },
  // у CT другие движения: смотрит в сторону (lookat), пожимает плечами (shouldershrug) — кладём под имена, которые знает сайт
  ct: { idle: C('idle'), weightshift: C('weightshift'), lookaround: C('lookat'), lookback: C('shouldershrug'), walkup: C('walkup') },
};
const AGENTS = {
  vypa: { glb: 'tm_jungle_raider_variante.glb', side: 't',
    eyes: { head: 'tm_jungle_raider_variante_head', albedo: 'eyeball_brown_01_color.png', mask: 'tm_jungle_raider_variante_head_eyemask.png', radius: 0.6, iris: 1.185, wl: 5, wr: 6.9 },
    // одежда (пиджак/ушанка/пуховик, garment_fit.py) — владелец 25.11 отказался: «просто вернуть Vypa». Код addWear оставлен:
    // wear: { dir: 'puffer-vypa', covered: ['covered.json'], parts: [{ name: 'garment', base: …, normal: …, rough: …, double: true }] }
  },
  sally: { glb: 'tm_professional_varj.glb', side: 't' }, // глаза нарисованы в текстуре лица (F_EYEBALLS нет), к тому же очки
  ava: { glb: 'ctm_fbi_variantb.glb', side: 'ct',
    eyes: { head: 'ctm_fbi_v2_head_variantd', albedo: 'eyeball_blue_brown_color.png', mask: 'ctm_fbi_v2_head_variantd_eyemask.png', radius: 0.6, iris: 1.25, wl: 0, wr: 0 } },
  // «Профессионалы» (владелец 25.11): Number K — чулок на лице, глаз нет; Miami Darryl — глаза в прорезях маски
  numberk: { glb: '../agents-other/tm_professional_vari.glb', side: 't' },
  miami: { glb: '../agents-other/tm_professional_varf.glb', side: 't',
    eyes: { head: 'tm_professional_head_varf', albedo: 'eyeball_brown_light_color.png', mask: 'tm_professional_head_varf_eyemask.png', radius: 0.6, iris: 1.33, wl: 5.375, wr: 7.75 } },
};
const TEX = { base: 1024, normal: 1024, orm: 512 }, ROUGH = 180; // 180/255 ≈ 0,7 — где в игре шероховатость не выгрузилась

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// ---- матрицы 4×4 (столбцы, как в glTF)
const inv4 = m => { const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
    b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return [(a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d]; };
const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); }, add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);

// ---- глаза: впечь радужку в текстуру лица
async function bakeEyes(doc, E) {
  const skin = doc.getRoot().listSkins()[0], joints = skin.listJoints(), ibm = skin.getInverseBindMatrices();
  const bind = name => { const i = joints.findIndex(j => j.getName() === name); if (i < 0) throw new Error('нет кости ' + name); return inv4(ibm.getElement(i, [])); };
  const mat = doc.getRoot().listMaterials().find(m => m.getName() === E.head); if (!mat) throw new Error('нет материала ' + E.head);
  const prims = doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).filter(p => p.getMaterial() === mat);
  // взгляд — ось X кости глаза (у Ava чуть вниз и в стороны), вверх — её ось Z; walleye из материала — ещё наружу
  const mL = bind('eyeball_l'), mR = bind('eyeball_r'), pos = m => [m[12], m[13], m[14]], mid = add(pos(mL), pos(mR), 1).map(v => v / 2);
  const eyes = [[mL, E.wl], [mR, E.wr]].map(([m, deg]) => {
    const c = pos(m), f0 = norm([m[0], m[1], m[2]]), up = norm([m[8], m[9], m[10]]), a = deg * Math.PI / 180;
    const out = norm(add(sub(c, mid), f0, -dot(sub(c, mid), f0)));
    const f = norm(add(f0.map(v => v * Math.cos(a)), out, Math.sin(a))), r = norm(cross(f, up)), u = cross(r, f);
    return { c, f, r, u };
  });
  const k = E.iris / (2 * E.radius * 0.0254); // метры -> доли текстуры глаза (радиус в дюймах, как в игре)
  const tex = mat.getBaseColorTexture();
  const { data: img, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const mk = await sharp(SRC + '/eyes/' + E.mask).resize(W, H).raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(W * H).map((_, i) => mk.data[i * mk.info.channels]);
  const al = await sharp(SRC + '/eyes/' + E.albedo).removeAlpha().raw().toBuffer({ resolveWithObject: true }); const AW = al.info.width, AH = al.info.height;
  let painted = 0;
  for (const p of prims) {
    const P = p.getAttribute('POSITION'), U = p.getAttribute('TEXCOORD_0'), I = p.getIndices().getArray();
    const pos = i => P.getElement(i, []), uv = i => U.getElement(i, []);
    for (let t = 0; t < I.length; t += 3) {
      const ids = [I[t], I[t + 1], I[t + 2]], q = ids.map(uv).map(([s, v]) => [s * W, v * H]), w3 = ids.map(pos);
      const x0 = Math.max(0, Math.floor(Math.min(...q.map(a => a[0])))), x1 = Math.min(W - 1, Math.ceil(Math.max(...q.map(a => a[0]))));
      const y0 = Math.max(0, Math.floor(Math.min(...q.map(a => a[1])))), y1 = Math.min(H - 1, Math.ceil(Math.max(...q.map(a => a[1]))));
      const den = (q[1][1] - q[2][1]) * (q[0][0] - q[2][0]) + (q[2][0] - q[1][0]) * (q[0][1] - q[2][1]); if (Math.abs(den) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x, ma = mask[i] / 255; if (ma <= 0) continue;
        const px = x + 0.5, py = y + 0.5;
        const b0 = ((q[1][1] - q[2][1]) * (px - q[2][0]) + (q[2][0] - q[1][0]) * (py - q[2][1])) / den;
        const b1 = ((q[2][1] - q[0][1]) * (px - q[2][0]) + (q[0][0] - q[2][0]) * (py - q[2][1])) / den, b2 = 1 - b0 - b1;
        if (b0 < -0.02 || b1 < -0.02 || b2 < -0.02) continue;
        const X = [0, 1, 2].map(c => w3[0][c] * b0 + w3[1][c] * b1 + w3[2][c] * b2);
        const e = Math.hypot(...sub(X, eyes[0].c)) < Math.hypot(...sub(X, eyes[1].c)) ? eyes[0] : eyes[1], d = sub(X, e.c);
        const s = 0.5 + dot(d, e.r) * k, v = 0.5 - dot(d, e.u) * k;
        const sx = Math.min(AW - 1, Math.max(0, Math.round(s * AW - 0.5))), sy = Math.min(AH - 1, Math.max(0, Math.round(v * AH - 0.5))), j = (sy * AW + sx) * 3;
        for (let ch = 0; ch < 3; ch++) img[i * 3 + ch] = Math.round(img[i * 3 + ch] * (1 - ma) + al.data[j + ch] * 0.82 * ma); // 0,82 — тень век, которой нет без шейдера
        painted++;
      }
    }
  }
  const png = await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  tex.setImage(png).setMimeType('image/png');
  return { painted, eyes: eyes.map(e => e.c.map(v => +v.toFixed(3))), png };
}

// ---- одежда: убрать тело под ней и вклеить куски (coat.json/bin и т. п. из Blender) на тот же скелет
async function addWear(doc, Wr) {
  const root = doc.getRoot(), dir = `${SRC}/${Wr.dir}`, buf = root.listBuffers()[0];
  const skNode = root.listNodes().find(n => n.getSkin() && n.getMesh() && /thirdperson_body/.test(n.getMesh().getName()));
  const skin = skNode.getSkin(), jn = skin.listJoints().map(j => j.getName());
  // 1) тело под одеждой: точки (оси glTF) -> убрать треугольники, у которых все три точки закрыты
  const key = p => p.map(v => Math.round(v * 1e4)).join(',');
  const cov = new Set(Wr.covered.flatMap(f => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')).positions.map(key)));
  let cut = 0;
  for (const pr of skNode.getMesh().listPrimitives()) {
    const P = pr.getAttribute('POSITION'), I = pr.getIndices().getArray(), hid = new Uint8Array(P.getCount());
    for (let i = 0; i < P.getCount(); i++) if (cov.has(key(P.getElement(i, [])))) hid[i] = 1;
    const keep = []; for (let t = 0; t < I.length; t += 3) { if (hid[I[t]] && hid[I[t + 1]] && hid[I[t + 2]]) { cut++; continue; } keep.push(I[t], I[t + 1], I[t + 2]); }
    pr.getIndices().setArray(I instanceof Uint16Array ? Uint16Array.from(keep) : Uint32Array.from(keep));
  }
  // 2) куски одежды
  const img = async (f, mime) => { const b = fs.readFileSync(`${dir}/${f}`); return doc.createTexture(f).setImage(b).setMimeType(mime || (f.endsWith('.png') ? 'image/png' : 'image/jpeg')); };
  for (const p of Wr.parts) {
    const J = JSON.parse(fs.readFileSync(`${dir}/${p.name}.json`, 'utf8')), raw = fs.readFileSync(`${dir}/${p.name}.bin`), n = J.count;
    let o = 0; const take = (T, k) => { const a = new T(raw.buffer.slice(raw.byteOffset + o, raw.byteOffset + o + n * k * T.BYTES_PER_ELEMENT)); o += n * k * T.BYTES_PER_ELEMENT; return a; };
    const pos = take(Float32Array, 3), nor = take(Float32Array, 3), uv = take(Float32Array, 2), j4 = take(Uint16Array, 4), w4 = take(Float32Array, 4);
    const idx = new Uint32Array(raw.buffer.slice(raw.byteOffset + o, raw.byteOffset + o + J.tris * 12));
    const map = J.bones.map(b => { const k = jn.indexOf(b); if (k < 0 && b) throw new Error('нет кости ' + b); return Math.max(0, k); });
    const jj = Uint16Array.from(j4, v => map[v] ?? 0);
    const acc = (a, t) => doc.createAccessor().setType(t).setArray(a).setBuffer(buf);
    const mat = doc.createMaterial(p.name).setMetallicFactor(0).setRoughnessFactor(p.roughness ?? 1).setDoubleSided(!!p.double);
    mat.setBaseColorTexture(await img(p.base));
    if (p.normal) mat.setNormalTexture(await img(p.normal));
    if (p.rough) { // шероховатость -> зелёный канал ORM
      const { data, info } = await sharp(`${dir}/${p.rough}`).resize(1024, 1024).greyscale().raw().toBuffer({ resolveWithObject: true });
      const orm = Buffer.alloc(info.width * info.height * 3); for (let i = 0; i < info.width * info.height; i++) { orm[i * 3] = 255; orm[i * 3 + 1] = data[i * info.channels]; }
      mat.setMetallicRoughnessTexture(doc.createTexture('orm').setImage(await sharp(orm, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer()).setMimeType('image/png'));
    }
    const prim = doc.createPrimitive().setMaterial(mat).setIndices(acc(idx, 'SCALAR'))
      .setAttribute('POSITION', acc(pos, 'VEC3')).setAttribute('NORMAL', acc(nor, 'VEC3')).setAttribute('TEXCOORD_0', acc(uv, 'VEC2'))
      .setAttribute('JOINTS_0', acc(jj, 'VEC4')).setAttribute('WEIGHTS_0', acc(w4, 'VEC4'));
    const node = doc.createNode(p.name).setMesh(doc.createMesh(p.name).addPrimitive(prim)).setSkin(skin);
    (skNode.getParentNode() || root.listScenes()[0]).addChild(node);
  }
  return `одежда: ${Wr.parts.map(p => p.name).join('+')}, тела убрано ${cut} треуг.`;
}

// ---- сборка одного агента
async function build(id) {
  const A = AGENTS[id], doc = await io.read(`${SRC}/agents-female/${A.glb}`), root = doc.getRoot();
  const log = [];
  if (A.eyes) { const r = await bakeEyes(doc, A.eyes); log.push('глаза: ' + r.painted + ' точек'); fs.writeFileSync(`${SRC}/eyes/${id}-head-eyes.png`, r.png); }
  if (A.wear) log.push(await addWear(doc, A.wear));
  const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
  const rm = byName.get('root_motion');
  let first = true;
  for (const [name, file] of Object.entries(CLIPS[A.side])) {
    const cd = await io.read(`${SRC}/${file}`), cn = new Map(cd.getRoot().listNodes().map(n => [n.getName(), n]));
    if (first) { // поза покоя корня и таза — из клипа (оси игры), кости оружия wpnPivot → wpn — тоже
      first = false;
      // у моделей из игры wpnPivot/wpn уже есть (25.11: вторые с тем же именем забирали анимацию — AWP лежал в полу); нет — создаём
      if (!byName.get('wpnPivot')) { const p = doc.createNode('wpnPivot'); rm.addChild(p); byName.set('wpnPivot', p); }
      if (!byName.get('wpn')) { const w = doc.createNode('wpn'); byName.get('wpnPivot').addChild(w); byName.set('wpn', w); }
      for (const n of ['root_motion', 'pelvis', 'wpnPivot', 'wpn']) byName.get(n).setTranslation(cn.get(n).getTranslation()).setRotation(cn.get(n).getRotation());
    }
    const src = cd.getRoot().listAnimations()[0], anim = doc.createAnimation(name), buf = root.listBuffers()[0];
    let n = 0;
    for (const ch of src.listChannels()) {
      if (ch.getTargetPath() === 'scale') continue;
      const tn = byName.get(ch.getTargetNode().getName()); if (!tn) continue;
      const s = ch.getSampler(), inp = s.getInput(), out = s.getOutput();
      const si = doc.createAnimationSampler().setInterpolation(s.getInterpolation())
        .setInput(doc.createAccessor().setType('SCALAR').setArray(inp.getArray().slice()).setBuffer(buf))
        .setOutput(doc.createAccessor().setType(out.getType()).setArray(out.getArray().slice()).setBuffer(buf));
      anim.addSampler(si).addChannel(doc.createAnimationChannel().setTargetNode(tn).setTargetPath(ch.getTargetPath()).setSampler(si)); n++;
    }
    log.push(name + ' ' + n);
  }
  // сцена: один корень «agent», как у agent.glb
  const scene = root.listScenes()[0], top = scene.listChildren(), ag = doc.createNode('agent');
  top.forEach(c => { scene.removeChild(c); ag.addChild(c); }); scene.addChild(ag);
  root.listMeshes().forEach(m => { if (!/^(coat|hat|garment)$/.test(m.getName())) m.setName(/gloves/i.test(m.getName()) ? 'gloves' : 'body'); });
  // картинки -> WebP (цвет и нормали 1024, ORM 512)
  for (const t of root.listTextures()) {
    const used = t.listParents().filter(p => p.propertyType === 'Material'); let kind = 'base';
    for (const m of used) { if (m.getNormalTexture() === t) kind = 'normal'; else if (m.getMetallicRoughnessTexture() === t || m.getOcclusionTexture() === t) kind = kind === 'base' ? 'orm' : kind; }
    const q = kind === 'normal' ? 90 : 80;
    if (kind === 'orm') { // шероховатость (зелёный канал) пустая = зеркало, «как в масле» (владелец 25.11): ставим матовую 0,7
      const { data, info } = await sharp(Buffer.from(t.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let gmax = 0; for (let i = 1; i < data.length; i += 3) gmax = Math.max(gmax, data[i]);
      if (gmax < 10) { for (let i = 1; i < data.length; i += 3) data[i] = ROUGH; t.setImage(await sharp(data, { raw: info }).png().toBuffer()); }
    }
    t.setImage(await sharp(Buffer.from(t.getImage())).resize(TEX[kind], TEX[kind], { fit: 'inside', withoutEnlargement: true }).webp({ quality: q, effort: 6 }).toBuffer()).setMimeType('image/webp').setURI('');
  }
  doc.createExtension((await import('@gltf-transform/extensions')).EXTTextureWebP).setRequired(true);
  await doc.transform(resample(), prune({ keepLeaves: true, keepSolidTextures: true }), dedup(), weld(), reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizeNormal: 10, quantizePosition: 14, quantizeTexcoord: 12 }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const out = `${OUT}/agent-${id}.glb`; await io.write(out, doc);
  console.log(id, (fs.statSync(out).size / 1048576).toFixed(2), 'МБ |', log.join(', '));
}
for (const id of only.length ? only : Object.keys(AGENTS)) await build(id);

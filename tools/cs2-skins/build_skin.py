# Сборка 3D-скина CS2 для сайта (вариант 2, как в игре): сетка CS2 body_hd (у ножей — body_legacy),
# цвет скина складывается в развёртке «входов покраски» оружия (composite_inputs):
#   — «свои» рисунки (6/7/8) берутся по второй развёртке (UV1, старая CS:GO), её запекаем в картинку;
#   — напыление/анодирование с плавающим масштабом проецируются сбоку по карте положения (pos).
# Запуск: blender -b --factory-startup --python build_skin2.py -- <item.json>
import bpy, json, sys, os, re, glob, math
import numpy as np

cfg = json.load(open(sys.argv[sys.argv.index('--') + 1], encoding='utf-8'))
RES = cfg.get('res', 2048)
TUNE = cfg.get('tune', {})

def kv(path):
    t = open(path, encoding='utf-8', errors='ignore').read()
    return dict(re.findall(r'"([A-Za-z0-9_]+)"\s+"([^"]*)"', t))

def vec(s):
    return np.array([float(x) for x in s.strip('[]').split()][:3], dtype=np.float32)

def find_tex(folder, path, ext='.png'):
    if not path: return None
    stem = os.path.splitext(os.path.basename(path))[0]
    c = glob.glob(os.path.join(folder, stem + ext)) or glob.glob(os.path.join(folder, stem + '*' + ext))
    return c[0] if c else None

def load(path):
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)

def sample(img, u, v, wrap=True):
    h, w = img.shape[:2]
    if wrap: u = u % 1.0; v = v % 1.0
    else: u = np.clip(u, 0, 0.99999); v = np.clip(v, 0, 0.99999)
    x = u * w - 0.5; y = v * h - 0.5
    x0 = np.floor(x).astype(np.int64); y0 = np.floor(y).astype(np.int64)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    x0 %= w; y0 %= h; x1 = (x0 + 1) % w; y1 = (y0 + 1) % h
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x1] * fx * (1 - fy) + img[y1, x0] * (1 - fx) * fy + img[y1, x1] * fx * fy)

P = kv(cfg['paint_vmat']); PDIR = os.path.dirname(cfg['paint_vmat'])
W = kv(cfg['ci_vmat']); WDIR = os.path.dirname(cfg['ci_vmat'])
style = int(P.get('F_PAINT_STYLE', '6'))
col = [vec(P.get('g_vColor%d' % i, '[1 1 1 1]')) for i in range(4)]
pscale = float(P.get('g_flPatternTexCoordScale', '1')); prot = math.radians(float(P.get('g_flPatternTexCoordRotation', '0')))
poff = vec(P.get('g_vPatternTexCoordOffset', '[0 0 0 0]'))
ignore = P.get('g_bIgnoreWeaponSizeScale', '1') == '1'
prough = float(P.get('g_flPaintRoughness', '0.45'))
wlen = float(W.get('g_flWeaponLength1', '32')); wuv = float(W.get('g_flUvScale1', '1')); plen = float(P.get('g_flWeaponLength1', '32'))

# --- модель
bpy.ops.import_scene.gltf(filepath=cfg['model'])
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
LEG = style in (6, 7, 8)  # «свои» рисунки нарисованы под старую сетку CS:GO — кладём на неё целиком (как в игре: use_legacy_model)
ob = (None if LEG else next((o for o in meshes if o.name.endswith('body_hd')), None)) or next(o for o in meshes if o.name.endswith('body_legacy'))
for o in meshes:
    if o is not ob: bpy.data.objects.remove(o, do_unlink=True)
uvs = [l.name for l in ob.data.uv_layers]
paint_uv = uvs[0]

yy, xx = np.mgrid[0:RES, 0:RES].astype(np.float32)
u = (xx + 0.5) / RES; v = (yy + 0.5) / RES

# --- запекаем вторую развёртку в картинку (в развёртке UV0)
if paint_uv != uvs[0] and style in (6, 7, 8):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
    bimg = bpy.data.images.new('uv1bake', RES, RES, alpha=False, float_buffer=True); bimg.colorspace_settings.name = 'Non-Color'
    bm = bpy.data.materials.new('UV1BAKE'); bm.use_nodes = True; nt = bm.node_tree; nt.nodes.clear()
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = paint_uv
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); comb = nt.nodes.new('ShaderNodeCombineXYZ'); comb.inputs[2].default_value = 1.0
    em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = bimg
    uv0 = nt.nodes.new('ShaderNodeUVMap'); uv0.uv_map = uvs[0]; nt.links.new(uv0.outputs['UV'], tn.inputs['Vector'])
    nt.links.new(uvn.outputs['UV'], sep.inputs[0]); nt.links.new(sep.outputs[0], comb.inputs[0]); nt.links.new(sep.outputs[1], comb.inputs[1])
    nt.links.new(comb.outputs[0], em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs['Surface'])
    nt.nodes.active = tn
    saved = [s.material for s in ob.material_slots]
    for s in ob.material_slots: s.material = bm
    ob.data.uv_layers.active = ob.data.uv_layers[uvs[0]]
    for o in bpy.data.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True)
    a = np.empty(RES * RES * 4, np.float32); bimg.pixels.foreach_get(a); a = a.reshape(RES, RES, 4)
    pu, pv = a[..., 0], a[..., 1]
    _cov = a[..., 2] > 0.5; print('UV1', 'cover', round(float(_cov.mean()), 3), 'u', np.percentile(pu[_cov], [1, 50, 99]).round(3), 'v', np.percentile(pv[_cov], [1, 50, 99]).round(3))
    for s, m in zip(ob.material_slots, saved): s.material = m
else:
    pu, pv = u, v

pattern = load(find_tex(PDIR, P.get('TexturePattern')))
wcolor = load(find_tex(WDIR, W.get('TextureColor1')))
mpath = find_tex(WDIR, W.get('TextureMasks1')); masks = load(mpath) if mpath else None
aopath = find_tex(WDIR, W.get('TextureAmbientOcclusion1')); ao = load(aopath) if aopath else None
rpath = find_tex(WDIR, W.get('TextureRoughness1')); wrough = load(rpath) if rpath else None
mtpath = find_tex(WDIR, W.get('TextureMetalness1')); wmetal = load(mtpath) if mtpath else None
pospath = find_tex(WDIR, W.get('TexturePosition1'), '.exr'); pos = load(pospath) if pospath else None

if style in (6, 7, 8):
    if pscale != 1 or prot != 0 or poff.any():  # на всякий случай: сдвиг/поворот вокруг центра
        cu, cv = pu - 0.5, pv - 0.5; ca, sa = math.cos(prot), math.sin(prot)
        pu = (cu * ca - cv * sa) * pscale + 0.5 + poff[0]; pv = (cu * sa + cv * ca) * pscale + 0.5 - poff[1]
    pt = sample(pattern, pu, pv)
else:
    if not ignore and pos is not None:  # проекция сбоку: длинная ось — по горизонтали рисунка, вторая по длине — по вертикали
        ps = sample(pos, u, v, wrap=False)
        mk = sample(masks, u, v)[..., 0] if masks is not None else np.ones((RES, RES), np.float32)
        sel = ps[mk > 0.5][:, :3] if (mk > 0.5).any() else ps.reshape(-1, 4)[:, :3]
        # главные оси формы (по окрашиваемой части): 1-я — длина, 2-я — высота; знак — по самой похожей исходной оси; длина → 0…1
        allp = ps.reshape(-1, 4)[:, :3]; rall = np.percentile(allp, 99, 0) - np.percentile(allp, 1, 0)
        thin = int(np.argmin(rall)); keep = [i for i in range(3) if i != thin]  # толщину оружия убираем — смотрим строго сбоку
        sub = sel[:: max(1, len(sel) // 200000)]; cen = sub.mean(0)
        _, _, vt2 = np.linalg.svd((sub - cen)[:, keep], full_matrices=False)
        axL = np.zeros(3, np.float32); axH = np.zeros(3, np.float32); axL[keep] = vt2[0]; axH[keep] = vt2[1]
        if axL[np.argmax(np.abs(axL))] < 0: axL = -axL
        if axH[np.argmax(np.abs(axH))] < 0: axH = -axH
        pl = (ps[..., :3] - cen) @ axL; ph = (ps[..., :3] - cen) @ axH
        span = float(np.percentile(sub @ axL, 99.5) - np.percentile(sub @ axL, 0.5)) or 1.0
        s = pscale * wlen / plen / wuv * TUNE.get('k', 1.0)
        qu = pl / span * s; qv = ph / span * s
        rng = np.array([span]); L, H = int(np.argmax(np.abs(axL))), int(np.argmax(np.abs(axH)))
        print('PROJ axes', L, H, 'rng', rng.round(3), 's', round(s, 3))
    else:  # по развёртке, с масштабом рисунка
        s = pscale * TUNE.get('k', 1.0)
        qu = (pu - 0.5) * s; qv = (pv - 0.5) * s
    ca, sa = math.cos(prot), math.sin(prot)
    ru = qu * ca - qv * sa + 0.5 + poff[0] + TUNE.get('du', 0.0)
    rv = qu * sa + qv * ca + 0.5 + poff[1] + TUNE.get('dv', 0.0)
    pt = sample(pattern, ru, rv if TUNE.get('vflip', 0) else 1.0 - rv)
    _mk = (sample(masks, u, v)[..., 0] > 0.5) if masks is not None else np.ones((RES, RES), bool)
    print('PT ru', np.percentile(ru[_mk], [2, 50, 98]).round(3), 'rv', np.percentile(rv[_mk], [2, 50, 98]).round(3), 'nonzero', round(float((pt[..., :3].max(-1)[_mk] > 0.1).mean()), 3))

base = sample(wcolor, u, v)[..., :3]
mask = sample(masks, u, v)[..., 0:1] if (masks is not None and style not in (6, 7, 8)) else np.ones((RES, RES, 1), np.float32)  # «свои» рисунки — на всё оружие
occ = sample(ao, u, v)[..., 0:1] if ao is not None else np.ones((RES, RES, 1), np.float32)
if LEG:  # у старой сетки свои тени — из её материала (канал R картинки *_ao*)
    _m = ob.material_slots[0].material; _ai = next((n.image for n in _m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and '_ao' in n.image.name.lower()), None)
    if _ai is not None and _ai.filepath:
        _a = np.empty(_ai.size[0] * _ai.size[1] * 4, np.float32); _ai.pixels.foreach_get(_a); _a = _a.reshape(_ai.size[1], _ai.size[0], 4)
        occ = sample(_a, u, v)[..., 0:1]
    elif _ai is not None:
        _a = np.empty(_ai.size[0] * _ai.size[1] * 4, np.float32); _ai.pixels.foreach_get(_a); _a = _a.reshape(_ai.size[1], _ai.size[0], 4); occ = sample(_a, u, v)[..., 0:1]
    else: occ = np.ones((RES, RES, 1), np.float32)

if style in (2, 4, 5):
    c = np.broadcast_to(col[0], (RES, RES, 3)).copy()
    for i, ch in ((1, 0), (2, 1), (3, 2)):
        a = pt[..., ch:ch + 1]; c = c * (1 - a) + col[i] * a
    paint = c * TUNE.get('bright', 1.0)
else:
    paint = pt[..., :3]
paint = paint * (0.55 + 0.45 * occ)
albedo = base * (1 - mask) + paint * mask

pmetal = {2: 0.0, 4: 0.75, 5: 0.75, 6: 0.0, 7: 0.15, 8: 0.0}.get(style, 0.0)  # анодирование — не «зеркало», чтобы цвет читался на сайте
rough0 = sample(wrough, u, v)[..., 0:1] if wrough is not None else np.full((RES, RES, 1), 0.6, np.float32)
metal0 = sample(wmetal, u, v)[..., 0:1] if wmetal is not None else np.zeros((RES, RES, 1), np.float32)
rough = rough0 * (1 - mask) + prough * mask
if style == 8:  # «оружейник»: металличность — в альфе рисунка (серое — тёмный оружейный металл, золото — металл)
    pmetal = np.clip((pt[..., 3:4] - 0.08) / 0.3, 0, 1)
metal = metal0 * (1 - mask) + pmetal * mask

os.makedirs(cfg['tmp'], exist_ok=True)
def save(name, rgb, cs):
    img = bpy.data.images.new(name, RES, RES, alpha=False)
    a = np.concatenate([np.clip(rgb, 0, 1), np.ones((RES, RES, 1), np.float32)], axis=2).astype(np.float32)
    img.pixels.foreach_set(a.ravel())
    p = os.path.join(cfg['tmp'], name + '.png'); img.filepath_raw = p; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img); img = bpy.data.images.load(p)  # берём из файла: иначе при выгрузке цвета пересчитываются и светлеют
    img.colorspace_settings.name = cs
    return img
img_alb = save(cfg['id'] + '_albedo', albedo, 'sRGB')
img_mr = save(cfg['id'] + '_mr', np.concatenate([occ, rough, metal], axis=2), 'Non-Color')

m = ob.material_slots[0].material
nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
for l in list(nt.links):
    if l.to_node == bsdf and l.to_socket.name in ('Base Color', 'Metallic', 'Roughness'): nt.links.remove(l)
t = nt.nodes.new('ShaderNodeTexImage'); t.image = img_alb; nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
t2 = nt.nodes.new('ShaderNodeTexImage'); t2.image = img_mr
sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(t2.outputs['Color'], sp.inputs['Color'])
nt.links.new(sp.outputs['Green'], bsdf.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], bsdf.inputs['Metallic'])
if LEG:  # у «своих» рисунков бывает своя карта рельефа — ставим вместо рельефа оружия
    _np = find_tex(PDIR, P.get('TextureNormal'))
    _nm = next((n for n in nt.nodes if n.type == 'NORMAL_MAP'), None)
    if _np and _nm is not None:
        _ni = bpy.data.images.load(_np); _ni.colorspace_settings.name = 'Non-Color'
        _tn = nt.nodes.new('ShaderNodeTexImage'); _tn.image = _ni
        for l in list(nt.links):
            if l.to_node == _nm and l.to_socket.name == 'Color': nt.links.remove(l)
        nt.links.new(_tn.outputs['Color'], _nm.inputs['Color'])
        print('NORMAL paint', os.path.basename(_np))
for n in nt.nodes:  # нормали 4K → 2K, чтобы файл был лёгким
    if n.type == 'TEX_IMAGE' and n.image and max(n.image.size) > RES: n.image.scale(RES, RES)

for o in bpy.data.objects: o.select_set(False)
ob.select_set(True); bpy.context.view_layer.objects.active = ob
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
kw = dict(filepath=cfg['out'], export_format='GLB', use_selection=True, export_apply=True, export_animations=False,
          export_skins=False, export_morph=False, export_cameras=False, export_lights=False, export_yup=True)
if 'export_image_format' in props: kw['export_image_format'] = 'WEBP'
if 'export_image_quality' in props: kw['export_image_quality'] = 82
bpy.ops.export_scene.gltf(**kw)
print('BUILT', cfg['id'], 'style', style, 'obj', ob.name.split('.')[-1], 'uv', uvs, 'paint_uv', paint_uv)

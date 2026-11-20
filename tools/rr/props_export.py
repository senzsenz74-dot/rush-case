# «Русская рулетка»: предметы комнаты → assets/rr/props.glb (метры, низ на нуле, по центру).
# Корневые узлы: crate1, crate2, barrel (Poly Haven, CC0), candelabra (+ flame_0..2 — точки огоньков), snowglobe (снежный шар владельца:
# материалы собраны заново, стекло — globe_glass), tlamp (напольный канделябр владельца «Titanic lamp», лампы-свечи — материал tlamp_glow).
# cash_usd, cash_rub (пачки), note_usd, note_rub (купюры) — деньги на стол (владельца). Бутылки убраны 20.11 (полок больше нет — на их месте экраны).
import bpy, os, mathutils
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
SC = os.path.join(HERE, "src")                                   # исходники (не в git): tools/rr/src — см. tools/rr/README.md
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "assets", "rr", "props.glb")
GT = os.path.join(SC, "z-snow-globe", "textures")
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def imp(kind, path):
    before = set(bpy.data.objects)
    if kind == 'gltf': bpy.ops.import_scene.gltf(filepath=path)
    else: bpy.ops.import_scene.fbx(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

def pack(name, objs, scale=None, height=None):
    """запечь мировые преобразования в сетки, убрать пустышки, низ на ноль, центр по x/y, масштаб; один корень name"""
    meshes = [o for o in objs if o.type == 'MESH']
    for o in meshes:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in objs:
        if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.make_single_user(object=True, obdata=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    pts = [v.co for o in meshes for v in o.data.vertices]
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    s = scale or (height / (mx.z - mn.z) if height else 1.0)
    T = Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)))
    for o in meshes: o.data.transform(T); o.data.update()
    root = bpy.data.objects.new(name, None); scene.collection.objects.link(root)
    for o in meshes: o.parent = root
    print("PACK", name, "scale", round(s, 4), "size", tuple(round(v * s, 3) for v in (mx - mn)))
    return root, T

# --- ящики и бочка
for name, p in [("crate1", "ph/wooden_crate_01/wooden_crate_01_1k.gltf"), ("crate2", "ph/wooden_crate_02/wooden_crate_02_1k.gltf"), ("barrel", "ph/wine_barrel_01/wine_barrel_01_1k.gltf")]:
    pack(name, imp('gltf', os.path.join(SC, p)))
# --- канделябр: высота 42 см; точки огоньков (в исходнике: центр — y 0, верх пламени 0,5; боковые — y ±0,16, верх 0,423; низ −0,5)
imgs0 = set(bpy.data.images)
root, T = pack("candelabra", imp('gltf', os.path.join(SC, "z-golden-glow-antique-three-arm-candelabra", "source", "df682e78-6574-4568-b6a4-5324dcda1abf.glb")), height=.42)
cand_imgs = set(bpy.data.images) - imgs0
for i, p in enumerate([(0, 0, .468), (0, -.16, .395), (0, .16, .395)]):
    e = bpy.data.objects.new("flame_%d" % i, None); scene.collection.objects.link(e); e.location = T @ Vector(p); e.parent = root
# --- снежный шар: материалы заново (в FBX — Arnold, к текстурам не привязаны)
def load(f): return bpy.data.images.load(os.path.join(GT, f), check_existing=True)
def mat(name, diff=None, nor=None, color=None, rough=.6, metal=0., emis=0., alpha=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    if diff:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = load(diff); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        if emis: nt.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = emis
    elif color: b.inputs['Base Color'].default_value = (*color, 1)
    if nor:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = load(nor); t.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if alpha is not None:
        b.inputs['Alpha'].default_value = alpha
        for k, v in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try: setattr(m, k, v)
            except Exception: pass
    return m
M = {
    'house': mat('globe_house', 'uvhouse11.png', 'uvhouse2.png', rough=.8), 'roof': mat('globe_roof', 'uvhouse11.png', 'uvhouse2.png', rough=.8),
    'base': mat('globe_base', 'unwrapwood1.png', 'unwrapwood2.png', rough=.45), 'treeertertert': mat('globe_tree', 'pinetreeuvpaint2.png', rough=.85),
    'snow': mat('globe_snow', color=(.9, .93, .97), nor='snownrmmap.jpg', rough=.75),
    'aiStandardSurface1': mat('globe_door', 'door.png', rough=.7), 'aiStandardSurface2': mat('globe_win1', 'window1.png', emis=2.5), 'aiStandardSurface3': mat('globe_win2', 'window2.png', emis=2.5),
    'aiStandardSurface15': mat('globe_brick', 'Brick.jpg', rough=.85), 'aiStandardSurface4': mat('globe_glass', color=(.9, .95, 1), rough=.03, alpha=.16),
    'aiStandardSurface8': mat('globe_snowman', color=(.95, .96, .98), rough=.7), 'hat': mat('globe_black', color=(.03, .03, .03), rough=.5),
    'snowglobe:aiStandardSurface4': mat('globe_black2', color=(.02, .02, .02), rough=.4), 'snowglobe:aiStandardSurface5': mat('globe_nose', color=(.95, .42, .08), rough=.5),
}
gobjs = imp('fbx', os.path.join(SC, "z-snow-globe", "source", "snowglobehome3.fbx"))
for o in gobjs:
    if o.type != 'MESH': continue
    for sl in o.material_slots:
        if sl.material and sl.material.name in M: sl.material = M[sl.material.name]
        elif sl.material: print("NO MAT MAP", o.name, sl.material.name)
pack("snowglobe", gobjs, height=.12)
# --- напольный канделябр «Titanic lamp» (Загрузки владельца titanic-lamp.zip → src/z-titanic-lamp): высота 1,1 м.
# В FBX текстуры к материалу не привязаны — собираем заново: цвет, нормали, шероховатость, металл; второй материал (Emission) — лампы-свечи.
LT = os.path.join(SC, "z-titanic-lamp", "textures")
def tlamp_mat():
    m = bpy.data.materials.new("tlamp"); m.use_nodes = True; nt = m.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    def tx(f, srgb):
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(os.path.join(LT, f), check_existing=True)
        if not srgb: n.image.colorspace_settings.name = 'Non-Color'
        return n
    nt.links.new(tx('Lamp_Lamp_BaseColor.png', True).outputs['Color'], bs.inputs['Base Color'])
    nt.links.new(tx('Lamp_Lamp_Roughness.png', False).outputs['Color'], bs.inputs['Roughness'])
    nt.links.new(tx('Lamp_Lamp_Metallic.png', False).outputs['Color'], bs.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tx('Lamp_Lamp_Normal.png', False).outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    return m
def tlamp_glow():
    m = bpy.data.materials.new("tlamp_glow"); m.use_nodes = True; bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = (1, .78, .5, 1)
    for k in ('Emission Color', 'Emission'):
        if k in bs.inputs: bs.inputs[k].default_value = (1, .7, .4, 1); break
    if 'Emission Strength' in bs.inputs: bs.inputs['Emission Strength'].default_value = 3.0
    return m
imgs1 = set(bpy.data.images)
TM, TG = tlamp_mat(), tlamp_glow()
lobjs = imp('fbx', os.path.join(SC, "z-titanic-lamp", "source", "Lamp.fbx"))
for o in lobjs:
    if o.type != 'MESH': continue
    for sl in o.material_slots:
        if sl.material and sl.material.name.startswith('Emission'): sl.material = TG
        elif sl.material: sl.material = TM
pack("tlamp", lobjs, height=1.1)
lamp_imgs = set(bpy.data.images) - imgs1
# --- деньги на стол (Загрузки владельца): stack-of-dollars.zip (пачка из 100 купюр, FBX) и 5000-rub.zip (в архиве Collada — Blender 5 её не читает;
#     стороны вырезаны из общей картинки в src/z-5000-rub/source/inner: rub_b.jpg — лицо, rub_a.jpg — оборот). Корни: cash_usd, cash_rub (пачки), note_usd, note_rub (одна купюра)
DS = os.path.join(SC, "z-stack-of-dollars", "source", "inner", "texture"); RS = os.path.join(SC, "z-5000-rub", "source", "inner")
def paper(name, im=None, color=(.78, .8, .72)):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Roughness'].default_value = .75
    if im:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(im, check_existing=True); nt.links.new(t.outputs['Color'], bs.inputs['Base Color'])
    else: bs.inputs['Base Color'].default_value = (*color, 1)
    return m
U_F, U_B = paper('usd_front', os.path.join(DS, 'front.jpg')), paper('usd_back', os.path.join(DS, 'back.jpg'))
R_F, R_B = paper('rub_front', os.path.join(RS, 'rub_b.jpg')), paper('rub_back', os.path.join(RS, 'rub_a.jpg'))
E_U, E_R = paper('usd_edge', color=(.7, .74, .64)), paper('rub_edge', color=(.82, .68, .58))
def stack(name, f, b, e):
    objs = imp('fbx', os.path.join(SC, "z-stack-of-dollars", "source", "inner", "untitled.fbx"))
    for o in objs:
        if o.type != 'MESH': continue
        for sl in o.material_slots:
            n = sl.material.name if sl.material else ''
            sl.material = f if n.startswith('Front') else b if n.startswith('Back') else e
    pack(name, objs)
stack('cash_usd', U_F, U_B, E_U); stack('cash_rub', R_F, R_B, E_R)
def note(name, f, b, w, h):
    me = bpy.data.meshes.new(name); t = .00025
    me.from_pydata([(-w/2, -h/2, t), (w/2, -h/2, t), (w/2, h/2, t), (-w/2, h/2, t), (-w/2, -h/2, 0), (w/2, -h/2, 0), (w/2, h/2, 0), (-w/2, h/2, 0)], [], [(0, 1, 2, 3), (7, 6, 5, 4)])
    uv = me.uv_layers.new(); me.materials.append(f); me.materials.append(b); me.polygons[1].material_index = 1
    for p, uvs in zip(me.polygons, [[(0, 0), (1, 0), (1, 1), (0, 1)], [(1, 1), (0, 1), (0, 0), (1, 0)]]):
        for li, c in zip(p.loop_indices, uvs): uv.data[li].uv = c
    o = bpy.data.objects.new(name + "_m", me); scene.collection.objects.link(o)
    pack(name, [o])
note('note_usd', U_F, U_B, .156, .066); note('note_rub', R_F, R_B, .157, .069)
# --- упростить сетки: ящики и бочка до 55%, канделябр Titanic до 50%
def decimate(root, ratio):
    for o in [c for c in root.children if c.type == 'MESH']:
        before = len(o.data.polygons); m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = ratio
        bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=m.name)
        print('DEC', root.name, o.name, before, '->', len(o.data.polygons))
for o in [o for o in scene.objects if o.parent is None]:
    if o.name in ('crate1', 'crate2', 'barrel'): decimate(o, .55)
    elif o.name == 'tlamp': decimate(o, .5)
# --- текстуры: канделябр 1024, остальное 512
for im in list(bpy.data.images):
    if not im.has_data:
        try: im.reload()
        except Exception: pass
    w, h = im.size[:]
    if not w: continue
    t = 1024 if im in cand_imgs or im in lamp_imgs else 512
    if max(w, h) > t: im.scale(max(1, round(w * t / max(w, h))), max(1, round(h * t / max(w, h))))
kw = dict(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True)
for extra in (dict(export_image_format='WEBP', export_image_quality=80), dict(export_image_format='WEBP'), {}):
    try: bpy.ops.export_scene.gltf(**kw, **extra); print("EXPORTED", extra); break
    except TypeError as e: print("retry:", e)
print("SIZE", os.path.getsize(OUT))
print("ROOTS", [o.name for o in scene.objects if o.parent is None])

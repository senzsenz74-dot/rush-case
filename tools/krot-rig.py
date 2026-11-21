# «Русская рулетка»: посадить сетку агента CS2 БЕЗ костей на скелет готового агента (перенос весов с ближайших точек).
# Нужен, когда модель агента пришла без привязки к костям (нет JOINTS/WEIGHTS), но в той же позе, что агенты CS2 (A-поза).
# Запуск (фоновый Blender, ничего не трогает в открытом Blender владельца):
#   "D:/SteamLibrary/steamapps/common/Blender/blender.exe" -b --factory-startup --python tools/krot-rig.py -- <донор со скелетом>.glb <сетка без костей>.glb <выход>.glb
# Донор 22.11.2026 — Загрузки balkan-cs2-agent-model-romanov.zip → source/balkan romanov.glb (полный, не ужатый).
# Потом ужать как остальных: node tools/krot-models.mjs <выход>.glb assets/krot/<имя>.glb
# Что делает: 1) совмещает сетку с донором — масштаб по размаху рук, пол, центр корпуса, затем уточняет масштаб и сдвиг
# (минимум среднего расстояния до поверхности донора по 80% ближайших точек); 2) переносит веса костей (Data Transfer,
# ближайшая грань, интерполяция), не больше 4 костей на вершину, нормализует; 3) ставит сетку на место сетки донора
# (тот же родитель и матрицы — экспорт скина как у исходной модели); 4) удаляет сетки донора и анимации, пишет GLB.
import bpy, sys, random
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
DONOR, SRC, OUT = argv[:3]
bpy.ops.wm.read_factory_settings(use_empty=True)


def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


D = imp(DONOR)
arm = next(o for o in D if o.type == 'ARMATURE')
if arm.animation_data: arm.animation_data_clear()
for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'REST'
dmesh = [o for o in D if o.type == 'MESH' and len(o.vertex_groups) and any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers)]   # только сетки на скелете (без служебных кубов)
print('KROT-RIG donor meshes', [o.name for o in dmesh], '| skipped', [o.name for o in D if o.type == 'MESH' and o not in dmesh])
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()

# поверхность донора в мире (поза покоя); отдельно — перчатки: по ним совмещаем (у агентов CS2 руки в одной позе на одних костях)
GL = lambda n: 'glove' in (n or '').lower()
dv, dt, dgt = [], [], []
for o in dmesh:
    e = o.evaluated_get(dg); me = e.to_mesh(); mw = o.matrix_world
    mats = [x.material.name if x.material else '' for x in o.material_slots]
    base = len(dv); dv += [mw @ v.co for v in me.vertices]
    me.calc_loop_triangles()
    for lt in me.loop_triangles:
        tri = tuple(base + i for i in lt.vertices); dt.append(tri)
        if mats and GL(mats[lt.material_index]): dgt.append(tri)
    e.to_mesh_clear()
bvh = BVHTree.FromPolygons(dv, dt); gbvh = BVHTree.FromPolygons(dv, dgt)
dgv = [dv[i] for i in {i for tri in dgt for i in tri}]

S = imp(SRC)
sm = [o for o in S if o.type == 'MESH']
for o in sm:   # запечь мировые повороты/масштабы в вершины
    mw = o.matrix_world.copy(); o.parent = None; o.data.transform(mw); o.matrix_world = Matrix.Identity(4)
if len(sm) > 1:
    with bpy.context.temp_override(active_object=sm[0], object=sm[0], selected_objects=sm, selected_editable_objects=sm):
        bpy.ops.object.join()
so = sm[0]
for o in S:
    if o is not so and o.name in bpy.data.objects: bpy.data.objects.remove(o)
sv = [v.co.copy() for v in so.data.vertices]


def box(vs):
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi


smats = [x.material.name if x.material else '' for x in so.material_slots]
sgv = [sv[i] for i in {i for p in so.data.polygons if smats and GL(smats[p.material_index]) for i in p.vertices}]
if not dgv or not sgv: raise SystemExit('KROT-RIG: нет перчаток (материал *glove*) у донора или у сетки')
dlo, dhi = box(dgv); slo, shi = box(sgv)
s = (dhi.x - dlo.x) / (shi.x - slo.x)
t = (dlo + dhi) / 2 - s * (slo + shi) / 2
print('KROT-RIG glove span donor %.3f src %.3f | start scale %.4f shift %s' % (dhi.x - dlo.x, shi.x - slo.x, s, tuple(round(x, 4) for x in t)))
random.seed(1)
samp = random.sample(sgv, min(3000, len(sgv))); body = random.sample(sv, min(4000, len(sv)))


def cost(s, t, pts=None, tree=None):   # среднее расстояние до поверхности по 90% ближайших точек
    d = sorted((tree or gbvh).find_nearest(s * v + t)[3] or 1 for v in (pts or samp))
    k = int(len(d) * .9); return sum(d[:k]) / k


best = cost(s, t); print('KROT-RIG start: gloves %.4f m, body %.4f m' % (best, cost(s, t, body, bvh)))
for step in (.01, .005, .0025, .001):
    moved = True
    while moved:
        moved = False
        for ds, dx in [(step * .5, None), (-step * .5, None)] + [(0, Vector(a) * step) for a in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]:
            s2 = s * (1 + ds) if dx is None else s; t2 = t + dx if dx is not None else t
            c = cost(s2, t2)
            if c < best - 1e-6: best, s, t, moved = c, s2, t2, True
print('KROT-RIG final scale %.4f shift %s: gloves %.4f m, body %.4f m' % (s, tuple(round(x, 4) for x in t), best, cost(s, t, body, bvh)))
print('KROT-RIG height donor %.3f..%.3f src %.3f..%.3f' % (min(v.z for v in dv), max(v.z for v in dv), min(s * v.z + t.z for v in sv), max(s * v.z + t.z for v in sv)))
so.data.transform(Matrix.Translation(t) @ Matrix.Scale(s, 4))

# перенос весов: копии сеток донора → одна (группы вершин объединяются по имени)
cp = []
for o in dmesh:
    c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c); cp.append(c)
with bpy.context.temp_override(active_object=cp[0], object=cp[0], selected_objects=cp, selected_editable_objects=cp):
    if len(cp) > 1: bpy.ops.object.join()
src = cp[0]
md = so.modifiers.new('dt', 'DATA_TRANSFER')
md.object = src; md.use_object_transform = True; md.use_vert_data = True; md.data_types_verts = {'VGROUP_WEIGHTS'}
md.vert_mapping = 'POLYINTERP_NEAREST'; md.layers_vgroup_select_src = 'ALL'; md.layers_vgroup_select_dst = 'NAME'
bpy.context.view_layer.update()
with bpy.context.temp_override(active_object=so, object=so, selected_objects=[so], selected_editable_objects=[so]):
    bpy.ops.object.datalayout_transfer(modifier='dt')
    bpy.ops.object.modifier_apply(modifier='dt')
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
bones = {b.name for b in arm.data.bones}
for g in list(so.vertex_groups):
    if g.name not in bones: so.vertex_groups.remove(g)

# проверка: вершины без веса, главная кость каждого материала
gi = {g.index: g.name for g in so.vertex_groups}
zero = 0; per = {}
for p in so.data.polygons:
    mat = so.material_slots[p.material_index].material.name if so.material_slots else '-'
    for vi in p.vertices[:1]:
        v = so.data.vertices[vi]
        if not v.groups: zero += 1; continue
        g = max(v.groups, key=lambda x: x.weight); per.setdefault(mat, {}); per[mat][gi[g.group]] = per[mat].get(gi[g.group], 0) + 1
print('KROT-RIG verts', len(so.data.vertices), 'groups', len(so.vertex_groups), 'faces without weights', zero)
for m, d in per.items(): print('KROT-RIG  ', m, sorted(d.items(), key=lambda x: -x[1])[:4])

# на место сетки донора: тот же родитель и матрицы
ref = dmesh[0]
so.data.transform(ref.matrix_world.inverted())
so.parent = ref.parent; so.parent_type = ref.parent_type; so.matrix_parent_inverse = ref.matrix_parent_inverse.copy(); so.matrix_basis = ref.matrix_basis.copy()
am = so.modifiers.new('Armature', 'ARMATURE'); am.object = arm
for o in dmesh + [src]: bpy.data.objects.remove(o)
for o in list(bpy.data.objects):
    if o is not arm and o is not so and o.type in ('MESH', 'CAMERA', 'LIGHT'): bpy.data.objects.remove(o)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
arm.data.pose_position = 'POSE'
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=False, export_morph=False, export_skins=True, export_yup=True)
print('KROT-RIG wrote', OUT)

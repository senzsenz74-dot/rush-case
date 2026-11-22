# Монета-медаль пикема RUSH CASE · MAJOR 2026 (владелец 23.11: «монету, но качественную»).
# Запуск в фоне, не трогая открытый Blender:
#   blender.exe -b --factory-startup -P blender-coin/pickem_coin.py -- <выходной.png> [размер] [сэмплы]
# Монета лежит в плоскости XY лицом вверх (+Z), камера сверху с небольшим наклоном — видно толщину и рифлёный край.
import bpy, bmesh, math, sys, random
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'C:/tmp/coin.png'
RES = int(argv[1]) if len(argv) > 1 else 768
SAMPLES = int(argv[2]) if len(argv) > 2 else 96
FONT = 'C:/Windows/Fonts/bahnschrift.ttf'

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
random.seed(7)

# ---------- материалы ----------
def principled(name, base, metal=1.0, rough=0.2):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    return m, nt, b

GOLD = (1.0, 0.77, 0.32)
m_gold, _, _ = principled('Gold', GOLD, 1.0, 0.16)                 # рельеф, кант — полированное золото
m_edge, nt_e, b_e = principled('GoldEdge', (0.96, 0.72, 0.3), 1.0, 0.24)
# поле монеты: матовое золото с концентрической шлифовкой (кольца) — рельеф на его фоне блестит
m_field, nt_f, b_f = principled('Field', (0.6, 0.4, 0.13), 1.0, 0.52)
tc = nt_f.nodes.new('ShaderNodeTexCoord')
wave = nt_f.nodes.new('ShaderNodeTexWave'); wave.wave_type = 'RINGS'; wave.inputs['Scale'].default_value = 60; wave.inputs['Distortion'].default_value = 1.5
noise = nt_f.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 300
mixc = nt_f.nodes.new('ShaderNodeMix'); mixc.data_type = 'FLOAT'; mixc.inputs['Factor'].default_value = 0.35
bump = nt_f.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12; bump.inputs['Distance'].default_value = 0.002
nt_f.links.new(tc.outputs['Object'], wave.inputs['Vector'])
nt_f.links.new(tc.outputs['Object'], noise.inputs['Vector'])
nt_f.links.new(wave.outputs['Fac'], mixc.inputs['A'])
nt_f.links.new(noise.outputs['Fac'], mixc.inputs['B'])
nt_f.links.new(mixc.outputs['Result'], bump.inputs['Height'])
nt_f.links.new(bump.outputs['Normal'], b_f.inputs['Normal'])
# рифлёный край: полосы вдоль окружности через волны по углу (bump)
tc2 = nt_e.nodes.new('ShaderNodeTexCoord')
sep = nt_e.nodes.new('ShaderNodeSeparateXYZ')
at = nt_e.nodes.new('ShaderNodeMath'); at.operation = 'ARCTAN2'
mul = nt_e.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 90
sn = nt_e.nodes.new('ShaderNodeMath'); sn.operation = 'SINE'
bump2 = nt_e.nodes.new('ShaderNodeBump'); bump2.inputs['Strength'].default_value = 0.6; bump2.inputs['Distance'].default_value = 0.01
nt_e.links.new(tc2.outputs['Object'], sep.inputs[0])
nt_e.links.new(sep.outputs['Y'], at.inputs[0]); nt_e.links.new(sep.outputs['X'], at.inputs[1])
nt_e.links.new(at.outputs[0], mul.inputs[0]); nt_e.links.new(mul.outputs[0], sn.inputs[0])
nt_e.links.new(sn.outputs[0], bump2.inputs['Height'])
nt_e.links.new(bump2.outputs['Normal'], b_e.inputs['Normal'])

def link(o, mat):
    o.data.materials.clear(); o.data.materials.append(mat)
    for p in getattr(o.data, 'polygons', []): p.use_smooth = True
    return o

def smooth_mod(o, ang=40):
    try:
        o.modifiers.new('ws', 'WEIGHTED_NORMAL')
    except Exception:
        pass

H = 0.14          # толщина монеты
TOP = H / 2       # верхняя плоскость

# ---------- корпус ----------
bpy.ops.mesh.primitive_cylinder_add(vertices=192, radius=1.0, depth=H)
body = bpy.context.object; body.name = 'Body'
bv = body.modifiers.new('bv', 'BEVEL'); bv.width = 0.018; bv.segments = 4; bv.limit_method = 'ANGLE'
link(body, m_edge)
# поле (матовое) — тонкий диск чуть выше верха корпуса
bpy.ops.mesh.primitive_cylinder_add(vertices=192, radius=0.9, depth=0.004, location=(0, 0, TOP + 0.001))
link(bpy.context.object, m_field)

# ---------- кант: широкий округлый бортик + ряд бусин внутри ----------
bpy.ops.mesh.primitive_torus_add(major_radius=0.945, minor_radius=0.055, major_segments=192, minor_segments=24, location=(0, 0, TOP))
rim = bpy.context.object; rim.scale.z = 0.55; link(rim, m_gold)
bpy.ops.mesh.primitive_torus_add(major_radius=0.875, minor_radius=0.012, major_segments=192, minor_segments=10, location=(0, 0, TOP + 0.004))
link(bpy.context.object, m_gold)
N_BEAD = 72
for i in range(N_BEAD):
    a = i / N_BEAD * math.tau
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=0.011, location=(0.6 * math.cos(a), 0.6 * math.sin(a), TOP + 0.004))
    o = bpy.context.object; o.scale.z = 0.6; link(o, m_gold)

# ---------- надпись по кругу: каждая буква — отдельный объект (сверху — по часовой, снизу — слева направо, верхом к центру) ----------
FONT_B = 'C:/Windows/Fonts/segoeuib.ttf'
try:
    fnt = bpy.data.fonts.load(FONT_B)
except Exception:
    fnt = None
NARROW = {' ': 0.45, 'I': 0.45, '\u2019': 0.35, '\u2022': 0.6, '1': 0.75}
def ring_text(txt, r_base, size, top=True, step_deg=8.6):
    w = [NARROW.get(ch, 1.0) for ch in txt]
    total = sum(w) * step_deg
    acc = -total / 2
    for ch, k in zip(txt, w):
        mid_ang = acc + k * step_deg / 2; acc += k * step_deg
        if ch == ' ': continue
        if top:
            th = math.radians(90 - mid_ang); rot = th - math.pi / 2
        else:
            th = math.radians(270 + mid_ang); rot = th + math.pi / 2
        cu = bpy.data.curves.new('Ch', 'FONT'); cu.body = ch
        if fnt: cu.font = fnt
        cu.size = size; cu.extrude = 0.016; cu.bevel_depth = 0.003; cu.bevel_resolution = 2
        cu.align_x = 'CENTER'; cu.align_y = 'BOTTOM_BASELINE' if top else 'TOP'
        o = bpy.data.objects.new('Ch', cu); sc.collection.objects.link(o)
        o.location = (r_base * math.cos(th), r_base * math.sin(th), TOP + 0.013)
        o.rotation_euler.z = rot
        cu.materials.append(m_gold)

ring_text('PICK\u2019EM \u2022 RUSH CASE', 0.655, 0.15, top=True, step_deg=9.3)
ring_text('MAJOR \u2022 2026', 0.815, 0.15, top=False, step_deg=10.2)

# ---------- центр: кубок (тело вращения + ручки), сплющен в барельеф ----------
prof = [(0.0, 0.0), (0.16, 0.0), (0.17, 0.02), (0.12, 0.04), (0.06, 0.06), (0.045, 0.12), (0.04, 0.2), (0.05, 0.24),
        (0.09, 0.27), (0.17, 0.32), (0.21, 0.4), (0.22, 0.5), (0.215, 0.58), (0.235, 0.6), (0.2, 0.61), (0.0, 0.61)]
me = bpy.data.meshes.new('Cup'); bm = bmesh.new()
SEG = 64
rings = [[bm.verts.new((r * math.cos(i / SEG * math.tau), r * math.sin(i / SEG * math.tau), z)) for i in range(SEG)] for (r, z) in prof]
for ra, rb in zip(rings, rings[1:]):
    for i in range(SEG):
        j = (i + 1) % SEG
        bm.faces.new((ra[i], ra[j], rb[j], rb[i]))
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.to_mesh(me); bm.free()
cup = bpy.data.objects.new('Cup', me); sc.collection.objects.link(cup)
parts = [cup]
for s in (-1, 1):   # ручки — кольца в плоскости оси кубка
    bpy.ops.mesh.primitive_torus_add(major_radius=0.095, minor_radius=0.024, major_segments=48, minor_segments=12, location=(s * 0.225, 0, 0.44), rotation=(math.pi / 2, 0, 0))
    parts.append(bpy.context.object)
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = cup
bpy.ops.object.join()
for o in parts[1:]:
    pass
cup = bpy.context.object
cup.data.transform(cup.matrix_world)       # ручки уже в координатах кубка
cup.matrix_world = Matrix.Identity(4)
M = Matrix.Translation((0, -0.33, TOP + 0.002)) @ Matrix.Diagonal((1, 1, 0.24, 1)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
cup.data.transform(M)
link(cup, m_gold)
cup.modifiers.new('sub', 'SUBSURF').levels = 1

# звезда над кубком
def star(cx, cy, R, r, depth):
    me = bpy.data.meshes.new('Star'); bm = bmesh.new()
    top = bm.verts.new((cx, cy, TOP + 0.003 + depth))
    ring = [bm.verts.new((cx + (R if i % 2 == 0 else r) * math.cos(math.pi / 2 + i * math.pi / 5),
                          cy + (R if i % 2 == 0 else r) * math.sin(math.pi / 2 + i * math.pi / 5), TOP + 0.003)) for i in range(10)]
    for i in range(10): bm.faces.new((top, ring[i], ring[(i + 1) % 10]))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('Star', me); sc.collection.objects.link(o)
    o.data.materials.append(m_gold)
    return o
star(0, 0.38, 0.085, 0.036, 0.035)

# ---------- лавровые ветви по бокам кубка ----------
def leaf(x, y, ang, L, W):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1, location=(x, y, TOP + 0.006))
    o = bpy.context.object
    o.scale = (L / 2, W / 2, 0.013)
    o.rotation_euler.z = ang
    link(o, m_gold)
    return o

CY0, R = -0.06, 0.44
for s in (-1, 1):
    pts = []
    n = 10
    for i in range(n):
        t = i / (n - 1)
        a = math.radians(-105 + t * 150)
        px, py = s * R * math.cos(a), CY0 + R * math.sin(a)
        pts.append((px, py))
        tx, ty = -s * math.sin(a) * s * s, math.cos(a)        # касательная вверх по дуге
        tx = -math.sin(a) * s
        base = math.atan2(ty, tx)
        L, W = 0.1 - 0.035 * t, 0.038 - 0.012 * t
        for off in (0.62, -0.62):
            ang = base + off
            leaf(px + math.cos(ang) * L * 0.45, py + math.sin(ang) * L * 0.45, ang, L, W)
    # верхушка ветви — один лист по касательной
    a = math.radians(48)
    px, py = s * R * math.cos(a), CY0 + R * math.sin(a)
    tx, ty = -math.sin(a) * s, math.cos(a)
    base = math.atan2(ty, tx)
    leaf(px + math.cos(base) * 0.03, py + math.sin(base) * 0.03, base, 0.07, 0.026)
    # стебель
    cu = bpy.data.curves.new('Stem', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.007; cu.bevel_resolution = 3
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts): p.co = (x, y, TOP + 0.005, 1)
    so = bpy.data.objects.new('Stem', cu); sc.collection.objects.link(so); cu.materials.append(m_gold)

# ---------- свет и окружение ----------
world = bpy.data.worlds.new('W'); sc.world = world; world.use_nodes = True
wn = world.node_tree; bg = next(n for n in wn.nodes if n.type == 'BACKGROUND')
grad = wn.nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'LINEAR'
tcw = wn.nodes.new('ShaderNodeTexCoord'); mp = wn.nodes.new('ShaderNodeMapping')
mp.inputs['Rotation'].default_value = (0, math.pi / 2, 0)
ramp = wn.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (0.02, 0.018, 0.016, 1)
ramp.color_ramp.elements[1].color = (0.75, 0.62, 0.45, 1)
wn.links.new(tcw.outputs['Generated'], mp.inputs['Vector'])
wn.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
wn.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
wn.links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 0.45

def area(name, loc, energy, size, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
    d = Vector((0, 0, 0)) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o

area('Key', (-2.6, -2.2, 4.2), 900, 2.6, (1.0, 0.93, 0.82))
area('Fill', (3.0, -1.0, 2.6), 260, 3.5, (0.85, 0.9, 1.0))
area('Rim', (0.5, 3.2, 1.6), 520, 2.0, (1.0, 0.9, 0.75))
area('Top', (0, 0, 5.0), 160, 5.0)

# ---------- камера ----------
cam_d = bpy.data.cameras.new('Cam'); cam_d.lens = 85
cam = bpy.data.objects.new('Cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
tilt = math.radians(22)
dist = 7.4
cam.location = (0, -dist * math.sin(tilt), dist * math.cos(tilt))
cam.rotation_euler = (tilt, 0, 0)
cam_d.sensor_fit = 'HORIZONTAL'; cam_d.sensor_width = 36
# монета ~2.04 по ширине → заполняем ~92% кадра
cam_d.lens = 36 * dist / 2.3

# ---------- рендер ----------
try:
    sc.render.engine = 'CYCLES'
except TypeError:
    pass
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.cycles.device = 'CPU'
sc.render.film_transparent = True
sc.render.resolution_x = RES; sc.render.resolution_y = RES
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
try:
    sc.view_settings.view_transform = 'Khronos PBR Neutral'
except Exception:
    pass
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('COIN OK', OUT)

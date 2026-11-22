# Монета-медаль пикема RUSH CASE · MAJOR 2026 — версия 2 (владелец 23.11: «крупный знак, без мелкого текста»).
# Золотой кант, тёмная эмаль в центре, на ней крупный золотой кубок, две звезды и «2026» — читается даже маленькой у аватарки.
# Запуск в фоне, не трогая открытый Blender:
#   blender.exe -b --factory-startup -P blender-coin/pickem_coin.py -- <выходной.png> [размер] [сэмплы]
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'C:/tmp/coin.png'
RES = int(argv[1]) if len(argv) > 1 else 768
SAMPLES = int(argv[2]) if len(argv) > 2 else 96
FONT = 'C:/Windows/Fonts/segoeuib.ttf'

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def principled(name, base, metal=1.0, rough=0.2):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    return m, nt, b

GOLD = (1.0, 0.74, 0.27)
m_gold, _, _ = principled('Gold', GOLD, 1.0, 0.14)
m_edge, nt_e, b_e = principled('GoldEdge', (0.96, 0.69, 0.25), 1.0, 0.22)
m_enamel, nt_en, b_en = principled('Enamel', (0.012, 0.022, 0.055), 0.0, 0.48)   # тёмно-синяя эмаль
for k in ('Coat Weight', 'Coat'):
    if k in b_en.inputs:
        b_en.inputs[k].default_value = 0.0; break
tcn = nt_en.nodes.new('ShaderNodeTexCoord'); nz = nt_en.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 180
bmp = nt_en.nodes.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value = 0.05
nt_en.links.new(tcn.outputs['Object'], nz.inputs['Vector']); nt_en.links.new(nz.outputs['Fac'], bmp.inputs['Height']); nt_en.links.new(bmp.outputs['Normal'], b_en.inputs['Normal'])
# рифлёный край
tc2 = nt_e.nodes.new('ShaderNodeTexCoord'); sep = nt_e.nodes.new('ShaderNodeSeparateXYZ')
at = nt_e.nodes.new('ShaderNodeMath'); at.operation = 'ARCTAN2'
mul = nt_e.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 90
sn = nt_e.nodes.new('ShaderNodeMath'); sn.operation = 'SINE'
bump2 = nt_e.nodes.new('ShaderNodeBump'); bump2.inputs['Strength'].default_value = 0.6; bump2.inputs['Distance'].default_value = 0.01
nt_e.links.new(tc2.outputs['Object'], sep.inputs[0]); nt_e.links.new(sep.outputs['Y'], at.inputs[0]); nt_e.links.new(sep.outputs['X'], at.inputs[1])
nt_e.links.new(at.outputs[0], mul.inputs[0]); nt_e.links.new(mul.outputs[0], sn.inputs[0]); nt_e.links.new(sn.outputs[0], bump2.inputs['Height'])
nt_e.links.new(bump2.outputs['Normal'], b_e.inputs['Normal'])

def link(o, mat, smooth=True):
    o.data.materials.clear(); o.data.materials.append(mat)
    for p in getattr(o.data, 'polygons', []): p.use_smooth = smooth
    return o

H = 0.14; TOP = H / 2
bpy.ops.mesh.primitive_cylinder_add(vertices=192, radius=1.0, depth=H)
body = bpy.context.object
bv = body.modifiers.new('bv', 'BEVEL'); bv.width = 0.018; bv.segments = 4; bv.limit_method = 'ANGLE'
link(body, m_edge)
bpy.ops.mesh.primitive_cylinder_add(vertices=192, radius=0.85, depth=0.006, location=(0, 0, TOP + 0.002))
link(bpy.context.object, m_enamel)
bpy.ops.mesh.primitive_torus_add(major_radius=0.925, minor_radius=0.085, major_segments=192, minor_segments=28, location=(0, 0, TOP))
rim = bpy.context.object; rim.scale.z = 0.5; link(rim, m_gold)
bpy.ops.mesh.primitive_torus_add(major_radius=0.80, minor_radius=0.014, major_segments=192, minor_segments=10, location=(0, 0, TOP + 0.006))
link(bpy.context.object, m_gold)

# кубок: тело вращения + ручки, сплющен в барельеф
prof = [(0.0, 0.0), (0.17, 0.0), (0.18, 0.025), (0.12, 0.045), (0.06, 0.065), (0.045, 0.12), (0.04, 0.2), (0.05, 0.24),
        (0.09, 0.27), (0.17, 0.32), (0.21, 0.4), (0.22, 0.5), (0.215, 0.58), (0.24, 0.6), (0.2, 0.615), (0.0, 0.615)]
me = bpy.data.meshes.new('Cup'); bm = bmesh.new(); SEG = 72
rings = [[bm.verts.new((r * math.cos(i / SEG * math.tau), r * math.sin(i / SEG * math.tau), z)) for i in range(SEG)] for (r, z) in prof]
for ra, rb in zip(rings, rings[1:]):
    for i in range(SEG):
        j = (i + 1) % SEG
        bm.faces.new((ra[i], ra[j], rb[j], rb[i]))
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.to_mesh(me); bm.free()
cup = bpy.data.objects.new('Cup', me); sc.collection.objects.link(cup)
parts = [cup]
for s in (-1, 1):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.095, minor_radius=0.026, major_segments=48, minor_segments=12, location=(s * 0.228, 0, 0.44), rotation=(math.pi / 2, 0, 0))
    parts.append(bpy.context.object)
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = cup
bpy.ops.object.join()
cup = bpy.context.object
K = 1.32
M = Matrix.Translation((0, -0.33, TOP + 0.004)) @ Matrix.Diagonal((K, K, 0.26 * K, 1)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
cup.data.transform(M)
link(cup, m_gold)
cup.modifiers.new('sub', 'SUBSURF').levels = 1

def star(cx, cy, R, r, depth):
    me = bpy.data.meshes.new('Star'); bm = bmesh.new()
    top = bm.verts.new((cx, cy, TOP + 0.005 + depth))
    ring = [bm.verts.new((cx + (R if i % 2 == 0 else r) * math.cos(math.pi / 2 + i * math.pi / 5),
                          cy + (R if i % 2 == 0 else r) * math.sin(math.pi / 2 + i * math.pi / 5), TOP + 0.005)) for i in range(10)]
    for i in range(10): bm.faces.new((top, ring[i], ring[(i + 1) % 10]))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('Star', me); sc.collection.objects.link(o); o.data.materials.append(m_gold)
    return o
star(-0.5, 0.2, 0.075, 0.032, 0.03)
star(0.5, 0.2, 0.075, 0.032, 0.03)

cu = bpy.data.curves.new('Y', 'FONT'); cu.body = '2026'
try:
    cu.font = bpy.data.fonts.load(FONT)
except Exception:
    pass
cu.size = 0.31; cu.extrude = 0.024; cu.bevel_depth = 0.006; cu.bevel_resolution = 3
cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.space_character = 1.05
t = bpy.data.objects.new('Year', cu); sc.collection.objects.link(t)
t.location = (0, -0.565, TOP + 0.03)
cu.materials.append(m_gold)

world = bpy.data.worlds.new('W'); sc.world = world; world.use_nodes = True
wn = world.node_tree; bg = next(n for n in wn.nodes if n.type == 'BACKGROUND')
grad = wn.nodes.new('ShaderNodeTexGradient'); tcw = wn.nodes.new('ShaderNodeTexCoord'); mp = wn.nodes.new('ShaderNodeMapping')
mp.inputs['Rotation'].default_value = (0, math.pi / 2, 0)
ramp = wn.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (0.02, 0.018, 0.016, 1); ramp.color_ramp.elements[1].color = (0.75, 0.62, 0.45, 1)
wn.links.new(tcw.outputs['Generated'], mp.inputs['Vector']); wn.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
wn.links.new(grad.outputs['Fac'], ramp.inputs['Fac']); wn.links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 0.45

def area(name, loc, energy, size, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
area('Key', (-2.6, -2.2, 4.2), 950, 2.6, (1.0, 0.93, 0.82))
area('Fill', (3.0, -1.0, 2.6), 300, 3.5, (0.85, 0.9, 1.0))
area('Rim', (0.5, 3.2, 1.6), 520, 2.0, (1.0, 0.9, 0.75))
area('Top', (0, 0, 5.0), 180, 5.0)

cam_d = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
tilt = math.radians(12); dist = 7.4
cam.location = (0, -dist * math.sin(tilt), dist * math.cos(tilt)); cam.rotation_euler = (tilt, 0, 0)
cam_d.sensor_fit = 'HORIZONTAL'; cam_d.sensor_width = 36; cam_d.lens = 36 * dist / 2.2

try:
    sc.render.engine = 'CYCLES'
except TypeError:
    pass
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
sc.render.film_transparent = True
sc.render.resolution_x = RES; sc.render.resolution_y = RES
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
try:
    sc.view_settings.view_transform = 'Khronos PBR Neutral'
except Exception:
    pass
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('COIN OK', OUT)

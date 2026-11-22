# Билет «Пропуск зрителя» пикема RUSH CASE · MAJOR 2026 (владелец 23.11: «билет как в CS2, картинкой»).
# Красная часть с крупным «2026» и надписями, тёмная — с логотипом сайта (assets/logo.webp, НЕ старый logo.png), между ними линия отрыва.
# Монету кладём поверх уже в 2D (tools/pickem-pass.js), чтобы её можно было перерисовать отдельно.
#   blender.exe -b --factory-startup -P blender-coin/pickem_ticket.py -- <выходной.png> assets/logo.webp [ширина] [сэмплы]
import bpy, bmesh, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0]; LOGO = argv[1]
RW = int(argv[2]) if len(argv) > 2 else 1200
SAMPLES = int(argv[3]) if len(argv) > 3 else 64
FONT = 'C:/Windows/Fonts/segoeuib.ttf'
FONT_C = 'C:/Windows/Fonts/bahnschrift.ttf'

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
W, HH, T = 2.4, 1.1, 0.025      # размер билета и толщина
SPLIT = 0.36                    # где кончается красная часть (по X, со скосом)

def mat_emit_mix(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m

# ---------- материал билета: красное слева (с полосками), светлое справа, граница со скосом ----------
m = bpy.data.materials.new('Ticket'); m.use_nodes = True
nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
b.inputs['Roughness'].default_value = 0.32
for k in ('Coat Weight', 'Coat'):
    if k in b.inputs: b.inputs[k].default_value = 0.35; break
tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(tc.outputs['Object'], sep.inputs[0])
# x + 0.22*y > SPLIT → светлая часть
my = nt.nodes.new('ShaderNodeMath'); my.operation = 'MULTIPLY'; my.inputs[1].default_value = 0.22
nt.links.new(sep.outputs['Y'], my.inputs[0])
ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'ADD'
nt.links.new(sep.outputs['X'], ad.inputs[0]); nt.links.new(my.outputs[0], ad.inputs[1])
gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = SPLIT
nt.links.new(ad.outputs[0], gt.inputs[0])
# красный: градиент по X + диагональные светлые полосы
wave = nt.nodes.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'DIAGONAL'
wave.inputs['Scale'].default_value = 7.0; wave.inputs['Distortion'].default_value = 0.0
nt.links.new(tc.outputs['Object'], wave.inputs['Vector'])
thr = nt.nodes.new('ShaderNodeMath'); thr.operation = 'GREATER_THAN'; thr.inputs[1].default_value = 0.93
nt.links.new(wave.outputs['Fac'], thr.inputs[0])
red = nt.nodes.new('ShaderNodeMix'); red.data_type = 'RGBA'
red.inputs['A'].default_value = (0.22, 0.008, 0.014, 1); red.inputs['B'].default_value = (0.5, 0.022, 0.035, 1)
gx = nt.nodes.new('ShaderNodeMapRange'); gx.inputs['From Min'].default_value = -1.2; gx.inputs['From Max'].default_value = 0.4
nt.links.new(sep.outputs['X'], gx.inputs['Value']); nt.links.new(gx.outputs['Result'], red.inputs['Factor'])
stripe = nt.nodes.new('ShaderNodeMix'); stripe.data_type = 'RGBA'
stripe.inputs['B'].default_value = (0.7, 0.09, 0.11, 1)
nt.links.new(red.outputs['Result'], stripe.inputs['A'])
sf = nt.nodes.new('ShaderNodeMath'); sf.operation = 'MULTIPLY'; sf.inputs[1].default_value = 0.35
nt.links.new(thr.outputs[0], sf.inputs[0]); nt.links.new(sf.outputs[0], stripe.inputs['Factor'])
fin = nt.nodes.new('ShaderNodeMix'); fin.data_type = 'RGBA'
fin.inputs['B'].default_value = (0.016, 0.018, 0.024, 1)   # правая часть тёмная: логотип сайта белый (assets/logo.webp)
nt.links.new(stripe.outputs['Result'], fin.inputs['A']); nt.links.new(gt.outputs[0], fin.inputs['Factor'])
nt.links.new(fin.outputs['Result'], b.inputs['Base Color'])

# ---------- сам билет: скруглённый прямоугольник с толщиной ----------
bpy.ops.mesh.primitive_plane_add(size=1)
tk = bpy.context.object; tk.scale = (W, HH, 1)
bpy.ops.object.transform_apply(scale=True)
bv = tk.modifiers.new('round', 'BEVEL'); bv.affect = 'VERTICES'; bv.width = 0.07; bv.segments = 8
so = tk.modifiers.new('thick', 'SOLIDIFY'); so.thickness = T; so.offset = -1
bv2 = tk.modifiers.new('edge', 'BEVEL'); bv2.width = 0.006; bv2.segments = 2; bv2.limit_method = 'ANGLE'
tk.data.materials.append(m)
for p in tk.data.polygons: p.use_smooth = True

Z = 0.0015   # надписи чуть над поверхностью
def text(s, x, y, size, color, font=FONT, align='LEFT', spacing=1.0, rot=0.0, extrude=0.0):
    cu = bpy.data.curves.new('T', 'FONT'); cu.body = s
    try: cu.font = bpy.data.fonts.load(font)
    except Exception: pass
    cu.size = size; cu.align_x = align; cu.align_y = 'CENTER'; cu.space_character = spacing; cu.extrude = extrude
    o = bpy.data.objects.new('T', cu); sc.collection.objects.link(o)
    o.location = (x, y, Z + extrude); o.rotation_euler.z = rot
    mt = bpy.data.materials.new('TM'); mt.use_nodes = True
    bb = next(n for n in mt.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bb.inputs['Base Color'].default_value = (*color, 1); bb.inputs['Roughness'].default_value = 0.4
    cu.materials.append(mt)
    return o

WHITE = (0.97, 0.95, 0.92); CREAM = (1.0, 0.83, 0.55)
text('ПРОПУСК ЗРИТЕЛЯ', -0.7, 0.37, 0.09, CREAM, FONT, spacing=1.12)
text('2026', -0.72, 0.07, 0.38, WHITE, FONT, spacing=0.98, extrude=0.004)
text('PICK’EM · MAJOR', -0.7, -0.3, 0.14, WHITE, FONT_C, spacing=1.04)

# линия отрыва: ряд маленьких «дырочек» по скосу
for i in range(17):
    t = -0.5 + i / 16
    y = t * (HH - 0.12)
    x = SPLIT - 0.22 * y
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.012, depth=0.004, location=(x, y, Z))
    o = bpy.context.object
    mh = bpy.data.materials.get('Hole') or bpy.data.materials.new('Hole')
    mh.use_nodes = True; next(n for n in mh.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.5, 0.52, 0.56, 1)
    o.data.materials.append(mh)

# логотип RUSH CASE на светлой части (картинка с прозрачностью)
img = bpy.data.images.load(LOGO)
ml = bpy.data.materials.new('Logo'); ml.use_nodes = True
nl = ml.node_tree; bl = next(n for n in nl.nodes if n.type == 'BSDF_PRINCIPLED')
ti = nl.nodes.new('ShaderNodeTexImage'); ti.image = img
nl.links.new(ti.outputs['Color'], bl.inputs['Base Color']); nl.links.new(ti.outputs['Alpha'], bl.inputs['Alpha'])
bl.inputs['Roughness'].default_value = 0.35
try: ml.blend_method = 'BLEND'
except Exception: pass
aspect = img.size[0] / img.size[1]
LW = 0.78
bpy.ops.mesh.primitive_plane_add(size=1, location=(0.8, 0.06, Z + 0.001))
lg = bpy.context.object; lg.scale = (LW, LW / aspect, 1); lg.data.materials.append(ml)
text('SINGAPORE · 2026', 0.8, -0.36, 0.075, (0.55, 0.58, 0.63), FONT_C, align='CENTER', spacing=1.25)

# ---------- свет, камера ----------
world = bpy.data.worlds.new('W'); sc.world = world; world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.35, 0.36, 0.4, 1); bg.inputs['Strength'].default_value = 0.45
def area(name, loc, energy, size, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
area('Key', (-2.5, -2.0, 4.0), 480, 3.0, (1.0, 0.96, 0.9))
area('Fill', (3.0, -1.5, 3.0), 180, 4.0, (0.9, 0.94, 1.0))

tk_all = [o for o in sc.objects if o.type in ('MESH', 'FONT')]
root = bpy.data.objects.new('Root', None); sc.collection.objects.link(root)
for o in tk_all:
    o.parent = root
root.rotation_euler = (math.radians(-8), math.radians(4), math.radians(-5))

cam_d = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -0.6, 7.0); cam.rotation_euler = ((Vector((0, 0, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler())
cam_d.lens = 36 * 7.0 / 2.75; cam_d.sensor_width = 36; cam_d.sensor_fit = 'HORIZONTAL'

try: sc.render.engine = 'CYCLES'
except TypeError: pass
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
sc.render.film_transparent = True
sc.render.resolution_x = RW; sc.render.resolution_y = int(RW * 0.56)
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
try: sc.view_settings.view_transform = 'Khronos PBR Neutral'
except Exception: pass
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('TICKET OK', OUT)

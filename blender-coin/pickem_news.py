# Картинка новости PIKEM для главного экрана (владелец 23.11: «билет и на фоне страница PIKEM под наклоном»).
# Страница пикема (снимок tools/pickem-shot.cjs) — плоскость под наклоном, чуть размыта глубиной резкости;
# спереди — билет с монетой (assets/pickem/pass.webp). Низ кадра оставляем темнее: там надпись карточки.
#   blender.exe -b --factory-startup -P blender-coin/pickem_news.py -- <выход.png> <снимок страницы.png> <pass.png> [сэмплы]
import bpy, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, PAGE, PASS = argv[0], argv[1], argv[2]
SAMPLES = int(argv[3]) if len(argv) > 3 else 64
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def img_plane(name, path, width, emit=0.0, rough=0.5):
    img = bpy.data.images.load(path)
    asp = img.size[1] / img.size[0]
    bpy.ops.mesh.primitive_plane_add(size=1)
    o = bpy.context.object; o.name = name; o.scale = (width, width * asp, 1)
    bpy.ops.object.transform_apply(scale=True)
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
    nt.links.new(t.outputs['Color'], b.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = rough
    if emit:
        nt.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = emit
    try: m.blend_method = 'BLEND'
    except Exception: pass
    o.data.materials.append(m)
    return o

# страница — большая, под наклоном
page = img_plane('Page', PAGE, 13.5, emit=0.5, rough=0.6)
page.location = (0.0, 3.6, 0.2)
page.rotation_euler = (math.radians(72), math.radians(-7), math.radians(22))   # стоит за билетом, откинута назад и повёрнута
# билет с монетой — спереди, чуть выше центра
tk = img_plane('Pass', PASS, 3.7, emit=0.12, rough=0.35)
tk.location = (0.0, 0.0, 0.85)
tk.rotation_euler = (math.radians(96), math.radians(-4), math.radians(-8))

world = bpy.data.worlds.new('W'); sc.world = world; world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.012, 0.014, 0.02, 1); bg.inputs['Strength'].default_value = 1.0
def area(name, loc, energy, size, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
area('Key', (-3.0, -4.5, 3.5), 700, 3.0, (1.0, 0.95, 0.88))
area('Fill', (3.5, -4.0, 1.5), 260, 3.0, (0.75, 0.88, 1.0))
area('Red', (-4.5, 1.5, 0.5), 260, 2.5, (1.0, 0.25, 0.2))

cam_d = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -7.0, 0.9)
cam.rotation_euler = ((Vector((0, 0, 0.35)) - cam.location).to_track_quat('-Z', 'Y').to_euler())
cam_d.lens = 40
cam_d.dof.use_dof = True; cam_d.dof.focus_object = tk; cam_d.dof.aperture_fstop = 1.6

try: sc.render.engine = 'CYCLES'
except TypeError: pass
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
sc.render.resolution_x = int(argv[4]) if len(argv) > 4 else 1440; sc.render.resolution_y = sc.render.resolution_x * 3 // 4
sc.render.image_settings.file_format = 'PNG'
try: sc.view_settings.view_transform = 'Khronos PBR Neutral'
except Exception: pass
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('NEWS OK', OUT)

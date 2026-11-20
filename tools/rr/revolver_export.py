# Револьвер для «Русской рулетки»: OBJ (мм, 6 деталей) → assets/rr/revolver.glb (метры; детали frame/drum/hammer/trigger)
import bpy, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SC = os.path.join(HERE, "src")                                   # исходники (не в git): tools/rr/src — см. tools/rr/README.md
ROOT = os.path.dirname(os.path.dirname(HERE))
src = os.path.join(SC, "rev-zip", "source", "rev_anim.obj.obj")
tex = os.path.join(SC, "rev-prep")
out = os.path.join(ROOT, "assets", "rr", "revolver.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=src, use_split_groups=True)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print("IMPORTED", [o.name for o in objs])
def find(pfx): return next(o for o in objs if o.name.lower().startswith(pfx))
drum, ham, trig = find("tumbler"), find("hammer"), find("trigger")
drum.name, ham.name, trig.name = "drum", "hammer", "trigger"
rest = [o for o in objs if o not in (drum, ham, trig)]
bpy.ops.object.select_all(action='DESELECT')
for o in rest: o.select_set(True)
bpy.context.view_layer.objects.active = rest[0]
bpy.ops.object.join(); frame = bpy.context.view_layer.objects.active; frame.name = "frame"
objs = [frame, drum, ham, trig]
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True); o.scale = (o.scale[0] * .001, o.scale[1] * .001, o.scale[2] * .001); o.location = (o.location[0] * .001, o.location[1] * .001, o.location[2] * .001)
bpy.context.view_layer.objects.active = frame
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mat = bpy.data.materials.new("revolver"); mat.use_nodes = True
nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
def img(name, color=True):
    im = bpy.data.images.load(os.path.join(tex, name))
    if not color: im.colorspace_settings.name = 'Non-Color'
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = im; return n
b = img("base.png"); nt.links.new(b.outputs['Color'], bsdf.inputs['Base Color'])
orm = img("orm.png", False); sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(orm.outputs['Color'], sep.inputs['Color'])
nt.links.new(sep.outputs[1], bsdf.inputs['Roughness']); nt.links.new(sep.outputs[2], bsdf.inputs['Metallic'])
nm = img("normal.png", False); nmap = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nm.outputs['Color'], nmap.inputs['Color']); nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
for o in objs:
    o.data.materials.clear(); o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = p.use_smooth
    xs = [v.co for v in o.data.vertices]
    print("PART", o.name, len(o.data.vertices), "min", [round(min(c[i] for c in xs), 4) for i in range(3)], "max", [round(max(c[i] for c in xs), 4) for i in range(3)])
kw = dict(filepath=out, export_format='GLB', export_yup=True, export_apply=True, use_selection=False)
for extra in (dict(export_image_format='WEBP', export_image_quality=86), dict(export_image_format='WEBP'), {}):
    try:
        bpy.ops.export_scene.gltf(**kw, **extra); print("EXPORTED", extra); break
    except TypeError as e:
        print("retry:", e)
print("SIZE", os.path.getsize(out))

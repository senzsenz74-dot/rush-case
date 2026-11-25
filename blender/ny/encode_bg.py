# Склейка кадров фона в видео встроенным FFmpeg Blender.
# Запуск: blender.exe -b --factory-startup -P encode_bg.py -- <папка_кадров> <выходной.mp4> <кадров>
import bpy, sys, os
a = sys.argv[sys.argv.index("--") + 1:]
src, out, n = a[0], a[1], int(a[2])
sc = bpy.context.scene
sc.render.fps = 30
sc.frame_start, sc.frame_end = 1, n
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 1080, 100
sc.sequence_editor_create()
files = sorted(f for f in os.listdir(src) if f.lower().endswith(".png"))[:n]
st = sc.sequence_editor.strips.new_image("bg", os.path.join(src, files[0]), 1, 1) if hasattr(sc.sequence_editor, "strips") else sc.sequence_editor.sequences.new_image("bg", os.path.join(src, files[0]), 1, 1)
for f in files[1:]:
    st.elements.append(f)
st.frame_final_duration = len(files)
sc.view_settings.view_transform = "Standard"  # кадры уже с цветокоррекцией
ims = sc.render.image_settings
ims.media_type = "VIDEO"
ims.file_format = "FFMPEG"
ff = sc.render.ffmpeg
ff.format = "MPEG4"
ff.codec = "H264"
ff.constant_rate_factor = "HIGH"
ff.ffmpeg_preset = "GOOD"
ff.gopsize = 30
sc.render.filepath = out
sc.render.use_file_extension = False
bpy.ops.render.render(animation=True)
print("видео:", out, len(files), "кадров")

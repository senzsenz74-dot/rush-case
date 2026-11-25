# Рендер кадров новогоднего фона Mirage — ТОЛЬКО по слову владельца («рендери»), сам не запускать.
# Запуск в фоне из папки ветки newyear (D:/Кейсы/.claude/worktrees/newyear), ~1 ч (EEVEE ~11 с/кадр, 300 кадров Full HD):
#   "D:/SteamLibrary/steamapps/common/Blender/blender.exe" -b blender/ny/location-mirage-ny.blend -P blender/ny/render_bg.py -a
# Кадры → blender/ny/renders/frames/0001.png … 0300.png (готовые кадры не перерисовываются — можно прервать и продолжить).
# Склейка: "D:/SteamLibrary/steamapps/common/Blender/blender.exe" -b --factory-startup -P blender/ny/encode_bg.py -- blender/ny/renders/frames assets/ny/bg-mirage.mp4 300
import bpy
sc = bpy.context.scene
sc.camera = bpy.data.objects['CAM_MAIN']          # камеру не менять: на ней 3D-кейс сайта
sc.frame_start, sc.frame_end = 1, 300              # снег и позёмка повторяются ровно за 300 кадров
r = sc.render
try:
    r.image_settings.media_type = 'IMAGE'          # Blender 5: сначала тип, потом формат
except Exception:
    pass
r.image_settings.file_format = 'PNG'
r.resolution_x, r.resolution_y, r.resolution_percentage = 1920, 1080, 100
r.filepath = '//renders/frames/'
r.use_overwrite = False
r.use_placeholder = True
print('NY Mirage: render', sc.frame_start, '-', sc.frame_end, '->', bpy.path.abspath(r.filepath))

# 3D-скины CS2 для сайта

Здесь лежат скрипты, которые собрали `assets/cs2case/3d/*.glb` (09.11.2026). Файлы игры в репозиторий не кладём:
их распаковывают в рабочую папку вне сайта (`C:\Users\Admin\tools\cs2x`).

## Чем
- Source 2 Viewer CLI 20.1 (`C:\Users\Admin\tools\s2v-cli\Source2Viewer-CLI.exe`), VPK игры:
  `D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\csgo\pak01_dir.vpk`.
- Blender 5.2 в фоне (`blender -b --factory-startup --python build_skin.py -- cfg/<id>.json`).

## Шаги
1. Название скина → внутреннее имя (paint kit): `resource/csgo_english.txt` (`PaintKit_<имя>_Tag`).
2. Из VPK выгрузить с `-d`:
   - модель `weapons/models/<оружие>/weapon_*.vmdl_c` с `--gltf_export_format gltf --gltf_export_materials --gltf_textures_adapt`;
   - материал скина `materials/models/weapons/customization/paints/vmats/<kit>.vmat_c` (вместе с рисунком);
   - «входы покраски» оружия `weapons/models/<оружие>/materials/composite_inputs/*_composite_inputs.vmat_c`.
3. `node items.js` пишет `cfg/<id>.json`, затем `build_skin.py` собирает `.glb`.

## Как собирается цвет (F_PAINT_STYLE из vmat)
- 6 (свой рисунок), 7 (патина), 8 (оружейник): рисунок нарисован под старую сетку CS:GO (`body_legacy`, в игре `use_legacy_model`),
  кладётся на всё оружие; у 8 металличность — в альфе рисунка; своя карта рельефа скина ставится вместо рельефа оружия.
- 2 (напыление), 4 (анодирование: Marble Fade, Tiger Tooth), 5 (аэрограф): каналы R/G/B рисунка выбирают цвета 1–3 поверх цвета 0.
  Если `g_bIgnoreWeaponSizeScale` = 0 — проекция сбоку по карте положения (`*_pos.exr`): главные оси формы, масштаб
  `pattern_scale · weapon_length / 32 / uv_scale`; красится только маска (канал R `*_masks.png`), сетка CS2 `body_hd`.
  Ножи — `body_legacy`, их «входы покраски» под неё.
- Подгонка вручную: `cfg/glock-moonrise.json` (сдвиг рисунка), `cfg/deagle-sputnik.json` (рисунок мельче).

На сайте: `C2_3D` и `c2X3D` в js/app.js; у M4A4 «перед» модели развёрнут (`C2_3D_NOFLIP`).

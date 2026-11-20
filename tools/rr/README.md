# «Русская рулетка»: сборка 3D и текстур для сайта

Всё запускается из папки проекта (`D:\Кейсы\.claude\worktrees\roulette`), пути внутри скриптов — относительные.

## Исходники — `tools/rr/src/` (84 МБ, НЕ в git: строка `tools/rr/src/` в `.git/info/exclude`)
| Папка | Откуда |
|---|---|
| `rev-zip/` | Загрузки владельца: `38-special-revolver.zip` (OBJ из 6 деталей + текстуры 2048) |
| `rev-prep/` | готовые текстуры револьвера 1024 (делает `prep_textures.mjs`) |
| `z-golden-glow-antique-three-arm-candelabra/` | Загрузки владельца: `golden-glow-antique-three-arm-candelabra.zip` (канделябр, GLB) |
| `z-snow-globe/` | Загрузки владельца: `snow-globe.zip` (снежный шар, FBX + текстуры) |
| `z-titanic-lamp/` | Загрузки владельца: `titanic-lamp.zip` (напольный канделябр «Titanic lamp», FBX + текстуры 4K; в сборке — 1024) |
| `z-stack-of-dollars/` | Загрузки владельца: `stack-of-dollars.zip` (внутри source/Dollar.zip → распакован в source/inner: FBX пачки из 100 купюр + texture/front, back) |
| `z-5000-rub/` | Загрузки владельца: `5000-rub.zip` (внутри Collada — Blender 5 её не читает; source/inner/rub5000.dae переименован; стороны вырезаны sharp-ом из 926897_big.jpg: rub_b.jpg — лицо, rub_a.jpg — оборот, 1024) |
| `ph/<id>/` | Poly Haven, CC0 (подпись не нужна), 1k: модели wooden_crate_01, wooden_crate_02, wine_barrel_01, wine_bottles_01; текстуры dark_wooden_planks, quatrefoil_jacquard_fabric, lacquered_cherry_wood, dark_wood, brown_leather (+ wooden_panels — уже не используется) |

Если папки нет (другой компьютер): распаковать три архива из Загрузок под этими именами; Poly Haven — скачать 1k с https://polyhaven.com (у моделей — glTF 1k, у текстур — Diffuse, nor_gl, arm) или через API `https://api.polyhaven.com/files/<id>`.

## Команды
```
node tools/rr/prep_textures.mjs
"D:/SteamLibrary/steamapps/common/Blender/blender.exe" -b --factory-startup --python tools/rr/revolver_export.py
"D:/SteamLibrary/steamapps/common/Blender/blender.exe" -b --factory-startup --python tools/rr/props_export.py
```
Blender — фоновый (не трогает открытое окно владельца). sharp — из `D:\Кейсы\promo-video\node_modules`.

## Что получается
- `assets/rr/revolver.glb` (0,77 МБ) — револьвер, узлы `frame`, `drum` (барабан, крутится по своей оси z), `hammer`, `trigger`. В коде оси модели переводятся матрицей (x модели — вниз, ствол — в −z).
- `assets/rr/props.glb` (2,4 МБ) — корневые узлы `crate1`, `crate2`, `barrel`, `bottle_alsace` / `_bordeaux` / `_burgundy` / `_champagne` (упрощены до 30%), `candelabra` (42 см, точки огоньков `flame_0..2`), `snowglobe` (17 см, стекло — материал `globe_glass`). Всё в метрах, низ на нуле, по центру.
- `assets/rr/<имя>_(diff|nor|arm).webp` — floor (пол), paper (обои), cherry (панели, потолок, кант стола), dwood (балки, отделка, полки), leather (бортик стола).

Проверено 20.11: все три команды дают те же файлы, что лежат в `assets/rr/`.

- 20.11: в props.glb добавлен `tlamp` (напольный канделябр 1,1 м, упрощён до 50%, лампы — материал `tlamp_glow`, на сайте заменяется светящимся); бутылки убраны (полок больше нет). Размер ~2,8 МБ. В коде — `props.glb?v=2`.
- 20.11: деньги в props.glb — `cash_usd`, `cash_rub` (пачки 15,8×6,8×1,3 см, одна сетка FBX с разными текстурами), `note_usd`, `note_rub` (одна купюра, собрана в скрипте). Размер ~3,1 МБ, в коде `?v=3`.

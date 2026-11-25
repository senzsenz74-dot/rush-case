// НОВЫЙ ГОД (владелец 26.11): склейка кадров tools/ny-drop.mjs в видео верхней новости «Новогодние гаранты» — как tools/news-drop-encode.cjs,
// но 4 падения (Яблоко → BLAST → MAJOR → Элита) по 99 кадров, растворения 0,2 с, в конце растворение в кадр 0 (видео по кругу без скачка).
// Удары (кадр 13 каждого падения): 0,43 / 3,53 / 6,63 / 9,73 с — NY_HITS в js/app.js. Удалить после ивента (ПЛАН_НОВЫЙ_ГОД.md).
// Запуск: node tools/ny-drop-encode.cjs <папка кадров>   → assets/ny/news-drop-ny.webm, .mp4, .webp (заставка)
const { execFileSync } = require('child_process'), path = require('path');
const FF = 'D:/Кейсы/promo-video/node_modules/ffmpeg-static/ffmpeg.exe', sharp = require('D:/Кейсы/promo-video/node_modules/sharp');
const dir = process.argv[2], A = path.join(__dirname, '..', 'assets', 'ny'), SEG = 99, FPS = 30, X = 0.2, N = 4;
const CROP = 'crop=720:510:282:168';   // как у обычного ролика: кейс в верхней половине карточки, снизу текст
const inp = i => ['-framerate', String(FPS), '-start_number', String(i * SEG), '-i', path.join(dir, 'd%04d.png')];
const L = SEG / FPS, g = [];
for (let i = 0; i < N; i++) g.push(`[${i}:v]trim=end_frame=${SEG},setpts=PTS-STARTPTS[s${i}]`);
g.push(`[${N}:v]trim=end_frame=12,setpts=PTS-STARTPTS[s${N}]`);
let prev = 's0';
for (let i = 1; i <= N; i++) { const o = i === N ? `${CROP},format=yuv420p[v]` : `[x${i}]`; g.push(`[${prev}][s${i}]xfade=transition=fade:duration=${X}:offset=${(i * (L - X)).toFixed(3)}${i === N ? ',' + o : o}`); prev = `x${i}`; }
const args = [...[0, 1, 2, 3].flatMap(inp), ...inp(0), '-filter_complex', g.join(';'), '-map', '[v]', '-an'];
execFileSync(FF, ['-y', '-loglevel', 'error', ...args, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', path.join(A, 'news-drop-ny.webm')], { stdio: 'inherit' });
execFileSync(FF, ['-y', '-loglevel', 'error', ...args, '-c:v', 'libx264', '-crf', '25', '-preset', 'slow', '-movflags', '+faststart', path.join(A, 'news-drop-ny.mp4')], { stdio: 'inherit' });
sharp(path.join(dir, 'd0074.png')).extract({ left: 282, top: 168, width: 720, height: 510 }).webp({ quality: 80 }).toFile(path.join(A, 'news-drop-ny.webp')).then(() => console.log('ok'));

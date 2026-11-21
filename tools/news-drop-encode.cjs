// Склейка кадров tools/news-drop.mjs в видео для верхней новости: 3 падения по 99 кадров, между ними растворение 0,2 с,
// в конце — растворение в пустой пол (кадр 0), чтобы видео зацикливалось без скачка. Кадр под карточку (≈1,41:1), кейс в верхней половине.
// Запуск: node tools/news-drop-encode.cjs <папка кадров>   → assets/news-drop.webm, assets/news-drop.mp4, assets/news-drop.webp (заставка)
const { execFileSync } = require('child_process'), path = require('path');
const FF = 'D:/Кейсы/promo-video/node_modules/ffmpeg-static/ffmpeg.exe', sharp = require('D:/Кейсы/promo-video/node_modules/sharp');
const dir = process.argv[2], A = path.join(__dirname, '..', 'assets'), SEG = 99, FPS = 30, X = 0.2;
const CROP = 'crop=720:510:282:168';   // из кадра 1280×720 (замер разницей кадров): кейс в покое x 492…793, y ~270…460 → в карточке по центру, в верхней половине (снизу текст)
const inp = i => ['-framerate', String(FPS), '-start_number', String(i * SEG), '-i', path.join(dir, 'd%04d.png')];
const L = SEG / FPS;
const graph = [
  `[0:v]trim=end_frame=${SEG},setpts=PTS-STARTPTS[a]`, `[1:v]trim=end_frame=${SEG},setpts=PTS-STARTPTS[b]`, `[2:v]trim=end_frame=${SEG},setpts=PTS-STARTPTS[c]`,
  `[3:v]trim=end_frame=12,setpts=PTS-STARTPTS[d]`,
  `[a][b]xfade=transition=fade:duration=${X}:offset=${(L - X).toFixed(3)}[ab]`,
  `[ab][c]xfade=transition=fade:duration=${X}:offset=${(2 * L - 2 * X).toFixed(3)}[abc]`,
  `[abc][d]xfade=transition=fade:duration=${X}:offset=${(3 * L - 3 * X).toFixed(3)},${CROP},format=yuv420p[v]`,
].join(';');
const args = [...inp(0), ...inp(1), ...inp(2), '-framerate', String(FPS), '-start_number', '0', '-i', path.join(dir, 'd%04d.png'), '-filter_complex', graph, '-map', '[v]', '-an'];
execFileSync(FF, ['-y', ...args, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', path.join(A, 'news-drop.webm')], { stdio: 'inherit' });
execFileSync(FF, ['-y', ...args, '-c:v', 'libx264', '-crf', '25', '-preset', 'slow', '-movflags', '+faststart', path.join(A, 'news-drop.mp4')], { stdio: 'inherit' });
sharp(path.join(dir, 'd0074.png')).extract({ left: 282, top: 168, width: 720, height: 510 }).webp({ quality: 80 }).toFile(path.join(A, 'news-drop.webp')).then(() => console.log('ok'));

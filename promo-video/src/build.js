// Сборка ролика: кадры .frames/final + assets/sfx.wav → output/RUSH_CASE_vertical_18s.mp4 (H.264, yuv420p, Rec.709, AAC 48 кГц, faststart),
// плюс превью (poster) и субтитры. Полный цикл: node src/build.js all  (съёмка → композиция → звук → видео)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static'), sharp = require('sharp');
const C = require('./config');

const run = (f, args = []) => execFileSync(process.execPath, [path.join(__dirname, f), ...args], { stdio: 'inherit' });
if (process.argv[2] === 'all') { run('capture.js'); run('compose.js'); run('audio.js'); }

fs.mkdirSync(C.OUT, { recursive: true });
const mp4 = path.join(C.OUT, 'RUSH_CASE_vertical_18s.mp4');
execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', String(C.FPS), '-i', path.join(C.FRAMES, 'final', '%04d.png'),
  '-i', path.join(C.ROOT, 'assets', 'sfx.wav'),
  '-map', '0:v', '-map', '1:a', '-t', String(C.DURATION),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
  '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
  '-r', String(C.FPS), '-g', String(C.FPS),
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
  '-movflags', '+faststart', mp4], { stdio: 'inherit' });

// превью: кадр финала (логотип + адрес)
const posterFrame = Math.round((C.SCENES.cta[0] + 1.6) * C.FPS);
sharp(path.join(C.FRAMES, 'final', String(posterFrame).padStart(4, '0') + '.png')).png().toFile(path.join(C.OUT, 'RUSH_CASE_poster.png'));

// субтитры: подписи сцен (тексты на экране) по таймингу
const ts = s => { const ms = Math.round(s * 1000), h = Math.floor(ms / 36e5), m = Math.floor(ms / 6e4) % 60, se = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(se).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
const subs = [[C.SCENES.hook[0] + 1.15, C.SCENES.hook[1], 'Готов к открытию?'],
  ...Object.entries(C.CAPTIONS).map(([k, t]) => [C.SCENES[k][0] + .15, C.SCENES[k][1], t.replace('|', ' — ')]),
  [C.SCENES.cta[0] + .4, C.DURATION, C.CTA.title.replace(/\|/g, ' ') + '\n' + C.CTA.url]];
fs.writeFileSync(path.join(C.OUT, 'RUSH_CASE_subtitles.srt'), subs.map(([a, b, t], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${t}\n`).join('\n'));
console.log('готово:', mp4);

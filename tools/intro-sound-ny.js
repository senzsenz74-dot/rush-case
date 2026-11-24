/* Новогодний звук заставки (ивент до 19.01.2027, владелец 25.11): обычный assets/intro.mp3 (tools/intro-sound.js) + бубенцы владельца.
   Источник бубенцов — assets/ny/_src/zvon-bubencov.mp3 (файл владельца «zvon-bubencov.mp3», 17,4 с, ровная «упряжка» ~ раз в 0,6 с; не в git).
   Партитура по кадрам заставки (как в intro-sound.js):
   - 0,93 с — корона влетает: звонкая встряска бубенцов (кусок 7,50–8,10 с записи, пик 7,64) прямо на удар;
   - 1,0–5,9 с — тихий звон бубенцов под гудением (кусок записи 1,0–5,9, без низа — не спорит с гулом);
   - 5,87 с — финальный удар с осколками: самая звонкая встряска (12,70–14,10, пик 12,84) с эхом, хвост на открытие сайта.
   Запуск: node tools/intro-sound-ny.js  →  assets/intro-ny.mp3  (ffmpeg — ../promo-video/node_modules/ffmpeg-static основной папки) */
'use strict';
const path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const ff = process.argv[2] || 'D:/Кейсы/promo-video/node_modules/ffmpeg-static/ffmpeg.exe';
const base = path.join(root, 'assets', 'intro.mp3'), bells = path.join(root, 'assets', 'ny', '_src', 'zvon-bubencov.mp3'), out = path.join(root, 'assets', 'intro-ny.mp3');
const PEAK = 0.14; // от начала куска до пика встряски, с
const cut = (a, b) => `[1]atrim=${a}:${b},asetpts=PTS-STARTPTS,aresample=48000`;
const ms = t => Math.round(t * 1000);
const fc = [
  `${cut(1.0, 5.9)},highpass=f=900,volume=0.32,afade=t=in:st=0:d=0.5,afade=t=out:st=4.3:d=0.6,adelay=${ms(1.0)}|${ms(1.0)}[bed]`,
  `${cut(7.50, 8.10)},volume=0.85,afade=t=out:st=0.4:d=0.2,adelay=${ms(0.933 - PEAK)}|${ms(0.933 - PEAK)}[a]`,
  `${cut(12.70, 14.10)},volume=1.0,aecho=0.8:0.6:120|260:0.35|0.22,afade=t=out:st=1.0:d=0.4,adelay=${ms(5.867 - PEAK)}|${ms(5.867 - PEAK)}[b]`,
  `[0]aresample=48000[base]`,
  `[base][bed][a][b]amix=inputs=4:normalize=0:duration=first,alimiter=limit=0.89[o]`,
].join(';');
execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', base, '-i', bells, '-filter_complex', fc, '-map', '[o]', '-c:a', 'libmp3lame', '-b:a', '160k', '-ar', '48000', out]);
console.log('готово:', path.relative(root, out));

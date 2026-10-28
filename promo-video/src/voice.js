// Озвучка диктора по script.md: нейросетевой голос Microsoft Edge (ru-RU), каждая реплика — в своё окно монтажа.
// Длиннее окна — ускоряется (atempo до 1,25). Итог:
//   output/RUSH_CASE_voice.mp3          — только голос, 40,6 с
//   output/RUSH_CASE_voice_sfx.mp3      — голос + звуковые эффекты ролика (эффекты приглушаются под голосом)
//   output/RUSH_CASE_16x9_voice.mp4     — ролик с голосом и эффектами
// Запуск: node src/voice.js [голос]   (по умолчанию ru-RU-DmitryNeural; женский — ru-RU-SvetlanaNeural)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const ffmpeg = require('ffmpeg-static'), C = require('./config');
const VOICE = process.argv[2] || 'ru-RU-DmitryNeural', DIR = path.join(C.FRAMES, 'voice'), DUR = C.DURATION;
// [начало, конец окна, текст, скорость речи]
const LINES = [
  [0.05, 1.8, 'Хочешь нож? Открывай.', '+22%'],
  [1.9, 3.75, 'Больше тридцати кейсов — от пятнадцати рублей.', '+30%'],
  [3.9, 6.8, 'Жми «Открыть» — и смотри, как крутится…', '+0%'],
  [7.3, 8.95, 'Карамбит! Вот это дроп!', '+28%'],
  [9.1, 11.9, 'Мало? Кидай в апгрейд — и забирай Драгон Лор.', '+25%'],
  [12.2, 18.3, 'Лишние скины — в контракт. Пара росчерков — и вместо пяти слабых один сильный.', '+5%'],
  [18.6, 20.4, 'Вывод в Стим — за минуты.', '+5%'],
  [20.6, 23.6, 'И каждый день — бесплатный барабан с бонусом на баланс.', '+12%'],
  [23.9, 26.6, 'Собери свою пятёрку…', '+0%'],
  [26.9, 29.0, 'кинь ссылку друзьям…', '+0%'],
  [29.3, 32.4, 'и залетай в турниры по кэ-эс два.', '+5%'],
  [32.7, 35.4, 'Победили — забрали приз. Всё честно.', '+20%'],
  [35.65, 40.45, 'Раш Кейс! Промокод Велком — плюс пятьдесят. И сотка за регистрацию!', '+22%'],
];
const ff = args => execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const dur = f => { try { execFileSync(ffmpeg, ['-hide_banner', '-i', f], { stdio: 'pipe' }); } catch (e) { const m = String(e.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; } return 0; };
(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  let agent; const px = process.env.HTTPS_PROXY || process.env.https_proxy; if (px && process.env.TTS_PROXY) { const { HttpsProxyAgent } = require('https-proxy-agent'); agent = new HttpsProxyAgent(px); }
  // сервис иногда обрывает поток — новая попытка через новое соединение
  const synth = async (dir, text, rate) => {
    for (let k = 1; k <= 15; k++) {
      const tts = new MsEdgeTTS(agent ? { agent } : undefined);
      try { await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3); const out = await tts.toFile(dir, text, { rate }); tts.close(); return out.audioFilePath; }
      catch (e) { tts.close(); if (k === 15) throw e; await new Promise(r => setTimeout(r, 1500 * k)); }
    }
  };
  const parts = [];
  for (let i = 0; i < LINES.length; i++) {
    const [a, b, text, rate] = LINES[i], raw = path.join(DIR, `l${i}.mp3`), wav = path.join(DIR, `l${i}.wav`);
    const key = VOICE + '|' + rate + '|' + text, kf = raw + '.key'; // готовая реплика — из кэша
    if (!(fs.existsSync(raw) && fs.existsSync(kf) && fs.readFileSync(kf, 'utf8') === key)) { fs.mkdirSync(path.join(DIR, 'r' + i), { recursive: true }); fs.copyFileSync(await synth(path.join(DIR, 'r' + i), text, rate), raw); fs.writeFileSync(kf, key); }
    // обрезать тишину по краям, при необходимости ускорить под окно
    ff(['-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', '-ar', '48000', '-ac', '2', path.join(DIR, `t${i}.wav`)]);
    const d = dur(path.join(DIR, `t${i}.wav`)), win = b - a, tempo = Math.min(1.25, Math.max(1, d / win));
    ff(['-i', path.join(DIR, `t${i}.wav`), '-af', `atempo=${tempo.toFixed(3)}`, wav]);
    const d2 = dur(wav);
    console.log(`${a.toFixed(1).padStart(5)}–${b.toFixed(1).padEnd(5)} ${d.toFixed(2)} с → ${d2.toFixed(2)} с${tempo > 1 ? ` (×${tempo.toFixed(2)})` : ''}${d2 > win + .05 ? '  ⚠ длиннее окна' : ''}  ${text}`);
    parts.push({ wav, at: a });
  }

  // сборка дорожки голоса
  const ins = parts.flatMap(p => ['-i', p.wav]);
  const fc = parts.map((p, i) => `[${i}]adelay=${Math.round(p.at * 1000)}|${Math.round(p.at * 1000)}[v${i}]`).join(';') + ';' + parts.map((_, i) => `[v${i}]`).join('') + `amix=inputs=${parts.length}:normalize=0,apad,atrim=0:${DUR},acompressor=threshold=-18dB:ratio=3:attack=5:release=120,loudnorm=I=-16:TP=-1.5:LRA=7[out]`;
  const voice = path.join(C.FRAMES, 'voice.wav');
  ff([...ins, '-filter_complex', fc, '-map', '[out]', '-ar', '48000', voice]);
  ff(['-i', voice, '-codec:a', 'libmp3lame', '-b:a', '256k', path.join(C.OUT, 'RUSH_CASE_voice.mp3')]);
  // голос + эффекты: эффекты приглушаются под голосом (sidechain)
  const sfx = path.join(C.ROOT, 'assets', 'sfx.wav'), mix = path.join(C.FRAMES, 'voice_sfx.wav');
  ff(['-i', voice, '-i', sfx, '-filter_complex', '[0]asplit=2[v][sc];[1]volume=0.8[fx];[fx][sc]sidechaincompress=threshold=0.04:ratio=4:attack=10:release=250[duck];[duck][v]amix=inputs=2:normalize=0,alimiter=limit=0.89[out]', '-map', '[out]', '-ar', '48000', mix]);
  ff(['-i', mix, '-codec:a', 'libmp3lame', '-b:a', '256k', path.join(C.OUT, 'RUSH_CASE_voice_sfx.mp3')]);
  // ролик с голосом
  ff(['-i', path.join(C.OUT, 'RUSH_CASE_16x9.mp4'), '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', path.join(C.OUT, 'RUSH_CASE_16x9_voice.mp4')]);
  console.log('готово: output/RUSH_CASE_voice.mp3, RUSH_CASE_voice_sfx.mp3, RUSH_CASE_16x9_voice.mp4 —', VOICE);
})().catch(e => { console.error(e); process.exit(1); });

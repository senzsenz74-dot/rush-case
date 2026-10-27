// RUSH CASE промо: общие настройки ролика (тайминг, тексты, параметры съёмки)
const path = require('path');
const ROOT = path.join(__dirname, '..');
module.exports = {
  ROOT,
  SITE: path.join(ROOT, '..'),                 // корень сайта (код берётся отсюда, сайт не меняется)
  FRAMES: path.join(ROOT, '.frames'),          // промежуточные кадры (в .gitignore)
  OUT: path.join(ROOT, 'output'),
  CHROME: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  PORT: 5191,
  FPS: 30,
  W: 1080, H: 1920,
  DURATION: 20,
  // сцены итогового ролика: [начало, конец] в секундах
  SCENES: {
    hook: [0, 1.8],
    catalog: [1.8, 3.6],
    open: [3.6, 10.2],
    upgrade: [10.2, 11.8],
    contract: [11.8, 13.3],
    withdraw: [13.3, 15.3],
    tournaments: [15.3, 16.7],
    cta: [16.7, 20],
  },
  // подписи (без голоса ролик смотрят без звука — короткие крупные надписи)
  CAPTIONS: {
    catalog: 'Выбирай кейс',
    open: 'Лови момент дропа',
    upgrade: 'Апгрейды',
    contract: 'Контракты',
    withdraw: 'Вывод в Steam|максимально быстро', // ⚠ публиковать только после запуска реального вывода; подставить фактическое время
    tournaments: 'Турниры CS2',
  },
  CTA: { title: 'Перейти на сайт|и открыть|первый кейс', url: 'senzsenz74-dot.github.io/rush-case/' },
  CASE_ID: 'orange',            // кейс для открытия
  DROP_SEED: 7,                 // зерно для выпадения по реальным шансам кейса (не подбирается вручную)
};

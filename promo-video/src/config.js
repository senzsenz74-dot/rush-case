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
  W: 1920, H: 1080,
  DURATION: 40.6,
  // сцены итогового ролика: [начало, конец] в секундах
  SCENES: {
    hook: [0, 1.8],
    catalog: [1.8, 3.8],
    open: [3.8, 9.0],
    upgrade: [9.0, 12.0],
    contract: [12.0, 18.5],
    withdraw: [18.5, 20.5],
    daily: [20.5, 23.8],
    teamCreate: [23.8, 26.8],
    teamJoin: [26.8, 29.2],
    tourReg: [29.2, 32.6],
    winner: [32.6, 35.6],
    cta: [35.6, 40.6],
  },
  OPEN_SPEED: 1.5, // прокрутка кейса быстрее (до результата), результат — в обычной скорости
  // подписи (короткие, крупные — ролик часто смотрят без звука)
  CAPTIONS: {
    catalog: 'Выбирай кейс',
    open: 'Лови момент дропа',
    upgrade: 'Апгрейд до легенды',
    contract: 'Контракты',
    withdraw: 'Вывод в Steam — максимально быстро', // ⚠ публиковать только после запуска реального вывода; подставить фактическое время
    daily: 'Бонус каждый день',
    teamCreate: 'Собери команду',
    teamJoin: 'Позови тиммейтов',
    tourReg: 'Турниры CS2',
  },
  WINNER: { title: 'RUSH Cup #1', team: 'Rush Five', tag: 'RUSH', note: 'Приз отправлен в инвентарь победителей' },
  CTA: { title: 'Перейти на сайт|и открыть первый кейс', promo: 'WELCOME', promoText: '+50 ₽ на баланс', reg: '+100 ₽', regText: 'при регистрации' },
  CASE_ID: 'karambit',          // кейс для открытия
  DROP_NAME: '★ StatTrak™ Karambit | Fade (Factory New)', // что выпадает (предмет из состава кейса)
  UPG_STAKE: '★ Нож-бабочка | Градиент',                  // ставка в апгрейде
  UPG_TARGET: 'AWP | История о драконе (Прямо с завода)',  // цель апгрейда (и приз турнира на плашке)
  DAILY_WIN: 250,                                         // выигрыш на барабане ежедневного бонуса
  DROP_SEED: 7,                 // зерно для выпадения по реальным шансам кейса (не подбирается вручную)
};

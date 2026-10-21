/* =========================================================
   RUSH CASE — фронтенд-прототип.
   Все данные (баланс, инвентарь, аккаунты) живут в localStorage —
   сервер не нужен, при подключении бэкенда заменяются вызовы API.
   ========================================================= */
(() => {
'use strict';

/* ---------- utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('ru-RU');
const money = n => `${fmt(n)} ₽`;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = v => { const x = v * 100; return (x >= 1 ? x.toFixed(2) : x >= .01 ? x.toFixed(3) : x.toFixed(4)).replace('.', ',') + '%'; };
const CDN = 'https://community.cloudflare.steamstatic.com/economy/image/';
/* картинки скинов лежат локально: assets/skins/<k>-m.webp (256×192) и -l.webp (512×384); Steam — запасной вариант */
const imgUrl = (s, size = 'm') => `assets/skins/${s.k}-${size === 'l' ? 'l' : 'm'}.webp`;
const pad = n => String(n).padStart(2, '0');

/* ---------- icons ---------- */
const sv = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${p}</svg>`;
const ic = {
  box: sv('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  up: sv('<circle cx="12" cy="12" r="9"/><path d="M12 16V8M8.5 11.5L12 8l3.5 3.5"/>'),
  swap: sv('<path d="M7 4v13M7 17l-3-3M7 17l3-3M17 20V7M17 7l-3 3M17 7l3 3"/>'),
  gift: sv('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13M12 8S10.5 3 7.5 4 9 8 12 8zM12 8s1.5-5 4.5-4S15 8 12 8z"/>'),
  help: sv('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17.5v.01"/>'),
  wallet: sv('<path d="M20 7H6a2 2 0 0 1 0-4h12v4"/><path d="M4 5v14a2 2 0 0 0 2 2h14V7"/><circle cx="16" cy="14" r="1.5"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>', 'stroke-width="3"'),
  sound: sv('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  mute: sv('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>'),
  close: sv('<path d="M6 6l12 12M18 6L6 18"/>', 'stroke-width="2.5"'),
  menu: sv('<path d="M4 7h16M4 12h16M4 17h10"/>'),
  login: sv('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>'),
  logout: sv('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  user: sv('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  left: sv('<path d="M15 18l-6-6 6-6"/>'),
  right: sv('<path d="M9 18l6-6-6-6"/>'),
  search: sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  copy: sv('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  check: sv('<path d="M5 12l5 5 9-10"/>', 'stroke-width="2.6"'),
  alert: sv('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>'),
  clock: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  shield: sv('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  bolt: sv('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  chat: sv('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>'),
  fire: sv('<path d="M12 22c4 0 7-2.7 7-7 0-4-3-6-4-9-1.5 2-2 3-2 5-1.5-1-3-3-3-6-3 3-5 6.5-5 10 0 4.3 3 7 7 7z"/>'),
  star: sv('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  knife: sv('<path d="M3 21l7-7M10 14l9.5-9.5c1 1 1.5 3-.5 5L14 15l-1.5-1.5"/>'),
  trophy: sv('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
  send: sv('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>'),
  coin: sv('<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.1 0-2.1-.5-2.6-1.5M12 6.5V8M12 16v1.5"/>'),
  card: sv('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>'),
  globe: sv('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  coins: sv('<ellipse cx="12" cy="5.5" rx="7" ry="2.8"/><path d="M5 5.5v4.2c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V5.5"/><path d="M5 9.7v4.2c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V9.7"/><path d="M5 13.9v4.3c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4.3"/>'),
  trend: sv('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  users: sv('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
  chev: sv('<path d="M6 9l6 6 6-6"/>'),
  crown: sv('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/><path d="M5 19h14"/>'),
  gem: sv('<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21L8 9l4-6 4 6z"/>'),
  leaf: sv('<path d="M5 19C5 10 10 4 20 4c0 10-6 15-15 15z"/><path d="M5 19L13 11"/>'),
  eye: sv('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  history: sv('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  link: sv('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  tg: sv('<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l8-6"/>'),
  vk: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.8 17.5c-5.9 0-9.3-4-9.4-10.8h3c.1 5 2.3 7.1 4 7.5V6.7h2.8v4.3c1.7-.2 3.5-2.1 4.1-4.3h2.8c-.5 2.6-2.4 4.5-3.8 5.3 1.4.7 3.6 2.4 4.4 5.5h-3.1c-.6-2-2.2-3.6-4.4-3.8v3.8z"/></svg>`,
  yt: sv('<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>'),
  ds: sv('<path d="M8 7c-2 .3-3.5 1-3.5 1S2 12 2 17c1.5 1.5 4 2 4 2l1-2M16 7c2 .3 3.5 1 3.5 1S22 12 22 17c-1.5 1.5-4 2-4 2l-1-2M7 16c3 1.5 7 1.5 10 0M8 7.5c2.5-.8 5.5-.8 8 0"/><circle cx="9" cy="12.5" r="1.2"/><circle cx="15" cy="12.5" r="1.2"/>'),
  steam: sv('<circle cx="12" cy="12" r="9.5"/><circle cx="15.5" cy="9" r="2.6"/><circle cx="8.5" cy="15.5" r="2"/><path d="M10.3 14.6l3-3.6"/>'),
};

/* ---------- rarity ---------- */
const RAR = {
  common: { n: 'Ширпотреб', o: 0 },
  uncommon: { n: 'Промышленное', o: 1 },
  milspec: { n: 'Армейское', o: 2 },
  restricted: { n: 'Запрещённое', o: 3 },
  classified: { n: 'Засекреченное', o: 4 },
  covert: { n: 'Тайное', o: 5 },
  rare: { n: '★ Редкий предмет', o: 6 },
};

/* ---------- skins ---------- */
const SK = {};
for (const [name, d] of Object.entries(window.SKINS)) {
  const [w, f] = name.split(' | ');
  SK[name] = { name, w, f, r: d.r, p: d.p, i: d.i, k: d.k };
}
const CATALOG = Object.values(SK).sort((a, b) => a.p - b.p);

/* шансы: веса ~ price^-k, k подбирается так, чтобы матожидание = цена * RTP */
function solveChances(items, target) {
  const ev = k => { let sw = 0, sv2 = 0; for (const it of items) { const w = it.p ** -k; sw += w; sv2 += w * it.p; } return sv2 / sw; };
  let lo = 0, hi = 10;
  for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (ev(m) > target) lo = m; else hi = m; }
  const k = (lo + hi) / 2, ws = items.map(it => it.p ** -k), sw = ws.reduce((a, b) => a + b, 0);
  return ws.map(w => w / sw);
}
/* шансы с заданной долей «дроп дороже кейса» (win) и RTP.
   fix — фиксированные шансы отдельных предметов (например, нож 0.02%).
   Остальные: группа дороже цены получает массу win, дешевле — остаток; внутри групп веса ~ price^-k.
   kl (дешёвые) — как можно ровнее, kh (дорогие) — подбирается под RTP. */
function solveWin(items, target, price, win, fix = {}, floor = Math.max(0, ...Object.values(fix)) * 1.5) {
  const ev = (arr, k) => { let sw = 0, sv = 0; for (const it of arr) { const w = it.p ** -k; sw += w; sv += w * it.p; } return sv / sw; };
  let fMass = 0, fEv = 0, fHi = 0;
  for (const it of items) if (fix[it.name] != null) { fMass += fix[it.name]; fEv += fix[it.name] * it.p; if (it.p > price) fHi += fix[it.name]; }
  const rest = items.filter(it => fix[it.name] == null);
  const hi = rest.filter(it => it.p > price), lo = rest.filter(it => it.p <= price);
  const wH = win - fHi, wL = 1 - win - (fMass - fHi), T = target - fEv;
  let kl = 1, need = 0;
  for (; kl <= 30; kl += .1) { need = (T - wL * ev(lo, kl)) / wH; if (need >= ev(hi, 30)) break; }
  let a = 0, b = 30;
  for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (ev(hi, m) > need) a = m; else b = m; }
  const kh = (a + b) / 2;
  const norm = (arr, mass, k) => { const sw = arr.reduce((t, it) => t + it.p ** -k, 0); return new Map(arr.map(it => [it, mass * it.p ** -k / sw])); };
  const mh = norm(hi, wH, kh), ml = norm(lo, wL, kl);
  const res = items.map(it => fix[it.name] ?? mh.get(it) ?? ml.get(it));
  // зафиксированные (нож) должны остаться самыми редкими: всё, что реже floor, поднимаем до floor и пересчитываем
  const low = items.filter((it, i) => fix[it.name] == null && res[i] < floor);
  if (low.length) { const f2 = { ...fix }; low.forEach(it => { f2[it.name] = floor; }); return solveWin(items, target, price, win, f2, floor); }
  return res;
}
/* то же, но «скромность» выигрышей задаётся вручную: kh фиксирован (больше kh — чаще выигрыш чуть дороже кейса),
   а распределение дешёвой части (kl, может быть < 0) подбирается под RTP */
function solveWinKh(items, target, price, win, kh, fix = {}) {
  const ev = (arr, k) => { let sw = 0, sv = 0; for (const it of arr) { const w = it.p ** -k; sw += w; sv += w * it.p; } return sv / sw; };
  const norm = (arr, mass, k) => { const sw = arr.reduce((t, it) => t + it.p ** -k, 0); return new Map(arr.map(it => [it, mass * it.p ** -k / sw])); };
  let fMass = 0, fEv = 0, fHi = 0;
  for (const it of items) if (fix[it.name] != null) { fMass += fix[it.name]; fEv += fix[it.name] * it.p; if (it.p > price) fHi += fix[it.name]; }
  const rest = items.filter(it => fix[it.name] == null);
  const hi = rest.filter(it => it.p > price), lo = rest.filter(it => it.p <= price);
  const wH = win - fHi, wL = 1 - win - (fMass - fHi), T = target - fEv - wH * ev(hi, kh);
  let a = -8, b = 12;
  for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (wL * ev(lo, m) > T) a = m; else b = m; }
  const mh = norm(hi, wH, kh), ml = norm(lo, wL, (a + b) / 2);
  return items.map(it => fix[it.name] ?? mh.get(it) ?? ml.get(it));
}
function roll(items, key = 'ch') {
  let r = Math.random(), acc = 0;
  for (const it of items) { acc += it[key]; if (r < acc) return it; }
  return items[items.length - 1];
}

/* ---------- cases ---------- */
const CASES = [
  {
    id: 'cotton', name: 'Сладкая вата', price: 990, tag: 'Новинка', tagIc: 'star', rtp: .9,
    sub: 'Розовые, неоновые и радужные скины. Джекпот — ★ Спортивные перчатки | Порок',
    th: { a: '#ff6fb5' }, img: 'assets/case-cotton.webp', win: .45,
    show: ['★ Спортивные перчатки | Порок', 'M4A1-S | Вейпорвейв', 'P90 | Смертоносные кошечки'],
    items: ['G3SG1 | Фиолетовое Мурано', 'SG 553 | Ультрафиолет', 'MAC-10 | Ультрафиолет', 'USP-S | Пиксельный камуфляж «Фиолетовый»', 'MAC-10 | Градиент',
      'Glock-18 | Пиксельный камуфляж «Розовый»', 'MP7 | Неоновые жилки', 'MP9 | Гипнотический', 'AWP | Поп-AWP',
      'AWP | Пиксельный камуфляж «Розовый»', 'MAC-10 | Неоновый гонщик', 'Glock-18 | Королева пуль', 'P90 | Смертоносные кошечки',
      'Five-SeveN | Hyper Beast', 'M4A1-S | Вейпорвейв', 'R8 Revolver | Градиент', 'M4A4 | В живом цвете', 'AK-47 | Императрица',
      'AK-47 | Аквамариновая месть', 'M4A1-S | Градиент', 'AK-47 | Неоновый гонщик', 'AWP | Градиент',
      '★ Штык-нож M9 | Мраморный градиент', '★ Нож-бабочка | Мраморный градиент', '★ Спортивные перчатки | Порок'],
  },
  {
    id: 'sifon', name: 'Сифон и Борода', price: 29, tag: 'Бюджет', tagIc: 'coin', rtp: .75,
    sub: '71 бюджетный скин: каждое третье открытие в плюс до +10 ₽ и нож с минимальным шансом',
    th: { a: '#a3e635' }, img: 'assets/case-sifon.webp', win: 1 / 3, kh: 1, // каждое 3-е открытие в плюс, но не больше +10 ₽ (кроме ножа)
    fix: { '★ Тычковые ножи | Пиксельный камуфляж «Лес»': .0002 },
    show: ['★ Тычковые ножи | Пиксельный камуфляж «Лес»', 'AWP | Чёрный Нил', 'M4A4 | Магний'],
    items: [
      // ширпотреб 1–3 ₽
      'Dual Berettas | Колония', 'SCAR-20 | Наемник', 'MP5-SD | Брызговик', 'MAG-7 | Пыльник', 'Tec-9 | Армейская сетка',
      'Dual Berettas | Бордвойня', 'M249 | Sleet', 'FAMAS | Byproduct', 'Zeus x27 | Пиксельный камуфляж «Болото»',
      'SG 553 | Армейский блеск', 'P90 | Пустынные полутона', 'SSG 08 | Голубая хвоя', 'Nova | Полярная сетка', 'G3SG1 | Полярный камуфляж',
      'ПП-19 Бизон | Городская штриховка', 'Sawed-Off | Белое напыление', 'Tec-9 | Порыв синевы', 'MP5-SD | Лаймовые шестигранники', 'G3SG1 | Красная яшма',
      'P250 | Оксид меди', 'Five-SeveN | Осенняя чаща', 'MP7 | Армейский спецназ', 'P90 | Пиксельный камуфляж «Пустыня»',
      'Dual Berettas | Наемник', 'AUG | Наемник', 'Dual Berettas | Silver Pour',
      // промышленное и армейское 4–28 ₽
      'CZ75-Auto | Полуночная пальма', 'MP9 | Апельсиновая корка', 'Dual Berettas | Сплавной лес', 'G3SG1 | Смешанный камуфляж', 'Galil AR | Смешанный камуфляж',
      'Tec-9 | Терраса', 'MP9 | Закат', 'Nova | Буря', 'Galil AR | Водная терраса', 'P2000 | Серебро', 'Tec-9 | Токсичность', 'SCAR-20 | Латунь', 'Sawed-Off | Медь',
      'AUG | Медянка', 'G3SG1 | Чёрный песок', 'MAG-7 | Желто-черные полосы', 'MP7 | Бирюзовое цветение', 'XM1014 | Красная кожа', 'MAC-10 | Ядерный сад',
      'MP7 | Снежная мгла', 'P250 | Снежная мгла', 'UMP-45 | Пламя', 'MP9 | Хот-род', 'Tec-9 | Латунь', 'Dual Berettas | Анодированная синева',
      'CZ75-Auto | Изумрудный кварц', 'FAMAS | Тёмная вода', 'MP9 | Смертельный яд', 'CZ75-Auto | Изумруд', 'Glock-18 | Реактор', 'USP-S | Тропический бриз',
      'P90 | Красное барокко', 'Galil AR | Леденец', 'AUG | Анодированная синева',
      // в плюс — максимум +10 ₽ (30–39 ₽)
      'P250 | Ржавая сталь', 'Desert Eagle | Синяя фанера', 'Galil AR | Синий титан', 'AWP | Капилляры', 'Five-SeveN | Нитро', 'Glock-18 | Ironwork',
      'SSG 08 | Пучина', 'M4A4 | Магний', 'M4A1-S | Смешанный камуфляж', 'AWP | Чёрный Нил',
      // единственное исключение — нож с минимальным шансом
      '★ Тычковые ножи | Пиксельный камуфляж «Лес»'],
  },
  {
    id: 'premium', name: 'Premium', price: 4500, tag: 'Премиум', tagIc: 'crown', rtp: .85,
    sub: 'Только дорогой дроп: тайные скины, ножи и перчатки. Джекпот — AWP | История о драконе',
    th: { a: '#e8b04a' }, img: 'assets/case-premium.webp', win: .25,
    show: ['AWP | История о драконе', '★ Нож-бабочка | Волны', 'AK-47 | Дикий лотос'],
    items: ['AWP | Ледяной уголь', 'AK-47 | Ледяной уголь', 'M4A1-S | Mecha Industries', 'USP-S | Неонуар', 'Desert Eagle | Код красный',
      'AWP | Красная линия', 'AK-47 | Императрица', 'M4A4 | Neo-Noir', 'Glock-18 | Неонуар', 'AK-47 | Кровавый спорт',
      'M4A1-S | Сайрекс', 'AK-47 | Аквамариновая месть', 'Desert Eagle | Золотой карп', 'AWP | Wildfire', 'AK-47 | Азимов',
      'M4A4 | Император', 'M4A1-S | Градиент', 'AWP | Неонуар', 'AWP | Пламя суверена', 'AK-47 | Неоновый гонщик', 'M4A4 | Азимов',
      'M4A1-S | Неотвратимая угроза', 'USP-S | Убийство подтверждено', 'M4A1-S | Поток информации', 'AWP | Азимов',
      'Glock-18 | Протокол «Призрак»', 'AK-47 | Рентген', 'AK-47 | Вулкан', '★ Коготь | Пыльник', '★ Мотоциклетные перчатки | Затмение',
      'AWP | Принц', '★ Штык-нож | Ночь', 'AWP | Градиент', '★ Перчатки спецназа | Градиент', '★ Штык-нож | Мраморный градиент',
      'AK-47 | Огненный змей', '★ Классический нож | Убийство', '★ Спортивные перчатки | Живая изгородь', '★ Нож-бабочка | Автотроника',
      '★ Штык-нож M9 | Легенды', '★ Перчатки спецназа | Кровавое кимоно', '★ Нож-бабочка | Убийство', '★ Нож-бабочка | Градиент',
      '★ Штык-нож M9 | Волны', '★ Спортивные перчатки | Порок', 'AK-47 | Золотая арабеска', '★ Нож-бабочка | Волны',
      'AWP | Медуза', 'M4A4 | Вой', 'AK-47 | Дикий лотос', 'AWP | История о драконе'],
  },
  {
    id: 'alt', name: 'Альтушка', price: 450, tag: 'Новинка', tagIc: 'star', rtp: .9,
    sub: 'Аниме, котики и розовый неон. Джекпот — ★ Нож-бабочка | Мраморный градиент',
    th: { a: '#ff3fa4' }, img: 'assets/case-alt.webp', win: .55,
    fix: { '★ Нож-бабочка | Мраморный градиент': .0001, '★ Штык-нож M9 | Мраморный градиент': .0002 },
    show: ['★ Нож-бабочка | Мраморный градиент', 'AWP | ЛАПКИ', 'XM1014 | Целую-обнимаю'],
    items: ['FAMAS | Мяу 36', 'Five-SeveN | Buddy', 'MAC-10 | Саккаку', 'USP-S | Ticket to Hell', 'Glock-18 | Кролик в тени',
      'ПП-19 «Бизон» | Space Cat', 'AWP | Гадюка', 'Glock-18 | Пиксельный камуфляж «Розовый»', 'MP7 | Неоновые жилки', 'MP9 | Гипнотический',
      'AWP | ЛАПКИ', 'XM1014 | Целую-обнимаю', 'AWP | Поп-AWP', 'UMP-45 | Дикое дитя', 'AWP | Пиксельный камуфляж «Розовый»',
      'MP7 | Abyssal Apparition', 'MAC-10 | Неоновый гонщик', 'FAMAS | Rapid Eye Movement', 'Glock-18 | Королева пуль',
      'Desert Eagle | Ржавый кобальт', 'P90 | Смертоносные кошечки', 'Five-SeveN | Hyper Beast', 'MP9 | Starlight Protector',
      'M4A1-S | Вейпорвейв', 'M4A4 | В живом цвете', 'AK-47 | Императрица', 'AK-47 | Nightwish', 'AWP | Градиент',
      '★ Штык-нож M9 | Мраморный градиент', '★ Нож-бабочка | Мраморный градиент'],
  },
  {
    id: 'orange', name: 'Оранж', price: 140, tag: 'Новинка', tagIc: 'fire', rtp: .9,
    sub: 'Оранжевые скины, Азимовы и «Зуб тигра». Ножи и перчатки — с минимальным шансом',
    th: { a: '#ff7a1a' }, img: 'assets/case-orange.webp', win: .45,
    // ножи, перчатки и самый дорогой скин — минимальный шанс
    fix: { '★ Нож-бабочка | Зуб тигра': .00003, '★ Штык-нож M9 | Зуб тигра': .00006, '★ Штык-нож | Зуб тигра': .0001,
      '★ Спортивные перчатки | Засуха': .0001, '★ Обмотки рук | Бойня': .00015, 'AK-47 | Огненный змей': .00005 },
    show: ['★ Нож-бабочка | Зуб тигра', 'AWP | Азимов', 'M4A4 | Азимов'],
    items: ['MP9 | Апельсиновая корка', 'Sawed-Off | Медь', 'SCAR-20 | Латунь', 'UMP-45 | Пламя', 'Tec-9 | Латунь', 'XM1014 | Оранжевое пламя',
      'Glock-18 | Реактор', 'SSG 08 | Оранжевая филигрань', 'MAC-10 | Янтарный градиент', 'Five-SeveN | Нитро', 'Автомат «Галиль» | Янтарный градиент',
      'MAG-7 | Поджигатель', 'MAC-10 | Медный Борре', 'FAMAS | Заход солнца', 'MP7 | Полная остановка', 'P250 | Бенгальский тигр', 'Tec-9 | Ядерная угроза',
      'MAG-7 | Жар', 'P2000 | Янтарный градиент', 'USP-S | Оранжевый анолис', 'Five-SeveN | Медная галактика', 'MAC-10 | Золотой кирпич',
      'Glock-18 | Латунь', 'Five-SeveN | Термическая обработка', 'P2000 | Огненный элементаль', 'Glock-18 | Градиент', 'Desert Eagle | Пламя',
      'P90 | Азимов', 'R8 Revolver | Градиент', 'Glock-18 | Золотой зубок', 'Desert Eagle | Золотой карп', 'AK-47 | Азимов', 'M4A4 | Азимов',
      'AWP | Азимов', 'AK-47 | Огненный змей', '★ Обмотки рук | Бойня', '★ Спортивные перчатки | Засуха', '★ Штык-нож | Зуб тигра',
      '★ Штык-нож M9 | Зуб тигра', '★ Нож-бабочка | Зуб тигра'],
  },
];
CASES.sort((a, b) => a.price - b.price); // витрина: от самого дешёвого к самому дорогому
CASES.forEach(c => {
  const items = c.items.map(n => { if (!SK[n]) throw new Error('Нет скина: ' + n); return SK[n]; });
  const ch = c.kh ? solveWinKh(items, c.price * c.rtp, c.price, c.win, c.kh, c.fix) : c.win ? solveWin(items, c.price * c.rtp, c.price, c.win, c.fix) : solveChances(items, c.price * c.rtp);
  const fwRaw = ch.map(x => Math.sqrt(x)), fs = fwRaw.reduce((a, b) => a + b, 0);
  c.items = items.map((s, i) => ({ ...s, ch: ch[i], fw: fwRaw[i] / fs })).sort((a, b) => b.p - a.p);
  c.rareChance = c.items.filter(s => s.r === 'rare').reduce((a, s) => a + s.ch, 0);
});
const caseById = id => CASES.find(c => c.id === id);

/* ---------- ranks ---------- */
const RANKS = [
  { n: 'Silver', min: 0, cb: 0, c: ['#eef2f7', '#6b7280'] },
  { n: 'Gold Nova', min: 1000, cb: 1, c: ['#fde68a', '#b45309'] },
  { n: 'Master Guardian', min: 5000, cb: 2, c: ['#bae6fd', '#0369a1'] },
  { n: 'Legendary Eagle', min: 20000, cb: 3, c: ['#ddd6fe', '#6d28d9'] },
  { n: 'Supreme', min: 60000, cb: 4, c: ['#fbcfe8', '#be185d'] },
  { n: 'Global Elite', min: 150000, cb: 5, c: ['#fff1c7', '#d97706'] },
];
function rankOf(spent) {
  let i = 0; RANKS.forEach((r, k) => { if (spent >= r.min) i = k; });
  const cur = RANKS[i], next = RANKS[i + 1];
  return { i, cur, next, pct: next ? clamp((spent - cur.min) / (next.min - cur.min) * 100, 0, 100) : 100, left: next ? next.min - spent : 0 };
}
const starPath = (cx, cy, r) => { let p = ''; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * .45 : r; p += (k ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); } return p + 'Z'; };
function rankIcon(r, i) {
  const n = i + 1, rows = n <= 3 ? [n] : [3, n - 3], ys = rows.length === 1 ? [32] : [27, 38];
  const stars = rows.map((cnt, ri) => Array.from({ length: cnt }, (_, k) => starPath(32 + (k - (cnt - 1) / 2) * 10, ys[ri], 4.4)).join('')).join('');
  return `<svg class="rank-ic" viewBox="0 0 64 64"><defs><linearGradient id="rk${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${r.c[0]}"/><stop offset="1" stop-color="${r.c[1]}"/></linearGradient></defs><path d="M32 3l25 14.5v29L32 61 7 46.5v-29z" fill="url(#rk${i})" stroke="rgba(255,255,255,.4)" stroke-width="1.5"/><path d="M32 11l18 10.4v21.2L32 53 14 42.6V21.4z" fill="rgba(10,8,20,.6)"/><path d="${stars}" fill="${r.c[0]}"/></svg>`;
}

/* ---------- state ---------- */
const KEY = 'rushcase.v1';
const freshProfile = () => ({ balance: 0, inv: [], stats: { opened: 0, spent: 0, upg: 0, upgWin: 0, con: 0, best: null, dep: 0 }, daily: 0, promos: [], depBonus: 0, socials: [], trade: '' });
const DEF = () => ({ user: null, ...freshProfile(), sound: true, fast: false, accounts: {} });
let st;
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  st = Object.assign(DEF(), raw || {});
  st.stats = Object.assign(freshProfile().stats, st.stats || {});
} catch (e) { st = DEF(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* приватный режим */ } };
st.inv.forEach(x => { if (x.st === 'pend') x.st = 'out'; if (x.st === 'bet') x.st = 'own'; });

const own = () => st.inv.filter(x => x.st === 'own' && SK[x.n]);
function giveItem(s, from) {
  const it = { id: uid(), n: s.name, from, ts: Date.now(), st: 'own' };
  st.inv.unshift(it);
  if (!st.stats.best || !SK[st.stats.best] || s.p > SK[st.stats.best].p) st.stats.best = s.name;
  return it;
}
function sellItem(id, silent) {
  const it = st.inv.find(x => x.id === id);
  if (!it || it.st !== 'own') return 0;
  it.st = 'sold'; const p = SK[it.n].p;
  setBalance(st.balance + p);
  if (!silent) { Snd.coin(); toast(`Продано: <b>+${money(p)}</b>`); }
  return p;
}

/* ---------- sound (WebAudio, без файлов) ---------- */
const Snd = {
  ctx: null, out: null, nbuf: null,
  get a() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      // общий компрессор — громко, но без перегруза
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .2;
      this.out = this.ctx.createGain(); this.out.gain.value = .9;
      this.out.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate; this.nbuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.nbuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  /* тон с огибающей; to — глиссандо к частоте */
  tone(f, dur, type = 'sine', vol = .08, when = 0, to = 0, attack = .004) {
    if (!st.sound) return; const a = this.a; if (!a) return;
    const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + .05);
  },
  /* щелчок шума через фильтр */
  noise(dur, vol = .2, when = 0, freq = 2000, q = 1, type = 'bandpass') {
    if (!st.sound) return; const a = this.a; if (!a) return;
    const t = a.currentTime + when, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = this.nbuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random() * .5); s.stop(t + dur + .02);
  },
  /* твёрдый «щелчок храповика» для лент и колеса */
  tick() {
    this.noise(.028, .55, 0, 3400, 1.4);
    this.tone(2100, .02, 'square', .05, 0, 900);
    this.tone(160, .045, 'sine', .22, 0, 70);
  },
  click() { this.noise(.03, .3, 0, 2600, 1.2); this.tone(420, .06, 'triangle', .1, 0, 260); },
  coin() { this.tone(1320, .09, 'square', .045); this.tone(1980, .22, 'square', .045, .08); this.tone(2640, .25, 'sine', .04, .08); },
  /* отщёлкивание замка кейса: два металлических щелчка + удар защёлки + скрип крышки */
  /* звук замка — ваш файл, переработанный (assets/sounds/lock.wav); декодируем заранее, чтобы не было задержки */
  bufs: {},
  preload(name, url) { fetch(url).then(r => r.arrayBuffer()).then(ab => { this.bufs[name] = ab; }).catch(() => {}); },
  async play(name, vol = 1, rate = 1) {
    if (!st.sound) return false; const a = this.a; if (!a) return false;
    let b = this.bufs[name]; if (!b) return false;
    if (b instanceof ArrayBuffer) { try { b = this.bufs[name] = await a.decodeAudioData(b); } catch (e) { return false; } }
    const s = a.createBufferSource(), g = a.createGain(); s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g); g.connect(a.destination); s.start(); return true;
  },
  /* щелчок ленты кейса — звук с записи (assets/sounds/tick.wav), лёгкий разброс высоты */
  tickCase() { if (this.bufs.tick) this.play('tick', .9, .96 + Math.random() * .08); else this.tick(); },
  lock() { this.play('lock').then(ok => { if (!ok && st.sound && !this.bufs.lock) this.lockSynth(); }); },
  lockSynth() {
    this.noise(.05, .6, 0, 4200, 2); this.tone(180, .08, 'sine', .3, 0, 80);
    this.noise(.04, .45, .14, 5200, 2.5); this.tone(2400, .05, 'square', .04, .14, 1400);
    this.noise(.09, .7, .42, 1800, .8); this.tone(110, .22, 'sine', .45, .42, 45); this.tone(620, .12, 'triangle', .1, .42, 300);
    this.noise(.45, .12, .55, 900, 6); this.tone(240, .5, 'sawtooth', .025, .55, 330, .08);
  },
  /* дешёвый дроп — короткий мягкий «пум» */
  cheap() { this.tone(392, .18, 'triangle', .14); this.tone(294, .3, 'triangle', .12, .09); this.noise(.06, .12, 0, 800, 1); },
  /* окупил кейс — бодрое арпеджио с монетками */
  profit() {
    [523, 659, 784, 1047].forEach((f, i) => { this.tone(f, .28, 'triangle', .16, i * .075); this.tone(f * 2, .2, 'sine', .04, i * .075); });
    this.coin(); setTimeout(() => this.coin(), 260);
  },
  /* супер дорогой дроп — торжественные фанфары */
  jackpot() {
    const ch = (fs, w, d, v = .1) => fs.forEach(f => { this.tone(f, d, 'sawtooth', v * .45, w, 0, .02); this.tone(f, d, 'triangle', v, w, 0, .02); });
    this.tone(55, 1.2, 'sine', .5, 0, 40); this.noise(.8, .35, 0, 300, .7, 'lowpass');
    ch([392, 494, 587], .05, .22); ch([392, 494, 587], .3, .22);
    ch([523, 659, 784], .55, .5, .12);
    ch([587, 740, 880], 1.05, .3);
    ch([523, 659, 784, 1047], 1.38, 1.6, .14);
    [1568, 2093, 2637, 3136, 2637, 3136, 4186].forEach((f, i) => this.tone(f, .5, 'sine', .05, 1.4 + i * .09));
    this.noise(1.4, .12, 1.38, 7000, .6, 'highpass');
  },
  /* громкая победа в апгрейде */
  upgWin() {
    this.tone(70, .7, 'sine', .55, 0, 40); this.noise(.5, .3, 0, 400, .7, 'lowpass');
    [523, 784, 1047, 1319, 1568].forEach((f, i) => { this.tone(f, .5, 'square', .06, i * .07); this.tone(f, .6, 'triangle', .14, i * .07); });
    [2093, 2637, 3136].forEach((f, i) => this.tone(f, .9, 'sine', .07, .42 + i * .08));
    this.noise(1, .12, .4, 6500, .6, 'highpass');
  },
  win(lvl) { lvl >= 5 ? this.jackpot() : lvl >= 3 ? this.profit() : this.cheap(); },
  lose() { this.tone(330, .25, 'sawtooth', .06, 0, 300); this.tone(196, .5, 'sawtooth', .07, .16, 150); this.noise(.3, .15, .16, 500, 1); },
  /* ===== апгрейд: «Сейф» ===== */
  // выбор предмета: on — защёлкнуть, off — отпустить (ниже)
  safeSel(on = true) { this.noise(.035, .35, 0, on ? 3000 : 1800, 1.6); this.tone(on ? 330 : 220, .07, 'triangle', .12, 0, on ? 250 : 160); },
  // щелчок шкалы при смене шанса: выше шанс — выше звук
  safeDial(ch) { const f = 900 + ch * 1400; this.noise(.02, .25, 0, f * 2.2, 2.5); this.tone(f, .03, 'square', .025, 0, f * .7); },
  // старт: рука берёт рычаг, тяжёлый «клац» и раскрутка механизма
  safeStart() {
    this.noise(.05, .5, 0, 2400, 1.8); this.tone(140, .14, 'sine', .45, 0, 60);
    this.noise(.07, .6, .16, 1500, 1); this.tone(95, .25, 'sine', .55, .16, 40); this.tone(780, .1, 'triangle', .08, .16, 400);
    this.noise(.4, .12, .2, 600, 3); this.tone(70, .45, 'sawtooth', .05, .2, 140, .1);
  },
  // щелчок храповика: speed 0..1 (1 — быстро). Медленнее → тяжелее, ниже, громче
  safeTick(speed = 1, tense = 0) {
    const slow = 1 - Math.min(1, speed), n = 1 + Math.floor(Math.random() * 3);
    // щелчок диска сейфа из вашей записи; к остановке — ниже и громче, плюс глухой удар механизма
    if (this.bufs['safe' + n]) this.play('safe' + n, .7 + slow * .3, (1.06 - slow * .2 - tense * .05) * (.98 + Math.random() * .04));
    else { this.noise(.03 + slow * .03, .38 + slow * .35, 0, 3200 - slow * 1800, 1.3); this.tone(1400 - slow * 600, .02, 'square', .03, 0, 700); }
    if (slow > .35) this.tone(120 - slow * 40, .06 + slow * .05, 'sine', slow * .28, 0, 55);
  },
  // напряжение: удар сердца (двойной)
  heart(vol = .5) { this.tone(62, .16, 'sine', vol, 0, 40); this.noise(.08, vol * .25, 0, 180, .7, 'lowpass'); this.tone(55, .2, 'sine', vol * .75, .17, 36); },
  // «почти попал» — вздох-свист вниз
  nearMiss() { this.noise(.55, .22, 0, 1200, 3, 'bandpass', .12); this.tone(880, .5, 'sine', .07, 0, 330, .05); },
  // победа: тяжёлый замок сейфа → дверь со скрипом → звон монет
  safeWin() {
    this.tone(60, .6, 'sine', .7, 0, 32); this.noise(.12, .8, 0, 1600, .9); this.tone(1250, .9, 'sine', .07, 0); this.tone(3450, .6, 'sine', .035, 0);
    this.noise(.08, .6, .22, 4200, 2); this.tone(90, .3, 'sine', .45, .22, 45);
    { const a = this.a; if (a && st.sound) { const t = a.currentTime + .42, o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(260, t + .45); o.frequency.exponentialRampToValueAtTime(190, t + .8);
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 4; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + .1); g.gain.exponentialRampToValueAtTime(.0001, t + .85);
      o.connect(f); f.connect(g); g.connect(this.out); o.start(t); o.stop(t + .9); } }
    [523, 659, 784, 1047, 1319].forEach((f, i) => { this.tone(f, .55, 'triangle', .13, .55 + i * .07); this.tone(f * 2, .4, 'sine', .04, .55 + i * .07); });
    for (let i = 0; i < 16; i++) { const t = .7 + i * .055 + Math.random() * .03, f = 2400 + Math.random() * 2200; this.tone(f, .16, 'square', .03, t); this.tone(f * 1.5, .22, 'sine', .025, t + .02); }
    this.noise(1, .1, .6, 7000, .6, 'highpass');
  },
  // проигрыш: глухой стук «заперто» — без раздражения
  safeLose() { this.noise(.07, .5, 0, 700, 1); this.tone(110, .25, 'sine', .45, 0, 55); this.noise(.05, .3, .14, 500, 1); this.tone(80, .3, 'sine', .3, .14, 45); },
  /* звук-файл (пополнение) */
  file(src, vol = .9) { if (!st.sound) return; try { const au = new Audio(src); au.volume = vol; au.play().catch(() => {}); } catch (e) { /* ignore */ } },
};

Snd.preload('lock', 'assets/sounds/lock.wav');
Snd.preload('tick', 'assets/sounds/tick.wav');
[1, 2, 3].forEach(n => Snd.preload('safe' + n, 'assets/sounds/safe-tick-' + n + '.wav'));
Snd.preload('upgWin', 'assets/sounds/upgrade-win.wav');

/* ---------- toast / modal ---------- */
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast t-' + type;
  t.innerHTML = (type === 'err' ? ic.alert : type === 'info' ? ic.clock : ic.check) + `<span>${msg}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3400);
  setTimeout(() => t.remove(), 3800);
}
function modal(html, cls = '') {
  $$('#modal-root .modal-ov').forEach(m => m.remove());
  const m = document.createElement('div');
  m.className = 'modal-ov';
  m.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true"><button class="m-close" aria-label="Закрыть">${ic.close}</button>${html}</div>`;
  m.addEventListener('mousedown', e => { if (e.target === m) closeModal(); });
  $('.m-close', m).onclick = closeModal;
  $('#modal-root').appendChild(m);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => m.classList.add('in'));
  return $('.modal', m);
}
function closeModal() {
  const m = $('#modal-root .modal-ov'); if (!m) return;
  m.classList.remove('in'); document.body.classList.remove('no-scroll');
  setTimeout(() => m.remove(), 220);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeMenu(); } });

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e2) { /* ignore */ } ta.remove(); }
  toast(`Скопировано: <b>${esc(t)}</b>`);
}

/* ---------- decorative ---------- */
const RINGS = '<div class="ab-rings"><i></i><i></i><i></i></div>';
/* витрина кейса: главный скин парит над постаментом, по бокам ещё два (заменится на 3D-кейс, когда будут фото) */
function caseArt(c, cls = '') {
  if (c.img) return `<div class="case-art has-img ${cls}" style="--ca:${c.th.a}"><i class="ca-glow"></i><img class="ca-img" src="${c.img}" alt="Кейс «${c.name}»" decoding="async" draggable="false"></div>`;
  const [m, a, b] = c.show.map(n => SK[n]);
  const sparks = [[14, 20, 0], [84, 16, .9], [90, 60, 1.7], [8, 64, 2.4], [52, 6, 1.2]]
    .map(([x, y, d]) => `<i class="ca-spark" style="left:${x}%;top:${y}%;animation-delay:${d}s"></i>`).join('');
  return `<div class="case-art ${cls}" style="--ca:${c.th.a}">
    <div class="ca-rays"></div><div class="ca-aura"></div><div class="ca-ring"></div>
    <img class="ca-sk ca-sk1" src="${imgUrl(a, 'm')}" alt="" loading="lazy">
    <img class="ca-sk ca-sk2" src="${imgUrl(b, 'm')}" alt="" loading="lazy">
    <div class="ca-pedestal"></div>
    <img class="ca-main" src="${imgUrl(m, 'l')}" alt="" loading="lazy">
    ${sparks}
  </div>`;
}
const ava = (u, cls = '') => {
  if (!u) return '';
  if (u.ava) return `<span class="ava ${cls}"><img src="${u.ava}" alt=""></span>`;
  const h = [...u.name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 120 + 60;
  return `<span class="ava ${cls}" style="--h:${h}">${esc(u.name[0].toUpperCase())}</span>`;
};

/* ---------- header / footer ---------- */
const NAV = [
  { k: 'home', h: '/', t: 'Главная', i: 'box' },
  { k: 'cases', h: '/cases', t: 'Кейсы', i: 'box' },
  { k: 'upgrade', h: '/upgrade', t: 'Апгрейд', i: 'up' },
  { k: 'contracts', h: '/contracts', t: 'Контракты', i: 'swap' },
  { k: 'jackpot', h: '/jackpot', t: 'Ставки', i: 'coins' },
  { k: 'bonus', h: '/bonus', t: 'Бонусы', i: 'gift' },
  { k: 'top', h: '/top', t: 'Топ игроков', i: 'trophy' },
];
let online = randi(1180, 1460);
function renderHeader() {
  $('#header').innerHTML = `<div class="container hd">
    <button class="burger" id="burger" aria-label="Меню">${ic.menu}</button>
    <a href="#/" class="logo" aria-label="RUSH CASE — на главную">${WORDMARK}</a>
    <nav class="nav" id="nav">${NAV.map(n => `<a href="#${n.h}" data-nav="${n.k}">${ic[n.i]}<span>${n.t}</span></a>`).join('')}</nav>
    <div class="hd-right"><div class="user-area" id="userArea"></div></div></div>`;
  $('#burger').onclick = e => { e.stopPropagation(); $('#nav').classList.toggle('open'); };
  renderUser();
}
function closeMenu() { const n = $('#nav'); if (n) n.classList.remove('open'); const m = $('#umenu'); if (m) m.classList.add('hidden'); }
document.addEventListener('click', e => { if (!e.target.closest('#nav') && !e.target.closest('#burger') && !e.target.closest('.ubox')) closeMenu(); });

let shownBal = null;
const toggleSound = () => { st.sound = !st.sound; save(); if (st.sound) Snd.click(); renderUser(); };
function renderUser() {
  const ua = $('#userArea'); if (!ua) return;
  if (!st.user) {
    ua.innerHTML = `<button class="icon-btn" id="sndBtn" title="Звук" aria-label="Звук">${st.sound ? ic.sound : ic.mute}</button>
      <button class="btn btn-primary" data-act="login">${ic.login}<span>Войти</span></button>`;
    $('#sndBtn').onclick = toggleSound;
    shownBal = null; return;
  }
  ua.innerHTML = `<div class="bal" data-act="deposit" title="Пополнить баланс"><span class="bal-ic">${ic.coin}</span><b id="balance">${money(st.balance)}</b></div>
    <button class="btn btn-outline hd-dep" data-act="deposit">Пополнить</button>
    <div class="ubox">
      <button class="ubtn" id="ubtn" aria-haspopup="true" aria-label="Меню профиля">${ava(st.user)}${ic.chev}</button>
      <div class="umenu hidden" id="umenu">
        <div class="um-h">${ava(st.user, 'xs')}<b>${esc(st.user.name)}</b></div>
        <a href="#/profile">${ic.user}Профиль и инвентарь</a>
        <a href="#/bonus">${ic.gift}Бонусы</a>
        <button id="umSound">${st.sound ? ic.sound : ic.mute}Звук: ${st.sound ? 'вкл' : 'выкл'}</button>
        <button data-act="logout">${ic.logout}Выйти</button>
      </div>
    </div>`;
  $('#ubtn').onclick = e => { e.stopPropagation(); $('#umenu').classList.toggle('hidden'); };
  $('#umSound').onclick = toggleSound;
  $$('#umenu a').forEach(a => a.addEventListener('click', () => $('#umenu').classList.add('hidden')));
  shownBal = st.balance;
}
let balAnim;
function setBalance(v) {
  const from = shownBal == null ? st.balance : shownBal;
  st.balance = Math.max(0, Math.round(v)); save();
  const el = $('#balance'); if (!el) return;
  cancelAnimationFrame(balAnim);
  const t0 = performance.now(), to = st.balance;
  const step = now => { const k = Math.min(1, (now - t0) / 600), e = 1 - (1 - k) ** 3; shownBal = from + (to - from) * e; el.textContent = money(shownBal); if (k < 1) balAnim = requestAnimationFrame(step); };
  balAnim = requestAnimationFrame(step);
  const b = el.closest('.bal'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
}
function renderFooter() {
  $('#footer').innerHTML = `<div class="container ft">
    <div class="ft-brand"><a href="#/" class="logo">${WORDMARK}</a>
      <p>Премиальные кейсы CS2, апгрейды и контракты с мгновенным выводом в Steam.</p>
      <div class="socials"><a href="#/bonus" aria-label="Telegram">${ic.tg}</a><a href="#/bonus" aria-label="VK">${ic.vk}</a><a href="#/bonus" aria-label="YouTube">${ic.yt}</a><a href="#/bonus" aria-label="Discord">${ic.ds}</a></div>
    </div>
    <div class="ft-col"><h4>Игры</h4><a href="#/cases">Кейсы</a><a href="#/upgrade">Апгрейд</a><a href="#/contracts">Контракты</a><a href="#/bonus">Бонусы</a><a href="#/top">Топ игроков</a></div>
    <div class="ft-col"><h4>Информация</h4><a href="#/faq">FAQ</a><a href="#/terms">Пользовательское соглашение</a><a href="#/terms">Политика конфиденциальности</a><a href="#/faq">Честная игра</a></div>
    <div class="ft-col"><h4>Поддержка</h4><a href="#/faq">support@rushcase.gg</a><a href="#/faq">Онлайн-чат 24/7</a>
      <div class="pay"><span>СБП</span><span>VISA</span><span>MC</span><span>МИР</span><span>USDT</span></div></div>
  </div>
  <div class="container ft-bottom"><span class="age">18+</span><p>© ${new Date().getFullYear()} RUSH CASE. Сайт не аффилирован с Valve Corporation. Counter-Strike 2 и Steam — товарные знаки Valve Corporation. Все изображения предметов принадлежат их правообладателям.</p></div>`;
}

/* ---------- live feed ---------- */
const NICKS = ['Kirill_KZ', 'ShadowFox', 'Clutch_King', 'toxic_ivan', 'Zeus77', 'dimon228', 'ProSniper', 'lazy_cat', 'Smurfik', 'Vanya_AWP', 'Gromila', 'Kolya', 'rush_b', 'FragMaster', 'HeadHunter', 'Снайпер', 'Сашка', 'Мангуст', 'ПашаТехник', 'Lynx', 'Bober', 'xXx_Sniper', 'monkey_d', 'Flick_God', 'Tima', 'Raptor', 'NeoNoir', 'Artem2009', 'Viper', 'Kenny'];
const liveBuf = [];
let liveFilter = 'all';
const liveHtml = d => {
  const s = SK[d.n], c = caseById(d.c);
  return `<a class="ld r-${s.r}${d.mine ? ' mine' : ''}" href="#/case/${d.c}" title="${esc(s.name)}"><img src="${imgUrl(s, 's')}" alt="" loading="lazy"><span class="ld-f">${esc(s.f)}</span><span class="ld-w">${esc(s.w)}</span><span class="ld-u"><small>${c ? 'Кейс «' + c.name + '»' : d.c}</small>${esc(d.u)}</span></a>`;
};
const liveOk = d => liveFilter === 'all' || SK[d.n].p >= 1000;
function renderLive() { $('#liveTrack').innerHTML = liveBuf.filter(liveOk).slice(0, 40).map(liveHtml).join(''); }
function pushLive(d) {
  liveBuf.unshift(d); if (liveBuf.length > 120) liveBuf.pop();
  if (!liveOk(d)) return;
  const tr = $('#liveTrack');
  tr.insertAdjacentHTML('afterbegin', liveHtml(d));
  tr.firstElementChild.classList.add('enter');
  while (tr.children.length > 40) tr.lastElementChild.remove();
}
function fakeDrop() {
  const ws = CASES.map(x => 1 / Math.sqrt(x.price)), tw = ws.reduce((a, b) => a + b, 0);
  let r = Math.random() * tw, c = CASES[0];
  for (let i = 0; i < CASES.length; i++) { r -= ws[i]; if (r <= 0) { c = CASES[i]; break; } }
  let s = roll(c.items);
  if (Math.random() < .08) s = roll(c.items, 'fw'); // иногда показываем дроп пожирнее
  return { n: s.name, c: c.id, u: pick(NICKS) };
}
function initLive() {
  for (let i = 0; i < 60; i++) liveBuf.push(fakeDrop());
  renderLive();
  $$('[data-live]').forEach(b => b.onclick = () => { liveFilter = b.dataset.live; $$('[data-live]').forEach(x => x.classList.toggle('on', x === b)); renderLive(); });
  (function loop() { pushLive(fakeDrop()); setTimeout(loop, rand(1300, 3600)); })();
}

/* ---------- background fx ---------- */
function initFx() {
  let h = '<i class="orb o1"></i><i class="orb o2"></i><i class="orb o3"></i>';
  for (let i = 0; i < 34; i++) h += `<i class="fly" style="left:${rand(0, 100)}%;top:${rand(0, 100)}%;--d:${rand(3, 7)}s;--dl:${rand(0, 6)}s;--s:${rand(.5, 1.3)}"></i>`;
  $('#fx').innerHTML = h;
}
function burst(n = 70) {
  const box = document.createElement('div'); box.className = 'burst';
  const cols = ['#f5c76b', '#ffe7a3', '#ffffff', '#a78bfa', '#d6912c'];
  for (let i = 0; i < n; i++) {
    const l = document.createElement('i');
    l.style.cssText = `--x:${rand(0, 100)}vw;--dx:${rand(-180, 180)}px;--r:${rand(-900, 900)}deg;--d:${rand(2.4, 4.6)}s;--dl:${rand(0, .6)}s;--s:${rand(.5, 1.2)};--c:${pick(cols)}`;
    box.appendChild(l);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 5800);
}

/* ---------- page timers ---------- */
let timers = [];
const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
const clearTimers = () => { timers.forEach(t => { clearInterval(t); clearTimeout(t); }); timers = []; };
const WORDMARK = '<img class="brand-logo" src="assets/logo.webp" alt="RUSH CASE" draggable="false">';
const secTitle = t => `<div class="sec-row"><h2 class="sec-h">${t}</h2><i class="st-line"></i></div>`;

/* =========================================================
   HOME
   ========================================================= */
const CASE_DESC = {
  sifon: 'Бюджетный кейс: каждое третье открытие в плюс',
  orange: 'Азимовы и «Зуб тигра» в одном кейсе',
  alt: 'Аниме, котики и розовый неон',
  cotton: 'Розовые, неоновые и радужные скины',
  premium: 'Только дорогой дроп, ножи и перчатки',
};
const HERO_SKIN = 'AK-47 | Золотая арабеска';
let statOpened = 1284590;
function pageHome() {
  const embers = Array.from({ length: 22 }, () => `<i style="left:${rand(2, 98)}%;--d:${rand(4, 9)}s;--dl:${rand(0, 8)}s;--x:${rand(-40, 40)}px;--s:${rand(.6, 1.4)}"></i>`).join('');
  return `<section class="hero2">
    <div class="h2-bg"><i class="h2-spot"></i><div class="h2-embers">${embers}</div></div>
    <div class="container h2-in">
      <div class="h2-text">
        <h1><span>Открывай.</span><span>Собирай.</span><span class="gold">Побеждай.</span></h1>
        <p>Твои следующие легендарные скины уже внутри</p>
        <div class="h2-btns">
          <a class="btn btn-primary btn-lg" href="#/cases">${ic.box}Открыть кейсы${ic.right}</a>
          <a class="btn btn-outline btn-lg" href="#/upgrade">${ic.trend}Смотреть апгрейды</a>
        </div>
      </div>
      <div class="h2-art" aria-hidden="true">
        <i class="h2-ring"></i><i class="h2-ring r2"></i><i class="h2-glow"></i>
        <img class="h2-case c1" src="assets/case-orange.webp" alt="">
        <img class="h2-case c3" src="assets/case-alt.webp" alt="">
        <img class="h2-case c2" src="assets/case-premium.webp" alt="">
        <img class="h2-skin" src="${imgUrl(SK[HERO_SKIN], 'l')}" alt="">
        <i class="h2-dust"></i>
      </div>
    </div>
  </section>
  <section class="container">
    <div class="stbar">
      <div class="sb-i"><span class="sb-ic">${ic.box}</span><div><b id="sbOpened">${fmt(statOpened)}</b><span>Кейсов открыто</span></div></div>
      <div class="sb-i"><span class="sb-ic">${ic.users}</span><div><b>24 816</b><span>Игроков</span></div></div>
      <div class="sb-i"><span class="sb-ic">${ic.shield}</span><div><b>98.7%</b><span>Выплат</span></div></div>
    </div>
    <div class="sec-row">
      <h2 class="sec-h">Популярные кейсы</h2><i class="st-line"></i>
    </div>
    <div class="cases-grid" id="popRow">${CASES.map(caseCard).join('')}</div>
    <div class="promo-row">
      <div class="promo promo-dep"><div><h3>Бонус к пополнению <em>+35%</em></h3><div class="code">RUSH35</div><br><button class="btn btn-light btn-sm" data-act="copy" data-copy="RUSH35">${ic.copy}Скопировать</button></div><div class="promo-pct">%</div></div>
      <div class="promo promo-daily"><div><h3>Ежедневный бонус</h3><p id="dailyHome">${dailyLeft() ? 'Следующий через ' + dailyText() : 'Уже доступен! До 250 ₽ на баланс'}</p><a class="btn btn-outline btn-sm" href="#/bonus">${ic.gift}Получить</a></div><img src="assets/soldier.png" alt=""></div>
    </div>
    <div class="features">
      ${[['shield', 'Честно', 'Результат определяется до начала анимации — рулетка лишь показывает выпавший предмет.'], ['bolt', 'Быстрый вывод', 'Скины уходят в Steam через трейд за пару минут.'], ['gift', 'Бонусы', 'Ежедневный бонус, промокоды и кэшбэк за ранг.'], ['chat', 'Поддержка 24/7', 'Отвечаем в чате и Telegram в любое время.']]
        .map(([i, t, p]) => `<div class="feat"><div class="fi">${ic[i]}</div><h3>${t}</h3><p>${p}</p></div>`).join('')}
    </div>
  </section>`;
}
const caseCard = c => `<a class="case-card" href="#/case/${c.id}" style="--ca:${c.th.a}" data-price="${c.price}" data-q="${esc((c.name + ' ' + c.items.map(s => s.name).join(' ')).toLowerCase())}">
  <div class="cc-art">${caseArt(c)}</div>
  <div class="cc-body">
    <div class="cc-name">${c.name}</div>
    <div class="cc-foot"><span class="cc-price">${money(c.price)}</span><span class="btn btn-outline btn-sm cc-open">Открыть</span></div>
  </div>
</a>`;
function mountHome() {
  // живой счётчик открытых кейсов
  every(() => { statOpened += randi(1, 4); const b = $('#sbOpened'); if (b) b.textContent = fmt(statOpened); }, 2200);
}

/* =========================================================
   ВСЕ КЕЙСЫ
   ========================================================= */
function pageCases() {
  return `<section class="container">
    <div class="page-head"><h1>Все <em>кейсы</em></h1><p>Выберите кейс, откройте до 7 штук за раз и забирайте дроп в инвентарь.</p></div>
    <div class="filterbar">
      <div class="search"><input class="inp" id="caseQ" placeholder="Поиск кейса или скина" autocomplete="off">${ic.search}</div>
      <div class="chips" id="chips"><button class="chip on" data-f="all">Все</button><button class="chip" data-f="0-100">до 100 ₽</button><button class="chip" data-f="100-500">100–500 ₽</button><button class="chip" data-f="500-1e9">500+ ₽</button></div>
      <label class="switch"><input type="checkbox" id="availChk"><i></i>Доступные</label>
    </div>
    <div class="cases-grid" id="casesGrid">${CASES.map(caseCard).join('')}</div>
    <div class="empty hidden" id="casesEmpty">${ic.search}Ничего не найдено — попробуйте другой фильтр</div>
  </section>`;
}
function mountCases() {
  let f = 'all';
  const apply = () => {
    const q = $('#caseQ').value.trim().toLowerCase(), avail = $('#availChk').checked;
    let shown = 0;
    $$('#casesGrid .case-card').forEach(card => {
      const p = +card.dataset.price; let ok = true;
      if (f !== 'all') { const [a, b] = f.split('-').map(Number); ok = p >= a && p < b; }
      if (q && !card.dataset.q.includes(q)) ok = false;
      if (avail && (!st.user || p > st.balance)) ok = false;
      card.classList.toggle('hidden', !ok); if (ok) shown++;
    });
    $('#casesEmpty').classList.toggle('hidden', shown > 0);
  };
  $('#caseQ').oninput = apply; $('#availChk').onchange = apply;
  $$('#chips .chip').forEach(b => b.onclick = () => { f = b.dataset.f; $$('#chips .chip').forEach(x => x.classList.toggle('on', x === b)); apply(); });
}

/* =========================================================
   ТОП ИГРОКОВ
   ========================================================= */
let topPeriod = 'week';
function topData(period) {
  let h = { week: 7, month: 30, all: 365 }[period];
  const R = () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mult = { week: 1, month: 3.6, all: 22 }[period];
  const pricey = CATALOG.filter(s => s.p >= 3000);
  const names = NICKS.slice().sort(() => R() - .5).slice(0, 25);
  let won = 420000 * mult * (0.9 + R() * .2);
  return names.map(n => {
    won *= 0.8 + R() * .12;
    const opened = Math.round(won / (90 + R() * 160));
    const best = pricey[Math.floor(Math.pow(R(), .6) * pricey.length)];
    return { n, won: Math.round(won / 10) * 10, opened, best };
  });
}
function pageTop() {
  return `<section class="container">
    <div class="page-head top-head"><div><h1>Топ <em>игроков</em></h1><p>Самые удачливые игроки RUSH CASE. Рейтинг по сумме выигрышей.</p></div>
      <div class="seg" id="topSeg"><button data-p="week">Неделя</button><button data-p="month">Месяц</button><button data-p="all">Всё время</button></div></div>
    <div id="topBody"></div>
  </section>`;
}
function mountTop() {
  $$('#topSeg button').forEach(b => b.onclick = () => { topPeriod = b.dataset.p; drawTop(); });
  drawTop();
}
function drawTop() {
  $$('#topSeg button').forEach(b => b.classList.toggle('on', b.dataset.p === topPeriod));
  const list = topData(topPeriod);
  const pod = [list[1], list[0], list[2]];
  const medal = ['silver', 'gold', 'bronze'], place = [2, 1, 3];
  const me = st.user ? { won: st.stats.spent, pos: list.filter(x => x.won > st.stats.spent).length + 1 } : null;
  $('#topBody').innerHTML = `
    <div class="podium">${pod.map((p, i) => `
      <div class="pod pod-${medal[i]}">
        ${place[i] === 1 ? `<span class="pod-crown">${ic.crown}</span>` : ''}
        <span class="pod-place">${place[i]}</span>
        ${ava({ name: p.n }, 'xl')}
        <b class="pod-name">${esc(p.n)}</b>
        <span class="pod-won">${money(p.won)}</span>
        <div class="pod-best r-${p.best.r}"><img src="${imgUrl(p.best, 'm')}" alt=""><span>${esc(p.best.name)}</span></div>
      </div>`).join('')}</div>
    <div class="top-table">
      <div class="tt-row tt-h"><span>#</span><span>Игрок</span><span>Кейсов</span><span>Лучший дроп</span><span>Выиграно</span></div>
      ${list.slice(3).map((p, i) => `<div class="tt-row"><span class="tt-pl">${i + 4}</span><span class="tt-u">${ava({ name: p.n }, 'xs')}${esc(p.n)}</span><span>${fmt(p.opened)}</span>
        <span class="tt-best r-${p.best.r}"><img src="${imgUrl(p.best, 'm')}" alt="">${esc(p.best.name)}</span><span class="tt-won">${money(p.won)}</span></div>`).join('')}
    </div>
    ${me ? `<div class="top-me">${ava(st.user, 'xs')}<b>Ваше место: #${me.pos}</b><span>Открыто кейсов на ${money(me.won)}</span><a class="btn btn-primary btn-sm" href="#/cases">Подняться выше</a></div>`
      : `<div class="top-me"><b>Хотите в топ?</b><span>Войдите и открывайте кейсы — рейтинг обновляется каждый день.</span><button class="btn btn-primary btn-sm" data-act="login">${ic.login}Войти</button></div>`}`;
}

/* =========================================================
   CASE PAGE
   ========================================================= */
let caseN = 1, spinning = false, spinId = 0;
const STRIP_LEN = 78, WIN_AT = 70;
const itemCard = (s, extra = '') => `<div class="icard r-${s.r}">${extra}<img src="${imgUrl(s, 'm')}" alt="" loading="lazy"><div class="ic-w">${esc(s.w)}</div><div class="ic-f">${esc(s.f)}</div><div class="ic-p">${money(s.p)}</div></div>`;
const rcard = (s, win) => `<div class="rcard r-${s.r}${win ? ' is-win' : ''}"><img src="${imgUrl(s, 'm')}" alt="" draggable="false"><div class="rc-w">${esc(s.w)}</div><div class="rc-f">${esc(s.f)}</div></div>`;
function pageCase(id) {
  const c = caseById(id); if (!c) return page404();
  const ghost = Array.from({ length: 12 }, () => { const s = roll(c.items, 'fw'); return `<div class="gcard r-${s.r}"><img src="${imgUrl(s, 'm')}" alt=""><div class="gc-w">${esc(s.w)}</div><div class="gc-f">${esc(s.f)}</div></div>`; }).join('');
  const embers = Array.from({ length: 44 }, () => `<i style="left:${rand(4, 96)}%;--d:${rand(3, 7)}s;--dl:${rand(0, 7)}s;--x:${rand(-60, 60)}px;--s:${rand(.5, 1.3)}"></i>`).join('');
  return `<section class="container case-page" style="--ca:${c.th.a}">
    <div class="cp-head"><a href="#/cases" class="back">${ic.left}Все кейсы</a>
      <div class="cp-title"><i class="cp-line l"></i><h1>Кейс «${c.name}»</h1><i class="cp-line r"></i></div>
      <div class="cp-price">${ic.coins}${money(c.price)}</div></div>
    <div class="rl-framed"><i class="rl-floor"></i><div class="rl-wrap"><div class="rl-halo"><i></i></div><div class="rl" id="rl" style="--ca:${c.th.a}">
      <svg class="rl-frame" id="rlFrame" aria-hidden="true"><polygon class="f-glow"/><polygon class="f-line"/></svg>
      <div class="rl-side l"></div><div class="rl-side r"></div>
      <div class="rl-stage"><i class="rs-burst"></i><i class="rs-glow"></i><div class="rs-embers">${embers}</div><i class="rs-ground"></i></div>
      <div class="rl-idle"><div class="rl-ghost">${ghost}</div>${caseArt(c, 'big float')}</div>
      <div class="rl-strips" id="strips"></div>
      <div class="rl-marker"></div>
      <div class="rl-reveal" id="reveal"></div>
    </div></div><img class="rl-frame-img" src="assets/frame-case.png" alt="" draggable="false"></div>
    <div class="cc" id="cc"></div>
    ${secTitle('Содержимое кейса')}
    <div class="items-grid">${c.items.map(s => itemCard(s)).join('')}</div>
  </section>`;
}
let rlRO = null;
const CHAMFER = 22;
function drawFrame() {
  const rl = $('#rl'), svg = $('#rlFrame'); if (!rl || !svg) return;
  const w = rl.clientWidth, h = rl.clientHeight, k = window.innerWidth < 720 ? 12 : CHAMFER, o = 1;
  const pts = [[k, o], [w - k, o], [w - o, k], [w - o, h - k], [w - k, h - o], [k, h - o], [o, h - k], [o, k]].map(p => p.join(',')).join(' ');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  $$('polygon', svg).forEach(p => p.setAttribute('points', pts));
  rl.parentElement.style.setProperty('--ch', k + 'px');
}
function mountCase(id) {
  const c = caseById(id); if (!c) return;
  spinning = false;
  ccIdle(c);
  if (rlRO) rlRO.disconnect();
  rlRO = new ResizeObserver(drawFrame); rlRO.observe($('#rl'));
  drawFrame();
}
function resetRoulette() {
  const rl = $('#rl'); if (!rl) return;
  rl.classList.remove('spinning', 'revealed', 'vert'); delete rl.dataset.n;
  $('#strips').innerHTML = ''; $('#reveal').innerHTML = '';
}
function ccIdle(c) {
  const cc = $('#cc'); if (!cc) return;
  const cost = c.price * caseN;
  let main;
  if (!st.user) main = `<button class="btn btn-primary btn-xl btn-cham" data-act="login">${ic.login}Войти и открыть</button>`;
  else if (st.balance >= cost) main = `<button class="btn btn-primary btn-xl btn-cham" id="openBtn">${ic.coins}Открыть за ${money(cost)}</button>`;
  else main = `<button class="btn btn-primary btn-xl btn-cham" data-act="deposit" data-need="${cost - st.balance}">${ic.wallet}Пополнить на ${money(cost - st.balance)}</button>`;
  cc.innerHTML = `<div class="mult" role="group" aria-label="Количество кейсов">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button class="${n === caseN ? 'on' : ''}" data-n="${n}">x${n}</button>`).join('')}</div>
    <div class="cc-btns">${main}<button class="btn btn-xl btn-cham btn-gline" id="demoBtn">${ic.eye}Демо</button></div>
    <label class="switch"><input type="checkbox" id="fastChk"${st.fast ? ' checked' : ''}><i></i>Быстрое открытие</label>
    ${!st.user ? '<div class="cc-note">В демо-режиме выигрыш не сохраняется. <b>Войдите</b>, чтобы забирать скины по-настоящему.</div>' : ''}`;
  $$('.mult button', cc).forEach(b => b.onclick = () => { caseN = +b.dataset.n; Snd.click(); ccIdle(c); });
  $('#fastChk').onchange = e => { st.fast = e.target.checked; save(); };
  const ob = $('#openBtn'); if (ob) ob.onclick = () => openCase(c, false);
  $('#demoBtn').onclick = () => openCase(c, true);
}
async function openCase(c, demo) {
  if (spinning) return;
  const n = caseN, cost = c.price * n;
  if (!demo) {
    if (!st.user) return openAuth('login');
    if (st.balance < cost) return openDeposit(cost - st.balance);
  }
  resetRoulette();
  const wins = Array.from({ length: n }, () => roll(c.items));
  wins.forEach(s => { new Image().src = imgUrl(s, 'l'); }); // большие картинки грузим, пока крутится рулетка
  let given = [];
  if (!demo) {
    setBalance(st.balance - cost);
    given = wins.map(s => giveItem(s, c.id));
    st.stats.opened += n; st.stats.spent += cost; save();
  }
  spinning = true;
  const my = ++spinId;
  const rl = $('#rl'), box = $('#strips');
  rl.dataset.n = n;
  rl.classList.toggle('vert', n > 5);
  const vert = n > 5; // много кейсов — вертикальные барабаны в ряд
  box.innerHTML = wins.map(w => `<div class="strip${vert ? ' v' : ''}"><div class="track">${Array.from({ length: STRIP_LEN }, (_, i) => rcard(i === WIN_AT ? w : roll(c.items, 'fw'), i === WIN_AT)).join('')}</div></div>`).join('');
  $('#cc').innerHTML = `<div class="cc-spin"><span class="spinner"></span>Открываем кейс…<button class="link" id="skipBtn">Пропустить</button></div>`;
  // 1) отщёлкивание замка — картинка кейса трясётся, лента ещё не крутится
  rl.classList.add('unlocking'); Snd.lock();
  await sleep(st.fast ? 700 : 1150);
  if (my !== spinId || !document.body.contains(rl)) return;
  rl.classList.remove('unlocking');
  // 2) прокрутка
  rl.classList.add('spinning');
  const strips = $$('.strip', box);
  $('#skipBtn').onclick = () => strips.forEach(s => s._skip && s._skip());
  await sleep(60);
  const dur = st.fast ? 3000 : 11000;
  await Promise.all(strips.map((s, i) => spinStrip(s, dur + i * (vert ? 110 : 260), i === 0)));
  await sleep(550);
  if (my !== spinId || !document.body.contains(rl)) return;
  showReveal(c, wins, given, demo);
  spinning = false;
}
function spinStrip(strip, dur, withSound) {
  return new Promise(res => {
    const track = strip.firstElementChild, win = $('.is-win', track);
    const v = strip.classList.contains('v');
    const tf = px => v ? `translate3d(0,${px}px,0)` : `translate3d(${px}px,0,0)`;
    const pos = () => { const m = new DOMMatrixReadOnly(getComputedStyle(track).transform); return v ? m.m42 : m.m41; };
    const cw = v ? win.offsetHeight : win.offsetWidth, center = (v ? strip.clientHeight : strip.clientWidth) / 2;
    const base = (v ? win.offsetTop : win.offsetLeft) + cw / 2 - center;
    const jitter = (Math.random() - .5) * cw * .78;
    const target = -(base + jitter);
    track.style.transition = 'none'; track.style.transform = tf(0);
    void track.offsetWidth;
    track.style.transition = `transform ${dur}ms cubic-bezier(.1,.55,.06,1)`;
    track.style.transform = tf(target);
    let raf = 0, last = null, done = false;
    if (withSound) {
      const step = cw + (parseFloat(getComputedStyle(track).gap) || 8);
      const loop = () => {
        const x = -pos();
        const idx = Math.floor((x + center) / step);
        if (last !== null && idx !== last) Snd.tickCase();
        last = idx; raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    const finish = () => {
      if (done) return; done = true; cancelAnimationFrame(raf);
      track.style.transition = 'transform .55s cubic-bezier(.3,1.35,.5,1)';
      track.style.transform = tf(-base);
      setTimeout(() => { strip.classList.add('done'); res(); }, 560);
    };
    let safety = setTimeout(finish, dur + 250);
    track.addEventListener('transitionend', function te(e) { if (e.target !== track) return; track.removeEventListener('transitionend', te); finish(); });
    strip._skip = () => {
      if (done) return; clearTimeout(safety);
      const cur = pos();
      track.style.transition = 'none'; track.style.transform = tf(cur); void track.offsetWidth;
      track.style.transition = 'transform .4s cubic-bezier(.2,.8,.3,1)'; track.style.transform = tf(target);
      safety = setTimeout(finish, 450);
    };
  });
}
function showReveal(c, wins, given, demo) {
  const best = wins.reduce((a, s) => s.p > a.p ? s : a, wins[0]);
  const tier = best.r === 'rare' || best.p >= c.price * 8 ? 'jackpot' : best.p > c.price ? 'profit' : 'cheap';
  Snd[tier]();
  if (tier === 'jackpot') { burst(110); setTimeout(() => burst(70), 700); }
  const one = wins.length === 1;
  const topR = wins.reduce((a, s) => RAR[s.r].o > RAR[a].o ? s.r : a, wins[0].r);
  const rays = ''; // без лучей и свечения за выпавшим предметом
  $('#reveal').innerHTML = `${one ? '' : `<div class="rv-bg r-${topR}">${rays}</div>`}<div class="rv-inner ${one ? 'one' : 'many'}">${wins.map((s, i) => `
    <div class="rv-card r-${s.r}" style="--d:${i * 110}ms" ${given[i] ? `data-id="${given[i].id}"` : ''}>
      <div class="rv-imgw">${one ? rays : ''}<img src="${imgUrl(s, 'l')}" alt=""></div>
      <div class="rv-rar">${RAR[s.r].n}</div>
      <div class="rv-name"><span>${esc(s.w)}</span>${esc(s.f)}</div>
      <div class="rv-price">${money(s.p)}</div>
      ${!demo && !one ? `<button class="btn btn-sm btn-dark" data-sellone="${given[i].id}">Продать</button>` : ''}
    </div>`).join('')}</div>`;
  $('#rl').classList.add('revealed');
  if (!demo) wins.forEach(s => pushLive({ n: s.name, c: c.id, u: st.user.name, mine: true }));
  ccDone(c, wins, given, demo);
}
function ccDone(c, wins, given, demo) {
  const cc = $('#cc');
  const again = () => openCase(c, demo);
  const back = () => { resetRoulette(); ccIdle(c); };
  if (demo) {
    cc.innerHTML = `<div class="cc-note">Это было <b>демо-открытие</b> — предмет не сохранён.</div>
      <div class="cc-btns">${st.user ? `<button class="btn btn-primary btn-xl btn-cham" id="realBtn">Открыть за ${money(c.price * caseN)}</button>` : `<button class="btn btn-primary btn-xl btn-cham" data-act="login">${ic.login}Войти и открыть</button>`}<button class="btn btn-xl btn-cham btn-gline" id="againBtn">Ещё демо</button></div>
      <button class="btn btn-ghost" id="backBtn">${ic.left}К кейсу</button>`;
    const rb = $('#realBtn'); if (rb) rb.onclick = () => openCase(c, false);
  } else {
    const live = () => given.filter(g => g.st === 'own');
    const sum = () => live().reduce((a, g) => a + SK[g.n].p, 0);
    const draw = () => {
      const left = live().length;
      cc.innerHTML = `<div class="cc-btns">
          ${left ? `<button class="btn btn-xl btn-cham btn-gline" id="sellAll">${ic.coin}Продать${wins.length > 1 ? ' всё' : ''} за ${money(sum())}</button>` : ''}
          <button class="btn btn-primary btn-xl btn-cham" id="againBtn">Открыть ещё за ${money(c.price * caseN)}</button>
        </div>
        <button class="btn btn-ghost" id="backBtn">${left ? ic.check + 'Забрать в инвентарь' : ic.left + 'К кейсу'}</button>
        ${left ? '<div class="cc-note">Предметы уже в вашем <b>профиле</b> — их можно продать или вывести в Steam позже.</div>' : ''}`;
      const sa = $('#sellAll');
      if (sa) sa.onclick = () => { let t = 0; live().forEach(g => { t += sellItem(g.id, true); }); Snd.coin(); toast(`Продано на <b>+${money(t)}</b>`); markSold(); draw(); };
      $('#againBtn').onclick = again; $('#backBtn').onclick = () => { if (live().length) toast('Предметы сохранены в профиле'); back(); };
    };
    const markSold = () => given.forEach(g => { if (g.st !== 'own') { const el = $(`.rv-card[data-id="${g.id}"]`); if (el) { el.classList.add('rv-sold'); const b = $('[data-sellone]', el); if (b) b.outerHTML = '<div class="rv-rar" style="color:var(--txt3)">Продано</div>'; } } });
    $$('[data-sellone]').forEach(b => b.onclick = () => { sellItem(b.dataset.sellone); markSold(); draw(); });
    draw();
    return;
  }
  $('#againBtn').onclick = again; $('#backBtn').onclick = back;
}

/* =========================================================
   UPGRADE
   ========================================================= */
const upg = { sel: [], bal: 0, to: null, q: '', sort: 'asc', rot: 0, busy: false };
const ARC_R = 138;
const upgItems = () => upg.sel.map(id => st.inv.find(x => x.id === id && x.st === 'own')).filter(Boolean);
function upgValue() { return upgItems().reduce((a, x) => a + SK[x.n].p, 0) + upg.bal; }
const upgChance = (v, t) => (v && t) ? clamp(v / t.p * .92, .01, .8) : 0;
/* дуга шанса по центру снизу кольца */
function arcPath(span) {
  span = Math.min(span, 359.9);
  const pt = a => { const r = a * Math.PI / 180; return [160 + ARC_R * Math.cos(r), 160 + ARC_R * Math.sin(r)]; };
  const [x1, y1] = pt(90 - span / 2), [x2, y2] = pt(90 + span / 2);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${ARC_R} ${ARC_R} 0 ${span > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
const chanceColor = ch => `hsl(${Math.round(clamp(ch / .8, 0, 1) * 120)} 85% 60%)`;
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
function pageUpgrade() {
  return `<section class="container upg">
    <div class="page-head"><h1>Апгрейд <em>скинов</em></h1><p>Соберите ставку из одного или нескольких скинов и/или баланса и выберите скин дороже. Если стрелка остановится в цветной зоне — скин ваш.</p></div>
    <div class="upg-main">
      <div class="upg-slot" id="upgFrom"></div>
      <div class="upg-center">
        <div class="wheel" id="wheel">
          <svg viewBox="0 0 320 320">
            <defs>
              <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22c55e"/><stop offset=".5" stop-color="#facc15"/><stop offset="1" stop-color="#ef4444"/></linearGradient>
              <radialGradient id="innerGrad"><stop offset="0" stop-color="#1f1b15"/><stop offset="1" stop-color="#0b0a09"/></radialGradient>
              <linearGradient id="rimOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a5650"/><stop offset=".5" stop-color="#2a2825"/><stop offset="1" stop-color="#141311"/></linearGradient>
              <linearGradient id="rimIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121110"/><stop offset=".5" stop-color="#2a2825"/><stop offset="1" stop-color="#5f5a52"/></linearGradient>
              <!-- внутренняя тень: канава утоплена, свет сверху -->
              <filter id="groove" x="-10%" y="-10%" width="120%" height="120%">
                <feComponentTransfer in="SourceAlpha" result="inv"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>
                <feGaussianBlur in="inv" stdDeviation="4"/><feOffset dy="5" result="off"/>
                <feFlood flood-color="#000" flood-opacity=".95"/><feComposite in2="off" operator="in"/>
                <feComposite in2="SourceAlpha" operator="in" result="sh"/>
                <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/></feMerge>
              </filter>
              <!-- внутренняя тень канавы: темнее у краёв, глубже у внешнего борта -->
              <radialGradient id="depthGrad" gradientUnits="userSpaceOnUse" cx="160" cy="160" r="151">
                <stop offset=".835" stop-color="#000" stop-opacity=".85"/><stop offset=".87" stop-color="#000" stop-opacity=".35"/><stop offset=".905" stop-color="#000" stop-opacity="0"/>
                <stop offset=".93" stop-color="#000" stop-opacity=".15"/><stop offset=".97" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity=".95"/>
              </radialGradient>
              <linearGradient id="depthTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".5" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
              <filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter>
            </defs>
            <circle cx="160" cy="160" r="156" class="w-ticks"/>
            <circle cx="160" cy="160" r="${ARC_R + 13}" class="w-rim-o"/>
            <circle cx="160" cy="160" r="${ARC_R}" class="w-track" filter="url(#groove)"/>
            <g filter="url(#groove)"><path class="w-arc" id="wArc" d="M0 0"/></g>
            <path class="w-arc-gloss" id="wArcGloss" d="M0 0" filter="url(#soft)"/>
            <circle cx="160" cy="160" r="${ARC_R}" class="w-depth"/><circle cx="160" cy="160" r="${ARC_R}" class="w-depth2"/>
            <circle cx="160" cy="160" r="${ARC_R - 13}" class="w-rim-i"/>
            <circle cx="160" cy="160" r="116" class="w-inner"/>
            <circle cx="160" cy="160" r="104" class="w-dash"/>
          </svg>
          <div class="w-ptr" id="wPtr"><svg class="w-tri" viewBox="0 0 40 48" aria-hidden="true">
            <defs>
              <linearGradient id="triL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d5d9e0"/></linearGradient>
              <linearGradient id="triR" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a7adb7"/><stop offset="1" stop-color="#6b717c"/></linearGradient>
              <linearGradient id="triT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9ecf1"/></linearGradient>
            </defs>
            <path d="M20 46 L2.5 4.5 L20 12 Z" fill="url(#triL)"/>
            <path d="M20 46 L37.5 4.5 L20 12 Z" fill="url(#triR)"/>
            <path d="M2.5 4.5 L37.5 4.5 L20 12 Z" fill="url(#triT)"/>
            <path d="M20 46 L2.5 4.5 L37.5 4.5 Z" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1" stroke-linejoin="round"/>
            <path d="M20 44 L20 13" stroke="rgba(255,255,255,.55)" stroke-width=".8"/>
          </svg></div>
          <div class="w-center"><b id="wChance">0%</b><span id="wLabel">шанс</span></div>
        </div>
        <div class="mults">${[1.5, 2, 3, 5, 10].map(m => `<button data-m="${m}">x${m}</button>`).join('')}</div>
        <button class="btn btn-primary btn-xl" id="upgBtn">${ic.up}Апгрейд</button>
      </div>
      <div class="upg-slot" id="upgTo"></div>
    </div>
    <div class="upg-lists">
      <div class="panel">
        <div class="panel-h"><h3>Ставка</h3><span class="upg-sum" id="upgSum"></span><div class="bal-wrap"><button class="btn btn-dark btn-sm" id="upgBalBtn" aria-haspopup="true"></button><div class="bal-pop hidden" id="upgBalPop"></div></div><button class="btn btn-dark btn-sm" id="upgAll">Выбрать всё</button><button class="btn btn-ghost btn-sm" id="upgClr">Очистить</button></div>
        <div class="mini-grid" id="upgSrc"></div>
      </div>
      <div class="panel">
        <div class="panel-h"><h3>Желаемый скин</h3><input class="inp" id="upgQ" placeholder="Поиск" autocomplete="off"><div class="seg" id="upgSort"><button data-s="asc">₽ ↑</button><button data-s="desc">₽ ↓</button></div></div>
        <div class="mini-grid" id="upgTargets"></div>
      </div>
    </div>
  </section>`;
}
const mcard = (s, attrs = '', extra = '') => `<div class="mcard r-${s.r}" ${attrs}>${extra}<img src="${imgUrl(s, 's')}" alt="" loading="lazy"><div class="mc-w">${esc(s.w)}</div><div class="mc-f">${esc(s.f)}</div><div class="mc-p">${money(s.p)}</div></div>`;
function mountUpgrade() {
  upg.busy = false;
  $$('#upgSort button').forEach(b => b.onclick = () => { upg.sort = b.dataset.s; drawTargets(); });
  $('#upgQ').oninput = e => { upg.q = e.target.value.trim().toLowerCase(); drawTargets(); };
  $$('.mults button').forEach(b => b.onclick = () => {
    if (upg.busy) return;
    const v = upgValue(); if (!v) return toast('Сначала соберите ставку', 'err');
    const want = v * +b.dataset.m;
    const best = CATALOG.filter(s => s.p > v * 1.05).sort((a, z) => Math.abs(a.p - want) - Math.abs(z.p - want))[0];
    if (best) { upg.to = best.name; drawUpg(); }
  });
  $('#upgAll').onclick = () => { if (upg.busy) return; if (!st.user) return openAuth('login'); upg.sel = own().map(x => x.id); Snd.safeSel(true); drawUpg(); };
  $('#upgClr').onclick = () => { if (upg.busy) return; upg.sel = []; upg.bal = 0; drawUpg(); };
  const pop = $('#upgBalPop');
  $('#upgBalBtn').onclick = e => {
    e.stopPropagation();
    if (upg.busy) return;
    if (!st.user) return openAuth('login');
    pop.classList.toggle('hidden'); drawBalPop();
    if (!pop.classList.contains('hidden')) { const i = $('#upgAmt'); i.focus(); i.select(); }
  };
  pop.onclick = e => e.stopPropagation();
  const closePop = e => { if (!document.body.contains(pop)) return document.removeEventListener('click', closePop); if (!e.target.closest('.bal-wrap')) pop.classList.add('hidden'); };
  document.addEventListener('click', closePop);
  $('#upgBtn').onclick = runUpgrade;
  upg.rot = 0; $('#wPtr').style.transform = 'rotate(0deg)';
  drawUpg();
}
function stakeSlot(items, v) {
  if (!items.length && !upg.bal) return `<span class="us-label">Ваша ставка</span><div class="us-empty"><div class="plus">${ic.plus}</div>Выберите один или несколько скинов ниже и/или добавьте баланс</div>`;
  const head = `<span class="us-label">Ваша ставка</span><button class="us-x" id="fromX" aria-label="Очистить ставку">${ic.close}</button>`;
  if (items.length === 1 && !upg.bal) {
    const s = SK[items[0].n];
    return head + `<img src="${imgUrl(s, 'l')}" alt=""><div class="us-name"><span>${esc(s.w)}</span>${esc(s.f)}</div><div class="us-price">${money(s.p)}</div>`;
  }
  if (!items.length) return head + `<div class="bal-src"><div class="coinbig">₽</div></div><div class="us-name"><span>С баланса</span>Ставка</div><div class="us-price">${money(v)}</div>`;
  const sorted = items.slice().sort((a, b) => SK[b.n].p - SK[a.n].p);
  const slots = upg.bal ? 3 : 4, shown = sorted.length > slots ? sorted.slice(0, slots - 1) : sorted;
  let tiles = shown.map(x => { const s = SK[x.n]; return `<div class="us-tile r-${s.r}"><img src="${imgUrl(s, 'm')}" alt=""></div>`; }).join('');
  if (sorted.length > shown.length) tiles += `<div class="us-tile more">+${sorted.length - shown.length}</div>`;
  if (upg.bal) tiles += `<div class="us-tile coin"><i>₽</i><b>+${money(upg.bal)}</b></div>`;
  const n = items.length;
  return head + `<div class="us-stack">${tiles}</div><div class="us-name"><span>${n} ${plural(n, 'скин', 'скина', 'скинов')}${upg.bal ? ' + баланс' : ''}</span>Сумма ставки</div><div class="us-price">${money(v)}</div>`;
}
function drawUpg() {
  upg.sel = upg.sel.filter(id => st.inv.find(x => x.id === id && x.st === 'own'));
  upg.bal = st.user ? clamp(Math.round(upg.bal), 0, st.balance) : 0;
  const items = upgItems(), v = upgValue();
  if (upg.to && SK[upg.to].p <= v * 1.05) upg.to = null;
  $$('#upgSort button').forEach(b => b.classList.toggle('on', b.dataset.s === upg.sort));
  // слот ставки
  let top = null;
  items.forEach(x => { const r = SK[x.n].r; if (!top || RAR[r].o > RAR[top].o) top = r; });
  const from = $('#upgFrom');
  from.className = 'upg-slot' + (top ? ' r-' + top : '');
  from.innerHTML = stakeSlot(items, v);
  const fx = $('#fromX'); if (fx) fx.onclick = () => { if (upg.busy) return; upg.sel = []; upg.bal = 0; drawUpg(); };
  // слот цели
  const to = $('#upgTo'), ts = upg.to && SK[upg.to];
  to.className = 'upg-slot' + (ts ? ' r-' + ts.r : '');
  to.innerHTML = ts ? `<span class="us-label">Вы получите</span><button class="us-x" id="toX" aria-label="Убрать">${ic.close}</button><img src="${imgUrl(ts, 'l')}" alt=""><div class="us-name"><span>${esc(ts.w)}</span>${esc(ts.f)}</div><div class="us-price">${money(ts.p)}</div>`
    : `<span class="us-label">Вы получите</span><div class="us-empty"><div class="plus">${ic.star}</div>Выберите желаемый скин справа</div>`;
  if (ts) $('#toX').onclick = () => { if (upg.busy) return; upg.to = null; drawUpg(); };
  // колесо
  const ch = upgChance(v, ts);
  if (upg.lastCh != null && ch && Math.abs(ch - upg.lastCh) > .001) Snd.safeDial(ch);
  upg.lastCh = ch;
  const arc = $('#wArc');
  arc.setAttribute('d', ch ? arcPath(ch * 360) : 'M0 0');
  arc.style.opacity = ch ? 1 : 0;
  const gl = $('#wArcGloss'); gl.setAttribute('d', ch ? arcPath(ch * 360) : 'M0 0'); gl.style.opacity = ch ? 1 : 0;
  $('#wheel').classList.remove('win', 'lose');
  const cEl = $('#wChance');
  cEl.textContent = ch ? (ch * 100).toFixed(ch < .1 ? 2 : 1).replace('.', ',') + '%' : '0%';
  cEl.style.color = ch ? chanceColor(ch) : '';
  $('#wLabel').textContent = ts && v ? `x${(ts.p / v).toFixed(2)}` : 'шанс';
  // инвентарь (мультивыбор)
  $('#upgSum').innerHTML = v ? `${items.length} шт.${upg.bal ? ' + баланс' : ''} · <b>${money(v)}</b>` : '';
  const src = $('#upgSrc'), list = own().slice().sort((a, b) => SK[b.n].p - SK[a.n].p);
  src.innerHTML = list.length ? list.map(x => mcard(SK[x.n], `data-inv="${x.id}"`)).join('')
    : `<div class="empty">${ic.box}${st.user ? 'Инвентарь пуст. Откройте кейс или добавьте баланс кнопкой «С баланса».' : 'Войдите, чтобы увидеть свой инвентарь.'}<a class="btn btn-primary btn-sm" href="#/">К кейсам</a></div>`;
  $$('[data-inv]', src).forEach(el => {
    const id = el.dataset.inv;
    if (upg.sel.includes(id)) el.classList.add('sel');
    el.onclick = () => { if (upg.busy) return; const on = !upg.sel.includes(id); upg.sel = on ? [...upg.sel, id] : upg.sel.filter(z => z !== id); Snd.safeSel(on); drawUpg(); };
  });
  drawBalPop();
  drawTargets();
}
/* кнопка «С баланса» и её выпадающее окно */
function drawBalPop() {
  const btn = $('#upgBalBtn'), pop = $('#upgBalPop'); if (!btn) return;
  btn.innerHTML = upg.bal ? `${ic.wallet}+${money(upg.bal)}` : `${ic.wallet}С баланса`;
  btn.classList.toggle('on', !!upg.bal);
  if (!st.user) { pop.classList.add('hidden'); return; }
  if (!pop.dataset.ready) {
    pop.dataset.ready = 1;
    pop.innerHTML = `<div class="bp-h">Добавить с баланса<small id="bpAvail"></small></div>
      <div class="dep-amt"><input class="inp" id="upgAmt" type="number" min="0" step="10" aria-label="Сумма с баланса"><span>₽</span></div>
      <div class="amounts">${[50, 100, 500].map(a => `<button data-add="${a}">+${a} ₽</button>`).join('')}<button data-add="max">Весь</button></div>
      <div class="bp-f"><button class="btn btn-ghost btn-sm" data-add="0">Сбросить</button><button class="btn btn-primary btn-sm" id="bpOk">Готово</button></div>`;
    $('#upgAmt').oninput = e => { if (upg.busy) return; upg.bal = clamp(Math.round(+e.target.value || 0), 0, st.balance); upg.typing = true; drawUpg(); upg.typing = false; };
    $('#upgAmt').onkeydown = e => { if (e.key === 'Enter') pop.classList.add('hidden'); };
    $$('[data-add]', pop).forEach(b => b.onclick = () => {
      if (upg.busy) return;
      const a = b.dataset.add;
      upg.bal = a === 'max' ? st.balance : a === '0' ? 0 : clamp(upg.bal + +a, 0, st.balance);
      Snd.click(); drawUpg();
    });
    $('#bpOk').onclick = () => pop.classList.add('hidden');
  }
  $('#bpAvail').textContent = 'Доступно: ' + money(st.balance);
  if (!upg.typing) $('#upgAmt').value = upg.bal;
}
function drawTargets() {
  const v = upgValue(), box = $('#upgTargets'); if (!box) return;
  let list = CATALOG.filter(s => s.p > v * 1.05 && (!upg.q || s.name.toLowerCase().includes(upg.q)));
  if (upg.sort === 'desc') list = list.slice().reverse();
  box.innerHTML = list.length ? list.map(s => mcard(s, `data-t="${esc(s.name)}"`, v ? `<span class="mc-x">${(upgChance(v, s) * 100).toFixed(1)}%</span>` : '')).join('') : `<div class="empty">${ic.search}Ничего не найдено</div>`;
  $$('[data-t]', box).forEach(el => { if (el.dataset.t === upg.to) el.classList.add('sel'); el.onclick = () => { if (upg.busy) return; upg.to = el.dataset.t; Snd.safeSel(true); drawUpg(); }; });
}
async function runUpgrade() {
  if (upg.busy) return;
  if (!st.user) return openAuth('login');
  const items = upgItems(), v = upgValue(), ts = upg.to && SK[upg.to];
  if (!v) return toast('Выберите скины для ставки или добавьте баланс', 'err');
  if (!ts) return toast('Выберите желаемый скин', 'err');
  if (upg.bal > st.balance) return openDeposit(upg.bal - st.balance);
  const ch = upgChance(v, ts), win = Math.random() < ch;
  // ставка списывается сразу (как на сервере)
  items.forEach(x => { x.st = 'upg'; });
  if (upg.bal) setBalance(st.balance - upg.bal);
  st.stats.upg++; if (win) { st.stats.upgWin++; giveItem(ts, 'upgrade'); }
  save();
  upg.busy = true; $('#upgBtn').disabled = true;
  // старт: рычаг сейфа, стрелка трогается после «клаца»
  Snd.safeStart();
  await sleep(380);
  // зона выигрыша — дуга ±half градусов от низа кольца
  const half = ch * 180, m = Math.min(3, half / 3);
  const off = win ? rand(-(half - m), half - m) : rand(half + 3, 360 - half - 3);
  const d = (180 + off + 360) % 360;
  const ptr = $('#wPtr');
  ptr.style.transition = 'none'; ptr.style.transform = 'rotate(0deg)'; void ptr.offsetWidth; // старт сверху
  upg.rot = 360 * 4 + d;
  ptr.style.transition = 'transform 8.6s cubic-bezier(.18,.62,.06,1)';
  ptr.style.transform = `rotate(${upg.rot}deg)`;
  const cEl = $('#wChance'); cEl.textContent = '…'; cEl.style.color = '';
  // щелчки храповика: тяжелеют при замедлении; последние ~2 с — сердцебиение
  const DUR = 8600, t0 = performance.now();
  let last = null, lastA = null, raf, nextBeat = DUR - 2300;
  const loop = now => {
    const mx = new DOMMatrixReadOnly(getComputedStyle(ptr).transform), a = (Math.atan2(mx.b, mx.a) * 180 / Math.PI + 360) % 360;
    const el = now - t0, dA = lastA == null ? 0 : (a - lastA + 360) % 360; lastA = a;
    const k = Math.floor(a / 15), tense = el > DUR - 2300 ? 1 : 0;
    if (last !== null && k !== last) Snd.safeTick(Math.min(1, dA / 14), tense);
    last = k;
    if (el >= nextBeat && el < DUR - 150) { const p = (el - (DUR - 2300)) / 2300; Snd.heart(.35 + p * .35); nextBeat += 620 - p * 260; }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  await sleep(8750); cancelAnimationFrame(raf);
  const nearMiss = !win && Math.min(Math.abs(off - half), Math.abs(360 - half - off)) < 10;
  const w = $('#wheel'); if (!w) { upg.busy = false; return; }
  w.classList.add(win ? 'win' : 'lose');
  cEl.textContent = win ? 'WIN' : 'LOSE';
  $('#wLabel').textContent = win ? 'скин ваш' : 'не повезло';
  if (win) { Snd.play('upgWin').then(ok => { if (!ok) Snd.safeWin(); }); burst(120); setTimeout(() => burst(60), 600); toast(`Апгрейд успешен: <b>${esc(ts.name)}</b>`); }
  else { if (nearMiss) { Snd.nearMiss(); setTimeout(() => Snd.safeLose(), 450); } else Snd.safeLose(); $('#upgFrom').classList.add('lost'); toast('Апгрейд не удался — попробуйте ещё раз', 'err'); }
  await sleep(1900);
  if (!$('#wheel')) { upg.busy = false; return; }
  // плавно возвращаем стрелку наверх
  ptr.style.transition = 'transform .9s cubic-bezier(.3,.7,.25,1)';
  ptr.style.transform = `rotate(${Math.ceil(upg.rot / 360) * 360}deg)`;
  await sleep(950);
  upg.rot = 0; ptr.style.transition = 'none'; ptr.style.transform = 'rotate(0deg)';
  if (!$('#wheel')) { upg.busy = false; return; }
  upg.busy = false; $('#upgBtn').disabled = false;
  upg.sel = []; upg.bal = 0;
  upg.to = win ? null : upg.to;
  drawUpg();
}

/* =========================================================
   CONTRACTS
   ========================================================= */
let conSel = [], conBusy = false;
function pageContracts() {
  return `<section class="container con">
    <div class="page-head"><h1>Контракты</h1><p>Обменяйте от 3 до 10 своих скинов на один случайный — стоимостью от 25% до 400% от суммы контракта.</p></div>
    <div class="con-main">
      <div class="con-stage" id="conStage">
        <div class="con-slots" id="conSlots"></div>
        <div class="con-core" id="conCore"></div>
        <div class="con-result" id="conResult"></div>
      </div>
      <div class="con-side">
        <div class="con-sum">
          <div class="row">Предметов<b id="conCnt">0 / 10</b></div>
          <div class="row">Сумма контракта<b id="conSum">0 ₽</b></div>
          <div class="row">Возможный дроп<b class="l" id="conRange">—</b></div>
          <button class="btn btn-primary btn-xl btn-block" id="conBtn">${ic.swap}Подписать контракт</button>
        </div>
        <div class="con-rules"><b>Как это работает</b><ul><li>Минимум 3 предмета, максимум 10.</li><li>Предметы контракта сгорают, взамен вы получаете один скин.</li><li>Средняя отдача — около 90% от суммы.</li></ul></div>
      </div>
    </div>
    <div class="panel" style="margin-top:20px">
      <div class="panel-h"><h3>Ваш инвентарь</h3><button class="btn btn-dark btn-sm" id="conAuto">Автовыбор</button><button class="btn btn-ghost btn-sm" id="conClear">Очистить</button></div>
      <div class="mini-grid" id="conInv"></div>
    </div>
  </section>`;
}
function mountContracts() {
  conBusy = false;
  conSel = conSel.filter(id => st.inv.find(x => x.id === id && x.st === 'own'));
  $('#conBtn').onclick = runContract;
  $('#conClear').onclick = () => { if (conBusy) return; conSel = []; drawCon(); };
  $('#conAuto').onclick = () => { if (conBusy) return; conSel = own().slice().sort((a, b) => SK[a.n].p - SK[b.n].p).slice(0, 10).map(x => x.id); drawCon(); };
  drawCon();
}
const conItems = () => conSel.map(id => st.inv.find(x => x.id === id)).filter(Boolean);
function drawCon() {
  const items = conItems(), sum = items.reduce((a, x) => a + SK[x.n].p, 0);
  $('#conSlots').innerHTML = Array.from({ length: 10 }, (_, i) => {
    const x = items[i]; if (!x) return `<div class="cslot">${i + 1}</div>`;
    const s = SK[x.n]; return `<div class="cslot f r-${s.r}" data-rm="${x.id}" title="Убрать"><img src="${imgUrl(s, 's')}" alt=""><span class="cs-p">${money(s.p)}</span></div>`;
  }).join('');
  $$('[data-rm]').forEach(el => el.onclick = () => { if (conBusy) return; conSel = conSel.filter(id => id !== el.dataset.rm); drawCon(); });
  $('#conCnt').textContent = `${items.length} / 10`;
  $('#conSum').textContent = money(sum);
  $('#conRange').textContent = items.length ? `${money(sum * .25)} – ${money(sum * 4)}` : '—';
  $('#conBtn').disabled = items.length < 3;
  const list = own();
  $('#conInv').innerHTML = list.length ? list.map(x => mcard(SK[x.n], `data-pick="${x.id}"`)).join('')
    : `<div class="empty">${ic.box}${st.user ? 'Нужно минимум 3 предмета. Откройте пару кейсов «Сифон и Борода» — это всего 29 ₽.' : 'Войдите, чтобы увидеть свой инвентарь.'}<a class="btn btn-primary btn-sm" href="#/case/sifon">Открыть кейс</a></div>`;
  $$('[data-pick]').forEach(el => {
    const id = el.dataset.pick;
    if (conSel.includes(id)) el.classList.add('sel');
    else if (conSel.length >= 10) el.classList.add('dis');
    el.onclick = () => { if (conBusy) return; conSel = conSel.includes(id) ? conSel.filter(z => z !== id) : [...conSel, id].slice(0, 10); Snd.click(); drawCon(); };
  });
}
async function runContract() {
  if (conBusy) return;
  if (!st.user) return openAuth('login');
  const items = conItems(); if (items.length < 3) return toast('Добавьте минимум 3 предмета', 'err');
  const sum = items.reduce((a, x) => a + SK[x.n].p, 0);
  let pool = CATALOG.filter(s => s.p >= sum * .25 && s.p <= sum * 4);
  if (pool.length < 4) pool = CATALOG.slice().sort((a, b) => Math.abs(Math.log(a.p / sum)) - Math.abs(Math.log(b.p / sum))).slice(0, 8);
  const ch = solveChances(pool, sum * .9);
  const res = roll(pool.map((s, i) => ({ ...s, ch: ch[i] })));
  items.forEach(x => { x.st = 'con'; });
  const got = giveItem(SK[res.name], 'contract');
  const pre = new Image(); pre.src = imgUrl(res, 'l');
  st.stats.con++; save();
  conBusy = true; $('#conBtn').disabled = true; Snd.click();
  // анимация «засасывания»
  const stage = $('#conStage'), r0 = stage.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  $$('.cslot.f').forEach((el, i) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--dx', `${cx - (r.left + r.width / 2)}px`); el.style.setProperty('--dy', `${cy - (r.top + r.height / 2)}px`);
    el.style.transitionDelay = `${i * 90}ms`;
    setTimeout(() => Snd.tick(), i * 90);
    requestAnimationFrame(() => el.classList.add('suck'));
  });
  await sleep(items.length * 90 + 750);
  if (!$('#conCore')) { conBusy = false; return; }
  $('#conCore').classList.add('go');
  await Promise.race([sleep(900).then(() => pre.decode().catch(() => {})), sleep(2500)]);
  if (!$('#conResult')) { conBusy = false; return; }
  const s = SK[res.name];
  Snd.win(RAR[s.r].o); if (RAR[s.r].o >= 5 || s.p > sum * 1.5) burst();
  $('#conResult').innerHTML = `<div class="rv-card r-${s.r}"><div class="rv-imgw"><div class="rv-rays"></div><div class="rv-glow"></div><img src="${imgUrl(s, 'l')}" alt=""></div><div class="rv-rar">${RAR[s.r].n} · x${(s.p / sum).toFixed(2)}</div><div class="rv-name"><span>${esc(s.w)}</span>${esc(s.f)}</div><div class="rv-price">${money(s.p)}</div></div>
    <div class="cc-btns"><button class="btn btn-accent" id="conSell">${ic.coin}Продать за ${money(s.p)}</button><button class="btn btn-primary" id="conNew">Новый контракт</button></div>`;
  $('#conResult').classList.add('on');
  const reset = () => { conSel = []; conBusy = false; $('#conResult').classList.remove('on'); $('#conCore').classList.remove('go'); drawCon(); };
  $('#conSell').onclick = () => { sellItem(got.id); reset(); };
  $('#conNew').onclick = reset;
}

/* =========================================================
   BONUS
   ========================================================= */
const DAILY = [{ v: 5, w: 30, r: 'milspec' }, { v: 10, w: 26, r: 'milspec' }, { v: 15, w: 18, r: 'restricted' }, { v: 25, w: 12, r: 'restricted' }, { v: 50, w: 8, r: 'classified' }, { v: 100, w: 4.5, r: 'covert' }, { v: 250, w: 1.5, r: 'rare' }];
const DAILY_MS = 24 * 3600 * 1000;
const dailyLeft = () => Math.max(0, (st.daily || 0) + DAILY_MS - Date.now());
const dailyText = () => { const s = Math.ceil(dailyLeft() / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
const PROMOS = { WELCOME: { t: 'bal', v: 50, d: '+50 ₽ на баланс' }, RUSH35: { t: 'dep', v: 35, d: '+35% к следующему пополнению' }, GLHF: { t: 'bal', v: 30, d: '+30 ₽ на баланс' } };
const SOCIALS = [{ k: 'tg', n: 'Telegram-канал', i: 'tg' }, { k: 'vk', n: 'Группа ВКонтакте', i: 'vk' }, { k: 'yt', n: 'YouTube-канал', i: 'yt' }];
function pageBonus() {
  const rk = rankOf(st.stats.spent);
  const dw = DAILY.reduce((a, d) => a + d.w, 0);
  return `<section class="container bonus">
    <div class="page-head"><h1>Бонусы</h1><p>Бесплатный баланс каждый день, промокоды, подписки и кэшбэк за ранг. Чем чаще заходишь — тем больше получаешь.</p></div>
    <div class="bonus-grid">
      <div class="bcard daily">
        <img class="soldier" src="assets/soldier.png" alt="">
        <h3>${ic.gift}Ежедневный бонус</h3>
        <p>Раз в 24 часа крутите барабан и забирайте от 5 до 250 ₽ на баланс.</p>
        <div class="daily-reel"><div class="strip" id="dailyStrip"><div class="track">${Array.from({ length: 12 }, () => coinCard(pickDaily())).join('')}</div></div><div class="rl-marker"></div></div>
        <div class="daily-foot"><button class="btn btn-primary btn-lg" id="dailyBtn">Крутить</button><div class="daily-timer" id="dailyTimer"></div></div>
        <div class="daily-table">${DAILY.map(d => `<div class="r-${d.r}" style="border-bottom:2px solid var(--rc)"><b>${d.v} ₽</b>${(d.w / dw * 100).toFixed(1)}%</div>`).join('')}</div>
      </div>
      <div class="bcard">
        <h3>${ic.star}Промокод</h3>
        <p>Введите промокод, чтобы получить бонус на баланс или к пополнению.</p>
        <div class="inp-row"><input class="inp" id="promoInp" placeholder="Например, WELCOME" autocomplete="off" style="text-transform:uppercase"><button class="btn btn-accent" id="promoBtn">Активировать</button></div>
        <div class="hint">Для теста: ${Object.entries(PROMOS).map(([k, p]) => `<b data-fill="${k}">${k}</b> — ${p.d}`).join(', ')}</div>
      </div>
      <div class="bcard">
        <h3>${ic.send}Подписки</h3>
        <p>+10 ₽ на баланс за подписку на каждую нашу соцсеть.</p>
        <div class="soc-list" id="socList"></div>
      </div>
    </div>
    <div class="bcard" style="margin-top:20px">
      <h3>${ic.user}Пригласи друга</h3>
      <p>Получайте 5% от пополнений приглашённых друзей, а друг получит +50 ₽ при регистрации.</p>
      <div class="inp-row"><input class="inp" readonly value="https://rushcase.gg/r/${st.user ? st.user.id : 'XXXXXX'}"><button class="btn btn-dark" data-act="copy" data-copy="https://rushcase.gg/r/${st.user ? st.user.id : 'XXXXXX'}">${ic.copy}Копировать</button></div>
    </div>
    ${secTitle('Ранги')}
    <div class="ranks">${RANKS.map((r, i) => `<div class="rank${i === rk.i && st.user ? ' cur' : ''}${i > rk.i ? ' locked' : ''}">${rankIcon(r, i)}<h4>${r.n}</h4><small>от ${money(r.min)} в кейсах</small><span class="cb">${r.cb ? 'Кэшбэк ' + r.cb + '%' : 'Старт'}</span></div>`).join('')}</div>
  </section>`;
}
function pickDaily() { const t = DAILY.reduce((a, d) => a + d.w, 0); let r = Math.random() * t; for (const d of DAILY) { r -= d.w; if (r <= 0) return d; } return DAILY[0]; }
const coinCard = (d, win) => `<div class="coin-card r-${d.r}${win ? ' is-win' : ''}"><span class="coin">₽</span><b>${d.v} ₽</b></div>`;
function mountBonus() {
  const btn = $('#dailyBtn'), timer = $('#dailyTimer');
  const upd = () => {
    if (!btn.isConnected) return;
    const left = dailyLeft();
    if (btn.dataset.busy) return;
    btn.disabled = !!left;
    timer.innerHTML = left ? `${ic.clock}Следующий через <b>${dailyText()}</b>` : `${ic.check}<span style="color:var(--lime)">Доступно сейчас</span>`;
  };
  upd(); every(upd, 1000);
  btn.onclick = async () => {
    if (!st.user) return openAuth('reg');
    if (dailyLeft()) return;
    const prize = pickDaily();
    st.daily = Date.now(); save();
    btn.dataset.busy = '1'; btn.disabled = true;
    const strip = $('#dailyStrip');
    strip.classList.remove('done');
    strip.innerHTML = `<div class="track">${Array.from({ length: 40 }, (_, i) => coinCard(i === 34 ? prize : pickDaily(), i === 34)).join('')}</div>`;
    await sleep(50);
    await spinStrip(strip, 4200, true);
    setBalance(st.balance + prize.v);
    Snd.win(RAR[prize.r].o); Snd.coin(); if (prize.v >= 100) burst();
    toast(`Ежедневный бонус: <b>+${money(prize.v)}</b>`);
    delete btn.dataset.busy; upd();
  };
  // промокоды
  const inp = $('#promoInp');
  $$('[data-fill]').forEach(b => b.onclick = () => { inp.value = b.dataset.fill; inp.focus(); });
  $('#promoBtn').onclick = () => {
    if (!st.user) return openAuth('login');
    const code = inp.value.trim().toUpperCase(), p = PROMOS[code];
    if (!p) { inp.classList.add('err'); return toast('Промокод не найден', 'err'); }
    inp.classList.remove('err');
    if (st.promos.includes(code)) return toast('Этот промокод уже активирован', 'err');
    st.promos.push(code);
    if (p.t === 'bal') { setBalance(st.balance + p.v); Snd.coin(); toast(`Промокод активирован: <b>+${money(p.v)}</b>`); }
    else { st.depBonus = p.v; save(); toast(`Бонус <b>+${p.v}%</b> применится к следующему пополнению`); }
    inp.value = '';
  };
  // соцсети
  const drawSoc = () => {
    $('#socList').innerHTML = SOCIALS.map(s => `<div class="soc"><span class="si">${ic[s.i]}</span><div>${s.n}<small>+10 ₽ на баланс</small></div>${st.socials.includes(s.k) ? `<span class="done">${ic.check}Получено</span>` : `<button class="btn btn-dark btn-sm" data-soc="${s.k}">Подписаться</button>`}</div>`).join('');
    $$('[data-soc]').forEach(b => b.onclick = async () => {
      if (!st.user) return openAuth('login');
      if (b.dataset.state === 'check') return;
      if (!b.dataset.state) { b.dataset.state = 'sub'; b.textContent = 'Проверить'; b.classList.replace('btn-dark', 'btn-accent'); return toast('Подпишитесь и нажмите «Проверить»', 'info'); }
      b.dataset.state = 'check'; b.innerHTML = '<span class="spinner"></span>';
      await sleep(1300);
      st.socials.push(b.dataset.soc); setBalance(st.balance + 10); Snd.coin(); toast('Подписка подтверждена: <b>+10 ₽</b>');
      if ($('#socList')) drawSoc();
    });
  };
  drawSoc();
}

/* =========================================================
   PROFILE
   ========================================================= */
let pfTab = 'inv';
const STATUS = { own: ['В инвентаре', 'st-ok'], sold: ['Продан', 'st-mute'], out: ['Выведен в Steam', 'st-ok'], pend: ['Отправляется…', 'st-warn'], upg: ['Сгорел в апгрейде', 'st-bad'], con: ['Использован в контракте', 'st-mute'], bet: ['В ставке', 'st-warn'], jp: ['Поставлен в ставки', 'st-mute'] };
const fromName = f => f === 'jackpot' ? 'Ставки' : f === 'upgrade' ? 'Апгрейд' : f === 'contract' ? 'Контракт' : (caseById(f) ? 'Кейс «' + caseById(f).name + '»' : f);
function pageProfile() {
  if (!st.user) return `<section class="container"><div class="empty-big">${ic.user}<h2>Войдите в аккаунт</h2><p>Чтобы видеть инвентарь, историю дропов и статистику.</p><button class="btn btn-primary btn-lg" data-act="login">${ic.login}Войти</button></div></section>`;
  const u = st.user, rk = rankOf(st.stats.spent), best = st.stats.best && SK[st.stats.best];
  return `<section class="container profile">
    <div class="pf-card">
      <div class="pf-ava">${ava(u, 'xl')}</div>
      <div class="pf-info"><h1>${esc(u.name)}</h1><div class="pf-meta">ID ${u.id} · ${u.via === 'steam' ? 'Steam' : esc(u.email || '')} · на сайте с ${new Date(u.reg).toLocaleDateString('ru-RU')}</div>
        <div class="rank-line"><span class="rank-badge">${ic.crown}${rk.cur.n}</span><div class="bar"><i style="width:${rk.pct}%"></i></div><span>${rk.next ? `до «${rk.next.n}» осталось ${money(rk.left)}` : 'Максимальный ранг'}</span></div>
      </div>
      <div class="pf-bal"><span>Баланс</span><b>${money(st.balance)}</b><div class="btns"><button class="btn btn-primary" data-act="deposit">${ic.plus}Пополнить</button><button class="btn btn-dark" data-act="logout" title="Выйти">${ic.logout}</button></div></div>
    </div>
    <div class="pf-stats">
      <div class="pstat"><span class="pi">${ic.box}</span><div><b>${fmt(st.stats.opened)}</b><span>Кейсов открыто</span></div></div>
      <div class="pstat"><span class="pi">${ic.up}</span><div><b>${st.stats.upgWin} / ${st.stats.upg}</b><span>Апгрейдов: побед / всего</span></div></div>
      <div class="pstat"><span class="pi">${ic.swap}</span><div><b>${fmt(st.stats.con)}</b><span>Контрактов</span></div></div>
      <div class="pstat best r-${best ? best.r : 'milspec'}">${best ? `<img src="${imgUrl(best, 's')}" alt=""><div><b>${esc(best.name)}</b><span style="color:var(--lime)">${money(best.p)}</span></div>` : `<span class="pi">${ic.trophy}</span><div><b>—</b><span>Лучший дроп</span></div>`}</div>
    </div>
    <div class="pf-trade">
      <div class="t">Трейд-ссылка Steam<small>Нужна для вывода скинов. <a href="https://steamcommunity.com/my/tradeoffers/privacy#trade_offer_access_url" target="_blank" rel="noopener">Где её взять?</a></small></div>
      <div class="inp-row"><input class="inp" id="tradeInp" placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…" value="${esc(st.trade)}"><button class="btn btn-accent" id="tradeSave">Сохранить</button></div>
    </div>
    <div class="tabs-row"><div class="seg" id="pfTabs"><button data-tab="inv">Инвентарь<b id="invCnt"></b></button><button data-tab="hist">История</button></div><div class="sum" id="invSum"></div></div>
    <div id="pfBody"></div>
  </section>`;
}
function mountProfile() {
  if (!st.user) return;
  $$('#pfTabs button').forEach(b => b.onclick = () => { pfTab = b.dataset.tab; drawPf(); });
  $('#tradeSave').onclick = () => {
    const v = $('#tradeInp').value.trim();
    if (!/^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[\w-]+$/.test(v)) { $('#tradeInp').classList.add('err'); return toast('Неверный формат трейд-ссылки', 'err'); }
    $('#tradeInp').classList.remove('err'); st.trade = v; save(); toast('Трейд-ссылка сохранена');
  };
  drawPf();
}
function drawPf() {
  const body = $('#pfBody'); if (!body) return;
  $$('#pfTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === pfTab));
  const list = own(), sum = list.reduce((a, x) => a + SK[x.n].p, 0);
  $('#invCnt').textContent = list.length;
  if (pfTab === 'inv') {
    $('#invSum').innerHTML = list.length ? `Стоимость: <b>${money(sum)}</b> &nbsp;<button class="btn btn-accent btn-sm" id="sellAllInv">${ic.coin}Продать всё</button>` : '';
    body.innerHTML = `<div class="items-grid">${list.length ? list.map(x => {
      const s = SK[x.n];
      return `<div class="icard r-${s.r}"><span class="ic-st">${fromName(x.from)}</span><img src="${imgUrl(s, 'm')}" alt="" loading="lazy"><div class="ic-w">${esc(s.w)}</div><div class="ic-f">${esc(s.f)}</div><div class="ic-p">${money(s.p)}</div>
        <div class="ic-acts"><button class="btn btn-accent" data-sell="${x.id}">Продать</button><button class="btn btn-dark" data-wd="${x.id}">${ic.send}Вывести</button></div></div>`;
    }).join('') : `<div class="empty">${ic.box}Инвентарь пуст — самое время открыть кейс!<a class="btn btn-primary btn-sm" href="#/">К кейсам</a></div>`}</div>`;
    const sa = $('#sellAllInv');
    if (sa) sa.onclick = () => { let t = 0; own().forEach(x => { t += sellItem(x.id, true); }); Snd.coin(); toast(`Продано на <b>+${money(t)}</b>`); drawPf(); };
    $$('[data-sell]', body).forEach(b => b.onclick = () => { sellItem(b.dataset.sell); drawPf(); });
    $$('[data-wd]', body).forEach(b => b.onclick = () => withdraw(b.dataset.wd));
  } else {
    $('#invSum').innerHTML = '';
    const all = st.inv.filter(x => SK[x.n]);
    body.innerHTML = all.length ? `<div class="hist">${all.map(x => {
      const s = SK[x.n], [t, cls] = STATUS[x.st] || ['—', ''];
      return `<div class="hrow r-${s.r}"><img src="${imgUrl(s, 's')}" alt=""><div class="n">${esc(s.name)}<small>${fromName(x.from)}</small></div><div class="s ${cls}">${t}</div><div class="d">${new Date(x.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div><div class="p">${money(s.p)}</div></div>`;
    }).join('')}</div>` : `<div class="empty">${ic.history}История пока пуста</div>`;
  }
}
function withdraw(id) {
  const it = st.inv.find(x => x.id === id); if (!it || it.st !== 'own') return;
  if (!st.trade) { $('#tradeInp').classList.add('err'); $('#tradeInp').focus(); return toast('Сначала укажите трейд-ссылку Steam', 'err'); }
  const s = SK[it.n];
  const m = modal(`<div class="wd r-${s.r}"><img src="${imgUrl(s, 'l')}" alt=""><h2>Вывод предмета</h2><p>${esc(s.name)} · ${money(s.p)}<br>Бот отправит обмен на вашу трейд-ссылку. Примите его в течение 10 минут.</p><button class="btn btn-primary btn-lg btn-block" id="wdGo">${ic.send}Вывести в Steam</button></div>`, 'm-wd');
  $('#wdGo', m).onclick = () => {
    it.st = 'pend'; save(); closeModal(); drawPf(); toast('Бот готовит обмен…', 'info');
    setTimeout(() => { it.st = 'out'; save(); toast(`Обмен отправлен: <b>${esc(s.name)}</b>. Примите его в Steam`); if ($('#pfBody')) drawPf(); }, 4000);
  };
}

/* =========================================================
   FAQ / TERMS / 404
   ========================================================= */
const FAQ = [
  ['Как пополнить баланс?', 'Нажмите на баланс в шапке сайта или «Пополнить» в профиле. Доступны СБП, банковские карты, криптовалюта и скины. Промокод RUSH35 даёт +35% к сумме.'],
  ['Как вывести скин в Steam?', 'Укажите трейд-ссылку в профиле, затем нажмите «Вывести» на нужном предмете. Бот отправит обмен в течение пары минут — примите его в Steam.'],
  ['Почему не приходит обмен?', 'Проверьте, что ваш инвентарь Steam открыт, на аккаунте нет торговой блокировки и трейд-ссылка актуальна. Если проблема осталась — напишите в поддержку.'],
  ['Насколько честно выпадает дроп?', 'Результат определяется на сервере в момент нажатия «Открыть» — рулетка лишь показывает уже выпавший предмет. Подкрутить его во время анимации невозможно.'],
  ['Что такое апгрейд?', 'Вы ставите предмет или часть баланса и выбираете скин дороже. Шанс зависит от соотношения цен (максимум 80%). Если стрелка остановится в зелёной зоне — получаете скин, иначе ставка сгорает.'],
  ['Как работают контракты?', 'Выберите от 3 до 10 предметов — взамен получите один случайный скин стоимостью от 25% до 400% от суммы контракта.'],
  ['Что даёт ранг?', 'Ранг растёт от суммы открытых кейсов и даёт кэшбэк до 5%. Посмотреть все ранги можно на странице «Бонусы».'],
  ['С какого возраста можно играть?', 'Сайт предназначен только для пользователей старше 18 лет.'],
];
function pageFaq() {
  return `<section class="container">
    <div class="page-head"><h1>Вопросы и ответы</h1><p>Всё, что нужно знать об открытии кейсов, выводе и бонусах.</p></div>
    <div class="faq">
      <div class="acc">${FAQ.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary><span class="q">${i + 1}</span>${q}</summary><div class="a">${a}</div></details>`).join('')}</div>
      <aside class="support"><img src="assets/soldier.png" alt=""><h3>Нужна помощь?</h3><p>Поддержка отвечает 24/7. Среднее время ответа — 3 минуты.</p><button class="btn btn-primary btn-block" id="chatBtn">${ic.chat}Написать в чат</button><a class="btn btn-dark btn-block" href="#/terms">Пользовательское соглашение</a></aside>
    </div>
  </section>`;
}
function mountFaq() { $('#chatBtn').onclick = () => toast('Чат поддержки подключится после интеграции виджета', 'info'); }
function pageTerms() {
  return `<section class="container"><div class="page-head"><h1>Пользовательское соглашение</h1><p>Шаблон — замените текст на юридически проверенный перед запуском.</p></div>
  <div class="textpage">
    <h3>1. Общие положения</h3><p>Используя сайт RUSH CASE, вы подтверждаете, что вам исполнилось 18 лет и вы принимаете условия настоящего соглашения.</p>
    <h3>2. Баланс и пополнение</h3><p>Средства на балансе используются для открытия кейсов, апгрейдов и контрактов. Пополнение проводится через платёжных партнёров.</p>
    <h3>3. Предметы и вывод</h3><ul><li>Полученные предметы хранятся в профиле и могут быть проданы за баланс или выведены в Steam.</li><li>Для вывода необходима действующая трейд-ссылка и открытый инвентарь.</li><li>Предметы, не выведенные в течение 30 дней, могут быть автоматически проданы по текущей цене.</li></ul>
    <h3>4. Честная игра</h3><p>Результат каждого открытия определяется случайно на сервере до начала анимации. Администрация вправе заблокировать аккаунт при попытках мошенничества или использовании мультиаккаунтов.</p>
    <h3>5. Конфиденциальность</h3><p>Мы храним минимальный набор данных: Steam ID или e-mail, историю операций и трейд-ссылку. Данные не передаются третьим лицам, кроме платёжных партнёров.</p>
    <h3>6. Ответственная игра</h3><p>Открытие кейсов — развлечение, а не способ заработка. Устанавливайте себе лимиты и делайте перерывы.</p>
  </div></section>`;
}
const page404 = () => `<section class="container"><div class="empty-big">${ic.alert}<h2>Страница не найдена</h2><p>Такой страницы нет — но кейсы всё ещё ждут.</p><a class="btn btn-primary btn-lg" href="#/">На главную</a></div></section>`;

/* =========================================================
   AUTH
   ========================================================= */
function openAuth(tab = 'login') {
  const m = modal(`<div class="auth">
    <div class="auth-side">${RINGS}${WORDMARK}
      <ul class="as-perks"><li>${ic.gift}+100 ₽ на баланс за регистрацию</li><li>${ic.bolt}Мгновенный вывод скинов в Steam</li><li>${ic.shield}Честный результат каждого открытия</li><li>${ic.star}Ежедневный бонус до 250 ₽</li></ul>
      <img class="as-char" src="assets/agent-fbi.webp" alt=""></div>
    <div class="auth-main">
      <h2 id="authTitle"></h2>
      <div class="seg wide" id="authTabs"><button data-tab="login">Вход</button><button data-tab="reg">Регистрация</button></div>
      <button class="btn btn-steam btn-lg btn-block" id="steamBtn">${ic.steam}Войти через Steam</button>
      <div class="or">или по e-mail</div>
      <form id="authForm" novalidate></form>
    </div></div>`, 'm-auth');
  const draw = t => {
    tab = t;
    $$('#authTabs button', m).forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#authTitle', m).textContent = t === 'login' ? 'С возвращением' : 'Создать аккаунт';
    const f = $('#authForm', m);
    f.innerHTML = t === 'login' ? `
      <div class="field"><label for="aEmail">E-mail</label><input class="inp" id="aEmail" type="email" autocomplete="email" placeholder="you@mail.ru"><span class="msg"></span></div>
      <div class="field"><label for="aPass">Пароль</label><input class="inp" id="aPass" type="password" autocomplete="current-password" placeholder="••••••••"><span class="msg"></span></div>
      <button type="button" class="forgot" id="forgot">Забыли пароль?</button>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Войти</button>
      <div class="sw">Нет аккаунта? <button type="button" data-sw="reg">Зарегистрироваться</button></div>` : `
      <div class="field"><label for="aNick">Никнейм</label><input class="inp" id="aNick" autocomplete="nickname" placeholder="Clutch_King" maxlength="16"><span class="msg"></span></div>
      <div class="field"><label for="aEmail">E-mail</label><input class="inp" id="aEmail" type="email" autocomplete="email" placeholder="you@mail.ru"><span class="msg"></span></div>
      <div class="row2">
        <div class="field"><label for="aPass">Пароль</label><input class="inp" id="aPass" type="password" autocomplete="new-password" placeholder="Минимум 6 символов"><span class="msg"></span></div>
        <div class="field"><label for="aPass2">Повторите пароль</label><input class="inp" id="aPass2" type="password" autocomplete="new-password" placeholder="••••••••"><span class="msg"></span></div>
      </div>
      <label class="check"><input type="checkbox" id="aAgree"><span>Мне исполнилось 18 лет, я принимаю <a href="#/terms" id="termsLink">пользовательское соглашение</a></span></label>
      <span class="msg" id="agreeMsg" style="color:var(--red);font-size:12px"></span>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Создать аккаунт и получить 100 ₽</button>
      <div class="sw">Уже есть аккаунт? <button type="button" data-sw="login">Войти</button></div>`;
    $$('[data-sw]', f).forEach(b => b.onclick = () => draw(b.dataset.sw));
    const tl = $('#termsLink', f); if (tl) tl.onclick = () => closeModal();
    const fg = $('#forgot', f); if (fg) fg.onclick = () => { const e = $('#aEmail', f).value.trim(); if (!/^\S+@\S+\.\S+$/.test(e)) return setErr($('#aEmail', f), 'Введите e-mail для восстановления'); toast(`Ссылка для сброса пароля отправлена на <b>${esc(e)}</b>`, 'info'); };
    f.onsubmit = ev => { ev.preventDefault(); submit(f); };
    $$('.inp', f).forEach(i => i.oninput = () => setErr(i, ''));
  };
  const setErr = (inp, msg) => { inp.classList.toggle('err', !!msg); const s = inp.parentElement.querySelector('.msg'); if (s) s.textContent = msg; return !msg; };
  const submit = f => {
    const email = $('#aEmail', f).value.trim().toLowerCase(), pass = $('#aPass', f).value;
    let ok = setErr($('#aEmail', f), /^\S+@\S+\.\S+$/.test(email) ? '' : 'Некорректный e-mail');
    ok = setErr($('#aPass', f), pass.length >= 6 ? '' : 'Минимум 6 символов') && ok;
    if (tab === 'reg') {
      const nick = $('#aNick', f).value.trim();
      ok = setErr($('#aNick', f), /^[\wА-Яа-яЁё\- ]{3,16}$/.test(nick) ? '' : '3–16 символов: буквы, цифры, _ и -') && ok;
      ok = setErr($('#aPass2', f), pass === $('#aPass2', f).value ? '' : 'Пароли не совпадают') && ok;
      const ag = $('#aAgree', f).checked; $('#agreeMsg', f).textContent = ag ? '' : 'Подтвердите возраст и согласие';
      ok = ok && ag;
      if (!ok) return;
      if (st.accounts['e:' + email]) return setErr($('#aEmail', f), 'Этот e-mail уже зарегистрирован — войдите');
      login('e:' + email, { name: nick, email, via: 'email' }, true);
    } else {
      if (!ok) return;
      const acc = st.accounts['e:' + email];
      if (!acc) return setErr($('#aEmail', f), 'Аккаунт не найден — зарегистрируйтесь');
      login('e:' + email, acc.user, false);
    }
  };
  $$('#authTabs button', m).forEach(b => b.onclick = () => draw(b.dataset.tab));
  $('#steamBtn', m).onclick = async () => {
    const b = $('#steamBtn', m); b.innerHTML = '<span class="spinner"></span>Переход в Steam…'; b.disabled = true;
    await sleep(1100);
    const acc = st.accounts['steam'];
    login('steam', acc ? acc.user : { name: pick(['Rusher', 'Ace_Hunter', 'Clutch_King', 'RushB_Hero']) + randi(10, 99), via: 'steam', ava: 'assets/soldier.png' }, !acc);
  };
  draw(tab);
}
/* аккаунты — снимки профиля в localStorage (пароли не храним: это прототип без сервера) */
function login(key, user, isNew) {
  if (st.user) snapshot();
  const acc = st.accounts[key];
  Object.assign(st, freshProfile(), acc ? acc.data : {});
  st.user = acc ? acc.user : { ...user, id: randi(1000000, 9999999), reg: Date.now(), key };
  st.user.key = key;
  if (isNew) st.balance += 100;
  snapshot(); save();
  closeModal(); renderUser(); route();
  Snd.coin();
  toast(isNew ? `Добро пожаловать в RUSH CASE, <b>${esc(st.user.name)}</b>! +100 ₽ на баланс` : `С возвращением, <b>${esc(st.user.name)}</b>!`);
  if (isNew) burst(30);
}
function snapshot() {
  if (!st.user) return;
  const { balance, inv, stats, daily, promos, depBonus, socials, trade } = st;
  st.accounts[st.user.key] = { user: st.user, data: { balance, inv, stats, daily, promos, depBonus, socials, trade } };
}
function logout() {
  snapshot();
  Object.assign(st, freshProfile(), { user: null }); save();
  renderUser(); if (location.hash.length > 2) location.hash = '#/'; else route(); toast('Вы вышли из аккаунта', 'info');
}

/* =========================================================
   DEPOSIT
   ========================================================= */
const METHODS = [
  { k: 'sbp', t: 'СБП', s: 'Без комиссии', i: 'bolt', tag: 'Быстро' },
  { k: 'card', t: 'Карта РФ', s: 'МИР, Visa, MC', i: 'card' },
  { k: 'intl', t: 'Зарубежная карта', s: 'Комиссия 3%', i: 'globe' },
  { k: 'crypto', t: 'Криптовалюта', s: 'USDT, BTC, TON', i: 'coin' },
  { k: 'skins', t: 'Скины CS2', s: '+10% к сумме', i: 'knife', tag: '+10%' },
  { k: 'wallet', t: 'Электронный кошелёк', s: 'ЮMoney и др.', i: 'wallet' },
];
function openDeposit(need = 0) {
  if (!st.user) return openAuth('login');
  let amount = Math.max(100, Math.ceil((need || 500) / 50) * 50), method = 'sbp';
  const m = modal(`<div class="dep">
    <h2>Пополнение баланса <small>ТЕСТ</small></h2>
    <p class="dep-sub">${need ? `Не хватает <b style="color:var(--lime)">${money(need)}</b> для открытия.` : 'Выберите способ оплаты и сумму.'} Минимальная сумма — 100 ₽.</p>
    <div class="dep-label">Способ оплаты</div>
    <div class="methods">${METHODS.map(x => `<button class="method" data-m="${x.k}">${x.tag ? `<span class="tagb">${x.tag}</span>` : ''}<span class="mi">${ic[x.i]}</span><span><b>${x.t}</b><small>${x.s}</small></span></button>`).join('')}</div>
    <div class="dep-label">Сумма</div>
    <div class="dep-amt"><input class="inp" id="depAmt" type="number" min="100" step="50" value="${amount}"><span>₽</span></div>
    <div class="amounts">${[300, 500, 1000, 2500, 5000, 10000].map(a => `<button data-a="${a}">${fmt(a)} ₽</button>`).join('')}</div>
    <div class="dep-label">Промокод</div>
    <div class="inp-row"><input class="inp" id="depPromo" placeholder="RUSH35" style="text-transform:uppercase" autocomplete="off"><button class="btn btn-dark" id="depPromoBtn">Применить</button></div>
    <div class="dep-total"><div>К зачислению<b id="depTotal"></b><span id="depBonusTxt"></span></div><button class="btn btn-primary btn-xl" id="depGo"></button></div>
    <p class="dep-note">Тестовый режим: реальная оплата не проводится, баланс пополняется сразу. Перед запуском подключите платёжный шлюз.</p>
  </div>`, 'm-dep');
  let bonus = st.depBonus || 0;
  const draw = () => {
    $$('.method', m).forEach(b => b.classList.toggle('on', b.dataset.m === method));
    $$('.amounts button', m).forEach(b => b.classList.toggle('on', +b.dataset.a === amount));
    const extra = (bonus + (method === 'skins' ? 10 : 0)) / 100, fee = method === 'intl' ? .03 : 0;
    const total = Math.round(amount * (1 + extra) - amount * fee);
    $('#depTotal', m).textContent = money(total);
    $('#depBonusTxt', m).innerHTML = [bonus ? `<em>+${bonus}% промокод</em>` : '', method === 'skins' ? '<em>+10% за скины</em>' : '', fee ? 'комиссия 3%' : ''].filter(Boolean).join(' · ');
    $('#depGo', m).innerHTML = `${ic.wallet}Пополнить на ${money(amount)}`;
    $('#depGo', m).disabled = amount < 100;
    return total;
  };
  $$('.method', m).forEach(b => b.onclick = () => { method = b.dataset.m; draw(); });
  $$('.amounts button', m).forEach(b => b.onclick = () => { amount = +b.dataset.a; $('#depAmt', m).value = amount; draw(); });
  $('#depAmt', m).oninput = e => { amount = Math.max(0, Math.round(+e.target.value || 0)); draw(); };
  $('#depPromoBtn', m).onclick = () => {
    const code = $('#depPromo', m).value.trim().toUpperCase(), p = PROMOS[code];
    if (!p || p.t !== 'dep') return toast('Промокод для пополнения не найден', 'err');
    if (st.promos.includes(code) && !st.depBonus) return toast('Этот промокод уже использован', 'err');
    if (!st.promos.includes(code)) st.promos.push(code);
    bonus = st.depBonus = p.v; save(); draw(); toast(`Промокод применён: <b>+${p.v}%</b>`);
  };
  $('#depGo', m).onclick = async () => {
    if (amount < 100) return toast('Минимальная сумма — 100 ₽', 'err');
    const total = draw(), b = $('#depGo', m);
    b.innerHTML = '<span class="spinner"></span>Обработка…'; b.disabled = true;
    await sleep(900);
    st.depBonus = 0; st.stats.dep += amount;
    setBalance(st.balance + total); Snd.file('assets/sounds/deposit.wav'); closeModal();
    toast(`Баланс пополнен на <b>+${money(total)}</b>`);
    if (total >= 1000) burst(26);
    route();
  };
  draw();
}

/* =========================================================
   СТАВКИ (джекпот): игроки ставят скины 30 с (до 20 человек), рулетка выбирает победителя
   пропорционально ставке, победитель забирает весь банк.
   Прототип: остальные игроки — боты, раунды идут сами, пока открыт сайт.
   ========================================================= */
const JP_TIME = 30, JP_MAX = 20, JP_SPIN = 10000;
const JP_COLORS = ['#f3c14f', '#4ade80', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#ef4444', '#a3e635', '#e879f9',
  '#facc15', '#2dd4bf', '#818cf8', '#fb7185', '#c084fc', '#34d399', '#f97316', '#38bdf8', '#eab308', '#94a3b8'];
const jp = { id: 1, phase: 'wait', players: [], endsAt: 0, winner: null, rot: 0, history: [], tmr: [], spinStart: 0 };
const jpAfter = (fn, ms) => { const t = setTimeout(fn, ms); jp.tmr.push(t); return t; };
const jpTotal = () => jp.players.reduce((a, p) => a + p.sum, 0);
const jpFind = name => jp.players.find(p => p.name === name);
function jpNewRound() {
  jp.tmr.forEach(clearTimeout); jp.tmr = [];
  jp.id++; jp.phase = 'wait'; jp.players = []; jp.endsAt = 0; jp.winner = null; jp.rot = 0;
  jpRender();
  // бот откроет раунд через несколько секунд, если никто не зашёл
  jpAfter(() => { if (jp.phase === 'wait') jpBotJoin(); }, rand(2500, 6000));
}
function jpAdd(name, items, isMe, ava) {
  let p = jpFind(name);
  if (!p) { if (jp.players.length >= JP_MAX) return false; p = { name, items: [], sum: 0, me: isMe, ava, color: JP_COLORS[jp.players.length % JP_COLORS.length] }; jp.players.push(p); }
  p.items.push(...items); p.sum += items.reduce((a, s) => a + s.p, 0);
  if (jp.phase === 'wait') { jp.phase = 'open'; jp.endsAt = Date.now() + JP_TIME * 1000; jpAfter(jpClose, JP_TIME * 1000); jpBotLoop(); }
  if (jp.players.length >= JP_MAX) jpClose();
  jpRender(name);
  return true;
}
function jpBotJoin() {
  const used = new Set(jp.players.map(p => p.name));
  const name = NICKS.filter(n => !used.has(n) && (!st.user || n !== st.user.name)).sort(() => Math.random() - .5)[0];
  if (!name) return;
  const pool = CATALOG.filter(s => s.p >= 4 && s.p <= 239000); // ставки ботов: от 4 до 239 000 ₽
  const n = randi(1, 4), items = [];
  for (let i = 0; i < n; i++) items.push(pool[Math.floor(Math.pow(Math.random(), 1.8) * pool.length)]);
  jpAdd(name, items, false);
  if (jp.phase === 'open' && $('#jp')) Snd.tone(1200 + Math.random() * 400, .06, 'triangle', .05);
}
function jpBotLoop() {
  if (jp.phase !== 'open') return;
  jpAfter(() => {
    if (jp.phase !== 'open') return;
    const left = (jp.endsAt - Date.now()) / 1000;
    if (left > 1.5 && jp.players.length < JP_MAX && Math.random() < (jp.players.length < 6 ? .85 : .45)) jpBotJoin();
    jpBotLoop();
  }, rand(1400, 3600));
}
function jpClose() {
  if (jp.phase !== 'open') return;
  jp.tmr.forEach(clearTimeout); jp.tmr = [];
  if (jp.players.length < 2) jpBotJoin(); // рулетка с одним игроком не крутится
  jp.phase = 'spin';
  // победитель — пропорционально ставке
  const total = jpTotal(); let r = Math.random() * total, w = jp.players[0];
  for (const p of jp.players) { r -= p.sum; if (r <= 0) { w = p; break; } }
  jp.winner = w;
  // угол: сегменты по часовой от верха; стрелка сверху — колесо поворачиваем так, чтобы точка внутри сектора победителя оказалась наверху
  let acc = 0; for (const p of jp.players) { p.a0 = acc / total * 360; acc += p.sum; p.a1 = acc / total * 360; }
  const span = w.a1 - w.a0, m = Math.min(span * .2, 4);
  const point = w.a0 + m + Math.random() * (span - 2 * m);
  jp.rot = 360 * 5 + (360 - point);
  jp.spinStart = Date.now();
  jpRender(); jpSpinFx();
  jpAfter(jpFinish, JP_SPIN + 300);
}
function jpFinish() {
  jp.phase = 'done';
  const w = jp.winner, pot = jp.players.flatMap(p => p.items), total = jpTotal();
  jp.history.unshift({ id: jp.id, name: w.name, me: w.me, ava: w.ava, sum: total, chance: w.sum / total, color: w.color, best: pot.reduce((a, s) => s.p > a.p ? s : a, pot[0]) });
  jp.history = jp.history.slice(0, 8);
  const meIn = jp.players.find(p => p.me);
  st.inv.forEach(x => { if (x.st === 'bet') x.st = 'jp'; }); save();
  if (w.me) {
    pot.forEach(s => giveItem(s, 'jackpot')); save();
    Snd.play('upgWin').then(ok => { if (!ok) Snd.safeWin(); }); burst(140); setTimeout(() => burst(70), 700);
    toast(`Вы забрали банк: <b>${money(total)}</b> — ${pot.length} предм.`);
  } else if (meIn) { if ($('#jp')) Snd.safeLose(); toast(`Банк забрал ${esc(w.name)}. Повезёт в следующем раунде!`, 'err'); }
  else if ($('#jp')) Snd.coin();
  jpRender();
  jpAfter(jpNewRound, 7000);
}
/* звук прокрутки — как в апгрейде: храповик сейфа + сердцебиение в конце */
function jpSpinFx() {
  const t0 = performance.now(); let last = null, lastA = null, nextBeat = JP_SPIN - 2300;
  const loop = now => {
    if (jp.phase !== 'spin') return;
    const el = now - t0, rot = $('#jpRot');
    if (rot) {
      const mx = new DOMMatrixReadOnly(getComputedStyle(rot).transform), a = (Math.atan2(mx.b, mx.a) * 180 / Math.PI + 360) % 360;
      const dA = lastA == null ? 0 : (a - lastA + 360) % 360; lastA = a;
      const k = Math.floor(a / 12), tense = el > JP_SPIN - 2300 ? 1 : 0;
      if (last !== null && k !== last) Snd.safeTick(Math.min(1, dA / 12), tense);
      last = k;
      if (el >= nextBeat && el < JP_SPIN - 150) { const p = (el - (JP_SPIN - 2300)) / 2300; Snd.heart(.35 + p * .35); nextBeat += 620 - p * 260; }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
/* сегменты колеса */
function jpArc(a0, a1, r = 138) {
  const pt = a => { const t = (a - 90) * Math.PI / 180; return [160 + r * Math.cos(t), 160 + r * Math.sin(t)]; };
  const [x1, y1] = pt(a0), [x2, y2] = pt(a1);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
function jpSegments() {
  const total = jpTotal(); if (!total) return '';
  if (jp.players.length === 1) return `<circle cx="160" cy="160" r="138" class="jp-seg" stroke="${jp.players[0].color}"/>`;
  let acc = 0;
  return jp.players.map(p => { const a0 = acc / total * 360; acc += p.sum; const a1 = acc / total * 360; const g = Math.min(.8, (a1 - a0) * .2);
    return `<path class="jp-seg" stroke="${p.color}" d="${jpArc(a0 + g, a1 - g)}"/>`; }).join('');
}

function pageJackpot() {
  return `<section class="container jp" id="jp">
    <div class="page-head top-head"><div><h1>Ставки <em>на банк</em></h1><p>Поставьте скины — у каждого игрока свой цвет на рулетке, доля пропорциональна ставке. Через 30 секунд после первой ставки рулетка выберет победителя, и он заберёт весь банк.</p></div></div>
    <div class="jp-main">
      <div class="jp-left">
        <div class="jp-stats">
          <div><span>Банк</span><b id="jpPot">0 ₽</b></div>
          <div><span>Игроков</span><b id="jpCnt">0 / ${JP_MAX}</b></div>
          <div><span>Ваш шанс</span><b id="jpMe">—</b></div>
        </div>
        <div class="wheel jp-wheel" id="jpWheel">
          <svg viewBox="0 0 320 320" aria-hidden="true">
            <defs>
              <radialGradient id="jpInner"><stop offset="0" stop-color="#1f1b15"/><stop offset="1" stop-color="#0b0a09"/></radialGradient>
              <filter id="jpGroove" x="-10%" y="-10%" width="120%" height="120%">
                <feComponentTransfer in="SourceAlpha" result="inv"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>
                <feGaussianBlur in="inv" stdDeviation="4"/><feOffset dy="5" result="off"/>
                <feFlood flood-color="#000" flood-opacity=".95"/><feComposite in2="off" operator="in"/>
                <feComposite in2="SourceAlpha" operator="in" result="sh"/>
                <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/></feMerge>
              </filter>
            </defs>
            <circle cx="160" cy="160" r="156" class="w-ticks"/>
            <circle cx="160" cy="160" r="151" class="w-rim-o" stroke="#3a3833"/>
            <circle cx="160" cy="160" r="138" class="w-track" filter="url(#jpGroove)"/>
            <circle cx="160" cy="160" r="125" class="w-rim-i" stroke="#3a3833"/>
            <circle cx="160" cy="160" r="116" fill="url(#jpInner)" stroke="rgba(255,255,255,.08)"/>
          </svg>
          <div class="jp-rot" id="jpRot"><svg viewBox="0 0 320 320" aria-hidden="true"><g filter="url(#jpGroove)" id="jpSegs"></g></svg></div>
          <div class="w-ptr"><svg class="w-tri" viewBox="0 0 40 48" aria-hidden="true">
            <defs><linearGradient id="jtL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d5d9e0"/></linearGradient>
            <linearGradient id="jtR" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a7adb7"/><stop offset="1" stop-color="#6b717c"/></linearGradient></defs>
            <path d="M20 46 L2.5 4.5 L20 12 Z" fill="url(#jtL)"/><path d="M20 46 L37.5 4.5 L20 12 Z" fill="url(#jtR)"/><path d="M2.5 4.5 L37.5 4.5 L20 12 Z" fill="#fff"/>
            <path d="M20 46 L2.5 4.5 L37.5 4.5 Z" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1" stroke-linejoin="round"/></svg></div>
          <div class="w-center jp-center" id="jpCenter"></div>
        </div>
        <div class="jp-act" id="jpAct"></div>
      </div>
      <div class="jp-right">
        <div class="panel jp-players"><div class="panel-h"><h3>Участники</h3><span class="upg-sum" id="jpPl"></span></div><div id="jpList"></div></div>
      </div>
    </div>
    <div class="sec-row"><h2 class="sec-h">Последние раунды</h2><i class="st-line"></i></div>
    <div class="jp-hist" id="jpHist"></div>
  </section>`;
}
let jpTick = 0;
function mountJackpot() {
  jpRender();
  clearInterval(jpTick);
  jpTick = setInterval(() => { if (!$('#jp')) return clearInterval(jpTick); jpRenderCenter(); }, 250);
}
function jpRenderCenter() {
  const c = $('#jpCenter'); if (!c) return;
  if (jp.phase === 'wait') c.innerHTML = `<b class="jp-big">${ic.users}</b><span>Ожидание игроков</span>`;
  else if (jp.phase === 'open') { const s = Math.max(0, Math.ceil((jp.endsAt - Date.now()) / 1000)); c.innerHTML = `<b class="jp-big ${s <= 5 ? 'hot' : ''}">0:${pad(s)}</b><span>до розыгрыша</span>`; }
  else if (jp.phase === 'spin') c.innerHTML = `<b class="jp-big">${money(jpTotal())}</b><span>разыгрывается</span>`;
  else if (jp.winner) c.innerHTML = `<span class="jp-wava">${ava({ name: jp.winner.name, ava: jp.winner.ava })}</span><b class="jp-wname" style="color:${jp.winner.color}">${esc(jp.winner.name)}</b><span>забирает ${money(jpTotal())} · шанс ${(jp.winner.sum / jpTotal() * 100).toFixed(1)}%</span>`;
}
function jpRender(flash) {
  if (!$('#jp')) return;
  const total = jpTotal(), me = jp.players.find(p => p.me);
  $('#jpPot').textContent = money(total);
  $('#jpCnt').textContent = `${jp.players.length} / ${JP_MAX}`;
  $('#jpMe').textContent = me ? (me.sum / total * 100).toFixed(1) + '%' : '—';
  $('#jpSegs').innerHTML = jpSegments();
  const rot = $('#jpRot');
  if (jp.phase === 'spin' || jp.phase === 'done') {
    const passed = Date.now() - jp.spinStart;
    if (jp.phase === 'done' || passed > JP_SPIN) { rot.style.transition = 'none'; rot.style.transform = `rotate(${jp.rot}deg)`; }
    else if (!rot.dataset.spun || rot.dataset.spun != jp.id) {
      rot.dataset.spun = jp.id; rot.style.transition = 'none'; rot.style.transform = 'rotate(0deg)'; void rot.offsetWidth;
      rot.style.transition = `transform ${JP_SPIN - passed}ms cubic-bezier(.12,.6,.06,1)`; rot.style.transform = `rotate(${jp.rot}deg)`;
    }
  } else { rot.style.transition = 'none'; rot.style.transform = 'rotate(0deg)'; delete rot.dataset.spun; }
  $('#jpWheel').classList.toggle('win', jp.phase === 'done' && jp.winner && jp.winner.me);
  jpRenderCenter();
  // кнопка ставки
  const act = $('#jpAct');
  if (jp.phase === 'spin' || jp.phase === 'done') act.innerHTML = `<div class="cc-note">Ставки закрыты — ${jp.phase === 'spin' ? 'идёт розыгрыш' : 'новый раунд через несколько секунд'}</div>`;
  else if (!st.user) act.innerHTML = `<button class="btn btn-primary btn-xl btn-cham" data-act="login">${ic.login}Войти и сделать ставку</button>`;
  else if (!me && jp.players.length >= JP_MAX) act.innerHTML = `<div class="cc-note">Лобби заполнено (${JP_MAX} игроков)</div>`;
  else { act.innerHTML = `<button class="btn btn-primary btn-xl btn-cham" id="jpBet">${ic.plus}${me ? 'Добавить к ставке' : 'Сделать ставку'}</button>`; $('#jpBet').onclick = jpOpenBet; }
  // участники
  $('#jpPl').innerHTML = total ? `банк <b>${money(total)}</b>` : '';
  $('#jpList').innerHTML = jp.players.length ? jp.players.slice().sort((a, b) => b.sum - a.sum).map(p => `
    <div class="jp-row${p.me ? ' me' : ''}${p.name === flash ? ' flash' : ''}${jp.winner === p && jp.phase === 'done' ? ' won' : ''}" style="--pc:${p.color}">
      <i class="jp-dot"></i>${ava({ name: p.name, ava: p.ava }, 'xs')}
      <div class="jp-n"><b>${esc(p.name)}${p.me ? ' (вы)' : ''}</b><span>${money(p.sum)} · ${p.items.length} предм.</span></div>
      <div class="jp-items">${p.items.slice(0, 4).map(s => `<img class="r-${s.r}" src="${imgUrl(s, 'm')}" alt="" title="${esc(s.name)} — ${money(s.p)}">`).join('')}${p.items.length > 4 ? `<em>+${p.items.length - 4}</em>` : ''}</div>
      <b class="jp-pct">${(p.sum / total * 100).toFixed(1)}%</b>
    </div>`).join('') : `<div class="empty">${ic.users}Пока никто не поставил. Сделайте первую ставку — запустится таймер на 30 секунд.</div>`;
  // история
  $('#jpHist').innerHTML = jp.history.length ? jp.history.map(h => `
    <div class="jp-h" style="--pc:${h.color}">${ava({ name: h.name, ava: h.ava }, 'xs')}<div><b>${esc(h.name)}${h.me ? ' (вы)' : ''}</b><span>Раунд #${h.id} · шанс ${(h.chance * 100).toFixed(1)}%</span></div>
      <img src="${imgUrl(h.best, 'm')}" alt="" title="${esc(h.best.name)}"><b class="jp-hs">${money(h.sum)}</b></div>`).join('') : `<div class="empty">Раундов ещё не было</div>`;
}
function jpOpenBet() {
  if (!st.user) return openAuth('login');
  if (jp.phase === 'spin' || jp.phase === 'done') return;
  const list = own().slice().sort((a, b) => SK[b.n].p - SK[a.n].p);
  let sel = [];
  const m = modal(`<div class="dep jp-pick"><h2>Ставка скинами</h2>
    <p class="dep-sub">Выберите предметы из инвентаря. Шанс выиграть банк = ваша ставка / весь банк.</p>
    <div class="mini-grid" id="jpInv">${list.length ? list.map(x => mcard(SK[x.n], `data-id="${x.id}"`)).join('') : `<div class="empty">${ic.box}Инвентарь пуст — откройте пару кейсов.<a class="btn btn-primary btn-sm" href="#/cases">К кейсам</a></div>`}</div>
    <div class="dep-total"><div>Ваша ставка<b id="jpSel">0 ₽</b><span id="jpSelN"></span></div><button class="btn btn-primary btn-xl" id="jpGo" disabled>Поставить</button></div></div>`, 'm-dep');
  const upd = () => {
    const sum = sel.reduce((a, id) => a + SK[st.inv.find(x => x.id === id).n].p, 0), tot = jpTotal() + sum, me = jpFind(st.user.name);
    $('#jpSel', m).textContent = money(sum);
    $('#jpSelN', m).textContent = sel.length ? `${sel.length} предм. · шанс ≈ ${((sum + (me ? me.sum : 0)) / tot * 100).toFixed(1)}%` : '';
    $('#jpGo', m).disabled = !sel.length;
  };
  $$('[data-id]', m).forEach(el => el.onclick = () => { const id = el.dataset.id; const on = !sel.includes(id); sel = on ? [...sel, id] : sel.filter(z => z !== id); el.classList.toggle('sel', on); Snd.safeSel(on); upd(); });
  $('#jpGo', m).onclick = () => {
    if (jp.phase === 'spin' || jp.phase === 'done') { closeModal(); return toast('Ставки уже закрыты', 'err'); }
    const items = sel.map(id => st.inv.find(x => x.id === id)).filter(x => x && x.st === 'own');
    if (!items.length) return;
    if (!jpAdd(st.user.name, items.map(x => SK[x.n]), true, st.user.ava)) { closeModal(); return toast('Лобби заполнено', 'err'); }
    items.forEach(x => { x.st = 'bet'; }); save();
    Snd.safeSel(true); Snd.coin(); closeModal();
    toast(`Ставка принята: <b>${money(items.reduce((a, x) => a + SK[x.n].p, 0))}</b>`);
  };
}
/* немного истории для живости */
(function jpSeed() {
  for (let i = 0; i < 6; i++) {
    const pool = CATALOG.filter(s => s.p >= 200 && s.p <= 20000), best = pool[randi(0, pool.length - 1)];
    jp.history.push({ id: 100 - i, name: pick(NICKS), sum: Math.round(best.p * rand(1.6, 5)), chance: rand(.03, .6), color: pick(JP_COLORS), best });
  }
  jp.id = 101;
  jpAfter(() => { if (jp.phase === 'wait') jpBotJoin(); }, rand(3000, 7000));
})();

/* =========================================================
   ROUTER
   ========================================================= */
const ROUTES = {
  '': [pageHome, mountHome], cases: [pageCases, mountCases], top: [pageTop, mountTop], jackpot: [pageJackpot, mountJackpot], case: [pageCase, mountCase], upgrade: [pageUpgrade, mountUpgrade], contracts: [pageContracts, mountContracts],
  bonus: [pageBonus, mountBonus], profile: [pageProfile, mountProfile], faq: [pageFaq, mountFaq], terms: [pageTerms, null],
};
function route() {
  clearTimers(); spinning = false; spinId++;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const key = parts[0] || '';
  const [page, mount] = Object.prototype.hasOwnProperty.call(ROUTES, key) ? ROUTES[key] : [page404, null];
  const app = $('#app');
  app.innerHTML = page(parts[1]);
  app.classList.remove('page-in'); void app.offsetWidth; app.classList.add('page-in');
  if (mount) mount(parts[1]);
  const navKey = key === '' ? 'home' : key === 'case' ? 'cases' : key;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === navKey));
  closeMenu();
  const c = key === 'case' && caseById(parts[1]);
  document.title = c ? `Кейс «${c.name}» — RUSH CASE` : ({ cases: 'Все кейсы', top: 'Топ игроков', jackpot: 'Ставки', upgrade: 'Апгрейд', contracts: 'Контракты', bonus: 'Бонусы', profile: 'Профиль', faq: 'FAQ', terms: 'Соглашение' }[key] || 'Открытие кейсов CS2') + ' — RUSH CASE';
}
window.addEventListener('hashchange', () => { route(); window.scrollTo({ top: 0, behavior: 'instant' }); });

/* глобальные действия */
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'login') openAuth('login');
  else if (act === 'register') openAuth('reg');
  else if (act === 'deposit') openDeposit(+a.dataset.need || 0);
  else if (act === 'logout') logout();
  else if (act === 'copy') copyText(a.dataset.copy);
  else if (act === 'hero-reg') st.user ? (location.hash = '#/bonus') : openAuth('reg');
  else if (act === 'go') location.hash = a.dataset.href;
});

/* если локального файла нет — берём картинку из Steam */
const BY_KEY = {};
Object.values(SK).forEach(x => { BY_KEY[x.k] = x; });
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.retry) return;
  const m = img.src.match(/assets\/skins\/([0-9a-f]+)-[ml]\.webp/);
  if (!m || !BY_KEY[m[1]]) return;
  img.dataset.retry = 1;
  img.src = CDN.replace('community.cloudflare.', 'community.') + BY_KEY[m[1]].i;
}, true);

/* ---------- init ---------- */
renderHeader(); renderFooter(); initFx(); initLive(); route();
setInterval(() => { online = clamp(online + randi(-14, 16), 950, 1900); const o = $('#online'); if (o) o.textContent = fmt(online); }, 3000);
const hidePre = () => $('#preloader').classList.add('out');
window.addEventListener('load', () => setTimeout(hidePre, 300));
setTimeout(hidePre, 2500);
})();

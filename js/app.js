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
/* деньги с копейками: целые — без дробной части, иначе до 2 знаков (0,45 ₽) */
const money = n => { const r = Math.round(n * 100) / 100; return (Number.isInteger(r) ? fmt(r) : r.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' ₽'; };
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
const imgUrl = (s, size = 'm') => s.img ? s.img : s.u ? `https://community.steamstatic.com/economy/image/${s.u}/${size === 'l' ? '512fx384f' : size === 'xs' ? '128fx96f' : '256fx192f'}` : `assets/skins/${s.k}-${size === 'l' ? 'l' : 'm'}.webp`;
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
  edit: sv('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
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
// износ: каждый вариант — отдельный предмет со своей ценой (market.csgo.com)
const WEAR = { FN: ['Прямо с завода', 'Factory New'], MW: ['Немного поношенное', 'Minimal Wear'], FT: ['После полевых испытаний', 'Field-Tested'], WW: ['Поношенное', 'Well-Worn'], BS: ['Закалённое в боях', 'Battle-Scarred'] };
const WEAR_MAIN = ['FT', 'MW', 'WW', 'FN', 'BS']; // какой износ стоит за названием без износа (старые предметы в инвентаре, списки кейсов)
const SK = {}, ITEMS = [], VARIANTS = {};
const addItem = s => { SK[s.name] = s; ITEMS.push(s); };
function addWears(base, wears, en) {
  const qs = Object.keys(WEAR).filter(q => wears[q]);
  VARIANTS[base.name] = qs.map(q => {
    const s = { ...base, name: `${base.name} (${WEAR[q][en ? 1 : 0]})`, base: base.name, q, f: `${base.f} (${q})`, p: wears[q] };
    addItem(s); return s.name;
  });
  SK[base.name] = SK[`${base.name} (${WEAR[WEAR_MAIN.find(q => wears[q])][en ? 1 : 0]})`];
}
for (const [name, d] of Object.entries(window.SKINS)) {
  const [w, f] = name.split(' | ');
  const s = { name, w, f, r: d.r, p: d.p, i: d.i, k: d.k };
  const wr = window.WEARS && window.WEARS[name];
  if (wr) addWears(s, wr, false); else addItem(s);
}
const CATALOG = ITEMS.slice().sort((a, b) => a.p - b.p);
/* денежный дроп бонусных кейсов: сразу зачисляется на рублёвый баланс, в инвентарь не попадает */
[50, 100, 200, 300].forEach(v => { SK[`${v} ₽ на баланс`] = { name: `${v} ₽ на баланс`, w: 'На баланс', f: `+${v} ₽`, r: v >= 300 ? 'rare' : v >= 200 ? 'covert' : v >= 100 ? 'classified' : 'restricted', p: v, c: 'cash', cash: v, img: `assets/cash-${v}.webp` }; });
/* доп. предметы (цены Lis-Skins, tools/lis-sync.js): ножи, перчатки, StatTrak, наклейки, граффити, значки, нашивки, брелоки, музыка, агенты, ширп */
const STEAM_IMG = 'https://community.steamstatic.com/economy/image/';
const CAT_SKIN = 'skin';
CATALOG.forEach(s => { s.c = CAT_SKIN; });
(window.EXTRA || []).forEach(([name, r, p, i, c]) => {
  if (SK[name]) return;
  const parts = name.split(' | ');
  const s = { name, w: parts[0], f: parts.slice(1).join(' | ') || parts[0], r, p, u: i, c };
  if (typeof p === 'object') addWears(s, p, true); else addItem(s);
});
const UPG_CAT = ITEMS.slice().sort((a, b) => a.p - b.p);
const UPG_TABS = [['all', 'Все'], ['skin', 'Скины'], ['knife', 'Ножи'], ['gloves', 'Перчатки'], ['agent', 'Агенты'], ['sticker', 'Наклейки'], ['graffiti', 'Граффити'], ['pin', 'Значки'], ['patch', 'Нашивки'], ['charm', 'Брелоки'], ['music', 'Музыка'], ['junk', 'Ширп']];

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
  // kl — от 0: если дорогим не хватает окупаемости, смещаем вес дешёвой части к цене кейса (kl < 0), если перебор — к дешёвым
  let kl = 0, need = (T - wL * ev(lo, kl)) / wH;
  while (need > ev(hi, -4) && kl > -8) { kl -= .1; need = (T - wL * ev(lo, kl)) / wH; }
  while (need < ev(hi, 30) && kl < 30) { kl += .1; need = (T - wL * ev(lo, kl)) / wH; }
  let a = -4, b = 30;
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
/* бонусные кейсы: фиксированные шансы (деньги, ультра) + ширп с весами ~ p^-k, k подбирается под матожидание */
function solveBonus(items, target, fix = {}) {
  let fMass = 0, fEv = 0; items.forEach(it => { if (fix[it.name] != null) { fMass += fix[it.name]; fEv += fix[it.name] * it.p; } });
  const rest = items.filter(it => fix[it.name] == null), m = 1 - fMass, need = (target - fEv) / m;
  const ev = k => { let sw = 0, sv = 0; rest.forEach(it => { const w = it.p ** -k; sw += w; sv += w * it.p; }); return sv / sw; };
  let a = -6, b = 12; for (let i = 0; i < 80; i++) { const mid = (a + b) / 2; if (ev(mid) > need) a = mid; else b = mid; }
  const k = (a + b) / 2, sw = rest.reduce((t, it) => t + it.p ** -k, 0);
  return items.map(it => fix[it.name] ?? m * it.p ** -k / sw);
}
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
    sub: 'Розовые, неоновые и радужные скины от 200 ₽ и редкие джекпоты',
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
    id: 'sifon', name: 'Сифон и Борода', price: 29, tag: 'Бюджет', tagIc: 'coin', rtp: .96,
    sub: 'Бюджетные скины от 9 ₽: каждое третье открытие в плюс, скины до 200 ₽ и нож с минимальным шансом',
    th: { a: '#a3e635' }, img: 'assets/case-sifon.webp', win: 1 / 3, kh: 1, maxWin: 200, // каждое 3-е открытие в плюс; оружие до 200 ₽ — редко (кроме ножа)
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
    sub: 'Дорогой дроп от 600 ₽: тайные скины, ножи и перчатки',
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
    sub: 'Аниме, котики и розовый неон',
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
    id: 'frog', name: 'Жаб Жабыч', price: 245, tag: 'Новинка', tagIc: 'star', rtp: .8,
    sub: 'Только зелёные скины от 70 ₽. Ультра-редкие: ★ Karambit | Gamma Doppler и зелёные перчатки',
    th: { a: '#9be22d' }, img: 'assets/case-frog.webp', win: .18,
    strict: true, // только зелёные — без подстановки из общего каталога
    // ультра-дорогие — шанс 1 из 100 000 каждый
    ultra: ['★ Sport Gloves | Hedge Maze (Field-Tested)', '★ Karambit | Gamma Doppler (Factory New)', '★ Specialist Gloves | Emerald Web (Minimal Wear)'],
    show: [],
    items: [
      'AK-47 | Изумрудные завитки', 'AK-47 | Зелёный глянец', 'AK-47 | Цвет джунглей', 'AWP | Гадюка',
      'AWP | Древесная гадюка', 'M4A1-S | Basilisk', 'M4A1-S | Emphorosaur-S', 'M4A4 | Jungle Tiger',
      'Glock-18 | Ядерный сад', 'Glock-18 | Groundwater', 'Glock-18 | Gamma Doppler', 'MAC-10 | Ядерный сад',
      'MP9 | Hydra', 'MP9 | Смертельный яд', 'P90 | Virus', 'P90 | Emerald Dragon',
      'P250 | Ядерная угроза', 'P250 | Contamination', 'Tec-9 | Токсичность', 'CZ75-Auto | Изумруд',
      'CZ75-Auto | Green Plaid', 'Galil AR | Eco', 'Nova | Green Apple', 'Sawed-Off | Limelight',
      'MP5-SD | Phosphor', 'MP5-SD | Acid Wash', 'P2000 | Turf', 'SCAR-20 | Изумруд',
      'MAG-7 | Monster Call', 'USP-S | Overgrowth', 'USP-S | Monster Mashup', 'MP7 | Akoben',
      'Dual Berettas | Emerald', 'MP7 | Неоновые жилки', 'MP9 | Goo', 'Tec-9 | Bamboozle',
      'Nova | Toy Soldier', 'M249 | Aztec', 'P250 | See Ya Later', 'AWP | Containment Breach',
      'Desert Eagle | Изумрудный Ёрмунганд', '★ Driver Gloves | Racing Green', '★ Hydra Gloves | Emerald', '★ Moto Gloves | Turtle',
    ],
  },
  {
    id: 's1mple', name: 'S1MPLE PRIME', price: 322, tag: 'Новинка', tagIc: 'crown', rtp: .8,
    sub: 'Красно-чёрные скины от 95 ₽. Ультра-редкие: ★ Sport Gloves | Pandora\'s Box, ★ Flip Knife | Fade, AK-47 | Огненный змей',
    th: { a: '#ff2d3d' }, img: 'assets/case-s1mple.webp', win: .18,
    strict: true, setX: 's1', minDrop: 95,
    fx: { x: 66, y: 0, w: 23, h: 40, ar: 1228 / 1131 }, // сияние статуэтки на картинке кейса (% от картинки), ar — пропорции картинки
    ultra: [
      '★ Skeleton Knife | Case Hardened (Field-Tested)', '★ Flip Knife | Fade (Factory New)', '★ Specialist Gloves | Marble Fade (Factory New)',
      '★ Sport Gloves | Pandora\'s Box (Factory New)', 'M4A4 | Bullet Rain (Factory New)', 'M4A1-S | Hot Rod (Factory New)',
      'Zeus x27 | Olympus (Factory New)', 'AK-47 | Огненный змей (Прямо с завода)',
    ],
    show: [],
    items: [
      'AK-47 | Красная линия', 'AK-47 | Red Laminate', 'AK-47 | Point Disarray',
      'AK-47 | Кровавый спорт', 'AWP | Красная линия', 'AWP | Скоростной зверь',
      'M4A4 | Evil Daimyo', 'M4A4 | Hellfire', 'M4A1-S | Blood Tiger',
      'M4A1-S | Player Two', 'M4A1-S | Chantico\'s Fire', 'Glock-18 | Water Elemental',
      'Glock-18 | Vogue', 'Glock-18 | Red Tire', 'USP-S | Cortex',
      'USP-S | The Traitor', 'USP-S | Blood Tiger', 'Desert Eagle | Crimson Web',
      'Desert Eagle | Kumicho Dragon', 'P2000 | Red FragCam', 'CZ75-Auto | Red Astor',
      'CZ75-Auto | Crimson Web', 'Galil AR | Crimson Tsunami', 'MP7 | Bloodsport',
      'MP9 | Ruby Poison Dart', 'SSG 08 | Blood in the Water', 'MAC-10 | Heat',
      'XM1014 | Incinegator', 'Nova | Bloomstick', 'UMP-45 | Crime Scene',
      'SG 553 | Integrale', 'Sawed-Off | Devourer', 'Galil AR | Firefight',
      'SCAR-20 | Bloodsport', 'AUG | Akihabara Accept', 'Zeus x27 | Olympus',
      'M4A4 | Bullet Rain', 'M4A1-S | Hot Rod', 'AK-47 | Огненный змей',
    ],
  },
  {
    id: 'zont', name: 'Zont1x ❤', price: 169, tag: 'Новинка', tagIc: 'star', rtp: .8,
    sub: 'Чёрно-белые скины от 65 ₽. Ультра-редкие: ★ Нож-бабочка | Зуб тигра, AK-47 | Hydroponic, наклейка s1mple (Gold)',
    th: { a: '#e8e8e8' }, img: 'assets/case-zont.webp', win: .18,
    strict: true, setX: 'zont', minDrop: 65,
    // редкие — обычный крупный дроп (≈1% открытий на весь крупный дроп)
    rare: [
      'Five-SeveN | Fairy Tale (Field-Tested)', 'AWP | Crakow! (Field-Tested)', 'P2000 | Corticera (Field-Tested)',
      'USP-S | Road Rash (Field-Tested)',
    ],
    ultra: [
      '★ Нож-бабочка | Зуб тигра (Прямо с завода)', 'AK-47 | Hydroponic (Field-Tested)', 'Desert Eagle | Пламя (Прямо с завода)',
      'Sticker | LGB eSports (Holo) | Katowice 2015', 'Sticker | s1mple (Gold) | Katowice 2019', '★ Спортивные перчатки | Порок (После полевых испытаний)',
      '★ Sport Gloves | Amphibious (Field-Tested)', 'Desert Eagle | Золотой карп (Прямо с завода)',
    ],
    show: [],
    items: [
      'AK-47 | Slate', 'AK-47 | Black Laminate', 'AWP | Graphite',
      'AWP | Exoskeleton', 'AWP | Acheron', 'M4A1-S | Dark Water',
      'M4A1-S | Night Terror', 'M4A1-S | Black Lotus', 'M4A1-S | Поток информации',
      'Glock-18 | Catacombs', 'Glock-18 | Night', 'USP-S | Black Lotus',
      'USP-S | Torque', 'USP-S | Guardian', 'Desert Eagle | Механо-пушка',
      'Desert Eagle | Midnight Storm', 'Desert Eagle | Printstream', 'Desert Eagle | Light Rail',
      'MAC-10 | Whitefish', 'MP7 | Skulls', 'UMP-45 | Arctic Wolf',
      'AUG | Arctic Wolf', 'XM1014 | Black Tie', 'Nova | Graphite',
      'SSG 08 | Dark Water', 'SSG 08 | Ghost Crusader', 'P250 | Cartel',
      'Tec-9 | Snek-9', 'SG 553 | Darkwing', 'FAMAS | Mecha Industries',
      'M4A4 | Dark Blossom', 'AK-47 | Phantom Disruptor', 'USP-S | Printstream',
      'M4A4 | Desolate Space', 'MP9 | Dark Age', 'Galil AR | Black Sand',
      'P90 | Shapewood', 'Glock-18 | Ironwork', 'AWP | Чёрный Нил',
      'Five-SeveN | Fairy Tale', 'AWP | Crakow!', 'P2000 | Corticera',
      'USP-S | Road Rash', 'AK-47 | Hydroponic', 'Desert Eagle | Пламя',
      'Desert Eagle | Золотой карп',
    ],
  },
  {
    id: 'gold', name: 'БАБА ЧАЙ', goldPrice: true, liveGold: true,
    // персональные звуки: go — вместо ключа, song — во время прокрутки, win/lose — окупил / не окупил
    snd: { go: 'assets/sounds/baba-go.mp3', song: 'assets/sounds/baba-song.mp3', win: 'assets/sounds/baba-win.mp3', lose: 'assets/sounds/baba-lose.mp3' }, price: 89999, tag: 'Эксклюзив', tagIc: 'crown', rtp: .8,
    sub: 'Особый кейс: только топовый дроп от 65 000 ₽ — «История о драконе», «Вой», Gungnir, керамбиты и перчатки',
    th: { a: '#f3c14f' }, img: 'assets/case-gold.webp', win: .12,
    strict: true, setX: 'gold', minDrop: 65000, more: [80000, 12], // +12 позиций дороже 80 000 ₽, в т.ч. другие износы тех же скинов
    // ультра-дорогой дроп: всё дороже 800 000 ₽ — только эти позиции, шанс 1 из 1 000 000 каждая
    ultraMin: 800000, ultraCh: .000001,
    // ВРЕМЕННО: окупается часто (55% открытий), но немного — в основном +1,5…5 тыс.; окупаемость ~93%. Удалить строку — вернётся обычный режим
    promo: { rtp: .935, win: .55, add: ['★ Karambit | Crimson Web (Minimal Wear)', '★ Штык-нож M9 | Легенды (Прямо с завода)'] },
    ultra: ['AK-47 | Дикий лотос (Немного поношенное)', 'AK-47 | Дикий лотос (Прямо с завода)', 'AWP | История о драконе (Прямо с завода)',
      'AWP | История о драконе (Немного поношенное)', 'AWP | Gungnir (Factory New)', 'AWP | Gungnir (Minimal Wear)',
      '★ Перчатки спецназа | Кровавое кимоно (Прямо с завода)', '★ Sport Gloves | Pandora\'s Box (Factory New)'],
    ar: 1225 / 1108, overlay: 'gold', // цепь, фары и дым поверх картинки (качаются вместе с кейсом)
    frame: { src: 'assets/frame-gold.png', cls: 'f-gold' }, // своя рамка рулетки
    show: [],
    items: [
      'AWP | История о драконе', 'AK-47 | Золотая арабеска', 'M4A4 | Вой',
      'AWP | Gungnir', 'AWP | Медуза', 'AK-47 | Огненный змей',
      'Desert Eagle | Пламя', 'M4A1-S | Hot Rod', 'M4A1-S | Knight',
      'AK-47 | Дикий лотос', 'AK-47 | Рентген', 'M4A1-S | Добро пожаловать в джунгли',
      '★ Karambit | Crimson Web', '★ Karambit | Fade', '★ Karambit | Lore',
      '★ Karambit | Tiger Tooth', '★ Karambit | Case Hardened', '★ Нож-бабочка | Градиент',
      '★ Butterfly Knife | Lore', '★ Butterfly Knife | Crimson Web', '★ Штык-нож M9 | Легенды',
      '★ M9 Bayonet | Crimson Web', '★ Talon Knife | Fade', '★ Перчатки спецназа | Кровавое кимоно',
      '★ Driver Gloves | King Snake', '★ Перчатки спецназа | Градиент', '★ Sport Gloves | Superconductor',
    ],
  },
  {
    id: 'bonus30', name: 'КЕЙС №1', price: 30, rc: true, tag: 'За R-COIN', tagIc: 'gift', rtp: .55,
    sub: 'За 30 R-COIN: ширп от 8 до 40 ₽, главный приз — +50 ₽ на баланс',
    th: { a: '#f3c14f' }, img: 'assets/case-bonus.webp',
    bonusSet: { lo: 8, hi: 40, n: 12, cash: { 50: .04 } },
    show: [], items: [],
  },
  {
    id: 'bonus150', name: 'КЕЙС №3', price: 150, rc: true, tag: 'За R-COIN', tagIc: 'gift', rtp: .4,
    sub: 'За 150 R-COIN: скины от 15 до 100 ₽, главный приз — +300 ₽ на баланс',
    th: { a: '#f3c14f' }, img: 'assets/case-bonus.webp',
    bonusSet: { lo: 15, hi: 100, n: 14, cash: { 200: .025, 300: .01 } },
    show: [], items: [],
  },
  {
    id: 'bonus', name: 'КЕЙС №2', price: 50, rc: true, tag: 'За R-COIN', tagIc: 'gift', rtp: .65,
    sub: 'Открывается за R-COIN: ширп от 10 до 55 ₽, деньги на баланс +100 и +200 ₽ и ультра-редкий скин',
    th: { a: '#f3c14f' }, img: 'assets/case-bonus.webp',
    // состав собирается в buildBonus: 14 скинов 10–55 ₽ + ультра ~300 ₽ (1 из 2 000) + 100 ₽ (3%) и 200 ₽ (1%) на баланс
    bonusSet: { lo: 10, hi: 55, n: 14, ultra: 300, ultraCh: .0005, cash: { 100: .03, 200: .01 } },
    show: [], items: [],
  },
  {
    id: 'coco', name: 'CO-CO', price: 60, tag: 'Фарм', tagIc: 'star', rtp: .82,
    sub: 'Фарм-кейс жёлтых скинов: дроп от 5 ₽, ~13% открытий окупаются. Джекпоты — AK-47 | Fuel Injector, MP9 | Bulldozer, M4A1-S | Golden Coil',
    th: { a: '#f5c518' }, img: 'assets/case-chick.webp',
    // точные шансы: [скин, износ, шанс, редкость по таблице (необязательно)]. Шансы нормируются к 100%. Таблица заказчика ×0,84 + 13 жёлтых скинов (16%), затем +10 жёлтых 40–95 ₽ (5%); свои скины — из списка жёлтых csgobroker.cc — итог ×0,95; окупаемость ≈ 83%
    exact: [
      ['Nova | Mandrel', 'FN', .1512], ['Tec-9 | Citric Acid', 'FN', .1176], ['XM1014 | XoooM', 'FN', .0924],
      ['P250 | Re.built', 'FT', .0756], ['P2000 | Grip Tape', 'BS', .0756], ['AUG | Tom Cat', 'BS', .074172],
      ['Desert Eagle | Oxide Blaze', 'FT', .0672], ['Glock-18 | Glockingbird', 'BS', .0588], ['USP-S | Torque', 'MW', .0588],
      ['Five-SeveN | Kami', 'MW', .042, 'restricted'], ['MP7 | Nemesis', 'FT', .0252, 'classified'],
      ['M4A1-S | Golden Coil', 'BS', .00084, 'covert'], ['MP9 | Bulldozer', 'BS', .00042, 'rare'], ['AK-47 | Fuel Injector', 'BS', .000168, 'rare'],
      ['Negev | Bulkhead', 'MW', .0499], ['MAC-10 | Acid Hex', 'FN', .04], ['Sawed-Off | Yorick', 'WW', .025],
      ['Desert Eagle | Bronze Deco', 'FT', .02], ['M4A1-S | Emphorosaur-S', 'FT', .01], ['P2000 | Янтарный градиент', 'FT', .006],
      ['Five-SeveN | Buddy', 'FT', .005], ['Desert Eagle | Light Rail', 'FT', .002], ['P250 | Wingshot', 'BS', .001],
      ['AWP | Phobos', 'FT', .0006], ['AWP | Mortis', 'FT', .0003], ['CZ75-Auto | Yellow Jacket', 'BS', .00015],
      ['MAC-10 | Золотой кирпич', 'FT', .00005],
      // +10 жёлтых скинов ~40–95 ₽ (вместе 5%, чем дороже — тем реже)
      ['G3SG1 | High Seas', 'FT', .00636], ['MP7 | Just Smile', 'MW', .00577], ['R8 Revolver | Banana Cannon', 'MW', .00687],
      ["Tec-9 | Mummy's Rot", 'WW', .00486], ['Nova | Wild Six', 'MW', .00486], ['FAMAS | Neural Net', 'FT', .00398],
      ['MP5-SD | Agent', 'FT', .00709], ['Dual Berettas | Tread', 'BS', .00401], ['XM1014 | Teclu Burner', 'FT', .00298], ['Negev | Power Loader', 'WW', .00321],
    ],
    show: [], items: [],
  },
  {
    id: 'donk', name: 'DONK666', price: 666, tag: 'Новинка', tagIc: 'star', rtp: .82, win: .16,
    sub: 'Сине-чёрный дроп от 400 ₽. Ультра-редкие: ★ Stiletto и ★ Talon Doppler, перчатки King Snake и Hedge Maze',
    th: { a: '#3b82f6' }, img: 'assets/case-donk.webp',
    strict: true, setX: 'donk', minDrop: 400,
    ultra: [
      '★ Stiletto Knife | Doppler (Factory New)', '★ Talon Knife | Doppler (Factory New)', '★ Driver Gloves | King Snake (Minimal Wear)',
      '★ Спортивные перчатки | Живая изгородь (Немного поношенное)',
    ],
    show: [],
    items: [
      'AK-47 | Ледяной уголь', 'M4A1-S | Nightmare', 'AWP | Древесная гадюка',
      'Desert Eagle | Механо-пушка', 'AK-47 | Phantom Disruptor', 'AK-47 | Синий ламинат',
      'M4A1-S | Black Lotus', 'M4A1-S | Decimator', 'M4A1-S | Guardian',
      'M4A4 | Desolate Space', 'M4A4 | Neo-Noir', 'M4A4 | Император',
      'USP-S | Cortex', 'USP-S | Убийство подтверждено', 'USP-S | Неонуар',
      'USP-S | The Traitor', 'USP-S | Printstream', 'Glock-18 | Water Elemental',
      'Glock-18 | Королева пуль', 'Desert Eagle | Printstream', 'Desert Eagle | Ocean Drive',
      'Five-SeveN | Monkey Business', 'MP9 | Hydra', 'P90 | Азимов',
      'SSG 08 | Blood in the Water', 'AWP | Chromatic Aberration', 'AWP | Containment Breach',
      'AWP | Wildfire', 'AK-47 | Frontside Misty', 'AK-47 | Азимов',
      'AK-47 | Вулкан', 'M4A1-S | Blue Phosphor', 'FAMAS | Commemoration',
      'Galil AR | Chromatic Aberration', 'AK-47 | Slate', 'Glock-18 | Vogue',
      'AWP | Exoskeleton', 'AWP | Fever Dream', 'AWP | Duality',
      'MAC-10 | Неоновый гонщик', 'AK-47 | Неоновый гонщик', '★ Gut Knife | Doppler',
      '★ Navaja Knife | Doppler', '★ Shadow Daggers | Doppler', '★ Hand Wraps | Overprint',
      '★ Driver Gloves | Overtake',
    ],
  },
  {
    id: 'drip', name: 'DRIP', price: 59, tag: 'Брелоки', tagIc: 'star', rtp: .82,
    sub: 'Все брелоки CS2 — 78 штук: дроп от 9 ₽, ~18% открытий окупаются. Джекпоты — Butane Buddy, Lil\' Boo, 8 Ball IGL',
    th: { a: '#a259ff' }, img: 'assets/case-drip.webp',
    // все брелоки Lis-Skins: [брелок, без износа, шанс]. Дешевле кейса — почти поровну, дороже — тем реже, чем дороже (×5+ цены кейса — ещё реже); окупаемость держит наклон шансов
    exact: [
      ['Charm | Pocket AWP', null, 0.01563], ['Charm | Gritty', null, 0.01563], ['Charm | Lil\' Ava', null, 0.01594],
      ['Charm | Pinch O\' Salt', null, 0.01594], ['Charm | Lil\' Smokey', null, 0.01594], ['Charm | Biomech', null, 0.01594],
      ['Charm | Fluffy', null, 0.01594], ['Charm | Whittle Guy', null, 0.01594], ['Charm | Lil\' Vino', null, 0.01594],
      ['Charm | Baby\'s AK', null, 0.01623], ['Charm | Lil\' SAS', null, 0.01623], ['Charm | Hot Sauce', null, 0.01677],
      ['Charm | Lil\' Curse', null, 0.01702], ['Charm | Lil\' Baller', null, 0.01702], ['Charm | Backsplash', null, 0.01725],
      ['Charm | Whittle Knife', null, 0.01725], ['Charm | Big Kev', null, 0.01725], ['Charm | Lil\' Tusk', null, 0.01725],
      ['Charm | Splatter Cat', null, 0.01725], ['Charm | Stitch-Loaded', null, 0.01748], ['Charm | Lil\' Cap Gun', null, 0.01748],
      ['Charm | Lil\' Cackle', null, 0.0177], ['Charm | Lil\' Crass', null, 0.01791], ['Charm | Dead Weight', null, 0.01791],
      ['Charm | Lil\' Squatch', null, 0.01869], ['Charm | Disco MAC', null, 0.01887], ['Charm | Lil\' Zen', null, 0.01887],
      ['Charm | Lil\' Facelift', null, 0.01887], ['Charm | Hang Loose', null, 0.01887], ['Charm | Lil\' No. 2', null, 0.01921],
      ['Charm | Lil\' Chomper', null, 0.01921], ['Charm | Hot Hands', null, 0.0207], ['Charm | Big Brain', null, 0.02121],
      ['Charm | Dr. Brian', null, 0.02133], ['Charm | POP Art', null, 0.02145], ['Charm | Bomb Tag', null, 0.02145],
      ['Charm | Lil\' Sandy', null, 0.02157], ['Charm | That\'s Bananas', null, 0.02234], ['Charm | Lil\' Dumplin\'', null, 0.02254],
      ['Charm | Lil\' Buns', null, 0.02274], ['Charm | Chicken Lil\'', null, 0.02313], ['Charm | Glamour Shot', null, 0.02322],
      ['Charm | Lil\' Bloody', null, 0.02402], ['Charm | Pocket Pop', null, 0.02418], ['Charm | Lil\' Whiskers', null, 0.02244],
      ['Charm | Lil\' Teacup', null, 0.02174], ['Charm | Lil\' Prick', null, 0.01393], ['Charm | Lil\' Squirt', null, 0.01253],
      ['Charm | Diner Dog', null, 0.01148], ['Charm | Lil\' Moments', null, 0.01066], ['Charm | Magmatude', null, 0.008958],
      ['Charm | Lil\' Goop', null, 0.008432], ['Charm | Flash Bomb', null, 0.006169], ['Charm | Die-cast AK', null, 0.006133],
      ['Charm | Eye of Ball', null, 0.006098], ['Charm | Lil\' Eco', null, 0.005928], ['Charm | Lil\' Chirp', null, 0.005767],
      ['Charm | Lil\' Monster', null, 0.005643], ['Charm | Hungry Eyes', null, 0.005613], ['Charm | Titeenium AWP', null, 0.005141],
      ['Charm | Piñatita', null, 0.004347], ['Charm | Lil\' Yeti', null, 0.00339], ['Charm | Lil\' Hero', null, 0.003024],
      ['Charm | Diamond Dog', null, 0.002195], ['Charm | Lil\' Happy', null, 0.001619], ['Charm | Hot Wurst', null, 0.001014],
      ['Charm | Baby Karat CT', null, 0.0009187], ['Charm | Semi-Precious', null, 0.0007397], ['Charm | Lil\' Serpent', null, 0.0006305],
      ['Charm | Baby Karat T', null, 0.0005031], ['Charm | Glitter Bomb', null, 0.0004893], ['Charm | Lil\' Ferno', null, 0.0004576],
      ['Charm | Hot Howl', null, 0.000238], ['Charm | Quick Silver', null, 0.0001641], ['Charm | Lil\' Eldritch', null, 0.0001234],
      ['Charm | 8 Ball IGL', null, 0.0001076], ['Charm | Lil\' Boo', null, 0.00002368], ['Charm | Butane Buddy', null, 0.0000122],
    ],
  },
  {
    id: 'rush', name: 'RUSH CASE', price: 199, tag: 'Фирменный', tagIc: 'crown', rtp: 0.82,
    sub: 'Фирменный кейс: яркие скины от 23 ₽, ~22% открытий окупаются, нож или перчатки — 1 из 1 500. Ультра — Karambit и Butterfly | Fade, Sport Gloves | Vice, Specialist Gloves | Fade',
    th: { a: '#ff8a1f' }, img: 'assets/case-rush.webp',
    // яркие скины: дешевле кейса — часто, дороже кейса в 4+ раза — заметно реже; 4 ножа/перчатки ~5 тыс. — вместе 1 из 1 500; 4 ультра (89–159 тыс.) — по 1 из 500 000
    exact: [
      ['MAG-7 | Monster Call', 'WW', 0.05145], ['P90 | Neoqueen', 'WW', 0.05145], ['SG 553 | Dragon Tech', 'BS', 0.05],
      ['P250 | Cyber Shell', 'BS', 0.04932], ['P90 | Wave Breaker', 'BS', 0.04867], ['MAC-10 | Pipe Down', 'WW', 0.0448],
      ['P250 | Inferno', 'FT', 0.04259], ['P2000 | Acid Etched', 'BS', 0.0418], ['M4A4 | Sheet Lightning', 'BS', 0.0407],
      ['SSG 08 | Acid Fade', 'FN', 0.04001], ['Galil AR | Rocket Pop', 'WW', 0.0371], ['Glock-18 | Bunsen Burner', 'FT', 0.03684],
      ['FAMAS | Neural Net', 'FT', 0.03635], ['MP5-SD | Acid Wash', 'FT', 0.03255], ['R8 Revolver | Amber Fade', 'FT', 0.0313],
      ['M4A1-S | Glitched Paint', 'BS', 0.03073], ['Glock-18 | Candy Apple', 'FT', 0.03046], ['M4A1-S | Fizzy POP', 'FT', 0.02781],
      ['AUG | Amber Fade', 'FT', 0.02706], ['AK-47 | Crossfade', 'FT', 0.02427], ['AWP | Duality', 'FT', 0.01962],
      ['USP-S | Cortex', 'WW', 0.01935], ['Galil AR | Chromatic Aberration', 'BS', 0.01825], ['UMP-45 | Neo-Noir', 'WW', 0.01743],
      ['MP7 | Neon Ply', 'MW', 0.01632], ['AWP | Duality', 'MW', 0.0155], ['AK-47 | Phantom Disruptor', 'FT', 0.0152],
      ['FAMAS | Neural Net', 'FN', 0.01472], ['Galil AR | Chromatic Aberration', 'MW', 0.01379], ['USP-S | Cortex', 'MW', 0.01368],
      ['AWP | Duality', 'FN', 0.01219], ['AWP | Fever Dream', 'FT', 0.009731], ['Nova | Hyper Beast', 'FT', 0.009179],
      ['SCAR-20 | Bloodsport', 'FN', 0.007785], ['MP9 | Hypnotic', 'FN', 0.006025], ['M4A4 | Cyber Security', 'WW', 0.004015],
      ['M4A4 | Desolate Space', 'MW', 0.003171], ['UMP-45 | Neo-Noir', 'FN', 0.002209], ['AK-47 | Head Shot', 'BS', 0.001579],
      ['M4A4 | Temukau', 'FT', 0.001185], ['USP-S | Printstream', 'BS', 0.001147], ['AWP | Chromatic Aberration', 'FT', 0.0008834],
      ['Desert Eagle | Printstream', 'WW', 0.0007046], ['AWP | Printstream', 'FT', 0.000433], ['★ Moto Gloves | POW!', 'FT', 0.0001958],
      ['★ Shadow Daggers | Crimson Web', 'WW', 0.0001723], ['★ Bowie Knife | Autotronic', 'FT', 0.0001526], ['★ Navaja Knife | Marble Fade', 'FN', 0.000146],
      ['★ Sport Gloves | Vice', 'MW', 0.000002], ['★ Specialist Gloves | Fade', 'FN', 0.000002], ['★ Karambit | Fade', 'FN', 0.000002],
      ['★ Butterfly Knife | Fade', 'FN', 0.000002],
    ],
  },
  {
    id: 'medkit', name: 'ЛОВИ АПТЕЧКУ', price: 15, tag: 'Фарм', tagIc: 'trend', rtp: 0.8,
    sub: 'Фарм-кейс: открывай до 50 штук за раз, ширп сразу продаётся на баланс. Дроп 3–15 ₽, джекпот — AWP | Азимов и Kukri | Crimson Web (1 из 150 000)',
    th: { a: '#e53935' }, img: 'assets/case-medkit.webp',
    farm: { maxN: 50, sellBelow: 100 }, // фарм: до 50 кейсов за раз, ширп дешевле 100 ₽ сразу продаётся на баланс
    // ширп 3–15 ₽ (чем дороже — тем чаще, возврат 80%) + AWP | Азимов и Kukri | Crimson Web — вместе 1 из 150 000
    exact: [
      ['ПП-19 Бизон | Городская штриховка', 'WW', 0.001008], ['M249 | Sleet', 'FN', 0.001163], ['MAC-10 | Video Cam', 'FT', 0.00218],
      ['Negev | Bulkhead', 'FT', 0.00218], ['Negev | Raw Ceramic', 'FN', 0.00218], ['AUG | Sweeper', 'FN', 0.003622],
      ['Galil AR | Смешанный камуфляж', 'MW', 0.004149], ['P90 | Mustard Gas', 'MW', 0.005592], ['Tec-9 | Citric Acid', 'MW', 0.005592],
      ['Tec-9 | Армейская сетка', 'FN', 0.008109], ['PP-Bizon | Night Ops', 'MW', 0.008109], ['Dual Berettas | Stained', 'FT', 0.0113],
      ['MAC-10 | Poplar Thicket', 'FT', 0.0113], ['MP5-SD | Focus', 'WW', 0.0113], ['PP-Bizon | Brass', 'FT', 0.01515],
      ['PP-Bizon | Traitor', 'MW', 0.01515], ['AUG | Snake Pit', 'BS', 0.01982], ['PP-Bizon | RMX', 'FT', 0.01982],
      ['P90 | Пиксельный камуфляж «Пустыня»', 'FT', 0.02526], ['AUG | Creep', 'BS', 0.02526], ['PP-Bizon | Night Riot', 'BS', 0.02526],
      ['FAMAS | Мяу 36', 'MW', 0.03165], ['Dual Berettas | Бордвойня', 'WW', 0.03165], ['Dual Berettas | Наемник', 'WW', 0.039],
      ['G3SG1 | Смешанный камуфляж', 'MW', 0.039], ['AWP | Африканская сетка', 'FT', 0.04725], ['Zeus x27 | Пиксельный камуфляж «Болото»', 'MW', 0.04725],
      ['AWP | Safari Mesh', 'WW', 0.05668], ['PP-Bizon | Anolis', 'MW', 0.05668], ['Desert Eagle | Tilted', 'BS', 0.05668],
      ['FAMAS | Byproduct', 'WW', 0.06709], ['G3SG1 | Полярный камуфляж', 'FT', 0.06709], ['Tec-9 | Порыв синевы', 'FT', 0.07882],
      ['AUG | Наемник', 'MW', 0.07882], ['Dual Berettas | Silver Pour', 'MW', 0.07882], ['★ Kukri Knife | Crimson Web', 'FT', 0.000003333],
      ['AWP | Азимов', 'FT', 0.000003333],
    ],
  },
  {
    id: 'm4a1s', name: 'M4A1-S', price: 299, tag: 'Оружейный', tagIc: 'trophy', rtp: 0.8,
    sub: 'Только M4A1-S: 27 скинов от 10 ₽ до 204 тыс., ~21% открытий окупаются. Джекпоты — Knight, Hot Rod, Welcome to the Jungle, Imminent Danger',
    th: { a: '#22d3ee' }, img: 'assets/case-m4a1s.webp',
    // скины M4A1-S из списка заказчика: до 2 400 ₽ — обычный дроп; 13–38 тыс. — вместе 1 из 4 000; дороже 50 тыс. — 1 из 176–680 тыс.
    exact: [
      ['M4A1-S | Boreal Forest', 'FT', 0.3344], ['M4A1-S | Nitro', 'FT', 0.1872], ['M4A1-S | Night Terror', 'FT', 0.1567],
      ['M4A1-S | Black Lotus', 'FT', 0.05554], ['M4A1-S | Flashback', 'FT', 0.05277], ['M4A1-S | Briefing', 'FT', 0.05057],
      ['M4A1-S | Blood Tiger', 'FT', 0.04463], ['M4A1-S | Leaded Glass', 'FT', 0.03088], ['M4A1-S | Decimator', 'FT', 0.02899],
      ['M4A1-S | Control Panel', 'FT', 0.02124], ['M4A1-S | Guardian', 'FT', 0.02042], ['M4A1-S | Bright Water', 'FT', 0.01646],
      ['M4A1-S | Сайрекс', 'FT', 0.00005265], ['M4A1-S | Atomic Alloy', 'FN', 0.00004991], ['M4A1-S | Nightmare', 'FN', 0.00004676],
      ['M4A1-S | Hyper Beast', 'FN', 0.00003377], ['M4A1-S | Master Piece', 'FN', 0.00002562], ['M4A1-S | Поток информации', 'FN', 0.00001686],
      ['StatTrak™ M4A1-S | Hyper Beast', 'FN', 0.00001321], ['M4A1-S | Падение Икара', 'MW', 0.00001121], ['M4A1-S | Blue Phosphor', 'MW', 0.000005684],
      ['StatTrak™ M4A1-S | Printstream', 'FN', 0.000003913], ['M4A1-S | Hot Rod', 'FN', 0.000003179], ['M4A1-S | Неотвратимая угроза', 'FN', 0.000002849],
      ['M4A1-S | Добро пожаловать в джунгли', 'FN', 0.000002633], ['M4A1-S | Hot Rod', 'MW', 0.000002555], ['M4A1-S | Knight', 'FN', 0.000001469],
    ],
  },
  {
    id: 'deagle', name: 'DEAGLE', price: 299, tag: 'Оружейный', tagIc: 'trophy', rtp: 0.8,
    sub: 'Только Desert Eagle: 27 скинов от 12 ₽ до 59 тыс., ~17% открытий окупаются. Джекпоты — Blaze, Sunset Storm 壱, Hand Cannon, Emerald Jörmungandr',
    th: { a: '#f0b429' }, img: 'assets/case-deagle.webp',
    // скины Desert Eagle из списка заказчика (ST Blaze не существует — вместо него Blaze MW): до 3 200 ₽ — обычный дроп; 6–30 тыс. — вместе 1 из 3 000; дороже 30 тыс. — 1 из 100–200 тыс.
    exact: [
      ['Desert Eagle | The Daily Deagle', 'FT', 0.1249], ['Desert Eagle | Mint Fan', 'FT', 0.121], ['Desert Eagle | Oxide Blaze', 'FT', 0.1008],
      ['Desert Eagle | Corinthian', 'FT', 0.09689], ['Desert Eagle | Trigger Discipline', 'FT', 0.08497], ['Desert Eagle | Meteorite', 'FT', 0.08038],
      ['Desert Eagle | Light Rail', 'FT', 0.07881], ['Desert Eagle | Directive', 'FT', 0.07406], ['Desert Eagle | Mulberry', 'FT', 0.06759],
      ['Desert Eagle | Механо-пушка', 'FT', 0.05269], ['Desert Eagle | Heirloom', 'FT', 0.04914], ['Desert Eagle | Conspiracy', 'FT', 0.03781],
      ['Desert Eagle | Код красный', 'FT', 0.03066], ['Desert Eagle | Ржавый кобальт', 'FN', 0.00007599], ['Desert Eagle | Pilot', 'FT', 0.00007307],
      ['Desert Eagle | Crimson Web', 'FN', 0.00004056], ['Desert Eagle | Hypnotic', 'FN', 0.00003537], ['Desert Eagle | Pilot', 'FN', 0.00002874],
      ['Desert Eagle | Код красный', 'FN', 0.0000257], ['Desert Eagle | Золотой карп', 'FN', 0.00002376], ['Desert Eagle | Ocean Drive', 'FN', 0.00001986],
      ['Desert Eagle | Fennec Fox', 'FN', 0.00001029], ['Desert Eagle | Изумрудный Ёрмунганд', 'FN', 0.000009549], ['Desert Eagle | Hand Cannon', 'FN', 0.000009335],
      ['Desert Eagle | Sunset Storm 壱', 'FN', 0.000008228], ['Desert Eagle | Пламя', 'FN', 0.000006502], ['Desert Eagle | Пламя', 'MW', 0.000005043],
    ],
  },
  {
    id: 'usps', name: 'USP-S', price: 249, tag: 'Оружейный', tagIc: 'trophy', rtp: 0.8,
    sub: 'Только USP-S: 27 скинов от 33 ₽ до 50 тыс., ~29% открытий окупаются. Джекпоты — ST Kill Confirmed, Whiteout, Target Acquired, ST Printstream',
    th: { a: '#a259ff' }, img: 'assets/case-usps.webp',
    // скины USP-S из списка заказчика: до 1 300 ₽ — обычный дроп; 3–30 тыс. — вместе 1 из 1 800 (дороже — реже); ST Kill Confirmed (50 тыс.) — 1 из 420 тыс.
    exact: [
      ['USP-S | Check Engine', 'FT', 0.1552], ['USP-S | Flashback', 'FT', 0.1538], ['USP-S | Torque', 'FT', 0.1332],
      ['USP-S | Lead Conduit', 'FT', 0.1177], ['USP-S | Guardian', 'FT', 0.07707], ['USP-S | Blood Tiger', 'FT', 0.07638],
      ['USP-S | Cortex', 'FT', 0.07038], ['USP-S | Blueprint', 'FT', 0.06703], ['USP-S | Para Green', 'FT', 0.05578],
      ['USP-S | Stainless', 'FT', 0.05516], ['USP-S | Overgrowth', 'FT', 0.03774], ['USP-S | Orion', 'FT', 0.0001103],
      ['USP-S | Monster Mashup', 'FN', 0.00006578], ['USP-S | Dark Water', 'FT', 0.00006443], ['USP-S | Caiman', 'FN', 0.0000549],
      ['USP-S | Serum', 'FN', 0.0000481], ['USP-S | Orion', 'FN', 0.00004228], ['USP-S | Printstream', 'FN', 0.00003821],
      ['USP-S | The Traitor', 'FN', 0.00003799], ['USP-S | Business Class', 'FN', 0.00002954], ['USP-S | Road Rash', 'FN', 0.00002001],
      ['StatTrak™ USP-S | Neo-Noir', 'FN', 0.00001646], ['USP-S | Kill Confirmed', 'FN', 0.000009351], ['StatTrak™ USP-S | Printstream', 'FN', 0.000007926],
      ['USP-S | Target Acquired', 'FN', 0.000006248], ['USP-S | Whiteout', 'FN', 0.000004038], ['StatTrak™ USP-S | Kill Confirmed', 'FN', 0.000002372],
    ],
  },
  {
    id: 'awp', name: 'AWP', price: 499, tag: 'Оружейный', tagIc: 'trophy', rtp: 0.8,
    sub: 'Только AWP: 31 скин от 12 ₽ до 554 тыс., ~16% открытий окупаются. Джекпоты — Gungnir, Dragon Lore, Medusa, The Prince',
    th: { a: '#3b82f6' }, img: 'assets/case-awp.webp',
    // AWP из списка заказчика: до 8 тыс. — обычный дроп (дороже 2 000 ₽ — реже); 20–66 тыс. — вместе 1 из 4 000; дороже 100 тыс. — 1 из 0,7–3,7 млн
    exact: [
      ['AWP | Safari Mesh', 'FT', 0.1202], ['AWP | Safari Mesh', 'MW', 0.1075], ['AWP | Arsenic Spill', 'FN', 0.08445],
      ['AWP | Гадюка', 'FT', 0.07817], ['AWP | Капилляры', 'MW', 0.07487], ['AWP | Гадюка', 'MW', 0.07112],
      ['AWP | Acheron', 'MW', 0.06428], ['AWP | Phobos', 'FT', 0.06339], ['AWP | ЛАПКИ', 'FT', 0.06311],
      ['AWP | Worm God', 'FT', 0.06213], ['AWP | Mortis', 'FT', 0.05513], ['AWP | Fever Dream', 'FT', 0.0396],
      ['AWP | Электрический улей', 'FT', 0.03228], ['AWP | Красная линия', 'FT', 0.02277], ['AWP | Скоростной зверь', 'FT', 0.02166],
      ['AWP | Chromatic Aberration', 'FT', 0.02098], ['AWP | Неонуар', 'FT', 0.0157], ['AWP | Азимов', 'FT', 0.002358],
      ['StatTrak™ AWP | Wildfire', 'FN', 0.00005582], ['AWP | Oni Taiji', 'MW', 0.00004766], ['AWP | Containment Breach', 'FN', 0.00004259],
      ['AWP | LongDog', 'FN', 0.00003134], ['AWP | Lightning Strike', 'FN', 0.00002683], ['AWP | CMYK', 'FN', 0.00002018],
      ['AWP | Градиент', 'FN', 0.00001606], ['StatTrak™ AWP | Oni Taiji', 'FN', 0.000009527], ['AWP | Desert Hydra', 'FN', 0.000001462],
      ['AWP | Принц', 'FN', 7.424e-7], ['AWP | Медуза', 'MW', 6.118e-7], ['AWP | История о драконе', 'FT', 3.11e-7],
      ['AWP | Gungnir', 'BS', 2.705e-7],
    ],
  },
  {
    id: 'ak47', name: 'AK-47', price: 349, tag: 'Оружейный', tagIc: 'trophy', rtp: 0.8,
    sub: 'Только AK-47: 29 скинов от 10 ₽ до 560 тыс., ~27% открытий окупаются. Джекпоты — Wild Lotus, Hydroponic, Fire Serpent, Gold Arabesque',
    th: { a: '#f97316' }, img: 'assets/case-ak47.webp',
    // AK-47 из списка заказчика: до 8,5 тыс. — обычный дроп (дороже 1 400 ₽ — реже); 26–78 тыс. — вместе 1 из 4 000; дороже 100 тыс. — 1 из 0,7–3,7 млн
    exact: [
      ['AK-47 | Safari Mesh', 'FT', 0.5634], ['AK-47 | Элитное снаряжение', 'FT', 0.1076], ['AK-47 | Slate', 'FT', 0.06244],
      ['AK-47 | Цвет джунглей', 'FT', 0.05535], ['AK-47 | Phantom Disruptor', 'FT', 0.05158], ['AK-47 | Point Disarray', 'FT', 0.03041],
      ['AK-47 | Хищник', 'FT', 0.0282], ['AK-47 | Blue Laminate', 'FT', 0.02788], ['AK-47 | Зелёный глянец', 'FT', 0.02707],
      ['AK-47 | Frontside Misty', 'FT', 0.02622], ['AK-47 | Красная линия', 'FT', 0.009182], ['AK-47 | Inheritance', 'FT', 0.005986],
      ['AK-47 | Азимов', 'FT', 0.00402], ['AK-47 | Neon Revolution', 'FT', 0.0003863], ['StatTrak™ AK-47 | Bloodsport', 'FN', 0.00005279],
      ['AK-47 | Ягуар', 'FN', 0.00004857], ['AK-47 | Case Hardened', 'FN', 0.00004416], ['AK-47 | Вулкан', 'FN', 0.00002802],
      ['AK-47 | AUTOEXEC', 'FN', 0.00002147], ['AK-47 | Огненный змей', 'FT', 0.00001895], ['AK-47 | Jet Set', 'FN', 0.00001462],
      ['StatTrak™ AK-47 | Case Hardened', 'FN', 0.00001103], ['AK-47 | Огненный змей', 'MW', 0.00001039], ['StatTrak™ AK-47 | Vulcan', 'FN', 0.000001485],
      ['AK-47 | Рентген', 'FN', 0.000001169], ['AK-47 | Золотая арабеска', 'FN', 0.00000108], ['AK-47 | Огненный змей', 'FN', 8.874e-7],
      ['AK-47 | Hydroponic', 'FN', 5.646e-7], ['AK-47 | Дикий лотос', 'FT', 2.68e-7],
    ],
  },
  {
    id: 'm4a4', name: 'M4A4', price: 349, tag: 'Оружейный', tagIc: 'trophy', rtp: 0.8,
    sub: 'Только M4A4: 26 скинов от 15 ₽ до 628 тыс., ~21% открытий окупаются. Джекпоты — ST Howl, Howl, Poseidon, The Coalition',
    th: { a: '#ef4444' }, img: 'assets/case-m4a4.webp',
    // M4A4 из списка заказчика: до 6,2 тыс. — обычный дроп (дороже 1 400 ₽ — реже); 22–83 тыс. — вместе 1 из 4 000; дороже 90 тыс. — 1 из 0,6–4,2 млн
    exact: [
      ['M4A4 | Mainframe', 'FT', 0.2528], ['M4A4 | Magnesium', 'FT', 0.1864], ['M4A4 | Converter', 'FT', 0.1704],
      ['M4A4 | Griffin', 'FT', 0.09027], ['M4A4 | Evil Daimyo', 'FT', 0.08914], ['M4A4 | Jungle Tiger', 'FT', 0.06978],
      ['M4A4 | Desert Storm', 'FT', 0.05122], ['M4A4 | Desolate Space', 'FT', 0.04952], ['M4A4 | The Battlestar', 'FT', 0.02065],
      ['M4A4 | Neo-Noir', 'FT', 0.01486], ['M4A4 | X-Ray', 'FT', 0.00255], ['M4A4 | Royal Paladin', 'FT', 0.002169],
      ['M4A4 | Radiation Hazard', 'FN', 0.00004357], ['M4A4 | Hellfire', 'FN', 0.00004169], ['StatTrak™ M4A4 | Full Throttle', 'FN', 0.00003195],
      ['StatTrak™ M4A4 | The Emperor', 'FN', 0.00002982], ['M4A4 | Buzz Kill', 'FN', 0.00002594], ['StatTrak™ M4A4 | Asiimov', 'FT', 0.00002133],
      ['M4A4 | Daybreak', 'FN', 0.00001507], ['M4A4 | Modern Hunter', 'FN', 0.00001434], ['M4A4 | Eye of Horus', 'FN', 0.00001333],
      ['M4A4 | The Coalition', 'FN', 0.000007035], ['M4A4 | Poseidon', 'MW', 0.000005916], ['M4A4 | Poseidon', 'FN', 0.000001541],
      ['M4A4 | Вой', 'FT', 4.307e-7], ['StatTrak™ M4A4 | Howl', 'FT', 2.387e-7],
    ],
  },
  {
    id: 'gloves', name: 'ELITE GLOVES', price: 3999, tag: 'Перчаточный', tagIc: 'gem', rtp: 0.8,
    sub: 'Только перчатки: 28 пар от 2 142 ₽ до 351 тыс. — перчатки в каждом открытии, ~17% окупаются. Джекпоты — Sport Gloves | Ultra Violent, Moto Gloves | Cool Mint',
    th: { a: '#10b981' }, img: 'assets/case-gloves.webp',
    // перчатки из списка заказчика: до 15 тыс. — обычный дроп; 29–86 тыс. — вместе 1 из 600; Cool Mint и Ultra Violent — 1 из 73 и 175 тыс.
    exact: [
      ['★ Driver Gloves | Racing Green', 'BS', 0.1975], ['★ Moto Gloves | Transport', 'BS', 0.1301], ['★ Moto Gloves | Transport', 'FT', 0.1277],
      ['★ Moto Gloves | 3rd Commando Company', 'BS', 0.1064], ['★ Moto Gloves | 3rd Commando Company', 'FT', 0.09931], ['★ Moto Gloves | 3rd Commando Company', 'WW', 0.06867],
      ['★ Moto Gloves | Turtle', 'BS', 0.05], ['★ Moto Gloves | Finish Line', 'BS', 0.04768], ['★ Moto Gloves | Turtle', 'FT', 0.03535],
      ['★ Moto Gloves | Turtle', 'WW', 0.03025], ['★ Sport Gloves | Bronze Morph', 'BS', 0.02246], ['★ Sport Gloves | Bronze Morph', 'FT', 0.01789],
      ['★ Specialist Gloves | Mogul', 'BS', 0.01757], ['★ Driver Gloves | Seigaiha', 'FT', 0.01241], ['★ Driver Gloves | Convoy', 'WW', 0.01064],
      ['★ Moto Gloves | Polygon', 'FT', 0.00908], ['★ Moto Gloves | Blood Pressure', 'FT', 0.006206], ['★ Sport Gloves | Blaze', 'FT', 0.004702],
      ['★ Driver Gloves | Imperial Plaid', 'FT', 0.00273], ['★ Sport Gloves | Omega', 'FT', 0.001706], ['★ Sport Gloves | Vice', 'FT', 0.0004935],
      ['★ Moto Gloves | Eclipse', 'MW', 0.0003823], ['★ Sport Gloves | Nocts', 'FT', 0.0002943], ['★ Driver Gloves | Lunar Weave', 'MW', 0.0002334],
      ['★ Sport Gloves | Slingshot', 'MW', 0.0001653], ['★ Specialist Gloves | Emerald Web', 'FT', 0.00009787], ['★ Moto Gloves | Cool Mint', 'FN', 0.00001371],
      ['★ Sport Gloves | Ultra Violent', 'FN', 0.000005699],
    ],
  },
  {
    id: 'mirage', name: 'MIRAGE', price: 149, tag: 'Карта', tagIc: 'globe', rtp: 0.8,
    sub: 'Карта Mirage: 50 скинов коллекций Mirage, Mirage 2021 и восточной Arabesque — от 10 ₽ до 103 тыс., ~21% открытий окупаются. Джекпоты — AWP | Desert Hydra, AK-47 | Consequence of the Jinn, AWP | Sovereign Flame',
    th: { a: '#d97706' }, img: 'assets/case-mirage.webp',
    // коллекции The Mirage, The 2021 Mirage, Arabesque (50 скинов): до 5 тыс. — обычный дроп (дороже 600 ₽ — реже); 12–44 тыс. — вместе 1 из 3 000; Desert Hydra FN — 1 из 680 тыс.
    exact: [
      ['P250 | Drought', 'FT', 0.0431], ['MAG-7 | Navy Sheen', 'FT', 0.0431], ['MAC-10 | Sienna Damask', 'FT', 0.0431],
      ['PP-Bizon | Anolis', 'FT', 0.04147], ['SSG 08 | Prey', 'FT', 0.03948], ['MP9 | Dune Asp', 'FT', 0.03948],
      ['Nova | Morning Sun', 'FT', 0.03948], ['SCAR-20 | Sirocco Script', 'FT', 0.03948], ['Dual Berettas | Mystic Conjunction', 'FT', 0.03948],
      ['Five-SeveN | Desert Seal', 'FT', 0.03892], ['Dual Berettas | Drift Wood', 'FT', 0.03615], ['FAMAS | CaliCamo', 'FT', 0.03615],
      ['P90 | Verdant Growth', 'FT', 0.03576], ['CZ75-Auto | Midnight Palm', 'FT', 0.0354], ['Sawed-Off | Lunar Wyrm', 'FT', 0.03411],
      ['FAMAS | Snake Song', 'FT', 0.03411], ['MAC-10 | Arabesque Mosaic', 'FT', 0.03327], ['Tec-9 | Sultan', 'FT', 0.02999],
      ['Galil AR | Hunting Blind', 'FT', 0.02243], ['Five-SeveN | Contractor', 'FT', 0.02223], ['AUG | Colony', 'FT', 0.02215],
      ['P90 | Scorched', 'FT', 0.022], ['P250 | Bone Mask', 'FT', 0.02182], ['G3SG1 | Safari Mesh', 'FT', 0.02103],
      ['MP9 | Music Box', 'FT', 0.02062], ['M249 | Humidor', 'FT', 0.02057], ['SG 553 | Desert Blossom', 'FT', 0.02049],
      ['AUG | Lapis Lazuli', 'FT', 0.0192], ['USP-S | Пиксельный камуфляж «Фиолетовый»', 'FT', 0.01916], ['Glock-18 | Ifrit Lattice', 'FT', 0.01881],
      ['P250 | Lotus Imprint', 'FT', 0.01879], ['MAG-7 | Bulldozer', 'FT', 0.008806], ['SG 553 | Gator Mesh', 'FT', 0.005433],
      ['SSG 08 | Tropical Storm', 'FT', 0.005108], ['Glock-18 | Groundwater', 'FT', 0.004759], ['MP7 | Orange Peel', 'FT', 0.004398],
      ['UMP-45 | Пламя', 'FN', 0.003781], ['Negev | CaliCamo', 'FN', 0.0034], ['XM1014 | Elegant Vines', 'FT', 0.003136],
      ['MAC-10 | Янтарный градиент', 'FT', 0.003074], ['AUG | Sand Storm', 'FT', 0.002934], ['Glock-18 | Пиксельный камуфляж «Розовый»', 'FT', 0.002089],
      ['Desert Eagle | Eastern Enigma', 'MW', 0.001095], ['M4A4 | Falak', 'MW', 0.0003242], ['MP5-SD | Oxide Oasis', 'FN', 0.0001276],
      ['MP9 | Хот-род', 'FN', 0.0001045], ['Desert Eagle | Fennec Fox', 'FN', 0.00004834], ['AWP | Пламя суверена', 'FN', 0.00003286],
      ['AK-47 | Consequence of the Jinn', 'FN', 0.00002004], ['AWP | Desert Hydra', 'FN', 0.000001462],
    ],
  },
  {
    id: 'rushb', name: 'RUSH B', price: 249, tag: 'Мемный', tagIc: 'bolt', rtp: 0.8,
    sub: 'GO GO GO!!! 45 граффити-скинов в красно-оранжевом стиле от 25 ₽ до 85 тыс., ~23% открытий окупаются. Джекпоты — Karambit | Slaughter, Autotronic и Crimson Web',
    th: { a: '#ea580c' }, img: 'assets/case-rushb.webp',
    // граффити и стрит-стиль, красный/оранжевый/чёрный: до 3 500 ₽ — обычный дроп (дороже 1 000 ₽ — реже); 8–16 тыс. — вместе 1 из 2 500; три керамбита — 1 из 110–210 тыс.
    exact: [
      ['SG 553 | Dragon Tech', 'BS', 0.0726], ['M4A1-S | Nitro', 'FT', 0.0663], ['M4A1-S | Emphorosaur-S', 'FT', 0.0629],
      ['MAC-10 | Pipe Down', 'FT', 0.06139], ['P250 | Inferno', 'FT', 0.05997], ['USP-S | Ticket to Hell', 'FT', 0.0541],
      ['Desert Eagle | Firebreathing', 'WW', 0.05046], ['Desert Eagle | Trigger Discipline', 'FT', 0.04816], ['MP9 | Ruby Poison Dart', 'FT', 0.04066],
      ['Glock-18 | Candy Apple', 'FT', 0.04023], ['M249 | Magma', 'BS', 0.03864], ['Galil AR | Firefight', 'WW', 0.03828],
      ['CZ75-Auto | Red Astor', 'FT', 0.03809], ['MAC-10 | Heat', 'FT', 0.02586], ['AWP | Duality', 'FT', 0.02383],
      ['UMP-45 | Дикое дитя', 'FT', 0.02274], ['Tec-9 | Isaac', 'FT', 0.02266], ['USP-S | Cortex', 'FT', 0.02196],
      ['MP9 | Food Chain', 'FT', 0.02182], ['Sawed-Off | Kiss♥Love', 'FT', 0.02142], ['Glock-18 | Vogue', 'FT', 0.02107],
      ['AWP | Древесная гадюка', 'FT', 0.0203], ['SG 553 | Cyrex', 'FT', 0.01864], ['MAC-10 | Disco Tech', 'FT', 0.01749],
      ['M4A4 | Spider Lily', 'FT', 0.01526], ['Tec-9 | Fuel Injector', 'FT', 0.01192], ['P250 | Cartel', 'FT', 0.01186],
      ['Nova | Hyper Beast', 'FT', 0.01173], ['Desert Eagle | Kumicho Dragon', 'FT', 0.007532], ['MAC-10 | Toybox', 'FT', 0.006774],
      ['Glock-18 | Snack Attack', 'FT', 0.00671], ['M4A4 | Cyber Security', 'FT', 0.006428], ['Glock-18 | Water Elemental', 'FT', 0.004901],
      ['AK-47 | Красная линия', 'FT', 0.00232], ['AK-47 | Head Shot', 'FT', 0.001963], ['AWP | Скоростной зверь', 'FT', 0.001639],
      ['Desert Eagle | Код красный', 'FT', 0.000952], ['AK-47 | Кровавый спорт', 'FT', 0.0001287], ['M4A4 | Hellfire', 'FT', 0.0001086],
      ['P90 | Азимов', 'FT', 0.00006021], ['AK-47 | Leet Museo', 'FT', 0.00005686], ['SSG 08 | Dragonfire', 'FT', 0.00004564],
      ['★ Karambit | Crimson Web', 'FT', 0.000008867], ['★ Karambit | Autotronic', 'FT', 0.000006441], ['★ Karambit | Slaughter', 'FN', 0.000004734],
    ],
  },
  {
    id: 'reallife', name: 'THIS IS REAL LIFE', price: 149, tag: 'Мемный', tagIc: 'bolt', rtp: 0.8,
    sub: 'No respawn: 46 военных скинов — камуфляж, хаки, пустыня — от 10 ₽ до 77 тыс., ~21% открытий окупаются. Джекпоты — Sport Gloves | Arid, Butterfly и Karambit в камуфляже',
    th: { a: '#84a33a' }, img: 'assets/case-reallife.webp',
    // военная тема (камуфляж, хаки, пустыня): до 3 тыс. — обычный дроп (дороже 600 ₽ — реже); ножи/перчатки и Wasteland Rebel 6–18 тыс. — вместе 1 из 2 500; Karambit, Butterfly, Sport Gloves Arid — 1 из 93–258 тыс.
    exact: [
      ['P90 | Desert DDPAT', 'FT', 0.03998], ['AK-47 | Safari Mesh', 'FT', 0.0394], ['AK-47 | Olive Polycam', 'FT', 0.0394],
      ['M4A1-S | Boreal Forest', 'FT', 0.0394], ['MP7 | Army Recon', 'FT', 0.0394], ['Nova | Predator', 'FT', 0.0394],
      ['Negev | Army Sheen', 'FT', 0.0394], ['SCAR-20 | Sand Mesh', 'FT', 0.0394], ['Sawed-Off | Forest DDPAT', 'FT', 0.0394],
      ['Zeus x27 | Swamp DDPAT', 'FT', 0.0394], ['AWP | Safari Mesh', 'FT', 0.03841], ['USP-S | Desert Tactical', 'FT', 0.03841],
      ['M4A4 | Urban DDPAT', 'FT', 0.03841], ['USP-S | Night Ops', 'FT', 0.03756], ['FAMAS | CaliCamo', 'FT', 0.03505],
      ['UMP-45 | Briefing', 'FT', 0.03457], ['MP5-SD | Desert Strike', 'FT', 0.03413], ['M249 | Predator', 'FT', 0.03142],
      ['M4A4 | Converter', 'FT', 0.03107], ['AWP | Гадюка', 'FT', 0.02859], ['MP7 | Special Delivery', 'FT', 0.02792],
      ['AWP | Phobos', 'FT', 0.02476], ['AK-47 | Safety Net', 'FT', 0.02365], ['FAMAS | Sergeant', 'FT', 0.02361],
      ['P90 | Desert Warfare', 'FT', 0.02326], ['MP7 | Olive Plaid', 'FT', 0.02238], ['M4A1-S | Briefing', 'FT', 0.02141],
      ['M4A4 | Jungle Tiger', 'FT', 0.0207], ['M4A1-S | Basilisk', 'FT', 0.01961], ['AWP | Elite Build', 'FT', 0.01128],
      ['M4A4 | Desert Storm', 'FT', 0.01048], ['AK-47 | Хищник', 'FT', 0.007716], ['SG 553 | Gator Mesh', 'FT', 0.007498],
      ['Galil AR | Orange DDPAT', 'FT', 0.005508], ['Nova | Modern Hunter', 'FT', 0.004351], ['M4A4 | Desert-Strike', 'FT', 0.001778],
      ['M4A4 | Modern Hunter', 'FT', 0.001441], ['★ Moto Gloves | Boom!', 'BS', 0.0001127], ['Glock-18 | Wasteland Rebel', 'FT', 0.00007881],
      ['★ Skeleton Knife | Safari Mesh', 'FT', 0.00007736], ['★ Bayonet | Forest DDPAT', 'FT', 0.00007214], ['★ Talon Knife | Boreal Forest', 'FT', 0.00003437],
      ['★ Specialist Gloves | Forest DDPAT', 'FT', 0.00002466], ['★ Karambit | Boreal Forest', 'FT', 0.00001071], ['★ Butterfly Knife | Forest DDPAT', 'FT', 0.000009469],
      ['★ Sport Gloves | Arid', 'MW', 0.000003881],
    ],
  },
  {
    id: 'crybabies', name: 'CRY LIKE BABIES', price: 399, tag: 'Мемный', tagIc: 'bolt', rtp: 0.8,
    sub: 'No skill, just luck: 44 розово-голубых скина от 24 ₽ до 129 тыс., ~18% открытий окупаются. Джекпоты — Karambit, Talon и Skeleton | Fade',
    th: { a: '#ec4899' }, img: 'assets/case-crybabies.webp',
    // розово-голубые и мультяшные скины: до 4,5 тыс. — обычный дроп (дороже 1 600 ₽ — заметно реже); Fade-ножи, Specialist Gloves Fade, Neon Revolution, Leet Museo 8–14 тыс. — вместе 1 из 3 000; Skeleton, Talon, Karambit | Fade — 1 из 140–515 тыс.
    exact: [
      ['P90 | Neoqueen', 'FT', 0.04007], ['P90 | Vent Rush', 'FT', 0.03974], ['P250 | Cyber Shell', 'FT', 0.03943],
      ['R8 Revolver | Crazy 8', 'FT', 0.039], ['Dual Berettas | Flora Carnivora', 'FT', 0.039], ['M4A1-S | Emphorosaur-S', 'FT', 0.03849],
      ['MAG-7 | Monster Call', 'FT', 0.03814], ['Tec-9 | Bamboozle', 'FT', 0.03752], ['M4A1-S | Night Terror', 'FT', 0.03742],
      ['MAC-10 | Саккаку', 'FT', 0.03673], ['Glock-18 | Bunsen Burner', 'FT', 0.03642], ['Glock-18 | Moonrise', 'FT', 0.03586],
      ['SSG 08 | Fever Dream', 'FT', 0.03494], ['M4A1-S | Fizzy POP', 'FT', 0.03348], ['XM1014 | Monster Melt', 'FT', 0.03252],
      ['SG 553 | Pulse', 'FT', 0.03108], ['AWP | Duality', 'FT', 0.03017], ['USP-S | Jawbreaker', 'FT', 0.02993],
      ['UMP-45 | Дикое дитя', 'FT', 0.02982], ['USP-S | Cortex', 'FT', 0.02956], ['Sawed-Off | Kiss♥Love', 'FT', 0.02937],
      ['AK-47 | Ледяной уголь', 'FT', 0.029], ['UMP-45 | Neo-Noir', 'FT', 0.02883], ['MP9 | Mount Fuji', 'FT', 0.02842],
      ['FAMAS | Rapid Eye Movement', 'FT', 0.02755], ['Dual Berettas | Melondrama', 'FT', 0.02748], ['AWP | Fever Dream', 'FT', 0.02534],
      ['MAC-10 | Toybox', 'FT', 0.02411], ['Glock-18 | Water Elemental', 'FT', 0.02364], ['Glock-18 | Пиксельный камуфляж «Розовый»', 'FT', 0.02036],
      ['M4A4 | Temukau', 'FT', 0.01025], ['AWP | Chromatic Aberration', 'FT', 0.007249], ['AK-47 | Неоновый гонщик', 'FT', 0.003075],
      ['M4A1-S | Player Two', 'FT', 0.002349], ['MP9 | Starlight Protector', 'FT', 0.001756], ['Desert Eagle | Ocean Drive', 'FT', 0.001565],
      ['AK-47 | Neon Revolution', 'FT', 0.00008679], ['★ Gut Knife | Fade', 'FN', 0.00008675], ['★ Shadow Daggers | Fade', 'FN', 0.00006782],
      ['★ Specialist Gloves | Fade', 'FT', 0.00005089], ['AK-47 | Leet Museo', 'FT', 0.00004108], ['★ Skeleton Knife | Fade', 'FN', 0.00000725],
      ['★ Talon Knife | Fade', 'FN', 0.00000455], ['★ Karambit | Fade', 'FN', 0.000001941],
    ],
  },
  {
    id: '1vs5', name: '1vs5', price: 249, tag: 'Клатч', tagIc: 'crown', rtp: 0.8,
    sub: 'One against five, never give up: 42 фиолетовых скина — обычный дроп до 250 ₽, пять дорогих по 10–15 тыс. (1 из 200) и три ультра до 150 тыс.',
    th: { a: '#8b5cf6' }, img: 'assets/case-1vs5.webp',
    // фиолетово-белые скины: 34 обычных до 250 ₽; 5 дорогих 10–15 тыс. — вместе 1 из 200 (клатч — редко, но крупно); Karambit Ultraviolet, Sport Gloves Pandora's Box, Butterfly Ultraviolet — 1 из 150–500 тыс.
    exact: [
      ['R8 Revolver | Monarch', 'WW', 0.00817], ['Five-SeveN | Dark Polymer', 'BS', 0.008453], ['M4A4 | Dark Operative', 'WW', 0.009287],
      ['P90 | Neoqueen', 'WW', 0.009287], ['Five-SeveN | Violent Daimyo', 'BS', 0.00956], ['M249 | Spectre', 'MW', 0.00956],
      ['Negev | Sour Grapes', 'FN', 0.00956], ['PP-Bizon | Night Riot', 'FN', 0.01092], ['Glock-18 | Wraiths', 'BS', 0.01092],
      ['P2000 | Royal Baroque', 'MW', 0.01092], ['USP-S | Royal Guard', 'BS', 0.01198], ['SG 553 | Darkwing', 'WW', 0.01381],
      ['UMP-45 | Moonrise', 'FT', 0.01433], ['M4A1-S | Night Terror', 'FT', 0.01509], ['UMP-45 | Late Night Transit', 'MW', 0.0181],
      ['Glock-18 | Moonrise', 'FT', 0.02006], ['P2000 | Pulse', 'FT', 0.0239], ['M249 | Nebula Crusader', 'WW', 0.02437],
      ['SG 553 | Phantom', 'BS', 0.02437], ['M4A1-S | Glitched Paint', 'BS', 0.02601], ['SSG 08 | Ghost Crusader', 'BS', 0.02833],
      ['Glock-18 | Night', 'FT', 0.03332], ['Glock-18 | Royal Legion', 'BS', 0.04016], ['MP7 | Neon Ply', 'BS', 0.04511],
      ['SSG 08 | Dark Water', 'FT', 0.04532], ['AK-47 | Midnight Laminate', 'BS', 0.04808], ['Five-SeveN | Nightshade', 'FT', 0.05165],
      ['SG 553 | Pulse', 'BS', 0.05165], ['Nova | Ghost Camo', 'FN', 0.05764], ['AWP | Duality', 'BS', 0.05826],
      ['MAC-10 | Ультрафиолет', 'FT', 0.05866], ['Dual Berettas | Royal Consorts', 'BS', 0.0605], ['USP-S | Пиксельный камуфляж «Фиолетовый»', 'FT', 0.06212],
      ['USP-S | Cortex', 'WW', 0.06555], ['★ Bayonet | Ultraviolet', 'FT', 0.001274], ['★ Skeleton Knife | Night Stripe', 'FT', 0.001144],
      ['Glock-18 | Неонуар', 'FN', 0.001018], ['AK-47 | Неоновый гонщик', 'FN', 0.0008074], ['M4A1-S | Nightmare', 'FN', 0.0007557],
      ['★ Karambit | Ultraviolet', 'MW', 0.000006656], ['★ Sport Gloves | Pandora\'s Box', 'BS', 0.000002023], ['★ Butterfly Knife | Ultraviolet', 'FN', 0.000002006],
    ],
  },
  {
    id: 'agents', name: 'AGENTS', price: 499, tag: 'Агенты', tagIc: 'users', rtp: 0.8,
    sub: 'Все агенты CS2 — 63 персонажа от 304 ₽ до 5,3 тыс.: Phoenix, Sabre, SEAL, SWAT, The Professionals, Guerrilla Warfare. Джекпоты — Sir Bloody Miami Darryl, Primeiro Tenente, Getaway Sally',
    th: { a: '#2563eb' }, img: 'assets/case-agents.webp',
    // все агенты Lis-Skins: до 1 000 ₽ — обычный дроп (дешевле — чаще); дороже 1 000 ₽ — вместе 1 из 200 (дороже — реже)
    exact: [
      ['Soldier | Phoenix', null, 0.2088], ['Enforcer | Phoenix', null, 0.1663], ['Maximus | Sabre', null, 0.1086],
      ['Dragomir | Sabre', null, 0.09293], ['Rezan The Ready | Sabre', null, 0.04916], ['Buckshot | NSWC SEAL', null, 0.04264],
      ['Blackwolf | Sabre', null, 0.04184], ['Prof. Shahmat | Elite Crew', null, 0.0407], ['Rezan the Redshirt | Sabre', null, 0.03217],
      ['\'Two Times\' McCoy | USAF TACP', null, 0.03188], ['Slingshot | Phoenix', null, 0.02896], ['\'Two Times\' McCoy | TACP Cavalry', null, 0.02142],
      ['Dragomir | Sabre Footsoldier', null, 0.02024], ['Markus Delrow | FBI HRT', null, 0.01461], ['B Squadron Officer | SAS', null, 0.01346],
      ['1st Lieutenant Farlow | SWAT', null, 0.01278], ['Osiris | Elite Crew', null, 0.01024], ['Ground Rebel  | Elite Crew', null, 0.005429],
      ['Aspirant | Gendarmerie Nationale', null, 0.005233], ['John \'Van Healen\' Kask | SWAT', null, 0.004926], ['Sous-Lieutenant Medic | Gendarmerie Nationale', null, 0.004668],
      ['Operator | FBI SWAT', null, 0.004668], ['Seal Team 6 Soldier | NSWC SEAL', null, 0.004668], ['The Elite Mr. Muhlik | Elite Crew', null, 0.004504],
      ['Chem-Haz Specialist | SWAT', null, 0.004399], ['Bio-Haz Specialist | SWAT', null, 0.00385], ['Michael Syfers  | FBI Sniper', null, 0.003617],
      ['\'The Doctor\' Romanov | Sabre', null, 0.003438], ['3rd Commando Company | KSK', null, 0.003164], ['\'Blueberries\' Buckshot | NSWC SEAL', null, 0.001222],
      ['Lieutenant \'Tree Hugger\' Farlow | SWAT', null, 0.001168], ['Arno The Overgrown | Guerrilla Warfare', null, 0.0009968], ['Street Soldier | Phoenix', null, 0.0009712],
      ['Cmdr. Mae \'Dead Cold\' Jamison | SWAT', null, 0.0007156], ['Sergeant Bombson | SWAT', null, 0.0006984], ['Lt. Commander Ricksaw | NSWC SEAL', null, 0.0004126],
      ['Officer Jacques Beltram | Gendarmerie Nationale', null, 0.0004121], ['Safecracker Voltzmann | The Professionals', null, 0.000351], ['Lieutenant Rex Krikey | SEAL Frogman', null, 0.0003356],
      ['Special Agent Ava | FBI', null, 0.0003024], ['Crasswater The Forgotten | Guerrilla Warfare', null, 0.0002946], ['Chem-Haz Capitaine | Gendarmerie Nationale', null, 0.00028],
      ['Chef d\'Escadron Rouchard | Gendarmerie Nationale', null, 0.0002758], ['Jungle Rebel | Elite Crew', null, 0.0002721], ['Col. Mangos Dabisi | Guerrilla Warfare', null, 0.0001992],
      ['\'Medium Rare\' Crasswater | Guerrilla Warfare', null, 0.0001979], ['Little Kev | The Professionals', null, 0.0001975], ['Trapper Aggressor | Guerrilla Warfare', null, 0.0001715],
      ['Elite Trapper Solman | Guerrilla Warfare', null, 0.000154], ['Trapper | Guerrilla Warfare', null, 0.0001315], ['Bloody Darryl The Strapped | The Professionals', null, 0.0001301],
      ['Sir Bloody Silent Darryl | The Professionals', null, 0.0001222], ['Sir Bloody Skullhead Darryl | The Professionals', null, 0.0001116], ['Vypa Sista of the Revolution | Guerrilla Warfare', null, 0.0000973],
      ['Cmdr. Frank \'Wet Sox\' Baroud | SEAL Frogman', null, 0.00009545], ['Cmdr. Davida \'Goggles\' Fernandez | SEAL Frogman', null, 0.00009438], ['Sir Bloody Darryl Royale | The Professionals', null, 0.00008767],
      ['Number K | The Professionals', null, 0.00006439], ['Sir Bloody Loudmouth Darryl | The Professionals', null, 0.00005675], ['D Squadron Officer | NZSAS', null, 0.00004172],
      ['Getaway Sally | The Professionals', null, 0.00004121], ['Primeiro Tenente | Brazilian 1st Battalion', null, 0.00003521], ['Sir Bloody Miami Darryl | The Professionals', null, 0.0000341],
    ],
  },
  {
    id: 'karambit', name: 'KARAMBIT', price: 39999, tag: 'Ножевой', tagIc: 'knife', rtp: .85, win: .2,
    sub: 'Только керамбиты: от 32 000 ₽ до Crimson Web FN — 30 позиций',
    th: { a: '#e11d48' }, img: 'assets/case-karambit.webp', overlay: 'shine',
    // состав собирается в buildKnife: керамбиты от min ₽ — n позиций (часть дешевле цены, остальное дороже); дороже ×5 — ультра
    knifeSet: { re: 'Karambit', min: 31900, below: 10, n: 30 },
    show: [], items: [],
  },
  {
    id: 'orange', name: 'Оранж', price: 140, tag: 'Новинка', tagIc: 'fire', rtp: .9,
    sub: 'Оранжевые скины от 50 ₽ и редкие джекпоты',
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
/* состав кейсов: сет из ~18 предметов под цену кейса, из тематики кейса + агенты/ножи/перчатки с market.csgo.com */
{
  const hsh = t => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  const pickX = (cat, lo, hi, n, seed) => ITEMS.filter(x => x.c === cat && x.p >= lo && x.p <= hi).sort((x, y) => hsh(seed + x.name) - hsh(seed + y.name)).slice(0, n);
  const ADD = {
    orange: [['agent', 60, 1500, 2], ['knife', 3000, 15000, 3]],
    alt: [['agent', 150, 4000, 2], ['knife', 5000, 30000, 4]],
    cotton: [['agent', 300, 8000, 2], ['knife', 8000, 60000, 6], ['gloves', 8000, 60000, 3]],
    premium: [['knife', 20000, 260000, 16], ['gloves', 20000, 200000, 6], ['agent', 1500, 20000, 2]],
  };
  // цена, окупаемость и доля «дроп дороже кейса»
  const SETUP = {
    alt: { price: 169, rtp: .8, win: .2 },
    orange: { price: 379, rtp: .8, win: .18 },
    cotton: { price: 819, rtp: .8, win: .18 },
    premium: { price: 3549, rtp: .75, win: .15 },
  };
  // сет: по одному предмету на каждую цель (доля от цены кейса), без повторов одного скина в разных износах
  const band = (a, b, n) => Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
  const SET_X = {
    sifon: [.03, .06, .1, .15, .2, .27, .35, .45, .55, .65, .75, .85, .95, 1.05, 1.12, 1.2, 1.28, 1.34, 1.6, 2.1, 2.8, 3.6, 4.6, 5.7, 6.9],
    // 46 ступеней: минимальный дроп, средний (около цены), крупный, джекпоты
    def: [...band(.03, .45, 14), ...band(.5, 1.45, 16), ...band(1.6, 6, 10), ...band(8, 40, 6)],
    donk: [...band(400 / 666, .97, 10), ...band(1.04, 1.6, 8), ...band(1.75, 6, 9), ...band(7, 25, 6)],
    zont: [...band(65 / 169, 230 / 169, 10), ...band(1.45, 10, 18)],
    gold: [...band(65000 / 89999, .98, 8), ...band(1.03, 1.6, 6), ...band(2, 6, 4)],
    s1: [...band(95 / 322, 320 / 322, 10), ...band(1.02, 1.45, 8), ...band(1.6, 6, 8), ...band(8, 40, 5)],
  };
  const BIG_MASS = .01; // крупный дроп ≈ 1 из 100 открытий
  const baseOf = s => s.base || s.name, dist = (s, t) => Math.abs(Math.log(s.p / t));
  function buildSet(c, pool, xs, used = new Set(), min = 0) {
    const out = [];
    const near = (arr, t) => arr.reduce((b, s) => used.has(baseOf(s)) ? b : !b || dist(s, t) < dist(b, t) ? s : b, null);
    for (const x of xs) {
      const t = c.price * x, side = i => x > 1 ? i.p > c.price : i.p <= c.price; // ступень выше цены кейса — только дороже кейса, и наоборот
      let it = near(pool.filter(side), t);
      // в тематике нет ничего близкого по цене — берём из общего каталога (дорогие цели — ножи и перчатки)
      if (!c.strict && (!it || dist(it, t) > .5)) {
        const alt = near(ITEMS.filter(i => i.p >= min && side(i)).filter(i => x >= 6 ? i.c === 'knife' || i.c === 'gloves' : i.c === 'skin' || i.c === 'junk'), t);
        if (alt && (!it || dist(alt, t) < dist(it, t))) it = alt;
      }
      if (it) { used.add(baseOf(it)); out.push(it.name); }
    }
    return out;
  }
  // минимальный дроп не дешевле floor ₽ + n дополнительных позиций в диапазоне lo–hi ₽
  const EXTRA_SET = { alt: [100, 100, 400, 15], sifon: [9, 9, 15, 10], frog: [70, 70, 240, 12], orange: [50, 50, 300, 20], cotton: [200, 200, 800, 25], premium: [600, 600, 3500, 25] };
  function addBand(c, pool) {
    const e = EXTRA_SET[c.id]; if (!e) return;
    const [floor, lo, hi, n] = e;
    c.items = c.items.filter(nm => SK[nm].p >= floor);
    const used = new Set(c.items.map(nm => baseOf(SK[nm])));
    c.items.push(...buildSet(c, pool.filter(x => x.p >= floor), band(lo, hi, n).map(t => t / c.price), used, floor));
  }
  function buildBonus(c) {
    const b = c.bonusSet, pool = ITEMS.filter(x => (x.c === 'skin' || x.c === 'junk') && x.p >= b.lo && x.p <= b.hi);
    c.strict = true;
    c.items = buildSet(c, pool, band(b.lo / c.price, b.hi / c.price, b.n), new Set(), b.lo);
    const usedB = new Set(c.items.map(n => baseOf(SK[n])));
    const ul = !b.ultra ? null : ITEMS.filter(x => x.c === 'skin' && !usedB.has(baseOf(x))).reduce((a, x) => !a || Math.abs(x.p - b.ultra) < Math.abs(a.p - b.ultra) ? x : a, null);
    c.fix = {};
    if (ul) { c.items.push(ul.name); c.fix[ul.name] = b.ultraCh; }
    Object.entries(b.cash).forEach(([v, ch]) => { const n = `${v} ₽ на баланс`; c.items.push(n); c.fix[n] = ch; });
  }
  function buildKnife(c) {
    const k = c.knifeSet, all = ITEMS.filter(x => x.name.includes(k.re) && x.p >= k.min).sort((a, b) => a.p - b.p);
    const lo = all.filter(x => x.p < c.price), hi = all.filter(x => x.p >= c.price);
    const spread = (arr, n) => Array.from({ length: Math.min(n, arr.length) }, (_, i) => arr[Math.round(i * (arr.length - 1) / Math.max(1, n - 1))]);
    c.items = [...new Set([...spread(lo, k.below), ...spread(hi, k.n - k.below)].map(x => x.name))];
    c.fix = {}; c.items.filter(n => SK[n].p >= c.price * 10).forEach(n => { c.fix[n] = .000005; }); // ультра — 1 из 200 000
  }
  CASES.forEach(c => {
    if (c.exact) {
      // нужный износ; если его нет в каталоге — ближайший по цене к самому дешёвому
      c.exactCh = {}; c.exactR = {};
      c.items = c.exact.map(([b, q, ch, r]) => {
        const v = (VARIANTS[b] || []).map(n => SK[n]), it = v.find(x => x.q === q) || v.sort((x, y) => x.p - y.p)[0] || SK[b];
        if (!it) throw new Error('Нет скина: ' + b);
        c.exactCh[it.name] = (c.exactCh[it.name] || 0) + ch; if (r) c.exactR[it.name] = r; return it.name;
      });
      c.items = [...new Set(c.items)];
      // цены меняются (синхронизация с Lis-Skins) — таблицу наклоняем (шанс × p^t), чтобы окупаемость осталась c.rtp
      const ps = c.items.map(n => SK[n].p), base = c.items.map(n => c.exactCh[n]);
      const tilt = t => { const w = base.map((b, i) => b * ps[i] ** t), s = w.reduce((a, b) => a + b, 0); return w.map(x => x / s); };
      const ev = t => tilt(t).reduce((a, w, i) => a + w * ps[i], 0);
      let a = -3, b = 3; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (ev(m) < c.price * c.rtp) a = m; else b = m; }
      tilt((a + b) / 2).forEach((w, i) => { c.exactCh[c.items[i]] = w; });
      return;
    }
    if (c.bonusSet) return buildBonus(c);
    if (c.knifeSet) return buildKnife(c);
    Object.assign(c, SETUP[c.id] || {});
    c.items = [...new Set(c.items.flatMap(n => VARIANTS[n] || [n]))];
    if (c.fix) for (const [n, v] of Object.entries(c.fix)) if (VARIANTS[n]) { delete c.fix[n]; VARIANTS[n].forEach(x => { c.fix[x] = v / VARIANTS[n].length; }); }
    if (c.maxWin) {
      // «Сифон»: оружие до maxWin ₽; зафиксированный нож остаётся
      const fixed = c.items.filter(n => c.fix && c.fix[n] != null);
      const pool = c.items.filter(n => !fixed.includes(n) && SK[n].p <= c.maxWin).map(n => SK[n]);
      c.items = [...buildSet(c, pool.length ? pool : ITEMS.filter(i => i.p <= c.maxWin), SET_X.sifon).filter(n => SK[n].p <= c.maxWin)];
      addBand(c, pool);
      c.items.push(...fixed);
      // дороже кейса в 1,5+ раза (≈ 45–200 ₽) — вместе ~5% открытий, чем дороже — тем реже
      const big = c.items.filter(n => !fixed.includes(n) && SK[n].p >= c.price * 1.5), bw = big.map(n => SK[n].p ** -1.5), sbw = bw.reduce((x, y) => x + y, 0);
      big.forEach((n, i) => { c.fix[n] = .05 * bw[i] / sbw; });
      return;
    }
    // ультра/редкие не идут в обычный дроп другими износами; при ultraMin — наоборот, убираем только всё дороже ultraMin
    const ub = c.ultraMin ? new Set() : new Set([...(c.ultra || []), ...(c.rare || [])].filter(n => SK[n]).map(n => baseOf(SK[n])));
    const pool = c.items.map(n => SK[n]).filter(x => x && !ub.has(baseOf(x)) && x.p >= (c.minDrop || 0) && x.p < (c.ultraMin || Infinity));
    (ADD[c.id] || []).forEach(([cat, lo, hi, n]) => pool.push(...pickX(cat, lo, hi, n, c.id)));
    c.items = buildSet(c, pool, SET_X[c.setX] || SET_X.def);
    // дополнительные позиции дороже more[0] ₽ — любые износы (повтор скина в другом износе допустим), равномерно по цене
    if (c.more) {
      const [lo, n] = c.more, cand = pool.filter(x => x.p >= lo && !c.items.includes(x.name)).sort((a, b) => a.p - b.p);
      const take = new Set(); for (let i = 0; i < n && cand.length; i++) take.add(cand[Math.round(i * (cand.length - 1) / Math.max(1, n - 1))].name);
      c.items.push(...take);
    }
    // временный «щедрый» режим кейса
    if (c.promo) { Object.assign(c, { rtp: c.promo.rtp, win: c.promo.win }); (c.promo.add || []).filter(n => SK[n] && !c.items.includes(n)).forEach(n => c.items.push(n)); }
    (c.rare || []).filter(n => SK[n]).forEach(n => c.items.push(n));
    addBand(c, pool);
    // крупный дроп (дороже кейса в 1,5+ раза) — очень редкий: все вместе BIG_MASS открытий, чем дороже — тем реже (~p^-1.5)
    c.fix = {};
    const big = c.items.filter(n => SK[n].p >= c.price * 1.5), bw = big.map(n => SK[n].p ** -1.5), sbw = bw.reduce((x, y) => x + y, 0);
    // если есть ультра-предметы — обычный крупный дроп не реже 1 из 50 000, чтобы ультра оставались самыми редкими
    big.forEach((n, i) => { c.fix[n] = Math.max(c.ultra ? .00002 : 0, BIG_MASS * bw[i] / sbw); });
    (c.ultra || []).filter(n => SK[n]).forEach(n => { c.items.push(n); c.fix[n] = c.ultraCh || Math.min(.00001, c.price * .01 / SK[n].p); });
  });
}
CASES.sort((a, b) => a.price - b.price); // витрина: от самого дешёвого к самому дорогому
CASES.forEach(c => {
  const items = c.items.map(n => { if (!SK[n]) throw new Error('Нет скина: ' + n); return SK[n]; });
  const ch = c.exact ? items.map(s => c.exactCh[s.name]) : c.bonusSet ? solveBonus(items, c.price * c.rtp, c.fix) : c.kh ? solveWinKh(items, c.price * c.rtp, c.price, c.win, c.kh, c.fix) : c.win ? solveWin(items, c.price * c.rtp, c.price, c.win, c.fix) : solveChances(items, c.price * c.rtp);
  const fwRaw = ch.map(x => Math.sqrt(x)), fs = fwRaw.reduce((a, b) => a + b, 0);
  c.items = items.map((s, i) => ({ ...s, ...(c.exactR && c.exactR[s.name] ? { r: c.exactR[s.name] } : {}), ch: ch[i], fw: fwRaw[i] / fs })).sort((a, b) => b.p - a.p);
  c.rareChance = c.items.filter(s => s.r === 'rare').reduce((a, s) => a + s.ch, 0);
  c.show = c.items.slice(0, 3).map(s => s.name);
});
CASES.sort((a, b) => a.price - b.price);
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
const freshProfile = () => ({ balance: 0, rcoin: 0, rlog: [], inv: [], stats: { opened: 0, spent: 0, upg: 0, upgWin: 0, con: 0, best: null, dep: 0 }, daily: 0, promos: [], depBonus: 0, socials: [], trade: '' });
const DEF = () => ({ user: null, ...freshProfile(), sound: true, fast: false, upgFast: false, accounts: {} });
let st;
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  st = Object.assign(DEF(), raw || {});
  st.stats = Object.assign(freshProfile().stats, st.stats || {});
} catch (e) { st = DEF(); }
/* ---------- база Supabase: аккаунты, профиль, общие ставки ---------- */
const SB_URL = 'https://gkeexoyrxnsarosymdyp.supabase.co', SB_KEY = 'sb_publishable_oczOEZFsdpzmwq8FB4Of_Q_A_JSZ3zt'; // публичный ключ — ему место в коде
const sb = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null;
const PROF_KEYS = ['balance', 'rcoin', 'rlog', 'inv', 'stats', 'daily', 'promos', 'depBonus', 'socials', 'trade', 'umults'];
let sbSaveT = 0;
// профиль пишется в базу с задержкой (пачкой), локально — сразу
async function sbPush() {
  return; // профиль (баланс, инвентарь, бонусы) меняет только сервер — см. supabase/server.sql
  clearTimeout(sbSaveT);
  if (!sb || !st.user || !st.user.sb) return;
  const data = {}; PROF_KEYS.forEach(k => { data[k] = st[k]; }); data.rlog = (st.rlog || []).slice(0, 60);
  const { error } = await sb.from('profiles').update({ data, updated_at: new Date().toISOString() }).eq('id', st.user.id);
  if (error) console.warn('profile save', error.message);
}
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* приватный режим */ }
};
/* ответ сервера → состояние сайта: баланс (с анимацией), R-COIN, инвентарь, статистика, бонусы */
function sbApply(d) {
  if (!d) return;
  const bal = +d.balance || 0;
  PROF_KEYS.forEach(k => { if (k !== 'balance' && d[k] !== undefined) st[k] = d[k]; });
  st.stats = Object.assign(freshProfile().stats, st.stats || {});
  st.inv.forEach(x => { x.n = fixName(x.n); });
  setBalance(bal);
  const el = $('#rcoin'); if (el) el.textContent = rc(st.rcoin || 0);
}
const SRV_ERR = { 'amount mismatch': 'Сумма оплаты не совпала — напишите в поддержку', 'steam required': 'Нужен вход через Steam', 'already in team': 'Вы уже состоите в команде', 'bad name': 'Название — от 2 до 24 символов', 'bad tag': 'Тег — 2–5 букв или цифр', 'name taken': 'Такое название уже занято', 'not captain': 'Это может сделать только капитан', 'no team': 'Вы не состоите в команде', 'bad invite': 'Приглашение недействительно', 'team full': 'В команде уже 10 игроков', 'team busy': 'Команда играет турнир — состав сейчас менять нельзя', 'captain cannot leave': 'Капитан не может выйти — передайте капитанство или расформируйте команду', 'bad player': 'Игрок не найден в команде', 'registration closed': 'Регистрация закрыта', 'bad roster': 'Проверьте состав: только игроки вашей команды, без повторов', 'too many subs': 'Слишком много замен', 'tournament full': 'Все места на турнире заняты', 'not enough balance': 'Недостаточно средств', 'bad mults': 'Множитель — от x1,2 до x20', 'payments disabled': 'Онлайн-оплата пока недоступна — пополнение через поддержку', 'not enough rcoin': 'Не хватает R-COIN', 'case closed': 'Кейс временно закрыт', 'case not found': 'Кейс недоступен', 'case not synced': 'Кейс ещё не загружен на сервер — администратору нужно открыть админ-панель',
  'items unavailable': 'Часть предметов уже недоступна — обновите страницу', 'target too cheap': 'Цель должна быть дороже ставки', 'bad target': 'Этот предмет нельзя выбрать', 'no trade link': 'Сначала укажите трейд-ссылку',
  'too early': 'Ежедневный бонус ещё не доступен', 'promo not found': 'Промокод не найден', 'promo used': 'Этот промокод уже активирован', 'already claimed': 'Бонус уже получен', 'bad trade link': 'Неверная трейд-ссылка',
  'not authenticated': 'Войдите в аккаунт', 'closed': 'Ставки уже закрыты — ждите следующий раунд', 'full': 'Лобби заполнено', 'item unavailable': 'Предмет недоступен' };
// вызов серверной функции: при ошибке — понятное сообщение и null
async function srv(fn, args) {
  if (!sb || !st.user || !st.user.sb) { toast('Войдите в аккаунт', 'err'); return null; }
  const { data, error } = await sb.rpc(fn, args || {});
  if (error) { const k = Object.keys(SRV_ERR).find(k => error.message.includes(k)); toast(k ? SRV_ERR[k] : 'Ошибка сервера: ' + error.message, 'err'); return null; }
  if (data && data.data) sbApply(data.data);
  return data || {};
}
async function sbRefresh() {
  if (!sb || !st.user || !st.user.sb) return;
  const { data } = await sb.from('profiles').select('data, luck').eq('id', st.user.id).maybeSingle();
  if (data) { sbApply(Object.assign(freshProfile(), data.data || {})); if (data.luck != null) st.user.luck = +data.luck; }
}
addEventListener('visibilitychange', () => { if (document.hidden) sbPush(); });
/* журнал для статистики админки: пульс онлайна (раз в 2 мин с открытой вкладки), пополнения, выводы, открытия кейсов */
// SID — номер устройства (хранится в браузере постоянно): посетитель = устройство, а не вкладка
const SID = (() => { try { let s = localStorage.getItem('rc.vid'); if (!s) { s = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem('rc.vid', s); } return s; } catch (e) { return 'x' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); } })();
// не считаем онлайн: локальная копия и тестовые адреса, устройства админов (метка ставится при входе админа)
const NO_STATS = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.(local|test|localhost))$/.test(location.hostname) || location.protocol === 'file:';
const isAdminDevice = () => { try { return localStorage.getItem('rc.adm') === '1'; } catch (e) { return false; } };
function logEv(kind, amount = 0, won = 0, x = 0) {
  if (!sb || (kind === 'hb' && (NO_STATS || isAdminDevice() || (st.user && st.user.admin)))) return;
  sb.from('site_events').insert({ kind, sid: SID, uid: st.user && st.user.sb ? st.user.id : null, amount: Math.max(0, Math.round(amount * 100) / 100), won: Math.max(0, Math.round(won * 100) / 100), ...(x ? { x: Math.round(x * 100) / 100 } : {}) }).then(() => {}, () => {});
}
setTimeout(() => logEv('hb'), 3000);
setInterval(() => { if (!document.hidden) logEv('hb'); }, 120000);
// ставки старого локального режима (без номера раунда) возвращаем в инвентарь; ставки в общих раундах ждут итога
st.inv.forEach(x => { if (x.st === 'pend') x.st = 'out'; if (x.st === 'bet' && !x.round) x.st = 'own'; });
// износ пропал из каталога (отсеянная цена) — меняем на основной износ того же скина
const fixName = n => SK[n] ? n : (SK[n.replace(/ \([^()]*\)$/, '')] || {}).name || n;
st.inv.forEach(x => { x.n = fixName(x.n); });
if (st.stats.best) st.stats.best = fixName(st.stats.best);

const own = () => st.inv.filter(x => x.st === 'own' && SK[x.n]);
function giveItem(s, from) {
  const it = { id: uid(), n: s.name, from, ts: Date.now(), st: 'own' };
  st.inv.unshift(it);
  if (!st.stats.best || !SK[st.stats.best] || s.p > SK[st.stats.best].p) st.stats.best = s.name;
  return it;
}
async function sellItems(ids, silent) {
  ids = ids.filter(id => { const it = st.inv.find(x => x.id === id); return it && it.st === 'own'; });
  if (!ids.length) return 0;
  const r = await srv('sell_items', { p_ids: ids }); if (!r) return 0;
  const p = +r.sum || 0;
  if (!silent) { Snd.coin(); toast(`Продано: <b>+${money(p)}</b>`); }
  return p;
}
const sellItem = (id, silent) => sellItems([id], silent);

/* ---------- sound (WebAudio, без файлов) ---------- */
const Snd = {
  ctx: null, out: null, nbuf: null,
  get kk() { return document.querySelector('.upg') ? .4 : 1; }, // на странице апгрейда все звуки тише
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
    vol *= this.kk; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + .05);
  },
  /* щелчок шума через фильтр */
  noise(dur, vol = .2, when = 0, freq = 2000, q = 1, type = 'bandpass') {
    if (!st.sound) return; const a = this.a; if (!a) return;
    const t = a.currentTime + when, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = this.nbuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol * this.kk, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
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
  urls: {},
  preload(name, url, now) { this.urls[name] = url; if (now) this.warm([name]); },
  warm(names) { names.forEach(n => { const u = this.urls[n]; if (!u || this.bufs[n] || this.urls['_' + n]) return; this.urls['_' + n] = 1; fetch(u).then(r => r.arrayBuffer()).then(ab => { this.bufs[n] = ab; }).catch(() => { delete this.urls['_' + n]; }); }); },
  async play(name, vol = 1, rate = 1) {
    if (!st.sound) return false; const a = this.a; if (!a) return false; vol *= this.kk;
    let b = this.bufs[name]; if (!b) { this.warm([name]); return false; }
    if (b instanceof ArrayBuffer) { try { b = this.bufs[name] = await a.decodeAudioData(b); } catch (e) { return false; } }
    const s = a.createBufferSource(), g = a.createGain(); s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g); g.connect(a.destination); s.start(); return true;
  },
  /* ручка: петля 3,6–6,7 с записи (сплошное письмо); level 0..1 — громкость по скорости; затухает, если перо стоит */
  penSrc: null, penG: null, penT: 0,
  async pen(level) {
    if (!st.sound) return; const a = this.a; if (!a) return;
    let b = this.bufs.conPen; if (!b) { this.warm(['conPen']); return; }
    if (b instanceof ArrayBuffer) { if (this.penDec) return; this.penDec = 1; try { b = this.bufs.conPen = await a.decodeAudioData(b); } catch (e) { return; } finally { this.penDec = 0; } }
    const t = a.currentTime;
    if (!this.penSrc) {
      const src = a.createBufferSource(), g = a.createGain(); src.buffer = b; src.loop = true; src.loopStart = 3.6; src.loopEnd = 6.7;
      g.gain.value = 0; src.connect(g); g.connect(a.destination); src.start(t, 3.6 + Math.random() * 2.5); this.penSrc = src; this.penG = g;
    }
    const g = this.penG.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(Math.min(1, .35 + level * .75) * this.kk, t + .05);
    clearTimeout(this.penT); this.penT = setTimeout(() => this.penStop(), 140);
  },
  penStop() {
    const a = this.a; if (!a || !this.penSrc) return; const t = a.currentTime, src = this.penSrc, g = this.penG.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + .12); try { src.stop(t + .15); } catch (e) {}
    this.penSrc = null; this.penG = null;
  },
  /* персональные звуки кейса: грузятся при заходе на его страницу; ключ буфера — url */
  preloadSet(set) { Object.values(set || {}).forEach(u => { if (!this.bufs[u]) this.preload(u, u, true); }); },
  /* как play, но возвращает управление: stop(fadeSec) — плавно остановить */
  async playCtl(name, vol = 1) {
    if (!st.sound) return null; const a = this.a; if (!a) return null;
    let b = this.bufs[name]; if (!b) { this.warm([name]); return null; }
    if (b instanceof ArrayBuffer) { try { b = this.bufs[name] = await a.decodeAudioData(b); } catch (e) { return null; } }
    const src = a.createBufferSource(), g = a.createGain(); src.buffer = b; g.gain.value = vol; src.connect(g); g.connect(a.destination); src.start();
    return { stop(fade = .25) { const t = a.currentTime; try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); src.stop(t + fade + .02); } catch (e) {} } };
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
// звуки контрактов
Snd.preload('conOpen', 'assets/sounds/con-open.mp3'); Snd.preload('conAdd', 'assets/sounds/con-add.mp3'); Snd.preload('conSign', 'assets/sounds/con-sign.mp3');
Snd.preload('conStamp', 'assets/sounds/con-stamp.mp3'); Snd.preload('conHover', 'assets/sounds/con-hover.mp3'); Snd.preload('conPen', 'assets/sounds/con-pen-src.mp3');

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
/* особые анимации поверх картинки кейса (координаты — % от картинки) */
const OVERLAYS = {
  // «БАБА ЧАЙ»: цепь с замком (видео, чёрный фон убирается режимом «экран»), фары машины, дым из ствола AWP
  // блики, пробегающие по форме кейса
  shine: (c, src = c.img) => `<span class="ca-shine" aria-hidden="true" style="-webkit-mask-image:url(${src});mask-image:url(${src})"></span>`,
  // DONK666: молнии из глаз (координаты глаз — % от картинки кейса 900×888)
  donk: () => { queueMicrotask(() => BoltFx.start()); return `<canvas class="dk-bolt" aria-hidden="true"></canvas><i class="dk-eye" style="left:50.4%;top:11.1%"></i><i class="dk-eye" style="left:55.1%;top:9.6%"></i>`; },
  gold: () => { queueMicrotask(() => ChainFx.start()); return `<canvas class="gx-chain" width="600" height="333" aria-hidden="true"></canvas>
    <i class="gx-light gx-hl" style="left:75.3%;top:36.5%;width:4.6%"></i><i class="gx-light gx-hl" style="left:94.3%;top:40.1%;width:3.4%"></i>
    <i class="gx-light gx-drl" style="left:76.1%;top:43.8%;width:4.6%;height:4.4%"></i><i class="gx-light gx-drl" style="left:95.2%;top:47.4%;width:3.2%;height:4.2%"></i>
    <span class="gx-smoke" style="left:8%;top:23.6%" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => `<i style="--dl:${(i * .55).toFixed(2)}s;--dx:${(-14 - i * 3)}px;--sc:${(1.6 + (i % 3) * .5).toFixed(1)}"></i>`).join('')}</span>`; },
};
/* цепь «БАБА ЧАЙ»: одно скрытое видео рисуется во все canvas.gx-chain, чёрный фон кадра → прозрачность по яркости.
   Когда на странице нет ни одной цепи — видео на паузе */
/* молнии DONK666: каждый canvas.dk-bolt живёт своим расписанием ударов; один общий rAF на все */
const BoltFx = {
  raf: 0,
  // разряд: ломаная со смещениями + ветки; возвращает массив путей [{pts, w}]
  make(x, y, ang, len, depth = 0) {
    const paths = [], pts = [[x, y]], n = 5 + (Math.random() * 3 | 0), st = len / n;
    let a = ang, cx = x, cy = y;
    for (let i = 0; i < n; i++) {
      a += (Math.random() - .5) * .9; a += (ang - a) * .25; // зигзаг, но держит общее направление
      cx += Math.cos(a) * st * (.6 + Math.random() * .7); cy += Math.sin(a) * st * (.6 + Math.random() * .7);
      pts.push([cx, cy]);
      if (depth < 2 && i > 1 && Math.random() < (depth ? .18 : .32)) paths.push(...this.make(cx, cy, a + (Math.random() < .5 ? -1 : 1) * (.45 + Math.random() * .6), len * (.35 + Math.random() * .3), depth + 1));
    }
    paths.unshift({ pts, w: depth ? .55 - depth * .15 : 1 });
    return paths;
  },
  start() {
    if (this.raf) return;
    const tick = now => {
      const cs = $$('canvas.dk-bolt');
      if (!cs.length) { this.raf = 0; return; }
      cs.forEach(c => this.step(c, now));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },
  step(c, now) {
    const st = c._st || (c._st = { next: now + 600 + Math.random() * 2000, strike: null });
    const box = c.parentElement, eyes = $$('.dk-eye', box);
    if (!st.strike) {
      if (now < st.next) return;
      // новый удар: размеры canvas, точки глаз, 2–4 вспышки
      const r = c.getBoundingClientRect(), dpr = Math.min(1.5, devicePixelRatio || 1);
      if (!r.width) { st.next = now + 1000; return; }
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const k = c.width / r.width, pts = eyes.map(e => { const q = e.getBoundingClientRect(); return [(q.left + q.width / 2 - r.left) * k, (q.top + q.height / 2 - r.top) * k]; });
      const both = Math.random() < .55, which = Math.random() < .5 ? 0 : 1;
      const flashes = 1 + (Math.random() * 2 | 0), seq = [];
      let t = 0; for (let i = 0; i < flashes; i++) { const on = 45 + Math.random() * 70; seq.push([t, t + on, 1 - i * .18]); t += on + 30 + Math.random() * 70; }
      st.strike = { t0: now, end: t + 140, seq, pts, use: both ? [0, 1] : [which], scale: box.getBoundingClientRect().width * k, gen: -1, paths: [] };
    }
    const S = st.strike, el = now - S.t0, x = c.getContext('2d');
    if (el > S.end) { x.clearRect(0, 0, c.width, c.height); eyes.forEach(e => e.style.opacity = 0); st.strike = null; st.next = now + 2500 + Math.random() * 4000; return; }
    const fi = S.seq.findIndex(([a, b]) => el >= a && el < b), I = fi >= 0 ? S.seq[fi][2] : 0;
    // каждая вспышка — свой изгиб молнии (как у настоящего разряда)
    if (fi >= 0 && fi !== S.gen) {
      S.gen = fi; S.paths = [];
      S.use.forEach(ei => {
        const [ex, ey] = S.pts[ei] || [0, 0], dir = ei === 0 ? Math.PI * (.97 + Math.random() * .2) : Math.PI * (1.83 + Math.random() * .2);
        S.paths.push(...this.make(ex, ey, dir, S.scale * (.07 + Math.random() * .05), 1)); // маленькие искры-разряды
        if (Math.random() < .35) S.paths.push(...this.make(ex, ey, dir + (Math.random() < .5 ? -.8 : .8), S.scale * (.04 + Math.random() * .03), 2));
      });
    }
    x.clearRect(0, 0, c.width, c.height);
    eyes.forEach((e, i) => { e.style.opacity = S.use.includes(i) ? I * .6 : 0; });
    if (!I) return;
    const u = S.scale / 300; // толщина от размера кейса
    x.globalCompositeOperation = 'lighter'; x.lineCap = x.lineJoin = 'round';
    const pass = (col, w, blur, a) => { x.shadowColor = '#4aa3ff'; x.shadowBlur = blur * u; x.strokeStyle = col; x.globalAlpha = a * I;
      S.paths.forEach(p => { x.lineWidth = Math.max(.6, w * p.w * u); x.beginPath(); p.pts.forEach(([px, py], j) => j ? x.lineTo(px, py) : x.moveTo(px, py)); x.stroke(); }); };
    pass('rgba(40,110,255,.4)', 4, 8, .7);  // свечение
    pass('rgba(120,190,255,.9)', 1.8, 4, .9); // канал
    pass('#ffffff', .8, 2, .9);              // ядро
    x.globalAlpha = 1; x.shadowBlur = 0; x.globalCompositeOperation = 'source-over';
  },
};
const ChainFx = {
  v: null, raf: 0,
  start() {
    if (this.raf) return;
    if (!this.v) { const v = this.v = document.createElement('video'); v.src = 'assets/case-gold-chain.webm'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; }
    const tick = () => {
      const cs = $$('canvas.gx-chain');
      if (!cs.length) { this.raf = 0; this.v.pause(); return; }
      if (this.v.paused) this.v.play().catch(() => {});
      if (this.v.readyState >= 2) cs.forEach(c => this.draw(c));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },
  draw(c) {
    const w = c.width, h = c.height, x = c.getContext('2d', { willReadFrequently: true });
    x.clearRect(0, 0, w, h); x.drawImage(this.v, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const m = Math.max(p[i], p[i + 1], p[i + 2]), a = m < 12 ? 0 : Math.min(255, (m - 12) * 3);
      if (a > 0 && a < 255) { const k = 255 / a; p[i] = Math.min(255, p[i] * k); p[i + 1] = Math.min(255, p[i + 1] * k); p[i + 2] = Math.min(255, p[i + 2] * k); }
      p[i + 3] = a;
    }
    x.putImageData(d, 0, 0);
  },
};
/* сияние статуэтки: пульсирующий свет, вращающиеся лучи и искры (координаты — % от картинки кейса) */
const trophyFx = f => `<span class="tfx" style="left:${f.x}%;top:${f.y}%;width:${f.w}%;height:${f.h}%" aria-hidden="true"><i class="tfx-rays"></i><i class="tfx-glow"></i>${
  [[18, 22, 0], [78, 14, .7], [88, 52, 1.4], [10, 60, 2.1], [50, 4, 1.05], [64, 84, 1.75], [30, 42, .35]].map(([x, y, d]) => `<i class="tfx-star" style="left:${x}%;top:${y}%;animation-delay:${d}s"></i>`).join('')}</span>`;
/* витрина кейса: главный скин парит над постаментом, по бокам ещё два (заменится на 3D-кейс, когда будут фото) */
/* пропорции картинок кейсов — для блока, в который вкладываются наложения и метка «НОВОЕ» */
const CASE_AR = {'assets/case-alt.webp':1.0778,'assets/case-bonus.webp':1.372,'assets/case-cotton.webp':1.0804,'assets/case-frog.webp':1.0676,'assets/case-gold.webp':1.1057,'assets/case-orange.webp':1.1421,'assets/case-premium.webp':1.0962,'assets/case-s1mple.webp':1.0856,'assets/case-sifon.webp':0.9956,'assets/case-zont.webp':1.2329,'assets/case-donk.webp':1.0135,'assets/case-karambit.webp':1.1208,'assets/case-chick.webp':1.1003,'assets/case-drip.webp':1.0611,'assets/case-rush.webp':1.0888,'assets/case-medkit.webp':1.053,'assets/case-m4a1s.webp':1.064,'assets/case-deagle.webp':1.0598,'assets/case-usps.webp':1.0571,'assets/case-awp.webp':1.0645,'assets/case-ak47.webp':1.0578,'assets/case-m4a4.webp':1.0568,'assets/case-gloves.webp':1.0497,'assets/case-mirage.webp':1.049,'assets/case-rushb.webp':0.9949,'assets/case-reallife.webp':0.9654,'assets/case-crybabies.webp':1.0163,'assets/case-1vs5.webp':1.0428,'assets/case-agents.webp':0.9155};
// лёгкая копия картинки для витрины; у кейсов из админки (картинка из хранилища) — та же картинка
const caseThumb = c => !c.img ? '' : c.custom || c.imgOv ? c.img : c.img.replace(/\.webp$/, '-s.webp');
function caseArt(c, cls = '', badge = '') {
  // в витрине (без cls) — лёгкая копия картинки 440 px, на странице кейса — полная
  const src = c.img && !cls ? caseThumb(c) : c.img;
  if (c.img && (c.fx || c.overlay || badge)) return `<div class="case-art has-img ${cls}" style="--ca:${c.th.a}"><i class="ca-glow"></i><div class="ca-img ca-imgbox" style="aspect-ratio:${c.ar || (c.fx && c.fx.ar) || CASE_AR[c.img] || 1.1}"><img src="${src}" alt="Кейс «${c.name}»" decoding="async" draggable="false">${badge}${c.fx ? trophyFx(c.fx) : ''}${c.overlay ? OVERLAYS[c.overlay](c, src) : ''}</div></div>`;
  if (c.img) return `<div class="case-art has-img ${cls}" style="--ca:${c.th.a}"><i class="ca-glow"></i><img class="ca-img" src="${src}" alt="Кейс «${c.name}»" decoding="async" draggable="false"></div>`;
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
  { k: 'cases', h: '/', t: 'Кейсы', i: 'box' }, // отдельной главной нет — сайт открывается сразу на кейсах
  { k: 'upgrade', h: '/upgrade', t: 'Апгрейд', i: 'up' },
  { k: 'contracts', h: '/contracts', t: 'Контракты', i: 'swap' },
  { k: 'jackpot', h: '/jackpot', t: 'Ставки', i: 'coins' },
  { k: 'bonus', h: '/bonus', t: 'Бонусы', i: 'gift' },
  { k: 'tournaments', h: '/tournaments', t: 'Турниры', i: 'crown' },
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
  ua.innerHTML = `<div class="wal">
      <a class="wal-it rc" href="#/profile" title="R-COIN — бонусы за открытия кейсов. 1 R = 1 ₽"><img class="rc-ic" src="assets/rcoin.webp" alt="" aria-hidden="true"><span class="wal-tx"><small>R-COIN</small><b id="rcoin">${rc(st.rcoin || 0)}</b></span></a>
      <i class="wal-sep" aria-hidden="true"></i>
      <div class="wal-it bal" data-act="deposit" title="Пополнить баланс"><span class="bal-ic">${ic.coin}</span><span class="wal-tx"><small>Баланс</small><b id="balance">${money(st.balance)}</b></span></div>
      <button class="wal-plus" data-act="deposit" title="Пополнить баланс" aria-label="Пополнить баланс">${ic.plus}</button>
    </div>
    <div class="ubox">
      <button class="ubtn" id="ubtn" aria-haspopup="true" aria-label="Меню профиля">${ava(st.user)}${ic.chev}</button>
      <div class="umenu hidden" id="umenu">
        <div class="um-h">${ava(st.user, 'xs')}<b>${esc(st.user.name)}${st.user.pid ? `<small>ID ${st.user.pid}</small>` : ''}</b></div>
        <a href="#/profile">${ic.user}Профиль и инвентарь</a>
        <a href="#/bonus">${ic.gift}Бонусы</a>
        ${st.user.admin ? `<a href="#/admin" class="um-admin">${ic.shield}Админ-панель</a>` : ''}
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
/* ---------- R-COIN: бонусы за открытия, 1 R = 1 ₽ (тратятся в бонусных кейсах) ---------- */
const RCOIN_RATE = c => c.id === 'sifon' ? .005 : .02; // 2% от цены кейса, у «Сифона» (окупаемость 96%) — 0,5%
const rc = v => money(v).replace(' ₽', '');
function addRcoin(v, note) {
  v = Math.round(v * 100 + 1e-6) / 100; if (!(v > 0)) return;
  st.rcoin = Math.round(((st.rcoin || 0) + v) * 100) / 100;
  (st.rlog = st.rlog || []).unshift({ v, note, ts: Date.now() }); if (st.rlog.length > 60) st.rlog.length = 60;
  save();
  const el = $('#rcoin'); if (!el) return;
  el.textContent = rc(st.rcoin);
  const box = el.closest('.rc'); box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
  const pop = document.createElement('span'); pop.className = 'rc-pop'; pop.textContent = '+' + rc(v); box.appendChild(pop); setTimeout(() => pop.remove(), 1600);
}
function spendRcoin(v, note) {
  st.rcoin = Math.max(0, Math.round(((st.rcoin || 0) - v) * 100) / 100);
  (st.rlog = st.rlog || []).unshift({ v: -v, note, ts: Date.now() }); if (st.rlog.length > 60) st.rlog.length = 60;
  save(); const el = $('#rcoin'); if (el) el.textContent = rc(st.rcoin);
}
function setBalance(v) {
  const from = shownBal == null ? st.balance : shownBal;
  st.balance = Math.max(0, Math.round(v * 100) / 100); save();
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
    <div class="ft-col"><h4>Игры</h4><a href="#/cases">Кейсы</a><a href="#/upgrade">Апгрейд</a><a href="#/contracts">Контракты</a><a href="#/bonus">Бонусы</a><a href="#/tournaments">Турниры</a><a href="#/top">Топ игроков</a></div>
    <div class="ft-col"><h4>Информация</h4><a href="#/faq">FAQ</a><a href="#/terms">Пользовательское соглашение</a><a href="#/privacy">Политика конфиденциальности</a><a href="#/payment">Оплата и возврат</a><a href="#/faq">Честная игра</a></div>
    <div class="ft-col"><h4>Поддержка</h4><a href="mailto:${LEGAL.mail}">${LEGAL.mail}</a><a href="https://t.me/rushcasse" target="_blank" rel="noopener">Telegram-канал</a>
      <div class="pay"><span>СБП</span><span>МИР</span><span>VISA</span><span>MC</span></div></div>
  </div>
  <div class="container ft-bottom"><span class="age">18+</span><p>© ${new Date().getFullYear()} RUSH CASE. Сайт не аффилирован с Valve Corporation. Counter-Strike 2 и Steam — товарные знаки Valve Corporation. Все изображения предметов принадлежат их правообладателям.<br><span class="ft-req">${LEGAL.name} · ИНН ${LEGAL.inn} · ОГРНИП ${LEGAL.ogrnip} · <a href="mailto:${LEGAL.mail}">${LEGAL.mail}</a></span></p></div>`;
}

/* ---------- live feed ---------- */
const NICKS = ['Kirill_KZ', 'ShadowFox', 'Clutch_King', 'toxic_ivan', 'Zeus77', 'dimon228', 'ProSniper', 'lazy_cat', 'Smurfik', 'Vanya_AWP', 'Gromila', 'Kolya', 'rush_b', 'FragMaster', 'HeadHunter', 'Снайпер', 'Сашка', 'Мангуст', 'ПашаТехник', 'Lynx', 'Bober', 'xXx_Sniper', 'monkey_d', 'Flick_God', 'Tima', 'Raptor', 'NeoNoir', 'Artem2009', 'Viper', 'Kenny'];
const liveBuf = [];
let liveFilter = 'all';
const LD_DOC = sv('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>');
// запись ленты: t — 'case' (по умолчанию), 'upg' — апгрейд, 'con' — контракт; x — во сколько раз дороже ставки
const liveHtml = d => {
  const s = SK[d.n], c = d.t ? null : caseById(d.c);
  const href = d.uid ? `#/u/${d.uid}` : d.t === 'upg' ? '#/upgrade' : d.t === 'con' ? '#/contracts' : `#/case/${d.c}`;
  const src = d.t === 'upg' ? `Апгрейд ×${d.x.toFixed(d.x < 10 ? 1 : 0)}` : d.t === 'con' ? `Контракт ×${d.x.toFixed(1)}` : c ? 'Кейс «' + c.name + '»' : d.c;
  const tag = d.t === 'upg' ? `<span class="ld-t upg">${ic.up}</span>` : d.t === 'con' ? `<span class="ld-t con">${LD_DOC}</span>` : '';
  return `<a class="ld r-${s.r}${d.mine ? ' mine' : ''}${c && c.liveGold ? ' ld-gold' : ''}${d.t ? ' ld-' + d.t : ''}" href="${href}" title="${esc(s.name)}">${tag}<img src="${imgUrl(s, 'xs')}" alt="" loading="lazy" decoding="async"><span class="ld-f">${esc(s.f)}</span><span class="ld-w">${esc(s.w)}</span><span class="ld-u"><small>${esc(src)}</small>${esc(d.u)}</span></a>`;
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
/* Лента одинаковая у всех: «фоновые» дропы не случайны, а вычисляются из номера секунды (общий генератор с зерном) —
   каждый браузер получает ту же последовательность; часы сверяются с сервером. Дропы реальных игроков — из базы (live_drops) в реальном времени. */
const LIVE_P = .42; // доля секунд, в которые падает дроп (в среднем раз в ~2,4 с)
let liveOff = 0;    // поправка часов браузера к серверу
const liveNow = () => Date.now() + liveOff;
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const LIVE_SKINS = UPG_CAT.filter(s => s.c === 'skin' || s.c === 'knife' || s.c === 'gloves'), LIVE_CON = UPG_CAT.filter(z => z.c === 'skin' && z.p > 20 && z.p < 20000);
function fakeDropAt(sec) {
  const R = mulberry(Math.imul(sec, 2654435761) ^ 0x5bd1e995);
  if (R() > LIVE_P) return null;
  const pk = arr => arr[Math.floor(R() * arr.length)], u = pk(NICKS), k = R(), ts = sec * 1000;
  // апгрейд: скин дороже ставки в 1,5–10 раз (чаще — небольшие множители)
  if (k < .18) { const x = 1.5 + 8.5 * R() ** 2.2, sk = LIVE_SKINS[Math.floor(LIVE_SKINS.length * R() ** 1.6)]; return { n: sk.name, t: 'upg', x, u, ts }; }
  // контракт: результат от ×0,25 до ×4 к сумме дела (чаще около ×1)
  if (k < .26) { const sk = pk(LIVE_CON); return { n: sk.name, t: 'con', x: .25 + 3.75 * R() ** 2.5, u, ts }; }
  // кейс: только встроенные кейсы и их базовые шансы (без настроек админки) — чтобы у всех совпадало
  const base = CASES.filter(c => !c.custom).slice().sort((x, y) => x.id < y.id ? -1 : 1), ws = base.map(x => 1 / Math.sqrt(x.price)), tw = ws.reduce((x, y) => x + y, 0);
  let r = R() * tw, c = base[0];
  for (let i = 0; i < base.length; i++) { r -= ws[i]; if (r <= 0) { c = base[i]; break; } }
  const key = R() < .08 ? 'fw' : 'ch'; // иногда показываем дроп пожирнее
  let q = R(), acc = 0, it = c.items[c.items.length - 1];
  for (const x of c.items) { acc += key === 'ch' ? (x.ch0 != null ? x.ch0 : x.ch) : x.fw; if (q < acc) { it = x; break; } }
  return { n: it.name, c: c.id, u, ts };
}
let liveSec = 0;
const liveSeen = new Set(); // id реальных дропов, уже показанных
function liveRealRow(r) { return { uid: r.uid, n: r.n, t: r.t === 'case' ? undefined : r.t, c: r.c, x: +r.x || 0, u: r.name, ts: Date.parse(r.ts) - liveOff, mine: !!(st.user && r.uid === st.user.id), id: r.id }; }
function initLive() {
  const now = Math.floor(liveNow() / 1000);
  for (let sec = now; sec > now - 400 && liveBuf.length < 60; sec--) { const d = fakeDropAt(sec); if (d) liveBuf.push(d); }
  liveSec = now;
  renderLive();
  $$('[data-live]').forEach(b => b.onclick = () => { liveFilter = b.dataset.live; $$('[data-live]').forEach(x => x.classList.toggle('on', x === b)); renderLive(); });
  setInterval(() => { const now = Math.floor(liveNow() / 1000); if (now - liveSec > 30) liveSec = now - 30; while (liveSec < now) { liveSec++; const d = fakeDropAt(liveSec); if (d) pushLive(d); } }, 250);
  liveSync();
}
// сверка часов с сервером + последние реальные дропы + подписка на новые
async function liveSync() {
  if (!sb) return;
  try {
    const t0 = Date.now(), r = await fetch(SB_URL + '/rest/v1/live_drops?select=id&limit=1', { headers: { apikey: SB_KEY } }), d = Date.parse(r.headers.get('date'));
    if (d) { const off = d + (Date.now() - t0) / 2 - Date.now(); if (Math.abs(off) > 1500) { liveOff = off; liveBuf.length = 0; liveSec = 0; const now = Math.floor(liveNow() / 1000); for (let sec = now; sec > now - 400 && liveBuf.length < 60; sec--) { const x = fakeDropAt(sec); if (x) liveBuf.push(x); } liveSec = now; } }
  } catch (e) { /* без сверки */ }
  const { data } = await sb.from('live_drops').select('*').gt('ts', new Date(liveNow() - 15 * 60000).toISOString()).order('id', { ascending: false }).limit(40);
  (data || []).forEach(r => { liveSeen.add(r.id); liveBuf.push(liveRealRow(r)); });
  liveBuf.sort((x, y) => (y.ts || 0) - (x.ts || 0)); liveBuf.length = Math.min(liveBuf.length, 120);
  renderLive();
  sb.channel('live-drops').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_drops' }, p => {
    const r = p.new; if (!r || liveSeen.has(r.id)) return; liveSeen.add(r.id);
    if (st.user && r.uid === st.user.id) return; // свой дроп уже показан
    pushLive(liveRealRow(r));
  }).subscribe();
}
// свой дроп: сразу в ленту и в базу — его увидят все
function liveMine(d) {
  pushLive({ ...d, u: st.user.name, uid: st.user.id, mine: true, ts: liveNow() });
  if (false) sb.from('live_drops').insert({ uid: st.user.id, name: st.user.name, n: d.n, t: d.t || 'case', c: d.c || null, x: d.x ? Math.round(d.x * 100) / 100 : 0 }).then(() => {}, () => {});
}

/* ---------- background fx: «золотая пыль» поверх фона ----------
   Три слоя глубины: дальние — мелкие чёткие искорки, средние — с ореолом, ближние — крупные размытые «боке».
   Больше по краям, меньше в центре (не мешают кейсам). Редкие блики-звёздочки.
   Параллакс от мыши и прокрутки (ближние сдвигаются сильнее), fxBurst() — золотая вспышка на крупный дроп. */
let fxBurst = () => {};
function initFx() {
  const host = $('#fx');
  host.innerHTML = '<canvas class="fx-cv" aria-hidden="true"></canvas>';
  const cv = host.firstChild, x = cv.getContext('2d');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const SPR = 64; // спрайты рисуем крупно и штампуем со сжатием — края остаются гладкими
  const mk = draw => { const c = document.createElement('canvas'); c.width = c.height = SPR; draw(c.getContext('2d'), SPR / 2); return c; };
  // чёткое ядро с тугим ореолом
  const core = (r, g, b) => mk((q, h) => { const gr = q.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,252,236,1)'); gr.addColorStop(.1, `rgba(${r},${g},${b},.95)`); gr.addColorStop(.22, `rgba(${r},${g},${b},.35)`);
    gr.addColorStop(.5, `rgba(${r},${g},${b},.08)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); q.fillStyle = gr; q.fillRect(0, 0, SPR, SPR); });
  // «боке»: мягкий диск со светлым ободком, как размытый огонёк вне фокуса
  const bokeh = (r, g, b) => mk((q, h) => { const gr = q.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, `rgba(${r},${g},${b},.22)`); gr.addColorStop(.62, `rgba(${r},${g},${b},.26)`); gr.addColorStop(.82, `rgba(${r},${g},${b},.42)`);
    gr.addColorStop(.92, `rgba(${r},${g},${b},.16)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); q.fillStyle = gr; q.fillRect(0, 0, SPR, SPR); });
  // блик-звёздочка: тонкий крест с ядром
  const star = mk((q, h) => {
    const ray = (dx, dy) => { const gr = q.createLinearGradient(h - dx * h, h - dy * h, h + dx * h, h + dy * h);
      gr.addColorStop(0, 'rgba(255,226,160,0)'); gr.addColorStop(.5, 'rgba(255,248,225,1)'); gr.addColorStop(1, 'rgba(255,226,160,0)');
      q.strokeStyle = gr; q.lineWidth = 1.6; q.beginPath(); q.moveTo(h - dx * h, h - dy * h); q.lineTo(h + dx * h, h + dy * h); q.stroke(); };
    ray(1, 0); ray(0, 1);
    const gr = q.createRadialGradient(h, h, 0, h, h, h * .35); gr.addColorStop(0, 'rgba(255,250,232,1)'); gr.addColorStop(1, 'rgba(255,200,110,0)');
    q.fillStyle = gr; q.fillRect(0, 0, SPR, SPR);
  });
  const C_GOLD = core(246, 198, 96), C_CHAMP = core(246, 221, 167), C_VIOLET = core(176, 140, 255);
  const B_GOLD = bokeh(232, 176, 80), B_CHAMP = bokeh(246, 221, 167), B_VIOLET = bokeh(150, 110, 230);

  let W = 0, H = 0, dpr = 1, parts = [];
  // x: чаще у краёв, реже в центре
  const edgeX = () => { const u = Math.random(), s = u < .5 ? -1 : 1, d = Math.pow(Math.random(), .55); return .5 + s * d * .5; };
  const spawn = (init, layer) => {
    const z = layer ?? (Math.random() < .55 ? 0 : Math.random() < .8 ? 1 : 2); // 0 дальние, 1 средние, 2 ближние
    const vio = Math.random() < .12;
    return { z, x: edgeX(), y: init ? Math.random() : 1.05, sp: [.35, .6, .9][z] * (.7 + Math.random() * .6),
      ph: Math.random() * 6.28, tw: .6 + Math.random() * 1.6, sz: [1.9, 3.4, 34][z] * (.7 + Math.random() * .7),
      a: [.8, .95, .42][z] * (.6 + Math.random() * .4), spr: z === 2 ? (vio ? B_VIOLET : Math.random() < .5 ? B_GOLD : B_CHAMP) : (vio ? C_VIOLET : Math.random() < .5 ? C_GOLD : C_CHAMP),
      glint: 0, life: 0 };
  };
  const fit = () => {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(clamp(W * H / 15000, 40, 150)); // сдержанно: ~140 на 1920×1080, ~40 на телефоне
    while (parts.length < n) parts.push(spawn(true));
    parts.length = n;
  };
  fit(); addEventListener('resize', fit);
  // параллакс: мышь и прокрутка (сглаженные)
  let mx = 0, my = 0, tx = 0, ty = 0, ss = scrollY;
  addEventListener('pointermove', e => { tx = e.clientX / W - .5; ty = e.clientY / H - .5; }, { passive: true });
  // вспышка на крупный дроп: мягкий свет + разлёт золотых искр из центра, потом они тают
  const flares = []; let flash = 0;
  fxBurst = (n = 70) => {
    flash = Math.min(1, flash + .35 + n / 400);
    const cx = W / 2, cy = H * .42, k = Math.min(160, Math.round(n * 1.1));
    for (let i = 0; i < k; i++) {
      const a = Math.random() * 6.283, v = 140 + Math.random() * 520 * (Math.random() < .3 ? 1.4 : 1);
      flares.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0, max: 1.1 + Math.random() * 1.4,
        sz: 2 + Math.random() * 3.5, spr: Math.random() < .15 ? C_VIOLET : Math.random() < .5 ? C_GOLD : C_CHAMP, st: Math.random() < .18 });
    }
  };
  const DEPTH_M = [6, 16, 40], DEPTH_S = [.06, .16, .38]; // насколько слой сдвигается за мышью / прокруткой
  let last = performance.now();
  const frame = now => {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(.05, (now - last) / 1000), t = now / 1000; last = now;
    mx += (tx - mx) * .05; my += (ty - my) * .05;
    ss += (scrollY - ss) * Math.min(1, dt * 7); // прокрутка — со сглаживанием
    x.clearRect(0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]; p.life += dt;
      // дрейф: вверх + плавное покачивание (поле течения)
      p.y -= p.sp * dt * 22 / H;
      p.x += Math.sin(t * .23 + p.ph + p.y * 3) * dt * p.sp * 9 / W;
      if (p.y < -.06) { parts[i] = spawn(false, p.z); continue; }
      const ox = -mx * DEPTH_M[p.z], oy = -my * DEPTH_M[p.z] * .7 - ss * DEPTH_S[p.z];
      let py = p.y * H + oy; py = ((py % (H + 80)) + H + 80) % (H + 80) - 40;
      const px = p.x * W + ox;
      // мерцание; изредка средняя искра вспыхивает звёздочкой
      let a = p.a * (.55 + .45 * Math.sin(t * p.tw + p.ph));
      if (p.z === 1 && !p.glint && Math.random() < dt * .025) p.glint = 1;
      a *= Math.min(1, p.life * .8); // плавное появление
      x.globalAlpha = Math.max(0, a);
      const s = p.sz * (p.z === 2 ? 1 : 6);
      x.drawImage(p.spr, px - s / 2, py - s / 2, s, s);
      if (p.glint) {
        p.glint -= dt * 1.4; const g = Math.sin(Math.max(0, p.glint) * Math.PI);
        if (p.glint <= 0) p.glint = 0; else { const gs = 18 + g * 22; x.globalAlpha = g * .9; x.drawImage(star, px - gs / 2, py - gs / 2, gs, gs); }
      }
    }
    // вспышка
    if (flash > .001) {
      const gr = x.createRadialGradient(W / 2, H * .42, 0, W / 2, H * .42, Math.max(W, H) * .6);
      gr.addColorStop(0, `rgba(255,214,140,${.18 * flash})`); gr.addColorStop(1, 'rgba(255,214,140,0)');
      x.globalAlpha = 1; x.fillStyle = gr; x.fillRect(0, 0, W, H); flash *= Math.pow(.25, dt);
    }
    for (let i = flares.length - 1; i >= 0; i--) {
      const f = flares[i]; f.life += dt; if (f.life > f.max) { flares.splice(i, 1); continue; }
      const drag = Math.pow(.18, dt); f.vx *= drag; f.vy = f.vy * drag + 40 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      const k = f.life / f.max, a = (k < .1 ? k / .1 : 1 - (k - .1) / .9);
      x.globalAlpha = a; const s = f.sz * 6; x.drawImage(f.spr, f.x - s / 2, f.y - s / 2, s, s);
      if (f.st && k < .6) { const gs = 20 * (1 - k); x.globalAlpha = a * .8; x.drawImage(star, f.x - gs / 2, f.y - gs / 2, gs, gs); }
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  };
  requestAnimationFrame(frame);
}
function burst(n = 70) {
  fxBurst(n);
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
/* баннер-слайдер (верх страницы кейсов) */
function heroHtml() {
  const embers = Array.from({ length: 22 }, () => `<i style="left:${rand(2, 98)}%;--d:${rand(4, 9)}s;--dl:${rand(0, 8)}s;--x:${rand(-40, 40)}px;--s:${rand(.6, 1.4)}"></i>`).join('');
  const dust = Array.from({ length: 34 }, () => `<i style="left:${rand(0, 100)}%;top:${rand(0, 100)}%;--d:${rand(9, 18)}s;--dl:${rand(-18, 0)}s;--x:${rand(-60, 60)}px;--y:${rand(-50, 50)}px;--s:${rand(.4, 1.2)}"></i>`).join('');
  return `<section class="hero3">
    <div class="h3-frame hs" id="heroSlider">
      <div class="hs-track">
        <div class="hs-slide on" data-i="0">
          <img class="h3-img hs-cover" src="assets/hero-open.webp" alt="Мы открылись! Участвуй в розыгрыше — итоги 20.11" data-nw="1983" data-nh="793">
          <!-- кнопка «Участвуй в розыгрыше» нарисована на картинке: зона клика — в пикселях картинки (data-box), пересчитывается под обрезку cover -->
          <a class="hs-hot hs-tg" href="https://t.me/rushcasse" target="_blank" rel="noopener" data-box="212,376,918,188" aria-label="Участвуй в розыгрыше — Telegram-канал RUSH CASE"></a>
        </div>
        <div class="hs-slide" data-i="1">
          <img class="h3-img" src="assets/hero-banner.webp" alt="Открывай. Собирай. Побеждай. Твои следующие легендарные скины уже внутри">
          <div class="h3-fx" aria-hidden="true"><div class="h2-embers">${embers}</div><div class="h3-dust">${dust}</div></div>
          <div class="h3-btns">
            <a class="btn btn-primary btn-lg" href="#/cases">${ic.box}Открыть кейсы${ic.right}</a>
            <a class="btn btn-outline btn-lg" href="#/upgrade">${ic.trend}Смотреть апгрейды</a>
          </div>
        </div>
        <div class="hs-slide" data-i="2">
          <img class="h3-img hs-cover" src="assets/hero-bonus.webp" alt="Получи бонус за участие: подпишись на наши соцсети" loading="lazy">
          <!-- кликабельные зоны поверх нарисованных значков и шагов (координаты — % от слайда) -->
          ${[['Telegram', 22.11], ['ВКонтакте', 28.4], ['YouTube', 35.01], ['TikTok', 41.63]].map(([t, x]) => `<a class="hs-hot hs-soc" href="#/bonus" title="${t} — бонус за подписку" aria-label="${t}" style="left:${x}%;top:64.8%"></a>`).join('')}
          <a class="hs-hot hs-step" href="#/profile" title="Открыть профиль" style="left:7.97%;top:72.96%;width:12.59%;height:15.52%"></a>
          <a class="hs-hot hs-step" href="#/bonus" title="Бонусы" style="left:24.24%;top:72.96%;width:14.56%;height:15.52%"></a>
          <a class="hs-hot hs-step" href="#/bonus" title="Выполнить условия" style="left:42.48%;top:72.96%;width:12.91%;height:15.52%"></a>
        </div>
        <div class="hs-slide" data-i="3">
          <img class="h3-img hs-cover hs-agents" src="assets/hero-agents.webp" alt="Твой сквад. Твой дроп. Кейс с агентами — открой кейс и забери своего легендарного агента" loading="lazy">
          <a class="hs-hot hs-all" href="#/cases" aria-label="Смотреть кейсы"></a>
        </div>
      </div>
      <button class="hs-arr hs-prev" aria-label="Предыдущий баннер">${ic.left}</button>
      <button class="hs-arr hs-next" aria-label="Следующий баннер">${ic.right}</button>
      <div class="hs-dots"><button class="on" data-go="0" aria-label="Баннер 1"></button><button data-go="1" aria-label="Баннер 2"></button><button data-go="2" aria-label="Баннер 3"></button><button data-go="3" aria-label="Баннер 4"></button></div>
    </div>
  </section>`;
}
function pageHome() {
  return `${heroHtml()}
  <section class="container cases-wide hb-wrap">${homeBonus()}</section>
  <section class="container cases-wide">
    <div class="stbar">
      <div class="sb-i"><span class="sb-ic">${ic.box}</span><div><b id="sbOpened">${fmt(statOpened)}</b><span>Кейсов открыто</span></div></div>
      <div class="sb-i"><span class="sb-ic">${ic.users}</span><div><b>24 816</b><span>Игроков</span></div></div>
      <div class="sb-i"><span class="sb-ic">${ic.shield}</span><div><b>98.7%</b><span>Выплат</span></div></div>
    </div>
    <div class="home-secs">
      ${secHead('Популярные кейсы', 'Открывают чаще всего', ic.fire, '#f3c14f', homeHits().length)}
      <div class="cases-grid" id="popRow">${homeHits().map(caseCard).join('')}</div>
      ${secHead('Новые кейсы', 'Свежие поступления', ic.star, '#ff6fb5', homeNew().length)}
      <div class="cases-grid" id="newRow">${homeNew().map(caseCard).join('')}</div>
      ${secHead('Бонусные кейсы', 'Открываются за R-COIN', RC_IMG, '#8be04e', casesRc().length)}
      <div class="cases-grid" id="bonusRow">${casesRc().map(caseCard).join('')}</div>
    </div>
    <div class="features">
      ${[['shield', 'Честно', 'Результат определяется до начала анимации — рулетка лишь показывает выпавший предмет.'], ['bolt', 'Быстрый вывод', 'Скины уходят в Steam через трейд за пару минут.'], ['gift', 'Бонусы', 'Ежедневный бонус, промокоды и кэшбэк за ранг.'], ['chat', 'Поддержка 24/7', 'Отвечаем в чате и Telegram в любое время.']]
        .map(([i, t, p]) => `<div class="feat"><div class="fi">${ic[i]}</div><h3>${t}</h3><p>${p}</p></div>`).join('')}
    </div>
  </section>`;
}
/* цена кейса: в R-COIN (бонусные) или в рублях */
const RC_IMG = '<img class="rc-ic" src="assets/rcoin.webp" alt="" aria-hidden="true">';
const casePrice = (c, v) => c.rc ? `${RC_IMG}${rc(v)} R-COIN` : money(v);
/* популярные кейсы — в этом порядке; остальные — блоком ниже (по цене) */
/* блоки витрины: порядок кейсов внутри — как в списке; новый кейс без блока попадает в «Популярные» */
const CASE_BLOCKS = [
  { id: 'pop', wm: 'HOT', t: 'Популярные кейсы', sub: 'Открывают чаще всего', ic: 'fire', a: '#f3c14f', ids: ['sifon', 'alt', 'cotton', 'orange'] },
  { id: 'pro', wm: 'PRO', t: 'Про игроки', sub: 'Кейсы легенд CS2 — их скины и их стиль', ic: 'trophy', a: '#5cc8ff', ids: ['donk', 's1mple', 'zont', 'frog'] },
  { id: 'guns', wm: 'GUNS', t: 'Оружейные кейсы', sub: 'Кейс одного оружия — все его скины, от ширпа до легенд', ic: 'trophy', a: '#22d3ee', ids: ['awp', 'ak47', 'm4a4', 'm4a1s', 'deagle', 'usps'] },
  { id: 'farm', wm: 'FARM', t: 'Фарм кейсы', sub: 'Дешёвые кейсы с частым дропом — фарми скины и копи на апгрейд', ic: 'trend', a: '#f5c518', ids: ['medkit', 'coco'] },
  { id: 'bonusrc', wm: 'BONUS', t: 'Бонусные кейсы', sub: 'Открываются за R-COIN, которые копятся с каждого открытия', ic: 'gift', a: '#8be04e', rc: true, ids: ['bonus30', 'bonus', 'bonus150'] },
  { id: 'allin', wm: 'ALL IN', t: 'Всё или ничего', sub: 'Ультра дорогие кейсы — максимальный риск, максимальный дроп', ic: 'crown', a: '#ff4d4d', ids: ['gold', 'karambit', 'premium'] },
  { id: 'gloves', wm: 'GLOVES', t: 'Перчатки и агенты', sub: 'Кейсы одной категории: только перчатки или только агенты', ic: 'gem', a: '#10b981', ids: ['gloves', 'agents'] },
  { id: 'bingo', wm: 'BINGO', t: 'Bingo, bango, bongo', sub: 'Мемные кейсы CS2 — легендарные фразы, легендарный дроп', ic: 'bolt', a: '#ea580c', ids: ['rushb', 'reallife', 'crybabies'] },
  { id: 'clutch', wm: 'CLUTCH', t: 'CLUTCH', sub: 'Один против всех — редкий, но огромный дроп', ic: 'crown', a: '#8b5cf6', ids: ['1vs5'] },
  { id: 'maps', wm: 'MAPS', t: 'Кейсы карт', sub: 'Каждая карта CS2 — свой кейс: скины её коллекций и её стиль', ic: 'globe', a: '#d97706', ids: ['mirage'] }
];
/* главная: популярные + новые (с меткой «НОВОЕ») */
const casesRc = () => CASES.filter(c => c.rc);
const HOME_POP = ['sifon', 'alt', 'cotton', 'orange', 'premium'];
const NEW_CASES = ['rush', 'drip', 'medkit', 'coco', 'awp', 'ak47', 'm4a4', 'm4a1s', 'deagle', 'usps', 'gloves', 'agents', 'rushb', 'reallife', 'crybabies', '1vs5', 'mirage'];
/* раздел, порядок и метки кейса: по умолчанию — из кода (CASE_BLOCKS, NEW_CASES, HOME_POP); админ-панель может поменять (site_cfg) */
const DEF_BLOCK = {}, DEF_ORD = {};
CASE_BLOCKS.forEach(b => b.ids.forEach((id, i) => { DEF_BLOCK[id] = b.id; DEF_ORD[id] = i; }));
const caseBlockId = c => {
  const id = c.block || DEF_BLOCK[c.id] || (c.rc ? 'bonusrc' : 'pop');
  if (CASE_BLOCKS.some(b => b.id === id)) return id;
  const b = CASE_BLOCKS.find(x => !!x.rc === !!c.rc) || CASE_BLOCKS[0]; return b && b.id; // раздел удалён — в первый подходящий
};
const caseOrd = c => c.ord != null ? c.ord : DEF_ORD[c.id] != null ? DEF_ORD[c.id] : 1000 + c.price / 1e7;
const isNewCase = c => c.isNew != null ? !!c.isNew : NEW_CASES.includes(c.id);
const isHitCase = c => c.hit != null ? !!c.hit : HOME_POP.includes(c.id);
const blockCases = b => CASES.filter(c => caseBlockId(c) === b.id).sort((x, y) => caseOrd(x) - caseOrd(y));
const listIdx = (L, c) => { const i = L.indexOf(c.id); return i < 0 ? -1 : i; };
const homeHits = () => CASES.filter(c => isHitCase(c) && !c.rc).sort((x, y) => (listIdx(HOME_POP, x) - listIdx(HOME_POP, y)) || caseOrd(x) - caseOrd(y));
const homeNew = () => CASES.filter(c => isNewCase(c) && !c.rc).sort((x, y) => (listIdx(NEW_CASES, x) - listIdx(NEW_CASES, y)) || x.price - y.price);
/* правки кейсов из админ-панели: таблица site_cfg — 'case:<id>' (поля кейса) и 'blocks' (список разделов) */
let caseCfg = {};
const CASE_DEF = {}; // исходный кейс из кода — для сброса и сравнения
function caseSetItems(c, list) { // [{ n, ch }] → предметы кейса, шансы нормируются
  const its = list.map(x => SK[x.n] && { s: SK[x.n], ch: +x.ch }).filter(x => x && x.ch > 0);
  if (its.length < 2) return false;
  const tot = its.reduce((a, x) => a + x.ch, 0), fwRaw = its.map(x => Math.sqrt(x.ch / tot)), fs = fwRaw.reduce((a, b) => a + b, 0);
  c.items = its.map((x, i) => ({ ...x.s, ...(c.exactR && c.exactR[x.s.name] ? { r: c.exactR[x.s.name] } : {}), ch: x.ch / tot, fw: fwRaw[i] / fs })).sort((a, b) => b.p - a.p);
  c.rareChance = c.items.filter(s => s.r === 'rare').reduce((a, s) => a + s.ch, 0);
  c.show = c.items.slice(0, 3).map(s => s.name);
  return true;
}
function applyCaseCfg(c) {
  const v = caseCfg[c.id] || {};
  c.hit = v.hit; c.ord = v.ord;
  if (c.custom) return; // у кейсов из панели остальное хранится в custom_cases
  if (!CASE_DEF[c.id]) CASE_DEF[c.id] = { name: c.name, sub: c.sub || '', price: c.price, img: c.img, ar: c.ar, a: c.th.a, items: c.items.map(s => ({ n: s.name, ch: s.ch0 != null ? s.ch0 : s.ch })) };
  const d = CASE_DEF[c.id];
  c.name = v.name || d.name; c.sub = v.sub != null ? v.sub : d.sub; c.price = +v.price > 0 ? +v.price : d.price;
  c.img = v.img || d.img; c.imgOv = !!v.img && v.img !== d.img; c.ar = v.img && v.ar ? v.ar : d.ar;
  c.th = { ...c.th, a: v.a || d.a };
  c.block = v.block; c.isNew = v.isNew;
  if (v.items || c.itemsOv) caseSetItems(c, v.items || d.items);
  c.itemsOv = !!v.items;
}
async function loadCaseCfg() {
  if (!sb) return;
  const { data, error } = await sb.from('site_cfg').select('k, v');
  if (error || !data) return;
  caseCfg = {};
  data.forEach(r => { if (r.k.startsWith('case:')) caseCfg[r.k.slice(5)] = r.v || {}; });
  const bl = data.find(r => r.k === 'blocks');
  if (bl && Array.isArray(bl.v) && bl.v.length) CASE_BLOCKS.splice(0, CASE_BLOCKS.length, ...bl.v.map(b => ({ ...b, ids: [] })));
  CASES.forEach(applyCaseCfg); CASES.sort((a, b) => a.price - b.price);
}
/* заголовок раздела: наклонная метка со значком, название с переливом, подпись, линия с бегущим огоньком, счётчик */
const secHead = (t, sub, icon, a, n) => `<div class="sh" style="--bc:${a}">
  <span class="sh-tag">${icon}</span>
  <div class="sh-tt"><h2>${t}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
  <i class="sh-line"><i></i></i>
  ${n != null ? `<span class="sh-n">${n} ${plural(n, 'кейс', 'кейса', 'кейсов')}</span>` : ''}
</div>`;
/* страница «Кейсы»: группы с тонким заголовком */
const caseBlock = (b, grp) => {
  const list = blockCases(b); if (!list.length) return '';
  return `<section class="cs-block" style="--bc:${b.a}"${grp ? ` data-grp="${b.id}"` : ''}>
    ${secHead(b.t, b.sub, b.rc ? RC_IMG : ic[b.ic], b.a, list.length)}
    <div class="cases-grid${grp ? ' cases-grp' : ''}"${grp ? ` data-grp="${b.id}"` : ''}>${list.map(caseCard).join('')}</div>
  </section>`;
};
const caseCard = c => `<a class="case-card${c.disabled ? ' cc-closed' : ''}" href="#/case/${c.id}" style="--ca:${c.th.a}" data-price="${c.price}" data-q="${esc((c.name + ' ' + c.items.map(s => s.name).join(' ')).toLowerCase())}">
  <div class="cc-art">${caseArt(c, '', (isNewCase(c) && !c.disabled ? '<span class="cc-new">Новое</span>' : '') + (isHitCase(c) && !c.disabled ? '<span class="cc-hit">Хит</span>' : '') + (c.disabled ? '<span class="cc-lock">Закончился</span>' : ''))}</div>
  <div class="cc-body">
    <div class="cc-name">${c.name}</div>
    <div class="cc-foot"><span class="cc-price${c.goldPrice ? ' cc-price-gold' : ''}${c.rc ? ' cc-price-rc' : ''}">${casePrice(c, c.price)}</span></div>
  </div>
</a>`;
/* слайдер баннеров: автолистание 7 с (пауза при наведении), стрелки, точки, свайп */
function heroSlider() {
  const root = $('#heroSlider'); if (!root) return;
  const slides = $$('.hs-slide', root), dots = $$('.hs-dots button', root); let i = 0, t;
  // зоны клика поверх нарисованных кнопок: data-box — x,y,w,h в пикселях картинки; картинка object-fit: cover по центру
  const place = () => $$('[data-box]', root).forEach(a => {
    const sl = a.closest('.hs-slide'), img = $('img', sl), sw = sl.clientWidth, sh = sl.clientHeight; if (!sw || !sh) return;
    const nw = +img.dataset.nw, nh = +img.dataset.nh, k = Math.max(sw / nw, sh / nh), ox = (sw - nw * k) / 2, oy = (sh - nh * k) / 2, [bx, by, bw, bh] = a.dataset.box.split(',').map(Number);
    Object.assign(a.style, { left: ox + bx * k + 'px', top: oy + by * k + 'px', width: bw * k + 'px', height: bh * k + 'px' });
  });
  const go = n => { i = (n + slides.length) % slides.length; slides.forEach((x, k) => x.classList.toggle('on', k === i)); dots.forEach((x, k) => x.classList.toggle('on', k === i)); place(); };
  new ResizeObserver(place).observe(root); place();
  const auto = () => { clearInterval(t); t = setInterval(() => { if (!document.body.contains(root)) return clearInterval(t); go(i + 1); }, 7000); };
  $('.hs-prev', root).onclick = () => { go(i - 1); auto(); }; $('.hs-next', root).onclick = () => { go(i + 1); auto(); };
  dots.forEach(d => d.onclick = () => { go(+d.dataset.go); auto(); });
  root.addEventListener('mouseenter', () => clearInterval(t)); root.addEventListener('mouseleave', auto);
  let x0 = null;
  root.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { go(i + (dx < 0 ? 1 : -1)); auto(); } x0 = null; });
  auto();
}
/* ---------- блок бонусов под баннером ---------- */
const HB_SOC = { tg: '#2aabee', vk: '#2787f5', yt: '#ff3b3b' };
const HB_PCT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>';
function homeBonus() {
  const got = (st.socials || []).length, left = dailyLeft(), all = SOCIALS.length;
  return `<div class="hb2" id="homeBonus">
    <article class="hb2-c hb2-dep" style="--ac:#f5c76b;--ac2:#d99a2b">
      <i class="hb2-wm" aria-hidden="true">%</i>
      <header class="hb2-h"><span class="hb2-ic">${HB_PCT}</span><span class="hb2-l">Бонус к пополнению</span></header>
      <div class="hb2-v"><b class="hb2-gold">+35%</b></div>
      <p class="hb2-p">к сумме пополнения по промокоду</p>
      <div class="hb2-f">
        <button class="hb2-code" data-act="copy" data-copy="RUSH35" title="Скопировать промокод"><span>RUSH35</span><i>${ic.copy}</i></button>
        <button class="hb2-btn" data-act="deposit">Пополнить</button>
      </div>
    </article>
    <article class="hb2-c hb2-daily${left ? '' : ' ready'}" style="--ac:#ffb547;--ac2:#e0811a">
      <i class="hb2-wm hb2-wm-ic" aria-hidden="true">${ic.gift}</i>
      <header class="hb2-h"><span class="hb2-ic">${ic.gift}</span><span class="hb2-l">Ежедневный бонус</span><em class="hb2-dot" id="hbDot">${left ? '' : 'доступен'}</em></header>
      <div class="hb2-v"><b class="hb2-timer" id="hbTimer">${left ? dailyText() : 'до 250 ₽'}</b></div>
      <div class="hb2-bar"><i id="hbBar" style="width:${((1 - left / DAILY_MS) * 100).toFixed(1)}%"></i></div>
      <p class="hb2-p" id="hbSub">${left ? 'до следующего подарка' : 'подарок ждёт — заберите его'}</p>
      <div class="hb2-f"><a class="hb2-btn${left ? ' ghost' : ''}" id="hbBtn" href="#/bonus">${left ? 'Подробнее' : 'Забрать подарок'}</a></div>
    </article>
    <article class="hb2-c hb2-soc" style="--ac:#7ab8ff;--ac2:#3f7fe0">
      <i class="hb2-wm hb2-wm-ic" aria-hidden="true">${ic.users}</i>
      <header class="hb2-h"><span class="hb2-ic">${ic.users}</span><span class="hb2-l">Бонус за соцсети</span></header>
      <div class="hb2-v"><b class="hb2-blue">+10 ₽</b><span class="hb2-u">за каждый канал</span></div>
      <div class="hb2-socs">${SOCIALS.map(x => { const ok = (st.socials || []).includes(x.k); return `<a href="#/bonus" class="hb2-si${ok ? ' ok' : ''}" style="--c:${HB_SOC[x.k] || '#888'}" title="${x.n}">${ic[x.i]}${ok ? `<i>${ic.check}</i>` : ''}</a>`; }).join('')}
        <span class="hb2-cnt">${got}/${all}</span></div>
      <div class="hb2-f"><a class="hb2-btn${got >= all ? ' ghost' : ''}" href="#/bonus">${got >= all ? 'Всё получено' : 'Подписаться'}</a></div>
    </article>
  </div>`;
}
function mountHomeBonus() {
  if (!$('#homeBonus')) return;
  const tick = () => {
    const t = $('#hbTimer'); if (!t) return; const left = dailyLeft(), el = id => $('#' + id) || {};
    t.textContent = left ? dailyText() : 'до 250 ₽';
    if ($('#hbBar')) $('#hbBar').style.width = ((1 - left / DAILY_MS) * 100).toFixed(1) + '%';
    el('hbSub').textContent = left ? 'до следующего подарка' : 'подарок ждёт — заберите его';
    el('hbDot').textContent = left ? '' : 'доступен';
    const b = $('#hbBtn'); if (b) { b.textContent = left ? 'Подробнее' : 'Забрать'; b.classList.toggle('ghost', !!left); }
    t.closest('.hb2-c').classList.toggle('ready', !left);
  };
  every(tick, 1000);
}
function mountHome() {
  heroSlider();
  mountHomeBonus();
  // живой счётчик открытых кейсов
  every(() => { statOpened += randi(1, 4); const b = $('#sbOpened'); if (b) b.textContent = fmt(statOpened); }, 2200);
}

/* =========================================================
   ВСЕ КЕЙСЫ
   ========================================================= */
/* три окна бонусов — компактно, столбиком справа от баннера */
function bonusMini() {
  const got = (st.socials || []).length, left = dailyLeft(), all = SOCIALS.length;
  return `<div class="hbm" id="homeBonus">
    <article class="hb2-c hbm-c hb2-dep" style="--ac:#f5c76b;--ac2:#d99a2b"><i class="hb2-wm" aria-hidden="true">%</i>
      <div class="hbm-t"><span class="hb2-l">Бонус к пополнению</span><b class="hb2-gold">+35%</b></div>
      <div class="hbm-a"><button class="hb2-code" data-act="copy" data-copy="RUSH35" title="Скопировать промокод"><span>RUSH35</span><i>${ic.copy}</i></button></div></article>
    <article class="hb2-c hbm-c hb2-daily${left ? '' : ' ready'}" style="--ac:#ffb547;--ac2:#e0811a"><i class="hb2-wm hb2-wm-ic" aria-hidden="true">${ic.gift}</i>
      <div class="hbm-t"><span class="hb2-l">Ежедневный бонус <em class="hb2-dot" id="hbDot">${left ? '' : 'доступен'}</em></span><b class="hb2-timer" id="hbTimer">${left ? dailyText() : 'до 250 ₽'}</b><div class="hb2-bar"><i id="hbBar" style="width:${((1 - left / DAILY_MS) * 100).toFixed(1)}%"></i></div></div>
      <div class="hbm-a"><a class="hb2-btn${left ? ' ghost' : ''}" id="hbBtn" href="#/bonus">${left ? 'Подробнее' : 'Забрать'}</a></div></article>
    <article class="hb2-c hbm-c hb2-soc" style="--ac:#7ab8ff;--ac2:#3f7fe0"><i class="hb2-wm hb2-wm-ic" aria-hidden="true">${ic.users}</i>
      <div class="hbm-t"><span class="hb2-l">Бонус за соцсети · ${got}/${all}</span><b class="hb2-blue">+10 ₽ <small>за канал</small></b></div>
      <div class="hbm-a"><div class="hb2-socs">${SOCIALS.map(x => { const ok = (st.socials || []).includes(x.k); return `<a href="#/bonus" class="hb2-si${ok ? ' ok' : ''}" style="--c:${HB_SOC[x.k] || '#888'}" title="${x.n}">${ic[x.i]}${ok ? `<i>${ic.check}</i>` : ''}</a>`; }).join('')}</div></div></article>
  </div>`;
}
function pageCases() {
  return `<section class="container cases-wide tr">
    <div class="tr-hero">${heroHtml()}</div>
    <aside class="tr-side">${bonusMini()}</aside>
  </section>
  <section class="container cases-wide">
    <div class="filterbar">
      <div class="search"><input class="inp" id="caseQ" placeholder="Поиск кейса или скина" autocomplete="off">${ic.search}</div>
      <div class="chips" id="chips"><button class="chip on" data-f="all">Все</button><button class="chip" data-f="0-100">до 100 ₽</button><button class="chip" data-f="100-500">100–500 ₽</button><button class="chip" data-f="500-1e9">500+ ₽</button></div>
      <label class="switch"><input type="checkbox" id="availChk"><i></i>Доступные</label>
    </div>
    <div class="cs-blocks">${CASE_BLOCKS.map(b => caseBlock(b, true)).join('')}</div>
    <div class="empty hidden" id="casesEmpty">${ic.search}Ничего не найдено — попробуйте другой фильтр</div>
  </section>`;
}
function mountCases() {
  heroSlider(); mountHomeBonus();
  let f = 'all';
  const apply = () => {
    const q = $('#caseQ').value.trim().toLowerCase(), avail = $('#availChk').checked;
    let shown = 0;
    $$('.cases-grp .case-card').forEach(card => {
      const p = +card.dataset.price; let ok = true;
      if (f !== 'all') { const [a, b] = f.split('-').map(Number); ok = p >= a && p < b; }
      if (q && !card.dataset.q.includes(q)) ok = false;
      if (avail && (!st.user || p > st.balance)) ok = false;
      card.classList.toggle('hidden', !ok); if (ok) shown++;
    });
    $('#casesEmpty').classList.toggle('hidden', shown > 0);
    // заголовок группы прячем, если в ней ничего не осталось
    $$('.cases-grp').forEach(g => { const any = $$('.case-card:not(.hidden)', g).length > 0; const bl = g.closest('.cs-block'); if (bl) bl.classList.toggle('hidden', !any); });
  };
  $('#caseQ').oninput = apply; $('#availChk').onchange = apply;
  $$('#chips .chip').forEach(b => b.onclick = () => { f = b.dataset.f; $$('#chips .chip').forEach(x => x.classList.toggle('on', x === b)); apply(); });
}

/* =========================================================
   ТОП ИГРОКОВ
   ========================================================= */
/* только реальные игроки: сервер считает сумму дропов (кейсы, апгрейды, контракты) за период — supabase/top.sql */
let topPeriod = 'week';
const topCache = {};
async function topData(period) {
  const c = topCache[period];
  if (c && Date.now() - c.t < 60000) return c.d;
  if (!sb) return { list: [], me: null, total: 0 };
  const { data, error } = await sb.rpc('top_players', { p_period: period });
  if (error) throw error;
  topCache[period] = { t: Date.now(), d: data };
  return data;
}
/* ---------- публичный профиль игрока (#/u/<ID или uid>) и поиск игроков ---------- */
const plink = (id, html) => id ? `<a class="plink" href="#/u/${encodeURIComponent(id)}">${html}</a>` : html;
function playerSearch(box) {
  if (!box) return;
  box.innerHTML = `<div class="ps"><div class="search"><input class="inp" placeholder="Найти игрока: ник или ID" autocomplete="off">${ic.search}</div><div class="ps-res"></div></div>`;
  const inp = $('input', box), res = $('.ps-res', box); let t = 0, q0 = '';
  inp.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
    const q = inp.value.trim(); q0 = q; if (!q || !sb) return (res.innerHTML = '');
    const { data } = await sb.rpc('search_players', { p_q: q }); if (q !== q0) return;
    res.innerHTML = (data || []).length ? data.map(p => `<a href="#/u/${p.pid}">${ava({ name: p.name, ava: p.ava }, 'xs')}<b>${esc(p.name)}</b><i>#${p.pid}</i></a>`).join('') : '<div class="ps-none">Никого не нашли</div>';
  }, 250); };
  inp.onkeydown = e => { if (e.key === 'Enter') { const a = $('a', res); if (a) location.hash = a.getAttribute('href'); } };
}
function pagePlayer(id) {
  return `<section class="container pp" id="pp"><div class="pp-top"><a class="btn btn-dark btn-sm" href="#/top">${ic.left || '←'}Топ игроков</a><div id="ppSearch"></div></div>
    <div id="ppBody"><div class="adm-load"><span class="spinner"></span>Загружаем профиль…</div></div></section>`;
}
async function mountPlayer(id) {
  playerSearch($('#ppSearch'));
  const box = $('#ppBody'); if (!box) return;
  if (!sb || !id) return (box.innerHTML = `<div class="empty-big">${ic.user}<h2>Игрок не найден</h2></div>`);
  const { data: p, error } = await sb.rpc('player_card', { p_id: decodeURIComponent(id) });
  if (!$('#ppBody')) return;
  if (error || !p) return (box.innerHTML = `<div class="empty-big">${ic.user}<h2>Игрок не найден</h2><p>Проверьте ссылку или найдите игрока по нику.</p></div>`);
  document.title = `${p.name} — RUSH CASE`;
  const S = p.stats || {}, rk = rankOf(+S.spent || 0), best = S.best && SK[S.best], fav = p.fav && caseById(p.fav);
  const inv = (p.inv || []).map(n => SK[n]).filter(Boolean), invSum = inv.reduce((a, s) => a + s.p, 0), me = st.user && st.user.id === p.id;
  const tile = (l, v, sub = '') => `<div class="pp-st"><span>${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  box.innerHTML = `
    <div class="pf-hero pp-hero" style="--rk1:${rk.cur.c[0]};--rk2:${rk.cur.c[1]}">
      <span class="pfh-wm" aria-hidden="true">${rk.cur.n}</span>
      <div class="pfh-main">
        <div class="pfh-ava">${ava({ name: p.name, ava: p.ava }, 'xl')}<span class="pfh-rk" title="Ранг ${rk.cur.n}">${rankIcon(rk.cur, rk.i)}</span></div>
        <div class="pfh-info">
          <h1>${esc(p.name)}${p.admin ? ' <i class="tt-you">админ</i>' : ''}${me ? ' <i class="tt-you">это вы</i>' : ''}</h1>
          <div class="pfh-chips">
            <button class="pfh-chip" data-act="copy" data-copy="${p.pid}" title="Скопировать ID">ID ${p.pid}${ic.copy}</button>
            ${p.steamid ? `<a class="pfh-chip" href="https://steamcommunity.com/profiles/${encodeURIComponent(p.steamid)}" target="_blank" rel="noopener">${ic.steam}Steam-профиль</a>` : ''}
            <span class="pfh-chip">${ic.clock}с ${new Date(p.created_at).toLocaleDateString('ru-RU')}</span>
            <span class="pfh-chip">${rankIcon(rk.cur, rk.i)}${rk.cur.n}</span>
          </div>
          ${me ? '<a class="btn btn-dark btn-sm pp-mine" href="#/profile">Мой кабинет</a>' : ''}
        </div>
      </div>
    </div>
    <div class="pp-stats">
      ${tile('Открыто кейсов', fmt(+S.opened || 0))}
      ${tile('Апгрейдов', fmt(+S.upg || 0), +S.upg ? `побед ${fmt(+S.upgWin || 0)}` : '')}
      ${tile('Контрактов', fmt(+S.con || 0))}
      ${tile('Любимый кейс', fav ? `<a href="#/case/${fav.id}">${esc(fav.name)}</a>` : '—')}
      ${tile('Инвентарь', money(invSum), `${fmt(inv.length)} ${plural(inv.length, 'предмет', 'предмета', 'предметов')}`)}
    </div>
    <div class="pp-grid">
      <div class="pp-col">
        ${best ? `<section class="pp-card"><h3>Лучший дроп</h3><div class="pp-best">${itemCard(best)}</div></section>` : ''}
        ${p.team ? `<section class="pp-card"><h3>Команда</h3><a class="pp-team" href="#/tournaments">${teamLogo(p.team)}<span><b>${esc(p.team.name)}</b><small>[${esc(p.team.tag)}]${p.team.captain ? ' · капитан' : ''}</small></span></a></section>` : ''}
        <section class="pp-card"><h3>Последние дропы</h3>${(p.drops || []).filter(d => SK[d.n]).length ? `<div class="pp-drops">${p.drops.filter(d => SK[d.n]).map(d => { const s = SK[d.n], c = d.t === 'case' ? caseById(d.c) : null;
          return `<div class="pp-drop r-${s.r}"><img src="${imgUrl(s, 's')}" alt=""><span><b>${esc(s.name)}</b><small>${d.t === 'upg' ? `апгрейд ×${(+d.x).toFixed(1).replace('.', ',')}` : d.t === 'con' ? 'контракт' : c ? 'кейс «' + esc(c.name) + '»' : 'кейс'} · ${new Date(d.ts).toLocaleDateString('ru-RU')}</small></span><i>${money(s.p)}</i></div>`; }).join('')}</div>` : '<div class="empty">Пока нет дропов</div>'}</section>
      </div>
      <section class="pp-card pp-inv"><h3>Инвентарь <small>${fmt(inv.length)} предм. · ${money(invSum)}</small></h3>${inv.length ? `<div class="inv-grid pp-inv-grid">${inv.slice(0, 60).map(s => itemCard(s)).join('')}</div>${inv.length > 60 ? `<div class="pp-more">и ещё ${inv.length - 60}</div>` : ''}` : '<div class="empty">Инвентарь пуст</div>'}</section>
    </div>`;
}
function pageTop() {
  return `<section class="container">
    <div class="page-head top-head"><div><h1>Топ <em>игроков</em></h1><p>Самые удачливые игроки RUSH CASE. Рейтинг по сумме выигрышей.</p></div>
      <div class="top-tools"><div id="topSearch"></div><div class="seg" id="topSeg"><button data-p="week">Неделя</button><button data-p="month">Месяц</button><button data-p="all">Всё время</button></div></div></div>
    <div id="topBody"></div>
  </section>`;
}
function mountTop() {
  playerSearch($('#topSearch'));
  $$('#topSeg button').forEach(b => b.onclick = () => { topPeriod = b.dataset.p; drawTop(); });
  drawTop();
}
async function drawTop() {
  $$('#topSeg button').forEach(b => b.classList.toggle('on', b.dataset.p === topPeriod));
  const box = $('#topBody'), period = topPeriod;
  if (!topCache[period]) box.innerHTML = `<div class="top-load"><span class="spinner"></span>Загружаем рейтинг…</div>`;
  let data;
  try { data = await topData(period); } catch (e) { if (topPeriod === period) box.innerHTML = `<div class="top-empty"><b>Рейтинг не загрузился</b><span>Проверьте соединение и обновите страницу.</span></div>`; return; }
  if (topPeriod !== period || !$('#topBody')) return; // пока грузили — переключили период или ушли со страницы
  const list = data.list || [], me = data.me;
  const best = p => SK[p.best] || null;
  const bestHtml = (p, cls) => { const s = best(p); return s ? `<div class="${cls} r-${s.r}"><img src="${imgUrl(s, 'm')}" alt=""><span>${esc(s.name)}</span></div>` : `<div class="${cls} none"><span>—</span></div>`; };
  const pod = [list[1], list[0], list[2]], medal = ['silver', 'gold', 'bronze'], place = [2, 1, 3];
  const perTxt = { week: 'за неделю', month: 'за месяц', all: 'за всё время' }[period];
  box.innerHTML = `
    <div class="podium">${pod.map((p, i) => p ? `
      <div class="pod pod-${medal[i]}${p.me ? ' is-me' : ''}">
        ${place[i] === 1 ? `<span class="pod-crown">${ic.crown}</span>` : ''}
        <span class="pod-place">${place[i]}</span>
        ${ava({ name: p.name, ava: p.ava }, 'xl')}
        <b class="pod-name">${plink(p.pid, esc(p.name))}${p.me ? ' <i class="tt-you">вы</i>' : ''}</b>
        <span class="pod-won">${money(+p.won)}</span>
        <span class="pod-sub">${fmt(p.opened)} ${plural(p.opened, 'кейс', 'кейса', 'кейсов')}</span>
        ${bestHtml(p, 'pod-best')}
      </div>` : `
      <div class="pod pod-${medal[i]} pod-free">
        <span class="pod-place">${place[i]}</span>
        <span class="pod-q">?</span>
        <b class="pod-name">Свободное место</b>
        <span class="pod-sub">Откройте кейсы ${perTxt}, чтобы занять его</span>
      </div>`).join('')}</div>
    ${list.length > 3 ? `<div class="top-table">
      <div class="tt-row tt-h"><span>#</span><span>Игрок</span><span>Кейсов</span><span>Лучший дроп</span><span>Выиграно</span></div>
      ${list.slice(3).map(p => { const s = best(p); return `<div class="tt-row${p.me ? ' is-me' : ''}"><span class="tt-pl">${p.pos}</span><span class="tt-u">${ava({ name: p.name, ava: p.ava }, 'xs')}${plink(p.pid, esc(p.name))}${p.me ? ' <i class="tt-you">вы</i>' : ''}</span><span>${fmt(p.opened)}</span>
        ${s ? `<span class="tt-best r-${s.r}"><img src="${imgUrl(s, 'm')}" alt="">${esc(s.name)}</span>` : '<span class="tt-best none">—</span>'}<span class="tt-won">${money(+p.won)}</span></div>`; }).join('')}
    </div>` : ''}
    ${!list.length ? `<div class="top-empty"><b>Рейтинг ${perTxt} пока пуст</b><span>Первый, кто откроет кейс, окажется на вершине.</span></div>` : ''}
    ${st.user ? `<div class="top-me">${ava(st.user, 'xs')}${me ? `<b>Ваше место: #${me.pos}</b><span>Выиграно ${perTxt}: ${money(+me.won)}</span>` : `<b>Вас пока нет в рейтинге</b><span>Откройте кейс — и вы попадёте в топ ${perTxt}</span>`}<a class="btn btn-primary btn-sm" href="#/cases">${me && me.pos === 1 ? 'Удержать первое место' : 'Подняться выше'}</a></div>`
      : `<div class="top-me"><b>Хотите в топ?</b><span>Войдите и открывайте кейсы — рейтинг считается по реальным выигрышам.</span><button class="btn btn-primary btn-sm" data-act="login">${ic.login}Войти</button></div>`}`;
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
      <div class="cp-title"><i class="cp-line l"></i><h1>${c.name}</h1><i class="cp-line r"></i></div>
      <i></i></div>
    <div class="rl-framed ${c.frame ? c.frame.cls : ''}"><i class="rl-floor"></i><div class="rl-wrap"><div class="rl-halo"><i></i></div><div class="rl" id="rl" style="--ca:${c.th.a}">
      <svg class="rl-frame" id="rlFrame" aria-hidden="true"><polygon class="f-glow"/><polygon class="f-line"/></svg>
      <div class="rl-side l"></div><div class="rl-side r"></div>
      <div class="rl-stage"><i class="rs-burst"></i><i class="rs-glow"></i><div class="rs-embers">${embers}</div><i class="rs-ground"></i></div>
      <div class="rl-idle"><div class="rl-ghost">${ghost}</div>${caseArt(c, 'big float')}</div>
      <div class="rl-strips" id="strips"></div>
      <div class="rl-marker"></div>
      <div class="rl-reveal" id="reveal"></div>
    </div></div><img class="rl-frame-img" src="${c.frame ? c.frame.src : 'assets/frame-case.png'}" alt="" draggable="false">${c.frame ? '<i class="rl-spark s1"></i><i class="rl-spark s2"></i><i class="rl-spark s3"></i><i class="rl-spark s4"></i>' : '<i class="rl-crown c1"></i><i class="rl-crown c2"></i>' + FRAME_FX}</div>
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
/* эффекты на персонажах стандартной рамки (координаты — % от картинки рамки 1983×793) */
const FRAME_FX = `<span class="fr-fx" aria-hidden="true">
  <i class="fr-eye" style="left:7.97%;top:26.1%"></i><i class="fr-eye fr-eye2" style="left:11.14%;top:27%"></i>
  <svg class="fr-cig" style="left:88.1%;top:29.2%" viewBox="0 0 60 16"><defs><linearGradient id="cigP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#cfc9bf"/></linearGradient></defs>
    <g transform="rotate(14 30 8)"><rect x="4" y="5" width="40" height="6" rx="1.2" fill="url(#cigP)"/><rect x="40" y="5" width="14" height="6" rx="1.2" fill="#c98a3c"/><rect x="2" y="5" width="4" height="6" rx="1" fill="#5a5450"/><circle class="fr-ember" cx="2.5" cy="8" r="3.2" fill="#ff6a1a"/></g></svg>
  <canvas class="fr-smoke" width="160" height="300"></canvas>
</span>`;
/* дым сигареты: тонкая струйка у кончика, выше — завивается и расползается */
function frameSmoke() {
  const cv = $('.fr-smoke'); if (!cv || cv._on) return; cv._on = 1;
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, P = [];
  const sx = W * .5, sy = H - 4;
  const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
  { const g = sprite.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(230,230,235,.55)'); gr.addColorStop(.45, 'rgba(210,210,218,.22)'); gr.addColorStop(1, 'rgba(200,200,210,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  let last = performance.now(), acc = 0, on = true, sw = performance.now() + 1800; // струйка идёт порциями: 1,2–2,6 с дым, 0,6–1,4 с пауза
  const tick = now => {
    if (!cv.isConnected) return;
    const dt = Math.min(50, now - last) / 16.7; last = now;
    const fast = !!document.querySelector('.rl.spinning');
    if (now > sw) { on = !on; sw = now + (on ? 1200 + Math.random() * 1400 : 600 + Math.random() * 800); }
    if (on) acc += dt * (fast ? 1.6 : 1.2);
    while (acc >= 1) { acc--; P.push({ x: sx + (Math.random() - .5), y: sy, age: 0, life: 170 + Math.random() * 80, ph: Math.random() * 6.28, sp: .6 + Math.random() * .2, r0: 1 + Math.random() * .6 }); }
    // привязка: точка (sx, sy) канваса = центр огонька сигареты
    const em = cv.parentElement.querySelector('.fr-ember'), host = cv.parentElement.getBoundingClientRect();
    if (em && host.width) { const e = em.getBoundingClientRect(), k = cv.clientWidth / W; cv.style.left = (e.left + e.width / 2 - host.left - sx * k) + 'px'; cv.style.top = (e.top + e.height / 2 - host.top - sy * k) + 'px'; }
    x.clearRect(0, 0, W, H);
    const t = now / 1000;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.age += dt;
      const k = p.age / p.life; if (k >= 1) { P.splice(i, 1); continue; }
      // подъём + завихрение: снизу ровная струйка, выше амплитуда растёт
      p.y -= p.sp * dt * (1 - k * .35);
      const sway = Math.sin(t * 1.3 + p.y * .05 + p.ph * .1) * (k * k * 18) + Math.sin(t * .7 + p.y * .02) * k * 6;
      const px = sx + sway + (p.x - sx) + k * 8;
      const r = p.r0 + k * k * 11, a = (k < .06 ? k / .06 : 1) * (1 - k) * (1 - k) * .9;
      x.globalAlpha = a; x.drawImage(sprite, px - r, p.y - r, r * 2, r * 2);
    }
    x.globalAlpha = 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function mountCase(id) {
  Snd.warm(['lock', 'tick']);
  setTimeout(frameSmoke, 50);
  const c = caseById(id); if (!c) return;
  if (c.snd) Snd.preloadSet(c.snd);
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
const FARM_N = [1, 3, 5, 10, 25, 50]; // кнопки количества фарм-кейса
const MANY_N = 7; // больше — без рулеток, сразу итог
function ccIdle(c) {
  const cc = $('#cc'); if (!cc) return;
  const have = c.rc ? (st.rcoin || 0) : st.balance;
  const cap = c.farm ? c.farm.maxN : 7, maxN = st.user ? clamp(Math.floor(have / c.price + 1e-9), 1, cap) : cap;
  // фарм-кейс: x1 x3 x5 x10 x25 x50 (сколько хватает денег); обычный — x1…x7
  const counts = c.farm ? FARM_N.filter(n => n <= cap && n <= maxN) : Array.from({ length: maxN }, (_, i) => i + 1);
  if (caseN > maxN || !counts.includes(caseN)) caseN = counts.filter(n => n <= Math.min(caseN, maxN)).pop() || 1;
  const cost = c.price * caseN;
  let main;
  if (c.disabled) main = `<button class="btn btn-primary btn-xl btn-cham" disabled>${ic.lock || ic.shield}Кейс временно закрыт</button>`;
  else if (!st.user) main = `<button class="btn btn-primary btn-xl btn-cham" data-act="login">${ic.login}Войти и открыть</button>`;
  else if (c.rc) main = (st.rcoin || 0) >= cost ? `<button class="btn btn-primary btn-xl btn-cham btn-rc" id="openBtn">Открыть за ${casePrice(c, cost)}</button>` : `<a class="btn btn-primary btn-xl btn-cham btn-rc" href="#/profile">Не хватает ${casePrice(c, cost - (st.rcoin || 0))}</a>`;
  else if (st.balance >= cost) main = `<button class="btn btn-primary btn-xl btn-cham" id="openBtn">${ic.coins}Открыть за ${money(cost)}</button>`;
  else main = `<button class="btn btn-primary btn-xl btn-cham" data-act="deposit" data-need="${cost - st.balance}">${ic.wallet}Пополнить на ${money(cost - st.balance)}</button>`;
  cc.innerHTML = `<div class="mult" role="group" aria-label="Количество кейсов">${counts.map(n => `<button class="${n === caseN ? 'on' : ''}" data-n="${n}">x${n}</button>`).join('')}</div>
    <div class="cc-btns">${main}${c.rc ? '' : `<button class="btn btn-xl btn-cham btn-gline" id="demoBtn">${ic.eye}Демо</button>`}</div>
    ${c.farm ? `<div class="cc-note cc-farm">${ic.coin}Ширп дешевле ${money(c.farm.sellBelow)} продаётся сразу — деньги на баланс</div>` : ''}
    <label class="switch"><input type="checkbox" id="fastChk"${st.fast ? ' checked' : ''}><i></i>Быстрое открытие</label>
    ${!st.user ? '<div class="cc-note">В демо-режиме выигрыш не сохраняется. <b>Войдите</b>, чтобы забирать скины по-настоящему.</div>' : ''}`;
  $$('.mult button', cc).forEach(b => b.onclick = () => { caseN = +b.dataset.n; Snd.click(); ccIdle(c); });
  $('#fastChk').onchange = e => { st.fast = e.target.checked; save(); };
  const ob = $('#openBtn'); if (ob) ob.onclick = () => openCase(c, false);
  const db = $('#demoBtn'); if (db) db.onclick = () => openCase(c, true);
}
/* демо: всегда предмет минимум вдвое дороже кейса (чаще 2–5×, дороже — реже); на настоящие открытия не влияет */
function rollDemo(c) {
  if (c.farm) return roll(c.items, 'ch');
  let pool = c.items.filter(s => s.p >= c.price * 2);
  if (!pool.length) pool = c.items.slice().sort((a, b) => b.p - a.p).slice(0, 3);
  const w = pool.map(s => (s.p / c.price) ** -1.6), sw = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * sw; for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[0];
}
async function openCase(c, demo) {
  if (spinning) return;
  const n = caseN, cost = c.price * n;
  if (!demo) {
    if (c.disabled) return toast('Кейс временно закрыт администрацией', 'err');
    if (!st.user) return openAuth('login');
    if (c.rc) { if ((st.rcoin || 0) < cost) return toast(`Не хватает ${rc(cost - (st.rcoin || 0))} R-COIN — они начисляются за открытия кейсов`, 'err'); }
    else if (st.balance < cost) return openDeposit(cost - st.balance);
  }
  let wins, given = [];
  if (demo) wins = Array.from({ length: n }, () => rollDemo(c));
  else {
    // выпадение решает сервер: он же списывает деньги, выдаёт предметы, R-COIN и статистику
    spinning = true;
    const r = await srv('open_case', { p_case: c.id, p_n: n });
    spinning = false;
    if (!r) return;
    wins = r.drops.map(d => SK[d.n]).filter(Boolean);
    if (wins.length !== n) return toast('Ошибка выдачи — обновите страницу', 'err');
    given = r.drops.map(d => d.cash ? { id: uid(), n: d.n, st: 'cash' } : d.sold != null ? { id: uid(), n: d.n, st: 'autosold' } : (st.inv.find(x => x.id === d.id) || { id: d.id, n: d.n, st: 'own' }));
  }
  if (n > MANY_N) return openMany(c, wins, given, demo);
  resetRoulette();
  wins.forEach(s => { new Image().src = imgUrl(s, 'l'); }); // большие картинки грузим, пока крутится рулетка
  spinning = true;
  const my = ++spinId;
  const rl = $('#rl'), box = $('#strips');
  rl.dataset.n = n;
  rl.classList.toggle('vert', n > 5);
  const vert = n > 5; // много кейсов — вертикальные барабаны в ряд
  box.innerHTML = wins.map(w => `<div class="strip${vert ? ' v' : ''}"><div class="track">${Array.from({ length: STRIP_LEN }, (_, i) => rcard(i === WIN_AT ? w : roll(c.items, 'fw'), i === WIN_AT)).join('')}</div></div>`).join('');
  $('#cc').innerHTML = `<div class="cc-spin"><span class="spinner"></span>Открываем кейс…<button class="link" id="skipBtn">Пропустить</button></div>`;
  // 1) отщёлкивание замка — картинка кейса трясётся, лента ещё не крутится
  rl.classList.add('unlocking'); if (c.snd) Snd.play(c.snd.go, .2); else Snd.lock(); // звуки «БАБА ЧАЙ» — потише
  await sleep(st.fast ? 700 : 1150);
  if (my !== spinId || !document.body.contains(rl)) return;
  rl.classList.remove('unlocking');
  // 2) прокрутка
  rl.classList.add('spinning');
  const strips = $$('.strip', box);
  $('#skipBtn').onclick = () => strips.forEach(s => s._skip && s._skip());
  await sleep(60);
  const dur = st.fast ? 3000 : 11000;
  const song = c.snd ? Snd.playCtl(c.snd.song, .35) : null; // песня — пока крутится рулетка
  await Promise.all(strips.map((s, i) => spinStrip(s, dur + i * (vert ? 110 : 260), i === 0)));
  if (song) song.then(h => h && h.stop(.25));
  await sleep(550);
  if (my !== spinId || !document.body.contains(rl)) return;
  showReveal(c, wins, given, demo);
  spinning = false;
}
/* много кейсов (фарм x10–x50): короткая тряска кейса и сразу итог — сетка выпавшего */
async function openMany(c, wins, given, demo) {
  resetRoulette();
  spinning = true;
  const my = ++spinId, rl = $('#rl');
  $('#cc').innerHTML = `<div class="cc-spin"><span class="spinner"></span>Открываем ${wins.length} кейсов…</div>`;
  rl.classList.add('unlocking'); Snd.lock();
  await sleep(st.fast ? 600 : 1100);
  if (my !== spinId || !document.body.contains(rl)) return;
  rl.classList.remove('unlocking');
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
/* выпавший предмет сам плавно покачивается в 3D (мышью не двигается); если выпало несколько — стоят на месте */
function itemTilt(root) {
  $$('.rv-imgw', root).forEach((w, i) => {
    const img = $('img', w); if (!img || w.closest('.rv-inner.many, .rv-agent')) return; // несколько предметов и агенты — стоят на месте, без бликов
    const t0 = performance.now() + i * 900, hover = false;
    let tx = 0, ty = 0, rx = 0, ry = 0, energy = 0;
    // блики: canvas поверх предмета, повёрнутый вместе с ним; полоса света и искорки обрезаются по силуэту
    // (картинки Steam без CORS нельзя взять в CSS-маску, а нарисовать на canvas и обрезать режимом destination-in — можно)
    const fx = document.createElement('canvas'); fx.className = 'it-fx'; fx.setAttribute('aria-hidden', 'true');
    const ctx = fx.getContext('2d'), sparks = Array.from({ length: 9 }, () => ({ x: rand(.12, .88), y: rand(.22, .78), ph: rand(0, 6.3), sp: rand(2, 3.4), s: rand(.6, 1.15) }));
    w.appendChild(fx);
    const place = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      fx.style.left = img.offsetLeft + 'px'; fx.style.top = img.offsetTop + 'px'; fx.style.width = img.offsetWidth + 'px'; fx.style.height = img.offsetHeight + 'px';
      fx.width = Math.max(1, Math.round(img.offsetWidth * dpr)); fx.height = Math.max(1, Math.round(img.offsetHeight * dpr));
    };
    const glint = (now, e) => {
      const W = fx.width, H = fx.height; if (!img.complete || W < 2) return;
      ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H);
      // полоса света — её положение следует за поворотом
      const pos = clamp((50 - ry * 2.4 + rx * .8) / 100, -.2, 1.2), g = ctx.createLinearGradient(W * (pos - .32), 0, W * (pos + .32), H * .45);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.42, 'rgba(255,255,255,0)'); g.addColorStop(.5, `rgba(255,255,255,${(.85 * e).toFixed(3)})`);
      g.addColorStop(.56, `rgba(255,244,210,${(.45 * e).toFixed(3)})`); g.addColorStop(.66, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // искорки-звёздочки
      const t = now / 1000, k = H / 230;
      ctx.lineCap = 'round';
      sparks.forEach(p => {
        const a = Math.max(0, Math.sin(t * p.sp + p.ph)) ** 3 * e; if (a < .02) return;
        const r = 9 * p.s * k * (.4 + .6 * a), cx = p.x * W, cy = p.y * H;
        ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`; ctx.lineWidth = 1.6 * k;
        ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
        ctx.fillStyle = `rgba(255,250,230,${a.toFixed(3)})`; ctx.beginPath(); ctx.arc(cx, cy, 2.2 * k, 0, 6.3); ctx.fill();
      });
      // обрезка по силуэту предмета
      ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(img, 0, 0, W, H);
    };
    if (img.complete) place(); img.addEventListener('load', place); window.addEventListener('resize', place);
    const tick = now => {
      if (!img.isConnected) { window.removeEventListener('resize', place); return; }
      if (!hover) { const t = (now - t0) / 1000; tx = Math.sin(t * .8) * 12; ty = Math.cos(t * .6) * 7; }
      const prx = rx, pry = ry;
      rx += (ty - rx) * .1; ry += (tx - ry) * .1;
      const tf = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(40px) scale(1.02)`;
      img.style.transform = fx.style.transform = tf;
      img.style.filter = `drop-shadow(${(-ry * .7).toFixed(1)}px ${(22 + rx * .5).toFixed(1)}px 22px rgba(0,0,0,.65))`;
      // чем быстрее крутится — тем ярче блики; полоса света бежит по предмету вслед за поворотом
      energy = clamp(energy * .93 + Math.hypot(rx - prx, ry - pry) * .22, 0, 1);
      glint(now, .22 + energy * .78);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
function showReveal(c, wins, given, demo) {
  const best = wins.reduce((a, s) => s.p > a.p ? s : a, wins[0]);
  const tier = best.r === 'rare' || best.p >= c.price * 8 ? 'jackpot' : best.p > c.price ? 'profit' : 'cheap';
  if (c.snd) Snd.play(best.p >= c.price ? c.snd.win : c.snd.lose, .55); else Snd[tier]();
  if (tier === 'jackpot') { burst(110); setTimeout(() => burst(70), 700); }
  const one = wins.length === 1, lots = wins.length > MANY_N;
  if (lots) { const ord = wins.map((s, i) => i).sort((a, b) => wins[b].p - wins[a].p); wins = ord.map(i => wins[i]); given = ord.map(i => given[i]); }
  const autoSum = demo || !c.farm ? 0 : wins.reduce((a, s, i) => a + (given[i] && given[i].st === 'autosold' ? s.p : 0), 0);
  const topR = wins.reduce((a, s) => RAR[s.r].o > RAR[a].o ? s.r : a, wins[0].r);
  const rays = ''; // без лучей и свечения за выпавшим предметом
  $('#reveal').innerHTML = `${one ? '' : `<div class="rv-bg r-${topR}">${rays}</div>`}${autoSum ? `<div class="rv-auto">${ic.coin}Ширп продан автоматически: <b>+${money(autoSum)}</b> на баланс</div>` : lots ? `<div class="rv-auto">${ic.coin}Выпало ${wins.length} предметов на <b>${money(wins.reduce((a, s) => a + s.p, 0))}</b></div>` : ''}<div class="rv-inner ${one ? 'one' : 'many'}${lots ? ' lots' : ''}">${wins.map((s, i) => `
    <div class="rv-card r-${s.r}${given[i] && given[i].st === 'autosold' ? ' rv-auto-sold' : ''}${s.c === 'agent' ? ' rv-agent' : ''}" style="--d:${Math.min(i, 24) * (lots ? 40 : 110)}ms" ${given[i] ? `data-id="${given[i].id}"` : ''}>
      <div class="rv-imgw">${one ? rays : ''}<img src="${imgUrl(s, 'l')}" alt=""></div>
      <div class="rv-rar">${s.cash ? 'Зачислено на баланс' : given[i] && given[i].st === 'autosold' ? 'Продано автоматически' : RAR[s.r].n}</div>
      <div class="rv-name"><span>${esc(s.w)}</span>${esc(s.f)}</div>
      <div class="rv-price">${money(s.p)}</div>
      ${!demo && !one && given[i].st === 'own' ? `<button class="btn btn-sm btn-dark" data-sellone="${given[i].id}">Продать</button>` : ''}
    </div>`).join('')}</div>`;
  $('#rl').classList.add('revealed');
  itemTilt($('#reveal'));
  if (!demo && !c.rc) wins.filter((s, i) => !s.cash && given[i].st !== 'autosold').forEach(s => liveMine({ n: s.name, c: c.id }));
  ccDone(c, wins, given, demo);
}
function ccDone(c, wins, given, demo) {
  const cc = $('#cc');
  const again = () => { resetRoulette(); ccIdle(c); }; // назад к этому кейсу — можно выбрать другой x
  const back = () => { resetRoulette(); ccIdle(c); };
  if (demo) {
    cc.innerHTML = `<div class="cc-note">Это было <b>демо-открытие</b> — предмет не сохранён.</div>
      <div class="cc-btns">${st.user ? `<button class="btn btn-primary btn-xl btn-cham" id="realBtn">Открыть за ${casePrice(c, c.price * caseN)}</button>` : `<button class="btn btn-primary btn-xl btn-cham" data-act="login">${ic.login}Войти и открыть</button>`}<button class="btn btn-xl btn-cham btn-gline" id="againBtn">Ещё демо</button></div>`;
    const rb = $('#realBtn'); if (rb) rb.onclick = () => openCase(c, false);
  } else {
    const live = () => given.filter(g => g.st === 'own');
    const sum = () => live().reduce((a, g) => a + SK[g.n].p, 0);
    const draw = () => {
      const left = live().length;
      cc.innerHTML = `<div class="cc-btns">
          <button class="btn btn-primary btn-xl btn-cham" id="againBtn">${ic.box}Открыть ещё</button>
          ${left ? `<button class="btn btn-xl btn-cham btn-upg" id="toUpg"><span class="tu-sh"></span>${ic.up}<span class="tu-t">В апгрейд<small>шанс умножить дроп до x10</small></span></button>` : ''}
          ${left ? `<button class="btn btn-xl btn-cham btn-gline" id="sellAll">${ic.coin}Продать${wins.length > 1 ? ' всё' : ''} за ${money(sum())}</button>` : ''}
        </div>
        ${left ? '<div class="cc-note">Предметы уже в вашем <b>профиле</b> — их можно продать или вывести в Steam позже.</div>' : ''}`;
      const sa = $('#sellAll');
      if (sa) sa.onclick = async () => { sa.disabled = true; const t = await sellItems(live().map(g => g.id), true); if (t) { Snd.coin(); toast(`Продано на <b>+${money(t)}</b>`); } back(); };
      const tu = $('#toUpg'); if (tu) tu.onclick = () => { upg.sel = live().map(g => g.id); upg.bal = 0; upg.to = null; upg.mult = 0; upg.autoX2 = true; location.hash = '#/upgrade'; };
      $('#againBtn').onclick = again; const bb = $('#backBtn'); if (bb) bb.onclick = back;
    };
    const markSold = () => given.forEach(g => { if (g.st !== 'own') { const el = $(`.rv-card[data-id="${g.id}"]`); if (el) { el.classList.add('rv-sold'); const b = $('[data-sellone]', el); if (b) b.outerHTML = '<div class="rv-rar" style="color:var(--txt3)">Продано</div>'; } } });
    $$('[data-sellone]').forEach(b => b.onclick = async () => { b.disabled = true; await sellItem(b.dataset.sellone); given.forEach(g => { const x = st.inv.find(y => y.id === g.id); if (x) g.st = x.st; }); if (!live().length) return back(); markSold(); draw(); });
    draw();
    return;
  }
  $('#againBtn').onclick = () => openCase(c, true);
}

/* =========================================================
   UPGRADE
   ========================================================= */
const upg = { cat: 'all', mult: 0, sel: [], bal: 0, to: null, q: '', sort: 'asc', rot: 0, busy: false };
const ARC_R = 138;
const upgItems = () => upg.sel.map(id => st.inv.find(x => x.id === id && x.st === 'own')).filter(Boolean);
function upgValue() { return upgItems().reduce((a, x) => a + SK[x.n].p, 0) + upg.bal; }
// шанс апгрейда: до x20 — честные 92% от отношения сумм; дальше резко падает (x50 ≈ 0,12%, x100 ≈ 0,007%, x500 ≈ 0,00001%) — x500/x1000 практически не выпадают
const UPG_SOFT = 20;
const UPG_MAX = .75; // максимальный шанс апгрейда (как на сервере)
const upgChance = (v, t) => { if (!v || !t) return 0; const x = t.p / v; return Math.min(UPG_MAX, .92 / x * (x > UPG_SOFT ? (UPG_SOFT / x) ** 3 : 1) * myLuck()); };
/* процент шанса: мелкие значения — без округления в ноль (0,0000118%) */
const pctTxt = ch => { const p = ch * 100; if (p < 1e-6) return '<0,000001%'; const d = p >= 10 ? 1 : p >= 1 ? 2 : Math.min(12, 1 - Math.floor(Math.log10(p))); return p.toFixed(d).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1').replace('.', ',') + '%'; };
/* дуга шанса по центру снизу кольца */
function arcPath(span) {
  span = Math.min(span, 359.9);
  const pt = a => { const r = a * Math.PI / 180; return [160 + ARC_R * Math.cos(r), 160 + ARC_R * Math.sin(r)]; };
  const [x1, y1] = pt(90 - span / 2), [x2, y2] = pt(90 + span / 2);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${ARC_R} ${ARC_R} 0 ${span > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
const chanceColor = ch => `hsl(${Math.round(clamp(ch / UPG_MAX, 0, 1) * 120)} 85% 60%)`;
/* кнопки множителей: стандартные или свои (6 штук, x1.2–x20) — свои хранятся в профиле (save_umults) */
const UPG_DEF_MULTS = [1.5, 2, 2.5, 3, 5, 10];
const upgMults = () => Array.isArray(st.umults) && st.umults.length === 6 ? st.umults.map(Number) : UPG_DEF_MULTS;
const multTxt = m => 'x' + String(+(+m).toFixed(1)).replace('.', ',');
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
              <filter id="groove" filterUnits="userSpaceOnUse" x="0" y="0" width="320" height="320">
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
        <label class="switch upg-fast"><input type="checkbox" id="upgFastChk"${st.upgFast ? ' checked' : ''}><i></i>Быстрая прокрутка</label>
        <div class="mults" id="upgMults"></div>
        <button class="btn btn-primary btn-xl" id="upgBtn">${ic.up}Апгрейд</button>
      </div>
      <div class="upg-slot" id="upgTo"></div>
    </div>
    <div class="upg-lists">
      <div class="panel">
        <div class="panel-h"><h3>Ставка</h3><span class="upg-sum" id="upgSum"></span><div class="bal-wrap"><button class="btn btn-dark btn-sm" id="upgBalBtn" aria-haspopup="true"></button><div class="bal-pop hidden" id="upgBalPop"></div></div><button class="btn btn-dark btn-sm" id="upgAll">Выбрать всё</button><button class="btn btn-ghost btn-sm" id="upgClr">Очистить</button></div>
        <div class="upg-inv" id="upgInv"></div>
        <div class="mini-grid" id="upgSrc"></div>
      </div>
      <div class="panel">
        <div class="panel-h"><h3>Желаемый предмет</h3><input class="inp" id="upgQ" placeholder="Поиск" autocomplete="off"><div class="seg" id="upgSort"><button data-s="asc">₽ ↑</button><button data-s="desc">₽ ↓</button></div></div>
        <div class="chips upg-cats" id="upgCats">${UPG_TABS.map(([k, t]) => `<button class="chip${k === 'all' ? ' on' : ''}" data-cat="${k}">${t}</button>`).join('')}</div>
        <div class="upg-cnt" id="upgCnt"></div>
        <div class="mini-grid" id="upgTargets"></div>
      </div>
    </div>
  </section>`;
}
const mcard = (s, attrs = '', extra = '') => `<div class="mcard r-${s.r}" ${attrs}>${extra}<img src="${imgUrl(s, 's')}" alt="" loading="lazy"><div class="mc-w">${esc(s.w)}</div><div class="mc-f">${esc(s.f)}</div><div class="mc-p">${money(s.p)}</div></div>`;
function mountUpgrade() {
  Snd.warm(['upgWin', 'safe1', 'safe2', 'safe3', 'tick']);
  upg.busy = false;
  $('#upgFastChk').onchange = e => { st.upgFast = e.target.checked; save(); };
  $$('#upgSort button').forEach(b => b.onclick = () => { upg.sort = b.dataset.s; drawTargets(); });
  $('#upgQ').oninput = e => { upg.q = e.target.value.trim().toLowerCase(); drawTargets(); };
  $$('#upgCats [data-cat]').forEach(b => { b.classList.toggle('on', b.dataset.cat === upg.cat); b.onclick = () => { upg.cat = b.dataset.cat; upg.mult = 0; $$('#upgCats [data-cat]').forEach(x => x.classList.toggle('on', x === b)); drawTargets(); }; });
  upg.editMults = false; drawMults();
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
  // пришли из кейса кнопкой «В апгрейд» — сразу цель по x2
  if (upg.autoX2) { upg.autoX2 = false; if (upg.sel.length) setMult(2); }
}
/* выбор множителя: фильтр списка + автовыбор предмета около ставки × m; повторный клик — сброс */
function setMult(m) {
  if (upg.busy) return;
  const v = upgValue(); if (!v) return toast('Сначала соберите ставку', 'err');
  if (upg.mult === m) { upg.mult = 0; Snd.safeSel(false); return drawUpg(); }
  upg.mult = m; upg.cat = 'all';
  const best = upgPickMult(v, m);
  if (best) { upg.to = best.name; upg.cat = best.c; upg.focus = true; upg.q = ''; const q = $('#upgQ'); if (q) q.value = ''; $$('#upgCats [data-cat]').forEach(x => x.classList.toggle('on', x.dataset.cat === upg.cat)); Snd.safeSel(true); drawUpg(); }
}
function drawMults() {
  const box = $('#upgMults'); if (!box) return;
  const ms = upgMults();
  if (!upg.editMults) {
    box.classList.remove('editing');
    box.innerHTML = ms.map(m => `<button data-m="${m}">${multTxt(m)}</button>`).join('') + `<button class="mult-edit" id="multEdit" title="Свои множители" aria-label="Настроить свои множители">${ic.edit}</button>`;
    $$('[data-m]', box).forEach(b => { b.classList.toggle('on', +b.dataset.m === upg.mult); b.onclick = () => setMult(+b.dataset.m); });
    $('#multEdit').onclick = () => { if (upg.busy) return; if (!st.user) return openAuth('login'); upg.editMults = true; drawMults(); };
    return;
  }
  box.classList.add('editing');
  box.innerHTML = `<div class="me-h">Свои множители <small>от x1,2 до x20</small></div>
    <div class="me-row">${ms.map((m, i) => `<label class="me-in"><i>x</i><input type="number" min="1.2" max="20" step="0.1" value="${+(+m).toFixed(1)}" data-i="${i}" inputmode="decimal" aria-label="Множитель ${i + 1}"></label>`).join('')}</div>
    <div class="me-f"><button class="btn btn-ghost btn-sm" id="meDef">Стандартные</button><button class="btn btn-dark btn-sm" id="meCancel">Отмена</button><button class="btn btn-primary btn-sm" id="meSave">Сохранить</button></div>`;
  const inputs = $$('input', box);
  inputs.forEach(i => { i.oninput = () => i.parentElement.classList.remove('err'); i.onkeydown = e => { if (e.key === 'Enter') $('#meSave').click(); }; });
  inputs[0].focus(); inputs[0].select();
  const store = async arr => {
    const b = $('#meSave'); b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
    const r = await srv('save_umults', { p_m: arr });
    if (!r) { b.disabled = false; b.textContent = 'Сохранить'; return; }
    if (!arr.length) st.umults = null;
    if (upg.mult && !upgMults().includes(upg.mult)) upg.mult = 0;
    upg.editMults = false; drawMults(); drawTargets();
    toast(arr.length ? 'Ваши множители сохранены' : 'Вернули стандартные множители');
  };
  $('#meCancel').onclick = () => { upg.editMults = false; drawMults(); };
  $('#meDef').onclick = () => store([]);
  $('#meSave').onclick = () => {
    let ok = true;
    const arr = inputs.map(i => { const v = Math.round(parseFloat(String(i.value).replace(',', '.')) * 10) / 10; if (!(v >= 1.2 && v <= 20)) { ok = false; i.parentElement.classList.add('err'); } return v; });
    if (!ok) return toast('Множитель — от x1,2 до x20', 'err');
    store([...new Set(arr)].length === 6 ? arr.slice().sort((a, b) => a - b) : arr);
  };
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
// случайный предмет из ВСЕХ категорий с ценой около v × m (±12%); если таких мало — ближайшие по цене
function upgPickMult(v, m) {
  const want = v * m, pool = UPG_CAT.filter(s => s.p > v * 1.05);
  let near = pool.filter(s => s.p >= want * .88 && s.p <= want * 1.12);
  if (near.length < 3) near = pool.slice().sort((a, z) => Math.abs(Math.log(a.p / want)) - Math.abs(Math.log(z.p / want))).slice(0, 12);
  return near[Math.floor(Math.random() * near.length)] || null;
}
function drawUpg() {
  upg.sel = upg.sel.filter(id => st.inv.find(x => x.id === id && x.st === 'own'));
  upg.bal = st.user ? clamp(Math.round(upg.bal), 0, st.balance) : 0;
  const items = upgItems(), v = upgValue();
  if (upg.mult && v && !upg.busy) {
    const x = upg.to ? SK[upg.to].p / v : 0;
    if (!x || Math.abs(Math.log(x / upg.mult)) > Math.log(1.15)) { const b = upgPickMult(v, upg.mult); upg.to = b ? b.name : null; if (b) { upg.cat = b.c; upg.focus = true; } }
  }
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
  cEl.textContent = ch ? pctTxt(ch) : '0%';
  cEl.style.fontSize = cEl.textContent.length > 6 ? Math.min(44, 44 * 190 / (34 * cEl.textContent.length)).toFixed(1) + 'px' : ''; // длинный процент — мельче, чтобы влезал в колесо
  cEl.style.color = ch ? chanceColor(ch) : '';
  $('#wLabel').textContent = ts && v ? `x${(ts.p / v).toFixed(2)}` : 'шанс';
  // инвентарь (мультивыбор)
  $('#upgSum').innerHTML = v ? `${items.length} шт.${upg.bal ? ' + баланс' : ''} · <b>${money(v)}</b>` : '';
  const src = $('#upgSrc'), list = own().slice().sort((a, b) => SK[b.n].p - SK[a.n].p);
  const invSum = list.reduce((t, x) => t + SK[x.n].p, 0);
  $('#upgInv').innerHTML = list.length ? `${ic.box}В инвентаре ${list.length} ${plural(list.length, 'предмет', 'предмета', 'предметов')} на <b>${money(invSum)}</b>` : '';
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
  let list = UPG_CAT.filter(s => s.p > v * 1.05 && (upg.cat === 'all' || s.c === upg.cat) && (!upg.q || s.name.toLowerCase().includes(upg.q)));
  // фильтр по множителю: только предметы около v × m (±12%); если таких мало — ближайшие по цене
  if (upg.mult && v) {
    const want = v * upg.mult, near = list.filter(s => s.p >= want * .88 && s.p <= want * 1.12);
    list = near.length >= 3 ? near : list.slice().sort((a, z) => Math.abs(Math.log(a.p / want)) - Math.abs(Math.log(z.p / want))).slice(0, 12).sort((a, z) => a.p - z.p);
  }
  $$('#upgMults [data-m]').forEach(x => x.classList.toggle('on', +x.dataset.m === upg.mult));
  $$('#upgSort button').forEach(b => b.classList.toggle('on', b.dataset.s === upg.sort));
  if (upg.sort === 'desc') list = list.slice().reverse();
  const total = list.length, LIMIT = 240;
  if (total > LIMIT) { const k = upg.to ? list.findIndex(s => s.name === upg.to) : -1; const st0 = k >= LIMIT ? Math.max(0, k - Math.floor(LIMIT / 2)) : 0; list = list.slice(st0, st0 + LIMIT); }
  $('#upgCnt') && ($('#upgCnt').textContent = total > LIMIT ? `показано ${LIMIT} из ${fmt(total)} — уточните поиск` : `${fmt(total)} предм.`);
  box.innerHTML = list.length ? list.map(s => mcard(s, `data-t="${esc(s.name)}"`, v ? `<span class="mc-x">${pctTxt(upgChance(v, s))}</span>` : '')).join('') : `<div class="empty">${ic.search}Ничего не найдено</div>`;
  $$('[data-t]', box).forEach(el => { if (el.dataset.t === upg.to) el.classList.add('sel'); el.onclick = () => { if (upg.busy) return; upg.to = el.dataset.t; const x = SK[upg.to].p / (v || 1); if (upg.mult && Math.abs(Math.log(x / upg.mult)) > Math.log(1.15)) upg.mult = 0; Snd.safeSel(true); drawUpg(); }; });
  // после выбора множителем — прокручиваем список к выбранному предмету
  if (upg.focus) { upg.focus = false; const el = $('[data-t].sel', box); if (el) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2; }
}
async function runUpgrade() {
  if (upg.busy) return;
  if (!st.user) return openAuth('login');
  const items = upgItems(), v = upgValue(), ts = upg.to && SK[upg.to];
  if (!v) return toast('Выберите скины для ставки или добавьте баланс', 'err');
  if (!ts) return toast('Выберите желаемый скин', 'err');
  if (upg.bal > st.balance) return openDeposit(upg.bal - st.balance);
  upg.busy = true; $('#upgBtn').disabled = true;
  // результат решает сервер (шанс, удача, списание ставки, выдача, R-COIN за проигрыш)
  const r = await srv('upgrade', { p_ids: items.map(x => x.id), p_bal: upg.bal, p_target: ts.name });
  if (!r) { upg.busy = false; $('#upgBtn').disabled = false; upg.sel = []; drawUpg(); return; }
  const ch = +r.chance, win = !!r.win;
  let won = win ? st.inv.find(x => x.id === r.id) || null : null;
  // старт: рычаг сейфа, стрелка трогается после «клаца»
  const F = !!st.upgFast; // быстрая прокрутка: ~2 с вместо ~9, без сердцебиения
  Snd.safeStart();
  await sleep(F ? 150 : 380);
  // зона выигрыша — дуга ±half градусов от низа кольца
  const half = ch * 180, m = Math.min(3, half / 3);
  const off = win ? rand(-(half - m), half - m) : rand(half + 3, 360 - half - 3);
  const d = (180 + off + 360) % 360;
  const ptr = $('#wPtr');
  ptr.style.transition = 'none'; ptr.style.transform = 'rotate(0deg)'; void ptr.offsetWidth; // старт сверху
  const DUR = F ? 2200 : 8600;
  upg.rot = 360 * (F ? 2 : 4) + d;
  ptr.style.transition = `transform ${DUR / 1000}s cubic-bezier(.18,.62,.06,1)`;
  ptr.style.transform = `rotate(${upg.rot}deg)`;
  const cEl = $('#wChance'); cEl.textContent = '…'; cEl.style.color = ''; cEl.style.fontSize = '';
  // щелчки храповика: тяжелеют при замедлении; последние ~2 с — сердцебиение
  const t0 = performance.now();
  let last = null, lastA = null, raf, nextBeat = F ? Infinity : DUR - 2300;
  const loop = now => {
    const mx = new DOMMatrixReadOnly(getComputedStyle(ptr).transform), a = (Math.atan2(mx.b, mx.a) * 180 / Math.PI + 360) % 360;
    const el = now - t0, dA = lastA == null ? 0 : (a - lastA + 360) % 360; lastA = a;
    const k = Math.floor(a / 40), tense = !F && el > DUR - 2300 ? 1 : 0; // щелчок реже — раз в 40°
    if (last !== null && k !== last) Snd.safeTick(Math.min(1, dA / 14), tense);
    last = k;
    if (el >= nextBeat && el < DUR - 150) { const p = (el - (DUR - 2300)) / 2300; Snd.heart(.35 + p * .35); nextBeat += 620 - p * 260; }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  await sleep(DUR + 150); cancelAnimationFrame(raf);
  const nearMiss = !win && Math.min(Math.abs(off - half), Math.abs(360 - half - off)) < 10;
  const w = $('#wheel'); if (!w) { upg.busy = false; return; }
  w.classList.add(win ? 'win' : 'lose');
  // победа — без надписи на колесе, сразу 3D-карточка; проигрыш — LOSE
  cEl.textContent = win ? '' : 'LOSE';
  $('#wLabel').textContent = win ? '' : 'не повезло';
  if (win) { liveMine({ n: ts.name, t: 'upg', x: ts.p / v }); Snd.play('upgWin').then(ok => { if (!ok) Snd.safeWin(); }); burst(120); setTimeout(() => burst(60), 600); toast(`Апгрейд успешен: <b>${esc(ts.name)}</b>`); }
  else { if (nearMiss) { Snd.nearMiss(); setTimeout(() => Snd.safeLose(), 450); } else Snd.safeLose(); $('#upgFrom').classList.add('lost'); toast('Апгрейд не удался — попробуйте ещё раз', 'err'); }
  // победа — карточка выигрыша поверх апгрейда, ждём выбор игрока
  let act = null;
  if (win) act = await upgWinCard(ts);
  else await sleep(F ? 900 : 1900);
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
  // «Апгрейднуть»: выигранный предмет сразу в ставку, по умолчанию — x2
  if (act === 'again' && won && won.st === 'own') { upg.sel = [won.id]; drawUpg(); setMult(2); return; }
  drawUpg();
}
/* 3D-карточка выигрыша поверх апгрейда: наклон за курсором (без курсора — плавное покачивание),
   толщина пластины, слои на разной глубине, блик и голографическая рамка. Возвращает 'take' | 'again' */
function upgWinCard(s) {
  return new Promise(res => {
    const host = $('.upg-main'); if (!host) return res('take');
    const cols = ['#f5c76b', '#ffe7a3', '#ffffff', '#ff6fb5', '#7dd3fc', '#a3e635'];
    const conf = Array.from({ length: 70 }, () => `<i style="--x:${rand(0, 100)}%;--dx:${rand(-80, 80)}px;--r:${rand(-720, 720)}deg;--d:${rand(1.8, 3.4)}s;--dl:${rand(0, 1.2)}s;--c:${pick(cols)};--w:${rand(5, 9)}px"></i>`).join('');
    const ov = document.createElement('div');
    ov.className = 'uw-ov';
    ov.innerHTML = `<div class="uw-conf" aria-hidden="true">${conf}</div>
      <div class="uw3-stage">
        <div class="uw3 r-${s.r}" role="dialog" aria-label="Апгрейд успешен">
          ${Array.from({ length: 8 }, (_, i) => `<i class="uw3-slab" style="--z:${-(i + 1) * 1.5}px"></i>`).join('')}
          <div class="uw3-face">
            <i class="uw3-holo"></i><i class="uw3-grid"></i>
            <div class="uw3-h">Апгрейд успешен</div>
            <div class="uw3-stagev">
              <i class="uw3-rays"></i><i class="uw3-pad"></i><i class="uw3-shadow"></i>
              <img class="uw3-img" src="${imgUrl(s, 'l')}" alt="">
            </div>
            <div class="uw3-rar">${RAR[s.r] ? RAR[s.r].n : ''}</div>
            <div class="uw3-name"><span>${esc(s.w)}</span>${esc(s.f)}</div>
            <div class="uw3-price">${money(s.p)}</div>
            <div class="uw3-btns">
              <button class="btn btn-take" data-uw="take">${ic.box}Забрать</button>
              <button class="btn btn-primary" data-uw="again">${ic.trend}Апгрейднуть</button>
            </div>
            <i class="uw3-shine"></i>
          </div>
        </div>
      </div>`;
    host.appendChild(ov);
    const card = $('.uw3', ov);
    // наклон: курсор задаёт цель, rAF плавно догоняет; без курсора — покачивание
    let tx = 0, ty = 0, rx = 0, ry = 0, mx = 50, my = 30, hover = false, raf, t0 = performance.now();
    const onMove = e => { const r = card.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height; tx = (px - .5) * 26; ty = -(py - .5) * 20; mx = px * 100; my = py * 100; hover = true; };
    ov.addEventListener('pointermove', onMove);
    ov.addEventListener('pointerleave', () => { hover = false; });
    const tick = now => {
      if (!hover) { const t = (now - t0) / 1000; tx = Math.sin(t * .9) * 9; ty = Math.cos(t * .7) * 6; mx = 50 + Math.sin(t * .9) * 30; my = 35 + Math.cos(t * .7) * 20; }
      rx += (ty - rx) * .09; ry += (tx - ry) * .09;
      card.style.setProperty('--rx', rx.toFixed(2) + 'deg'); card.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      card.style.setProperty('--mx', mx.toFixed(1) + '%'); card.style.setProperty('--my', my.toFixed(1) + '%');
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    requestAnimationFrame(() => ov.classList.add('on'));
    $$('[data-uw]', ov).forEach(b => b.onclick = () => {
      ov.classList.remove('on'); ov.classList.add('off');
      setTimeout(() => { cancelAnimationFrame(raf); ov.remove(); }, 320);
      res(b.dataset.uw);
    });
  });
}

/* =========================================================
   CONTRACTS
   ========================================================= */
let conSel = [], conBusy = false;
/* =========================================================
   КОНТРАКТЫ — «Досье»: лист изъятия → соглашение с подписью → протокол выдачи
   ========================================================= */
let conStep = 1, conSigned = false, conCase = null, conRes = null, conLast = null;
const CON_MAX = 5;
/* улики приколоты к доске вразброс: [left %, top %, поворот] */
const DOS_POS = [[2, 8, -5], [22, 44, 4], [41, 4, -2.5], [60, 40, 5.5], [79, 10, -3.5]];
const conNo = () => 'RC-' + String((st.stats.con || 0) + 45).padStart(3, '0') + '-' + 'ABCDEFGH'[(st.stats.con || 0) % 8];
function pageContracts() {
  return `<section class="container dos" id="dos">
    <div class="dos-mast">
      <div>
        <div class="dos-eye">Досье <span id="dosNo">${conNo()}</span> · материалы ограниченного доступа</div>
        <h1 class="dos-title">Дело <em>«Контракт»</em></h1>
        <p class="dos-sub">Изымите от 3 до 10 предметов, передайте дело на подпись — комиссия выдаст один случайный скин стоимостью от 25% до 400% суммы контракта.</p>
      </div>
    </div>
    <nav class="dos-tabs" id="dosTabs">
      <button data-step="1"><i>01</i>Улики</button>
      <button data-step="2"><i>02</i>Соглашение</button>
      <button data-step="3"><i>03</i>Протокол выдачи</button>
    </nav>
    <div class="dos-desk" id="dosDesk"></div>
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <filter id="dosRough" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>
      <filter id="dosRough2" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter>
    </svg>
  </section>`;
}
function mountContracts() {
  Snd.warm(['conOpen', 'conAdd', 'conSign', 'conStamp', 'conHover', 'conPen']);
  dosOpenShown = false;
  conBusy = false;
  conSel = conSel.filter(id => st.inv.find(x => x.id === id && x.st === 'own'));
  if (conStep === 3 && !conRes) conStep = 1;
  if (conStep === 2 && conSel.length < 3) conStep = 1;
  $$('#dosTabs [data-step]').forEach(b => b.onclick = () => conGo(+b.dataset.step));
  const desk = $('#dosDesk');
  // тихий шелест бумаги при наведении на карточку (не чаще раза в 120 мс, вариации высоты)
  let hvT = 0, hvS = null; desk.addEventListener('pointerover', e => { const el = e.target.closest('.dcard, .dslot.f'); if (!el || el.contains(e.relatedTarget)) return; const now = performance.now(); if (now - hvT < 120) return; hvT = now; if (hvS) hvS.stop(.08); Snd.playCtl('conHover', .22).then(c => { hvS = c; if (c) setTimeout(() => c.stop(.25), 450); }); });
  const lamp = dosLampEl = Object.assign(document.createElement('i'), { className: 'dos-lamp' }); desk.prepend(lamp);
  let lq = null, lraf = 0;
  desk.addEventListener('pointermove', e => {
    lq = e; if (lraf) return;
    lraf = requestAnimationFrame(() => { lraf = 0; const r = desk.getBoundingClientRect(); lamp.style.transform = `translate3d(${(lq.clientX - r.left - 520).toFixed(0)}px,${(lq.clientY - r.top - 420).toFixed(0)}px,0)`; });
  }, { passive: true });
  if (!window._dosRz) { window._dosRz = 1; window.addEventListener('resize', () => { if ($('#dosThreadSvg')) dosThread(false); }); }
  drawCon();
}
function conGo(n) {
  if (conBusy) return;
  if (n === 2 && conSel.length < 3) return toast('Для передачи дела нужно не менее трёх предметов', 'err');
  if (n === 3 && !conRes) return toast('Сначала подпишите и закройте дело', 'err');
  conStep = n; Snd.click(); drawCon();
  const d = $('#dos'); if (d) window.scrollTo({ top: d.getBoundingClientRect().top + scrollY - 90, behavior: 'smooth' });
}
const conItems = () => conSel.map(id => st.inv.find(x => x.id === id)).filter(Boolean);
const dosEsc = t => esc(String(t));
function drawCon() {
  const desk = $('#dosDesk'); if (!desk) return;
  $$('#dosTabs [data-step]').forEach(b => { const n = +b.dataset.step; b.classList.toggle('on', n === conStep); b.classList.toggle('lock', (n === 2 && conSel.length < 3) || (n === 3 && !conRes)); });
  const no = $('#dosNo'); if (no) no.textContent = conStep === 3 && conRes ? conRes.no : conNo();
  const enter = desk.dataset.step !== String(conStep); desk.dataset.step = conStep;
  desk.className = 'dos-desk s' + conStep + (enter ? ' enter' : '');
  const inv = $('#dosInv'), invTop = inv ? inv.scrollTop : 0, pageY = scrollY;
  setTimeout(() => { conLast = null; }, 0);
  if (conStep === 1) drawConEvidence(desk);
  else if (conStep === 2) drawConAgreement(desk);
  else drawConProtocol(desk);
  if (dosLampEl) desk.prepend(dosLampEl);
  if (!enter) { const i2 = $('#dosInv'); if (i2) i2.scrollTop = invTop; if (scrollY !== pageY) scrollTo(0, pageY); }
}
let dosLampEl = null;
/* ---------- лист 01: улики ---------- */
const dosPos = i => { const [l, t, r] = DOS_POS[i]; return `--l:${l}%;--t:${t}%;--r:${r}deg`; };
let dosOpenShown = false;
function drawConEvidence(desk) {
  if (!dosOpenShown) setTimeout(() => { if ($('.dst.open.anim')) Snd.play('conOpen', .9); }, 380);
  setTimeout(() => { dosOpenShown = true; }, 900);
  const items = conItems(), sum = items.reduce((a, x) => a + SK[x.n].p, 0);
  desk.innerHTML = `<div class="dos-grid">
    <section class="dpaper dos-board">
      <header class="dp-head"><span>Вещественные доказательства / лист изъятия</span><em>Форма RC-5 · ${CON_MAX} улик</em></header>
      <div class="dst big open${dosOpenShown ? '' : ' anim'}">Дело открыто</div><div class="dos-board-h"><h3>Состав контракта</h3><span>Нажмите на скин в архиве — он ляжет в следующую ячейку</span></div>
      <div class="dos-thread"><svg class="dos-thr" id="dosThreadSvg" aria-hidden="true"></svg>
        <div class="dos-slots">${Array.from({ length: CON_MAX }, (_, i) => {
          const x = items[i], next = i === items.length;
          if (!x) return `<div class="dslot${next ? ' next' : ''}" style="${dosPos(i)}"><i class="pin"><b></b></i><span class="dn">Улика ${String(i + 1).padStart(2, '0')}</span><b>+</b><small>${next ? 'Следующая ячейка' : 'Пусто'}</small></div>`;
          const s = SK[x.n];
          return `<div class="dslot f r-${s.r}${x.id === conLast ? ' drop' : ''}" style="${dosPos(i)}"><i class="pin"><b></b></i><span class="dn">Улика ${String(i + 1).padStart(2, '0')}</span><button class="dx" data-rm="${x.id}" aria-label="Убрать">×</button><img src="${imgUrl(s, 's')}" alt=""><div class="dw">${dosEsc(s.w)}</div><div class="df">${dosEsc(s.f)}</div><div class="dpz">${money(s.p)}</div></div>`;
        }).join('')}</div>
      </div>
      <div class="dos-next"><p><b>Правило отдела:</b> минимум 3 предмета, максимум ${CON_MAX}. Изъятые предметы сгорают — взамен выдаётся один скин.</p>
        <button class="dbtn red" id="dosToSign" ${items.length < 3 ? 'disabled' : ''}>Передать дело на подпись →</button></div>
    </section>
    <aside class="dos-side">
      <section class="dpaper dos-sum"><i class="clip" aria-hidden="true"></i>
        <header class="dp-head"><span>Сводка следователя</span></header>
        <div class="dm"><span>Изъято предметов</span><b>${items.length} / ${CON_MAX}</b></div>
        <div class="dm"><span>Сумма контракта</span><b>${money(sum)}</b></div>
        <div class="dm"><span>Средняя отдача</span><b>${sum ? '≈ ' + money(sum * .9) : '—'}</b></div>
        <div class="drange"><small>Возможный дроп</small><strong>${sum ? `${money(sum * .25)} — ${money(sum * 4)}` : '25% — 400%'}</strong></div>
      </section>
      <section class="dos-note"><i class="tape"></i><h4>Пометка на полях</h4>
        <p>Комиссия оценивает каждый предмет и выбирает один случайный результат.</p>
        <p class="red">Не обещайте владельцу, что его любимый скин вернётся домой.</p>
        <p>Особенно если на нём наклейка с котом.</p></section>
    </aside>
  </div>
  <section class="dpaper dos-arch">
    <header class="dp-head dos-arch-h"><span>Архив скинов <b class="cnt">${own().length}</b></span>
      <div><button class="dmini" id="dosAuto">Автоподбор</button><button class="dmini" id="dosClear">Очистить дело</button></div></header>
    <div class="dos-inv" id="dosInv"></div>
  </section>`;
  const list = own().slice().sort((a, b) => SK[b.n].p - SK[a.n].p);
  $('#dosInv').innerHTML = !st.user ? `<div class="dos-empty">Войдите, чтобы открыть архив своих скинов.<button class="dbtn red" data-act="login">Войти</button></div>`
    : list.length ? list.map(x => { const s = SK[x.n], used = conSel.includes(x.id), full = !used && conSel.length >= CON_MAX;
      return `<button class="dcard r-${s.r}${used ? ' used' : ''}${full ? ' full' : ''}" data-pick="${x.id}"><span class="dr">${RAR[s.r] ? RAR[s.r].n : ''}</span><img src="${imgUrl(s, 's')}" alt="" loading="lazy"><span class="dw">${dosEsc(s.w)}</span><span class="df">${dosEsc(s.f)}</span><span class="db"><b>${money(s.p)}</b><em>${used ? 'В деле' : '+ В дело'}</em></span></button>`; }).join('')
    : `<div class="dos-empty">Архив пуст — нужно минимум 3 предмета.<a class="dbtn red" href="#/case/sifon">Открыть «Сифон и Борода» за 29 ₽</a></div>`;
  $$('[data-pick]', desk).forEach(el => el.onclick = () => {
    const id = el.dataset.pick;
    let added = false;
    if (conSel.includes(id)) conSel = conSel.filter(z => z !== id); else if (conSel.length < CON_MAX) { conSel = [...conSel, id]; conLast = id; added = true; } else return toast(`В деле максимум ${CON_MAX} предметов`, 'err');
    if (added) Snd.play('conAdd', .8).then(ok => { if (!ok) Snd.click(); }); else Snd.click(); drawCon();
  });
  $$('[data-rm]', desk).forEach(el => el.onclick = () => { conSel = conSel.filter(z => z !== el.dataset.rm); Snd.click(); drawCon(); });
  $('#dosAuto').onclick = () => { conSel = own().slice().sort((a, b) => SK[a.n].p - SK[b.n].p).slice(0, 5).map(x => x.id); Snd.play('conAdd', .8).then(ok => { if (!ok) Snd.click(); }); drawCon(); };
  $('#dosClear').onclick = () => { conSel = []; drawCon(); };
  const ts = $('#dosToSign'); if (ts) ts.onclick = () => { Snd.play('conSign', .85); conGo(2); };
  requestAnimationFrame(() => dosThread(true));
}
/* нитка: от булавки к булавке по заполненным уликам, с провисом и кручением; хвост свисает с последней.
   Новый отрезок натягивается анимацией */
let dosThreadN = 0, dosThreadRaf = 0;
function dosThread(animate) {
  const svg = $('#dosThreadSvg'); if (!svg) return;
  const host = svg.parentElement, box = host.getBoundingClientRect();
  const pinEls = $$('.dslot .pin', host);
  const readPins = () => { const b = host.getBoundingClientRect(); return pinEls.map(p => { const r = p.getBoundingClientRect(); return [r.left + r.width / 2 - b.left, r.top + r.height / 2 - b.top]; }); };
  let pins = readPins();
  const k = conItems().length;
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  const grow = animate && k > dosThreadN && k > 1;
  const body = cls => `<g class="${cls}"><path class="t-sh"/><path class="t-b"/><path class="t-tw"/><path class="t-hi"/></g>`;
  svg.innerHTML = body('t-main') + body('t-new') + body('t-tail') + pins.slice(0, Math.max(1, k)).map(([x, y]) => `<circle class="t-knot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/>`).join('');
  const G = n => $$('.' + n + ' path', svg), gMain = G('t-main'), gNew = G('t-new'), gTail = G('t-tail');
  const f = v => v.toFixed(1);
  // отрезок с провисом; ph — фаза покачивания
  const seg = (p, q, ph) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]), sag = Math.min(30, 8 + d * .06) * (1 + .18 * Math.sin(ph)), sw = 5 * Math.sin(ph * .7);
    return `Q${f((p[0] + q[0]) / 2 + sw)} ${f((p[1] + q[1]) / 2 + sag)} ${f(q[0])} ${f(q[1])}`; };
  const path = (arr, t) => arr.length < 2 ? '' : `M${f(arr[0][0])} ${f(arr[0][1])}` + arr.slice(1).map((q, i) => seg(arr[i], q, t * 1.3 + i * 1.7)).join('');
  const tailD = t => { if (k >= pins.length || !k) return ''; const [lx, ly] = pins[k - 1], nx = pins[k], ex = lx + (nx[0] - lx) * .55 + 6 * Math.sin(t * 1.1), ey = ly + (nx[1] - ly) * .55 + 46 + 4 * Math.sin(t * .9);
    return `M${f(lx)} ${f(ly)} C${f(lx + (ex - lx) * .2)} ${f(ly + 50)} ${f(ex - 22)} ${f(ey + 24)} ${f(ex)} ${f(ey)} q6 -4 9 -12`; };
  const set = (g, d) => g.forEach(p => p.setAttribute('d', d));
  let knots = [];
  const draw = t => {
    pins = readPins(); // булавки двигаются вместе с карточкой при наведении
    knots.forEach((c, i) => { c.setAttribute('cx', f(pins[i][0])); c.setAttribute('cy', f(pins[i][1])); });
    const base = grow ? pins.slice(0, k - 1) : pins.slice(0, k);
    set(gMain, path(base, t));
    if (grow) set(gNew, path([pins[k - 2], pins[k - 1]], t + (k - 2) * 1.3 / 1.3));
    set(gTail, tailD(t));
  };
  knots = $$('.t-knot', svg);
  draw(0);
  if (grow) {
    gNew.forEach(p => { if (p.classList.contains('t-b') || p.classList.contains('t-sh')) { const L = p.getTotalLength() + 20; p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p.style.animation = 'dosPull .55s cubic-bezier(.3,.7,.3,1) forwards'; } else { p.style.opacity = 0; p.style.animation = 'dosTw .3s ease .45s forwards'; } });
    svg.querySelector('.t-tail').classList.add('late');
  }
  dosThreadN = k;
  cancelAnimationFrame(dosThreadRaf);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, t0 = performance.now();
  let vis = true, lastT = 0, fastTill = 0;
  host.onpointerover = host.onpointerout = () => { fastTill = performance.now() + 500; };
  if (window.IntersectionObserver) new IntersectionObserver(en => { vis = en[0].isIntersecting; }).observe(svg);
  const loop = now => { if (!svg.isConnected) return; dosThreadRaf = requestAnimationFrame(loop); if (!vis || document.hidden || (now > fastTill && now - lastT < 33)) return; lastT = now; draw((now - t0) / 1000); };
  if (!reduce) dosThreadRaf = requestAnimationFrame(loop);
}
/* ---------- лист 02: соглашение и подпись ---------- */
const CON_CLAUSES = [
  ['Передача имущества', 'Владелец добровольно передаёт перечисленные в деле предметы в распоряжение Комиссии. <u>Переданные предметы не возвращаются</u> — ни целиком, ни по частям, ни «на пять минут посмотреть».'],
  ['Условия обратной выдачи', 'После закрытия дела Владелец получает один случайный скин стоимостью от 25% до 400% суммы контракта. Он может оказаться дороже, дешевле или выглядеть так, будто его трижды роняли с лестницы в архиве.'],
  ['Состояние имущества', 'Комиссия не гарантирует сохранение износа, наклеек, блеска и боевого духа. В случае претензий к качеству виновным назначается ближайший принтер.'],
  ['Непредвиденные обстоятельства', 'Выпадение не того цвета, внезапная ностальгия и фраза «надо было оставить старый скин» не являются основанием для отмены контракта.'],
  ['Окончательное решение', 'Подписывая документ, Владелец подтверждает, что понимает: <u>результат случаен и не является гарантированной прибылью</u>. Комиссия сохраняет за собой право выглядеть загадочно.'],
];
function drawConAgreement(desk) {
  const items = conItems(), sum = items.reduce((a, x) => a + SK[x.n].p, 0), nick = st.user ? st.user.name : '';
  desk.innerHTML = `<div class="dos-grid wide">
    <article class="dpaper dos-agr"><i class="coffee" aria-hidden="true"></i>
      <header class="dp-head"><span>Лист 02 / договор о передаче виртуального имущества</span><em>${conNo()} · экземпляр 1/1</em></header>
      <div class="dos-agr-b">
        <h2>Соглашение о перемещении<br>виртуального имущества</h2>
        <div class="dos-agr-s">Составлено комиссией по необъяснимому обмену</div>
        <p class="dos-pre">Настоящий документ заключён между Владельцем скинов (далее — «Сдающая сторона») и Комиссией сомнительных совпадений (далее — «Сторона, которая всё отрицает»).</p>
        ${CON_CLAUSES.map(([t, p], i) => `<div class="dcl"><b>§ ${String(i + 1).padStart(2, '0')}</b><p><strong>${t}.</strong> ${p}</p></div>`).join('')}
        <div class="dos-items"><span>Предметы дела (${items.length})</span><div>${items.map(x => { const s = SK[x.n]; return `<i class="r-${s.r}" title="${dosEsc(s.name)} — ${money(s.p)}"><img src="${imgUrl(s, 's')}" alt=""></i>`; }).join('')}</div><b>${money(sum)}</b></div>
        <div class="dos-warn">Это шуточный внутриигровой документ. Контракт относится только к внутриигровым предметам сайта RUSH CASE.</div>
      </div>
    </article>
    <aside class="dpaper dos-sign${conSigned ? ' signed' : ''}" id="dosSign">
      <header class="dp-head"><span>Подписной лист</span><em>Форма 7-Б</em></header>
      <div class="dseal"><span>♛</span><b>RUSH CASE<br>ARCHIVE</b></div>
      <div class="dsc">
        <label for="dosNick">Подпись / игровой ник</label>
        <input id="dosNick" class="dinp" maxlength="24" value="${dosEsc(nick)}" placeholder="Ваш ник…" ${conSigned ? 'disabled' : ''}>
        <div class="dsig"><span>Подпись владельца</span>
          <div class="dpad" id="dosPadWrap"><canvas id="dosPad"></canvas><em class="dpad-hint">Распишитесь здесь</em>
            <button class="dpad-clr" id="dosPadClr" title="Стереть">Стереть</button>
</div></div>
        <div class="ddate"><span>Дата контракта</span><b id="dosDate">${conSigned ? conCase.date : 'не заполнено'}</b></div>
      </div>
      <div class="dsigned">✓ Дело подписано и внесено в архив. Отменить подпись нельзя — таково требование загадочной комиссии.</div>
      <div class="dsc">
        <button class="dbtn red" id="dosDoSign" disabled>✒ Забрать дроп</button>
        <div class="dreg">Реестр: <b>${conSigned ? 'подписано / зарегистрировано' : 'ожидает подписи'}</b><br>Предметов в деле: <b>${items.length}</b><br>Общая стоимость: <b>${money(sum)}</b></div>
      </div>
    </aside>
  </div>
  <div class="dos-nav"><button class="dbtn dark" id="dosBack">← Вернуться к уликам</button></div>`;
  $('#dosBack').onclick = () => { if (conSigned) return toast('Подписанное дело больше нельзя редактировать', 'err'); conGo(1); };
  dosPad();
  const sg = $('#dosDoSign'); if (sg) sg.onclick = () => {
    if (!st.user) return openAuth('login');
    if (conBusy) return;
    const nickV = ($('#dosNick').value.trim() || st.user.name).slice(0, 24), d = new Date();
    conCase = { nick: nickV, date: d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), sig: dosSigCrop($('#dosPad')) };
    conSigned = true; conBusy = true;
    const pad = $('#dosPadWrap'); pad.classList.add('done');
    const p = $('#dosSign'); p.classList.add('signed', 'stamp-anim');
    $('#dosDate').textContent = conCase.date; $('#dosNick').disabled = true;
    sg.disabled = true; sg.innerHTML = '<span class="spinner"></span>Комиссия заверяет дело…';
    // синяя печать на подпись → протокол
    setTimeout(() => {
      if (!$('#dosPadWrap')) { conBusy = false; return; }
      pad.insertAdjacentHTML('beforeend', DOS_BLUE);
      Snd.play('conStamp', 1).then(ok => { if (!ok) { Snd.noise(.06, .7, 0, 900, 1); Snd.tone(110, .18, 'sine', .4, 0, 60); } });
      // пауза-интрига: комиссия «рассматривает» дело
      const steps = ['Комиссия заверяет дело…', 'Сверяем улики…', 'Выносим решение…'];
      steps.forEach((t, i) => setTimeout(() => { if (sg.isConnected) sg.innerHTML = '<span class="spinner"></span>' + t; }, 600 + i * 900));
      pad.classList.add('judging');
      [900, 1500, 2050, 2500, 2850].forEach((ms, i) => setTimeout(() => { if ($('#dosPadWrap')) Snd.heart(.3 + i * .08); }, ms));
      setTimeout(() => { conBusy = false; runContract(); }, 3200);
    }, 250);
  };
}
/* 3D-ручка (перьевая): корпус, золотые кольца, перо; кончик пера — в левом нижнем углу */
/* ручка-курсор 48×48: тёмное перо, кончик в точке (2,46); при нажатии наклоняется сильнее */
const dosPenSvg = deg => `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><defs>
  <linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="#2a2f3d"/><stop offset=".45" stop-color="#0c0e14"/><stop offset="1" stop-color="#05060a"/></linearGradient>
  <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#5a4214"/><stop offset=".5" stop-color="#b08a3e"/><stop offset="1" stop-color="#4a3510"/></linearGradient></defs>
  <g transform="translate(2 46) rotate(${deg})">
  <path d="M0 0 L-2.6 -9.5 L2.6 -9.5 Z" fill="url(#g)" stroke="#2a1d06" stroke-width=".5"/><path d="M0 -.6 V-7" stroke="#1a1204" stroke-width=".6"/>
  <rect x="-3" y="-15.5" width="6" height="6.2" rx="1" fill="#07080c"/><rect x="-3.4" y="-17" width="6.8" height="1.6" fill="url(#g)"/>
  <rect x="-3.7" y="-52" width="7.4" height="35.5" rx="3" fill="url(#b)" stroke="rgba(255,255,255,.28)" stroke-width=".5"/>
  <rect x="-2.3" y="-49" width="1.1" height="29" rx=".55" fill="rgba(255,255,255,.22)"/>
  <rect x="-3.7" y="-34" width="7.4" height="1.4" fill="url(#g)"/>
  <path d="M3.7 -50 h1.2 v17 q0 2 -1.2 2 z" fill="url(#g)"/></g></svg>`;
const dosPenCur = deg => `url("data:image/svg+xml,${encodeURIComponent(dosPenSvg(deg))}") 2 46, crosshair`;
/* синяя печать: двойное кольцо, текст по кругу, в центре RUSH CASE */
const DOS_BLUE = `<div class="dblue2"><svg viewBox="0 0 200 200"><defs><path id="dbArc" d="M100 100 m-74 0 a74 74 0 1 1 148 0 a74 74 0 1 1 -148 0"/></defs>
  <circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="100" cy="100" r="86" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <circle cx="100" cy="100" r="58" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text font-family="Unbounded,Arial Black,sans-serif" font-weight="800" font-size="12.5" fill="currentColor"><textPath href="#dbArc" startOffset="0" textLength="458" lengthAdjust="spacing">УТВЕРЖДЕНО · RUSH CASE · АРХИВ · ★ ·</textPath></text>
  <text x="100" y="82" text-anchor="middle" font-size="18" fill="currentColor">♛</text>
  <text x="100" y="106" text-anchor="middle" font-family="Unbounded,Arial Black,sans-serif" font-weight="900" font-size="21" fill="currentColor">RUSH</text>
  <text x="100" y="128" text-anchor="middle" font-family="Unbounded,Arial Black,sans-serif" font-weight="900" font-size="21" fill="currentColor">CASE</text>
  <text x="100" y="146" text-anchor="middle" font-size="9" letter-spacing="3" fill="currentColor">★ ★ ★</text></svg></div>`;
/* холст подписи: чернила с нажимом по скорости, ручка следует за курсором и опускается при касании */
function dosPad() {
  const wrap = $('#dosPadWrap'), cv = $('#dosPad'); if (!cv) return;
  const btn = $('#dosDoSign'), curUp = dosPenCur(45), curDn = dosPenCur(52);
  cv.style.cursor = curUp;
  const fit = () => { const r = wrap.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return x; };
  let x = fit(), down = false, last = null, ink = 0, lw = 2.4;
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const movePen = (p, pressed) => { const c = wrap.classList.contains('done') ? 'default' : pressed ? curDn : curUp; if (cv.style.cursor !== c) cv.style.cursor = c; };
  cv.addEventListener('pointerenter', () => wrap.classList.add('hov'));
  cv.addEventListener('pointerleave', () => { wrap.classList.remove('hov'); down = false; last = null; });
  cv.addEventListener('pointerdown', e => { if (wrap.classList.contains('done')) return; cv.setPointerCapture(e.pointerId); down = true; last = pos(e); wrap.classList.add('inked'); movePen(last, true); });
  cv.addEventListener('pointerup', () => { down = false; last = null; movePen(pos(event), false); Snd.penStop(); });
  cv.addEventListener('pointermove', e => {
    const p = pos(e); movePen(p, down);
    if (!down || !last || wrap.classList.contains('done')) return;
    const d = Math.hypot(p[0] - last[0], p[1] - last[1]); if (d < .8) return;
    const w = Math.max(1.1, Math.min(3.4, 3.6 - d * .12)); lw += (w - lw) * .35; // быстрее — тоньше
    x.strokeStyle = '#13285a'; x.lineCap = x.lineJoin = 'round'; x.lineWidth = lw; x.globalAlpha = .92;
    x.beginPath(); x.moveTo(last[0], last[1]); x.quadraticCurveTo(last[0], last[1], (last[0] + p[0]) / 2, (last[1] + p[1]) / 2); x.lineTo(p[0], p[1]); x.stroke();
    ink += d; last = p;
    Snd.pen(Math.min(1, d / 14));
    if (ink > 90 && btn && btn.disabled && !wrap.classList.contains('done')) { btn.disabled = false; btn.classList.add('ready'); }
  });
  $('#dosPadClr').onclick = () => { if (wrap.classList.contains('done')) return; x.clearRect(0, 0, cv.width, cv.height); ink = 0; wrap.classList.remove('inked'); if (btn) { btn.disabled = true; btn.classList.remove('ready'); } };
}

// подпись с холста: обрезаем пустые поля по краям чернил
function dosSigCrop(cv) {
  try {
    const x = cv.getContext('2d'), { width: W, height: H } = cv, d = x.getImageData(0, 0, W, H).data;
    let l = W, t = H, r = -1, b = -1;
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) if (d[(y * W + i) * 4 + 3] > 20) { if (i < l) l = i; if (i > r) r = i; if (y < t) t = y; if (y > b) b = y; }
    if (r < 0) return '';
    const pad = 6; l = Math.max(0, l - pad); t = Math.max(0, t - pad); r = Math.min(W - 1, r + pad); b = Math.min(H - 1, b + pad);
    const o = document.createElement('canvas'); o.width = r - l + 1; o.height = b - t + 1; o.getContext('2d').drawImage(cv, l, t, o.width, o.height, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  } catch (e) { return ''; }
}
function conSigSvg(name, anim) {
  return `<svg viewBox="0 0 320 82" class="${anim ? 'anim' : ''}" role="img" aria-label="Подпись: ${dosEsc(name)}"><g transform="translate(150 4) scale(.53)"><path class="ss" d="M8 49 C18 8 27 8 23 40 S12 59 34 35 C44 22 45 56 54 47 S68 18 72 39 C76 61 86 49 95 34 C106 13 108 52 117 45 S132 30 137 40 C145 57 157 43 164 35 C178 17 176 53 190 45 S207 27 211 39 C220 57 229 44 239 37"/><path class="ss fl" d="M10 62 C68 70 117 58 161 62 S247 68 293 42 C306 35 309 48 295 53 C271 61 259 57 251 52"/><path class="ss fl" d="M237 35 C252 16 265 14 273 23 S266 42 257 33 C249 23 270 12 285 20"/><circle class="sd" cx="292" cy="20" r="3.4"/></g><text class="sn" x="4" y="52" textLength="${Math.min(160, 14 + name.length * 13)}" lengthAdjust="spacingAndGlyphs">${dosEsc(name)}</text></svg>`;
}
/* ---------- закрытие дела: настоящий контракт ---------- */
async function runContract() {
  if (conBusy) return;
  if (!st.user) return openAuth('login');
  const items = conItems(); if (items.length < 3) return toast('Добавьте минимум 3 предмета', 'err');
  if (items.some(x => x.st !== 'own')) { conSel = []; conSigned = false; conStep = 1; drawCon(); return toast('Часть предметов уже недоступна — соберите дело заново', 'err'); }
  const caseNo = conNo(), given = items.map(x => SK[x.n]);
  conBusy = true;
  // результат решает сервер: забирает предметы, выдаёт скин
  const r = await srv('contract', { p_ids: items.map(x => x.id) });
  if (!r || !SK[r.n]) { conBusy = false; conSel = []; conSigned = false; conCase = null; conStep = 1; drawCon(); return; }
  const res = SK[r.n], got = { id: r.id }, sum = +r.sum;
  const b = $('#dosClose'); if (b) { b.disabled = true; b.innerHTML = '<span class="spinner"></span>Комиссия рассматривает дело…'; }
  const pre = new Image(); pre.src = imgUrl(res, 'l');
  await Promise.race([pre.decode().catch(() => {}), sleep(900)]);
  conRes = { no: caseNo, s: SK[res.name], id: got.id, sum, n: items.length, given, code: 'RC-' + String(Math.floor(100 + Math.random() * 899)), nick: conCase ? conCase.nick : st.user.name, date: conCase ? conCase.date : '', sig: conCase ? conCase.sig : '' };
  conSel = []; conSigned = false; conCase = null; conBusy = false; dosOpenShown = false;
  liveMine({ n: res.name, t: 'con', x: res.p / sum });
  if (!$('#dosDesk')) return;
  conStep = 3; drawCon();
  const s = conRes.s; Snd.win(RAR[s.r].o); if (RAR[s.r].o >= 5 || s.p > sum * 1.5) burst();
}
/* ---------- лист 03: протокол выдачи ---------- */
function drawConProtocol(desk) {
  const R = conRes, s = R.s, x = s.p / R.sum, it = st.inv.find(z => z.id === R.id), own_ = it && it.st === 'own';
  desk.innerHTML = `<div class="dos-grid">
    <article class="dpaper dos-prot">
      <header class="dp-head"><span>Лист 03 / протокол выдачи</span><em>${R.no} · архивный экземпляр</em></header>
      <div class="dos-prot-b">
        <div class="dst big">Дело закрыто</div>
        <h2>Протокол<br>выданного дропа</h2>
        <div class="dos-prot-s">Результат обработки контракта · не для публикации</div>
        <div class="dreward r-${s.r}">
          <div class="drw-art"><i></i><img src="${imgUrl(s, 'l')}" alt=""></div>
          <div class="drw-t">
            <div class="drw-m">Объект получения / № ${R.code}</div>
            <div class="drw-n"><span>${dosEsc(s.w)}</span>${dosEsc(s.f)}</div>
            <div class="drw-m">Класс предмета: ${RAR[s.r] ? RAR[s.r].n : '—'}</div>
            <div class="drw-p">${money(s.p)} <em class="${x >= 1 ? 'up' : 'dn'}">×${x.toFixed(2)}</em></div>
          </div>
        </div>
        <p class="dnote">Заключение эксперта: объект выдан владельцу по результатам обмена и уже лежит в его профиле. Все совпадения с удачей являются подозрительными.</p>
        <div class="dst">Выдано владельцу</div>
        <div class="dprot-sig">Подпись владельца: ${R.sig ? `<img class="dprot-sigimg" src="${R.sig}" alt="Подпись ${dosEsc(R.nick)}" title="${dosEsc(R.nick)}">` : `<b>${dosEsc(R.nick)}</b>`}<br>Место хранения: архив RUSH CASE / сектор ${R.code.slice(3)}</div>
        <div class="dos-prot-a">
          ${own_ ? `<button class="dbtn upg" id="dosUpg">${ic.up}В апгрейд</button><button class="dbtn dark" id="dosSell">${ic.coin}Продать за ${money(s.p)}</button>` : `<div class="dnote">Предмет уже ${it && it.st === 'sold' ? 'продан' : 'использован'}.</div>`}
          <button class="dbtn gold" id="dosNew">Новое дело ↻</button>
        </div>
      </div>
    </article>
    <aside class="dos-side">
      <section class="dpaper dos-slip"><i class="clip" aria-hidden="true"></i><h3>Выписка из реестра</h3>
        <div class="dm"><span>Номер дела</span><b>${R.no}</b></div>
        <div class="dm"><span>Предметов передано</span><b>${R.n}</b></div>
        <div class="dm"><span>Сумма контракта</span><b>${money(R.sum)}</b></div>
        <div class="dm"><span>Получено</span><b class="${x >= 1 ? 'g' : 'r'}">${money(s.p)}</b></div>
        <div class="dm"><span>Статус</span><b>Завершён</b></div>
        <div class="dseal sm"><span>♛</span><b>RUSH CASE<br>АРХИВ</b></div>
      </section>
      <section class="dos-note"><i class="tape"></i><h4>Заметка следователя</h4>
        <p>«Пять минут назад это были улики. Теперь — один предмет и множество вопросов. Архив считает дело закрытым. Архив всегда так считает».</p></section>
    </aside>
  </div>`;
  const newCase = () => { conRes = null; conStep = 1; drawCon(); };
  $('#dosNew').onclick = newCase;
  const sl = $('#dosSell'); if (sl) sl.onclick = async () => { sl.disabled = true; await sellItem(R.id); drawCon(); };
  const up = $('#dosUpg'); if (up) up.onclick = () => { upg.sel = [R.id]; upg.bal = 0; upg.to = null; upg.mult = 0; upg.autoX2 = true; conRes = null; conStep = 1; location.hash = '#/upgrade'; };
}

/* =========================================================
   BONUS
   ========================================================= */
const DAILY = [{ v: 5, w: 30, r: 'milspec' }, { v: 10, w: 26, r: 'milspec' }, { v: 15, w: 18, r: 'restricted' }, { v: 25, w: 12, r: 'restricted' }, { v: 50, w: 8, r: 'classified' }, { v: 100, w: 4.5, r: 'covert' }, { v: 250, w: 1.5, r: 'rare' }];
const DAILY_MS = 24 * 3600 * 1000;
const dailyLeft = () => Math.max(0, (st.daily || 0) + DAILY_MS - Date.now());
const dailyText = () => { const s = Math.ceil(dailyLeft() / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
/* промокоды проверяет сервер (таблица promo_codes) — на сайте список не нужен */
// u — ссылка на соцсеть: если указана, «Подписаться» открывает её в новой вкладке
const SOCIALS = [{ k: 'tg', n: 'Telegram-канал', i: 'tg', c: '#2aabee', u: '' }, { k: 'vk', n: 'Группа ВКонтакте', i: 'vk', c: '#2787f5', u: '' }, { k: 'yt', n: 'YouTube-канал', i: 'yt', c: '#ff3b3b', u: '' }];
const SOC_BONUS = 10;
const bonusReady = () => (st.user && !dailyLeft() ? 1 : 0) + SOCIALS.filter(x => !(st.socials || []).includes(x.k)).length;
function pageBonus() {
  const rk = rankOf(st.stats.spent);
  const dw = DAILY.reduce((a, d) => a + d.w, 0);
  return `<section class="container bonus bn">
    <div class="page-head bn-head"><div><h1>Бонусы</h1><p>Бесплатный баланс каждый день, промокоды и награды за подписки.</p></div><div class="bn-ready" id="bnReady"></div></div>
    <div class="bn-grid">
      <article class="bn-card bn-daily">
        <header class="bn-h"><span class="bn-ic gold">${ic.gift}</span><div><h3>Ежедневный бонус</h3><p>Раз в 24 часа — от 5 до 250 ₽ на баланс</p></div></header>
        <div class="daily-reel bn-reel"><div class="strip" id="dailyStrip"><div class="track">${Array.from({ length: 12 }, () => coinCard(pickDaily())).join('')}</div></div><div class="rl-marker"></div></div>
        <div class="bn-act">
          <button class="btn btn-primary btn-xl" id="dailyBtn">${ic.gift}<span>Крутить барабан</span></button>
          <div class="bn-timer" id="dailyTimer"><div class="bn-tt"><span id="dailyLbl"></span><b id="dailyVal"></b></div><div class="bn-bar"><i id="dailyBar"></i></div></div>
        </div>
        <div class="bn-odds-h">Шансы</div>
        <div class="bn-odds">${DAILY.map(d => `<div class="bn-odd r-${d.r}"><b>${d.v} ₽</b><span>${(d.w / dw * 100).toFixed(1).replace('.', ',')}%</span><i style="width:${Math.max(6, d.w / DAILY[0].w * 100)}%"></i></div>`).join('')}</div>
        <div class="bn-facts"><div><span>Главный приз</span><b>250 ₽</b></div><div><span>В среднем</span><b>≈ ${money(Math.round(DAILY.reduce((t, d) => t + d.v * d.w, 0) / dw))}</b></div><div><span>Обновление</span><b>каждые 24 ч</b></div></div>
      </article>
      <div class="bn-side">
        <article class="bn-card bn-promo">
          <header class="bn-h"><span class="bn-ic">${ic.star}</span><div><h3>Промокод</h3><p>Бонус на баланс или к пополнению</p></div></header>
          <div class="bn-ticket"><input id="promoInp" placeholder="ВВЕДИТЕ КОД" autocomplete="off" spellcheck="false" maxlength="24"><button class="btn btn-primary" id="promoBtn">Активировать</button></div>
          <div class="bn-used" id="promoUsed"></div>
          <p class="bn-note">Промокоды выдаём в Telegram, ВКонтакте и на стримах партнёров.</p>
        </article>
        <article class="bn-card bn-soc">
          <header class="bn-h"><span class="bn-ic">${ic.send}</span><div><h3>Подписки</h3><p>+${SOC_BONUS} ₽ на баланс за каждую соцсеть</p></div></header>
          <div class="bn-prog"><div><span id="socCnt"></span><b id="socSum"></b></div><div class="bn-bar"><i id="socBar"></i></div></div>
          <div class="bn-socs" id="socList"></div>
        </article>
      </div>
    </div>
    <article class="bn-card bn-ref">
      <span class="bn-ic">${ic.users}</span>
      <div><h3>Пригласи друга <em class="bn-soon">Скоро</em></h3><p>Реферальная программа: 5% от пополнений друзей вам, +50 ₽ другу при регистрации. Запустим вместе с онлайн-оплатой.</p></div>
    </article>
    ${secTitle('Ранги')}
    <div class="ranks">${RANKS.map((r, i) => `<div class="rank${i === rk.i && st.user ? ' cur' : ''}${i > rk.i ? ' locked' : ''}">${rankIcon(r, i)}<h4>${r.n}</h4><small>от ${money(r.min)} в кейсах</small><span class="cb">${r.cb ? 'Кэшбэк ' + r.cb + '%' : 'Старт'}</span></div>`).join('')}</div>
  </section>`;
}
function pickDaily() { const t = DAILY.reduce((a, d) => a + d.w, 0); let r = Math.random() * t; for (const d of DAILY) { r -= d.w; if (r <= 0) return d; } return DAILY[0]; }
const coinCard = (d, win) => `<div class="coin-card r-${d.r}${win ? ' is-win' : ''}"><span class="coin">₽</span><b>${d.v} ₽</b></div>`;
function mountBonus() {
  const btn = $('#dailyBtn');
  const ready = () => { const n = bonusReady(), e = $('#bnReady'); if (!e) return; e.innerHTML = n ? `<i></i>Доступно сейчас: <b>${n}</b>` : `${ic.check}Всё собрано — заходите завтра`; e.classList.toggle('all', !n); };
  const upd = () => {
    if (!btn.isConnected) return;
    const left = st.user ? dailyLeft() : 0;
    $('#dailyBar').style.width = (left ? (1 - left / DAILY_MS) * 100 : 100).toFixed(2) + '%';
    $('#dailyTimer').classList.toggle('on', !left);
    $('#dailyLbl').textContent = left ? 'Следующий через' : 'Бонус доступен';
    $('#dailyVal').textContent = left ? dailyText() : 'сейчас';
    if (btn.dataset.busy) return;
    btn.disabled = !!left;
    $('span', btn).textContent = !st.user ? 'Войти и крутить' : left ? 'Уже получен сегодня' : 'Крутить барабан';
    ready();
  };
  upd(); every(upd, 1000);
  btn.onclick = async () => {
    if (!st.user) return openAuth('reg');
    if (dailyLeft()) return;
    btn.dataset.busy = '1'; btn.disabled = true; $('span', btn).textContent = 'Крутим…';
    const bal0 = st.balance, r = await srv('claim_daily');
    if (!r) { delete btn.dataset.busy; upd(); return; }
    const prize = DAILY.find(d => d.v === +r.v) || DAILY[0];
    setBalance(bal0); // показываем прибавку после прокрутки
    const strip = $('#dailyStrip');
    strip.classList.remove('done');
    strip.innerHTML = `<div class="track">${Array.from({ length: 40 }, (_, i) => coinCard(i === 34 ? prize : pickDaily(), i === 34)).join('')}</div>`;
    await sleep(50);
    await spinStrip(strip, 4200, true);
    setBalance(bal0 + prize.v);
    Snd.win(RAR[prize.r].o); Snd.coin(); if (prize.v >= 100) burst();
    toast(`Ежедневный бонус: <b>+${money(prize.v)}</b>`);
    delete btn.dataset.busy; upd();
  };
  // промокоды — проверяет сервер
  const inp = $('#promoInp'), pbtn = $('#promoBtn');
  const drawUsed = () => { const u = st.user ? st.promos || [] : []; $('#promoUsed').innerHTML = u.length ? `<span>Активированы:</span>${u.map(c => `<em>${ic.check}${esc(c)}</em>`).join('')}` : ''; };
  inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/\s+/g, ''); inp.parentElement.classList.remove('err', 'ok'); };
  inp.onkeydown = e => { if (e.key === 'Enter') pbtn.click(); };
  pbtn.onclick = async () => {
    if (!st.user) return openAuth('login');
    const code = inp.value.trim().toUpperCase(), box = inp.parentElement;
    if (!code) { box.classList.add('err'); return inp.focus(); }
    pbtn.disabled = true; pbtn.innerHTML = '<span class="spinner"></span>';
    const r = await srv('use_promo', { p_code: code });
    pbtn.disabled = false; pbtn.textContent = 'Активировать';
    if (!r) { box.classList.add('err'); return; }
    box.classList.add('ok'); inp.value = '';
    if (r.t === 'bal') { Snd.coin(); toast(`Промокод активирован: <b>+${money(+r.v)}</b>`); } else toast(`Бонус <b>+${r.v}%</b> применится к следующему пополнению`);
    drawUsed(); ready();
  };
  drawUsed();
  // соцсети
  const drawSoc = () => {
    const got = SOCIALS.filter(x => (st.socials || []).includes(x.k)).length;
    $('#socCnt').textContent = `Выполнено ${got} из ${SOCIALS.length}`;
    $('#socSum').textContent = `+${got * SOC_BONUS} из ${SOCIALS.length * SOC_BONUS} ₽`;
    $('#socBar').style.width = (got / SOCIALS.length * 100) + '%';
    $('#socList').innerHTML = SOCIALS.map(s => { const ok = (st.socials || []).includes(s.k); return `<div class="bn-s${ok ? ' ok' : ''}" style="--c:${s.c}"><span class="bn-si">${ic[s.i]}</span><div><b>${s.n}</b><small>+${SOC_BONUS} ₽ на баланс</small></div>${ok ? `<span class="bn-done">${ic.check}Получено</span>` : `<button class="btn btn-dark btn-sm" data-soc="${s.k}">Подписаться</button>`}</div>`; }).join('');
    $$('[data-soc]').forEach(b => b.onclick = async () => {
      if (!st.user) return openAuth('login');
      if (b.dataset.state === 'check') return;
      if (!b.dataset.state) {
        const s = SOCIALS.find(x => x.k === b.dataset.soc); if (s.u) window.open(s.u, '_blank', 'noopener');
        b.dataset.state = 'sub'; b.textContent = 'Проверить'; b.classList.replace('btn-dark', 'btn-primary'); return toast('Подпишитесь и нажмите «Проверить»', 'info');
      }
      b.dataset.state = 'check'; b.innerHTML = '<span class="spinner"></span>';
      await sleep(1300);
      const r = await srv('claim_social', { p_k: b.dataset.soc }); if (r) { Snd.coin(); toast(`Подписка подтверждена: <b>+${SOC_BONUS} ₽</b>`); }
      if ($('#socList')) { drawSoc(); ready(); }
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
    <div class="pf-hero" style="--rk1:${rk.cur.c[0]};--rk2:${rk.cur.c[1]}">
      <span class="pfh-wm" aria-hidden="true">${rk.cur.n}</span>
      <div class="pfh-main">
        <div class="pfh-ava">${ava(u, 'xl')}<span class="pfh-rk" title="Ранг ${rk.cur.n}">${rankIcon(rk.cur, rk.i)}</span></div>
        <div class="pfh-info">
          <h1>${esc(u.name)}</h1>
          <div class="pfh-chips">
            <button class="pfh-chip" data-act="copy" data-copy="${u.pid || u.rid || u.id}" title="Скопировать ID">ID ${u.pid || u.rid || u.id}${ic.copy}</button>
            <span class="pfh-chip">${u.via === 'steam' ? ic.steam + 'Steam' : ic.user + esc(u.email || '')}</span>
            <span class="pfh-chip">${ic.clock}с ${new Date(u.reg).toLocaleDateString('ru-RU')}</span>
          </div>
          <div class="pfh-rank">
            <div class="pfr-top"><span class="pfr-cur">${rankIcon(rk.cur, rk.i)}<b>${rk.cur.n}</b></span>
              <span class="pfr-pct">${Math.round(rk.pct)}%</span>
              ${rk.next ? `<span class="pfr-next"><b>${rk.next.n}</b>${rankIcon(rk.next, rk.i + 1)}</span>` : '<span class="pfr-next"><b>Максимум</b></span>'}</div>
            <div class="pfr-bar"><i style="width:${rk.pct}%"></i></div>
            <div class="pfr-sub">${rk.next ? `Откройте кейсов ещё на <b>${money(rk.left)}</b>, чтобы получить «${rk.next.n}»${rk.next.cb ? ` и кэшбэк ${rk.next.cb}%` : ''}` : 'Вы достигли максимального ранга'}</div>
          </div>
        </div>
        <div class="pfh-wallet">
          <div class="pfw-bal"><span>Баланс</span><b>${money(st.balance)}</b></div>
          <div class="pfw-rc"><img class="rc-ic" src="assets/rcoin.webp" alt=""><span>R-COIN</span><b>${rc(st.rcoin || 0)}</b></div>
          <div class="pfw-btns"><button class="btn btn-primary" data-act="deposit">${ic.plus}Пополнить</button><button class="btn btn-dark" data-act="logout" title="Выйти" aria-label="Выйти">${ic.logout}</button></div>
        </div>
      </div>
      <div class="pfh-stats">
        <div><span>${ic.box}Кейсов открыто</span><b>${fmt(st.stats.opened)}</b></div>
        <div><span>${ic.coins}Потрачено на кейсы</span><b>${money(st.stats.spent)}</b></div>
        <div><span>${ic.gem}Инвентарь</span><b>${own().length} · ${money(own().reduce((t, x) => t + SK[x.n].p, 0))}</b></div>
        <div class="pfh-best r-${best ? best.r : 'milspec'}"><span>${ic.trophy}Лучший дроп</span>${best ? `<b><img src="${imgUrl(best, 's')}" alt="">${money(best.p)}</b>` : '<b>—</b>'}</div>
      </div>
    </div>
    <div class="tabs-row"><div class="seg pf-seg" id="pfTabs"><button data-tab="inv">${ic.box}Инвентарь<b id="invCnt"></b></button><button data-tab="stats">${ic.trend}Статистика</button><button data-tab="rc"><img class="rc-ic" src="assets/rcoin.webp" alt="">R-COIN</button><button data-tab="hist">${ic.history}История</button><button data-tab="team">${ic.users}Команда</button></div><div class="sum" id="invSum"></div></div>
    <div id="pfBody"></div>
  </section>`;
}
function mountProfile(sub) {
  if (!st.user) return;
  if (sub) pfTab = sub; // #/profile/team — сразу вкладка «Команда»
  $$('#pfTabs button').forEach(b => b.onclick = () => { pfTab = b.dataset.tab; drawPf(); });
  drawPf();
}
/* пустые карточки: дорисовываем до полных рядов (минимум 3 ряда) — по фактическому числу колонок сетки */
function invFill() {
  const g = $('#invGrid'); if (!g) return;
  $$('.inv-empty-card', g).forEach(x => x.remove());
  const cols = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  const n = $$('.inv-card', g).length, total = Math.max(cols * 3, Math.ceil(n / cols) * cols);
  g.insertAdjacentHTML('beforeend', Array.from({ length: total - n }, () => `<div class="icard inv-empty-card" aria-hidden="true"><span>${ic.box}</span></div>`).join(''));
}
window.addEventListener('resize', () => { if ($('#invGrid')) invFill(); });
const dstr = ts => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function drawPf() {
  const body = $('#pfBody'); if (!body) return;
  $$('#pfTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === pfTab));
  const list = own(), sum = list.reduce((a, x) => a + SK[x.n].p, 0);
  $('#invCnt').textContent = list.length;
  $('#invSum').innerHTML = '';
  if (pfTab === 'team') return drawTeamTab(body);
  if (pfTab === 'inv') {
    $('#invSum').innerHTML = list.length ? `Стоимость: <b>${money(sum)}</b> &nbsp;<button class="btn btn-accent btn-sm" id="sellAllInv">${ic.coin}Продать всё</button>` : '';
    const sorted = list.slice().sort((a, b) => SK[b.n].p - SK[a.n].p);
    body.innerHTML = `<div class="pf-trade inv-trade">
        <div class="t"><span class="tr-ic">${ic.steam}</span><span>Трейд-ссылка Steam<small>Нужна для вывода скинов. <a href="https://steamcommunity.com/my/tradeoffers/privacy#trade_offer_access_url" target="_blank" rel="noopener">Где её взять?</a></small></span></div>
        <div class="inp-row"><input class="inp" id="tradeInp" placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…" value="${esc(st.trade)}"><button class="btn btn-accent" id="tradeSave">Сохранить</button></div>
      </div>
      <div class="items-grid inv-grid" id="invGrid">${sorted.map(x => {
        const s = SK[x.n];
        return `<div class="icard inv-card r-${s.r}"><span class="ic-st">${fromName(x.from)}</span><img src="${imgUrl(s, 'm')}" alt="" loading="lazy"><div class="ic-w">${esc(s.w)}</div><div class="ic-f">${esc(s.f)}</div><div class="ic-p">${money(s.p)}</div>
          <div class="inv-acts"><button class="btn btn-accent" data-sell="${x.id}">Продать</button><button class="btn btn-dark" data-wd="${x.id}" title="Вывести в Steam">${ic.send}</button></div></div>`;
      }).join('')}</div>${list.length ? '' : '<p class="inv-hint">Инвентарь пуст — выпавшие предметы займут эти места. <a href="#/cases">Открыть кейс</a></p>'}`;
    invFill();
    $('#tradeSave').onclick = () => {
      const v = $('#tradeInp').value.trim();
      if (!/^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[\w-]+$/.test(v)) { $('#tradeInp').classList.add('err'); return toast('Неверный формат трейд-ссылки', 'err'); }
      $('#tradeInp').classList.remove('err'); srv('save_trade', { p_trade: v }).then(r => { if (r) toast('Трейд-ссылка сохранена'); });
    };
    const sa = $('#sellAllInv');
    if (sa) sa.onclick = () => {
      const items = own(), total = items.reduce((a, x) => a + SK[x.n].p, 0);
      const m = modal(`<div class="wd confirm"><h2>Продать всё?</h2><p>${items.length} ${plural(items.length, 'предмет', 'предмета', 'предметов')} на сумму <b>${money(total)}</b> будут проданы, деньги придут на баланс. Отменить это действие нельзя.</p>
        <div class="cc-btns"><button class="btn btn-dark btn-lg" id="cfNo">Отмена</button><button class="btn btn-primary btn-lg" id="cfYes">${ic.coin}Подтвердить</button></div></div>`, 'm-wd');
      $('#cfNo', m).onclick = closeModal;
      $('#cfYes', m).onclick = async () => { closeModal(); const t = await sellItems(own().map(x => x.id), true); if (t) { Snd.coin(); toast(`Продано на <b>+${money(t)}</b>`); } drawPf(); };
    };
    $$('[data-sell]', body).forEach(b => b.onclick = async () => { b.disabled = true; await sellItem(b.dataset.sell); drawPf(); });
    $$('[data-wd]', body).forEach(b => b.onclick = () => withdraw(b.dataset.wd));
  } else if (pfTab === 'stats') {
    const S = st.stats, all = st.inv.filter(x => SK[x.n]), val = x => SK[x.n].p;
    const by = k => all.filter(x => x.st === k), sumOf = a => a.reduce((t, x) => t + val(x), 0);
    const fromCases = all.filter(x => caseById(x.from)), dropSum = sumOf(fromCases);
    const best = S.best && SK[S.best], rk = rankOf(S.spent);
    const perCase = {}; fromCases.forEach(x => { const c = perCase[x.from] = perCase[x.from] || { n: 0, v: 0 }; c.n++; c.v += val(x); });
    const topCases = Object.entries(perCase).sort((a, b) => b[1].n - a[1].n).slice(0, 5);
    const rcIn = (st.rlog || []).filter(x => x.v > 0).reduce((t, x) => t + x.v, 0), rcOut = Math.abs((st.rlog || []).filter(x => x.v < 0).reduce((t, x) => t + x.v, 0));
    const upgWr = S.upg ? S.upgWin / S.upg * 100 : 0, roi = S.spent ? dropSum / S.spent * 100 : 0;
    const tile = (icn, v, t, sub = '', cls = '') => `<div class="st-tile ${cls}"><span class="st-ic">${icn}</span><div><b>${v}</b><span>${t}</span>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
    body.innerHTML = `<div class="st-grid">
        ${tile(ic.box, fmt(S.opened), 'Кейсов открыто', `потрачено ${money(S.spent)}`)}
        ${tile(ic.gem, money(dropSum), 'Выпало из кейсов', `средний дроп ${fromCases.length ? money(dropSum / fromCases.length) : '—'}`)}
        ${tile(ic.trend, roi ? roi.toFixed(0) + '%' : '—', 'Окупаемость', 'стоимость дропа / потрачено', roi >= 100 ? 'good' : roi ? 'bad' : '')}
        ${tile(ic.wallet, money(S.dep || 0), 'Пополнено', `баланс сейчас ${money(st.balance)}`)}
        ${tile(ic.up, `${S.upgWin} / ${S.upg}`, 'Апгрейдов: побед / всего', S.upg ? `успешных ${upgWr.toFixed(1)}%` : 'ещё не было')}
        ${tile(ic.swap, fmt(S.con), 'Контрактов', '')}
        ${tile(ic.coin, money(sumOf(by('sold'))), 'Продано предметов', `${by('sold').length} шт.`)}
        ${tile(ic.send, fmt(by('out').length), 'Выведено в Steam', by('out').length ? money(sumOf(by('out'))) : '')}
      </div>
      <div class="st-row">
        <div class="st-card st-best r-${best ? best.r : 'milspec'}"><h3>Лучший дроп</h3>${best ? `<img src="${imgUrl(best, 'l')}" alt=""><div class="sb-n"><span>${esc(best.w)}</span>${esc(best.f)}</div><div class="sb-p">${money(best.p)}</div>` : `<div class="muted">Пока нет</div>`}</div>
        <div class="st-card"><h3>Любимые кейсы</h3>${topCases.length ? topCases.map(([id, d]) => { const c = caseById(id); const mx = topCases[0][1].n; return `<div class="st-bar"><span>${esc(c.name)}</span><i><b style="width:${(d.n / mx * 100).toFixed(0)}%;background:${c.th.a}"></b></i><em>${d.n}</em></div>`; }).join('') : '<div class="muted">Откройте пару кейсов</div>'}</div>
        <div class="st-card"><h3>Аккаунт</h3>
          <div class="st-kv"><span>Ранг</span><b>${rk.cur.n}</b></div>
          <div class="st-kv"><span>До следующего</span><b>${rk.next ? money(rk.left) : 'максимум'}</b></div>
          <div class="st-kv"><span>Предметов сейчас</span><b>${list.length} · ${money(sum)}</b></div>
          <div class="st-kv"><span>R-COIN получено / потрачено</span><b>${rc(rcIn)} / ${rc(rcOut)}</b></div>
          <div class="st-kv"><span>Сгорело в апгрейде</span><b>${money(sumOf(by('upg')))}</b></div>
          <div class="st-kv"><span>На сайте с</span><b>${new Date(st.user.reg).toLocaleDateString('ru-RU')}</b></div>
        </div>
      </div>`;
  } else if (pfTab === 'rc') {
    body.innerHTML = `<div class="pf-rc" id="rcoins">
      <div class="rc-head"><img class="rc-ic big" src="assets/rcoin.webp" alt="" aria-hidden="true"><div><span>R-COIN</span><b>${rc(st.rcoin || 0)}</b><small>1 R-COIN = 1 ₽ · тратятся в бонусных кейсах</small></div></div>
      <div class="rc-rules"><b>Как начисляются</b><p>За каждое открытие кейса — <em>2% от его цены</em>. «Сифон и Борода» — 0,5%. При открытии нескольких кейсов сразу — за каждый. А ещё <em>0,5% от пополнения</em> и <em>0,5% от ставки</em> при проигрыше в апгрейде.</p>
        <div class="rc-ex">${CASES.filter(c => !c.rc).sort((a, b) => a.price - b.price).map(c => `<span>${esc(c.name)} <i>+${rc(Math.round(c.price * RCOIN_RATE(c) * 100 + 1e-6) / 100)}</i></span>`).join('')}</div></div>
      <div class="rc-log"><b>История</b>${(st.rlog || []).length ? (st.rlog || []).slice(0, 30).map(x => `<div><span>${esc(x.note)}</span><small>${dstr(x.ts)}</small><i class="${x.v < 0 ? 'neg' : ''}">${x.v < 0 ? '−' + rc(-x.v) : '+' + rc(x.v)}</i></div>`).join('') : '<p class="muted">Откройте кейс — здесь появятся начисления.</p>'}</div>
    </div>`;
  } else {
    const all = st.inv.filter(x => SK[x.n]);
    body.innerHTML = all.length ? `<div class="hist">${all.map(x => {
      const s = SK[x.n], [t, cls] = STATUS[x.st] || ['—', ''];
      return `<div class="hrow r-${s.r}"><img src="${imgUrl(s, 's')}" alt=""><div class="n">${esc(s.name)}<small>${fromName(x.from)}</small></div><div class="s ${cls}">${t}</div><div class="d">${dstr(x.ts)}</div><div class="p">${money(s.p)}</div></div>`;
    }).join('')}</div>` : `<div class="empty">${ic.history}История пока пуста</div>`;
  }
}
function withdraw(id) {
  const it = st.inv.find(x => x.id === id); if (!it || it.st !== 'own') return;
  if (!st.trade) { const ti = $('#tradeInp'); if (ti) { ti.classList.add('err'); ti.focus(); } return toast('Сначала укажите трейд-ссылку Steam', 'err'); }
  const s = SK[it.n];
  const m = modal(`<div class="wd r-${s.r}"><img src="${imgUrl(s, 'l')}" alt=""><h2>Вывод предмета</h2><p>${esc(s.name)} · ${money(s.p)}<br>Бот отправит обмен на вашу трейд-ссылку. Примите его в течение 10 минут.</p><button class="btn btn-primary btn-lg btn-block" id="wdGo">${ic.send}Вывести в Steam</button></div>`, 'm-wd');
  $('#wdGo', m).onclick = async () => {
    const b = $('#wdGo', m); b.disabled = true; b.innerHTML = '<span class="spinner"></span>Бот готовит обмен…';
    const r = await srv('withdraw', { p_id: id }); closeModal(); if ($('#pfBody')) drawPf();
    if (r) toast(`Обмен отправлен: <b>${esc(s.name)}</b>. Примите его в Steam`);
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
/* =========================================================
   ДОКУМЕНТЫ: соглашение, конфиденциальность, оплата и возврат, реквизиты; подтверждение 18+
   Тексты — рабочие шаблоны, перед запуском их стоит показать юристу.
   ========================================================= */
const LEGAL = { name: 'ИП Андреев Виталий Витальевич', short: 'ИП Андреев В. В.', inn: '545210831401', ogrnip: '324547600078326', mail: 'rushcasesupport@gmail.com', site: 'RUSH CASE', date: '28.10.2026' };
const legalReq = () => `<div class="lg-req"><b>${LEGAL.name}</b><span>ИНН ${LEGAL.inn}</span><span>ОГРНИП ${LEGAL.ogrnip}</span><span>E-mail: <a href="mailto:${LEGAL.mail}">${LEGAL.mail}</a></span></div>`;
const LEGAL_DOCS = {
  terms: { t: 'Пользовательское соглашение', body: () => `
    <h3>1. Общие положения</h3>
    <p>Настоящее соглашение (далее — Соглашение) регулирует отношения между ${LEGAL.name} (далее — Администрация) и пользователем сайта ${LEGAL.site} (далее — Сайт, Пользователь). Регистрируясь на Сайте или используя его, Пользователь подтверждает, что ознакомился с Соглашением и принимает его полностью.</p>
    <p>Сайт предназначен только для лиц, достигших 18 лет. Регистрируясь, Пользователь подтверждает свой возраст.</p>
    <h3>2. Предмет соглашения</h3>
    <p>Администрация предоставляет Пользователю развлекательный сервис: открытие виртуальных кейсов, апгрейды и контракты с внутриигровыми предметами Counter-Strike 2, турниры, бонусы. Внутриигровые предметы являются цифровыми объектами, права на которые принадлежат Valve Corporation; Сайт не аффилирован с Valve Corporation.</p>
    <h3>3. Аккаунт</h3>
    <ul><li>Вход выполняется через Steam или по e-mail. Пользователь отвечает за сохранность доступа к своему аккаунту.</li>
      <li>Один человек — один аккаунт. Мультиаккаунты, автоматизация и использование уязвимостей запрещены.</li>
      <li>При нарушении Соглашения Администрация вправе ограничить доступ к аккаунту.</li></ul>
    <h3>4. Баланс и услуги</h3>
    <ul><li>Баланс Сайта — внутренняя учётная единица для оплаты услуг Сайта, не является электронными деньгами и не подлежит обмену, кроме возврата по правилам раздела «Оплата и возврат».</li>
      <li>Результат каждого открытия, апгрейда и контракта определяется случайно на сервере до начала анимации. Шансы указаны на странице кейса.</li>
      <li>Бонусы, промокоды и R-COIN начисляются по правилам, опубликованным на Сайте, и не подлежат выводу деньгами.</li></ul>
    <h3>5. Предметы и вывод</h3>
    <ul><li>Полученные предметы хранятся в профиле Пользователя; их можно продать за баланс или вывести в Steam по трейд-ссылке.</li>
      <li>Для вывода Пользователь обязан указать корректную трейд-ссылку и принять обмен. Если обмен не принят или отменён, предмет возвращается в инвентарь.</li>
      <li>При отсутствии предмета на рынке Администрация вправе предложить замену равной стоимости или возврат стоимости на баланс.</li></ul>
    <h3>6. Ответственность</h3>
    <p>Сервис носит развлекательный характер и не является способом заработка. Администрация не отвечает за перебои в работе Steam и сторонних сервисов, а также за действия Пользователя, повлёкшие потерю доступа к аккаунту.</p>
    <h3>7. Изменение условий</h3>
    <p>Администрация вправе изменять Соглашение. Новая редакция действует с момента публикации на Сайте.</p>
    <h3>8. Контакты</h3>${legalReq()}` },
  privacy: { t: 'Политика конфиденциальности', body: () => `
    <h3>1. Оператор</h3><p>Оператор персональных данных — ${LEGAL.name}, ИНН ${LEGAL.inn}. Политика действует в отношении данных, которые Сайт получает от Пользователя.</p>
    <h3>2. Какие данные мы обрабатываем</h3>
    <ul><li>Steam ID, ник и аватар Steam (при входе через Steam) либо адрес e-mail (при регистрации по почте);</li>
      <li>трейд-ссылку Steam, историю операций, инвентарь, баланс;</li>
      <li>технические данные: IP-адрес, тип браузера, дату и время посещения.</li></ul>
    <p>Платёжные данные (номер карты и т. п.) Сайт не получает и не хранит — их обрабатывает платёжный сервис.</p>
    <h3>3. Цели обработки</h3><ul><li>регистрация и вход, работа сервиса и вывод предметов;</li><li>учёт операций и поддержка пользователей;</li><li>защита от мошенничества и злоупотреблений.</li></ul>
    <h3>4. Передача третьим лицам</h3><p>Данные передаются только в объёме, необходимом для работы сервиса: Steam (вход и вывод), платёжным сервисам (оплата), хостинг-провайдерам. Данные не продаются.</p>
    <h3>5. Хранение и защита</h3><p>Данные хранятся, пока существует аккаунт, и удаляются по запросу Пользователя, кроме сведений, которые нужно хранить по закону. Доступ к данным защищён.</p>
    <h3>6. Права Пользователя</h3><p>Пользователь может запросить сведения о своих данных, их исправление или удаление, написав на <a href="mailto:${LEGAL.mail}">${LEGAL.mail}</a>.</p>
    <h3>7. Cookies</h3><p>Сайт использует локальное хранилище браузера и cookies для входа и настроек. Их можно отключить в браузере, но часть функций перестанет работать.</p>
    <h3>8. Контакты</h3>${legalReq()}` },
  payment: { t: 'Оплата и возврат', body: () => `
    <h3>1. Пополнение баланса</h3>
    <ul><li>Баланс пополняется банковскими картами и через Систему быстрых платежей (СБП). Минимальная сумма — 100 ₽.</li>
      <li>Оплата проходит на защищённой странице платёжного сервиса. Сайт не получает данные карты.</li>
      <li>Баланс зачисляется автоматически после подтверждения платежа платёжным сервисом, обычно в течение нескольких минут.</li>
      <li>Услуги оказываются в рублях. При оплате картой другой страны курс и комиссию определяет банк Пользователя.</li></ul>
    <h3>2. Услуга считается оказанной</h3><p>С момента использования баланса — открытия кейса, апгрейда или контракта — услуга считается оказанной в полном объёме и возврату не подлежит.</p>
    <h3>3. Возврат средств</h3>
    <ul><li>Неиспользованный баланс, внесённый пополнением, можно вернуть по заявке в течение 14 дней со дня пополнения.</li>
      <li>Заявку отправьте на <a href="mailto:${LEGAL.mail}">${LEGAL.mail}</a> с той почты или аккаунта, к которым привязан профиль; укажите ID игрока, дату и сумму пополнения.</li>
      <li>Возврат выполняется тем же способом, которым была произведена оплата, в течение 10 рабочих дней после одобрения заявки. Срок поступления зависит от банка.</li>
      <li>Не возвращаются: бонусы, начисления по промокодам, R-COIN, средства от продажи предметов и выигрыши.</li></ul>
    <h3>4. Ошибочные платежи</h3><p>Если платёж прошёл, а баланс не зачислился в течение часа, напишите в поддержку с данными платежа — мы проверим и зачислим или вернём средства.</p>
    <h3>5. Отказ в обслуживании</h3><p>При подозрении на мошенничество, использование чужой карты или нарушение Соглашения Администрация вправе приостановить операции до выяснения обстоятельств.</p>
    <h3>6. Реквизиты</h3>${legalReq()}` },
};
function pageDoc(key) {
  const d = LEGAL_DOCS[key];
  return `<section class="container"><div class="page-head lg-head"><h1>${d.t}</h1><p>Редакция от ${LEGAL.date}</p></div>
    <nav class="lg-nav">${Object.entries(LEGAL_DOCS).map(([k, x]) => `<a href="#/${k}" class="${k === key ? 'on' : ''}">${x.t}</a>`).join('')}</nav>
    <div class="textpage lg-page">${d.body()}</div></section>`;
}
const pageTerms = () => pageDoc('terms'), pagePrivacy = () => pageDoc('privacy'), pagePayment = () => pageDoc('payment');
/* подтверждение 18+ — в окне входа и регистрации (одна галочка на почту и Steam), запоминается в браузере */
const ageOk = () => { try { return localStorage.getItem('rc.age18') === '1'; } catch (e) { return false; } };
const ageSave = () => { try { localStorage.setItem('rc.age18', '1'); } catch (e) { /* */ } };

const page404 = () => `<section class="container"><div class="empty-big">${ic.alert}<h2>Страница не найдена</h2><p>Такой страницы нет — но кейсы всё ещё ждут.</p><a class="btn btn-primary btn-lg" href="#/">На главную</a></div></section>`;

/* =========================================================
   AUTH
   ========================================================= */
const AU_IC = {
  mail: sv('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>'),
  lock: sv('<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  eyeOff: sv('<path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
};
// поле ввода: значок слева, плавающая подпись, у пароля — кнопка «показать»
const auField = (id, label, icon, type = 'text', ac = '', extra = '') => `<div class="field au-f">
  <div class="au-in"><span class="au-ic">${icon}</span><input class="inp" id="${id}" type="${type}" autocomplete="${ac}" placeholder=" " ${extra}><label for="${id}">${label}</label>${type === 'password' ? `<button type="button" class="au-eye" tabindex="-1" aria-label="Показать пароль">${ic.eye}</button>` : ''}<i class="au-line"></i></div>
  <span class="msg"></span></div>`;
function openAuth(tab = 'login') {
  const m = modal(`<div class="auth au2">
    <div class="au-art" aria-hidden="true"><img src="assets/auth-art.webp" alt=""><i class="au-sweep"></i><i class="au-glow"></i><div class="au-embers">${Array.from({ length: 14 }, () => `<i style="left:${rand(4, 96)}%;--d:${rand(5, 10)}s;--dl:${rand(-10, 0)}s;--x:${rand(-30, 30)}px;--s:${rand(.6, 1.4)}"></i>`).join('')}</div></div>
    <div class="auth-main au-main">
      <div class="au-head"><span class="au-eyebrow"><i></i>RUSH CASE</span><h2 id="authTitle"></h2><p class="au-sub" id="authSub"></p></div>
      <div class="au-tabs" id="authTabs"><i class="au-pill"></i><button data-tab="login">Вход</button><button data-tab="reg">Регистрация</button></div>
      <div class="au-body" id="authBody">
        <button class="au-steam" id="steamBtn"><span class="au-steam-ic">${ic.steam}</span><span class="au-steam-t"><b>Войти через Steam</b><small>быстро и безопасно</small></span>${ic.right}</button>
        <div class="au-or"><span>или по e-mail</span></div>
        <form id="authForm" novalidate></form>
        <label class="check au-age" id="aAgeBox"><input type="checkbox" id="aAge"${ageOk() ? ' checked' : ''}><span>Мне исполнилось 18 лет, я принимаю <a href="#/terms" class="au-doc">пользовательское соглашение</a> и <a href="#/privacy" class="au-doc">политику конфиденциальности</a></span></label>
        <span class="msg au-age-msg" id="aAgeMsg"></span>
      </div>
      <div class="au-foot">${ic.shield}<span>Данные защищены · Только 18+</span></div>
    </div></div>`, 'm-auth m-auth2');
  const draw = (t, first) => {
    const dir = t === 'reg' ? 1 : -1;
    tab = t;
    $$('#authTabs button', m).forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#authTabs', m).dataset.on = t;
    $('#authTitle', m).textContent = t === 'login' ? 'С возвращением' : 'Создать аккаунт';
    $('#authSub', m).innerHTML = t === 'login' ? 'Войдите, чтобы открывать кейсы и забирать дроп' : 'Регистрация за 20 секунд — <b>+100 ₽</b> на баланс сразу';
    const f = $('#authForm', m);
    f.innerHTML = t === 'login' ? `
      ${auField('aEmail', 'E-mail', AU_IC.mail, 'email', 'email')}
      ${auField('aPass', 'Пароль', AU_IC.lock, 'password', 'current-password')}
      <div class="au-row"><span></span><button type="button" class="forgot" id="forgot">Забыли пароль?</button></div>
      <button class="au-go" type="submit"><span>Войти</span>${ic.right}</button>
      <div class="sw">Нет аккаунта? <button type="button" data-sw="reg">Зарегистрироваться</button></div>` : `
      ${auField('aNick', 'Никнейм', ic.user, 'text', 'nickname', 'maxlength="16"')}
      ${auField('aEmail', 'E-mail', AU_IC.mail, 'email', 'email')}
      <div class="row2">${auField('aPass', 'Пароль', AU_IC.lock, 'password', 'new-password')}${auField('aPass2', 'Повторите', AU_IC.lock, 'password', 'new-password')}</div>
      <button class="au-go" type="submit"><span>Создать аккаунт</span><em class="au-bonus">+100 ₽</em>${ic.right}</button>
      <div class="sw">Уже есть аккаунт? <button type="button" data-sw="login">Войти</button></div>`;
    // смена вкладки — форма въезжает с нужной стороны, поля появляются по очереди
    if (!first) { const body = $('#authBody', m); body.style.setProperty('--dir', dir); body.classList.remove('au-swap'); void body.offsetWidth; body.classList.add('au-swap'); }
    $$('[data-sw]', f).forEach(b => b.onclick = () => draw(b.dataset.sw));
    const fg = $('#forgot', f); if (fg) fg.onclick = () => { const e = $('#aEmail', f).value.trim(); if (!/^\S+@\S+\.\S+$/.test(e)) return setErr($('#aEmail', f), 'Введите e-mail для восстановления');
      if (sb) sb.auth.resetPasswordForEmail(e, { redirectTo: location.origin + location.pathname }).then(({ error }) => error ? toast(sbErr(error), 'err') : toast(`Ссылка для сброса пароля отправлена на <b>${esc(e)}</b>`, 'info')); };
    $$('.au-eye', f).forEach(b => b.onclick = () => { const i = b.parentElement.querySelector('input'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.innerHTML = show ? AU_IC.eyeOff : ic.eye; b.classList.toggle('on', show); i.focus(); });
    f.onsubmit = ev => { ev.preventDefault(); submit(f); };
    $$('.inp', f).forEach(i => i.oninput = () => setErr(i, ''));
  };
  const setErr = (inp, msg) => { inp.classList.toggle('err', !!msg); const fl = inp.closest('.field'); if (fl) { fl.classList.toggle('bad', !!msg); const s = fl.querySelector('.msg'); if (s) s.textContent = msg; if (msg) { fl.classList.remove('shake'); void fl.offsetWidth; fl.classList.add('shake'); } } return !msg; };
  const ageCheck = () => { const on = $('#aAge', m).checked; $('#aAgeMsg', m).textContent = on ? '' : 'Подтвердите, что вам есть 18 лет'; $('#aAgeBox', m).classList.toggle('bad', !on); if (on) ageSave(); else { const bx = $('#aAgeBox', m); bx.classList.remove('shake'); void bx.offsetWidth; bx.classList.add('shake'); } return on; };
  const submit = async f => {
    if (!ageCheck()) return;
    const email = $('#aEmail', f).value.trim().toLowerCase(), pass = $('#aPass', f).value;
    let ok = setErr($('#aEmail', f), /^\S+@\S+\.\S+$/.test(email) ? '' : 'Некорректный e-mail');
    ok = setErr($('#aPass', f), pass.length >= 6 ? '' : 'Минимум 6 символов') && ok;
    if (tab === 'reg') {
      const nick = $('#aNick', f).value.trim();
      ok = setErr($('#aNick', f), /^[\wА-Яа-яЁё\- ]{3,16}$/.test(nick) ? '' : '3–16 символов: буквы, цифры, _ и -') && ok;
      ok = setErr($('#aPass2', f), pass === $('#aPass2', f).value ? '' : 'Пароли не совпадают') && ok;
      if (!ok) return;
      if (!sb) return toast('Нет связи с сервером — попробуйте позже', 'err');
      busy(f, true);
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { nick }, emailRedirectTo: location.origin + location.pathname } });
      busy(f, false);
      if (error) return setErr($('#aEmail', f), sbErr(error));
      if (data.session) { if (await sbLoadProfile(data.session)) { closeModal(); afterLogin(true); } }
      else { closeModal(); toast(`Мы отправили письмо на <b>${esc(email)}</b> — подтвердите e-mail по ссылке и войдите`, 'info'); }
    } else {
      if (!ok) return;
      if (!sb) return toast('Нет связи с сервером — попробуйте позже', 'err');
      busy(f, true);
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      busy(f, false);
      if (error) return setErr($('#aEmail', f), sbErr(error));
      if (await sbLoadProfile(data.session)) { closeModal(); afterLogin(false); }
    }
  };
  const busy = (f, on) => { const b = $('.au-go', f); if (b) { b.disabled = on; b.classList.toggle('busy', on); } };
  $$('#authTabs button', m).forEach(b => b.onclick = () => { if (b.dataset.tab !== tab) draw(b.dataset.tab); });
  // вход через Steam: серверная функция Supabase steam-auth (OpenID) → обратно на сайт с одноразовым токеном
  $('#aAge', m).onchange = () => { if ($('#aAge', m).checked) ageCheck(); };
  $$('.au-doc', m).forEach(a => a.onclick = () => closeModal());
  $('#steamBtn', m).onclick = () => { if (!ageCheck()) return; const b = $('#steamBtn', m); b.classList.add('busy'); $('.au-steam-t', b).innerHTML = '<b>Переход в Steam…</b><small>войдите на странице Steam</small>'; location.href = SB_URL + '/functions/v1/steam-auth?start=1&ret=' + encodeURIComponent(location.origin + location.pathname); };
  draw(tab, true);
}
/* аккаунты — в базе Supabase: вход по e-mail, профиль игрока хранится на сервере */
const SB_ERR = { 'Invalid login credentials': 'Неверный e-mail или пароль', 'Email not confirmed': 'Подтвердите e-mail по ссылке из письма', 'User already registered': 'Этот e-mail уже зарегистрирован — войдите', 'Email signups are disabled': 'Регистрация временно недоступна — попробуйте позже', 'Signups not allowed for this instance': 'Регистрация временно недоступна — попробуйте позже' };
const sbErr = e => SB_ERR[e.message] || (/rate limit|too many/i.test(e.message) ? 'Слишком много попыток — подождите минуту' : /password/i.test(e.message) ? 'Пароль слишком простой — минимум 6 символов' : 'Ошибка: ' + e.message);
async function sbLoadProfile(session) {
  if (!sb || !session) return false;
  const { data: p, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !p) { toast('Не удалось загрузить профиль — попробуйте ещё раз', 'err'); return false; }
  Object.assign(st, freshProfile(), p.data || {});
  st.stats = Object.assign(freshProfile().stats, st.stats || {});
  st.inv.forEach(x => { x.n = fixName(x.n); });
  st.user = { id: session.user.id, rid: session.user.id.slice(0, 8), name: p.name, email: session.user.email, ava: p.ava || null, reg: Date.parse(p.created_at), via: p.steamid ? 'steam' : 'email', steamid: p.steamid || null, key: 'sb', sb: true, admin: !!p.is_admin, pid: p.pid || null, luck: +p.luck || 1 };
  if (p.is_admin) try { localStorage.setItem('rc.adm', '1'); } catch (e) { /* */ }
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* приватный режим */ }
  renderUser(); route();
  jpClaim(false); jpResolveMine(); claimGrants();
  return true;
}
// начисления от администратора: забираем при входе, раз в 30 с и при возврате на вкладку
async function claimGrants() {
  if (!sb || !st.user || !st.user.sb) return;
  const { data, error } = await sb.rpc('claim_grants');
  if (error || !data || !data.length) return;
  const sum = data.reduce((a, g) => a + +g.amount, 0);
  await sbRefresh();
  toast(sum > 0 ? `Администрация начислила вам <b>+${money(sum)}</b>${data[0].note ? ' — ' + esc(data[0].note) : ''}` : `Списание с баланса: <b>${money(sum)}</b>`, sum > 0 ? undefined : 'err');
  if (sum > 0) { Snd.coin(); burst(30); }
}
setInterval(claimGrants, 30000);
async function syncLuck() {
  if (!sb || !st.user || !st.user.sb) return;
  const { data } = await sb.from('profiles').select('luck').eq('id', st.user.id).maybeSingle();
  if (data && data.luck != null && +data.luck !== st.user.luck) { st.user.luck = +data.luck; if ($('#wheel')) drawUpg(); }
}
setInterval(syncLuck, 30000);
/* личная удача игрока (из админки): ×шанс предметов дороже кейса, остальные пропорционально; у апгрейда — ×шанс, показанный игроку */
const myLuck = () => clamp((st.user && st.user.luck) || 1, .1, 5);
const luckItems = c => {
  const L = myLuck(); if (L === 1) return c.items;
  const its = c.items.map(s => ({ ...s, ch: s.ch * (s.p >= c.price ? L : 1) })), tot = its.reduce((a, s) => a + s.ch, 0);
  its.forEach(s => { s.ch /= tot; }); return its;
};
addEventListener('focus', claimGrants);
/* настройки кейсов из админки: закрыт / множитель удачи (×шанс предметов дороже кейса, остальные пропорционально реже) */
const caseRtp = c => c.items.reduce((a, s) => a + s.ch * s.p, 0) / c.price;
const caseWin = c => c.items.reduce((a, s) => a + (s.p >= c.price ? s.ch : 0), 0);
function applyLuck(c, luck) {
  c.items.forEach(s => { if (s.ch0 == null) s.ch0 = s.ch; });
  let tot = 0; c.items.forEach(s => { s.ch = s.ch0 * (s.p >= c.price ? luck : 1); tot += s.ch; });
  c.items.forEach(s => { s.ch /= tot; });
  c.luck = luck;
}
/* кейсы, созданные в админ-панели (таблица custom_cases): шансы заданы явно, картинка — из хранилища */
function addCustomCase(r) {
  const items = (r.items || []).map(it => SK[it.n] && { s: SK[it.n], ch: +it.ch }).filter(x => x && x.ch > 0);
  if (items.length < 2) return null;
  const tot = items.reduce((a, x) => a + x.ch, 0), fwRaw = items.map(x => Math.sqrt(x.ch / tot)), fs = fwRaw.reduce((a, b) => a + b, 0);
  const c = { id: r.id, name: r.name, price: +r.price, img: r.img, th: { a: r.accent || '#f5c76b' }, custom: true, sub: r.sub || '', tag: 'Новинка', tagIc: 'star',
    items: items.map((x, i) => ({ ...x.s, ch: x.ch / tot, fw: fwRaw[i] / fs })).sort((a, b) => b.p - a.p) };
  c.rareChance = c.items.filter(s => s.r === 'rare').reduce((a, s) => a + s.ch, 0);
  c.show = c.items.slice(0, 3).map(s => s.name);
  const i = CASES.findIndex(x => x.id === c.id); if (i >= 0) CASES.splice(i, 1);
  CASES.push(c); CASES.sort((a, b) => a.price - b.price);
  c.block = r.block; c.isNew = !!r.is_new; applyCaseCfg(c);
  return c;
}
let customCaseRows = [];
async function loadCustomCases() {
  if (!sb) return;
  const { data, error } = await sb.from('custom_cases').select('*').order('created_at');
  if (error || !data) return;
  customCaseRows = data;
  data.forEach(addCustomCase);
  // открыта страница нового кейса по прямой ссылке — до загрузки его не было
  if (location.hash.startsWith('#/case/') && !$('#cc') && !spinning) route();
}
function removeCustomCase(id) {
  const i = CASES.findIndex(x => x.id === id && x.custom); if (i >= 0) CASES.splice(i, 1);
}
async function loadCaseSettings() {
  if (!sb) return;
  const { data, error } = await sb.from('case_settings').select('id, disabled, luck');
  if (error || !data) return;
  CASES.forEach(c => { const r = data.find(x => x.id === c.id); c.disabled = !!(r && r.disabled); applyLuck(c, r ? +r.luck || 1 : 1); });
  // перерисовать витрину / кнопку открытия (не во время прокрутки)
  const key = location.hash.replace(/^#\/?/, '').split('/')[0];
  if ((key === '' || key === 'cases') && !spinning) route();
  else if (key === 'case' && !spinning && $('#cc') && !$('.rl-row.done, .cc-done')) { const c = caseById(location.hash.split('/')[2]); if (c) ccIdle(c); }
}
function afterLogin(isNew) {
  Snd.coin();
  try { const j = localStorage.getItem('rc.join'); if (j) setTimeout(() => { location.hash = '#/join/' + j; }, 300); } catch (e) { /* */ }
  toast(isNew ? `Добро пожаловать в RUSH CASE, <b>${esc(st.user.name)}</b>! +100 ₽ на баланс` : `С возвращением, <b>${esc(st.user.name)}</b>!`);
  if (isNew) burst(30);
}
async function logout() {
  await sbPush();
  if (sb) await sb.auth.signOut();
  Object.assign(st, freshProfile(), { user: null }); save();
  renderUser(); if (location.hash.length > 2) location.hash = '#/'; else route(); toast('Вы вышли из аккаунта', 'info');
}
// при загрузке сайта: восстанавливаем вход; старый локальный аккаунт (без базы) — выходим из него
function sbInit() {
  if (!sb) return;
  // возврат со входа через Steam: ?steam_token=… → сессия; ?steam_error=… → сообщение
  const qs = new URLSearchParams(location.search), stTok = qs.get('steam_token'), stErr = qs.get('steam_error');
  const payRet = qs.get('pay');
  if (stTok || stErr || payRet) history.replaceState(null, '', location.pathname + location.hash);
  if (payRet) setTimeout(() => { if (payRet === 'ok') { toast('Оплата прошла — баланс зачислится в течение пары минут'); [3e3, 1e4, 3e4].forEach(ms => setTimeout(sbRefresh, ms)); } else toast('Оплата не завершена', 'err'); }, 800);
  if (stErr) setTimeout(() => toast(stErr === 'cancel' ? 'Вход через Steam отменён' : 'Не удалось войти через Steam — попробуйте ещё раз', 'err'), 600);
  if (stTok) { sb.auth.verifyOtp({ token_hash: stTok, type: 'magiclink' }).then(({ data, error }) => { if (error || !data.session) return toast('Не удалось войти через Steam: ' + (error ? error.message : 'нет сессии'), 'err'); sbLoadProfile(data.session).then(ok => ok && afterLogin(false)); }); }
  loadCaseCfg().then(loadCustomCases).then(loadCaseSettings);
  sb.auth.getSession().then(({ data }) => {
    if (data.session) sbLoadProfile(data.session);
    else if (st.user) { Object.assign(st, freshProfile(), { user: null }); save(); renderUser(); route(); }
  });
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') openNewPass();
    if (ev === 'SIGNED_IN' && session && (!st.user || !st.user.sb)) sbLoadProfile(session); // вход по ссылке из письма
  });
}
function openNewPass() {
  const m = modal(`<div class="dep"><h2>Новый пароль</h2><p class="dep-sub">Придумайте новый пароль для входа.</p>
    <div class="field"><input class="inp" id="npPass" type="password" autocomplete="new-password" placeholder="Минимум 6 символов"></div>
    <button class="btn btn-primary btn-lg btn-block" id="npGo" style="margin-top:14px">Сохранить</button></div>`, 'm-dep');
  $('#npGo', m).onclick = async () => {
    const v = $('#npPass', m).value; if (v.length < 6) return toast('Минимум 6 символов', 'err');
    const { error } = await sb.auth.updateUser({ password: v });
    if (error) return toast(sbErr(error), 'err');
    closeModal(); toast('Пароль изменён');
  };
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
/* касса не подключена: онлайн-оплаты нет, баланс пополняет администратор (админ-панель → Игроки → начислить).
   Игрок собирает заявку (ID + сумма) и отправляет её в поддержку. Касса подключится — здесь снова будет оплата через шлюз */
const SUPPORT = { mail: LEGAL.mail, tg: '' }; // tg — ник поддержки в Telegram без @ (появится кнопка)
/* онлайн-оплата через кассу: функция payment (supabase/functions/payment) создаёт счёт и ссылку, касса уведомляет сервер,
   баланс зачисляет сервер. Пока касса не подключена (PAY_LIVE = false) — пополнение через поддержку */
const PAY_LIVE = false;
const PAY_METHODS = [{ k: 'sbp', t: 'СБП', s: 'Без комиссии, по QR или в приложении банка', i: 'bolt', tag: 'Быстро' }, { k: 'card', t: 'Банковская карта', s: 'Карты РФ и СНГ: МИР, Visa, Mastercard', i: 'card' }];
async function payStart(amount, method, promo, btn) {
  const { data } = await sb.auth.getSession(); if (!data.session) return openAuth('login');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Переходим к оплате…';
  try {
    const r = await fetch(SB_URL + '/functions/v1/payment?action=create', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + data.session.access_token, apikey: SB_KEY }, body: JSON.stringify({ amount, method, promo }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error(j.error || 'ошибка');
    location.href = j.url;
  } catch (e) { btn.disabled = false; btn.innerHTML = `${ic.wallet}Оплатить`; toast('Оплата сейчас недоступна — попробуйте позже или напишите в поддержку', 'err'); }
}
function openDepositLive(need) {
  let amount = Math.max(100, Math.ceil((need || 500) / 50) * 50), method = 'sbp', bonus = st.depBonus || 0, code = null;
  const m = modal(`<div class="dep">
    <h2>Пополнение баланса</h2>
    <p class="dep-sub">${need ? `Не хватает <b style="color:var(--lime)">${money(need)}</b> для открытия.` : 'Выберите способ оплаты и сумму.'} Минимальная сумма — 100 ₽.</p>
    <div class="dep-label">Способ оплаты</div>
    <div class="methods pay-methods">${PAY_METHODS.map(x => `<button class="method" data-m="${x.k}">${x.tag ? `<span class="tagb">${x.tag}</span>` : ''}<span class="mi">${ic[x.i]}</span><span><b>${x.t}</b><small>${x.s}</small></span></button>`).join('')}</div>
    <div class="dep-label">Сумма</div>
    <div class="dep-amt"><input class="inp" id="depAmt" type="number" min="100" step="50" value="${amount}"><span>₽</span></div>
    <div class="amounts">${[300, 500, 1000, 2500, 5000, 10000].map(a => `<button data-a="${a}">${fmt(a)} ₽</button>`).join('')}</div>
    <div class="dep-label">Промокод на пополнение</div>
    <div class="inp-row"><input class="inp" id="depPromo" placeholder="Если есть" style="text-transform:uppercase" autocomplete="off"><button class="btn btn-dark" id="depPromoBtn">Применить</button></div>
    <div class="dep-total"><div>К зачислению<b id="depTotal"></b><span id="depBonusTxt"></span></div><button class="btn btn-primary btn-xl" id="depGo"></button></div>
    <p class="dep-note">Оплата на защищённой странице платёжного сервиса. Нажимая «Оплатить», вы принимаете <a href="#/payment">правила оплаты и возврата</a>.</p>
  </div>`, 'm-dep');
  const draw = () => {
    $$('.method', m).forEach(b => b.classList.toggle('on', b.dataset.m === method));
    $$('.amounts button', m).forEach(b => b.classList.toggle('on', +b.dataset.a === amount));
    $('#depTotal', m).textContent = money(Math.round(amount * (1 + bonus / 100)));
    $('#depBonusTxt', m).innerHTML = bonus ? `<em>+${bonus}% промокод</em>` : '';
    const g = $('#depGo', m); g.innerHTML = `${ic.wallet}Оплатить ${money(amount)}`; g.disabled = amount < 100 || amount > 1000000;
  };
  $$('.method', m).forEach(b => b.onclick = () => { method = b.dataset.m; draw(); });
  $$('.amounts button', m).forEach(b => b.onclick = () => { amount = +b.dataset.a; $('#depAmt', m).value = amount; draw(); });
  $('#depAmt', m).oninput = e => { amount = Math.max(0, Math.round(+e.target.value || 0)); draw(); };
  $('#depPromoBtn', m).onclick = () => { const c = $('#depPromo', m).value.trim().toUpperCase(); if (!/^[A-Z0-9]{2,24}$/.test(c)) return toast('Введите промокод', 'err'); code = c; toast(`Промокод <b>${esc(c)}</b> будет проверен при оплате`); };
  $('#depGo', m).onclick = e => payStart(amount, method, code, e.currentTarget);
  draw();
}
function openDeposit(need = 0) {
  if (!st.user) return openAuth('login');
  if (PAY_LIVE) return openDepositLive(need);
  let amount = Math.max(100, Math.ceil((need || 500) / 50) * 50);
  const id = st.user.pid || st.user.rid || st.user.id;
  const req = () => `Пополнение RUSH CASE\nID игрока: ${id}\nНик: ${st.user.name}\nСумма: ${fmt(amount)} ₽`;
  const m = modal(`<div class="dpx">
    <div class="dpx-head">
      <span class="dpx-ico">${ic.wallet}</span>
      <div><h2>Пополнение баланса</h2><p>${need ? `Для открытия не хватает <b>${money(need)}</b>` : 'Баланс сейчас пополняется через поддержку'}</p></div>
      <div class="dpx-bal"><small>На балансе</small><b>${money(st.balance)}</b></div>
    </div>
    <div class="dpx-off"><i class="dpx-dot"></i><div><b>Онлайн-оплата скоро</b><span>Подключаем платёжную систему. Пока баланс зачисляет администратор — отправьте заявку в поддержку, обычно это занимает несколько минут.</span></div></div>
    <div class="dpx-grid">
      <section class="dpx-card">
        <div class="dpx-step"><i>1</i>Сумма пополнения</div>
        <div class="dep-amt"><input class="inp" id="depAmt" type="number" min="100" step="50" value="${amount}" inputmode="numeric"><span>₽</span></div>
        <div class="amounts">${[300, 500, 1000, 2500, 5000, 10000].map(a => `<button data-a="${a}">${fmt(a)} ₽</button>`).join('')}</div>
        <div class="dpx-step"><i>2</i>Заявка для поддержки</div>
        <div class="dpx-req"><div><span>ID игрока</span><b>${esc(id)}</b></div><div><span>Ник</span><b>${esc(st.user.name)}</b></div><div><span>Сумма</span><b id="depReqAmt"></b></div></div>
        <div class="dpx-acts">
          <button class="btn btn-primary btn-lg" id="depCopy">${ic.copy}Скопировать заявку</button>
          ${SUPPORT.tg ? `<a class="btn btn-dark btn-lg" id="depTg" href="https://t.me/${SUPPORT.tg}" target="_blank" rel="noopener">${ic.tg}Telegram</a>` : ''}
          <a class="btn btn-dark btn-lg" id="depMail">${ic.send}Написать на почту</a>
        </div>
        <p class="dpx-hint" id="depHint">Минимальная сумма — 100 ₽</p>
      </section>
      <aside class="dpx-how">
        <div class="dpx-step"><i>3</i>Что дальше</div>
        <ol>
          <li><b>Отправьте заявку</b><span>Вставьте скопированный текст в сообщение поддержке.</span></li>
          <li><b>Оплатите по реквизитам</b><span>Поддержка пришлёт удобный способ оплаты.</span></li>
          <li><b>Баланс зачислится сам</b><span>Обновится на сайте автоматически — ничего нажимать не нужно.</span></li>
        </ol>
      </aside>
    </div>
    <div class="dpx-soon">
      <div class="dpx-soon-h">Способы оплаты <span>появятся после подключения кассы</span></div>
      <div class="dpx-methods">${METHODS.map(x => `<div class="dpx-m"><span class="mi">${ic[x.i]}</span><span><b>${x.t}</b><small>${x.s}</small></span><em>Скоро</em></div>`).join('')}</div>
    </div>
  </div>`, 'm-dep');
  const draw = () => {
    const ok = amount >= 100 && amount <= 1000000;
    $$('.amounts button', m).forEach(b => b.classList.toggle('on', +b.dataset.a === amount));
    $('#depReqAmt', m).textContent = ok ? money(amount) : '—';
    $('#depCopy', m).disabled = !ok;
    $('#depMail', m).href = ok ? `mailto:${SUPPORT.mail}?subject=${encodeURIComponent('Пополнение баланса — ID ' + id)}&body=${encodeURIComponent(req())}` : '#';
    $('#depMail', m).classList.toggle('dis', !ok);
    $('#depHint', m).classList.toggle('err', !ok);
  };
  $$('.amounts button', m).forEach(b => b.onclick = () => { amount = +b.dataset.a; $('#depAmt', m).value = amount; draw(); });
  $('#depAmt', m).oninput = e => { amount = Math.max(0, Math.round(+e.target.value || 0)); draw(); };
  $('#depCopy', m).onclick = async () => {
    try { await navigator.clipboard.writeText(req()); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = req(); document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e2) { /* ignore */ } ta.remove(); }
    const b = $('#depCopy', m); b.innerHTML = `${ic.check}Заявка скопирована`; b.classList.add('done');
    toast('Заявка скопирована — отправьте её в поддержку');
    setTimeout(() => { b.innerHTML = `${ic.copy}Скопировать заявку`; b.classList.remove('done'); }, 2500);
  };
  $('#depMail', m).onclick = e => { if (amount < 100) e.preventDefault(); };
  draw();
}

/* =========================================================
   СТАВКИ (джекпот): игроки ставят скины 30 с (до 20 человек), рулетка выбирает победителя
   пропорционально ставке, победитель забирает весь банк.
   Раунды и ставки общие для всех игроков (база Supabase, см. supabase/schema.sql); боты тоже пишутся в базу и видны всем.
   ========================================================= */
const JP_TIME = 30, JP_MAX = 20, JP_SPIN = 10000;
const JP_COLORS = ['#f3c14f', '#4ade80', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#ef4444', '#a3e635', '#e879f9',
  '#facc15', '#2dd4bf', '#818cf8', '#fb7185', '#c084fc', '#34d399', '#f97316', '#38bdf8', '#eab308', '#94a3b8'];
/* сессии (комнаты): у каждой свои игроки, диапазон ставок ботов и таймер; все идут параллельно */
const JP_ROOMS = [
  { id: 'low', t: 'Новички', sub: 'ставки 4–500 ₽', lo: 4, hi: 500, time: 30, a: '#4ade80' },
  { id: 'mid', t: 'Средняя', sub: 'ставки 300–8 000 ₽', lo: 300, hi: 8000, time: 30, a: '#60a5fa' },
  { id: 'fast', t: 'Турбо', sub: '15 секунд на раунд', lo: 50, hi: 3000, time: 15, a: '#fb923c' },
  { id: 'high', t: 'Хайроллеры', sub: 'ставки от 5 000 ₽', lo: 5000, hi: 239000, time: 30, a: '#f3c14f' },
];
// ники ботов: у каждой сессии — свои (не пересекаются)
(() => {
  const A = ['Dark', 'Ice', 'Toxic', 'Mad', 'Lucky', 'Silent', 'Red', 'Ghost', 'Neo', 'Wild', 'Crazy', 'Cold', 'Gold', 'Night', 'Storm', 'Hyper', 'Iron', 'Fast', 'Sly', 'King'];
  const B = ['Fox', 'Wolf', 'Sniper', 'Rush', 'Viper', 'Hawk', 'Tiger', 'Shark', 'Ninja', 'Bear', 'Raven', 'Cobra', 'Lynx', 'Eagle', 'Panda', 'Joker'];
  const all = [...NICKS]; for (let i = 0; all.length < 120; i++) { const n = A[(i * 7) % A.length] + B[(i * 5 + (i / A.length | 0)) % B.length] + (i % 3 ? '' : '_' + (10 + (i * 37) % 90)); if (!all.includes(n)) all.push(n); }
  JP_ROOMS.forEach((r, k) => { r.nicks = all.filter((_, i) => i % JP_ROOMS.length === k); });
})();
const JP = Object.fromEntries(JP_ROOMS.map(cfg => [cfg.id, { cfg, id: 1, phase: 'wait', players: [], endsAt: 0, winner: null, rot: 0, history: [], tmr: [], spinStart: 0 }]));
let jpView = 'mid', jp = JP[jpView]; // jp — текущая сессия (в таймерах временно подменяется на свою)
const jpViewing = () => jp === JP[jpView] && !!$('#jp');
const jpAfter = (fn, ms) => { const R = jp; const t = setTimeout(() => { const prev = jp; jp = R; try { fn(); } finally { jp = prev; } }, ms); R.tmr.push(t); return t; };
const jpTotal = () => jp.players.reduce((a, p) => a + p.sum, 0);
const jpFind = name => jp.players.find(p => p.name === name);
/* --- раунды и ставки — в базе, общие для всех игроков. Любой открытый сайт «пульсирует» сессию (jp_tick):
   сервер двигает таймер, разыгрывает победителя и иногда добавляет бота — его видят все одинаково --- */
let jpOff = 0; // смещение часов сервера относительно браузера
const jpSrvNow = () => Date.now() + jpOff;
function jpBotCandidate(R) {
  const used = new Set(R.players.map(p => p.name));
  const name = R.cfg.nicks.filter(n => !used.has(n) && (!st.user || n !== st.user.name)).sort(() => Math.random() - .5)[0];
  if (!name) return null;
  const pool = CATALOG.filter(s => s.p >= R.cfg.lo && s.p <= R.cfg.hi); // ставки ботов — в диапазоне сессии
  const n = randi(1, 4), items = [];
  for (let i = 0; i < n; i++) items.push(pool[Math.floor(Math.pow(Math.random(), 1.8) * pool.length)]);
  return { name, items: items.map(s => s.name), value: Math.round(items.reduce((a, s) => a + s.p, 0) * 100) / 100 };
}
const jpWantBot = R => R.phase === 'wait' || (R.phase === 'open' && (R.endsAt - Date.now()) / 1000 > 1.5 && R.players.length < JP_MAX && Math.random() < (R.players.length < 6 ? .5 : .25));
async function jpTickRoom(id, withBot) {
  if (!sb) return;
  const R = JP[id];
  const { data, error } = await sb.rpc('jp_tick', { p_room: id, p_bot: withBot && jpWantBot(R) ? jpBotCandidate(R) : null });
  if (error) { R.err = true; if (R === JP[jpView]) jpRender(); return; }
  R.err = false;
  jpOff = Date.parse(data.now) - Date.now();
  await jpLoad(id, data.round);
}
async function jpLoad(id, round) {
  const R = JP[id];
  if (!round) { const { data } = await sb.from('jp_rounds').select('*').eq('room', id).neq('status', 'done').maybeSingle(); round = data; }
  if (!round) return;
  const { data: bets } = await sb.from('jp_bets').select('id, uid, name, ava, items, value').eq('round_id', round.id).order('id');
  jpApply(R, round, bets || []);
}
// раунд из базы → состояние сессии (тот же вид, что рисует jpRender)
function jpApply(R, round, bets) {
  const prev = { id: R.id, phase: R.phase, n: R.players.length };
  const players = [];
  for (const b of bets) {
    let p = players.find(x => x.name === b.name);
    if (!p) { p = { name: b.name, uid: b.uid, ava: b.ava, items: [], sum: 0, me: !!(st.user && b.uid && b.uid === st.user.id), color: JP_COLORS[players.length % JP_COLORS.length] }; players.push(p); }
    p.items.push(...(b.items || []).map(n => SK[n]).filter(Boolean)); p.sum += +b.value;
  }
  R.id = round.id; R.players = players;
  R.endsAt = round.ends_at ? Date.parse(round.ends_at) - jpOff : 0;
  R.spinStart = round.spin_at ? Date.parse(round.spin_at) - jpOff : 0;
  R.phase = round.status === 'open' ? 'open' : round.status === 'spin' ? (Date.now() - R.spinStart > JP_SPIN ? 'done' : 'spin') : 'wait';
  R.winner = null; R.rot = 0;
  if (round.winner) {
    const w = players.find(p => p.name === round.winner), total = players.reduce((a, p) => a + p.sum, 0);
    if (w && total) {
      // угол: сегменты по часовой от верха; точка внутри сектора победителя (её выбрал сервер) — наверх под стрелку
      let acc = 0; for (const p of players) { p.a0 = acc / total * 360; acc += p.sum; p.a1 = acc / total * 360; }
      const span = w.a1 - w.a0, m = Math.min(span * .2, 4);
      R.winner = w; R.rot = 360 * 5 + (360 - (w.a0 + m + round.w_point * (span - 2 * m)));
    }
  }
  const viewing = R === JP[jpView] && !!$('#jp');
  const prevJp = jp; jp = R;
  try {
    if (viewing) {
      const fresh = players.length > prev.n && prev.id === R.id ? players[players.length - 1].name : null;
      if (fresh && R.phase === 'open') Snd.tone(1200 + Math.random() * 400, .06, 'triangle', .05);
      jpRender(fresh);
      if (R.phase === 'spin' && (prev.id !== R.id || prev.phase !== 'spin')) jpSpinFx();
    }
    if (R.phase === 'done' && R.finished !== R.id) { if (prev.id !== R.id && !players.some(p => p.me)) R.finished = R.id; else jpFinish(R); } // чужой раунд, разыгранный до нашего прихода, — без эффектов
  } finally { jp = prevJp; }
  if (!viewing) jpRoomsRender();
}
// раунд разыгран и прокрутка закончилась: итоги один раз
function jpFinish(R) {
  R.finished = R.id;
  const w = R.winner; if (!w) return;
  const pot = R.players.flatMap(p => p.items), total = R.players.reduce((a, p) => a + p.sum, 0), viewing = R === JP[jpView] && !!$('#jp');
  if (!R.history.some(h => h.id === R.id)) {
    R.history.unshift({ id: R.id, name: w.name, me: w.me, ava: w.ava, sum: total, chance: w.sum / total, color: w.color, best: pot.reduce((a, s) => !a || s.p > a.p ? s : a, null) || SK[Object.keys(SK)[0]] });
    R.history = R.history.slice(0, 8);
  }
  const meIn = R.players.some(p => p.me);
  st.inv.forEach(x => { if (x.st === 'bet' && x.round === R.id) x.st = 'jp'; }); save();
  if (w.me) {
    jpClaim(true);
    if (viewing) { Snd.play('upgWin').then(ok => { if (!ok) Snd.safeWin(); }); burst(140); setTimeout(() => burst(70), 700); }
    toast(`Сессия «${R.cfg.t}»: вы забрали банк <b>${money(total)}</b> — ${pot.length} предм.`);
  } else if (meIn) { if (viewing) Snd.safeLose(); toast(`Сессия «${R.cfg.t}»: банк забрал ${esc(w.name)}. Повезёт в следующем раунде!`, 'err'); }
  else if (viewing) Snd.coin();
  if (viewing) { const prevJp = jp; jp = R; try { jpRender(); } finally { jp = prevJp; } }
}
// выигрыши из базы (в том числе пока игрок был не в сети) → в инвентарь
async function jpClaim(silent) {
  if (!sb || !st.user || !st.user.sb) return;
  const { data, error } = await sb.rpc('jp_claim');
  if (error || !data || !data.length) return;
  let n = 0, sum = 0;
  for (const p of data) { n += (p.items || []).length; sum += +p.total; }
  await sbRefresh(); // предметы выигрыша сервер уже положил в инвентарь
  if (!silent) toast(`Пока вас не было, вы выиграли в ставках: <b>${money(sum)}</b> — ${n} предм. уже в инвентаре`);
}
// свои ставки в раундах, которые уже разыграны без нас (закрыли сайт во время раунда)
async function jpResolveMine() {
  const ids = [...new Set(st.inv.filter(x => x.st === 'bet' && x.round).map(x => x.round))];
  if (!sb || !ids.length) return;
  const { data } = await sb.from('jp_rounds').select('id, status').in('id', ids);
  (data || []).forEach(r => { if (r.status !== 'open' && r.status !== 'wait') st.inv.forEach(x => { if (x.st === 'bet' && x.round === r.id) x.st = 'jp'; }); });
  save();
}
// последние разыгранные раунды сессии
async function jpLoadHistory(id) {
  if (!sb) return;
  const R = JP[id];
  const { data: rounds } = await sb.from('jp_rounds').select('id, winner, winner_uid, total').eq('room', id).not('winner', 'is', null).order('id', { ascending: false }).limit(8);
  if (!rounds || !rounds.length) return;
  const { data: bets } = await sb.from('jp_bets').select('round_id, name, ava, items, value, id').in('round_id', rounds.map(r => r.id)).order('id');
  R.history = rounds.map(r => {
    const bs = (bets || []).filter(b => b.round_id === r.id), names = [...new Set(bs.map(b => b.name))], wb = bs.filter(b => b.name === r.winner);
    const items = bs.flatMap(b => (b.items || []).map(n => SK[n]).filter(Boolean)), wsum = wb.reduce((a, b) => a + +b.value, 0);
    return { id: r.id, name: r.winner, me: !!(st.user && r.winner_uid === st.user.id), ava: wb[0] && wb[0].ava, sum: +r.total, chance: r.total ? wsum / r.total : 0,
      color: JP_COLORS[Math.max(0, names.indexOf(r.winner)) % JP_COLORS.length], best: items.reduce((a, s) => !a || s.p > a.p ? s : a, null) || SK[Object.keys(SK)[0]] };
  });
  if (R === JP[jpView] && $('#jp')) jpRender();
}
// живые изменения из базы: новая ставка / смена статуса раунда → перечитываем сессию
const jpSoonT = {};
function jpSoon(room) { if (!JP[room]) return; clearTimeout(jpSoonT[room]); jpSoonT[room] = setTimeout(() => jpLoad(room), 120); }
let jpLive = null, jpPulse = 0, jpBeat = 0;
function jpStart() {
  if (!sb || jpLive) return;
  jpLive = sb.channel('jp-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jp_rounds' }, p => { const r = p.new && p.new.room; if (r && ($('#jp') || st.inv.some(x => x.st === 'bet' && x.room === r))) jpSoon(r); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jp_bets' }, p => { const r = p.new && p.new.room; if (r && $('#jp')) jpSoon(r); })
    .subscribe();
  // пульс: на странице ставок — открытая сессия каждые 1,5 с (с ботом), остальные — каждые ~4,5 с; вне страницы — только сессии со своей ставкой
  jpPulse = setInterval(() => {
    jpBeat++;
    const onPage = !!$('#jp');
    JP_ROOMS.forEach(cfg => {
      const mine = st.inv.some(x => x.st === 'bet' && x.room === cfg.id);
      if (onPage ? (cfg.id === jpView || jpBeat % 3 === 0) : mine && jpBeat % 2 === 0) jpTickRoom(cfg.id, onPage);
      // прокрутка закончилась — итоги без ожидания сервера
      const R = JP[cfg.id]; if (R.phase === 'spin' && Date.now() - R.spinStart > JP_SPIN) { R.phase = 'done'; if (R.finished !== R.id) jpFinish(R); }
    });
  }, 1500);
}
/* звук прокрутки — как в апгрейде: храповик сейфа + сердцебиение в конце */
function jpSpinFx() {
  const R = jp, t0 = performance.now(); let last = null, lastA = null, nextBeat = JP_SPIN - 2300;
  const loop = now => {
    if (R.phase !== 'spin') return;
    const el = now - t0, rot = $('#jpRot');
    if (rot && R === JP[jpView]) {
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
    <div class="page-head top-head"><div><h1>Ставки <em>на банк</em></h1><p>Поставьте скины — у каждого игрока свой цвет на рулетке, доля пропорциональна ставке. Через 15–30 секунд после первой ставки рулетка выберет победителя, и он заберёт весь банк. Сессии идут параллельно — заходите в любую.</p></div></div>
    <div class="jp-rooms" id="jpRooms"></div>
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
  Snd.warm(['safe1', 'safe2', 'safe3', 'upgWin']);
  jp = JP[jpView];
  jpRender();
  jpStart(); JP_ROOMS.forEach(cfg => jpTickRoom(cfg.id, cfg.id === jpView)); jpLoadHistory(jpView);
  clearInterval(jpTick);
  jpTick = setInterval(() => { if (!$('#jp')) return clearInterval(jpTick); jp = JP[jpView]; jpRenderCenter(); jpRoomsRender(); }, 250);
}
/* вкладки сессий: живой статус каждой */
function jpRoomsRender() {
  const box = $('#jpRooms'); if (!box) return;
  const me = st.user && st.user.name;
  box.innerHTML = JP_ROOMS.map(cfg => {
    const R = JP[cfg.id], tot = R.players.reduce((a, p) => a + p.sum, 0), mine = me && R.players.some(p => p.me);
    const stt = R.phase === 'open' ? `0:${pad(Math.max(0, Math.ceil((R.endsAt - Date.now()) / 1000)))}` : R.phase === 'spin' ? 'розыгрыш' : R.phase === 'done' ? 'итоги' : 'ожидание';
    return `<button class="jp-room${cfg.id === jpView ? ' on' : ''}${mine ? ' mine' : ''}" data-room="${cfg.id}" style="--rc:${cfg.a}">
      <span class="jr-h"><i class="jr-dot ${R.phase}"></i><b>${cfg.t}</b>${mine ? '<em>вы в игре</em>' : ''}</span>
      <span class="jr-sub">${cfg.sub}</span>
      <span class="jr-st"><span>${ic.users}${R.players.length}/${JP_MAX}</span><span>${money(tot)}</span><span class="jr-t">${stt}</span></span>
    </button>`;
  }).join('');
  $$('[data-room]', box).forEach(b => b.onclick = () => { if (b.dataset.room === jpView) return; jpView = b.dataset.room; jp = JP[jpView]; Snd.click(); const r = $('#jpRot'); if (r) delete r.dataset.spun; jpRender(); jpTickRoom(jpView, true); if (!jp.history.length) jpLoadHistory(jpView); });
}
function jpRenderCenter() {
  const c = $('#jpCenter'); if (!c) return;
  if (jp.phase === 'wait') c.innerHTML = `<b class="jp-big">${ic.users}</b><span>Ожидание игроков</span>`;
  else if (jp.phase === 'open') { const s = Math.max(0, Math.ceil((jp.endsAt - Date.now()) / 1000)); c.innerHTML = `<b class="jp-big ${s <= 5 ? 'hot' : ''}">0:${pad(s)}</b><span>до розыгрыша</span>`; }
  else if (jp.phase === 'spin') c.innerHTML = `<b class="jp-big">${money(jpTotal())}</b><span>разыгрывается</span>`;
  else if (jp.winner) c.innerHTML = `<span class="jp-wava">${ava({ name: jp.winner.name, ava: jp.winner.ava })}</span><b class="jp-wname" style="color:${jp.winner.color}">${esc(jp.winner.name)}</b><span>забирает ${money(jpTotal())} · шанс ${(jp.winner.sum / jpTotal() * 100).toFixed(1)}%</span>`;
}
function jpRender(flash) {
  if (!jpViewing()) return;
  jpRoomsRender();
  const total = jpTotal(), me = jp.players.find(p => p.me);
  $('#jpPot').textContent = money(total);
  $('#jpCnt').textContent = `${jp.players.length} / ${JP_MAX}`;
  $('#jpMe').textContent = me ? (me.sum / total * 100).toFixed(1) + '%' : '—';
  $('#jpSegs').innerHTML = jpSegments();
  const rot = $('#jpRot');
  if (jp.phase === 'spin' || jp.phase === 'done') {
    const passed = Date.now() - jp.spinStart;
    if (jp.phase === 'done' || passed > JP_SPIN) { rot.style.transition = 'none'; rot.style.transform = `rotate(${jp.rot}deg)`; }
    else if (!rot.dataset.spun || rot.dataset.spun != jp.cfg.id + jp.id) {
      rot.dataset.spun = jp.cfg.id + jp.id; rot.style.transition = 'none'; rot.style.transform = 'rotate(0deg)'; void rot.offsetWidth;
      rot.style.transition = `transform ${JP_SPIN - passed}ms cubic-bezier(.12,.6,.06,1)`; rot.style.transform = `rotate(${jp.rot}deg)`;
    }
  } else { rot.style.transition = 'none'; rot.style.transform = 'rotate(0deg)'; delete rot.dataset.spun; }
  $('#jpWheel').classList.toggle('win', jp.phase === 'done' && jp.winner && jp.winner.me);
  jpRenderCenter();
  // кнопка ставки
  const act = $('#jpAct');
  if (!sb || jp.err) act.innerHTML = `<div class="cc-note">Нет связи с сервером ставок — пробуем переподключиться…</div>`;
  else if (jp.phase === 'spin' || jp.phase === 'done') act.innerHTML = `<div class="cc-note">Ставки закрыты — ${jp.phase === 'spin' ? 'идёт розыгрыш' : 'новый раунд через несколько секунд'}</div>`;
  else if (!st.user) act.innerHTML = `<button class="btn btn-primary btn-xl btn-cham" data-act="login">${ic.login}Войти и сделать ставку</button>`;
  else if (!me && jp.players.length >= JP_MAX) act.innerHTML = `<div class="cc-note">Лобби заполнено (${JP_MAX} игроков)</div>`;
  else { act.innerHTML = `<button class="btn btn-primary btn-xl btn-cham" id="jpBet">${ic.plus}${me ? 'Добавить к ставке' : 'Сделать ставку'}</button>`; $('#jpBet').onclick = jpOpenBet; }
  // участники
  $('#jpPl').innerHTML = total ? `банк <b>${money(total)}</b>` : '';
  $('#jpList').innerHTML = jp.players.length ? jp.players.slice().sort((a, b) => b.sum - a.sum).map(p => `
    <div class="jp-row${p.me ? ' me' : ''}${p.name === flash ? ' flash' : ''}${jp.winner === p && jp.phase === 'done' ? ' won' : ''}" style="--pc:${p.color}">
      <i class="jp-dot"></i>${ava({ name: p.name, ava: p.ava }, 'xs')}
      <div class="jp-n"><b>${plink(p.uid, esc(p.name))}${p.me ? ' (вы)' : ''}</b><span>${money(p.sum)} · ${p.items.length} предм.</span></div>
      <div class="jp-items">${p.items.slice(0, 4).map(s => `<img class="r-${s.r}" src="${imgUrl(s, 'm')}" alt="" title="${esc(s.name)} — ${money(s.p)}">`).join('')}${p.items.length > 4 ? `<em>+${p.items.length - 4}</em>` : ''}</div>
      <b class="jp-pct">${(p.sum / total * 100).toFixed(1)}%</b>
    </div>`).join('') : `<div class="empty">${ic.users}Пока никто не поставил. Сделайте первую ставку — запустится таймер на ${jp.cfg.time} секунд.</div>`;
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
  $('#jpGo', m).onclick = async () => {
    if (jp.phase === 'spin' || jp.phase === 'done') { closeModal(); return toast('Ставки уже закрыты', 'err'); }
    if (!sb || !st.user.sb) { closeModal(); return toast('Нет связи с сервером — войдите заново', 'err'); }
    const items = sel.map(id => st.inv.find(x => x.id === id)).filter(x => x && x.st === 'own');
    if (!items.length) return;
    const R = jp, value = Math.round(items.reduce((a, x) => a + SK[x.n].p, 0) * 100) / 100, go = $('#jpGo', m);
    go.disabled = true; go.innerHTML = '<span class="spinner"></span>Ставка…';
    const data = await srv('jp_bet', { p_room: R.cfg.id, p_ids: items.map(x => x.id) });
    if (!data) { closeModal(); return; }
    Snd.safeSel(true); Snd.coin(); closeModal();
    toast(`Ставка принята: <b>${money(value)}</b>`);
    jpLoad(R.cfg.id);
  };
}
/* =========================================================
   АДМИН-ПАНЕЛЬ: дашборд, кейсы (закрыть / удача), игроки (начислить баланс).
   Права проверяет база (is_admin в profiles, функции admin_* — см. supabase/admin.sql).
   ========================================================= */
let admTab = (() => { try { return localStorage.getItem('rc.admTab') || 'dash'; } catch (e) { return 'dash'; } })();
const pctS = v => (v * 100).toFixed(v < .1 ? 2 : 1).replace('.', ',') + '%';
function pageAdmin() {
  if (!st.user || !st.user.admin) return `<section class="container"><div class="page-head"><h1>Нет <em>доступа</em></h1><p>Раздел только для администраторов. Войдите под админ-аккаунтом.</p></div></section>`;
  return `<section class="container cases-wide ax" id="adm">
    <header class="ax-top"><div class="ax-ttl"><span>Админ-панель</span><h1>RUSH CASE</h1></div><div class="ax-period" id="axPeriod"></div></header>
    <nav class="ax-tabs" id="admTabs">${ADM_TABS.map(([k, t]) => `<button data-t="${k}" class="${k === admTab ? 'on' : ''}">${t}</button>`).join('')}</nav>
    <div id="admBody"></div>
  </section>`;
}
/* каталог цен и составы встроенных кейсов → на сервер (выпадение считает сервер по этим данным); грузим, если на сайте что-то поменялось */
async function admSync(force) {
  const cat = Object.keys(SK).map(k => [k, Math.round(SK[k].p * 100) / 100, SK[k].c || 'skin']).filter(x => x[1] > 0);
  const cases = CASES.filter(c => !c.custom).map(c => ({ id: c.id, price: c.price, rc: !!c.rc, rate: c.rc ? 0 : RCOIN_RATE(c), maxn: c.farm ? c.farm.maxN : 7, sell_below: c.farm ? c.farm.sellBelow : null, items: c.items.map(x => ({ n: x.name, ch: x.ch0 != null ? x.ch0 : x.ch })) }));
  const str = JSON.stringify(cases) + cat.length + cat.reduce((a, x) => a + x[1], 0).toFixed(2);
  let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  const ver = (h >>> 0).toString(36);
  const { data: m } = await sb.from('srv_meta').select('v').eq('k', 'version').maybeSingle();
  if (!force && m && m.v === ver) return;
  const t = toast('Загружаем на сервер каталог цен и кейсы…', 'info');
  for (let i = 0; i < cat.length; i += 1500) {
    const last = i + 1500 >= cat.length;
    const { error } = await sb.rpc('admin_sync', { p_catalog: cat.slice(i, i + 1500), p_cases: last ? cases : null, p_version: last ? ver : null });
    if (error) return toast('Синхронизация не удалась: ' + error.message + ' — запустите supabase/server.sql', 'err');
  }
  toast(`Сервер обновлён: ${fmt(cat.length)} предметов, ${cases.length} кейсов`);
}
function mountAdmin() {
  if (!$('#adm')) return;
  if (sb) admSync();
  if (!ADM_TABS.some(([k]) => k === admTab)) admTab = 'dash';
  admPeriodBar();
  $$('#admTabs [data-t]').forEach(b => b.onclick = () => { admTab = b.dataset.t; try { localStorage.setItem('rc.admTab', admTab); } catch (e) { /* */ } admDraw(); });
  admDraw();
}
const admErr = e => `<div class="empty">${ic.shield}Ошибка: ${esc(e.message || String(e))}. Проверьте, что запущен supabase/admin.sql и ваш аккаунт — админ.</div>`;
/* ---------- админ-панель: общий период, данные за период (кэш 1 мин), графики и таблицы ---------- */
let admRange = { k: '7d' };
const admDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const admIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function admRangeDates() {
  const now = new Date(), today = admDay(now), tomorrow = new Date(+today + 864e5);
  const R = { today: [today, tomorrow], yest: [new Date(+today - 864e5), today], '7d': [new Date(+today - 6 * 864e5), tomorrow], '30d': [new Date(+today - 29 * 864e5), tomorrow], '90d': [new Date(+today - 89 * 864e5), tomorrow], all: [new Date('2026-10-01'), tomorrow] };
  if (admRange.k === 'custom') return [admDay(admRange.from), new Date(+admDay(admRange.to) + 864e5)];
  return R[admRange.k];
}
const sgn = v => (v < 0 ? '−' : v > 0 ? '+' : '') + money(Math.abs(v));
const tone = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
// кратко для шкалы графика: 4,98 млн ₽ / 12 тыс ₽
const cmp = v => { const a = Math.abs(v), s_ = v < 0 ? '−' : v > 0 ? '+' : ''; return s_ + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' млн' : a >= 1e4 ? Math.round(a / 1e3) + ' тыс' : fmt(a)) + ' ₽'; };
let admData = null;
function admFetch(force) {
  const [f, t] = admRangeDates(), key = `${+f}-${+t}`;
  if (!force && admData && admData.key === key && Date.now() - admData.at < 60000) return admData.p;
  const hours = (t - f) / 36e5 <= 48, bucket = hours ? 'hour' : 'day', args = { p_from: f.toISOString(), p_to: t.toISOString() };
  const p = Promise.all([
    sb.rpc('admin_period', { ...args, p_bucket: bucket }), sb.rpc('admin_upg', { ...args, p_bucket: bucket }), sb.rpc('admin_bets', { ...args, p_bucket: bucket }),
    sb.rpc('admin_cases_period', args), sb.rpc('admin_stats'), sb.from('profiles').select('id, pid, name, data, created_at, is_admin, steamid')
  ]).then(([per, upg, bets, cp, snap, prof]) => {
    if (per.error) throw per.error;
    const by = (arr) => Object.fromEntries((arr || []).map(r => [String(r.t), r]));
    const U = by(upg.data && upg.data.series), B = by(bets.data && bets.data.series);
    // подпись: часы — по вашему времени, дни — дата сервера (UTC)
    const lbl = t_ => { const d = new Date(t_); return hours ? `${pad(d.getHours())}:00` : `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`; };
    const full = t_ => { const d = new Date(t_); return hours ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:00` : `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`; };
    const rows = (per.data.series || []).map(r => {
      const u = U[String(r.t)] || {}, b = B[String(r.t)] || {};
      const cases = +r.spent - +r.won, upgP = (+u.stake || 0) - (+u.won || 0), betsP = +b.profit || 0;
      return { t: r.t, lbl: lbl(r.t), full: full(r.t), peak: +r.peak, avg: +r.avg, visitors: +r.visitors, players: +r.players, reg: +r.reg,
        dep: +r.dep, out: +r.out, flow: +r.dep - +r.out, spent: +r.spent, won: +r.won, cases,
        uN: +u.n || 0, uWins: +u.wins || 0, uStake: +u.stake || 0, uWon: +u.won || 0, upgP,
        bRounds: +b.rounds || 0, bLive: +b.live || 0, bBets: +b.bets || 0, bPlayers: +b.players || 0, bWins: +b.pwins || 0, betsP, game: cases + upgP + betsP };
    });
    // игроки и деньги «сейчас» — по профилям (цены скинов из каталога)
    const P = it => (SK[it.n] && SK[it.n].p) || 0;
    let bal = 0, hold = 0, holdN = 0, depAll = 0, outAll = 0;
    const players = [], csAll = {}, outs = [];
    for (const p of prof.data || []) {
      const d = p.data || {}, inv = d.inv || [], s = d.stats || {};
      let pOut = 0, pHold = 0;
      for (const it of inv) { if (it.st === 'out' || it.st === 'pend') { pOut += P(it); outs.push({ uid: p.id, pid: p.pid, name: p.name, steamid: p.steamid, trade: d.trade || '', n: it.n, p: P(it), ts: +(it.ot || it.ts) || 0, exact: !!it.ot }); } else if (it.st === 'own' || it.st === 'bet') { pHold += P(it); holdN++; } }
      bal += +d.balance || 0; hold += pHold; depAll += +s.dep || 0; outAll += pOut;
      if (s.cs) for (const [id, v] of Object.entries(s.cs)) { const k = csAll[id] = csAll[id] || { n: 0, spent: 0, won: 0 }; k.n += +v.n || 0; k.spent += +v.spent || 0; k.won += +v.won || 0; }
      players.push({ id: p.id, pid: p.pid, name: p.name, admin: p.is_admin, reg: p.created_at, dep: +s.dep || 0, spent: +s.spent || 0, opened: +s.opened || 0, out: pOut, bal: +d.balance || 0, hold: pHold, profit: (+s.dep || 0) - pOut - (+d.balance || 0) - pHold });
    }
    const T = per.data.total, UT = (upg.data && upg.data.total) || {}, BT = (bets.data && bets.data.total) || {};
    const cases = +T.spent - +T.won, upgP = (+UT.stake || 0) - (+UT.won || 0), betsP = +BT.profit || 0;
    return { hours, f, t, rows, T, UT, UX: (upg.data && upg.data.byX) || [], BT, cp: cp.data || [], cpErr: cp.error, betsErr: bets.error, snap: snap.data || {},
      now: { bal, hold, holdN, depAll, outAll, net: depAll - outAll - bal - hold }, players, csAll, outs,
      sum: { cases, upgP, betsP, game: cases + upgP + betsP } };
  });
  admData = { key, at: Date.now(), p }; p.catch(() => { admData = null; });
  return p;
}
/* карточка показателя */
const axKpi = (l, v, sub = '', tn = '') => `<div class="ax-kpi"><span class="ax-l">${l}</span><b class="ax-v ${tn}">${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
const axCard = (title, body, extra = '') => `<section class="ax-card"><header class="ax-ch"><h3>${title}</h3>${extra}</header>${body}</section>`;
/* столбики со знаком (плюс вверх, минус вниз): отмечены лучшие и худшие дни, растут от нуля */
function axBars(rows, val, o = {}) {
  const vs = rows.map(val);
  if (!rows.length || vs.every(v => !v)) return '<div class="ax-empty">Нет данных за период</div>';
  const mp = Math.max(0, ...vs), mn = Math.max(0, ...vs.map(v => -v)), span = mp + mn || 1, z = mp / span;
  const n = o.marks == null ? 3 : o.marks, idx = vs.map((v, i) => i);
  const best = new Set(idx.filter(i => vs[i] > 0).sort((a, b) => vs[b] - vs[a]).slice(0, n)), worst = new Set(idx.filter(i => vs[i] < 0).sort((a, b) => vs[a] - vs[b]).slice(0, n));
  const step = Math.max(1, Math.ceil(rows.length / 14)), f = o.fmt || sgn, fa = o.axis || cmp;
  return `<div class="ax-bars" style="--z:${(z * 100).toFixed(2)}%">
    <div class="ax-y"><span style="top:0">${fa(mp)}</span><span style="top:${(z * 100).toFixed(2)}%">0</span>${mn ? `<span style="top:100%">${fa(-mn)}</span>` : ''}</div>
    <div class="ax-plot"><i class="ax-zero"></i>${rows.map((r, i) => { const v = vs[i], h = Math.abs(v) / span * 100, up = v >= 0;
      const mk = best.has(i) ? `<em class="ax-mk pos" style="${up ? `bottom:${((1 - z) * 100 + h).toFixed(2)}%` : ''}">${f(v)}</em>` : worst.has(i) ? `<em class="ax-mk neg" style="top:${(z * 100 + h).toFixed(2)}%">${f(v)}</em>` : '';
      return `<div class="ax-col${best.has(i) ? ' best' : ''}${worst.has(i) ? ' worst' : ''}${v < 0 ? ' loss' : ''}${o.day ? ' click' : ''}" tabindex="0"${o.day ? ` data-day="${r.t}"` : ''}>
        <i class="ax-bar ${up ? 'up' : 'dn'}" style="${up ? `bottom:${((1 - z) * 100).toFixed(2)}%` : `top:${(z * 100).toFixed(2)}%`};height:${Math.max(v ? .6 : 0, h).toFixed(2)}%;animation-delay:${Math.min(i * 14, 600)}ms"></i>${mk}
        <span class="ax-x">${i % step ? '' : r.lbl}</span>
        <div class="ax-tip"><b>${r.full}</b>${(o.tip ? o.tip(r) : [[o.name || 'Значение', f(v)]]).map(([a, b]) => `<span>${a}<i>${b}</i></span>`).join('')}${o.day ? `<em>${v < 0 ? 'Нажмите — разобрать убыток' : 'Нажмите — весь день'}</em>` : ''}</div></div>`; }).join('')}</div></div>`;
}
/* линии (онлайн): рисуются слева направо */
function axLine(rows, series) {
  if (!rows.length) return '<div class="ax-empty">Нет данных за период</div>';
  const mx = Math.max(1, ...rows.flatMap(r => series.map(([k]) => +r[k]))), n = rows.length, X = i => n === 1 ? 500 : i / (n - 1) * 1000, Y = v => 200 - v / mx * 190;
  const step = Math.max(1, Math.ceil(n / 14));
  return `<div class="ax-line"><div class="ax-y"><span style="top:5%">${fmt(mx)}</span><span style="top:100%">0</span></div>
    <div class="ax-plot"><svg viewBox="0 0 1000 200" preserveAspectRatio="none">${series.map(([k, c]) => `<polyline pathLength="1" class="ax-pl" style="stroke:${c}" points="${rows.map((r, i) => X(i).toFixed(1) + ',' + Y(+r[k]).toFixed(1)).join(' ')}"/>`).join('')}</svg>
      <div class="ax-hov">${rows.map((r, i) => `<div class="ax-col" tabindex="0"><span class="ax-x">${i % step ? '' : r.lbl}</span><div class="ax-tip"><b>${r.full}</b>${series.map(([k, c, l]) => `<span><s style="background:${c}"></s>${l}<i>${String(r[k]).replace('.', ',')}</i></span>`).join('')}</div></div>`).join('')}</div></div></div>
    <div class="ax-leg">${series.map(([, c, l]) => `<span><s style="background:${c}"></s>${l}</span>`).join('')}</div>`;
}
/* таблица: cols — [заголовок, (строка) → значение, класс?]; итоговая строка — необязательна */
function axTable(cols, rows, total) {
  if (!rows.length) return '<div class="ax-empty">Нет данных за период</div>';
  const cell = (c, r) => { const v = c[1](r); return `<td class="${typeof c[2] === 'function' ? c[2](r) : c[2] || ''}">${v == null || v === '' ? '—' : v}</td>`; };
  return `<div class="ax-tw"><table class="ax-t"><thead><tr>${cols.map(c => `<th class="${typeof c[2] === 'string' ? c[2] : ''}">${c[0]}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${cols.map(c => cell(c, r)).join('')}</tr>`).join('')}</tbody>${total ? `<tfoot><tr>${cols.map(c => cell(c, total)).join('')}</tr></tfoot>` : ''}</table></div>`;
}
const num = 'num', tn = k => r => 'num ' + tone(r[k]);
const pctOr = (a, b) => b ? pctS(a / b) : '—';
const dayCol = D => [D.hours ? 'Час' : 'День', r => r.full];
/* ---------- вкладки ---------- */
const ADM_TABS = [['dash', 'Дашборд'], ['money', 'Касса'], ['online', 'Онлайн'], ['cases', 'Кейсы'], ['bets', 'Ставки'], ['upg', 'Апгрейд'], ['out', 'Выводы Steam'], ['players', 'Игроки'], ['shop', 'Управление витриной'], ['tours', 'Турниры']];
function admPeriodBar() {
  const box = $('#axPeriod'); if (!box) return;
  const [f, t] = admRangeDates();
  box.innerHTML = `<div class="ax-seg">${[['today', 'Сегодня'], ['yest', 'Вчера'], ['7d', '7 дней'], ['30d', '30 дней'], ['90d', '90 дней'], ['all', 'Всё время']].map(([k, n]) => `<button data-k="${k}" class="${admRange.k === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="ax-dates"><input type="date" id="axFrom" value="${admIso(f)}"><i>—</i><input type="date" id="axTo" value="${admIso(new Date(+t - 864e5))}"><button class="ax-btn" id="axGo">Показать</button></div>
    <button class="ax-btn" id="axRe" title="Обновить данные">${ic.history || '↻'}</button><button class="ax-btn ax-btn-p" id="axXls">Excel</button>`;
  $$('.ax-seg [data-k]', box).forEach(b => b.onclick = () => { admRange = { k: b.dataset.k }; admPeriodBar(); admDraw(); });
  $('#axGo', box).onclick = () => { const a = $('#axFrom', box).value, b = $('#axTo', box).value; if (!a || !b || a > b) return toast('Проверьте даты', 'err'); admRange = { k: 'custom', from: a, to: b }; admPeriodBar(); admDraw(); };
  $('#axRe', box).onclick = () => { admData = null; admDraw(); };
  $('#axXls', box).onclick = e => admXls(e.currentTarget);
}
async function admTabData(box, render) {
  box.innerHTML = '<div class="ax-load"><span class="spinner"></span>Считаем…</div>';
  let D; try { D = await admFetch(); } catch (e) { return (box.innerHTML = admErr(e) + '<div class="ax-empty">Нужны supabase/stats.sql, admin2.sql, admin_bets.sql, stats_cases.sql.</div>'); }
  if (!$('#admBody') || box !== $('#admBody')) return;
  render(box, D);
  $$('.ax-col[data-day]', box).forEach(c => c.onclick = () => admDayView(c.dataset.day));
}
function axDash(box, D) {
  const T = D.T, s = D.sum, days = D.rows.filter(r => r.game);
  const best = days.slice().sort((a, b) => b.game - a.game)[0], worst = days.slice().sort((a, b) => a.game - b.game)[0];
  const lossDays = D.rows.filter(r => r.game < 0).length;
  // требует внимания: кейсы, отдающие больше 100% (за период от 10 открытий или за всё время от 30), удача ≠ ×1, убыточные дни
  const hot = [];
  D.cp.forEach(r => { const c = caseById(r.c); if (c && +r.n >= 10 && +r.won > +r.spent) hot.push(`Кейс <b>${esc(c.name)}</b> за период отдаёт <b class="neg">${pctS(+r.won / +r.spent)}</b> (${fmt(r.n)} откр., ${sgn(+r.spent - +r.won)})`); });
  Object.entries(D.csAll).forEach(([id, k]) => { const c = caseById(id); if (c && !c.rc && k.n >= 30 && k.won > k.spent && !hot.some(h => h.includes(esc(c.name)))) hot.push(`Кейс <b>${esc(c.name)}</b> за всё время отдаёт <b class="neg">${pctS(k.won / k.spent)}</b> (${sgn(k.spent - k.won)})`); });
  CASES.filter(c => (c.luck || 1) !== 1).forEach(c => hot.push(`У кейса <b>${esc(c.name)}</b> удача ×${(c.luck || 1).toFixed(2).replace('.', ',')} — расчётная отдача ${pctS(caseRtp(c))}`));
  if (+D.UT.stake && +D.UT.won > +D.UT.stake) hot.push(`Апгрейд за период в минусе: <b class="neg">${sgn(upgOr(D))}</b>`);
  if (lossDays) hot.push(`Убыточных ${D.hours ? 'часов' : 'дней'} за период: <b class="neg">${lossDays}</b>`);
  box.innerHTML = `
    <div class="ax-kpis">
      ${axKpi('Чистая прибыль', sgn(D.now.net), 'за всё время: пополнения − выводы − балансы − скины игроков', tone(D.now.net))}
      ${axKpi('Игровая прибыль', sgn(s.game), 'за период: кейсы + апгрейд + ставки', tone(s.game))}
      ${axKpi('Пополнения', money(+T.dep), `${fmt(T.depN)} платежей за период`)}
      ${axKpi('Выведено в Steam', money(+T.out), `${fmt(T.outN)} предм. за период`)}
      ${axKpi('Онлайн сейчас', fmt(+D.snap.online || 0), `пик за период ${fmt(T.peak)}`)}
      ${axKpi('Новые игроки', fmt(+T.reg), `всего ${fmt(+D.snap.users || 0)}`)}
    </div>
    ${axCaseDuo(D)}
    ${axCard(`Игровая прибыль по ${D.hours ? 'часам' : 'дням'}`, axBars(D.rows, r => r.game, { day: !D.hours, name: 'Прибыль', tip: r => [['Кейсы', sgn(r.cases)], ['Апгрейд', sgn(r.upgP)], ['Ставки', sgn(r.betsP)], ['Итого', sgn(r.game)]] }),
      `<div class="ax-note">${best ? `лучший <b class="pos">${best.full} ${sgn(best.game)}</b>` : ''}${worst && worst.game < 0 ? ` · худший <b class="neg">${worst.full} ${sgn(worst.game)}</b>` : ''}</div>`)}
    <div class="ax-g2">
      ${axCard('Из чего прибыль', `<div class="ax-split">${[['Кейсы', s.cases, +T.spent, +T.won, `${fmt(T.opens)} откр.`], ['Апгрейд', s.upgP, +D.UT.stake || 0, +D.UT.won || 0, `${fmt(D.UT.n || 0)} попыток`], ['Ставки', s.betsP, +D.BT.bets || 0, 0, `${fmt(D.BT.live || 0)} раундов с игроками`]]
        .map(([n, v, a, b, sub]) => `<div class="ax-sr"><span>${n}<small>${sub}</small></span><span class="num">${n === 'Ставки' ? (a ? 'ставки ' + money(a) : '—') : a ? 'отдаёт ' + pctS(b / a) : '—'}</span><b class="num ${tone(v)}">${sgn(v)}</b></div>`).join('')}
        <div class="ax-sr ax-sr-t"><span>Итого</span><span></span><b class="num ${tone(s.game)}">${sgn(s.game)}</b></div></div>`)}
      ${axCard('Требует внимания', hot.length ? `<ul class="ax-warn">${hot.slice(0, 8).map(h => `<li>${h}</li>`).join('')}</ul>` : '<div class="ax-empty ok">Всё в порядке</div>')}
    </div>`;
}
/* самый убыточный (больше всех отдал сверх потраченного) и самый популярный кейс: за период, если нет открытий — за всё время */
function axCaseDuo(D) {
  let src = D.cp.map(r => ({ id: r.c, n: +r.n, spent: +r.spent, won: +r.won })), lbl = 'за период';
  if (!src.length) { src = Object.entries(D.csAll).map(([id, k]) => ({ id, n: k.n, spent: k.spent, won: k.won })); lbl = 'за всё время'; }
  src = src.filter(r => { const c = caseById(r.id); return c && !c.rc && r.spent > 0; });
  if (!src.length) return '';
  const sig = src.filter(r => r.n >= 5), worst = (sig.length ? sig : src).slice().sort((a, b) => (b.won - b.spent) - (a.won - a.spent))[0], pop = src.slice().sort((a, b) => b.n - a.n)[0];
  const card = (t, r, line, cls) => { const c = caseById(r.id); return `<a class="ax-case ${cls}" href="#/case/${c.id}"><img src="${caseThumb(c)}" alt=""><span><small>${t} · ${lbl}</small><b>${esc(c.name)}</b><em>${line}</em></span></a>`; };
  return `<div class="ax-g2 ax-duo">${card('Самый убыточный кейс', worst, `отдал ${pctS(worst.won / worst.spent)} · ${sgn(worst.spent - worst.won)} для сайта · ${fmt(worst.n)} откр.`, worst.won > worst.spent ? 'bad' : '')}
    ${card('Самый популярный кейс', pop, `${fmt(pop.n)} открытий · потрачено ${money(pop.spent)} · отдаёт ${pctS(pop.won / pop.spent)}`, '')}</div>`;
}
const upgOr = D => (+D.UT.stake || 0) - (+D.UT.won || 0);
function axMoney(box, D) {
  const T = D.T, N = D.now;
  box.innerHTML = `
    <div class="ax-kpis">
      ${axKpi('Пополнения', money(+T.dep), `${fmt(T.depN)} платежей · средний чек ${T.depN ? money(+T.dep / T.depN) : '—'}`)}
      ${axKpi('Выведено в Steam', money(+T.out), `${fmt(T.outN)} предм.`)}
      ${axKpi('Пополнения − выводы', sgn(+T.dep - +T.out), 'поток денег за период', tone(+T.dep - +T.out))}
      ${axKpi('Игровая прибыль', sgn(D.sum.game), 'кейсы + апгрейд + ставки', tone(D.sum.game))}
      ${axKpi('Начислено админом', sgn(+T.grants), 'начисления минус списания за период')}
      ${axKpi('Чистая прибыль', sgn(N.net), 'за всё время: пополнения − выводы − балансы − скины игроков', tone(N.net))}
    </div>
    ${axCard(`Пополнения − выводы по ${D.hours ? 'часам' : 'дням'}`, axBars(D.rows, r => r.flow, { day: !D.hours, tip: r => [['Пополнения', money(r.dep)], ['Выведено', money(r.out)], ['Разница', sgn(r.flow)]] }))}
    ${axCard(`Игровая прибыль по ${D.hours ? 'часам' : 'дням'}`, axBars(D.rows, r => r.game, { day: !D.hours, tip: r => [['Кейсы', sgn(r.cases)], ['Апгрейд', sgn(r.upgP)], ['Ставки', sgn(r.betsP)], ['Итого', sgn(r.game)]] }))}
    ${axCard('Обязательства перед игроками — сейчас', `<div class="ax-split">
      <div class="ax-sr"><span>На балансах игроков<small>рубли, которые игроки могут потратить</small></span><span></span><b class="num">${money(N.bal)}</b></div>
      <div class="ax-sr"><span>Скины в инвентарях<small>${fmt(N.holdN)} предм. по ценам каталога</small></span><span></span><b class="num">${money(N.hold)}</b></div>
      <div class="ax-sr"><span>R-COIN у игроков</span><span></span><b class="num">${rc(+D.snap.rcoin || 0)}</b></div></div>`)}
    ${axCard(`По ${D.hours ? 'часам' : 'дням'}`, axTable([dayCol(D), ['Пополнения', r => money(r.dep), num], ['Выведено', r => money(r.out), num], ['Поток', r => sgn(r.flow), tn('flow')],
      ['Кейсы', r => sgn(r.cases), tn('cases')], ['Апгрейд', r => sgn(r.upgP), tn('upgP')], ['Ставки', r => sgn(r.betsP), tn('betsP')], ['Игровая прибыль', r => sgn(r.game), tn('game')]],
      D.rows.slice().reverse(), { full: 'Итого', dep: +T.dep, out: +T.out, flow: +T.dep - +T.out, cases: D.sum.cases, upgP: D.sum.upgP, betsP: D.sum.betsP, game: D.sum.game }))}`;
}
function axOnline(box, D) {
  const T = D.T;
  box.innerHTML = `
    <div class="ax-kpis">
      ${axKpi('Онлайн сейчас', fmt(+D.snap.online || 0), 'игроки, активные за 10 мин')}
      ${axKpi('Пик онлайна', fmt(T.peak), 'устройств одновременно')}
      ${axKpi('Средний онлайн', String(T.avg).replace('.', ','), 'устройств одновременно')}
      ${axKpi('Посетители', fmt(T.visitors), 'уникальных устройств')}
      ${axKpi('Игроки', fmt(T.players), 'вошли в аккаунт')}
      ${axKpi('Регистрации', fmt(T.reg), 'новых аккаунтов')}
    </div>
    ${axCard(`Онлайн по ${D.hours ? 'часам' : 'дням'}`, axLine(D.rows, [['peak', '#e5e7eb', 'пик'], ['avg', '#60a5fa', 'средний'], ['visitors', '#a78bfa', 'посетители']]))}
    ${axCard(`По ${D.hours ? 'часам' : 'дням'}`, axTable([dayCol(D), ['Пик', r => fmt(r.peak), num], ['Средний', r => String(r.avg).replace('.', ','), num], ['Посетители', r => fmt(r.visitors), num], ['Игроки', r => fmt(r.players), num], ['Регистрации', r => fmt(r.reg), num]],
      D.rows.slice().reverse(), { full: 'Итого', peak: +T.peak, avg: +T.avg, visitors: +T.visitors, players: +T.players, reg: +T.reg }))}
    <p class="ax-foot">Без админов и тестовых адресов. Посетитель — устройство (браузер). ${D.hours ? '' : 'Дни — по UTC (Москва = UTC+3).'}</p>`;
}
function axCases(box, D) {
  const T = D.T, per = Object.fromEntries(D.cp.map(r => [r.c, r]));
  const list = CASES.filter(c => !c.rc).map(c => { const p = per[c.id] || {}, a = D.csAll[c.id] || {}; return { c, name: c.name, price: c.price, n: +p.n || 0, players: +p.players || 0, spent: +p.spent || 0, won: +p.won || 0, profit: (+p.spent || 0) - (+p.won || 0), an: a.n || 0, aSpent: a.spent || 0, aWon: a.won || 0, aProfit: (a.spent || 0) - (a.won || 0) }; })
    .sort((x, y) => y.spent - x.spent || y.aSpent - x.aSpent);
  const free = +T.spent - D.cp.reduce((x, r) => x + +r.spent, 0);
  box.innerHTML = `
    <div class="ax-kpis">
      ${axKpi('Открыто кейсов', fmt(T.opens), 'за период')}
      ${axKpi('Потрачено', money(+T.spent))}
      ${axKpi('Выдано', money(+T.won))}
      ${axKpi('Кейсы отдают', pctOr(+T.won, +T.spent), 'стоимость выпавшего ÷ потрачено')}
      ${axKpi('Прибыль с кейсов', sgn(D.sum.cases), '', tone(D.sum.cases))}
      ${axKpi('Кейсов на сайте', `${CASES.filter(c => !c.disabled).length} / ${CASES.length}`, 'открыто / всего')}
    </div>
    ${axCard('Кейсы за период и за всё время', axTable([['Кейс', r => `<span class="ax-cs"><img src="${caseThumb(r.c)}" alt="">${esc(r.name)}${r.c.disabled ? ' <i>закрыт</i>' : ''}</span>`], ['Цена', r => money(r.price), num],
      ['Открытий', r => fmt(r.n), num], ['Игроков', r => fmt(r.players), num], ['Потрачено', r => money(r.spent), num], ['Выдано', r => money(r.won), num], ['Отдаёт', r => r.spent ? pctS(r.won / r.spent) : '—', r => 'num ' + (r.spent && r.won > r.spent ? 'neg' : '')], ['Прибыль', r => r.spent ? sgn(r.profit) : '—', tn('profit')],
      ['Всего откр.', r => fmt(r.an), 'num sep'], ['Отдаёт всего', r => r.aSpent ? pctS(r.aWon / r.aSpent) : '—', r => 'num ' + (r.aSpent && r.aWon > r.aSpent ? 'neg' : '')], ['Прибыль всего', r => r.aSpent ? sgn(r.aProfit) : '—', tn('aProfit')]], list),
      free > 1 ? `<div class="ax-note">ещё ${money(free)} — открытия до включения учёта по кейсам</div>` : '')}
    <p class="ax-foot">Изменить кейсы, разделы, метки и порядок — во вкладке «Управление витриной».</p>`;
}
function axBets(box, D) {
  const B = D.BT;
  if (D.betsErr) return (box.innerHTML = admErr(D.betsErr) + '<div class="ax-empty">Запустите supabase/admin_bets.sql в Supabase.</div>');
  box.innerHTML = `
    <div class="ax-kpis">
      ${axKpi('Раундов', fmt(+B.rounds || 0), `с игроками — ${fmt(+B.live || 0)}`)}
      ${axKpi('Игроков ставило', fmt(+B.players || 0))}
      ${axKpi('Ставки игроков', money(+B.bets || 0), `весь банк ${money(+B.pot || 0)}`)}
      ${axKpi('Побед игроков', fmt(+B.pwins || 0), +B.live ? `из ${fmt(B.live)} раундов с игроками` : '')}
      ${axKpi('Прибыль со ставок', sgn(+B.profit || 0), 'боты — это сайт', tone(+B.profit || 0))}
      ${axKpi('Самый большой банк', money(+B.maxPot || 0))}
    </div>
    ${axCard(`Прибыль со ставок по ${D.hours ? 'часам' : 'дням'}`, axBars(D.rows, r => r.betsP, { day: !D.hours, tip: r => [['Раундов с игроками', fmt(r.bLive)], ['Ставки игроков', money(r.bBets)], ['Побед игроков', fmt(r.bWins)], ['Прибыль', sgn(r.betsP)]] }))}
    ${axCard(`По ${D.hours ? 'часам' : 'дням'}`, axTable([dayCol(D), ['Раундов', r => fmt(r.bRounds), num], ['С игроками', r => fmt(r.bLive), num], ['Игроков', r => fmt(r.bPlayers), num], ['Ставки игроков', r => money(r.bBets), num], ['Побед игроков', r => fmt(r.bWins), num], ['Прибыль', r => sgn(r.betsP), tn('betsP')]],
      D.rows.slice().reverse(), { full: 'Итого', bRounds: +B.rounds || 0, bLive: +B.live || 0, bPlayers: +B.players || 0, bBets: +B.bets || 0, bWins: +B.pwins || 0, betsP: +B.profit || 0 }))}
    <p class="ax-foot">Прибыль раунда: выиграл бот — сайту ставки игроков; выиграл игрок — ставки игроков минус весь банк.</p>`;
}
function axUpg(box, D) {
  const U = D.UT, pr = upgOr(D);
  const band = lo => lo === 20 ? 'x20+' : `x${String(lo).replace('.', ',')}–${{ 1: '1,5', 1.5: '2', 2: '3', 3: '5', 5: '10', 10: '20' }[lo]}`;
  box.innerHTML = `
    <div class="ax-kpis">
      ${axKpi('Апгрейдов', fmt(+U.n || 0), `${fmt(+U.players || 0)} игроков · средний ×${String(U.avgX || 0).replace('.', ',')}`)}
      ${axKpi('Побед', pctOr(+U.wins || 0, +U.n || 0), `${fmt(+U.wins || 0)} из ${fmt(+U.n || 0)}`)}
      ${axKpi('Поставлено', money(+U.stake || 0))}
      ${axKpi('Выдано', money(+U.won || 0), +U.stake ? `отдаёт ${pctS(+U.won / +U.stake)}` : '')}
      ${axKpi('Прибыль с апгрейда', sgn(pr), '', tone(pr))}
      ${axKpi('Крупнейший выигрыш', money(+U.maxWin || 0), +U.maxX ? `×${(+U.maxX).toFixed(1).replace('.', ',')}` : '')}
    </div>
    ${axCard(`Прибыль с апгрейда по ${D.hours ? 'часам' : 'дням'}`, axBars(D.rows, r => r.upgP, { day: !D.hours, tip: r => [['Попыток', fmt(r.uN)], ['Побед', fmt(r.uWins)], ['Поставлено', money(r.uStake)], ['Выдано', money(r.uWon)], ['Прибыль', sgn(r.upgP)]] }))}
    <div class="ax-g2">
      ${axCard('По множителям', axTable([['Множитель', r => band(+r.lo)], ['Попыток', r => fmt(r.n), num], ['Побед', r => pctOr(+r.wins, +r.n), num], ['Отдаёт', r => pctOr(+r.won, +r.stake), r => 'num ' + (+r.won > +r.stake ? 'neg' : '')], ['Прибыль', r => sgn(+r.stake - +r.won), r => 'num ' + tone(+r.stake - +r.won)]], D.UX))}
      ${axCard(`По ${D.hours ? 'часам' : 'дням'}`, axTable([dayCol(D), ['Попыток', r => fmt(r.uN), num], ['Побед', r => fmt(r.uWins), num], ['Поставлено', r => money(r.uStake), num], ['Прибыль', r => sgn(r.upgP), tn('upgP')]], D.rows.filter(r => r.uN).reverse()))}
    </div>`;
}
function axPlayers(box, D) {
  const top = D.players.filter(p => p.dep || p.spent || p.bal || p.hold).sort((a, b) => b.profit - a.profit);
  const N = D.now;
  box.innerHTML = `
    <div class="ax-kpis">
      ${axKpi('Игроков всего', fmt(+D.snap.users || D.players.length), `+${fmt(+D.snap.new24 || 0)} за сутки`)}
      ${axKpi('Новых за период', fmt(+D.T.reg))}
      ${axKpi('Активных за период', fmt(+D.T.players), 'вошли в аккаунт')}
      ${axKpi('Пополнили (всего)', fmt(D.players.filter(p => p.dep > 0).length), `на ${money(N.depAll)}`)}
      ${axKpi('На балансах', money(N.bal))}
      ${axKpi('Прибыль с игроков', sgn(N.net), 'пополнили − вывели − балансы − скины', tone(N.net))}
    </div>
    ${axCard('Игроки по прибыли для сайта — за всё время', axTable([['Игрок', r => `${plink(r.pid, esc(r.name))}${r.admin ? ' <i class="ax-tag">админ</i>' : ''}`], ['Пополнил', r => money(r.dep), num], ['Потратил на кейсы', r => money(r.spent), num], ['Открыл', r => fmt(r.opened), num], ['Вывел', r => money(r.out), num], ['Баланс', r => money(r.bal), num], ['Скины', r => money(r.hold), num], ['Прибыль сайта', r => sgn(r.profit), tn('profit')], ['С нами с', r => new Date(r.reg).toLocaleDateString('ru-RU'), 'num']], top.slice(0, 50)))}
    <h2 class="ax-h2">Поиск и управление</h2><div id="axPlayersMgr"></div>`;
  admPlayers($('#axPlayersMgr', box));
}
/* ---------- день целиком: клик по дню на графике → всё за этот день (по часам), разбор, если день убыточный ---------- */
async function admDayView(t0) {
  const f = new Date(t0), t = new Date(+f + 864e5), args = { p_from: f.toISOString(), p_to: t.toISOString() };
  const ttl = `${pad(f.getUTCDate())}.${pad(f.getUTCMonth() + 1)}.${f.getUTCFullYear()}`;
  const m = modal(`<div class="ax ax-day"><h2>${ttl}</h2><div id="axDayB"><div class="ax-load"><span class="spinner"></span>Считаем день…</div></div></div>`, 'm-axday');
  const [per, upg, bets, cp, top] = await Promise.all([sb.rpc('admin_period', { ...args, p_bucket: 'hour' }), sb.rpc('admin_upg', { ...args, p_bucket: 'hour' }), sb.rpc('admin_bets', { ...args, p_bucket: 'hour' }), sb.rpc('admin_cases_period', args), sb.rpc('admin_day_top', args)]);
  const box = $('#axDayB', m); if (!box) return;
  if (per.error) return (box.innerHTML = admErr(per.error));
  const T = per.data.total, U = (upg.data && upg.data.total) || {}, B = (bets.data && bets.data.total) || {};
  const by = a => Object.fromEntries((a || []).map(r => [String(r.t), r])), UB = by(upg.data && upg.data.series), BB = by(bets.data && bets.data.series);
  const rows = (per.data.series || []).map(r => { const u = UB[String(r.t)] || {}, b = BB[String(r.t)] || {}, cases = +r.spent - +r.won, upgP = (+u.stake || 0) - (+u.won || 0), betsP = +b.profit || 0;
    const d = new Date(r.t); return { t: r.t, lbl: pad(d.getHours()), full: `${pad(d.getHours())}:00–${pad(d.getHours() + 1 === 24 ? 0 : d.getHours() + 1)}:00`, cases, upgP, betsP, game: cases + upgP + betsP }; });
  const cases = +T.spent - +T.won, upgP = (+U.stake || 0) - (+U.won || 0), betsP = +B.profit || 0, game = cases + upgP + betsP;
  const cl = (cp.data || []).map(r => ({ c: caseById(r.c), id: r.c, n: +r.n, players: +r.players, spent: +r.spent, won: +r.won, profit: +r.spent - +r.won })).sort((a, b) => a.profit - b.profit);
  // разбор: из чего сложился минус
  let why = '';
  if (game < 0) {
    const parts = [['Кейсы', cases], ['Апгрейд', upgP], ['Ставки', betsP]].filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
    const badCases = cl.filter(r => r.profit < 0).slice(0, 5);
    const tips = [];
    parts.forEach(([n, v]) => tips.push(`<b>${n}</b> в минусе на <b class="neg">${money(-v)}</b> — ${Math.round(-v / -game * 100)}% от убытка дня`));
    badCases.forEach(r => tips.push(`Кейс <b>${esc(r.c ? r.c.name : r.id)}</b>: открыли ${fmt(r.n)} раз, отдал <b class="neg">${pctS(r.won / (r.spent || 1))}</b> (${sgn(r.profit)}) — проверьте наполнение и удачу`));
    if (upgP < 0 && +U.n) tips.push(`Апгрейд: ${fmt(U.n)} попыток, побед ${pctS((+U.wins || 0) / (+U.n || 1))} — сравните с вкладкой «Апгрейд» по множителям`);
    (top.data || []).slice(0, 3).forEach(w => tips.push(`Крупный выигрыш: ${plink(w.pid, esc(w.name || 'игрок'))} — ${w.kind === 'upg' ? `апгрейд ×${(+w.x).toFixed(1).replace('.', ',')}` : `кейс «${esc((caseById(w.c) || {}).name || w.c || '')}»`} ${sgn(-w.net)} для сайта`));
    if (!tips.length) tips.push('Минус небольшой и без одной явной причины — это обычный разброс.');
    why = `<section class="ax-card ax-why"><header class="ax-ch"><h3>Разбор: почему день в минусе</h3></header><ul class="ax-warn">${tips.map(x => `<li>${x}</li>`).join('')}</ul></section>`;
  }
  box.innerHTML = `
    <div class="ax-kpis">
      ${axKpi('Игровая прибыль', sgn(game), '', tone(game))}${axKpi('Кейсы', sgn(cases), `${fmt(T.opens)} откр. · отдают ${pctOr(+T.won, +T.spent)}`, tone(cases))}
      ${axKpi('Апгрейд', sgn(upgP), `${fmt(+U.n || 0)} попыток · побед ${pctOr(+U.wins || 0, +U.n || 0)}`, tone(upgP))}${axKpi('Ставки', sgn(betsP), `${fmt(+B.live || 0)} раундов с игроками`, tone(betsP))}
      ${axKpi('Пополнения', money(+T.dep), `${fmt(T.depN)} платежей`)}${axKpi('Выведено в Steam', money(+T.out), `${fmt(T.outN)} предм.`)}
    </div>
    <div class="ax-kpis ax-kpis-s">${axKpi('Пик онлайна', fmt(T.peak))}${axKpi('Посетители', fmt(T.visitors))}${axKpi('Игроки', fmt(T.players))}${axKpi('Регистрации', fmt(T.reg))}${axKpi('Ставки игроков', money(+B.bets || 0))}${axKpi('Начислено админом', sgn(+T.grants))}</div>
    ${why}
    ${axCard('Игровая прибыль по часам', axBars(rows, r => r.game, { marks: 2, tip: r => [['Кейсы', sgn(r.cases)], ['Апгрейд', sgn(r.upgP)], ['Ставки', sgn(r.betsP)], ['Итого', sgn(r.game)]] }))}
    ${axCard('Кейсы за день — сколько отдал и сколько забрал', axTable([['Кейс', r => r.c ? `<span class="ax-cs"><img src="${caseThumb(r.c)}" alt="">${esc(r.c.name)}</span>` : esc(r.id)], ['Открытий', r => fmt(r.n), num], ['Игроков', r => fmt(r.players), num], ['Забрал у игроков', r => money(r.spent), num], ['Отдал игрокам', r => money(r.won), num], ['Отдаёт', r => pctS(r.won / (r.spent || 1)), r => 'num ' + (r.won > r.spent ? 'neg' : '')], ['Итог для сайта', r => sgn(r.profit), tn('profit')]], cl.slice().sort((a, b) => b.spent - a.spent)))}
    ${(top.data || []).length ? axCard('Крупнейшие выигрыши игроков', axTable([['Время', r => new Date(r.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })], ['Игрок', r => plink(r.pid, esc(r.name || '—'))], ['Где', r => r.kind === 'upg' ? `апгрейд ×${(+r.x).toFixed(1).replace('.', ',')}` : `кейс «${esc((caseById(r.c) || {}).name || r.c || '')}»${+r.x > 1 ? ' ×' + r.x : ''}`], ['Поставил', r => money(+r.amount), num], ['Получил', r => money(+r.won), num], ['Для сайта', r => sgn(-r.net), 'num neg']], top.data)) : ''}`;
}
/* ---------- выводы в Steam: заявки игроков с трейд-ссылкой и Steam-профилем ---------- */
function axOut(box, D) {
  const [f, t] = [D.f, D.t];
  const all = D.outs.slice().sort((a, b) => b.ts - a.ts), inP = all.filter(o => o.ts >= +f && o.ts < +t);
  box.innerHTML = `
    <div class="ax-kpis">
      ${axKpi('Выводов за период', fmt(inP.length), money(inP.reduce((a, o) => a + o.p, 0)))}
      ${axKpi('Выводов всего', fmt(all.length), money(all.reduce((a, o) => a + o.p, 0)))}
      ${axKpi('Игроков выводило', fmt(new Set(all.map(o => o.uid)).size))}
      ${axKpi('Без трейд-ссылки', fmt(all.filter(o => !o.trade).length), 'у игрока ссылка удалена')}
      ${axKpi('Средний вывод', all.length ? money(all.reduce((a, o) => a + o.p, 0) / all.length) : '—')}
      ${axKpi('Крупнейший', all.length ? money(Math.max(...all.map(o => o.p))) : '—')}
    </div>
    ${axCard('Предметы, выведенные в Steam', axTable([['Дата', r => new Date(r.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + (r.exact ? '' : ' <i class="ax-tag" title="время дропа: заявка сделана до учёта времени вывода">≈</i>')],
      ['Игрок', r => plink(r.pid, esc(r.name)) + (r.pid ? ` <i class="ax-tag">#${r.pid}</i>` : '')], ['Предмет', r => { const s = SK[r.n]; return s ? `<span class="ax-cs"><img src="${imgUrl(s, 's')}" alt="">${esc(s.name)}</span>` : esc(r.n); }], ['Цена', r => money(r.p), num],
      ['Трейд-ссылка', r => r.trade ? `<span class="ax-acts"><a class="ax-btn ax-sm" href="${esc(r.trade)}" target="_blank" rel="noopener">Открыть</a><button class="ax-btn ax-sm" data-act="copy" data-copy="${esc(r.trade)}">Копировать</button></span>` : '<span class="neg">нет ссылки</span>'],
      ['Steam', r => r.steamid ? `<a class="ax-btn ax-sm" href="https://steamcommunity.com/profiles/${encodeURIComponent(r.steamid)}" target="_blank" rel="noopener">Профиль</a>` : '<span class="ax-mute">вход по почте</span>']], all))}
    <p class="ax-foot">Автовывода через Lis-Skins пока нет: предметы отправляются вручную по трейд-ссылке. «≈» — у старых заявок время вывода не записывалось, показано время дропа.</p>`;
}
function admDraw() {
  const box = $('#admBody'); if (!box) return;
  $$('#admTabs [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === admTab));
  if (!sb) return (box.innerHTML = admErr({ message: 'нет связи с базой' }));
  const R = { dash: axDash, money: axMoney, online: axOnline, cases: axCases, bets: axBets, upg: axUpg, out: axOut, players: axPlayers };
  if (admTab === 'tours') return admTours(box);
  if (admTab === 'shop') return admCases(box);
  admTabData(box, R[admTab] || axDash);
}
/* ---------- выгрузка статистики в Excel (.xlsx, библиотека SheetJS грузится по кнопке) ---------- */
let xlsxLib = null;
const loadXlsx = () => xlsxLib || (xlsxLib = new Promise((res, rej) => {
  if (window.XLSX) return res(window.XLSX);
  const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = () => res(window.XLSX); s.onerror = () => { xlsxLib = null; rej(new Error('не загрузилась библиотека Excel')); }; document.head.appendChild(s);
}));
async function admXls(btn) {
  const [f, t] = admRangeDates(), hours = (t - f) / 36e5 <= 48, bucket = hours ? 'hour' : 'day';
  const was = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Готовим…';
  try {
    const args = { p_from: f.toISOString(), p_to: t.toISOString() };
    const [X, per, upg, cp, profs] = await Promise.all([
      loadXlsx(), sb.rpc('admin_period', { ...args, p_bucket: bucket }), sb.rpc('admin_upg', { ...args, p_bucket: bucket }),
      sb.rpc('admin_cases_period', args), sb.from('profiles').select('data')]);
    if (per.error) throw per.error;
    const T = per.data.total, S = per.data.series || [], U = (upg.data && upg.data.total) || {}, US = (upg.data && upg.data.series) || [], UX = (upg.data && upg.data.byX) || [];
    const n = v => Math.round((+v || 0) * 100) / 100, pc = (a, b) => (+b ? n(+a / +b * 1e4) / 1e4 : null);
    const d2 = x => { const d = new Date(x); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
    const tl = x => { const d = new Date(x); return hours ? `${d2(x)} ${pad(d.getHours())}:00` : `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`; }; // сервер считает дни по UTC
    const period = `${d2(f)} — ${d2(new Date(+t - 1))}`;
    // форматы ячеек: деньги, проценты, целые
    const RUB = '#,##0.00 "₽"', PCT = '0.0%', INT = '#,##0';
    const sheet = (rows, fmts, widths) => {
      const ws = X.utils.aoa_to_sheet(rows);
      rows.forEach((r, i) => r.forEach((v, j) => { const z = typeof fmts === 'function' ? fmts(i, j, v) : fmts[j]; const c = ws[X.utils.encode_cell({ r: i, c: j })]; if (c && typeof v === 'number' && z) c.z = z; }));
      ws['!cols'] = widths.map(w => ({ wch: w }));
      return ws;
    };
    const wb = X.utils.book_new();
    // 1) сводка
    const profit = +T.dep - +T.out, cProfit = +T.spent - +T.won, uProfit = +U.stake - +U.won;
    const sum = [['RUSH CASE — статистика', ''], ['Период', period], ['Выгружено', d2(new Date()) + ' ' + new Date().toLocaleTimeString('ru-RU')], ['Примечание', hours ? 'часы — по вашему времени' : 'дни на листе «По дням» — по UTC (Москва = UTC+3)'], [],
      ['ОНЛАЙН', ''], ['Пик онлайна (одновременно)', +T.peak], ['Средний онлайн', +T.avg], ['Посетителей', +T.visitors], ['Игроков (с аккаунтом)', +T.players], ['Регистраций', +T.reg], [],
      ['ДЕНЬГИ', ''], ['Пополнения', n(T.dep)], ['Пополнений, шт.', +T.depN], ['Средний чек', T.depN ? n(+T.dep / T.depN) : 0], ['Выведено в Steam', n(T.out)], ['Выводов, предм.', +T.outN],
      ['Пополнения − выводы', n(profit)], ['Ставки (банк)', n(T.jp)], ['Начислено админом', n(T.grants)], [],
      ['КЕЙСЫ', ''], ['Открытий', +T.opens], ['Потрачено на кейсы', n(T.spent)], ['Выдано из кейсов', n(T.won)], ['Кейсы отдают', pc(T.won, T.spent)], ['Прибыль с кейсов', n(cProfit)], [],
      ['АПГРЕЙД', ''], ['Апгрейдов', +U.n || 0], ['Игроков', +U.players || 0], ['Побед', pc(U.wins, U.n)], ['Поставлено', n(U.stake)], ['Выдано', n(U.won)], ['Апгрейд отдаёт', pc(U.won, U.stake)], ['Прибыль с апгрейда', n(uProfit)], ['Крупнейший выигрыш', n(U.maxWin)]];
    const moneyRows = new Set(['Пополнения', 'Средний чек', 'Выведено в Steam', 'Пополнения − выводы', 'Ставки (банк)', 'Начислено админом', 'Потрачено на кейсы', 'Выдано из кейсов', 'Прибыль с кейсов', 'Поставлено', 'Выдано', 'Прибыль с апгрейда', 'Крупнейший выигрыш']);
    X.utils.book_append_sheet(wb, sheet(sum, (i, j) => j !== 1 ? null : moneyRows.has(sum[i][0]) ? RUB : /отда|Побед/.test(sum[i][0]) ? PCT : sum[i][0] === 'Средний онлайн' ? '0.0' : INT, [34, 26]), 'Сводка');
    // 2) по дням / часам: онлайн, деньги, кейсы, апгрейд
    const ux = Object.fromEntries(US.map(r => [String(r.t), r]));
    const head = [hours ? 'Час' : 'День', 'Пик онлайна', 'Средний онлайн', 'Посетители', 'Игроки', 'Регистрации', 'Пополнения', 'Выведено в Steam', 'Пополнения − выводы', 'Потрачено на кейсы', 'Выдано из кейсов', 'Прибыль с кейсов', 'Кейсы отдают', 'Поставлено в апгрейд', 'Выдано апгрейдом', 'Прибыль с апгрейда'];
    const rows = S.map(r => { const u = ux[String(r.t)] || {}; return [tl(r.t), +r.peak, +r.avg, +r.visitors, +r.players, +r.reg, n(r.dep), n(r.out), n(+r.dep - +r.out), n(r.spent), n(r.won), n(+r.spent - +r.won), pc(r.won, r.spent), n(u.stake), n(u.won), n(+(u.stake || 0) - +(u.won || 0))]; });
    const tot = ['ИТОГО', +T.peak, +T.avg, +T.visitors, +T.players, +T.reg, n(T.dep), n(T.out), n(profit), n(T.spent), n(T.won), n(cProfit), pc(T.won, T.spent), n(U.stake), n(U.won), n(uProfit)];
    const fm2 = [null, INT, '0.0', INT, INT, INT, RUB, RUB, RUB, RUB, RUB, RUB, PCT, RUB, RUB, RUB];
    const ws2 = sheet([head, ...rows, tot], (i, j) => i ? fm2[j] : null, [hours ? 18 : 12, 12, 14, 12, 10, 12, 16, 16, 18, 18, 18, 16, 13, 18, 16, 18]);
    ws2['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };
    X.utils.book_append_sheet(wb, ws2, hours ? 'По часам' : 'По дням');
    // 3) кейсы: за период (по журналу открытий) + за всё время (по профилям игроков) + настройки
    const per_ = Object.fromEntries(((cp.data) || []).map(r => [r.c, r]));
    const all = {};
    for (const p of (profs.data || [])) { const cs = p.data && p.data.stats && p.data.stats.cs; if (cs) for (const [id, v] of Object.entries(cs)) { const k = all[id] = all[id] || { n: 0, spent: 0, won: 0 }; k.n += +v.n || 0; k.spent += +v.spent || 0; k.won += +v.won || 0; } }
    const blockName = c => { const b = CASE_BLOCKS.find(x => x.id === caseBlockId(c)); return b ? b.t : ''; };
    const ch = ['Кейс', 'ID', 'Раздел', 'Цена', 'Статус', 'Удача', 'Расчётная окупаемость', 'Дороже кейса (шанс)',
      'Открытий за период', 'Игроков за период', 'Потрачено за период', 'Выдано за период', 'Отдаёт за период', 'Прибыль за период',
      'Открытий всего', 'Потрачено всего', 'Выдано всего', 'Отдаёт всего', 'Прибыль всего'];
    const cr = CASES.slice().sort((a, b) => ((per_[b.id] && +per_[b.id].spent) || 0) - ((per_[a.id] && +per_[a.id].spent) || 0) || a.price - b.price).map(c => {
      const p = per_[c.id] || {}, a = all[c.id] || {};
      return [c.name, c.id, blockName(c), c.price, c.disabled ? 'закрыт' : 'открыт', c.luck || 1, n(caseRtp(c) * 1e4) / 1e4, n(caseWin(c) * 1e4) / 1e4,
        +p.n || 0, +p.players || 0, n(p.spent), n(p.won), pc(p.won, p.spent), n((+p.spent || 0) - (+p.won || 0)),
        +a.n || 0, n(a.spent), n(a.won), pc(a.won, a.spent), n((+a.spent || 0) - (+a.won || 0))];
    });
    const sp = (cp.data || []).reduce((x, r) => x + +r.spent, 0), wn = (cp.data || []).reduce((x, r) => x + +r.won, 0);
    if (+T.spent - sp > 1) cr.push(['Без учёта кейса', '—', '', null, '', null, null, null, null, null, n(+T.spent - sp), n(+T.won - wn), pc(+T.won - wn, +T.spent - sp), n((+T.spent - sp) - (+T.won - wn)), null, null, null, null, null]);
    const fm3 = [null, null, null, RUB, null, '0.00', PCT, PCT, INT, INT, RUB, RUB, PCT, RUB, INT, RUB, RUB, PCT, RUB];
    const ws3 = sheet([ch, ...cr], (i, j, v) => i ? (j === 3 && CASES.find(c => c.name === cr[i - 1][0] && c.rc) ? '#,##0 "R-COIN"' : fm3[j]) : null, [22, 12, 22, 12, 9, 7, 13, 12, 12, 11, 14, 14, 12, 14, 12, 14, 14, 11, 14]);
    ws3['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cr.length, c: ch.length - 1 } }) };
    X.utils.book_append_sheet(wb, ws3, 'Кейсы');
    // 4) апгрейд по множителям
    const band = lo => lo === 20 ? 'x20+' : `x${String(lo).replace('.', ',')}–${{ 1: '1,5', 1.5: '2', 2: '3', 3: '5', 5: '10', 10: '20' }[lo]}`;
    const uh = ['Множитель', 'Попыток', 'Побед', '% побед', 'Поставлено', 'Выдано', 'Отдаёт', 'Прибыль'];
    const ur = UX.map(r => [band(+r.lo), +r.n, +r.wins, pc(r.wins, r.n), n(r.stake), n(r.won), pc(r.won, r.stake), n(+r.stake - +r.won)]);
    ur.push(['ИТОГО', +U.n || 0, +U.wins || 0, pc(U.wins, U.n), n(U.stake), n(U.won), pc(U.won, U.stake), n(uProfit)]);
    X.utils.book_append_sheet(wb, sheet([uh, ...ur], (i, j) => i ? [null, INT, INT, PCT, RUB, RUB, PCT, RUB][j] : null, [12, 10, 10, 10, 16, 16, 10, 16]), 'Апгрейд');
    X.writeFile(wb, `RUSH_CASE_статистика_${admIso(f)}_${admIso(new Date(+t - 1))}.xlsx`, { compression: true });
    toast(`Выгружено: ${period}${cp.error ? ' · по кейсам за период нет данных — запустите supabase/stats_cases.sql' : ''}`, cp.error ? 'info' : undefined);
  } catch (e) { toast('Не выгружено: ' + (e.message || e), 'err'); }
  btn.disabled = false; btn.innerHTML = was;
}
/* ---------- кейсы: закрыть / открыть, множитель удачи ---------- */
/* сохранить правки кейсов / разделов в site_cfg; пустая правка кейса — удаляется (кейс как в коде) */
async function cfgSave(rows) {
  const up = rows.filter(r => r.v != null && !(typeof r.v === 'object' && !Array.isArray(r.v) && !Object.keys(r.v).length));
  const del = rows.filter(r => !up.includes(r)).map(r => r.k);
  const now = new Date().toISOString();
  if (up.length) { const { error } = await sb.from('site_cfg').upsert(up.map(r => ({ k: r.k, v: r.v, updated_at: now }))); if (error) return error; }
  if (del.length) { const { error } = await sb.from('site_cfg').delete().in('k', del); if (error) return error; }
  return null;
}
const cfgErr = e => toast('Не сохранено: ' + e.message + (/site_cfg/.test(e.message) ? ' — запустите supabase/site_cfg.sql' : ''), 'err');
/* правка кейса → caseCfg + применить на месте + загрузить кейсы на сервер */
async function caseCfgPut(changes) { // { id: правка | null }
  const rows = Object.entries(changes).map(([id, v]) => ({ k: 'case:' + id, v }));
  const e = await cfgSave(rows); if (e) { cfgErr(e); return false; }
  Object.entries(changes).forEach(([id, v]) => { if (v && Object.keys(v).length) caseCfg[id] = v; else delete caseCfg[id]; const c = caseById(id); if (c) { applyCaseCfg(c); applyLuck(c, c.luck || 1); } });
  CASES.sort((a, b) => a.price - b.price);
  admSync();
  return true;
}
function admCases(box) {
  const row = (c, i, n) => {
    const l = c.luck || 1, nw = isNewCase(c), ht = isHitCase(c), ov = !c.custom && caseCfg[c.id] && Object.keys(caseCfg[c.id]).some(k => !['hit', 'ord'].includes(k));
    return `<div class="adm-case${c.disabled ? ' off' : ''}" data-id="${c.id}">
      <span class="ac-ord"><button class="ac-up" title="Выше"${i ? '' : ' disabled'}>▲</button><button class="ac-dn" title="Ниже"${i < n - 1 ? '' : ' disabled'}>▼</button></span>
      <img src="${caseThumb(c)}" alt="" loading="lazy">
      <div class="ac-n"><b>${esc(c.name)}${c.custom ? ' <i class="ac-own">из панели</i>' : ''}${ov ? ' <i class="ac-own ac-ov">изменён</i>' : ''}</b><span>${c.rc ? c.price + ' R-COIN' : money(c.price)} · ${c.items.length} предм.</span>
        <span class="ac-acts"><button class="ac-edit">${ic.edit || '✎'}Изменить</button><button class="ac-tg${nw ? ' on' : ''}" data-tg="isNew">Новое</button><button class="ac-tg ac-hit${ht ? ' on' : ''}" data-tg="hit">Хит</button>${c.custom ? '<button class="ac-del">Удалить</button>' : ''}</span></div>
      <div class="ac-m"><span>Окупаемость</span><b class="ac-rtp">${pctS(caseRtp(c))}</b></div>
      <div class="ac-m"><span>Дороже кейса</span><b class="ac-win">${pctS(caseWin(c))}</b></div>
      <div class="ac-luck"><span>Удача <b class="ac-lv">×${l.toFixed(2)}</b></span><input type="range" min="0.5" max="3" step="0.05" value="${l}" class="ac-r"></div>
      <label class="switch ac-sw"><input type="checkbox" class="ac-open"${c.disabled ? '' : ' checked'}><i></i><span>${c.disabled ? 'Закрыт' : 'Открыт'}</span></label>
      <button class="btn btn-primary btn-sm ac-save" disabled>Сохранить</button>
    </div>`;
  };
  const groups = CASE_BLOCKS.map(b => ({ b, list: blockCases(b) }));
  box.innerHTML = `<div class="adm-panel"><div class="adm-ph"><h3>Кейсы</h3><span class="adm-ph-acts"><button class="btn btn-ghost btn-sm" id="acBlocks">${ic.menu || ''}Разделы</button><button class="btn btn-ghost btn-sm" id="acCloseAll">Закрыть все</button><button class="btn btn-ghost btn-sm" id="acOpenAll">Открыть все</button><button class="btn btn-primary btn-sm" id="acNew">${ic.plus}Создать кейс</button></span><p>«Изменить» — название, цена, картинка, раздел и наполнение любого кейса. Стрелки — порядок внутри раздела. «Новое» и «Хит» — метки на карточке (хиты показываются в популярных на главной). «Удача» умножает шанс всех предметов дороже кейса. Изменения у игроков — после обновления страницы.</p></div>
    ${groups.map(({ b, list }) => `<div class="ac-grp" style="--bc:${b.a}"><div class="ac-gh"><b>${esc(b.t)}</b><span>${list.length} ${plural(list.length, 'кейс', 'кейса', 'кейсов')}</span></div>
      <div class="adm-cases">${list.length ? list.map((c, i) => row(c, i, list.length)).join('') : '<div class="empty">Пусто — перенесите сюда кейс через «Изменить»</div>'}</div></div>`).join('')}</div>`;
  $('#acNew', box).onclick = () => admCaseEditor(null, () => admCases(box));
  $('#acBlocks', box).onclick = () => admBlocks(() => admCases(box));
  // все кейсы разом: удача у каждого остаётся своя
  const setAll = async (off, btn) => {
    if (off && !confirm('Закрыть все кейсы? Игроки не смогут их открывать, пока вы не откроете обратно.')) return;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    const now = new Date().toISOString();
    const { error } = await sb.from('case_settings').upsert(CASES.map(c => ({ id: c.id, disabled: off, luck: c.luck || 1, updated_at: now, updated_by: st.user.id })));
    if (error) { btn.disabled = false; btn.textContent = off ? 'Закрыть все' : 'Открыть все'; return toast('Не сохранено: ' + error.message, 'err'); }
    CASES.forEach(c => { c.disabled = off; });
    toast(off ? `Закрыто кейсов: ${CASES.length}` : `Открыто кейсов: ${CASES.length}`); admCases(box);
  };
  $('#acCloseAll', box).onclick = e => setAll(true, e.currentTarget);
  $('#acOpenAll', box).onclick = e => setAll(false, e.currentTarget);
  $$('.adm-case', box).forEach(el => {
    const c = caseById(el.dataset.id), r = $('.ac-r', el), sw = $('.ac-open', el), save = $('.ac-save', el);
    $('.ac-edit', el).onclick = () => admCaseEditor(c.custom ? customCaseRows.find(x => x.id === c.id) : null, () => admCases(box), c.custom ? null : c);
    // метки «Новое» / «Хит» — сразу
    $$('.ac-tg', el).forEach(b => b.onclick = async () => {
      const k = b.dataset.tg, on = !b.classList.contains('on'); b.disabled = true;
      if (k === 'isNew' && c.custom) {
        const { error } = await sb.from('custom_cases').update({ is_new: on }).eq('id', c.id);
        if (error) { b.disabled = false; return toast('Не сохранено: ' + error.message, 'err'); }
        const rw = customCaseRows.find(x => x.id === c.id); if (rw) rw.is_new = on; c.isNew = on;
      } else if (!(await caseCfgPut({ [c.id]: { ...(caseCfg[c.id] || {}), [k]: on } }))) { b.disabled = false; return; }
      toast(`«${esc(c.name)}»: ${k === 'hit' ? 'Хит' : 'Новое'} ${on ? 'включено' : 'выключено'}`); admCases(box);
    });
    // порядок внутри раздела: всем кейсам раздела проставляем номера и меняем местами соседей
    const move = async d => {
      const list = blockCases(CASE_BLOCKS.find(b => b.id === caseBlockId(c))), i = list.indexOf(c), j = i + d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      const ch = {}; list.forEach((x, k) => { if (caseOrd(x) !== k) ch[x.id] = { ...(caseCfg[x.id] || {}), ord: k }; });
      if (await caseCfgPut(ch)) admCases(box);
    };
    $('.ac-up', el).onclick = () => move(-1); $('.ac-dn', el).onclick = () => move(1);
    const dl = $('.ac-del', el); if (dl) dl.onclick = async () => {
      if (!confirm(`Удалить кейс «${c.name}»? Игроки больше не смогут его открыть (уже выпавшие скины останутся).`)) return;
      const { error } = await sb.from('custom_cases').delete().eq('id', c.id);
      if (error) return toast('Не удалено: ' + error.message, 'err');
      removeCustomCase(c.id); customCaseRows = customCaseRows.filter(x => x.id !== c.id); toast(`Кейс «${esc(c.name)}» удалён`); admCases(box);
    };
    const preview = () => {
      const was = c.luck || 1; applyLuck(c, +r.value);
      $('.ac-lv', el).textContent = '×' + (+r.value).toFixed(2); $('.ac-rtp', el).textContent = pctS(caseRtp(c)); $('.ac-win', el).textContent = pctS(caseWin(c));
      $('.ac-rtp', el).classList.toggle('hot', caseRtp(c) > 1);
      applyLuck(c, was);
      $('.ac-sw span', el).textContent = sw.checked ? 'Открыт' : 'Закрыт'; el.classList.toggle('off', !sw.checked);
      save.disabled = +r.value === (c.luck || 1) && sw.checked === !c.disabled;
    };
    r.oninput = preview; sw.onchange = preview;
    save.onclick = async () => {
      save.disabled = true; save.innerHTML = '<span class="spinner"></span>';
      const { error } = await sb.from('case_settings').upsert({ id: c.id, disabled: !sw.checked, luck: +r.value, updated_at: new Date().toISOString(), updated_by: st.user.id });
      save.textContent = 'Сохранить';
      if (error) { save.disabled = false; return toast('Не сохранено: ' + error.message, 'err'); }
      c.disabled = !sw.checked; applyLuck(c, +r.value); preview();
      toast(`«${esc(c.name)}»: ${c.disabled ? 'закрыт' : 'открыт'}, удача ×${(+r.value).toFixed(2)}, окупаемость ${pctS(caseRtp(c))}`);
    };
  });
}
/* ---------- разделы витрины: название, подпись, значок, цвет, порядок; создать / удалить ---------- */
const BLOCK_ICONS = ['fire', 'trophy', 'crown', 'gem', 'bolt', 'globe', 'trend', 'gift', 'star', 'knife', 'box', 'shield', 'users', 'coins', 'leaf', 'eye'];
function admBlocks(done) {
  const B = CASE_BLOCKS.map(b => ({ id: b.id, t: b.t, sub: b.sub || '', wm: b.wm || '', ic: b.ic || 'box', a: b.a || '#f3c14f', ...(b.rc ? { rc: true } : {}) }));
  const m = modal(`<div class="ced abl"><h2>Разделы витрины</h2><p class="abl-note">Порядок — как на главной и на странице «Кейсы». Кейсы удалённого раздела переходят в первый раздел. Бонусный раздел (R-COIN) удалить нельзя.</p>
    <div class="abl-list" id="ablList"></div>
    <div class="ced-foot"><button class="btn btn-ghost" id="ablAdd">${ic.plus}Добавить раздел</button><span style="flex:1"></span><button class="btn btn-ghost" id="ablCancel">Отмена</button><button class="btn btn-primary btn-lg" id="ablSave">Сохранить</button></div></div>`, 'm-ced');
  const draw = () => {
    $('#ablList', m).innerHTML = B.map((b, i) => `<div class="abl-row" data-i="${i}" style="--bc:${b.a}">
      <span class="ac-ord"><button data-mv="-1"${i ? '' : ' disabled'}>▲</button><button data-mv="1"${i < B.length - 1 ? '' : ' disabled'}>▼</button></span>
      <select class="inp abl-ic" data-f="ic">${BLOCK_ICONS.map(k => `<option value="${k}"${k === b.ic ? ' selected' : ''}>${k}</option>`).join('')}</select>
      <input class="inp" data-f="t" value="${esc(b.t)}" placeholder="Название раздела" maxlength="40">
      <input class="inp" data-f="sub" value="${esc(b.sub)}" placeholder="Подпись" maxlength="120">
      <input class="inp abl-wm" data-f="wm" value="${esc(b.wm)}" placeholder="Метка" maxlength="12">
      <input class="inp ced-color" data-f="a" type="color" value="${esc(b.a)}">
      <span class="abl-n">${blockCases(CASE_BLOCKS.find(x => x.id === b.id) || { id: b.id }).length}</span>
      <button class="ced-x" data-del title="Удалить раздел"${b.rc && B.filter(x => x.rc).length < 2 ? ' disabled' : ''}>×</button></div>`).join('');
    $$('.abl-row', m).forEach(el => {
      const i = +el.dataset.i;
      $$('[data-f]', el).forEach(inp => inp.oninput = () => { B[i][inp.dataset.f] = inp.value; if (inp.dataset.f === 'a') el.style.setProperty('--bc', inp.value); });
      $$('[data-mv]', el).forEach(btn => btn.onclick = () => { const j = i + +btn.dataset.mv; [B[i], B[j]] = [B[j], B[i]]; draw(); });
      $('[data-del]', el).onclick = () => { if (!confirm(`Удалить раздел «${B[i].t}»? Его кейсы перейдут в первый раздел.`)) return; B.splice(i, 1); draw(); };
    });
  };
  $('#ablAdd', m).onclick = () => { B.push({ id: 'b' + Date.now().toString(36), t: 'Новый раздел', sub: '', wm: 'NEW', ic: 'star', a: '#f3c14f' }); draw(); const l = $('#ablList', m); l.scrollTop = l.scrollHeight; };
  $('#ablCancel', m).onclick = closeModal;
  $('#ablSave', m).onclick = async () => {
    if (B.some(b => !b.t.trim())) return toast('У каждого раздела должно быть название', 'err');
    const btn = $('#ablSave', m); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    const v = B.map(b => ({ ...b, t: b.t.trim(), sub: b.sub.trim(), wm: b.wm.trim() || b.t.trim().slice(0, 8).toUpperCase() }));
    const e = await cfgSave([{ k: 'blocks', v }]);
    if (e) { btn.disabled = false; btn.textContent = 'Сохранить'; return cfgErr(e); }
    CASE_BLOCKS.splice(0, CASE_BLOCKS.length, ...v.map(b => ({ ...b, ids: [] })));
    closeModal(); toast('Разделы сохранены'); done && done();
  };
  draw();
}
/* ---------- редактор кейса: создание кейса в панели, правка кейса из панели (row) или кейса из кода (base) ---------- */
function admCaseEditor(row, done, base) {
  const edit = !!(row || base), d = base && CASE_DEF[base.id];
  const E = base ? { id: base.id, name: base.name, price: base.price, img: base.img, ar: base.ar, accent: base.th.a, block: caseBlockId(base), isNew: isNewCase(base), hit: isHitCase(base), sub: base.sub || '', rtp: 80,
      items: base.items.map(s => ({ n: s.name, ch: (s.ch0 != null ? s.ch0 : s.ch) * 100 })) }
    : { id: row ? row.id : '', name: row ? row.name : '', price: row ? +row.price : 100, img: row ? row.img : '', accent: row ? row.accent : '#f5c76b',
      block: row ? row.block : (CASE_BLOCKS.find(b => !b.rc) || CASE_BLOCKS[0]).id, isNew: row ? row.is_new : true, hit: row ? isHitCase(caseById(row.id) || {}) : false, sub: row ? row.sub || '' : '', rtp: 80,
      items: row ? row.items.filter(it => SK[it.n]).map(it => ({ n: SK[it.n].name, ch: +it.ch * 100 })).filter((x, i, A) => A.findIndex(y => y.n === x.n) === i) : [] };
  let itemsDirty = false;
  const blocks = CASE_BLOCKS.filter(b => !!b.rc === !!(base && base.rc));
  const m = modal(`<div class="ced">
    <h2>${edit ? `Изменить кейс «${esc(E.name)}»` : 'Новый кейс'}</h2>
    <div class="ced-grid">
      <div class="ced-left">
        <label class="ced-img" id="cedImgBox">${E.img ? `<img src="${esc(E.img)}" alt="">` : `<span>${ic.plus}Загрузить картинку<small>PNG/WebP с прозрачным фоном</small></span>`}<input type="file" id="cedFile" accept="image/png,image/webp,image/jpeg" hidden></label>
        <div class="field"><label>Или ссылка на картинку</label><input class="inp" id="cedImg" value="${esc(E.img)}" placeholder="https://…"></div>
      </div>
      <div class="ced-right">
        <div class="row2"><div class="field"><label>ID (латиница)</label><input class="inp" id="cedId" value="${esc(E.id)}" placeholder="my_case" ${edit ? 'disabled' : ''}></div>
          <div class="field"><label>Название</label><input class="inp" id="cedName" value="${esc(E.name)}" placeholder="ЗОЛОТОЙ ДРАКОН" maxlength="30"></div></div>
        <div class="row2"><div class="field"><label>Цена, ${base && base.rc ? 'R-COIN' : '₽'}</label><input class="inp" id="cedPrice" type="number" min="1" step="1" value="${E.price}"></div>
          <div class="field"><label>Раздел</label><select class="inp" id="cedBlock">${blocks.map(b => `<option value="${b.id}"${b.id === E.block ? ' selected' : ''}>${esc(b.t)}</option>`).join('')}</select></div></div>
        <div class="row2"><div class="field"><label>Цвет подсветки</label><input class="inp ced-color" id="cedAccent" type="color" value="${esc(E.accent)}"></div>
          <div class="ced-flags"><label class="check ced-new"><input type="checkbox" id="cedNew"${E.isNew ? ' checked' : ''}><span>Метка «НОВОЕ»</span></label><label class="check ced-new"><input type="checkbox" id="cedHit"${E.hit ? ' checked' : ''}><span>Метка «ХИТ»</span></label></div></div>
        <div class="field"><label>Описание (необязательно)</label><input class="inp" id="cedSub" value="${esc(E.sub)}" maxlength="240" placeholder="Например: только ножи от 5 000 ₽"></div>
      </div>
    </div>
    <div class="ced-items">
      <div class="ced-ih"><h3>Предметы</h3><div class="search"><input class="inp" id="cedQ" placeholder="Найти скин в каталоге: AK-47, Karambit, Азимов…" autocomplete="off">${ic.search}</div></div>
      <div class="ced-found" id="cedFound"></div>
      <div class="ced-list" id="cedList"></div>
      <div class="ced-sum" id="cedSum"></div>
    </div>
    <div class="ced-foot">${base && caseCfg[base.id] ? '<button class="btn btn-ghost" id="cedReset">Вернуть как было</button><span style="flex:1"></span>' : ''}<button class="btn btn-ghost" id="cedCancel">Отмена</button><button class="btn btn-primary btn-lg" id="cedSave">${edit ? 'Сохранить изменения' : 'Создать кейс'}</button></div>
  </div>`, 'm-ced');
  const v = id => $('#' + id, m);
  const price = () => +v('cedPrice').value || 0;
  // поиск скинов по каталогу
  v('cedQ').oninput = () => {
    const q = v('cedQ').value.trim().toLowerCase(), box = v('cedFound');
    if (q.length < 2) return (box.innerHTML = '');
    const res = UPG_CAT.filter(s => s.name.toLowerCase().includes(q) && !E.items.some(x => x.n === s.name)).slice(0, 24);
    box.innerHTML = res.length ? res.map(s => `<button class="ced-fi r-${s.r}" data-n="${esc(s.name)}"><img src="${imgUrl(s, 's')}" alt=""><span>${esc(s.name)}</span><b>${money(s.p)}</b></button>`).join('') : '<div class="empty">Ничего не найдено</div>';
    $$('[data-n]', box).forEach(b => b.onclick = () => { E.items.push({ n: b.dataset.n, ch: 0 }); itemsDirty = true; b.remove(); draw(); });
  };
  const draw = () => {
    E.items.sort((a, b) => SK[b.n].p - SK[a.n].p);
    v('cedList').innerHTML = E.items.length ? `<div class="ced-row ced-h"><span>Предмет</span><span>Цена</span><span>Шанс, %</span><span></span></div>` + E.items.map((it, i) => { const s = SK[it.n]; return `<div class="ced-row r-${s.r}${s.p >= price() ? ' up' : ''}">
      <span class="ced-it"><img src="${imgUrl(s, 's')}" alt="">${esc(s.name)}</span><b>${money(s.p)}</b>
      <input class="inp" type="number" min="0" step="0.0001" value="${+(+it.ch).toFixed(6)}" data-i="${i}"><button class="ced-x" data-x="${i}" title="Убрать">×</button></div>`; }).join('')
      : '<div class="empty">Добавьте предметы через поиск выше (минимум 3)</div>';
    $$('[data-i]', m).forEach(inp => inp.oninput = () => { E.items[+inp.dataset.i].ch = +inp.value || 0; itemsDirty = true; sum(); });
    $$('[data-x]', m).forEach(b => b.onclick = () => { E.items.splice(+b.dataset.x, 1); itemsDirty = true; draw(); });
    sum();
  };
  const sum = () => {
    const tot = E.items.reduce((a, x) => a + x.ch, 0), p = price();
    const ev = tot ? E.items.reduce((a, x) => a + x.ch / tot * SK[x.n].p, 0) : 0, win = tot ? E.items.reduce((a, x) => a + (SK[x.n].p >= p ? x.ch / tot : 0), 0) : 0;
    const rtp = p ? ev / p : 0;
    v('cedSum').innerHTML = `<div class="ced-auto"><span>Окупаемость</span><input class="inp" id="cedRtp" type="number" min="10" max="150" step="1" value="${E.rtp}"><span>%</span><button class="btn btn-dark btn-sm" id="cedCalc">Рассчитать шансы</button></div>
      <div class="ced-m"><span>Сумма шансов</span><b class="${Math.abs(tot - 100) > .01 ? 'warn' : ''}">${tot.toFixed(3).replace('.', ',')}%</b></div>
      <div class="ced-m"><span>Окупаемость</span><b class="${rtp > 1 ? 'neg' : ''}">${tot ? pctS(rtp) : '—'}</b></div>
      <div class="ced-m"><span>Дороже кейса</span><b>${tot ? pctS(win) : '—'}</b></div>`;
    v('cedRtp').oninput = () => { E.rtp = +v('cedRtp').value || 80; };
    v('cedCalc').onclick = () => {
      if (E.items.length < 2) return toast('Добавьте хотя бы 2 предмета', 'err');
      const its = E.items.map(x => SK[x.n]), target = price() * E.rtp / 100;
      if (target < Math.min(...its.map(s => s.p)) || target > Math.max(...its.map(s => s.p))) return toast('Такую окупаемость не получить из этих предметов — добавьте дешевле или дороже', 'err');
      const ch = solveChances(its, target); E.items.forEach((x, i) => { x.ch = ch[i] * 100; }); itemsDirty = true; draw();
    };
  };
  v('cedPrice').oninput = draw;
  // картинка: загрузка в хранилище Supabase или ссылка; соотношение сторон — по самой картинке
  const setImg = url => {
    E.img = url; v('cedImg').value = url; v('cedImgBox').innerHTML = `<img src="${esc(url)}" alt=""><input type="file" id="cedFile" accept="image/png,image/webp,image/jpeg" hidden>`; bindFile();
    const im = new Image(); im.onload = () => { if (im.naturalHeight) E.ar = Math.round(im.naturalWidth / im.naturalHeight * 1e4) / 1e4; }; im.src = url;
  };
  const bindFile = () => { v('cedFile').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5e6) return toast('Картинка больше 5 МБ', 'err');
    const box = v('cedImgBox'); box.classList.add('busy');
    const path = `${(v('cedId').value || 'case').replace(/[^a-z0-9_-]/gi, '')}-${Date.now()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`;
    const { error } = await sb.storage.from('case-img').upload(path, file, { upsert: true, contentType: file.type });
    box.classList.remove('busy');
    if (error) return toast('Не загружено: ' + error.message, 'err');
    setImg(sb.storage.from('case-img').getPublicUrl(path).data.publicUrl);
  }; };
  bindFile();
  v('cedImg').onchange = () => { const u = v('cedImg').value.trim(); if (u) setImg(u); };
  v('cedCancel').onclick = closeModal;
  const rs = v('cedReset'); if (rs) rs.onclick = async () => {
    if (!confirm(`Вернуть кейс «${base.name}» к исходному виду из кода? Пропадут все правки: название, цена, картинка, раздел, метки, порядок, наполнение.`)) return;
    rs.disabled = true; if (await caseCfgPut({ [base.id]: null })) { closeModal(); toast(`«${esc(base.name)}» — как было`); done && done(); } else rs.disabled = false;
  };
  v('cedSave').onclick = async () => {
    const id = v('cedId').value.trim().toLowerCase(), name = v('cedName').value.trim(), p = price(), tot = E.items.reduce((a, x) => a + x.ch, 0);
    if (!base && !/^[a-z0-9_-]{2,32}$/.test(id)) return toast('ID: 2–32 символа, латиница, цифры, _ и -', 'err');
    if (!edit && caseById(id)) return toast('Кейс с таким ID уже есть', 'err');
    if (!name) return toast('Введите название', 'err');
    if (!(p > 0)) return toast('Введите цену', 'err');
    if (!E.img) return toast('Добавьте картинку кейса', 'err');
    if (E.items.length < 3) return toast('Нужно минимум 3 предмета', 'err');
    if (!(tot > 0) || E.items.some(x => !(x.ch > 0))) return toast('У каждого предмета должен быть шанс больше 0 — или нажмите «Рассчитать шансы»', 'err');
    const b = v('cedSave'); b.disabled = true; b.innerHTML = '<span class="spinner"></span>Сохраняем…';
    const fail = () => { b.disabled = false; b.textContent = edit ? 'Сохранить изменения' : 'Создать кейс'; };
    const blk = v('cedBlock').value, isNew = v('cedNew').checked, hit = v('cedHit').checked, sub = v('cedSub').value.trim(), acc = v('cedAccent').value;
    if (base) {
      // кейс из кода: храним только то, что отличается от исходного
      const o = { ...(caseCfg[id] || {}) }, set = (k, val, def) => { if (val === def || val == null) delete o[k]; else o[k] = val; };
      set('name', name, d.name); set('sub', sub, d.sub || ''); set('price', p, d.price); set('a', acc, d.a);
      set('img', E.img, d.img); if (o.img && E.ar) o.ar = E.ar; else delete o.ar;
      set('block', blk, DEF_BLOCK[id] || (base.rc ? 'bonusrc' : 'pop')); set('isNew', isNew, NEW_CASES.includes(id)); set('hit', hit, HOME_POP.includes(id));
      if (blk !== caseBlockId(base)) delete o.ord; // в новом разделе — в конец по умолчанию
      if (itemsDirty) o.items = E.items.map(x => ({ n: x.n, ch: Math.round(x.ch / tot * 1e8) / 1e8 }));
      if (!(await caseCfgPut({ [id]: o }))) return fail();
      closeModal(); toast(`Кейс «${esc(name)}» обновлён — у игроков после обновления страницы`); done && done(); return;
    }
    const rec = { id, name, price: p, img: E.img, accent: acc, block: blk, is_new: isNew, sub: sub || null,
      items: E.items.map(x => ({ n: x.n, ch: Math.round(x.ch / tot * 1e8) / 1e8 })), updated_at: new Date().toISOString() };
    const { error } = await sb.from('custom_cases').upsert(rec);
    if (error) { fail(); return toast('Не сохранено: ' + error.message, 'err'); }
    customCaseRows = customCaseRows.filter(x => x.id !== id).concat(rec);
    const c = addCustomCase(rec);
    if (c && hit !== isHitCase(c) && !(await caseCfgPut({ [id]: { ...(caseCfg[id] || {}), hit } }))) return fail();
    const st_ = (await sb.from('case_settings').select('disabled, luck').eq('id', id).maybeSingle()).data; if (c && st_) { c.disabled = st_.disabled; applyLuck(c, +st_.luck || 1); }
    closeModal(); toast(`Кейс «${esc(name)}» ${edit ? 'обновлён' : 'создан'} — уже на сайте`); done && done();
  };
  draw();
}
/* ---------- игроки: поиск, начисление баланса ---------- */
let admQ = '';
async function admPlayers(box) {
  box.innerHTML = `<div class="adm-panel"><div class="adm-ph"><h3>Игроки</h3>
      <div class="search adm-search"><input class="inp" id="admQ" placeholder="ID, ник или e-mail" value="${esc(admQ)}" autocomplete="off">${ic.search}</div></div>
    <div id="admList"><div class="adm-load"><span class="spinner"></span>Загружаем игроков…</div></div></div>`;
  let t = 0;
  $('#admQ').oninput = e => { admQ = e.target.value.trim(); clearTimeout(t); t = setTimeout(load, 350); };
  const load = async () => {
    const list = $('#admList'); if (!list) return;
    const { data, error } = await sb.rpc('admin_players', { p_q: admQ, p_limit: 100 });
    if (error) return (list.innerHTML = admErr(error));
    if (!data.length) return (list.innerHTML = `<div class="empty">${ic.users}Никого не нашли</div>`);
    const ago = ts => { const m = (Date.now() - Date.parse(ts)) / 60000; return m < 10 ? '<em class="on">онлайн</em>' : m < 60 ? Math.round(m) + ' мин назад' : m < 1440 ? Math.round(m / 60) + ' ч назад' : new Date(ts).toLocaleDateString('ru-RU'); };
    list.innerHTML = `<div class="adm-tbl"><div class="at-h"><span>Игрок</span><span>Баланс</span><span>Открыто</span><span>Потрачено</span><span>Удача</span><span>Был</span><span></span></div>
      ${data.map(p => `<div class="at-r" data-uid="${p.id}" data-name="${esc(p.name)}" data-luck="${+p.luck || 1}" data-pid="${p.pid || ''}">
        <span class="at-u">${ava({ name: p.name }, 'xs')}<span><b>${p.pid ? `<i class="at-id">#${p.pid}</i>` : ''}${plink(p.pid, esc(p.name))}${p.is_admin ? ' <i class="at-adm">админ</i>' : ''}</b><small>${esc(p.email || '')} · с ${new Date(p.created_at).toLocaleDateString('ru-RU')}</small></span></span>
        <span class="at-bal">${money(+p.balance)}<small>R ${rc(+p.rcoin)}</small></span><span>${fmt(+p.opened)}</span><span>${money(+p.spent)}</span><span><button class="at-luck${(+p.luck || 1) > 1 ? ' up' : (+p.luck || 1) < 1 ? ' dn' : ''}">×${(+p.luck || 1).toFixed(2).replace('.', ',')}</button></span><span>${ago(p.last_seen)}</span>
        <span><button class="btn btn-dark btn-sm at-give">${ic.plus}Начислить</button></span></div>`).join('')}</div>`;
    $$('.at-give', list).forEach(b => b.onclick = () => { const r = b.closest('.at-r'); admGive(r.dataset.uid, r.dataset.name, load); });
    $$('.at-luck', list).forEach(b => b.onclick = () => { const r = b.closest('.at-r'); admLuck(r.dataset.uid, r.dataset.name, r.dataset.pid, +r.dataset.luck, load); });
  };
  load();
}
/* личная удача игрока: ×шанс дорогого дропа в кейсах и ×шанс апгрейда; применяется у игрока в течение 30 с */
function admLuck(uid, name, pid, cur, done) {
  const m = modal(`<div class="dep adm-give"><h2>Удача <em>${esc(name)}</em>${pid ? ` <small class="at-id">#${pid}</small>` : ''}</h2>
    <p class="dep-sub">Множитель шансов игрока: в кейсах — шанс предметов дороже кейса, в апгрейде — шанс победы (игрок видит изменённый шанс на колесе). ×1 — как у всех. Применится у игрока в течение 30 секунд.</p>
    <div class="al-val"><b id="alV">×${cur.toFixed(2).replace('.', ',')}</b><span id="alHint"></span></div>
    <input type="range" id="alR" min="0.1" max="5" step="0.05" value="${cur}" class="ac-r">
    <div class="al-prev" id="alPrev"></div>
    <div class="amounts">${[0.25, 0.5, 1, 1.5, 2, 3, 5].map(a => `<button data-a="${a}">×${String(a).replace('.', ',')}</button>`).join('')}</div>
    <button class="btn btn-primary btn-xl btn-block" id="alGo" style="margin-top:16px">Сохранить</button></div>`, 'm-dep');
  const r = $('#alR', m), upd = () => { const v = +r.value; $('#alV', m).textContent = '×' + v.toFixed(2).replace('.', ','); $('#alV', m).className = v > 1 ? 'up' : v < 1 ? 'dn' : '';
    admLuckPrev(m, v); $('#alHint', m).textContent = v === 1 ? 'обычные шансы' : v > 1 ? `шансы выше в ${v.toFixed(2).replace('.', ',')} раза` : `шансы ниже в ${(1 / v).toFixed(2).replace('.', ',')} раза`; };
  r.oninput = upd; $$('[data-a]', m).forEach(b => b.onclick = () => { r.value = b.dataset.a; upd(); }); upd();
  $('#alGo', m).onclick = async () => {
    const go = $('#alGo', m); go.disabled = true; go.innerHTML = '<span class="spinner"></span>Сохраняем…';
    const { error } = await sb.rpc('admin_set_luck', { p_uid: uid, p_luck: +r.value });
    if (error) { go.disabled = false; go.textContent = 'Сохранить'; return toast('Не сохранено: ' + error.message, 'err'); }
    closeModal(); toast(`${esc(name)}: удача ×${(+r.value).toFixed(2).replace('.', ',')}`);
    if (st.user && uid === st.user.id) syncLuck();
    done && done();
  };
}
// что изменит удача: шанс дропа дороже кейса и окупаемость для игрока в нескольких кейсах
function admLuckPrev(m, L) {
  const calc = (c, L) => { let t = 0, w = 0, ev = 0; c.items.forEach(s => { const ch = s.ch * (s.p >= c.price ? L : 1); t += ch; if (s.p >= c.price) w += ch; ev += ch * s.p; }); return [w / t, ev / t / c.price]; };
  const list = CASES.filter(c => !c.rc && !c.disabled).sort((a, b) => a.price - b.price).filter((c, i, A) => i % Math.ceil(A.length / 5) === 0).slice(0, 5);
  $('#alPrev', m).innerHTML = `<div class="alp-h"><span>Кейс</span><span>Дроп дороже кейса</span><span>Окупаемость для игрока</span></div>` + list.map(c => { const [w0, r0] = calc(c, 1), [w1, r1] = calc(c, L);
    return `<div class="alp-r"><span>${esc(c.name)}</span><span>${pctS(w0)} → <b class="${L > 1 ? 'up' : L < 1 ? 'dn' : ''}">${pctS(w1)}</b></span><span>${pctS(r0)} → <b class="${r1 > 1 ? 'dn' : ''}">${pctS(r1)}</b></span></div>`; }).join('')
    + `<div class="alp-n">Апгрейд: шанс ×${L.toFixed(2).replace('.', ',')} (например, x2: 46% → ${pctS(Math.min(.8, .46 * L))}). Это вероятности — на одном-двух открытиях эффект может быть не виден.</div>`;
}
function admGive(uid, name, done) {
  const m = modal(`<div class="dep adm-give"><h2>Начислить <em>${esc(name)}</em></h2>
    <p class="dep-sub">Сумма поступит игроку в течение 30 секунд (или при следующем входе). Отрицательная сумма — списание.</p>
    <div class="dep-amt"><input class="inp" id="agAmt" type="number" step="1" value="100"><span>₽</span></div>
    <div class="amounts">${[50, 100, 500, 1000, 5000].map(a => `<button data-a="${a}">+${fmt(a)} ₽</button>`).join('')}</div>
    <div class="field" style="margin-top:12px"><input class="inp" id="agNote" maxlength="120" placeholder="Комментарий (увидит игрок), например: компенсация"></div>
    <button class="btn btn-primary btn-xl btn-block" id="agGo" style="margin-top:16px">Начислить</button></div>`, 'm-dep');
  $$('[data-a]', m).forEach(b => b.onclick = () => { $('#agAmt', m).value = b.dataset.a; });
  $('#agGo', m).onclick = async () => {
    const amount = +$('#agAmt', m).value, note = $('#agNote', m).value.trim();
    if (!amount) return toast('Введите сумму', 'err');
    const go = $('#agGo', m); go.disabled = true; go.innerHTML = '<span class="spinner"></span>Начисляем…';
    const { error } = await sb.rpc('admin_grant', { p_uid: uid, p_amount: amount, p_note: note || null });
    if (error) { go.disabled = false; go.textContent = 'Начислить'; return toast('Не начислено: ' + error.message, 'err'); }
    closeModal(); toast(`${esc(name)}: ${amount > 0 ? '+' : ''}${money(amount)} — отправлено`);
    if (st.user && uid === st.user.id) claimGrants();
    done && done();
  };
}

/* =========================================================
   ROUTER
   ========================================================= */
/* =========================================================
   ТУРНИРЫ CS2 (этап 1): команды в профиле, приглашения, список турниров, страница турнира, регистрация капитаном.
   Сервер — supabase/tournaments.sql (все изменения через функции, прямая запись закрыта).
   ========================================================= */
const TOUR_ST = { draft: ['Черновик', 'st-mute'], reg: ['Регистрация открыта', 'st-ok'], closed: ['Регистрация закрыта', 'st-warn'], live: ['Идёт', 'st-live'], done: ['Завершён', 'st-mute'] };
const TOUR_MAPS = ['Ancient', 'Anubis', 'Dust2', 'Inferno', 'Mirage', 'Nuke', 'Train', 'Overpass', 'Vertigo'];
const TEAM_MAX = 10;
const fmtName = f => `${f}x${f}`;
const tourDate = d => d ? new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '—';
const countdown = d => { const s = Math.max(0, Math.floor((new Date(d) - Date.now()) / 1000)); const dd = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60; return dd ? `${dd} д ${h} ч` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`; };
const TEAM_COLS = 'id, name, tag, logo, captain, created_at';
const teamLogo = (t, cls = '') => t.logo ? `<span class="tm-logo ${cls}"><img src="${esc(t.logo)}" alt=""></span>` : `<span class="tm-logo ${cls} tm-logo-t">${esc((t.tag || '?').slice(0, 3))}</span>`;
const steamUrl = id => `https://steamcommunity.com/profiles/${id}`;
const steamLogin = () => { location.href = SB_URL + '/functions/v1/steam-auth?start=1&ret=' + encodeURIComponent(location.origin + location.pathname); };
async function players(ids) {
  const u = [...new Set(ids.filter(Boolean))]; if (!u.length || !sb) return {};
  const { data } = await sb.from('players_pub').select('id, name, ava, pid, steamid').in('id', u);
  return Object.fromEntries((data || []).map(p => [p.id, p]));
}
async function myTeam() {
  if (!sb || !st.user || !st.user.sb) return null;
  const { data: m } = await sb.from('team_members').select('team_id').eq('uid', st.user.id).maybeSingle();
  if (!m) return null;
  const [{ data: t }, { data: mem }] = await Promise.all([sb.from('teams').select(TEAM_COLS).eq('id', m.team_id).maybeSingle(), sb.from('team_members').select('uid, joined_at').eq('team_id', m.team_id).order('joined_at')]);
  if (!t) return null;
  t.members = mem || []; t.isCap = t.captain === st.user.id; return t;
}
/* загрузка картинки в хранилище: логотип — в папку игрока, баннер — админ */
async function uploadImg(bucket, file, prefix) {
  if (!file) return null;
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast('Нужна картинка PNG, JPG или WEBP', 'err'); return null; }
  if (file.size > 3e6) { toast('Картинка больше 3 МБ', 'err'); return null; }
  const path = `${prefix}/${Date.now()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (error) { toast('Не загружено: ' + error.message, 'err'); return null; }
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/* ---------- список турниров ---------- */
let tourTab = 'active';
function pageTours() {
  return `<section class="container trn">
    <div class="page-head trn-head"><div><h1>Турниры <em>CS2</em></h1><p>Собери команду, зарегистрируйся на турнир и забирай призы. Бан карт, сервер и трансляция — всё здесь.</p></div>
      <a class="btn btn-dark" href="#/profile/team">${ic.users}Моя команда</a></div>
    <div class="seg trn-seg" id="trnTabs"><button data-t="active">Активные</button><button data-t="done">Прошедшие</button></div>
    <div id="trnList" class="trn-grid"><div class="top-load"><span class="spinner"></span>Загружаем турниры…</div></div>
  </section>`;
}
async function mountTours() {
  $$('#trnTabs button').forEach(b => b.onclick = () => { tourTab = b.dataset.t; drawTours(); });
  drawTours();
}
async function drawTours() {
  $$('#trnTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tourTab));
  const box = $('#trnList'); if (!box) return;
  if (!sb) { box.innerHTML = `<div class="top-empty"><b>Нет связи с сервером</b></div>`; return; }
  const q = sb.from('tournaments').select('id, title, format, max_teams, prize_pool, banner, starts_at, reg_end, status').order('starts_at', { ascending: tourTab === 'active', nullsFirst: false });
  const { data, error } = await (tourTab === 'active' ? q.in('status', ['reg', 'closed', 'live']) : q.eq('status', 'done'));
  if (!$('#trnList')) return;
  if (error) { box.innerHTML = `<div class="top-empty"><b>Турниры не загрузились</b><span>${esc(error.message)}</span></div>`; return; }
  const ids = (data || []).map(t => t.id);
  const { data: regs } = ids.length ? await sb.from('tournament_teams').select('tournament_id').in('tournament_id', ids) : { data: [] };
  const cnt = {}; (regs || []).forEach(r => { cnt[r.tournament_id] = (cnt[r.tournament_id] || 0) + 1; });
  box.innerHTML = (data || []).length ? data.map(t => {
    const s = TOUR_ST[t.status] || TOUR_ST.reg, n = cnt[t.id] || 0;
    const when = t.status === 'reg' && t.starts_at ? `<span class="trn-cd" data-cd="${esc(t.starts_at)}">${ic.clock}<b>${countdown(t.starts_at)}</b> до старта</span>` : `<span class="trn-cd">${ic.clock}${tourDate(t.starts_at)}</span>`;
    return `<a class="trn-card" href="#/tournament/${t.id}">
      <div class="trn-ban"${t.banner ? ` style="background-image:url('${esc(t.banner)}')"` : ''}>${t.banner ? '' : `<span class="trn-ban-ph">${ic.trophy}</span>`}
        <span class="trn-st ${s[1]}">${s[0]}</span><span class="trn-fmt">${fmtName(t.format)}</span></div>
      <div class="trn-body"><h3>${esc(t.title)}</h3>
        <div class="trn-prize"><small>Призовой фонд</small><b>${esc(t.prize_pool || '—')}</b></div>
        <div class="trn-slots"><div><span>Команды</span><b>${n} / ${t.max_teams}</b></div><div class="bn-bar"><i style="width:${Math.min(100, n / t.max_teams * 100)}%"></i></div></div>
        ${when}</div></a>`;
  }).join('') : `<div class="top-empty trn-empty"><b>${tourTab === 'active' ? 'Скоро анонсируем турнир' : 'Прошедших турниров пока нет'}</b><span>Следите за анонсами в нашем Telegram-канале.</span><a class="btn btn-primary btn-sm" href="https://t.me/rushcasse" target="_blank" rel="noopener">${ic.tg}Telegram-канал</a></div>`;
  every(() => $$('[data-cd]').forEach(e => { $('b', e).textContent = countdown(e.dataset.cd); }), 1000);
}

/* ---------- страница турнира ---------- */
function pageTour() { return `<section class="container trn trn-page" id="trnPage"><div class="top-load"><span class="spinner"></span>Загружаем турнир…</div></section>`; }
async function mountTour(id) {
  const root = $('#trnPage'); if (!root || !sb) return;
  const [{ data: t }, { data: regs }, team] = await Promise.all([sb.from('tournaments').select('*').eq('id', +id).maybeSingle(), sb.from('tournament_teams').select('team_id, roster, subs, registered_at').eq('tournament_id', +id).order('registered_at'), myTeam()]);
  if (!$('#trnPage')) return;
  if (!t) { root.innerHTML = `<div class="top-empty"><b>Турнир не найден</b><a class="btn btn-dark btn-sm" href="#/tournaments">${ic.left}Все турниры</a></div>`; return; }
  const tids = (regs || []).map(r => r.team_id);
  const { data: teams } = tids.length ? await sb.from('teams').select(TEAM_COLS).in('id', tids) : { data: [] };
  const P = await players((regs || []).flatMap(r => [...r.roster, ...r.subs]));
  const TM = Object.fromEntries((teams || []).map(x => [x.id, x]));
  const mine = team && (regs || []).find(r => r.team_id === team.id);
  const s = TOUR_ST[t.status] || TOUR_ST.reg, n = (regs || []).length;
  const prizes = Array.isArray(t.prizes) ? t.prizes.filter(Boolean) : [];
  const medal = ['gold', 'silver', 'bronze'];
  root.innerHTML = `
    <a class="back trn-back" href="#/tournaments">${ic.left}Все турниры</a>
    <div class="trn-hero"${t.banner ? ` style="--ban:url('${esc(t.banner)}')"` : ''}>
      <div class="trn-hero-in">
        <div class="trn-chips"><span class="trn-st ${s[1]}">${s[0]}</span><span class="trn-fmt">${fmtName(t.format)}${t.subs_max ? ` · до ${t.subs_max} замен` : ''}</span></div>
        <h1>${esc(t.title)}</h1>
        <div class="trn-facts">
          <div><small>Призовой фонд</small><b class="gold">${esc(t.prize_pool || '—')}</b></div>
          <div><small>Старт</small><b>${tourDate(t.starts_at)}</b></div>
          <div><small>Регистрация до</small><b>${tourDate(t.reg_end || t.starts_at)}</b></div>
          <div><small>Команды</small><b>${n} / ${t.max_teams}</b></div>
        </div>
      </div>
      <div class="trn-act" id="trnAct"></div>
    </div>
    <div class="trn-cols">
      <div class="trn-main">
        ${t.description ? `<section class="trn-sec"><h3>${ic.alert}О турнире</h3><div class="trn-text">${esc(t.description)}</div></section>` : ''}
        <section class="trn-sec"><h3>${ic.users}Команды <em>${n}</em></h3>
          ${n ? `<div class="trn-teams">${regs.map(r => { const tm = TM[r.team_id] || {}; return `<div class="trn-team${mine && r.team_id === team.id ? ' me' : ''}">${teamLogo(tm)}<div class="trn-team-n"><b>${esc(tm.name || 'Команда')}</b><small>[${esc(tm.tag || '')}]</small></div>
            <div class="trn-roster">${r.roster.map(u => P[u] ? `<span title="${esc(P[u].name)}">${ava(P[u], 'xs')}</span>` : '').join('')}${r.subs.length ? `<i>+${r.subs.length}</i>` : ''}</div></div>`; }).join('')}</div>`
            : `<div class="trn-none">Пока никто не зарегистрировался — станьте первыми.</div>`}
        </section>
        <section class="trn-sec"><h3>${ic.trend}Сетка</h3><div class="trn-none">Сетка появится после закрытия регистрации.</div></section>
        ${t.rules ? `<section class="trn-sec"><h3>${ic.shield}Правила</h3><div class="trn-text">${esc(t.rules)}</div></section>` : ''}
      </div>
      <aside class="trn-side">
        ${prizes.length ? `<section class="trn-sec"><h3>${ic.trophy}Призы</h3><ol class="trn-prizes">${prizes.map((p, i) => `<li class="${medal[i] || ''}"><i>${i + 1}</i><span>${esc(p)}</span></li>`).join('')}</ol></section>` : ''}
        ${t.map_pool && t.map_pool.length ? `<section class="trn-sec"><h3>${ic.globe}Пул карт</h3><div class="trn-maps">${t.map_pool.map(m => `<span>${esc(m)}</span>`).join('')}</div><p class="trn-note">Бан карт — на странице матча за 15 минут до начала.</p></section>` : ''}
        ${t.anticheat ? `<section class="trn-sec"><h3>${ic.eye}Античит</h3><div class="trn-text">${esc(t.anticheat)}</div></section>` : ''}
      </aside>
    </div>`;
  drawTourAct(t, team, mine, n);
}
function drawTourAct(t, team, mine, n) {
  const box = $('#trnAct'); if (!box) return;
  const open = t.status === 'reg' && (!t.reg_end || new Date(t.reg_end) > Date.now());
  const head = open && (t.reg_end || t.starts_at) ? `<div class="trn-cd big" data-cd="${esc(t.reg_end || t.starts_at)}"><small>До конца регистрации</small><b>${countdown(t.reg_end || t.starts_at)}</b></div>` : '';
  let body;
  if (mine) body = `<div class="trn-ok">${ic.check}<b>Ваша команда зарегистрирована</b><span>${team.isCap ? 'Состав можно поменять до закрытия регистрации.' : 'Регистрацией управляет капитан.'}</span></div>
    ${team.isCap && open ? `<button class="btn btn-dark" id="trnEdit">${ic.edit}Изменить состав</button><button class="btn btn-ghost btn-sm" id="trnLeave">Сняться с турнира</button>` : ''}`;
  else if (!open) body = `<div class="trn-info">${t.status === 'done' ? 'Турнир завершён.' : 'Регистрация закрыта.'}</div>`;
  else if (!st.user) body = `<button class="btn btn-primary btn-lg" data-act="login">${ic.login}Войти, чтобы участвовать</button>`;
  else if (!st.user.steamid) body = `<div class="trn-info">Для турниров нужен вход через Steam.</div><button class="btn btn-primary btn-lg" id="trnSteam">${ic.steam}Войти через Steam</button>`;
  else if (!team) body = `<div class="trn-info">Регистрирует капитан команды. Создайте команду или вступите по ссылке капитана.</div><a class="btn btn-primary btn-lg" href="#/profile/team">${ic.users}Создать команду</a>`;
  else if (!team.isCap) body = `<div class="trn-info">Зарегистрировать команду может только капитан.</div>`;
  else if (n >= t.max_teams) body = `<div class="trn-info">Все места заняты.</div>`;
  else if (team.members.length < t.format) body = `<div class="trn-info">Нужен полный состав: ${t.format} ${plural(t.format, 'игрок', 'игрока', 'игроков')}. Сейчас в команде ${team.members.length}. Пригласите игроков по ссылке.</div><a class="btn btn-dark" href="#/profile/team">${ic.link}Пригласить игроков</a>`;
  else body = `<button class="btn btn-primary btn-lg" id="trnReg">${ic.trophy}Зарегистрировать команду</button>`;
  box.innerHTML = head + body;
  const reg = $('#trnReg') || $('#trnEdit'); if (reg) reg.onclick = () => rosterModal(t, team, mine);
  const lv = $('#trnLeave'); if (lv) lv.onclick = async () => { if (!confirm('Снять команду с турнира?')) return; if (await srv('tour_unregister', { p_tour: t.id })) { toast('Команда снята с турнира'); route(); } };
  const sm = $('#trnSteam'); if (sm) sm.onclick = steamLogin;
  every(() => $$('[data-cd]').forEach(e => { $('b', e).textContent = countdown(e.dataset.cd); }), 1000);
}
/* выбор основного состава и замен */
async function rosterModal(t, team, mine) {
  const P = await players(team.members.map(m => m.uid));
  const sel = {}; team.members.forEach(m => { sel[m.uid] = mine ? (mine.roster.includes(m.uid) ? 'main' : mine.subs.includes(m.uid) ? 'sub' : '') : ''; });
  const m = modal(`<div class="dpx trn-rm"><div class="dpx-head"><span class="dpx-ico">${ic.users}</span><div><h2>Состав на турнир</h2><p>Основной состав — ровно ${t.format}, замен — до ${t.subs_max}</p></div></div>
    <div class="trn-rm-list" id="rmList"></div><div class="trn-rm-f"><span id="rmCnt"></span><button class="btn btn-primary" id="rmOk">${mine ? 'Сохранить состав' : 'Зарегистрировать'}</button></div></div>`, 'm-dep');
  const draw = () => {
    const main = Object.keys(sel).filter(k => sel[k] === 'main'), subs = Object.keys(sel).filter(k => sel[k] === 'sub');
    $('#rmList', m).innerHTML = team.members.map(x => { const p = P[x.uid] || { name: '?' }, v = sel[x.uid]; return `<div class="trn-rm-row">${ava(p, 'xs')}<b>${esc(p.name)}${x.uid === team.captain ? ' <i class="tm-cap">капитан</i>' : ''}</b>
      <div class="seg"><button data-u="${x.uid}" data-v="main" class="${v === 'main' ? 'on' : ''}">Основа</button><button data-u="${x.uid}" data-v="sub" class="${v === 'sub' ? 'on' : ''}"${t.subs_max ? '' : ' disabled'}>Замена</button><button data-u="${x.uid}" data-v="" class="${!v ? 'on' : ''}">—</button></div></div>`; }).join('');
    $('#rmCnt', m).innerHTML = `Основа <b class="${main.length === t.format ? 'ok' : 'bad'}">${main.length}/${t.format}</b> · замены <b>${subs.length}/${t.subs_max}</b>`;
    $$('[data-u]', m).forEach(b => b.onclick = () => { sel[b.dataset.u] = b.dataset.v; draw(); });
    return { main, subs };
  };
  draw();
  $('#rmOk', m).onclick = async () => {
    const { main, subs } = draw();
    if (main.length !== t.format) return toast(`Выберите ровно ${t.format} в основу`, 'err');
    if (subs.length > t.subs_max) return toast(`Замен — не больше ${t.subs_max}`, 'err');
    const b = $('#rmOk', m); b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
    const r = await srv('tour_register', { p_tour: t.id, p_roster: main, p_subs: subs });
    b.disabled = false; b.textContent = mine ? 'Сохранить состав' : 'Зарегистрировать';
    if (r) { closeModal(); toast(mine ? 'Состав сохранён' : 'Команда зарегистрирована на турнир'); burst(30); route(); }
  };
}

/* ---------- профиль → команда ---------- */
async function drawTeamTab(body) {
  body.innerHTML = `<div class="top-load"><span class="spinner"></span>Загружаем команду…</div>`;
  const team = await myTeam(); if (!$('#pfBody') || pfTab !== 'team') return;
  if (!st.user.steamid) {
    body.innerHTML = `<div class="tm-empty"><span class="tm-empty-ic">${ic.steam}</span><h3>Для команд нужен Steam</h3><p>Турниры по CS2 — только с привязанным аккаунтом Steam. Войдите через Steam, и сможете создать команду или вступить в неё.</p><button class="btn btn-primary btn-lg" id="tmSteam">${ic.steam}Войти через Steam</button></div>`;
    $('#tmSteam').onclick = steamLogin; return;
  }
  if (!team) {
    body.innerHTML = `<div class="tm-grid"><section class="tm-card">${teamForm(null)}</section>
      <section class="tm-card tm-howto"><h3>${ic.link}Вступить в команду</h3><p>Попросите капитана прислать ссылку-приглашение и откройте её — вы сразу окажетесь в команде.</p>
        <ol><li>Капитан создаёт команду и копирует ссылку</li><li>Игроки переходят по ссылке и вступают</li><li>Капитан регистрирует полный состав на турнир</li></ol>
        <a class="btn btn-dark" href="#/tournaments">${ic.trophy}Смотреть турниры</a></section></div>`;
    bindTeamForm(null); return;
  }
  const P = await players(team.members.map(m => m.uid));
  const [{ data: regs }, inv, tg] = await Promise.all([sb.from('tournament_teams').select('tournament_id').eq('team_id', team.id), sb.rpc('team_invite', { p_new: false }), sb.rpc('team_contact', { p_team: team.id })]);
  const tIds = (regs || []).map(r => r.tournament_id);
  const { data: tours } = tIds.length ? await sb.from('tournaments').select('id, title, status, starts_at').in('id', tIds) : { data: [] };
  const link = `${location.origin}${location.pathname}#/join/${inv.data || ''}`;
  body.innerHTML = `<div class="tm-grid">
    <section class="tm-card tm-main">
      <div class="tm-head">${teamLogo(team, 'lg')}<div><h2>${esc(team.name)} <small>[${esc(team.tag)}]</small></h2><p>${team.members.length} / ${TEAM_MAX} игроков${tg.data ? ` · капитан в Telegram: <b>${esc(tg.data)}</b>` : ''}</p></div>
        ${team.isCap ? `<button class="btn btn-dark btn-sm" id="tmEdit">${ic.edit}Изменить</button>` : ''}</div>
      <div class="tm-inv"><small>Ссылка-приглашение</small><div class="inp-row"><input class="inp" readonly value="${esc(link)}" id="tmLink"><button class="btn btn-primary" id="tmCopy">${ic.copy}Копировать</button></div>
        ${team.isCap ? `<button class="tm-newlink" id="tmNew">Сделать новую ссылку (старая перестанет работать)</button>` : ''}</div>
      <div class="tm-members">${team.members.map(x => { const p = P[x.uid] || { name: '?' }, cap = x.uid === team.captain; return `<div class="tm-mem${cap ? ' cap' : ''}">${ava(p, 'xs')}
        <div class="tm-mem-n"><b>${plink(p.pid || x.uid, esc(p.name))}${cap ? ` <i class="tm-cap">${ic.crown}капитан</i>` : ''}${x.uid === st.user.id ? ' <i class="tt-you">вы</i>' : ''}</b><small>ID ${p.pid || '—'}${p.steamid ? ` · <a href="${steamUrl(p.steamid)}" target="_blank" rel="noopener">Steam</a>` : ''}</small></div>
        ${team.isCap && !cap ? `<div class="tm-mem-a"><button class="btn btn-ghost btn-sm" data-cap="${x.uid}">Сделать капитаном</button><button class="btn btn-ghost btn-sm tm-kick" data-kick="${x.uid}">Исключить</button></div>` : ''}</div>`; }).join('')}</div>
      <div class="tm-foot">${team.isCap ? `<button class="btn btn-ghost btn-sm tm-kick" id="tmDisband">Расформировать команду</button>` : `<button class="btn btn-ghost btn-sm tm-kick" id="tmLeave">Покинуть команду</button>`}</div>
    </section>
    <section class="tm-card"><h3>${ic.trophy}Турниры команды</h3>
      ${(tours || []).length ? `<div class="tm-tours">${tours.map(x => `<a href="#/tournament/${x.id}"><b>${esc(x.title)}</b><span class="trn-st ${(TOUR_ST[x.status] || TOUR_ST.reg)[1]}">${(TOUR_ST[x.status] || TOUR_ST.reg)[0]}</span></a>`).join('')}</div>` : `<p class="trn-none">Команда ещё не участвует в турнирах.</p>`}
      <a class="btn btn-dark" href="#/tournaments">${ic.trophy}Все турниры</a></section></div>`;
  $('#tmCopy').onclick = () => copyText(link);
  const act = async (fn, args, msg, ask) => { if (ask && !confirm(ask)) return; if (await srv(fn, args)) { toast(msg); drawTeamTab(body); } };
  const nl = $('#tmNew'); if (nl) nl.onclick = () => act('team_invite', { p_new: true }, 'Новая ссылка готова', 'Старая ссылка перестанет работать. Продолжить?');
  $$('[data-kick]', body).forEach(b => b.onclick = () => act('team_kick', { p_uid: b.dataset.kick }, 'Игрок исключён', 'Исключить игрока из команды?'));
  $$('[data-cap]', body).forEach(b => b.onclick = () => act('team_transfer', { p_uid: b.dataset.cap }, 'Капитанство передано', 'Передать капитанство? Вы станете обычным игроком.'));
  const ds = $('#tmDisband'); if (ds) ds.onclick = () => act('team_disband', {}, 'Команда расформирована', 'Расформировать команду? Её регистрации на турнирах будут отменены.');
  const lv = $('#tmLeave'); if (lv) lv.onclick = () => act('team_leave', {}, 'Вы покинули команду', 'Покинуть команду?');
  const ed = $('#tmEdit'); if (ed) ed.onclick = () => { const m = modal(`<div class="dpx">${teamForm(Object.assign({}, team, { captain_tg: tg.data }))}</div>`, 'm-dep'); bindTeamForm(team, m); };
}
function teamForm(t) {
  return `<h3>${ic.users}${t ? 'Команда' : 'Создать команду'}</h3>
    <div class="tm-form">
      <label class="tm-logo-up" id="tfLogoBox">${t && t.logo ? `<img src="${esc(t.logo)}" alt="">` : `${ic.plus}<span>Логотип</span>`}<input type="file" id="tfLogo" accept="image/png,image/jpeg,image/webp" hidden></label>
      <div class="tm-fields">
        <label><small>Название</small><input class="inp" id="tfName" maxlength="24" placeholder="Rush Five" value="${t ? esc(t.name) : ''}"></label>
        <label><small>Тег (2–5 символов)</small><input class="inp" id="tfTag" maxlength="5" placeholder="RUSH" value="${t ? esc(t.tag) : ''}" style="text-transform:uppercase"></label>
        <label><small>Telegram капитана — для связи с организаторами</small><input class="inp" id="tfTg" maxlength="40" placeholder="@captain" value="${t && t.captain_tg ? esc(t.captain_tg) : ''}"></label>
      </div>
    </div>
    <button class="btn btn-primary btn-lg" id="tfSave">${t ? 'Сохранить' : `${ic.plus}Создать команду`}</button>`;
}
function bindTeamForm(t, root = document) {
  let logo = t ? t.logo : null; // t — команда при изменении, null при создании (загрузка логотипа режим не меняет)
  const onLogo = async e => {
    const box = $('#tfLogoBox', root); box.classList.add('busy');
    const url = await uploadImg('team-logo', e.target.files[0], st.user.id); box.classList.remove('busy');
    if (url) { logo = url; box.innerHTML = `<img src="${esc(url)}" alt=""><input type="file" id="tfLogo" accept="image/png,image/jpeg,image/webp" hidden>`; $('#tfLogo', root).onchange = onLogo; }
  };
  $('#tfLogo', root).onchange = onLogo;
  $('#tfSave', root).onclick = async () => {
    const name = $('#tfName', root).value.trim(), tag = $('#tfTag', root).value.trim().toUpperCase(), tg = $('#tfTg', root).value.trim();
    if (name.length < 2) return toast('Название — от 2 символов', 'err');
    if (!/^[A-Z0-9А-ЯЁ]{2,5}$/.test(tag)) return toast('Тег — 2–5 букв или цифр', 'err');
    const b = $('#tfSave', root); b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
    const r = await srv(t ? 'team_update' : 'team_create', { p_name: name, p_tag: tag, p_logo: logo, p_tg: tg || null });
    b.disabled = false; b.innerHTML = t ? 'Сохранить' : `${ic.plus}Создать команду`;
    if (r) { if (t) closeModal(); toast(t ? 'Команда сохранена' : 'Команда создана — пригласите игроков по ссылке'); if (!t) burst(30); const bd = $('#pfBody'); if (bd) drawTeamTab(bd); }
  };
}

/* ---------- приглашение в команду: #/join/<код> ---------- */
function pageJoin() { return `<section class="container trn"><div class="tm-join" id="tmJoin"><div class="top-load"><span class="spinner"></span>Проверяем приглашение…</div></div></section>`; }
async function mountJoin(code) {
  const box = $('#tmJoin'); if (!box || !sb) return;
  const { data: t } = await sb.rpc('team_by_invite', { p_code: code || '' });
  if (!$('#tmJoin')) return;
  if (!t) { box.innerHTML = `<div class="tm-empty"><span class="tm-empty-ic">${ic.alert}</span><h3>Приглашение недействительно</h3><p>Ссылка устарела или с ошибкой. Попросите капитана прислать новую.</p><a class="btn btn-dark" href="#/tournaments">${ic.trophy}Турниры</a></div>`; return; }
  try { localStorage.setItem('rc.join', code); } catch (e) { /* без запоминания */ }
  const need = !st.user ? 'login' : !st.user.steamid ? 'steam' : '';
  box.innerHTML = `<div class="tm-empty">${teamLogo(t, 'xl')}<small class="tm-join-s">Приглашение в команду</small><h3>${esc(t.name)} <span>[${esc(t.tag)}]</span></h3><p>${t.n} / ${TEAM_MAX} игроков</p>
    ${need === 'login' ? `<button class="btn btn-primary btn-lg" data-act="login">${ic.login}Войти, чтобы вступить</button>` : need === 'steam' ? `<p class="trn-info">Для команд нужен вход через Steam.</p><button class="btn btn-primary btn-lg" id="jnSteam">${ic.steam}Войти через Steam</button>` : `<button class="btn btn-primary btn-lg" id="jnGo">${ic.users}Вступить в команду</button>`}</div>`;
  const sm = $('#jnSteam'); if (sm) sm.onclick = steamLogin;
  const go = $('#jnGo'); if (go) go.onclick = async () => { go.disabled = true; const r = await srv('team_join', { p_code: code }); go.disabled = false; if (r) { try { localStorage.removeItem('rc.join'); } catch (e) { /* */ } toast(`Вы в команде <b>${esc(t.name)}</b>`); burst(30); location.hash = '#/profile/team'; } };
}

/* ---------- админ → турниры ---------- */
async function admTours(box) {
  box.innerHTML = `<div class="adm-panel"><div class="adm-ph"><h3>Турниры</h3><button class="btn btn-primary btn-sm" id="atNew">${ic.plus}Создать турнир</button><p>Черновик видят только админы. «Регистрация открыта» — турнир на сайте, капитаны регистрируют команды. После закрытия регистрации составы заморожены.</p></div><div id="atList"><div class="top-load"><span class="spinner"></span></div></div></div>`;
  $('#atNew').onclick = () => admTourEditor(null, () => admTours(box));
  const { data, error } = await sb.from('tournaments').select('*').order('created_at', { ascending: false });
  if (error) { $('#atList').innerHTML = admErr(error); return; }
  const { data: regs } = await sb.from('tournament_teams').select('tournament_id');
  const cnt = {}; (regs || []).forEach(r => { cnt[r.tournament_id] = (cnt[r.tournament_id] || 0) + 1; });
  $('#atList').innerHTML = (data || []).length ? `<div class="at-list">${data.map(t => { const s = TOUR_ST[t.status] || TOUR_ST.draft; return `<div class="at-row" data-id="${t.id}">
    <span class="at-ban"${t.banner ? ` style="background-image:url('${esc(t.banner)}')"` : ''}></span>
    <div class="at-n"><b>${esc(t.title)}</b><span>${fmtName(t.format)} · старт ${tourDate(t.starts_at)} · ${esc(t.prize_pool || 'без призового')}</span></div>
    <span class="trn-st ${s[1]}">${s[0]}</span><span class="at-cnt">${cnt[t.id] || 0} / ${t.max_teams}</span>
    <div class="at-a"><button class="btn btn-dark btn-sm" data-teams="${t.id}">${ic.users}Команды</button><button class="btn btn-dark btn-sm" data-edit="${t.id}">${ic.edit}Изменить</button><a class="btn btn-ghost btn-sm" href="#/tournament/${t.id}">${ic.eye}</a><button class="btn btn-ghost btn-sm tm-kick" data-del="${t.id}">Удалить</button></div></div>`; }).join('')}</div>`
    : `<div class="trn-none">Турниров ещё нет — создайте первый.</div>`;
  $$('[data-edit]', box).forEach(b => b.onclick = () => admTourEditor(data.find(x => x.id === +b.dataset.edit), () => admTours(box)));
  $$('[data-teams]', box).forEach(b => b.onclick = () => admTourTeams(data.find(x => x.id === +b.dataset.teams), () => admTours(box)));
  $$('[data-del]', box).forEach(b => b.onclick = async () => { const t = data.find(x => x.id === +b.dataset.del); if (!confirm(`Удалить турнир «${t.title}»? Регистрации команд тоже удалятся.`)) return; const { error: e } = await sb.rpc('admin_tour_delete', { p_id: t.id }); if (e) return toast('Не удалено: ' + e.message, 'err'); toast('Турнир удалён'); admTours(box); });
}
const dtLocal = d => { if (!d) return ''; const x = new Date(d); return new Date(x - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
function admTourEditor(t, done) {
  const E = t ? JSON.parse(JSON.stringify(t)) : { title: '', status: 'draft', format: 5, subs_max: 2, max_teams: 16, prize_pool: '', prizes: [], map_pool: ['Ancient', 'Anubis', 'Dust2', 'Inferno', 'Mirage', 'Nuke', 'Train'], banner: '', description: '', rules: '', anticheat: '', starts_at: null, reg_end: null };
  const m = modal(`<div class="dpx at-ed">
    <div class="dpx-head"><span class="dpx-ico">${ic.trophy}</span><div><h2>${t ? 'Изменить турнир' : 'Новый турнир'}</h2><p>Все поля можно поменять позже</p></div></div>
    <div class="at-grid">
      <label class="at-ban-up" id="aeBanBox">${E.banner ? `<img src="${esc(E.banner)}" alt="">` : `${ic.plus}<span>Баннер турнира<small>PNG / JPG / WEBP, до 3 МБ, лучше 1600×700</small></span>`}<input type="file" id="aeBan" accept="image/png,image/jpeg,image/webp" hidden></label>
      <label class="at-f wide"><small>Название</small><input class="inp" id="aeTitle" maxlength="80" value="${esc(E.title)}" placeholder="RUSH Cup #1"></label>
      <label class="at-f"><small>Статус</small><select class="inp" id="aeStatus">${Object.entries(TOUR_ST).map(([k, v]) => `<option value="${k}"${E.status === k ? ' selected' : ''}>${v[0]}</option>`).join('')}</select></label>
      <label class="at-f"><small>Формат</small><select class="inp" id="aeFormat">${[1, 2, 5].map(f => `<option value="${f}"${E.format === f ? ' selected' : ''}>${fmtName(f)}</option>`).join('')}</select></label>
      <label class="at-f"><small>Замен в команде</small><input class="inp" id="aeSubs" type="number" min="0" max="5" value="${E.subs_max}"></label>
      <label class="at-f"><small>Макс. команд</small><input class="inp" id="aeMax" type="number" min="2" max="256" value="${E.max_teams}"></label>
      <label class="at-f"><small>Старт турнира</small><input class="inp" id="aeStart" type="datetime-local" value="${dtLocal(E.starts_at)}"></label>
      <label class="at-f"><small>Конец регистрации</small><input class="inp" id="aeReg" type="datetime-local" value="${dtLocal(E.reg_end)}"></label>
      <label class="at-f wide"><small>Призовой фонд (кратко, для карточки)</small><input class="inp" id="aePool" maxlength="80" value="${esc(E.prize_pool)}" placeholder="50 000 ₽ + скины"></label>
      <label class="at-f wide"><small>Призы по местам — каждое место с новой строки</small><textarea class="inp" id="aePrizes" rows="4" placeholder="AWP | Dragon Lore&#10;10 000 ₽&#10;Нож на выбор">${esc((E.prizes || []).join('\n'))}</textarea></label>
      <div class="at-f wide"><small>Пул карт — нажмите, чтобы включить или выключить</small><div class="at-maps" id="aeMaps"></div><div class="inp-row"><input class="inp" id="aeMapAdd" maxlength="30" placeholder="Своя карта"><button class="btn btn-dark" id="aeMapBtn">${ic.plus}Добавить</button></div></div>
      <label class="at-f wide"><small>Описание</small><textarea class="inp" id="aeDesc" rows="4">${esc(E.description)}</textarea></label>
      <label class="at-f wide"><small>Правила</small><textarea class="inp" id="aeRules" rows="6">${esc(E.rules)}</textarea></label>
      <label class="at-f wide"><small>Античит</small><input class="inp" id="aeAc" maxlength="400" value="${esc(E.anticheat)}" placeholder="Обязателен FACEIT AC"></label>
    </div>
    <div class="ced-foot"><button class="btn btn-ghost" id="aeCancel">Отмена</button><button class="btn btn-primary btn-lg" id="aeSave">${t ? 'Сохранить' : 'Создать турнир'}</button></div></div>`, 'm-dep at-modal');
  const v = id => $('#' + id, m);
  const pool = new Set(E.map_pool || []);
  const drawMaps = () => { const all = [...new Set([...TOUR_MAPS, ...pool])]; v('aeMaps').innerHTML = all.map(x => `<button class="${pool.has(x) ? 'on' : ''}" data-map="${esc(x)}">${esc(x)}</button>`).join(''); $$('[data-map]', m).forEach(b => b.onclick = () => { const k = b.dataset.map; pool.has(k) ? pool.delete(k) : pool.add(k); drawMaps(); }); };
  drawMaps();
  v('aeMapBtn').onclick = () => { const k = v('aeMapAdd').value.trim(); if (k) { pool.add(k); v('aeMapAdd').value = ''; drawMaps(); } };
  const bindBan = () => { v('aeBan').onchange = async e => { const box = v('aeBanBox'); box.classList.add('busy'); const url = await uploadImg('tour-img', e.target.files[0], 'tour'); box.classList.remove('busy'); if (url) { E.banner = url; box.innerHTML = `<img src="${esc(url)}" alt=""><input type="file" id="aeBan" accept="image/png,image/jpeg,image/webp" hidden>`; bindBan(); } }; };
  bindBan();
  v('aeCancel').onclick = closeModal;
  v('aeSave').onclick = async () => {
    const iso = id => { const x = v(id).value; return x ? new Date(x).toISOString() : ''; };
    const p = { id: t ? t.id : '', title: v('aeTitle').value.trim(), status: v('aeStatus').value, format: +v('aeFormat').value, subs_max: +v('aeSubs').value || 0, max_teams: +v('aeMax').value || 16,
      starts_at: iso('aeStart'), reg_end: iso('aeReg'), prize_pool: v('aePool').value.trim(), prizes: v('aePrizes').value.split('\n').map(x => x.trim()).filter(Boolean),
      map_pool: [...pool], banner: E.banner || '', description: v('aeDesc').value, rules: v('aeRules').value, anticheat: v('aeAc').value.trim() };
    if (p.title.length < 2) return toast('Введите название', 'err');
    if (p.status === 'reg' && !p.starts_at) return toast('Укажите дату старта', 'err');
    const b = v('aeSave'); b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
    const { error } = await sb.rpc('admin_tour_save', { p });
    b.disabled = false; b.textContent = t ? 'Сохранить' : 'Создать турнир';
    if (error) return toast('Не сохранено: ' + error.message, 'err');
    closeModal(); toast(t ? 'Турнир сохранён' : 'Турнир создан'); done();
  };
}
async function admTourTeams(t, done) {
  const m = modal(`<div class="dpx at-tm"><div class="dpx-head"><span class="dpx-ico">${ic.users}</span><div><h2>${esc(t.title)}</h2><p>Зарегистрированные команды</p></div></div><div id="atTeams"><div class="top-load"><span class="spinner"></span></div></div></div>`, 'm-dep at-modal');
  const { data, error } = await sb.rpc('admin_tour_teams', { p_tour: t.id });
  if (error) { $('#atTeams', m).innerHTML = admErr(error); return; }
  const P = await players((data || []).flatMap(x => [...x.roster, ...x.subs]));
  const row = (u, sub) => { const p = P[u] || { name: '?' }; return `<span class="at-pl${sub ? ' sub' : ''}">${ava(p, 'xs')}${plink(p.pid || u, esc(p.name))}${p.steamid ? ` <a href="${steamUrl(p.steamid)}" target="_blank" rel="noopener">${ic.steam}</a>` : ''}${sub ? ' <i>замена</i>' : ''}</span>`; };
  $('#atTeams', m).innerHTML = (data || []).length ? data.map(x => `<div class="at-team">${teamLogo(x)}<div class="at-team-b"><b>${esc(x.name)} <small>[${esc(x.tag)}]</small></b>
      <span class="at-tg">${x.tg ? `${ic.tg}<a href="https://t.me/${esc(x.tg.replace(/^@/, ''))}" target="_blank" rel="noopener">${esc(x.tg)}</a>` : 'Telegram капитана не указан'}${x.roster.length < t.format ? ' · <b class="bad">неполный состав</b>' : ''}</span>
      <div class="at-pls">${x.roster.map(u => row(u)).join('')}${x.subs.map(u => row(u, true)).join('')}</div></div>
      <button class="btn btn-ghost btn-sm tm-kick" data-kick="${x.team}">Снять</button></div>`).join('') : `<div class="trn-none">Пока никто не зарегистрировался.</div>`;
  $$('[data-kick]', m).forEach(b => b.onclick = async () => { if (!confirm('Снять команду с турнира?')) return; const { error: e } = await sb.rpc('admin_tour_kick', { p_tour: t.id, p_team: b.dataset.kick }); if (e) return toast('Ошибка: ' + e.message, 'err'); toast('Команда снята'); admTourTeams(t, done); done(); });
}

const ROUTES = {
  '': [pageCases, mountCases], cases: [pageCases, mountCases], top: [pageTop, mountTop], jackpot: [pageJackpot, mountJackpot], case: [pageCase, mountCase], upgrade: [pageUpgrade, mountUpgrade], contracts: [pageContracts, mountContracts],
  bonus: [pageBonus, mountBonus], profile: [pageProfile, mountProfile], faq: [pageFaq, mountFaq], terms: [pageTerms, null], privacy: [pagePrivacy, null], payment: [pagePayment, null], admin: [pageAdmin, mountAdmin],
  tournaments: [pageTours, mountTours], tournament: [pageTour, mountTour], join: [pageJoin, mountJoin], u: [pagePlayer, mountPlayer],
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
  const navKey = key === '' || key === 'case' ? 'cases' : key === 'tournament' ? 'tournaments' : key === 'u' ? 'top' : key;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === navKey));
  closeMenu();
  const c = key === 'case' && caseById(parts[1]);
  document.title = c ? `Кейс «${c.name}» — RUSH CASE` : ({ cases: 'Все кейсы', top: 'Топ игроков', jackpot: 'Ставки', upgrade: 'Апгрейд', contracts: 'Контракты', bonus: 'Бонусы', profile: 'Профиль', faq: 'FAQ', terms: 'Соглашение', privacy: 'Конфиденциальность', payment: 'Оплата и возврат', admin: 'Админ-панель', tournaments: 'Турниры', tournament: 'Турнир', join: 'Приглашение в команду', u: 'Игрок' }[key] || 'Открытие кейсов CS2') + ' — RUSH CASE';
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
renderHeader(); renderFooter(); initFx(); initLive(); route(); sbInit();
setInterval(() => { online = clamp(online + randi(-14, 16), 950, 1900); const o = $('#online'); if (o) o.textContent = fmt(online); }, 3000);
// экран загрузки закрывается сам (index.html: window.plFinish) — по окончании загрузки или через 7 с
})();

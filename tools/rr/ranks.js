// Значки 10 званий «Русской рулетки» в стиле званий CS2 Danger Zone (своя отрисовка, не файлы игры).
// Запуск: node tools/rr/ranks.js  → assets/rr/ranks/rank-1.svg … rank-10.svg
// Эмблема растёт: пуля → барабан (патронов 1→2→3→5, как в раундах) → выстрел из револьвера → череп с костями владельца → 10: череп на золотой звезде (по картинке владельца).
// Цвета как в CS2: серый → синий → тёмно-синий → фиолетовый → красный → чёрный → огонь; рамка серебро → золото.
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '../../assets/rr/ranks');

const RANKS = [
  { name: 'Новичок', pts: 0 }, { name: 'Игрок', pts: 20 }, { name: 'Смельчак', pts: 50 },
  { name: 'Счастливчик', pts: 90 }, { name: 'Хладнокровный', pts: 140 }, { name: 'Стальные нервы', pts: 210 },
  { name: 'Фаталист', pts: 300 }, { name: 'Ветеран барабана', pts: 420 }, { name: 'Бессмертный', pts: 580 },
  { name: 'Легенда рулетки', pts: 780 },
];

const f = n => +n.toFixed(2);
// шестиугольная плашка 320×110 (y 10…120), d — отступ внутрь
const hex = d => { const a = 0.575 * d, b = d / 0.864;
  return `M${f(32 + a)},${f(10 + d)}L${f(288 - a)},${f(10 + d)}L${f(320 - b)},65L${f(288 - a)},${f(120 - d)}L${f(32 + a)},${f(120 - d)}L${f(b)},65Z`; };
const ring = (a, b) => `${hex(a)}${hex(b)}`;

const STOPS = {
  silver: [[0, '#f6f8fa'], [.22, '#cfd3d8'], [.42, '#7c828a'], [.52, '#5f656c'], [.62, '#a3aab2'], [.8, '#e9edf1'], [1, '#757b82']],
  gold: [[0, '#fff6c8'], [.2, '#f5d474'], [.42, '#b07a1e'], [.52, '#8a5a12'], [.62, '#d39b34'], [.8, '#ffe89a'], [1, '#94621a']],
  fire: [[0, '#fffbe6'], [.2, '#ffe07a'], [.45, '#f08a14'], [.55, '#c4520a'], [.65, '#ffb43c'], [.82, '#fff0a8'], [1, '#a8400a']],
};
const lg = (id, st, x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${st.map(([o, c, op]) =>
    `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ''}/>`).join('')}</linearGradient>`;
const OL = 'stroke="#140c04" stroke-opacity=".6" stroke-width="1.6" stroke-linejoin="round"';

// ---------- эмблемы (локальные координаты, центр 0,0) ----------
function bullet(p) {
  const shape = 'M-9,-12L-9,-20C-9,-36 -4,-46 0,-53C4,-46 9,-36 9,-20L9,-12Z M-11,-12L11,-12L11,26L9,28L9,30L12,30L12,37L-12,37L-12,30L-9,30L-9,28L-11,26Z';
  return `<path d="${shape}" fill="url(#${p}em)" ${OL}/>`
    + `<path d="M0,-53C4,-46 9,-36 9,-20L9,-12L0,-12Z M0,-12L11,-12L11,26L9,28L9,30L12,30L12,37L0,37Z" fill="#000" opacity=".22"/>`
    + `<path d="M-5,-20C-5,-31 -3,-39 0,-46 M-7,-7L-7,23" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
    + `<path d="M-11,-12L11,-12 M-12,30L12,30" stroke="#140c04" stroke-opacity=".5" stroke-width="1.4"/>`;
}

function drumPath(R = 36, D = 38, r = 8) {
  const d = Math.acos((R * R + D * D - r * r) / (2 * R * D));
  const P = (rad, a) => `${f(rad * Math.cos(a))},${f(rad * Math.sin(a))}`;
  let s = '';
  for (let k = 0; k < 6; k++) {
    const c = (30 + 60 * k) * Math.PI / 180, c2 = (90 + 60 * k) * Math.PI / 180;
    s += (k ? '' : `M${P(R, c + d)}`) + `A${R},${R} 0 0 1 ${P(R, c2 - d)}A${r},${r} 0 0 0 ${P(R, c2 + d)}`;
  }
  return s + 'Z';
}
function drum(p, loaded) {
  const dp = drumPath();
  let s = `<path d="${dp}" fill="url(#${p}em)" ${OL}/><path d="${dp}" fill="url(#${p}sh)"/>`;
  for (let k = 0; k < 6; k++) {
    const a = (-90 + 60 * k) * Math.PI / 180, x = f(21 * Math.cos(a)), y = f(21 * Math.sin(a));
    s += `<circle cx="${x}" cy="${y}" r="8.6" fill="#0c0d10" stroke="#000" stroke-opacity=".5" stroke-width="1.2"/>`;
    if (k < loaded) s += `<circle cx="${x}" cy="${y}" r="6.4" fill="url(#${p}br)"/><circle cx="${x}" cy="${y}" r="2.4" fill="#6b4a12" stroke="#2a1a04" stroke-width=".6"/><circle cx="${f(x - 2)}" cy="${f(y - 2.4)}" r="1.3" fill="#fff" opacity=".7"/>`;
  }
  return s + `<circle r="5.5" fill="#0c0d10"/><circle r="2.6" fill="url(#${p}em)"/>`;
}

function revolver(p) {
  const body = 'M-40,-31L-4,-31L-2,-28L62,-28L63,-34L67,-34L68,-28L72,-28L72,-17L58,-17L58,-10L-2,-10L-2,1L-12,2L-32,2L-38,4L-44,38Q-45,47 -53,47L-63,47Q-70,46 -68,37L-58,6Q-56,-4 -52,-12L-50,-20L-60,-34Q-62,-38 -57,-38L-44,-30Z';
  const guard = 'M-10,2C-10,18 -18,21 -24,21C-31,21 -35,15 -35,4L-31,4C-31,12 -28,17 -24,17C-19,17 -14,14 -14,2Z';
  const trig = 'M-20,2C-19,8 -21,12 -25,14L-26,12C-23,10 -23,6 -24,2Z';
  return `<path d="${guard} ${trig}" fill="url(#${p}em)" ${OL}/><path d="${body}" fill="url(#${p}em)" ${OL}/><path d="${body}" fill="url(#${p}sh)"/>`
    + `<rect x="-34" y="-27" width="28" height="24" rx="4" fill="#000" opacity=".22"/>`
    + `<path d="M-32,-19.5L-8,-19.5 M-32,-10.5L-8,-10.5" stroke="#000" stroke-opacity=".4" stroke-width="2.2"/>`
    + `<path d="M-32,-24L-8,-24 M-32,-15L-8,-15 M-32,-6L-8,-6" stroke="#fff" stroke-opacity=".35" stroke-width="1.1"/>`
    + `<path d="M0,-26L70,-26" stroke="#fff" stroke-opacity=".6" stroke-width="1.4"/>`
    + `<path d="M0,-13.5L57,-13.5" stroke="#000" stroke-opacity=".3" stroke-width="1.2"/>`
    + `<path d="M-42,9L-50,40Q-52,43 -56,43L-61,43Q-65,42 -64,38L-55,9Z" fill="#000" opacity=".32"/>`
    + `<circle cx="-53" cy="25" r="2" fill="url(#${p}em)"/>`;
}

// Череп и кости — из файла владельца «Оформление сайта/СМЕРТЬ РР.svg» (viewBox 33.3×32, центр черепа ≈ 16.4,16)
const SK_SKULL = 'M24.093,16.127c0.014-1.093-0.372-1.119-0.396-1.791c-0.013-0.335,0.027-1.277,0-2.187c-0.029-0.906-0.126-1.779-0.199-1.989c-0.148-0.424-0.318-1.121-1.591-2.189c-1.394-1.168-4.08-2.163-5.571-2.188c-1.492-0.025-3.231,0.722-4.576,1.593c-1.342,0.869-1.665,1.242-2.187,1.988c-0.523,0.746-0.723,1.269-0.599,2.586c0.125,1.319,0.154,0.971,0.199,2.188c0.038,1.008-0.419,1.319-0.397,1.989c0.032,1.003,0.409,1.21,0.397,1.592c-0.008,0.25-0.447,0.563-0.397,1.392c0.051,0.846,0.224,1.071,1.791,1.99c1.017,0.598,2.213,0.822,2.188,1.194c-0.037,0.545-0.175,1.441-0.198,1.989c-0.025,0.547,0.224,0.597,0.795,0.795c0.572,0.2,1.914,0.623,3.383,0.597c1.468-0.023,2.089-0.323,2.785-0.597c0.695-0.273,0.795-0.521,0.795-0.995c0-0.472-0.396-1.44-0.396-1.789s1.191-0.722,2.585-1.394c1.394-0.669,1.377-1.342,1.394-1.791c0.029-0.845-0.398-1.044-0.398-1.392C23.497,17.039,24.085,16.923,24.093,16.127z M12.355,18.115c-0.696,0.026-2.188,0.026-2.188-1.988c0-2.789,1.491-3.108,2.586-3.183c1.095-0.076,1.243-0.198,1.791,0.199c0.982,0.715,0.92,1.98,0.597,2.983c-0.237,0.734-0.498,1.021-0.995,1.393C13.649,17.894,13.054,18.092,12.355,18.115z M16.933,21.3l-0.273-1.016l-0.423,0.004l-0.3,1.012c-1.144-0.312-1.604-0.771-1.591-1.393s0.36-1.269,0.994-1.792c0.635-0.521,0.737-0.602,1.194-0.596c0.436,0.007,0.475,0.091,0.795,0.398c0.693,0.664,1.141,1.106,1.195,1.989C18.575,20.776,17.566,21.262,16.933,21.3z M20.513,18.115c-0.696-0.023-1.293-0.222-1.79-0.596c-0.498-0.372-0.791-0.648-0.995-1.393c-0.258-0.936-0.385-2.269,0.597-2.983c0.548-0.397,0.697-0.275,1.791-0.199c1.094,0.074,2.586,0.394,2.586,3.183C22.701,18.142,21.209,18.142,20.513,18.115z';
const SK_LINES = 'M23.696,12.149c-0.029-0.906-0.126-1.779-0.199-1.989c-0.079-0.227-0.165-0.531-0.421-0.928l0.63,3.633C23.706,12.632,23.703,12.39,23.696,12.149z M9.125,13.286l0.107-3.373c-0.266,0.519-0.352,1.059-0.259,2.036C9.054,12.799,9.095,12.957,9.125,13.286z M23.686,18.188l-0.825,2.523c1.032-0.604,1.021-1.193,1.035-1.601C23.911,18.658,23.796,18.391,23.686,18.188z M8.775,19.11c0.045,0.748,0.186,1.011,1.303,1.697l-1.297-2.014C8.771,18.891,8.769,18.996,8.775,19.11z';
const SK_BONES = 'M9.104,13.277c1.709,0.854,2.089-2.563,2.089-2.563L9.104,9.86c0,0-2.942-1.677-3.322-2.167c-0.38-0.491-0.475-1.631-1.803-1.82c-1.33-0.19-1.994-0.188-2.184,0.571c-0.19,0.758,0,1.249,0,1.249s-0.19-0.364-0.76,0c-0.57,0.363-0.854,1.407-0.57,1.786c0.286,0.381,0.855,0.746,1.614,0.8c0.76,0.056,0.665-0.624,1.899,0C5.213,10.904,9.104,13.277,9.104,13.277z M21.825,9.86c0,0,4.557-2.278,4.937-2.563c0.379-0.284,0.664-1.063,0.949-1.528s1.044-1.36,1.804-1.008c0.759,0.353,1.14,1.59,1.14,1.684c0,0.093,0,0.093,0,0.093l0.475-0.093c0,0,0.664,0.79,0.854,1.249c0.189,0.458,0,1.597-0.38,1.786c-0.379,0.19-0.948,0.936-1.614,0.8c-0.664-0.134-1.708-0.244-2.183,0c-0.475,0.245-3.513,2.541-3.893,2.485c-0.379-0.057-1.518,0.65-1.518,0.65L21.825,9.86z M22.68,17.549c0,0,4.326,2.748,4.651,2.943c0.44,0.263,1.519,1.104,2.278,1.358c0.759,0.256,1.857-0.124,2.448,0.16c0.589,0.285,0.685,0.38,0.969,0.76c0.285,0.379,0.112,0.969-0.166,1.397c-0.545,0.843-0.937,0.691-0.937,0.691h-0.194c0,0,0.23,0.133,0.075,0.52c-0.1,0.247-0.183,0.362-0.569,0.735c-0.636,0.611-1.145,0.543-1.657,0.233c-0.604-0.364-1.023-0.913-1.298-1.394c-0.629-1.106-6.455-4.937-6.455-4.937L22.68,17.549z M9.967,18.033c0,0-3.346,2.174-4.192,2.554c-0.846,0.38-2.08,1.14-2.745,1.044c-0.664-0.095-1.328-0.38-1.803,0s-0.699,1.14-0.872,1.519c-0.173,0.38,0.017,1.614,0.587,1.805c0.569,0.189,0.569,0.189,0.569,0.189l0.569,0.947c0,0-0.095,0.571,0.854,0.477c0.95-0.095,1.52-0.475,1.898-1.329c0.38-0.854,1.805-1.993,1.805-1.993l4.556-3.228L9.967,18.033z';
let BONES = true; // кости из файла владельца (выбор 21.11); false — скрещённые револьверы за черепом
function skull(p, glow, bones = BONES) {
  const S = 3.6, O = `stroke="#140c04" stroke-opacity=".6" stroke-width="${f(1.6 / S)}" stroke-linejoin="round"`;
  const holes = `<ellipse cx="12.6" cy="15.5" rx="2.7" ry="2.7"/><ellipse cx="20.2" cy="15.5" rx="2.7" ry="2.7"/><ellipse cx="16.5" cy="19.6" rx="2" ry="1.9"/>`;
  return `<g transform="scale(${S}) translate(-16.4,-16)">`
    + (bones ? `<path d="${SK_BONES}" fill="url(#${p}em)" ${O}/><path d="${SK_BONES}" fill="url(#${p}sh)"/>` : '')
    + `<g fill="#100806">${holes}</g>`
    + (glow ? `<g fill="url(#${p}eye)" filter="url(#${p}gl)">${holes}</g><g fill="url(#${p}eye)">${holes}</g>` : '')
    + `<path d="${SK_SKULL}" fill="url(#${p}em)" fill-rule="evenodd" ${O}/><path d="${SK_SKULL}" fill="url(#${p}sh)" fill-rule="evenodd"/>`
    + `<path d="${SK_LINES}" fill="none" stroke="#3a2a10" stroke-opacity=".6" stroke-width=".5" stroke-linejoin="bevel"/></g>`;
}
// звезда с гранями за черепом (звание 10 — по картинке владельца 21.11, в нашем формате): 12 широких лучей длинный/короткий,
// у каждого луча светлая и тёмная грань (свет сверху слева), в центре — золотое кольцо
function star(p) {
  const P = (rad, a) => `${f(rad * Math.cos(a))},${f(rad * Math.sin(a))}`;
  let s = '';
  for (let k = 0; k < 12; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 6, R = k % 2 ? 58 : 76, da = Math.PI / 12 * .92, r0 = 40;
    const tip = P(R, a), l = P(r0, a - da), r = P(r0, a + da), c = P(r0 * .45, a);
    s += `<path d="M${tip}L${l}L${c}Z" fill="url(#${p}em)"/><path d="M${tip}L${r}L${c}Z" fill="#a8640e"/><path d="M${l}L${tip}L${r}" fill="none" ${OL}/>`;
  }
  return s + `<circle r="40" fill="url(#${p}em)" ${OL}/><circle r="40" fill="url(#${p}sh)"/><circle r="34" fill="none" stroke="#7a4a0a" stroke-opacity=".5" stroke-width="2"/>`;
}
function skullGuns(p, glow) {
  if (BONES) return skull(p, glow);
  const g = `<g transform="rotate(-38) translate(10,6) scale(.72)">${revolver(p)}</g>`;
  return `${g}<g transform="scale(-1,1)">${g}</g>${skull(p, glow)}`;
}

// выстрел (звания 7–8): револьвер, вылетающая пуля со следом и вспышка; big — дальше, длиннее след, ударные кольца
function flyBullet(p) {
  return `<path d="M-12,-6.5L6,-6.5C14,-6.5 20,-3.5 24,0C20,3.5 14,6.5 6,6.5L-12,6.5Q-14,0 -12,-6.5Z" fill="url(#${p}em)" ${OL}/>`
    + `<path d="M-12,1L6,1C14,1 19,0.5 24,0C20,3.5 14,6.5 6,6.5L-12,6.5Z" fill="#000" opacity=".22"/>`
    + `<path d="M-9,-3.8L6,-3.8C11,-3.8 15,-2.6 18,-1.2" stroke="#fff" stroke-opacity=".7" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
    + `<path d="M-6,-6.5L-6,6.5" stroke="#140c04" stroke-opacity=".45" stroke-width="1.2"/>`;
}
function shot(p, tr, big) {
  const bx = big ? 150 : 140, t0 = big ? 88 : 90, be = bx - 17;
  let trail = `<path d="M${t0},-22.5L${be},-29.5L${be},-15.5Z" fill="url(#${p}tr)"/>`
    + `<path d="M${t0 + 12},-35L${be - 4},-34L${be - 4},-32.2Z" fill="url(#${p}tr)" opacity=".7"/><path d="M${t0 + 12},-10L${be - 4},-11L${be - 4},-12.8Z" fill="url(#${p}tr)" opacity=".7"/>`;
  if (big) trail += [106, 124].map((x, i) => `<ellipse cx="${x}" cy="-22.5" rx="${3 + i}" ry="${11 + i * 3}" fill="none" stroke="#fff6d8" stroke-opacity="${.55 - i * .15}" stroke-width="1.6"/>`).join('');
  return `<g transform="${tr}">${revolver(p)}${trail}<g transform="translate(${bx},-22.5) scale(1.45)">${flyBullet(p)}</g></g>`;
}
function flash(r, n) {
  let d = '';
  for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n, R = i % 2 ? r * .36 : r * (.7 + .6 * Math.max(0, Math.cos(a))) * (.85 + .3 * rnd());
    d += (i ? 'L' : 'M') + f(R * Math.cos(a)) + ',' + f(R * Math.sin(a)); }
  return d + 'Z';
}
function shotFx(p, tr, big) {
  const d = flash(big ? 30 : 21, big ? 9 : 7);
  return `<g transform="${tr} translate(${big ? 80 : 78},-22.5)"><path d="${d}" fill="#ff7a10" filter="url(#${p}bl)" transform="scale(1.3)"/>`
    + `<path d="${d}" fill="#ff8f1c"/><path d="${d}" fill="#ffd257" transform="scale(.7)"/><path d="${d}" fill="#fff5cf" transform="scale(.4)"/></g>`;
}

// ---------- украшения ----------
function claws(id) {
  const c = 'M0,0C7,14 7,32 0,48C3,32 3,14 0,0Z';
  const one = [[40, 38, -12], [52, 32, -8], [64, 40, -4]].map(([x, y, r]) =>
    `<path d="${c}" transform="translate(${x},${y}) rotate(${r})" fill="url(#${id})"/>`).join('');
  return one + `<g transform="translate(320,0) scale(-1,1)">${one}</g>`;
}
function chevrons(p, n) {
  const ch = tx => `<path d="M${tx},65L${tx + 31},2L${tx + 42},2L${tx + 11},65L${tx + 42},128L${tx + 31},128Z" fill="url(#${p}fr)" ${OL}/>`;
  let l = ''; for (let i = 0; i < n; i++) l += ch(18 + i * 17);
  return l + `<g transform="translate(320,0) scale(-1,1)">${l}</g>`;
}
function rays(p) {
  let s = '';
  for (let i = 0; i < 16; i++) { const w = i % 2 ? 2.2 : 4.5; s += `<path d="M0,0L${-w},-200L${w},-200Z" transform="rotate(${i * 22.5 + 8})"/>`; }
  return `<g transform="translate(160,65)" fill="url(#${p}fr)" opacity=".35">${s}</g>`;
}
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// огонь: язычки пламени слоями (красный → оранжевый → жёлтый → белая сердцевина) + размытое свечение под ними
const tongue = (w, h, b) => `M${f(-w / 2)},0C${f(-w * .62)},${f(-h * .4)} ${f(b - w * .35)},${f(-h * .62)} ${f(b)},${f(-h)}C${f(b + w * .12)},${f(-h * .68)} ${f(w * .72)},${f(-h * .42)} ${f(w / 2)},0Q0,${f(h * .12)} ${f(-w / 2)},0Z`;
const FIRE_OUT = [['#d9380e', 1], ['#ff8f1c', .74], ['#ffd257', .5], ['#fff5cf', .26]];
const FIRE_IN = [['#d8480f', 1], ['#ff8a1c', .7], ['#ffc24a', .45], ['#ffe9a8', .22]];
function fireLayers(list, cols, glow) {
  const T = ([x, y, r, w, h, b], sx, sy) => `<path d="${tongue(w, h, b)}" transform="translate(${f(x)},${f(y)}) rotate(${f(r)}) scale(${f(sx)},${f(sy)})"/>`;
  let s = glow ? `<g filter="url(#${glow})" fill="#ff5a00" opacity=".55">${list.map(t => T(t, 1.1, 1.08)).join('')}</g>` : '';
  for (const [c, k] of cols) s += `<g fill="${c}">${list.map(t => T(t, .5 + .5 * k, k)).join('')}</g>`;
  return s;
}
function flames(p, inner) {
  const L = [];
  if (inner) { // внутри плашки: низкая стена огня снизу, верх остаётся тёмным — череп читается
    for (let x = 10; x <= 310; x += 36) { const c = Math.abs(x - 160) / 160;
      L.push([x + rnd() * 6, 126, (rnd() - .5) * 10, 58 + rnd() * 12, 34 + 30 * c + rnd() * 12, (rnd() - .5) * 30]); }
    return `<g filter="url(#${p}ib)" opacity=".85">${fireLayers(L, FIRE_IN)}</g>`;
  }
  // снаружи: только небольшая «корона» языков над центром верхней рамки, рамка видна целиком
  [100, 117, 134, 151, 169, 186, 203, 220].forEach((x, i) => { const c = 1 - Math.abs(x - 160) / 80, h = 12 + 22 * c + rnd() * 6;
    L.push([x + (rnd() - .5) * 4, 15, (x - 160) * .12, 13 + 4 * c, h, (i % 2 ? 1 : -1) * h * (.2 + rnd() * .15)]); });
  return fireLayers(L, FIRE_OUT, p + 'fg');
}
function sparks(p) {
  let a = '';
  for (let i = 0; i < 16; i++) { const x = 84 + rnd() * 152, y = -18 + rnd() * 50;
    a += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(.6 + rnd() * .7)}" ry="${f(1.4 + rnd() * 2)}" transform="rotate(${f((rnd() - .5) * 40)} ${f(x)} ${f(y)})" fill="${rnd() < .5 ? '#fff2c0' : '#ffc45a'}"/>`; }
  return `<g filter="url(#${p}sg)" fill="#ff8a1a">${a.replace(/ fill="[^"]+"/g, '')}</g><g>${a}</g>`;
}

// ---------- настройки званий ----------
const HILL_FAR = 'M0,66C40,58 70,62 110,52C150,44 190,56 230,50C270,44 300,52 320,48L320,130L0,130Z';
const HILL = 'M0,82C30,70 60,76 92,66C130,54 160,72 200,64C240,56 270,70 320,60L320,130L0,130Z';
const T7 = "translate(108,74) scale(.9)", T8 = "translate(106,78) rotate(-7) scale(.9)";
const CFG = [
  { bg: ['#a9adb2', '#73777c'], frame: 'silver', em: 'silver', e: p => `<g transform="translate(160,66) rotate(40) scale(.82)">${bullet(p)}</g>` },
  { bg: ['#6f7f96', '#3d4656'], hills: ['#9aa8bb', '#262d39'], frame: 'silver', em: 'silver',
    e: p => [18, 58].map(a => `<g transform="translate(138,98) rotate(${a}) scale(.78) translate(0,-37)">${bullet(p)}</g>`).join('') },
  { bg: ['#466a9c', '#1d2c48'], hills: ['#7ea2cf', '#16223a'], frame: 'silver', em: 'silver', e: p => `<g transform="translate(160,65) scale(.95)">${drum(p, 1)}</g>` },
  { bg: ['#2c4472', '#111a30'], hills: ['#5677ad', '#0c1324'], frame: 'silver', em: 'silver', claws: 1, e: p => `<g transform="translate(160,65)">${drum(p, 2)}</g>` },
  { bg: ['#2e4378', '#0f1830'], hills: ['#5a74b4', '#0b1226'], frame: 'gold', em: 'gold', e: p => `<g transform="translate(160,65)">${drum(p, 3)}</g>` },
  { bg: ['#43336f', '#160f33'], hills: ['#7462a8', '#100a26'], frame: 'gold', em: 'gold', claws: 1, e: p => `<g transform="translate(160,65) scale(1.08)">${drum(p, 5)}</g>` },
  { bg: ['#9a2330', '#3a0710'], hills: ['#c4505c', '#2a050b'], frame: 'gold', em: 'gold', chev: 1, e: p => shot(p, T7, 0), fx: p => shotFx(p, T7, 0) },
  { bg: ['#7a1622', '#21040a'], hills: ['#a8404c', '#180307'], frame: 'gold', em: 'gold', chev: 2, e: p => shot(p, T8, 1), fx: p => shotFx(p, T8, 1) },
  { bg: ['#2a2a2e', '#050505'], frame: 'gold', em: 'gold', thick: 1, rays: 1, e: p => `<g transform="translate(160,64) scale(.98)">${skullGuns(p)}</g>` },
  // 10 — по картинке владельца (21.11), в нашем формате: золотая рамка как у 9-го, оранжевый фон с прожилками, золотая звезда, череп с белыми светящимися глазами
  { radial: ['#ffa035', '#e2501a', '#7a1404'], frame: 'gold', em: 'gold', thick: 1, glow: 1, streaks: 1, e: p => `<g transform="translate(160,65)">${star(p)}<g transform="translate(0,2) scale(1.02)">${skull(p, 1, false)}</g></g>` },
];

function build(i) {
  seed = 7 + i * 101; // у каждого звания свой случайный рисунок, правка одного не меняет другие
  const n = i + 1, p = `rr${n}-`, C = CFG[i], gold = C.frame !== 'silver';
  const inner = C.thick ? 8 : gold ? 6 : 7;
  let defs = lg(p + 'fr', STOPS[C.frame], 0, 0, .15, 1) + lg(p + 'em', STOPS[C.em], 0, 0, .6, 1) + lg(p + 'br', STOPS.gold, 0, 0, 1, 1)
    + `<radialGradient id="${p}sh" cx=".32" cy=".28" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient>`
    + lg(p + "tr", [[0, "#fff", 0], [1, "#fff6d8", .9]], 0, 0, 1, 0)
    + `<filter id="${p}bl" filterUnits="userSpaceOnUse" x="-40" y="-60" width="400" height="240"><feGaussianBlur stdDeviation="4"/></filter>`
    + `<clipPath id="${p}c"><path d="${hex(inner)}"/></clipPath>`
    + `<filter id="${p}ds" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.5"/><feOffset dx="1.5" dy="3"/><feComponentTransfer><feFuncA type="linear" slope=".6"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  if (C.fire) defs += `<radialGradient id="${p}bg" cx=".5" cy="1" r="1"><stop offset="0" stop-color="#ffd27a"/><stop offset=".35" stop-color="#f0701a"/><stop offset=".7" stop-color="#8a1a08"/><stop offset="1" stop-color="#2a0503"/></radialGradient>`
    + `<radialGradient id="${p}eye"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffb020"/><stop offset="1" stop-color="#c02a00"/></radialGradient>`
    + `<radialGradient id="${p}glow"><stop offset="0" stop-color="#fffbe6" stop-opacity=".55"/><stop offset="1" stop-color="#ffd060" stop-opacity="0"/></radialGradient>`
    + `<filter id="${p}gl" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation=".8"/></filter>`
    + `<filter id="${p}fg" filterUnits="userSpaceOnUse" x="-40" y="-60" width="400" height="240"><feGaussianBlur stdDeviation="3"/></filter>`
    + `<filter id="${p}sg" filterUnits="userSpaceOnUse" x="-40" y="-60" width="400" height="240"><feGaussianBlur stdDeviation="1.6"/></filter>`
    + `<filter id="${p}ib" filterUnits="userSpaceOnUse" x="-40" y="-60" width="400" height="240"><feGaussianBlur stdDeviation="2.2"/></filter>`;
  else if (C.radial) defs += `<radialGradient id="${p}bg" cx=".5" cy=".55" r=".75"><stop offset="0" stop-color="${C.radial[0]}"/><stop offset=".6" stop-color="${C.radial[1]}"/><stop offset="1" stop-color="${C.radial[2]}"/></radialGradient>`;
  else defs += lg(p + 'bg', [[0, C.bg[0]], [1, C.bg[1]]]);
  if (C.glow) defs += `<radialGradient id="${p}eye"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff6d8"/><stop offset="1" stop-color="#ffc95a"/></radialGradient>`
    + `<filter id="${p}gl" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.1"/></filter>`;

  // фон плашки
  let back = `<rect x="0" y="0" width="320" height="130" fill="url(#${p}bg)"/>`;
  if (C.hills) back += `<path d="${HILL_FAR}" fill="${C.hills[0]}" opacity=".22"/><path d="${HILL}" fill="${C.hills[1]}" opacity=".6"/>`;
  if (C.rays) back += rays(p);
  if (C.fire) back += flames(p, 1);
  if (C.claws) back += claws(p + 'em');
  if (C.streaks) back += `<g fill="none" stroke="#ffd9a0" stroke-opacity=".14" stroke-width="1.2"><path d="M10,30C60,50 90,20 140,44S230,30 300,52"/><path d="M0,92C50,78 110,104 170,86S260,96 320,80"/><path d="M40,118C80,100 120,112 150,96"/><path d="M200,20C230,36 260,28 300,40"/></g>`;   // прожилки, как на картинке владельца
  back += `<path d="M0,10L320,10L320,46C220,58 100,38 0,56Z" fill="#fff" opacity=".07"/>`;

  // рамка: серебро — одна; золото — толстая + тёмный зазор + тонкая внутренняя
  let frame = `<path d="${ring(0, inner)}" fill="url(#${p}fr)" fill-rule="evenodd" ${OL.replace('1.6', '1')}/>`;
  frame += gold
    ? `<path d="${ring(inner, inner + 3)}" fill="#000" opacity=".35" fill-rule="evenodd"/><path d="${ring(inner + 3, inner + 4.6)}" fill="url(#${p}fr)" fill-rule="evenodd"/>`
    : `<path d="${ring(inner, inner + 1.2)}" fill="#000" opacity=".4" fill-rule="evenodd"/>`;

  let over = '';
  if (C.chev) over += chevrons(p, C.chev);
  if (C.fire) over += flames(p, 0) + `<circle cx="160" cy="62" r="70" fill="url(#${p}glow)"/>`;

  const r = RANKS[i];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -20 340 170" width="340" height="170"><title>${r.name} — от ${r.pts} очков</title><defs>${defs}</defs>`
    + `<g clip-path="url(#${p}c)">${back}</g>${frame}${over}<g filter="url(#${p}ds)">${C.e(p)}</g>${C.fx ? C.fx(p) : ""}${C.fire ? sparks(p) : ''}</svg>\n`;
}

fs.mkdirSync(OUT, { recursive: true });
CFG.forEach((_, i) => fs.writeFileSync(path.join(OUT, `rank-${i + 1}.svg`), build(i)));
fs.writeFileSync(path.join(OUT, 'ranks.json'), JSON.stringify(RANKS.map((r, i) => ({ n: i + 1, ...r, icon: `rank-${i + 1}.svg` })), null, 1) + '\n');
console.log('ok:', CFG.length, 'значков →', OUT);

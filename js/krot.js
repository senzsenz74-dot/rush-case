/* ============================================================
   RUSH CASE — режим «КРОТ» (#/krot): социальная дедукция за столом.
   Подключается из js/app.js по требованию (krotLoad) вместе с css/krot.css.
   Сервер — supabase/krot.sql (протокол — в шапке файла), план — ПЛАН_КРОТ.md.
   Этап 2: меню, лобби, 3D-стол от первого лица (фигуры-манекены), карточка в руках,
   чат, голосование, вскрытие, разбор. Голос (WebRTC) — этап 3, модели персонажей — этап 5.
   #/krot/<КОД> — ссылка-приглашение в комнату друзей.
   #/krot/demo  — проба с ботами без сервера (только на localhost, на сайте недоступна).
   app.js закрыт в своей области видимости — нужное он передаёт в KROT.mount(el, arg, { sb, esc, openAuth, user }).
   ============================================================ */
(() => {
'use strict';
const K = window.KROT = {};
const DEMO_OK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const $ = (s, r = document) => r.querySelector(s);
let esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let sb = null, openAuth = null, getUser = () => null, soundOn = () => true, siteToast = null;   // из app.js (KROT.mount / KROT.mmInit)
let prcF = null, applyProf = null, refreshProf = null;   // цена (prc), применить профиль с сервера (баланс), перечитать профиль
const money = v => prcF ? prcF(Math.round(+v || 0)) : Math.round(+v || 0) + ' ₽';
function setDeps(dep) { if (!dep) return; if (dep.prc) prcF = dep.prc; if (dep.apply) applyProf = dep.apply; if (dep.refresh) refreshProf = dep.refresh; if (dep.sb) sb = dep.sb; if (dep.openAuth) openAuth = dep.openAuth; if (dep.toast) siteToast = dep.toast; if (dep.esc) esc = dep.esc; if (dep.user) getUser = dep.user; if (dep.sound) soundOn = dep.sound; }

/* ---------- константы ---------- */
const EYE = 1.28, TOP = .765;                                                  // высота глаз, высота сукна (м)
// «Русская рулетка»: 5 мест вокруг овального покерного стола. TA/TB — полуоси внешнего края бортика (м),
// SEAT_OFF — центр стула дальше края на столько. Места — через равные отрезки по краю овала, место 1 — середина ближней длинной стороны.
const NS = 5, SEATS = [1, 2, 3, 4, 5], TA = 1.32, TB = .84, SEAT_OFF = .36;
const SEAT = (() => {
  const N = 1440, pts = []; let L = 0;
  for (let i = 0; i <= N; i++) { const f = i / N * Math.PI * 2, x = Math.sin(f) * TA, z = Math.cos(f) * TB; if (i) L += Math.hypot(x - pts[i - 1].x, z - pts[i - 1].z); pts.push({ f, x, z, L }); }
  const out = {};
  for (let s = 1; s <= NS; s++) {
    const want = (s - 1) / NS * L, p = pts.find(q => q.L >= want) || pts[0];
    const nx = Math.sin(p.f) / TA, nz = Math.cos(p.f) / TB, nl = Math.hypot(nx, nz), ux = nx / nl, uz = nz / nl;   // наружная нормаль к краю
    out[s] = { x: p.x + ux * SEAT_OFF, z: p.z + uz * SEAT_OFF, yaw: Math.atan2(ux, uz) };
  }
  return out;
})();
const BOXP = { 1: [-.2, -.16], 2: [.2, -.16], 3: [-.2, .16], 4: [.2, .16] };   // центры контейнеров на столе (x, z)
const COL = { amber: '#e3a33b', red: '#e2493f', green: '#4fbf62', blue: '#3f8fe6' };
const DICT0 = { sym: { tri: 'треугольник', circle: 'круг', hex: 'шестиугольник', rhomb: 'ромб' },
  gun: { pistol: 'пистолет', rifle: 'винтовка', sniper: 'снайперская винтовка', knife: 'нож' },
  col: { amber: 'янтарная', red: 'красная', green: 'зелёная', blue: 'синяя' } };
const SHORT = { sym: { tri: 'треуг.', circle: 'круг', hex: 'шестиуг.', rhomb: 'ромб' }, gun: { pistol: 'пистолет', rifle: 'винтовка', sniper: 'снайперка', knife: 'нож' },
  col: { amber: 'янтарь', red: 'красный', green: 'зелёный', blue: 'синий' } };   // для узкой таблицы досье
const SYM = { tri: 'M12 3.2 21.6 20H2.4Z', circle: 'M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0Z',
  hex: 'M7.2 3.6h9.6L21.6 12l-4.8 8.4H7.2L2.4 12Z', rhomb: 'M12 2.2 20.4 12 12 21.8 3.6 12Z' };
const GUN = {   // силуэты оружия, 48×24, дулом вправо
  pistol: 'M13 6H44V11H40V13H30V16H27V13.5H24L20 23H11.5L15.8 13H13ZM41 4.6h2V6h-2ZM14 4.8h2.4V6H14Z',
  rifle: 'M1.5 10.5 10 9H12V8H31V8.6H38V9.2H47V10.6H38V12.2H31V13H28.5L30.5 20.5 26.6 21.5 24.6 13H19.5L17.4 19H13.8L15.6 13H11L4.5 16.5H1.5ZM44.5 7.6h1.4v1.6h-1.4ZM24 6.8h2V8h-2Z',
  sniper: 'M1 9.5 9 9 12 10.5H14V10H31V10.6H45.6V9.8h1.8v2.6h-1.8V12H31V13.5H25V17.5H21.5V13.5H18.5L16.5 19H13L14.8 13.5H12L10 15.5H4L1 13.5ZM15.5 5.5H27.5V4.8h2.6v4.4h-2.6V8.5H15.5ZM18 8.5h1.6V10H18ZM25 8.5h1.6V10H25Z',
  knife: 'M2.5 10.8H15V8.6h2.6v2H38C42 10.6 45 11.2 47 12.2 44.5 13.6 40 14.4 34 14.4H17.6V16H15V13.8H2.5C1.6 13.8 1 13.2 1 12.3S1.6 10.8 2.5 10.8Z' };
const PH = { lobby: 'Сбор игроков', play: 'Раунд', next: 'Раунд окончен', done: 'Игра окончена' };
const HINT = { lobby: 'Ждём пятерых игроков.' };
// правила «Русской рулетки» (сервер берёт те же числа из настроек): ход, патроны по числу живых, очки за место, пауза между раундами
const RR = { turn: 20, bul: { 5: 1, 4: 1, 3: 1, 2: 1 },   // владелец 21.11: в каждом раунде 1 патрон, остальные покупают
  pts: { 1: 10, 2: 6, 3: 3, 4: 1, 5: 0 }, next: 5, intro: 15,
  maxBul: 4, minBet: 100, maxBet: 100000, fee: .05, votePct: .5, voteSec: 10, rdelay: 5000 };   // владелец 21.11: максимум 4 патрона, ставки, голосование, жребий 5 с   // intro — знакомство за столом до раунда 1 (сервер: site_cfg 'rr'.intro)
// шанс выстрела: патроны в случайных гнёздах; после k пустых щелчков без прокрутки — b из (6 − k)
const rrChance = (b, k) => (6 - k > 0 ? Math.min(1, b / (6 - k)) : 1);
const pct = v => Math.round(v * 100) + '%';
const plural = n => (n === 1 ? 'патрон' : n < 5 ? 'патрона' : 'патронов');
const ICO_DRUM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="6.6" r="1.7"/><circle cx="16.7" cy="9.3" r="1.7"/><circle cx="16.7" cy="14.7" r="1.7"/><circle cx="12" cy="17.4" r="1.7"/><circle cx="7.3" cy="14.7" r="1.7"/><circle cx="7.3" cy="9.3" r="1.7"/></svg>';
const ICO_GUN = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 7.2h13.6l.9-.9h3.3v2.9h-3l-.9.9h-4.6v1.4l-.9.5v1H9.7l-.8 1.9c-.3.6-.8.9-1.4.9H5.8l1.3-4.1h-.7L4.8 14H2.9l1.3-4.2H2z"/></svg>';
const REASON = { majority: 'большинством голосов', revote: 'на доп. голосовании' };
const CANCEL = { disconnect: 'игрок не вернулся вовремя', few_votes: 'проголосовало меньше двух Оперативников', abandoned: 'все игроки вышли' };
const REPORT = [['abuse', 'Оскорбления'], ['cheat', 'Подсказки со стороны или сговор'], ['spam', 'Спам в чате'], ['afk', 'Не участвует в игре'], ['other', 'Другое']];
const ERR = { 'not authenticated': 'Войдите в аккаунт, чтобы играть', 'not in room': 'Вы не в этой комнате', 'room not found': 'Комната с таким кодом не найдена',
  'already started': 'В этой комнате игра уже идёт', 'room full': 'В комнате уже 5 игроков', 'too many rooms': 'Слишком много комнат за час — попробуйте позже',
  'not lobby': 'Игра уже началась', 'not talk': 'Кнопка работает только во время обсуждения', 'closed': 'Голосование уже закрыто', 'vote locked': 'Ваш голос уже зафиксирован', 'bad box': 'Этот контейнер сейчас выбрать нельзя',
  'empty': 'Пустое сообщение', 'too long': 'Слишком длинное сообщение', 'too fast': 'Не так быстро — подождите секунду', 'repeat': 'Такое сообщение уже было',
  'too many reports': 'Слишком много жалоб — попробуйте позже', 'bad player': 'Этого игрока выбрать нельзя',
  'not leader': 'Поиск запускает лидер группы', 'member in game': 'Кто-то из группы ещё доигрывает матч', 'in game': 'Сначала доиграйте текущий матч',
  'party not found': 'Группа с таким кодом не найдена', 'party full': 'В группе уже 5 человек', 'party busy': 'Группа сейчас принимает матч — попробуйте через полминуты',
  'match pending': 'Сначала ответьте на «Ваша игра готова!»', 'no match': 'Матч уже не ждёт ответа', 'too late': 'Время на «Принять» вышло',
  'not your turn': 'Сейчас не ваш ход', 'dead': 'Выбывшие только читают чат' };
const ICO = {
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.3 6.4C3.6 8.2 2 12 2 12s3.6 7 10 7c1.8 0 3.3-.5 4.6-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 21 3l-6.5 18-3-7.5Z" fill="currentColor"/></svg>',
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9c0-3.3 3.1-6 7-6s7 2.7 7 6M16 3.2a4 4 0 0 1 0 7.6M18 14.2c2.4.8 4 2.9 4 5.8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.3 9.2a2.8 2.8 0 1 1 3.8 2.6c-.8.3-1.1.9-1.1 1.7v.6M12 17.2v.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" opacity=".45"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  spk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4Z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  spkOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4Z" fill="currentColor"/><path d="m16 9 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' };

/* ---------- мелочи ---------- */
const nn = n => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeIO = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeBack = k => { const c = 1.25; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const rnd = n => Math.floor(Math.random() * n);
const pickOne = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const LS = { get(k, d) { try { const v = localStorage.getItem('krot:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('krot:' + k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } } };
const authed = () => { try { const u = getUser(); return !!(u && u.sb); } catch (e) { return false; } };
const myName = () => { try { const u = getUser(); return (u && (u.name || u.nick)) || 'Вы'; } catch (e) { return 'Вы'; } };
const errMsg = e => String((e && (e.message || e.error_description || e.msg)) || e || '');
const ERR2 = { 'bets closed': 'Ставки уже закрыты', 'bad bet': 'Ставка — от 100 ₽', 'no money game': 'В этой игре без ставок', 'vote on': 'Идёт голосование — подождите',
  'vote used': 'Вы уже предлагали патрон в этом раунде', 'max bullets': 'В барабане уже 4 патрона — больше нельзя', 'not vote time': 'Сейчас голосовать нельзя',
  'no vote': 'Голосование уже закончилось', 'voted': 'Вы уже проголосовали', 'vote not yours': 'Поднять руку может только тот, кто выстрелил и выжил, — пока не выстрелил следующий', 'final no vote': 'В финале вдвоём голосовать нельзя' };
const errText = e => { const m = errMsg(e);
  if (m.includes('low balance')) { const who = (m.split('low balance:')[1] || '').trim(); return 'Не хватает баланса: нужно от ' + RR.minBet + ' ₽' + (who ? ' — ' + who : ''); }
  for (const k in ERR2) if (m.includes(k)) return ERR2[k];
  for (const k in ERR) if (m.includes(k)) return ERR[k]; return /fetch|network|Failed|timeout|Load failed/i.test(m) ? 'Нет связи с сервером' : 'Не получилось: ' + m.slice(0, 90); };
const isNet = e => /fetch|network|Failed|timeout|Load failed|ECONN|503|502|504/i.test(errMsg(e));
async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const svgSym = k => SYM[k] ? `<svg class="kr-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${SYM[k]}" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/></svg>` : '';
const svgGun = k => GUN[k] ? `<svg class="kr-ic kr-icg" viewBox="0 0 48 24" aria-hidden="true"><path d="${GUN[k]}" fill="currentColor" fill-rule="evenodd"/></svg>` : '';
const sw = c => `<i class="kr-sw" style="--c:${COL[c] || '#888'}"></i>`;
const clueIco = c => !c ? '' : c.attr === 'sym' ? svgSym(c.val) : c.attr === 'gun' ? svgGun(c.val) : sw(c.val);
const clueShort = (a, v, d = DICT0) => (a === 'sym' ? 'знак — ' : a === 'gun' ? 'внутри — ' : 'маркировка — ') + d[a][v];
const seatB = s => `<b class="kr-s">${s || '·'}</b>`;

/* ---------- состояние ---------- */
let root = null, ui = null, gen = 0, api = null, view = '';
let S = null, room = 0, off = 0, lastPhase = '', busy = false;
let chat = [], seen = new Set(), lastChat = 0;
let pend = null, draft = 0;
let timers = [], worker = null, chDb = null, chRt = null, raf = 0, lastT = 0;
let G = null, briefSeen = 0, openRound = 0, openDone = false, proof = null;
let hideCard = LS.get('hide', false), plTemp = false, ov = '', chatOpen = false, unread = 0, lostNet = false;
let lastSec = -1, lastKick = 0, sent = { y: 9, p: 9, t: 0 }, drag = null;
const H = {};

/* ---------- связь с сервером (или демо) ---------- */
// сервер «Русской рулетки» — функции rr_* (supabase/roulette.sql); имена krot_* в коде остались от «Крота» (их же понимают демо и демо-подбор)
const SRV = { async rpc(n, a) { const { data, error } = await sb.rpc(n.replace(/^krot_/, 'rr_'), a || {}); if (error) throw error; return data; } };

/* ============================================================
   Вход на страницу / уход
   ============================================================ */
K.mount = (el, arg, dep) => {
  K.stop();
  setDeps(dep);
  root = el; const g = ++gen;
  const demo = arg === 'demo' && DEMO_OK;
  api = demo ? Demo : SRV;
  root.innerHTML = `<canvas class="kr-cv" id="krCv" tabindex="-1" aria-label="Игровой стол"></canvas><div class="kr-shade"></div><div class="kr-ui" id="krUi"></div><div class="kr-ov" id="krOv"></div>`;
  ui = $('#krUi', root);
  window.scrollTo(0, 0); setTop(); listen(); bindCanvas($('#krCv', root));
  raf = requestAnimationFrame(loop);
  start3D(g);
  const code = /^[A-Za-z0-9]{6}$/.test(arg || '') ? arg.toUpperCase() : '';
  if (demo) { drawMenu(); return act('quick'); }
  if (!authed()) { drawMenu(); if (code) note('Войдите, чтобы вступить в группу ' + code); return; }
  if (code) { drawMenu(); K.mmJoin(code); return; }
  const saved = LS.get('room', 0);
  if (!saved) { if (api !== Demo && authed()) { location.hash = '#/'; K.mmPlay(); return; } return drawMenu(); }   // владелец 21.11: #/krot без комнаты (ссылка «Играть», новость) — главная и сразу поиск
  drawMenu(true); room = saved;
  api.rpc('krot_state', { p_room: saved, p_after: 0 }).then(d => {
    if (g !== gen) return;
    const stale = d.room.phase === 'done' && d.now - d.room.phase_at > 90000;
    if (stale) { room = 0; LS.set('room', 0); drawMenu(); return; }
    enterRoom(d);
  }).catch(() => { if (g !== gen) return; room = 0; LS.set('room', 0); drawMenu(); });
};

K.stop = () => {
  gen++;
  vcLeave();
  stopSync();
  if (raf) cancelAnimationFrame(raf); raf = 0;
  if (G) { try { G.dispose(); } catch (e) { /* уже освобождено */ } G = null; }
  unlisten();
  if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { /* нет захвата */ }
  if (api === Demo) Demo.stop();
  root = ui = null; S = null; room = 0; view = ''; lastPhase = ''; pend = null; draft = 0; busy = false; ov = '';
  chat = []; seen = new Set(); lastChat = 0; proof = null; openRound = 0; briefSeen = 0;
  lastEv = 0; lastGame = 0; actBusy = false; actLock = 0; actShown = ''; keyDown = ''; spinNote = null; keysGame = 0; keysTurn = 0; capHoldUntil = 0;
};

function setTop() {
  if (!root) return;
  const t = root.getBoundingClientRect().top + (window.scrollY || 0);
  root.style.setProperty('--krTop', Math.max(0, Math.round(t)) + 'px');
}

/* ---------- клавиатура, мышь ---------- */
function listen() {
  H.kd = e => onKey(e, true); H.ku = e => onKey(e, false);
  H.plc = () => { const on = !!root && document.pointerLockElement === $('#krCv', root); if (root) root.classList.toggle('lock', on); if (G) { G.setLock(on); if (!on) G.setRead(false); } };
  H.res = () => setTop();
  H.scr = () => { if (window.scrollY && root) window.scrollTo(0, 0); };   // игра на весь экран: страница не прокручивается (фокус в чате и т. п.)
  H.pu = e => {
    if (e.button === 2 && G) G.setRead(false);
    if (e.button === 0 && drag && !drag.moved && G && S && S.room.phase === 'done') { const cv = $('#krCv', root), r = cv && cv.getBoundingClientRect(), a = r && G.tvPick((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, false); if (a) tvAct(a); }   // кнопки на экране итога
    else if (e.button === 0 && drag && !drag.moved && G) { if (G.aimBtn() && canBtn()) voteReady(); else { const a = G.aim(); if (a && canPick()) vote(a); } }   // клик без перетаскивания — выбор контейнера
    drag = null; if (root) root.classList.remove('drag');
  };
  H.bu = e => { if (S && room && ['play', 'next'].includes(S.room.phase) && S.me && S.me.alive !== false) { e.preventDefault(); e.returnValue = ''; } };
  H.blur = () => { if (plTemp) showPlayers(false); vcKey(false); };
  window.addEventListener('keydown', H.kd, true); window.addEventListener('keyup', H.ku, true);
  document.addEventListener('pointerlockchange', H.plc); window.addEventListener('resize', H.res); window.addEventListener('scroll', H.scr, { passive: true });
  window.addEventListener('pointerup', H.pu); window.addEventListener('beforeunload', H.bu); window.addEventListener('blur', H.blur);
}
function unlisten() {
  window.removeEventListener('keydown', H.kd, true); window.removeEventListener('keyup', H.ku, true);
  document.removeEventListener('pointerlockchange', H.plc); window.removeEventListener('resize', H.res); window.removeEventListener('scroll', H.scr);
  window.removeEventListener('pointerup', H.pu); window.removeEventListener('beforeunload', H.bu); window.removeEventListener('blur', H.blur);
}
function onKey(e, down) {
  if (!root || view !== 'room') return;
  const inp = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.code === 'KeyV' && !e.ctrlKey && !e.metaKey && !e.altKey) {   // зажать V — говорить; отпускание — всегда (даже в чате), иначе микрофон «залипает» открытым
    if (!down) { vcKey(false); if (!inp) e.preventDefault(); return; }
    if (!inp) { e.preventDefault(); if (!e.repeat) vcKey(true); return; }
  }   // зажать V — говорить
  if (e.key === 'Tab' && !$('.modal-ov')) { e.preventDefault(); if (down && !e.repeat && ov !== 'players') { plTemp = true; showPlayers(true); } else if (!down && plTemp) showPlayers(false); return; }
  if (e.code === 'KeyR' && !down) { spinUp(); return; }   // отпустили R — барабан останавливается на делении
  if (!down) return;
  if (e.key === 'Escape') { if (inp) { e.target.blur(); return; } if (ov) { closeOv(); return; } return; }
  if (inp || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter') { const i = $('#krIn', root); if (i) { e.preventDefault(); if (document.pointerLockElement) document.exitPointerLock(); openChat(true); i.focus({ preventScroll: true }); } return; }
  if (e.code === 'KeyR') { e.preventDefault(); if (!e.repeat) spinDown(); return; }
  if (e.code === 'KeyG' && !e.repeat && canVote()) { e.preventDefault(); voteAct('start'); return; }   // поднять руку: +1 патрон
  if ((e.key === 'F1' || e.key === 'F2') && S && S.game && S.game.vote) { e.preventDefault(); if (!e.repeat) voteAct(e.key === 'F1' ? 'yes' : 'no'); return; }       // владелец 21.11: нажал — 1 деление, зажал — крутится
  if ((e.code === 'Space' || e.code === 'KeyF') && !e.repeat) { e.preventDefault(); rrAct('shoot'); }   // выстрел
}
function bindCanvas(cv) {
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    if (view !== 'room' || !G) return;
    if (e.button === 2) { G.setRead(true); return; }
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* не важно */ }
    root.classList.add('drag');
  });
  cv.addEventListener('pointermove', e => {
    if (!G) return;
    const r = cv.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width * 2 - 1, my = -((e.clientY - r.top) / r.height) * 2 + 1; G.mouse(mx, my);
    root.classList.toggle('tvh', !!G.tvPick(mx, my));   // курсор-рука над кнопкой на экране итога
    if (!drag || drag.id !== e.pointerId || (e.pointerType === 'mouse' && !(e.buttons & 1))) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
    if (drag.moved) G.look((e.clientX - drag.x) * 1.5, (e.clientY - drag.y) * 1.5);   // голова крутится, пока зажата ЛКМ
    drag.x = e.clientX; drag.y = e.clientY;
  });
  cv.addEventListener('pointerleave', () => { if (G && !drag) { G.mouse(null); G.tvPick(null); root.classList.remove('tvh'); } });
}
const canBtn = () => !!(S && S.room.phase === 'talk' && !S.room.paused);
const canPick = () => !!(S && S.round && ['brief', 'talk', 'vote', 'revote'].includes(S.room.phase) && !S.room.paused);

/* ---------- клики по интерфейсу ---------- */
function onClick(e) {
  const b = e.target.closest('[data-a],[data-box],[data-join]'); if (!b || !root || !root.contains(b)) return;
  if (b.dataset.box) { vote(+b.dataset.box); return; }
  if (b.dataset.join) { joinCode(b.dataset.join); return; }
  const a = b.dataset.a;
  if (a === 'quick') act('quick');
  else if (a === 'play') K.mmPlay();
  else if (a === 'invite') K.mmInvite();
  else if (a === 'create') act('create');
  else if (a === 'login') { if (typeof openAuth === 'function') openAuth('login'); }
  else if (a === 'how') openOv('how');
  else if (a === 'players') openOv('players');
  else if (a === 'close') closeOv();
  else if (a === 'copy') copy(S && S.room.code, 'Код скопирован');
  else if (a === 'bet') betSend(+b.dataset.v);
  else if (a === 'vstart') voteAct('start');
  else if (a === 'vyes') voteAct('yes');
  else if (a === 'vno') voteAct('no');
  else if (a === 'betIn') betIn();
  else if (a === 'link') copy(S && location.origin + location.pathname + '#/krot/' + S.room.code, 'Ссылка-приглашение скопирована');
  else if (a === 'ready') ready();
  else if (a === 'bot-add') botAct('krot_bot_add', {});
  else if (a === 'bot-del') botAct('krot_bot_del', { p_seat: +b.dataset.seat });
  else if (a === 'leave') leaveAsk();
  else if (a === 'leave-yes') { closeOv(); leave(); }
  else if (a === 'again') again();
  else if (a === 'menu') leave(true);
  else if (a === 'copyres') copy(resultText(), 'Итог скопирован');
  else if (a === 'brief-ok') { briefSeen = S && S.round ? S.round.id : briefSeen; drawMid(); }
  else if (a === 'spin') rrAct('spin');
  else if (a === 'shoot') rrAct('shoot');
  else if (a === 'report') openOv('report', +b.dataset.seat);
  else if (a === 'rep-send') sendReport(b);
  else if (a === 'chat') openChat(!chatOpen);
  else if (a === 'skip') { if (G) G.skipOpen(); }
  else if (a === 'mic') micStart();
  else if (a === 'vready') voteReady();
  else if (a === 'voice') { if (VC.needTap) vcTapPlay(); else openOv('voice'); }
  else if (a === 'vmode') { vcSet('mode', b.dataset.v); if (ov === 'voice') openOv('voice'); else drawMid(); }
  else if (a === 'vmute') { const p = S && S.players.find(q => q.seat === +b.dataset.seat); if (p) { vcPlayerMute(p); drawOvLive(true); } }
  else if (a === 'mic-retry') vcMic();
  else if (a === 'spk') spkTest();
}
function onSubmit(e) {
  const f = e.target; if (!root || !root.contains(f)) return;
  e.preventDefault();
  if (f.id === 'krJoin') { const v = ($('#krCode', f).value || '').trim().toUpperCase(); if (!/^[A-Z0-9]{6}$/.test(v)) return note('Код — 6 букв и цифр', 'err'); K.mmJoin(v); }
  else if (f.id === 'krChF') { const i = $('#krIn', f); const t = i.value; if (!t.trim()) { i.blur(); return; } sendChat(t).then(ok => { if (ok) i.value = ''; }); }
}

/* ============================================================
   Действия
   ============================================================ */
async function act(kind, arg) {
  if (busy) return; busy = true; const g = gen;
  drawBusy(true);
  try {
    await leaveFinished();
    const d = kind === 'quick' ? await api.rpc('krot_quick') : kind === 'create' ? await api.rpc('krot_create', { p_private: true }) : await api.rpc('krot_join', { p_code: arg });
    if (g !== gen) return;
    enterRoom(d);
    if (d.rejoin) note('Вы вернулись в идущий матч');
  } catch (e) {
    if (g !== gen) return;
    note(errText(e), 'err');
    if (/not authenticated/.test(errMsg(e)) && typeof openAuth === 'function') openAuth('login');
  } finally { if (g === gen) { busy = false; drawBusy(false); } }
}
// из законченного матча (вскрытие/разбор) сначала выходим — иначе сервер вернёт в него же
async function leaveFinished() {
  if (room && S && ['open', 'debrief'].includes(S.room.phase)) { try { await api.rpc('krot_leave', { p_room: room }); } catch (e) { /* не важно */ } }
}
async function joinCode(code) {
  if (S && S.room.code === code) return;
  act('join', code);
}
async function again() {
  if (busy || !S) return;
  if (S.room.kind !== 'private') {   // владелец 20.11: сразу главный экран сайта с уже идущим поиском, очки летят монетками в аватарку
    const me = myPlayer(), pts = S.room.points && me && me.pts > 0 ? me.pts : 0;
    await leaveFinished(); roomless();
    location.hash = '#/'; K.mmPlay();
    // if (pts) coinsFly(pts);   // монетки-очки — убраны «пока что» (владелец 20.11); код coinsFly/coinTick оставлен, проверка KROT.dbg.coins(8)
    return;
  }
  busy = true; const g = gen, old = room;
  try {
    await leaveFinished();
    const d = await api.rpc('krot_create', { p_private: true });
    if (g !== gen) return;
    api.rpc('krot_chat_send', { p_room: old, p_text: 'Новая комната: ' + d.room.code }).catch(() => { /* друзья увидят код у себя в меню */ });
    enterRoom(d);
    note('Новая комната ' + d.room.code + ' — код отправлен в чат прошлой игры');
  } catch (e) { if (g === gen) note(errText(e), 'err'); } finally { if (g === gen) busy = false; }
}
/* монетки-очки: от персонажа на главной (#mnAgent) в аватарку игрока (.lu-ava), «+N очков» у аватарки */
function coinsFly(pts) {
  let tries = 0;
  const go = () => {
    const src = document.getElementById('mnAgent'), dst = document.querySelector('.lu .lu-ava') || document.querySelector('.lu .lu-steam');   // гость (демо) — в кнопку входа
    const a = src && src.getBoundingClientRect(), b = dst && dst.getBoundingClientRect();
    if (!a || !b || !a.width || !b.width) { if (++tries < 50) setTimeout(go, 100); return; }   // главная ещё рисуется
    const tx = b.left + b.width / 2, ty = b.top + b.height / 2, tag = () => {
      const t = document.createElement('b'); t.className = 'rr-coin-tag'; const m10 = pts % 10, m100 = pts % 100; t.textContent = '+' + pts + (m10 === 1 && m100 !== 11 ? ' очко' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? ' очка' : ' очков');
      t.style.left = (b.right + 10) + 'px'; t.style.top = ty + 'px'; document.body.appendChild(t);
      t.animate([{ opacity: 0, transform: 'translate(-4px,-50%) scale(.7)' }, { opacity: 1, transform: 'translate(0,-50%) scale(1.08)', offset: .15 }, { opacity: 1, transform: 'translate(0,-50%) scale(1)', offset: .75 }, { opacity: 0, transform: 'translate(0,-140%) scale(1)' }], { duration: 2200, easing: 'ease-out' }).onfinish = () => t.remove();
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { tag(); return; }
    const n = Math.min(14, Math.max(6, pts + 4)), sx = a.left + a.width * .5, sy = a.top + a.height * .4;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i'); c.className = 'rr-coin'; document.body.appendChild(c);
      const bx = sx + (Math.random() - .5) * 150, by = sy + (Math.random() - .5) * 110;            // всплеск у персонажа
      const mx = (bx + tx) / 2 + (Math.random() - .5) * 180, my = Math.min(by, ty) - 90 - Math.random() * 130;   // верх дуги
      const r = 360 + Math.random() * 540, P = (x, y, k, ry) => `translate(${x}px,${y}px) rotateY(${ry}deg) scale(${k})`;
      const an = c.animate([
        { transform: P(sx, sy, .2, 0), opacity: 0 },
        { transform: P(bx, by, 1.15, r * .25), opacity: 1, offset: .2, easing: 'cubic-bezier(.3,0,.4,1)' },
        { transform: P(mx, my, 1, r * .6), opacity: 1, offset: .6, easing: 'cubic-bezier(.5,0,.8,.6)' },
        { transform: P(tx, ty, .45, r), opacity: .95 }
      ], { duration: 1150 + Math.random() * 300, delay: i * 75, fill: 'backwards' });
      an.onfinish = () => {
        c.remove(); coinTick(i === n - 1);
        dst.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 200, easing: 'ease-out' });
        if (i === n - 1) { tag(); dst.animate([{ boxShadow: '0 0 0 0 rgba(220,230,240,0)' }, { boxShadow: '0 0 0 6px rgba(220,230,240,.45)' }, { boxShadow: '0 0 0 12px rgba(220,230,240,0)' }], { duration: 700 }); }
      };
    }
  };
  setTimeout(go, 400);
}
function coinTick(last) {   // звон монетки (владелец 20.11: прежний «писк» убран): удар + неровные обертоны металлического диска, каждая монетка своя
  try {
    if (!soundOn()) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ac = window.__krAC || (window.__krAC = new AC()); if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime + .005, out = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 8500; out.gain.value = last ? .9 : .6; out.connect(lp); lp.connect(ac.destination);
    const ring = (t, f, v) => {
      [[1, 1, .6], [2.32, .5, .35], [4.25, .28, .2], [6.63, .14, .1]].forEach(([r, g, d]) => {   // обертоны диска: выше — тише и короче
        const o = ac.createOscillator(), e = ac.createGain(); o.type = 'sine'; o.frequency.value = f * r * (1 + (Math.random() - .5) * .004);
        e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v * g, t + .002); e.gain.exponentialRampToValueAtTime(.0001, t + .05 + d * .35);
        o.connect(e); e.connect(out); o.start(t); o.stop(t + .07 + d * .35);
      });
      const len = ac.sampleRate * .012 | 0, buf = ac.createBuffer(1, len, ac.sampleRate), dt = buf.getChannelData(0);   // сам удар — короткий шорох
      for (let k = 0; k < len; k++) dt[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 3);
      const n = ac.createBufferSource(), bp = ac.createBiquadFilter(), ng = ac.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 1.2; ng.gain.value = v * .8; n.buffer = buf; n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t);
    };
    const f = 2600 + Math.random() * 900;
    ring(t0, f, .028);
    if (Math.random() < .5) ring(t0 + .035 + Math.random() * .03, f * (1.03 + Math.random() * .05), .014);   // звякнула о соседнюю
    if (last) { ring(t0 + .09, 3300, .03); ring(t0 + .17, 4100, .022); }   // последняя — «дзынь-дзынь»
  } catch (e) { /* без звука */ }
}
async function botAct(fn, args) {   // админ: добавить / убрать бота в лобби (сервер проверяет права)
  if (!S || busy) return; busy = true;
  try { await api.rpc(fn, Object.assign({ p_room: room }, args)); await refresh(); } catch (e) { note(errText(e), 'err'); } finally { busy = false; }
}
async function ready() {
  if (!S || busy) return; busy = true;
  try { await api.rpc('krot_ready', { p_room: room, p_ready: !S.me.ready }); await refresh(); } catch (e) { note(errText(e), 'err'); } finally { busy = false; }
}
function leaveAsk() {
  if (S && ['play', 'next'].includes(S.room.phase) && S.me && S.me.alive !== false) openOv('leave'); else leave();
}
async function leave() {
  const id = room, ph = S && S.room.phase;
  if (id && ph !== 'done') { try { await api.rpc('krot_leave', { p_room: id }); } catch (e) { /* выйдем всё равно */ } }
  roomless();
}
function roomless(msg) {
  vcLeave();
  stopSync(); room = 0; LS.set('room', 0); S = null; lastPhase = ''; pend = null; draft = 0; proof = null; ov = '';
  if (api === Demo) Demo.stop();
  if (G) G.resetRound();
  drawMenu(); if (msg) { if (api !== Demo && typeof siteToast === 'function') siteToast(msg); else note(msg); }   // меню нет — сообщение всплывает на главной
}

/* ---------- голосование ---------- */
function vote(box) {
  if (!S || !S.round || box < 1 || box > 4) return;
  const ph = S.room.phase;
  if (S.room.paused) return note('Игра на паузе', 'err');
  if (ph === 'talk' || ph === 'brief') {   // черновик: уйдёт на сервер сам, когда начнётся фиксация
    draft = draft === box ? 0 : box; drawHint(); if (G) G.marks(marks());
    if (draft) note('Черновик: ' + nn(draft) + ' — отправится, когда начнётся фиксация');
    return;
  }
  if (ph !== 'vote' && ph !== 'revote') return;
  const stage = ph === 'vote' ? 'main' : 'revote';
  if (S.me.locked) return note(ERR['vote locked'], 'err');
  if (stage === 'revote' && !(S.round.cands || []).includes(box)) return note('Сейчас можно выбрать только ' + (S.round.cands || []).map(nn).join(' или '), 'err');
  const cur = stage === 'main' ? S.me.vote : S.me.revote;
  if (cur === box && !pend) return;
  pend = { box, stage, id: uuid(), tries: 0 };
  drawHint(); if (G) G.marks(marks());
  sendVote(pend);
}
async function sendVote(p) {
  const g = gen;
  try {
    const r = await api.rpc('krot_vote', { p_room: room, p_box: p.box, p_action: p.id });
    if (g !== gen || pend !== p || !S) return;
    if (p.stage === 'main') S.me.vote = r.box; else S.me.revote = r.box;
    pend = null; drawHint(); if (G) G.marks(marks());
  } catch (e) {
    if (g !== gen || pend !== p) return;
    if (isNet(e) && ++p.tries < 5) { timers.push(setTimeout(() => sendVote(p), 600 * p.tries)); return; }   // тот же id — сервер не засчитает дважды
    pend = null; note(errText(e), 'err'); drawHint(); if (G) G.marks(marks());
  }
}
function myPick() {
  if (!S || !S.round) return {};
  const ph = S.room.phase, me = S.me, cands = S.round.cands || [];
  if (pend) return { box: pend.box, kind: 'pend' };
  if (ph === 'revote') { if (me.revote) return { box: me.revote, kind: 'sel' }; if (me.vote && cands.includes(me.vote)) return { box: me.vote, kind: 'sel' }; return {}; }
  if (['vote', 'open', 'debrief', 'done'].includes(ph)) { const b = me.revote || me.vote; return b ? { box: b, kind: 'sel' } : {}; }
  if (draft) return { box: draft, kind: 'draft' };
  return {};
}
function marks() {
  const m = myPick(), ph = S && S.room.phase;
  return { mine: m.box || 0, kind: m.kind || '', cands: ph === 'revote' && S.round ? S.round.cands || [] : null };
}

/* ---------- красная кнопка «готов голосовать» (обсуждение): нажали все — сразу голосование ---------- */
let rdyBusy = false;
async function voteReady() {
  if (!canBtn() || rdyBusy) return;
  const me = myPlayer(); if (!me) return;
  const on = !me.vote_ready; me.vote_ready = on;   // сразу видно у себя, сервер подтвердит
  if (G) G.sync(S); drawRdy(); btnClick(on);
  rdyBusy = true;
  try { await api.rpc('krot_vote_ready', { p_room: room, p_on: on }); } catch (e) { note(errText(e), 'err'); }
  finally { rdyBusy = false; refresh(); }
}
function btnClick(on) {   // тихий механический щелчок
  if (!soundOn()) return;
  try {
    const ac = window.__krAC || (window.__krAC = new (window.AudioContext || window.webkitAudioContext)()); if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime;
    o.type = 'square'; o.frequency.setValueAtTime(on ? 220 : 160, t0); o.frequency.exponentialRampToValueAtTime(70, t0 + .06);
    g.gain.setValueAtTime(.05, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + .08);
    o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + .1);
  } catch (e) { /* без звука */ }
}
function drawRdy() {
  const el = root && $('#krRdy', root); if (!el || !S) return;
  const show = canBtn(); el.hidden = !show; if (!show) return;
  const ps = S.players.filter(p => !p.left), n = ps.filter(p => p.vote_ready).length, me = myPlayer();
  el.innerHTML = `<span class="kr-h">Готовы голосовать</span><span class="kr-rdd">${SEATS.map(st2 => { const p = S.players.find(q => q.seat === st2); return `<i class="${p && p.vote_ready ? 'on' : ''}" title="${p ? esc(p.name) + (p.vote_ready ? ' — готов' : '') : ''}"></i>`; }).join('')}</span><b>${n}/${ps.length}</b><button class="kr-btn sm ${me && me.vote_ready ? 'ghost' : 'red'}" data-a="vready">${me && me.vote_ready ? 'Отжать' : 'Я готов'}</button>`;
}

/* ---------- чат ---------- */
const rowMsg = r => ({ id: +r.id, kind: r.kind, seat: r.seat, name: r.name, text: r.text, at: typeof r.at === 'number' ? r.at : Date.parse(r.created_at) || Date.now() });
function addChat(list) {
  const fresh = [];
  for (const m of list) { if (!m || seen.has(m.id)) continue; seen.add(m.id); fresh.push(m); }
  if (!fresh.length) return;
  const tail = chat.length ? chat[chat.length - 1].id : 0;
  chat.push(...fresh); chat.sort((a, b) => a.id - b.id); if (chat.length > 200) chat = chat.slice(-200);
  lastChat = Math.max(lastChat, ...fresh.map(m => m.id));
  const box = root && $('#krMsgs', root); if (!box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  if (fresh.every(m => m.id > tail)) box.insertAdjacentHTML('beforeend', fresh.map(msgHtml).join(''));
  else box.innerHTML = chat.map(msgHtml).join('');
  while (box.children.length > 200) box.firstElementChild.remove();
  if (near || fresh.some(m => S && m.seat === S.me.seat && m.kind === 'msg')) box.scrollTop = box.scrollHeight;
  if (!chatOpen && fresh.some(m => m.kind === 'msg')) { unread += fresh.filter(m => m.kind === 'msg').length; drawChatBtn(); }
}
function msgHtml(m) {
  if (m.kind === 'sys') return '';   // владелец 20.11: служебных строк в чате нет (кто сел, начало игры, раунды, выбывание — всё и так крупно на экране)
  const mine = S && m.seat === S.me.seat, rm = /^Новая комната: ([A-Z0-9]{6})$/.exec(m.text || '');
  const body = rm && !mine ? `Новая комната: <b>${rm[1]}</b> <button class="kr-btn sm go" data-join="${rm[1]}">Войти</button>` : esc(m.text);
  return `<div class="kr-m${mine ? ' me' : ''}"><span class="kr-mn" data-s="${+m.seat || 0}">${esc(m.name || 'Игрок')}</span><span class="kr-mt">${body}</span></div>`;   // как на Twitch: ник цветом места
}
async function sendChat(t) {
  if (!room) return false;
  try {
    const r = await api.rpc('krot_chat_send', { p_room: room, p_text: t });
    if (r && r.id) addChat([{ id: +r.id, kind: 'msg', seat: S ? S.me.seat : 0, name: myPlayer() ? myPlayer().name : myName(), text: r.text, at: r.at }]);
    return true;
  } catch (e) { note(errText(e), 'err'); return false; }
}
const myPlayer = () => S && S.players.find(p => p.me);
function openChat(on) {
  chatOpen = on; if (on) unread = 0;
  if (root) root.classList.toggle('chat-on', on);
  drawChatBtn();
  if (on) { const b = $('#krMsgs', root); if (b) b.scrollTop = b.scrollHeight; }
}

/* ============================================================
   Синхронизация: пульс раз в 3 с, Realtime, снимки
   ============================================================ */
function enterRoom(d) {
  stopSync();
  room = d.room.id; LS.set('room', room);
  chat = []; seen = new Set(); lastChat = 0; pend = null; draft = 0; briefSeen = 0; openRound = 0; openDone = false; proof = null; lastPhase = ''; unread = 0;
  if (G) G.resetRound();
  drawRoom();
  apply(d);
  startSync();
  vcJoin(room, d.me.seat, api === Demo);   // голос — с экрана загрузки до выхода из комнаты
}
function startSync() {
  const g = gen, id = room;
  try {   // таймер в отдельном потоке: в фоновой вкладке обычные таймеры браузер замедляет до раза в минуту
    worker = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},3000)'], { type: 'text/javascript' })));
    worker.onmessage = () => pulse();
  } catch (e) { timers.push(setInterval(pulse, 3000)); }
  if (api === Demo) { Demo.onSpeak = st3 => { VC.spkFake[st3] = Date.now() + 1700; }; Demo.onPush = () => refresh(); Demo.onHead = (s, y, p) => { if (G) G.head(s, y, p); }; return; }
  realtime(id, g);
}
function stopSync() {
  timers.forEach(t => { clearInterval(t); clearTimeout(t); }); timers = [];
  if (worker) { worker.terminate(); worker = null; }
  if (sb && chDb) { sb.removeChannel(chDb); chDb = null; }
  if (sb && chRt) { sb.removeChannel(chRt); chRt = null; }
}
async function realtime(id, g) {
  if (!sb) return;
  try { const { data } = await sb.auth.getSession(); if (data && data.session && sb.realtime.setAuth) sb.realtime.setAuth(data.session.access_token); } catch (e) { /* без токена Realtime молчит, выручит пульс */ }
  if (g !== gen || id !== room) return;
  chDb = sb.channel('rr-db-' + id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rr_rooms', filter: 'id=eq.' + id }, () => soon())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rr_chat', filter: 'room_id=eq.' + id }, p => { if (p && p.new) addChat([rowMsg(p.new)]); })
    .subscribe();
  const onRt = ch => ch.on('broadcast', { event: 'h' }, m => { const q = m && m.payload; if (G && q && q.s) G.head(q.s, q.y, q.p); })
    .on('broadcast', { event: 'rtc' }, m => { if (m && m.payload && VC.core) VC.core.onSig(m.payload); });
  const sendOn = ch => p => ch.send({ type: 'broadcast', event: 'rtc', payload: p });
  chRt = onRt(sb.channel('rr:' + id, { config: { private: true, broadcast: { self: false } } }));
  chRt.subscribe(st3 => {
    if (g !== gen || id !== room) return;
    if (st3 === 'SUBSCRIBED') vcSigReady(sendOn(chRt));
    else if ((st3 === 'CHANNEL_ERROR' || st3 === 'TIMED_OUT') && !chRt._pub) {   // закрытый канал не пустили — запасной (имя знают только игроки комнаты)
      try { sb.removeChannel(chRt); } catch (e) { /* уже */ }
      chRt = onRt(sb.channel('rrpub:' + id + ':' + ((S && S.room.code) || ''), { config: { broadcast: { self: false } } })); chRt._pub = true;
      const ch = chRt; ch.subscribe(st4 => { if (st4 === 'SUBSCRIBED' && g === gen && id === room) vcSigReady(sendOn(ch)); });
    }
  });
}
let ticking = false;
async function pulse() {
  if (!room || ticking) return; ticking = true; const g = gen, id = room;
  try {
    const t = await api.rpc('krot_tick', { p_room: id });
    if (g !== gen || id !== room) return;
    off = t.now - Date.now(); setLost(false);
    if (!S || t.rev !== S.room.rev || t.phase !== S.room.phase) await refresh();
  } catch (e) { if (g === gen && id === room) netErr(e); } finally { ticking = false; }
}
let refreshing = null, again2 = false, soonT = 0;
function soon() { clearTimeout(soonT); soonT = setTimeout(refresh, 120); }
function refresh() {
  if (!room) return Promise.resolve(false);
  if (refreshing) { again2 = true; return refreshing; }
  const g = gen, id = room;
  refreshing = (async () => {
    try { const d = await api.rpc('krot_state', { p_room: id, p_after: lastChat }); if (g !== gen || id !== room) return false; setLost(false); apply(d); return true; }
    catch (e) { if (g === gen && id === room) netErr(e); return false; }
    finally { refreshing = null; if (again2) { again2 = false; refresh(); } }
  })();
  return refreshing;
}
function netErr(e) {
  const m = errMsg(e);
  if (/not in room/.test(m)) return roomless('Вы больше не в этой комнате');
  if (/not authenticated/.test(m)) return roomless('Войдите в аккаунт, чтобы играть');
  setLost(true);
}
function setLost(on) { if (lostNet === on) return; lostNet = on; const n = root && $('#krNet', root); if (n) n.hidden = !on; }

function apply(d) {
  S = d; S._at = Date.now();
  off = d.now - Date.now();
  if (d.chat && d.chat.length) addChat(d.chat.map(rowMsg));
  const ph = d.room.phase, prev = lastPhase, g = d.game;
  if (g && g.id !== lastGame) { lastGame = g.id; lastEv = 0; }
  const fresh = g && g.evs ? g.evs.filter(ev => ev.n > lastEv && d.now - ev.at < 4000) : [];   // старые события (зашли посреди игры) — без анимации
  if (g && g.evs && g.evs.length) lastEv = Math.max(lastEv, g.evs[g.evs.length - 1].n);
  if (fresh.some(ev => ev.kind === 'click' || ev.kind === 'bang')) { capHoldUntil = Date.now() + COCK_MS + 1100; if (G && G.hold) G.hold(COCK_MS + 900); }
  if (G) G.sync(d);
  for (const ev of fresh) rrShot(ev);   // старые события (зашли посреди игры) — без анимации
  if (ph !== prev) { lastPhase = ph; onPhase(prev, ph); }
  drawAll();
}
function onPhase(prev, ph) {
  lastSec = -1;
  if (ph === 'lobby' && G) G.setRead(false);
}
async function checkProof() {
  const rd = S && S.round; if (!rd || !rd.proof || !rd.commit || (proof && proof.round === rd.id)) return;
  const id = rd.id;
  try {
    const mine = 'RUSHKROT|' + rd.id + '|' + rd.boxes.slice().sort((a, b) => a.n - b.n).map(b => [b.n, b.sym, b.gun, b.col].join(':')).join(';') + '|' + rd.target + '|' + rd.salt;
    const h = await sha256hex(rd.proof);
    proof = { round: id, ok: h === String(rd.commit).toLowerCase() && mine === rd.proof };
  } catch (e) { proof = { round: id, ok: null }; }
  if (S && S.round && S.round.id === id) drawMid();
}

/* ============================================================
   Экраны
   ============================================================ */
function drawMenu(wait) {
  if (!root) return;
  if (!wait && api !== Demo) {   // владелец 21.11: страницы-меню режима нет — вне комнаты сразу главная сайта (там «Играть» = поиск)
    if (!authed() && typeof openAuth === 'function') setTimeout(() => openAuth('login'), 300);
    if (location.hash.indexOf('#/krot') === 0) location.hash = '#/';
    return;
  }
  view = 'menu'; document.body.classList.remove('krot-room'); setTimeout(setTop); root.classList.remove('in-room', 'chat-on', 'lock', 'show-res', 'aim', 'can-pick', 'paused'); root.classList.add('in-menu'); delete root.dataset.ph;
  if (G) G.menu(true);
  const can = authed() || api === Demo;
  ui.innerHTML = `<div class="kr-menu"><section class="kr-mbox kr-glass">
    <img class="kr-logo" src="assets/main/rr-logo.webp" alt="Русская рулетка — RUSH CASE" draggable="false">
    <p class="kr-tag">Пять игроков, один револьвер. Крутите барабан сколько угодно — но выстрелить придётся. Остаётся один.</p>
    <ul class="kr-facts"><li><b>5</b><span>игроков</span></li><li><b>6</b><span>гнёзд</span></li><li><b>1</b><span>выживет</span></li></ul>
    ${wait ? '<p class="kr-wait"><i class="kr-spin"></i>Проверяем, нет ли у вас идущего матча…</p>' : can ? `
    ${menuPlay()}
    <form class="kr-join" id="krJoin" autocomplete="off"><input id="krCode" maxlength="6" placeholder="Код группы друга" spellcheck="false" aria-label="Код группы друга"><button class="kr-btn">В группу</button></form>` : `
    <button class="kr-btn go kr-big" data-a="login"><span>Войти и играть</span><small>Режим бесплатный — нужен только аккаунт</small></button>`}
    <div class="kr-mlinks"><button class="kr-link" data-a="how">${ICO.help}Как играть</button>${DEMO_OK && api !== Demo ? '<a class="kr-link" href="#/krot/demo">Демо с ботами (только на этом компьютере)</a>' : ''}</div>
  </section></div>`;
  ensureHandlers();
}
// кнопки меню: поиск и группа (подбор как в CS2 — раздел «Подбор матча»)
const pnum = p => p ? p.members.length + (p.bots ? p.bots.length : 0) : 0;   // мест в лобби: люди + боты (владелец 20.11)
function menuPlay() {
  const p = MM.st && MM.st.party, srch = !!(p && p.state === 'search'), n = p ? pnum(p) : 1;
  return `<button class="kr-btn ${srch ? 'red' : 'go'} kr-big" data-a="play"><span>${srch ? 'Отменить поиск' : 'Найти игру'}</span><small>${srch ? 'Идёт поиск: <b id="krMmT">0:00</b>' : n > 1 ? `Лобби ${n}/5${n >= 5 ? " · без очков недели" : ""}` : 'Случайные игроки · очки недели'}</small></button>
    <button class="kr-btn kr-big" data-a="invite"><span>${n > 1 ? `Лобби ${n}/5` : 'Создать лобби'}</span><small>Код или ссылка · до 5 человек</small></button>`;
}
function drawBusy(on) { if (root) root.classList.toggle('busy', on); }
function ensureHandlers() {
  if (root._krH) return; root._krH = true;
  root.addEventListener('click', onClick); root.addEventListener('submit', onSubmit);
  root.addEventListener('focusin', e => { if (e.target.id === 'krIn') { openChat(true); vcKey(false); } });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.id === 'krIn') { e.preventDefault(); e.target.blur(); openChat(false); } });   // Esc в поле — спрятать поле
  root.addEventListener('input', e => { const t = e.target; if (t.dataset.vol) { const p = S && S.players.find(q => q.seat === +t.dataset.vol); if (p) vcPlayerVol(p, t.value / 100); } else if (t.dataset.thr) { vcSet('thr', t.value / 100); const m = $('.kr-thr', root); if (m) m.style.left = t.value + '%'; } });
  root.addEventListener('change', e => { const t = e.target; if (t.dataset.dev) vcSet(t.dataset.dev, t.value); else if (t.dataset.chk) vcSet(t.dataset.chk, t.checked); });
}

function drawRoom() {
  view = 'room'; root.classList.remove('in-menu'); root.classList.add('in-room'); document.body.classList.add('krot-room'); setTop();   // владелец 20.11: в игре шапка сайта скрыта
  if (G) G.menu(false);
  ui.innerHTML = `
  <header class="kr-top kr-glass" id="krTop"><span class="kr-ph" id="krPh"></span><b class="kr-tm" id="krTm"></b><i class="kr-bar"><i id="krBar"></i></i><em class="kr-net" id="krNet" hidden>Нет связи — переподключаемся…</em></header>
  <div class="kr-rm" id="krRm"></div>
  <aside class="kr-chat kr-glass" id="krChat">
    <div class="kr-msgs" id="krMsgs" aria-live="polite"></div>
    <form class="kr-chf" id="krChF" autocomplete="off"><input id="krIn" maxlength="300" placeholder="Написать в чат…" aria-label="Сообщение в чат"><button class="kr-send" aria-label="Отправить">${ICO.send}</button></form>
  </aside>
  <div class="kr-dock"><button class="kr-vc" id="krVc" data-a="voice" type="button"></button><button class="kr-chb kr-glass" id="krChB" data-a="chat">${ICO.chat}<span>Чат</span><b id="krUnr" hidden></b></button></div>   <!-- владелец 20.11: микрофон — отдельной кнопкой рядом с «Чат» -->
  <div class="kr-mid" id="krMid"></div>
  <div class="rr-ev" id="rrEv" aria-live="assertive"></div>
  <div class="rr-band" id="rrBand" aria-live="assertive"></div>
  <div class="rr-fl" id="rrFl"></div><div class="rr-fear" id="rrFear"></div>
  <div class="rr-cap" id="rrAct" hidden></div>
  <div class="kr-hint" id="krHint"></div>
  <div class="kr-air" id="krAir" hidden>${ICO.mic}<span>В эфире</span></div>
  <div class="kr-keys"><span><kbd>V</kbd>говорить</span><span><kbd>ЛКМ</kbd>зажать — осмотреться</span><span><kbd>Enter</kbd>чат</span><span><kbd>Tab</kbd>игроки</span></div>`;
  ensureHandlers();
  openChat(false);   // владелец 20.11: сообщения видны всегда, поле ввода — по кнопке «Чат» или Enter
  vcDraw();
  sndLoad();
}
function drawAll() {
  if (!S || view !== 'room') return;
  drawTop(); drawRm(); drawAct(); drawMid(); drawHint(); drawOvLive(); drawChatLock(); drawVote(); drawVoteBtn();
  root.classList.toggle('paused', !!S.room.paused);
  root.dataset.ph = S.room.phase;
  root.classList.toggle('rr-dead', rrSilent());
  const ld = S.room.phase === 'lobby' && !!S.room.mm;
  root.classList.toggle('loading', ld);
  if (G && ld !== lastLd) { lastLd = ld; G.menu(ld); if (!ld) G.sync(S); }
  if (S.room.phase !== 'lobby') micStop();
  markLoaded();
}
function drawTop() {
  const ph = $('#krPh', root); if (!ph) return;
  const r = S.room, g = S.game, tp = g && S.players.find(p => p.seat === g.turn), mine = !!(tp && tp.me && r.phase === 'play');
  let t = r.paused ? 'Пауза' : r.phase === 'lobby' ? (r.deadline ? 'Старт через' : PH.lobby) : PH[r.phase] || '';
  if (g && r.phase === 'play') t = rrPre() ? `Раунд ${g.round} · жребий` : `Раунд ${g.round} · ${mine ? 'ваш ход' : 'ход: ' + (tp ? tp.name : '—')}`;
  if (g && r.phase === 'next') t = g.round ? `Раунд ${g.round} окончен` : '';   // round 0 — знакомство до раунда 1: без надписей (владелец 20.11)
  ph.textContent = t;
  const top = $('#krTop', root); top.dataset.ph = r.phase; top.classList.toggle('mine', mine);
  {   // банк игры на деньги (владелец 21.11)
    let bk = $('#rrBank', root); const on = !!(r.money && g && ['play', 'next', 'done'].includes(r.phase) && (g.round || r.phase === 'done'));
    if (on && !bk) { bk = document.createElement('div'); bk.id = 'rrBank'; bk.className = 'rr-bank'; bk.innerHTML = '<span></span>'; root.appendChild(bk); }   // владелец 21.11: справа сверху, без обводки и подложки
    if (bk) { bk.hidden = !on; const h = 'Банк ' + money(r.bank); if (on && bk.dataset.h !== h) { bk.dataset.h = h; bk.firstChild.innerHTML = h; } }
  }
}
function drawRm() {
  const el = $('#krRm', root); if (!el) return;
  const r = S.room, priv = r.kind === 'private';
  el.innerHTML = `<div class="kr-rmk kr-glass"><b>${priv ? 'Комната друзей' : 'Быстрая игра'}</b><small>${r.points ? 'Очки недели' : 'Без очков'}</small></div>
    ${priv ? `<button class="kr-code kr-glass" data-a="copy" title="Скопировать код"><small>Код</small><b>${esc(r.code)}</b></button>` : ''}
    <button class="kr-ib kr-glass" data-a="players" title="Игроки (Tab)">${ICO.users}</button>
    <button class="kr-ib kr-glass" data-a="how" title="Как играть">${ICO.help}</button>
    <button class="kr-btn sm ghost" data-a="leave">${r.phase === 'done' || r.phase === 'debrief' ? 'В меню' : 'Выйти'}</button>`;
}
let actLock = 0, actBusy = false, actShown = '', keyDown = '', keyDownAt = 0, spinNote = null, keysGame = 0, keysTurn = 0;
const ME_LINE = 'Мне нужно это сделать.';   // подпись в свой ход (владелец 20.11)
function myTurn() { const g = S && S.game, me = myPlayer(); return !!(g && S.room.phase === 'play' && me && g.turn === me.seat && me.alive !== false); }
// субтитр хода, как в играх (мелко, одна строка, имя — золотом): свой ход — «Вы: Мне нужно это сделать.», чужой — «Shade берёт револьвер.»;
// клавиши [R] прокрутить / [ПРОБЕЛ] выстрел — только в первый свой ход за игру (на сенсорном экране — всегда, там нет клавиатуры); не пульсируют, при нажатии вдавливаются и дают волны (keyWave)
function drawAct() {
  const el = $('#rrAct', root); if (!el) return;
  const g = S.game, mine = myTurn(), tp = g && S.room.phase === 'play' ? S.players.find(p => p.seat === g.turn) : null, other = !!(tp && !tp.me && tp.alive !== false);
  root.classList.toggle('my-turn', mine);
  if ((!mine && !other) || Date.now() < capHoldUntil || rrPre()) { el.hidden = true; el.innerHTML = ''; actShown = ''; return; }   // пока звучит выстрел — без подписи
  if (mine && keysGame !== g.id) { keysGame = g.id; keysTurn = g.n; }   // первый свой ход в этой игре
  const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches, keys = mine && (touch || keysTurn === g.n);
  const lock = actBusy || Date.now() < actLock, down = Date.now() - keyDownAt < 400 ? keyDown : '', spin = !!(spinNote && spinNote.seat === g.turn && Date.now() < spinNote.until);
  const who = (mine ? 'me' : 'o' + tp.seat) + '|' + g.n, key = who + '|' + down + '|' + spin + '|' + lock + '|' + keys;
  if (key === actShown) return;                                 // без лишних перерисовок (иначе мигает появление)
  const fresh = !actShown.startsWith(who + '|'); actShown = key;
  el.hidden = false; el.className = 'rr-cap' + (mine ? ' me' : '') + (fresh ? ' in' : '');
  const k = (a, label, wide, sub) => `<button class="rr-kb" data-a="${a}"${lock ? ' disabled' : ''}><kbd class="rr-k${wide ? ' wide' : ''}${down === a ? ' down' : ''}"><b>${label}</b></kbd><span>${sub}</span></button>`;
  el.innerHTML = mine
    ? `<p class="rr-line"><b class="rr-who">${esc((myPlayer() || {}).name || 'Вы')}:</b> ${ME_LINE}</p>${keys ? `<div class="rr-keys">${k('spin', 'R', false, 'прокрутить')}${k('shoot', 'Пробел', true, 'выстрел')}</div>` : ''}`
    : `<p class="rr-line rr-nar">${esc(tp.name)} ${spin ? 'крутит барабан' : 'берёт револьвер'}.</p>`;
}
function keyWave(kind) {   // от нажатия клавиши на экране расходятся две волны (владелец 20.11, вместо пульса)
  const k = root && $(`#rrAct [data-a="${kind}"] .rr-k`, root); if (!k || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const r = k.getBoundingClientRect(); if (!r.width) return;
  const box = (d, rad) => ({ left: (r.left - d) + 'px', top: (r.top - d) + 'px', width: (r.width + d * 2) + 'px', height: (r.height + d * 2) + 'px', borderRadius: rad + 'px' });
  for (let i = 0; i < 2; i++) {
    const w = document.createElement('i'); w.className = 'rr-wave'; document.body.appendChild(w);
    w.animate([Object.assign(box(0, 8), { opacity: .85 }), Object.assign(box(24, 20), { opacity: 0 })], { duration: 650, delay: i * 150, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' }).onfinish = () => w.remove();
  }
}
async function rrAct(kind) {
  if (kind === 'spin') { spinDown(); spinUp(); return; }   // кнопка на экране — одно деление
  if (myTurn() && S.game.vote) { voteWarn(); return; }   // идёт голосование — стрелять нельзя (владелец 21.11)
  if (!myTurn() || actBusy || Date.now() < actLock) return;
  if (spinHeld) spinUp();
  if (spinPend) await spinSend(true);   // докрутили и сразу «Выстрел» — сначала прокрутка
  keyDown = kind; keyDownAt = Date.now();   // клавиша на экране вдавливается
  actBusy = true; drawAct(); keyWave(kind); if (kind === 'shoot') rrFear(true);
  try { await api.rpc(kind === 'spin' ? 'rr_spin' : 'rr_shoot', { p_room: room, p_turn: S.game.n }); }
  catch (e) { note(errText(e), 'err'); rrFear(false); }
  finally { actBusy = false; actLock = Date.now() + (kind === 'spin' ? 1250 : 500); soon(); }
}
// барабан (владелец 21.11): одно нажатие R — ровно на 1 деление, зажал — крутится, пока не отпустишь.
// Сервер на любую прокрутку перемешивает гнездо (иначе можно вернуть барабан на только что щёлкнувшее пустое гнездо и выжить наверняка);
// прокрутка уходит на сервер одна — через 0,45 с после последнего отпускания (не чаще spin_gap 0,8 с)
let spinHeld = 0, spinHoldT = 0, spinSendT = 0, spinPend = false, spinLast = 0, spinBlur = false;
function spinDown() {
  if (myTurn() && S.game.vote) { voteWarn(); return; }
  if (!myTurn() || actBusy || rrPre()) return;
  if (!spinBlur) { spinBlur = true; addEventListener('blur', spinUp); }
  spinHeld = Date.now(); clearTimeout(spinHoldT); clearTimeout(spinSendT);
  keyDown = 'spin'; keyDownAt = Date.now(); drawAct(); keyWave('spin');
  if (G && G.drum) G.drum('tap');   // звук — щелчок на каждое деление (drumStep)
  spinHoldT = setTimeout(() => { if (spinHeld && G && G.drum) G.drum('hold'); }, 260);
}
function spinUp() {
  if (!spinHeld) return;
  spinHeld = 0; clearTimeout(spinHoldT);
  if (G && G.drum) G.drum('up');
  spinPend = true; clearTimeout(spinSendT); spinSendT = setTimeout(() => spinSend(false), 450);
}
async function spinSend(now) {
  clearTimeout(spinSendT);
  if (!spinPend) return;
  if (!myTurn()) { spinPend = false; return; }
  const wait = spinLast + 850 - Date.now();
  if (wait > 0) { if (now) await new Promise(r => setTimeout(r, wait)); else { spinSendT = setTimeout(() => spinSend(false), wait); return; } }
  spinPend = false; spinLast = Date.now();
  try { await api.rpc('rr_spin', { p_room: room, p_turn: S.game.n }); }
  catch (e) { if (!/too fast/.test(errMsg(e))) note(errText(e), 'err'); }
}
// жребий в начале раунда: пока револьвер крутится в центре, кто первый — не показываем
const rrPre = () => { const g = S && S.game; return !!(g && S.room.phase === 'play' && g.ev && g.ev.kind === 'start' && g.turn === g.first && Date.now() + off < S.room.phase_at); };
// ---------- ставка за 15 с знакомства (владелец 21.11): 100 / 250 / 500 / 1000 / своя; победитель берёт с каждого не больше своей ставки ----------
let betBusy = false, betGame = 0, betDone = 0;   // betDone — игра, в которой ставка уже сделана: окно уходит (владелец 21.11)
function betHide(el) { if (!el || el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 460); }   // плавно вниз и прозрачно
const CHIP_UI = { 100: '#c7323b', 250: '#2f9e5a', 500: '#3b6fd6', 1000: '#d9ab3c' };   // цвет фишки на кнопке (как фишки на столе)
const maxWin = bet => { let b = bet; for (const p of S.players) if (!p.me && p.bet) b += Math.min(bet, p.bet); return Math.floor(b * (1 - (S.room.fee != null ? S.room.fee : RR.fee))); };
function drawBet() {
  const r = S && S.room, g = S && S.game, me = myPlayer(), on = !!(r && r.money && g && r.phase === 'next' && !g.round && me && me.bet != null);
  let el = root && $('#rrBet', root);
  if (!on || betDone === g.id) { if (el) betHide(el); return; }   // ставка сделана или подготовка кончилась — окно уходит с анимацией
  if (!el) {
    el = document.createElement('section'); el.id = 'rrBet'; el.className = 'rr-bet kr-glass';
    el.innerHTML = '<header class="rr-bh"><span><b>Ставка</b><em>до начала раунда</em></span><small id="rrBb"></small></header><div class="rr-bcs" id="rrBc"></div>'
      + '<div class="rr-bown"><input id="rrBi" inputmode="numeric" maxlength="6" placeholder="Своя сумма" autocomplete="off"><button class="kr-btn go sm" data-a="betIn">Поставить</button></div>'
      + '<div class="rr-bsum" id="rrBs"></div><i class="rr-btm" id="rrBt"></i>';
    root.appendChild(el);
    { const ms = Math.max(0, (r.deadline || 0) - (Date.now() + off)); $('#rrBt', el).style.animationDuration = ms + 'ms'; }   // полоска: сколько осталось до раунда
    $('#rrBi', el).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); betIn(); } });
    if (betGame !== g.id && refreshProf) { betGame = g.id; refreshProf(); }   // 100 ₽ уже списаны — баланс на сайте обновить
  }
  const bal = +(S.me.bal || 0), bet = me.bet, cap = bal + bet;
  const key = [bet, bal, r.bank, betBusy, S.players.map(p => p.bet).join()].join('|'); if (el.dataset.k === key) return; el.dataset.k = key;
  $('#rrBb', el).innerHTML = 'Баланс ' + money(bal);
  $('#rrBc', el).innerHTML = [100, 250, 500, 1000].map(v => '<button class="rr-bc' + (bet === v ? ' on' : '') + '" style="--cc:' + CHIP_UI[v] + '" data-a="bet" data-v="' + v + '"' + (v > cap || betBusy ? ' disabled' : '') + '><i></i>' + money(v) + '</button>').join('');
  $('#rrBs', el).innerHTML = '<span>Ваша ставка<b>' + money(bet) + '</b></span><span>Банк<b>' + money(r.bank) + '</b></span><span>Выигрыш до<b>' + money(maxWin(bet)) + '</b></span>';
}
function betIn() { const i = root && $('#rrBi', root); if (!i) return; const v = Math.round(+String(i.value).replace(/\D/g, '')); if (!v) return; betSend(v); i.value = ''; }
async function betSend(v) {
  if (betBusy || !S || !S.room.money) return;
  const min = S.room.min_bet || RR.minBet, max = S.room.max_bet || RR.maxBet;
  if (v < min) { note('Ставка — от ' + min + ' ₽', 'err'); return; }
  if (v > max) { note('Ставка — до ' + max + ' ₽', 'err'); return; }
  betBusy = true; drawBet();
  try {
    const d = await api.rpc('rr_bet', { p_room: room, p_amount: v });
    if (d && d.data) { if (applyProf) applyProf(d.data); S.me.bal = +d.data.balance || 0; }
    const me = myPlayer(); if (me) me.bet = v;
    if (S.game) betDone = S.game.id;   // ставка сделана — окно плавно уходит
  } catch (e) { note(errText(e), 'err'); }
  finally { betBusy = false; drawBet(); soon(); }
}
// ---------- голосование за патрон (владелец 21.11, образец — окно голосования CS2) ----------
// «Поднять руку» может только тот, кто выстрелил и выжил, — пока следующий не выстрелил (один ход). Окно — у всех; голосуют живые: ✓ или ✕
let voteBusy = false, voteRes = null, voteLast = null, voteMine = null;
const ICV = { y: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  n: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
  hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 13V5.5a1.5 1.5 0 013 0V11m0-6.5a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0v7.5c0 4-2.5 7-6.5 7-2.6 0-4-1.2-5.6-3.4L4 13.6a1.5 1.5 0 012.3-1.9L8 13.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' };
const canVote = () => { const g = S && S.game, me = myPlayer(); return !!(g && me && me.alive !== false && S.room.phase === 'play' && g.vby === me.seat && g.vn === g.n && !g.vote && g.bullets < (S.room.max_bul || RR.maxBul) && g.turn !== me.seat && S.players.filter(p => p.alive !== false).length > 2); };   // вдвоём — без голосования (владелец 21.11)
function drawVoteBtn() {
  let el = root && $('#rrVb', root); const on = canVote() && !rrPre();
  if (!on) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('button'); el.id = 'rrVb'; el.className = 'rr-vb kr-glass'; el.dataset.a = 'vstart'; root.appendChild(el); }
  const tp = S.players.find(p => p.seat === S.game.turn), cost = S.room.money ? (S.room.vote_cost || 0) : 0;
  const h = ICV.hand + '<kbd>G</kbd><span><b>Поднять руку</b><small>+1 патрон' + (tp ? ' для ' + esc(tp.name) : '') + (cost ? ' · −' + cost + ' ₽ из банка' : '') + '</small></span>';
  if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; }
  el.disabled = voteBusy;
}
function drawVote() {
  const g = S && S.game, v = g && S.room.phase === 'play' ? g.vote : null;
  let el = root && $('#rrVt', root);
  if (v) voteLast = JSON.parse(JSON.stringify(v));
  const res = !v && voteRes && Date.now() < voteRes.until ? voteRes : null;
  if (!v && !res) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('section'); el.id = 'rrVt'; el.className = 'rr-vt kr-glass'; root.appendChild(el); }
  const me = myPlayer(), seat = me ? me.seat : 0, src = v || res.v, alive = !!(me && me.alive !== false);
  const mm = voteMine && voteMine.at === src.at ? voteMine.yes : null;
  const myY = src.yes.includes(seat) || mm === true, myN = src.no.includes(seat) || mm === false, can = !!(v && alive && !myY && !myN && !voteBusy);
  const ny = v ? v.yes.length : res.yes, nn = v ? v.no.length : res.no;
  const by = S.players.find(p => p.seat === src.by), tp = g && S.players.find(p => p.seat === g.turn);
  const left = v ? Math.max(0, Math.ceil((v.until - (Date.now() + off)) / 1000)) : 0;
  const head = v ? '<i class="rr-vt-ic hand">' + ICV.hand + '</i><b>Голосование</b><em>' + left + ' с</em>'
    : res.ok ? '<i class="rr-vt-ic y">' + ICV.y + '</i><b class="y">Голосование прошло</b>' : '<i class="rr-vt-ic n">' + ICV.n + '</i><b class="n">Голосование не прошло</b>';
  const txt = v ? '<b>' + esc(by ? (by.me ? 'Вы' : by.name) : 'Игрок') + '</b> ' + (by && by.me ? 'предлагаете' : 'предлагает') + ' добавить патрон' + (tp ? ' — стреляет ' + esc(tp.me ? 'вы' : tp.name) : '') + '.'
      + '<small>' + (src.cost ? '−' + src.cost + ' ₽ из банка · ' : '') + 'нужно «за»: ' + src.need + '</small>'
    : res.ok ? 'В барабане теперь ' + res.bullets + ' ' + plural(res.bullets) + '.' : 'Не хватило голосов «за».';
  const foot = myY ? 'Вы проголосовали: <b class="y">ДА</b>' : myN ? 'Вы проголосовали: <b class="n">НЕТ</b>' : v ? (alive ? 'Нажмите ✓ или ✕' : 'Выбывшие не голосуют') : '';
  const html = '<header class="rr-vt-h">' + head + '</header><div class="rr-vt-b"><p class="rr-vt-t">' + txt + '</p><div class="rr-vt-c">'
    + '<button class="rr-vt-y" data-a="vyes" title="Да"' + (can ? '' : ' disabled') + '>' + ICV.y + '</button><b class="y">' + ny + '</b>'
    + '<button class="rr-vt-n" data-a="vno" title="Нет"' + (can ? '' : ' disabled') + '>' + ICV.n + '</button><b class="n">' + nn + '</b></div></div>'
    + (foot ? '<p class="rr-vt-f">' + foot + '</p>' : '');
  if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  el.classList.toggle('done', !v); el.classList.toggle('can', can);
}
let vwT = 0;
function voteWarn() {   // нажал выстрел / R во время голосования — аккуратная подсказка над клавишами (владелец 21.11)
  if (!root) return;
  let el = $('#rrVw', root);
  if (!el) { el = document.createElement('div'); el.id = 'rrVw'; el.className = 'rr-vw kr-glass'; el.innerHTML = ICV.hand + '<span><b>Идёт голосование</b><small>Стрелять и крутить барабан можно, когда оно закончится</small></span>'; root.appendChild(el); }
  el.classList.remove('out', 'nudge'); void el.offsetWidth; el.classList.add('nudge');
  clearTimeout(vwT); vwT = setTimeout(() => { el.classList.add('out'); vwT = setTimeout(() => el.remove(), 360); }, 2200);
}
function bankSpend(c) {   // патрон куплен: под банком «−50 ₽» — появляется и гаснет (владелец 21.11)
  const bk = root && $('#rrBank', root); if (!bk) return;
  const m = document.createElement('small'); m.className = 'rr-bank-m'; m.innerHTML = '−' + money(c); bk.appendChild(m);
  bk.classList.remove('hit'); void bk.offsetWidth; bk.classList.add('hit');
  setTimeout(() => { m.remove(); bk.classList.remove('hit'); }, 2700);
}
async function voteAct(kind) {   // 'start' | 'yes' | 'no'
  if (voteBusy || !S || !S.game) return;
  if (kind !== 'start') { const v = S.game.vote; if (!v) return; voteMine = { at: v.at, yes: kind === 'yes' }; }
  voteBusy = true; drawVoteBtn(); drawVote();
  try { await api.rpc(kind === 'start' ? 'rr_vote_start' : 'rr_vote', kind === 'start' ? { p_room: room } : { p_room: room, p_yes: kind === 'yes' }); }
  catch (e) { note(errText(e), 'err'); if (kind !== 'start') voteMine = null; }
  finally { voteBusy = false; soon(); drawVoteBtn(); drawVote(); }
}
// выбывший смотрит молча: микрофон не передаёт, чат — только чтение
const rrSilent = () => !!(S && S.me && S.me.alive === false && ['play', 'next'].includes(S.room.phase));
function drawChatLock() {
  const i = root && $('#krIn', root); if (!i) return;
  const dead = rrSilent(); if (i.disabled === dead) return;
  i.disabled = dead; i.placeholder = dead ? 'Выбывшие только читают чат' : 'Сообщение… (Enter)';
}
// события стола: начало раунда, прокрутка, щелчок, выстрел — надпись по центру, звук, 3D
let evT = 0, lastEv = 0, lastGame = 0;
function showEv(t, sub, kind, ms) {
  const el = root && $('#rrEv', root); if (!el) return;
  el.className = 'rr-ev ' + kind; void el.offsetWidth;   // заново — чтобы анимация шла с начала
  el.innerHTML = `<b>${esc(t)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`; el.className = 'rr-ev in ' + kind;   // владелец 20.11: полосой, как «Раунд», цвет по событию
  clearTimeout(evT); evT = setTimeout(() => { if (el.isConnected) el.className = 'rr-ev out ' + kind; }, ms);
}
// начало раунда — полоса через весь экран по центру, как «Бомба взорвалась» в «Краше» (владелец 20.11)
let bandT = 0;
function showBand(big, small, ms) {
  const el = root && $('#rrBand', root); if (!el) return;
  el.className = 'rr-band'; void el.offsetWidth; el.innerHTML = '<b>' + esc(big) + '</b><small>' + esc(small) + '</small>'; el.className = 'rr-band in';
  clearTimeout(bandT); bandT = setTimeout(() => { if (el.isConnected) el.className = 'rr-band out'; }, ms);
}
let capHoldUntil = 0;
function rrShot(ev) {   // щелчок и выстрел — после взвода курка, остальное — сразу
  if (ev.kind !== 'click' && ev.kind !== 'bang') return rrEvent(ev);
  rrSound('cock'); if (G && G.event) G.event({ kind: 'cock', seat: ev.seat });
  const id = lastGame; setTimeout(() => { if (root && lastGame === id) rrEvent(ev); }, COCK_MS);
}
function rrEvent(ev) {
  const p = S && S.players.find(x => x.seat === ev.seat), me = !!(p && p.me), nm = p ? (me ? 'вы' : p.name) : '';
  if (G && G.event) G.event(ev);
  if (!(ev.kind === 'spin' && (me || (G && G.drum)))) rrSound(ev.kind);   // прокрутку озвучивает сам барабан: щелчок на деление (без 3D — старый звук)
  if (me && (ev.kind === 'click' || ev.kind === 'bang')) rrFear(false); if (me && ev.kind === 'bang' && G && G.specGo) G.specGo(1.5);
  const auto = ev.auto ? 'время вышло · ' : '';
  if (ev.kind === 'start') showBand('Раунд ' + ev.round, (S && S.players.filter(p => p.alive !== false).length === 2 ? 'Финал · ' : '') + 'в револьвере ' + ev.bullets + ' ' + plural(ev.bullets), 3200);   // владелец: «РАУНД №, В РЕВОЛЬВЕРЕ 1 ПАТРОН», в рамке как в «Краше»
  else if (ev.kind === 'vote_end') { voteRes = { ok: !!ev.ok, yes: ev.yes || 0, no: ev.no || 0, bullets: ev.bullets, until: Date.now() + 4500,
      v: voteLast && voteLast.by === ev.seat ? voteLast : { by: ev.seat, at: 0, yes: [], no: [], need: '', cost: 0 } }; voteLast = null; drawVote(); if (ev.ok) rrSound('load'); if (ev.ok && ev.cost) bankSpend(ev.cost); }   // +1 патрон — звук зарядки (владелец 21.11)
  else if (ev.kind === 'spin') { if (!me) { spinNote = { seat: ev.seat, until: Date.now() + 1400 }; drawAct(); } }
  else if (ev.kind === 'click') showEv('В барабане пусто', me ? 'вы живы' : nm + ' жив', 'click', 1600);   // владелец 20.11: без «Щелчок» и без «время вышло»
  else if (ev.kind === 'bang') {
    showEv('Выстрел', `${auto}${me ? 'вы выбыли' : nm + ' выбыл'}`, 'bang', 2600);
    const f = root && $('#rrFl', root); if (f) { f.className = 'rr-fl'; void f.offsetWidth; f.className = 'rr-fl on' + (me ? ' me' : ''); }
  }
}
// звуки владельца (assets/rr/snd, откуда — ПЛАН_РУЛЕТКА.md «Звуки»): прокрутка, взвод курка, пустой выстрел, выстрел; громкость умеренная (владелец не любит громко)
const SND = { spin: { f: 'spin', vol: .5 }, cock: { f: 'cock', vol: .6 }, click: { f: 'click', vol: .6 }, bang: { f: 'bang', vol: .5 },
  hum: { f: 'tv-hum', vol: .12 }, tvon: { f: 'tv-on', vol: .5 }, tvoff: { f: 'tv-off', vol: .5 }, heart: { f: 'heart', vol: .55 }, slide: { f: 'slide', vol: .35 }, breath: { f: 'breath', vol: .09 }, music: { f: 'music', vol: .03 },
  drum: { f: 'drum', vol: .6 }, load: { f: 'load', vol: .6 }, chip: { f: 'chip', vol: .55 } }, sndBuf = {};   // владелец 20.11: гул и вкл/выкл телевизора, сердце, револьвер по столу, дыхание (ПЛАН_РУЛЕТКА.md «Звуки»)
const COCK_MS = 480;   // взвели курок → через столько мс щелчок или выстрел
let AC = null;
function sndLoad() {   // загрузить звуки заранее (при входе за стол)
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  for (const k in SND) if (!sndBuf[k]) { sndBuf[k] = 1; fetch('assets/rr/snd/' + SND[k].f + '.mp3?v=2').then(r => r.arrayBuffer()).then(b => AC.decodeAudioData(b)).then(buf => { sndBuf[k] = buf; }).catch(() => { delete sndBuf[k]; }); }
}
const sndLoop = {};
function rrLoop(kind, on, fade = .4) {   // фоновые петли (гул телевизора, сердце, дыхание): плавно включить / выключить
  try {
    if (!on) { const L = sndLoop[kind]; if (!L) return; delete sndLoop[kind]; const t = AC.currentTime; L.g.gain.cancelScheduledValues(t); L.g.gain.setValueAtTime(L.g.gain.value, t); L.g.gain.linearRampToValueAtTime(0, t + fade); L.src.stop(t + fade + .05); return; }
    if (sndLoop[kind] || !soundOn()) return;
    AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume();
    const sb = sndBuf[kind]; if (!sb || !sb.duration) return;
    const src = AC.createBufferSource(), g = AC.createGain(), t = AC.currentTime; src.buffer = sb; src.loop = true; if (SND[kind].le) { src.loopStart = SND[kind].ls; src.loopEnd = SND[kind].le; }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(SND[kind].vol, t + fade); src.connect(g); g.connect(AC.destination);
    src.start(t, kind === 'hum' || kind === 'breath' ? Math.random() * sb.duration * .8 : 0); sndLoop[kind] = { src, g, v: SND[kind].vol };
  } catch (e) { /* звук недоступен */ }
}
let fearT = 0;
function rrFear(on) {   // сердце + страх: с нажатия «Выстрел» до щелчка или выстрела (владелец 20.11)
  clearTimeout(fearT); rrLoop('heart', on, on ? .05 : .15);
  const f = root && $('#rrFear', root); if (f) f.classList.toggle('on', on);
  if (on) fearT = setTimeout(() => rrFear(false), 4000);   // на случай, если ответ сервера потерялся
}
// щелчок барабана (владелец 21.11, assets/rr/snd/drum.mp3 — 54 щелчка): одиночные — тихое вращение и одно нажатие R, из быстрой серии — когда барабан крутится быстро
const DRUM_ONE = [.834, 1.508, 2.096, 2.66, 3.7], DRUM_FAST = [5.334, 5.418, 5.492, 5.592, 5.668, 5.78, 5.878, 5.972, 6.028];
let drumLast = -1;
function drumClick(delay, fast) {
  if (!soundOn()) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume();
    const sb = sndBuf.drum; if (!sb || !sb.duration) return;
    const L = fast ? DRUM_FAST : DRUM_ONE; let i = rnd(L.length); if (i === drumLast) i = (i + 1) % L.length; drumLast = i;
    const src = AC.createBufferSource(), g = AC.createGain(); src.buffer = sb; g.gain.value = SND.drum.vol * (fast ? .85 : 1); src.connect(g); g.connect(AC.destination);
    src.start(AC.currentTime + (delay || 0), L[i], fast ? .04 : .07);
  } catch (e) { /* звук недоступен */ }
}
function rrSound(kind, from, dur, vol) {   // from / dur — только кусок файла (одно деление барабана); vol — своя громкость (выстрел в камеру)
  if (!soundOn()) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume();
    const sb = sndBuf[kind];
    if (sb && sb.duration) { const src = AC.createBufferSource(), g = AC.createGain(); src.buffer = sb; g.gain.value = vol != null ? vol : SND[kind].vol; src.connect(g); g.connect(AC.destination); if (dur) src.start(0, from || 0, dur); else src.start(); return; }
    const t0 = AC.currentTime + .01, out = AC.createGain(); out.gain.value = .2; out.connect(AC.destination);
    const tick = (t, f, d, v) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + .02); };
    const noise = (t, d, v, lp) => { const n = AC.sampleRate * d | 0, b = AC.createBuffer(1, n, AC.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = v; s.buffer = b; s.connect(f); f.connect(g); g.connect(out); s.start(t); };
    if (kind === 'spin') { let t = t0; for (let i = 0; i < 18; i++) { tick(t, 1700 + Math.random() * 300, .012, .22); t += .028 + i * .004; } }
    else if (kind === 'click') { tick(t0, 2300, .02, .5); noise(t0, .06, .35, 3200); }
    else if (kind === 'bang') { noise(t0, .8, 1.3, 1600); noise(t0, .1, .9, 9000); tick(t0, 80, .3, .7); }
  } catch (e) { /* звук недоступен */ }
}
function drawHint() {
  const el = $('#krHint', root); if (!el) return;
  const r = S.room, g = S.game, ph = r.phase, me = myPlayer();
  let t = '';
  if (r.paused) t = 'Игра на паузе: ждём игрока.';
  else if (ph === 'lobby' && !r.mm) t = r.kind === 'private' ? 'Игра начнётся, когда все пятеро нажмут «Готов к игре».' : 'Матч начнётся сам, когда соберутся 5 игроков.';
  el.innerHTML = t; el.hidden = !t;
}
function drawChatBtn() {
  const b = root && $('#krUnr', root); if (!b) return;
  b.hidden = !unread || chatOpen; b.textContent = unread > 9 ? '9+' : unread;
}

/* ---------- центр экрана: лобби, роль, пауза, итог ---------- */
function drawMid() {
  const el = root && $('#krMid', root); if (!el || !S) return;
  const r = S.room, g = S.game, ph = r.phase, me = myPlayer();
  el.className = 'kr-mid'; root.classList.remove('show-res');
  if (G && G.tv) G.tv(ph === 'done' ? tvData() : null);   // итог — на экране на стене (3D)
  if (r.paused) { const p = S.players.find(x => x.seat === r.pause_seat); el.innerHTML = `<section class="kr-pause kr-glass"><span class="kr-h">Пауза</span><h2 class="kr-t">Игрок потерял связь</h2><p>${p ? seatB(p.seat) + esc(p.name) : 'Игрок'} — ждём <b id="krPl">…</b>.</p></section>`; return; }
  if (ph === 'lobby' && r.mm) { el.className = 'kr-mid ld'; const pl = $('#rlPl', el); if (pl) pl.innerHTML = loadPlayers(); else el.innerHTML = loadHtml(); return; }   // все приняли — экран загрузки
  if (ph === 'lobby') { el.className = 'kr-mid lob'; el.innerHTML = lobbyHtml(); return; }
  if (ph === 'done') { el.className = 'kr-mid res'; root.classList.add('show-res'); el.innerHTML = ''; return; }
  drawBet();
  if (ph === 'done' && r.money && refreshProf && betGame !== -(g ? g.id : 0)) { betGame = -(g ? g.id : 0); refreshProf(); }   // выигрыш / возврат — на баланс сайта
  if (ph === 'next' && g && !g.round) {   // знакомство до раунда 1 (владелец 20.11): «Подготовка к раунду» и отсчёт — только текст, без подложек
    el.className = 'kr-mid rr-iw';
    if (!$('#rrInN', el)) el.innerHTML = '<div class="rr-in"><span class="rr-in-t">Подготовка к раунду</span><b class="rr-in-n" id="rrInN"></b></div>';
    introTick(); return;
  }
  if (ph === 'next' && g && g.ev && g.ev.kind === 'bang') {
    const d = S.players.find(p => p.seat === g.ev.seat), left = S.players.filter(p => p.alive !== false).length, nb = RR.bul[left];
    el.innerHTML = '';   // владелец 20.11: плашки «Раунд N / ник выбыл» нет — кто выбыл, видно по центру («Выстрел / ник выбыл»)
    return;
  }
  if (ph === 'play' && me && me.alive === false) { el.className = 'kr-mid low'; el.innerHTML = `<section class="rr-nx kr-glass"><span class="kr-h">Вы выбыли · ${me.place} место</span><p>Смотрите игру до конца. Живые вас не слышат, чат — только чтение.</p></section>`; return; }
  el.innerHTML = '';
}
function introTick() {   // отсчёт «Подготовка к раунду»: новое число раз в секунду, с лёгким «щелчком»; последние 3 — голубым
  const n = root && $('#rrInN', root); if (!n || !S || !S.room.deadline) return;
  const sec = Math.max(0, Math.ceil((S.room.deadline - (Date.now() + off)) / 1000)), t = String(sec);
  if (n.textContent === t) return;
  n.textContent = t; n.classList.toggle('end', sec <= 3); n.classList.remove('tk'); void n.offsetWidth; n.classList.add('tk');
}
// ---------- экран загрузки: все приняли → ~10 с, все успевают открыть игру, проверить микрофон и звук ----------
const TIPS = ['Крутить барабан можно сколько угодно раз — но выстрелить всё равно придётся.', 'Не крутили барабан — выстрел будет из следующего гнезда.', 'На ход — 20 секунд. Не успели — револьвер решит за вас.', 'Кто стреляет первым в раунде, решает случай.', 'С каждым раундом патронов больше: один, два, три.', 'В финале один на один в барабане пять патронов из шести.', 'После пустых щелчков шанс растёт. Может, стоит крутануть?', 'Выбывшие смотрят молча — живые их не слышат.', 'Здесь не бывает ничьих. Остаётся один.', 'Удача любит тех, у кого не дрожат руки.', 'Зажмите ЛКМ и ведите мышью — осмотритесь за столом.', 'Tab — таблица игроков: щелчки, прокрутки, места.', 'Победитель получает больше всех очков недели.', 'Деньги на столе — для антуража. Ставка здесь — жизнь.'];   // фразы экрана загрузки (владелец 20.11: тематические)
let loadSent = 0, tipN = rnd(TIPS.length), tipAt = 0, lastLd = null, slideAt = 0;
function markLoaded() {   // игра у меня загрузилась (3D готово или без 3D) — сообщаем серверу
  if (!S || !room || loadSent === room || S.room.phase !== 'lobby' || !S.room.mm) return;
  if (!(G || root.classList.contains('no3d'))) return;
  const me = S.players.find(p => p.me); if (me && me.loaded) { loadSent = room; return; }
  loadSent = room; const id = room;
  api.rpc('krot_loaded', { p_room: id }).then(() => { if (room === id) refresh(); }, () => { loadSent = 0; });
}
// экран загрузки как в CS2 (владелец 20.11): кадры комнаты (assets/rr/load/1–6.webp) сменяются с медленным наездом, логотип, игроки,
// внизу — место, режим, тематические фразы и полоска загрузки; настроек микрофона нет. Перерисовывается только список игроков (иначе сбрасывается показ кадров)
const LOAD_N = 6;
function loadPlayers() {
  return SEATS.map(s2 => {
    const p = S.players.find(q => q.seat === s2);
    if (!p) return `<li class="wait"><b>${s2}</b><span>ждём игрока…</span></li>`;
    return `<li class="${p.loaded ? 'ok' : ''}${p.me ? ' me' : ''}"><b>${s2}</b><span>${esc(p.name)}</span><em>${p.loaded ? ICO.ok : '<i class="kr-spin"></i>'}</em></li>`;
  }).join('');
}
function loadHtml() {
  const n0 = rnd(LOAD_N); slideAt = Date.now();
  return `<section class="rrl">
    <div class="rrl-bg" id="rlBg">${Array.from({ length: LOAD_N }, (_, i) => `<i class="${i === n0 ? 'on' : ''}" style="background-image:url(assets/rr/load/${i + 1}.webp)"></i>`).join('')}</div>
    <div class="rrl-top"><img class="rrl-logo" src="assets/main/rr-logo.webp" alt="Русская рулетка" draggable="false"><button class="rrl-x" data-a="leave" type="button">Выйти</button></div>
    <aside class="rrl-pl"><span class="rrl-h">Игроки</span><ol id="rlPl">${loadPlayers()}</ol></aside>
    <div class="rrl-bot">
      <div class="rrl-map"><span class="rrl-mode">${S.room.points ? 'Быстрая игра' : 'Игра с друзьями'}</span><h1>Подпольное казино</h1></div>
      <p class="rrl-tip in" id="krTip">${esc(TIPS[tipN % TIPS.length])}</p>
      <div class="rrl-st" id="krLdSt">Загрузка…</div>
      <div class="rrl-bar"><i id="krLdBar"></i></div>
    </div></section>`;
}
// экран загрузки: отсчёт, полоска, кого ждём, смена подсказок (из uiTick)
function loadTick() {
  const st2 = $('#krLdSt', root), bar = $('#krLdBar', root); if (!st2 || !S) return;
  const r = S.room, now = Date.now() + off, left = Math.max(0, (r.deadline || now) - now), tot = Math.max(1, (r.deadline || now) - (r.load_at || now));
  if (bar) bar.style.transform = `scaleX(${clamp(1 - left / tot, 0, 1).toFixed(3)})`;
  const wait = S.players.filter(p => !p.loaded);
  st2.innerHTML = left > 0 ? `Игра начнётся через <b>${fmt(Math.ceil(left / 1000))}</b>` : wait.length ? `Ждём: <b>${esc(wait.map(p => p.name).join(', '))}</b>` : 'Начинаем…';
  if (Date.now() - slideAt > 6500) { slideAt = Date.now(); const bg = $('#rlBg', root); if (bg) { const k = bg.children, c = [...k].findIndex(x => x.classList.contains('on')); if (c >= 0) k[c].classList.remove('on'); k[(c + 1) % k.length].classList.add('on'); } }   // смена кадра
  if (Date.now() - tipAt > 5000) { tipAt = Date.now(); tipN++; const t = $('#krTip', root); if (t) { t.classList.remove('in'); void t.offsetWidth; t.textContent = TIPS[tipN % TIPS.length]; t.classList.add('in'); } }
}
// микрофон экрана загрузки — общий с голосовым чатом (VC)
function micStart() { const sel = root && $('#krMicSel', root); vcMic(sel ? sel.value : undefined); }
function micStop() { /* микрофоном владеет голосовой чат: он выключится при выходе из комнаты */ }
function micFill() { if (root) vcFillDevs(root); }
async function vcFillDevs(scope) {   // списки микрофонов и динамиков (названия видны после разрешения микрофона)
  const ds = await vcDevices(), cur = { mic: LS.get('mic', ''), spk: LS.get('spk', '') };
  scope.querySelectorAll('select[data-dev]').forEach(sel => {
    const k = sel.dataset.dev, list = ds.filter(d => d.kind === (k === 'mic' ? 'audioinput' : 'audiooutput'));
    sel.innerHTML = '<option value="">По умолчанию</option>' + list.map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === cur[k] ? ' selected' : ''}>${esc(d.label || (k === 'mic' ? 'Микрофон ' : 'Динамики ') + (i + 1))}</option>`).join('');
  });
}
function spkTest() { mmSound('connect', true, true); }
function lobbyHtml() {
  const r = S.room, priv = r.kind === 'private', n = S.players.length, adm = priv && !r.mm && S.me.admin;   // владелец 20.11: админ добавляет ботов в своё лобби
  const seats = SEATS.map(s => {
    const p = S.players.find(x => x.seat === s);
    if (!p) return `<li class="free">${seatB(s)}<span>Свободное место</span>${adm ? '<button class="kr-btn sm" data-a="bot-add">+ Бот</button>' : '<em>ждём</em>'}</li>`;
    return `<li class="${p.ready ? 'rd' : ''}${p.me ? ' me' : ''}${p.online ? '' : ' off'}${p.bot ? ' bot' : ''}">${seatB(s)}<span>${esc(p.name)}${p.me ? ' <small>(вы)</small>' : ''}${p.bot ? ' <i class="kr-botb">БОТ</i>' : ''}</span>${p.bot && adm ? `<button class="kr-btn sm ghost" data-a="bot-del" data-seat="${s}">Убрать</button>` : `<em>${!p.online ? 'нет связи' : p.ready ? 'готов' : 'не готов'}</em>`}</li>`;
  }).join('');
  return `<section class="kr-lob kr-glass"><span class="kr-h">${priv ? 'Комната друзей · без очков' : 'Быстрая игра · очки недели'}</span>
    <h2 class="kr-t">${priv ? 'Соберите группу' : 'Подбор игроков'}</h2>
    <p class="kr-sub"><b>${n}</b> / ${NS} за столом${r.deadline ? ' · старт через <b id="krLs">…</b>' : ''}</p>
    ${priv ? `<div class="kr-cbig"><span>Код комнаты</span><b>${esc(r.code)}</b><div><button class="kr-btn sm" data-a="copy">Скопировать код</button><button class="kr-btn sm" data-a="link">Ссылка-приглашение</button></div></div>` : ''}
    <ul class="kr-seats">${seats}</ul>
    <div class="kr-la"><button class="kr-btn ${S.me.ready ? '' : 'go'}" data-a="ready">${S.me.ready ? 'Я не готов' : 'Готов к игре'}</button><button class="kr-btn ghost" data-a="leave">Выйти</button></div>
    <p class="kr-fine">${priv ? 'Игра начнётся, когда за столом пятеро и все нажали «Готов».' : 'Матч начнётся сам, когда соберутся пятеро. Все «Готов» — старт через 3 секунды.'} <button class="kr-link" data-a="how">Правила</button></p></section>`;
}
function briefHtml() {
  const c = S.me.card || {}, k = S.me.role === 'krot';
  return `<section class="kr-brief kr-glass ${k ? 'krot' : 'agent'}"><span class="kr-h">Ваша роль</span><h2 class="kr-bt">${k ? 'Крот' : 'Оперативник'}</h2>
    ${k ? `<p class="kr-bl"><span>Цель — <b>контейнер ${nn(c.target)}</b>. Уведите команду от него и не выдайте себя.</span></p><div class="kr-bk"><span>Секретное задание · ${esc((c.task && c.task.title) || '')}</span><p>${esc((c.task && c.task.text) || '')}</p></div>`
    : `<p class="kr-bl">${clueIco(c)}<span>${esc(c.text || '')}</span></p><p class="kr-bs">Ваша улика правдивая. Найдите две другие — и не верьте Кроту.</p>`}
    <button class="kr-btn go" data-a="brief-ok">Понятно</button><small class="kr-fine">Карточка останется в руках: опустите взгляд или зажмите ПКМ.</small></section>`;
}
function tvData() {   // итог для экрана на стене (рисует 3D-часть, tvDraw)
  const r = S.room, me = myPlayer(), list = S.players.slice().sort((a, b) => (a.place || 9) - (b.place || 9)), w = list.find(p => p.place === 1);
  const up = s => String(s || '').toUpperCase();
  return {
    t1: w ? (w.me ? 'ВЫ ПОБЕДИЛИ' : 'ПОБЕДИЛ') : 'ИГРА ОКОНЧЕНА', t2: w && !w.me ? up(w.name) : '',
    me: me && me.place ? (me.place === 1 ? 'ВЫ ВЫЖИЛИ' : 'ВАШЕ МЕСТО: ' + me.place) + (r.money && me.won ? ` · +${Math.round(me.won)} ₽` : r.money && me.back ? ` · ВОЗВРАТ ${Math.round(me.back)} ₽` : '')
      + (r.points ? (me.pts ? ` · +${me.pts} ОЧКОВ` : '') : ' · БЕЗ ОЧКОВ') : '', win: !!(me && me.place === 1),
    rows: list.map(p => ({ pl: p.place || 0, s: p.seat, n: p.name, me: !!p.me, out: p.place !== 1, pts: r.points && p.pts != null ? '+' + p.pts : '—' })),
    btns: [{ a: 'again', l: 'ИГРАТЬ ЕЩЁ', go: true }, { a: 'copyres', l: 'СКОПИРОВАТЬ ИТОГ' }, { a: 'players', l: 'ПОЖАЛОВАТЬСЯ' }, { a: 'menu', l: 'В МЕНЮ' }]
  };
}
function tvAct(a) {   // кнопка на экране = та же кнопка интерфейса (onClick по data-a)
  if (a === 'again') rrSound('tvon');
  if (a === 'menu') { rrSound('tvoff'); leave(true); location.hash = '#/'; return; }   // владелец 20.11: «В меню» — выключить режим и на главный экран сайта
  const b = document.createElement('button'); b.type = 'button'; b.hidden = true; b.dataset.a = a; root.appendChild(b); b.click(); b.remove();
}
function resultText() {
  if (!S || S.room.phase !== 'done') return '';
  const w = S.players.find(p => p.place === 1), me = myPlayer();
  return `RUSH CASE · Русская рулетка — победил ${w ? w.name : '—'}.${me && me.place ? ' Моё место: ' + me.place + '.' : ''} ${location.origin}/#/krot`;
}

/* ---------- окна поверх игры ---------- */
function openOv(kind, arg) {
  const el = root && $('#krOv', root); if (!el) return;
  if (document.pointerLockElement) document.exitPointerLock();
  ov = kind; el.dataset.arg = arg || '';
  el.className = 'kr-ov in ' + kind;
  el.innerHTML = ovHtml(kind, arg);
  if (kind === 'voice') vcFillDevs(el);
  if (kind === 'players' || kind === 'voice') vcLiveOv();
  el.onclick = e => { if (e.target === el) closeOv(); };
}
function closeOv() { const el = root && $('#krOv', root); if (!el) return; ov = ''; plTemp = false; el.className = 'kr-ov'; el.innerHTML = ''; }
function showPlayers(on) { if (on) openOv('players'); else if (ov === 'players') closeOv(); if (!on) plTemp = false; }
function drawOvLive(force) {   // окно «Игроки» перерисовываем, только если ползунок не под рукой
  if (ov !== 'players') return; const el = $('#krOv', root);
  if (!force && (el.contains(document.activeElement) && document.activeElement !== document.body)) return;
  el.innerHTML = ovHtml('players'); vcLiveOv();
}
function ovHtml(kind, arg) {
  const x = `<button class="kr-ib kr-ovx" data-a="close" aria-label="Закрыть">${ICO.close}</button>`;
  if (kind === 'how') return `<aside class="kr-how kr-glass">${x}<span class="kr-h">Правила</span><h2 class="kr-t">Русская рулетка</h2>
    <ol class="kr-steps">
      <li><b>Стол.</b> Пять игроков и один револьвер на шесть гнёзд. Патроны лежат в случайных гнёздах — где именно, не знает никто.</li>
      <li><b>Ход.</b> Револьвер идёт по кругу. На своём ходу можно крутить барабан сколько угодно раз, потом — выстрел. На ход 20 секунд: не успели — револьвер выстрелит сам, без прокрутки.</li>
      <li><b>Шанс.</b> Не крутили — выстрел из следующего гнезда: после пустых щелчков шанс растёт, прокрутка возвращает его к началу. Текущий шанс виден вверху экрана.</li>
      <li><b>Раунды.</b> Раунд идёт до первого выстрела. Игра начинается с 1 патрона в барабане. Ускорить её можно, купив патрон — купленные остаются и в следующих раундах: кто выстрелил и выжил, может поднять руку (G), пока не выстрелил следующий, — голосуют живые (✓ или ✕), нужно не меньше половины «за» (в финале вдвоём — нельзя; в быстрой игре из банка — половина самой маленькой ставки: при ставках по 100 ₽ — 50 ₽), но не больше 4 — два гнезда всегда пустые. Кто стреляет первым в раунде, сервер решает случайно.</li>
      <li><b>Выбывшие</b> смотрят игру до конца молча: живые их не слышат, чат — только чтение.</li>
    </ol>
    <h3 class="kr-h2">Очки</h3><p>Быстрая игра — очки недели за место: 1-е — 10, 2-е — 6, 3-е — 3, 4-е — 1. Лучшим за неделю — скины. Комнаты друзей — без очков.</p>
    <h3 class="kr-h2">Ставки</h3><p>Быстрая игра — на деньги: на старте списывается 100 ₽, за 15 секунд подготовки ставку можно поднять. Последний выживший забирает банк: с каждого — не больше, чем поставил сам (остальное возвращается), минус купленные патроны и 5% сайту.</p>
    <h3 class="kr-h2">Управление</h3><ul class="kr-keyl"><li><kbd>ЛКМ</kbd> зажать и вести мышью — осмотреться</li><li><kbd>R</kbd> — нажать: барабан на одно деление; зажать — крутится, пока держите</li><li><kbd>G</kbd> — поднять руку: +1 патрон следующему (после своего пустого выстрела)</li><li><kbd>F1</kbd> / <kbd>F2</kbd> — голос «да» / «нет»</li><li><kbd>Пробел</kbd> — выстрел</li><li><kbd>V</kbd> зажать — говорить</li><li><kbd>Enter</kbd> — чат, <kbd>Tab</kbd> — игроки</li></ul></aside>`;
  if (kind === 'players') {   // таблица счёта как в CS2: шапка, квадрат раунда, строки игроков; своя строка — золотом, выбывшие — с крестиком
    const ps = S ? S.players : [], g = S && S.game, ph = S ? S.room.phase : '', alive = ps.filter(p => p.alive !== false && !p.left).length;
    const order = SEATS.map(st => ps.find(q => q.seat === st)).filter(Boolean).sort((p, q) => (p.alive === false) - (q.alive === false) || (p.place || 0) - (q.place || 0) || p.seat - q.seat);
    const rows = order.map(p => {
      const s2 = p.seat, dead = p.alive === false && ph !== 'lobby', turn = !!(g && ph === 'play' && g.turn === s2), win = ph === 'done' && p.place === 1;
      const st = p.left ? ['', 'вышел'] : !p.online ? ['off', 'нет связи'] : win ? ['win', 'победитель'] : dead ? ['dead', 'выбыл'] : turn ? ['turn', 'ходит'] : ph === 'lobby' ? ['', p.ready ? 'готов' : 'ждём'] : ['', 'в игре'];
      const k = vkey(p), mut = !!VC.mute[k], vol = Math.round((VC.vol[k] != null ? VC.vol[k] : 1) * 100);
      const ctl = p.me || p.bot ? '' : `<span class="rr-sbc"><button class="rr-sbi${mut ? ' on' : ''}" data-a="vmute" data-seat="${s2}" title="${mut ? 'Включить звук игрока' : 'Заглушить игрока'}">${mut ? ICO.spkOff : ICO.spk}</button><input type="range" min="0" max="100" value="${vol}" data-vol="${s2}" aria-label="Громкость: ${esc(p.name)}"><button class="rr-sbrep" data-a="report" data-seat="${s2}">Пожаловаться</button></span>`;
      return `<tr class="${p.me ? 'me' : ''}${dead ? ' dead' : ''}${turn ? ' turn' : ''}"><td class="x">${dead ? '✕' : ''}</td><td class="mic"><i class="rr-sbmic" data-spk="${s2}">${ICO.mic}</i></td><td class="av"><b>${s2}</b></td>
        <td class="nm"><span>${esc(p.name)}</span>${p.me ? '<small>(вы)</small>' : ''}${p.bot ? '<i class="kr-botb">БОТ</i>' : `<em class="kr-vst" data-vst="${s2}">${vcPeerText(s2)}</em>`}</td><td class="st ${st[0]}">${st[1]}</td>
        <td>${p.clicks || 0}</td><td>${p.spins || 0}</td><td>${p.place || '—'}</td><td class="pt">${S.room.points ? (p.pts != null ? '+' + p.pts : '—') : '—'}</td><td class="ct">${ctl}</td></tr>`;
    }).join('');
    const rnd2 = g ? g.round : 0, bl = g ? g.bullets : 0;
    return `<section class="rr-sb">
      <header class="rr-sbh"><span class="rr-sbt">${ICO_GUN}Русская рулетка <i>|</i> ${S && S.room.kind === 'private' ? 'Комната друзей' : 'Быстрая игра'}</span><span class="rr-sbr">${ph === 'done' ? 'Игра окончена' : ph === 'lobby' ? 'Сбор игроков' : 'Раунд ' + rnd2 + ' из 4'}</span></header>
      <div class="rr-sbsub">${ICO.mic}<span>V — говорить</span><span class="rr-sbsep"></span><span>${S && S.room.points ? 'очки недели' : 'без очков'}</span></div>
      <div class="rr-sbb">
        <div class="rr-sbq"><div class="rr-sbn">${rnd2 || '—'}</div><b>Раунд</b><small>${bl ? bl + ' ' + plural(bl) + ' в барабане' : 'ещё не начался'}</small><small>живых ${alive}/${NS}</small></div>
        <table class="rr-sbg"><thead><tr><th></th><th></th><th></th><th class="nm"></th><th>Статус</th><th>Щелчков</th><th>Прокруток</th><th>Место</th><th>Очки</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <footer class="rr-sbf"><span>Наведите на игрока — звук, громкость, жалоба</span><span>Tab — закрыть</span></footer>
    </section>`;
  }
  if (kind === 'report') {
    const p = S && S.players.find(q => q.seat === arg);
    return `<section class="kr-rep kr-glass">${x}<span class="kr-h">Жалоба</span><h2 class="kr-t">${p ? esc(p.name) : 'Игрок'}</h2>
      <div class="kr-rr">${REPORT.map((r2, i) => `<label><input type="radio" name="krRep" value="${r2[0]}"${i ? '' : ' checked'}><span>${r2[1]}</span></label>`).join('')}</div>
      <textarea id="krRepN" maxlength="300" placeholder="Что случилось (необязательно)"></textarea>
      <div class="kr-la"><button class="kr-btn go" data-a="rep-send" data-seat="${arg}">Отправить</button><button class="kr-btn ghost" data-a="close">Отмена</button></div></section>`;
  }
  if (kind === 'voice') {
    const sink = 'setSinkId' in HTMLMediaElement.prototype;
    const sm = vcSummary(), err = VC.micErr;   // владелец 20.11: окно в стиле CS2 — стекло, разделы, переключатели; ошибка микрофона — одной строкой (раньше дважды)
    return `<section class="kr-vs2" role="dialog" aria-label="Голосовой чат">${x}
      <header class="vs-hd"><span class="vs-k">Голосовой чат</span><h2>Связь</h2></header>
      ${err ? `<div class="vs-st bad"><i></i><span>${esc(err)}</span><button class="vs-go" data-a="mic-retry" type="button">Включить микрофон</button></div>`
        : `<div class="vs-st ${sm.cls}"><i></i><span id="krVsSum">${esc(sm.t)}</span></div>`}
      <div class="vs-sec"><span class="vs-lb">Как говорить</span>
        <div class="kr-seg" role="radiogroup" aria-label="Как говорить"><button class="${VC.mode === 'ptt' ? 'on' : ''}" data-a="vmode" data-v="ptt">Зажать V</button><button class="${VC.mode === 'vad' ? 'on' : ''}" data-a="vmode" data-v="vad">Голосом</button></div>
        <div class="kr-meter kr-vsm" aria-hidden="true"><i id="krVsLvl"></i>${VC.mode === 'vad' ? `<b class="kr-thr" style="left:${Math.round(VC.thr * 100)}%"></b>` : ''}</div>
        ${VC.mode === 'vad' ? `<label class="vs-row"><span>Порог</span><input type="range" min="2" max="60" value="${Math.round(VC.thr * 100)}" data-thr="1" aria-label="Порог включения"></label>` : '<p class="vs-hint">Пока V зажата — вас слышат, внизу горит «В эфире».</p>'}
      </div>
      <div class="vs-sec"><span class="vs-lb">Устройства</span>
        <label class="vs-row"><span>Микрофон</span><select data-dev="mic" aria-label="Микрофон"><option value="">По умолчанию</option></select></label>
        ${sink ? '<label class="vs-row"><span>Динамики</span><select data-dev="spk" aria-label="Динамики"><option value="">По умолчанию</option></select></label>' : ''}
      </div>
      <div class="vs-sec vs-tgs">
        <label class="vs-tg"><span>Выключить мой микрофон</span><input type="checkbox" data-chk="self"${VC.self ? ' checked' : ''}></label>
        <label class="vs-tg"><span>Выключить звук игроков</span><input type="checkbox" data-chk="deaf"${VC.deaf ? ' checked' : ''}></label>
        <label class="vs-tg"><span>Подавление эха<small>Пока говорят другие, микрофон пропускает только явную речь</small></span><input type="checkbox" data-chk="guard"${VC.guard ? ' checked' : ''}></label>
        ${VC.aec ? '' : '<p class="vs-warn">Браузер не включил эхоподавление — говорите через наушники и в режиме «Зажать V».</p>'}
      </div>
      <div class="vs-ft"><button class="vs-btn" data-a="spk" type="button">Проверить звук</button></div>
      <details class="vs-help"><summary>Слышите себя с задержкой?</summary><p>Нажмите Tab и говорите: у кого при этом загорается значок — у того микрофон ловит звук из наушников (или идёт трансляция игры со звуком, например в Discord). Заглушите его кнопкой динамика. Голос идёт напрямую между игроками; если с кем-то не соединилось — пишите в чат.</p></details></section>`;
  }
  if (kind === 'leave') return `<section class="kr-rep kr-glass">${x}<span class="kr-h">Выход</span><h2 class="kr-t">Покинуть игру?</h2><p>В ваш ход за вас выстрелят сами, без прокрутки барабана. Вернуться в эту игру будет нельзя.</p>
    <div class="kr-la"><button class="kr-btn red" data-a="leave-yes">Выйти</button><button class="kr-btn go" data-a="close">Остаться</button></div></section>`;
  return '';
}
async function sendReport(b) {
  const seat = +b.dataset.seat, r = ($('input[name=krRep]:checked', root) || {}).value || 'other', t = ($('#krRepN', root) || {}).value || '';
  try { await api.rpc('krot_report', { p_room: room, p_seat: seat, p_reason: r, p_note: t.trim() || null }); closeOv(); note('Жалоба отправлена. Спасибо!'); }
  catch (e) { note(errText(e), 'err'); }
}
function copy(t, msg) {
  if (!t) return;
  const ok = () => note(msg), no = () => note('Не удалось скопировать: ' + t, 'warn');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, no); else no();
}
function note(t, kind = '') {
  if (!root) return;
  let n = $('#krNote', root);
  if (!n) { n = document.createElement('div'); n.id = 'krNote'; n.setAttribute('role', 'status'); root.appendChild(n); }
  n.className = 'kr-note kr-glass in ' + kind; n.textContent = t;
  clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove('in'), 2800);
}

/* ---------- кадр: таймер, голова, 3D ---------- */
function loop(t) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(.05, lastT ? (t - lastT) / 1000 : .016); lastT = t;
  uiTick();
  if (G && !document.hidden) { G.frame(dt, t / 1000); aimHint(); sendHead(t); }
}
function uiTick() {
  { const g = S && S.game; rrLoop('music', !!(g && view === 'room' && ['play', 'next'].includes(S.room.phase) && g.round >= 1 && S.players.filter(p => p.alive !== false).length > 2), 2.5);   // в финале (вдвоём) — без музыки
    const L = sndLoop.music, me = myPlayer(), v = me && me.alive === false ? .008 : SND.music.vol; if (L && L.v !== v) { L.v = v; try { const t = AC.currentTime, cur = L.g.gain.value; L.g.gain.cancelScheduledValues(t); L.g.gain.setValueAtTime(cur, t); L.g.gain.setTargetAtTime(v, t, .8);   /* без опоры громкость прыгала на 1 — «начало очень громкое» */ } catch (e) { /* без звука */ } } }   // выбыл и смотрит — музыка почти выключена   // владелец 20.11: музыка напряжения — с 1-го раунда, в финале (1 на 1) тишина; почти не слышно
  rrLoop('breath', !!(S && view === 'room' && ['play', 'next'].includes(S.room.phase) && myPlayer() && myPlayer().alive !== false), 1.5);   // дыхание своего персонажа — тихо, пока жив
  if (view !== 'room' || !S || !root) return;
  if (S.room.phase === 'play') { drawTop(); drawAct(); }   // жребий кончился — подписи хода
  drawVote(); drawVoteBtn();   // секунды голосования, итог гаснет через 4,5 с
  if (S.room.phase === 'lobby' && S.room.mm) loadTick();
  if (capHoldUntil && Date.now() >= capHoldUntil) { capHoldUntil = 0; drawAct(); }
  if (actShown && ((actShown.endsWith('true') && !actBusy && Date.now() >= actLock) || (keyDown && Date.now() - keyDownAt > 400) || (spinNote && Date.now() > spinNote.until))) { if (keyDown && Date.now() - keyDownAt > 400) keyDown = ''; if (spinNote && Date.now() > spinNote.until) spinNote = null; drawAct(); }   // кнопки снова активны после анимации
  const r = S.room, tm = $('#krTm', root), bar = $('#krBar', root); if (!tm) return;
  if (r.paused) {
    const left = Math.max(0, (r.pause_left || 0) - (Date.now() - S._at)), s = Math.ceil(left / 1000);
    if (s !== lastSec) { lastSec = s; tm.textContent = fmt(s); const pl = $('#krPl', root); if (pl) pl.textContent = s + ' с'; }
    bar.style.transform = 'scaleX(0)';
    if (left <= 0 && Date.now() - lastKick > 1500) { lastKick = Date.now(); pulse(); }
    return;
  }
  const intro = r.phase === 'next' && S.game && !S.game.round;   // 15 с знакомства до раунда 1 — таймер не показываем (владелец 20.11)
  if (!r.deadline || intro) {
    if (lastSec !== -2) { lastSec = -2; tm.textContent = ''; bar.style.transform = 'scaleX(0)'; $('#krTop', root).classList.remove('warn', 'crit'); }
    if (intro) introTick();
    if (intro && r.deadline - (Date.now() + off) <= 0 && Date.now() - lastKick > 1200) { lastKick = Date.now(); pulse(); }
    return;
  }
  const left = Math.max(0, r.deadline - (Date.now() + off)), s = Math.ceil(left / 1000);
  const total = (r.deadline - r.phase_at) || 1;   // ход (20 с), пауза между раундами, отсчёт старта
  bar.style.transform = `scaleX(${clamp(left / total, 0, 1)})`;
  if (s !== lastSec) {
    lastSec = s; tm.textContent = fmt(s);
    const timed = r.phase === 'play', top = $('#krTop', root);
    top.classList.toggle('warn', timed && s <= 10 && s > 5); top.classList.toggle('crit', timed && s <= 5);
    const ls = $('#krLs', root); if (ls) ls.textContent = s + ' с';
  }
  if (left <= 0 && Date.now() - lastKick > 1200) { lastKick = Date.now(); pulse(); }
}
let aimShown = -1;
function aimHint() {
  if (view !== 'room' || !S) return;
  const btn = canBtn() && G.aimBtn(), a = btn ? 'btn' : canPick() ? G.aim() : 0;
  if (a === aimShown) return; aimShown = a;
  root.classList.toggle('aim', !!a);
  const h = $('#krHint', root); if (!h) return;
  if (btn) { const me = myPlayer(); h.hidden = false; h.innerHTML = `<b>Красная кнопка</b> · ${me && me.vote_ready ? 'вы готовы голосовать — клик, чтобы отжать' : 'клик — готов голосовать'}`; return; }
  const b = a && S.round && S.round.boxes.find(x => x.n === a), d = (S.round && S.round.dict) || DICT0;
  if (b) { h.hidden = false; h.innerHTML = `<b>Контейнер ${nn(a)}</b> · ${svgSym(b.sym)}${esc(d.sym[b.sym])} · ${svgGun(b.gun)}${esc(d.gun[b.gun])} · ${sw(b.col)}${esc(d.col[b.col])}<span class="kr-hk">${S.room.phase === 'vote' || S.room.phase === 'revote' ? 'клик — выбрать' : 'клик — черновик'}</span>`; }
  else drawHint();
}
let headRt = 0;
function sendHead(t) {
  if (!S || view !== 'room' || t - sent.t < 100) return;
  const h = G.headAngles(); if (!h) return;
  if (Math.abs(h.y - sent.y) < .015 && Math.abs(h.p - sent.p) < .015 && t - sent.t < 2000) return;
  sent = { y: h.y, p: h.p, t };
  const y = +h.y.toFixed(3), p = +h.p.toFixed(3), n = VC.core ? VC.core.sendData({ h: [y, p] }) : 0;
  const need = S.players.filter(q => !q.me && !q.left && !q.bot).length;
  if (n < need && chRt && t - headRt > 250) { headRt = t; try { chRt.send({ type: 'broadcast', event: 'h', payload: { s: S.me.seat, y, p } }); } catch (e) { /* канал ещё не готов */ } }
}

/* ============================================================
   3D: штаб, стол, контейнеры, фигуры (three.js из importmap)
   ============================================================ */
let LIB = null;
const lib = () => LIB || (LIB = Promise.all([import('three'), import('three/addons/geometries/RoundedBoxGeometry.js'), import('three/addons/environments/RoomEnvironment.js'),
  Promise.all(['EffectComposer', 'RenderPass', 'UnrealBloomPass', 'OutputPass'].map(n => import('three/addons/postprocessing/' + n + '.js'))).then(m => Object.assign({}, ...m)).catch(() => null)]).catch(e => { LIB = null; throw e; }));
async function start3D(g) {
  const cv = $('#krCv', root);
  let T, RB, RE, PP;
  try {
    const [a, b, c, d] = await lib(); T = a; RB = b.RoundedBoxGeometry; RE = c.RoomEnvironment; PP = d;
    await Promise.all([document.fonts.load('500 64px Oswald'), document.fonts.load('700 32px Manrope'), document.fonts.load('800 32px Manrope')]).catch(() => { /* без шрифта — запасной */ });
  } catch (e) { if (g === gen && root) root.classList.add('no3d'); return; }
  if (g !== gen || !root) return;
  try { G = makeWorld(T, RB, RE, cv, PP); } catch (e) { console.warn('KROT 3D:', e); if (root) root.classList.add('no3d'); return; }
  G.hideCard(hideCard);
  if (view === 'menu') G.menu(true);
  if (S) { lastLd = null; G.menu(false); G.sync(S); G.marks(marks()); const rd = S.round; if (rd && rd.target && ['open', 'debrief', 'done'].includes(S.room.phase)) G.reveal(rd.chosen, rd.target, true); }
  root.classList.add('ready3d');
  markLoaded();
}

function makeWorld(T, RB, RE, cv, PP) {
  const W = {};
  const ren = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  ren.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  ren.outputColorSpace = T.SRGBColorSpace; ren.toneMapping = T.ACESFilmicToneMapping; ren.toneMappingExposure = 1.2;
  ren.shadowMap.enabled = true; ren.shadowMap.type = T.PCFSoftShadowMap;
  const ANI = Math.min(8, ren.capabilities.getMaxAnisotropy());
  const scene = new T.Scene(); scene.background = new T.Color(0x040303); scene.fog = new T.FogExp2(0x060404, .07);   // тёмный зал, лёгкая дымка
  const pm = new T.PMREMGenerator(ren); scene.environment = pm.fromScene(new RE(), .04).texture; scene.environmentIntensity = .22; pm.dispose();
  const cam = new T.PerspectiveCamera(62, 1, .03, 40); cam.rotation.order = 'YXZ'; scene.add(cam);
  let comp = null;   // ореолы вокруг ламп, бра и свечей (bloom); нет модулей — рисуем без них
  if (PP && PP.EffectComposer) { try { comp = new PP.EffectComposer(ren); comp.addPass(new PP.RenderPass(scene, cam)); comp.addPass(new PP.UnrealBloomPass(new T.Vector2(512, 512), .38, .35, 1)); comp.addPass(new PP.OutputPass()); } catch (e) { comp = null; } }
  const tex = (c, rx, ry) => { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = ANI; if (rx) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry || rx); } return t; };
  const std = o => new T.MeshStandardMaterial(o);
  const mesh = (g, m, cast = true, recv = true) => { const x = new T.Mesh(g, m); x.castShadow = cast; x.receiveShadow = recv; return x; };
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const UP = V(0, 1, 0), _a = V(0, 0, 0), _b = V(0, 0, 0), _c = V(0, 0, 0), _q = new T.Quaternion(), _q2 = new T.Quaternion(), _m = new T.Matrix4(), _e = new T.Euler();

  /* свет: подпольное казино — темно; яркое пятно над столом, тёплые бра по стенам, свечи; ореолы — bloom */
  const H = 3.3;                                           // высота потолка
  scene.add(new T.HemisphereLight(0xffd2a6, 0x070505, .14));
  const lamp = new T.SpotLight(0xffd9ac, 30, 0, 1.02, .72, 2); lamp.position.set(0, 2.2, 0); lamp.target.position.set(0, TOP, 0);
  lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -.0003; lamp.shadow.normalBias = .02; lamp.shadow.camera.near = .3; lamp.shadow.camera.far = 4.5; lamp.shadow.radius = 4;
  scene.add(lamp, lamp.target);
  const inL = [0, 1].map(() => ({ intensity: 0, position: V(0, -10, 0) }));   // свет контейнеров «Крота» больше не нужен
  const CAND = { x: -.6, z: .04, ry: Math.PI / 2 * .92 }, GLOBE = { x: .64, z: -.14, ry: .5 };   // где на столе канделябр и снежный шар
  const candL = new T.PointLight(0xffa24a, 0, 2.8, 2); candL.position.set(CAND.x, TOP + .43, CAND.z); scene.add(candL);   // свечи (горят, когда модель загрузилась)

  /* подпольное казино: внизу — панели из лакированной вишни, сверху — бордовые обои с узором, кессонный потолок, бра; текстуры Poly Haven (CC0) */
  const TL = new T.TextureLoader();
  const pbr = (name, rx, ry, o) => {
    const ld = (k, srgb) => { const t = TL.load('assets/rr/' + name + '_' + k + '.webp?v=1'); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = ANI; if (srgb) t.colorSpace = T.SRGBColorSpace; return t; };
    const arm = ld('arm'); arm.channel = 0;   // R — тень в щелях, G — шероховатость
    return std(Object.assign({ map: ld('diff', true), normalMap: ld('nor'), roughnessMap: arm, aoMap: arm, aoMapIntensity: .9, roughness: 1, metalness: 0 }, o));
  };
  const floor = mesh(new T.PlaneGeometry(10, 10), pbr('floor', 4, 4, { color: 0x6e6058 }), false, true);
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  // ковёр под столом
  const rug = mesh(new T.PlaneGeometry(4.8, 3.6), std({ map: tex(paintRug()), roughness: .95, metalness: 0 }), false, true); rug.rotation.x = -Math.PI / 2; rug.position.y = .004; scene.add(rug);
  const paperM = pbr('paper', 7, 1.6, { color: 0x7a2f30, normalScale: new T.Vector2(.6, .6) });
  const cherryM = pbr('cherry', 1, 1, { color: 0x9a6a58, roughness: .9 }), cherryLongM = pbr('cherry', 6, .3, { color: 0x8a5a48 });
  const trimM = pbr('dwood', 5, .2, { color: 0x5a3a2c }), brassM = std({ color: 0xc89a52, roughness: .32, metalness: .95 });
  const WAIN = 1.08, PAN = 9;                              // высота панелей, панелей на стену
  const panelG = new RB(.86, .6, .03, 2, .012), panels = new T.InstancedMesh(panelG, cherryM, 4 * PAN);
  panels.receiveShadow = true; scene.add(panels);
  const pilG = new T.BoxGeometry(.16, H - WAIN - .2, .04), pils = new T.InstancedMesh(pilG, trimM, 4 * 4); pils.receiveShadow = true; scene.add(pils);
  const _o = new T.Object3D(); let pi = 0, li = 0;
  const SCONCE = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, nx = -Math.sin(a), nz = -Math.cos(a), tx = Math.cos(a), tz = -Math.sin(a);   // n — к стене, t — вдоль стены
    const at = (u, y, d) => V(nx * (5 - d) + tx * u, y, nz * (5 - d) + tz * u);
    const plane = (w, h, y, m) => { const p = mesh(new T.PlaneGeometry(w, h), m, false, true); p.position.copy(at(0, y, 0)); p.rotation.y = a; scene.add(p); return p; };
    plane(10, H - WAIN, WAIN + (H - WAIN) / 2, paperM);                       // обои
    const back = plane(10, WAIN, WAIN / 2, cherryLongM);                      // подложка панелей
    for (let k = 0; k < PAN; k++) { _o.position.copy(at(-4.4 + k * 1.1, .2 + .6 / 2 + .06, .02)); _o.rotation.set(0, a, 0); _o.updateMatrix(); panels.setMatrixAt(pi++, _o.matrix); }
    const box = (w, h, d, y, m, u = 0) => { const b = mesh(new T.BoxGeometry(w, h, d), m, false, true); b.position.copy(at(u, y, d / 2)); b.rotation.y = a; scene.add(b); return b; };
    box(10, .16, .04, .08, trimM);                                           // плинтус
    box(10, .06, .06, WAIN, trimM); box(10, .03, .03, WAIN - .05, trimM);    // поручень над панелями
    box(10, .18, .1, H - .09, trimM); box(10, .05, .14, H - .2, trimM);      // карниз
    for (const u of [-3.75, 3.75]) { _o.position.copy(at(u, WAIN + (H - WAIN - .2) / 2, .02)); _o.rotation.set(0, a, 0); _o.updateMatrix(); pils.setMatrixAt(li++, _o.matrix); }
    // бра: на каждой стене по бокам экрана (под ними — напольные канделябры, setupProps)
    for (const u of [-2.5, 2.5]) SCONCE.push({ p: at(u, 2.02, 0), a, nx, nz, wall: i });
  }
  panels.instanceMatrix.needsUpdate = true; pils.count = li; pils.instanceMatrix.needsUpdate = true;   // пилястры — только у краёв стен: в середине экраны
  // бра: латунная пластина, рожок, плафон из матового стекла (светится — ореол), пятно тёплого света на обоях
  const shadeGlowM = new T.MeshBasicMaterial({ color: new T.Color(2.4, 1.75, 1.15) }), washT = (() => { const c = cnv(128, 256), x = c.getContext('2d'), g = x.createRadialGradient(64, 120, 4, 64, 120, 120); g.addColorStop(0, 'rgba(255,190,120,.7)'); g.addColorStop(.45, 'rgba(255,150,80,.24)'); g.addColorStop(1, 'rgba(255,120,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 256); return tex(c); })();
  const scL = [];
  SCONCE.forEach((sc, k) => {
    const g = new T.Group(); g.position.copy(sc.p); g.rotation.y = sc.a; scene.add(g);
    const plate = mesh(new T.CylinderGeometry(.06, .06, .02, 24), brassM, false, false); plate.rotation.x = Math.PI / 2; plate.position.z = .01; g.add(plate);
    const arm = mesh(new T.TorusGeometry(.09, .01, 8, 20, Math.PI / 2), brassM, false, false); arm.position.set(0, .09, .01); arm.rotation.set(0, Math.PI / 2, Math.PI); g.add(arm);
    const cup = mesh(new T.CylinderGeometry(.035, .02, .03, 16), brassM, false, false); cup.position.set(0, .09, .1); g.add(cup);
    const glass = new T.Mesh(new T.CylinderGeometry(.045, .075, .13, 24, 1, true), shadeGlowM); glass.position.set(0, .17, .1); g.add(glass);
    const wash = new T.Mesh(new T.PlaneGeometry(.9, 1.8), new T.MeshBasicMaterial({ map: washT, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); wash.position.set(0, .05, .006); g.add(wash);
    { const L = new T.PointLight(0xffb070, sc.wall % 2 ? 2 : 2.6, 3.8, 2); L.position.copy(sc.p).add(V(-sc.nx * .3, .15, -sc.nz * .3)); scene.add(L); scL.push(L); }   // тёплый свет от каждого бра на обои и полки
  });
  // полок с бутылками больше нет (владелец 20.11): на боковых стенах — такие же экраны с камерой
  // кессонный потолок: тёмные балки сеткой, между ними — панели темнее
  const ceil = mesh(new T.PlaneGeometry(10, 10), pbr('cherry', 3, 3, { color: 0x2a1812, roughness: .8 }), false, true); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; scene.add(ceil);
  const beamM = pbr('dwood', 4, .3, { color: 0x3a2318 });
  for (let k = -4; k <= 4; k++) for (const rot of [0, 1]) { const b = mesh(new T.BoxGeometry(10, .16, .14), beamM, false, true); b.position.set(rot ? k * 1.25 : 0, H - .08, rot ? 0 : k * 1.25); b.rotation.y = rot ? Math.PI / 2 : 0; scene.add(b); }
  // экран на задней стене (владелец: оставить) — над панелями
  // экран на задней стене (владелец: оставить) — камера наблюдения: снимает стол из угла в реальном времени (15 кадров/с, эффект CCTV)
  const cctvRT = new T.WebGLRenderTarget(640, 344, { type: T.HalfFloatType });
  const cctvCam = new T.PerspectiveCamera(60, 2.7 / 1.45, .05, 30); cctvCam.position.set(0, H - .27, 0); cctvCam.up.set(0, 0, -1); cctvCam.lookAt(0, TOP, 0); scene.add(cctvCam);
  const overhead = [];   // что висит между камерой и столом (лампа, провода, луч, дым) — в кадре камеры не рисуем
  const ovC = cnv(640, 344), ovT = tex(ovC);
  // итог игры на этом же экране (владелец 20.11): камера подъезжает, таблица мест и нажимаемые кнопки (окно поверх игры убрано)
  const TVW = 1280, TVH = 688, tvC = cnv(TVW, TVH), tvT = tex(tvC);
  const TV_BTN = [[72, 584, 404, 68], [490, 584, 230, 68], [734, 584, 230, 68], [978, 584, 230, 68]];   // x, y, ширина, высота — в пикселях картинки экрана (поля 72 px: края экрана прикрывает рамка и выпуклость)
  const tvSkull = new Image(); tvSkull.onload = () => tvDraw(); tvSkull.src = 'assets/rr/dead.svg';   // значок «выбыл» (владелец, Оформление сайта/СМЕРТЬ РР.svg)
  let tvHum = false, tvD = null, tvKey = '', tvAt = 0, tvK = 0, tvHov = null, tvFit = [.5, .5, 1, 1], tvFitAt = -1;   // tvFit — свободная часть холста (без чата и верхних плашек): центр x, y и ширина, высота в долях
  // финал (владелец 21.11): трещина на экране — «выстрел в камеру»; FIN — ход сцены у телевизора
  const crC = cnv(640, 344), crT = tex(crC);
  { const x = crC.getContext('2d'), cx = 640 * .55, cy = 344 * .56, rnd2 = () => Math.random(), lines = [], rays = []; x.lineCap = 'round'; x.lineJoin = 'round';
    const ray = (a, len, w, x0, y0, n, br) => { const pts = [[x0, y0]]; let px = x0, py = y0; for (let k = 0; k < n; k++) { a += (rnd2() - .5) * .5; const l = len / n * (.6 + rnd2() * .8); px += Math.cos(a) * l; py += Math.sin(a) * l; pts.push([px, py]); if (br && rnd2() < .45) ray(a + (rnd2() < .5 ? 1 : -1) * (.6 + rnd2() * .6), 30 + rnd2() * 90, .7 + rnd2() * .5, px, py, 4, rnd2() < .3); } lines.push({ pts, w }); return pts; };
    for (let i = 0; i < 30; i++) rays.push(ray(i / 30 * Math.PI * 2 + rnd2() * .2, 220 + rnd2() * 380, 1 + rnd2() * 1.6, cx, cy, 10, true));   // лучи до краёв и ответвления
    // осколки: тёмные клинья между соседними лучами у точки удара — стекло выбито
    x.fillStyle = 'rgba(0,0,0,.62)';
    for (let i = 0; i < rays.length; i++) if (rnd2() < .45) { const r1 = rays[i], r2 = rays[(i + 1) % rays.length], n = 2 + Math.floor(rnd2() * 3); x.beginPath(); x.moveTo(cx, cy); for (let k = 1; k <= n; k++) x.lineTo(r1[k][0], r1[k][1]); for (let k = n; k >= 1; k--) x.lineTo(r2[k][0], r2[k][1]); x.closePath(); x.fill(); }
    for (const r of [14, 30, 52, 80, 118]) { let pts = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, rr = r * (.75 + rnd2() * .5); if (rnd2() < .22 && pts.length > 1) { lines.push({ pts, w: 1.1 }); pts = []; } pts.push([cx + Math.cos(a) * rr * 1.1, cy + Math.sin(a) * rr]); } if (pts.length > 1) lines.push({ pts, w: 1.1 }); }   // кольца
    const draw = (dx, col, k) => { x.strokeStyle = col; for (const L of lines) { x.beginPath(); L.pts.forEach(([px, py], i) => (i ? x.lineTo(px + dx, py + dx) : x.moveTo(px + dx, py + dx))); x.lineWidth = L.w * k; x.stroke(); } };
    draw(1.5, 'rgba(0,0,0,.6)', 2); draw(0, 'rgba(238,244,250,.95)', 1);   // тень — под теми же линиями
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, 34); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.4, 'rgba(220,228,236,.5)'); gr.addColorStop(1, 'rgba(220,228,236,0)'); x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, 34, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#000'; x.beginPath(); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, rr = 7 + rnd2() * 5; k ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill();   // дыра от пули
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1.2; x.stroke();
    crT.needsUpdate = true; }
  const FIN = { on: false, done: false, start: 0, win: 0, chips: false, roul: false, fired: false, fireAt: 0, fireT: 0, resAt: 0, mix: 0, crack: 0, flash: 0, shake: 0, gl: 0 };
  const cctvM = new T.ShaderMaterial({ uniforms: { tFeed: { value: cctvRT.texture }, tOver: { value: ovT }, uT: { value: 0 }, tRes: { value: tvT }, uMix: { value: 0 }, tCrack: { value: crT }, uCrack: { value: 0 }, uFlash: { value: 0 }, uGl: { value: 0 } }, vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: "uniform sampler2D tFeed; uniform sampler2D tOver; uniform sampler2D tRes; uniform float uT; uniform float uMix; uniform sampler2D tCrack; uniform float uCrack; uniform float uFlash; uniform float uGl; varying vec2 vUv;\nfloat rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\nvoid main() {\n  vec2 c = vUv - .5; vec2 uv = .5 + c * (1. - .16 * dot(c, c) * 4.) * .97;\n  float ln = floor(uv.y * 220.); uv.x += (rnd(vec2(ln, floor(uT * 15.))) - .5) * .0025;\n  float band = 1. - smoothstep(0., .03, abs(fract(uv.y + uT * .06) - .5)); uv.x += band * .006;\n  float fr = floor(uT * 24.);\n  if (uGl > .001) { float rw = floor(uv.y * 46.) + fr * 13.; uv.x += (rnd(vec2(rw, 3.)) - .5) * .12 * uGl * step(.5, rnd(vec2(rw, 7.))); uv.y += (rnd(vec2(fr, 1.)) - .5) * .03 * uGl; }\n  float sp = .0018 + .016 * uGl;\n  vec3 col = vec3(texture2D(tFeed, uv + vec2(sp, 0.)).r, texture2D(tFeed, uv).g, texture2D(tFeed, uv - vec2(sp, 0.)).b);\n  col *= 2.5; col = col / (1. + col) * 1.25;\n  float l = dot(col, vec3(.3, .59, .11)); col = mix(vec3(l), col, .22) * vec3(.86, 1., .9);\n  col *= .86 + .14 * sin(vUv.y * 1100.);\n  col += (rnd(vUv * 517. + fract(uT) * 91.) - .5) * .075 + band * .04;\n  col *= 1. - smoothstep(.3, .8, length(c * vec2(1., .9)));\n  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) col = vec3(0.);\n  vec4 o = texture2D(tOver, vUv); col = mix(col, o.rgb, o.a);\n  col = max(col, 0.) * .85;\n  if (uCrack > .001) {\n    float dd = length((vUv - vec2(.55, .44)) * vec2(1.86, 1.));\n    col *= mix(1., .12 + .88 * smoothstep(.02, .5, dd), uCrack);\n    float f2 = floor(uT * 13.);\n    float bl = step(.6, rnd(vec2(floor(vUv.y * 24.), f2))) * step(.15, rnd(vec2(f2, 2.)));\n    col *= 1. - bl * .95 * uCrack;\n    float bw = step(.93, rnd(vec2(floor(vUv.y * 6.), floor(uT * 5.)))); col *= 1. - bw * uCrack;\n    float vb = step(.88, rnd(vec2(floor(vUv.x * 16.), f2 + 5.))); col *= 1. - vb * .85 * uCrack;\n    col += (rnd(vUv * 911. + fract(uT * 7.) * 53.) - .5) * .55 * uGl;\n    col *= 1. - .85 * step(.8, rnd(vec2(fr, 9.))) * uGl;\n    col = mix(col, vec3(dot(col, vec3(.33))), .55 * uCrack);\n  }\n  if (uMix > .001) {\n    vec2 ru = .5 + c * (1. - .18 * dot(c, c)); vec3 rs = texture2D(tRes, ru).rgb;\n    rs *= .93 + .07 * sin(vUv.y * 1100.); rs += (rnd(vUv * 731. + fract(uT) * 37.) - .5) * .022;\n    rs *= 1. - .3 * smoothstep(.4, .9, length(c * vec2(1., .9)));\n    if (ru.x < 0. || ru.x > 1. || ru.y < 0. || ru.y > 1.) rs = vec3(0.);\n    col = mix(col, rs, uMix);\n  }\n  if (uCrack > .001) { vec4 k = texture2D(tCrack, vUv); col = mix(col, k.rgb, k.a * uCrack); }\n  col = mix(col, vec3(1.), clamp(uFlash, 0., 1.));\n  gl_FragColor = vec4(col, 1.);\n}" });
  const board = new T.Mesh(new T.PlaneGeometry(2.7, 1.45), cctvM); board.position.set(0, 2.05, -4.94); scene.add(board);
  const boards = [board];   // тот же экран (камера, в конце — итог) на всех 4 стенах: вместо полок и за спиной места 1 — чтобы все видели (владелец 20.11)
  for (const [x, z, ry] of [[-4.94, 0, Math.PI / 2], [4.94, 0, -Math.PI / 2], [0, 4.94, Math.PI]]) { const b = new T.Mesh(board.geometry, cctvM); b.position.set(x, 2.05, z); b.rotation.y = ry; scene.add(b); boards.push(b); }   // на 1 см перед рамкой (иначе рамка перекрывает)
  let cctvAt = -1, ovAt = -1;
  W._cctv = { rt: cctvRT, cam: cctvCam, m: cctvM };   // для проверки (KROT.dbg.world()._cctv)
  function tvDraw() {
    const d = tvD; if (!d) return; const x = tvC.getContext('2d'), L = 72, R = TVW - 72, C = TVW / 2;
    let g = x.createLinearGradient(0, 0, 0, TVH); g.addColorStop(0, '#121820'); g.addColorStop(1, '#090c0f'); x.fillStyle = g; x.fillRect(0, 0, TVW, TVH);
    g = x.createRadialGradient(C, -80, 60, C, -80, 900); g.addColorStop(0, d.win ? 'rgba(111,220,140,.14)' : 'rgba(132,217,253,.13)'); g.addColorStop(1, 'rgba(132,217,253,0)'); x.fillStyle = g; x.fillRect(0, 0, TVW, TVH);
    x.strokeStyle = 'rgba(255,255,255,.09)'; x.lineWidth = 2; x.strokeRect(46, 34, TVW - 92, TVH - 68);
    x.textBaseline = 'alphabetic';
    // верх — по центру: «ИТОГ ИГРЫ» с чертами по бокам, заголовок, плашка «ваше место»
    x.textAlign = 'center'; x.letterSpacing = '6px'; x.font = F_H(21); x.fillStyle = '#84d9fd'; x.fillText('ИТОГ ИГРЫ', C + 3, 80);
    { const w = x.measureText('ИТОГ ИГРЫ').width / 2 + 22; x.fillStyle = 'rgba(132,217,253,.35)'; x.fillRect(C - w - 110, 72, 110, 1.5); x.fillRect(C + w, 72, 110, 1.5); }
    x.textAlign = 'left'; x.letterSpacing = '1px'; x.font = F_H(62);
    { const w1 = x.measureText(d.t1 + (d.t2 ? ' ' : '')).width, w2 = d.t2 ? x.measureText(d.t2).width : 0, x0 = C - (w1 + w2) / 2;
      x.fillStyle = '#fff'; x.fillText(d.t1, x0, 148); if (d.t2) { x.fillStyle = '#84d9fd'; x.fillText(d.t2, x0 + w1, 148); } }
    if (d.me) {
      x.font = F_H(22); x.letterSpacing = '2px'; const w = x.measureText(d.me).width + 40, x0 = C - w / 2;
      x.fillStyle = d.win ? 'rgba(111,220,140,.14)' : 'rgba(255,255,255,.06)'; x.fillRect(x0, 166, w, 40);
      x.strokeStyle = d.win ? 'rgba(111,220,140,.7)' : 'rgba(255,255,255,.22)'; x.lineWidth = 1.5; x.strokeRect(x0 + .75, 166.75, w - 1.5, 38.5);
      x.textAlign = 'center'; x.fillStyle = d.win ? '#8ff0ad' : '#e9ecef'; x.fillText(d.me, C + 1, 194); x.textAlign = 'left';
    }
    x.font = F_H(17); x.letterSpacing = '3px'; x.fillStyle = '#76808a'; x.fillText('МЕСТО', L + 14, 246); x.fillText('ИГРОК', L + 100, 246);
    x.textAlign = 'right'; x.fillText('ОЧКИ', R - 16, 246); x.textAlign = 'left';
    d.rows.forEach((r, i) => {
      const y = 256 + i * 62, win = r.pl === 1, ac = win ? '#6fdc8c' : r.me ? '#84d9fd' : '', bx = L + 100, nx = L + 150;
      if (ac) { x.fillStyle = win ? 'rgba(111,220,140,.13)' : 'rgba(132,217,253,.09)'; x.fillRect(L, y, R - L, 58); x.fillStyle = ac; x.fillRect(L, y, 4, 58); }
      x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(L, y + 59, R - L, 1);
      x.letterSpacing = '0px'; x.font = F_H(38); x.fillStyle = ac || '#e9ecef';
      if (r.out && tvSkull.naturalWidth) { x.globalAlpha = .9; x.drawImage(tvSkull, L + 14, y + 10, 40, 38); x.globalAlpha = 1; }   // выбыл — череп вместо места (владелец 20.11)
      else x.fillText(r.pl || '—', L + 20, y + 44);
      x.fillStyle = '#1f2b34'; x.fillRect(bx, y + 12, 34, 34); x.strokeStyle = 'rgba(132,217,253,.4)'; x.lineWidth = 1.5; x.strokeRect(bx + .75, y + 12.75, 32.5, 32.5);
      x.font = F_H(21); x.fillStyle = '#84d9fd'; x.textAlign = 'center'; x.fillText(r.s, bx + 17, y + 37); x.textAlign = 'left';
      x.font = F_B(28); x.fillStyle = r.out ? '#9aa3ab' : '#f1f3f5'; x.fillText(r.n, nx, y + 39);
      let ex = nx + x.measureText(r.n).width;
      if (r.me) { x.font = F_B(21, 600); x.fillStyle = '#76808a'; x.fillText('(вы)', ex + 12, y + 39); ex += 12 + x.measureText('(вы)').width; }
      x.textAlign = 'right'; x.font = F_H(32); x.fillStyle = win ? '#6fdc8c' : '#e9ecef'; x.fillText(r.pts, R - 16, y + 41); x.textAlign = 'left';
    });
    d.btns.forEach((b, i) => {
      const [bx, by, bw, bh] = TV_BTN[i], h = tvHov === b.a;
      g = x.createLinearGradient(0, by, 0, by + bh);
      if (b.go) { g.addColorStop(0, h ? '#44a865' : '#32804d'); g.addColorStop(1, h ? '#2d7a47' : '#1f5733'); }
      else { g.addColorStop(0, h ? 'rgba(132,217,253,.24)' : 'rgba(255,255,255,.08)'); g.addColorStop(1, h ? 'rgba(132,217,253,.12)' : 'rgba(255,255,255,.035)'); }
      x.fillStyle = g; x.fillRect(bx, by, bw, bh);
      x.strokeStyle = b.go ? (h ? '#9cf5b7' : '#5cc77f') : (h ? '#84d9fd' : 'rgba(255,255,255,.2)'); x.lineWidth = 2; x.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      x.font = F_H(b.go ? 30 : 23); x.letterSpacing = '2px'; x.textAlign = 'center'; x.fillStyle = b.go ? '#effff3' : h ? '#fff' : '#c9ced3';
      x.fillText(b.l, bx + bw / 2, by + bh / 2 + (b.go ? 11 : 8)); x.textAlign = 'left';
    });
    x.letterSpacing = '0px'; tvT.needsUpdate = true;
  }
  if (document.fonts) document.fonts.ready.then(() => tvDraw());
  W.tv = d => {   // d — данные итога (или null — убрать); камера подъедет через 1,2 с после конца игры
    const k = d ? JSON.stringify(d) : ''; if (k === tvKey) return;
    if (d && !tvD) {
      tvAt = clock + 1.2;
      const w = d.rows && d.rows.find(r => r.pl === 1);   // финал: камера у экрана → на записи фишки едут к победителю, револьвер «стреляет в камеру», потом итог
      Object.assign(FIN, { on: !!w && !menuOn, done: !w || menuOn, start: tvAt + 1.5, win: w ? w.s : 0, chips: false, roul: false, fired: false, fireAt: 0, fireT: 0, resAt: 0, mix: 0, crack: 0, flash: 0, shake: 0, gl: 0 });
    }
    tvKey = k; tvD = d; tvHov = null; tvDraw();
  };
  W.tvPick = (mx, my, hover) => {   // что под мышкой на экране: действие кнопки или null; hover — подсветить
    let a = null;
    if (tvD && tvK > .85 && FIN.done && mx != null) {   // кнопки итога — когда итог уже на экране
      ndc.set(mx, my); ray.setFromCamera(ndc, cam); const h = ray.intersectObject(board, false)[0];
      if (h && h.uv) {   // с поправкой на выпуклость кинескопа, как в шейдере
        const cx = h.uv.x - .5, cy = h.uv.y - .5, k = 1 - .18 * (cx * cx + cy * cy), px = (.5 + cx * k) * TVW, py = (.5 - cy * k) * TVH;
        const i = TV_BTN.findIndex(([bx, by, bw, bh]) => px >= bx && px <= bx + bw && py >= by && py <= by + bh);
        if (i >= 0 && tvD.btns[i]) a = tvD.btns[i].a;
      }
    }
    if (hover !== false && a !== tvHov) { tvHov = a; tvDraw(); }
    return a;
  };
  function chipsTo(win) {   // финал: все стопки съезжаются к победителю (на сукно перед ним, рядком)
    const p = SEAT[win]; if (!p) return;
    const ks = Object.keys(CH), base = chipSpot(win, .08), lx = Math.cos(p.yaw), lz = -Math.sin(p.yaw), fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    ks.forEach((k, i) => { const c = CH[k], off = (i - (ks.length - 1) / 2) * .056, bk = (i % 2) * .05;
      c.fin = { x0: c.g.position.x, z0: c.g.position.z, x1: base.x + lx * off + fx * bk, z1: base.z + lz * off + fz * bk, t: -i * .14 }; });
  }
  function finFire() {   // выстрел «в камеру»: взвод был, теперь вспышка у дула и звук; на экране — белая вспышка, трещина, лёгкая тряска
    rrSound('bang', 0, 0, .9);   // владелец 21.11: громче обычного выстрела (.5), чтобы пугал, но не на полную
    const o = gun.g; o.updateMatrixWorld(); flashL.position.copy(gun.muzzle).applyMatrix4(o.matrixWorld); flashL.position.y += .05;
    tween(.45, k => { flashL.intensity = 40 * Math.pow(1 - k, 2); });
    tween(.35, k => { const sn = k < 1 ? Math.sin(Math.PI * k) : 0; gun.hop = sn * .025; gun.kick = sn; });
    FIN.flash = 1; FIN.crack = 1; FIN.shake = 1; FIN.gl = 1; FIN.fireT = clock; cctvAt = -1;   // кадр со вспышкой — и камера «умерла»: дальше картинка замирает
  }
  function finStep(dt) {
    if (!tvD) { if (tvK < .05) Object.assign(FIN, { on: false, done: false, fired: false, mix: 0, crack: 0, flash: 0, shake: 0, gl: 0 }); return; }
    FIN.flash = Math.max(0, FIN.flash - dt * 3.4); FIN.shake = Math.max(0, FIN.shake - dt * 2.6);
    FIN.gl = FIN.crack > 0 ? (Math.random() < dt * 4 ? 1 : Math.max(.35, FIN.gl - dt * 2.2)) : 0;   // помехи: держатся и вспыхивают
    if (!FIN.on) return;
    const t = clock - FIN.start; if (t < 0) return;
    if (!FIN.chips) { FIN.chips = true; chipsTo(FIN.win); }
    if (!FIN.roul && t >= (Object.keys(CH).length ? 2.3 : .3)) {   // фишки доехали — револьвер в центр, крутится, ствол вниз кадра (к зрителю камеры)
      FIN.roul = true; W.roulDir(0, 1, () => { rrSound('cock'); tween(.18, k => { gun.kz = k < 1 ? Math.sin(Math.PI * k) * .05 : 0; }); FIN.fireAt = clock + COCK_MS / 1000; });
    }
    if (!FIN.fired && ((FIN.fireAt && clock >= FIN.fireAt) || t > 14)) { FIN.fired = true; finFire(); FIN.resAt = clock + 2.2; }   // убитая камера видна ~2,2 с   // t > 14 — страховка
    if (FIN.resAt && clock >= FIN.resAt) { FIN.mix = 1; FIN.crack = 0; FIN.gl = 0; FIN.on = false; FIN.done = true; tvHov = null; tvDraw(); }   // резкий переход к итогу (владелец 21.11)
  }
  function cctvDraw() {   // кадр камеры: свою голову на это время возвращаем (от первого лица она скрыта), экран прячем (нельзя рисовать в текстуру, которую он показывает)
    const me = AV[mySeat], M = me && me.on && me.M;
    const hs = M ? M.head.scale.x : 1, rz = M ? M.root.position.z : 0;   // вернуть как было (у себя модель сдвинута — ME_BACK/ME_FWD)
    if (M) { M.head.scale.setScalar(1); M.root.position.z = 0; }
    const au = ren.shadowMap.autoUpdate; ren.shadowMap.autoUpdate = false; for (const b of boards) b.visible = false; for (const o of overhead) o.visible = false;
    ren.setRenderTarget(cctvRT); ren.render(scene, cctvCam); ren.setRenderTarget(null);
    for (const b of boards) b.visible = true; ren.shadowMap.autoUpdate = au; for (const o of overhead) o.visible = true;
    if (M) { M.head.scale.setScalar(hs); M.root.position.z = rz; }
  }
  function ovDraw(t) {   // надписи камеры: номер, REC (мигает), дата и время
    const x = ovC.getContext('2d'), W2 = 640, H2 = 344, d = new Date(), p = n => String(n).padStart(2, '0');
    x.clearRect(0, 0, W2, H2); x.font = '700 19px ui-monospace, Consolas, "Courier New", monospace'; x.textBaseline = 'top'; x.fillStyle = 'rgba(232,240,232,.92)'; x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 4;
    x.textAlign = 'left'; x.fillText('CAM 01 · СТОЛ', 26, 22); x.fillText(p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + '  ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()), 26, H2 - 44);
    x.textAlign = 'right'; x.fillText('REC', W2 - 26, 22); x.fillText('RUSH CASE', W2 - 26, H2 - 44);
    if (Math.floor(t * 1.4) % 2 === 0) { x.fillStyle = '#ff3b30'; x.beginPath(); x.arc(W2 - 86, 32, 7, 0, 7); x.fill(); }
    x.shadowBlur = 0; x.strokeStyle = 'rgba(232,240,232,.6)'; x.lineWidth = 2; const k = 28;
    for (const [cx, cy, sx, sy] of [[14, 14, 1, 1], [W2 - 14, 14, -1, 1], [14, H2 - 14, 1, -1], [W2 - 14, H2 - 14, -1, -1]]) { x.beginPath(); x.moveTo(cx, cy + sy * k); x.lineTo(cx, cy); x.lineTo(cx + sx * k, cy); x.stroke(); }
    x.beginPath(); x.moveTo(W2 / 2 - 12, H2 / 2); x.lineTo(W2 / 2 + 12, H2 / 2); x.moveTo(W2 / 2, H2 / 2 - 12); x.lineTo(W2 / 2, H2 / 2 + 12); x.strokeStyle = 'rgba(232,240,232,.35)'; x.stroke();
    ovT.needsUpdate = true;
  }
  // сама камера: купол на потолке над столом — латунное основание, тёмное стекло, красный огонёк
  { const baseM = std({ color: 0xc89a52, roughness: .32, metalness: .95 }), domeM = new T.MeshStandardMaterial({ color: 0x07090c, roughness: .08, metalness: .85, transparent: true, opacity: .92 });
    const base = mesh(new T.CylinderGeometry(.13, .14, .04, 32), baseM, false, false); base.position.set(0, H - .18, 0);   // под перекрестьем балок (низ балок — H − 0,16) scene.add(base);
    const dome = new T.Mesh(new T.SphereGeometry(.1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), domeM); dome.position.set(0, H - .2, 0); scene.add(dome);
    const led = new T.Mesh(new T.SphereGeometry(.008, 10, 8), new T.MeshBasicMaterial({ color: new T.Color(4, .25, .2) })); led.position.set(.105, H - .205, 0); scene.add(led); W._led = led;
    overhead.push(base, dome, led); }
  const frameM = std({ color: 0x15191e, metalness: .6, roughness: .4 });
  const bf = mesh(new T.BoxGeometry(2.86, 1.6, .05), frameM, false, true); bf.position.set(0, 2.05, -4.975); scene.add(bf);
  for (const [x, z, ry] of [[-4.975, 0, Math.PI / 2], [4.975, 0, -Math.PI / 2], [0, 4.975, Math.PI]]) { const f = mesh(bf.geometry, frameM, false, true); f.position.set(x, 2.05, z); f.rotation.y = ry; scene.add(f); }   // рамки остальных экранов
  // лампа над столом: латунная штанга и три зелёных абажура, внутри светится (ореол); свет — прожектор lamp
  const shadeOutM = std({ color: 0x0f2a1d, roughness: .3, metalness: .55 }), shadeInM = new T.MeshBasicMaterial({ color: new T.Color(2.6, 2.1, 1.5), side: T.BackSide });
  const prof = [[.02, .16], [.05, .15], [.09, .1], [.15, .03], [.17, 0]].map(([r, y]) => new T.Vector2(r, y));
  const rod = mesh(new T.CylinderGeometry(.012, .012, 1.5, 12), brassM, false, false); rod.rotation.z = Math.PI / 2; rod.position.set(0, 2.42, 0); scene.add(rod); overhead.push(rod);
  for (const x of [-.55, 0, .55]) {
    const sh = mesh(new T.LatheGeometry(prof, 32), shadeOutM, false, false); sh.position.set(x, 2.24, 0); scene.add(sh); overhead.push(sh);
    const inn = new T.Mesh(new T.LatheGeometry(prof, 32), shadeInM); inn.scale.setScalar(.97); inn.position.set(x, 2.24, 0); scene.add(inn); overhead.push(inn);
    const stem = mesh(new T.CylinderGeometry(.008, .008, .02, 8), brassM, false, false); stem.position.set(x, 2.41, 0); scene.add(stem); overhead.push(stem);
  }
  for (const x of [-.6, .6]) { const cable = mesh(new T.CylinderGeometry(.005, .005, H - 2.42, 6), std({ color: 0x0a0a0a }), false, false); cable.position.set(x, (H + 2.42) / 2, 0); scene.add(cable); overhead.push(cable); }
  // дым в луче: светлый конус под лампой и медленно плывущие клубы
  const shaftM = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: { c: { value: new T.Color(1, .82, .6) }, o: { value: .085 } },   // края луча мягкие: чем ближе к ребру — тем прозрачнее
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main() { vec4 wp = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); vY = uv.y; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'uniform vec3 c; uniform float o; varying vec3 vN; varying vec3 vV; varying float vY; void main() { float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.5); gl_FragColor = vec4(c * o * f * vY * vY, 1.); }' });
  const beam = new T.Mesh(new T.CylinderGeometry(.55, 1.55, 1.35, 48, 1, true), shaftM);
  beam.position.set(0, 2.2 - 1.35 / 2, 0); beam.scale.z = .62; scene.add(beam); overhead.push(beam);
  const smokeT = tex(paintSmoke()), smoke = [];
  for (let k = 0; k < 10; k++) {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: smokeT, color: 0x9a8574, transparent: true, opacity: .025 + Math.random() * .025, depthWrite: false, rotation: Math.random() * 6.28 }));
    const r = .15 + Math.random() * .7, f = Math.random() * 6.28; sp.position.set(Math.cos(f) * r, 1.55 + Math.random() * .55, Math.sin(f) * r * .6);   // только над столом, выше глаз
    const sz = .7 + Math.random() * .8; sp.scale.set(sz, sz, 1); scene.add(sp); overhead.push(sp); smoke.push({ sp, f, r, v: (Math.random() - .5) * .05, y0: sp.position.y, k: Math.random() * 9 });
  }
  // дымка по бокам (владелец 20.11): большие медленные клубы у стен и в углах, за спинами игроков; над столом и в центре её нет
  const haze = [];
  for (let k = 0; k < 22; k++) {
    const f = k / 22 * Math.PI * 2 + Math.random() * .25, r = 2.9 + Math.random() * 1.5;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: smokeT, color: 0x7d6a5c, transparent: true, opacity: .07 + Math.random() * .06, depthWrite: false, rotation: Math.random() * 6.28 }));
    sp.position.set(Math.cos(f) * r, .5 + Math.random() * 2.2, Math.sin(f) * r);
    const sz = 2.2 + Math.random() * 2; sp.scale.set(sz, sz * .8, 1); scene.add(sp); overhead.push(sp);
    haze.push({ sp, f, r, v: (Math.random() - .5) * .02, y0: sp.position.y, k: Math.random() * 9, rv: (Math.random() - .5) * .03 });
  }

  /* покерный стол: овал — сукно, деревянная дорожка, мягкий кожаный бортик, корпус и две тумбы */
  const ell = (a, b, n = 128) => { const s = new T.Shape(); for (let i = 0; i <= n; i++) { const f = i / n * Math.PI * 2, px = Math.sin(f) * a, py = Math.cos(f) * b; if (i) s.lineTo(px, py); else s.moveTo(px, py); } return s; };
  const flat = g => { g.rotateX(-Math.PI / 2); return g; };   // фигура из плоскости XY — на стол (y вверх)
  const RAIL = .15, WOOD = .09;                                // ширина бортика и деревянной дорожки (м)
  const FA = TA - RAIL - WOOD, FB = TB - RAIL - WOOD;          // полуоси сукна
  const bodyM = std({ color: 0x0f0d0c, roughness: .45, metalness: .25 });
  const body = mesh(flat(new T.ExtrudeGeometry(ell(TA - .015, TB - .015), { depth: .1, bevelEnabled: true, bevelThickness: .01, bevelSize: .012, bevelSegments: 2, curveSegments: 128 })), bodyM);
  body.position.y = TOP - .11; scene.add(body);
  const feltG = flat(new T.ShapeGeometry(ell(FA + .004, FB + .004), 128));
  { const p = feltG.attributes.position, uv = feltG.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * FA) + .5, -p.getZ(i) / (2 * FB) + .5); }
  const feltM = std({ map: tex(paintPoker()), roughness: .96, metalness: 0 });
  const felt = mesh(feltG, feltM, false, true); felt.position.y = TOP + .0006; scene.add(felt);
  const woodS = ell(TA - RAIL + .01, TB - RAIL + .01); woodS.holes.push(ell(FA, FB));
  const woodM = pbr('cherry', 10, .4, { color: 0xb07a62, roughness: .7 });
  const wood = mesh(flat(new T.ShapeGeometry(woodS, 128)), woodM, false, true); wood.position.y = TOP + .004; scene.add(wood);
  { const g = wood.geometry, p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.atan2(p.getX(i) / TA, -p.getZ(i) / TB) / Math.PI + 1) * .5, Math.hypot(p.getX(i) / TA, p.getZ(i) / TB)); }
  const railPts = []; for (let i = 0; i < 128; i++) { const f = i / 128 * Math.PI * 2; railPts.push(V(Math.sin(f) * (TA - RAIL / 2), 0, Math.cos(f) * (TB - RAIL / 2))); }
  const railM = pbr('leather', 9, .6, { color: 0x6a4a3c, roughness: .9 });
  const rail = mesh(new T.TubeGeometry(new T.CatmullRomCurve3(railPts, true), 256, RAIL / 2, 18, true), railM);
  rail.scale.y = .62; rail.position.y = TOP + .03; scene.add(rail);
  const legM = std({ color: 0x15171a, roughness: .35, metalness: .75 });
  { // одна ножка по центру (владелец): толстая колонна, юбка под столешницей и широкое основание
    const col = mesh(new T.CylinderGeometry(.13, .17, TOP - .14, 32), legM); col.position.set(0, (TOP - .14) / 2 + .05, 0); scene.add(col);
    const cap = mesh(new T.CylinderGeometry(.34, .2, .06, 40), legM); cap.position.set(0, TOP - .14, 0); scene.add(cap);
    const foot = mesh(new T.CylinderGeometry(.5, .56, .05, 48), legM); foot.position.set(0, .025, 0); scene.add(foot);
    const ring = mesh(new T.TorusGeometry(.2, .025, 12, 40), legM); ring.rotation.x = Math.PI / 2; ring.position.set(0, .07, 0); scene.add(ring);
  }

  /* револьвер посреди стола (пока из простых деталей; барабан — отдельная часть, чтобы крутился) */
  const gun = (() => {
    const g = new T.Group(), steel = std({ color: 0x3b4047, roughness: .28, metalness: .92 }), dark = std({ color: 0x1b1e22, roughness: .35, metalness: .85 });
    const gripM = std({ map: tex(paintWood(), 1, 2), color: 0xc08a60, roughness: .5, metalness: .05 });
    const frame = mesh(new RB(.1, .052, .026, 2, .006), steel); frame.position.set(0, 0, 0); g.add(frame);
    const barrel = mesh(new T.CylinderGeometry(.0105, .0105, .165, 20), steel); barrel.rotation.z = Math.PI / 2; barrel.position.set(.13, .012, 0); g.add(barrel);
    const rib = mesh(new T.BoxGeometry(.165, .008, .01), steel); rib.position.set(.13, .024, 0); g.add(rib);
    const sight = mesh(new T.BoxGeometry(.008, .009, .004), steel); sight.position.set(.205, .031, 0); g.add(sight);
    const ejector = mesh(new T.CylinderGeometry(.005, .005, .1, 12), dark); ejector.rotation.z = Math.PI / 2; ejector.position.set(.1, -.008, 0); g.add(ejector);
    const drum = new T.Group(); drum.position.set(.005, .004, 0); g.add(drum);
    const cyl6 = mesh(new T.CylinderGeometry(.024, .024, .046, 6 * 6), steel); cyl6.rotation.z = Math.PI / 2; drum.add(cyl6);
    const holeM = new T.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
    for (let i = 0; i < 6; i++) {   // гнёзда спереди и канавки по бокам барабана
      const f = i / 6 * Math.PI * 2;
      const h = new T.Mesh(new T.CircleGeometry(.0058, 14), holeM); h.position.set(.0232, Math.cos(f) * .0145, Math.sin(f) * .0145); h.rotation.y = Math.PI / 2; drum.add(h);
      const fl = mesh(new T.BoxGeometry(.03, .004, .006), dark, false); fl.position.set(0, Math.cos(f + Math.PI / 6) * .0232, Math.sin(f + Math.PI / 6) * .0232); fl.rotation.x = -(f + Math.PI / 6); drum.add(fl);
    }
    const grip = mesh(new RB(.034, .09, .028, 2, .01), gripM); grip.position.set(-.058, -.052, 0); grip.rotation.z = .42; g.add(grip);
    const guard = mesh(new T.TorusGeometry(.018, .0035, 8, 24, Math.PI), steel); guard.rotation.z = Math.PI; guard.position.set(-.006, -.026, 0); g.add(guard);
    const trig = mesh(new T.BoxGeometry(.004, .018, .006), dark); trig.position.set(-.004, -.032, 0); trig.rotation.z = .25; g.add(trig);
    const ham = mesh(new T.BoxGeometry(.016, .014, .008), dark); ham.position.set(-.054, .028, 0); ham.rotation.z = -.5; g.add(ham);
    g.rotation.order = 'YXZ'; g.rotation.set(-Math.PI / 2, .55, 0);   // лежит на боку, стволом чуть вбок
    g.position.set(0, TOP + .025, 0);                                   // барабан (радиус 2,4 см) касается сукна
    scene.add(g);
    // tp — где лежит на столе; who — чья рука держит, hw — рука дотянулась (0…1), lw — поднят к виску (0…1); kz/hop/kick — рывки от курка и выстрела
    return { g, drum, axis: 'x', hammer: null, half: .025, seat: 0, muzzle: V(.215, .012, 0), tp: { x: 0, z: 0, yaw: .55 }, sl: null, who: 0, hw: 0, lw: 0, kz: 0, hop: 0, kick: 0, rush: false, drop: false, play: false };
  })();
  const flashL = new T.PointLight(0xffc27a, 0, 3.5, 2); flashL.position.set(0, -10, 0); scene.add(flashL);   // вспышка выстрела (лампа заранее: новая = подвисание)
  W.gun = gun;

  /* контейнеры */
  const boxM = std({ color: 0x47505a, metalness: .55, roughness: .42 }), lidM = std({ color: 0x525c67, metalness: .55, roughness: .38 });
  const latchM = std({ color: 0xaab4be, metalness: .9, roughness: .25 }), foamM = std({ color: 0x0d0f12, roughness: 1 });
  const glowT = tex(paintGlow()), mineT = tex(paintMine());
  const BX = {}, hitList = [];
  for (const n of [1, 2, 3, 4]) {
    const g = new T.Group(); g.position.set(BOXP[n][0], TOP, BOXP[n][1]); scene.add(g);
    const base = mesh(new RB(.34, .12, .24, 2, .012), boxM); base.position.y = .06; g.add(base);
    const foam = new T.Mesh(new T.PlaneGeometry(.31, .21), foamM); foam.rotation.x = -Math.PI / 2; foam.position.y = .1206; g.add(foam);
    const bandM = std({ color: 0x2a3036, roughness: .5, metalness: .2, emissive: 0x000000 });
    const band = mesh(new T.BoxGeometry(.346, .018, .246), bandM, false, false); band.position.y = .072; g.add(band);
    const hinge = new T.Group(); hinge.position.set(0, .12, -.12); g.add(hinge);
    const lid = mesh(new RB(.34, .045, .24, 2, .012), lidM); lid.position.set(0, .0225, .12); hinge.add(lid);
    const liner = new T.Mesh(new T.PlaneGeometry(.31, .21), foamM); liner.rotation.x = Math.PI / 2; liner.position.set(0, -.0006, .12); hinge.add(liner);   // обивка крышки изнутри
    const dec = new T.Group(); dec.position.set(0, .0457, .12); hinge.add(dec);
    const decM = new T.MeshStandardMaterial({ transparent: true, roughness: .75, metalness: .05, depthWrite: false });
    const decal = new T.Mesh(new T.PlaneGeometry(.2, .2), decM); decal.rotation.x = -Math.PI / 2; dec.add(decal);
    const plateT = tex(paintPlate(n)); const plate = new T.Mesh(new T.PlaneGeometry(.07, .035), new T.MeshStandardMaterial({ map: plateT, roughness: .5, metalness: .3 })); plate.position.set(0, .045, .1207); g.add(plate);
    const latches = [-.11, 0, .11].map(x => { const p = new T.Group(); p.position.set(x, .089, .1215); g.add(p); const l = mesh(new T.BoxGeometry(.034, .04, .012), latchM); l.position.set(0, .02, .006); p.add(l); return p; });
    const padM = new T.MeshBasicMaterial({ map: glowT, color: 0x84d9fd, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
    const pad = new T.Mesh(new T.PlaneGeometry(.5, .4), padM); pad.rotation.x = -Math.PI / 2; pad.position.y = .003; g.add(pad);
    base.userData.n = lid.userData.n = n; hitList.push(base, lid);
    BX[n] = { n, g, base, lid, hinge, dec, decM, bandM, latches, pad, padM, open: 0, item: null, key: '', pa: 0 };
    g.visible = false;   // рулетка: контейнеров «Крота» на столе нет (код останется до переделки игры, этап 3)
  }
  hitList.length = 0;    // по невидимым контейнерам не кликается
  const mine = new T.Sprite(new T.SpriteMaterial({ map: mineT, transparent: true, depthTest: false, opacity: 0 })); mine.scale.set(.2, .05, 1); mine.renderOrder = 9; mine.visible = false; scene.add(mine);

  /* фигуры за столом (манекены; модели персонажей — этап 5) */
  const suitM = std({ color: 0x252b33, roughness: .72, metalness: .08 }), skinM = std({ color: 0x323a43, roughness: .55, metalness: .15 });
  const visorM = std({ color: 0x0a0e13, roughness: .1, metalness: .9, emissive: 0x0c3446, emissiveIntensity: .7 });
  const gearM = std({ color: 0x15191d, roughness: .5, metalness: .5 });
  const backT = tex(paintCardBack()), blankT = tex(paintCardFront(null)), spkT = tex(paintSpk()), glowDotT = tex(paintGlowDot());
  const btnBaseM = std({ color: 0x1b1f24, roughness: .45, metalness: .7 }), hazardM = new T.MeshStandardMaterial({ color: 0xd4a017, roughness: .6, metalness: .2, emissive: 0x3a2a00, emissiveIntensity: .4 });
  const myCardT = tex(paintCardFront(null));
  // стулья (владелец 20.11: «нормальные», дерево + кожа): рама под вишню стола, мягкие сиденье и спинка из тёмной кожи, латунные гвоздики по краю спинки
  const chWoodM = pbr('cherry', 1, 1, { color: 0x6e4535, roughness: .75 }), chLeatherM = pbr('leather', 1.2, 1.2, { color: 0x4a2620, roughness: .85 });
  const nailM = std({ color: 0xc29a55, roughness: .35, metalness: .85 });
  const nailG = new T.SphereGeometry(.0055, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); nailG.rotateX(-Math.PI / 2);   // шляпка смотрит к столу (−z)
  const chG = {
    apron: new RB(.48, .06, .45, 2, .012), cush: new RB(.44, .055, .42, 3, .022), leg: new T.CylinderGeometry(.02, .015, .305, 10),
    rod: new T.CylinderGeometry(.008, .008, .41, 6), post: new RB(.036, .64, .036, 2, .008), pan: new RB(.34, .40, .055, 3, .022),
    rail: new RB(.47, .065, .045, 2, .014), low: new RB(.38, .035, .03, 2, .01)
  };
  const NAILS = [];   // по краю мягкой панели спинки (в системе спинки), шаг ~3 см
  for (let i = 0; i <= 10; i++) { const x = -.156 + i * .0312; NAILS.push([x, .194, -.034], [x, .566, -.034]); }
  for (let i = 1; i <= 11; i++) { const y = .194 + i * .031; NAILS.push([-.156, y, -.034], [.156, y, -.034]); }
  const AV = {};
  const cyl = (r, m) => mesh(new T.CylinderGeometry(r, r, 1, 12), m);
  const setLimb = (o, a, b) => { _c.subVectors(b, a); const L = _c.length() || .001; o.position.copy(a).addScaledVector(_c, .5); o.quaternion.setFromUnitVectors(UP, _c.divideScalar(L)); o.scale.set(1, L, 1); };
  for (const s of SEATS) {
    const th = SEAT[s].yaw, a = { s, th, on: false, me: false, k: 0, kt: 0, hy: 0, hp: -.3, ty: 0, tp: -.3, tagKey: '', M: null, gk: 0 };
    const g = new T.Group(); g.position.set(SEAT[s].x, 0, SEAT[s].z); g.rotation.y = th; scene.add(g); a.g = g;
    // стул
    { const apron = mesh(chG.apron, chWoodM); apron.position.set(0, .335, .055); g.add(apron);
      const cush = mesh(chG.cush, chLeatherM); cush.position.set(0, .385, .05); g.add(cush);
      [[-.2, -.15], [.2, -.15], [-.2, .26], [.2, .26]].forEach(([x, z]) => { const l = mesh(chG.leg, chWoodM); l.position.set(x, .1525, z); g.add(l); });
      [-.2, .2].forEach(x => { const r = mesh(chG.rod, chWoodM, false); r.rotation.x = Math.PI / 2; r.position.set(x, .1, .055); g.add(r); });   // перекладины между ножками
      const rx = mesh(chG.rod, chWoodM, false); rx.rotation.z = Math.PI / 2; rx.position.set(0, .12, .055); g.add(rx);
      const bk = new T.Group(); bk.position.set(0, .365, .26); bk.rotation.x = .1; g.add(bk); a.cb = bk;   // спинка — от задних ножек, наклон назад
      [-.2, .2].forEach(x => { const p = mesh(chG.post, chWoodM); p.position.set(x, .32, 0); bk.add(p); });
      const pan = mesh(chG.pan, chLeatherM); pan.position.set(0, .38, -.005); bk.add(pan);
      const top = mesh(chG.rail, chWoodM); top.position.set(0, .625, 0); bk.add(top);
      const low = mesh(chG.low, chWoodM); low.position.set(0, .14, 0); bk.add(low);
      const nails = new T.InstancedMesh(nailG, nailM, NAILS.length); NAILS.forEach((q, i) => { _m.makeTranslation(q[0], q[1], q[2]); nails.setMatrixAt(i, _m); }); bk.add(nails); }
    // красная кнопка «готов голосовать»
    const bg = new T.Group(); bg.position.set(.2, TOP, -.46); bg.visible = false; g.add(bg);   // в рулетке кнопки нет
    const bbase = mesh(new T.CylinderGeometry(.052, .06, .02, 28), btnBaseM); bbase.position.y = .01; bg.add(bbase);
    const bring = new T.Mesh(new T.RingGeometry(.06, .078, 36), hazardM); bring.rotation.x = -Math.PI / 2; bring.position.y = .0012; bg.add(bring);
    const capM = std({ color: 0xc8201c, roughness: .32, metalness: .1, emissive: 0xff2a1a, emissiveIntensity: .2 });
    const cap = mesh(new T.CylinderGeometry(.038, .04, .022, 28), capM); cap.position.y = .031; bg.add(cap);
    const dome = mesh(new T.SphereGeometry(.038, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM); dome.scale.y = .32; dome.position.y = .042; bg.add(dome);
    const bglow = new T.Sprite(new T.SpriteMaterial({ map: glowDotT, color: 0xff3a2a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false })); bglow.scale.set(.24, .24, 1); bglow.position.y = .05; bg.add(bglow);
    Object.assign(a, { bCap: cap, bDome: dome, bCapM: capM, bGlow: bglow, bHit: [], bOn: false, bk: 0 });
    // тело
    const body = new T.Group(); g.add(body); a.body = body;
    const torso = mesh(new T.CapsuleGeometry(.16, .28, 6, 16), suitM); torso.scale.set(1.08, 1, .7); torso.position.set(0, .85, .05); torso.rotation.x = -.06; body.add(torso);
    const vest = mesh(new RB(.3, .26, .2, 2, .04), gearM); vest.position.set(0, .9, .02); vest.rotation.x = -.06; body.add(vest);
    const hips = mesh(new T.SphereGeometry(.15, 16, 12), suitM); hips.scale.set(1.05, .6, .85); hips.position.set(0, .56, .06); body.add(hips);
    for (const x of [-.095, .095]) {
      const k1 = V(x, .55, .04), k2 = V(x * 1.05, .55, -.36), k3 = V(x * 1.1, .08, -.4);
      const th1 = cyl(.068, suitM); setLimb(th1, k1, k2); body.add(th1);
      const sh = cyl(.055, suitM); setLimb(sh, k2, k3); body.add(sh);
      const kn = mesh(new T.SphereGeometry(.066, 12, 10), suitM); kn.position.copy(k2); body.add(kn);
      const ft = mesh(new RB(.1, .07, .22, 2, .02), gearM); ft.position.set(x * 1.1, .035, -.45); body.add(ft);
    }
    const neck = mesh(new T.CylinderGeometry(.05, .055, .1, 12), skinM); neck.position.set(0, 1.1, .02); body.add(neck);
    const hd = new T.Group(); hd.position.set(0, 1.13, .02); hd.rotation.order = 'YXZ'; body.add(hd); a.hd = hd;
    const head = mesh(new T.SphereGeometry(.112, 24, 18), skinM); head.scale.set(.92, 1.06, 1); head.position.y = .1; hd.add(head);
    const visor = mesh(new RB(.17, .052, .08, 2, .022), visorM); visor.position.set(0, .12, -.07); hd.add(visor);
    const band2 = mesh(new T.TorusGeometry(.118, .011, 6, 24, Math.PI), gearM); band2.position.y = .1; band2.rotation.z = 0; band2.rotation.y = Math.PI / 2; hd.add(band2);
    for (const x of [-.112, .112]) { const cup = mesh(new T.CylinderGeometry(.04, .04, .03, 16), gearM); cup.rotation.z = Math.PI / 2; cup.position.set(x, .09, 0); hd.add(cup); }
    a.headParts = [head, visor, band2, neck, torso, vest, hd];
    // руки: плечо → локоть → кисть (кисти держат карточку)
    a.sh = [V(-.2, 1.03, .03), V(.2, 1.03, .03)];
    a.arm = [0, 1].map(() => ({ up: cyl(.05, suitM), fo: cyl(.043, suitM), el: mesh(new T.SphereGeometry(.05, 10, 8), suitM), hand: mesh(new T.SphereGeometry(.043, 12, 10), skinM), shp: mesh(new T.SphereGeometry(.068, 12, 10), suitM) }));
    a.arm.forEach(r => { scene.add(r.up, r.fo, r.el, r.hand); body.add(r.shp); });
    a.arm[0].shp.position.copy(a.sh[0]); a.arm[1].shp.position.copy(a.sh[1]);
    // карточка: лицевая сторона смотрит на владельца, остальным видна рубашка
    const card = new T.Group(); scene.add(card); a.card = card;
    const cf = new T.Mesh(new T.PlaneGeometry(.095, .135), new T.MeshStandardMaterial({ map: blankT, roughness: .6 })); card.add(cf); a.cf = cf;
    const cb = new T.Mesh(new T.PlaneGeometry(.095, .135), new T.MeshStandardMaterial({ map: backT, roughness: .6 })); cb.rotation.y = Math.PI; card.add(cb);
    cf.castShadow = cb.castShadow = true;
    // ник над головой
    const tag = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthTest: false })); tag.scale.set(.46, .1725, 1); tag.position.set(0, 1.463, 0); tag.renderOrder = 10; tag.visible = false; g.add(tag); a.tag = tag;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: spkT, transparent: true, depthTest: false, opacity: 0 })); sp.scale.set(.1, .1, 1); sp.position.set(0, 1.64, 0); sp.renderOrder = 11; sp.visible = false; g.add(sp); a.sp = sp; a.spk = false;
    AV[s] = a;
  }

  // плашка над головой: звание + номер + ник в одну строку (владелец 21.11), статус под ней
  const setTag = (a, args) => { a.tagArgs = args; if (a.tag.material.map) a.tag.material.map.dispose(); a.tag.material.map = tex(paintTag(...args)); a.tag.material.needsUpdate = true; };

  /* состояние камеры и ввода */
  let btnActive = false, aimBtn = false, noTags = false;   // noTags — кадр без ников (K.dbg.world().tagsOff(true), только localhost — для картинок)
  const SPEC_Y = 2.45, SPEC_R = 1.05;   // камера выбывшего: высота и радиус облёта
  let specAt = Infinity, spec = 0, specF = 0, mySeat = 1, yaw = 0, pitch = -.38, readHold = false, locked = false, menuOn = true, clock = 0, userAt = 0, auto = null;
  let mouseN = null, aimN = 0, aimOn = false, mk = { mine: 0, kind: '', cands: null }, roundId = 0, cardKey = '', hideMine = false;
  const tw = [];
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  const tween = (dur, fn, delay = 0) => new Promise(res => tw.push({ t0: clock + delay, dur, fn, res }));
  const seatYaw = s => SEAT[s].yaw;

  /* персонажи CS2 (этап 5): assets/krot/<имя>.glb (~1 МБ: без анимаций, WebP, meshopt). Грузятся после показа стола, до тех пор — манекены.
     Все четыре — один скелет CS2 (рост ~2 м, лицом в +z). Посадка — поворотом костей каждый кадр: корпус чуть вперёд, ноги — IK
     бедро→колено→щиколотка под столом, руки — IK к нижним углам карточки (ладони за карточкой), голова — head_0/neck_0 по взгляду игрока;
     дыхание, при речи — кивок и жест правой рукой. Кто где сидит — случайно на каждую игру (у всех одинаково: от номера комнаты).
     У своего места голова сжата в ноль (вид от первого лица). */
  const CHARS = ['romanov', 'dragomir', 'fbi', 'prof'], MDL = [],
    TWIN = { from: 1, tint: [.5, .58, .72] },   // 5-е место: копия Драгомира в другой одежде (пока нет 5-го персонажа); красим только одежду
    MS = .84, HIP = V(0, .565, .035);
  let mdlOrder = SEATS.map(s => s - 1), mdlKey = null, mdlAlive = true;
  const _p = V(0, 0, 0), _p3 = V(0, 0, 0), _d1 = V(0, 0, 0), _d2 = V(0, 0, 0), _n = V(0, 0, 0), _mv = V(0, 0, 0), _sc = V(0, 0, 0), _ps = V(0, 0, 0);
  const _e1 = V(0, 0, 0), _e2 = V(0, 0, 0), _e3 = V(0, 0, 0), _e4 = V(0, 0, 0), _f1 = V(0, 0, 0), _f2 = V(0, 0, 0), _f3 = V(0, 0, 0), _t1 = V(0, 0, 0), _t2 = V(0, 0, 0), _t3 = V(0, 0, 0);
  const _qa = new T.Quaternion(), _qb = new T.Quaternion(), _qc = new T.Quaternion(), _qg = new T.Quaternion(), _qs = new T.Quaternion(), _qh = new T.Quaternion(), _qh2 = new T.Quaternion(), _qI = new T.Quaternion(), _m2 = new T.Matrix4(), _mi = new T.Matrix4(), _eg = new T.Euler(0, 0, 0, 'YXZ');
  const wp = (b, o) => o.setFromMatrixPosition(b.matrixWorld);
  const _hw = V(0, 0, 0), TAG_UP = .223;   // плашка ника — над головой (кость head_0 + столько вверх)
  const wq = (o, q) => { o.matrixWorld.decompose(_ps, q, _sc); return q; };
  const rotW = (b, q) => { wq(b.parent, _qa); _qb.copy(_qa).invert().multiply(q).multiply(_qa); b.quaternion.premultiply(_qb); b.updateMatrixWorld(true); };   // поворот кости в мировых осях
  const setW = (b, q) => { wq(b.parent, _qa); b.quaternion.copy(_qa.invert()).multiply(q); b.updateMatrixWorld(true); };                                       // задать кости мировой поворот
  const aim = (b, cur, tgt) => { wp(b, _p); _d1.subVectors(cur, _p).normalize(); _d2.subVectors(tgt, _p).normalize(); _qc.setFromUnitVectors(_d1, _d2); rotW(b, _qc); };
  const frameQ = (F, A, q) => { _f1.copy(F).normalize(); _f2.copy(A).addScaledVector(_f1, -A.dot(_f1)).normalize(); _f3.crossVectors(_f1, _f2); _m2.makeBasis(_f1, _f2, _f3); return q.setFromRotationMatrix(_m2); };
  // две кости к цели: b1 (плечо/бедро) → b2 (локоть/колено) → b3 (кисть/щиколотка); сгиб — в сторону pole; сустав крутим в свою плоскость
  const ik2 = (b1, b2, b3, tgt, pole, l1, l2) => {
    wp(b1, _p3); _n.subVectors(tgt, _p3); const d = clamp(_n.length(), Math.abs(l1 - l2) + .002, l1 + l2 - .002); _n.normalize();
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    _mv.copy(pole).addScaledVector(_n, -pole.dot(_n)).normalize();
    _e1.copy(_p3).addScaledVector(_n, x).addScaledVector(_mv, h); _e2.copy(_p3).addScaledVector(_n, d);
    aim(b1, wp(b2, _e3), _e1);
    wp(b2, _e3); wp(b3, _e4); _n.subVectors(_e1, _p3).normalize();
    _t1.subVectors(_e4, _e3); _t1.addScaledVector(_n, -_t1.dot(_n)); _t2.subVectors(_e2, _e1); _t2.addScaledVector(_n, -_t2.dot(_n));
    if (_t1.lengthSq() > 1e-8 && _t2.lengthSq() > 1e-8) { _qc.setFromUnitVectors(_t1.normalize(), _t2.normalize()); rotW(b1, _qc); }
    aim(b2, wp(b3, _e4), _e2);
  };
  const FING = ['index', 'middle', 'ring', 'pinky'];
  const setupModel = (gl, i) => {
    const root = new T.Group(), sc = gl.scene; sc.rotation.y = Math.PI; sc.scale.setScalar(MS); root.add(sc); root.visible = false;
    const B = {}; sc.traverse(o => { if (o.isBone) B[o.name] = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; const m = o.material; if (m.map) m.map.anisotropy = ANI; m.envMapIntensity = 1.6; } });
    root.updateMatrixWorld(true);
    const hipC = wp(B.leg_upper_l, V(0, 0, 0)).add(wp(B.leg_upper_r, V(0, 0, 0))).multiplyScalar(.5);
    const ankleY = wp(B.ankle_l, V(0, 0, 0)).y;   // щиколотка над полом стоя
    sc.position.sub(hipC).add(HIP); root.updateMatrixWorld(true);
    const len = (a, b) => wp(B[a], V(0, 0, 0)).distanceTo(wp(B[b], V(0, 0, 0)));
    const M = { i, root, B, bones: [], rest: [], head: B.head_0, rel: {}, hand: {}, L: {} };
    sc.traverse(o => { if (o.isBone) { M.bones.push(o); M.rest.push(o.quaternion.clone()); } });
    M.rel.neck = wq(B.neck_0, new T.Quaternion()); M.rel.head = wq(B.head_0, new T.Quaternion());
    for (const k of ['l', 'r']) {
      M.L['arm' + k] = [len('arm_upper_' + k, 'arm_lower_' + k), len('arm_lower_' + k, 'hand_' + k)];
      M.L['leg' + k] = [len('leg_upper_' + k, 'leg_lower_' + k), len('leg_lower_' + k, 'ankle_' + k), len('ankle_' + k, 'ball_' + k)];
      // рамка ладони (к среднему пальцу / от мизинца к указательному) относительно кости кисти — для поворота кисти по карточке
      const F0 = wp(B['finger_middle_0_' + k], V(0, 0, 0)).sub(wp(B['hand_' + k], V(0, 0, 0))), A0 = wp(B['finger_index_0_' + k], V(0, 0, 0)).sub(wp(B['finger_pinky_0_' + k], V(0, 0, 0)));
      M.hand[k] = wq(B['hand_' + k], new T.Quaternion()).invert().multiply(frameQ(F0, A0, new T.Quaternion())).invert();   // кисть = рамка · это
      M['fing' + k] = FING.map(f => [0, 1, 2].map(j => B['finger_' + f + '_' + j + '_' + k])).filter(ch => ch.every(Boolean));
      M['tip' + k] = M['fing' + k].map(ch => ch[2].position.clone().multiplyScalar(.8));   // кончик пальца: ось последней фаланги ≈ ось средней
      M['palm' + k] = len('hand_' + k, 'finger_middle_0_' + k);
    }
    M.ankleY = ankleY;
    return M;
  };
  // предметы комнаты (assets/rr/props.glb): Poly Haven (CC0) — ящики, бочка; владельца — канделябр на столе, снежный шар, напольные канделябры «Titanic»
  const flames = [], snow = { pts: null, v: null };
  const flameT = (() => { const c = cnv(64, 128), x = c.getContext('2d'), g = x.createRadialGradient(32, 84, 2, 32, 74, 46); g.addColorStop(0, 'rgba(255,248,220,1)'); g.addColorStop(.25, 'rgba(255,190,90,.85)'); g.addColorStop(.6, 'rgba(255,120,30,.25)'); g.addColorStop(1, 'rgba(255,90,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 128); return tex(c); })();
  const tlGlowM = new T.MeshBasicMaterial({ color: new T.Color(2.6, 1.9, 1.2) });
  function setupProps(P) {
    P.traverse(o => {
      if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
      const m = o.material; if (m.map) m.map.anisotropy = ANI;
      if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = .5; m.depthWrite = false; m.roughness = .06; m.envMapIntensity = 2; }   // стекло бутылок без дорогого прохода преломления
      if (/^(usd|rub)_/.test(m.name)) { m.color.multiplyScalar(.5); m.roughness = .9; m.envMapIntensity = .35; }   // бумага под лампой иначе пересвечена (ореол bloom)
      if (m.name === 'tlamp_glow') { o.material = tlGlowM; o.castShadow = false; return; }   // лампы-свечи канделябра светятся (ореол — bloom)
      if (m.name === 'globe_glass') { m.transparent = true; m.opacity = .09; m.depthWrite = false; m.roughness = .05; m.metalness = 0; m.envMapIntensity = .9; o.castShadow = false; }
    });
    const put = (n, x, y, z, ry = 0, sc = 1) => { const src = P.getObjectByName(n); if (!src) return null; const o = src.clone(true); o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(sc); scene.add(o); return o; };
    // ящики и бочки по углам
    put('crate2', 3.95, 0, -3.55, .18); put('crate1', 3.9, .464, -3.5, -.22); put('barrel', 3.85, 0, -2.45, .7);
    put('barrel', -3.95, 0, -3.85, 2.1); put('crate1', -4.05, 0, -2.85, 1.45);
    put('crate1', 3.75, 0, 3.85, -.4); put('barrel', -3.9, 0, 3.8, .3); put('crate2', -3.35, 0, 4.35, 1.52);   // сдвинут: у экрана за местом 1 стоит канделябр
    // напольные канделябры «Titanic» (владельца) под бра по бокам каждого экрана: лицом в комнату, 8 штук
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, nx = -Math.sin(a), nz = -Math.cos(a), tx = Math.cos(a), tz = -Math.sin(a); for (const u of [-2.5, 2.5]) put('tlamp', nx * 4.7 + tx * u, 0, nz * 4.7 + tz * u, a, 1.36); }   // 1,36 — высота 1,5 м (владелец 20.11: крупнее)
    // деньги на столе (владелец 20.11; пачки и купюры — его модели): у каждого места пачка ₽ или $ (иногда две) и веер купюр сбоку от места револьвера,
    // в середине — «банк»: пачки и разбросанные купюры. Раскладка одинакова у всех (свой генератор, без Math.random)
    { let h = 11; const r = () => { h = (h * 16807) % 2147483647; return h / 2147483647; };
      const felt = (x, z) => (x / 1.0) ** 2 + (z / .52) ** 2 < 1;   // с запасом внутри сукна
      const pile = (rub, x, z, ry) => { const n = rub ? 'cash_rub' : 'cash_usd'; put(n, x, TOP, z, ry); if (r() < .45) put(n, x + (r() - .5) * .012, TOP + .0132, z + (r() - .5) * .012, ry + (r() - .5) * .5); };
      const bill = (x, z, ry, i) => put(r() < .65 ? 'note_rub' : 'note_usd', x, TOP + .0004 + (i % 5) * .0005, z, ry);
      for (const s of SEATS) {
        const p = SEAT[s], fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw), side = s % 2 ? 1 : -1;
        const at = (d, l) => { let x = p.x + fx * d + rx * l, z = p.z + fz * d + rz * l; for (let i = 0; i < 10 && !felt(x, z); i++) { x *= .95; z *= .95; } return [x, z]; };
        const [sx, sz] = at(.8, side * .34); pile(r() < .6, sx, sz, p.yaw + Math.PI / 2 + (r() - .5) * .5);
        const n = 2 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) { const [x, z] = at(.7 + r() * .1, side * (.14 + i * .04)); bill(x, z, p.yaw + Math.PI / 2 + (r() - .5) * 1.2, i); }
      }
      pile(true, .1, .06, .4); pile(false, -.12, -.07, -.7);   // банк в середине
      for (let i = 0; i < 8; i++) { const a = r() * 6.28, d = .2 + r() * .13; bill(Math.cos(a) * d * 1.3, Math.sin(a) * d * .75, r() * 6.28, i); }
    }
    // канделябр с горящими свечами
    const cd = put('candelabra', CAND.x, TOP, CAND.z, CAND.ry);
    if (cd) {
      cd.updateMatrixWorld(true);
      for (let i = 0; i < 3; i++) { const e = cd.getObjectByName('flame_' + i); if (!e) continue; const sp = new T.Sprite(new T.SpriteMaterial({ map: flameT, color: 0xffd9a0, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); e.getWorldPosition(sp.position); sp.scale.set(.026, .052, 1); sp.renderOrder = 8; scene.add(sp); flames.push({ sp, k: Math.random() * 9 }); }
      candL.intensity = 1.6;
    }
    // снежный шар и снег внутри
    const gb = put('snowglobe', GLOBE.x, TOP, GLOBE.z, GLOBE.ry);
    if (gb) {
      const n = 90, pos = new Float32Array(n * 3), v = new Float32Array(n);
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * .1; pos[i * 3 + 1] = .05 + Math.random() * .06; pos[i * 3 + 2] = (Math.random() - .5) * .1; v[i] = .004 + Math.random() * .008; }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      snow.pts = new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: .0035, transparent: true, opacity: .9, depthWrite: false })); snow.v = v;
      snow.pts.position.set(GLOBE.x, TOP, GLOBE.z); scene.add(snow.pts);
    }
  }
  const ME_BACK = .1, ME_FWD = .08;   // своя модель на 10 см позади камеры (глаза модели = камера, воротник не в кадре); своё место вместе с камерой — на 8 см ближе к столу, чтобы руки лежали на бортике (видно только у себя)
  const mdlFor = s => MDL[mdlOrder[s - 1]] || null;
  const showAV = a => {   // видимость фигуры: модель, пока не загружена — манекен; у себя без головы
    const vis = !menuOn && a.on, man = vis && !a.M;
    a.body.visible = man; a.card.visible = false;   // рулетка: карточек нет
    a.arm.forEach(r => { r.up.visible = r.fo.visible = r.el.visible = r.hand.visible = man; r.shp.visible = man && !a.me; });
    a.headParts.forEach(o => { o.visible = !a.me; });
    if (a.M) { a.M.root.visible = vis; a.M.head.scale.setScalar(a.me ? 1e-4 : 1); a.M.root.position.z = a.me ? ME_BACK - ME_FWD : 0; }   // у себя модель сдвинута назад (ME_BACK): глаза модели = камера, воротник не лезет в кадр
    a.cb.visible = !(a.me && a.M);   // свою спинку стула не видно, а сдвинутая спина в неё заходит
  };
  const mdlApply = () => {
    for (const s of SEATS) {
      const a = AV[s], M = mdlFor(s);
      if (a.M !== M) { if (a.M) { a.M.root.visible = false; a.M.head.scale.setScalar(1); } a.M = M; if (M) { a.g.add(M.root); a.hd.position.set(0, 1.215, -.03); } else a.hd.position.set(0, 1.13, .02); }
      showAV(a);
    }
  };
  const mdlShuffle = key => {   // одинаковая у всех перестановка от номера комнаты
    let h = 2166136261; for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rnd2 = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
    const o = SEATS.map(s => s - 1); for (let i = NS - 1; i > 0; i--) { const j = Math.floor(rnd2() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    return o;
  };
  setTimeout(() => {
    if (!mdlAlive) return;
    Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js'), import('three/addons/utils/SkeletonUtils.js')]).then(([{ GLTFLoader }, { MeshoptDecoder }, SKU]) => {
      const ld = new GLTFLoader(); ld.setMeshoptDecoder(MeshoptDecoder);
      ld.load('assets/rr/props.glb?v=3', gl => {
        if (!mdlAlive) return;
        try { setupProps(gl.scene); } catch (e) { console.warn('RR props', e); }
      }, undefined, e => console.warn('RR props', e));
      ld.load('assets/rr/revolver.glb?v=1', gl => {
        if (!mdlAlive) return;
        try {
          const sc = gl.scene;
          sc.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const m = o.material; if (m.map) m.map.anisotropy = ANI; m.envMapIntensity = 1.5; } });
          const wrap = new T.Group(); wrap.add(sc);
          wrap.quaternion.setFromRotationMatrix(new T.Matrix4().set(0, 0, -1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));   // оси модели (x вниз, ствол в −z) → оси стола (x — ствол, y — верх, z — бок)
          wrap.updateMatrixWorld(true);
          const bb = new T.Box3().setFromObject(wrap), c = bb.getCenter(V(0, 0, 0)); wrap.position.sub(c);
          gun.g.children.forEach(o => { o.visible = false; });
          gun.g.add(wrap);
          const dr = sc.getObjectByName('drum'); if (dr) { gun.drum = dr; gun.axis = 'z'; }
          gun.hammer = sc.getObjectByName('hammer') || null;
          gun.half = (bb.max.z - bb.min.z) / 2; gun.muzzle = V(bb.max.x - c.x, .039, 0);   // ось ствола — на 3,9 см выше центра (замер 20.11)
        } catch (e) { console.warn('RR revolver', e); }
      }, undefined, e => console.warn('RR revolver', e));
      CHARS.forEach((n, i) => ld.load('assets/krot/' + n + '.glb?v=1', gl => {
        if (!mdlAlive) { gl.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { for (const k in o.material) { const v = o.material[k]; if (v && v.isTexture) v.dispose(); } o.material.dispose(); } }); return; }
        try {
          const twin = i === TWIN.from && NS > CHARS.length ? SKU.clone(gl.scene) : null;   // копию — до setupModel (он двигает кости)
          MDL[i] = setupModel(gl, i);
          if (twin) {
            const tc = new T.Color().setRGB(...TWIN.tint);
            twin.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); if (/body/i.test(o.material.name)) o.material.color.multiply(tc); } });
            MDL[CHARS.length] = setupModel({ scene: twin }, CHARS.length);
          }
          mdlApply();
        } catch (e) { console.warn('KROT model', n, e); }
      }, undefined, e => console.warn('KROT model', n, e)));
    }).catch(e => console.warn('KROT models', e));
  }, 400);

  // поза модели за кадр (после того как карточка встала на место)
  const poseModel = (a, t, dt) => {
    const M = a.M, B = M.B, g = a.g;
    // револьвер (этап 4): held — рука тянется к нему (0…1), lift — поднят к виску; пока тянется к столу — корпус наклоняется вперёд
    const fallGun = gun.fallSeat === a.s, held = gun.who === a.s && !fallGun ? gun.hw : 0, lift = held ? easeIO(gun.lw) : 0, lk = held ? easeIO(held) * (1 - lift) : 0;
    const fl = fallW(a), fs = fl ? fl.s : 0, ff = fl ? fl.f : 0;   // падение после боевого
    for (let i = 0; i < M.bones.length; i++) M.bones[i].quaternion.copy(M.rest[i]);
    M.root.updateMatrixWorld(true);
    wq(g, _qs);
    const ax = _t3.set(1, 0, 0).applyQuaternion(_qs);
    // корпус: чуть вперёд + дыхание (+ наклон к револьверу)
    const br = fl ? 0 : Math.sin(t * 1.6 + a.s * 1.3), ln = a.me ? 0 : lk * .28;   // у себя не наклоняемся: шея и воротник влезли бы в камеру (владелец 20.11)
    _qc.setFromAxisAngle(ax, -.05 - ln * .4 - ff * FALL.sp[0]); rotW(B.spine_0, _qc);
    _qc.setFromAxisAngle(ax, -.04 - ln * .35 - ff * FALL.sp[1]); rotW(B.spine_1, _qc);
    _qc.setFromAxisAngle(ax, -.03 - ln * .25 + br * .012 - ff * FALL.sp[2]); rotW(B.spine_2, _qc);
    if (fl) { _t1.set(0, 0, 1).applyQuaternion(_qs); _qc.setFromAxisAngle(_t1, ff * FALL.roll + fs * .04 * (1 - ff)); rotW(B.spine_1, _qc); }   // и чуть влево
    { const th = (a.me ? .3 : 0) + (a.me ? 0 : lk * .2); if (th && B.clavicle_r) { _t1.set(0, 1, 0).applyQuaternion(_qs); _qc.setFromAxisAngle(_t1, th); rotW(B.clavicle_r, _qc); _qc.setFromAxisAngle(_t1, -th); rotW(B.clavicle_l, _qc); } }   // плечи вперёд
    // ноги: щиколотки на полу перед стулом, колени под столом
    for (const [k, sd] of [['l', -1], ['r', 1]]) {
      const L = M.L['leg' + k];
      _t1.set(sd * .125, M.ankleY + .012, HIP.z - .47).applyMatrix4(g.matrixWorld);
      _t2.set(sd * .12, .45, -1).applyQuaternion(_qs);
      ik2(B['leg_upper_' + k], B['leg_lower_' + k], B['ankle_' + k], _t1, _t2, L[0], L[1]);
      _t2.set(sd * .1, -.4, -1).normalize().multiplyScalar(L[2]).applyQuaternion(_qs).add(wp(B['ankle_' + k], _e3));
      aim(B['ankle_' + k], wp(B['ball_' + k], _t3), _t2);
    }
    // голова по взгляду игрока (+ кивок при речи)
    a.gk += ((a.spk && !a.me ? 1 : 0) - a.gk) * (1 - Math.exp(-dt * 5));
    a.vw = (a.vw || 0) + ((voteSeat && voteSeat === a.seat && !fl ? 1 : 0) - (a.vw || 0)) * (1 - Math.exp(-dt * 4));   // голосование: рука вверх
    _eg.set(a.hp * .85 + a.gk * .06 * Math.sin(t * 7.3), a.hy * .9, 0); _qg.setFromEuler(_eg);
    if (fl) { _qc.setFromAxisAngle(_t1.set(0, 0, 1), .45 * fs * (1 - ff)); _qg.multiply(_qc).slerp(FALL.head, ff); }   // выстрелом голову откидывает влево, потом — левой щекой на стол
    _qh.copy(_qs).multiply(_qI.identity().slerp(_qg, .35 + .4 * ff)).multiply(M.rel.neck); setW(B.neck_0, _qh);   // упал — шея гнётся за головой
    _qh3.copy(_qs).multiply(_qg); _qh.copy(_qh3).multiply(M.rel.head); setW(B.head_0, _qh);
    (a.hq || (a.hq = new T.Quaternion())).copy(_qh3);   // поворот головы — для брызг при выстреле
    if (a.tag) { wp(B.head_0, _hw); a.tag.parent.worldToLocal(_hw); const ty = Math.max(1.2, _hw.y + TAG_UP); a.tag.position.set(_hw.x, ty, _hw.z); a.sp.position.set(_hw.x, ty + .177, _hw.z); }   // ник со званием закреплён за головой (владелец 21.11)
    if (fl && !a.stain && M.head.scale.x > .5) bloodStain(a, B, _qh3);   // пятно на виске
    if (fl && fl.t > FALL_HIT && !a.pool) bloodHit(a, wp(B.head_0, V(0, 0, 0)), _qh3);   // удар о стол: брызги, потёки, лужа, капли на пол
    // револьвер в руке: на столе → дугой к виску (от первого лица уходит за правый край кадра); рывки курка и выстрела — дуло вверх
    if (held) {
      _eg2.set(-Math.PI / 2, gun.tp.yaw, 0); _gq.setFromEuler(_eg2); _gp.set(gun.tp.x, TOP + gun.half, gun.tp.z);
      if (lift > 0) {
        if (a.me && spec < .35 && tvK < .05) { _gd.copy(FPD).applyQuaternion(_qs); _gu.set(0, 1, 0).applyQuaternion(_qs); _gt.set(FPM.x, EYE + FPM.y, -.02 - ME_FWD + FPM.z).applyMatrix4(g.matrixWorld); }   // свой вид: дуло у виска привязано к телу — видно, если повернуть голову вправо
        else { _gd.copy(TDIR).applyQuaternion(_qh3); _gu.set(0, 1, 0).applyQuaternion(_qh3); wp(B.head_0, _gt).add(_t1.copy(TEMPLE).applyQuaternion(_qh3)); }
        frameQ(_gd, _gu, _gtq); _gt.sub(_t1.copy(gun.muzzle).applyQuaternion(_gtq));   // центр револьвера = дуло − дуло в его осях
        _gp.lerp(_gt, lift); _gp.y += Math.sin(Math.PI * lift) * .1; _gq.slerp(_gtq, lift);   // дугой вверх — над бортиком
      }
      if (gun.kz || gun.kick) { _qc.setFromAxisAngle(_t1.set(0, 0, 1), gun.kz + gun.kick * .3 * lift); _gq.multiply(_qc); _gp.addScaledVector(_t1.set(-1, 0, 0).applyQuaternion(_gq), gun.kick * .02 * lift); }
      _gw.copy(GRIP_W).applyQuaternion(_gq).add(_gp);   // где запястье
      _t1.copy(GRIP_F).applyQuaternion(_gq); _t2.copy(GRIP_A).applyQuaternion(_gq); frameQ(_t1, _t2, _gfq);
    }
    // руки (владелец 20.11): просто лежат на бортике ладонями вниз; правая берёт револьвер в свой ход; при речи правая рука жестикулирует
    if (!a.rest || a.rest.me !== a.me) a.rest = { me: a.me, l: handRest(a, -1), r: handRest(a, 1) };
    for (const [k, sd] of [['l', -1], ['r', 1]]) {
      const L = M.L['arm' + k], hk = k === 'r' && held ? easeIO(held) : 0;
      _t1.set(-sd * .22, .1, -1).applyQuaternion(_qs);                // к пальцам: вперёд и чуть внутрь
      _t2.set(-sd, 0, 0).applyQuaternion(_qs);                         // от мизинца к большому — к середине
      frameQ(_t1, _t2, _qh);
      _e4.copy(a.rest[k]);
      const gk = k === 'r' && !held ? a.gk : 0;
      if (gk > .01) {
        _t1.set(-.25, .28 + .14 * Math.sin(t * 4.3 + a.s), -1).applyQuaternion(_qs); _t2.set(1, 0, 0).applyQuaternion(_qs);
        frameQ(_t1, _t2, _qc);
        _t3.set(.17 + .025 * Math.sin(t * 3.1), .93 + .035 * Math.sin(t * 4.3 + a.s), -.27 + .03 * Math.sin(t * 2.2)).applyMatrix4(g.matrixWorld);
        _e4.lerp(_t3, gk); _qh.slerp(_qc, gk);
      }
      { const ch = CH[a.seat];   // ставка: обе руки за стопкой фишек и двигают её к центру (владелец 21.11)
        if (ch && ch.hw > .01 && !hk) { _t3.set(sd * .055, 0, .05).applyQuaternion(_qs).add(ch.hp); _t3.y = TOP + .034; _e4.lerp(_t3, ch.hw); } }
      if (k === 'l' && a.vw > .01) {   // голосование (владелец 21.11): левая рука вверх, ладонью вперёд, локоть полусогнут
        _t3.set(-.21, 1.4, -.13).applyMatrix4(g.matrixWorld); _t1.set(0, 1, -.12).applyQuaternion(_qs); _t2.set(1, 0, 0).applyQuaternion(_qs); frameQ(_t1, _t2, _qc);
        _e4.lerp(_t3, a.vw); _qh.slerp(_qc, a.vw);
      }
      if (hk) { _e4.lerp(_gw, hk); if (!lift) _e4.y += Math.sin(Math.PI * hk) * .05; _qh.slerp(_gfq, hk); }   // тянется к рукояти дугой
      if (fl || (k === 'r' && fallGun)) {
        const r = k === 'r', gIn = r && fallGun;
        if (r && a.relP) { _e4.copy(a.relP); _qh.copy(a.relQ); }   // до падения рука там, где была при выстреле (у себя — пока камера не ушла вверх)
        if (fl) {
          _t1.set(r ? -.35 : .2, -.04, -1).applyQuaternion(_qs); _t2.set(-sd, 0, r ? .3 : 0).applyQuaternion(_qs); frameQ(_t1, _t2, _qc);   // ладонью вниз
          _t2.set(r ? .24 : -.26, 0, r ? -.64 : -.5).applyMatrix4(g.matrixWorld); _t2.y = Math.max(surfY(_t2.x, _t2.z), TOP) + (gIn ? gun.half + .025 : .026);
          _e4.lerp(_t2, ff); _qh.slerp(_qc, ff);
        }
      }
      _t3.set(sd * .75, -1, .35).applyQuaternion(_qs);                 // локти — вниз и в стороны
      if (hk && lift) _t3.lerp(_t1.set(1, -.3, .2).applyQuaternion(_qs), lift);   // у виска локоть — в сторону
      if (k === 'l' && a.vw > .01) _t3.lerp(_t1.set(-1, -.15, .4).applyQuaternion(_qs), a.vw);   // рука вверх — локоть в сторону
      if (ff) _t3.lerp(_t1.set(sd, .5, .3).applyQuaternion(_qs), ff);   // упал — локти в стороны и вверх, не в бортик
      ik2(B['arm_upper_' + k], B['arm_lower_' + k], B['hand_' + k], _e4, _t3, L[0], L[1]);
      if (k === 'r' && fallGun) {   // убит с револьвером: он в ладони, пока рука не легла на стол, потом выпадает
        _gtq.copy(_qh).multiply(GRIP_QI);
      }
      setW(B['hand_' + k], _qh.multiply(M.hand[k]));
      if (k === 'r' && fallGun) {
        gun.g.quaternion.copy(_gtq); gun.g.position.copy(wp(B.hand_r, _t1)).sub(_t2.copy(GRIP_W).applyQuaternion(_gtq));
        if (fl && fl.t > FALL_HIT + .05) releaseGun();   // ударился о стол — пальцы разжались
      }
      if (hk > .6) {   // револьвер в руке: идёт за кистью; если рука не дотянулась — в конце дотягивания сам скользит в ладонь
        const wA = lift > 0 ? 1 : easeIO((hk - .6) / .4);
        wp(B.hand_r, _t1).sub(_gw); _gp.addScaledVector(_t1, wA);
        gun.g.position.copy(_gp); gun.g.quaternion.copy(_gq);
      }
      // пальцы: в исходной позе модели согнуты — на бортике каждую фалангу, что ушла бы в стол, кладём на его поверхность; рука с револьвером — согнуты вокруг рукояти
      if (!hk && !(k === 'r' && fallGun) && gk < .5) M['fing' + k].forEach((ch, fi) => {
        for (let j = 0; j < 3; j++) {
          if (j < 2) wp(ch[j + 1], _t1); else _t1.copy(M['tip' + k][fi]).applyMatrix4(ch[2].matrixWorld);
          const y = railH(_t1.x, _t1.z) + .009; if (_t1.y >= y) continue;
          _t2.copy(_t1); _t2.y = y; aim(ch[j], _t1, _t2);
        }
      });
    }
  };

  W.menu = on => { menuOn = on; for (const s in AV) { showAV(AV[s]); AV[s].tag.visible = !on && !AV[s].me && !noTags; } };
  W.tagsOff = on => { noTags = !!on; for (const s in AV) AV[s].tag.visible = !menuOn && !AV[s].me && !noTags; };
  W.setLock = on => { locked = on; };
  W.setRead = on => { readHold = on; };
  W.look = (dx, dy) => { if (menuOn) return; yaw = clamp(yaw - dx * .0023, -1.5, 1.5); pitch = clamp(pitch - dy * .0023, -1.15, .5); userAt = clock; auto = null; };
  W.mouse = (x, y) => { mouseN = x == null ? null : [x, y]; };
  W.aim = () => aimN;
  W.aimBtn = () => aimBtn;
  W.headAngles = () => menuOn ? null : { y: yaw, p: pitch };
  W.hideCard = on => { hideMine = on; cardKey = ''; if (S) W.sync(S); };
  W.head = (s, y, p) => { const a = AV[s]; if (!a || a.me) return; a.ty = clamp(+y || 0, -1.3, 1.3); a.tp = clamp(+p || 0, -1, .45); };
  W.marks = m => { mk = m; };
  W.speak = (s, on) => { const a = AV[s]; if (a) a.spk = !!on; };

  // снимок сервера → кто за столом, что на контейнерах, что на моей карточке
  // снимок сервера → кто за столом, кто ходит, кто выбыл; револьвер — перед тем, чей ход
  W.sync = d => {
    mySeat = d.me.seat || 1;
    if (d.room && d.room.id != null && d.room.id !== mdlKey) { mdlKey = d.room.id; mdlOrder = mdlShuffle(mdlKey); mdlApply(); }
    const g = d.game, ph = d.room.phase;
    for (const s of SEATS) {
      const a = AV[s], p = d.players.find(x => x.seat === s);
      a.seat = s; a.on = !!p; a.me = !!(p && p.me); a.bOn = false;
      a.dead = !!(p && p.alive === false && ph !== 'lobby');
      if (!a.dead) { a.vDead = false; if (a.fallAt != null || a.fallPend || a.pool) fallReset(a); }
      else if (!a.vDead && (gun.who !== s || clock >= (gun.holdUntil || 0))) { a.vDead = true; if (a.me) a.fallPend = true; else if (a.fallAt == null) a.fallAt = clock - 5; }   // у стреляющего «выбыл» приходит раньше выстрела — голову опускаем после выстрела (W.event)
      showAV(a);
      a.tag.visible = !menuOn && !a.me && !noTags;
      const st2 = !p ? 'free' : ph === 'lobby' ? (p.online ? (p.ready ? 'ready' : 'wait') : 'off') : p.left ? 'left' : a.dead ? 'dead' : ph === 'done' && p.place === 1 ? 'win' : g && ph === 'play' && g.turn === s ? 'turn' : !p.online ? 'off' : '';
      const rn = p ? rrRank(p) : 0, rim = rn ? rankImg(rn, () => { if (a.tagArgs) setTag(a, a.tagArgs); }) : null;
      const key = (p ? p.name + (p.bot ? '·b' : '') : '') + '|' + st2 + '|' + rn + (rim ? 'i' : '');
      if (key !== a.tagKey) { a.tagKey = key; setTag(a, [s, p ? p.name + (p.bot ? ' · БОТ' : '') : '', st2, rn]); }
    }
    btnActive = false;
    gun.play = ph === 'play';
    W.chipSync(d.players, !!(g && ph === 'next' && !g.round), !!d.room.money);   // фишки ставок
    W.vote(g && g.vote && ph === 'play' ? g.vote.by : 0);                       // кто поднял руку
    { const gid = g ? g.id : null; if (gid !== bloodGid) { bloodGid = gid; bloodClear(); } }   // новая игра — крови нет   // револьвер берут в руки только во время хода
    gunTo(g && ['play', 'next'].includes(ph) ? g.turn || 0 : 0);
  };
  // револьвер лежит на сукне у правой руки того, чей ход: стволом вперёд-влево, рукоятью к руке — чтобы взять его правой рукой (этап 4); seat 0 — посреди стола
  function gunSpot(seat) {
    if (!seat) return { x: 0, z: 0, yaw: .55 };
    const p = SEAT[seat], f = SEAT_OFF + .15 + .09 + .05, r = .1;   // от стула: бортик, дерево и 5 см по сукну, на 10 см правее
    return { x: p.x - Math.sin(p.yaw) * f + Math.cos(p.yaw) * r, z: p.z - Math.cos(p.yaw) * f - Math.sin(p.yaw) * r, yaw: p.yaw + Math.PI / 2 + .35 };
  }
  W.specGo = s => { specAt = clock + s; };   // свой выстрел показан — через s с камера улетает в наблюдатели
  W.hold = ms => { gun.holdUntil = clock + ms / 1000; };   // пока звучит выстрел — револьвер у виска и не уезжает к следующему
  function gunTo(seat) {
    if (gun.roul) return;   // жребий: после него револьвер сам поедет к первому
    if (gun.seat === seat) { gun.pend = null; return; }
    if (clock < (gun.holdUntil || 0) || gun.who || gun.fly) { gun.pend = seat; return; }   // сначала кладёт на стол (gunStep), потом едет
    gun.seat = seat;
    const to = gunSpot(seat), tp = gun.tp;
    let y1 = to.yaw; while (y1 - tp.yaw > Math.PI) y1 -= Math.PI * 2; while (y1 - tp.yaw < -Math.PI) y1 += Math.PI * 2;
    if (!menuOn && Math.hypot(to.x - tp.x, to.z - tp.z) > .05) rrSound('slide');   // револьвер едет по столу (звук подогнан под 0,85 с)
    gun.sl = { x0: tp.x, z0: tp.z, y0: tp.yaw, x1: to.x, z1: to.z, y1, k: 0 };   // владелец 20.11: скользит по сукну, без подлёта (ход — в gunStep)
  }
  // ---------- владелец 21.11: жребий револьвером, барабан по делениям, фишки ставок, рука вверх ----------
  W.roul = seat => {   // ствол — на место seat (из центра стола)
    const p = SEAT[seat]; if (!p) return;
    _eg2.set(-Math.PI / 2, 0, 0); _gq.setFromEuler(_eg2); const d = gun.muzzle.clone().applyQuaternion(_gq);
    gun.roul = { seat, want: Math.atan2(-p.z, p.x) - Math.atan2(-d.z, d.x), go: false };
    gun.seat = 0; gun.pend = null; gun.sl = null;   // уже ехал к следующему — стоп: сразу в центр (владелец 21.11)
  };
  W.roulDir = (dx, dz, then) => {   // финал: крутится в центре и останавливается стволом в сторону (dx, dz); потом then()
    _eg2.set(-Math.PI / 2, 0, 0); _gq.setFromEuler(_eg2); const d = gun.muzzle.clone().applyQuaternion(_gq);
    gun.roul = { seat: 0, want: Math.atan2(-dz, dx) - Math.atan2(-d.z, d.x), go: false, then };
    gun.seat = 0; gun.pend = null; gun.sl = null;
  };
  const DR = { tgt: null, v: 0, hold: false, idx: null, sndUntil: 0 }, DSTEP = Math.PI / 3;
  W.drum = m => {   // 'tap' — на одно деление, 'hold' — крутится, 'up' — отпустили: тормозит до деления
    const dr = gun.drum; if (!dr) return;
    if (gun.who !== mySeat || gun.lw < 1) gun.rush = true;   // револьвер ещё не у виска — догоняем
    if (m === 'tap') DR.tgt = (DR.tgt != null ? DR.tgt : Math.round(dr.rotation[gun.axis] / DSTEP) * DSTEP) + DSTEP;
    else if (m === 'hold') DR.hold = true;
    else if (m === 'up') DR.hold = false;
  };
  function drumStep(dt) {   // звук: щелчок на каждое пройденное деление — сколько бы барабан ни крутился (владелец 21.11)
    const dr = gun.drum; if (!dr) return; const ax = gun.axis;
    const live = DR.hold || DR.v > 0 || DR.tgt != null || clock < DR.sndUntil;
    if (DR.hold) { DR.v = Math.min(18, DR.v + dt * 34); dr.rotation[ax] += DR.v * dt; DR.tgt = null; }
    else if (DR.v > 0) { DR.v = Math.max(0, DR.v - dt * 26); dr.rotation[ax] += DR.v * dt; if (!DR.v) DR.tgt = Math.ceil(dr.rotation[ax] / DSTEP - 1e-3) * DSTEP; }
    else if (DR.tgt != null) { const d = DR.tgt - dr.rotation[ax]; if (Math.abs(d) < .002) { dr.rotation[ax] = DR.tgt; DR.tgt = null; } else dr.rotation[ax] += d * Math.min(1, dt * 20); }
    const idx = Math.floor(dr.rotation[ax] / DSTEP + .5);
    if (DR.idx == null || !live) { DR.idx = idx; return; }
    if (idx !== DR.idx) {
      const n = Math.abs(idx - DR.idx), m = Math.min(n, 3), fast = n / Math.max(dt, 1e-3) > 8; DR.idx = idx;
      if (!menuOn) for (let i = 0; i < m; i++) drumClick(i * dt / m, fast);   // медленный кадр — щелчки разносим по времени
    }
  }
  // фишки: стопка перед игроком; поставил — руки двигают её к центру (стопка доезжает сама, руки — не до конца)
  const CHIP_C = { 1000: 0xd9ab3c, 500: 0x3b6fd6, 100: 0xc7323b, 50: 0x2f9e5a }, chipGeo = new T.CylinderGeometry(.02, .02, .0045, 28), chipMs = {}, CH = {};
  const chipMat = c => chipMs[c] || (chipMs[c] = new T.MeshStandardMaterial({ color: c, roughness: .42, metalness: .08 }));
  const chipSpot = (seat, k) => { const p = SEAT[seat], f = SEAT_OFF + .15 + .09 + .1 + k * .24, r = -.07 * (1 - k); return { x: p.x - Math.sin(p.yaw) * f + Math.cos(p.yaw) * r, z: p.z - Math.cos(p.yaw) * f - Math.sin(p.yaw) * r }; };
  function chipBuild(c, bet) {   // 1000 / 500 / 100 / 50, до 10 в стопке, стопки рядом
    while (c.g.children.length) c.g.remove(c.g.children[0]);
    let v = bet; const list = []; for (const dn of [1000, 500, 100, 50]) while (v >= dn && list.length < 30) { list.push(dn); v -= dn; }
    list.forEach((dn, i) => { const m = new T.Mesh(chipGeo, chipMat(CHIP_C[dn])), st = Math.floor(i / 10); m.position.set([0, .044, -.044][st], (i % 10) * .0047 + .0024, st ? .012 : 0); m.castShadow = true; m.receiveShadow = true; c.g.add(m); });
  }
  W.chips = (seat, bet, push, delay) => {
    let c = CH[seat];
    if (!bet) { if (c) { scene.remove(c.g); delete CH[seat]; } return; }
    if (!c) { c = CH[seat] = { g: new T.Group(), bet: 0, k: 0, push: null, hw: 0, hp: V(0, 0, 0), delay: delay || 0 }; scene.add(c.g); }
    if (c.bet !== bet) { c.bet = bet; chipBuild(c, bet); }
    if (push) { c.k = 0; c.push = { t: 0 }; } else if (!c.push) c.k = 1;
  };
  W.chipSync = (pl, intro, on) => {
    for (const s of SEATS) {
      const p = on && pl.find(x => x.seat === s), b = p && p.bet, c = CH[s];
      if (!b) { if (c) W.chips(s, null); continue; }
      if (!c) W.chips(s, b, intro, intro ? Math.random() * 1.6 : 0);
      else if (c.bet !== b) W.chips(s, b, intro);
    }
  };
  function chipStep(dt) {
    for (const k in CH) {
      const c = CH[k], s = +k;
      if (c.delay > 0) { c.delay -= dt; c.g.visible = false; continue; }
      c.g.visible = !menuOn;
      if (c.fin) { const f = c.fin; f.t += dt; const e = easeIO(clamp(f.t / 1.4, 0, 1)); c.g.position.set(f.x0 + (f.x1 - f.x0) * e, TOP, f.z0 + (f.z1 - f.z0) * e); continue; }   // финал: к победителю
      if (c.push) {
        const t0 = c.push.t, t = (c.push.t += dt), a = AV[s];
        if (t0 < .45 && t >= .45 && !menuOn) rrSound('chip');   // ставка: руки двинули фишки — звук фишек (владелец 21.11)
        const ok = !!(a && a.on && a.M && !a.vDead && gun.who !== s);
        c.hw = ok ? (t < .45 ? easeIO(t / .45) : t < 1.15 ? 1 : Math.max(0, 1 - easeIO((t - 1.15) / .45))) : 0;
        c.k = t < .45 ? 0 : Math.min(1, easeIO((t - .45) / .75));
        const h = chipSpot(s, Math.min(c.k, .5)); c.hp.set(h.x, TOP, h.z);
        if (t > 1.6) { c.push = null; c.hw = 0; }
      }
      const o = chipSpot(s, c.k); c.g.position.set(o.x, TOP, o.z); c.g.rotation.y = SEAT[s].yaw;
    }
  }
  let voteSeat = 0;
  W.vote = s => { voteSeat = s || 0; };
  // револьвер в руке (этап 4, владелец 20.11): ходящий правой рукой берёт его со стола и подносит к виску; после щелчка кладёт обратно, и он едет к следующему.
  // Кисть на рукояти — в осях револьвера (x — ствол, y — верх, z — правый бок): к пальцам поперёк рукояти, от мизинца к указательному вверх по рукояти, запястье за рукоятью
  const GRIP_F = V(.94, -.35, 0), GRIP_A = V(.35, .94, 0), GRIP_W = V(-.153, -.002, .025);
  const TEMPLE = V(.088, .035, -.035), TDIR = V(-1, -.05, .3).normalize();
  const FPM = V(.17, -.04, -.11), FPD = V(-.85, .05, .5).normalize();   // от первого лица (в осях места, от глаз; владелец 20.11): дуло справа у виска, смотрит в голову — прямо не видно, повернёшь голову вправо — видно; кисть и револьвер за ним   // дуло у правого виска (в осях головы: вправо, вверх, −z вперёд), ствол — в голову, рукоять чуть впереди
  const _eg2 = new T.Euler(0, 0, 0, 'YXZ'), _gp = V(0, 0, 0), _gq = new T.Quaternion(), _gt = V(0, 0, 0), _gtq = new T.Quaternion(), _gu = V(0, 0, 0), _gd = V(0, 0, 0), _gw = V(0, 0, 0), _gfq = new T.Quaternion(), _qh3 = new T.Quaternion();
  const gunStep = dt => {
    const sp = gun.rush ? 4 : 1;
    drumStep(dt); chipStep(dt);   // нажали «Выстрел»/«Крутить», а револьвер ещё не у виска — всё быстрее
    if (gun.sl) { const s = gun.sl; s.k = Math.min(1, s.k + dt / .85 * sp); const e = easeIO(s.k); gun.tp.x = s.x0 + (s.x1 - s.x0) * e; gun.tp.z = s.z0 + (s.z1 - s.z0) * e; gun.tp.yaw = s.y0 + (s.y1 - s.y0) * e; if (s.k >= 1) gun.sl = null; }
    if (gun.roul) {   // жребий: в центр стола → крутится как рулетка → ствол на первого → едет к нему
      const R = gun.roul;
      if (!R.go) {
        if (!gun.who && !gun.fly && !gun.fallSeat && clock >= (gun.holdUntil || 0) && !gun.sl) {
          if (Math.hypot(gun.tp.x, gun.tp.z) > .03) { if (!menuOn) rrSound('slide'); gun.sl = { x0: gun.tp.x, z0: gun.tp.z, y0: gun.tp.yaw, x1: 0, z1: 0, y1: gun.tp.yaw, k: 0 }; }
          else { R.go = true; R.k = 0; R.y0 = gun.tp.yaw; let y1 = R.want; while (y1 < R.y0 + Math.PI * 6) y1 += Math.PI * 2; R.y1 = y1; }   // владелец 21.11: вращение — без звука
        }
      } else if (R.k < 1) { R.k = Math.min(1, R.k + dt / 2.6); gun.tp.yaw = R.y0 + (R.y1 - R.y0) * (1 - Math.pow(1 - R.k, 3)); }
      else if ((R.w = (R.w || 0) + dt) > (R.then ? .25 : .6)) { gun.roul = null; if (R.then) R.then(); else gunTo(R.seat); }
    }
    let want = 0;
    if (gun.fallSeat) { if (clock - gun.fallT > 6) releaseGun(); want = gun.who; }   // убит с револьвером в руке: рука падает на стол (poseModel), там отпустит; страховка — 6 с
    else if (!menuOn && gun.play && gun.seat && gun.pend == null && !gun.sl) { const a = AV[gun.seat]; if (a && a.on && a.M && !a.vDead) want = gun.seat; }
    if (clock < (gun.holdUntil || 0) && gun.who) want = gun.who;   // щелчок/выстрел ещё звучит — держит у виска
    if (gun.who && gun.who !== want) {   // опускает на стол и отпускает
      if (gun.lw > 0) gun.lw = Math.max(0, gun.lw - dt / .6 * sp * (gun.drop ? 1.6 : 1));
      else { gun.hw = Math.max(0, gun.hw - dt / .35 * sp); if (!gun.hw) { gun.who = 0; gun.drop = false; } }
    } else if (want) {                   // тянется, берёт, подносит к виску
      gun.who = want;
      if (gun.hw < 1) gun.hw = Math.min(1, gun.hw + dt / .45 * sp); else gun.lw = Math.min(1, gun.lw + dt / .8 * sp);
    }
    if (gun.rush && ((gun.who && gun.who === want && gun.lw >= 1) || (!want && !gun.who && !gun.sl && gun.pend == null))) gun.rush = false;
    if (gun.pend != null && !gun.roul && !gun.who && !gun.fly && clock >= (gun.holdUntil || 0)) { const ps = gun.pend; gun.pend = null; gunTo(ps); }
    if (gun.fly) {   // выпал из руки — ложится на сукно
      const fl = gun.fly; fl.k = Math.min(1, fl.k + dt / .3); _eg2.set(-Math.PI / 2, fl.yaw, 0); _gq.setFromEuler(_eg2);
      gun.g.quaternion.copy(fl.q0).slerp(_gq, easeIO(fl.k)); gun.g.position.set(fl.p0.x + (fl.x - fl.p0.x) * fl.k, fl.p0.y + (TOP + gun.half - fl.p0.y) * fl.k * fl.k, fl.p0.z + (fl.z - fl.p0.z) * fl.k);
      if (fl.k >= 1) gun.fly = null;
      return;
    }
    // на столе (пока рука не подняла — модель в poseModel перепишет)
    _eg2.set(-Math.PI / 2, gun.tp.yaw, gun.kz); gun.g.quaternion.setFromEuler(_eg2);
    gun.g.position.set(gun.tp.x, TOP + gun.half + gun.hop, gun.tp.z);
  };
  // где лежат кисти (запястье): на бортике, ближе к верху; свои — чуть дальше, чтобы в кадре были выше (владелец 20.11: «руки повыше»)
  const railH = (x, z) => { const r = Math.hypot(x / TA, z / TB) || 1e-6, d = Math.hypot(x, z) * (1 / r - 1); if (d < 0) return -1; if (d > RAIL) return TOP; const u = (d - RAIL / 2) / (RAIL / 2); return TOP + .03 + RAIL / 2 * .62 * Math.sqrt(Math.max(0, 1 - u * u)); };   // высота стола над точкой: кожаный бортик (труба), дальше дерево и сукно
  const handRest = (a, sd) => {
    const want = a.me ? .08 : .04, o = V(0, 0, 0); let f = .25;   // want — запястье от внешнего края бортика (м)
    for (; f < .6; f += .004) { o.set(sd * .16, 0, -f).applyMatrix4(a.g.matrixWorld); const r = Math.hypot(o.x / TA, o.z / TB), d = Math.hypot(o.x, o.z) * (1 / r - 1); if (d >= want) break; }
    o.y = Math.max(railH(o.x, o.z), TOP + .03) + .026; return o;
  };
  // ===== падение и кровь после боевого (этап 4, часть 2; владелец 20.11: «головой на стол», «брызги + лужа», свой вид — как было) =====
  // падение (владелец 20.11: «резко — после выстрела сразу упал на стол»): s — голову откидывает выстрелом (0,06 с); f — корпус рушится на стол (с 0,04 с, с ускорением, удар ~0,36 с, короткий отскок)
  const FALL_HIT = .36;
  const fallW = a => {
    if (a.fallAt == null) return null;
    const t = clock - a.fallAt, k = clamp((t - .04) / (FALL_HIT - .04), 0, 1);
    let f = k * k * k; if (t > FALL_HIT) f = 1 - .05 * Math.sin(Math.PI * clamp((t - FALL_HIT) / .18, 0, 1));
    return { s: easeIO(clamp(t / .06, 0, 1)), f, t };
  };
  const FALL = { sp: [.42, .36, .35], roll: .14, head: null };   // наклон позвонков вперёд (рад), завал влево; голова — левой щекой на стол, правым виском вверх
  FALL.head = frameQ(V(-.25, 1, .15), V(.15, .45, -1), new T.Quaternion());   // в осях места: правая сторона головы — вверх, макушка — вперёд по столу
  const GRIP_QI = frameQ(GRIP_F, GRIP_A, new T.Quaternion()).invert();       // кисть → револьвер
  const releaseGun = () => {   // рука на столе разжалась: револьвер ложится на сукно рядом (0,3 с), дальше едет к следующему как обычно
    const o = gun.g, p = o.position, D = V(1, 0, 0).applyQuaternion(o.quaternion);
    let x = p.x + D.x * .03, z = p.z + D.z * .03;
    for (let i = 0; i < 30 && railH(x, z) !== TOP; i++) { x *= .96; z *= .96; }   // не на бортике — ближе к середине
    const yaw = Math.atan2(-D.z, D.x) + (Math.random() - .5) * .6;
    gun.fly = { p0: p.clone(), q0: o.quaternion.clone(), x, z, yaw, k: 0 };
    gun.tp.x = x; gun.tp.z = z; gun.tp.yaw = yaw; gun.who = 0; gun.hw = gun.lw = 0; gun.fallSeat = 0;
  };
  // кровь (владелец 20.11: «больше, и текстуру как настоящую»; фото CC0 нет — рисуем в коде): форма — метаболы (сливающиеся капли с рваным краем),
  // толстая середина темнее, тонкий край светлее и с тёмным ободком, хвосты брызг по направлению полёта; карта рельефа — мокрый блеск под лампами
  const bloodPaint = (cells, draw, cs = 256) => {   // cells×cells клеток по cs px (каждая — свой вариант пятна), draw(add, i) рисует вариант i в координатах 0…256
    const S = cs * cells, F = new Float32Array(S * S), sc = cs / 256;
    for (let i = 0; i < cells * cells; i++) {
      const ox = (i % cells) * cs, oy = Math.floor(i / cells) * cs;
      const add = (cx, cy, r, sx = 1, ang = 0, k = 1) => {   // капля-метабол (вытянута в sx раз вдоль ang)
        cx *= sc; cy *= sc; r *= sc;
        const ca = Math.cos(ang), sa = Math.sin(ang), R = r * Math.max(1, sx) * 1.7;
        const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(cs - 1, Math.ceil(cx + R)), y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(cs - 1, Math.ceil(cy + R));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x - cx, dy = y - cy, u = (dx * ca + dy * sa) / (r * sx), v = (-dx * sa + dy * ca) / r, d2 = (u * u + v * v) / 2.6;
          if (d2 < 1) { const q = 1 - d2; F[(oy + y) * S + ox + x] += k * q * q; }
        }
      };
      draw(add, i);
    }
    const c = cnv(S, S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data, nc = cnv(S, S), nx = nc.getContext('2d'), nimg = nx.createImageData(S, S), nd = nimg.data;
    const TH = .5, hgt = j => { const f = F[j] - TH; return f > 0 ? Math.sqrt(f) : 0; };
    for (let y = 0; y < S; y++) for (let x0 = 0; x0 < S; x0++) {
      const j = y * S + x0, f = F[j], a = clamp((f - TH + .045) / .09, 0, 1), t = clamp((f - TH) / 1.1, 0, 1), rim = Math.exp(-Math.pow((f - TH) / .07, 2)) * .45, nz = .92 + Math.random() * .08;
      const r = (98 - 60 * Math.pow(t, .5)) * (1 - rim) * nz, gg = (6 - 4.5 * t) * (1 - rim), b = (9 - 6 * t) * (1 - rim);   // тонкий край — тёмно-красный, толстая середина — почти бордово-чёрная
      d[j * 4] = r; d[j * 4 + 1] = gg; d[j * 4 + 2] = b; d[j * 4 + 3] = 255 * a * (.82 + .18 * Math.min(1, t * 4));
      const hx = hgt(y * S + Math.min(S - 1, x0 + 1)) - hgt(y * S + Math.max(0, x0 - 1)), hy = hgt(Math.min(S - 1, y + 1) * S + x0) - hgt(Math.max(0, y - 1) * S + x0), L = Math.hypot(hx * 3, hy * 3, 1);
      nd[j * 4] = 128 - 127 * hx * 3 / L; nd[j * 4 + 1] = 128 + 127 * hy * 3 / L; nd[j * 4 + 2] = 255 / L; nd[j * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0); nx.putImageData(nimg, 0, 0);
    const map = tex(c), nrm = new T.CanvasTexture(nc); nrm.anisotropy = ANI;
    return { map, nrm };
  };
  const rr = (a, b) => a + Math.random() * (b - a);
  // брызги: 0, 1 — круглые (удар сверху), 2, 3 — с хвостом (капля летела вбок, хвост — по +x), 4..8 — мелкие капли
  const SPL = bloodPaint(3, (add, i) => {
    if (i < 2) {
      add(128, 128, rr(30, 40)); for (let k = 0; k < 7; k++) { const a = rr(0, 6.28), dd = rr(14, 34); add(128 + Math.cos(a) * dd, 128 + Math.sin(a) * dd, rr(12, 24)); }
      for (let k = 0; k < 26; k++) { const a = rr(0, 6.28), dd = rr(52, 112), r = rr(1.5, 6); add(128 + Math.cos(a) * dd, 128 + Math.sin(a) * dd, r, rr(1, 2.8), a, 1.4); }
    } else if (i < 4) {
      add(78, 128, 30, 1.7); add(118, 128, 16, 1.6); add(150, 129, 9, 1.8); add(172, 130, 5.5, 2); add(190, 131, 3.5, 2.2);
      for (let k = 0; k < 22; k++) { const a = rr(-.55, .55), dd = rr(60, 120), r = rr(1.5, 5); add(78 + Math.cos(a) * dd, 128 + Math.sin(a) * dd, r, rr(1.4, 3.2), a, 1.4); }
    } else { add(128, 128, rr(16, 26)); for (let k = 0; k < 6; k++) { const a = rr(0, 6.28), dd = rr(30, 70); add(128 + Math.cos(a) * dd, 128 + Math.sin(a) * dd, rr(1.5, 4), rr(1, 2), a, 1.4); } }
  });
  const POOL = bloodPaint(1, add => {   // лужа: толстая середина, неровный край, языки-потёки, рядом капли (края текстуры — прозрачные: лужа «растёт» сдвигом текстуры)
    add(128, 128, 50, 1, 0, 1.8); for (let k = 0; k < 16; k++) { const a = rr(0, 6.28), dd = rr(22, 52); add(128 + Math.cos(a) * dd, 128 + Math.sin(a) * dd, rr(14, 30), rr(1, 1.7), a, 1.3); }
    for (let k = 0; k < 5; k++) { const a = rr(0, 6.28); for (let j = 0; j < 4; j++) add(128 + Math.cos(a) * (62 + j * 9), 128 + Math.sin(a) * (62 + j * 9), 9 - j * 1.6, 1.3, a, 1.2); }
    for (let k = 0; k < 16; k++) { const a = rr(0, 6.28), dd = rr(88, 108); add(128 + Math.cos(a) * dd, 128 + Math.sin(a) * dd, rr(1.5, 4.5), 1, 0, 1.4); }
  }, 512);
  const wetM = (t, ro, off) => std({ map: t.map, normalMap: t.nrm, normalScale: new T.Vector2(1.6, 1.6), transparent: true, depthWrite: false, roughness: ro, metalness: 0, envMapIntensity: 1.4, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off });
  const splM = wetM(SPL, .1, -4), poolM = wetM(POOL, .06, -6);
  const cellG = i => { const g = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), uv = g.attributes.uv, cx = (i % 3) / 3, cy = 1 - (Math.floor(i / 3) + 1) / 3; for (let k = 0; k < uv.count; k++) uv.setXY(k, cx + uv.getX(k) / 3, cy + uv.getY(k) / 3); return g; };
  const SPLN = 260, splI = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => { const m = new T.InstancedMesh(cellG(i), splM, SPLN); m.count = 0; m.frustumCulled = false; m.renderOrder = 2; m.receiveShadow = true; scene.add(m); return { m, n: 0 }; });
  const DROPS = 220, drops = new T.InstancedMesh(new T.SphereGeometry(1, 6, 4), std({ color: 0x5a0508, roughness: .12, metalness: 0 }), DROPS);
  drops.count = 0; drops.frustumCulled = false; scene.add(drops);
  const dropL = [], mists = [], pools = [], drips = [], _bm = new T.Matrix4(), _bq = new T.Quaternion(), _bq2 = new T.Quaternion(), _bs = V(1, 1, 1), _bn = V(0, 1, 0), _bp = V(0, 0, 0), _bd = V(0, 0, 0);
  const surfY = (x, z) => { const h = railH(x, z); return h < 0 ? 0 : h; };   // стол (бортик, дерево, сукно) или пол
  const surfN = (x, z, o) => { const e = .006, hx = surfY(x + e, z) - surfY(x - e, z), hz = surfY(x, z + e) - surfY(x, z - e); return o.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize(); };
  // пятно на поверхности (по наклону бортика); dir — куда летела капля (хвост туда), st — во сколько раз вытянуть
  const splat = (x, z, s, dir, st = 1, kind) => {
    const v = kind != null ? kind : dir ? 2 + (Math.random() < .5 ? 1 : 0) : s < .02 ? 4 + Math.floor(Math.random() * 5) : Math.floor(Math.random() * 2), o = splI[v];
    const ang = dir ? Math.atan2(-dir.z, dir.x) : Math.random() * 6.28;
    _bp.set(x, surfY(x, z) + .0012 + o.n * .0000015, z); _bq.setFromUnitVectors(UP, surfN(x, z, _bn)); _bq2.setFromAxisAngle(UP, ang); _bq.multiply(_bq2); _bs.set(s * st, 1, s);
    _bm.compose(_bp, _bq, _bs); o.m.setMatrixAt(o.n % SPLN, _bm); o.n++; o.m.count = Math.min(SPLN, o.n); o.m.instanceMatrix.needsUpdate = true;
  };
  const poolK = (p, k) => { const rep = 1 / Math.max(.04, k), off = .5 - .5 * rep; for (const t of [p.m.map, p.m.normalMap]) { t.repeat.set(rep, rep); t.offset.set(off, off); } };
  const putPool = (x, z, lift, max, grow) => {   // лужа: сетка лежит по поверхности (бортик, дерево, сукно, пол), растекается за grow с
    const seg = 24, g = new T.PlaneGeometry(1, 1, seg, seg).rotateX(-Math.PI / 2), pa = g.attributes.position, an = Math.random() * 6.28, ca = Math.cos(an), sa = Math.sin(an);
    for (let i = 0; i < pa.count; i++) { const lx = pa.getX(i) * max, lz = pa.getZ(i) * max, wx = x + lx * ca - lz * sa, wz = z + lx * sa + lz * ca; pa.setXYZ(i, wx, surfY(wx, wz) + lift, wz); }
    g.computeVertexNormals();
    const m = poolM.clone(); m.map = POOL.map.clone(); m.normalMap = POOL.nrm.clone(); m.map.needsUpdate = m.normalMap.needsUpdate = true;
    const o = new T.Mesh(g, m); o.renderOrder = 3; o.receiveShadow = true; scene.add(o);
    const p = { o, m, t0: clock, grow }; poolK(p, .04); pools.push(p); return p;
  };
  const spurt = (p, v, r) => { if (dropL.length < DROPS) dropL.push({ p: p.clone(), v, r }); };
  const bloodShot = a => {   // выстрел: облачко у выхода (левый висок) и много брызг вперёд-влево на стол; из входа справа — меньше
    if (!a.M || !a.hq) return;
    const hp = wp(a.M.B.head_0, V(0, 0, 0)), q = a.hq;
    const ex = V(-.085, .04, -.035).applyQuaternion(q).add(hp), en = V(.085, .04, -.035).applyQuaternion(q).add(hp), dir = V(-.45, .3, -1).normalize().applyQuaternion(q), dr = V(1, .3, -.3).normalize().applyQuaternion(q);
    for (let i = 0; i < 160; i++) { const sp = rr(.9, 2.8), big = Math.random() < .3; spurt(ex, dir.clone().multiplyScalar(sp).add(V(rr(-.45, .45), rr(-.3, .45), rr(-.45, .45))), big ? rr(.005, .009) * (1.6 - sp * .25) : rr(.0016, .004)); }   // кучно: крупные — ближе, мелкие — дальше
    for (let i = 0; i < 25; i++) spurt(en, dr.clone().multiplyScalar(rr(.5, 1.6)).add(V(rr(-.3, .3), rr(0, .4), rr(-.3, .3))), rr(.002, .004));
    for (const [p, s0] of [[ex, .17], [ex.clone().addScaledVector(dir, .12), .13], [en, .07]]) { const sp = new T.Sprite(new T.SpriteMaterial({ map: mistT, transparent: true, depthWrite: false })); sp.position.copy(p); sp.scale.setScalar(s0); sp.renderOrder = 9; scene.add(sp); mists.push({ sp, t0: clock, s0 }); }
  };
  const bloodHit = (a, hb, q) => {   // голова ударилась о стол: брызги вокруг, потёки по бортику, лужа на ровном, капли с края стола на пол
    const p = V(-.07, .05, -.02).applyQuaternion(q).add(hb);
    for (let i = 0; i < 40; i++) { const a = rr(0, 6.28), d = Math.pow(Math.random(), .7) * .24, h = V(Math.cos(a) * d, 0, Math.sin(a) * d).add(hb); if (railH(h.x, h.z) > 0) splat(h.x, h.z, rr(.02, .07) * (1.2 - d * 2.5), null, 1); }
    for (let i = 0; i < 7; i++) {   // потёки: вытянутые пятна вниз по склону бортика
      const h = V(rr(-.12, .12), 0, rr(-.12, .12)).add(hb); if (railH(h.x, h.z) <= TOP) continue;
      surfN(h.x, h.z, _bd); _bd.y = 0; if (_bd.lengthSq() < 1e-6) continue; splat(h.x, h.z, rr(.018, .03), _bd.clone(), rr(2.2, 3.4), 2);
    }
    a.pool = putPool(p.x, p.z, .003, .5, 2.2);   // из-под головы — по бортику и дальше
    const c = p.clone().multiplyScalar(.9); a.pool2 = putPool(c.x, c.z, .0026, .62, 4);   // и шире — к середине стола (стекает)
    const r0 = Math.hypot(p.x / TA, p.z / TB) || 1, edge = V(p.x / r0, 0, p.z / r0); edge.multiplyScalar(1 + .012 / Math.hypot(edge.x, edge.z));   // край стола напротив головы
    if (edge.distanceTo(V(p.x, 0, p.z)) < .3) drips.push({ x: edge.x, z: edge.z, y: TOP + .02, t: clock + 1.2, end: clock + 22, a });
  };
  const bloodStain = (a, B, q) => {   // пятно на правом виске (входное) — держится за голову
    const hb = wp(B.head_0, V(0, 0, 0)), o = new T.Mesh(cellG(0), splM); o.renderOrder = 2;
    o.position.copy(V(.083, .04, -.035).applyQuaternion(q).add(hb)); o.quaternion.setFromUnitVectors(UP, V(1, 0, 0).applyQuaternion(q)); o.scale.set(.07, 1, .07);
    scene.add(o); B.head_0.attach(o); a.stain = o;
  };
  const bloodStep = dt => {   // полёт капель (упала — пятно, хвостом по полёту), облачка, лужи растут, с края стола капает
    let n = 0;
    for (let i = dropL.length - 1; i >= 0; i--) {
      const d = dropL[i]; d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.y <= surfY(d.p.x, d.p.z) || Math.abs(d.p.x) > 6 || Math.abs(d.p.z) > 6) {
        if (d.p.y > -.1) { const hv = Math.hypot(d.v.x, d.v.z), sp = d.v.length(), s = Math.min(.06, d.r * rr(5, 9) + Math.min(.015, sp * .003)), tail = hv > 2.4 && Math.random() < .6; splat(d.p.x, d.p.z, s, tail ? _bd.set(d.v.x, 0, d.v.z) : null, tail ? 1 + Math.min(.8, (hv - 2) * .25) : 1); }   // хвост — только у быстрых капель
        dropL.splice(i, 1); continue;
      }
      _bs.setScalar(d.r * (1 + Math.min(1.5, d.v.length() * .12))); _bm.compose(d.p, _bq.identity(), _bs); drops.setMatrixAt(n++, _bm);
    }
    drops.count = n; if (n) drops.instanceMatrix.needsUpdate = true;
    for (let i = mists.length - 1; i >= 0; i--) { const m = mists[i], k = (clock - m.t0) / .6; if (k >= 1) { scene.remove(m.sp); m.sp.material.dispose(); mists.splice(i, 1); continue; } m.sp.scale.setScalar(m.s0 * (1 + 4 * k)); m.sp.material.opacity = .9 * (1 - k) * (1 - k); }
    for (const p of pools) poolK(p, .04 + .96 * (1 - Math.exp(-(clock - p.t0) / p.grow)));
    for (let i = drips.length - 1; i >= 0; i--) {
      const d = drips[i]; if (clock > d.end) { drips.splice(i, 1); continue; }
      if (clock >= d.t) { d.t = clock + rr(.35, .9); spurt(V(d.x + rr(-.01, .01), d.y, d.z + rr(-.01, .01)), V(0, -.2, 0), rr(.003, .005)); if (!d.floor) d.floor = putPool(d.x, d.z, .002, .32, 9); }
    }
  };
  const mistT = (() => { const c = cnv(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(140,10,12,.85)'); g.addColorStop(.5, 'rgba(110,6,8,.35)'); g.addColorStop(1, 'rgba(90,4,6,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return tex(c); })();
  const fallReset = a => {   // новая игра: сидит снова, крови нет
    a.fallAt = null; a.fallPend = false; a.relP = null; a.pool = a.pool2 = null;
    if (a.stain) { if (a.stain.parent) a.stain.parent.remove(a.stain); a.stain = null; }
  };
  const bloodClear = () => {
    for (const o of splI) { o.n = 0; o.m.count = 0; }
    for (const p of pools) { scene.remove(p.o); p.o.geometry.dispose(); p.m.map.dispose(); p.m.normalMap.dispose(); p.m.dispose(); } pools.length = 0; drips.length = 0; dropL.length = 0; drops.count = 0;
    for (const s of SEATS) fallReset(AV[s]);
  };
  let bloodGid = null;
  // события стола: прокрутка барабана (в руке — тоже), взвод курка, щелчок, выстрел (вспышка у дула)
  W.event = ev => {
    const ax = gun.axis, dr = gun.drum, o = gun.g;
    if ((ev.kind === 'spin' || ev.kind === 'cock') && ev.seat && (gun.who !== ev.seat || gun.lw < 1)) gun.rush = true;   // нажали раньше, чем револьвер у виска — догоняем
    if (ev.kind === 'start' && ev.seat) W.roul(ev.seat);   // жребий: револьвер крутится в центре (владелец 21.11)
    if (ev.kind === 'spin' && dr && ev.seat !== mySeat) { DR.sndUntil = clock + 1.3; const a0 = dr.rotation[ax], a1 = a0 + (Math.PI / 3) * (12 + rnd(12)); tween(1.2, k => { dr.rotation[ax] = a0 + (a1 - a0) * (1 - Math.pow(1 - k, 3)); }); }
    if (ev.kind === 'cock') { tween(.18, k => { gun.kz = k < 1 ? Math.sin(Math.PI * k) * .05 : 0; }); return; }   // взвели курок — короткий рывок
    if ((ev.kind === 'click' || ev.kind === 'bang') && dr) { const a0 = dr.rotation[ax]; tween(.12, k => { dr.rotation[ax] = a0 + (Math.PI / 3) * k; }); }
    if (ev.kind === 'click' || ev.kind === 'bang') { const big = ev.kind === 'bang' ? 1 : .35; tween(.35, k => { const s = k < 1 ? Math.sin(Math.PI * k) * big : 0; gun.hop = s * .025; gun.kick = s; }); }   // на столе подпрыгивает, в руке — дуло вверх
    if (ev.kind === 'bang') {
      const a = AV[ev.seat];
      if (a) {
        a.vDead = true; bloodShot(a);
        if (a.me) a.fallPend = true; else if (a.fallAt == null) a.fallAt = clock;   // своё тело падает, когда камера уже ушла вверх (владелец: свой вид — как было)
        if (a.M && gun.who === ev.seat && gun.hw >= 1) { gun.fallSeat = ev.seat; gun.fallT = clock; a.relP = wp(a.M.B.hand_r, V(0, 0, 0)); a.relQ = gun.g.quaternion.clone().multiply(GRIP_QI.clone().invert()); }
        else gun.drop = true;
      }
      o.updateMatrixWorld(); flashL.position.copy(gun.muzzle).applyMatrix4(o.matrixWorld); flashL.position.y += .05;
      tween(.45, k => { flashL.intensity = 40 * Math.pow(1 - k, 2); });
    }
  };
  function setBoxes(rd) {
    for (const n of [1, 2, 3, 4]) {
      const b = BX[n], bx = rd && rd.boxes.find(x => x.n === n), key = bx ? bx.sym + bx.gun + bx.col : '-';
      if (key === b.key) continue;
      b.key = key;
      if (b.decM.map) b.decM.map.dispose();
      b.decM.map = tex(paintDecal(n, bx)); b.decM.needsUpdate = true;
      const c = bx ? new T.Color(COL[bx.col]) : new T.Color(0x2a3036);
      b.bandM.color.copy(c); b.bandM.emissive.copy(bx ? c : new T.Color(0)); b.bandM.emissiveIntensity = bx ? .35 : 0;
    }
  }

  // вскрытие: сначала неверный выбор (если был), потом цель
  W.reveal = async (chosen, target, fast) => {
    const seq = chosen && chosen !== target ? [[chosen, false], [target, true]] : [[target, true]];
    if (fast) { seq.forEach(([n, good], i) => openNow(n, good, i)); return; }
    lampTo(14, .6);
    for (let i = 0; i < seq.length; i++) {
      const [n, good] = seq[i];
      focus(n);
      await openBox(n, good, i);
      await tween(i < seq.length - 1 ? .7 : 1.1, () => { /* пауза */ });
    }
    lampTo(26, 1); auto = null;
  };
  W.skipOpen = () => { tw.forEach(t => { t.t0 = -1e9; }); };
  W.resetRound = keepRid => {
    if (!keepRid) roundId = 0;
    for (const n in BX) { const b = BX[n]; b.open = 0; b.hinge.rotation.x = 0; b.latches.forEach(l => { l.rotation.x = 0; }); if (b.item) { scene.remove(b.item); b.item.material.map.dispose(); b.item.material.dispose(); b.item = null; } }
    if (!keepRid) setBoxes(null);
    inL.forEach(l => { l.intensity = 0; l.position.set(0, -10, 0); });
    lamp.intensity = 34; auto = null; tw.length = 0;
  };
  function lampTo(v, d) { const v0 = lamp.intensity; tween(d, k => { lamp.intensity = v0 + (v - v0) * easeIO(k); }); }
  function focus(n) {
    if (clock - userAt < 1.2 && userAt) return;   // игрок сам крутит головой — не мешаем
    const b = BX[n]; _a.set(b.g.position.x, TOP + .1, b.g.position.z); cam.getWorldPosition(_b); _a.sub(_b);
    let y = Math.atan2(-_a.x, -_a.z) - seatYaw(mySeat); y = Math.atan2(Math.sin(y), Math.cos(y));
    auto = { y: clamp(y, -1.4, 1.4), p: clamp(Math.atan2(_a.y, Math.hypot(_a.x, _a.z)), -1.1, .4) };
  }
  function itemSprite(good, n) {
    const bx = S && S.round && S.round.boxes.find(x => x.n === n);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex(paintItem(good, bx && bx.gun)), transparent: true, depthWrite: false, opacity: 0, blending: T.AdditiveBlending }));
    sp.scale.set(.34, .17, 1); sp.renderOrder = 8; return sp;
  }
  function openNow(n, good, i) {
    const b = BX[n]; if (b.open) return; b.open = 1;
    b.latches.forEach(l => { l.rotation.x = 1.45; }); b.hinge.rotation.x = -1.95;
    const L = inL[good ? 0 : 1]; L.position.set(b.g.position.x, TOP + .2, b.g.position.z); L.intensity = good ? 1.3 : 1;
    b.item = itemSprite(good, n); b.item.position.set(b.g.position.x, TOP + .34, b.g.position.z); b.item.material.opacity = 1; scene.add(b.item);
  }
  async function openBox(n, good) {
    const b = BX[n]; if (b.open) return; b.open = 1;
    await Promise.all(b.latches.map((l, i) => tween(.2, k => { l.rotation.x = 1.45 * easeOut(k); }, i * .13)));
    await tween(.95, k => { b.hinge.rotation.x = -1.95 * easeBack(k); });
    const L = inL[good ? 0 : 1]; L.position.set(b.g.position.x, TOP + .2, b.g.position.z);
    b.item = itemSprite(good, n); b.item.position.set(b.g.position.x, TOP + .08, b.g.position.z); scene.add(b.item);
    await tween(.85, k => { const e = easeOut(k); L.intensity = (good ? 1.3 : 1) * e; b.item.position.y = TOP + .08 + .26 * e; b.item.material.opacity = e; });
  }

  /* размер холста */
  const ro = new ResizeObserver(() => {
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    ren.setSize(w, h, false); if (comp) { comp.setPixelRatio(ren.getPixelRatio()); comp.setSize(w, h); } cam.aspect = w / h; cam.fov = w / h < 1 ? 74 : 62; cam.updateProjectionMatrix();
  });
  ro.observe(cv);

  /* кадр */
  W.frame = (dt, t) => {
    clock += dt;
    for (let i = tw.length - 1; i >= 0; i--) { const x = tw[i], k = (clock - x.t0) / x.dur; if (k < 0) continue; x.fn(Math.min(1, k)); if (k >= 1) { tw.splice(i, 1); x.res(); } }
    gunStep(dt);   // револьвер: едет по столу, кто его держит
    bloodStep(dt);   // капли крови, облачка, лужи
    // камера
    if (menuOn) {
      const a = t * .045; cam.position.set(Math.sin(a) * 2.75, 1.95, Math.cos(a) * 2.75); cam.lookAt(0, .78, 0);
      if (tvHum) { tvHum = false; rrLoop('hum', false, .3); }
      if (tvD || tvK || spec) { tvD = null; tvKey = ''; tvK = 0; spec = 0; specF = 0; ren.domElement.style.filter = ''; }   // в меню — экран итога и вид выбывшего сбрасываем сразу
    } else {
      if (auto) { const f = 1 - Math.exp(-dt * 3); yaw += (auto.y - yaw) * f; pitch += (auto.p - pitch) * f; }
      const me = AV[mySeat], gl = gun.who === mySeat ? easeIO(gun.hw) * easeIO(gun.lw) : 0;   // свой ход: у виска — голова чуть наклонена влево
      me.g.updateMatrixWorld(); _a.set(0, EYE, -.02 - ME_FWD).applyMatrix4(me.g.matrixWorld);
      cam.position.copy(_a); cam.rotation.set(pitch, seatYaw(mySeat) + yaw, .06 * gl);
      // выбыл — камера плавно уходит под потолок и медленно облетает стол сверху (наблюдатель)
      if (!me.dead) specAt = Infinity; else if (specAt === Infinity) specAt = clock + 3;   // владелец 20.11: сначала выстрел, потом камера вверх (specGo из rrEvent; без события — через 3 с)
      spec += ((me.dead && clock >= specAt ? 1 : 0) - spec) * (1 - Math.exp(-dt * 1.2));
      if (spec > .002) {
        const e = spec * spec * (3 - 2 * spec), ang = seatYaw(mySeat) + t * .05;
        _q2.copy(cam.quaternion); _c.set(Math.sin(ang) * SPEC_R, SPEC_Y, Math.cos(ang) * SPEC_R);
        cam.position.lerpVectors(_a, _c, e); cam.lookAt(0, TOP, 0); _q.copy(cam.quaternion); cam.quaternion.slerpQuaternions(_q2, _q, e);
      }
      // конец игры — камера подъезжает к экрану на стене, где итог (поверх и «сверху», и своего места)
      tvK += ((tvD && clock >= tvAt && (FIN.done || FIN.win !== mySeat) ? 1 : 0) - tvK) * (1 - Math.exp(-dt * 1.5));   // победитель остаётся за столом (видит, как фишки едут к нему), к экрану — когда там итог (владелец 21.11)
      { const on = tvK > .5 && FIN.done; if (on !== tvHum) { tvHum = on; rrLoop('hum', tvHum, 1.2); } }   // гул телевизора — только когда на экране итог (владелец 21.11)   // гул старого телевизора — тихо, пока камера у экрана
      if (tvK > .002) {
        if (tvD && clock - tvFitAt > .25) {   // где на холсте свободно: справа может быть чат, сверху — плашки
          tvFitAt = clock; const cv = ren.domElement, b = cv.getBoundingClientRect(), kr = cv.closest('.kr');
          let l = b.left + 16, r = b.right - 16; const t = b.top + 64, bt = b.bottom - 16;
          const ch = kr && kr.classList.contains('chat-on') && kr.querySelector('.kr-chat');
          if (ch) { const c2 = ch.getBoundingClientRect(); if (c2.width && c2.left > b.left + b.width * .45) r = Math.min(r, c2.left - 16); }
          if (b.width > 50 && r - l > 50 && bt - t > 50) tvFit = [((l + r) / 2 - b.left) / b.width, ((t + bt) / 2 - b.top) / b.height, (r - l) / b.width, (bt - t) / b.height];
        }
        const e = tvK * tvK * (3 - 2 * tvK), tn = Math.tan(cam.fov * Math.PI / 360), as = cam.aspect, [fx, fy, fw, fh] = tvFit;
        const dz = Math.max(.8 / (tn * fh), 1.44 / (tn * as * fw));   // экран 2,7 × 1,45 м с рамкой целиком в свободной части
        _q2.copy(cam.quaternion); _b.copy(cam.position); _c.set(-(2 * fx - 1) * dz * tn * as, 2.05 - (1 - 2 * fy) * dz * tn, -4.94 + dz);
        cam.position.lerpVectors(_b, _c, e); _q.identity(); cam.quaternion.slerpQuaternions(_q2, _q, e);
        // «живая» камера: лёгкое дыхание — плавно качается и чуть поворачивается (несколько медленных синусов, не в такт)
        if (FIN.shake > 0) { cam.position.x += (Math.random() - .5) * .07 * FIN.shake; cam.position.y += (Math.random() - .5) * .06 * FIN.shake; }   // выстрел «в камеру» — тряска
        cam.position.x += (Math.sin(t * .51) * .011 + Math.sin(t * 1.13 + 2.1) * .003) * e; cam.position.y += (Math.sin(t * .83 + 1.3) * .008 + Math.sin(t * 1.7) * .002) * e;
        _e.set((Math.sin(t * .67 + .4) * .0035 + Math.sin(t * 1.31) * .001) * e, Math.sin(t * .43 + 2) * .0045 * e, Math.sin(t * .37 + .8) * .0025 * e); _q.setFromEuler(_e); cam.quaternion.multiply(_q);
      }
      { const k = Math.round(spec * (1 - tvK) * 50) / 50; if (k !== specF) { specF = k; ren.domElement.style.filter = k ? `grayscale(${(k * .85).toFixed(2)}) brightness(${(1 - k * .18).toFixed(2)})` : ""; } }   // выбывший видит мир серым
      const watch = spec > .35;   // сверху виден свой персонаж целиком — голова опущена, как у остальных выбывших
      if (me.M) { if ((me.M.head.scale.x > .5) !== watch) me.M.head.scale.setScalar(watch ? 1 : 1e-4); }
      else if (me.headParts[0].visible !== watch) me.headParts.forEach(o => { o.visible = watch; });
      if (watch && me.fallPend) { me.fallPend = false; if (me.fallAt == null) me.fallAt = clock; }   // своё тело валится на стол — видно сверху
      if (watch) { me.hy += (0 - me.hy) * .05; me.hp += (-1 - me.hp) * .05; me.hd.rotation.set(me.hp * .85, me.hy * .9, 0); }
      else { me.ty = yaw; me.tp = pitch; me.hy = yaw; me.hp = pitch; }
    }
    cam.updateMatrixWorld();
    // фигуры: голова, дыхание, карточка, руки
    for (const s of SEATS) {
      const a = AV[s];
      { const on = a.bOn && btnActive && a.on, hov = a.me && aimBtn; a.bk += ((on ? 1 : 0) - a.bk) * (1 - Math.exp(-dt * 16));   // кнопка: утоплена и светится, когда нажата
        a.bCap.position.y = .031 - .009 * a.bk; a.bDome.position.y = .042 - .009 * a.bk; a.bCapM.emissiveIntensity = .2 + 1.7 * a.bk + (hov ? .35 : 0) + (btnActive && a.me && !on ? .15 * (1 + Math.sin(t * 4)) : 0); a.bGlow.material.opacity = .9 * a.bk; }
      if (!a.on || menuOn) continue;
      const f = 1 - Math.exp(-dt * 9);
      if (a.dead && !a.vDead && clock >= (gun.holdUntil || 0) + .5) { a.vDead = true; if (a.me) a.fallPend = true; else if (a.fallAt == null) a.fallAt = clock; }
      if (a.vDead && !a.me) { a.ty = 0; a.tp = -1; }   // выбыл — голова опущена (падение и кровь — этап 4)
      if (!a.me) { a.hy += (a.ty - a.hy) * f; a.hp += (a.tp - a.hp) * f; a.hd.rotation.set(a.hp * .85, a.hy * .9, 0); }
      if (!a.M) a.body.position.y = Math.sin(t * 1.7 + s * 1.3) * .004;
      { const o = a.sp.material, want = a.spk && !a.me ? 1 : 0; o.opacity += (want - o.opacity) * (1 - Math.exp(-dt * 14)); a.sp.visible = o.opacity > .02; const k2 = 1 + (a.spk ? Math.sin(t * 12) * .08 : 0); a.sp.scale.set(.1 * k2, .1 * k2, 1); }
      a.kt = 0;   // рулетка: карточку к глазам не подносим
      a.k += (a.kt - a.k) * (1 - Math.exp(-dt * 7));
      const k = easeIO(clamp(a.k, 0, 1));
      a.g.updateMatrixWorld(); a.body.updateMatrixWorld();
      // покой: у груди, наклонена к лицу
      _a.set(0, .96, -.33).applyMatrix4(a.body.matrixWorld); _e.set(-.75, 0, 0); _q.setFromEuler(_e); a.g.getWorldQuaternion(_q2); _q.premultiply(_q2);
      // чтение: перед глазами
      if (a.me && spec < .35 && tvK < .05) { _b.set(0, -.035, -.27).applyMatrix4(cam.matrixWorld); _q2.copy(cam.quaternion); }
      else { a.hd.updateMatrixWorld(); _b.set(0, .02, -.3).applyMatrix4(a.hd.matrixWorld); a.hd.getWorldQuaternion(_q2); }
      a.card.position.lerpVectors(_a, _b, k); a.card.quaternion.slerpQuaternions(_q, _q2, k);
      a.card.updateMatrixWorld();
      if (a.M) { poseModel(a, t, dt); continue; }
      for (let i = 0; i < 2; i++) {
        const r = a.arm[i], sd = i ? 1 : -1;
        const S0 = a.sh[i].clone().applyMatrix4(a.body.matrixWorld), Hn = V(sd * .052, -.04, .012).applyMatrix4(a.card.matrixWorld);
        _c.set(sd * .09, -.1, .04).applyQuaternion(a.g.quaternion);
        const E = S0.clone().add(Hn).multiplyScalar(.5).add(_c);
        setLimb(r.up, S0, E); setLimb(r.fo, E, Hn); r.el.position.copy(E); r.hand.position.copy(Hn);
      }
    }
    // прицел по контейнерам
    aimN = 0; aimBtn = false;
    if (!menuOn && (locked || mouseN)) {
      ndc.set(locked ? 0 : mouseN[0], locked ? 0 : mouseN[1]); ray.setFromCamera(ndc, cam);
      if (btnActive && AV[mySeat] && ray.intersectObjects(AV[mySeat].bHit, false)[0]) aimBtn = true;   // моя красная кнопка
      else { const h = ray.intersectObjects(hitList, false)[0]; if (h && h.distance < 3) aimN = h.object.userData.n; }
    }
    // подсветка: прицел — голубой, мой выбор — ярко-голубой, доп. голосование — янтарь, черновик — тусклый
    let mineN = 0;
    for (const n of [1, 2, 3, 4]) {
      const b = BX[n], cand = mk.cands && mk.cands.includes(n), my = mk.mine === n;
      let col = 0x84d9fd, op = 0;
      if (my) { op = mk.kind === 'draft' ? .45 : mk.kind === 'pend' ? .6 + .25 * Math.sin(t * 9) : .95; mineN = n; }
      else if (cand) { col = 0xe8b45a; op = .55 + .2 * Math.sin(t * 3); }
      if (aimN === n && !b.open) op = Math.max(op, .55);
      if (b.open) op = 0;
      b.pa += (op - b.pa) * (1 - Math.exp(-dt * 12)); b.padM.opacity = b.pa; b.padM.color.setHex(col);
      if (b.item) { b.item.position.y += Math.sin(t * 2 + n) * .0003; }
    }
    if (mineN && !BX[mineN].open && !menuOn) { mine.position.set(BX[mineN].g.position.x, TOP + .27 + Math.sin(t * 2.4) * .006, BX[mineN].g.position.z); mine.material.opacity += (1 - mine.material.opacity) * .2; }
    else mine.material.opacity *= .8;
    if (flames.length) { const fl = .82 + .1 * Math.sin(t * 9.1) + .07 * Math.sin(t * 23.7 + 1.3) + .04 * Math.sin(t * 41); candL.intensity = 1.6 * fl; for (const f of flames) { const k = 1 + .12 * Math.sin(t * 13 + f.k) + .06 * Math.sin(t * 29 + f.k * 2); f.sp.scale.set(.026 * (2 - k) * .9, .052 * k, 1); } }
    if (snow.pts) { const p = snow.pts.geometry.attributes.position, a = p.array; for (let i = 0; i < snow.v.length; i++) { a[i * 3 + 1] -= snow.v[i] * dt; a[i * 3] += Math.sin(t * .7 + i) * .0009 * dt; if (a[i * 3 + 1] < .042) { a[i * 3 + 1] = .11; a[i * 3] = (Math.random() - .5) * .1; a[i * 3 + 2] = (Math.random() - .5) * .1; } } p.needsUpdate = true; }
    for (const m of haze) { m.f += m.v * dt; m.sp.position.x = Math.cos(m.f) * m.r; m.sp.position.z = Math.sin(m.f) * m.r; m.sp.position.y = m.y0 + Math.sin(t * .15 + m.k) * .12; m.sp.material.rotation += m.rv * dt; }
    for (const m of smoke) { m.f += m.v * dt; m.sp.position.x = Math.cos(m.f) * m.r; m.sp.position.z = Math.sin(m.f) * m.r * .6; m.sp.position.y = m.y0 + Math.sin(t * .2 + m.k) * .08; m.sp.material.rotation += m.v * .4 * dt; }
    cctvM.uniforms.uT.value = t;
    finStep(dt);   // финал у телевизора (владелец 21.11)
    const mix = clamp((tvK - .25) / .5, 0, 1) * (FIN.done ? 1 : FIN.mix); cctvM.uniforms.uMix.value = mix * mix * (3 - 2 * mix);
    cctvM.uniforms.uCrack.value = FIN.crack; cctvM.uniforms.uFlash.value = FIN.flash; cctvM.uniforms.uGl.value = FIN.gl;
    if (mix < 1 && !(FIN.fired && clock > FIN.fireT + .12) && (t - cctvAt > 1 / 15 || t < cctvAt)) { cctvAt = t; cctvDraw(); }   // после выстрела кадр камеры замирает   // итог на весь экран — камеру наблюдения не рисуем
    if (Math.floor(t * 2) !== ovAt) { ovAt = Math.floor(t * 2); ovDraw(t); }
    if (W._led) W._led.visible = Math.floor(t * 1.4) % 2 === 0;
    if (comp) comp.render(); else ren.render(scene, cam);
  };

  W.dispose = () => {
    ro.disconnect(); mdlAlive = false;
    MDL.forEach(M => { if (M && !M.root.parent) scene.add(M.root); });   // незанятые модели — тоже освободить
    const seenT = new Set();
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture && !seenT.has(v)) { seenT.add(v); v.dispose(); } } m.dispose(); });
    });
    if (scene.environment) scene.environment.dispose();
    ren.dispose(); try { ren.forceContextLoss(); } catch (e) { /* уже потерян */ }
  };
  W.dbg = { AV, MDL, cam, ren, scene, order: o => { mdlOrder = o; mdlApply(); }, look: (y, p) => { yaw = y; pitch = p; userAt = clock; auto = null; } };   // для проверки из браузера (KROT.dbg.world().dbg)
  W.resetRound();
  return W;
}

/* ============================================================
   Рисунки для 3D (холсты)
   ============================================================ */
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function noise(x, w, h, n, a) { for (let i = 0; i < n; i++) { x.fillStyle = Math.random() < .5 ? `rgba(255,255,255,${Math.random() * a})` : `rgba(0,0,0,${Math.random() * a * 1.6})`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } }
function wrap(x, t, maxW) {
  const words = String(t || '').split(/\s+/), out = []; let line = '';
  for (const w of words) { const s = line ? line + ' ' + w : w; if (x.measureText(s).width > maxW && line) { out.push(line); line = w; } else line = s; }
  if (line) out.push(line); return out;
}
function drawSym(x, k, cx, cy, size, lw) { const p = new Path2D(SYM[k] || ''); x.save(); x.translate(cx - size / 2, cy - size / 2); x.scale(size / 24, size / 24); x.lineWidth = lw * 24 / size; x.lineJoin = 'round'; x.stroke(p); x.restore(); }
function drawGun(x, k, cx, cy, w) { const p = new Path2D(GUN[k] || ''); x.save(); x.translate(cx - w / 2, cy - w / 4); x.scale(w / 48, w / 48); x.fill(p, 'evenodd'); x.restore(); }
const F_H = n => `500 ${n}px Oswald, 'Arial Narrow', sans-serif`, F_B = (n, w = 700) => `${w} ${n}px Manrope, system-ui, sans-serif`;

function paintRug() {      // ковёр под столом: тёмно-красное поле, узорная кайма, медальон
  const W2 = 1024, H2 = 768, c = cnv(W2, H2), x = c.getContext('2d');
  x.fillStyle = '#3d0d10'; x.fillRect(0, 0, W2, H2);
  const g = x.createRadialGradient(W2 / 2, H2 / 2, 40, W2 / 2, H2 / 2, W2 * .6); g.addColorStop(0, 'rgba(120,30,30,.55)'); g.addColorStop(1, 'rgba(0,0,0,.35)'); x.fillStyle = g; x.fillRect(0, 0, W2, H2);
  const band = (m, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.strokeRect(m, m, W2 - 2 * m, H2 - 2 * m); };
  x.fillStyle = '#1a1420'; x.fillRect(0, 0, W2, 70); x.fillRect(0, H2 - 70, W2, 70); x.fillRect(0, 0, 70, H2); x.fillRect(W2 - 70, 0, 70, H2);
  band(12, 6, '#b08a4a'); band(64, 5, '#b08a4a'); band(80, 2, 'rgba(176,138,74,.6)');
  x.fillStyle = 'rgba(176,138,74,.75)';
  for (let i = 0; i < 40; i++) { const px = 40 + i * (W2 - 80) / 39; for (const py of [38, H2 - 38]) { x.save(); x.translate(px, py); x.rotate(Math.PI / 4); x.fillRect(-7, -7, 14, 14); x.restore(); } }
  for (let i = 0; i < 30; i++) { const py = 40 + i * (H2 - 80) / 29; for (const px of [38, W2 - 38]) { x.save(); x.translate(px, py); x.rotate(Math.PI / 4); x.fillRect(-7, -7, 14, 14); x.restore(); } }
  x.save(); x.translate(W2 / 2, H2 / 2); x.strokeStyle = 'rgba(176,138,74,.55)'; x.lineWidth = 4;
  for (let k = 0; k < 16; k++) { x.rotate(Math.PI / 8); x.beginPath(); x.ellipse(0, -90, 26, 70, 0, 0, Math.PI * 2); x.stroke(); }
  x.beginPath(); x.arc(0, 0, 170, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(0, 0, 40, 0, Math.PI * 2); x.fillStyle = 'rgba(176,138,74,.5)'; x.fill(); x.restore();
  noise(x, W2, H2, 90000, .07);
  return c;
}
function paintSmoke() {    // мягкий клуб дыма
  const c = cnv(256, 256), x = c.getContext('2d');
  for (let i = 0; i < 26; i++) { const px = 128 + (Math.random() - .5) * 120, py = 128 + (Math.random() - .5) * 120, r = 30 + Math.random() * 60, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); }
  const m = x.createRadialGradient(128, 128, 60, 128, 128, 128); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = m; x.fillRect(0, 0, 256, 256);
  return c;
}
function paintPoker() {   // сукно покерного стола: зелёный фетр, светлая дорожка для ставок, надпись по центру (читается с места 1)
  const W2 = 2048, H2 = 1152, c = cnv(W2, H2), x = c.getContext('2d');
  const g = x.createRadialGradient(W2 / 2, H2 / 2, 80, W2 / 2, H2 / 2, W2 * .62); g.addColorStop(0, '#22744b'); g.addColorStop(.6, '#185a39'); g.addColorStop(1, '#0c3522'); x.fillStyle = g; x.fillRect(0, 0, W2, H2);
  noise(x, W2, H2, 160000, .05);
  for (let i = 0; i < 9000; i++) { x.strokeStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * .035})`; x.lineWidth = 1; const px = Math.random() * W2, py = Math.random() * H2, a = Math.random() * 7; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 6, py + Math.sin(a) * 6); x.stroke(); }
  x.strokeStyle = 'rgba(236,214,150,.34)'; x.lineWidth = 6; x.beginPath(); x.ellipse(W2 / 2, H2 / 2, W2 * .37, H2 * .34, 0, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = 'rgba(236,214,150,.16)'; x.lineWidth = 2; x.beginPath(); x.ellipse(W2 / 2, H2 / 2, W2 * .37 - 18, H2 * .34 - 18, 0, 0, Math.PI * 2); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,.22)'; x.font = F_H(190); x.fillText('RUSH CASE', W2 / 2 + 3, H2 / 2 - 38 + 4);
  x.fillStyle = 'rgba(236,214,150,.2)'; x.fillText('RUSH CASE', W2 / 2, H2 / 2 - 38);
  x.font = F_H(54); x.fillStyle = 'rgba(236,214,150,.22)'; x.fillText('Р У С С К А Я   Р У Л Е Т К А', W2 / 2, H2 / 2 + 92);
  const v = x.createRadialGradient(W2 / 2, H2 / 2, H2 * .45, W2 / 2, H2 / 2, W2 * .56); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.38)'); x.fillStyle = v; x.fillRect(0, 0, W2, H2);
  return c;
}
function paintWood() {    // лакированное дерево (кант стола, рукоять): волокна вдоль длинной стороны
  const c = cnv(1024, 256), x = c.getContext('2d');
  x.fillStyle = '#6a3f22'; x.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 140; i++) {
    const y0 = Math.random() * 256, amp = 2 + Math.random() * 7, fr = .004 + Math.random() * .01, ph = Math.random() * 7, dark = Math.random() < .6;
    x.strokeStyle = dark ? `rgba(30,14,6,${.08 + Math.random() * .22})` : `rgba(190,120,70,${.05 + Math.random() * .12})`; x.lineWidth = .6 + Math.random() * 2.2;
    x.beginPath(); for (let px = 0; px <= 1024; px += 8) { const py = y0 + Math.sin(px * fr + ph) * amp; if (px) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke();
  }
  noise(x, 1024, 256, 12000, .04);
  return c;
}
function paintGlow() {
  const c = cnv(256, 205), x = c.getContext('2d');
  x.shadowColor = '#fff'; x.shadowBlur = 22; x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 5; rr(x, 41, 41, 174, 123, 10); x.stroke();
  x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,.08)'; rr(x, 41, 41, 174, 123, 10); x.fill();
  return c;
}
function paintMine() {
  const c = cnv(256, 64), x = c.getContext('2d');
  x.fillStyle = 'rgba(10,22,30,.85)'; rr(x, 4, 6, 248, 52, 4); x.fill(); x.strokeStyle = '#84d9fd'; x.lineWidth = 3; x.stroke();
  x.fillStyle = '#84d9fd'; x.font = F_H(30); x.textAlign = 'center'; x.fillText('ВАШ ВЫБОР', 128, 43);
  return c;
}
function paintGlowDot() {   // мягкое круглое свечение (кнопка)
  const c = cnv(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c;
}
function paintSpk() {   // значок «говорит»: зелёный круг с микрофоном
  const c = cnv(128, 128), x = c.getContext('2d');
  x.shadowColor = '#5fe39a'; x.shadowBlur = 18; x.fillStyle = 'rgba(16,40,26,.92)'; x.beginPath(); x.arc(64, 64, 44, 0, 7); x.fill();
  x.shadowBlur = 0; x.strokeStyle = '#5fe39a'; x.lineWidth = 5; x.stroke();
  x.fillStyle = '#c9ffdc'; rr(x, 52, 32, 24, 40, 12); x.fill();
  x.strokeStyle = '#c9ffdc'; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.arc(64, 60, 21, .15, Math.PI - .15); x.stroke(); x.beginPath(); x.moveTo(64, 82); x.lineTo(64, 94); x.stroke();
  return c;
}
function paintPlate(n) {
  const c = cnv(128, 64), x = c.getContext('2d');
  x.fillStyle = '#c9cfd6'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#14181d'; x.font = F_H(48); x.textAlign = 'center'; x.fillText(nn(n), 64, 50);
  return c;
}
function paintDecal(n, b) {
  const c = cnv(512, 512), x = c.getContext('2d');
  x.strokeStyle = 'rgba(233,238,243,.55)'; x.lineWidth = 7;
  [[30, 30, 1, 1], [482, 30, -1, 1], [30, 482, 1, -1], [482, 482, -1, -1]].forEach(([px, py, sx, sy]) => { x.beginPath(); x.moveTo(px, py + sy * 54); x.lineTo(px, py); x.lineTo(px + sx * 54, py); x.stroke(); });
  x.fillStyle = 'rgba(236,241,246,.93)'; x.textAlign = 'center'; x.font = F_H(178); x.fillText(nn(n), 256, 236);
  if (!b) { x.fillStyle = 'rgba(236,241,246,.4)'; x.font = F_H(110); x.fillText('?', 256, 420); return c; }
  x.strokeStyle = 'rgba(236,241,246,.93)'; drawSym(x, b.sym, 150, 360, 128, 13);
  x.fillStyle = 'rgba(236,241,246,.93)'; drawGun(x, b.gun, 352, 360, 230);
  return c;
}
// звание «Русской рулетки» (владелец 21.11): по очкам за всё время p.tp с сервера; у ботов — случайное, но постоянное по имени
const RK_PTS = [0, 20, 50, 90, 140, 210, 300, 420, 580, 780];
function rrRank(p) {
  if (p.bot) { let h = 7; for (const ch of String(p.name || '')) h = (h * 31 + ch.charCodeAt(0)) | 0; return 1 + Math.abs(h) % 10; }
  if (p.tp == null) return 0;   // сервер ещё без очков — значок не показываем
  let i = 0; while (i < 9 && p.tp >= RK_PTS[i + 1]) i++; return i + 1;
}
const RK_IMG = {};
function rankImg(n, onload) {   // картинка значка (SVG); пока грузится — null, по загрузке вызовет onload
  let im = RK_IMG[n]; if (!im) { im = RK_IMG[n] = new Image(); im.src = `assets/rr/ranks/rank-${n}.svg`; }
  if (im.complete && im.naturalWidth) return im;
  if (onload) im.addEventListener('load', onload, { once: true }); return null;
}
function paintTag(s, name, st2, rn) {   // над головой: номер + ник, под ником — значок звания (без свечения, владелец 21.11), ниже статус
  const c = cnv(512, 192), x = c.getContext('2d'); name = String(name || 'Игрок'); const im = rn ? rankImg(rn) : null;
  if (st2 === 'free') { x.fillStyle = 'rgba(12,15,19,.55)'; rr(x, 96, 14, 320, 60, 6); x.fill(); x.fillStyle = 'rgba(233,238,243,.5)'; x.font = F_H(34); x.textAlign = 'center'; x.fillText('СВОБОДНО', 256, 56); return c; }
  x.font = F_B(38, 800); const nm = name.length > 16 ? name.slice(0, 15) + '…' : name;
  const lab = { ready: ['ГОТОВ', '#4fd08a'], wait: ['НЕ ГОТОВ', 'rgba(233,238,243,.55)'], off: ['НЕТ СВЯЗИ', '#ff6b61'], left: ['ВЫШЕЛ', '#ff6b61'], turn: ['ХОДИТ', '#84d9fd'], dead: ['ВЫБЫЛ', '#ff6b61'], win: ['ПОБЕДИТЕЛЬ', '#4fd08a'] }[st2];
  const w = Math.min(500, Math.max(220, x.measureText(nm).width + 104)), X = 256 - w / 2;
  x.fillStyle = 'rgba(12,15,19,.78)'; rr(x, X, 8, w, 62, 5); x.fill(); x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 2; x.stroke();
  x.fillStyle = '#84d9fd'; rr(x, X + 10, 18, 42, 42, 3); x.fill(); x.fillStyle = '#0a1016'; x.font = F_H(32); x.textAlign = 'center'; x.fillText(String(s), X + 31, 51);
  x.fillStyle = '#eef2f6'; x.font = F_B(38, 800); x.textAlign = 'left'; x.fillText(nm, X + 64, 53);
  let y = 80; if (im) { x.drawImage(im, 181, y - 13.2, 150, 75); y += 57; }   // значок по центру под ником: сама плашка ~141×48 (владелец 21.11: «чуть больше»)
  if (lab) { x.font = F_H(30); const lw = x.measureText(lab[0]).width + 26; x.fillStyle = 'rgba(12,15,19,.82)'; rr(x, 256 - lw / 2, y, lw, 38, 4); x.fill(); x.fillStyle = lab[1]; x.textAlign = 'center'; x.fillText(lab[0], 256, y + 29); }
  return c;
}
function paintCardBack() {
  const c = cnv(360, 512), x = c.getContext('2d');
  x.fillStyle = '#10151b'; x.fillRect(0, 0, 360, 512);
  x.strokeStyle = 'rgba(132,217,253,.07)'; x.lineWidth = 10; for (let i = -512; i < 512; i += 30) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 512, 512); x.stroke(); }
  x.strokeStyle = 'rgba(233,238,243,.3)'; x.lineWidth = 4; x.strokeRect(14, 14, 332, 484);
  x.save(); x.translate(180, 236); x.rotate(Math.PI / 4); x.strokeStyle = '#84d9fd'; x.lineWidth = 5; x.strokeRect(-70, -70, 140, 140); x.restore();
  x.fillStyle = '#eef2f6'; x.font = F_H(62); x.textAlign = 'center'; x.fillText('КРОТ', 180, 258);
  x.fillStyle = 'rgba(233,238,243,.6)'; x.font = F_H(24); x.fillText('RUSH CASE', 180, 440);
  return c;
}
function paintCardFront(o) {
  const c = cnv(360, 512), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#1a2029'); g.addColorStop(1, '#0d1116'); x.fillStyle = g; x.fillRect(0, 0, 360, 512);
  x.strokeStyle = 'rgba(255,255,255,.2)'; x.lineWidth = 3; x.strokeRect(6, 6, 348, 500);
  const k = o && o !== 'hidden' && o.role === 'krot', ac = !o || o === 'hidden' ? '#5a6572' : k ? '#ff5c52' : '#84d9fd';
  x.fillStyle = ac; x.fillRect(6, 6, 348, 12);
  x.fillStyle = 'rgba(233,238,243,.55)'; x.font = F_B(17, 800); x.textAlign = 'left'; x.fillText('RUSH CASE · СЕКРЕТНО', 24, 50);
  if (!o || o === 'hidden') { x.fillStyle = '#eef2f6'; x.font = F_H(40); x.textAlign = 'center'; wrap(x, o ? 'КАРТОЧКА СКРЫТА' : 'ОЖИДАНИЕ БРИФИНГА', 300).forEach((l, i) => x.fillText(l, 180, 240 + i * 48)); return c; }
  x.fillStyle = ac; x.font = F_H(58); x.fillText(k ? 'КРОТ' : 'ОПЕРАТИВНИК', 22, 118);
  x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(24, 136, 312, 2);
  const cd = o.card || {};
  if (k) {
    x.fillStyle = 'rgba(233,238,243,.55)'; x.font = F_B(18, 800); x.fillText('ЦЕЛЬ', 24, 176);
    x.fillStyle = '#eef2f6'; x.font = F_H(52); x.fillText('КОНТЕЙНЕР ' + nn(cd.target), 24, 232);
    x.fillStyle = 'rgba(233,238,243,.55)'; x.font = F_B(18, 800); x.fillText('ЗАДАНИЕ · ' + String((cd.task && cd.task.title) || '').toUpperCase(), 24, 284);
    x.fillStyle = '#dfe5ea'; x.font = F_B(24, 700); wrap(x, cd.task && cd.task.text, 312).slice(0, 6).forEach((l, i) => x.fillText(l, 24, 322 + i * 32));
  } else {
    x.fillStyle = 'rgba(233,238,243,.55)'; x.font = F_B(18, 800); x.fillText('УЛИКА', 24, 176);
    x.fillStyle = '#eef2f6'; x.strokeStyle = '#eef2f6';
    if (cd.attr === 'sym') drawSym(x, cd.val, 180, 262, 110, 10); else if (cd.attr === 'gun') drawGun(x, cd.val, 180, 262, 230); else { x.fillStyle = COL[cd.val] || '#888'; x.fillRect(80, 226, 200, 70); }
    x.fillStyle = '#eef2f6'; x.font = F_B(28, 800); x.textAlign = 'center'; wrap(x, cd.text, 312).slice(0, 4).forEach((l, i) => x.fillText(l, 180, 372 + i * 36));
  }
  x.fillStyle = 'rgba(233,238,243,.4)'; x.font = F_B(15, 700); x.textAlign = 'center'; x.fillText('НЕ ПОКАЗЫВАЙ ЭТУ КАРТОЧКУ', 180, 488);
  return c;
}
function paintItem(good, gun) {
  const c = cnv(512, 256), x = c.getContext('2d');
  const col = good ? '#bfeaff' : '#ff8077';
  x.shadowColor = good ? '#84d9fd' : '#ff5c52'; x.shadowBlur = 30; x.fillStyle = col; x.strokeStyle = col;
  if (good) { drawGun(x, gun || 'rifle', 256, 120, 380); x.font = F_H(46); x.textAlign = 'center'; x.fillText('ЦЕЛЬ', 256, 238); }
  else { x.lineWidth = 16; x.lineCap = 'round'; x.beginPath(); x.moveTo(206, 60); x.lineTo(306, 160); x.moveTo(306, 60); x.lineTo(206, 160); x.stroke(); x.font = F_H(46); x.textAlign = 'center'; x.fillText('НЕ ЦЕЛЬ', 256, 238); }
  return c;
}

/* ============================================================
   Голосовой чат (этап 3): WebRTC браузер-браузер, у каждого до трёх соединений, своего сервера голоса нет.
   Сигналы — закрытый канал Realtime 'rr:<room>' (событие 'rtc'); если закрытый канал не пустили —
   запасной 'rrpub:<room>:<код>'. Только публичный STUN, без TURN: у части игроков голос может не соединиться —
   тогда видно «нет голосовой связи, пишите в чат». Поворот головы после соединения идёт напрямую (канал данных).
   Говорить: зажать V (по умолчанию) или «голосом» с порогом. Громкость и «заглушить» — у каждого, «выключить весь звук».
   ============================================================ */
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const sdpOf = d => ({ type: d.type, sdp: d.sdp });
// ядро: соединения с остальными местами. o = { seat, sid, send(msg), track() → дорожка микрофона или null, onTrack(seat, stream), onState(seat, state), onData(seat, obj) }
// Кто предлагает соединение: всегда меньшее место (столкновений «оба предложили» не бывает).
function voiceCore(o) {
  const P = {}, tries = {};
  const send = x => o.send(Object.assign({ f: o.seat, fs: o.sid }, x));
  function peer(s, sid) {
    let p = P[s];
    if (p && sid && p.sid !== sid) { close(s); p = null; }
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    p = P[s] = { s, sid, pc, q: [], st: 'new', t0: Date.now(), restarts: 0, tr: null, offered: false };
    p.dc = pc.createDataChannel('h', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
    p.dc.onmessage = e => { try { o.onData(s, JSON.parse(e.data)); } catch (x) { /* мусор */ } };
    pc.onicecandidate = e => { if (e.candidate) send({ k: 'ic', t: s, ts: p.sid, d: e.candidate.toJSON() }); };
    pc.ontrack = e => o.onTrack(s, (e.streams && e.streams[0]) || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (P[s] !== p) return;
      p.st = pc.connectionState; o.onState(s, p.st);
      if (p.st === 'failed' && o.seat < s && p.restarts < 2) { p.restarts++; p.restarting = true; offer(p).catch(() => { /* следующий привет */ }); }
    };
    return p;
  }
  async function offer(p) {
    if (!p.tr) { p.tr = p.pc.addTransceiver('audio', { direction: 'sendrecv' }); const t = o.track(); if (t) await p.tr.sender.replaceTrack(t); }
    const d = await p.pc.createOffer(p.restarting ? { iceRestart: true } : undefined); p.restarting = false;
    await p.pc.setLocalDescription(d);
    send({ k: 'of', t: p.s, ts: p.sid, d: sdpOf(p.pc.localDescription) });
  }
  async function flush(p) { const q = p.q.splice(0); for (const c of q) await p.pc.addIceCandidate(c).catch(() => { /* устарел */ }); }
  function stale(p) { return p.st === 'failed' || p.st === 'closed' || (p.st !== 'connected' && Date.now() - p.t0 > 20000); }
  async function onSig(m) {
    if (!m || !m.f || m.f === o.seat || (m.t && m.t !== o.seat) || (m.ts && m.ts !== o.sid)) return;
    const s = m.f;
    try {
      if (m.k === 'hi') {
        let p = P[s];
        if (p && (p.sid !== m.fs || stale(p))) { close(s); p = null; }
        if (o.seat < s) {
          if (p && p.offered) return;
          if ((tries[s] = (tries[s] || 0) + 1) > 6) return;   // не соединяемся раз за разом — хватит
          p = peer(s, m.fs); p.offered = true; await offer(p);
        } else if (!m.t) send({ k: 'hi', t: s, ts: m.fs });   // ответ на приветствие: соединение начнёт меньшее место
        return;
      }
      if (m.k === 'of') {
        let p = P[s];
        if (p && (p.sid !== m.fs || p.st === 'failed' || p.st === 'closed')) { close(s); p = null; }
        p = peer(s, m.fs);
        await p.pc.setRemoteDescription(m.d);
        if (!p.tr) {
          p.tr = p.pc.getTransceivers().find(x => x.receiver && x.receiver.track && x.receiver.track.kind === 'audio') || null;
          if (p.tr) { p.tr.direction = 'sendrecv'; const t = o.track(); if (t) await p.tr.sender.replaceTrack(t); }
        }
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        send({ k: 'an', t: s, ts: m.fs, d: sdpOf(p.pc.localDescription) });
        await flush(p);
        return;
      }
      const p = P[s]; if (!p || (m.fs && p.sid !== m.fs)) return;
      if (m.k === 'an') { if (p.pc.signalingState === 'have-local-offer') { await p.pc.setRemoteDescription(m.d); await flush(p); } }
      else if (m.k === 'ic') { if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.d).catch(() => { /* устарел */ }); else p.q.push(m.d); }
      else if (m.k === 'by') close(s);
    } catch (e) { console.warn('KROT voice', m.k, e && e.message); }
  }
  function close(s) { const p = P[s]; if (!p) return; delete P[s]; try { p.pc.close(); } catch (e) { /* уже */ } o.onState(s, 'closed'); }
  return {
    P, onSig,
    hello: () => send({ k: 'hi' }),
    setTrack: t => { for (const s in P) { const p = P[s]; if (p.tr) p.tr.sender.replaceTrack(t || null).catch(() => { /* не важно */ }); } },
    sendData: obj => { const j = JSON.stringify(obj); let n = 0; for (const s in P) { const d = P[s].dc; if (d && d.readyState === 'open') { try { d.send(j); n++; } catch (e) { /* закрыт */ } } } return n; },
    dcOpen: s => !!(P[s] && P[s].dc && P[s].dc.readyState === 'open'),
    state: s => (P[s] ? P[s].st : 'none'),
    close: () => { for (const s in P) { send({ k: 'by', t: +s }); close(s); } }
  };
}

const VC = { core: null, room: 0, seat: 0, sid: '', ready: false, sendRaw: null, mic: null, track: null, ac: null, an: null, buf: null, lvl: 0,
  guard: LS.get('echoguard', true), aec: true, loudUntil: 0,
  mode: LS.get('vmode', 'ptt'), thr: LS.get('vthr', .1), deaf: LS.get('deaf', false), self: LS.get('selfmute', false), vol: LS.get('vvol', {}), mute: LS.get('vmute', {}),
  rem: {}, ptt: false, tx: false, txUntil: 0, err: '', micErr: '', tick: 0, helloAt: 0, needTap: false, demo: false, spkFake: {} };
const vkey = p => p ? String(p.pid || p.name || p.seat) : '';
function vcJoin(id, seat, demo) {
  if (VC.room === id && VC.seat === seat) return;
  vcLeave();
  if (!window.RTCPeerConnection && !demo) { VC.err = 'Браузер не поддерживает голосовой чат — пишите в чат.'; return; }
  Object.assign(VC, { room: id, seat, sid: uuid().slice(0, 8), ready: false, demo: !!demo, rem: {}, err: '', needTap: false, spkFake: {} });
  if (!demo) VC.core = voiceCore({ seat, sid: VC.sid, send: m => vcSend(m), track: () => VC.track,
    onTrack: vcTrack, onState: (s, st) => { const r = VC.rem[s] || (VC.rem[s] = {}); r.st = st; vcDraw(); },
    onData: (s, d) => { if (d && d.h && G) G.head(s, d.h[0], d.h[1]); } });
  vcMic();
  clearInterval(VC.tick); VC.tick = setInterval(vcTick, 100);
}
function vcLeave() {
  clearInterval(VC.tick); VC.tick = 0;
  if (VC.core) { try { VC.core.close(); } catch (e) { /* уже */ } VC.core = null; }
  for (const s in VC.rem) { const r = VC.rem[s]; if (r.audio) { r.audio.srcObject = null; r.audio.remove(); } }
  VC.rem = {};
  if (VC.mic) VC.mic.getTracks().forEach(t => t.stop());
  if (VC.ac) VC.ac.close().catch(() => { /* уже */ });
  Object.assign(VC, { room: 0, seat: 0, ready: false, sendRaw: null, mic: null, track: null, ac: null, an: null, lvl: 0, tx: false, ptt: false });
  if (G) for (const s of SEATS) G.speak(s, false);
}
function vcSend(m) { if (VC.ready && VC.sendRaw) { try { VC.sendRaw(m); } catch (e) { /* канал не готов */ } } }
function vcSigReady(sendRaw) { VC.sendRaw = sendRaw; VC.ready = true; if (VC.core) VC.core.hello(); VC.helloAt = Date.now(); vcDraw(); }
async function vcMic(dev) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { VC.micErr = 'Браузер не даёт доступ к микрофону'; vcDraw(); return; }
  dev = dev != null ? dev : LS.get('mic', '');
  const room0 = VC.room;
  let st;
  try { st = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: dev ? { exact: dev } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) {
    if (dev) return vcMic('');   // выбранного микрофона больше нет — берём обычный
    VC.micErr = e && e.name === 'NotAllowedError' ? 'Нет доступа к микрофону — вас не слышно (разрешите микрофон у адреса сайта)' : e && e.name === 'NotFoundError' ? 'Микрофон не найден — вас не слышно' : 'Микрофон не запустился';
    vcDraw(); return;
  }
  if (VC.room !== room0 || !VC.room) { st.getTracks().forEach(t => t.stop()); return; }
  if (VC.mic) VC.mic.getTracks().forEach(t => t.stop());
  VC.mic = st; VC.track = st.getAudioTracks()[0] || null; VC.micErr = '';
  try { const ss = VC.track && VC.track.getSettings ? VC.track.getSettings() : {}; VC.aec = ss.echoCancellation !== false; } catch (e) { VC.aec = true; }
  if (VC.track) VC.track.enabled = false;
  if (VC.core) VC.core.setTrack(VC.track);
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!VC.ac) VC.ac = new AC();
    if (VC.ac.state === 'suspended') VC.ac.resume();
    VC.an = VC.ac.createAnalyser(); VC.an.fftSize = 512; VC.buf = new Float32Array(VC.an.fftSize);
    VC.ac.createMediaStreamSource(st).connect(VC.an);
  } catch (e) { VC.an = null; }
  LS.set('mic', dev || '');
  vcDraw();
}
function vcTrack(s, stream) {
  const r = VC.rem[s] || (VC.rem[s] = {});
  if (!r.audio) { r.audio = document.createElement('audio'); r.audio.autoplay = true; r.audio.setAttribute('playsinline', ''); r.audio.style.display = 'none'; document.body.appendChild(r.audio); }
  r.audio.srcObject = stream;
  const spk = LS.get('spk', ''); if (spk && r.audio.setSinkId) r.audio.setSinkId(spk).catch(() => { /* устройство пропало */ });
  vcApplyVol();
  const p = r.audio.play(); if (p && p.catch) p.catch(() => { VC.needTap = true; vcDraw(); });
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!VC.ac) VC.ac = new AC();
    r.an = VC.ac.createAnalyser(); r.an.fftSize = 512; r.buf = new Float32Array(r.an.fftSize);
    VC.ac.createMediaStreamSource(stream).connect(r.an);
  } catch (e) { r.an = null; }
}
function vcApplyVol() {
  for (const s in VC.rem) {
    const r = VC.rem[s], p = S && S.players.find(x => x.seat === +s), k = vkey(p);
    if (!r.audio) continue;
    r.audio.volume = clamp(VC.vol[k] != null ? VC.vol[k] : 1, 0, 1);
    r.audio.muted = !!(VC.deaf || VC.mute[k]);
  }
}
const rms = (an, buf) => { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };
function vcTick() {
  const now = Date.now();
  VC.lvl = VC.an ? Math.min(1, rms(VC.an, VC.buf) * 5) : 0;
  // кто говорит у остальных (по громкости); заодно — слышу ли я сейчас кого-то (heard)
  let heard = 0;
  for (const s of SEATS) {
    if (s === VC.seat) continue;
    const r = VC.rem[s]; let on = false;
    if (r && r.an && !(r.audio && r.audio.muted)) { const l = rms(r.an, r.buf); heard = Math.max(heard, l); if (l > .02) r.until = now + 280; on = now < (r.until || 0); }
    if (VC.spkFake[s] && now < VC.spkFake[s]) on = true;
    if (r) r.spk = on; else if (on) (VC.rem[s] = {}).spk = on;
    if (G) G.speak(s, on);
  }
  // передаю ли я: V зажата или «голосом» выше порога (хвост 0,4 с), микрофон не выключен.
  // Подавление эха: пока я слышу других, микрофон пропускает только явную речь (громче 0,25) — тихий звук
  // из наушников, который ловит гарнитура, обратно не уходит, и никто не слышит сам себя с задержкой.
  if (VC.lvl > .25) VC.loudUntil = now + 500;
  const gate = VC.guard && heard > .02 && now > (VC.loudUntil || 0);
  if (VC.mode === 'vad' && VC.lvl > VC.thr) VC.txUntil = now + 400;
  const want = !!VC.track && !VC.self && !rrSilent() && (VC.mode === 'ptt' ? VC.ptt : now < VC.txUntil), tx = want && !gate;
  if (VC.track && VC.track.enabled !== tx) VC.track.enabled = tx;
  if (want !== VC.tx) { VC.tx = want; vcDraw(); }   // «В эфире» — пока V зажата (подавление эха индикатором не мигает)
  // повторный привет тем, с кем ещё нет связи (новый игрок, обновил страницу, сорвалось)
  if (VC.core && VC.ready && now - VC.helloAt > 8000 && S && S.players.some(p => !p.me && !p.left && VC.core.state(p.seat) !== 'connected')) { VC.helloAt = now; VC.core.hello(); }
  if (ov === 'players' || ov === 'voice') vcLiveOv();
  const m = root && $('#krLdLvl', root); if (m) m.style.transform = `scaleX(${VC.lvl.toFixed(3)})`;
  const ml = root && $('#krVsLvl', root); if (ml) ml.style.transform = `scaleX(${VC.lvl.toFixed(3)})`;
}
// состояние голоса одной строкой (шапка чата, загрузка, окно голоса)
function vcSummary() {
  if (VC.err) return { cls: 'bad', t: VC.err };
  if (VC.demo) return { cls: '', t: VC.micErr ? VC.micErr : 'Демо: ботов не слышно, ваш микрофон проверяется' };
  const others = S ? S.players.filter(p => !p.me && !p.left && !p.bot) : [];
  const ok = others.filter(p => VC.core && VC.core.state(p.seat) === 'connected'), bad = others.filter(p => VC.rem[p.seat] && VC.rem[p.seat].st === 'failed');
  let t = !VC.ready ? 'Голос: подключение…' : others.length ? `Голос: ${ok.length} из ${others.length}` : 'Голос: ждём игроков';
  if (bad.length) t += ` · нет связи: ${bad.map(p => p.name).join(', ')} — пишите в чат`;
  return { cls: bad.length ? 'warn' : ok.length === others.length && others.length ? 'ok' : '', t };
}
function vcDraw() {
  if (!root) return;
  const c = $('#krVc', root);
  if (c) {
    const sm = vcSummary();
    c.className = 'kr-vc ' + (VC.tx ? 'tx' : sm.cls) + (VC.needTap ? ' tap' : '');
    c.innerHTML = `${VC.micErr || VC.self ? ICO.micOff : ICO.mic}<span>${VC.needTap ? 'Нажмите — включить звук' : VC.tx ? 'В эфире' : VC.micErr ? 'Микрофон выкл.' : VC.self ? 'Микрофон выкл.' : VC.mode === 'ptt' ? 'V — говорить' : 'Голосом'}</span>`;
    c.title = sm.t + (VC.micErr ? ' · ' + VC.micErr : '') + ' · настройки голоса';
  }
  const air = $('#krAir', root); if (air) air.hidden = !VC.tx;
  const ld = $('#krLdVs', root); if (ld) { const sm = vcSummary(); ld.textContent = VC.micErr || sm.t; ld.className = 'kr-micst ' + (VC.micErr ? 'bad' : sm.cls); }
}
// живые части окон «Игроки» и «Голос» (не перерисовываем ползунки под рукой)
function vcLiveOv() {
  const el = root && $('#krOv', root); if (!el) return;
  el.querySelectorAll('[data-spk]').forEach(i => { const s = +i.dataset.spk, r = VC.rem[s]; i.classList.toggle('on', s === VC.seat ? VC.tx : !!(r && r.spk)); });
  el.querySelectorAll('[data-vst]').forEach(i => { const s = +i.dataset.vst; i.textContent = vcPeerText(s); });
  const sm = $('#krVsSum', el); if (sm) sm.textContent = vcSummary().t;
}
function vcPeerText(s) {
  if (s === VC.seat) return VC.micErr ? 'микрофон выкл.' : VC.tx ? 'в эфире' : '';
  if (VC.demo) return 'бот';
  const st = VC.core ? VC.core.state(s) : 'none';
  return st === 'connected' ? 'голос есть' : st === 'failed' ? 'нет голоса' : 'соединяем…';
}
function vcKey(down) { if (VC.ptt !== down) { VC.ptt = down; vcTick(); } }
async function vcDevices() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications'); } catch (e) { return []; }
}
function vcSet(k, v) {
  if (k === 'mode') { VC.mode = v; LS.set('vmode', v); }
  if (k === 'thr') { VC.thr = v; LS.set('vthr', v); }
  if (k === 'deaf') { VC.deaf = v; LS.set('deaf', v); vcApplyVol(); }
  if (k === 'self') { VC.self = v; LS.set('selfmute', v); }
  if (k === 'guard') { VC.guard = v; LS.set('echoguard', v); }
  if (k === 'mic') { LS.set('mic', v); if (VC.room) vcMic(v); }
  if (k === 'spk') { LS.set('spk', v); for (const s in VC.rem) { const a = VC.rem[s].audio; if (a && a.setSinkId) a.setSinkId(v).catch(() => { /* нет */ }); } }
  vcDraw();
}
function vcTapPlay() { VC.needTap = false; if (VC.ac && VC.ac.state === 'suspended') VC.ac.resume(); for (const s in VC.rem) { const a = VC.rem[s].audio; if (a) a.play().catch(() => { VC.needTap = true; }); } vcDraw(); }
function vcPlayerVol(p, v) { const k = vkey(p); VC.vol[k] = v; LS.set('vvol', VC.vol); vcApplyVol(); }
function vcPlayerMute(p) { const k = vkey(p); if (VC.mute[k]) delete VC.mute[k]; else VC.mute[k] = 1; LS.set('vmute', VC.mute); vcApplyVol(); }

// самопроверка (только localhost): n ядер в одной странице (как стол на 4), звук генераторов, сигналы — как через канал комнаты
async function voiceSelfTest(n = 4) {
  const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
  const mk = fq => { const o = ac.createOscillator(), d = ac.createMediaStreamDestination(); o.frequency.value = fq; o.connect(d); o.start(); return d.stream.getAudioTracks()[0]; };
  const C = {}, an = {}, data = {}, log = [];
  const bus = m => setTimeout(() => { log.push(m.k); for (const k in C) if (+k !== m.f) C[k].onSig(JSON.parse(JSON.stringify(m))); }, 3 + Math.random() * 20);   // всем, как широковещание; лишнее отсекает само ядро
  for (let i = 1; i <= n; i++) {
    const tr = mk(300 + i * 110);
    C[i] = voiceCore({ seat: i, sid: 's' + i + uuid().slice(0, 4), send: bus, track: () => tr,
      onTrack: (s2, st) => { const el = new Audio(); el.muted = true; el.srcObject = st; el.play().catch(() => { /* без звука */ }); const x = ac.createAnalyser(); x.fftSize = 512; ac.createMediaStreamSource(st).connect(x); an[i + '<' + s2] = x; },
      onState: () => { /* */ }, onData: (s2, d) => { data[i + '<' + s2] = d; } });
  }
  shuffle(Object.keys(C)).forEach((k, j) => setTimeout(() => C[k].hello(), j * 150));   // здороваются в случайном порядке
  const pairs = []; for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) if (i !== j) pairs.push([i, j]);
  const allOk = () => pairs.every(([i, j]) => C[i].state(j) === 'connected' && C[i].dcOpen(j));
  for (let t = 0; t < 120 && !allOk(); t++) await new Promise(r => setTimeout(r, 100));
  for (let i = 1; i <= n; i++) C[i].sendData({ h: [i / 10, -i / 10] });
  await new Promise(r => setTimeout(r, 1200));
  const lv = pairs.map(([i, j]) => (an[i + '<' + j] ? rms(an[i + '<' + j], new Float32Array(512)) : 0));
  const res = { peers: n, allConnected: allOk(), links: pairs.length, audioMin: +Math.min(...lv).toFixed(3), dataLinks: Object.keys(data).length,
    sigs: log.reduce((o, k) => (o[k] = (o[k] || 0) + 1, o), {}) };
  for (const k in C) C[k].close(); ac.close();
  return res;
}

/* ============================================================
   Подбор матча как в CS2 — работает на любой странице сайта.
   Группа на главном (плюс у агента) → «Играть» → «Поиск игры» вместо баланса → «Ваша игра готова!» →
   «Принять» (15 с) → квадратики «Готово: N/5» → все приняли → игра (#/krot).
   Сервер: rr_mm_state, rr_search, rr_accept, rr_party_* (supabase/roulette.sql, раздел «Группы и подбор»; в коде — имена krot_*, SRV меняет их на rr_*).
   На localhost без входа — демо-подбор с ботами (MMDemo), на сайте его нет.
   ============================================================ */
const MM = { on: false, st: null, at: 0, off: 0, busy: false, t: 0, w: null, clock: 0, lastNote: 0, game: 0, match: 0, accepted: false,
  blink: 0, title: '', demo: false, hold: LS.get('hold', false), menuKey: '' };
const mmApi = (n, a) => MM.demo ? MMDemo.rpc(n, a || {}) : SRV.rpc(n, a);
const ICO_MAN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="4.2" fill="currentColor"/><path d="M3.8 21c.6-4.6 4-7.4 8.2-7.4s7.6 2.8 8.2 7.4Z" fill="currentColor"/></svg>';
const ICO_MODE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 21 7v10l-9 4.5L3 17V7Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>';
const mmFmt = ms => fmt(Math.max(0, Math.floor(ms / 1000)));

K.mmInit = dep => {
  setDeps(dep);
  if (MM.on) return;
  if (!authed()) return;   // без входа подбора нет (демо включается кнопкой «Играть»)
  MM.demo = false; MM.on = true; mmPoll();
};
K.mmRoute = () => { if (MM.st) mmDraw(); };
K.mmPlay = async () => {
  if (!authed() && !DEMO_OK) { if (openAuth) openAuth('login'); return; }
  if (!authed()) MM.demo = true;
  mmAudio(); mmSoundEl('ready'); mmSoundEl('connect');   // звуки заранее — к «Ваша игра готова!» уже скачаны
  const s = MM.st, p = s && s.party;
  if (p && p.state === 'search') return mmCancel();
  if (s && s.match) return;                        // окно «Принять» уже на экране
  if (s && s.game && !MM.demo) return goGame(s.game);   // ваша игра ещё идёт (ушли со стола на главную) — «Найти игру» возвращает в неё
  if (p && !p.leader) return mmToast('Поиск запускает лидер группы', 'warn');
  if (MM.busy) return; MM.busy = true;
  try { MM.on = true; mmApply(await mmApi('krot_search', { p_on: true })); mmSchedule(); }
  catch (e) { mmToast(errText(e), 'err'); }
  finally { MM.busy = false; }
};
K.mmInvite = async () => {
  if (!authed() && !DEMO_OK) { if (openAuth) openAuth('login'); return; }
  if (!authed()) MM.demo = true;
  MM.hold = true; LS.set('hold', true);
  if (!MM.st || !MM.st.party) { try { MM.on = true; mmApply(await mmApi('krot_party_open')); mmSchedule(); } catch (e) { return mmToast(errText(e), 'err'); } }
  mmWin(true);
};
K.mmJoin = async code => {
  if (!authed()) { if (openAuth) openAuth('login'); return; }
  MM.demo = false;
  try { MM.on = true; MM.hold = true; LS.set('hold', true); mmApply(await mmApi('krot_party_join', { p_code: code })); mmSchedule(); mmToast('Вы в группе ' + code); mmWin(true); }
  catch (e) { mmToast(errText(e), 'err'); }
};
async function mmCancel() {
  try { mmApply(await mmApi('krot_search', { p_on: false })); } catch (e) { mmToast(errText(e), 'err'); }
  mmSchedule();
}
function mmStop() {
  MM.on = false; clearTimeout(MM.t); clearInterval(MM.clock); MM.clock = 0;
  if (MM.w) { MM.w.terminate(); MM.w = null; }
  MM.st = null; MM.match = 0;
  try { localStorage.removeItem('krot:mm'); } catch (e) { /* приватный режим */ }
  mmPopupClose(); mmTitle(false); mmDraw(); mmWin(false);
}

/* опрос: в поиске — 2 с, «Принять» — 1 с, группа — 4 с, во время игры — 8 с. Таймер — в отдельном потоке (фоновая вкладка) */
function mmTick(ms) {   // срабатывает только последний заказанный таймер — два опроса параллельно не идут
  clearTimeout(MM.t); const tk = MM.tk = (MM.tk || 0) + 1;
  try {
    if (!MM.w) { MM.w = new Worker(URL.createObjectURL(new Blob(['onmessage=function(e){setTimeout(function(){postMessage(e.data.tk)},e.data.ms)}'], { type: 'text/javascript' }))); MM.w.onmessage = e => { if (e.data === MM.tk) mmPoll(); }; }
    MM.w.postMessage({ ms, tk });
  } catch (e) { MM.t = setTimeout(() => { if (tk === MM.tk) mmPoll(); }, ms); }
}
async function mmPoll() {
  if (!MM.on) return;
  if (!MM.demo && !authed()) return mmStop();
  try {   // ответ опроса устарел, если пока он шёл, сработало действие («Играть», «Принять»…) — его не применяем
    const q = MM.seq, d = await mmApi('krot_mm_state');
    if (q !== MM.seq || MM.busy) return mmTick(1000);
    mmApply(d);
  } catch (e) { if (/not authenticated/.test(errMsg(e))) return mmStop(); }
  mmSchedule();
}
function mmSchedule() {
  if (!MM.on) return;
  const s = MM.st, p = s && s.party;
  if (!p && !(s && s.game)) return mmStop();   // группы нет — опрашивать нечего
  if (p && pnum(p) === 1 && p.state === 'idle' && !s.game && !s.match && !MM.hold) {   // один и не ищет — группа не нужна
    if (MM.busy) return mmTick(1000);   // идёт «Играть» — состояние «один, без поиска» могло устареть
    mmApi('krot_party_leave').then(x => { mmApply(x); mmSchedule(); }, () => mmTick(2000));   // не вышли (сервер: идёт «Принять») — опрос не останавливаем
    return;
  }
  mmTick(s.match ? 1000 : p && p.state === 'search' ? 2000 : s.game ? 8000 : 4000);
}

function mmApply(s) {
  if (!s) return;
  MM.seq = (MM.seq || 0) + 1;
  const prev = MM.st; MM.st = s; MM.at = Date.now(); MM.off = (s.now || Date.now()) - Date.now();
  try { if (s.party || s.game) localStorage.setItem('krot:mm', '1'); else localStorage.removeItem('krot:mm'); } catch (e) { /* приватный режим */ }
  const p = s.party;
  if (p && pnum(p) > 1 && !MM.hold) { MM.hold = true; LS.set('hold', true); }
  if (!p && MM.hold) { MM.hold = false; LS.set('hold', false); }
  // события группы — один раз
  const n = p && p.note;
  if (n && n.at && n.at !== MM.lastNote) { const fresh = (Date.now() + MM.off) - n.at < 10000; MM.lastNote = n.at; if (prev || fresh) mmNoteFor(n); }
  // найден матч → окно «Ваша игра готова!»
  const gameNew = !!(s.game && s.game !== MM.game);
  if (s.match) {
    if (MM.match !== s.match.room) { MM.match = s.match.room; MM.accepted = false; mmSound('ready'); mmTitle(true); }
    mmPopup(s.match);
  } else if (MM.match) { MM.match = 0; mmTitle(false); if (!gameNew) { mmSound('ready', false); mmPopupClose(); } }
  // все приняли → звук запуска, 5/5 на секунду, экран загрузки игры
  if (gameNew) {
    MM.game = s.game; mmTitle(false); mmSound('ready', false);
    const g = s.game, ov = document.getElementById('krmmOv');
    if (!MM.accepted && document.visibilityState !== 'visible') { mmPopupClose(); }   // фоновая вкладка: игра уже открыта там, где приняли
    else { mmSound('connect'); if (ov) { mmPopupAll(); setTimeout(() => { mmPopupClose(); goGame(g); }, 900); } else goGame(g); }
  }
  if (!s.game) MM.game = 0;
  mmDraw();
}
function mmNoteFor(n) {
  const nm = (n.names || []).join(', '), many = (n.names || []).length > 1;
  const t = { missed: n.me ? 'Вы не приняли игру. Поиск остановлен.' : `${nm} не ${many ? 'приняли' : 'принял'} игру. Поиск остановлен.`,
    requeue: 'Не все игроки приняли матч. Поиск продолжается.', join: n.me ? '' : `${nm} — в вашей группе`,
    left: n.me ? '' : `${nm} вышел из группы`, kicked: n.me ? '' : `${nm} убран из группы`, gone: `${nm} пропал со связи и вышел из группы`,
    cancel: n.me ? '' : `${nm} отменил поиск` }[n.kind];
  if (t) mmToast(t, n.kind === 'missed' ? 'err' : n.kind === 'requeue' ? 'warn' : '');
}
function goGame(id) {
  if (id === 'demo') { Demo.quick = true; if (location.hash === '#/krot/demo') { const el = $('#kr'); if (el) K.mount(el, 'demo'); } else location.hash = '#/krot/demo'; return; }
  LS.set('room', id);
  if (/^#\/krot\/?$/.test(location.hash) || location.hash.indexOf('#/krot/') === 0) {
    if (root && view === 'room' && room === id) return;
    const el = $('#kr'); if (el) K.mount(el); else location.hash = '#/krot';
  } else location.hash = '#/krot';
}

/* ---------- окно «Ваша игра готова!» ---------- */
function mmPopup(m) {
  let ov = document.getElementById('krmmOv');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'krmmOv'; ov.className = 'krmm-ov';
    ov.innerHTML = `<section class="krmm-ready" role="alertdialog" aria-labelledby="krmmH"><h2 id="krmmH">Ваша игра готова!</h2>
      <p class="krmm-mode"><i>${ICO_MODE}</i><b>Русская рулетка</b><span>•</span><span>Подпольное казино</span></p><div class="krmm-body"></div><b class="krmm-t" id="krmmT"></b></section>`;
    ov.addEventListener('click', e => { if (e.target.closest('.krmm-acc')) mmAccept(); });
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('in'));
    if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { /* нет захвата */ }
  }
  const mine = m.me_ready || MM.accepted, acc = Math.max(m.accepted || 0, mine && !m.me_ready ? 1 : 0);
  const body = ov.querySelector('.krmm-body'), key = (mine ? 'a' : 'w') + acc;
  if (body.dataset.k !== key) {
    body.dataset.k = key;
    body.innerHTML = mine
      ? `<div class="krmm-sq">${[0, 1, 2, 3, 4].map(i => `<i class="${i < acc ? 'on' : ''}">${ICO_MAN}</i>`).join('')}</div><p class="krmm-n">Готово: <b>${acc}</b> / 5</p>`
      : '<button class="krmm-acc" type="button">Принять</button><p class="krmm-srv">5 игроков · игровой сервер RUSH CASE</p>';
  }
  mmPopupClock();
}
function mmPopupClock() {
  const t = document.getElementById('krmmT'), m = MM.st && MM.st.match; if (!t || !m) return;
  t.textContent = mmFmt(m.deadline - (Date.now() + MM.off));
}
function mmPopupAll() {   // все приняли: четыре зелёных квадрата
  const b = document.querySelector('#krmmOv .krmm-body'); if (!b) return;
  b.dataset.k = 'all'; b.innerHTML = `<div class="krmm-sq">${[0, 1, 2, 3, 4].map(() => `<i class="on">${ICO_MAN}</i>`).join('')}</div><p class="krmm-n">Готово: <b>5</b> / 5</p>`;
}
function mmPopupClose() {
  const ov = document.getElementById('krmmOv'); if (!ov) return;
  ov.classList.remove('in'); setTimeout(() => ov.remove(), 220);
}
async function mmAccept() {
  if (MM.accepted || !MM.st || !MM.st.match) return;
  MM.accepted = true; mmTitle(false); mmBeep('tap'); mmPopup(MM.st.match);
  try { mmApply(await mmApi('krot_accept')); mmSchedule(); }
  catch (e) { MM.accepted = false; mmToast(errText(e), 'err'); mmPoll(); }
}
function mmTitle(on) {
  clearInterval(MM.blink); MM.blink = 0;
  if (MM.title) { document.title = MM.title; MM.title = ''; }
  if (!on) return;
  MM.title = document.title; let k = 0;
  MM.blink = setInterval(() => { document.title = (k++ % 2) ? MM.title : '▶ ИГРА НАЙДЕНА — RUSH CASE'; }, 900);
}
function mmAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    if (!window.__krAC) window.__krAC = new AC();
    if (window.__krAC.state === 'suspended') window.__krAC.resume();
    return window.__krAC;
  } catch (e) { return null; }
}
const MM_SND = { ready: 'assets/main/krot-ready.mp3', connect: 'assets/main/krot-connect.mp3' }, mmAud = {};
const MM_VOL = { ready: .28, connect: .32 };   // владелец: «тише, бьют по ушам»
function mmSoundEl(k) { let a = mmAud[k]; if (!a) { a = mmAud[k] = new Audio(MM_SND[k]); a.preload = 'auto'; a.volume = MM_VOL[k] || .3; } return a; }
function mmSound(k, on = true, force = false) {
  const a = mmSoundEl(k);
  if (!on) { try { a.pause(); a.currentTime = 0; } catch (e) { /* не играл */ } return; }
  if (!force && !soundOn()) return;
  try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => mmBeep(k === 'ready' ? 'found' : 'ok', force)); } catch (e) { mmBeep('ok', force); }
}
function mmBeep(kind, force) {
  if (!force && !soundOn()) return;
  const ac = mmAudio(); if (!ac) return;
  const seq = kind === 'found' ? [[523, 0], [659, .14], [784, .28], [1047, .42], [784, .8], [1047, .94], [1319, 1.08]] : kind === 'ok' ? [[784, 0], [1175, .1]] : [[880, 0]];
  seq.forEach(([fq, dt]) => {
    const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + dt;
    o.type = 'triangle'; o.frequency.value = fq;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.06, t0 + .015); g.gain.exponentialRampToValueAtTime(.001, t0 + .26);
    o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + .3);
  });
}

/* ---------- поиск вместо баланса, друзья у плюса, кнопка «Играть» ---------- */
function mmDraw() {
  const s = MM.st, p = s && s.party, srch = !!(p && p.state === 'search'), found = !!(s && s.match);
  document.body.classList.toggle('krmm-on', srch || found);
  let bar = document.getElementById('krmmBar');
  if (srch || found) {
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'krmmBar'; bar.className = 'krmm-bar';
      bar.innerHTML = '<i class="krmm-spin"></i><div class="krmm-bl"><span class="krmm-bh"></span><b class="krmm-bt" id="krmmBt">0:00</b></div><span class="krmm-bm"></span><button class="krmm-x" type="button" aria-label="Отменить поиск" title="Отменить поиск">' + ICO.close + '</button>';
      bar.addEventListener('click', e => { if (e.target.closest('.krmm-x')) mmCancel(); });
    }
    bar.querySelector('.krmm-bh').textContent = found ? 'Игра найдена' : 'Поиск игры';
    bar.querySelector('.krmm-bm').innerHTML = 'Русская рулетка' + (p && pnum(p) > 1 ? `<br>лобби ${pnum(p)}/${NS}` : '');
    bar.querySelector('.krmm-x').hidden = found;
    bar.classList.toggle('found', found);
    mmPlace(bar);
    if (!MM.clock) MM.clock = setInterval(mmClock, 250);
    mmClock();
  } else {
    if (bar) bar.remove();
    clearInterval(MM.clock); MM.clock = 0;
  }
  mmSlots(); mmCard(); mmMenu();
  if (document.getElementById('krmmWin')) mmWin(true);
}
// полоса поиска: в блоке баланса (правая колонка), а если его нет на экране — плавающая справа сверху
function mmPlace(bar) {
  const lu = document.querySelector('.lu'), inLu = !!(lu && lu.offsetParent !== null && !document.body.classList.contains('pg-krot'));
  if (inLu) { if (bar.parentNode !== lu) { const top = lu.querySelector('.lu-top'); if (top) top.after(bar); else lu.prepend(bar); } }
  else if (bar.parentNode !== document.body) document.body.appendChild(bar);
  bar.classList.toggle('float', !inLu);
}
function mmClock() {
  const s = MM.st, p = s && s.party, bar = document.getElementById('krmmBar');
  if (bar) { if (!bar.isConnected || (bar.classList.contains('float') && document.querySelector('.lu'))) mmPlace(bar); }
  const t = p && p.search_at ? mmFmt(Date.now() + MM.off - p.search_at) : '0:00';
  const bt = document.getElementById('krmmBt'); if (bt) bt.textContent = s && s.match ? mmFmt(s.match.deadline - (Date.now() + MM.off)) : t;
  const mt = document.getElementById('krMmT'); if (mt) mt.textContent = t;
  mmPopupClock();
}
const avaHtml = m => m && m.ava && /^(https?:|\/|assets\/|data:image)/.test(m.ava) ? `<img src="${esc(m.ava)}" alt="" loading="lazy">` : `<b>${esc(((m && m.name) || '?').trim().charAt(0).toUpperCase() || '?')}</b>`;
function mmSlots() {   // владелец 20.11: друзья в лобби — компактный список справа от карточки режима на главной (клик — окно лобби); у «плюса» больше не показываем
  const inv = document.getElementById('mnInvite');
  if (inv) { const old = inv.querySelector('.krmm-mates'); if (old) { old.remove(); inv.classList.remove('krmm-has'); const lab = inv.querySelector(':scope > span'); if (lab && lab.dataset.t) lab.textContent = lab.dataset.t; } }
  const card = document.getElementById('mnKrot'); if (!card) return;
  const p = MM.st && MM.st.party, mates = p ? p.members.filter(m => !m.me).concat((p.bots || []).map(b => ({ name: b.name + ' · БОТ', online: true }))) : [];
  let box = document.getElementById('krmmFr');
  if (!mates.length) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement('div'); box.id = 'krmmFr'; box.className = 'krmm-fr'; box.addEventListener('click', () => K.mmInvite()); card.appendChild(box); }
  box.innerHTML = `<span class="krmm-frh">Лобби · ${pnum(p)}/${NS}</span>` + mates.map(m => `<span class="krmm-fri${m.online ? '' : ' off'}" title="${esc(m.name)}${m.leader ? ' — лидер лобби' : ''}${m.online ? '' : ' — нет связи'}"><i>${avaHtml(m)}</i><em>${esc(m.name)}</em>${m.leader ? '<s>лидер</s>' : ''}</span>`).join('');
}
function mmCard() {
  const b = document.querySelector('.mnk-go'); if (!b) return;
  const s = MM.st, p = s && s.party, srch = !!(p && p.state === 'search');
  b.textContent = s && s.match ? 'Игра найдена' : srch ? 'Отменить поиск' : 'Играть';
  b.classList.toggle('krmm-srch', srch);
  const lb = document.querySelector('.mnk-lb'); if (lb) { const n = pnum(p); lb.textContent = n > 1 ? `Лобби · ${n}/${NS}` : 'Лобби'; }
}
function mmMenu() {
  if (!root || view !== 'menu') return;
  const p = MM.st && MM.st.party, key = p ? p.state + pnum(p) : '-';
  if (key === MM.menuKey) return; MM.menuKey = key;
  const box = $('.kr-mbox', root), btn = box && $('[data-a="play"]', box); if (!btn) return;
  const tmp = document.createElement('div'); tmp.innerHTML = menuPlay();
  const inv = $('[data-a="invite"]', box);
  btn.replaceWith(tmp.firstElementChild); if (inv) inv.replaceWith(tmp.lastElementChild);
}

/* ---------- окно группы (плюс у агента / «Пригласить друзей») ---------- */
function mmWin(on) {
  let w = document.getElementById('krmmWin');
  if (!on) { if (w) w.remove(); return; }
  const s = MM.st, p = s && s.party; if (!p) { if (w) w.remove(); return; }
  if (!w) {
    w = document.createElement('div'); w.id = 'krmmWin'; w.className = 'krmm-win';
    w.addEventListener('click', mmWinClick); w.addEventListener('submit', e => { e.preventDefault(); const v = (w.querySelector('#krmmCode').value || '').trim().toUpperCase(); if (!/^[A-Z0-9]{6}$/.test(v)) return mmToast('Код — 6 букв и цифр', 'err'); K.mmJoin(v); });
    document.body.appendChild(w);
    requestAnimationFrame(() => w.classList.add('in'));
  }
  const key = JSON.stringify([p.code, p.state, p.leader, p.members, p.bots, p.admin]);
  if (w.dataset.k === key) return; w.dataset.k = key;
  const link = location.origin + location.pathname + '#/krot/' + p.code, bots = p.bots || [], adm = !!p.admin && p.state === 'idle';   // владелец 20.11: админ добавляет ботов в своё лобби
  // окно лобби (владелец 21.11: «интереснее, как в CS2»): состав — пять карточек в ряд, у лидера корона; код — плитками
  const crown = '<svg class="krl-crown" viewBox="0 0 20 14" aria-hidden="true"><path fill="currentColor" d="M1 4l4.5 3.5L10 1l4.5 6.5L19 4l-2 9H3z"/></svg>';
  const IC_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  const IC_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';
  const n = pnum(p), slots = [0, 1, 2, 3, 4].map(i => {
    const m = p.members[i], bt = !m && bots[i - p.members.length];
    if (bt) return `<div class="krl-s bot"><span class="krl-av"><b>Б</b></span><span class="krl-nm">${esc(bt.name)}</span><span class="krl-tag">Бот</span>${adm ? `<button class="krl-x" type="button" data-mm="bot-del" data-n="${bt.n}" title="Убрать бота" aria-label="Убрать бота">×</button>` : ''}</div>`;
    if (!m) return adm ? '<button class="krl-s free" type="button" data-mm="bot-add" title="Добавить бота"><span class="krl-av">+</span><span class="krl-nm">Свободно</span><span class="krl-tag">+ Бот</span></button>'
      : '<div class="krl-s free"><span class="krl-av">+</span><span class="krl-nm">Свободно</span><span class="krl-tag">Ждём друга</span></div>';
    return `<div class="krl-s${m.me ? ' me' : ''}${m.online ? '' : ' off'}">${m.leader ? crown : ''}<span class="krl-av">${avaHtml(m)}</span><span class="krl-nm">${esc(m.name)}</span><span class="krl-tag">${!m.online ? 'Нет связи' : m.me ? 'Вы' : m.leader ? 'Лидер' : 'В лобби'}</span>${p.leader && !m.me ? `<button class="krl-x" type="button" data-mm="kick" data-n="${i + 1}" title="Убрать из лобби" aria-label="Убрать из лобби">×</button>` : ''}</div>`;
  }).join('');
  w.innerHTML = `<section class="krmm-wp krl kr-glass" role="dialog" aria-labelledby="krmmWh"><button class="kr-ib krmm-wx" data-mm="close" aria-label="Закрыть">${ICO.close}</button>
    <span class="kr-h">Русская рулетка</span>
    <h2 class="kr-t" id="krmmWh">Лобби</h2>
    <p class="krmm-wl">Позовите друзей кодом или ссылкой — лобби ищет игру вместе, недостающих добавит подбор.</p>
    <div class="krl-party">${slots}</div>
    <div class="krl-code"><div><span>Код лобби</span><div class="krl-tiles">${[...p.code].map(ch => `<i>${esc(ch)}</i>`).join('')}</div></div>
      <div class="krl-acts"><button class="krl-b" type="button" data-mm="copy">${IC_COPY}Скопировать код</button><button class="krl-b" type="button" data-mm="link" data-link="${esc(link)}">${IC_LINK}Ссылка-приглашение</button></div></div>
    <form class="kr-join krmm-join" autocomplete="off"><input id="krmmCode" maxlength="6" placeholder="Код лобби друга" spellcheck="false" aria-label="Код лобби друга"><button class="kr-btn">Войти</button></form>
    <p class="kr-fine">${bots.length ? 'С ботами игра идёт только вашим составом: недостающих добавят боты, очков нет.' : 'Очки получают только те, кто ищет игру в одиночку — так друзья не смогут подыгрывать друг другу.'}</p>
    ${n > 1 ? '<div class="krmm-wa"><button class="kr-btn ghost sm" data-mm="leave">Выйти из лобби</button></div>' : ''}</section>`;
}
async function mmWinClick(e) {
  const w = document.getElementById('krmmWin'); if (!w) return;
  if (e.target === w) return mmWin(false);
  const b = e.target.closest('[data-mm]'); if (!b) return;
  const a = b.dataset.mm, p = MM.st && MM.st.party;
  if (a === 'close') return mmWin(false);
  if (a === 'copy' && p) return mmCopy(p.code, 'Код группы скопирован');
  if (a === 'link') return mmCopy(b.dataset.link, 'Ссылка-приглашение скопирована');
  try {
    if (a === 'kick') mmApply(await mmApi('krot_party_kick', { p_n: +b.dataset.n }));
    if (a === 'bot-add') mmApply(await mmApi('krot_party_bot', { p_add: true }));
    if (a === 'bot-del') mmApply(await mmApi('krot_party_bot', { p_add: false, p_n: +b.dataset.n }));
    if (a === 'leave') { mmApply(await mmApi('krot_party_leave')); mmWin(false); }
  } catch (x) { mmToast(errText(x), 'err'); }
  mmSchedule();
}
function mmCopy(t, msg) {
  const no = () => mmToast('Не удалось скопировать: ' + t, 'warn');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => mmToast(msg), no); else no();
}
function mmToast(t, kind = '') {
  let n = document.getElementById('krmmNote');
  if (!n) { n = document.createElement('div'); n.id = 'krmmNote'; n.setAttribute('role', 'status'); document.body.appendChild(n); }
  n.className = 'krmm-note in ' + kind; n.textContent = t;
  clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove('in'), 3600);
}

/* ---------- демо-подбор (только localhost без входа): тот же ответ, что у krot_mm_state ---------- */
const MMDemo = (() => {
  const D = {}; let st = null;
  const now = () => Date.now();
  function party() {
    if (!st.party) st.party = { id: 1, code: 'DEMO42', state: 'idle', leader: true, search_at: null, note: null, members: [{ name: myName(), me: true, leader: true, online: true }] };
    return st.party;
  }
  function step() {
    const p = st.party, t = now(); if (!p) return;
    if (p.state === 'search' && st.foundAt && t >= st.foundAt) {
      st.foundAt = 0; p.state = 'match';
      st.match = { room: 777, deadline: t + 15000, total: 15, accepted: 0, me_ready: false, players: [1, 2, 3, 4, 5].map(i => ({ seat: i, ready: false, me: i === 1, mine: i === 1 })) };
      st.bots = [t + 1400 + rnd(800), t + 2600 + rnd(1200), t + 3400 + rnd(1800), t + 4000 + rnd(2500)];
    }
    if (st.match) {
      st.match.players.forEach((pl, i) => { if (i && !pl.ready && t >= st.bots[i - 1]) pl.ready = true; });
      st.match.accepted = st.match.players.filter(x => x.ready).length;
      if (st.match.accepted === 5) { if (!st.goAt) st.goAt = t + 1500; if (t >= st.goAt) { st.match = null; st.goAt = 0; st.game = 'demo'; st.gameAt = t; } }
      else if (t >= st.match.deadline) { const me = st.match.players[0].ready; st.match = null; p.state = me ? 'search' : 'idle'; if (me) st.foundAt = t + 3000; else p.search_at = null;
        p.note = { kind: me ? 'requeue' : 'missed', names: [me ? 'Бот' : myName()], me: !me, at: t }; }
    }
    if (st.game && t - st.gameAt > 4000) { st.game = null; p.state = 'idle'; p.search_at = null; }
  }
  D.rpc = async (n, a) => {
    await new Promise(r => setTimeout(r, 50 + rnd(60)));
    if (!st) st = { party: null, match: null, game: null };
    if (n === 'krot_party_open') party();
    else if (n === 'krot_search') {
      const p = party();
      if (a.p_on) { p.state = 'search'; p.search_at = now(); p.note = null; st.game = null; st.foundAt = now() + 3000 + rnd(2500); }
      else if (p.state === 'search') { p.state = 'idle'; p.search_at = null; st.foundAt = 0; }
    } else if (n === 'krot_accept') { if (!st.match) throw new Error('no match'); st.match.players[0].ready = true; st.match.me_ready = true; }
    else if (n === 'krot_party_leave') st.party = null;
    else if (n === 'krot_party_join') throw new Error('party not found');
    step();
    return { now: now(), game: st.game, match: st.match ? Object.assign({}, st.match, { players: st.match.players.map(x => Object.assign({}, x)) }) : null,
      party: st.party ? Object.assign({}, st.party, { members: st.party.members.slice() }) : null };
  };
  return D;
})();

/* ============================================================
   Демо с ботами (только localhost): тот же протокол, что у сервера
   ============================================================ */
const Demo = (() => {   // «Русская рулетка» без сервера: боты, те же правила, что будут на сервере (supabase, этап 2)
  const D = { onPush: null, onHead: null };
  let st2 = null, iv = 0, heads = 0;
  const NAMES = shuffle(['Viper', 'Сова', 'Grizzly', 'Lynx', 'Кобра', 'Shade', 'Гром']);
  const LINES = { turn: ['Ну, с богом.', 'Моя очередь…', 'Руки трясутся, честно.', 'Давай уже.', 'Ладно, поехали.'], click: ['Фух.', 'Пусто!', 'Живой.', 'Следующий!'],
    bang: ['Минус один…', 'Жёстко.', 'Вот и раунд.', 'Ох.'], chat: ['Ага.', 'Посмотрим.', 'Удачи всем.', 'Не тяни.', '😅'] };
  const now = () => Date.now();
  const pl = (seat, me) => ({ seat, name: me ? myName() : NAMES[seat - 2], me: !!me, ready: false, online: true, left: false, loaded: false, alive: true, place: null, pts: null, clicks: 0, spins: 0, bet: null, won: null, back: null, tp: me ? 0 : Math.floor(Math.random() * 900) });
  function reset() {
    if (D.bal == null) D.bal = 3000;   // демо-баланс (настоящий не трогаем)
    st2 = { room: { id: 900001, code: 'DEMO42', kind: 'quick', points: true, money: true, phase: 'lobby', rev: 1, phase_at: now(), deadline: null, paused: false, owner: true, turn_sec: RR.turn,
      min_bet: RR.minBet, max_bet: RR.maxBet, fee: RR.fee, vote_sec: RR.voteSec, max_bul: RR.maxBul },
      players: [pl(1, true)], chat: [], cid: 0, g: null, plan: [] };
    sys('Демо-комната: проба без сервера, вместо людей — боты.');
    clearInterval(iv); iv = setInterval(step, 200); clearInterval(heads); heads = setInterval(botHeads, 700);
    if (D.quick) {   // пришли из демо-подбора: все уже приняли — экран загрузки
      D.quick = false;
      for (let s = 2; s <= NS; s++) { const p = pl(s); p.ready = true; st2.players.push(p); }
      st2.players[0].ready = true;
      st2.room.mm = true; st2.room.load_at = now(); st2.room.deadline = now() + 10000;
      st2.players.slice(1).forEach(p => later(1200 + rnd(5500), () => { p.loaded = true; bump(); }));
      return;
    }
    [1300, 2300, 3200, 4000].forEach((t, i) => later(t, () => { const p = pl(i + 2); st2.players.push(p); sys(`Игрок ${p.name} сел за стол.`); bump(); }));
    later(4900, () => { st2.players.forEach(p => { if (!p.me) p.ready = true; }); bump(); });
    later(5000, () => { if (st2.room.phase === 'lobby') { st2.room.phase_at = now(); st2.room.deadline = now() + 4000; bump(); } });
  }
  const later = (ms, fn) => { st2.plan.push([now() + ms, fn]); };
  const name = s => { const p = st2.players.find(x => x.seat === s); return p ? p.name : 'Игрок'; };
  const alive = () => st2.players.filter(p => p.alive);
  function sys(t) { st2.chat.push({ id: ++st2.cid, kind: 'sys', seat: null, name: null, text: t, at: now() }); }
  function say(seat, t) {
    const p = st2.players.find(x => x.seat === seat); if (!p || !p.alive) return;   // выбывшие молчат
    if (D.onSpeak) D.onSpeak(seat); st2.chat.push({ id: ++st2.cid, kind: 'msg', seat, name: p.name, text: t, at: now() }); bump();
  }
  function bump() { st2.room.rev++; if (D.onPush) D.onPush(); }
  function ev(kind, seat, x) { const g = st2.g; g.evn++; g.evs.push(Object.assign({ n: g.evn, kind, seat, at: now() }, x || {})); if (g.evs.length > 12) g.evs.shift(); }
  function start() {
    st2.players.forEach(p => { p.alive = true; p.place = null; p.pts = null; p.clicks = 0; p.spins = 0; p.bet = st2.room.money ? RR.minBet : null; p.won = p.back = null; });
    if (st2.room.money) D.bal -= RR.minBet;
    st2.g = { id: 70000 + rnd(9999), round: 0, n: 0, evn: 0, evs: [], votes: 0, vote: null };
    if (st2.room.money) st2.players.forEach(p => { if (!p.me && Math.random() < .75) later(2000 + rnd(10000), () => { if (st2.room.phase === 'next' && !st2.g.round) { p.bet = pickOne([250, 250, 500, 500, 1000, 1500]); ev('bet', p.seat, { bet: p.bet }); bump(); } }); });
    sys('Игра начинается. Револьвер на шесть гнёзд, патроны — в случайных гнёздах.');
    const r = st2.room; r.phase = 'next'; r.phase_at = now(); r.deadline = now() + RR.intro * 1000; bump();   // знакомство за столом, потом раунд 1 (как на сервере)
  }
  function newRound() {
    const g = st2.g, al = alive();
    g.round++; g.bullets = Math.min(RR.maxBul, (RR.bul[al.length] || 1) + (g.votes || 0));   // купленные патроны переходят в следующий раунд g.bul0 = g.bullets; g.added = 0; g.vused = []; g.vote = null; g.vby = null; g.vn = null;
    g.order = shuffle([0, 1, 2, 3, 4, 5]); g.ch = g.order.slice(0, g.bullets);   // гнёзда с патронами; патрон за голосование — следующий по порядку
    g.pos = rnd(6); g.clicks = 0;
    g.first = pickOne(al).seat; g.turn = g.first;
    ev('start', g.first, { round: g.round, bullets: g.bullets });
    sys(`Раунд ${g.round}: ${g.bullets} ${plural(g.bullets)} в барабане. Первым стреляет ${name(g.first)}.`);
    turnStart(RR.rdelay);
  }
  function turnStart(delay) {
    const g = st2.g, r = st2.room; g.n++; g.spins = 0;
    r.phase = 'play'; r.phase_at = now() + delay; r.deadline = r.phase_at + RR.turn * 1000; bump();
    const p = st2.players.find(x => x.seat === g.turn);
    if (!p.me) botTurn(p, g.n, delay);
    const vb = st2.players.find(x => x.seat === g.vby);   // бот выжил — иногда поднимает руку: +1 патрон следующему
    if (vb && !vb.me && vb.alive && g.vn === g.n && g.bullets < RR.maxBul && alive().length > 2 && Math.random() < .4) {
      const n = g.n; later(delay + 1000 + rnd(2500), () => { if (st2 && st2.g === g && g.n === n && g.vn === n && st2.room.phase === 'play' && !g.vote && g.bullets < RR.maxBul) voteOpen(vb.seat); });
    }
  }
  const vcost = () => st2.room.money ? Math.floor(Math.min(...st2.players.map(p => p.bet || Infinity)) * RR.votePct) || 0 : 0;   // половина самой маленькой ставки
  const whenFree = (n, fn) => { const g = st2.g; if (!g || g.n !== n || st2.room.phase !== 'play') return; if (g.vote) { later(900, () => whenFree(n, fn)); return; } fn(); };
  function voteOpen(seat) {
    const g = st2.g, r = st2.room, al = alive(), need = Math.ceil(al.length / 2);
    (g.vused = g.vused || []).push(seat); g.vn = null;
    g.vote = { by: seat, at: now(), until: now() + RR.voteSec * 1000, need, yes: [seat], no: [], cost: vcost(), rem: (r.deadline - now()) / 1000 };
    r.deadline = g.vote.until + 1000;
    ev('vote', seat, { need, cost: g.vote.cost });
    sys(`${name(seat)} поднимает руку: добавить патрон${g.vote.cost ? ` (−${g.vote.cost} ₽ из банка)` : ''}. Нужно «за»: ${need} из ${al.length}.`);
    al.filter(p => !p.me && p.seat !== seat).forEach(p => later(1500 + rnd(3500), () => { const v = st2 && st2.g === g ? g.vote : null; if (v && v.by === seat && p.alive && !v.yes.includes(p.seat) && !v.no.includes(p.seat)) voteCast(p.seat, Math.random() < .55); }));
    bump(); voteCheck(false);
  }
  function voteCast(seat, yes) { const v = st2.g.vote; if (!v) return; (yes ? v.yes : v.no).push(seat); bump(); voteCheck(false); }
  function voteCheck(force) {
    const g = st2.g, v = g.vote, r = st2.room; if (!v) return;
    const al = alive().length; let ok;
    if (v.yes.length >= v.need) ok = true; else if (force || v.yes.length + Math.max(0, al - v.yes.length - v.no.length) < v.need) ok = false; else return;
    ok = ok && g.bullets < RR.maxBul;
    if (ok) { g.bullets++; g.added++; g.votes++; g.vspent = (g.vspent || 0) + v.cost; g.ch = g.order.slice(0, g.bullets); }
    g.vote = null; if (r.phase === 'play') r.deadline = now() + Math.max(6, v.rem) * 1000;
    ev('vote_end', v.by, { ok, yes: v.yes.length, no: v.no.length, bullets: g.bullets, cost: ok ? v.cost : 0 });
    sys(ok ? `Голосование прошло (${v.yes.length} «за»): в барабане ${g.bullets} ${plural(g.bullets)}.` : `Голосование не прошло (${v.yes.length} «за» из ${v.need} нужных).`);
    bump();
  }
  function botTurn(p, n, delay) {   // бот: если шанс вырос после пустых щелчков — чаще крутит
    const g = st2.g, risky = rrChance(g.bullets, g.clicks) > g.bullets / 6 + .001;
    const spins = risky ? (Math.random() < .85 ? 1 + rnd(2) : 0) : (Math.random() < .3 ? 1 : 0);
    let t = delay + 1600 + rnd(2600);
    if (Math.random() < .35) later(t - 900, () => { if (g.n === n) say(p.seat, pickOne(LINES.turn)); });
    for (let i = 0; i < spins; i++) { later(t, () => whenFree(n, () => spin(p.seat))); t += 1100 + rnd(700); }
    later(t + 500 + rnd(1500), () => whenFree(n, () => shoot(p.seat, false)));
  }
  function spin(seat) { const g = st2.g; g.pos = rnd(6); g.clicks = 0; g.spins++; const p = st2.players.find(x => x.seat === seat); if (p) p.spins++; ev('spin', seat); bump(); }
  function nextSeat(s) { for (let i = 1; i <= NS; i++) { const t = (s - 1 + i) % NS + 1, p = st2.players.find(x => x.seat === t); if (p && p.alive) return t; } return s; }
  function shoot(seat, auto) {
    const g = st2.g, r = st2.room, p = st2.players.find(x => x.seat === seat);
    if (p && p.me && D.dieMe) { D.dieMe = false; if (!g.ch.includes(g.pos)) g.ch[0] = g.pos; }   // проверка: KROT.dbg.die() — ваш следующий выстрел боевой (только демо)
    if (!g.ch.includes(g.pos)) {   // пусто: барабан на гнездо дальше, ход следующему
      g.pos = (g.pos + 1) % 6; g.clicks++; p.clicks++; ev('click', seat, { auto }); g.vby = seat; g.vn = g.n + 1;   // выжил — может поднять руку в следующий ход
      if (!p.me && Math.random() < .3) later(700, () => say(seat, pickOne(LINES.click)));
      g.turn = nextSeat(seat); turnStart(1400); return;
    }
    const left = alive().length; p.alive = false; p.place = left;
    ev('bang', seat, { auto, place: left });
    sys(`${p.name} выбывает — ${left} место.`);
    r.phase = 'next'; r.phase_at = now(); r.deadline = now() + RR.next * 1000; bump();
    const w = alive().find(x => !x.me); if (w && Math.random() < .6) later(1600, () => say(w.seat, pickOne(LINES.bang)));
  }
  function finish() {
    const w = alive()[0]; if (w) w.place = 1;
    st2.players.forEach(p => { p.pts = st2.room.points ? RR.pts[p.place] || 0 : null; });
    let pay = 0;
    if (st2.room.money && w) {   // как на сервере: с каждого не больше ставки победителя, остальное назад; минус голосования и 5%
      let bank = w.bet;
      st2.players.forEach(p => { if (p === w || p.bet == null) return; const t = Math.min(p.bet, w.bet); bank += t; p.back = p.bet - t; if (p.me) D.bal += p.back; });
      pay = Math.max(0, Math.floor((bank - Math.min(bank, st2.g.vspent || 0)) * (1 - RR.fee)));
      w.won = pay; w.back = 0; if (w.me) D.bal += pay;
    }
    const r = st2.room; r.phase = 'done'; r.phase_at = now(); r.deadline = null;
    sys(`Победил ${w ? w.name : '—'}${st2.room.money ? ` и забирает ${pay} ₽` : ''}. Игра окончена.`); bump();
  }
  function step() {
    if (!st2) return;
    const t = now();
    for (let i = st2.plan.length - 1; i >= 0; i--) if (st2.plan[i][0] <= t) { const f = st2.plan[i][1]; st2.plan.splice(i, 1); f(); }
    if (st2.g && st2.g.vote && t >= st2.g.vote.until) { voteCheck(true); return; }   // время голосования вышло
    const r = st2.room; if (!r.deadline || t < r.deadline) return;
    if (r.phase === 'lobby') { if (r.mm && st2.players.some(p => !p.loaded) && t < r.load_at + 25000) return; if (st2.players.length === NS) start(); else r.deadline = null; return; }
    if (r.phase === 'play') { shoot(st2.g.turn, true); return; }   // время вышло — выстрел сам, без прокрутки
    if (r.phase === 'next') { if (alive().length <= 1) finish(); else newRound(); }
  }
  function botHeads() {   // куда смотрят боты: стреляющий — на револьвер, остальные — на него, выбывшие — вниз
    if (!st2 || !D.onHead) return;
    const r = st2.room, g = st2.g, turn = g && r.phase === 'play' ? g.turn : 0;
    st2.players.forEach(p => {
      if (p.me) return;
      if (!p.alive && r.phase !== 'lobby' && r.phase !== 'done') { D.onHead(p.seat, 0, -1); return; }
      if (Math.random() < .5) return;
      if (turn === p.seat) { D.onHead(p.seat, (Math.random() - .5) * .3, -.75); return; }
      const ex = SEAT[p.seat].x, ez = SEAT[p.seat].z, th = SEAT[p.seat].yaw, q = Math.random();
      let tx, ty, tz;
      if (turn && q < .7) { tx = SEAT[turn].x; ty = EYE; tz = SEAT[turn].z; }
      else if (q < .85) { tx = 0; ty = TOP + .03; tz = 0; }
      else { const o = st2.players[rnd(st2.players.length)]; if (o.seat === p.seat) return; tx = SEAT[o.seat].x; ty = EYE; tz = SEAT[o.seat].z; }
      const dx = tx - ex, dy = ty - EYE, dz = tz - ez; let y = Math.atan2(-dx, -dz) - th; y = Math.atan2(Math.sin(y), Math.cos(y));
      D.onHead(p.seat, y, Math.atan2(dy, Math.hypot(dx, dz)));
    });
  }
  function snap(after) {
    const r = st2.room, g = st2.g, me = st2.players.find(p => p.me);
    return { now: now(), room: Object.assign({}, r, { bank: Math.max(0, st2.players.reduce((a, p) => a + (p.bet || 0), 0) - ((g && g.vspent) || 0)), vote_cost: vcost() }), players: st2.players.map(p => Object.assign({}, p)),
      me: { seat: me.seat, ready: me.ready, alive: me.alive, bal: D.bal },
      game: g ? { id: g.id, round: g.round, bullets: g.bullets, turn: g.turn, first: g.first, clicks: g.clicks, spins: g.spins, n: g.n, evs: g.evs.slice(), ev: g.evs[g.evs.length - 1] || null,
        vote: g.vote ? JSON.parse(JSON.stringify(g.vote)) : null, votes: g.votes || 0, added: g.added || 0, bul0: g.bul0, vby: g.vby, vn: g.vn } : null,
      chat: st2.chat.filter(m => m.id > (after || 0)) };
  }
  const tick = () => ({ now: now(), phase: st2.room.phase, rev: st2.room.rev, deadline: st2.room.deadline, paused: false });
  D.rpc = async (n, a) => {
    await new Promise(res => setTimeout(res, 40 + rnd(80)));
    a = a || {};
    if (n === 'krot_quick' || n === 'krot_create' || n === 'krot_join') { reset(); return snap(0); }
    if (!st2) throw new Error('not in room');
    if (n === 'krot_state') return snap(a.p_after);
    if (n === 'krot_tick') return tick();
    if (n === 'krot_ready') { const me = st2.players.find(p => p.me); me.ready = a.p_ready; if (st2.players.length === NS && st2.players.every(p => p.ready)) { st2.room.phase_at = now(); st2.room.deadline = now() + 3000; } bump(); return { ok: true }; }
    if (n === 'rr_spin' || n === 'rr_shoot') {
      const g = st2.g, me = st2.players.find(p => p.me);
      if (!g || st2.room.phase !== 'play' || g.turn !== me.seat || !me.alive) throw new Error('not your turn');
      if (a.p_turn != null && a.p_turn !== g.n) throw new Error('not your turn');
      if (g.vote) throw new Error('vote on');
      if (n === 'rr_spin') spin(me.seat); else shoot(me.seat, false);
      return { ok: true };
    }
    if (n === 'rr_bet') {
      const g = st2.g, r = st2.room, me = st2.players.find(p => p.me), v = Math.round(+a.p_amount || 0);
      if (!r.money || me.bet == null) throw new Error('no money game');
      if (!g || r.phase !== 'next' || g.round || now() >= r.deadline - 1000) throw new Error('bets closed');
      if (v < RR.minBet || v > RR.maxBet) throw new Error('bad bet');
      if (v - me.bet > D.bal) throw new Error('low balance');
      if (v !== me.bet) { D.bal -= v - me.bet; me.bet = v; ev('bet', me.seat, { bet: v }); bump(); }
      return { ok: true, bet: v, data: null };
    }
    if (n === 'rr_vote_start' || n === 'rr_vote') {
      const g = st2.g, r = st2.room, me = st2.players.find(p => p.me);
      if (n === 'rr_vote_start') {
        if (!g || r.phase !== 'play' || !me.alive || now() >= r.deadline - 2000) throw new Error('not vote time');
        if (g.vote) throw new Error('vote on');
        if (g.bullets >= RR.maxBul) throw new Error('max bullets');
        if (alive().length <= 2) throw new Error('final no vote');
        if (g.vby !== me.seat || g.vn !== g.n) throw new Error('vote not yours');
        voteOpen(me.seat); return tick();
      }
      if (!g || !g.vote) throw new Error('no vote');
      if (!me.alive) throw new Error('not alive');
      if (g.vote.yes.includes(me.seat) || g.vote.no.includes(me.seat)) throw new Error('voted');
      voteCast(me.seat, a.p_yes !== false); return tick();
    }
    if (n === 'krot_chat_send') {
      const t = String(a.p_text || '').trim(); if (!t) throw new Error('empty');
      const me = st2.players.find(p => p.me); if (!me.alive && st2.room.phase !== 'done') throw new Error('dead');
      st2.chat.push({ id: ++st2.cid, kind: 'msg', seat: me.seat, name: me.name, text: t, at: now() });
      const bot = alive().find(p => !p.me); if (bot && Math.random() < .5) later(1500 + rnd(1500), () => say(bot.seat, pickOne(LINES.chat)));
      bump(); return { ok: true, id: st2.cid, text: t, at: now() };
    }
    if (n === 'krot_loaded') { st2.players.find(p => p.me).loaded = true; bump(); return tick(); }
    if (n === 'krot_leave') { D.stop(); return { ok: true }; }
    if (n === 'krot_report') return { ok: true };
    throw new Error('unknown ' + n);
  };
  D.stop = () => { clearInterval(iv); clearInterval(heads); iv = heads = 0; st2 = null; };
  D.skip = () => { if (st2 && st2.room.deadline) st2.room.deadline = now(); };
  D.vote = () => { const g = st2 && st2.g; if (!g || st2.room.phase !== 'play' || g.vote || g.bullets >= RR.maxBul || alive().length <= 2) return false; const b = alive().find(p => !p.me && p.seat !== g.turn); if (!b) return false; voteOpen(b.seat); return true; };   // проверка: бот поднимает руку сейчас (только демо)
  return D;
})();
K.dbg = { die: () => (DEMO_OK ? (Demo.dieMe = true) : null), vote: () => (DEMO_OK ? Demo.vote() : null), coins: n => (DEMO_OK ? coinsFly(n || 6) : null), voiceTest: n => (DEMO_OK ? voiceSelfTest(n) : null), voice: () => VC, vkey: d => (DEMO_OK ? vcKey(d) : null), state: () => S, skip: () => Demo.skip(), demo: () => api === Demo, mm: x => (DEMO_OK && x ? mmApply(x) : MM.st), world: () => (DEMO_OK ? G : null) };   // для проверки из браузера (подставить состояние подбора — только localhost)
})();

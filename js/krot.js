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
let sb = null, openAuth = null, getUser = () => null, soundOn = () => true;   // из app.js (KROT.mount / KROT.mmInit)
function setDeps(dep) { if (!dep) return; if (dep.sb) sb = dep.sb; if (dep.openAuth) openAuth = dep.openAuth; if (dep.esc) esc = dep.esc; if (dep.user) getUser = dep.user; if (dep.sound) soundOn = dep.sound; }

/* ---------- константы ---------- */
const R_SEAT = 1.08, EYE = 1.22, TOP = .765;                                   // радиус мест, высота глаз, высота сукна (м)
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
const PH = { lobby: 'Сбор группы', brief: 'Брифинг', talk: 'Обсуждение', vote: 'Фиксация выбора', revote: 'Доп. голосование',
  open: 'Вскрытие', debrief: 'Разбор операции', done: 'Операция завершена' };
const HINT = { lobby: 'Ждём четырёх игроков. Нажмите «Готов к операции», когда будете на месте.',
  brief: 'Прочитайте свою карточку — опустите взгляд или зажмите ПКМ. Остальные её не видят.',
  talk: 'Сверьте улики и найдите цель. Готовы голосовать — нажмите красную кнопку перед собой: когда нажмут все, начнётся голосование.',
  vote: 'Кликните по контейнеру (или 1–4). Выбор можно менять до конца таймера. Зажмите ЛКМ — осмотреться.',
  revote: 'Голоса разделились. Выберите один из подсвеченных контейнеров.',
  open: 'Вскрываем…', debrief: 'Роли раскрыты. Кто был Кротом?', done: '' };
const REASON = { majority: 'большинством голосов', revote: 'на доп. голосовании' };
const CANCEL = { disconnect: 'игрок не вернулся вовремя', few_votes: 'проголосовало меньше двух Оперативников', abandoned: 'все игроки вышли' };
const REPORT = [['abuse', 'Оскорбления'], ['cheat', 'Подсказки со стороны или сговор'], ['spam', 'Спам в чате'], ['afk', 'Не участвует в игре'], ['other', 'Другое']];
const ERR = { 'not authenticated': 'Войдите в аккаунт, чтобы играть', 'not in room': 'Вы не в этой комнате', 'room not found': 'Комната с таким кодом не найдена',
  'already started': 'В этой комнате игра уже идёт', 'room full': 'В комнате уже 4 игрока', 'too many rooms': 'Слишком много комнат за час — попробуйте позже',
  'not lobby': 'Игра уже началась', 'not talk': 'Кнопка работает только во время обсуждения', 'closed': 'Голосование уже закрыто', 'vote locked': 'Ваш голос уже зафиксирован', 'bad box': 'Этот контейнер сейчас выбрать нельзя',
  'empty': 'Пустое сообщение', 'too long': 'Слишком длинное сообщение', 'too fast': 'Не так быстро — подождите секунду', 'repeat': 'Такое сообщение уже было',
  'too many reports': 'Слишком много жалоб — попробуйте позже', 'bad player': 'Этого игрока выбрать нельзя',
  'not leader': 'Поиск запускает лидер группы', 'member in game': 'Кто-то из группы ещё доигрывает матч', 'in game': 'Сначала доиграйте текущий матч',
  'party not found': 'Группа с таким кодом не найдена', 'party full': 'В группе уже 4 человека', 'party busy': 'Группа сейчас принимает матч — попробуйте через полминуты',
  'match pending': 'Сначала ответьте на «Ваша игра готова!»', 'no match': 'Матч уже не ждёт ответа', 'too late': 'Время на «Принять» вышло' };
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
const errText = e => { const m = errMsg(e); for (const k in ERR) if (m.includes(k)) return ERR[k]; return /fetch|network|Failed|timeout|Load failed/i.test(m) ? 'Нет связи с сервером' : 'Не получилось: ' + m.slice(0, 90); };
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
const SRV = { async rpc(n, a) { const { data, error } = await sb.rpc(n, a || {}); if (error) throw error; return data; } };

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
  if (!saved) return drawMenu();
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
    if (e.button === 0 && drag && !drag.moved && G) { if (G.aimBtn() && canBtn()) voteReady(); else { const a = G.aim(); if (a && canPick()) vote(a); } }   // клик без перетаскивания — выбор контейнера
    drag = null; if (root) root.classList.remove('drag');
  };
  H.bu = e => { if (S && room && ['brief', 'talk', 'vote', 'revote'].includes(S.room.phase)) { e.preventDefault(); e.returnValue = ''; } };
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
  if (!down) return;
  if (e.key === 'Escape') { if (inp) { e.target.blur(); return; } if (ov) { closeOv(); return; } return; }
  if (inp || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter') { const i = $('#krIn', root); if (i) { e.preventDefault(); if (document.pointerLockElement) document.exitPointerLock(); openChat(true); i.focus({ preventScroll: true }); } return; }
  if (/^[1-4]$/.test(e.key) && canPick()) { e.preventDefault(); vote(+e.key); }
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
    G.mouse((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!drag || drag.id !== e.pointerId || (e.pointerType === 'mouse' && !(e.buttons & 1))) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
    if (drag.moved) G.look((e.clientX - drag.x) * 1.5, (e.clientY - drag.y) * 1.5);   // голова крутится, пока зажата ЛКМ
    drag.x = e.clientX; drag.y = e.clientY;
  });
  cv.addEventListener('pointerleave', () => { if (G && !drag) G.mouse(null); });
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
  else if (a === 'link') copy(S && location.origin + location.pathname + '#/krot/' + S.room.code, 'Ссылка-приглашение скопирована');
  else if (a === 'ready') ready();
  else if (a === 'leave') leaveAsk();
  else if (a === 'leave-yes') { closeOv(); leave(); }
  else if (a === 'again') again();
  else if (a === 'menu') leave(true);
  else if (a === 'copyres') copy(resultText(), 'Итог скопирован');
  else if (a === 'brief-ok') { briefSeen = S && S.round ? S.round.id : briefSeen; drawMid(); }
  else if (a === 'card-hide') { hideCard = !hideCard; LS.set('hide', hideCard); drawCard(); if (G) G.hideCard(hideCard); }
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
  if (S.room.kind !== 'private') { await leaveFinished(); roomless(); K.mmPlay(); return; }
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
async function ready() {
  if (!S || busy) return; busy = true;
  try { await api.rpc('krot_ready', { p_room: room, p_ready: !S.me.ready }); await refresh(); } catch (e) { note(errText(e), 'err'); } finally { busy = false; }
}
function leaveAsk() {
  if (S && ['brief', 'talk', 'vote', 'revote'].includes(S.room.phase)) openOv('leave'); else leave();
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
  drawMenu(); if (msg) note(msg);
}

/* ---------- голосование ---------- */
function vote(box) {
  if (!S || !S.round || box < 1 || box > 4) return;
  const ph = S.room.phase;
  if (S.room.paused) return note('Игра на паузе', 'err');
  if (ph === 'talk' || ph === 'brief') {   // черновик: уйдёт на сервер сам, когда начнётся фиксация
    draft = draft === box ? 0 : box; drawDos(); drawHint(); if (G) G.marks(marks());
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
  drawDos(); drawHint(); if (G) G.marks(marks());
  sendVote(pend);
}
async function sendVote(p) {
  const g = gen;
  try {
    const r = await api.rpc('krot_vote', { p_room: room, p_box: p.box, p_action: p.id });
    if (g !== gen || pend !== p || !S) return;
    if (p.stage === 'main') S.me.vote = r.box; else S.me.revote = r.box;
    pend = null; drawDos(); drawHint(); if (G) G.marks(marks());
  } catch (e) {
    if (g !== gen || pend !== p) return;
    if (isNet(e) && ++p.tries < 5) { timers.push(setTimeout(() => sendVote(p), 600 * p.tries)); return; }   // тот же id — сервер не засчитает дважды
    pend = null; note(errText(e), 'err'); drawDos(); drawHint(); if (G) G.marks(marks());
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
  el.innerHTML = `<span class="kr-h">Готовы голосовать</span><span class="kr-rdd">${[1, 2, 3, 4].map(st2 => { const p = S.players.find(q => q.seat === st2); return `<i class="${p && p.vote_ready ? 'on' : ''}" title="${p ? esc(p.name) + (p.vote_ready ? ' — готов' : '') : ''}"></i>`; }).join('')}</span><b>${n}/${ps.length}</b><button class="kr-btn sm ${me && me.vote_ready ? 'ghost' : 'red'}" data-a="vready">${me && me.vote_ready ? 'Отжать' : 'Я готов'}</button>`;
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
  if (m.kind === 'sys') return `<div class="kr-m sys">${esc(m.text)}</div>`;
  const mine = S && m.seat === S.me.seat, rm = /^Новая комната: ([A-Z0-9]{6})$/.exec(m.text || '');
  const body = rm && !mine ? `Новая комната: <b>${rm[1]}</b> <button class="kr-btn sm go" data-join="${rm[1]}">Войти</button>` : esc(m.text);
  return `<div class="kr-m${mine ? ' me' : ''}">${seatB(m.seat)}<span class="kr-mn">${esc(m.name || 'Игрок')}</span><span class="kr-mt">${body}</span></div>`;
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
  chDb = sb.channel('krot-db-' + id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'krot_rooms', filter: 'id=eq.' + id }, () => soon())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'krot_chat', filter: 'room_id=eq.' + id }, p => { if (p && p.new) addChat([rowMsg(p.new)]); })
    .subscribe();
  const onRt = ch => ch.on('broadcast', { event: 'h' }, m => { const q = m && m.payload; if (G && q && q.s) G.head(q.s, q.y, q.p); })
    .on('broadcast', { event: 'rtc' }, m => { if (m && m.payload && VC.core) VC.core.onSig(m.payload); });
  const sendOn = ch => p => ch.send({ type: 'broadcast', event: 'rtc', payload: p });
  chRt = onRt(sb.channel('krot:' + id, { config: { private: true, broadcast: { self: false } } }));
  chRt.subscribe(st3 => {
    if (g !== gen || id !== room) return;
    if (st3 === 'SUBSCRIBED') vcSigReady(sendOn(chRt));
    else if ((st3 === 'CHANNEL_ERROR' || st3 === 'TIMED_OUT') && !chRt._pub) {   // закрытый канал не пустили — запасной (имя знают только игроки комнаты)
      try { sb.removeChannel(chRt); } catch (e) { /* уже */ }
      chRt = onRt(sb.channel('krotpub:' + id + ':' + ((S && S.room.code) || ''), { config: { broadcast: { self: false } } })); chRt._pub = true;
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
  const ph = d.room.phase, prev = lastPhase;
  if (pend && ((pend.stage === 'main' && d.me.vote === pend.box) || (pend.stage === 'revote' && d.me.revote === pend.box))) pend = null;
  if (G) G.sync(d);   // сначала сцена (новый раунд, контейнеры), потом события фазы (вскрытие)
  if (ph !== prev) { lastPhase = ph; onPhase(prev, ph); }
  if (G) G.marks(marks());
  drawAll();
}
function onPhase(prev, ph) {
  lastSec = -1;
  const rd = S.round;
  if (ph === 'vote' && draft && !S.me.vote && !S.me.locked) { const b = draft; draft = 0; setTimeout(() => vote(b), 60); }
  if (ph === 'revote' && S.me.vote && rd && !(rd.cands || []).includes(S.me.vote)) note('Ваш прежний выбор не в доп. голосовании — выберите заново', 'warn');
  if (ph === 'open' && rd && rd.target && openRound !== rd.id) {
    openRound = rd.id; openDone = false;
    const late = !prev || prev === 'open';   // зашли посреди вскрытия — без анимации
    if (G) G.reveal(rd.chosen, rd.target, late).then(() => { if (S && S.round && S.round.id === rd.id) { openDone = true; drawMid(); } });
    else openDone = true;
  }
  if ((ph === 'debrief' || ph === 'done') && rd && rd.target) {
    if (openRound !== rd.id) { openRound = rd.id; if (G) G.reveal(rd.chosen, rd.target, true); }
    openDone = true;
    checkProof();
  }
  if (ph === 'brief' && G) G.setRead(false);
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
  view = 'menu'; root.classList.remove('in-room', 'chat-on', 'lock', 'show-res', 'aim', 'can-pick', 'paused'); root.classList.add('in-menu'); delete root.dataset.ph;
  if (G) G.menu(true);
  const can = authed() || api === Demo;
  ui.innerHTML = `<div class="kr-menu"><section class="kr-mbox kr-glass">
    <img class="kr-logo" src="assets/main/krot-logo.webp" alt="Режим КРОТ — RUSH CASE" draggable="false">
    <p class="kr-tag">Четыре контейнера, одна цель и один предатель. Три Оперативника ищут цель по уликам — Крот уводит их разговором.</p>
    <ul class="kr-facts"><li><b>4</b><span>игрока</span></li><li><b>~3</b><span>минуты</span></li><li><b>1</b><span>Крот</span></li></ul>
    ${wait ? '<p class="kr-wait"><i class="kr-spin"></i>Проверяем, нет ли у вас идущего матча…</p>' : can ? `
    ${menuPlay()}
    <form class="kr-join" id="krJoin" autocomplete="off"><input id="krCode" maxlength="6" placeholder="Код группы друга" spellcheck="false" aria-label="Код группы друга"><button class="kr-btn">В группу</button></form>` : `
    <button class="kr-btn go kr-big" data-a="login"><span>Войти и играть</span><small>Режим бесплатный — нужен только аккаунт</small></button>`}
    <div class="kr-mlinks"><button class="kr-link" data-a="how">${ICO.help}Как играть</button>${DEMO_OK && api !== Demo ? '<a class="kr-link" href="#/krot/demo">Демо с ботами (только на этом компьютере)</a>' : ''}</div>
  </section></div>`;
  ensureHandlers();
}
// кнопки меню: поиск и группа (подбор как в CS2 — раздел «Подбор матча»)
function menuPlay() {
  const p = MM.st && MM.st.party, srch = !!(p && p.state === 'search'), n = p ? p.members.length : 1;
  return `<button class="kr-btn ${srch ? 'red' : 'go'} kr-big" data-a="play"><span>${srch ? 'Отменить поиск' : 'Найти игру'}</span><small>${srch ? 'Идёт поиск: <b id="krMmT">0:00</b>' : n > 1 ? `Группа ${n}/4 · без очков недели` : 'Случайные игроки · очки недели'}</small></button>
    <button class="kr-btn kr-big" data-a="invite"><span>${n > 1 ? `Группа ${n}/4` : 'Пригласить друзей'}</span><small>Код или ссылка · до 4 человек</small></button>`;
}
function drawBusy(on) { if (root) root.classList.toggle('busy', on); }
function ensureHandlers() {
  if (root._krH) return; root._krH = true;
  root.addEventListener('click', onClick); root.addEventListener('submit', onSubmit);
  root.addEventListener('focusin', e => { if (e.target.id === 'krIn') { openChat(true); vcKey(false); } });
  root.addEventListener('input', e => { const t = e.target; if (t.dataset.vol) { const p = S && S.players.find(q => q.seat === +t.dataset.vol); if (p) vcPlayerVol(p, t.value / 100); } else if (t.dataset.thr) { vcSet('thr', t.value / 100); const m = $('.kr-thr', root); if (m) m.style.left = t.value + '%'; } });
  root.addEventListener('change', e => { const t = e.target; if (t.dataset.dev) vcSet(t.dataset.dev, t.value); else if (t.dataset.chk) vcSet(t.dataset.chk, t.checked); });
}

function drawRoom() {
  view = 'room'; root.classList.remove('in-menu'); root.classList.add('in-room');
  if (G) G.menu(false);
  ui.innerHTML = `
  <div class="kr-rdy kr-glass" id="krRdy" hidden></div>
  <header class="kr-top kr-glass" id="krTop"><span class="kr-ph" id="krPh"></span><b class="kr-tm" id="krTm"></b><i class="kr-bar"><i id="krBar"></i></i><em class="kr-net" id="krNet" hidden>Нет связи — переподключаемся…</em></header>
  <div class="kr-rm" id="krRm"></div>
  <aside class="kr-left" id="krLeft"><section class="kr-card kr-glass" id="krCard"></section><section class="kr-dos kr-glass" id="krDos"></section></aside>
  <aside class="kr-chat kr-glass" id="krChat">
    <header class="kr-chh"><span class="kr-h">Связь</span><button class="kr-vc" id="krVc" data-a="voice" type="button"></button><button class="kr-ib kr-chx" data-a="chat" aria-label="Свернуть чат">${ICO.close}</button></header>
    <div class="kr-msgs" id="krMsgs" aria-live="polite"></div>
    <form class="kr-chf" id="krChF" autocomplete="off"><input id="krIn" maxlength="300" placeholder="Сообщение… (Enter)" aria-label="Сообщение в чат"><button class="kr-send" aria-label="Отправить">${ICO.send}</button></form>
  </aside>
  <button class="kr-chb kr-glass" id="krChB" data-a="chat">${ICO.chat}<span>Чат</span><b id="krUnr" hidden></b></button>
  <div class="kr-mid" id="krMid"></div>
  <div class="kr-hint" id="krHint"></div>
  <div class="kr-air" id="krAir" hidden>${ICO.mic}<span>В эфире</span></div>
  <div class="kr-keys"><span><kbd>V</kbd>говорить</span><span><kbd>ЛКМ</kbd>зажать — осмотреться</span><span><kbd>Клик</kbd>контейнер</span><span><kbd>ПКМ</kbd>карточка</span><span><kbd>1–4</kbd>выбор</span><span><kbd>Enter</kbd>чат</span><span><kbd>Tab</kbd>игроки</span></div>`;
  ensureHandlers();
  openChat(window.innerWidth > 900);
  vcDraw();
}
function drawAll() {
  if (!S || view !== 'room') return;
  drawTop(); drawRm(); drawCard(); drawDos(); drawMid(); drawHint(); drawOvLive(); drawRdy();
  root.classList.toggle('can-pick', canPick());
  root.classList.toggle('paused', !!S.room.paused);
  root.dataset.ph = S.room.phase;
  const ld = S.room.phase === 'lobby' && !!S.room.mm;
  root.classList.toggle('loading', ld);
  if (G && ld !== lastLd) { lastLd = ld; G.menu(ld); if (!ld) G.sync(S); }
  if (S.room.phase !== 'lobby') micStop();
  markLoaded();
}
function drawTop() {
  const ph = $('#krPh', root); if (!ph) return;
  const r = S.room;
  ph.textContent = r.paused ? 'Пауза' : r.phase === 'lobby' ? (r.deadline ? 'Старт через' : PH.lobby) : PH[r.phase] || '';
  $('#krTop', root).dataset.ph = r.phase;
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
function drawCard() {
  const el = $('#krCard', root); if (!el) return;
  const role = S.me.role, c = S.me.card || {};
  if (!role) { el.className = 'kr-card kr-glass wait'; el.innerHTML = '<header><span class="kr-h">Ваша карточка</span></header><p class="kr-cw">Роль и улику выдадут на брифинге. До этого все карточки одинаковые.</p>'; return; }
  const k = role === 'krot';
  el.className = 'kr-card kr-glass ' + (k ? 'krot' : 'agent') + (hideCard ? ' hid' : '');
  el.innerHTML = `<header><span class="kr-h">Ваша роль</span><button class="kr-ib" data-a="card-hide" title="${hideCard ? 'Показать карточку' : 'Скрыть карточку (для стрима)'}">${hideCard ? ICO.eyeOff : ICO.eye}</button></header>
    <h3 class="kr-role">${k ? 'Крот' : 'Оперативник'}</h3>
    <div class="kr-cb">${k ? `<div class="kr-ck"><span>Цель</span><b class="kr-tg">Контейнер ${nn(c.target)}</b></div>
      <div class="kr-ck"><span>Задание · ${esc((c.task && c.task.title) || '')}</span><p>${esc((c.task && c.task.text) || '')}</p></div>
      <p class="kr-cf">Ваш голос не считается. Уведите команду от цели и не выдайте себя.</p>`
    : `<div class="kr-ck"><span>Ваша улика</span><p class="kr-clue">${clueIco(c)}<span>${esc(c.text || '')}</span></p></div>
      <p class="kr-cf">Улика правдивая. Ещё две — у двух других Оперативников. Четвёртый за столом — Крот.</p>`}</div>
    <p class="kr-cmask">Карточка скрыта</p>`;
}
function drawDos() {
  const el = $('#krDos', root); if (!el) return;
  const rd = S.round, ph = S.room.phase;
  if (!rd) { el.innerHTML = '<header><span class="kr-h">Досье · контейнеры</span></header><p class="kr-cw">Признаки четырёх контейнеров откроются на брифинге.</p>'; return; }
  const d = rd.dict || DICT0, m = myPick(), cands = ph === 'revote' ? rd.cands || [] : null, reveal = rd.target != null, pick = canPick();
  const rows = rd.boxes.slice().sort((a, b) => a.n - b.n).map(b => {
    const cl = ['kr-row'], off2 = cands && !cands.includes(b.n);
    if (m.box === b.n) cl.push(m.kind);
    if (cands) cl.push(off2 ? 'dim' : 'cand');
    if (reveal) { if (b.n === rd.target) cl.push('tgt'); else if (b.n === rd.chosen) cl.push('miss'); }
    const tag = reveal ? (b.n === rd.target ? 'Цель' : b.n === rd.chosen ? 'Выбор команды' : '') : m.box === b.n ? { sel: 'Ваш выбор', pend: 'Отправляем…', draft: 'Черновик' }[m.kind] : '';
    const full = `Контейнер ${nn(b.n)}: знак — ${d.sym[b.sym] || b.sym}, внутри — ${d.gun[b.gun] || b.gun}, маркировка — ${d.col[b.col] || b.col}`;
    return `<button class="${cl.join(' ')}" data-box="${b.n}" title="${esc(full)}" aria-label="${esc(full)}"${pick && !off2 ? '' : ' disabled'}><b class="kr-n">${nn(b.n)}</b>
      <span class="kr-f">${svgSym(b.sym)}<i>${esc(SHORT.sym[b.sym] || b.sym)}</i></span><span class="kr-f">${svgGun(b.gun)}<i>${esc(SHORT.gun[b.gun] || b.gun)}</i></span>
      <span class="kr-f">${sw(b.col)}<i>${esc(SHORT.col[b.col] || b.col)}</i></span>${tag ? `<em class="kr-rt">${tag}</em>` : ''}</button>`;
  }).join('');
  el.innerHTML = `<header><span class="kr-h">Досье · контейнеры</span><small>признаки видят все</small></header>
    <div class="kr-rh"><span>№</span><span>Знак</span><span>Внутри</span><span>Маркировка</span></div><div class="kr-rows">${rows}</div><footer class="kr-dst">${dosStatus()}</footer>`;
}
function dosStatus() {
  const ph = S.room.phase, me = S.me, rd = S.round;
  if (me.locked && ['vote', 'revote'].includes(ph)) return 'Ваш голос сохранён: после потери связи его нельзя менять.';
  if (pend) return '<i class="kr-spin"></i>Отправляем выбор…';
  if (ph === 'brief' || ph === 'talk') return draft ? `Черновик: <b>${nn(draft)}</b> — отправится сам, когда начнётся фиксация.` : 'Голосование — после обсуждения. Можно заранее отметить контейнер (клик или 1–4).';
  if (ph === 'vote') return me.vote ? `${ICO.ok}Выбор зафиксирован: <b>${nn(me.vote)}</b>. Можно изменить до конца таймера.` : 'Выберите контейнер: прицел и клик, клик по строке или клавиши 1–4.';
  if (ph === 'revote') {
    const c = rd.cands || [];
    if (me.revote) return `${ICO.ok}Выбор зафиксирован: <b>${nn(me.revote)}</b>.`;
    return `Только ${c.map(x => '<b>' + nn(x) + '</b>').join(' или ')}.` + (me.vote && c.includes(me.vote) ? ' Если не переголосуете — останется ваш прежний выбор.' : '');
  }
  if (rd.target) return rd.chosen ? `Команда выбрала <b>${nn(rd.chosen)}</b>, цель — <b>${nn(rd.target)}</b>.` : `Цель — <b>${nn(rd.target)}</b>.`;
  return '';
}
function drawHint() {
  const el = $('#krHint', root); if (!el) return;
  const ph = S.room.phase;
  let t = S.room.paused ? 'Игра на паузе: ждём игрока.' : HINT[ph] || '';
  if (ph === 'lobby') t = S.room.kind === 'private' ? 'Игра начнётся, когда все четверо нажмут «Готов к операции».' : 'Матч начнётся сам, когда соберутся 4 игрока.';
  el.textContent = t; el.hidden = !t;
}
function drawChatBtn() {
  const b = root && $('#krUnr', root); if (!b) return;
  b.hidden = !unread || chatOpen; b.textContent = unread > 9 ? '9+' : unread;
}

/* ---------- центр экрана: лобби, роль, пауза, итог ---------- */
function drawMid() {
  const el = root && $('#krMid', root); if (!el || !S) return;
  const r = S.room, rd = S.round, ph = r.phase;
  el.className = 'kr-mid'; root.classList.remove('show-res');
  if (r.paused) { const p = S.players.find(x => x.seat === r.pause_seat); el.innerHTML = `<section class="kr-pause kr-glass"><span class="kr-h">Пауза</span><h2 class="kr-t">Игрок потерял связь</h2><p>${p ? seatB(p.seat) + esc(p.name) : 'Игрок'} — ждём <b id="krPl">…</b>. Не вернётся — раунд отменят без очков.</p></section>`; return; }
  if (ph === 'lobby' && r.mm) { el.className = 'kr-mid ld'; el.innerHTML = loadHtml(); micFill(); return; }   // все приняли — экран загрузки
  if (ph === 'lobby') { el.className = 'kr-mid lob'; el.innerHTML = lobbyHtml(); return; }
  if (ph === 'brief' && rd && briefSeen !== rd.id && S.me.role) { el.innerHTML = briefHtml(); return; }
  if (ph === 'open' && !openDone) { el.className = 'kr-mid low'; el.innerHTML = `<div class="kr-opening kr-glass"><span class="kr-h">Вскрытие</span><b>${rd && rd.chosen ? 'Команда выбрала ' + nn(rd.chosen) : 'Команда не выбрала цель'}</b><button class="kr-btn sm ghost" data-a="skip">Пропустить</button></div>`; return; }
  if ((ph === 'open' && openDone) || ph === 'debrief' || ph === 'done') { el.className = 'kr-mid res'; root.classList.add('show-res'); el.innerHTML = resultHtml(); return; }
  el.innerHTML = '';
}
// ---------- экран загрузки: все приняли → ~10 с, все успевают открыть игру, проверить микрофон и звук ----------
const TIPS = ['Зажмите ЛКМ и ведите мышью — осмотритесь за столом.', 'Опустите взгляд или зажмите ПКМ — прочитаете свою карточку.',
  'Клавиши 1–4 — быстрый выбор контейнера.', 'Улик три, и только вместе они указывают на цель. Сверяйте всё.',
  'Крот знает цель. Слушайте, кто уводит разговор в сторону.', 'Считаются только голоса Оперативников: 2:1 или 3:0 решает дело.',
  'В разборе можно проверить отпечаток: цель не меняли по ходу игры.'];
let loadSent = 0, tipN = rnd(TIPS.length), tipAt = 0, lastLd = null;
function markLoaded() {   // игра у меня загрузилась (3D готово или без 3D) — сообщаем серверу
  if (!S || !room || loadSent === room || S.room.phase !== 'lobby' || !S.room.mm) return;
  if (!(G || root.classList.contains('no3d'))) return;
  const me = S.players.find(p => p.me); if (me && me.loaded) { loadSent = room; return; }
  loadSent = room; const id = room;
  api.rpc('krot_loaded', { p_room: id }).then(() => { if (room === id) refresh(); }, () => { loadSent = 0; });
}
function loadHtml() {
  const ps = S.players, n = ps.filter(p => p.loaded).length;
  const rows = [1, 2, 3, 4].map(s2 => {
    const p = ps.find(q => q.seat === s2); if (!p) return '';
    return `<li class="${p.loaded ? 'ok' : ''}${p.me ? ' me' : ''}">${seatB(s2)}<span>${esc(p.name)}${p.me ? ' <small>(вы)</small>' : ''}</span><em>${p.loaded ? ICO.ok + 'готов' : '<i class="kr-spin"></i>загрузка'}</em></li>`;
  }).join('');
  return `<section class="kr-ld">
    <div class="kr-ldm"><span class="kr-ldk">КРОТ · ${S.room.points ? 'Быстрая игра' : 'Игра с группой'}</span><h1 class="kr-ldt">Бункер</h1>
      <p class="kr-ldtip" id="krTip">${esc(TIPS[tipN % TIPS.length])}</p>
      <div class="kr-ldb"><i id="krLdBar"></i></div><p class="kr-lds" id="krLdSt">Операция начнётся через <b>…</b></p></div>
    <aside class="kr-lda">
      <section class="kr-glass kr-ldp"><span class="kr-h">Игроки · ${n}/4 загрузились</span><ul>${rows}</ul></section>
      <section class="kr-glass kr-ldmic"><span class="kr-h">Голосовой чат</span>
        <label class="kr-micl"><span>Микрофон</span><select id="krMicSel" data-dev="mic" aria-label="Микрофон"><option value="">По умолчанию</option></select></label>
        <div class="kr-meter" aria-hidden="true"><i id="krLdLvl"></i></div>
        <p class="kr-micst" id="krLdVs">${esc(VC.micErr || vcSummary().t)}</p>
        <div class="kr-seg kr-seg-sm"><button class="${VC.mode === 'ptt' ? 'on' : ''}" data-a="vmode" data-v="ptt">Зажать V</button><button class="${VC.mode === 'vad' ? 'on' : ''}" data-a="vmode" data-v="vad">Голосом</button></div>
        <div class="kr-la">${VC.micErr ? '<button class="kr-btn sm go" data-a="mic-retry">Включить микрофон</button>' : ''}<button class="kr-btn sm" data-a="spk">Проверить звук</button></div>
        <p class="kr-fine">Скажите что-нибудь — полоска покажет громкость. ${VC.mode === 'ptt' ? 'Зажмите V и поздоровайтесь — за столом вас уже слышат.' : 'Вас слышно, когда говорите громче порога.'}</p></section>
      <button class="kr-btn ghost sm kr-ldx" data-a="leave">Выйти</button>
    </aside></section>`;
}
// экран загрузки: отсчёт, полоска, кого ждём, смена подсказок (из uiTick)
function loadTick() {
  const st2 = $('#krLdSt', root), bar = $('#krLdBar', root); if (!st2 || !S) return;
  const r = S.room, now = Date.now() + off, left = Math.max(0, (r.deadline || now) - now), tot = Math.max(1, (r.deadline || now) - (r.load_at || now));
  if (bar) bar.style.transform = `scaleX(${clamp(1 - left / tot, 0, 1).toFixed(3)})`;
  const wait = S.players.filter(p => !p.loaded);
  st2.innerHTML = left > 0 ? `Операция начнётся через <b>${fmt(Math.ceil(left / 1000))}</b>` : wait.length ? `Ждём: <b>${esc(wait.map(p => p.name).join(', '))}</b>` : 'Начинаем…';
  if (Date.now() - tipAt > 4000) { tipAt = Date.now(); tipN++; const t = $('#krTip', root); if (t) { t.classList.remove('in'); void t.offsetWidth; t.textContent = TIPS[tipN % TIPS.length]; t.classList.add('in'); } }
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
  const r = S.room, priv = r.kind === 'private', n = S.players.length;
  const seats = [1, 2, 3, 4].map(s => {
    const p = S.players.find(x => x.seat === s);
    if (!p) return `<li class="free">${seatB(s)}<span>Свободное место</span><em>ждём</em></li>`;
    return `<li class="${p.ready ? 'rd' : ''}${p.me ? ' me' : ''}${p.online ? '' : ' off'}">${seatB(s)}<span>${esc(p.name)}${p.me ? ' <small>(вы)</small>' : ''}</span><em>${!p.online ? 'нет связи' : p.ready ? 'готов' : 'не готов'}</em></li>`;
  }).join('');
  return `<section class="kr-lob kr-glass"><span class="kr-h">${priv ? 'Комната друзей · без очков' : 'Быстрая игра · очки недели'}</span>
    <h2 class="kr-t">${priv ? 'Соберите группу' : 'Подбор игроков'}</h2>
    <p class="kr-sub"><b>${n}</b> / 4 за столом${r.deadline ? ' · старт через <b id="krLs">…</b>' : ''}</p>
    ${priv ? `<div class="kr-cbig"><span>Код комнаты</span><b>${esc(r.code)}</b><div><button class="kr-btn sm" data-a="copy">Скопировать код</button><button class="kr-btn sm" data-a="link">Ссылка-приглашение</button></div></div>` : ''}
    <ul class="kr-seats">${seats}</ul>
    <div class="kr-la"><button class="kr-btn ${S.me.ready ? '' : 'go'}" data-a="ready">${S.me.ready ? 'Я не готов' : 'Готов к операции'}</button><button class="kr-btn ghost" data-a="leave">Выйти</button></div>
    <p class="kr-fine">${priv ? 'Игра начнётся, когда за столом четверо и все нажали «Готов».' : 'Матч начнётся сам, когда соберутся четверо. Все «Готов» — старт через 3 секунды.'} <button class="kr-link" data-a="how">Правила</button></p></section>`;
}
function briefHtml() {
  const c = S.me.card || {}, k = S.me.role === 'krot';
  return `<section class="kr-brief kr-glass ${k ? 'krot' : 'agent'}"><span class="kr-h">Ваша роль</span><h2 class="kr-bt">${k ? 'Крот' : 'Оперативник'}</h2>
    ${k ? `<p class="kr-bl"><span>Цель — <b>контейнер ${nn(c.target)}</b>. Уведите команду от него и не выдайте себя.</span></p><div class="kr-bk"><span>Секретное задание · ${esc((c.task && c.task.title) || '')}</span><p>${esc((c.task && c.task.text) || '')}</p></div>`
    : `<p class="kr-bl">${clueIco(c)}<span>${esc(c.text || '')}</span></p><p class="kr-bs">Ваша улика правдивая. Найдите две другие — и не верьте Кроту.</p>`}
    <button class="kr-btn go" data-a="brief-ok">Понятно</button><small class="kr-fine">Карточка останется в руках: опустите взгляд или зажмите ПКМ.</small></section>`;
}
function resultHtml() {
  const rd = S.round, r = S.room;
  if (!rd) return `<section class="kr-res kr-glass"><span class="kr-h">Комната закрыта</span><h2 class="kr-t">Игра не состоялась</h2><div class="kr-ra"><button class="kr-btn go" data-a="again">Играть ещё</button><button class="kr-btn ghost" data-a="menu">В меню</button></div></section>`;
  const out = rd.outcome, cancel = out === 'cancel', me = S.me, roles = rd.roles || null;
  const win = (out === 'team' && me.role === 'agent') || (out === 'krot' && me.role === 'krot');
  const pts = rd.tally && rd.tally.pts ? rd.tally.pts[String(me.seat)] : null;
  const title = cancel ? 'Раунд отменён' : out === 'team' ? 'Операция успешна' : 'Крот сорвал операцию';
  const line = cancel ? 'Причина: ' + (CANCEL[rd.reason] || rd.reason || 'неизвестно') + '. Очков нет.'
    : rd.chosen ? `Команда выбрала <b>${nn(rd.chosen)}</b> ${REASON[rd.reason] || ''}. Цель — <b>${nn(rd.target)}</b>.` : `Команда не договорилась. Цель — <b>${nn(rd.target)}</b>.`;
  const krot = roles && roles.find(x => x.role === 'krot');
  const vt = (s, st2) => { const v = (rd.votes || []).find(x => x.seat === s && x.stage === st2); return v ? nn(v.box) : '—'; };
  const hasRe = (rd.votes || []).some(x => x.stage === 'revote') || (rd.tally && rd.tally.revote);
  const list = roles ? `<table class="kr-rl"><thead><tr><th>Игрок</th><th>Роль</th><th>Карточка</th><th>Голос</th>${hasRe ? '<th>Доп.</th>' : ''}</tr></thead><tbody>${roles.map(x => {
    const p = S.players.find(q => q.seat === x.seat) || {}, k = x.role === 'krot', c = x.card || {};
    return `<tr class="${k ? 'krot' : ''}${p.me ? ' me' : ''}"><td>${seatB(x.seat)}${esc(p.name || 'Игрок')}</td><td><em class="kr-rb ${k ? 'krot' : 'agent'}">${k ? 'Крот' : 'Оперативник'}</em></td>
      <td>${k ? 'Цель ' + nn(c.target) + (c.task ? ' · ' + esc(c.task.title) : '') : clueIco(c) + esc(c.label || c.text || '')}</td><td>${vt(x.seat, 'main')}${k ? ' <small>не в счёт</small>' : ''}</td>${hasRe ? `<td>${vt(x.seat, 'revote')}</td>` : ''}</tr>`;
  }).join('')}</tbody></table>` : '<p class="kr-fine"><i class="kr-spin"></i>Роли раскроются через мгновение…</p>';
  const task = krot && krot.card && krot.card.task ? `<div class="kr-rtask"><span>Задание Крота · ${esc(krot.card.task.title)}</span><p>${esc(krot.card.task.text)}</p></div>` : '';
  const fair = proof && proof.round === rd.id ? (proof.ok ? `<p class="kr-fair ok">${ICO.ok}Честная игра: цель записана до брифинга, отпечаток совпал.<details><summary>Проверить самому</summary><code>sha256("${esc(rd.proof)}")<br>= ${esc(rd.commit)}</code></details></p>`
    : proof.ok === false ? '<p class="kr-fair bad">Отпечаток не совпал — сообщите в поддержку.</p>' : '') : '';
  const meLine = cancel ? '' : `<p class="kr-me ${win ? 'win' : 'lose'}">${win ? 'Вы победили' : 'Вы проиграли'}${r.points ? (pts ? ` · <b>+${pts}</b> очков недели` : win ? ' · дневной лимит очков исчерпан' : '') : ' · комната друзей — без очков'}</p>`;
  return `<section class="kr-res kr-glass ${cancel ? 'cancel' : out}"><span class="kr-h">Итог операции</span><h2 class="kr-t">${title}</h2><p class="kr-rs">${line}</p>${meLine}
    ${list}${task}${fair}
    <div class="kr-ra">${r.phase === 'open' ? '' : '<button class="kr-btn go" data-a="again">Играть ещё</button>'}<button class="kr-btn" data-a="copyres">Скопировать итог</button><button class="kr-btn ghost" data-a="players">Пожаловаться</button><button class="kr-btn ghost" data-a="menu">В меню</button></div></section>`;
}
function resultText() {
  const rd = S && S.round; if (!rd || !rd.outcome) return '';
  const krot = (rd.roles || []).find(x => x.role === 'krot'), kp = krot && S.players.find(p => p.seat === krot.seat);
  const t = rd.outcome === 'cancel' ? 'Раунд отменён' : rd.outcome === 'team' ? 'Операция успешна' : 'Крот сорвал операцию';
  return `RUSH CASE · КРОТ — ${t}. Цель: ${nn(rd.target)}. Выбор команды: ${rd.chosen ? nn(rd.chosen) : 'нет'}.${kp ? ' Кротом был ' + kp.name + '.' : ''} ${location.origin}/#/krot`;
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
  if (kind === 'how') return `<aside class="kr-how kr-glass">${x}<span class="kr-h">Правила</span><h2 class="kr-t">Как играть в «Крота»</h2>
    <ol class="kr-steps">
      <li><b>Стол.</b> Четыре игрока, четыре одинаковых контейнера 01–04. У каждого открытые признаки: знак, что внутри, цвет маркировки. Цель — один из них.</li>
      <li><b>Роли.</b> Трое — Оперативники: у каждого одна правдивая улика, признак цели. Только три улики вместе указывают на цель. Четвёртый — Крот: знает цель и тайное задание.</li>
      <li><b>Брифинг.</b> Сервер раздаёт карточки. Свою читаете, опустив взгляд или зажав ПКМ. Чужие видны только рубашкой.</li>
      <li><b>Обсуждение.</b> 75 секунд голосом и в чате. Сверяйте улики. Крот врёт убедительно.</li>
      <li><b>Фиксация.</b> 15 секунд: каждый выбирает контейнер. Считаются только голоса Оперативников: 3:0 или 2:1 — решение команды, ничья — доп. голосование.</li>
      <li><b>Вскрытие.</b> Команда выбрала цель — победа Оперативников. Иначе — победа Крота. Потом роли раскрываются.</li>
    </ol>
    <h3 class="kr-h2">Честность</h3><p>Цель записывается на сервере до брифинга, её отпечаток виден сразу. В разборе отпечаток можно проверить — цель не меняли.</p>
    <h3 class="kr-h2">Очки</h3><p>Быстрая игра — очки за победу и таблица недели, лучшим — скины. Комнаты друзей — без очков.</p>
    <h3 class="kr-h2">Управление</h3><ul class="kr-keyl"><li><kbd>ЛКМ</kbd> зажать и вести мышью — осмотреться</li><li><kbd>ПКМ</kbd> или взгляд вниз — своя карточка</li><li>Клик по контейнеру или <kbd>1–4</kbd> — выбор</li><li><kbd>V</kbd> зажать — говорить (или «голосом» в настройках голоса)</li><li><kbd>Enter</kbd> — чат, <kbd>Tab</kbd> — игроки, громкость каждого</li></ul></aside>`;
  if (kind === 'players') {
    const ps = S ? S.players : [];
    const rows = [1, 2, 3, 4].map(s => {
      const p = ps.find(q => q.seat === s);
      if (!p) return `<li class="free">${seatB(s)}<span>Свободно</span></li>`;
      const stt = p.left ? ['left', 'вышел'] : p.online ? ['on', 'на связи'] : ['off', 'нет связи'];
      const k = vkey(p), mut = !!VC.mute[k], vol = Math.round((VC.vol[k] != null ? VC.vol[k] : 1) * 100);
      return `<li><i class="kr-sd" data-spk="${s}"></i>${seatB(s)}<span>${esc(p.name)}${p.me ? ' <small>(вы)</small>' : ''}</span><em class="${stt[0]}">${stt[1]}</em><em class="kr-vst" data-vst="${s}">${vcPeerText(s)}</em>${p.me ? '' : `<div class="kr-vv"><button class="kr-ib kr-vm${mut ? ' on' : ''}" data-a="vmute" data-seat="${s}" title="${mut ? 'Включить звук игрока' : 'Заглушить игрока'}">${mut ? ICO.spkOff : ICO.spk}</button><input type="range" min="0" max="100" value="${vol}" data-vol="${s}" aria-label="Громкость: ${esc(p.name)}"><button class="kr-btn sm ghost" data-a="report" data-seat="${s}">Пожаловаться</button></div>`}</li>`;
    }).join('');
    return `<section class="kr-pl kr-glass">${x}<span class="kr-h">Игроки · Tab</span><ul class="kr-pll">${rows}</ul><p class="kr-fine">Громкость каждого — ползунком, значок динамика — заглушить. Настройки голоса — кнопка микрофона над чатом.</p></section>`;
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
    return `<section class="kr-vs kr-glass">${x}<span class="kr-h">Голосовой чат</span><h2 class="kr-t">Связь</h2>
      <p class="kr-vsum" id="krVsSum">${esc(vcSummary().t)}</p>${VC.micErr ? `<p class="kr-micst bad">${esc(VC.micErr)}</p>` : ''}
      <div class="kr-seg" role="radiogroup" aria-label="Как говорить"><button class="${VC.mode === 'ptt' ? 'on' : ''}" data-a="vmode" data-v="ptt">Зажать V</button><button class="${VC.mode === 'vad' ? 'on' : ''}" data-a="vmode" data-v="vad">Голосом</button></div>
      <div class="kr-meter kr-vsm" aria-hidden="true"><i id="krVsLvl"></i>${VC.mode === 'vad' ? `<b class="kr-thr" style="left:${Math.round(VC.thr * 100)}%"></b>` : ''}</div>
      ${VC.mode === 'vad' ? `<label class="kr-micl"><span>Порог</span><input type="range" min="2" max="60" value="${Math.round(VC.thr * 100)}" data-thr="1" aria-label="Порог включения"></label>` : '<p class="kr-fine">Пока V зажата — вас слышат, внизу горит «В эфире».</p>'}
      <label class="kr-micl"><span>Микрофон</span><select data-dev="mic" aria-label="Микрофон"><option value="">По умолчанию</option></select></label>
      ${sink ? '<label class="kr-micl"><span>Динамики</span><select data-dev="spk" aria-label="Динамики"><option value="">По умолчанию</option></select></label>' : ''}
      <label class="kr-chk"><input type="checkbox" data-chk="self"${VC.self ? ' checked' : ''}><span>Выключить мой микрофон</span></label>
      <label class="kr-chk"><input type="checkbox" data-chk="deaf"${VC.deaf ? ' checked' : ''}><span>Выключить весь звук игроков</span></label>
      <label class="kr-chk"><input type="checkbox" data-chk="guard"${VC.guard ? ' checked' : ''}><span>Подавление эха (пока говорят другие, микрофон пропускает только явную речь)</span></label>
      ${VC.aec ? '' : '<p class="kr-micst warn">Браузер не включил эхоподавление — говорите через наушники и в режиме «Зажать V».</p>'}
      <div class="kr-la"><button class="kr-btn sm" data-a="spk">Проверить звук</button>${VC.micErr ? '<button class="kr-btn sm go" data-a="mic-retry">Включить микрофон</button>' : ''}</div>
      <p class="kr-fine">Слышите себя с задержкой? Нажмите Tab и говорите: у кого при этом загорается значок — у того микрофон ловит звук из наушников (или идёт трансляция игры со звуком, например в Discord). Заглушите его кнопкой динамика. Голос идёт напрямую между игроками; если с кем-то не соединилось — пишите в чат.</p></section>`;
  }
  if (kind === 'leave') return `<section class="kr-rep kr-glass">${x}<span class="kr-h">Выход</span><h2 class="kr-t">Покинуть матч?</h2><p>Матч поставят на паузу, а если вы не вернётесь за 30 секунд — раунд отменят для всех.</p>
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
  if (view !== 'room' || !S || !root) return;
  if (S.room.phase === 'lobby' && S.room.mm) loadTick();
  const r = S.room, tm = $('#krTm', root), bar = $('#krBar', root); if (!tm) return;
  if (r.paused) {
    const left = Math.max(0, (r.pause_left || 0) - (Date.now() - S._at)), s = Math.ceil(left / 1000);
    if (s !== lastSec) { lastSec = s; tm.textContent = fmt(s); const pl = $('#krPl', root); if (pl) pl.textContent = s + ' с'; }
    bar.style.transform = 'scaleX(0)';
    if (left <= 0 && Date.now() - lastKick > 1500) { lastKick = Date.now(); pulse(); }
    return;
  }
  if (!r.deadline) { if (lastSec !== -2) { lastSec = -2; tm.textContent = ''; bar.style.transform = 'scaleX(0)'; $('#krTop', root).classList.remove('warn', 'crit'); } return; }
  const left = Math.max(0, r.deadline - (Date.now() + off)), s = Math.ceil(left / 1000);
  const total = (r.phase === 'lobby' ? r.deadline - r.phase_at : ((r.times && r.times[r.phase]) || 0) * 1000) || 1;
  bar.style.transform = `scaleX(${clamp(left / total, 0, 1)})`;
  if (s !== lastSec) {
    lastSec = s; tm.textContent = fmt(s);
    const timed = ['talk', 'vote', 'revote', 'brief'].includes(r.phase), top = $('#krTop', root);
    top.classList.toggle('warn', timed && s <= 15 && s > 5); top.classList.toggle('crit', timed && s <= 5);
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
  const need = S.players.filter(q => !q.me && !q.left).length;
  if (n < need && chRt && t - headRt > 250) { headRt = t; try { chRt.send({ type: 'broadcast', event: 'h', payload: { s: S.me.seat, y, p } }); } catch (e) { /* канал ещё не готов */ } }
}

/* ============================================================
   3D: штаб, стол, контейнеры, фигуры (three.js из importmap)
   ============================================================ */
let LIB = null;
const lib = () => LIB || (LIB = Promise.all([import('three'), import('three/addons/geometries/RoundedBoxGeometry.js'), import('three/addons/environments/RoomEnvironment.js')]).catch(e => { LIB = null; throw e; }));
async function start3D(g) {
  const cv = $('#krCv', root);
  let T, RB, RE;
  try {
    const [a, b, c] = await lib(); T = a; RB = b.RoundedBoxGeometry; RE = c.RoomEnvironment;
    await Promise.all([document.fonts.load('500 64px Oswald'), document.fonts.load('700 32px Manrope'), document.fonts.load('800 32px Manrope')]).catch(() => { /* без шрифта — запасной */ });
  } catch (e) { if (g === gen && root) root.classList.add('no3d'); return; }
  if (g !== gen || !root) return;
  try { G = makeWorld(T, RB, RE, cv); } catch (e) { console.warn('KROT 3D:', e); if (root) root.classList.add('no3d'); return; }
  G.hideCard(hideCard);
  if (view === 'menu') G.menu(true);
  if (S) { lastLd = null; G.menu(false); G.sync(S); G.marks(marks()); const rd = S.round; if (rd && rd.target && ['open', 'debrief', 'done'].includes(S.room.phase)) G.reveal(rd.chosen, rd.target, true); }
  root.classList.add('ready3d');
  markLoaded();
}

function makeWorld(T, RB, RE, cv) {
  const W = {};
  const ren = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  ren.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  ren.outputColorSpace = T.SRGBColorSpace; ren.toneMapping = T.ACESFilmicToneMapping; ren.toneMappingExposure = 1.05;
  ren.shadowMap.enabled = true; ren.shadowMap.type = T.PCFSoftShadowMap;
  const ANI = Math.min(8, ren.capabilities.getMaxAnisotropy());
  const scene = new T.Scene(); scene.background = new T.Color(0x07090c); scene.fog = new T.Fog(0x07090c, 5.5, 12.5);
  const pm = new T.PMREMGenerator(ren); scene.environment = pm.fromScene(new RE(), .04).texture; scene.environmentIntensity = .22; pm.dispose();
  const cam = new T.PerspectiveCamera(62, 1, .03, 40); cam.rotation.order = 'YXZ'; scene.add(cam);
  const tex = (c, rx, ry) => { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = ANI; if (rx) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry || rx); } return t; };
  const std = o => new T.MeshStandardMaterial(o);
  const mesh = (g, m, cast = true, recv = true) => { const x = new T.Mesh(g, m); x.castShadow = cast; x.receiveShadow = recv; return x; };
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const UP = V(0, 1, 0), _a = V(0, 0, 0), _b = V(0, 0, 0), _c = V(0, 0, 0), _q = new T.Quaternion(), _q2 = new T.Quaternion(), _m = new T.Matrix4(), _e = new T.Euler();

  /* свет: лампа над столом + холодная подсветка стен */
  scene.add(new T.HemisphereLight(0x9fb4c8, 0x0b0d10, .42));
  const lamp = new T.SpotLight(0xffe2b8, 34, 0, .7, .55, 2); lamp.position.set(0, 2.33, 0); lamp.target.position.set(0, TOP, 0);
  lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -.0004; lamp.shadow.normalBias = .02; lamp.shadow.camera.near = .4; lamp.shadow.camera.far = 4;
  scene.add(lamp, lamp.target);
  const f1 = new T.PointLight(0x4f8fe0, 5, 9, 2); f1.position.set(-3.4, 2.4, -3.4); scene.add(f1);
  const f2 = new T.PointLight(0x84d9fd, 3, 8, 2); f2.position.set(3.6, 1.8, 3.2); scene.add(f2);
  const inL = [new T.PointLight(0x84d9fd, 0, 1, 2), new T.PointLight(0xff5a4a, 0, 1, 2)]; inL.forEach(l => { l.position.set(0, -10, 0); scene.add(l); });   // свет изнутри контейнеров (заранее: новые лампы = подвисание)

  /* комната-штаб */
  const floor = mesh(new T.PlaneGeometry(10, 10), std({ map: tex(paintFloor(), 3), roughness: .9, metalness: .05, color: 0x9aa3ad }), false, true);
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const wallM = std({ map: tex(paintWall(), 3, 1), roughness: .95, color: 0x8b95a1 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, w = mesh(new T.PlaneGeometry(10, 3.6), wallM, false, true); w.position.set(-Math.sin(a) * 5, 1.8, -Math.cos(a) * 5); w.rotation.y = a; scene.add(w);
    const neon = new T.Mesh(new T.BoxGeometry(9.7, .03, .03), new T.MeshBasicMaterial({ color: 0x84d9fd })); neon.position.set(-Math.sin(a) * 4.97, 2.78, -Math.cos(a) * 4.97); neon.rotation.y = a; scene.add(neon); }
  const ceil = mesh(new T.PlaneGeometry(10, 10), std({ color: 0x0c0e11, roughness: 1 }), false, false); ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.6; scene.add(ceil);
  const mapT = tex(paintMap());
  const board = mesh(new T.PlaneGeometry(2.7, 1.45), std({ map: mapT, emissive: 0xffffff, emissiveMap: mapT, emissiveIntensity: .3, roughness: .7 }), false, true); board.position.set(0, 1.72, -4.96); scene.add(board);
  const frameM = std({ color: 0x15191e, metalness: .6, roughness: .4 });
  const bf = mesh(new T.BoxGeometry(2.82, 1.57, .04), frameM, false, true); bf.position.set(0, 1.72, -4.985); scene.add(bf);
  [[-.75, 0], [.75, 1]].forEach(([z, i]) => {   // мониторы на стене слева
    const sT = tex(paintScreen(i)), s = new T.Mesh(new T.PlaneGeometry(1.15, .66), new T.MeshBasicMaterial({ map: sT, color: 0xb8c4cc })); s.position.set(-4.95, 1.62, z); s.rotation.y = Math.PI / 2; scene.add(s);
    const f = mesh(new T.BoxGeometry(.05, .76, 1.25), frameM, false, true); f.position.set(-4.98, 1.62, z); scene.add(f);
  });
  const crateM = std({ map: tex(paintCrate()), roughness: .85, color: 0xb9bfae });
  [[3.7, .32, -3.7, .64, 0], [3.75, .96, -3.65, .64, .2], [4.0, .32, -2.9, .64, -.15], [-3.9, .32, 3.8, .64, .3], [3.9, .27, 3.6, .54, .1]].forEach(([x, y, z, s, r]) => {
    const c = mesh(new T.BoxGeometry(s, s, s), crateM); c.position.set(x, y, z); c.rotation.y = r; scene.add(c); });
  // лампа над столом
  const shade = mesh(new T.ConeGeometry(.3, .2, 32, 1, true), std({ color: 0x1d232a, metalness: .7, roughness: .4, side: T.DoubleSide }), false, false); shade.position.set(0, 2.45, 0); scene.add(shade);
  const bulb = new T.Mesh(new T.SphereGeometry(.055, 16, 12), new T.MeshBasicMaterial({ color: 0xfff1d6 })); bulb.position.set(0, 2.39, 0); scene.add(bulb);
  const cable = mesh(new T.CylinderGeometry(.008, .008, 1.1, 6), std({ color: 0x0a0a0a }), false, false); cable.position.set(0, 3.08, 0); scene.add(cable);

  /* стол */
  const tableM = std({ color: 0x1a1f25, roughness: .5, metalness: .4 });
  const top = mesh(new RB(1.52, .05, 1.52, 3, .018), tableM); top.position.y = TOP - .026; scene.add(top);
  const felt = mesh(new T.PlaneGeometry(1.4, 1.4), std({ map: tex(paintFelt()), roughness: .95 }), false, true); felt.rotation.x = -Math.PI / 2; felt.position.y = TOP + .0006; scene.add(felt);
  [[-.66, -.66], [.66, -.66], [-.66, .66], [.66, .66]].forEach(([x, z]) => { const l = mesh(new T.BoxGeometry(.07, TOP - .05, .07), tableM); l.position.set(x, (TOP - .05) / 2, z); scene.add(l); });

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
  }
  const mine = new T.Sprite(new T.SpriteMaterial({ map: mineT, transparent: true, depthTest: false, opacity: 0 })); mine.scale.set(.2, .05, 1); mine.renderOrder = 9; scene.add(mine);

  /* фигуры за столом (манекены; модели персонажей — этап 5) */
  const suitM = std({ color: 0x252b33, roughness: .72, metalness: .08 }), skinM = std({ color: 0x323a43, roughness: .55, metalness: .15 });
  const visorM = std({ color: 0x0a0e13, roughness: .1, metalness: .9, emissive: 0x0c3446, emissiveIntensity: .7 });
  const chairM = std({ color: 0x14181d, roughness: .55, metalness: .45 }), gearM = std({ color: 0x15191d, roughness: .5, metalness: .5 });
  const backT = tex(paintCardBack()), blankT = tex(paintCardFront(null)), spkT = tex(paintSpk()), glowDotT = tex(paintGlowDot());
  const btnBaseM = std({ color: 0x1b1f24, roughness: .45, metalness: .7 }), hazardM = new T.MeshStandardMaterial({ color: 0xd4a017, roughness: .6, metalness: .2, emissive: 0x3a2a00, emissiveIntensity: .4 });
  const myCardT = tex(paintCardFront(null));
  const AV = {};
  const cyl = (r, m) => mesh(new T.CylinderGeometry(r, r, 1, 12), m);
  const setLimb = (o, a, b) => { _c.subVectors(b, a); const L = _c.length() || .001; o.position.copy(a).addScaledVector(_c, .5); o.quaternion.setFromUnitVectors(UP, _c.divideScalar(L)); o.scale.set(1, L, 1); };
  for (const s of [1, 2, 3, 4]) {
    const th = (s - 1) * Math.PI / 2, a = { s, th, on: false, me: false, k: 0, kt: 0, hy: 0, hp: -.3, ty: 0, tp: -.3, tagKey: '' };
    const g = new T.Group(); g.position.set(Math.sin(th) * R_SEAT, 0, Math.cos(th) * R_SEAT); g.rotation.y = th; scene.add(g); a.g = g;
    // стул
    const seat = mesh(new RB(.46, .06, .44, 2, .015), chairM); seat.position.set(0, .45, .04); g.add(seat);
    const back = mesh(new RB(.44, .5, .05, 2, .015), chairM); back.position.set(0, .76, .27); back.rotation.x = .08; g.add(back);
    [[-.19, -.15], [.19, -.15], [-.19, .23], [.19, .23]].forEach(([x, z]) => { const l = mesh(new T.CylinderGeometry(.016, .016, .43, 8), chairM); l.position.set(x, .215, z); g.add(l); });
    // красная кнопка «готов голосовать»
    const bg = new T.Group(); bg.position.set(.2, TOP, -.46); g.add(bg);
    const bbase = mesh(new T.CylinderGeometry(.052, .06, .02, 28), btnBaseM); bbase.position.y = .01; bg.add(bbase);
    const bring = new T.Mesh(new T.RingGeometry(.06, .078, 36), hazardM); bring.rotation.x = -Math.PI / 2; bring.position.y = .0012; bg.add(bring);
    const capM = std({ color: 0xc8201c, roughness: .32, metalness: .1, emissive: 0xff2a1a, emissiveIntensity: .2 });
    const cap = mesh(new T.CylinderGeometry(.038, .04, .022, 28), capM); cap.position.y = .031; bg.add(cap);
    const dome = mesh(new T.SphereGeometry(.038, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM); dome.scale.y = .32; dome.position.y = .042; bg.add(dome);
    const bglow = new T.Sprite(new T.SpriteMaterial({ map: glowDotT, color: 0xff3a2a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false })); bglow.scale.set(.24, .24, 1); bglow.position.y = .05; bg.add(bglow);
    Object.assign(a, { bCap: cap, bDome: dome, bCapM: capM, bGlow: bglow, bHit: [bbase, cap, dome], bOn: false, bk: 0 });
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
    const tag = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthTest: false })); tag.scale.set(.46, .115, 1); tag.position.set(0, 1.5, 0); tag.renderOrder = 10; tag.visible = false; g.add(tag); a.tag = tag;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: spkT, transparent: true, depthTest: false, opacity: 0 })); sp.scale.set(.1, .1, 1); sp.position.set(0, 1.64, 0); sp.renderOrder = 11; sp.visible = false; g.add(sp); a.sp = sp; a.spk = false;
    AV[s] = a;
  }

  /* состояние камеры и ввода */
  let btnActive = false, aimBtn = false;
  let mySeat = 1, yaw = 0, pitch = -.38, readHold = false, locked = false, menuOn = true, clock = 0, userAt = 0, auto = null;
  let mouseN = null, aimN = 0, aimOn = false, mk = { mine: 0, kind: '', cands: null }, roundId = 0, cardKey = '', hideMine = false;
  const tw = [];
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  const tween = (dur, fn, delay = 0) => new Promise(res => tw.push({ t0: clock + delay, dur, fn, res }));
  const seatYaw = s => (s - 1) * Math.PI / 2;

  W.menu = on => { menuOn = on; for (const s in AV) { AV[s].body.visible = !on && AV[s].on; AV[s].card.visible = AV[s].body.visible; AV[s].arm.forEach(r => { r.up.visible = r.fo.visible = r.el.visible = r.hand.visible = AV[s].body.visible; }); AV[s].tag.visible = !on; } };
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
  W.sync = d => {
    const me = d.me.seat || 1;
    if (me !== mySeat) { mySeat = me; for (const n in BX) BX[n].dec.rotation.y = seatYaw(me); }
    else for (const n in BX) BX[n].dec.rotation.y = seatYaw(me);
    const roles = d.round && d.round.roles;
    for (const s of [1, 2, 3, 4]) {
      const a = AV[s], p = d.players.find(x => x.seat === s);
      a.on = !!p; a.me = !!(p && p.me); a.bOn = !!(p && p.vote_ready);
      const vis = !menuOn && a.on;
      a.body.visible = vis; a.card.visible = vis; a.arm.forEach(r => { r.up.visible = r.fo.visible = r.el.visible = r.hand.visible = vis; r.shp.visible = vis && !a.me; });
      a.headParts.forEach(o => { o.visible = !a.me; });
      a.tag.visible = !menuOn && !a.me;
      const role = roles && (roles.find(x => x.seat === s) || {}).role;
      const st2 = !p ? 'free' : d.room.phase === 'lobby' ? (p.online ? (p.ready ? 'ready' : 'wait') : 'off') : p.left ? 'left' : !p.online ? 'off' : role || '';
      const key = (p ? p.name : '') + '|' + st2;
      if (key !== a.tagKey) { a.tagKey = key; if (a.tag.material.map) a.tag.material.map.dispose(); a.tag.material.map = tex(paintTag(s, p ? p.name : '', st2)); a.tag.material.needsUpdate = true; }
      a.cf.material.map = a.me ? myCardT : blankT;
    }
    // карточка в моих руках
    const ck = (d.me.role || '') + JSON.stringify(d.me.card || {}) + hideMine;
    if (ck !== cardKey) { cardKey = ck; const c = paintCardFront(d.me.role && !hideMine ? { role: d.me.role, card: d.me.card, dict: (d.round && d.round.dict) || DICT0 } : hideMine && d.me.role ? 'hidden' : null); myCardT.image = c; myCardT.needsUpdate = true; }
    // контейнеры
    btnActive = d.room.phase === 'talk' && !d.room.paused;
    const rd = d.round, rid = rd ? rd.id : 0;
    if (rid !== roundId) { roundId = rid; W.resetRound(true); }
    setBoxes(rd);
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
    ren.setSize(w, h, false); cam.aspect = w / h; cam.fov = w / h < 1 ? 74 : 62; cam.updateProjectionMatrix();
  });
  ro.observe(cv);

  /* кадр */
  W.frame = (dt, t) => {
    clock += dt;
    for (let i = tw.length - 1; i >= 0; i--) { const x = tw[i], k = (clock - x.t0) / x.dur; if (k < 0) continue; x.fn(Math.min(1, k)); if (k >= 1) { tw.splice(i, 1); x.res(); } }
    // камера
    if (menuOn) {
      const a = t * .045; cam.position.set(Math.sin(a) * 2.75, 1.95, Math.cos(a) * 2.75); cam.lookAt(0, .78, 0);
    } else {
      if (auto) { const f = 1 - Math.exp(-dt * 3); yaw += (auto.y - yaw) * f; pitch += (auto.p - pitch) * f; }
      const me = AV[mySeat]; me.g.updateMatrixWorld(); _a.set(0, EYE, -.02).applyMatrix4(me.g.matrixWorld);
      cam.position.copy(_a); cam.rotation.set(pitch, seatYaw(mySeat) + yaw, 0);
      me.ty = yaw; me.tp = pitch; me.hy = yaw; me.hp = pitch;
    }
    cam.updateMatrixWorld();
    // фигуры: голова, дыхание, карточка, руки
    for (const s of [1, 2, 3, 4]) {
      const a = AV[s];
      { const on = a.bOn && btnActive && a.on, hov = a.me && aimBtn; a.bk += ((on ? 1 : 0) - a.bk) * (1 - Math.exp(-dt * 16));   // кнопка: утоплена и светится, когда нажата
        a.bCap.position.y = .031 - .009 * a.bk; a.bDome.position.y = .042 - .009 * a.bk; a.bCapM.emissiveIntensity = .2 + 1.7 * a.bk + (hov ? .35 : 0) + (btnActive && a.me && !on ? .15 * (1 + Math.sin(t * 4)) : 0); a.bGlow.material.opacity = .9 * a.bk; }
      if (!a.on || menuOn) continue;
      const f = 1 - Math.exp(-dt * 9);
      if (!a.me) { a.hy += (a.ty - a.hy) * f; a.hp += (a.tp - a.hp) * f; a.hd.rotation.set(a.hp * .85, a.hy * .9, 0); }
      a.body.position.y = Math.sin(t * 1.7 + s * 1.3) * .004;
      { const o = a.sp.material, want = a.spk && !a.me ? 1 : 0; o.opacity += (want - o.opacity) * (1 - Math.exp(-dt * 14)); a.sp.visible = o.opacity > .02; const k2 = 1 + (a.spk ? Math.sin(t * 12) * .08 : 0); a.sp.scale.set(.1 * k2, .1 * k2, 1); }
      a.kt = (a.me ? readHold || pitch < -.62 : a.hp < -.62) ? 1 : 0;
      a.k += (a.kt - a.k) * (1 - Math.exp(-dt * 7));
      const k = easeIO(clamp(a.k, 0, 1));
      a.g.updateMatrixWorld(); a.body.updateMatrixWorld();
      // покой: у груди, наклонена к лицу
      _a.set(0, .96, -.33).applyMatrix4(a.body.matrixWorld); _e.set(-.75, 0, 0); _q.setFromEuler(_e); a.g.getWorldQuaternion(_q2); _q.premultiply(_q2);
      // чтение: перед глазами
      if (a.me) { _b.set(0, -.035, -.27).applyMatrix4(cam.matrixWorld); _q2.copy(cam.quaternion); }
      else { a.hd.updateMatrixWorld(); _b.set(0, .02, -.3).applyMatrix4(a.hd.matrixWorld); a.hd.getWorldQuaternion(_q2); }
      a.card.position.lerpVectors(_a, _b, k); a.card.quaternion.slerpQuaternions(_q, _q2, k);
      a.card.updateMatrixWorld();
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
    ren.render(scene, cam);
  };

  W.dispose = () => {
    ro.disconnect();
    const seenT = new Set();
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture && !seenT.has(v)) { seenT.add(v); v.dispose(); } } m.dispose(); });
    });
    if (scene.environment) scene.environment.dispose();
    ren.dispose(); try { ren.forceContextLoss(); } catch (e) { /* уже потерян */ }
  };
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

function paintFloor() {
  const c = cnv(1024, 1024), x = c.getContext('2d');
  x.fillStyle = '#22272d'; x.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${.015 + Math.random() * .03})`; x.fillRect(i * 256, j * 256, 256, 256); }
  noise(x, 1024, 1024, 26000, .07);
  for (let i = 0; i < 6; i++) { const gx = Math.random() * 1024, gy = Math.random() * 1024, r = 60 + Math.random() * 160, g = x.createRadialGradient(gx, gy, 0, gx, gy, r); g.addColorStop(0, 'rgba(0,0,0,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(gx - r, gy - r, r * 2, r * 2); }
  x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 4; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 256, 0); x.lineTo(i * 256, 1024); x.moveTo(0, i * 256); x.lineTo(1024, i * 256); x.stroke(); }
  x.strokeStyle = 'rgba(255,255,255,.04)'; x.lineWidth = 2; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 256 + 3, 0); x.lineTo(i * 256 + 3, 1024); x.stroke(); }
  return c;
}
function paintWall() {
  const c = cnv(1024, 512), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#20252c'); g.addColorStop(1, '#2a3038'); x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  noise(x, 1024, 512, 14000, .06);
  x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 4; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 256, 0); x.lineTo(i * 256, 430); x.stroke(); } x.beginPath(); x.moveTo(0, 300); x.lineTo(1024, 300); x.stroke();
  x.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 4; i++) for (const yy of [20, 280, 320, 410]) { x.beginPath(); x.arc(i * 256 + 14, yy, 3, 0, 7); x.arc(i * 256 + 242, yy, 3, 0, 7); x.fill(); }
  x.fillStyle = '#121418'; x.fillRect(0, 430, 1024, 82);
  x.save(); x.beginPath(); x.rect(0, 440, 1024, 34); x.clip(); x.fillStyle = '#1a1b1d'; x.fillRect(0, 440, 1024, 34); x.fillStyle = 'rgba(196,150,52,.55)'; for (let i = -40; i < 1100; i += 44) { x.beginPath(); x.moveTo(i, 474); x.lineTo(i + 22, 474); x.lineTo(i + 56, 440); x.lineTo(i + 34, 440); x.fill(); } x.restore();
  return c;
}
function paintFelt() {
  const c = cnv(1024, 1024), x = c.getContext('2d');
  const g = x.createRadialGradient(512, 512, 60, 512, 512, 720); g.addColorStop(0, '#1c2733'); g.addColorStop(1, '#10161d'); x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
  noise(x, 1024, 1024, 30000, .05);
  x.strokeStyle = 'rgba(132,217,253,.05)'; x.lineWidth = 1; for (let i = 0; i <= 1024; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 1024); x.moveTo(0, i); x.lineTo(1024, i); x.stroke(); }
  x.strokeStyle = 'rgba(132,217,253,.16)'; x.lineWidth = 3; x.strokeRect(22, 22, 980, 980);
  x.setLineDash([14, 10]); x.strokeStyle = 'rgba(220,230,240,.16)'; x.lineWidth = 3;
  const s = 731; for (const n of [1, 2, 3, 4]) { const [bx, bz] = BOXP[n]; x.strokeRect(512 + bx * s - 137, 512 + bz * s - 96, 274, 192); }
  x.setLineDash([]);
  x.fillStyle = 'rgba(220,230,240,.07)'; x.font = F_H(46); x.textAlign = 'center'; x.fillText('RUSH CASE', 512, 92); x.font = F_H(30); x.fillText('ОПЕРАЦИЯ «КРОТ» · СЕКРЕТНО', 512, 960);
  return c;
}
function paintMap() {
  const c = cnv(1024, 552), x = c.getContext('2d');
  x.fillStyle = '#0c141d'; x.fillRect(0, 0, 1024, 552);
  x.strokeStyle = 'rgba(132,217,253,.08)'; for (let i = 0; i < 1024; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 552); x.stroke(); } for (let i = 0; i < 552; i += 32) { x.beginPath(); x.moveTo(0, i); x.lineTo(1024, i); x.stroke(); }
  x.strokeStyle = 'rgba(132,217,253,.22)'; x.lineWidth = 2;
  for (let k = 0; k < 9; k++) { x.beginPath(); let px = 0, py = 80 + k * 50 + Math.random() * 30; x.moveTo(px, py); while (px < 1024) { px += 60 + Math.random() * 80; py += (Math.random() - .5) * 60; x.lineTo(px, py); } x.stroke(); }
  x.fillStyle = 'rgba(132,217,253,.12)'; x.fillRect(140, 150, 230, 140); x.fillRect(560, 260, 300, 170); x.fillRect(420, 90, 120, 90);
  x.setLineDash([10, 8]); x.strokeStyle = '#e2493f'; x.lineWidth = 3; x.beginPath(); x.moveTo(200, 420); x.bezierCurveTo(340, 300, 500, 380, 700, 330); x.stroke(); x.setLineDash([]);
  [[200, 420], [700, 330], [470, 140]].forEach(([px, py], i) => { x.fillStyle = i === 1 ? '#e2493f' : '#e3a33b'; x.beginPath(); x.arc(px, py, 10, 0, 7); x.fill(); x.strokeStyle = 'rgba(0,0,0,.6)'; x.stroke(); });
  x.fillStyle = 'rgba(233,238,243,.85)'; x.font = F_H(40); x.textAlign = 'left'; x.fillText('ОПЕРАЦИЯ «КРОТ»', 36, 60);
  x.font = F_B(20, 700); x.fillStyle = 'rgba(132,217,253,.8)'; x.fillText('СЕКТОР 4 · КОНТЕЙНЕРЫ 01–04', 38, 92);
  x.fillStyle = 'rgba(226,73,63,.85)'; x.font = F_H(34); x.save(); x.translate(860, 110); x.rotate(-.18); x.strokeStyle = 'rgba(226,73,63,.85)'; x.lineWidth = 4; x.strokeRect(-110, -36, 220, 56); x.textAlign = 'center'; x.fillText('СЕКРЕТНО', 0, 6); x.restore();
  return c;
}
function paintScreen(i) {
  const c = cnv(512, 296), x = c.getContext('2d');
  x.fillStyle = '#04111a'; x.fillRect(0, 0, 512, 296);
  x.fillStyle = 'rgba(132,217,253,.16)'; x.fillRect(0, 0, 512, 34);
  x.fillStyle = '#84d9fd'; x.font = F_B(18, 800); x.fillText(i ? 'ПЕРЕХВАТ · КАНАЛ 4' : 'СИГНАЛ · ШТАБ', 14, 23);
  x.strokeStyle = '#84d9fd'; x.lineWidth = 2; x.beginPath(); for (let k = 0; k <= 480; k += 6) { const y = 150 + Math.sin(k * .05 + i) * 30 * Math.sin(k * .013) + (Math.random() - .5) * 10; k ? x.lineTo(16 + k, y) : x.moveTo(16, y); } x.stroke();
  x.fillStyle = 'rgba(132,217,253,.5)'; x.font = '14px monospace';
  for (let k = 0; k < 5; k++) x.fillText(`> ${(Math.random() * 1e8 | 0).toString(16).toUpperCase()} ${['OK', 'SYNC', 'LINK', 'WAIT', 'RX'][k]}`, 16, 214 + k * 16);
  return c;
}
function paintCrate() {
  const c = cnv(512, 512), x = c.getContext('2d');
  x.fillStyle = '#3a402f'; x.fillRect(0, 0, 512, 512); noise(x, 512, 512, 9000, .1);
  x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 6; for (let i = 0; i < 512; i += 102) { x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
  x.lineWidth = 26; x.strokeStyle = '#2c3124'; x.strokeRect(13, 13, 486, 486);
  x.fillStyle = 'rgba(230,230,210,.5)'; x.font = F_H(96); x.textAlign = 'center'; x.fillText('RUSH', 256, 290);
  x.font = F_B(26, 800); x.fillText('▲ ВЕРХ ▲', 256, 340);
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
function paintTag(s, name, st2) {
  const c = cnv(512, 128), x = c.getContext('2d'); name = String(name || 'Игрок');
  if (st2 === 'free') { x.fillStyle = 'rgba(12,15,19,.55)'; rr(x, 96, 34, 320, 60, 6); x.fill(); x.fillStyle = 'rgba(233,238,243,.5)'; x.font = F_H(34); x.textAlign = 'center'; x.fillText('СВОБОДНО', 256, 76); return c; }
  x.font = F_B(38, 800); const nm = name.length > 16 ? name.slice(0, 15) + '…' : name;
  const lab = { ready: ['ГОТОВ', '#4fd08a'], wait: ['НЕ ГОТОВ', 'rgba(233,238,243,.55)'], off: ['НЕТ СВЯЗИ', '#ff6b61'], left: ['ВЫШЕЛ', '#ff6b61'], krot: ['КРОТ', '#ff6b61'], agent: ['ОПЕРАТИВНИК', '#84d9fd'] }[st2];
  const w = Math.min(500, Math.max(220, x.measureText(nm).width + 104)), X = 256 - w / 2;
  x.fillStyle = 'rgba(12,15,19,.78)'; rr(x, X, 18, w, 62, 5); x.fill(); x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 2; x.stroke();
  x.fillStyle = '#84d9fd'; rr(x, X + 10, 28, 42, 42, 3); x.fill(); x.fillStyle = '#0a1016'; x.font = F_H(32); x.textAlign = 'center'; x.fillText(String(s), X + 31, 61);
  x.fillStyle = '#eef2f6'; x.font = F_B(38, 800); x.textAlign = 'left'; x.fillText(nm, X + 64, 63);
  if (lab) { x.font = F_H(30); const lw = x.measureText(lab[0]).width + 26; x.fillStyle = 'rgba(12,15,19,.82)'; rr(x, 256 - lw / 2, 86, lw, 38, 4); x.fill(); x.fillStyle = lab[1]; x.textAlign = 'center'; x.fillText(lab[0], 256, 115); }
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
   Сигналы — закрытый канал Realtime 'krot:<room>' (событие 'rtc'); если закрытый канал не пустили —
   запасной 'krotpub:<room>:<код>'. Только публичный STUN, без TURN: у части игроков голос может не соединиться —
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
  if (G) for (const s of [1, 2, 3, 4]) G.speak(s, false);
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
  for (const s of [1, 2, 3, 4]) {
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
  const want = !!VC.track && !VC.self && (VC.mode === 'ptt' ? VC.ptt : now < VC.txUntil), tx = want && !gate;
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
  const others = S ? S.players.filter(p => !p.me && !p.left) : [];
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
   «Принять» (15 с) → квадратики «Готово: N/4» → все приняли → игра (#/krot).
   Сервер: krot_mm_state, krot_search, krot_accept, krot_party_* (supabase/krot.sql, раздел «Группы и подбор матча»).
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
function mmTick(ms) {
  clearTimeout(MM.t);
  try {
    if (!MM.w) { MM.w = new Worker(URL.createObjectURL(new Blob(['onmessage=function(e){setTimeout(function(){postMessage(0)},e.data)}'], { type: 'text/javascript' }))); MM.w.onmessage = () => mmPoll(); }
    MM.w.postMessage(ms);
  } catch (e) { MM.t = setTimeout(mmPoll, ms); }
}
async function mmPoll() {
  if (!MM.on) return;
  if (!MM.demo && !authed()) return mmStop();
  try { mmApply(await mmApi('krot_mm_state')); }
  catch (e) { if (/not authenticated/.test(errMsg(e))) return mmStop(); }
  mmSchedule();
}
function mmSchedule() {
  if (!MM.on) return;
  const s = MM.st, p = s && s.party;
  if (!p && !(s && s.game)) return mmStop();   // группы нет — опрашивать нечего
  if (p && p.members.length === 1 && p.state === 'idle' && !s.game && !s.match && !MM.hold) {   // один и не ищет — группа не нужна
    mmApi('krot_party_leave').then(mmApply, () => { /* не важно */ }).then(() => mmStop());
    return;
  }
  mmTick(s.match ? 1000 : p && p.state === 'search' ? 2000 : s.game ? 8000 : 4000);
}

function mmApply(s) {
  if (!s) return;
  const prev = MM.st; MM.st = s; MM.at = Date.now(); MM.off = (s.now || Date.now()) - Date.now();
  try { if (s.party || s.game) localStorage.setItem('krot:mm', '1'); else localStorage.removeItem('krot:mm'); } catch (e) { /* приватный режим */ }
  const p = s.party;
  if (p && p.members.length > 1 && !MM.hold) { MM.hold = true; LS.set('hold', true); }
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
  // все приняли → звук запуска, 4/4 на секунду, экран загрузки игры
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
      <p class="krmm-mode"><i>${ICO_MODE}</i><b>КРОТ</b><span>•</span><span>Бункер</span></p><div class="krmm-body"></div><b class="krmm-t" id="krmmT"></b></section>`;
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
      ? `<div class="krmm-sq">${[0, 1, 2, 3].map(i => `<i class="${i < acc ? 'on' : ''}">${ICO_MAN}</i>`).join('')}</div><p class="krmm-n">Готово: <b>${acc}</b> / 4</p>`
      : '<button class="krmm-acc" type="button">Принять</button><p class="krmm-srv">4 игрока · игровой сервер RUSH CASE</p>';
  }
  mmPopupClock();
}
function mmPopupClock() {
  const t = document.getElementById('krmmT'), m = MM.st && MM.st.match; if (!t || !m) return;
  t.textContent = mmFmt(m.deadline - (Date.now() + MM.off));
}
function mmPopupAll() {   // все приняли: четыре зелёных квадрата
  const b = document.querySelector('#krmmOv .krmm-body'); if (!b) return;
  b.dataset.k = 'all'; b.innerHTML = `<div class="krmm-sq">${[0, 1, 2, 3].map(() => `<i class="on">${ICO_MAN}</i>`).join('')}</div><p class="krmm-n">Готово: <b>4</b> / 4</p>`;
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
    bar.querySelector('.krmm-bm').innerHTML = 'КРОТ · Бункер' + (p && p.members.length > 1 ? `<br>группа ${p.members.length}/4` : '');
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
function mmSlots() {
  const inv = document.getElementById('mnInvite'); if (!inv) return;
  const p = MM.st && MM.st.party, mates = p ? p.members.filter(m => !m.me) : [];
  const lab = inv.querySelector(':scope > span:not(.krmm-mates)');
  if (lab && !lab.dataset.t) lab.dataset.t = lab.textContent;
  let box = inv.querySelector('.krmm-mates');
  if (!mates.length) { if (box) box.remove(); if (lab && lab.dataset.t) lab.textContent = lab.dataset.t; inv.classList.remove('krmm-has'); return; }
  if (!box) { box = document.createElement('span'); box.className = 'krmm-mates'; inv.prepend(box); }
  box.innerHTML = mates.map(m => `<span class="krmm-mate${m.online ? '' : ' off'}${m.leader ? ' lead' : ''}" title="${esc(m.name)}${m.leader ? ' — лидер группы' : ''}">${avaHtml(m)}<em>${esc(m.name)}</em></span>`).join('');
  if (lab) lab.textContent = `Группа ${p.members.length}/4`;
  inv.classList.add('krmm-has');
}
function mmCard() {
  const b = document.querySelector('.mnk-go'); if (!b) return;
  const s = MM.st, p = s && s.party, srch = !!(p && p.state === 'search');
  b.textContent = s && s.match ? 'Игра найдена' : srch ? 'Отменить поиск' : 'Играть';
  b.classList.toggle('krmm-srch', srch);
}
function mmMenu() {
  if (!root || view !== 'menu') return;
  const p = MM.st && MM.st.party, key = p ? p.state + p.members.length : '-';
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
  const key = JSON.stringify([p.code, p.state, p.leader, p.members]);
  if (w.dataset.k === key) return; w.dataset.k = key;
  const link = location.origin + location.pathname + '#/krot/' + p.code;
  const rows = [0, 1, 2, 3].map(i => {
    const m = p.members[i];
    if (!m) return '<li class="free"><span class="krmm-av"><b>+</b></span><span class="krmm-nm">Свободное место</span></li>';
    return `<li class="${m.online ? '' : 'off'}"><span class="krmm-av">${avaHtml(m)}</span><span class="krmm-nm">${esc(m.name)}${m.me ? ' <small>(вы)</small>' : ''}</span>${m.leader ? '<em class="krmm-ld">Лидер</em>' : ''}${!m.online ? '<em class="krmm-off">нет связи</em>' : ''}${p.leader && !m.me ? `<button class="kr-btn sm ghost" data-mm="kick" data-n="${i + 1}">Убрать</button>` : ''}</li>`;
  }).join('');
  w.innerHTML = `<section class="krmm-wp kr-glass" role="dialog" aria-labelledby="krmmWh"><button class="kr-ib krmm-wx" data-mm="close" aria-label="Закрыть">${ICO.close}</button>
    <span class="kr-h">Режим «КРОТ»</span><h2 class="kr-t" id="krmmWh">Ваша группа · ${p.members.length}/4</h2>
    <p class="krmm-wl">Позовите друзей: им нужен этот код или ссылка. Группа ищет игру вместе, недостающих добавит подбор.</p>
    <div class="kr-cbig"><span>Код группы</span><b>${esc(p.code)}</b><div><button class="kr-btn sm" data-mm="copy">Скопировать код</button><button class="kr-btn sm" data-mm="link" data-link="${esc(link)}">Ссылка-приглашение</button></div></div>
    <ul class="krmm-ml">${rows}</ul>
    <form class="kr-join krmm-join" autocomplete="off"><input id="krmmCode" maxlength="6" placeholder="Код группы друга" spellcheck="false" aria-label="Код группы друга"><button class="kr-btn">В группу</button></form>
    <p class="kr-fine">Очки недели получают только те, кто ищет игру в одиночку: так друзья не смогут подыгрывать друг другу.</p>
    <div class="krmm-wa">${p.members.length > 1 ? '<button class="kr-btn ghost sm" data-mm="leave">Выйти из группы</button>' : '<span></span>'}<a class="kr-link" href="#/invite" data-mm="close">Реферальная программа — скоро</a></div></section>`;
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
      st.match = { room: 777, deadline: t + 15000, total: 15, accepted: 0, me_ready: false, players: [1, 2, 3, 4].map(i => ({ seat: i, ready: false, me: i === 1, mine: i === 1 })) };
      st.bots = [t + 1400 + rnd(800), t + 2600 + rnd(1200), t + 4000 + rnd(2500)];
    }
    if (st.match) {
      st.match.players.forEach((pl, i) => { if (i && !pl.ready && t >= st.bots[i - 1]) pl.ready = true; });
      st.match.accepted = st.match.players.filter(x => x.ready).length;
      if (st.match.accepted === 4) { if (!st.goAt) st.goAt = t + 1500; if (t >= st.goAt) { st.match = null; st.goAt = 0; st.game = 'demo'; st.gameAt = t; } }
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
const Demo = (() => {
  const D = { onPush: null, onHead: null };
  let st2 = null, iv = 0, heads = 0;
  const DUR = { lobby: 4, brief: 9, talk: 120, vote: 14, revote: 10, open: 8, debrief: 40 };
  const NAMES = shuffle(['Viper', 'Сова', 'Grizzly', 'Lynx', 'Кобра', 'Shade', 'Гром']);
  const TASKS = [['push', 'Продвинуть вариант', 'Добейся, чтобы команда чаще обсуждала контейнер %.'], ['split', 'Разделить мнения', 'Добейся, чтобы голоса команды разделились между двумя вариантами.'],
    ['doubt', 'Посеять сомнение', 'Заставь Оперативников усомниться в одной из правдивых улик.'], ['rush', 'Ускорить решение', 'Подтолкни команду зафиксировать выбор раньше, чем все сверят данные.'],
    ['lead', 'Перехватить лидерство', 'Стань главным в обсуждении и навяжи свою версию.']];
  const now = () => Date.now();
  function reset() {
    st2 = { room: { id: 900001, code: 'DEMO42', kind: 'quick', points: true, phase: 'lobby', rev: 1, phase_at: now(), deadline: null, paused: false, owner: true, times: DUR },
      players: [{ seat: 1, name: myName(), me: true, ready: false, online: true, left: false }], chat: [], cid: 0, rd: null, sec: {}, votes: { main: {}, revote: {} }, plan: [] };
    sys('Демо-комната: это проба без сервера, вместо людей — боты.');
    if (D.quick) {   // пришли из демо-подбора: все уже приняли — сразу брифинг
      D.quick = false;
      NAMES.slice(0, 3).forEach((nm, i) => st2.players.push({ seat: i + 2, name: nm, me: false, ready: true, online: true, left: false, loaded: false }));
      st2.players[0].ready = true; st2.players[0].loaded = false;
      st2.room.mm = true; st2.room.load_at = now(); st2.room.deadline = now() + 10000;
      [1, 2, 3].forEach(i => later(1200 + rnd(5500), () => { st2.players[i].loaded = true; bump(); }));
      clearInterval(iv); iv = setInterval(step, 200); clearInterval(heads); heads = setInterval(botHeads, 700);
      return;
    }
    [1300, 2300, 3200].forEach((t, i) => later(t, () => { st2.players.push({ seat: i + 2, name: NAMES[i], me: false, ready: false, online: true, left: false }); sys(`Игрок ${NAMES[i]} вошёл в комнату.`); bump(); }));
    later(4200, () => { st2.players.forEach(p => { if (!p.me) p.ready = true; }); bump(); });
    later(4300, () => { if (st2.room.phase === 'lobby') { st2.room.deadline = now() + DUR.lobby * 1000; bump(); } });
    clearInterval(iv); iv = setInterval(step, 200);
    clearInterval(heads); heads = setInterval(botHeads, 700);
  }
  const later = (ms, fn) => { const t0 = now() + ms; st2.plan.push([t0, fn]); };
  function sys(t) { st2.chat.push({ id: ++st2.cid, kind: 'sys', seat: null, name: null, text: t, at: now() }); }
  function say(seat, t) {
    if (D.onSpeak) D.onSpeak(seat); const p = st2.players.find(x => x.seat === seat); st2.chat.push({ id: ++st2.cid, kind: 'msg', seat, name: p ? p.name : 'Игрок', text: t, at: now() }); bump(); }
  function botsReady() { if (st2.room.phase === 'talk' && st2.players.every(p => p.vote_ready)) { st2.room.deadline = now(); sys('Все нажали «готов голосовать».'); } }
  function bump() { st2.room.rev++; if (D.onPush) D.onPush(); }
  function phase(p, sec) { st2.room.phase = p; st2.room.phase_at = now(); st2.room.deadline = sec ? now() + sec * 1000 : null; bump(); }
  function gen() {
    const attrs = ['sym', 'gun', 'col'], pattern = Math.random() < .33 ? 'blank' : 'pair', k = pickOne(attrs), v = {};
    attrs.forEach(a => { v[a] = shuffle(Object.keys(DICT0[a])).slice(0, 2); });
    const rest = attrs.filter(a => a !== k), perm = shuffle([1, 2, 3, 4]), boxes = [];
    for (let i = 0; i < 4; i++) { const r = i >> 1, q = i & 1; boxes.push({ n: perm[i], [rest[0]]: v[rest[0]][r], [rest[1]]: v[rest[1]][pattern === 'pair' ? r : q], [k]: v[k][pattern === 'pair' ? q : 0] }); }
    boxes.sort((a, b) => a.n - b.n);
    return { boxes, target: 1 + rnd(4) };
  }
  const clue = (a, v) => ({ attr: a, val: v, label: DICT0[a][v], text: (a === 'sym' ? 'Знак на цели — ' : a === 'gun' ? 'Внутри цели — ' : 'Маркировка цели — ') + DICT0[a][v] + '.' });
  async function start() {
    const g = gen(), tb = g.boxes.find(b => b.n === g.target);
    const decoys = g.boxes.filter(b => b.n !== g.target && ['sym', 'gun', 'col'].filter(a => b[a] === tb[a]).length === 2);
    const decoy = pickOne(decoys.length ? decoys : g.boxes.filter(b => b.n !== g.target));
    const ks = 1 + rnd(4), salt = uuid().replace(/-/g, '') + uuid().replace(/-/g, ''), id = 70000 + rnd(9999);
    const proof2 = 'RUSHKROT|' + id + '|' + g.boxes.map(b => [b.n, b.sym, b.gun, b.col].join(':')).join(';') + '|' + g.target + '|' + salt;
    const tk = pickOne(TASKS), task = { id: tk[0], title: tk[1], text: tk[2].replace('%', nn(decoy.n)) };
    st2.rd = { id, boxes: g.boxes, target: g.target, salt, proof: proof2, commit: await sha256hex(proof2), krot: ks, decoy: decoy.n, cands: null, chosen: null, outcome: null, reason: null, tally: null };
    const attrs = shuffle(['sym', 'gun', 'col']); let i = 0;
    st2.sec = {};
    st2.players.forEach(p => { st2.sec[p.seat] = p.seat === ks ? { role: 'krot', card: { target: g.target, task, text: `Ты — КРОТ. Цель — контейнер ${nn(g.target)}.` } } : { role: 'agent', card: clue(attrs[i], tb[attrs[i++]]) }; });
    st2.votes = { main: {}, revote: {} };
    st2.players.forEach(p => { p.vote_ready = false; });
    phase('brief', DUR.brief); sys('Операция начинается. Проверьте личные данные.');
    planTalk(decoy);
  }
  function planTalk(decoy) {
    const t0 = now() + DUR.brief * 1000, tb = st2.rd.boxes.find(b => b.n === st2.rd.target);
    const diff = ['sym', 'gun', 'col'].find(a => decoy[a] !== tb[a]) || 'sym';
    st2.players.filter(p => !p.me).forEach((p, j) => {
      const s = st2.sec[p.seat];
      const first = s.role === 'krot' ? `У меня: ${clueShort(diff, decoy[diff])}.` : pickOne(['Моя улика: ', 'У меня: ', 'Говорю сразу — ']) + clueShort(s.card.attr, s.card.val) + '.';
      st2.plan.push([t0 + 2500 + j * 3800 + rnd(1500), () => say(p.seat, first)]);
      st2.plan.push([t0 + 17000 + j * 4000 + rnd(3000), () => say(p.seat, pickOne(['Кто ещё не сказал свою улику?', 'Сверяем: у нас противоречие по одному признаку.', 'Не торопимся, проверим ещё раз.', 'Я бы не верил тому, кто первым назвал номер.', 'Хм, подозрительно складно…']))]);
      st2.plan.push([t0 + 31000 + j * 3000 + rnd(2000), () => say(p.seat, `Я за ${nn(s.role === 'krot' ? decoy.n : Math.random() < .75 ? st2.rd.target : decoy.n)}.`)]);
      st2.plan.push([t0 + 36000 + j * 4000 + rnd(4000), () => { if (st2.room.phase === 'talk') { p.vote_ready = true; botsReady(); bump(); } }]);
    });
  }
  function botVotes(stage) {
    st2.players.filter(p => !p.me).forEach(p => {
      const s = st2.sec[p.seat], c = st2.rd.cands;
      let b = s.role === 'krot' ? st2.rd.decoy : Math.random() < .72 ? st2.rd.target : st2.rd.decoy;
      if (stage === 'revote') b = c.includes(b) ? b : pickOne(c);
      st2.plan.push([now() + 1500 + rnd((stage === 'main' ? DUR.vote : DUR.revote) * 600), () => { if (st2.room.phase === (stage === 'main' ? 'vote' : 'revote')) st2.votes[stage][p.seat] = b; }]);
    });
  }
  function agentVotes(stage) { return st2.players.filter(p => st2.sec[p.seat].role === 'agent').sort((a, b) => a.seat - b.seat).map(p => st2.votes[stage][p.seat] || null); }
  function tally(v) {
    const got = v.filter(Boolean); if (got.length < 2) return { res: 'cancel', n: got.length, votes: v };
    const cnt = {}; got.forEach(b => { cnt[b] = (cnt[b] || 0) + 1; }); const top = Math.max(...Object.values(cnt)), lead = Object.keys(cnt).filter(b => cnt[b] === top).map(Number).sort();
    return top >= 2 ? { res: 'chosen', box: lead[0], n: got.length, votes: v } : { res: 'revote', cands: lead, n: got.length, votes: v };
  }
  function finish(chosen, reason, t) {
    const rd = st2.rd; rd.chosen = chosen; rd.reason = reason; rd.outcome = chosen && chosen === rd.target ? 'team' : 'krot';
    const pts = {}; st2.players.forEach(p => { const s = st2.sec[p.seat], w = (rd.outcome === 'team' && s.role === 'agent') || (rd.outcome === 'krot' && s.role === 'krot'); pts[p.seat] = w ? (s.role === 'agent' ? 10 : 15) : 0; });
    rd.tally = Object.assign(t || {}, { pts });
    phase('open', DUR.open); sys(chosen ? `Команда выбрала контейнер ${nn(chosen)}. Вскрываем…` : 'Команда не договорилась. Вскрываем контейнеры…');
  }
  function step() {
    if (!st2) return;
    const t = now();
    for (let i = st2.plan.length - 1; i >= 0; i--) if (st2.plan[i][0] <= t) { const f = st2.plan[i][1]; st2.plan.splice(i, 1); f(); }
    const r = st2.room; if (!r.deadline || t < r.deadline) return;
    if (r.phase === 'lobby') { if (r.mm && st2.players.some(p => !p.loaded) && t < r.load_at + 25000) return; if (st2.players.length === 4) start(); r.deadline = null; return; }
    if (r.phase === 'brief') { phase('talk', DUR.talk); sys('Брифинг окончен. Обсуждайте — голосом и в чате.'); return; }
    if (r.phase === 'talk') { phase('vote', DUR.vote); sys('Обсуждение завершено. Зафиксируйте контейнер.'); botVotes('main'); return; }
    if (r.phase === 'vote') {
      const tl = tally(agentVotes('main'));
      if (tl.res === 'cancel') { st2.rd.outcome = 'cancel'; st2.rd.reason = 'few_votes'; st2.rd.tally = { main: tl }; phase('done'); sys('Раунд отменён: проголосовало меньше двух Оперативников.'); return; }
      if (tl.res === 'chosen') return finish(tl.box, 'majority', { main: tl });
      st2.rd.cands = tl.cands; st2.rd.tally = { main: tl }; phase('revote', DUR.revote); sys('Голоса разделились. Доп. голосование: ' + tl.cands.map(nn).join(' или ') + '.'); botVotes('revote'); return;
    }
    if (r.phase === 'revote') {
      const c = st2.rd.cands, v1 = agentVotes('main'), v2 = agentVotes('revote'), eff = v1.map((v, i) => c.includes(v2[i]) ? v2[i] : c.includes(v) ? v : null);
      const tl = tally(eff); return finish(tl.res === 'chosen' ? tl.box : null, tl.res === 'chosen' ? 'revote' : 'split', Object.assign(st2.rd.tally || {}, { revote: tl }));
    }
    if (r.phase === 'open') { phase('debrief', DUR.debrief); sys(`Цель — контейнер ${nn(st2.rd.target)}. Роли раскрыты.`); return; }
    if (r.phase === 'debrief') { phase('done'); }
  }
  function botHeads() {
    if (!st2 || !D.onHead) return;
    st2.players.forEach(p => {
      if (p.me || Math.random() < .55) return;
      const th = (p.seat - 1) * Math.PI / 2, ex = Math.sin(th) * (R_SEAT - .02), ez = Math.cos(th) * (R_SEAT - .02);
      let tx, ty, tz;
      const r = Math.random();
      if (r < .4) { const b = BOXP[1 + rnd(4)]; tx = b[0]; ty = TOP + .1; tz = b[1]; }
      else if (r < .8) { const o = st2.players[rnd(st2.players.length)], t2 = (o.seat - 1) * Math.PI / 2; tx = Math.sin(t2) * R_SEAT; ty = EYE; tz = Math.cos(t2) * R_SEAT; if (o.seat === p.seat) return; }
      else { D.onHead(p.seat, (Math.random() - .5) * .3, -.85); return; }
      const dx = tx - ex, dy = ty - EYE, dz = tz - ez; let y = Math.atan2(-dx, -dz) - th; y = Math.atan2(Math.sin(y), Math.cos(y));
      D.onHead(p.seat, y, Math.atan2(dy, Math.hypot(dx, dz)));
    });
  }
  function snap(after) {
    const r = st2.room, rd = st2.rd, ph = r.phase, me = st2.players.find(p => p.me), sec = rd ? st2.sec[me.seat] : null;
    const reveal = rd && rd.outcome && ['open', 'debrief', 'done'].includes(ph), roles = reveal && ['debrief', 'done'].includes(ph);
    return { now: now(), room: Object.assign({}, r),
      players: st2.players.map(p => Object.assign({}, p)),
      me: { seat: me.seat, ready: me.ready, role: sec ? sec.role : null, card: sec ? sec.card : null, vote: rd ? st2.votes.main[me.seat] || null : null, revote: rd ? st2.votes.revote[me.seat] || null : null, locked: false },
      round: !rd ? null : { id: rd.id, boxes: rd.boxes, dict: DICT0, commit: rd.commit, cands: rd.cands, target: reveal ? rd.target : null, salt: reveal ? rd.salt : null, proof: reveal ? rd.proof : null,
        chosen: reveal ? rd.chosen : null, outcome: reveal ? rd.outcome : null, reason: reveal ? rd.reason : null,
        roles: roles ? st2.players.map(p => ({ seat: p.seat, role: st2.sec[p.seat].role, card: st2.sec[p.seat].card })) : null,
        votes: roles ? [].concat(...['main', 'revote'].map(s => Object.keys(st2.votes[s]).map(k => ({ seat: +k, stage: s, box: st2.votes[s][k] })))) : null,
        tally: roles ? rd.tally : null },
      chat: st2.chat.filter(m => m.id > (after || 0)) };
  }
  D.rpc = async (n, a) => {
    await new Promise(r => setTimeout(r, 40 + rnd(80)));
    a = a || {};
    if (n === 'krot_quick' || n === 'krot_create' || n === 'krot_join') { reset(); return snap(0); }
    if (!st2) throw new Error('not in room');
    if (n === 'krot_state') return snap(a.p_after);
    if (n === 'krot_tick') return { now: now(), phase: st2.room.phase, rev: st2.room.rev, deadline: st2.room.deadline, paused: false };
    if (n === 'krot_ready') { const me = st2.players.find(p => p.me); me.ready = a.p_ready; if (st2.players.length === 4 && st2.players.every(p => p.ready)) st2.room.deadline = now() + 3000; bump(); return { ok: true }; }
    if (n === 'krot_vote') {
      const ph = st2.room.phase; if (ph !== 'vote' && ph !== 'revote') throw new Error('closed');
      const stg = ph === 'vote' ? 'main' : 'revote'; if (stg === 'revote' && !st2.rd.cands.includes(a.p_box)) throw new Error('bad box');
      st2.votes[stg][st2.players.find(p => p.me).seat] = a.p_box; return { ok: true, box: a.p_box, stage: stg };
    }
    if (n === 'krot_chat_send') {
      const t = String(a.p_text || '').trim(); if (!t) throw new Error('empty');
      const me = st2.players.find(p => p.me); st2.chat.push({ id: ++st2.cid, kind: 'msg', seat: me.seat, name: me.name, text: t, at: now() });
      const m = /\b0?([1-4])\b/.exec(t); const bot = st2.players.find(p => !p.me);
      if (m && bot && ['talk', 'brief'].includes(st2.room.phase)) later(1800 + rnd(1500), () => say(bot.seat, pickOne([`Почему именно ${nn(+m[1])}?`, `${nn(+m[1])}? Давай сверим признаки.`, `С ${nn(+m[1])} не сходится моя улика.`])));
      bump(); return { ok: true, id: st2.cid, text: t, at: now() };
    }
    if (n === 'krot_vote_ready') { if (st2.room.phase !== 'talk') throw new Error('not talk'); st2.players.find(p => p.me).vote_ready = a.p_on !== false; botsReady(); bump(); return { now: now(), phase: st2.room.phase, rev: st2.room.rev, deadline: st2.room.deadline, paused: false }; }
    if (n === 'krot_loaded') { const me = st2.players.find(p => p.me); me.loaded = true; bump(); return { now: now(), phase: st2.room.phase, rev: st2.room.rev, deadline: st2.room.deadline, paused: false }; }
    if (n === 'krot_leave') { D.stop(); return { ok: true }; }
    if (n === 'krot_report') return { ok: true };
    throw new Error('unknown ' + n);
  };
  D.stop = () => { clearInterval(iv); clearInterval(heads); iv = heads = 0; st2 = null; };
  D.skip = () => { if (st2 && st2.room.deadline) st2.room.deadline = now(); };
  return D;
})();
K.dbg = { voiceTest: n => (DEMO_OK ? voiceSelfTest(n) : null), voice: () => VC, vkey: d => (DEMO_OK ? vcKey(d) : null), state: () => S, skip: () => Demo.skip(), demo: () => api === Demo, mm: x => (DEMO_OK && x ? mmApply(x) : MM.st) };   // для проверки из браузера (подставить состояние подбора — только localhost)
})();

(function (root) {
'use strict';
const { thyp, tsin, tcos, tatan2 } = root.TacMath, TacNav = root.TacNav;
// случайность — только от seed раунда (mulberry32): тот же seed и те же команды игрока → тот же раунд везде
function tacRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let TR = tacRng(1); // ГСЧ текущей игры (в одном окне/запросе считается одна игра за раз)
const rand = (a, b) => a + TR() * (b - a);
const pick = a => a[Math.floor(TR() * a.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
/* =====================================================================
   RUSH CASE · «Тактика»: данные, симуляция раунда, экономика, боты (из DINK). Общий для сайта и сервера.
   Всё в пикселях карты; 1 px ≈ map.unitsPerPx юнитов CS2. Время — секунды.
   ===================================================================== */

const TAC = {
  ROUNDS: 6, ROUND_TIME: 115, BOMB_TIME: 40, PLANT_TIME: 3.2, DEFUSE: 10, DEFUSE_KIT: 5,
  START_MONEY: 800, MAX_MONEY: 16000,
  WIN: { elim: 3250, time: 3250, bomb: 3500, defuse: 3500 },
  LOSS: [1400, 1900, 2400, 2900, 3400], PLANT_BONUS: 800,
  SMOKE_R: 32, SMOKE_TIME: 18, FIRE_R: 26, FIRE_TIME: 7, FIRE_DPS: 32, FLASH_R: 520, THROW_MAX: 640,
  UNIT_R: 7, VIEW: 1400,
  MOVE_K: 0.8, // темп передвижения: 0.8 от бега CS2 — чтобы успевать следить и отдавать приказы
  FOV: 1.05,   // полуугол обзора (рад, ≈ 120° всего): врага видно на экране, только если он в обзоре твоего игрока
};

// оружие (по мотивам CS2): урон за пулю, бронепробиваемость, темп (с/выстрел), меткость, дальность (юниты)
const TWEAP = {
  glock:  { name: 'Glock-18',     icon: 'pistol', type: 'pistol', side: 'T',  price: 200,  dmg: 30,  pen: 0.47,  rof: 0.15, mag: 20, reload: 2.2, acc: 0.6,  range: 1300, hs: 0.9,  speed: 240, reward: 300 },
  usp:    { name: 'USP-S',        icon: 'pistol', type: 'pistol', side: 'CT', price: 200,  dmg: 35,  pen: 0.505, rof: 0.17, mag: 12, reload: 2.2, acc: 0.68, range: 1500, hs: 1,    speed: 240, reward: 300 },
  deagle: { name: 'Desert Eagle', icon: 'deagle', type: 'pistol',             price: 700,  dmg: 53,  pen: 0.93,  rof: 0.27, mag: 7,  reload: 2.2, acc: 0.58, range: 1900, hs: 1,    speed: 230, reward: 300 },
  mac10:  { name: 'MAC-10',       icon: 'smg',    type: 'smg',    side: 'T',  price: 1050, dmg: 29,  pen: 0.575, rof: 0.075, mag: 30, reload: 2.6, acc: 0.5, range: 1000, hs: 0.75, speed: 240, reward: 600 },
  mp9:    { name: 'MP9',          icon: 'smg',    type: 'smg',    side: 'CT', price: 1250, dmg: 26,  pen: 0.6,   rof: 0.07, mag: 30, reload: 2.1, acc: 0.52, range: 1100, hs: 0.75, speed: 240, reward: 600 },
  galil:  { name: 'Galil AR',     icon: 'galil',  type: 'rifle',  side: 'T',  price: 1800, dmg: 30,  pen: 0.775, rof: 0.09, mag: 35, reload: 2.9, acc: 0.58, range: 2000, hs: 0.9,  speed: 215, reward: 300 },
  famas:  { name: 'FAMAS',        icon: 'famas',  type: 'rifle',  side: 'CT', price: 2050, dmg: 30,  pen: 0.7,   rof: 0.09, mag: 25, reload: 3.3, acc: 0.6,  range: 2000, hs: 0.9,  speed: 220, reward: 300 },
  ak47:   { name: 'AK-47',        icon: 'ak',     type: 'rifle',  side: 'T',  price: 2700, dmg: 36,  pen: 0.775, rof: 0.1,  mag: 30, reload: 2.5, acc: 0.64, range: 2600, hs: 1,    speed: 215, reward: 300 },
  m4a1s:  { name: 'M4A1-S',       icon: 'm4',     type: 'rifle',  side: 'CT', price: 2900, dmg: 38,  pen: 0.7,   rof: 0.1,  mag: 20, reload: 3.1, acc: 0.68, range: 2600, hs: 1,    speed: 225, reward: 300 },
  awp:    { name: 'AWP',          icon: 'awp',    type: 'sniper',             price: 4750, dmg: 115, pen: 0.975, rof: 1.46, mag: 5,  reload: 3.7, acc: 0.86, range: 6000, hs: 0.3,  speed: 200, reward: 100, moveAcc: 0.05 },
};
const TNADES = {
  smoke:   { name: 'Дым',     price: 300, max: 1, key: 'Q' },
  flash:   { name: 'Флешка',  price: 200, max: 2, key: 'E' },
  molotov: { name: 'Молотов', price: 400, priceCT: 500, nameCT: 'Зажигательная', max: 1, key: 'R' },
};
const TROLES = { igl: 'Капитан', entry: 'Энтри', awp: 'Снайпер', support: 'Саппорт', lurk: 'Люркер' };
const TROLE_KEYS = Object.keys(TROLES);
// навык: реакция (с), меткость (множитель), шанс хедшота с одного попадания
// (добивает чаще всего именно хедшот, поэтому с 0.2 итоговый HS% выходит около 50%, как в CS2)
const TSKILL = {
  easy:   { react: 0.44, aim: 0.8,  hs: 0.12 },
  normal: { react: 0.33, aim: 0.95, hs: 0.18 },
  hard:   { react: 0.25, aim: 1.08, hs: 0.26 },
  user:   { react: 0.3,  aim: 1.0,  hs: 0.2 },
};
// режим «Ставка»: своя пятёрка — всегда «средние» (сила 0.5), соперники — по уровню ставки; сила s: 0 — слабые … 1 — сильные.
// s для каждого уровня и стороны подобран tools/bet-calibrate.js так, чтобы без помощи игрока ставка в среднем возвращала ~88%.
const betSkill = s => ({ react: 0.5 - 0.3 * s, aim: 0.75 + 0.4 * s, hs: 0.1 + 0.2 * s });
const BET = {
  MONEY: 6000, // у каждого игрока обеих команд — хватает на фулл бай с гранатами
  US: betSkill(0.5),
  TIERS: [
    { k: 'easy', name: 'Лёгкие', mult: 1.5, s: { CT: 0.25, T: 0.25 } },
    { k: 'normal', name: 'Средние', mult: 2, s: { CT: 0.5, T: 0.5 } },
    { k: 'hard', name: 'Сложные', mult: 5, s: { CT: 0.9, T: 0.9 } },
  ],
};
const BOT_NAMES = ['BOT Kirill', 'BOT Maks', 'BOT Oleg', 'BOT Stas', 'BOT Yura'];
const MATE_NAMES = ['Grom', 'Zubr', 'Kot', 'Lis'];

const angNorm = a => tatan2(tsin(a), tcos(a));
const angAbs = (a, b) => Math.abs(angNorm(a - b));
const dist2 = (a, b) => thyp(a.x - b.x, a.y - b.y);
const other = t => (t === 'T' ? 'CT' : 'T');
const nadePrice = (k, team) => (k === 'molotov' && team === 'CT' ? TNADES.molotov.priceCT : TNADES[k].price);
const nadeName = (k, team) => (k === 'molotov' && team === 'CT' ? TNADES.molotov.nameCT : TNADES[k].name);

let TAC_NAV = null;
function tacNav() {
  if (!TAC_NAV) { TAC_NAV = new TacNav(root.TAC_MAPS.map1); TAC_NAV.analyze(); }
  return TAC_NAV;
}

class TacGame {
  constructor(opts) {
    this.nav = tacNav();
    this.info = this.nav.info;
    this.map = this.nav.map;
    this.UPX = this.map.unitsPerPx;
    this.us = opts.side;              // сторона игрока
    this.them = other(opts.side);
    this.diff = opts.difficulty || 'normal';
    this.pauseOnContact = !!opts.pauseOnContact;
    // режим «Ставка»: боты играют за обе стороны, игрок только закупает и кидает гранаты своей команды; один раунд, деньги заданы
    this.auto = !!opts.auto;
    this.seed = opts.seed >>> 0;
    this.rng = tacRng(this.seed); TR = this.rng;
    this.tick = 0;   // кадров симуляции в этом раунде (шаг всегда 1/30 с)
    this.cmds = [];  // броски гранат игроком: { k: кадр, id, type, x, y } — сервер повторяет их в том же кадре
    this.rounds = opts.rounds || TAC.ROUNDS;
    this.roundNo = 0;
    this.score = { T: 0, CT: 0 };
    this.lossStreak = { T: 0, CT: 0 };
    this.history = [];
    this.players = [];
    for (const team of ['CT', 'T']) {
      const mine = team === this.us;
      for (let i = 0; i < 5; i++) {
        this.players.push({
          id: this.players.length, num: (team === 'CT' ? 1 : 6) + i, team, us: mine,
          name: mine ? (opts.names && opts.names[i]) || (i ? MATE_NAMES[i - 1] : 'Ты') : BOT_NAMES[i],
          role: mine ? (opts.roles && opts.roles[i]) || TROLE_KEYS[i] : TROLE_KEYS[i],
          skill: (mine ? opts.skillUs : opts.skillThem) || (mine ? TSKILL.user : TSKILL[this.diff]),
          money: opts.money || TAC.START_MONEY, prim: null, pist: team === 'T' ? 'glock' : 'usp',
          armor: 0, helmet: false, kit: false, nades: { smoke: 0, flash: 0, molotov: 0 },
          stats: { k: 0, d: 0, a: 0, dmg: 0, hs: 0, fa: 0, nades: 0, bought: 0, opK: 0, opD: 0, clutchW: 0, clutchA: 0 },
        });
      }
    }
  }

  // события для интерфейса (звуки и т.п.): 'shot', 'kill', 'plant', 'defuse', 'end'
  emit(type, data) { if (this.onEvent) this.onEvent(type, data, this); }

  team(t) { return this.players.filter(p => p.team === t); }
  alive(t) { return this.players.filter(p => p.team === t && p.alive); }
  weapon(p) { return p.prim || p.pist; }

  /* ===================== раунд ===================== */
  startRound() {
    TR = this.rng;
    this.roundNo++;
    Object.assign(this, {
      phase: 'buy', t: 0, timeLeft: TAC.ROUND_TIME, bomb: null, result: null,
      nades: [], smokes: [], fires: [], flashes: [], tracers: [], feed: [], deaths: [], marks: [],
      firstKill: null, clutch: { T: null, CT: null }, contact: false, requestPause: false,
      known: { T: new Map(), CT: new Map() }, ai: { t: 0, team: null },
    });
    for (const team of ['CT', 'T']) {
      const sp = this.map.spawns[team], ps = this.team(team);
      ps.forEach((p, i) => {
        const a = (i / 5) * Math.PI * 2, r = i ? 16 : 0;
        const [x, y] = this.nav.nearestFloor(sp[0] + tcos(a) * r, sp[1] + tsin(a) * r, 2);
        Object.assign(p, {
          alive: true, hp: 100, x, y, face: tatan2(512 - y, 512 - x), path: [], arriveFace: null, holdFace: null,
          vis: [], target: null, readyAt: 0, nextShot: 0, reloadUntil: 0, burst: 0, lastShot: -9,
          ammo: TWEAP[this.weapon(p)].mag, blindUntil: 0, blindBy: null, blindAt: -9, moving: false, movedAt: -9,
          action: null, actT: 0, dmgFrom: new Map(), deathT: 0, aiS: {}, roundStart: this.snapshot(p),
          losSince: new Map(), lastHitBy: null, lastHitAt: -9,
        });
      });
    }
    const ts = this.team('T');
    this.bomb = { state: 'carried', carrier: pick(ts).id, x: 0, y: 0, site: null, plantT: 0 };
    this.botBuy();
  }

  goLive() {
    // закуп мог потратить случайность как угодно — живой раунд идёт от своего потока, одинакового у сайта и сервера
    this.rng = tacRng((this.seed ^ 0x9E3779B9) >>> 0); TR = this.rng;
    this.tick = 0; this.cmds = [];
    this.phase = 'live';
    for (const p of this.players) { p.ammo = TWEAP[this.weapon(p)].mag; p.roundStart = this.snapshot(p); }
    this.aiInit();
  }

  /* ===================== закуп ===================== */
  snapshot(p) { return { money: p.money, prim: p.prim, pist: p.pist, armor: p.armor, helmet: p.helmet, kit: p.kit, nades: { ...p.nades } }; }
  undoBuy(p) { const s = p.buyStart; if (s) Object.assign(p, { ...s, nades: { ...s.nades } }); }
  markBuyStart() { for (const p of this.players) p.buyStart = this.snapshot(p); }

  price(p, item) {
    if (TWEAP[item]) return TWEAP[item].price;
    if (item === 'kevlar') return 650;
    if (item === 'helmet') return p.armor >= 100 ? 350 : 1000;
    if (item === 'kit') return 400;
    if (TNADES[item]) return nadePrice(item, p.team);
    return Infinity;
  }
  canBuy(p, item) {
    const w = TWEAP[item];
    if (w && w.side && w.side !== p.team) return false;
    if (item === 'kit' && (p.team !== 'CT' || p.kit)) return false;
    if (item === 'kevlar' && p.armor >= 100) return false;
    if (item === 'helmet' && p.helmet && p.armor >= 100) return false;
    if (w && (p.prim === item || p.pist === item)) return false;
    if (TNADES[item]) {
      const total = p.nades.smoke + p.nades.flash + p.nades.molotov;
      if (p.nades[item] >= TNADES[item].max || total >= 4) return false;
    }
    return p.money >= this.price(p, item);
  }
  buy(p, item) {
    if (!this.canBuy(p, item)) return false;
    p.money -= this.price(p, item);
    const w = TWEAP[item];
    if (w) { if (w.type === 'pistol') p.pist = item; else p.prim = item; }
    else if (item === 'kevlar') p.armor = 100;
    else if (item === 'helmet') { p.armor = 100; p.helmet = true; }
    else if (item === 'kit') p.kit = true;
    else p.nades[item]++;
    return true;
  }
  // готовые наборы: eco — ничего, force — что по карману, full — по роли
  autoBuy(p, mode) {
    const T = p.team === 'T';
    const rifle = T ? 'ak47' : 'm4a1s', cheapRifle = T ? 'galil' : 'famas', smg = T ? 'mac10' : 'mp9';
    const roleNades = { igl: ['smoke', 'molotov', 'flash'], entry: ['flash', 'flash', 'smoke'], awp: ['flash'], support: ['smoke', 'flash', 'molotov'], lurk: ['smoke', 'flash'] }[p.role] || ['smoke', 'flash'];
    if (mode === 'eco') return;
    if (mode === 'pistol') {
      if (p.role === 'support' || p.role === 'igl') { this.buy(p, 'smoke'); this.buy(p, 'flash'); }
      else if (p.role === 'entry') this.buy(p, 'kevlar');
      else if (p.role === 'awp') this.buy(p, 'deagle');
      else this.buy(p, 'flash');
      return;
    }
    if (mode === 'full') {
      const main = p.role === 'awp' && p.money >= 4750 + 1000 ? 'awp' : rifle;
      if (!p.prim || TWEAP[p.prim].price < TWEAP[main].price) this.buy(p, main);
      if (!p.prim && p.money >= 1800) this.buy(p, cheapRifle);
      this.buy(p, 'helmet');
      if (!p.helmet) this.buy(p, 'kevlar');
      for (const n of roleNades) this.buy(p, n);
      if (p.role === 'igl' || p.role === 'support') this.buy(p, 'kit');
      return;
    }
    // force
    if (!p.prim) { if (p.money >= 1800 + 650) this.buy(p, cheapRifle); else if (p.money >= 1250 + 650) this.buy(p, smg); }
    if (!this.buy(p, 'helmet')) this.buy(p, 'kevlar');
    this.buy(p, roleNades[0]);
  }

  botBuy() {
    const bots = this.team(this.them);
    const avg = mean(bots.map(p => p.money));
    let mode;
    if (this.roundNo === 1 && !this.auto) mode = 'pistol'; // в «Ставке» раунд один и деньги заданы — пистолетки нет
    else if (avg >= 3900) mode = 'full';
    else if (this.roundNo === this.rounds || avg >= 2200) mode = 'force';
    else mode = 'eco';
    this.botMode = mode;
    // сначала снайпер — ему нужно больше денег
    [...bots].sort((a, b) => (b.role === 'awp') - (a.role === 'awp')).forEach(p => this.autoBuy(p, mode));
  }

  /* ===================== приказы ===================== */
  moveTo(p, x, y, { append = false, face = null } = {}) {
    if (!p.alive) return false;
    const from = append && p.path.length ? p.path[p.path.length - 1] : [p.x, p.y];
    const path = this.nav.path(from[0], from[1], x, y);
    if (!path) return false;
    p.path = append ? p.path.concat(path) : path;
    p.arriveFace = face;
    p.holdFace = null;
    if (p.action) p.action = null;
    return true;
  }
  stop(p) { p.path = []; p.action = null; p.holdFace = p.face; }
  lookAt(p, x, y) { p.holdFace = tatan2(y - p.y, x - p.x); if (!p.path.length) p.arriveFace = null; else p.arriveFace = p.holdFace; }

  throwNade(p, type, x, y) {
    if (!p.alive || !p.nades[type]) return false;
    const d = thyp(x - p.x, y - p.y);
    if (d > TAC.THROW_MAX) { const k = TAC.THROW_MAX / d; x = p.x + (x - p.x) * k; y = p.y + (y - p.y) * k; }
    if (!this.nav.walkable(x, y)) [x, y] = this.nav.nearestFloor(x, y, 1);
    const D = thyp(x - p.x, y - p.y);
    const flight = type === 'flash' ? Math.max(1.0, 0.35 + D / 650) : 0.35 + D / 650;
    p.nades[type]--;
    p.stats.nades++;
    this.nades.push({ type, team: p.team, owner: p, x0: p.x, y0: p.y, x, y, t0: this.t, tLand: this.t + flight });
    return true;
  }

  // бросок гранаты игроком (только своя команда, только в живом раунде); координаты округляются до 0.1 px — так их видит и сервер
  userThrow(p, type, x, y) {
    if (this.phase !== 'live' || !p || !p.us || !p.alive) return false;
    x = Math.round(x * 10) / 10; y = Math.round(y * 10) / 10;
    TR = this.rng;
    if (!this.throwNade(p, type, x, y)) return false;
    this.cmds.push({ k: this.tick, id: p.id, type, x, y });
    return true;
  }
  // закуп своей пятёрки: что у кого (сайт отправляет, сервер покупает то же самое по правилам и деньгам)
  loadout() { return this.team(this.us).map(p => ({ prim: p.prim, pist: p.pist, armor: p.armor, helmet: p.helmet, kit: p.kit, nades: { ...p.nades } })); }
  applyLoadout(list) {
    const us = this.team(this.us);
    if (!Array.isArray(list) || list.length !== us.length) return false;
    return us.every((p, i) => {
      const L = list[i] || {}, def = p.team === 'T' ? 'glock' : 'usp', items = [];
      if (L.prim) items.push(L.prim);
      if (L.pist && L.pist !== def) items.push(L.pist);
      if (L.helmet) items.push('helmet'); else if (L.armor) items.push('kevlar');
      if (L.kit) items.push('kit');
      for (const k of ['smoke', 'flash', 'molotov']) for (let j = 0; j < Math.min(4, (L.nades && L.nades[k]) | 0); j++) items.push(k);
      this.undoBuy(p);
      return items.every(it => this.buy(p, it));
    });
  }
  // повтор раунда по командам (сервер): закуп уже применён, раунд в фазе buy
  replay(cmds, maxT = 400) {
    this.goLive();
    const list = (Array.isArray(cmds) ? cmds : []).slice(0, 60).sort((a, b) => a.k - b.k);
    let i = 0;
    while (this.phase === 'live' && this.t < maxT) {
      while (i < list.length && list[i].k <= this.tick) { const c = list[i++]; if (c.k === this.tick) this.userThrow(this.players[c.id | 0], c.type, +c.x, +c.y); }
      this.update(1 / 30);
    }
    return this.result;
  }

  siteAt(x, y) {
    for (const [name, s] of Object.entries(this.map.sites)) if (thyp(x - s[0], y - s[1]) < this.map.siteR) return name;
    return null;
  }
  // F: заложить или разминировать
  useAction(p) {
    if (!p.alive) return false;
    const b = this.bomb;
    if (p.team === 'T' && b.state === 'carried' && b.carrier === p.id && this.siteAt(p.x, p.y)) { p.path = []; p.action = 'plant'; p.actT = 0; return true; }
    if (p.team === 'CT' && b.state === 'planted' && thyp(p.x - b.x, p.y - b.y) < 14) { p.path = []; p.action = 'defuse'; p.actT = 0; return true; }
    return false;
  }

  /* ===================== кадр симуляции ===================== */
  update(dt) {
    if (this.phase !== 'live') return;
    TR = this.rng;
    this.tick++;
    this.t += dt;
    if (this.bomb.state === 'planted') { if (this.t - this.bomb.plantT >= TAC.BOMB_TIME) this.explode(); }
    else this.timeLeft = Math.max(0, TAC.ROUND_TIME - this.t);
    this.updateNades();
    this.updateVision();
    this.aiTick(dt);
    this.updateCombat(dt);
    this.updateMovement(dt);
    this.updateBomb(dt);
    this.tracers = this.tracers.filter(r => this.t - r.t < 0.12);
    this.flashes = this.flashes.filter(f => this.t - f.t < 0.6);
    this.checkClutch();
    if (this.phase === 'live') this.checkEnd();
  }

  activeSmokes() {
    const out = [];
    for (const s of this.smokes) {
      const age = this.t - s.t0;
      if (age < 0.4 || this.t > s.until) continue;
      out.push({ x: s.x, y: s.y, r: s.r * Math.min(1, age / 0.9) });
    }
    return out;
  }
  inFire(x, y) { return this.fires.some(f => this.t < f.until && thyp(x - f.x, y - f.y) < f.r); }

  updateNades() {
    const t = this.t;
    for (const n of this.nades) {
      if (n.done || t < n.tLand) continue;
      n.done = true;
      if (n.type === 'smoke') {
        this.smokes.push({ x: n.x, y: n.y, r: TAC.SMOKE_R, t0: t, until: t + TAC.SMOKE_TIME, team: n.team });
        for (const f of this.fires) if (thyp(f.x - n.x, f.y - n.y) < TAC.SMOKE_R + f.r * 0.6) f.until = Math.min(f.until, t + 0.3);
      } else if (n.type === 'molotov') {
        const smoked = this.smokes.some(s => t < s.until && thyp(s.x - n.x, s.y - n.y) < s.r);
        if (!smoked) this.fires.push({ x: n.x, y: n.y, r: TAC.FIRE_R, t0: t, until: t + TAC.FIRE_TIME, owner: n.owner });
      } else if (n.type === 'flash') {
        this.flashes.push({ x: n.x, y: n.y, t });
        const smokes = this.activeSmokes();
        for (const p of this.players) {
          if (!p.alive) continue;
          const d = thyp(p.x - n.x, p.y - n.y);
          if (d > TAC.FLASH_R || !this.nav.los(p.x, p.y, n.x, n.y, smokes)) continue;
          const ang = angAbs(p.face, tatan2(n.y - p.y, n.x - p.x));
          const k = 1 - d / (TAC.FLASH_R * 1.25);
          const dur = (ang < 0.9 ? 2.8 : ang < 1.7 ? 1.3 : 0.35) * k;
          if (dur < 0.25) continue;
          if (t + dur > p.blindUntil) { p.blindUntil = t + dur; p.blindBy = n.owner; p.blindAt = t; }
          if (p.team !== n.team && dur > 1) n.owner.stats.enemiesFlashed = (n.owner.stats.enemiesFlashed || 0) + 1;
        }
      }
    }
    this.nades = this.nades.filter(n => !n.done);
    this.smokes = this.smokes.filter(s => t < s.until);
    this.fires = this.fires.filter(f => t < f.until);
    // урон огнём
    for (const f of this.fires) {
      for (const p of this.players) {
        if (!p.alive || thyp(p.x - f.x, p.y - f.y) > f.r) continue;
        p.fireDmg = (p.fireDmg || 0) + TAC.FIRE_DPS / 30;
        if (p.fireDmg >= 1) { const d = Math.floor(p.fireDmg); p.fireDmg -= d; this.damage(f.owner, p, d, false, 'molotov', 'fire'); }
      }
    }
    // путь в обход огня
    this.nav.extraCost = this.fires.length ? (i => {
      const [x, y] = this.nav.center(i);
      return this.fires.some(f => thyp(x - f.x, y - f.y) < f.r + 6) ? 60 : 0;
    }) : null;
  }

  updateVision() {
    const smokes = this.activeSmokes(), t = this.t;
    for (const p of this.players) p.vis = [];
    const T = this.alive('T'), CT = this.alive('CT');
    for (const a of T) for (const b of CT) {
      const ok = thyp(a.x - b.x, a.y - b.y) <= TAC.VIEW && this.nav.los(a.x, a.y, b.x, b.y, smokes);
      if (!ok) { a.losSince.delete(b.id); b.losSince.delete(a.id); continue; }
      if (!a.losSince.has(b.id)) a.losSince.set(b.id, t);
      if (!b.losSince.has(a.id)) b.losSince.set(a.id, t);
      a.vis.push(b); b.vis.push(a);
      this.known.T.set(b.id, { x: b.x, y: b.y, t });
      this.known.CT.set(a.id, { x: a.x, y: a.y, t });
    }
  }

  // заметил ли p врага e: в секторе обзора — сразу; сбоку/сзади — через ~0.8 с (шаги, периферия)
  // или сразу, если e по нему попал
  noticed(p, e) {
    const t = this.t;
    if (angAbs(p.face, tatan2(e.y - p.y, e.x - p.x)) <= TAC.FOV) return true;
    if (p.lastHitBy === e && t - p.lastHitAt < 1.2) return true;
    return t - (p.losSince.get(e.id) ?? t) >= 0.8;
  }

  reaction(p, e) {
    const ang = angAbs(p.face, tatan2(e.y - p.y, e.x - p.x));
    let r = p.skill.react + (ang / Math.PI) * 0.35 + rand(-0.04, 0.08);
    if (!p.moving && ang < 0.35) r -= 0.08; // держит угол — реагирует быстрее
    return Math.max(0.12, r);
  }

  updateCombat(dt) {
    const t = this.t;
    for (const p of this.players) {
      p.engaged = false;
      if (!p.alive) continue;
      const vis = p.vis.filter(e => this.noticed(p, e));
      if (!vis.length) { p.target = null; continue; }
      // враг рядом — сначала бой, закладку/дефьюз бросаем; дальняя перестрелка не мешает
      if ((p.action === 'plant' || p.action === 'defuse') && vis.some(e => dist2(p, e) < 600)) p.action = null;
      if (!p.target || !vis.includes(p.target)) {
        if (t < p.blindUntil - 0.3) continue; // ослеплён — новые цели не видит
        let best = null, bs = Infinity;
        for (const e of vis) { const s = dist2(p, e) + angAbs(p.face, tatan2(e.y - p.y, e.x - p.x)) * 120; if (s < bs) { bs = s; best = e; } }
        p.target = best;
        p.readyAt = t + this.reaction(p, best);
        p.burst = 0;
        if (!this.contact && (p.us || best.us)) { this.contact = true; if (this.pauseOnContact) this.requestPause = true; }
      }
      const e = p.target;
      // останавливается для боя (контрстрейф), только если есть смысл стрелять; издалека — продолжает путь
      p.engaged = this.hitChance(p, e) >= 0.22;
      const want = tatan2(e.y - p.y, e.x - p.x);
      p.face += clamp(angNorm(want - p.face), -14 * dt, 14 * dt);
      if (t >= p.readyAt && t >= p.nextShot && t >= p.reloadUntil) this.fire(p, e);
    }
  }

  // шанс попасть одной пулей с места (без отдачи, ослепления и движения)
  hitChance(p, e) {
    const w = TWEAP[this.weapon(p)], d = dist2(p, e) * this.UPX;
    return w.acc * clamp(1.15 - d / w.range, 0.12, 1) * p.skill.aim;
  }

  fire(p, e) {
    const t = this.t, key = this.weapon(p), w = TWEAP[key];
    const d = dist2(p, e) * this.UPX;
    let acc = this.hitChance(p, e);
    if (t - p.movedAt < 0.15) acc *= w.moveAcc || 0.35;
    if (t < p.blindUntil) acc *= 0.12;
    const auto = w.rof < 0.2;
    if (auto) { if (t - p.lastShot > 0.35) p.burst = 0; acc *= Math.max(0.45, 1 - 0.055 * p.burst); p.burst++; }
    p.lastShot = t;
    p.nextShot = t + w.rof * (auto ? 1 : rand(1, 1.25));
    if (--p.ammo <= 0) { p.reloadUntil = t + w.reload; p.ammo = w.mag; }
    const hit = TR() < acc;
    const off = hit ? 0 : rand(6, 16) * (TR() < 0.5 ? -1 : 1);
    const a = tatan2(e.y - p.y, e.x - p.x) + Math.PI / 2;
    this.tracers.push({ x0: p.x, y0: p.y, x1: e.x + tcos(a) * off, y1: e.y + tsin(a) * off, t, team: p.team, shooter: p });
    this.emit('shot', { p, e });
    if (hit) {
      const hs = TR() < p.skill.hs * w.hs * (d < 1600 ? 1 : 0.75);
      this.damage(p, e, w.dmg, hs, key, 'gun');
    }
  }

  damage(att, vic, base, hs, weapon, src) {
    if (!vic.alive) return;
    let dmg = hs ? base * 4 : base;
    if (src === 'gun') {
      const w = TWEAP[weapon], armored = hs ? vic.helmet && vic.armor > 0 : vic.armor > 0;
      if (armored) { vic.armor = Math.max(0, vic.armor - dmg * (1 - w.pen) * 0.5); dmg *= w.pen; }
    }
    dmg = Math.max(1, Math.round(dmg));
    const real = Math.min(dmg, vic.hp);
    vic.hp -= dmg;
    if (att && att.team !== vic.team) { att.stats.dmg += real; vic.dmgFrom.set(att.id, (vic.dmgFrom.get(att.id) || 0) + real); vic.lastHitBy = att; vic.lastHitAt = this.t; }
    if (vic.action) vic.action = null;
    if (vic.hp <= 0) this.kill(att, vic, weapon, hs);
  }

  kill(att, vic, weapon, hs) {
    const t = this.t;
    vic.alive = false; vic.hp = 0; vic.deathT = t; vic.path = []; vic.target = null; vic.action = null;
    vic.stats.d++;
    const enemyKill = att && att.team !== vic.team;
    if (enemyKill) {
      att.stats.k++;
      if (hs) att.stats.hs++;
      att.money = Math.min(TAC.MAX_MONEY, att.money + (weapon === 'molotov' ? 300 : TWEAP[weapon] ? TWEAP[weapon].reward : 300));
    }
    // ассист: 41+ урона или флешка от напарника убийцы
    let assister = null, flashAssist = false;
    for (const [id, d] of vic.dmgFrom) if ((!att || id !== att.id) && d >= 41) { assister = this.players[id]; break; }
    if (!assister && vic.blindBy && enemyKill && vic.blindBy.team === att.team && vic.blindBy !== att && t - vic.blindAt < 3.5) { assister = vic.blindBy; flashAssist = true; }
    if (assister && assister.team !== vic.team) { assister.stats.a++; if (flashAssist) assister.stats.fa++; } else assister = null;
    if (!this.firstKill && enemyKill) { this.firstKill = { att, vic }; att.stats.opK++; vic.stats.opD++; }
    // размен: убийца недавно убил напарника жертвы
    for (const d of this.deaths) if (d.killer === vic && t - d.t <= 3.5) d.traded = true;
    this.deaths.push({ victim: vic, killer: att, t, traded: false, moving: t - vic.movedAt < 0.4, early: t < 20 });
    this.feed.push({
      t, weapon, hs, us: !!(att && att.us), them: !!(vic.us),
      att: att ? { name: att.name, team: att.team, blind: t < att.blindUntil } : null,
      vic: { name: vic.name, team: vic.team },
      assist: assister ? { name: assister.name, team: assister.team, flash: flashAssist } : null,
    });
    this.marks.push({ t, kind: 'kill', team: att ? att.team : vic.team === 'T' ? 'CT' : 'T' });
    if (this.bomb.state === 'carried' && this.bomb.carrier === vic.id) Object.assign(this.bomb, { state: 'dropped', x: vic.x, y: vic.y });
    this.emit('kill', { att, vic, hs, weapon });
  }

  updateMovement(dt) {
    const t = this.t;
    for (const p of this.players) {
      p.moving = false;
      if (!p.alive) continue;
      // стоит в огне без приказа — выйти
      if (!p.path.length && this.inFire(p.x, p.y)) {
        const f = this.fires.find(F => thyp(p.x - F.x, p.y - F.y) < F.r);
        const a = tatan2(p.y - f.y, p.x - f.x);
        const [x, y] = this.nav.nearestFloor(f.x + tcos(a) * (f.r + 14), f.y + tsin(a) * (f.r + 14), 2);
        this.moveTo(p, x, y);
      }
      if (p.engaged || p.action) continue; // в бою останавливается (контрстрейф)
      if (!p.path.length) {
        if (p.holdFace != null) p.face += clamp(angNorm(p.holdFace - p.face), -6 * dt, 6 * dt);
        continue;
      }
      let step = TWEAP[this.weapon(p)].speed / this.UPX * TAC.MOVE_K * dt;
      while (step > 0 && p.path.length) {
        const [x, y] = p.path[0], dx = x - p.x, dy = y - p.y, d = thyp(dx, dy);
        if (d <= step) { p.x = x; p.y = y; step -= d; p.path.shift(); continue; }
        p.x += dx / d * step; p.y += dy / d * step;
        const want = tatan2(dy, dx);
        p.face += clamp(angNorm(want - p.face), -8 * dt, 8 * dt);
        step = 0;
      }
      p.moving = true; p.movedAt = t;
      if (!p.path.length && p.arriveFace != null) { p.holdFace = p.arriveFace; p.arriveFace = null; }
    }
    // не стоим друг в друге; на ходу проходим насквозь — иначе в узких дверях застреваем
    const al = this.players.filter(p => p.alive && !p.moving);
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const a = al[i], b = al[j], dx = b.x - a.x, dy = b.y - a.y, d = thyp(dx, dy);
      if (d > 0.01 && d < 11) {
        const k = (11 - d) / 2 / d;
        if (this.nav.walkable(a.x - dx * k, a.y - dy * k)) { a.x -= dx * k; a.y -= dy * k; }
        if (this.nav.walkable(b.x + dx * k, b.y + dy * k)) { b.x += dx * k; b.y += dy * k; }
      }
    }
  }

  updateBomb(dt) {
    const b = this.bomb;
    if (b.state === 'dropped') {
      const c = this.alive('T').find(p => thyp(p.x - b.x, p.y - b.y) < 10);
      if (c) { b.state = 'carried'; b.carrier = c.id; }
    }
    if (b.state === 'carried') {
      const c = this.players[b.carrier];
      if (c.action === 'plant') {
        if (!this.siteAt(c.x, c.y)) c.action = null;
        else if ((c.actT += dt) >= TAC.PLANT_TIME) {
          Object.assign(b, { state: 'planted', x: c.x, y: c.y, site: this.siteAt(c.x, c.y), plantT: this.t, planter: c });
          c.action = null;
          c.money = Math.min(TAC.MAX_MONEY, c.money + 300);
          this.marks.push({ t: this.t, kind: 'plant', site: b.site });
          this.emit('plant', { p: c });
        }
      }
    }
    if (b.state === 'planted') {
      for (const p of this.alive('CT')) {
        if (p.action !== 'defuse') continue;
        if (thyp(p.x - b.x, p.y - b.y) > 16) { p.action = null; continue; }
        if ((p.actT += dt) >= (p.kit ? TAC.DEFUSE_KIT : TAC.DEFUSE)) {
          b.state = 'defused'; b.defuser = p;
          p.money = Math.min(TAC.MAX_MONEY, p.money + 300);
          this.marks.push({ t: this.t, kind: 'defuse' });
          this.emit('defuse', { p });
          this.endRound('CT', 'defuse');
          return;
        }
      }
    }
  }

  explode() {
    const b = this.bomb;
    b.state = 'exploded';
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = thyp(p.x - b.x, p.y - b.y);
      if (d < 240) this.damage(null, p, Math.round(500 * (1 - d / 240)), false, 'c4', 'bomb');
    }
    this.endRound('T', 'bomb');
  }

  checkClutch() {
    for (const team of ['T', 'CT']) {
      if (this.clutch[team]) continue;
      const mine = this.alive(team), en = this.alive(other(team));
      if (mine.length === 1 && en.length >= 1 && this.team(team).length > 1) this.clutch[team] = { p: mine[0], vs: en.length };
    }
  }

  checkEnd() {
    const T = this.alive('T').length, CT = this.alive('CT').length, b = this.bomb;
    if (b.state === 'planted') { if (!CT) this.endRound('T', 'elim'); return; }
    if (!T) this.endRound('CT', 'elim');
    else if (!CT) this.endRound('T', 'elim');
    else if (this.timeLeft <= 0) this.endRound('CT', 'time');
  }

  endRound(winner, reason) {
    if (this.phase === 'end') return;
    this.phase = 'end';
    const loser = other(winner);
    this.score[winner]++;
    const planted = !!this.bomb.plantT;
    for (const p of this.team(winner)) p.money = Math.min(TAC.MAX_MONEY, p.money + TAC.WIN[reason]);
    const lossBonus = TAC.LOSS[Math.min(this.lossStreak[loser], TAC.LOSS.length - 1)];
    for (const p of this.team(loser)) p.money = Math.min(TAC.MAX_MONEY, p.money + lossBonus + (loser === 'T' && planted ? TAC.PLANT_BONUS : 0));
    this.lossStreak[loser]++;
    this.lossStreak[winner] = Math.max(0, this.lossStreak[winner] - 1);
    // клатчи
    for (const team of ['T', 'CT']) {
      const c = this.clutch[team];
      if (!c) continue;
      c.p.stats.clutchA++;
      if (winner === team) c.p.stats.clutchW++;
    }
    // снаряжение: живые сохраняют, погибшие — только стандартный пистолет
    for (const p of this.players) {
      if (p.alive) continue;
      Object.assign(p, { prim: null, pist: p.team === 'T' ? 'glock' : 'usp', armor: 0, helmet: false, kit: false, nades: { smoke: 0, flash: 0, molotov: 0 } });
    }
    const ours = this.team(this.us);
    this.result = { winner, reason, win: winner === this.us };
    this.history.push({
      n: this.roundNo, winner, reason, win: winner === this.us,
      site: this.bomb.site, plantT: this.bomb.plantT,
      kills: this.deaths.filter(d => d.killer && d.killer.us && !d.victim.us).length,
      deaths: this.deaths.filter(d => d.victim.us).length,
      untraded: this.deaths.filter(d => d.victim.us && !d.traded).length,
      deathsMoving: this.deaths.filter(d => d.victim.us && d.moving).length,
      deathsEarly: this.deaths.filter(d => d.victim.us && d.early).length,
      opening: this.firstKill ? (this.firstKill.att.us ? 'won' : 'lost') : null,
      clutch: this.clutch[this.us] ? { vs: this.clutch[this.us].vs, won: winner === this.us, name: this.clutch[this.us].p.name } : null,
      nadesLeft: ours.filter(p => p.alive).reduce((s, p) => s + p.nades.smoke + p.nades.flash + p.nades.molotov, 0),
      time: Math.round(this.t),
      buy: this.botMode,
    });
    this.marks.push({ t: this.t, kind: 'end', team: winner });
    this.emit('end', { winner, reason });
  }

  get over() { return this.roundNo >= this.rounds && this.phase === 'end'; }

  /* ===================== боты ===================== */
  aiInit() {
    this.ai = { t: 0, team: null };
    if (this.auto) { this.ctSetup(this.alive('CT')); this.tPlan(this.alive('T')); return; }
    const bots = this.alive(this.them);
    if (this.them === 'CT') this.ctSetup(bots); else this.tPlan(bots);
  }

  // расстановка CT по позициям: углы на плэнтах и мид (её же можно применить к своей команде)
  ctSetup(units, forUser = false) {
    const I = this.info;
    const setups = [{ A: 2, B: 2, mid: 1 }, { A: 3, B: 1, mid: 1 }, { A: 1, B: 3, mid: 1 }, { A: 2, B: 3, mid: 0 }, { A: 3, B: 2, mid: 0 }];
    const s = forUser ? setups[0] : pick(setups);
    const order = [...units].sort((a, b) => (a.role === 'awp' ? -1 : b.role === 'awp' ? 1 : 0));
    const slots = [];
    for (let i = 0; i < s.mid; i++) slots.push('mid');
    for (let i = 0; i < s.A; i++) slots.push('A');
    for (let i = 0; i < s.B; i++) slots.push('B');
    const used = { A: 0, B: 0 };
    order.forEach((p, i) => {
      const where = slots[i % slots.length];
      let spot;
      if (where === 'mid' && I.midHold) spot = I.midHold;
      else { const S = I.sites[where === 'mid' ? 'A' : where]; spot = S.ctHolds[used[where]++ % S.ctHolds.length]; }
      this.moveTo(p, spot.x, spot.y, { face: spot.face });
      p.aiS = { mode: 'hold', site: where, spot };
    });
  }

  // T: план раунда — выход на плэнт, сплит, дефолт или раш
  tPlan(units, forUser = false) {
    const sites = ['A', 'B'];
    const site = pick(sites);
    const eco = this.us === 'T' && this.auto ? this.team('T').filter(p => p.prim).length < 3 : this.botMode === 'eco' || this.botMode === 'pistol';
    const plans = forUser ? ['default'] : eco ? ['rush', 'exec', 'split'] : ['exec', 'exec', 'split', 'default', 'rush'];
    const type = pick(plans);
    this.ai.team = { type, site, phase: 'move', t0: this.t, utilAt: 0 };
    this.assignT(units, type, site);
  }

  assignT(units, type, site) {
    const I = this.info, S = I.sites[site];
    units.forEach((p, i) => {
      let to, route = 0;
      if (type === 'rush') to = this.spotInSite(S, i);
      else if (type === 'default') {
        const k = i % 5;
        if (k === 4 && I.midT) to = I.midT;
        else { const SS = I.sites[k < 2 ? 'A' : 'B']; to = SS.tStages[k % 2] || SS.tStages[0]; }
      } else {
        route = type === 'split' && i >= 3 && S.tStages[1] ? 1 : 0;
        to = S.tStages[route];
      }
      const pt = Array.isArray(to) ? to : [to.x, to.y];
      const [x, y] = this.nav.nearestFloor(pt[0] + rand(-12, 12), pt[1] + rand(-12, 12), 2);
      this.moveTo(p, x, y, { face: tatan2(S.y - y, S.x - x) });
      p.aiS = { mode: type === 'rush' ? 'go' : 'stage', route };
    });
  }

  spotInSite(S, i) {
    if (i === 0) return [S.x, S.y];
    const sp = S.tPost[(i - 1) % Math.max(1, S.tPost.length)];
    return sp ? [sp.x, sp.y] : [S.x + rand(-30, 30), S.y + rand(-30, 30)];
  }

  aiTick(dt) {
    this.ai.t += dt;
    if (this.ai.t < 0.3) return;
    this.ai.t = 0;
    if (this.auto) { this.ctThink(); this.tThink(); return; }
    if (this.them === 'CT') this.ctThink(); else this.tThink();
  }

  ctThink() {
    const bots = this.alive('CT').filter(p => this.auto || !p.us), I = this.info, b = this.bomb, t = this.t;
    if (!bots.length) return;
    if (b.state === 'planted') {
      const S = I.sites[b.site];
      const gathered = bots.filter(p => thyp(p.x - S.ctGather[0], p.y - S.ctGather[1]) < 60).length;
      const left = TAC.BOMB_TIME - (t - b.plantT);
      for (const p of bots) {
        const a = p.aiS;
        if (a.mode !== 'retake' && a.mode !== 'retakeGo') { a.mode = 'retake'; this.moveTo(p, S.ctGather[0] + rand(-15, 15), S.ctGather[1] + rand(-15, 15)); }
        if (a.mode === 'retake' && (gathered >= Math.min(2, bots.length) || left < 22)) { a.mode = 'retakeGo'; this.moveTo(p, b.x + rand(-6, 6), b.y + rand(-6, 6)); }
        if (a.mode === 'retakeGo') {
          if (p.nades.flash && !a.flashed && thyp(p.x - b.x, p.y - b.y) < 240) { a.flashed = true; this.throwNade(p, 'flash', S.x, S.y); }
          if (thyp(p.x - b.x, p.y - b.y) < 12 && !p.vis.length && p.action !== 'defuse' && !bots.some(q => q.action === 'defuse')) { p.path = []; p.action = 'defuse'; p.actT = 0; }
        }
      }
      return;
    }
    // угроза на плэнте: недавно видели 2+ T рядом
    for (const [name, S] of Object.entries(I.sites)) {
      let n = 0;
      for (const [, k] of this.known.CT) if (t - k.t < 5 && thyp(k.x - S.x, k.y - S.y) < 300) n++;
      if (n < 2) continue;
      for (const p of bots) {
        const a = p.aiS;
        if (a.site === name || a.rotating || p.engaged || TR() > 0.35) continue;
        a.rotating = true; a.site = name;
        const spot = pick(S.ctHolds) || { x: S.x, y: S.y, face: 0 };
        this.moveTo(p, spot.x, spot.y, { face: spot.face });
      }
    }
    // гранаты по замеченным T
    for (const p of bots) {
      const a = p.aiS;
      if (!p.vis.length || a.nadeUsed) continue;
      const e = p.vis[0], d = dist2(p, e);
      if (d < 120 || TR() > 0.3) continue;
      if (p.nades.molotov) { a.nadeUsed = true; this.throwNade(p, 'molotov', e.x, e.y); }
      else if (p.nades.flash && d > 160) { a.nadeUsed = true; this.throwNade(p, 'flash', e.x, e.y); }
    }
  }

  tThink() {
    const bots = this.alive('T').filter(p => this.auto || !p.us), I = this.info, b = this.bomb, t = this.t, A = this.ai.team;
    if (!bots.length || !A) return;
    // подобрать бомбу
    if (b.state === 'dropped') {
      const near = bots.reduce((m, p) => (!m || thyp(p.x - b.x, p.y - b.y) < thyp(m.x - b.x, m.y - b.y) ? p : m), null);
      if (near && !near.aiS.toBomb) { near.aiS.toBomb = true; this.moveTo(near, b.x, b.y); }
    }
    if (b.state === 'planted') {
      if (A.phase !== 'post') {
        A.phase = 'post';
        const S = I.sites[b.site];
        bots.forEach((p, i) => {
          const sp = S.tPost[i % Math.max(1, S.tPost.length)];
          const face = tatan2(S.ctEntry[1] - (sp ? sp.y : S.y), S.ctEntry[0] - (sp ? sp.x : S.x));
          if (sp) this.moveTo(p, sp.x + rand(-8, 8), sp.y + rand(-8, 8), { face });
        });
      }
      return;
    }
    const S = I.sites[A.site];
    // дефолт: через 40–55 с выбираем плэнт, где меньше видели CT
    if (A.type === 'default' && A.phase === 'move' && t - A.t0 > (A.wait || (A.wait = rand(40, 55)))) {
      const seen = name => { let n = 0; for (const [, k] of this.known.T) if (t - k.t < 15 && thyp(k.x - I.sites[name].x, k.y - I.sites[name].y) < 320) n++; return n; };
      A.site = seen('A') <= seen('B') ? 'A' : 'B';
      A.type = 'exec';
      this.assignT(bots, 'exec', A.site);
      return;
    }
    if (A.phase === 'move' && A.type !== 'default') {
      const arrived = bots.every(p => !p.path.length);
      const late = this.timeLeft < 35;
      if (A.type === 'rush' || arrived || t - A.t0 > 32 || late || this.contactNear(S)) { A.phase = 'util'; A.utilAt = t; this.execUtil(bots, S); }
    }
    if (A.phase === 'util' && t - A.utilAt > 0.9) {
      A.phase = 'go';
      bots.forEach((p, i) => {
        const isCarrier = b.state === 'carried' && b.carrier === p.id;
        const [x, y] = isCarrier ? [S.x, S.y] : this.spotInSite(S, i + 1);
        this.moveTo(p, x + rand(-6, 6), y + rand(-6, 6));
        p.aiS.mode = 'go';
      });
    }
    if (A.phase === 'go' && b.state === 'carried') {
      const c = this.players[b.carrier];
      if ((this.auto || !c.us) && c.alive && !c.path.length && !c.vis.length && c.action !== 'plant') {
        if (this.siteAt(c.x, c.y)) { c.action = 'plant'; c.actT = 0; } else this.moveTo(c, S.x, S.y);
      }
    }
    if (this.timeLeft < 35 && A.phase === 'move') { A.phase = 'util'; A.utilAt = t; this.execUtil(bots, S); }
  }

  contactNear(S) {
    const t = this.t;
    for (const [, k] of this.known.T) if (t - k.t < 3 && thyp(k.x - S.x, k.y - S.y) < 340) return true;
    return false;
  }

  // гранаты на выход: дым на угол CT и на подход CT, флешка над плэнтом, молотов в угол
  execUtil(bots, S) {
    const want = [];
    if (S.ctHolds[0]) want.push(['smoke', S.ctHolds[0].x, S.ctHolds[0].y]);
    want.push(['smoke', S.ctEntry[0], S.ctEntry[1]]);
    want.push(['flash', S.x, S.y]);
    if (S.ctHolds[1]) want.push(['molotov', S.ctHolds[1].x, S.ctHolds[1].y]);
    want.push(['flash', S.x + rand(-30, 30), S.y + rand(-30, 30)]);
    for (const [type, x, y] of want) {
      const p = bots.filter(q => q.nades[type] && thyp(q.x - x, q.y - y) < TAC.THROW_MAX).sort((a, c) => thyp(a.x - x, a.y - y) - thyp(c.x - x, c.y - y))[0];
      if (p) this.throwNade(p, type, x + rand(-6, 6), y + rand(-6, 6));
    }
  }

  // авто-расстановка своей команды (кнопка): CT — углы по ролям, T — дефолт
  autoPlaceUs() {
    const us = this.alive(this.us);
    if (this.us === 'CT') this.ctSetup(us, true);
    else { const site = pick(['A', 'B']); this.assignT(us, 'default', site); }
  }
}
root.TacEngine = { TacGame, TacNav, tacNav, tacRng, TAC, TWEAP, TNADES, TROLES, TROLE_KEYS, TSKILL, BET, betSkill, BOT_NAMES, MATE_NAMES, nadePrice, nadeName, other, angNorm, dist2 };
})(typeof window !== 'undefined' ? window : globalThis);

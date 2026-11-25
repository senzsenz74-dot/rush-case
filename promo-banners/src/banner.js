/* RUSH CASE — анимированные баннеры.
   banner.html?f=stream | corner | tiktok | square   (&t=секунда — стоп-кадр, &check=1 — шахматка под прозрачностью)
   Вся анимация — чистая функция времени seek(t): одинаковый результат при покадровой съёмке (src/render.js).
   Рулетка — «лупа» как на сайте (CS2 CASE, js/app.js cs2Spin + css .c2-lens): лента снаружи размыта и притушена,
   в круге — крупно и чётко (×1,32), у кромки стекло увеличивает сильнее (×1,45) и мылит, блик стекла, золотая черта. */
(() => {
  const Q = new URLSearchParams(location.search);
  const FMT = Q.get('f') || 'stream';
  // site-welcome / site-corner — слайды новостей сайта (владелец 22.11): та же сцена, но 640×396 под окно карточки и без своей стеклянной рамки
  const SITE = /^site-/.test(FMT), BF = FMT.replace(/^site-/, '');
  const A = '../../assets/';
  const IMG = {
    logo: A + 'logo.webp', knife: 'img/karambit.png', bg: A + 'cs2case/drop-factory.webp',
    blast: A + 'case-cs2.webp', major: A + 'case-major3.webp', elite: A + 'case-elite2.webp',
  };
  const CASE_AR = 691 / 900, LOGO_AR = 340 / 684, KNIFE_AR = 690 / 964;
  const CROWN = { x: .5, y: .06 }; // вершина короны на логотипе (доли ширины/высоты)
  const RC = { milspec: '#4b69ff', restricted: '#8847ff', classified: '#d32ce6', covert: '#eb4b4b', rare: '#e4ae39' };
  const CASES = [{ k: 'blast', n: 'BLAST' }, { k: 'major', n: 'MAJOR' }, { k: 'elite', n: 'Всемирная элита' }];
  const KNIFE = { n: '★ Karambit | Fade', r: 'rare', img: IMG.knife };
  // промокод: RUSH35 (+35% к пополнению) — у всех форматов; WELCOME (+50 на баланс) — слайд новостей сайта (владелец 22.11). Знака ₽ в Oswald нет — значок баланса сайта
  const BAL = '<i class="bal"></i>';
  const PROMO = /jinemez/.test(BF) ? { code: 'JINEMEZ', pct: '+10%', to: 'к пополнению', st: 'к<br>пополнению' } : BF === 'georg' ? { code: 'GEORG999', pct: '+10%', to: 'к пополнению', st: 'к<br>пополнению' } : BF === 'ny' ? { code: 'NEW2027', pct: '+50%', to: 'к пополнению', st: 'к<br>пополнению' } : BF === 'welcome' ? { code: 'WELCOME', pct: '+50' + BAL, to: 'на баланс', st: 'на<br>баланс' } : { code: 'RUSH35', pct: '+35%', to: 'к пополнению', st: 'к<br>пополнению' };
  const FPS = 60;

  /* ---------- математика ---------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const eOut3 = u => 1 - Math.pow(1 - u, 3), eIn2 = u => u * u, eIO = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const eBack = (u, c = 1.7) => 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
  const bump = u => Math.sin(Math.PI * clamp(u));
  const TAU = Math.PI * 2;
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // CSS cubic-bezier — те же кривые, что у сайта
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = s => ((ax * s + bx) * s + cx) * s, Y = s => ((ay * s + by) * s + cy) * s, dX = s => (3 * ax * s + 2 * bx) * s + cx;
    return u => {
      if (u <= 0) return 0;
      if (u >= 1) return 1;
      let lo = 0, hi = 1, s = u;
      for (let i = 0; i < 6; i++) { const e = X(s) - u, d = dX(s); if (Math.abs(e) < 1e-7 || Math.abs(d) < 1e-6) break; s -= e / d; }
      if (!(s >= 0 && s <= 1) || Math.abs(X(s) - u) > 1e-5) { s = u; for (let i = 0; i < 50; i++) { if (X(s) < u) lo = s; else hi = s; s = (lo + hi) / 2; } }
      return Y(s);
    };
  }
  const B_LENS = bezier(.2, .9, .25, 1.05), B_CLOSE = bezier(.42, 0, 1, 1), B_SPIN = bezier(.08, .6, .08, 1), B_SET = bezier(.3, 1.3, .5, 1);
  // «замок» — те же ключи, что @keyframes lockShake на сайте (до 80%: дальше кейс уходит в размытие)
  const SHK = [[0, 0, 0, 0, 1], [.08, -4, 0, -1.5, 1], [.14, 4, 0, 1.5, 1], [.2, 0, 0, 0, 1], [.36, -7, .005, -2.5, 1], [.42, 7, 0, 2.5, 1], [.48, 0, 0, 0, 1], [.62, 0, -.02, 0, 1.04], [.8, 0, -.05, 0, 1.09], [1, 0, -.05, 0, 1.09]];
  function shake(u, H) { // dx — px сайта при высоте кейса 390, dy — доля высоты
    if (u <= 0) return { dx: 0, dy: 0, r: 0, s: 1 };
    for (let i = 1; i < SHK.length; i++) {
      const a = SHK[i - 1], b = SHK[i];
      if (u <= b[0]) { const v = eIO((u - a[0]) / (b[0] - a[0])); return { dx: lerp(a[1], b[1], v) * H / 390, dy: lerp(a[2], b[2], v) * H, r: lerp(a[3], b[3], v), s: lerp(a[4], b[4], v) }; }
    }
    return { dx: 0, dy: -.05 * H, r: 0, s: 1.09 };
  }

  /* ---------- DOM ---------- */
  const root = document.getElementById('root');
  const px = v => v + 'px';
  const loads = [];
  function E(tag, cls, parent, css) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (css) Object.assign(e.style, css);
    (parent || root).appendChild(e);
    return e;
  }
  function I(src, cls, parent, css) {
    const e = E('img', cls, parent, css);
    e.src = src; e.decoding = 'sync';
    loads.push(e.decode().catch(() => {}));
    return e;
  }
  function place(e, x, y, s = 1, o = 1, rot = 0) { // центр элемента в (x, y)
    e.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${s})` + (rot ? ` rotate(${rot}deg)` : '');
    e.style.opacity = o;
    e.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
  }
  function sweep(e, u) { // блик проходит слева направо при u 0→1
    e.style.opacity = u > 0 && u < 1 ? 1 : 0;
    e.style.backgroundPosition = `${lerp(92, 8, eIO(u))}% 0`;
  }
  const maskImg = (e, src) => { e.style.webkitMaskImage = e.style.maskImage = `url("${src}")`; };
  const blurF = (e, b, extra = '') => { e.style.filter = b > .05 ? `blur(${b.toFixed(2)}px) ${extra}` : (extra || 'none'); };

  /* ---------- компоненты ---------- */
  function Glass(r) {
    if (SITE) return { g: null, r, live() {} }; // на сайте рамку даёт сама карточка
    const g = E('div', 'glass ab', root, { width: px(r.w), height: px(r.h), transform: `translate(${r.x}px,${r.y}px)` });
    const run = E('i', 'run', g), run2 = E('i', 'run b', g);
    ['tl', 'tr', 'bl', 'br'].forEach(c => E('i', 'cn ' + c, g));
    return {
      g, r,
      live(t) { // огоньки по краям (период 5 с — без шва на повторе)
        run.style.transform = `translateX(${lerp(-260, r.w, (t % 5) / 5)}px)`;
        run2.style.transform = `translateX(${lerp(r.w, -260, ((t + 2.5) % 5) / 5)}px)`;
      },
    };
  }
  function Logo(w, glow = false) {
    const h = w * LOGO_AR;
    const b = E('div', 'logo ab', root, { width: px(w), height: px(h) });
    if (glow) E('i', 'lglow', b);
    const cg = E('i', 'cg', b, { left: px(w * CROWN.x), top: px(h * .2), width: px(w * .36), height: px(w * .36) });
    I(IMG.logo, '', b);
    const sh = E('i', 'shine', b); maskImg(sh, IMG.logo);
    const tw = E('i', 'tw', b, { left: px(w * CROWN.x), top: px(h * CROWN.y), width: px(w * .2), height: px(w * .2) });
    return {
      b, sh,
      live(t, o) { // корона «дышит» свечением, на вершине вспыхивает искра
        const g = .5 + .5 * Math.sin(TAU * t / o.cgP);
        cg.style.opacity = (.35 + .5 * g).toFixed(3);
        cg.style.transform = `translate(-50%,-50%) scale(${(.85 + .25 * g).toFixed(3)})`;
        let tu = 0;
        for (const s of o.tw) { const u = seg(t, s, s + .75); if (u > 0 && u < 1) tu = u; }
        const v = Math.pow(bump(tu), 1.4);
        tw.style.opacity = v.toFixed(3);
        tw.style.transform = `translate(-50%,-50%) scale(${(.2 + .9 * v).toFixed(3)}) rotate(${(tu * 110).toFixed(1)}deg)`;
      },
    };
  }
  function Case(key, name, w, fs) {
    const h = w * CASE_AR;
    const b = E('div', 'case ab', root, { width: px(w), height: px(h + fs * 1.5) });
    E('i', 'csh', b, { left: px(w * .1), width: px(w * .8), top: px(h * .82), height: px(w * .16) });
    I(IMG[key], '', b, { width: px(w), height: px(h) });
    const sh = E('i', 'shine', b, { width: px(w), height: px(h) }); maskImg(sh, IMG[key]);
    const lb = E('div', 'cname', b, { top: px(h * .97), fontSize: px(fs) }); lb.textContent = name;
    return { b, sh, lb, w, h };
  }
  let fidN = 0;
  // Рулетка-лупа в размерах сайта (плитка 250×196, зазор 6, радиус лупы 235) и масштабе f
  function LensReel(o) {
    const { x, y, f, wN, n, win, seed } = o;
    const R = 235, TW = 250, TH = 196, P = TW + 6, HN = 2 * R + 40, cx = wN / 2, cy = HN / 2;
    const box = E('div', 'lr ab', root, { width: px(wN), height: px(HN), transformOrigin: '0 0', transform: `translate(${x}px,${y}px) scale(${f})` });
    const fid = 'mb' + (++fidN);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.position = 'absolute';
    svg.innerHTML = `<filter id="${fid}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 0"/></filter>`;
    document.body.appendChild(svg);
    const fe = svg.querySelector('feGaussianBlur');
    // лента: соседи ножа — красные («чуть не»), остальное — случайно из каталога сайта
    const r = rng(seed), pool = window.REEL_ITEMS || [], cov = pool.filter(p => p.r === 'covert'), items = [];
    let prev = -1;
    for (let i = 0; i < n; i++) {
      if (i === win) items.push(KNIFE);
      else if ((i === win - 1 || i === win + 1) && cov.length) items.push(cov[i === win - 1 ? 0 : 1 % cov.length]);
      else { let j; do j = Math.floor(r() * pool.length); while (j === prev && pool.length > 1); prev = j; items.push(pool[j]); }
    }
    function band(parent, cls) {
      const b = E('div', 'lr-band' + (cls ? ' ' + cls : ''), parent, { top: px(cy - TH / 2), width: px(wN), height: px(TH) });
      const s = E('div', 'lr-strip', b, { width: px(n * P), height: px(TH) });
      items.forEach((it, i) => {
        const t = E('div', 'lt' + (it.r === 'rare' ? ' gold' : '') + (i === win ? ' win' : ''), s, { left: px(i * P), width: px(TW), height: px(TH) });
        t.style.setProperty('--rc', RC[it.r]);
        I(it.img, '', t);
        if (i === win) E('i', 'wr', t);
      });
      return { b, s };
    }
    const out = band(box, 'lr-out');
    const lens = E('div', 'lr-lens', box);
    const bl = band(E('div', 'lr-in', lens, { transformOrigin: `${cx}px ${cy}px`, transform: 'scale(1.32)' }));
    const edge = E('div', 'lr-lens lr-edge', box);
    const be = band(E('div', 'lr-in', edge, { transformOrigin: `${cx}px ${cy}px`, transform: 'scale(1.45)' }));
    const ring = E('i', 'lr-ring', box, { left: px(cx), top: px(cy) });
    const mark = E('i', 'lr-mark', box, { left: px(cx), top: px(cy) });
    const strips = [out.s, bl.s, be.s];
    return {
      box, R, f, win, TW,
      pcx: x + cx * f, pcy: y + cy * f, // центр лупы в кадре
      frame(k, vel, Rc, outO, dn, markO) {
        const tx = (cx - (k * P + TW / 2)).toFixed(2);
        strips.forEach(s => { s.style.transform = `translate3d(${tx}px,0,0)`; });
        const sig = clamp(Math.abs(vel) * P / FPS * .22, 0, 14), mb = sig >= .3;
        if (mb) fe.setAttribute('stdDeviation', `${sig.toFixed(2)} 0`);
        const u = mb ? `url(#${fid}) ` : '';
        bl.b.style.filter = u || 'none';
        be.b.style.filter = u + 'blur(1.4px) saturate(1.15)';
        out.b.style.filter = u + 'blur(7px) brightness(.42) saturate(.75)';
        out.b.style.opacity = outO;
        const rr = Math.max(0, Rc), vis = rr > .5 ? 'visible' : 'hidden';
        lens.style.clipPath = edge.style.clipPath = `circle(${rr.toFixed(2)}px at ${cx}px ${cy}px)`;
        lens.style.visibility = edge.style.visibility = ring.style.visibility = vis;
        lens.style.background = `radial-gradient(circle at ${cx}px ${cy}px,rgba(255,255,255,.05),rgba(255,255,255,.015) ${(rr * .75).toFixed(1)}px,rgba(255,255,255,.07) ${rr.toFixed(1)}px)`;
        const m = `radial-gradient(circle at ${cx}px ${cy}px,transparent ${(rr - 34).toFixed(1)}px,#000 ${(rr - 6).toFixed(1)}px)`;
        edge.style.webkitMaskImage = edge.style.maskImage = m;
        ring.style.width = ring.style.height = px(2 * rr);
        box.classList.toggle('dn', dn > 0);
        box.style.setProperty('--dn', dn.toFixed(3));
        const d = ((k + .5) % 1 + 1) % 1, g = Math.pow(1 - d, 5) * clamp(Math.abs(vel) / 4);
        mark.style.opacity = markO;
        mark.style.boxShadow = `0 0 ${(10 + 18 * g).toFixed(1)}px rgba(240,190,60,${(.8 + .2 * g).toFixed(2)})`;
        box.style.visibility = rr > .5 || outO > .001 ? 'visible' : 'hidden';
      },
    };
  }
  // ход ленты как на сайте: прокрутка cubic-bezier(.08,.6,.08,1) до точки внутри плитки → доводка к центру (.3,1.3,.5,1)
  function SpinPath(k0, win, off, s0, s1, set) {
    const at = t => {
      if (t <= s0) return k0;
      if (t < s1) return k0 + (win + off - k0) * B_SPIN(seg(t, s0, s1));
      return win + off * (1 - B_SET(seg(t, s1, s1 + set)));
    };
    return t => ({ k: at(t), vel: (at(t) - at(t - 1 / FPS)) * FPS });
  }
  function Unlock(D) { // вспышка + кольцо, когда замок открылся
    const fl = E('i', 'uflash ab', root, { width: px(D), height: px(D) });
    const rg = E('i', 'uring ab', root, { width: px(D), height: px(D), borderWidth: px(Math.max(2, D / 70)) });
    return {
      frame(t, t0, x, y) {
        const u = seg(t, t0 - .04, t0 + .5);
        if (u <= 0 || u >= 1) { place(fl, x, y, 1, 0); place(rg, x, y, 1, 0); return; }
        place(fl, x, y, lerp(.3, 1.35, eOut3(u)), Math.pow(1 - u, 1.7));
        place(rg, x, y, lerp(.25, 1.9, eOut3(u)), (1 - u) * .9);
      },
    };
  }
  function Wipe(r) { // стеклянная шторка — смена сцен
    const c = E('div', 'wclip ab', root, { width: px(r.w), height: px(r.h), transform: `translate(${r.x}px,${r.y}px)` });
    const b = E('i', 'wipe', c, { width: px(r.w * .34), height: px(r.h * 1.8), top: px(-r.h * .4) });
    return {
      frame(u) {
        b.style.visibility = u > 0 && u < 1 ? 'visible' : 'hidden';
        b.style.transform = `translateX(${lerp(-r.w * .55, r.w * 1.1, eIO(u)).toFixed(1)}px) skewX(-18deg)`;
      },
    };
  }
  function Reveal(o) { // o: {cx, cy, w, R, lx, ly, lfs, pill}
    const glow = E('i', 'gglow ab', root, { width: px(o.R * 1.7), height: px(o.R * 1.7) });
    const rays = E('i', 'rays ab', root, { width: px(o.R * 2), height: px(o.R * 2) });
    const rays2 = E('i', 'rays r2 ab', root, { width: px(o.R * 1.6), height: px(o.R * 1.6) });
    const hero = o.hero ? o.hero() : I(IMG.knife, 'hknife ab', root), AR = o.ar || KNIFE_AR; // o.hero — свой элемент вместо ножа (купон WELCOME)
    const flash = E('i', 'flash ab', root, { width: px(o.R * 1.6), height: px(o.R * 1.6) });
    const lbl = E('div', 'wlbl ab' + (o.pill ? ' pill' : ''), root, { fontSize: px(o.lfs) });
    lbl.innerHTML = o.lbl || `<span class="tg">Выпало</span><span class="nm">${KNIFE.n}</span>`;
    if (o.nolbl) lbl.style.display = 'none';
    const all = [glow, rays, rays2, hero, flash, lbl];
    return {
      // tL — нож вылетает из лупы, tOut — начало ухода, from — откуда {x, y, w}
      frame(t, tL, tOut, from) {
        const a = t - tL;
        if (a < 0 || t > tOut + .45) { all.forEach(e => place(e, 0, 0, 1, 0)); return; }
        const out = 1 - seg(t, tOut, tOut + .4), outS = lerp(1, .82, eIn2(seg(t, tOut, tOut + .4)));
        const u = seg(a, 0, .55), ue = eOut3(u), ub = eBack(u, 1.5);
        const fl = Math.sin(a * 2.4) * o.w * .012 * seg(a, .5, 1);
        const w = lerp(from.w, o.w, ub);
        hero.style.width = px(w); hero.style.height = px(w * AR);
        place(hero, lerp(from.x, o.cx, ue), lerp(from.y, o.cy, ue) + fl, outS, out, lerp(-10, 0, ue) + Math.sin(a * 1.7) * 1.2 * seg(a, .5, 1));
        place(rays, o.cx, o.cy, (.55 + .45 * eOut3(seg(a, 0, .6)) + .03 * Math.sin(a * 3)) * outS, seg(a, .05, .35) * .95 * out, a * 16);
        place(rays2, o.cx, o.cy, (.6 + .4 * eOut3(seg(a, 0, .7))) * outS, seg(a, .1, .45) * .7 * out, -a * 9 + 7);
        place(glow, o.cx, o.cy, (1 + .06 * Math.sin(a * 2.6)) * outS, seg(a, 0, .25) * (1 - .35 * seg(a, .3, 1.2)) * out);
        const uf = seg(a, 0, .5);
        place(flash, from.x, from.y, lerp(.15, 1.5, eOut3(uf)), Math.pow(1 - uf, 2) * (a < .5 ? 1 : 0));
        const ul = seg(a, .28, .62);
        place(lbl, o.lx, o.ly + (1 - eOut3(ul)) * o.lfs * .9, outS, eOut3(ul) * out);
      },
    };
  }
  const ROLL = 'ABCDEFGHKMNPRSTUVWXYZ0123456789';
  function Promo(o) { // o: {dir, lfs, cfs, bfs, gap, boxed, pad, stack}
    const b = E('div', 'promo ab ' + o.dir + (o.boxed ? ' boxed' : ''), root, { gap: px(o.gap), padding: o.pad || 0 });
    const holder = o.dir === 'row' ? E('div', 'pcol', b, { gap: px(o.gap * .7) }) : b;
    const pl = E('div', 'pl', holder, { fontSize: px(o.lfs) }); pl.textContent = 'Промокод';
    const pc = E('div', 'pc', holder, { fontSize: px(o.cfs), padding: `${o.cfs * .2}px ${o.cfs * .42}px ${o.cfs * .16}px` });
    pc.innerHTML = '<svg class="ants"><rect/></svg>';
    const rect = pc.querySelector('rect');
    const chars = [...PROMO.code].map(ch => { const s = E('span', 'ch', pc); s.textContent = ch; s.dataset.c = ch; return s; });
    const sh = E('i', 'sweep', pc);
    const pb = E('div', 'pb', b, { fontSize: px(o.bfs), padding: `${o.bfs * .34}px ${o.bfs * .55}px ${o.bfs * .3}px` });
    pb.innerHTML = o.stack ? `<b>${PROMO.pct}</b><small>${PROMO.st}</small>` : `<b>${PROMO.pct}</b><span>${PROMO.to}</span>`;
    const sh2 = E('i', 'sweep', pb);
    let fixed = false;
    return {
      b, sh, sh2, pc,
      live(t, L) { // L: {roll: [[t0, dur]], hbP (период пульса) | hbAt (один раз)}
        if (!fixed) { chars.forEach(s => { s.style.width = px(s.getBoundingClientRect().width); }); fixed = true; }
        rect.style.strokeDashoffset = (-((t * 24) % 15)).toFixed(2); // бегущая рамка: 24 px/с, шаг 15 — без шва за 15 с
        // табло: буквы пролистываются и встают по очереди слева направо
        const R = (L.roll || []).find(([t0, d]) => t >= t0 && t < t0 + d + .25);
        chars.forEach((s, i) => {
          if (!R) { s.textContent = s.dataset.c; s.style.transform = 'none'; s.style.opacity = 1; return; }
          const [t0, d] = R, ts = t0 + d * (.3 + .7 * i / (chars.length - 1));
          if (t < ts) {
            const j = Math.floor(t * 28 + i * 3.7);
            s.textContent = ROLL[(j * 7 + i * 11) % ROLL.length];
            s.style.transform = `translateY(${(((t * 28 + i * 3.7) % 1) * 36 - 18).toFixed(1)}%)`;
            s.style.opacity = .7;
          } else {
            const u = seg(t, ts, ts + .2);
            s.textContent = s.dataset.c;
            s.style.transform = `translateY(${((1 - eBack(u, 2.4)) * -45).toFixed(1)}%)`;
            s.style.opacity = 1;
          }
        });
        // «+35%» — двойной удар сердца
        const xh = L.hbP ? t % L.hbP : t - (L.hbAt ?? 99);
        const p = xh < 0 ? 0 : Math.exp(-Math.pow((xh - .1) / .07, 2)) + .7 * Math.exp(-Math.pow((xh - .36) / .07, 2));
        pb.style.transform = `scale(${(1 + .07 * p).toFixed(4)})`;
        pb.style.boxShadow = `0 8px 22px rgba(79,179,94,${(.32 + .35 * p).toFixed(3)}),0 0 ${(34 * p).toFixed(1)}px rgba(110,230,130,${(.55 * p).toFixed(3)}),inset 0 1px 0 rgba(255,255,255,.28)`;
      },
    };
  }
  function Canvas(W, H) {
    const c = E('canvas', 'fx ab', root); c.width = W; c.height = H;
    return c.getContext('2d');
  }
  function Sparks(seed, n, o) { // o: {speed, size, g, life}
    const r = rng(seed), ps = [];
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, sp = o.speed * (.3 + .7 * Math.pow(r(), .7));
      ps.push({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .8 - o.speed * .22, life: (o.life || 1) * (.5 + r() * .9), d: r() * .06, s: o.size * (.5 + r()), hot: r() < .35 });
    }
    const K = 2.4;
    const pos = (p, a, cx, cy) => { const f = (1 - Math.exp(-K * a)) / K; return [cx + p.vx * f, cy + p.vy * f + .5 * o.g * a * a]; };
    return {
      draw(ctx, t, t0, cx, cy) {
        const T = t - t0;
        if (T < 0 || T > 3) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (const p of ps) {
          const a = T - p.d;
          if (a <= 0 || a > p.life) continue;
          const [x1, y1] = pos(p, a, cx, cy), [x0, y0] = pos(p, Math.max(0, a - .045), cx, cy);
          const al = Math.pow(1 - a / p.life, 1.4);
          ctx.strokeStyle = p.hot ? `rgba(255,248,220,${al})` : `rgba(255,190,70,${al})`;
          ctx.lineWidth = p.s * (1 - .5 * a / p.life);
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
        ctx.restore();
      },
    };
  }
  function Dust(seed, n, W, H, size = 1) {
    const r = rng(seed), ps = [];
    for (let i = 0; i < n; i++) ps.push({ x: r() * W, y: r() * H, s: size * (1 + r() * 2.6), sp: 14 + r() * 40, ph: r() * TAU, a: .12 + r() * .4, b: r() < .25 });
    return {
      draw(ctx, t, boost = 0) {
        for (const p of ps) {
          const y = ((p.y - p.sp * t) % H + H) % H, x = p.x + Math.sin(t * .9 + p.ph) * 14;
          const al = p.a * (.6 + .4 * Math.sin(t * 2 + p.ph)) * (1 + boost);
          ctx.fillStyle = p.b ? `rgba(255,205,120,${al})` : `rgba(170,222,255,${al})`;
          ctx.beginPath(); ctx.arc(x, y, p.s, 0, TAU); ctx.fill();
        }
      },
    };
  }
  // лупа: раскрытие (как .c2-rl.spinning: .6 с с перелётом) и схлопывание (.3 с ease-in)
  const lensR = (t, R, open, close) => t < open ? 0 : t < close ? R * B_LENS(seg(t, open, open + .6)) : R * (1 - B_CLOSE(seg(t, close, close + .3)));

  // 3D-кейс сайта (Blender → glb) с анимацией открытия ключом — свет и камера как в сцене CS2 CASE (js/app.js c2Mount)
  const C2D = { dir: A + 'cs2case/', FPS: 30, OPEN: [101, 168], LID: 136 };
  const C2P_MAJOR = { sun: 8.4, env: .58, exposure: 1.01, contrast: 1.12, saturate: 1.6, shadow: 1, fill: 2 }; // настройки владельца 13.11
  function Case3D(o) { // o: {glb, P, cw — ширина кейса на экране, size — сторона холста}
    const P = o.P, size = Math.round(o.size);
    const cv = E('canvas', 'c3d ab', root, { width: px(size), height: px(size) });
    const S = { cv, ok: false, css: `contrast(${P.contrast}) saturate(${P.saturate})`, frame: () => {} };
    loads.push((async () => {
      const [THREE, { GLTFLoader }, { RGBELoader }] = await Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/RGBELoader.js')]);
      const renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(o.pr || 1.5); renderer.setSize(size, size, false);
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = P.exposure;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const BL = (x, y, z) => new THREE.Vector3(x, z, -y); // Blender (Z вверх) → three (Y вверх)
      const CASE_POS = BL(7.098, 52.9, -4.064), FLOOR_Y = -4.064;
      const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, .05, 200);
      const sunDir = BL(-0.2204, -0.4145, -0.8829).normalize();
      const sun = new THREE.DirectionalLight(new THREE.Color().setRGB(1, .96, .9, THREE.LinearSRGBColorSpace), P.sun);
      sun.position.copy(CASE_POS).addScaledVector(sunDir, -14); sun.target.position.copy(CASE_POS); sun.castShadow = true;
      Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: .5, far: 20 });
      sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = .015; sun.shadow.radius = 4;
      scene.add(sun, sun.target, new THREE.HemisphereLight(0xffb070, 0x8a5a30, P.fill));
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: P.shadow * .55 }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(CASE_POS.x, FLOOR_Y + .001, CASE_POS.z); floor.receiveShadow = true;
      scene.add(floor); S.floorMat = floor.material; S.shadow0 = floor.material.opacity; // НОВЫЙ ГОД: тень приглушается, пока кейс в воздухе
      const load = (L, u) => new Promise((res, rej) => L.load(u, res, undefined, rej));
      const [gl, tex] = await Promise.all([load(new GLTFLoader(), C2D.dir + o.glb), load(new RGBELoader().setDataType(THREE.FloatType), C2D.dir + 'sky.hdr')]);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = tex; scene.environmentRotation.set(0, Math.PI, 0); scene.environmentIntensity = P.env;
      scene.add(gl.scene);
      gl.scene.traverse(n => { if (n.isMesh) n.castShadow = n.receiveShadow = true; });
      const mixer = new THREE.AnimationMixer(gl.scene), action = mixer.clipAction(gl.animations[0]);
      action.play(); action.paused = true;
      const setF = f => { action.time = f / C2D.FPS; mixer.update(0); };
      // камера — с точки CAM_MAIN сайта, «зум» на кейс: ширина силуэта кейса = o.cw, центр силуэта — в центре холста
      setF(C2D.OPEN[0]); gl.scene.updateMatrixWorld(true);
      gl.scene.getObjectByName('CAM_MAIN').getWorldPosition(cam.position);
      const caseRoot = gl.scene.getObjectByName('CASE_ROOT') || gl.scene;
      const box = new THREE.Box3(); caseRoot.traverse(n => { if (n.isMesh && n.name !== 'KEY') box.expandByObject(n); });
      const ctr = box.getCenter(new THREE.Vector3());
      cam.lookAt(ctr); cam.updateMatrixWorld();
      const d0 = cam.position.clone().sub(ctr), R0 = d0.length(), yaw0 = Math.atan2(d0.x, d0.z), pitch0 = Math.asin(d0.y / R0);
      const sil = () => {
        cam.updateProjectionMatrix();
        const v = new THREE.Vector3(), r = { x0: 9, x1: -9, y0: 9, y1: -9 };
        caseRoot.traverse(n => {
          if (!n.isMesh || n.name === 'KEY') return;
          const p = n.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).applyMatrix4(n.matrixWorld).project(cam);
            if (v.x < r.x0) r.x0 = v.x; if (v.x > r.x1) r.x1 = v.x; if (v.y < r.y0) r.y0 = v.y; if (v.y > r.y1) r.y1 = v.y;
          }
        });
        return r;
      };
      let b = sil();
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * (b.x1 - b.x0) / (2 * o.cw / size)));
      b = sil();
      cam.setViewOffset(size, size, (b.x0 + b.x1) / 2 * size / 2, -(b.y0 + b.y1) / 2 * size / 2, size, size);
      cam.updateProjectionMatrix();
      S.ok = true;
      // облёт камеры вокруг кейса: yaw/pitch — градусы от точки CAM_MAIN, zoom — наезд
      const lockN = gl.scene.getObjectByName('Lock_Body') || gl.scene.getObjectByName('LK_BODY'), lockP = new THREE.Vector3(), tgt = new THREE.Vector3();
      if (lockN) lockN.getWorldPosition(lockP); else lockP.copy(ctr); // у модели может не быть навесного замка
      S.frame = (f, yaw = 0, pitch = 0, zoom = 1, focus = 0) => {
        setF(f);
        const yw = yaw0 + yaw * Math.PI / 180, pt = pitch0 + pitch * Math.PI / 180, rr = R0 / zoom;
        tgt.copy(ctr).lerp(lockP, focus); // focus 0→1 — камера смотрит на навесной замок (ключ)
        cam.position.set(tgt.x + rr * Math.cos(pt) * Math.sin(yw), tgt.y + rr * Math.sin(pt), tgt.z + rr * Math.cos(pt) * Math.cos(yw));
        cam.lookAt(tgt); cam.updateMatrixWorld();
        renderer.render(scene, cam);
      };
    })().catch(e => { console.error('3D не загрузился:', e && e.message || e); }));
    return S;
  }

  /* ======================= ФОРМАТЫ ======================= */

  // ---------- плашка для стрима (полоса снизу), 15 с по кругу, прозрачный фон ----------
  // кейсы → MAJOR выходит в центр, замок, вспышка → лупа, прокрутка, доводка → лупа схлопывается в нож → шторка → кейсы
  function buildStream() {
    const P = Glass({ x: 20, y: 122, w: 1560, h: 190 });
    const CY = P.r.y + P.r.h / 2;
    const logo = Logo(272, true);
    E('i', 'vdiv ab', root, { height: '140px', transform: `translate(372px,${CY - 70}px)` });
    E('i', 'vdiv ab', root, { height: '140px', transform: `translate(1148px,${CY - 70}px)` });
    const ST = { x: 392, w: 736 }, SC = ST.x + ST.w / 2;
    const cases = CASES.map(c => Case(c.k, c.n, 176, 17));
    const f = .46;
    const reel = LensReel({ x: ST.x, y: CY - 255 * f, f, wN: ST.w / f, n: 44, win: 38, seed: 7 });
    const un = Unlock(170);
    const wipe = Wipe({ x: ST.x, y: P.r.y + 1, w: ST.w, h: P.r.h - 2 });
    const promo = Promo({ dir: 'col', lfs: 15, cfs: 50, bfs: 19, gap: 10 });
    const rv = Reveal({ cx: SC, cy: CY - 44, w: 300, R: 180, lx: SC, ly: P.r.y + P.r.h - 22, lfs: 20, pill: true });
    const ctx = Canvas(1600, 330);
    const sparks = Sparks(11, 70, { speed: 560, size: 2.2, g: 700, life: 1 });
    const T = { side: 3.0, sh0: 3.45, sh1: 4.15, s0: 4.25, s1: 9.05, set: .5, col: 9.9, out: 14.45, w0: 14.4 };
    const path = SpinPath(4, 38, .27, T.s0, T.s1, T.set);
    const slots = [SC - 245, SC, SC + 245];
    const from = { x: reel.pcx, y: reel.pcy, w: reel.TW * 1.32 * .86 * f };
    return t => {
      P.live(t);
      place(logo.b, 196, CY, 1 + .04 * bump(seg(t, T.col + .05, T.col + .5)), 1);
      sweep(logo.sh, t < 5 ? seg(t, 1.3, 2.2) : seg(t, 11.3, 12.2));
      logo.live(t, { tw: [2.4, 7.4, 12.4], cgP: 3 });
      // кейсы
      cases.forEach((c, i) => {
        const ui = seg(t, i * .12, i * .12 + .6);
        let x = slots[i], y = CY + 2 + (1 - eBack(ui)) * 36 + Math.sin(TAU * t * 2 / 15 + i * 2.1) * 2.5;
        let s = lerp(.9, 1, eOut3(ui)), o = clamp(ui * 1.7), rot = 0, bl = 0;
        if (i !== 1) { // боковые разъезжаются
          const uo = seg(t, T.side, T.side + .45);
          x += (i ? 1 : -1) * eIn2(uo) * 80; o *= 1 - uo; s *= lerp(1, .88, uo);
        } else { // MAJOR выходит вперёд, замок, уходит в размытие под лупой
          const um = eIO(seg(t, T.side, T.side + .45));
          s *= lerp(1, 1.22, um); y = lerp(y, CY, um);
          const k = shake(seg(t, T.sh0, T.sh1), c.h * 1.22);
          x += k.dx; y += k.dy; rot = k.r; s *= k.s;
          const ub = eOut3(seg(t, T.sh1, T.sh1 + .5));
          o *= lerp(1, .18, ub) * (1 - seg(t, T.col, T.col + .3)); s *= lerp(1, 1.15, ub); bl = 10 * ub;
        }
        place(c.b, x, y, s, o, rot); blurF(c.b, bl);
        sweep(c.sh, seg(t, 1.0 + i * .25, 1.8 + i * .25));
      });
      // лупа
      const { k, vel } = path(t);
      const dn = seg(t, T.s1 + T.set, T.s1 + T.set + .35);
      reel.frame(k, vel, lensR(t, reel.R, T.sh1, T.col), seg(t, T.sh1, T.sh1 + .45) * (1 - seg(t, T.col, T.col + .35)), dn,
        seg(t, T.sh1 + .35, T.sh1 + .65) * (1 - seg(t, T.col, T.col + .1)));
      un.frame(t, T.sh1, reel.pcx, reel.pcy);
      rv.frame(t, T.col + .05, T.out, from);
      wipe.frame(seg(t >= T.w0 ? t - T.w0 : t + 15 - T.w0, 0, .85));
      // промокод: всегда на месте; после выпадения подпрыгивает и пролистывается
      const pb = bump(seg(t, 10.35, 10.85));
      place(promo.b, 1364, CY + 1, 1 + .05 * pb, 1);
      promo.pc.style.boxShadow = `0 0 ${(30 * pb).toFixed(1)}px rgba(132,217,253,${(.45 * pb).toFixed(2)})`;
      promo.live(t, { roll: [[.9, .7], [10.45, .8]], hbP: 5 });
      sweep(promo.sh, t < 9 ? seg(t, 6.5, 7.3) : seg(t, 12.5, 13.3));
      ctx.clearRect(0, 0, 1600, 330);
      sparks.draw(ctx, t, T.col + .05, from.x, from.y - 10);
    };
  }

  // ---------- угловой значок для стрима, 15 с по кругу, прозрачный фон ----------
  function buildCorner() {
    const P = Glass({ x: 30, y: 36, w: 460, h: 404 });
    const cx = 260, sy = 252;
    const logo = Logo(196, true);
    const cases = CASES.map(c => Case(c.k, c.n, 214, 19));
    const f = .39;
    const reel = LensReel({ x: 50, y: sy - 255 * f, f, wN: 420 / f, n: 36, win: 30, seed: 3 });
    const un = Unlock(150);
    const wipe = Wipe({ x: 50, y: 150, w: 420, h: 200 });
    const promo = Promo({ dir: 'row', lfs: 12, cfs: 36, bfs: 30, gap: 12, stack: true });
    const rv = Reveal({ cx, cy: sy - 26, w: 230, R: 150, lx: cx, ly: sy + 67, lfs: 17, pill: true });
    const ctx = Canvas(520, 470);
    const sparks = Sparks(5, 54, { speed: 420, size: 2, g: 600, life: .95 });
    const T = { sh0: 6.3, sh1: 7.0, s0: 7.1, s1: 10.9, set: .5, col: 11.75, out: 14.4, w0: 14.35 };
    const path = SpinPath(4, 30, -.24, T.s0, T.s1, T.set);
    const from = { x: reel.pcx, y: reel.pcy, w: reel.TW * 1.32 * .86 * f };
    return t => {
      P.live(t);
      place(logo.b, cx, 96, 1 + .04 * bump(seg(t, T.col + .05, T.col + .5)), 1);
      sweep(logo.sh, t < 7 ? seg(t, 1, 1.9) : seg(t, 12.6, 13.5));
      logo.live(t, { tw: [3.2, 8.2, 13.2], cgP: 3 });
      // кейсы по очереди, поворот как карусель; «Всемирная элита» остаётся и открывается
      cases.forEach((c, i) => {
        const a = i * 2.3, ui = seg(t, a, a + .55);
        let o = clamp(ui * 1.5), x = cx + (1 - eOut3(ui)) * 70, ry = (1 - eOut3(ui)) * -50, s = lerp(.9, 1, eOut3(ui));
        let y = sy + 4 + Math.sin(TAU * t * 6 / 15 + i) * 3, rot = 0, bl = 0;
        if (i < 2) { const uo = seg(t, a + 1.95, a + 2.4); o *= 1 - uo; x -= eIn2(uo) * 70; ry += eIn2(uo) * 50; }
        else {
          const k = shake(seg(t, T.sh0, T.sh1), c.h);
          x += k.dx; y += k.dy; rot = k.r; s *= k.s;
          const ub = eOut3(seg(t, T.sh1, T.sh1 + .5));
          o *= lerp(1, .18, ub) * (1 - seg(t, T.col, T.col + .3)); s *= lerp(1, 1.15, ub); bl = 8 * ub;
        }
        c.b.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) perspective(700px) rotateY(${ry}deg) scale(${s}) rotate(${rot}deg)`;
        c.b.style.opacity = o; c.b.style.visibility = o > 0 ? 'visible' : 'hidden';
        blurF(c.b, bl);
        sweep(c.sh, seg(t, a + .7, a + 1.6));
      });
      const { k, vel } = path(t);
      reel.frame(k, vel, lensR(t, reel.R, T.sh1, T.col), seg(t, T.sh1, T.sh1 + .45) * (1 - seg(t, T.col, T.col + .35)),
        seg(t, T.s1 + T.set, T.s1 + T.set + .35), seg(t, T.sh1 + .35, T.sh1 + .65) * (1 - seg(t, T.col, T.col + .1)));
      un.frame(t, T.sh1, reel.pcx, reel.pcy);
      rv.frame(t, T.col + .05, T.out, from);
      wipe.frame(seg(t >= T.w0 ? t - T.w0 : t + 15 - T.w0, 0, .85));
      const pb = bump(seg(t, 12.2, 12.7));
      place(promo.b, cx, 383, 1 + .05 * pb, 1);
      promo.pc.style.boxShadow = `0 0 ${(26 * pb).toFixed(1)}px rgba(132,217,253,${(.45 * pb).toFixed(2)})`;
      promo.live(t, { roll: [[1.6, .7], [12.3, .8]], hbP: 5 });
      sweep(promo.sh, t < 9 ? seg(t, 4.2, 5) : seg(t, 13.6, 14.4));
      ctx.clearRect(0, 0, 520, 470);
      sparks.draw(ctx, t, T.col + .05, from.x, from.y - 8);
    };
  }

  // ---------- слайд новостей сайта «Промокод WELCOME» (владелец 22.11): та же рамка и логотип, что у corner (RUSH35), 8 с ----------
  // настоящий 3D-кейс «Карамельное яблоко» (assets/cs2case/case-apple.glb, анимация ключом из Blender) появляется, ключ открывает замок,
  // крышка распахивается — из кейса вылетает золотой купон WELCOME (лучи, вспышка, искры), внизу промокод и «+50 на баланс»
  function Coupon() {
    const c = E('div', 'cpn ab', root);
    c.innerHTML = '<i class="cpn-tx"></i><span class="cpn-l"><i class="cpn-k">Промокод</i><b class="cpn-c">' + PROMO.code + '</b></span>'
      + '<span class="cpn-r"><b>+50' + BAL + '</b><i>на баланс</i></span><i class="shine"></i>';
    return c;
  }
  function buildWelcome() {
    const P = Glass({ x: 30, y: 36, w: 460, h: 404 });
    const cx = 260, sy = 250, CS = 300;
    const logo = Logo(196, true);
    const c3 = Case3D({ glb: 'case-apple.glb', P: C2P_MAJOR, cw: 196, size: CS });
    const pic = Case('major', '', 214, 0); pic.lb.style.display = 'none'; // запасной вариант, если 3D не загрузится
    const un = Unlock(150);
    const rv = Reveal({ cx, cy: sy - 41, w: 262, R: 150, lx: cx, ly: sy + 70, lfs: 17, hero: Coupon, ar: .42, nolbl: true });
    const promo = Promo({ dir: 'row', lfs: 12, cfs: 33, bfs: 28, gap: 12, stack: true });
    const ctx = Canvas(520, 470);
    const sparks = Sparks(11, 54, { speed: 420, size: 2, g: 600, life: .95 });
    const OPEN_FPS = C2D.FPS * 1.5;   // открытие ключом ×1,5, как в TikTok
    const T = { in: .1, open: .75 };
    T.lid = T.open + (C2D.LID - C2D.OPEN[0]) / OPEN_FPS; T.col = T.lid + .06;
    const from = { x: cx, y: sy - 18, w: 40 };
    return t => {
      P.live(t);
      place(logo.b, cx, 96, 1 + .04 * bump(seg(t, T.col + .05, T.col + .5)), 1);
      sweep(logo.sh, seg(t, 4.6, 5.5));
      logo.live(t, { tw: [.6, 5.2], cgP: 3 });
      // кейс: въезжает (поворот, как карусель у corner), ключ открывает, потом кейс уходит в тень под купоном
      const ui = seg(t, T.in, T.in + .55), ue = eOut3(ui), ud = eOut3(seg(t, T.col + .1, T.col + .7));
      const x = cx + (1 - ue) * 70, y = sy + 6 + ud * 20 + Math.sin(TAU * t / 4) * 2 * (1 - ud);
      const s = lerp(.9, 1, ue) * lerp(1, .92, ud), o = clamp(ui * 1.5) * lerp(1, .5, ud);
      if (c3.ok) {
        pic.b.style.visibility = 'hidden';
        place(c3.cv, x, y, s, o);
        c3.cv.style.filter = c3.css + (ud > .01 ? ` blur(${(2.2 * ud).toFixed(2)}px)` : '');
        c3.frame(clamp(C2D.OPEN[0] + (t - T.open) * OPEN_FPS, C2D.OPEN[0], C2D.OPEN[1]), lerp(-24, 0, ue) + 6 * ud, lerp(12, 6, ue), 1, 0);
      } else {
        const k = shake(seg(t, T.open, T.lid), pic.h);
        place(pic.b, x + k.dx, y + k.dy, s * k.s, o, k.r);
      }
      un.frame(t, T.lid, from.x, from.y);
      rv.frame(t, T.col, 99, from);
      const pb = bump(seg(t, T.col + 1.2, T.col + 1.7));
      place(promo.b, cx, 385, 1 + .05 * pb, 1);
      promo.pc.style.boxShadow = `0 0 ${(26 * pb).toFixed(1)}px rgba(132,217,253,${(.45 * pb).toFixed(2)})`;
      promo.live(t, { roll: [[.25, .7], [T.col + 1.25, .8]], hbP: 4 });
      sweep(promo.sh, seg(t, 6.2, 7));
      sweep(promo.sh2, seg(t, T.col + .4, T.col + 1.1));
      ctx.clearRect(0, 0, 520, 470);
      sparks.draw(ctx, t, T.col, from.x, from.y - 8);
    };
  }

  // ---------- НОВЫЙ ГОД (владелец 26.11): слайд новостей сайта «Промокод NEW2027 — +50% к пополнению», 9 с, только на время ивента ----------
  // снегопад и мигающая гирлянда, настоящий 3D-кейс «Карамельное яблоко» падает (анимация падения из Blender, кадры 1–75, как на сайте)
  // в сугроб — снежный хлопок; ключ открывает замок, из кейса вылетает новогодний билет NEW2027 (лучи, вспышка, искры), внизу промокод со снегом и «+50%»
  const NY_OX = 64, NY_W = 648; // холсты снега шире сцены: на слайде 640×396 видно x −48…568 (сцена 520×470 вписана с увеличением)
  function WideCanvas() { const c = E('canvas', 'fx ab', root, { left: px(-NY_OX), width: px(NY_W), height: '470px' }); c.width = NY_W; c.height = 470; return c.getContext('2d'); }
  function Snow(seed, n, o) { // o: {size, sp, a, soft} — хлопья падают и покачиваются
    const r = rng(seed), ps = [];
    for (let i = 0; i < n; i++) ps.push({ x: r() * NY_W, y: r() * 490, s: o.size * (.5 + r()), sp: o.sp * (.6 + .8 * r()), ph: r() * TAU, sw: 5 + r() * 14, a: o.a * (.45 + .55 * r()) });
    return {
      draw(ctx, t, k = 1) {
        for (const p of ps) {
          const y = (p.y + p.sp * t) % 490 - 10, x = p.x + Math.sin(t * .8 + p.ph) * p.sw, a = p.a * k;
          if (o.soft) { const g = ctx.createRadialGradient(x, y, 0, x, y, p.s); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; }
          else ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.beginPath(); ctx.arc(x, y, p.s, 0, TAU); ctx.fill();
        }
      },
    };
  }
  function Garland(arcs, step) { // провод провисает дугами [x0, y0, x1, y1, провис], лампочки мигают вразнобой (период 1,5 с)
    const COL = ['255,70,70', '255,198,74', '80,214,130', '110,200,255'], bulbs = [];
    const pt = (s, u) => [lerp(s[0], s[2], u), lerp(s[1], s[3], u) + s[4] * 4 * u * (1 - u)];
    arcs.forEach(s => { const n = Math.max(2, Math.round(Math.hypot(s[2] - s[0], s[3] - s[1]) / step)); for (let i = 1; i < n; i++) bulbs.push({ p: pt(s, i / n), c: COL[bulbs.length % 4], ph: (bulbs.length * .37) % 1 }); });
    return {
      draw(ctx, t, k = 1) {
        ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = 'rgba(16,24,20,.95)'; ctx.lineWidth = 1.5;
        arcs.forEach(s => { ctx.beginPath(); for (let i = 0; i <= 28; i++) { const [x, y] = pt(s, i / 28); if (i) ctx.lineTo(x + NY_OX, y); else ctx.moveTo(x + NY_OX, y); } ctx.stroke(); });
        bulbs.forEach(b => { const x = b.p[0] + NY_OX, y = b.p[1]; ctx.fillStyle = '#1a221d'; ctx.fillRect(x - 1.6, y - 1, 3.2, 3.4); });
        ctx.globalCompositeOperation = 'lighter';
        bulbs.forEach(b => {
          const v = .3 + .7 * Math.pow(.5 + .5 * Math.sin(TAU * (t / 1.5 + b.ph)), 2), x = b.p[0] + NY_OX, y = b.p[1] + 6;
          const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
          g.addColorStop(0, `rgba(${b.c},${.8 * v})`); g.addColorStop(.3, `rgba(${b.c},${.3 * v})`); g.addColorStop(1, `rgba(${b.c},0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill();
          ctx.fillStyle = `rgba(${b.c.split(',').map(c => Math.round(lerp(+c, 255, .6 * v))).join(',')},${.55 + .45 * v})`;
          ctx.beginPath(); ctx.ellipse(x, y, 2.7, 3.8, 0, 0, TAU); ctx.fill();
        });
        ctx.restore();
      },
    };
  }
  function Drift(seed) { // сугроб под кейсом из мягких комьев: при ударе сплющивается и расползается; lip — передний край поверх низа кейса
    const r = rng(seed), B = [];
    for (let i = 0; i < 15; i++) { const a = (i / 15) * TAU; B.push({ x: Math.cos(a) * (.55 + r() * .35), y: Math.sin(a) * (.5 + r() * .3) - .12, s: .32 + r() * .22, l: .9 + r() * .1 }); }
    B.push({ x: 0, y: -.1, s: .75, l: 1 });
    const blob = (ctx, x, y, rx, ry, l, a) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(-rx * .15, -rx * .35, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.5, `rgba(${Math.round(236 * l)},${Math.round(244 * l)},255,${a * .95})`);
      g.addColorStop(.82, `rgba(196,216,240,${a * .6})`); g.addColorStop(1, 'rgba(196,216,240,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
    };
    const dims = (t, tHit) => { const u = eOut3(seg(t, tHit, tHit + .35)); return [lerp(118, 166, u), lerp(30, 17, u)]; };
    return {
      draw(ctx, t, tHit, cx, cy, k = 1) {
        const [RX, RY] = dims(t, tHit), X = cx + NY_OX;
        for (const b of B) blob(ctx, X + b.x * RX, cy + b.y * RY * 2, RX * b.s, RX * b.s * RY / RX * 1.6, b.l, .96 * k);
      },
      lip(ctx, t, tHit, cx, cy, kk = 1) { // после удара кейс сидит в снегу: передний край сугроба чуть закрывает низ кейса
        const k = seg(t, tHit, tHit + .12) * kk; if (k <= 0) return;
        const [RX] = dims(t, tHit), X = cx + NY_OX;
        ctx.save(); ctx.beginPath(); ctx.rect(X - RX, cy - 9, RX * 2, 40); ctx.clip();
        for (let i = -3; i <= 3; i++) blob(ctx, X + i * RX * .16, cy - 2 + Math.abs(i) * 1.5, RX * .2, 9, .97, .97 * k);
        ctx.restore();
      },
    };
  }
  function Puff(seed, n) { // снежный хлопок при ударе: комья разлетаются по сторонам, облако снежной пыли
    const r = rng(seed), ps = [];
    for (let i = 0; i < n; i++) { const sd = r() < .5 ? -1 : 1, a = (.06 + r() * .42) * Math.PI; ps.push({ vx: sd * Math.cos(a) * (140 + r() * 280), vy: -Math.sin(a) * (110 + r() * 230), s: 1.2 + r() * 3.4, life: .6 + r() * .7, x0: sd * r() * 70 }); }
    return {
      draw(ctx, t, t0, cx, cy) {
        const T = t - t0; if (T < 0 || T > 1.6) return;
        const u = seg(T, 0, 1.3), w = lerp(70, 250, eOut3(u)), al = .55 * Math.pow(1 - u, 1.6);
        ctx.save(); ctx.translate(cx + NY_OX, cy - 14); ctx.scale(1, .34);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
        g.addColorStop(0, `rgba(248,252,255,${al})`); g.addColorStop(.6, `rgba(230,242,255,${al * .45})`); g.addColorStop(1, 'rgba(230,242,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w, 0, TAU); ctx.fill(); ctx.restore();
        for (const p of ps) {
          if (T > p.life) continue;
          const f = (1 - Math.exp(-1.8 * T)) / 1.8, x = cx + NY_OX + p.x0 + p.vx * f, y = cy - 6 + p.vy * f + 350 * T * T;
          ctx.fillStyle = `rgba(250,252,255,${Math.pow(1 - T / p.life, 1.2)})`; ctx.beginPath(); ctx.arc(x, y, p.s, 0, TAU); ctx.fill();
        }
      },
    };
  }
  function Glints(seed, n, b) { // льдинки поблёскивают крестиками вокруг билета и промокода
    const r = rng(seed), ps = [];
    for (let i = 0; i < n; i++) ps.push({ x: b.x + r() * b.w, y: b.y + r() * b.h, s: 3 + r() * 5, p: 1.3 + r() * 1.5, ph: r() });
    return {
      draw(ctx, t, k = 1) {
        if (k <= 0) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (const p of ps) {
          const v = Math.pow(bump(seg((t / p.p + p.ph) % 1, 0, .32)), 2) * k; if (v < .02) continue;
          const x = p.x + NY_OX, y = p.y, L = p.s * (.4 + .6 * v);
          ctx.strokeStyle = `rgba(225,246,255,${v})`; ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
          const g = ctx.createRadialGradient(x, y, 0, x, y, L * .7); g.addColorStop(0, `rgba(255,255,255,${v})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, L * .7, 0, TAU); ctx.fill();
        }
        ctx.restore();
      },
    };
  }
  function TicketNY() {
    const c = E('div', 'cpn ny ab', root);
    c.innerHTML = '<i class="cpn-tx"></i><span class="cpn-l"><i class="cpn-k">Промокод</i><b class="cpn-c">' + PROMO.code + '</b></span>'
      + '<span class="cpn-r"><b>' + PROMO.pct + '</b><i>к<br>пополнению</i></span><i class="ny-cap"></i><i class="shine"></i>';
    return c;
  }
  function buildNY() {
    document.body.classList.add('ny');
    const cx = 260, sy = 236, CS = 470, GROUND = 312;
    const back = WideCanvas();
    const far = Snow(21, 70, { size: 1.6, sp: 26, a: .5 }), soft = Snow(22, 14, { size: 7, sp: 40, a: .22, soft: true }), near = Snow(23, 26, { size: 2.6, sp: 70, a: .85 });
    const gar = Garland([[-60, 34, 152, 50, 34], [368, 50, 580, 34, 34]], 21);
    const drift = Drift(51);
    const logo = Logo(196, true);
    const c3 = Case3D({ glb: 'case-apple.glb', P: C2P_MAJOR, cw: 188, size: CS });
    const pic = Case('major', '', 214, 0); pic.lb.style.display = 'none'; // запасной вариант, если 3D не загрузится
    const un = Unlock(150);
    const rv = Reveal({ cx, cy: sy - 8, w: 268, R: 150, lx: cx, ly: 320, lfs: 17, hero: TicketNY, ar: .42, lbl: '<span class="nm">С Новым 2027 годом!</span>' });
    const promo = Promo({ dir: 'row', lfs: 12, cfs: 33, bfs: 28, gap: 12, stack: true });
    E('i', 'ny-cap', promo.pc); E('i', 'ny-cap', promo.b.querySelector('.pb'));
    const front = WideCanvas();
    const puff = Puff(31, 46), sparks = Sparks(11, 54, { speed: 420, size: 2, g: 600, life: .95 }), glints = Glints(41, 16, { x: 70, y: 150, w: 380, h: 270 });
    const OPEN_FPS = C2D.FPS * 1.5;   // открытие ключом ×1,5, как в TikTok и WELCOME
    const T = { drop: .3, open: 2.1 };
    T.hit = T.drop + 12 / C2D.FPS; T.lid = T.open + (C2D.LID - C2D.OPEN[0]) / OPEN_FPS; T.col = T.lid + .06;
    const from = { x: cx, y: sy - 14, w: 40 };
    return t => {
      back.clearRect(0, 0, NY_W, 470); front.clearRect(0, 0, NY_W, 470);
      const kin = eOut3(seg(t, 0, .4));
      far.draw(back, t, kin); soft.draw(back, t, kin);
      gar.draw(back, t, kin);
      const ud = eOut3(seg(t, T.col + .1, T.col + .7)), dk = lerp(1, .38, ud);   // ud — кейс уходит в тень под билетом; сугроб тускнеет, чтобы читалась надпись
      drift.draw(back, t, T.hit, cx, GROUND, dk);
      place(logo.b, cx, 96, (1 + .04 * bump(seg(t, T.col + .05, T.col + .5))) * lerp(.94, 1, kin), kin);
      sweep(logo.sh, seg(t, 6.2, 7.1));
      logo.live(t, { tw: [1.2, 5.6], cgP: 3 });
      // кейс: падает в сугроб (кадры Blender 1–75), лёгкая тряска при ударе; ключ открывает; потом уходит в тень под билетом
      const hk = t >= T.hit ? Math.exp(-(t - T.hit) * 9) : 0;
      const x = cx, y = sy + ud * 18 + Math.sin(t * 60) * 2.2 * hk, s = lerp(1, .9, ud), o = (t >= T.drop ? 1 : 0) * lerp(1, .45, ud);
      const f = t < T.open ? clamp(1 + (t - T.drop) * C2D.FPS, 1, 75) : clamp(C2D.OPEN[0] + (t - T.open) * OPEN_FPS, C2D.OPEN[0], C2D.OPEN[1]);
      if (c3.ok) {
        pic.b.style.visibility = 'hidden';
        place(c3.cv, x, y, s, o);
        c3.cv.style.filter = c3.css + (ud > .01 ? ` blur(${(2.2 * ud).toFixed(2)}px)` : '');
        if (c3.floorMat) c3.floorMat.opacity = c3.shadow0 * (t < T.open ? seg(f, 9, 13) : 1);   // тень — только у земли
        c3.frame(f, -16 + 8 * ud, 10, 1, 0);
      } else {
        const k = shake(seg(t, T.open, T.lid), pic.h);
        place(pic.b, x + k.dx, y + k.dy, s * k.s, o, k.r);
      }
      un.frame(t, T.lid, from.x, from.y);
      rv.frame(t, T.col, 99, from);
      const pb = bump(seg(t, T.col + 1.2, T.col + 1.7));
      place(promo.b, cx, 385, 1 + .05 * pb, 1);
      promo.pc.style.boxShadow = `0 0 ${(26 * pb).toFixed(1)}px rgba(190,235,255,${(.5 * pb).toFixed(2)})`;
      promo.live(t, { roll: [[.35, .7], [T.col + 1.25, .8]], hbP: 4 });
      sweep(promo.sh, seg(t, 7.2, 8));
      sweep(promo.sh2, seg(t, T.col + .4, T.col + 1.1));
      drift.lip(front, t, T.hit, cx, GROUND - 6, dk);
      puff.draw(front, t, T.hit, cx, GROUND);
      front.save(); front.translate(NY_OX, 0); sparks.draw(front, t, T.col, from.x, from.y - 8); front.restore();
      glints.draw(front, t, seg(t, T.col + .3, T.col + 1));
      near.draw(front, t, kin);
    };
  }

  // ---------- короткие ролики TikTok / Reels (9:16) и квадрат, 4 с, без звука ----------
  const L_TIKTOK = {
    W: 1080, H: 1920, logo: { y: 300, w: 600 },
    cases: { y: 650, xs: [215, 540, 865], ws: [340, 440, 340], fs: 32 },
    lens: { y: 1040, R: 300 }, openS: 1.3,
    hero: { y: 1000, w: 700, R: 560 }, lbl: { y: 1292, fs: 52 },
    promo: { y: 1532, dir: 'col', lfs: 32, cfs: 130, bfs: 46, gap: 22, boxed: true, pad: '30px 56px 36px' },
    dust: 80, dsize: 1.4,
  };
  const L_SQUARE = {
    W: 1080, H: 1080, logo: { y: 122, w: 390 },
    cases: { y: 352, xs: [250, 540, 830], ws: [250, 304, 250], fs: 22 },
    lens: { y: 628, R: 218 }, openS: 1.2,
    hero: { y: 590, w: 470, R: 400 }, lbl: { y: 800, fs: 36 },
    promo: { y: 952, dir: 'row', lfs: 20, cfs: 78, bfs: 64, gap: 22, boxed: true, pad: '20px 28px', stack: true },
    dust: 55, dsize: 1.2,
  };
  function buildShort(L) {
    const { W, H } = L;
    document.body.classList.add('opaque');
    const bg = E('div', 'bg ab', root, { width: px(W), height: px(H) });
    const bgi = I(IMG.bg, '', bg);
    E('i', 'grid', bg); E('i', 'bgglow', bg);
    const bgold = E('i', 'bggold', bg); E('i', 'vig', bg);
    const dctx = Canvas(W, H);
    const dust = Dust(9, L.dust, W, H, L.dsize);
    const scene = E('div', 'ab', root, { width: px(W), height: px(H) }); // для «встряски» камеры
    const mark = root.childNodes.length;
    const logo = Logo(L.logo.w, true);
    const cases = [];
    [0, 2, 1].forEach(i => { cases[i] = Case(CASES[i].k, CASES[i].n, L.cases.ws[i], L.cases.fs); }); // центральный — поверх
    const cw3 = L.cases.ws[1] * L.openS * 834 / 900; // ширина кейса на картинке (без полей) — такой же будет 3D
    const c3 = Case3D({ glb: 'case-major2.glb', P: C2P_MAJOR, cw: cw3, size: W }); // холст во всю ширину — наезд на замок без обрезки
    window.__c3 = c3; // для подбора ракурса (src/render.js не использует)
    const f = L.lens.R / 235;
    const reel = LensReel({ x: 0, y: L.lens.y - 255 * f, f, wN: W / f, n: 20, win: 16, seed: 5 });
    const un = Unlock(L.lens.R * 1.5);
    const rv = Reveal({ cx: W / 2, cy: L.hero.y, w: L.hero.w, R: L.hero.R, lx: W / 2, ly: L.lbl.y, lfs: L.lbl.fs, pill: false });
    const promo = Promo(L.promo);
    const ctx = Canvas(W, H);
    const sparks = Sparks(21, 150, { speed: W * .95, size: W / 360, g: W * .9, life: 1.2 });
    [...root.childNodes].slice(mark).forEach(n => { if (n !== scene) scene.appendChild(n); });
    // открытие ключом (×1,5): лёгкий наезд, пока ключ открывает замок и он падает — отъезд, крышка распахивается — лупа
    const T = { fly: .4, x3: .56, open: .58, push: 1.2, back: 1.4, sh1: 1.5, s0: 1.55, s1: 2.65, set: .18, col: 2.95, p0: 3.1 };
    const OPEN_FPS = C2D.FPS * 1.5;
    const camPath = t => { // [yaw, pitch, zoom, focus]: ракурс картинки → лёгкий наезд (кейс всегда целиком и по центру) → вид сайта
      const u1 = eIO(seg(t, T.open, T.push)), u2 = eIO(seg(t, T.push, T.back));
      return [lerp(lerp(18, 8, u1), 0, u2), lerp(lerp(15, 9, u1), 3, u2), lerp(lerp(1, 1.28, u1), 1, u2), 0];
    };
    const path = SpinPath(6, 16, -.38, T.s0, T.s1, T.set); // встаёт у самого края плитки ножа (как случайная точка на сайте, ±0,4 плитки) — последний щелчок перед остановкой
    const from = { x: reel.pcx, y: reel.pcy, w: reel.TW * 1.32 * .86 * f };
    // метки для звука (src/audio.js): щелчок — как на сайте, когда середина зазора между плитками проходит под чертой
    const ticks = [];
    for (let t = T.s0, last = null; t <= T.s1 + T.set + .001; t += .001) { const i = Math.floor(path(t).k + .5 + 3 / 256); if (last !== null && i !== last) ticks.push(+t.toFixed(3)); last = i; }
    const RL = [T.p0 + .05, .45], NL = PROMO.code.length;
    window.BANNER_CUES = { fly: T.fly, open: T.open, lid: T.open + (C2D.LID - C2D.OPEN[0]) / OPEN_FPS, lens: T.sh1, stop: T.s1 + T.set, reveal: T.col + .05, promo: T.p0, ticks,
      letters: [...Array(NL)].map((_, i) => +(RL[0] + RL[1] * (.3 + .7 * i / (NL - 1))).toFixed(3)), openSpeed: OPEN_FPS / C2D.FPS };
    return t => {
      const a = t - (T.col + .05), is3 = c3.ok;
      bgi.style.transform = `scale(${1.06 + t * .012}) translate(${-t * 3}px,0)`;
      bgold.style.opacity = a < 0 ? 0 : seg(a, 0, .18) * (1 - .45 * seg(a, .25, 1.4));
      dctx.clearRect(0, 0, W, H);
      dust.draw(dctx, t + 3, a > 0 ? .8 * (1 - seg(a, 0, 1.5)) : 0);
      const shk = a > 0 ? Math.exp(-a * 7) * W * .008 : 0;
      scene.style.transform = `translate(${(Math.sin(a * 63) * shk).toFixed(2)}px,${(Math.cos(a * 51) * shk).toFixed(2)}px)`;
      // логотип
      const ul = seg(t, 0, .42);
      place(logo.b, W / 2, L.logo.y, lerp(1.32, 1, eOut3(ul)) * (1 + .04 * bump(seg(a, 0, .45))), clamp(ul * 2.2));
      blurF(logo.b, ul < 1 ? (1 - eOut3(ul)) * 14 : 0);
      sweep(logo.sh, seg(t, .55, 1.25));
      logo.live(t, { tw: [.4, 3.3], cgP: 2 });
      // кейсы падают сверху; MAJOR летит в центр и становится 3D-кейсом, ключ открывает замок — из крышки раскрывается лупа
      const Rc = lensR(t, reel.R, T.sh1, T.col), lo = clamp(Rc / reel.R);
      const ub = eOut3(seg(t, T.sh1, T.sh1 + .5)); // уход кейса в размытие под лупой (как .c2-rl.spinning .c2-case)
      const gone = 1 - seg(t, T.col, T.col + .3);
      [1, 0, 2].forEach((i, n) => {
        const c = cases[i], a0 = .05 + n * .07, ui = seg(t, a0, a0 + .4);
        let x = L.cases.xs[i], y = L.cases.y - (1 - eBack(ui, 1.4)) * H * .05 + Math.sin(t * 2.2 + i * 1.7) * c.w * .008;
        let s = lerp(.86, 1, eOut3(ui)), o = clamp(ui * 2), rot = 0, bl = 0;
        if (i === 1) {
          const uf = eIO(seg(t, T.fly, T.fly + .2));
          s *= lerp(1, L.openS, uf);
          // центр картинки (без подписи) летит в центр лупы
          x = lerp(x, reel.pcx, uf); y = lerp(y, reel.pcy + .75 * L.cases.fs * s, uf);
          c.lb.style.opacity = 1 - seg(t, T.fly, T.fly + .12);
          if (is3) o *= 1 - seg(t, T.x3, T.x3 + .08);
          else { // 3D не загрузился — как раньше: картинка вздрагивает
            const k = shake(seg(t, T.open, T.sh1), c.h * L.openS);
            x += k.dx; y += k.dy; rot = k.r; s *= k.s;
            o *= lerp(1, .18, ub) * gone; s *= lerp(1, 1.15, ub); bl = 10 * ub * f;
          }
        } else {
          x += (i ? 1 : -1) * eIO(seg(t, T.fly, T.fly + .3)) * W * .02;
          o *= t < T.col ? lerp(1, .42, lo) : lerp(.42, .55, seg(t, T.col, T.col + .3));
          bl = 6 * f * lo;
        }
        place(c.b, x, y, s, o, rot); blurF(c.b, bl);
        sweep(c.sh, seg(t, .5 + n * .1, 1.1 + n * .1));
      });
      if (is3) {
        const o3 = seg(t, T.x3, T.x3 + .08) * lerp(1, .18, ub) * gone;
        place(c3.cv, reel.pcx, reel.pcy, lerp(1, 1.15, ub), o3);
        c3.cv.style.filter = c3.css + (ub > .01 ? ` blur(${(10 * ub * f).toFixed(2)}px)` : '');
        if (o3 > .001) c3.frame(clamp(C2D.OPEN[0] + (t - T.open) * OPEN_FPS, C2D.OPEN[0], C2D.OPEN[1]), ...camPath(t));
      }
      const { k, vel } = path(t);
      reel.frame(k, vel, Rc, seg(t, T.sh1, T.sh1 + .4) * (1 - seg(t, T.col, T.col + .3)), seg(t, T.s1 + T.set, T.s1 + T.set + .1),
        seg(t, T.sh1 + .3, T.sh1 + .55) * (1 - seg(t, T.col, T.col + .1)));
      un.frame(t, T.sh1, reel.pcx, reel.pcy);
      rv.frame(t, T.col + .05, 99, from);
      // промокод
      const up = seg(t, T.p0, T.p0 + .36);
      place(promo.b, W / 2, L.promo.y + (1 - eOut3(up)) * H * .05, lerp(.88, 1, eBack(up, 1.3)), clamp(up * 2));
      promo.live(t, { roll: [[T.p0 + .05, .45]], hbAt: 3.62 });
      sweep(promo.sh, seg(t, 3.62, 3.98));
      ctx.clearRect(0, 0, W, H);
      sparks.draw(ctx, t, T.col + .05, from.x, from.y);
    };
  }

  const FMTS = {
    stream: { W: 1600, H: 330, dur: 15, alpha: true, build: buildStream },
    jinemez: { W: 1600, H: 330, dur: 15, alpha: true, build: buildStream }, // плашка стримера: JINEMEZ +10% к пополнению (24.11)
    georg: { W: 1600, H: 330, dur: 15, alpha: true, build: buildStream }, // плашка стримера: GEORG999 +10% к пополнению (24.11)
    'corner-jinemez': { W: 520, H: 470, dur: 15, alpha: true, build: buildCorner }, // значок в углу: JINEMEZ +10% (24.11)
    corner: { W: 520, H: 470, dur: 15, alpha: true, build: buildCorner },
    welcome: { W: 520, H: 470, dur: 8, alpha: true, build: buildWelcome },
    'site-welcome': { W: 640, H: 396, dur: 8, alpha: true, build: buildWelcome, fit: true },
    'site-corner': { W: 640, H: 396, dur: 15, alpha: true, build: buildCorner, fit: true },
    'site-ny': { W: 640, H: 396, dur: 9, alpha: true, build: buildNY, fit: true }, // НОВЫЙ ГОД: слайд NEW2027 +50% (владелец 26.11)
    tiktok: { W: 1080, H: 1920, dur: 4, alpha: false, build: () => buildShort(L_TIKTOK) },
    square: { W: 1080, H: 1080, dur: 4, alpha: false, build: () => buildShort(L_SQUARE) },
  };
  const F = FMTS[FMT] || FMTS.stream;
  root.style.width = px(F.W); root.style.height = px(F.H);
  if (F.fit) Object.assign(root.style, { width: '520px', height: '470px', transformOrigin: '260px 228px', transform: 'translate(60px,-30px) scale(1.04)' }); // сцена 520×470 → середина кадра 640×396
  if (Q.get('check') && F.alpha) document.body.classList.add('check');
  const frame = F.build();
  const ready = Promise.all([document.fonts.ready, ...loads]).then(() => document.fonts.load('500 20px Oswald')).then(() => document.fonts.load('600 20px Oswald'));
  window.BANNER = { fmt: FMT, W: F.W, H: F.H, dur: F.dur, alpha: F.alpha, ready, seek: t => frame(t), cues: window.BANNER_CUES || null };
  if (Q.has('t')) ready.then(() => frame(+Q.get('t')));
  else if (!Q.has('capture')) { // живой просмотр в браузере — по кругу
    ready.then(() => { const t0 = performance.now(); const loop = () => { frame(((performance.now() - t0) / 1000) % F.dur); requestAnimationFrame(loop); }; loop(); });
  } else ready.then(() => frame(0));
})();

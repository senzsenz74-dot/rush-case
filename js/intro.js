/* RUSH CASE — заставка при открытии сайта. По мотивам интро CS2 (кадры сняты с intro720p.webm: 60 к/с, 6 с):
   тёмный фон, наш цветной логотип, глитч; корона влетает так же, как «2» в CS2.
   Рисуется на холсте в отдельном потоке (Worker + OffscreenCanvas), поэтому загрузка сайта её не тормозит;
   где так нельзя, index.html подключает этот же файл обычным скриптом (window.RCIntro).
   f — номер кадра (60 в секунду, 0…359). Размеры — в CSS-пикселях. */
(function () {
  'use strict';
  var FPS = 60, LAST = 359, BG = '#08070c', HR = 3;
  var PAL = ['#ffffff', '#fce3ac', '#f9c86e', '#f99b71', '#fa6974', '#e44563'];
  // буквы внутри частей логотипа (доли ширины части)
  var RL = { R: [.12, .36], U: [.34, .57], S: [.55, .78], H: [.76, 1] };
  var CL = { C: [0, .17], E: [.83, 1] };

  function mk(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function sub(p, fx0, fx1, fy0, fy1) {
    if (fy0 == null) fy0 = 0; if (fy1 == null) fy1 = 1;
    return { x: p.x + p.w * fx0, y: p.y + p.h * fy0, w: p.w * (fx1 - fx0), h: p.h * (fy1 - fy0) };
  }
  // случайные горизонтальные полосы для «порезанного» куска: [доля верха, доля низа, сдвиг]
  function bands(R, n, amp, hide) {
    var out = [], y = 0;
    while (y < 1) {
      var h = Math.min(1 - y, (.4 + R() * 1.2) / n);
      if (!(hide && R() < hide)) out.push([y, y + h, (R() - .5) * 2 * amp * (R() < .55 ? 1 : .15)]);
      y += h;
    }
    return out;
  }

  // части логотипа (корона, RUSH, CASE) — по пустым строкам между ними
  function parts(d, W, H) {
    var rows = [], segs = [], on = false, st = 0, y, x;
    for (y = 0; y < H; y++) { var n = 0; for (x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 40) n++; rows.push(n); }
    for (y = 0; y <= H; y++) {
      var v = y < H ? rows[y] : 0;
      if (v && !on) { on = true; st = y; } else if (!v && on) { on = false; segs.push([st, y]); }
    }
    for (var i = segs.length - 1; i > 0; i--) if (segs[i][0] - segs[i - 1][1] < 3) { segs[i - 1][1] = segs[i][1]; segs.splice(i, 1); }
    segs = segs.filter(function (s) { return s[1] - s[0] > 3; });
    if (segs.length !== 3) segs = [[0, Math.round(H * .36)], [Math.round(H * .37), Math.round(H * .82)], [Math.round(H * .85), H]];
    return segs.map(function (sg) {
      var x0 = W, x1 = 0;
      for (var yy = sg[0]; yy < sg[1]; yy++) for (var xx = 0; xx < W; xx++) if (d[(yy * W + xx) * 4 + 3] > 40) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; }
      if (x1 < x0) { x0 = 0; x1 = W - 1; }
      return { x: x0, y: sg[0], w: x1 - x0 + 1, h: sg[1] - sg[0] };
    });
  }

  // логотип в 3 раза крупнее с чёткими краями — для огромных осколков
  function upscale(bmp) {
    var w = bmp.width * HR, h = bmp.height * HR, c = mk(w, h), x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, w, h);
    var im = x.getImageData(0, 0, w, h), d = im.data;
    for (var i = 3; i < d.length; i += 4) d[i] = (d[i] - 128) * 2.6 + 128;
    x.putImageData(im, 0, 0);
    return c;
  }

  // зерно: точки, гуще в «пятнах»; g — размер зерна в пикселях экрана
  function grain(seed, g, d0, d1, pw, soft, rgb) {
    var N = 512, M = 6, R = rng(seed), gr = [], i;
    for (i = 0; i < M * M; i++) gr.push(R());
    var c = mk(N, N), x = c.getContext('2d'), im = x.createImageData(N, N), d = im.data;
    for (var y = 0; y < N; y++) for (var xx = 0; xx < N; xx++) {
      var fx = xx / N * M, fy = y / N * M, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      var a = gr[iy % M * M + ix % M], b = gr[iy % M * M + (ix + 1) % M], cc = gr[(iy + 1) % M * M + ix % M], e = gr[(iy + 1) % M * M + (ix + 1) % M];
      var bl = (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + e * tx) * ty;
      if (R() < d0 + d1 * Math.pow(bl, pw)) { var j = (y * N + xx) * 4; d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2]; d[j + 3] = soft ? 70 + R() * 185 : 255; }
    }
    x.putImageData(im, 0, 0);
    if (g <= 1) return c;
    var c2 = mk(N * g, N * g), x2 = c2.getContext('2d');
    x2.imageSmoothingEnabled = false; x2.drawImage(c, 0, 0, N * g, N * g);
    return c2;
  }

  function Intro(cv, bmp, opt) {
    var ctx = cv.getContext('2d');
    var LW = bmp.width, LH = bmp.height;
    var px = mk(LW, LH), pc = px.getContext('2d'); pc.drawImage(bmp, 0, 0);
    var Pa = parts(pc.getImageData(0, 0, LW, LH).data, LW, LH), P = { c: Pa[0], r: Pa[1], k: Pa[2] };
    var hi = upscale(bmp);
    var reduce = !!opt.reduce, lay, lc, ep, sp, W, H, k, vw, vh, VW, VH, s, cx, cy, Lx, Ly, Lw, Lh, last = -1;

    function layout(o) {
      vw = Math.max(1, o.w); vh = Math.max(1, o.h); k = o.k || 1;
      var lim = Math.sqrt(3.7e6 / (vw * k * vh * k)); if (lim < 1) k *= lim; // не больше ~3,7 Мп
      W = Math.round(vw * k); H = Math.round(vh * k);
      cv.width = W; cv.height = H;
      lay = mk(W, H); lc = lay.getContext('2d');
      var g = Math.max(1, Math.round(k * 1.3));
      ep = lc.createPattern(grain(11, g, .006, .85, 3.2, false, [0, 0, 0]), 'repeat');
      sp = ctx.createPattern(grain(23, g, .002, .05, 2.2, true, [252, 227, 172]), 'repeat');
      // кадр CS2 16:9, растянутый на весь экран с обрезкой краёв
      VW = Math.max(vw, vh * 16 / 9); VH = VW * 9 / 16;
      var lw = Math.min(vw * .78, Math.max(260, vw * .33)); lw = Math.min(lw, vh * .42 * LW / LH);
      s = lw / LW; cx = vw / 2; cy = vh * .49;
      Lw = LW * s; Lh = LH * s; Lx = cx - Lw / 2; Ly = cy - Lh / 2;
      last = -1;
    }
    layout(opt);

    function T(c) { c.setTransform(k, 0, 0, k, 0, 0); }
    function vx(X) { return vw / 2 + (X - .5) * VW; }
    function vy(Y) { return vh / 2 + (Y - .5) * VH; }

    // кусок r (в пикселях логотипа) левым верхом в (x, y); z — экранных px на px логотипа
    function crop(c, r, x, y, z, a) {
      if (r.w <= 0 || r.h <= 0) return;
      if (a != null) c.globalAlpha = a;
      if (z * k > 1.35) c.drawImage(hi, r.x * HR, r.y * HR, r.w * HR, r.h * HR, x, y, r.w * z, r.h * z);
      else c.drawImage(bmp, r.x, r.y, r.w, r.h, x, y, r.w * z, r.h * z);
      c.globalAlpha = 1;
    }
    // часть логотипа на своём месте: dx, dy — сдвиг в долях ширины/высоты логотипа, m — масштаб вокруг центра
    function at(c, r, dx, dy, m, a) {
      m = m || 1; var z = s * m;
      crop(c, r, cx - LW * z / 2 + r.x * z + (dx || 0) * Lw, cy - LH * z / 2 + r.y * z + (dy || 0) * Lh, z, a);
    }
    function atCut(c, r, bs, dx, dy, m, a) {
      for (var i = 0; i < bs.length; i++) { var b = bs[i]; at(c, sub(r, 0, 1, b[0], b[1]), (dx || 0) + b[2], dy, m, a); }
    }
    function full(c, a) { at(c, P.c, 0, 0, 1, a); at(c, P.r, 0, 0, 1, a); at(c, P.k, 0, 0, 1, a); }
    // корона отдельно: q — масштаб, dx/dy — сдвиг её центра от своего места
    function crownAt(c, q, dx, dy, a) {
      var z = s * q, fx = Lx + (P.c.x + P.c.w / 2) * s + dx * Lw, fy = Ly + (P.c.y + P.c.h / 2) * s + dy * Lh;
      crop(c, P.c, fx - P.c.w * z / 2, fy - P.c.h * z / 2, z, a);
    }
    // огромный кусок в кадре 16:9: X, Y — левый верх в долях кадра, hf — высота куска в долях высоты кадра
    function big(c, r, X, Y, hf, a) { crop(c, r, vx(X), vy(Y), hf * VH / r.h, a); }
    function bigCut(c, r, X, Y, hf, bs, a) {
      var z = hf * VH / r.h;
      for (var i = 0; i < bs.length; i++) { var b = bs[i]; crop(c, sub(r, 0, 1, b[0], b[1]), vx(X) + b[2] * r.w * z, vy(Y) + b[0] * r.h * z, z, a); }
    }
    function para(c, x, y, w, h, sl, col) {
      c.fillStyle = col; c.beginPath(); c.moveTo(x + sl, y); c.lineTo(x + w + sl, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fill();
    }
    function tri(c, x, y, w, h, down, col) {
      c.fillStyle = col; c.beginPath();
      if (down) { c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w * .5, y + h); } else { c.moveTo(x + w * .5, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); }
      c.closePath(); c.fill();
    }
    function dash(c, x, y, w, col) { para(c, x, y, w, Math.max(1.2, w * .2), w * .18, col || PAL[1]); }
    // косые полосы рядами, как в кадрах CS2 со «смазанными» буквами
    function barsPx(c, R, x0, y0, w, h, rows, o) {
      o = o || {};
      var step = h / rows, th = step * (o.th || .55), sk = (o.skew || 0) * w, jit = o.jit == null ? .1 : o.jit, gap = o.gap == null ? .025 : o.gap;
      for (var i = 0; i < rows; i++) {
        if (o.skip && R() < o.skip) continue;
        var yy = y0 + i * step, shf = sk * i / rows, xx = x0 + shf + R() * w * jit, end = x0 + shf + w * (1 - R() * jit), t = th * (.55 + R() * .6);
        while (xx < end) {
          var len = Math.min(end - xx, w * (o.seg || .3) * (.25 + R()));
          para(c, xx, yy, len, t, t * .9, o.col || (R() < .62 ? PAL[0] : R() < .75 ? PAL[1] : PAL[4]));
          xx += len + w * gap * (.3 + R() * 2);
        }
      }
    }
    function bars(c, R, X, Y, Wf, Hf, rows, o) { barsPx(c, R, vx(X), vy(Y), Wf * VW, Hf * VH, rows, o); }
    // сплюснутая копия логотипа из тонких полос (x, y — центр)
    function strip(c, R, x, y, w, sq, a) {
      var z = w / LW, h = LH * z * (sq || .2), n = 5;
      c.globalAlpha = a == null ? 1 : a;
      for (var i = 0; i < n; i++) {
        if (R() < .2) continue;
        var f0 = i / n, f1 = f0 + (.35 + R() * .5) / n;
        c.drawImage(bmp, 0, LH * f0, LW, LH * (f1 - f0), x - w / 2 + (R() - .5) * w * .06, y - h / 2 + f0 * h, w, (f1 - f0) * h);
      }
      c.globalAlpha = 1;
    }

    function clear() {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); T(ctx);
    }
    // пыль по фону
    function spray(R, a) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      var ox = R() * 512 | 0, oy = R() * 512 | 0;
      ctx.globalAlpha = a; ctx.translate(-ox, -oy); ctx.fillStyle = sp; ctx.fillRect(ox, oy, W, H);
      ctx.globalAlpha = 1; T(ctx);
    }
    // «грязный» слой: рисуем куски в него, потом выбиваем зерно и чуть притемняем
    function G0() {
      lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalAlpha = 1; lc.globalCompositeOperation = 'source-over';
      lc.clearRect(0, 0, W, H); T(lc); return lc;
    }
    function G1(R, er, dim) {
      lc.setTransform(1, 0, 0, 1, 0, 0);
      var ox = R() * 1024 | 0, oy = R() * 1024 | 0;
      lc.globalCompositeOperation = 'destination-out'; lc.globalAlpha = er;
      lc.translate(-ox, -oy); lc.fillStyle = ep; lc.fillRect(ox, oy, W, H); lc.setTransform(1, 0, 0, 1, 0, 0);
      if (dim) { lc.globalCompositeOperation = 'source-atop'; lc.globalAlpha = dim * .5; lc.fillStyle = BG; lc.fillRect(0, 0, W, H); }
      lc.globalCompositeOperation = 'source-over'; lc.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lay, 0, 0); T(ctx);
    }

    // 0–1 с: вспышки огромных кусков, логотип собирается, корона влетает
    function intro(f, R) {
      var c = ctx, l, i;
      if (f < 4) { // огромные «SH» сверху и «RU» снизу
        spray(R, .55); l = G0(); var sh = f < 2 ? 0 : .012;
        big(l, sub(P.r, .5, 1), .25 + sh, -.22, .5);
        big(l, sub(P.r, .04, .56), -.03 + sh, .7, .5);
        G1(R, .85, .3); return;
      }
      if (f < 8) { // сверхкрупно, буква целиком не влезает
        spray(R, .4); l = G0();
        if (f < 6) { big(l, sub(P.r, RL.U[0], RL.U[1]), .36, -.32, 1.5); big(l, sub(P.r, RL.R[0], RL.R[1], .45, 1), .04, .7, .9); }
        else big(l, sub(P.r, RL.S[0], RL.S[1]), -.12, -.55, 2.1);
        G1(R, 1, .38); return;
      }
      if (f < 12) { // ряды повторов
        l = G0(); var r1 = sub(P.r, .14, 1);
        if (f < 10) { big(l, r1, -.05, .0, .3, .8); big(l, r1, -.12, .36, .3); big(l, r1, -.08, .78, .3, .65); }
        else { var r2 = sub(P.r, .2, .7); big(l, r2, .5, .14, .26); big(l, r2, .48, .58, .26); }
        G1(R, .6, .15);
        if (f >= 10) { c.fillStyle = PAL[1]; c.fillRect(vx(.4), vy(.29), .09 * VW, Math.max(1, .003 * VH)); para(c, vx(.47), vy(.2), Math.max(1, .002 * VW), .12 * VH, -.02 * VW, PAL[1]); }
        return;
      }
      if (f < 20) { // экран в косых полосах
        l = G0(); var R2 = rng(1000 + (f - 12 >> 2));
        bars(l, R2, -.03 + (f >= 16 ? -.02 : 0), 0, 1.06, 1, 24, { skew: .08, th: f < 16 ? .6 : .42, seg: .22, gap: .018, jit: .14 });
        G1(R, .55, .12); return;
      }
      if (f < 22) { c.globalAlpha = .32; bars(c, rng(1003), .3, .02, .3, .92, 30, { skew: .25, th: .22, seg: .5, gap: .05, jit: .3, col: PAL[1] }); c.globalAlpha = 1; return; }
      if (f < 24) { // огромная H, слева обрывки
        l = G0(); big(l, sub(P.r, RL.H[0], RL.H[1]), .5, -.06, 1.15); bars(l, R, -.01, .1, .05, .65, 7, { th: .5, jit: .3, seg: 1 });
        G1(R, .7, .2); return;
      }
      if (f < 26) { at(c, P.r, .06, -.2); at(c, P.k, -.05, .05); bars(c, R, 0, .45, .03, .25, 6, { th: .4, jit: .4 }); return; }
      if (f < 28) {
        l = G0(); big(l, sub(P.r, .1, .7), .2, -.06, .36);
        var rb = sub(P.r, .05, .62); l.save(); l.translate(vx(-.02), vy(.74)); l.scale(1, .72); crop(l, rb, 0, 0, .3 * VH / rb.h); l.restore();
        G1(R, .5, .1); at(c, P.k); return;
      }
      if (f < 30) { at(c, P.k); at(c, P.r, 0, .32, 1.4); return; }
      if (f < 32) { at(c, P.k); at(c, P.r, .03, -.07); return; }
      at(c, P.r); at(c, P.k);
      if (f < 46) return;
      if (f < 48) { l = G0(); barsPx(l, R, cx + .02 * Lw, Ly + P.r.y * s - .25 * Lh, .36 * Lw, 1.5 * Lh, 13, { skew: -.5, th: .5, seg: .5, jit: .2 }); G1(R, .45, .1); return; }
      if (f < 54) { // огромные куски короны
        l = G0(); var RB = rng(2000 + (f - 48 >> 1));
        if (f < 52) {
          var X0 = f < 50 ? .3 : .36;
          bigCut(l, P.c, X0, -.02, .62, bands(RB, 5, .05)); bigCut(l, P.c, X0 - .08, .5, .5, bands(RB, 4, .06));
          if (f >= 50) bars(l, RB, .93, 0, .08, 1, 22, { th: .5, jit: .2 });
        } else { bigCut(l, P.c, .6, .5, .32, bands(RB, 4, .08)); bigCut(l, P.c, .52, .8, .3, bands(RB, 3, .1)); bars(l, RB, .82, .45, .12, .5, 9, { th: .5 }); }
        G1(R, .55, .18); return;
      }
      if (f < 58) { crownAt(c, .8, -.05, -.32); if (f < 56) bars(c, R, .86, 0, .13, 1, 20, { skew: -.5, th: .45, jit: .25, seg: .6 }); return; }
      crownAt(c, .95, .02, -.12, .45); crownAt(c, .95, -.01, -.06);
    }

    // 1–5,6 с: логотип стоит, иногда сбоит (моменты — как в CS2)
    function hold(f, R) {
      var c = ctx, RB = rng(4000 + (f >> 1)), top = Ly + P.c.y * s, bot = Ly + Lh, right = Lx + Lw, i;
      if (f >= 120 && f < 132 || f >= 282 && f < 300 || f >= 312 && f < 318) { at(c, P.c); atCut(c, P.r, bands(RB, 7, .035, .1)); atCut(c, P.k, bands(RB, 3, .03, .1)); }
      else if (f === 102) { at(c, P.c); at(c, P.r); at(c, sub(P.k, 0, CL.E[0] - .02)); }
      else if (f >= 162 && f < 166 || f >= 264 && f < 267) { at(c, P.c); at(c, P.r); at(c, sub(P.k, 0, .5)); atCut(c, sub(P.k, .5, 1), bands(RB, 3, .04, .2)); }
      else if (f >= 300 && f < 306) { atCut(c, P.r, bands(RB, 6, .02, .25), -.07, .34, 1.15); at(c, P.c, .03, -.06); at(c, P.k, .03, -.06); dash(c, Lx - .02 * Lw, bot + .1 * Lh, .06 * Lw); }
      else full(c);

      if (f === 63 || f === 64) tri(c, Lx + .86 * Lw, bot + .1 * Lh, .028 * Lw, .028 * Lw, 0, PAL[1]);
      else if (f === 66 || f === 67) tri(c, Lx + .3 * Lw, bot + .28 * Lh, .022 * Lw, .02 * Lw, 1, PAL[4]);
      else if (f === 87 || f === 88) at(c, sub(P.r, RL.S[0], RL.S[1], .1, 1), .2, .08);
      else if (f === 100 || f === 101) { dash(c, vx(.86), vy(.3), .02 * VW); dash(c, vx(.88), vy(.46), .012 * VW); }
      else if (f === 114 || f === 115) { dash(c, right + .05 * Lw, cy - .1 * Lh, .03 * Lw); dash(c, right + .1 * Lw, cy + .08 * Lh, .02 * Lw); }
      else if (f >= 120 && f < 126) { // сплюснутые копии по диагонали сверху и снизу
        var RS = rng(3100 + (f >= 123 ? 1 : 0)), sx = f >= 123 ? .03 * Lw : 0;
        for (i = 0; i < 4; i++) strip(c, RS, cx - .25 * Lw + i * .05 * Lw + sx, top - .06 * VH - i * .1 * VH, .38 * Lw);
        for (i = 0; i < 2; i++) strip(c, RS, cx + .14 * Lw - i * .05 * Lw + sx, bot + .09 * VH + i * .1 * VH, .38 * Lw);
      }
      else if (f >= 126 && f < 132) { dash(c, right - .06 * Lw, cy - .12 * Lh, .08 * Lw); dash(c, right - .08 * Lw, cy + .05 * Lh, .06 * Lw); }
      else if (f >= 132 && f < 138) { for (i = 0; i < 3; i++) dash(c, cx + (R() - .3) * .5 * Lw, top - R() * .15 * VH, (.02 + R() * .03) * Lw); }
      else if (f >= 138 && f < 142) crop(c, sub(P.r, RL.S[0], RL.S[1]), right - .05 * Lw, top - .02 * Lh, s * .45);
      else if (f === 144 || f === 145) { para(c, Lx + .1 * Lw, Ly + P.r.y * s + .05 * Lh, Math.max(1.5, .006 * Lw), .35 * Lh, .05 * Lw, PAL[0]); dash(c, Lx + .2 * Lw, top - .05 * Lh, .04 * Lw); }
      else if (f >= 150 && f < 154) {
        crop(c, sub(P.k, CL.C[0], CL.C[1]), right + .02 * Lw, cy - .2 * Lh, s * 2);
        for (i = 0; i < 2; i++) para(c, cx + .15 * Lw + i * .025 * Lw, bot + .12 * Lh, Math.max(1.5, .008 * Lw), .12 * Lh, .03 * Lw, PAL[0]);
      }
      else if (f >= 162 && f < 166) { dash(c, right - .05 * Lw, top + .2 * Lh, .07 * Lw); dash(c, right - .07 * Lw, top + .27 * Lh, .05 * Lw); }
      else if (f === 168 || f === 169) { dash(c, right + .02 * Lw, cy + .3 * Lh, .025 * Lw); dash(c, right + .06 * Lw, cy + .36 * Lh, .018 * Lw); }
      else if (f === 175) dash(c, right + .12 * Lw, cy - .05 * Lh, .015 * Lw);
      else if (f === 199) tri(c, Lx - .05 * Lw, cy + .4 * Lh, .012 * Lw, .012 * Lw, 0, PAL[1]);
      else if (f === 276 || f === 277) tri(c, cx + .05 * Lw, top - .1 * Lh, .02 * Lw, .018 * Lw, 1, PAL[1]);
      else if (f >= 282 && f < 288) { var RG = rng(3300 + (f >> 1)); strip(c, RG, cx + .12 * Lw, top - .12 * VH, .42 * Lw, .4, .9); strip(c, RG, cx + .06 * Lw, top - .26 * VH, .36 * Lw, .4, .8); }
      else if (f >= 288 && f < 294) dash(c, cx + .1 * Lw, top - .08 * Lh, .05 * Lw);
      else if (f >= 294 && f < 300) {
        var R3 = rng(3400 + (f >> 1));
        barsPx(c, R3, cx - .2 * Lw, top - .9 * Lh, .28 * Lw, .85 * Lh, 9, { skew: -.15, th: .35, jit: .3, seg: .5 });
        barsPx(c, R3, cx - .05 * Lw, bot + .05 * Lh, .28 * Lw, .6 * Lh, 6, { skew: -.15, th: .35, jit: .3, seg: .5 });
        para(c, Lx - .08 * Lw, cy + .1 * Lh, .12 * Lw, .05 * Lh, .02 * Lw, PAL[0]);
      }
    }

    // 5,6–6 с: логотип рассыпается, огромные осколки закрывают экран
    function outro(f, R) {
      var c = ctx, l;
      if (f === 338) { full(c); at(c, sub(P.r, 0, .42), -.12, .02, 1.22); return; }
      if (f === 339) { spray(R, .15); full(c, .45); return; }
      if (f < 342) { spray(R, .2); at(c, P.c, .04, 0, 1, .75); at(c, P.k, .04, 0, 1, .75); l = G0(); at(l, P.r, -.06, .02, 1.3); G1(R, .45, .12); return; }
      if (f < 348) {
        spray(R, .25); l = G0(); var st = f - 342 >> 1;
        at(l, [sub(P.r, .3, .78), sub(P.r, 0, .75), sub(P.r, .3, 1)][st], [-.15, -.22, -.08][st], -.95, [1.15, 1.3, 1.5][st]);
        if (st === 2) at(l, sub(P.c, .55, 1), .15, -.6, 1.2);
        at(l, sub(P.k, .25, 1), .05 + st * .05, 0, 1, .9);
        big(l, sub(P.r, .1, .45), .08 + st * .03, .9, .2);
        G1(R, .55, .15); return;
      }
      if (f < 352) {
        spray(R, f < 350 ? .55 : .3); l = G0();
        at(l, sub(P.k, .3, 1), .2, 0, 1, .95);
        if (f < 350) big(l, sub(P.r, .05, .4), .06, .9, .18);
        G1(R, .5, .2); dash(c, Lx + Lw * 1.05, cy - .3 * Lh, .03 * Lw); return;
      }
      var st2 = f - 352 >> 1, RG = rng(5000 + st2); l = G0();
      // огромная косая полоса — ножка буквы H
      var stem = sub(P.r, RL.H[0], RL.H[0] + .12);
      big(l, stem, [.75, .62, .5, .42][st2], -.05, 1.15 + st2 * .12);
      bigCut(l, sub(P.r, RL.R[0], RL.R[1]), -.06, [.3, .22, .18, .1][st2], .75 + st2 * .1, bands(RG, 6, .08, .1));
      bars(l, RG, 0, 0, .28 + st2 * .04, .3, 6, { th: .62, jit: .15, seg: .9, col: PAL[1] });
      if (st2 >= 1) big(l, sub(P.r, 0, .2), .3, .55, .55 + st2 * .1);
      if (st2 >= 2) { tri(l, vx(.28), vy(.18), .16 * VW, .14 * VH, 1, PAL[1]); bars(l, RG, -.02, .78, .2, .22, 4, { th: .6, seg: 1, col: PAL[0] }); }
      if (st2 >= 3) { para(l, vx(-.05), vy(.32), .4 * VW, .38 * VH, -.12 * VW, PAL[0]); big(l, sub(P.r, RL.S[0], RL.S[1]), .38, .28, 1.1); }
      G1(R, .62, .24);
    }

    function draw(f) {
      clear(); var R = rng(f * 7919 + 17);
      if (f < 60) intro(f, R); else if (f < 338) hold(f, R); else outro(f, R);
    }
    // для тех, кто просит меньше движения: просто логотип, без вспышек
    function calm(t) {
      clear(); var a = Math.min(1, t / .4); if (t > 1.8) a = Math.max(0, 1 - (t - 1.8) / .4);
      full(ctx, a);
    }

    function run(done, delay) { // delay — через сколько мс начать (под звук)
      var raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (fn) { return setTimeout(function () { fn(performance.now()); }, 1000 / FPS); };
      var t0 = 0;
      function tick(now) {
        if (!t0) t0 = now + (delay || 0);
        var t = (now - t0) / 1000;
        if (t < 0) return raf(tick);
        if (reduce) { calm(t); if (t >= 2.2) return done(); return raf(tick); }
        var f = Math.floor(t * FPS);
        if (f > LAST) { if (last !== LAST) draw(LAST); return done(); }
        if (f !== last) { draw(f); last = f; }
        raf(tick);
      }
      raf(tick);
    }

    return { layout: layout, draw: draw, run: run, frames: LAST + 1 };
  }

  if (typeof window === 'undefined') { // отдельный поток: холст и логотип присылает index.html, потом команду «пуск»
    var it = null, fin = function () { self.postMessage('done'); };
    self.onmessage = function (e) {
      var d = e.data || {};
      if (d.cv) { it = Intro(d.cv, d.bmp, d); if (d.hold) self.postMessage('ready'); else it.run(fin); }
      else if (d.go != null && it) it.run(fin, d.go);
      else if (d.resize && it) it.layout(d.resize);
    };
  } else {
    window.RCIntro = function (cv, bmp, opt, done) { var it2 = Intro(cv, bmp, opt); if (done) it2.run(done); return it2; };
  }
})();

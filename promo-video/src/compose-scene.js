/* Покадровая композиция 16:9. Сайт снят целиком (1600×900 CSS, ×3), «камера» — центр и зум в координатах страницы,
   цели камеры — реальные положения блоков сайта (META[сцена].focus[кадр][селектор]). Всё зависит только от t. */
(() => {
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const easeIn = k => Math.pow(clamp(k, 0, 1), 3);
  const easeIO = k => { k = clamp(k, 0, 1); return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  const back = k => { k = clamp(k, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const FPS = 30, VW = 1600, VH = 900, K = 1920 / VW; // 1 CSS-пиксель сайта = 1,2 пикселя кадра при зуме 1

  // камера: {cx, cy, z}. fit — показать прямоугольник целиком (с полями), part — часть прямоугольника по долям
  const FULL = { cx: VW / 2, cy: VH / 2, z: 1 };
  const R = (k, sel, f) => { const fo = window.META[k].focus || {}, keys = Object.keys(fo).map(Number).sort((a, b) => a - b);
    const fr = f == null ? keys[0] : keys.reduce((b, x) => Math.abs(x - f) < Math.abs(b - f) ? x : b, keys[0]); return fo[fr] && fo[fr][sel]; };
  // объект держим в верхних 80% кадра — внизу подпись
const fit = (r, pad = 40, zmax = 2.6) => { if (!r) return FULL; const z = clamp(Math.min(VW / (r.w + pad * 2), VH * .8 / (r.h + pad * 2)), 1, zmax); return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 + VH * .1 / z, z }; };
  const part = (r, x0, x1, y0 = 0, y1 = 1) => r && { x: r.x + r.w * x0, y: r.y + r.h * y0, w: r.w * (x1 - x0), h: r.h * (y1 - y0) };
  const zoomAt = (c, z) => ({ cx: c.cx, cy: c.cy, z });
  // ключи камеры: [время сцены, камера]; между ключами — плавно
  const CAMS = {
    catalog: k => [[0, zoomAt(FULL, 1)], [.9, fit(R(k, '.cs-block'), 30)], [2.2, fit(part(R(k, '.cs-block'), .45, 1, .1, 1), 20)]],
    open: k => {
      const rv = (window.META.open.reveal || 158) / FPS, rl = R(k, '#rl'), fr = R(k, '.rl-framed'), c = fit(rl, 0);
      return [[0, zoomAt(FULL, 1.02)], [.7, fit(fr, 20)], [1.5, zoomAt(fit(rl, 10), 1.75)], [3.4, zoomAt(c, 2.25)], [rv - .1, zoomAt(c, 2.45)],
        [rv + .55, zoomAt(c, 2.0)], [rv + 1.1, fit(fr, 10)], [7, zoomAt(fit(fr, 10), 1.32)]];
    },
    upgrade: k => [[0, fit(R(k, '.upg-main'), 30)], [.55, fit(R(k, '#wheel'), 60)], [1.35, fit(R(k, '#wheel'), 30)], [1.75, fit(R(k, '.upg-main'), 10)], [2.5, fit(R(k, '.upg-main'), 0)]],
    contract: k => [[0, fit(R(k, '#dosDesk'), 20)], [.7, fit(part(R(k, '#dosDesk'), 0, .74, 0, .62), 20)], [2, fit(part(R(k, '#dosDesk'), .02, .6, .02, .55), 10)]],
    withdraw: k => { const toast = R(k, '.toast', 89), modal = { x: 560, y: 235, w: 480, h: 430 };
      return [[0, zoomAt(FULL, 1)], [.35, fit(modal, 30)], [1.2, fit(modal, 20)], [1.5, zoomAt(FULL, 1.05)], [1.85, fit(toast, 40)], [2.2, fit(toast, 30)]]; },
    tournaments: k => [[0, fit(R(k, '.trn-hero'), 30)], [1.6, fit(part(R(k, '.trn-hero'), 0, .62, 0, 1), 20)]],
  };
  const camAt = (keys, lt) => {
    let i = 0; while (i < keys.length - 1 && lt > keys[i + 1][0]) i++;
    if (i >= keys.length - 1) return keys[keys.length - 1][1];
    const [t0, a] = keys[i], [t1, b] = keys[i + 1], k = easeIO(seg(lt, t0, t1));
    const z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)); // зум — по логарифму, ощущается ровно
    return { cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), z };
  };
  const SC = Object.entries(window.CFG.SCENES).map(([k, [a, b]]) => ({ k, a, b }));
  const frameUrl = (k, f) => `/frames/${k}/${String(f).padStart(4, '0')}.jpg`;
  const MAP = { upgrade: lt => (window.META.upgrade.from || 0) + lt * FPS * (window.META.upgrade.speed || 1) };

  // золотая пыль
  const cv = $('#dust'), x = cv.getContext('2d');
  let seed = 11; const Rn = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const parts = Array.from({ length: 110 }, () => { const z = Rn() < .55 ? 0 : Rn() < .8 ? 1 : 2, e = Rn() < .5 ? Rn() * .22 : 1 - Rn() * .22;
    return { z, x: Rn() < .3 ? Rn() : e, y: Rn(), sp: [16, 30, 52][z] * (.7 + Rn() * .6), ph: Rn() * 6.28, tw: .6 + Rn() * 1.6, sz: [2.2, 4.2, 40][z] * (.7 + Rn() * .7), a: [.7, .85, .26][z] * (.6 + Rn() * .4), v: Rn() < .12 }; });
  const spr = (r, g, b, soft) => { const c = document.createElement('canvas'); c.width = c.height = 64; const q = c.getContext('2d'), gr = q.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (soft) { gr.addColorStop(0, `rgba(${r},${g},${b},.22)`); gr.addColorStop(.62, `rgba(${r},${g},${b},.26)`); gr.addColorStop(.82, `rgba(${r},${g},${b},.4)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); }
    else { gr.addColorStop(0, 'rgba(255,252,236,1)'); gr.addColorStop(.1, `rgba(${r},${g},${b},.95)`); gr.addColorStop(.24, `rgba(${r},${g},${b},.32)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); }
    q.fillStyle = gr; q.fillRect(0, 0, 64, 64); return c; };
  const SG = spr(246, 198, 96), SV = spr(176, 140, 255), BG = spr(232, 176, 80, 1), BV = spr(150, 110, 230, 1);
  function dust(t, boost, amount) {
    x.clearRect(0, 0, 1920, 1080); x.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const yy = (((p.y * 1180 - t * p.sp * (1 + boost * 3)) % 1180) + 1180) % 1180 - 50, xx = p.x * 1920 + Math.sin(t * .4 + p.ph) * 14;
      x.globalAlpha = clamp(p.a * (.55 + .45 * Math.sin(t * p.tw + p.ph)) * (1 + boost) * amount, 0, 1);
      const s = p.z === 2 ? p.sz : p.sz * 6; x.drawImage(p.z === 2 ? (p.v ? BV : BG) : (p.v ? SV : SG), xx - s / 2, yy - s / 2, s, s);
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }
  function setCap(text, kin, kout) {
    const c = $('#cap'), tt = $('#capT'); if (tt.textContent !== text) tt.textContent = text;
    const o = text ? clamp(easeOut(kin) - easeIn(kout), 0, 1) : 0;
    c.style.opacity = o; $('#capBand').style.opacity = o;
    c.style.transform = `translateX(${(1 - easeOut(kin)) * -60 + easeIn(kout) * -40}px)`;
  }

  window.renderFrame = async t => {
    const cur = SC.find(s => t >= s.a && t < s.b) || SC[SC.length - 1], lt = t - cur.a, len = cur.b - cur.a;
    const hk = cur.k === 'hook', ct = cur.k === 'cta';
    $('#hook').style.display = hk ? 'block' : 'none'; $('#cta').style.display = ct ? 'block' : 'none'; $('#view').style.display = hk || ct ? 'none' : 'block';
    $('#bg').style.transform = `scale(${1.04 + .02 * Math.sin(t * .35)}) translate(${Math.sin(t * .2) * 12}px, ${Math.cos(t * .17) * 10}px)`;
    // склейки: световая полоса
    const near = SC.reduce((m, s) => Math.min(m, Math.abs(t - s.a)), 9), st = $('#streak');
    st.style.opacity = near < .15 && t > .5 ? (1 - near / .15) * .9 : 0; st.style.transform = `translateX(${((t * 6000) % 2600) - 1300}px) skewX(-14deg)`;
    let fl = 0, boost = 0, dustAmt = .45;
    if (hk) {
      const imp = 1.0, he = cur.b, hc = $('#hookCase');
      const push = t < imp ? lerp(1.9, 2.5, easeIn(t / imp)) : lerp(1.0, .7, easeOut(seg(t, imp, imp + .7)));
      hc.style.transform = `translate(-50%, -50%) translate(0, ${t < imp ? lerp(180, 60, t / imp) : lerp(40, 260, easeOut(seg(t, imp, imp + .7)))}px) scale(${push}) rotate(${t < imp ? lerp(-6, 2, t / imp) : 0}deg)`;
      hc.style.opacity = t < imp ? 1 : lerp(1, .22, seg(t, imp, imp + .5)) * (1 - seg(t, he - .18, he));
      hc.querySelector('.sh').style.backgroundPosition = `${lerp(150, -60, seg(t, .1, .9))}% 0`;
      const lk = seg(t, imp, imp + .42), lg = $('#hookLogo'); lg.style.width = '760px'; lg.style.top = '430px';
      lg.style.transform = `translate(-50%, -50%) scale(${t < imp ? 0 : lerp(1.9, 1, back(lk)) * (1 + seg(t, he - .2, he) * .4)})`; lg.style.opacity = t < imp ? 0 : Math.min(1, lk * 3) * (1 - seg(t, he - .15, he));
      const r1 = $('#ring1'), rk = seg(t, imp, imp + .55); r1.style.top = '430px'; r1.style.width = r1.style.height = lerp(200, 1700, easeOut(rk)) + 'px'; r1.style.opacity = t < imp ? 0 : (1 - rk) * .9; r1.style.borderWidth = lerp(10, 1, rk) + 'px';
      const tx = $('#hookTxt'), tk = seg(t, 1.15, 1.4); tx.style.opacity = easeOut(tk) * (1 - seg(t, he - .15, he)); tx.style.transform = `translateY(${(1 - easeOut(tk)) * 30}px)`;
      fl = t >= imp ? Math.max(0, 1 - (t - imp) / .3) : 0; boost = t < imp ? t / imp * .6 : Math.max(0, .9 - (t - imp)); dustAmt = 1;
      setCap('', 0, 0);
    } else if (ct) {
      const a = cur.a, lk = seg(t, a + .05, a + .5), lg = $('#ctaLogo'); lg.style.width = '640px'; lg.style.top = '330px';
      lg.style.transform = `translate(-50%, -50%) scale(${lerp(1.7, 1, back(lk)) * (1 + .015 * Math.sin((t - a) * 2.2))})`; lg.style.opacity = Math.min(1, lk * 3);
      const r2 = $('#ring2'), rk = seg(t, a + .05, a + .65); r2.style.top = '330px'; r2.style.width = r2.style.height = lerp(240, 1800, easeOut(rk)) + 'px'; r2.style.opacity = (1 - rk) * .85; r2.style.borderWidth = lerp(10, 1, rk) + 'px';
      $('#ctaHalo').style.opacity = .7 + lk * .2 + .1 * Math.sin((t - a) * 1.6);
      const tk = easeOut(seg(t, a + .4, a + .85)), uk = easeOut(seg(t, a + .7, a + 1.15));
      $('#ctaTitle').style.opacity = tk; $('#ctaTitle').style.transform = `translateY(${(1 - tk) * 50}px)`;
      $('#ctaUrl').style.opacity = uk; $('#ctaUrl').style.transform = `translateX(-50%) translateY(${(1 - uk) * 40}px) scale(${lerp(.92, 1, uk)})`;
      fl = t > a + .05 ? Math.max(0, 1 - (t - a - .05) / .35) : 0; boost = Math.max(0, .7 - (t - a)) + .15; dustAmt = 1;
      setCap('', 0, 0);
    } else {
      const M = window.META[cur.k], f = clamp(Math.round((MAP[cur.k] || (l => l * FPS))(lt)), 0, M.frames - 1), url = frameUrl(cur.k, f), img = $('#shot');
      if (img.dataset.u !== url) { img.src = url; img.dataset.u = url; }
      const c = camAt(CAMS[cur.k](cur.k), lt);
      // склейка: новая сцена «влетает» из лёгкого наезда с размытием, старая уходит наездом
      const ki = easeOut(seg(lt, 0, .3)), ko = easeIn(seg(lt, len - .2, len));
      const z = c.z * (1 + (1 - ki) * .18 + ko * .22), cx = clamp(c.cx, VW / 2 / z, VW - VW / 2 / z), cy = clamp(c.cy, VH / 2 / z, VH - VH / 2 / z);
      img.style.transform = `translate(${960 - cx * K * z}px, ${540 - cy * K * z}px) scale(${K * z / 3})`; // кадр съёмки ×3
      const v = $('#view'), bl = (1 - ki) * 12 + ko * 14; v.style.filter = bl > .3 ? `blur(${bl.toFixed(1)}px)` : 'none'; v.style.opacity = clamp(Math.min(ki * 1.5, 1 - ko * .6), 0, 1);
      const capEnd = cur.k === 'withdraw' ? 1.55 : len; // у вывода подпись уходит, когда камера едет к уведомлению
      setCap(window.CFG.CAPTIONS[cur.k] || '', seg(lt, .25, .55), seg(lt, capEnd - .25, capEnd - .03));
      if (cur.k === 'open') { const rv = (M.reveal || 158) / FPS; fl = lt >= rv ? Math.max(0, 1 - (lt - rv) / .45) * .7 : 0; boost = lt > rv ? Math.max(0, .8 - (lt - rv)) : 0; }
      dustAmt = .35;
    }
    $('#flash').style.opacity = fl;
    dust(t, boost, dustAmt);
    await Promise.all([...document.images].filter(i => i.offsetParent !== null).map(i => i.complete && i.naturalWidth ? null : i.decode().catch(() => {})));
  };
  $('#ctaTitle').innerHTML = window.CFG.CTA.title.split('|').map((s, i) => i ? `<b>${s}</b>` : s).join('<br>');
  $('#ctaUrl').textContent = window.CFG.CTA.url;
})();

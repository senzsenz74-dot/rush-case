/* Покадровая композиция ролика 9:16. Всё зависит только от времени t (сек) — рендер повторяемый.
   window.META — размеры и число кадров снятых сцен (из .frames/<сцена>/meta.json), window.CFG — config.js */
(() => {
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const easeIn = k => Math.pow(clamp(k, 0, 1), 3);
  const easeIO = k => { k = clamp(k, 0, 1); return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  const back = k => { k = clamp(k, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const FPS = 30;

  // --- сцены с панелями: какой кадр съёмки показывать и как двигается «камера»
  // map(lt) → номер кадра съёмки; cam(u, lt, len) → {x, y, w, ry, rx, rz, s}
  const PANELS = {
    catalog: { map: lt => lt * FPS, cam: (u) => ({ x: lerp(520, -560, easeIO(u)), y: 1020, w: 2750, ry: lerp(16, -12, easeIO(u)), rx: 5, rz: 0, s: lerp(1, 1.06, u) }) },
    open: { map: lt => lt * FPS, cam: (u, lt) => {
      const rv = (window.META.open.reveal || 140) / FPS;            // момент результата
      const push = easeOut(seg(lt, rv - .15, rv + .7));
      const shake = lt > rv - .05 && lt < rv + .35 ? Math.sin(lt * 90) * 7 * (1 - seg(lt, rv, rv + .35)) : 0;
      return { x: shake, y: 1110 + lerp(0, 20, push), w: lerp(2500, 2800, push) * lerp(1, 1.04, seg(lt, .4, rv)), ry: lerp(12, 0, easeOut(seg(lt, 0, 1.1))), rx: lerp(6, 2, easeOut(seg(lt, 0, 1.1))), rz: 0, s: 1 };
    } },
    upgrade: { map: lt => (window.META.upgrade.from || 0) + lt * FPS * (window.META.upgrade.speed || 1), cam: (u) => ({ x: lerp(120, -40, easeIO(u)), y: 1020, w: 2650, ry: lerp(-14, -4, easeOut(u)), rx: 4, rz: 0, s: lerp(1, 1.07, u) }) },
    contract: { map: lt => lt * FPS, cam: (u) => ({ x: 0, y: 1250, w: 1450, ry: lerp(14, 4, easeOut(u)), rx: lerp(10, 4, easeOut(u)), rz: -1.5, s: lerp(1, 1.06, u) }) },
    withdraw: { map: lt => lt * FPS, cam: (u, lt) => { const k = easeIO(seg(lt, 1.3, 1.65)), w = lerp(2300, 2600, k), q = w / 1600; return { x: lerp(0, -590 * q, k), y: lerp(1150, 1080 - 445 * q, k), w, ry: lerp(-8, -3, u), rx: 3, rz: 0, s: 1 }; } },
    tournaments: { map: lt => lt * FPS, cam: (u) => ({ x: lerp(-260, 220, easeIO(u)), y: 1020, w: 2500, ry: lerp(-12, 8, easeIO(u)), rx: 5, rz: 0, s: lerp(1, 1.05, u) }) },
  };
  const SC = Object.entries(window.CFG.SCENES).map(([k, [a, b]]) => ({ k, a, b }));
  const IN = .24, OUT = .2;

  // --- золотая пыль (как на сайте: три слоя глубины, больше по краям)
  const cv = $('#dust'), x = cv.getContext('2d');
  let seed = 11; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const parts = Array.from({ length: 120 }, () => { const z = R() < .55 ? 0 : R() < .8 ? 1 : 2, e = R() < .5 ? R() * .3 : 1 - R() * .3;
    return { z, x: R() < .35 ? R() : e, y: R(), sp: [16, 30, 52][z] * (.7 + R() * .6), ph: R() * 6.28, tw: .6 + R() * 1.6, sz: [2.2, 4.2, 40][z] * (.7 + R() * .7), a: [.75, .9, .3][z] * (.6 + R() * .4), v: R() < .12 }; });
  const spr = (r, g, b, soft) => { const c = document.createElement('canvas'); c.width = c.height = 64; const q = c.getContext('2d'), gr = q.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (soft) { gr.addColorStop(0, `rgba(${r},${g},${b},.22)`); gr.addColorStop(.62, `rgba(${r},${g},${b},.26)`); gr.addColorStop(.82, `rgba(${r},${g},${b},.4)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); }
    else { gr.addColorStop(0, 'rgba(255,252,236,1)'); gr.addColorStop(.1, `rgba(${r},${g},${b},.95)`); gr.addColorStop(.24, `rgba(${r},${g},${b},.32)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); }
    q.fillStyle = gr; q.fillRect(0, 0, 64, 64); return c; };
  const SG = spr(246, 198, 96), SV = spr(176, 140, 255), BG = spr(232, 176, 80, 1), BV = spr(150, 110, 230, 1);
  function dust(t, boost) {
    x.clearRect(0, 0, 1080, 1920); x.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const yy = (((p.y * 2000 - t * p.sp * (1 + boost * 3)) % 2000) + 2000) % 2000 - 40, xx = p.x * 1080 + Math.sin(t * .4 + p.ph) * 14;
      const a = p.a * (.55 + .45 * Math.sin(t * p.tw + p.ph)) * (1 + boost);
      const s = p.z === 2 ? p.sz : p.sz * 6; x.globalAlpha = clamp(a, 0, 1);
      x.drawImage(p.z === 2 ? (p.v ? BV : BG) : (p.v ? SV : SG), xx - s / 2, yy - s / 2, s, s);
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }

  // --- панель
  const frameUrl = (k, f) => `/frames/${k}/${String(f).padStart(4, '0')}.png`;
  function panel(el, k, lt, len, state) {
    const P = PANELS[k], M = window.META[k];
    const f = clamp(Math.round(P.map(lt)), 0, M.frames - 1), url = frameUrl(k, f);
    const main = el.querySelector('img.main'), rf = el.querySelector('.rf img');
    if (main.dataset.u !== url) { main.src = url; rf.src = url; main.dataset.u = url; }
    const c = P.cam(clamp(lt / len, 0, 1), lt, len), w = c.w, h = w * M.h / M.w;
    // вход: прилёт справа из глубины с размытием; выход: улёт влево
    const ki = easeOut(seg(lt, 0, IN)), ko = easeIn(seg(lt, len - OUT, len));
    const tx = c.x + (1 - ki) * 520 - ko * 620, tz = (1 - ki) * -700 + ko * -500, op = Math.min(ki * 1.2, 1 - ko * .9), bl = (1 - ki) * 14 + ko * 16;
    el.style.width = w + 'px'; el.style.height = h + 'px';
    el.style.transform = `translate(${540 - w / 2 + tx}px, ${c.y - h / 2}px) translateZ(${tz}px) rotateX(${c.rx}deg) rotateY(${c.ry + (1 - ki) * -22 + ko * 22}deg) rotateZ(${c.rz}deg) scale(${c.s})`;
    el.style.opacity = clamp(op, 0, 1); el.style.filter = bl > .3 ? `blur(${bl.toFixed(1)}px)` : 'none';
    el.style.display = 'block';
    el.querySelector('.gl').style.backgroundPosition = `${lerp(130, -40, seg(lt, .2, 1.4))}% 0`;
    return url;
  }

  window.renderFrame = async t => {
    const cur = SC.find(s => t >= s.a && t < s.b) || SC[SC.length - 1], lt = t - cur.a, len = cur.b - cur.a;
    const pA = $('#pA'); $('#pB').style.display = 'none';
    // фон чуть дышит и смещается
    $('#bg').style.transform = `scale(${1.04 + .02 * Math.sin(t * .35)}) translate(${Math.sin(t * .2) * 12}px, ${Math.cos(t * .17) * 10}px)`;
    let boost = 0, ambUrl = '';
    // переходы между сценами: световая полоса и вспышка на склейке
    const near = SC.reduce((m, s) => Math.min(m, Math.abs(t - s.a)), 9);
    const st = $('#streak'); st.style.opacity = near < .16 && t > .5 ? (1 - near / .16) * .85 : 0; st.style.transform = `rotate(-8deg) translateX(${(t * 3000) % 600 - 300}px)`;
    // --- хук
    const hk = cur.k === 'hook', ct = cur.k === 'cta';
    $('#hook').style.display = hk ? 'block' : 'none'; $('#cta').style.display = ct ? 'block' : 'none';
    let fl = 0;
    if (hk) {
      const hc = $('#hookCase'), imp = 1.0, he = window.CFG.SCENES.hook[1];
      const push = t < imp ? lerp(2.15, 2.75, easeIn(t / imp)) : lerp(1.15, .78, easeOut(seg(t, imp, imp + .7)));
      const yy = t < imp ? lerp(1180, 1020, t / imp) : lerp(980, 1300, easeOut(seg(t, imp, imp + .7)));
      hc.style.transform = `translate(-50%, -50%) translate(0, ${yy - 960}px) scale(${push}) rotate(${t < imp ? lerp(-6, 2, t / imp) : 0}deg)`;
      hc.style.opacity = t < imp ? 1 : lerp(1, .55, seg(t, imp, imp + .6)) * (1 - seg(t, he - .18, he));
      hc.querySelector('.sh').style.backgroundPosition = `${lerp(150, -60, seg(t, .1, .9))}% 0`;
      const lk = seg(t, imp, imp + .42), lg = $('#hookLogo');
      lg.style.width = '780px'; lg.style.top = '760px';
      lg.style.transform = `translate(-50%, -50%) scale(${t < imp ? 0 : lerp(1.9, 1, back(lk)) * (1 + seg(t, he - .2, he) * .4)})`; lg.style.opacity = t < imp ? 0 : Math.min(1, lk * 3) * (1 - seg(t, he - .15, he));
      const r1 = $('#ring1'), rk = seg(t, imp, imp + .55); r1.style.top = '760px'; r1.style.width = r1.style.height = lerp(200, 1500, easeOut(rk)) + 'px'; r1.style.opacity = t < imp ? 0 : (1 - rk) * .9; r1.style.borderWidth = lerp(10, 1, rk) + 'px';
      fl = t >= imp ? Math.max(0, 1 - (t - imp) / .3) : 0;
      boost = t < imp ? t / imp * .6 : Math.max(0, .9 - (t - imp));
      // подпись хука под логотипом
      setCap(t > 1.15 ? 'Готов к открытию?' : '', seg(t, 1.15, 1.4), seg(t, he - .15, he), 1180);
    } else if (ct) {
      const a = cur.a, lk = seg(t, a + .05, a + .5), lg = $('#ctaLogo');
      lg.style.width = '760px'; lg.style.top = '640px';
      lg.style.transform = `translate(-50%, -50%) scale(${lerp(1.7, 1, back(lk)) * (1 + .015 * Math.sin((t - a) * 2.2))})`; lg.style.opacity = Math.min(1, lk * 3);
      const r2 = $('#ring2'), rk = seg(t, a + .05, a + .65); r2.style.top = '640px'; r2.style.width = r2.style.height = lerp(240, 1600, easeOut(rk)) + 'px'; r2.style.opacity = (1 - rk) * .85; r2.style.borderWidth = lerp(10, 1, rk) + 'px';
      $('#ctaHalo').style.opacity = .6 + .4 * Math.sin((t - a) * 1.6) * .5 + lk * .2;
      const tk = easeOut(seg(t, a + .4, a + .85)), uk = easeOut(seg(t, a + .7, a + 1.15));
      const ti = $('#ctaTitle'); ti.style.opacity = tk; ti.style.transform = `translateY(${(1 - tk) * 50}px)`;
      const ur = $('#ctaUrl'); ur.style.opacity = uk; ur.style.transform = `translateX(-50%) translateY(${(1 - uk) * 40}px) scale(${lerp(.92, 1, uk)})`;
      fl = Math.max(0, 1 - (t - a - .05) / .35) * (t > a + .05 ? 1 : 0);
      boost = Math.max(0, .7 - (t - a)) + .15;
      setCap('', 0, 0);
    } else {
      ambUrl = panel(pA, cur.k, lt, len);
      setCap(window.CFG.CAPTIONS[cur.k] || '', seg(lt, .12, .4), seg(lt, len - .22, len - .02));
      // вспышка на результате кейса
      if (cur.k === 'open') { const rv = (window.META.open.reveal || 140) / FPS; fl = lt >= rv ? Math.max(0, 1 - (lt - rv) / .45) * .8 : 0; boost = lt > rv ? Math.max(0, .8 - (lt - rv)) : seg(lt, 1, rv) * .25; }
    }
    $('#flash').style.opacity = fl;
    $('#stage').style.display = hk || ct ? 'none' : 'block';
    const amb = $('#amb'); amb.style.display = ambUrl ? 'block' : 'none'; if (ambUrl && amb.firstElementChild.dataset.u !== ambUrl) { amb.firstElementChild.src = ambUrl; amb.firstElementChild.dataset.u = ambUrl; }
    dust(t, boost);
    // ждём загрузки всех картинок кадра
    await Promise.all([...document.images].filter(i => i.offsetParent !== null || i.closest('.pn')).map(i => i.complete && i.naturalWidth ? null : i.decode().catch(() => {})));
  };
  function setCap(text, kin, kout, top = 280) {
    const c = $('#cap'), tt = $('#capT');
    if (tt.dataset.t !== text) { const [a, b] = text.split('|'); tt.innerHTML = b ? a + '<small>' + b + '</small>' : a; tt.dataset.t = text; }
    c.style.top = top + 'px';
    c.style.opacity = text ? clamp(easeOut(kin) - easeIn(kout), 0, 1) : 0;
    c.style.transform = `translateY(${(1 - easeOut(kin)) * 40 - easeIn(kout) * 30}px)`;
    c.style.filter = kin < 1 ? `blur(${(1 - easeOut(kin)) * 10}px)` : kout > 0 ? `blur(${kout * 10}px)` : 'none';
  }
  // тексты финала из настроек
  $('#ctaTitle').innerHTML = window.CFG.CTA.title.split('|').map((s, i) => i ? `<b>${s}</b>` : s).join('<br>');
  $('#ctaUrl').textContent = window.CFG.CTA.url;
  $('#ctaBtn').style.display = 'none';
})();

/* ===== НОВОГОДНИЙ ИВЕНТ (временно) =====
   Работает до 19.01.2027 23:59 по Москве, потом сам выключается:
   класс ny-on не ставится и css/newyear.css даже не скачивается.
   Убрать насовсем: удалить js/newyear.js, css/newyear.css и строку подключения в index.html.
   Проверка в браузере: ?ny=1 — включить принудительно, ?ny=0 — выключить. */
(function () {
  var END = Date.UTC(2027, 0, 19, 20, 59, 59); // 19.01.2027 23:59:59 МСК (UTC+3)
  var q = location.search;
  var force = /[?&]ny=1/.test(q), off = /[?&]ny=0/.test(q);
  if (off || (!force && Date.now() > END)) return;
  window.NY_ON = true;
  // версия файлов (как у самого скрипта в index.html) — и к картинкам ивента, иначе браузер держит старые после пересборки
  var v = (document.currentScript && document.currentScript.src.split('?v=')[1]) || '', qv = v ? '?v=' + v : '';
  // фоны главного экрана на время ивента (владелец 25.11, архив «бич.rar»): только новогодние, первый — по умолчанию (Cache, владелец 25.11).
  // app.js берёт этот список вместо MN_BG; выбор игрока из обычных фонов не стирается и вернётся после ивента.
  var B = 'assets/ny/bg/';
  window.NY_BG = [
    { id: 'ny_cache', n: 'Cache', img: B + 'cache.webp' + qv },
    { id: 'ny_nuke', n: 'Nuke', img: B + 'nuke.webp' + qv },
    { id: 'ny_ancient', n: 'Ancient', img: B + 'ancient.webp' + qv },
    { id: 'ny_ancient2', n: 'Ancient 2', img: B + 'ancient2.webp' + qv },
    { id: 'ny_ancient3', n: 'Ancient 3', img: B + 'ancient3.webp' + qv },
    { id: 'ny_mirage', n: 'Mirage', img: B + 'mirage.webp' + qv },
    { id: 'ny_inferno', n: 'Inferno', img: B + 'inferno.webp' + qv },
    { id: 'ny_overpass', n: 'Overpass', img: B + 'overpass.webp' + qv },
    { id: 'ny_vertigo', n: 'Vertigo', img: B + 'vertigo.webp' + qv },
    { id: 'ny_cbble', n: 'Cobblestone', img: B + 'cbble.webp' + qv },
    { id: 'ny_train', n: 'Train', img: B + 'train.webp' + qv },
    { id: 'ny_office', n: 'Office', img: B + 'office.webp' + qv },
    { id: 'ny_office2', n: 'Office 2', img: B + 'office2.webp' + qv },
    { id: 'ny_rush', n: 'Rush', img: B + 'rush.webp' + qv }
  ];
  document.documentElement.classList.add('ny-on');

  /* ---------- лёд на карточках кейсов тает там, где ведёшь мышкой (владелец 25.11) ----------
     У карточки (.ix) лёд — .ix-ice (css/newyear.css). Как только мышь пошла по карточке, заводим маску льда на маленьком холсте
     (80 px в ширину, в пропорциях карточки): сначала — ровно как маска из CSS, потом мягкая «тёплая» кисть стирает лёд по следу мыши
     (неровно: 3 пятна со сдвигом). Маска ставится в style.mask-image (data:png, не чаще кадра). Из протаявших мест вниз стекают
     капли — отдельный холст .ix-drip. Мышь ушла — через 0,9 с лёд за ~3 с намерзает обратно от краёв к центру, потом маска из style убирается. */
  (function () {
    var MW = 80, S = new WeakMap(), act = [], cur = null, raf = 0, last = 0;
    var cl = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
    function setMask(ice, url) {
      var st = ice.style;
      if (url) { st.webkitMaskImage = st.maskImage = 'url(' + url + ')'; st.webkitMaskSize = st.maskSize = '100% 100%'; st.webkitMaskRepeat = st.maskRepeat = 'no-repeat'; }
      else ['webkitMaskImage', 'maskImage', 'webkitMaskSize', 'maskSize', 'webkitMaskRepeat', 'maskRepeat'].forEach(function (k) { st[k] = ''; });
    }
    function state(ice) {
      var s = S.get(ice); if (s) return s;
      var r = ice.getBoundingClientRect(), W = r.width || 1, H = r.height || 1, MH = Math.max(8, Math.round(MW * H / W));
      var cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
      var c = cv.getContext('2d'), n = MW * MH, base = new Float32Array(n), dist = new Float32Array(n), x, y, i;
      // исходный лёд — та же маска, что в CSS: центр (50%, 42%) чуть прозрачнее, низ с 70% до 79% высоты слабеет до 0,42
      for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) {
        i = y * MW + x; var u = (x + .5) / MW, v = (y + .5) / MH;
        var lin = v < .7 ? 1 : v < .79 ? 1 - .58 * (v - .7) / .09 : .42;
        var dn = Math.sqrt(Math.pow((u - .5) * W / (1.35 * W), 2) + Math.pow((v - .42) * H / (1.2 * H), 2));
        base[i] = lin * cl(dn / .16);
        dist[i] = Math.min(x, MW - 1 - x, y, MH - 1 - y) / (Math.min(MW, MH) / 2);
      }
      s = { ice: ice, cv: cv, c: c, MH: MH, base: base, dist: dist, drips: [], dc: null, d: null, lx: null, ly: null, leaveAt: 0, p: 0, dirty: false, melted: false };
      reset(s); S.set(ice, s); return s;
    }
    function reset(s) {
      var img = s.c.createImageData(MW, s.MH), d = img.data;
      for (var i = 0; i < s.base.length; i++) d[i * 4 + 3] = Math.round(s.base[i] * 255);
      s.c.putImageData(img, 0, 0);
    }
    function wake(s) { if (act.indexOf(s) < 0) act.push(s); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
    // тёплая кисть: стираем лёд в точке (px, py — в px карточки), три мягких пятна со сдвигом — край протаявшего неровный
    function melt(s, px, py, W, H) {
      var c = s.c, kx = MW / W, ky = s.MH / H, R = Math.max(14, W * .1);
      c.globalCompositeOperation = 'destination-out';
      for (var k = 0; k < 3; k++) {
        var ox = (Math.random() - .5) * R * .7, oy = (Math.random() - .5) * R * .7, rr = R * (.55 + Math.random() * .45);
        c.save(); c.translate((px + ox) * kx, (py + oy) * ky); c.scale(kx, ky);
        var g = c.createRadialGradient(0, 0, 0, 0, 0, rr); g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(.6, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, rr, 0, 6.2832); c.fill(); c.restore();
      }
      c.globalCompositeOperation = 'source-over';
      s.dirty = s.melted = true;
      if (s.drips.length < 10 && Math.random() < .07) s.drips.push({ x: px + (Math.random() - .5) * R, y: py + R * .45, v: 12 + Math.random() * 22, len: 0, w: 1.2 + Math.random() * 1.3 });
    }
    function drips(s, dt, W, H) {
      if (!s.dc) {
        s.dc = document.createElement('canvas'); s.dc.className = 'ix-drip'; s.dc.setAttribute('aria-hidden', 'true');
        s.ice.parentNode.appendChild(s.dc); s.d = s.dc.getContext('2d');
      }
      var k = Math.min(window.devicePixelRatio || 1, 2), d = s.d;
      if (s.dc.width !== Math.round(W * k)) { s.dc.width = Math.round(W * k); s.dc.height = Math.round(H * k); }
      d.setTransform(k, 0, 0, k, 0, 0); d.clearRect(0, 0, W, H);
      for (var i = s.drips.length - 1; i >= 0; i--) {
        var q = s.drips[i];
        q.v = Math.min(q.v + 70 * dt, 150); q.y += q.v * dt; q.len = Math.min(q.len + q.v * dt * .6, 18 + q.w * 6);
        if (q.y - q.len > H) { s.drips.splice(i, 1); continue; }
        var g = d.createLinearGradient(0, q.y - q.len, 0, q.y);
        g.addColorStop(0, 'rgba(225,243,255,0)'); g.addColorStop(1, 'rgba(232,246,255,.55)');
        d.strokeStyle = g; d.lineWidth = q.w; d.lineCap = 'round'; d.beginPath(); d.moveTo(q.x, q.y - q.len); d.lineTo(q.x, q.y); d.stroke();
        d.fillStyle = 'rgba(240,250,255,.85)'; d.beginPath(); d.arc(q.x, q.y, q.w * .95, 0, 6.2832); d.fill();
        d.fillStyle = 'rgba(255,255,255,.95)'; d.beginPath(); d.arc(q.x - q.w * .3, q.y - q.w * .3, q.w * .35, 0, 6.2832); d.fill();
      }
    }
    function tick(now) {
      raf = 0; var dt = Math.min(.05, (now - last) / 1000); last = now;
      for (var j = act.length - 1; j >= 0; j--) {
        var s = act[j], ice = s.ice;
        if (!ice.isConnected) { act.splice(j, 1); continue; }
        var r = ice.getBoundingClientRect(), work = false;
        // намерзание обратно: от краёв к центру, только добавляем лёд (не больше исходного)
        if (s.melted && s.leaveAt && now - s.leaveAt > 900) {
          s.p += dt / 3;
          var img = s.c.getImageData(0, 0, MW, s.MH), d = img.data, P = s.p * 1.35;
          for (var i = 0; i < s.base.length; i++) { var t = s.base[i] * cl((P - s.dist[i]) / .3) * 255; if (d[i * 4 + 3] < t) d[i * 4 + 3] = t; }
          s.c.putImageData(img, 0, 0); s.dirty = true;
          if (s.p >= 1) { reset(s); s.melted = false; s.dirty = false; s.p = 0; s.leaveAt = 0; setMask(ice, null); }
        }
        if (s.dirty) { setMask(ice, s.cv.toDataURL()); s.dirty = false; }
        if (s.drips.length || (s.dc && s.dc.width)) { drips(s, dt, r.width, r.height); if (!s.drips.length && s.dc) { s.dc.width = 0; } }
        work = s.drips.length > 0 || (s.melted && !!s.leaveAt) || s === cur;
        if (!work) act.splice(j, 1);
      }
      if (act.length) raf = requestAnimationFrame(tick);
    }
    function leave() { if (cur) { cur.leaveAt = performance.now(); cur.lx = null; wake(cur); cur = null; } }
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var card = e.target && e.target.closest ? e.target.closest('.ix') : null, ice = card && card.querySelector('.ix-ice');
      if (!ice) return leave();
      var s = state(ice);
      if (cur !== s) { leave(); cur = s; s.leaveAt = 0; s.p = 0; s.lx = null; }
      var r = ice.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, W = r.width, H = r.height;
      if (s.lx == null) melt(s, x, y, W, H);
      else { // ведём кисть по прямой от прошлой точки — след сплошной даже при быстрой мыши
        var dx = x - s.lx, dy = y - s.ly, L = Math.sqrt(dx * dx + dy * dy), st = Math.max(5, W * .03), n = Math.ceil(L / st);
        for (var i = 1; i <= n; i++) melt(s, s.lx + dx * i / n, s.ly + dy * i / n, W, H);
      }
      s.lx = x; s.ly = y; wake(s);
    }, { passive: true });
    document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) leave(); });
  })();

  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'css/newyear.css' + (v ? '?v=' + v : '');
  document.head.appendChild(l);
})();

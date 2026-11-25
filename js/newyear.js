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
     Лёд — .ix-ice (css/newyear.css), он сам не меняется. Протаявшее место рисуем ПОВЕРХ льда: холст .ix-melt над картинкой карточки,
     в нём каждый кадр — подложка карточки, свечение наведения и сам кейс (с его текущим размером и тенью — как на странице),
     вырезанные по маске «где протаяло». Холст рисуется в тот же кадр, что и движение мыши, — без задержки
     (маска-картинкой в style запаздывала: таяло только когда мышь останавливалась, а пока водишь — лёд «вторым слоем»).
     Маска — маленький холст 80 px: тёплая кисть (3 мягких пятна) добавляет «протаявшее» по линии от прошлой точки мыши.
     Из протаявших мест стекают капли (.ix-drip). Мышь ушла — через 0,9 с за ~3 с лёд намерзает обратно от краёв к центру.
     Тает только картинка; низ с названием и ценой остаётся под тонким льдом. На телефоне (touch) не тает. */
  (function () {
    var MW = 80, S = new WeakMap(), act = [], cur = null, raf = 0, last = 0;
    var cl = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
    var rgb = function (s) { var m = String(s).match(/rgba?\([^)]*\)/g); return m && m.length > 1 ? m : ['#686969', '#9a9b9b']; };
    function state(card) {
      var s = S.get(card); if (s) return s;
      var box = card.querySelector('.ix-img'), img = box && (box.querySelector('img.ca-img') || box.querySelector('.case-art img'));
      if (!box || !img) return null;
      var r = box.getBoundingClientRect(), MH = Math.max(8, Math.round(MW * (r.height || 1) / (r.width || 1)));
      var mk = document.createElement('canvas'); mk.width = MW; mk.height = MH;
      var dist = new Float32Array(MW * MH), x, y;
      for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) dist[y * MW + x] = Math.min(x, MW - 1 - x, y, MH - 1 - y) / (Math.min(MW, MH) / 2);
      s = { card: card, box: box, img: img, mk: mk, m: mk.getContext('2d'), MH: MH, dist: dist, cv: null, c: null, dc: null, d: null, drips: [],
        bg: rgb(getComputedStyle(box).backgroundImage), ca: card.style.getPropertyValue('--ca') || '#fff', lx: null, ly: null, leaveAt: 0, p: 0, melted: false };
      S.set(card, s); return s;
    }
    function wake(s) { if (act.indexOf(s) < 0) act.push(s); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
    // тёплая кисть: (px, py) — в px картинки карточки
    function melt(s, px, py, W, H) {
      var m = s.m, kx = MW / W, ky = s.MH / H, R = Math.max(14, W * .1);
      for (var k = 0; k < 3; k++) {
        var ox = (Math.random() - .5) * R * .7, oy = (Math.random() - .5) * R * .7, rr = R * (.55 + Math.random() * .45);
        m.save(); m.translate((px + ox) * kx, (py + oy) * ky); m.scale(kx, ky);
        var g = m.createRadialGradient(0, 0, 0, 0, 0, rr); g.addColorStop(0, 'rgba(0,0,0,.8)'); g.addColorStop(.55, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        m.fillStyle = g; m.beginPath(); m.arc(0, 0, rr, 0, 6.2832); m.fill(); m.restore();
      }
      s.melted = true;
      if (s.drips.length < 10 && Math.random() < .07) s.drips.push({ x: px + (Math.random() - .5) * R, y: py + R * .45, v: 12 + Math.random() * 22, len: 0, w: 1.2 + Math.random() * 1.3 });
    }
    function canvas(s, cls, host) { var c = document.createElement('canvas'); c.className = cls; c.setAttribute('aria-hidden', 'true'); host.appendChild(c); return c; }
    function fit(c, W, H) { var k = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(W * k), h = Math.round(H * k); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return k; }
    // протаявшее: то, что под льдом, — чётко, только там, где маска
    function paint(s, W, H) {
      if (!s.cv) { s.cv = canvas(s, 'ix-melt', s.box); s.c = s.cv.getContext('2d'); }
      var c = s.c, k = fit(s.cv, W, H), br = s.box.getBoundingClientRect(), ir = s.img.getBoundingClientRect();
      c.setTransform(k, 0, 0, k, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, W, H);
      var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, s.bg[0]); g.addColorStop(1, s.bg[1]); c.fillStyle = g; c.fillRect(0, 0, W, H);
      var go = +getComputedStyle(s.box, '::before').opacity || 0;   // свечение цветом кейса при наведении (.ix:hover .ix-img::before)
      if (go > .01) {
        c.save(); c.globalAlpha = go * .5; c.translate(W / 2, H); c.scale(.75 * W, .6 * H);
        var rg = c.createRadialGradient(0, 0, 0, 0, 0, 1); rg.addColorStop(0, s.ca); rg.addColorStop(.72, 'rgba(0,0,0,0)');
        c.fillStyle = rg; c.beginPath(); c.arc(0, 0, 1, 0, 6.2832); c.fill(); c.restore();
      }
      if (s.img.complete && s.img.naturalWidth) {                   // кейс: object-fit: contain в своей рамке, с той же тенью, что сейчас на странице
        var nw = s.img.naturalWidth, nh = s.img.naturalHeight, q = Math.min(ir.width / nw, ir.height / nh), dw = nw * q, dh = nh * q;
        var f = getComputedStyle(s.img).filter; c.filter = f && f !== 'none' ? f : 'none';
        c.drawImage(s.img, ir.left - br.left + (ir.width - dw) / 2, ir.top - br.top + (ir.height - dh) / 2, dw, dh);
        c.filter = 'none';
      }
      c.globalCompositeOperation = 'destination-in'; c.imageSmoothingEnabled = true; c.drawImage(s.mk, 0, 0, W, H);
      c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(215,238,255,.06)'; c.fillRect(0, 0, W, H); // тонкая плёнка талой воды
      c.globalCompositeOperation = 'source-over';
    }
    function drips(s, dt, W, H) {
      if (!s.dc) { s.dc = canvas(s, 'ix-drip', s.box); s.d = s.dc.getContext('2d'); }
      var d = s.d, k = fit(s.dc, W, H);
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
        var s = act[j];
        if (!s.card.isConnected) { act.splice(j, 1); continue; }
        var r = s.box.getBoundingClientRect(), W = r.width, H = r.height;
        if (s.melted && s.leaveAt && now - s.leaveAt > 900) {    // намерзание: от краёв к центру протаявшее уменьшается
          s.p += dt / 3;
          var img = s.m.getImageData(0, 0, MW, s.MH), d = img.data, P = s.p * 1.35;
          for (var i = 0; i < s.dist.length; i++) { var t = (1 - cl((P - s.dist[i]) / .3)) * 255; if (d[i * 4 + 3] > t) d[i * 4 + 3] = t; }
          s.m.putImageData(img, 0, 0);
          if (s.p >= 1) { s.m.clearRect(0, 0, MW, s.MH); s.melted = false; s.p = 0; s.leaveAt = 0; }
        }
        if (s.melted) paint(s, W, H); else if (s.cv) { s.cv.remove(); s.cv = s.c = null; }
        if (s.drips.length) drips(s, dt, W, H); else if (s.dc) { s.dc.remove(); s.dc = s.d = null; }
        if (!s.drips.length && !(s.melted && s.leaveAt) && s !== cur) act.splice(j, 1);
      }
      if (act.length) raf = requestAnimationFrame(tick);
    }
    function leave() { if (cur) { cur.leaveAt = performance.now(); cur.lx = null; wake(cur); cur = null; } }
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var card = e.target && e.target.closest ? e.target.closest('.ix') : null, s = card && card.querySelector('.ix-ice') ? state(card) : null;
      if (!s) return leave();
      if (cur !== s) { leave(); cur = s; s.leaveAt = 0; s.p = 0; s.lx = null; }
      var r = s.box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, W = r.width, H = r.height;
      if (y > H + W * .04) { s.lx = null; return wake(s); }          // над названием и ценой — не тает
      if (s.lx == null) melt(s, x, y, W, H);
      else {                                                          // кисть по прямой от прошлой точки — след сплошной даже при быстрой мыши
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

/* RUSH CASE — заставка при открытии (раньше была встроена в index.html; вынесена 25.11 ради защиты CSP). Подключается сразу после #intro */
/* заставка при открытии сайта (рисует js/intro.js, 6 с; звук assets/intro.mp3 — tools/intro-sound.js).
   Только когда сайт открыли заново: при F5, «назад» и возврате в той же вкладке (вход через Steam, касса) её нет — сайт сразу.
   Звук — только если браузер разрешает его без нажатия и игрок не выключал звук на сайте; иначе звук даже не скачивается */
(function () {
  var el = document.getElementById('intro'); if (!el) return;
  var nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null, again = nav ? nav.type !== 'navigate' : false;
  try { if (sessionStorage.getItem('rc.intro')) again = true; sessionStorage.setItem('rc.intro', '1'); } catch (e) { /* */ }
  if (/[?&]intro\b/.test(location.search)) again = false; // адрес с ?intro — показать заставку ещё раз (для просмотра)
  if (again) { el.parentNode.removeChild(el); return; }
  var cv = el.firstChild, V = '202611100043', src = 'js/intro.js?v=' + V, ended = false, moved = false, actx = null, sound = null;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function end() {
    if (ended) return; ended = true; el.classList.add('out');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
  }
  // ждём, пока вкладку видно и телефон повёрнут горизонтально — иначе человек пропустит заставку
  var portrait = matchMedia('(orientation: portrait)'), phone = document.documentElement.classList.contains('phone');
  function visible(fn) {
    var ok = function () { return !document.hidden && !(phone && portrait.matches); };
    if (ok()) return fn();
    var h = function () {
      if (!ok()) return;
      document.removeEventListener('visibilitychange', h);
      if (portrait.removeEventListener) portrait.removeEventListener('change', h); else portrait.removeListener(h);
      fn();
    };
    document.addEventListener('visibilitychange', h);
    if (portrait.addEventListener) portrait.addEventListener('change', h); else portrait.addListener(h);
  }
  visible(function () { setTimeout(end, 15000); }); // страховка: если что-то сломалось, сайт всё равно откроется
  var stop = function (e) { e.preventDefault(); }; // страница под заставкой не прокручивается
  el.addEventListener('wheel', stop, { passive: false }); el.addEventListener('touchmove', stop, { passive: false });
  function size() { return { w: innerWidth, h: innerHeight, k: Math.min(window.devicePixelRatio || 1, 2), reduce: reduce }; }
  try {
    var on = true; try { var sv = JSON.parse(localStorage.getItem('rushcase.v1') || 'null'); if (sv && sv.sound === false) on = false; } catch (e) { /* */ }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (on && !reduce && AC) { actx = new AC(); if (actx.state !== 'running') { actx.close(); actx = null; } }
  } catch (e) { actx = null; }
  if (actx) sound = fetch('assets/intro.mp3?v=' + V).then(function (r) { return r.arrayBuffer(); })
    .then(function (b) { return new Promise(function (ok, no) { actx.decodeAudioData(b, ok, no); }); })['catch'](function () { return null; });
  // общий старт: картинка готова → ждём звук (не дольше 2 с) → запускаем вместе, с поправкой на задержку звуковой карты
  function start(run) {
    visible(function () {
      var t = setTimeout(function () { t = 0; run(0); }, 2000);
      (sound || Promise.resolve(null)).then(function (buf) {
        if (!t) return; clearTimeout(t);
        if (!buf || !actx || actx.state !== 'running') return run(0);
        var s = actx.createBufferSource(), g = actx.createGain(), lead = .06; g.gain.value = .35; s.buffer = buf; s.connect(g); g.connect(actx.destination); // громкость заставки 35% (владелец 11.11: «тише»)
        s.onended = function () { actx.close(); };
        s.start(actx.currentTime + lead);
        run(Math.round((lead + (actx.outputLatency || 0) + (actx.baseLatency || 0)) * 1000));
      });
    });
  }
  var img = new Image(); img.src = 'assets/logo.webp';
  (img.decode ? img.decode() : new Promise(function (ok, no) { img.onload = ok; img.onerror = no; }))
    .then(function () { return window.createImageBitmap ? createImageBitmap(img) : img; })
    .then(function (bmp) {
      // рисуем в отдельном потоке: загрузка сайта не будет дёргать анимацию
      if (cv.transferControlToOffscreen && window.Worker && bmp !== img) {
        try {
          var w = new Worker(src), off = cv.transferControlToOffscreen(), o = size(); moved = true; o.cv = off; o.bmp = bmp; o.hold = true;
          w.onmessage = function (e) {
            if (e.data === 'ready') start(function (ms) { w.postMessage({ go: ms }); });
            else if (e.data === 'done') { end(); w.terminate(); }
          };
          w.onerror = end;
          w.postMessage(o, [off, bmp]);
          addEventListener('resize', function () { if (!ended) w.postMessage({ resize: size() }); });
          return;
        } catch (e) { if (moved) return end(); }
      }
      var s = document.createElement('script'); s.src = src; s.onerror = end;
      s.onload = function () {
        try { var it = window.RCIntro(cv, bmp, size()); start(function (ms) { it.run(end, ms); }); addEventListener('resize', function () { if (!ended) it.layout(size()); }); } catch (e) { end(); }
      };
      document.head.appendChild(s);
    })['catch'](end);
})();

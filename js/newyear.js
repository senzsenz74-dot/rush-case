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
  document.documentElement.classList.add('ny-on');
  var v = (document.currentScript && document.currentScript.src.split('?v=')[1]) || '';
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'css/newyear.css' + (v ? '?v=' + v : '');
  document.head.appendChild(l);
})();

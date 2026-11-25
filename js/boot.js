/* RUSH CASE — первый скрипт страницы (раньше был встроен в index.html; вынесен 25.11 ради защиты CSP — встроенные скрипты она запрещает).
   Сайт нельзя показывать внутри чужой страницы (iframe): так прячут «невидимые кнопки» поверх сайта (кликджекинг). */
(function () {
  if (window.top !== window.self) {
    try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.style.display = 'none'; }
  }
})();
/* телефоны — только горизонтально и «как на компьютере» (правило владельца): страница считает, что ширина экрана 1280,
   браузер сам уменьшает компьютерную версию под телефон; вертикально — экран «Поверните телефон» (#rot) */
(function () {
  var touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  var phone = touch && Math.min(screen.width, screen.height) < 600, de = document.documentElement;
  if (phone) {
    document.querySelector('meta[name="viewport"]').setAttribute('content', 'width=1280');
    de.classList.add('phone');
  }
  /* экономная графика (js/app.js GFX) — класс сразу, до первой отрисовки: стекло не мигает размытием.
     rc.gfx — выбор игрока (auto/high/eco); в «Авто» экономная у телефона и у ПК, который не потянул 3D (rc.gfxAuto, 3 дня) */
  try {
    var g = localStorage.getItem('rc.gfx'), t = +localStorage.getItem('rc.gfxAuto');
    if (g === 'eco' || (g !== 'high' && (phone || (t > 0 && Date.now() - t < 2592e5)))) de.classList.add('gfx-low');
  } catch (e) { if (phone) de.classList.add('gfx-low'); }
})();

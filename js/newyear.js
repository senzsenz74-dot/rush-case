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
  // фоны главного экрана на время ивента (владелец 25.11, архив «бич.rar»): только новогодние, первый — по умолчанию.
  // app.js берёт этот список вместо MN_BG; выбор игрока из обычных фонов не стирается и вернётся после ивента.
  var B = 'assets/ny/bg/';
  window.NY_BG = [
    { id: 'ny_nuke', n: 'Nuke', img: B + 'nuke.webp' + qv },
    { id: 'ny_ancient', n: 'Ancient', img: B + 'ancient.webp' + qv },
    { id: 'ny_ancient2', n: 'Ancient 2', img: B + 'ancient2.webp' + qv },
    { id: 'ny_ancient3', n: 'Ancient 3', img: B + 'ancient3.webp' + qv },
    { id: 'ny_mirage', n: 'Mirage', img: B + 'mirage.webp' + qv },
    { id: 'ny_inferno', n: 'Inferno', img: B + 'inferno.webp' + qv },
    { id: 'ny_overpass', n: 'Overpass', img: B + 'overpass.webp' + qv },
    { id: 'ny_vertigo', n: 'Vertigo', img: B + 'vertigo.webp' + qv },
    { id: 'ny_cache', n: 'Cache', img: B + 'cache.webp' + qv },
    { id: 'ny_cbble', n: 'Cobblestone', img: B + 'cbble.webp' + qv },
    { id: 'ny_train', n: 'Train', img: B + 'train.webp' + qv },
    { id: 'ny_office', n: 'Office', img: B + 'office.webp' + qv },
    { id: 'ny_office2', n: 'Office 2', img: B + 'office2.webp' + qv },
    { id: 'ny_rush', n: 'Rush', img: B + 'rush.webp' + qv }
  ];
  document.documentElement.classList.add('ny-on');
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'css/newyear.css' + (v ? '?v=' + v : '');
  document.head.appendChild(l);
})();

/* Яндекс Метрика, счётчик 114744833 (подключён 28.11.2026).
   Код от Яндекса вынесен сюда из <script> в index.html: защита CSP не пускает встроенные скрипты.
   Работает только на боевом адресе — заходы с localhost при разработке не считаются.
   trackHash: true — сайт меняет страницы через #/..., так Метрика видит каждый переход как просмотр. */
(function () {
  var h = location.hostname;
  if (h !== 'rush-case.online' && h !== 'www.rush-case.online') return;
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
    k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=114744833', 'ym');
  ym(114744833, 'init', {
    ssr: true, webvisor: true, clickmap: true, ecommerce: 'dataLayer',
    referrer: document.referrer, url: location.href,
    accurateTrackBounce: true, trackLinks: true, trackHash: true
  });
})();

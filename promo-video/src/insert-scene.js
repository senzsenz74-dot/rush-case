/* Вставка 9:16 на хромакее, 6,5 с: рамка кейса въезжает → нажатие «Крутить» → рулетка → ★ Karambit | Fade → логотип и промокод.
   Всё зависит только от t (сек). window.DATA — предметы кейса из кода сайта (assets/insert-data.json) */
(() => {
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, k) => a + (b - a) * k, seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3), easeIn = k => Math.pow(clamp(k, 0, 1), 3);
  const back = k => { k = clamp(k, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  // прокрутка как у сайта: сначала быстро, долгое замедление (кривая близка к cubic-bezier(.1,.55,.06,1))
  const spinEase = k => 1 - Math.pow(1 - clamp(k, 0, 1), 4.2);
  const FS = 1.42; // рамка крупнее экрана: края уходят за кадр, карточки — крупно
  const D = window.DATA, N = 42, WIN = 36, CW = 236 + 8;
  const T = { in: [0, .5], press: [.55, .85], spin: [.85, 4.25], win: 4.25, out: [5.05, 5.35], end: 6.5 };
  // лента: случайные предметы кейса (дорогие реже), выигрыш на позиции WIN; рядом с ним — тоже дорогие ножи (интрига)
  let sd = 5; const R = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const pool = D.items.slice().sort((a, b) => parseFloat(a.p.replace(/\s/g, '').replace(',', '.')) - parseFloat(b.p.replace(/\s/g, '').replace(',', '.')));
  const cards = Array.from({ length: N }, (_, i) => i === WIN ? D.win : i === WIN - 1 || i === WIN + 1 ? pool[pool.length - 2 - (i % 3)] : pool[Math.floor(Math.pow(R(), 1.6) * pool.length * .7)]);
  $('#track').innerHTML = cards.map((s, i) => `<div class="rcard r-${s.r}${i === WIN ? ' is-win' : ''}"><img src="/site/${s.img.replace(/^\//, '')}" alt=""><div class="rc-w">${s.w}</div><div class="rc-f">${s.f}</div></div>`).join('').replace(/src="\/site\/https:/g, 'src="https:');
  $('#pName').innerHTML = D.win.w + '<br><em>' + D.win.f + '</em>'; $('#pPrice').textContent = D.win.p;
  const winW = 961, stop = -(WIN * CW + 118 - winW / 2 - 37); // −37 px — не ровно по центру, как на сайте

  window.renderFrame = async t => {
    // рамка: въезд снизу с «пружиной», лёгкое дыхание; после результата поднимается вверх
    const ki = back(seg(t, ...T.in)), up = easeOut(seg(t, T.out[0], T.out[1]));
    const fr = $('#frame'); fr.style.opacity = Math.min(1, seg(t, 0, .2) * 1.5);
    fr.style.transform = `translateY(${(1 - ki) * 420}px) scale(${FS * lerp(.6, 1, ki) * (1 + .012 * Math.sin(t * 3))})`;
    // лента
    const sp = spinEase(seg(t, ...T.spin)), x = lerp(0, stop, sp), jitter = t > T.win && t < T.win + .3 ? Math.sin((t - T.win) * 60) * 6 * (1 - seg(t, T.win, T.win + .3)) : 0;
    $('#track').style.transform = `translateX(${x + jitter}px)`;
    $('#track').style.filter = t > T.spin[0] && t < T.spin[1] - .8 ? `blur(${(clamp((1 - sp) * 6, 0, 4)).toFixed(1)}px)` : 'none';
    const wc = $('#track .is-win'); const wk = seg(t, T.win, T.win + .35); wc.style.transform = `scale(${1 + back(wk) * .08})`; wc.style.zIndex = 2; wc.style.boxShadow = t >= T.win ? '' : 'none';
    $('#flash').style.opacity = t >= T.win ? Math.max(0, 1 - (t - T.win) / .5) : 0;
    // кнопка и курсор
    const pk = seg(t, ...T.press), press = pk < .4 ? pk / .4 : 1 - (pk - .4) / .6;
    const btn = $('#btn'), bOut = easeIn(seg(t, T.spin[0] + .2, T.spin[0] + .55));
    btn.style.opacity = Math.min(seg(t, .2, .45) * 2, 1) * (1 - bOut);
    btn.style.transform = `translate(-50%, -50%) translateY(${press * 12 + bOut * 60}px) scale(${lerp(.8, 1, back(seg(t, .2, .55))) * (1 - press * .05)})`;
    const cu = $('#cursor'), ck = easeOut(seg(t, .25, .55)), cOut = seg(t, 1.0, 1.3);
    cu.style.left = lerp(900, 640, ck) + 'px'; cu.style.top = lerp(1720, 1442, ck) + 'px'; cu.style.opacity = (1 - cOut) * Math.min(1, seg(t, .2, .3) * 3);
    cu.style.transform = `scale(${1 - press * .15})`;
    // результат под рамкой
    const pz = $('#prize'), zk = seg(t, T.win + .1, T.win + .5), zo = easeIn(seg(t, T.out[0], T.out[0] + .25));
    pz.style.opacity = Math.min(1, zk * 2) * (1 - zo); pz.style.transform = `translate(-50%, -50%) scale(${lerp(.6, 1, back(zk))})`;
    // логотип сверху и промокод снизу
    const lk = seg(t, T.out[0], T.out[0] + .45), lg = $('#logo');
    lg.style.opacity = Math.min(1, lk * 3); lg.style.transform = `translate(-50%, -50%) scale(${lerp(1.6, 1, back(lk)) * (1 + .015 * Math.sin((t - T.out[0]) * 3))})`;
    const ok = seg(t, T.out[0] + .25, T.out[0] + .65), pr = $('#promo');
    pr.style.opacity = Math.min(1, ok * 2); pr.style.transform = `translateX(-50%) translateY(${(1 - easeOut(ok)) * 60}px) scale(${lerp(.85, 1, back(ok))})`;
    // после логотипа на месте результата — снова карточка выигрыша в рамке остаётся
    await Promise.all([...document.images].map(i => i.complete && i.naturalWidth ? null : i.decode().catch(() => {})));
  };
})();

# RUSH CASE — карта проекта

Сайт открытия кейсов CS2. Боевой адрес: https://rush-case.online. **С 02.11.2026 временно на GitHub Pages** (Beget лёг; DNS в REG.RU, файл CNAME в корне). Возврат на Beget — см. ЖУРНАЛ.md 02.11. Сборки нет: чистые HTML/CSS/JS + Supabase.
Владелец не программист — отвечать по-русски, простыми словами.

## Правила работы (обязательно)
- **Новый дизайн — только новый стиль (владелец 11.11, строго).** Всё новое и всё, что трогаем в design-local (страницы, окна, кнопки, карточки, аватарки, метки), — в новом стиле CS2: тёмное стекло (полупрозрачный фон + размытие, тонкая светлая обводка), углы 2–4 px, заголовки Oswald 500 прописными, активное — голубой #84d9fd, действие — зелёная кнопка, цены через prc(). Окна — как «Правила» BLAST (.m-c2r / .m-ga). Нельзя: голое modal() без своего класса (золотая рамка, скругление 28 px), золотые .btn-primary, круглые .bn-card и старые .ava. Берёшь старый компонент — сначала переодень. Подробно — ДИЗАЙН_ПЕРЕДАЧА.md, раздел «Новый стиль».
- **Перед задачей — вопросы через AskUserQuestion** (варианты кнопками, рекомендуемый первым с «(Рекомендую)»).
  Любой вопрос владельцу — только списком вариантов, не текстом. Мелкие однозначные правки — без вопросов.
- **Журнал — каждое действие (владелец 20.11):** после каждого шага сразу запись в `ЖУРНАЛ.md` той папки/ветки, где идёт работа: что сделано, какие файлы, откуда взято, что дальше. Владелец работает с разных профилей Claude — память профиля другому не видна, поэтому всё нужное для продолжения должно быть в журнале и планах.
- **Графика (GFX, с 22.11):** всё новое тяжёлое (3D, холсты, видео) — учитывать `GFX.low` (экономная: 30 кадров/с, разрешение `GFX.dpr(1.25)`, простые тени), частоту 3D ограничивать (не больше 60). Стекло в экономной без размытия — тёмную подложку строит `gfxGlassCss()` сам. Подробно — ЖУРНАЛ.md 22.11 «оптимизация».
- **Экономить лимиты:** большие файлы НЕ читать целиком — только `grep -n` + `sed -n 'A,Bp'` нужного куска.
  - `js/extra.js` 2,4 МБ, `js/app.js` ~6600 строк / 640 КБ, `css/style.css` ~4300 строк / 410 КБ — только точечно.
  - `ЖУРНАЛ.md` — читать только верхнюю (свежую) запись; строки очень длинные, резать `cut -c1-300`.
- **Каждая выкладка:** 1) SQL (если есть) — вставить в Supabase SQL Editor, **Run нажимает владелец**;
  2) поднять `?v=` у css/js в index.html: `sed -i -E "s#(\.(css|js))\?v=[0-9]+#\1?v=$(date +%Y%m%d%H%M)#g" index.html`;
  3) запись в `ЖУРНАЛ.md` (новая сверху, раздел по дате); 4) commit + push в `main` = выкладка (GitHub Actions → FTP на Beget, 1–9 мин);
  5) если менялись кейсы — открыть `#/admin` под админом (admSync зальёт кейсы на сервер).
- **Цены — ночной робот (с 28.11):** `.github/workflows/market-sync.yml` каждую ночь в 4:30 МСК сам меняет цены и составы кейсов (js/skins.js, wears.js, extra.js, app.js, index.html), коммитит в `main` и обновляет сервер Supabase — **перед своим push делать `git pull --rebase`**. Вручную tools/market-sync.js не запускать; итог прогона — GitHub → Actions → «Ночная проверка цен» → Summary. Как устроено — шапки tools/market-sync.js, tools/market-bot.js, supabase/market_bot.sql.
- Секреты в чат не присылать. Проверка с компьютера владельца: `curl --noproxy '*' ...` (в системе прокси 127.0.0.1:10809).
- **Защита CSP (с 25.11, index.html):** встроенные <script> и onclick="…" в разметке запрещены — код только в файлах js/, обработчики через .onclick в JS. Новый внешний скрипт/сервис — дописать его адрес в meta Content-Security-Policy; поменяли importmap — node tools/csp-hash.js. #/admin и #/staff чужим показывают 404 (doorGate в js/app.js); тайное слово входа — только в D:КейсыБЕЗОПАСНОСТЬ_ЛОКАЛЬНО.md.

## Файлы
| Путь | Что там |
|---|---|
| `index.html` | оболочка; подключает `css/style.css`, `js/skins.js`, `js/wears.js`, `js/extra.js`, `js/app.js` (все с `?v=`) |
| `js/app.js` | весь сайт: страницы, админка, роутер (см. ниже) |
| `js/skins.js` | `window.SKINS` — каталог скинов {r, p, i} |
| `js/wears.js` | цены по износу (FN/MW/FT/WW/BS) |
| `js/extra.js` | `window.EXTRA` — ножи, перчатки, StatTrak (цены всего каталога — market.csgo × 1.1, `tools/market-sync.js`) |
| `js/tac/` | движок «Тактики» (nav.js, sim.js, ui.dink.js) — на сайте ещё не подключён |
| `css/style.css` | все стили; разделы помечены `/* ---------- name ---------- */` и `/* ===== name ===== */` |
| `assets/` | картинки: `case-<id>.webp` + `case-<id>-s.webp` (маленькая), фоны `bg-*.webp`, скины `assets/skins/`, `assets/cc/` (лёгкие копии картинок кейсов из админки) |
| `supabase/*.sql` | серверные функции/таблицы по темам (schema, server, admin*, roles, market, payments, support*, *_case.sql…) |
| `supabase/functions/` | Edge Functions: market, payment, steam-auth, support-bot (Telegram) |
| `tools/` | market-sync.js (цены с market.csgo × 1.1 + замена «поплывших» скинов в кейсах, SQL для кейсов из админки → supabase/market_swap.sql; lis-sync.js устарел), market-names.js, rating-sheet.js, tac-calibrate.js, serve.js (локальный сервер) |
| `.github/workflows/deploy.yml` | выкладка на Beget при push в main |
| `ЖУРНАЛ.md` | дневник разработки (новые записи сверху) |
| `ПЛАН_ТАКТИКА.md`, `ПЛАН_РОЛИ.md`, `КАССА.md`, `ПРОГРЕСС.md` | планы и состояние отдельных направлений |
| `promo-video/` | промо-ролик (node, не выкладывается) |

## js/app.js — где что (номера строк примерные, уточнять grep)
- `const CASES` (~194) — встроенные кейсы; `RANKS` (~972); `SB_URL/SB_KEY` (~1003, публичный ключ)
- `OVERLAYS` (~1315) — анимации поверх картинок кейсов; `BLOCK_BG` (~1999) — фоны разделов; `CUSTOM_FX` (~4042) — эффекты для кейсов из админки
- Кейсы из админки — таблица `custom_cases` (~4040); правки кейсов — `site_cfg` ('case:<id>')
- Страницы (`function pageX` + `mountX`): Home ~1893, Cases ~2109, Top ~2257, Player `#/u/<id>` ~2208,
  Case ~2315 (`openCase` ~2441), Upgrade ~2684, Contracts ~3088, Bonus ~3471 (розыгрыши: gaLoad/gaCard/gaMount/gaVerify/gaWinCheck, сервер supabase/giveaways.sql, админка admGa, стример — gaStrWin на #/invite), Profile ~3591, Faq/Docs ~3806,
  Auth ~3897, Deposit ~4125, Jackpot ~4492, Tournaments ~6253, «Собери сам» `#/build` (pageBuild/buildCalc, сервер — supabase/build_case.sql, открытие через `#/case/build`), Crash `#/crash` ~6630 (pageCrash; сервер — supabase/crash.sql, модель assets/c4.glb, three.js через importmap; фон — видео-пролёт assets/crash-fly.mp4 + путь камеры assets/crash-fly.json из blender/scenes/location-crash-plant.blend, см. ЖУРНАЛ.md 13.11)
- Рефералы `#/invite` (pageInvite/mountInvite, rfDraw, rfChart, rfList; стили `.rf-*`), админка `admRef` — сервер supabase/referral2.sql (кошелёк, стримеры, защита), см. ЖУРНАЛ.md 15.11
- **Пикем** `#/pickem` (PGL Major Singapore 2026, с 23.11): раздел «ПИКЕМ» в САМОМ НАЧАЛЕ js/app.js (pagePickem/mountPickem, медаль у аватарки — ava(), билет PK_TICKET в кейсе MAJOR), стили css/pickem.css, сервер supabase/pickem.sql, вкладка админки «Пикем» (матчи, «Итог», главный приз). Картинки — assets/pickem/, рендеры — blender-coin/. Новый CSS-класс — сначала grep в css/style.css (были конфликты .pk-c, .live).
- Админка: `pageAdmin` ~4931, `ADM_TABS` ~5101, `admDraw`, `admCases` (витрина), `admBlocks`, `admBanners`, `admPlayers`,
  `axCrash` (краш), `admLuck`, `admGive`, `admPromo`, `admStaff`, `admSupport`, `admXls`, `admSync`
- Объявление при входе (как «Приглашение на тест» CS2): annOpen/annMaybe, окно .m-ann; админка admAnn (вкладка «Объявление»); хранение site_cfg 'announce', «показано» — localStorage rc.ann = ver
- Роутер: `const ROUTES` + `route()` (~6550), адреса вида `#/case/<id>`, `#/admin`

## Сервер (Supabase)
- Права проверяет сервер: `is_admin()` = владелец; сотрудники — таблица `staff` (supabase/roles.sql). Владельцы — игроки #100003, #100004.
- Возврат кейсов и апгрейда — 80%.

## Оплата (с 04.11.2026)
- Всё в Edge Function `supabase/functions/payment/index.ts`: касса **1plata** (адаптер '1plat': СБП/карта, `?action=create` / `?action=webhook`), скины **SkinsMoney** (`?action=skins_create` / `?action=skins`) и **Skinslink** (`?action=skinslink_create` / `?action=skinslink`), `?action=status` — что включено.
- Зачисление только после перепроверки платежа у провайдера (правило владельца); **скины — через 7 дней** (защита от отката обмена, supabase/skins_hold.sql + skins_guard.sql: pg_cron skins-release → payment ?action=release перепроверяет у провайдера и только потом зачисляет; отмена — admin_hold_cancel); база — `payments.sql` (pay_credit), `skins_pay.sql` (pay_skins, курс `site_cfg 'skins'.rate`, сейчас 78 ₽/$).
- Выкладка функции: Supabase → Edge Functions → payment → Code → вставить файл → **Deploy жмёт владелец**. Секреты (PAY_*, SM_*, SL_*) — только в Supabase → Edge Functions → Secrets, в чат не присылать.
- Сайт: окно пополнения `openDeposit` (PAY_METHODS, PAY_TABS, paySkins, payStart) в js/app.js.

## Локальный просмотр
`.claude/launch.json` → `preview_start {name: "rushcase"}` (http://localhost:5178, `tools/serve.js`).

## Незаконченное (на 04.11.2026)
- **Новогодний ивент выложен 28.11** (js/newyear.js, css/newyear.css, assets/ny/, `if (window.NY_ON)` в app.js; `?ny=1`/`?ny=0`). Выключится сам 19.01.2027 23:59 МСК — потом удалить по ПЛАН_НОВЫЙ_ГОД.md. Не сделан звук ветра для Mirage.
- **Оценки 22.11: оптимизация ПК 8/10, телефон 6/10, безопасность 6/10 — и что исправить по пунктам** (владелец: «чтобы с любого профиля вернуться и исправить именно эти оценки»): `ОЦЕНКА.md` в ветке main (папка `.claude/worktrees/main-snd`). Подробности безопасности — ТОЛЬКО локально `D:\Кейсы\БЕЗОПАСНОСТЬ_ЛОКАЛЬНО.md` (не в git: репозиторий публичный — про слабые места в git, журнал и чат ничего не писать). Первым — пункт 3.1 (проверка одного права на боевой базе).
- **«Русская рулетка» вместо «Крота» — ВЫЛОЖЕНА 20.11 и открыта всем** (адрес #/krot, сервер supabase/roulette.sql запущен). Дальше — анимации (выстрел, кровь, падение) на локалке в ветке `roulette`, папка `D:/Кейсы/.claude/worktrees/roulette`: сначала `ПЛАН_РУЛЕТКА.md` («Как продолжить») и верх `ЖУРНАЛ.md`. Просмотр — `preview_start {name: "roulette"}` → http://localhost:5200/#/krot/demo; настоящий режим с ботами — tools/rr/fake-server.mjs.
- **Оплата не проверена реальным платежом** (1plata, Skinslink, SkinsMoney) — см. ЖУРНАЛ.md, «ИТОГ 04.11». После проверки SkinsMoney удалить секрет SM_ALLOW_TEST и выключить их Test Mode.
- «Башня» (#/tower) — отложена: код есть, меню/маршрут/админка скрыты, supabase/tower.sql не запущен.
- «Тактика» — сделан этап 1 из 5; дальше этап 2 (калибровка, `tools/tac-calibrate.js`), см. `ПЛАН_ТАКТИКА.md`.
- Роли в админке — этапы 1–2 сделаны, этап 3 «Отчёт смены» не начат, см. `ПЛАН_РОЛИ.md`.
- Ссылки на TikTok/соцсети — ждём от владельца.
- **Режим «КРОТ»** (владелец 11.11): решения и этапы — `ПЛАН_КРОТ.md`. Этап 1 (сервер `supabase/krot.sql`) не начат; ждём файлы персонажей от владельца.

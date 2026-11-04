# RUSH CASE — карта проекта

Сайт открытия кейсов CS2. Боевой адрес: https://rush-case.online. **С 02.11.2026 временно на GitHub Pages** (Beget лёг; DNS в REG.RU, файл CNAME в корне). Возврат на Beget — см. ЖУРНАЛ.md 02.11. Сборки нет: чистые HTML/CSS/JS + Supabase.
Владелец не программист — отвечать по-русски, простыми словами.

## Правила работы (обязательно)
- **Перед задачей — вопросы через AskUserQuestion** (варианты кнопками, рекомендуемый первым с «(Рекомендую)»).
  Любой вопрос владельцу — только списком вариантов, не текстом. Мелкие однозначные правки — без вопросов.
- **Экономить лимиты:** большие файлы НЕ читать целиком — только `grep -n` + `sed -n 'A,Bp'` нужного куска.
  - `js/extra.js` 2,4 МБ, `js/app.js` ~6600 строк / 640 КБ, `css/style.css` ~4300 строк / 410 КБ — только точечно.
  - `ЖУРНАЛ.md` — читать только верхнюю (свежую) запись; строки очень длинные, резать `cut -c1-300`.
- **Каждая выкладка:** 1) SQL (если есть) — вставить в Supabase SQL Editor, **Run нажимает владелец**;
  2) поднять `?v=` у css/js в index.html: `sed -i -E "s#(\.(css|js))\?v=[0-9]+#\1?v=$(date +%Y%m%d%H%M)#g" index.html`;
  3) запись в `ЖУРНАЛ.md` (новая сверху, раздел по дате); 4) commit + push в `main` = выкладка (GitHub Actions → FTP на Beget, 1–9 мин);
  5) если менялись кейсы — открыть `#/admin` под админом (admSync зальёт кейсы на сервер).
- Секреты в чат не присылать. Проверка с компьютера владельца: `curl --noproxy '*' ...` (в системе прокси 127.0.0.1:10809).

## Файлы
| Путь | Что там |
|---|---|
| `index.html` | оболочка; подключает `css/style.css`, `js/skins.js`, `js/wears.js`, `js/extra.js`, `js/app.js` (все с `?v=`) |
| `js/app.js` | весь сайт: страницы, админка, роутер (см. ниже) |
| `js/skins.js` | `window.SKINS` — каталог скинов {r, p, i} |
| `js/wears.js` | цены по износу (FN/MW/FT/WW/BS) |
| `js/extra.js` | `window.EXTRA` — ножи, перчатки, StatTrak (цены Lis-Skins, `tools/lis-sync.js`) |
| `js/tac/` | движок «Тактики» (nav.js, sim.js, ui.dink.js) — на сайте ещё не подключён |
| `css/style.css` | все стили; разделы помечены `/* ---------- name ---------- */` и `/* ===== name ===== */` |
| `assets/` | картинки: `case-<id>.webp` + `case-<id>-s.webp` (маленькая), фоны `bg-*.webp`, скины `assets/skins/`, `assets/cc/` (лёгкие копии картинок кейсов из админки) |
| `supabase/*.sql` | серверные функции/таблицы по темам (schema, server, admin*, roles, market, payments, support*, *_case.sql…) |
| `supabase/functions/` | Edge Functions: market, payment, steam-auth, support-bot (Telegram) |
| `tools/` | lis-sync.js (цены), market-names.js, rating-sheet.js, tac-calibrate.js, serve.js (локальный сервер) |
| `.github/workflows/deploy.yml` | выкладка на Beget при push в main |
| `ЖУРНАЛ.md` | дневник разработки (новые записи сверху) |
| `ПЛАН_ТАКТИКА.md`, `ПЛАН_РОЛИ.md`, `КАССА.md`, `ПРОГРЕСС.md` | планы и состояние отдельных направлений |
| `promo-video/` | промо-ролик (node, не выкладывается) |

## js/app.js — где что (номера строк примерные, уточнять grep)
- `const CASES` (~194) — встроенные кейсы; `RANKS` (~972); `SB_URL/SB_KEY` (~1003, публичный ключ)
- `OVERLAYS` (~1315) — анимации поверх картинок кейсов; `BLOCK_BG` (~1999) — фоны разделов; `CUSTOM_FX` (~4042) — эффекты для кейсов из админки
- Кейсы из админки — таблица `custom_cases` (~4040); правки кейсов — `site_cfg` ('case:<id>')
- Страницы (`function pageX` + `mountX`): Home ~1893, Cases ~2109, Top ~2257, Player `#/u/<id>` ~2208,
  Case ~2315 (`openCase` ~2441), Upgrade ~2684, Contracts ~3088, Bonus ~3471, Profile ~3591, Faq/Docs ~3806,
  Auth ~3897, Deposit ~4125, Jackpot ~4492, Tournaments ~6253, «Собери сам» `#/build` (pageBuild/buildCalc, сервер — supabase/build_case.sql, открытие через `#/case/build`), Crash `#/crash` ~6630 (pageCrash; сервер — supabase/crash.sql, модель assets/c4.glb, three.js через importmap)
- Админка: `pageAdmin` ~4931, `ADM_TABS` ~5101, `admDraw`, `admCases` (витрина), `admBlocks`, `admBanners`, `admPlayers`,
  `axCrash` (краш), `admLuck`, `admGive`, `admPromo`, `admStaff`, `admSupport`, `admXls`, `admSync`
- Роутер: `const ROUTES` + `route()` (~6550), адреса вида `#/case/<id>`, `#/admin`

## Сервер (Supabase)
- Права проверяет сервер: `is_admin()` = владелец; сотрудники — таблица `staff` (supabase/roles.sql). Владельцы — игроки #100003, #100004.
- Возврат кейсов и апгрейда — 80%.

## Оплата (с 04.11.2026)
- Всё в Edge Function `supabase/functions/payment/index.ts`: касса **1plata** (адаптер '1plat': СБП/карта, `?action=create` / `?action=webhook`), скины **SkinsMoney** (`?action=skins_create` / `?action=skins`) и **Skinslink** (`?action=skinslink_create` / `?action=skinslink`), `?action=status` — что включено.
- Зачисление только после перепроверки платежа у провайдера (правило владельца); **скины — через 7 дней** (защита от отката обмена, supabase/skins_hold.sql, pg_cron skins-release, отмена — admin_hold_cancel); база — `payments.sql` (pay_credit), `skins_pay.sql` (pay_skins, курс `site_cfg 'skins'.rate`, сейчас 78 ₽/$).
- Выкладка функции: Supabase → Edge Functions → payment → Code → вставить файл → **Deploy жмёт владелец**. Секреты (PAY_*, SM_*, SL_*) — только в Supabase → Edge Functions → Secrets, в чат не присылать.
- Сайт: окно пополнения `openDeposit` (PAY_METHODS, PAY_TABS, paySkins, payStart) в js/app.js.

## Локальный просмотр
`.claude/launch.json` → `preview_start {name: "rushcase"}` (http://localhost:5178, `tools/serve.js`).

## Незаконченное (на 04.11.2026)
- **Оплата не проверена реальным платежом** (1plata, Skinslink, SkinsMoney) — см. ЖУРНАЛ.md, «ИТОГ 04.11». После проверки SkinsMoney удалить секрет SM_ALLOW_TEST и выключить их Test Mode.
- «Башня» (#/tower) — отложена: код есть, меню/маршрут/админка скрыты, supabase/tower.sql не запущен.
- «Тактика» — сделан этап 1 из 5; дальше этап 2 (калибровка, `tools/tac-calibrate.js`), см. `ПЛАН_ТАКТИКА.md`.
- Роли в админке — этапы 1–2 сделаны, этап 3 «Отчёт смены» не начат, см. `ПЛАН_РОЛИ.md`.
- Ссылки на TikTok/соцсети — ждём от владельца.

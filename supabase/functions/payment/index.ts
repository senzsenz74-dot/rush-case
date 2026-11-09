// RUSH CASE — приём оплаты (Supabase Edge Function «payment»). Проверку JWT для функции ВЫКЛЮЧИТЬ:
// уведомления кассы приходят без токена; игрока проверяем сами по его токену в заголовке Authorization.
//
//   POST /functions/v1/payment?action=status   (сайт)   → {live, methods} — подключена ли касса и какие способы показывать
//   POST /functions/v1/payment?action=create   (игрок)  {amount, method: 'sbp'|'card'|'intl'|'crypto', promo?} → {url}  — переход на оплату
//   POST /functions/v1/payment?action=webhook  (касса)  уведомление → проверка подписи → pay_credit
//   POST /functions/v1/payment?action=fk_hook  (FreeKassa, через pay.rush-case.online) уведомление → подпись → перепроверка заказа → pay_credit → YES
//   POST /functions/v1/payment?action=skins_create (игрок) {promo?} → {url} — пополнение скинами через SkinsMoney
//   POST /functions/v1/payment?action=skins     (SkinsMoney) уведомление о депозите → подпись → pay_skins (supabase/skins_pay.sql)
//   POST /functions/v1/payment?action=skinslink_create (игрок) {promo?} → {url} — пополнение скинами через Skinslink
//   POST /functions/v1/payment?action=skinslink (Skinslink) уведомление → подпись → перепроверка статуса → pay_skins (только completed)
//   POST /functions/v1/payment?action=release   (pg_cron раз в 10 мин, supabase/skins_guard.sql) — скины, у которых прошли 7 дней ожидания:
//        ещё раз спрашиваем провайдера, что обмен не откатили, и только тогда зачисляем (pay_credit); откатили — pay_fail
//
// Секреты (Edge Functions → Secrets): PAY_PROVIDER (имя адаптера ниже), PAY_SHOP_ID, PAY_SECRET, PAY_SECRET2 (если касса даёт второй ключ),
//   PAY_API_URL (адрес создания платежа у кассы), PAY_METHODS — какие способы показывать, через запятую (по умолчанию sbp,card,intl,crypto).
// Пока PAY_PROVIDER не задан, сайт показывает окно оплаты, но способы — «скоро» (подписка на Telegram и пополнение через поддержку).
// Чтобы подключить кассу: дописать её адаптер в PROVIDERS (2 функции по её документации) и задать секреты.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHash, createHmac } from 'node:crypto';

const SITE = 'https://rush-case.online/';
const env = (k: string) => Deno.env.get(k) || '';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'content-type': 'application/json' } });

// ---------- криптография для подписей ----------
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const hmac = async (algo: 'SHA-256' | 'SHA-512', key: string, msg: string) => hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: algo }, false, ['sign']), enc.encode(msg)));
const sha256 = async (msg: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(msg)));
const md5 = async (msg: string) => hex(await crypto.subtle.digest('MD5', enc.encode(msg)));
const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

type Pay = { id: string; amount: number; method: string };
type Note = { id: string; ext: string; amount: number; paid: boolean; skip?: boolean; ok: (r: unknown) => Response }; // skip — промежуточный статус: ничего не делаем
type Provider = {
  createUrl: (p: Pay) => Promise<string>;                       // ссылка на страницу оплаты кассы
  parse: (req: Request, raw: string) => Promise<Note | null>;   // разобрать уведомление; null — подпись неверна
};

// ---------- адаптеры касс ----------
const PROVIDERS: Record<string, Provider> = {
  // шаблон «как у большинства агрегаторов»: подпись HMAC-SHA256 тела запроса в заголовке, JSON {order_id, payment_id, amount, status}.
  // У конкретной кассы поменять: адрес создания платежа, имена полей и способ подписи — по её документации.
  generic: {
    async createUrl(p) {
      const body = { shop_id: env('PAY_SHOP_ID'), order_id: p.id, amount: p.amount.toFixed(2), currency: 'RUB', method: p.method, success_url: SITE + '?pay=ok', fail_url: SITE + '?pay=fail' };
      const r = await fetch(env('PAY_API_URL'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': await hmac('SHA-256', env('PAY_SECRET'), JSON.stringify(body)) }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error('provider create failed');
      return j.url;
    },
    async parse(req, raw) {
      const sig = req.headers.get('x-signature') || '';
      if (!safeEq(sig, await hmac('SHA-256', env('PAY_SECRET2') || env('PAY_SECRET'), raw))) return null;
      const j = JSON.parse(raw);
      return { id: j.order_id, ext: String(j.payment_id), amount: +j.amount, paid: j.status === 'paid' || j.status === 'success', ok: () => json({ ok: true }) };
    },
  },
  // 1plata (1plat.cash, документация: https://1plat.cash/docs). Секреты: PAY_PROVIDER=1plat, PAY_SHOP_ID (id магазина), PAY_SECRET (секретный ключ),
  // PAY_METHODS (например sbp,card). Коллбек в настройках магазина: …/functions/v1/payment?action=webhook.
  // Статусы платежа: -2 нет реквизитов, -1 черновик, 0 ждёт оплаты, 1 оплачен (ждёт нашего ответа 200), 2 закрыт.
  // Зачисляем только после перепроверки платежа у 1plata (info по guid): статус 1 или 2, наш номер заказа, сумма — из их ответа.
  '1plat': {
    async createUrl(p) {
      const uid = parseInt(p.id.replace(/-/g, '').slice(0, 7), 16); // user_id у них — число; берём из номера платежа
      const method = p.method === 'card' || p.method === 'intl' ? 'card' : p.method === 'crypto' ? 'crypto' : 'sbp';
      const body: Record<string, unknown> = { merchant_order_id: p.id, user_id: uid, amount: Math.round(p.amount), email: `${uid}@temp.com`, method };
      if (method === 'crypto') body.currency = 'USDT';
      const r = await fetch(`${env('PAY_API_URL') || 'https://1plat.cash'}/api/merchant/order/create/by-api`, { method: 'POST', headers: { 'x-shop': env('PAY_SHOP_ID'), 'x-secret': env('PAY_SECRET'), 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success || !j?.url) { console.log('1plat create', r.status, JSON.stringify(j).slice(0, 400)); throw new Error('provider create failed'); }
      return j.url;
    },
    async parse(_req, raw) {
      const j = JSON.parse(raw);
      // подпись v2: md5(merchant_id + amount + shop_id + secret); v1: hmac-sha256(secret, тело без подписей)
      const amt = rawField(raw, 'amount') ?? String(j.amount);
      const v2 = createHash('md5').update(String(j.merchant_id ?? '') + amt + env('PAY_SHOP_ID') + env('PAY_SECRET')).digest('hex');
      const body = { ...j }; delete body.signature; delete body.signature_v2;
      const v1 = createHmac('sha256', env('PAY_SECRET')).update(JSON.stringify(body)).digest('hex');
      if (!safeEq(String(j.signature_v2 || ''), v2) && !safeEq(String(j.signature || ''), v1)) return null;
      const ok = () => new Response('OK', { status: 200 });
      const id = String(j.merchant_id || ''), st = +j.status;
      if (st < 0) return { id, ext: String(j.guid || ''), amount: 0, paid: false, ok };            // нет реквизитов / отменён
      if (st !== 1 && st !== 2) return { id, ext: '', amount: 0, paid: false, skip: true, ok };   // ждёт оплаты — ничего не делаем
      // перепроверка у 1plata: платёж действительно оплачен
      const r = await fetch(`${env('PAY_API_URL') || 'https://1plat.cash'}/api/merchant/order/info/${encodeURIComponent(String(j.guid || ''))}/by-api`, { headers: { 'x-shop': env('PAY_SHOP_ID'), 'x-secret': env('PAY_SECRET'), accept: 'application/json' } });
      const info = await r.json().catch(() => ({}));
      const pay = info?.payment;
      if (!r.ok || !pay || String(pay.merchant_id) !== id || ![1, 2].includes(+pay.status)) { console.log('1plat not confirmed', r.status, JSON.stringify(info).slice(0, 300)); throw new Error('not confirmed'); }
      return { id, ext: String(j.guid), amount: +pay.amount, paid: true, ok };
    },
  },
  // FreeKassa (документация: https://docs.freekassa.net), магазин rush-case.online. Секреты: PAY_PROVIDER=freekassa, FKC_SHOP_ID, FKC_SECRET1, FKC_SECRET2, FKC_API_KEY.
  // Имена FK_* заняты функцией маркета rush-market: там другой магазин (rush-case.site), ключи не смешивать.
  // URL оповещения в кабинете: https://pay.rush-case.online/fk.php?x=1 (POST) — Netlify передаёт его сюда, ?action=fk_hook.
  // Зачисляем только после перепроверки заказа в API FreeKassa: статус 1, наш номер заказа, рубли; сумма — из их ответа (pay_credit сверит её с заказом).
  freekassa: {
    async createUrl(p) {
      const m = env('FKC_SHOP_ID'), oa = String(Math.round(p.amount));
      const s = createHash('md5').update(`${m}:${oa}:${env('FKC_SECRET1')}:RUB:${p.id}`).digest('hex');
      return 'https://pay.fk.money/?' + new URLSearchParams({ m, oa, currency: 'RUB', o: p.id, s, lang: 'ru' });
    },
    async parse(req, raw) {
      const q = new URLSearchParams(new URL(req.url).search), ct = req.headers.get('content-type') || '';
      if (raw && /form/i.test(ct)) (await new Response(raw, { headers: { 'content-type': ct } }).formData()).forEach((v, k) => q.set(k, String(v)));
      const g = (k: string) => q.get(k) || '', id = g('MERCHANT_ORDER_ID');
      const want = createHash('md5').update(`${g('MERCHANT_ID')}:${g('AMOUNT')}:${env('FKC_SECRET2')}:${id}`).digest('hex');
      if (g('MERCHANT_ID') !== env('FKC_SHOP_ID') || !safeEq(g('SIGN').toLowerCase(), want) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
      const body: Record<string, string | number> = { shopId: +env('FKC_SHOP_ID'), nonce: Date.now(), paymentId: id };
      const signature = createHmac('sha256', env('FKC_API_KEY')).update(Object.keys(body).sort().map(k => body[k]).join('|')).digest('hex');
      const r = await fetch('https://api.fk.life/v1/orders', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ ...body, signature }) });
      const j = await r.json().catch(() => ({}));
      const o = (Array.isArray(j?.orders) ? j.orders : []).find((x: Record<string, unknown>) => String(x.merchant_order_id) === id);
      if (!r.ok || !o || +o.status !== 1 || String(o.currency) !== 'RUB') { console.log('freekassa not confirmed', r.status, JSON.stringify(o || j).slice(0, 300)); throw new Error('not confirmed'); }
      return { id, ext: String(o.fk_order_id ?? g('intid')), amount: +o.amount, paid: true, ok: () => new Response('YES', { status: 200 }) };
    },
  },
  // Enot (enot.io, документация: https://docs.enot.io/e/new). Секреты: PAY_PROVIDER=enot, ENOT_SHOP (id кассы), ENOT_KEY (секретный ключ),
  // ENOT_KEY2 (дополнительный ключ — подпись уведомлений), PAY_METHODS (например sbp,card). URL уведомлений в кассе: …/functions/v1/payment?action=webhook.
  // Зачисляем только после перепроверки счёта у Enot (invoice/info): статус success, наш номер заказа, сумма — из их ответа.
  enot: {
    async createUrl(p) {
      const body = { amount: p.amount, order_id: p.id, currency: 'RUB', shop_id: env('ENOT_SHOP'), hook_url: `${env('SUPABASE_URL')}/functions/v1/payment?action=webhook`,
        success_url: SITE + '?pay=ok', fail_url: SITE + '?pay=fail', expire: 120, comment: 'Пополнение баланса RUSH CASE',
        include_service: p.method === 'sbp' ? ['sbp'] : p.method === 'crypto' ? ['usdt_trc20', 'ton', 'bitcoin'] : ['card', 'mir_card'] };
      const r = await fetch('https://api.enot.io/invoice/create', { method: 'POST', headers: { 'x-api-key': env('ENOT_KEY'), 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.data?.url) { console.log('enot create', r.status, JSON.stringify(j).slice(0, 400)); throw new Error('provider create failed'); }
      return j.data.url;
    },
    async parse(req, raw) {
      const j = JSON.parse(raw);
      // подпись: hmac-sha256(дополнительный ключ, тело с ключами по алфавиту). У Enot в примерах два разных формата JSON — проверяем оба;
      // не совпала — не страшно: деньги зачисляем только по ответу самого Enot (запрос с нашим секретным ключом)
      const sort = (o: unknown): unknown => o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o as Record<string, unknown>).sort().reduce((a, k) => { a[k] = sort((o as Record<string, unknown>)[k]); return a; }, {} as Record<string, unknown>) : o;
      const ser = (o: unknown, sp: boolean): string => Array.isArray(o) ? '[' + o.map(x => ser(x, sp)).join(sp ? ', ' : ',') + ']'
        : o && typeof o === 'object' ? '{' + Object.entries(o as Record<string, unknown>).map(([k, v]) => JSON.stringify(k) + (sp ? ': ' : ':') + ser(v, sp)).join(sp ? ', ' : ',') + '}' : JSON.stringify(o);
      const compact = ser(sort(j), false), spaced = ser(sort(j), true);
      const sig = (req.headers.get('x-api-sha256-signature') || '').toLowerCase(), key = env('ENOT_KEY2');
      if (!key || ![compact, spaced].some(s => safeEq(sig, createHmac('sha256', key).update(s).digest('hex')))) console.log('enot signature mismatch — проверяем счёт у Enot', j.order_id);
      const ok = () => json({ ok: true });
      const id = String(j.order_id || ''), st = String(j.status || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return { id, ext: '', amount: 0, paid: false, skip: true, ok };
      if (+j.type === 2 || st === 'refund') { console.log('enot refund', id, j.refund_amount); return { id, ext: '', amount: 0, paid: false, skip: true, ok }; } // возврат — разбираем вручную
      if (st === 'fail' || st === 'expired') return { id, ext: String(j.invoice_id || ''), amount: 0, paid: false, ok };
      if (st !== 'success') return { id, ext: '', amount: 0, paid: false, skip: true, ok };
      // перепроверка у Enot: счёт действительно оплачен
      const r = await fetch(`https://api.enot.io/invoice/info?shop_id=${encodeURIComponent(env('ENOT_SHOP'))}&order_id=${encodeURIComponent(id)}`, { headers: { 'x-api-key': env('ENOT_KEY'), accept: 'application/json' } });
      const info = await r.json().catch(() => ({}));
      const d = info?.data;
      if (!r.ok || !d || String(d.order_id) !== id || d.status !== 'success') { console.log('enot not confirmed', r.status, JSON.stringify(info).slice(0, 300)); throw new Error('not confirmed'); }
      return { id, ext: String(d.invoice_id || j.invoice_id || ''), amount: +d.invoice_amount, paid: true, ok };
    },
  },
  // тестовая касса — только для проверки цепочки на тестовом проекте (PAY_PROVIDER=test): «страница оплаты» сразу шлёт уведомление
  test: {
    async createUrl(p) { return `${env('SUPABASE_URL')}/functions/v1/payment?action=testpay&id=${p.id}`; },
    async parse(req, raw) {
      const j = JSON.parse(raw);
      if (!safeEq(j.sign || '', await sha256(`${j.order_id}:${j.amount}:${env('PAY_SECRET')}`))) return null;
      return { id: j.order_id, ext: 'test-' + j.order_id, amount: +j.amount, paid: true, ok: () => json({ ok: true }) };
    },
  },
};
void md5; void hmac; // запасные помощники для подписей (1plata использует node:crypto)

// ---------- пополнение скинами: SkinsMoney (skinsmoney.gg, API https://doc.skinsmoney.gg) ----------
// Секреты: SM_TOKEN (API-токен из кабинета), SM_SERVICE (Service ID), SM_HASH (Secret Signature Key), SM_ALLOW_TEST=1 — зачислять тестовые депозиты (только на время проверки).
// В кабинете SkinsMoney: IPN URL (deposit) = https://<проект>.supabase.co/functions/v1/payment?action=skins
const SM_API = 'https://api.skinsmoney.gg';
// ссылка на обмен Steam в любом виде (лишние параметры, http) → partner, token и чистая ссылка
const tradeParse = (t: unknown) => { const m = String(t || '').match(/partner=(\d+)&token=([\w-]+)/); return m ? { partner: +m[1], token: m[2], url: 'https://steamcommunity.com/tradeoffer/new/?partner=' + m[1] + '&token=' + m[2] } : null; };
const smOn = () => !!(env('SM_TOKEN') && env('SM_SERVICE') && env('SM_HASH'));
// значение поля так, как оно пришло в теле (без потери формата чисел: 2.50 ≠ 2.5)
function rawField(raw: string, key: string): string | null {
  const m = raw.match(new RegExp('"' + key + '"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|[^,}\\s]+)'));
  if (!m) return null;
  let v = m[1];
  if (v.startsWith('"')) { try { v = JSON.parse(v); } catch (_) { v = v.slice(1, -1); } }
  return v;
}
// подпись: sha256( serviceId|minValue|tradedValue|steamId|transactionId|date|status|currency|ipnAttempt|isTest[|custom][|redirectUrl]|hashKey )
async function smVerify(raw: string, j: Record<string, unknown>): Promise<boolean> {
  const keys = ['serviceId', 'minValue', 'tradedValue', 'steamId', 'transactionId', 'date', 'status', 'currency', 'ipnAttempt', 'isTest'];
  if (j.custom !== undefined) keys.push('custom');
  if (j.redirectUrl !== undefined) keys.push('redirectUrl');
  const sig = String(j.signature || '').toLowerCase();
  const fromRaw = keys.map(k => rawField(raw, k) ?? ''), fromJson = keys.map(k => j[k] === undefined || j[k] === null ? '' : String(j[k]));
  for (const parts of [fromRaw, fromJson]) if (safeEq(sig, await sha256([...parts, env('SM_HASH')].join('|')))) return true;
  return false;
}
async function skinsCreate(req: Request, admin: ReturnType<typeof createClient>) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: 'not authenticated' }, 401);
  const b = await req.json().catch(() => ({}));
  const promo = typeof b.promo === 'string' && /^[A-Za-z0-9]{2,24}$/.test(b.promo) ? b.promo.toUpperCase() : null;
  const { data: cfg } = await admin.from('site_cfg').select('v').eq('k', 'skins').maybeSingle();
  const min = Math.max(.1, +(cfg?.v?.min ?? 1) || 1);
  const { data: prof } = await admin.from('profiles').select('data').eq('id', u.user.id).maybeSingle();
  const tp = tradeParse(b.trade) || tradeParse(prof?.data?.trade); // ссылка из окна пополнения, иначе из профиля
  const { data: pay, error } = await admin.from('payments').insert({ uid: u.user.id, amount: 1, method: 'skins', promo, provider: 'skinsmoney' }).select('id').single();
  if (error || !pay) return json({ error: 'db error' }, 500);
  const body: Record<string, unknown> = { minValue: min, currencyCode: 'USD', custom: pay.id, redirectUrl: SITE + '?pay=ok' };
  if (tp) body.tradeUrl = tp.url;
  try {
    const r = await fetch(`${SM_API}/v1/services/${env('SM_SERVICE')}/deposits`, { method: 'POST', headers: { authorization: 'Bearer ' + env('SM_TOKEN'), 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.data?.url) { console.log('skinsmoney create', r.status, JSON.stringify(j).slice(0, 400)); throw new Error('create failed'); }
    await admin.from('payments').update({ ext_id: String(j.data.id) }).eq('id', pay.id);
    return json({ url: j.data.url, id: pay.id });
  } catch (_) { await admin.rpc('pay_fail', { p_id: pay.id }); return json({ error: 'provider unavailable' }, 502); }
}
// перепроверка у SkinsMoney: депозит действительно завершён и деньги зачислены на наш баланс в их кабинете.
// Только по их ответу (а не по уведомлению) пополняем игрока; сумма — тоже из их ответа.
// тестовые депозиты (Test Mode SkinsMoney) зачисляем только владельцам сайта и только пока задан SM_ALLOW_TEST=1 — игроку тестовый «скин» денег не даст
async function smTestOk(admin: ReturnType<typeof createClient>, payId: string) {
  if (env('SM_ALLOW_TEST') !== '1') return false;
  const { data: p } = await admin.from('payments').select('uid').eq('id', payId).maybeSingle();
  if (!p) return false;
  const { data: pr } = await admin.from('profiles').select('is_admin').eq('id', p.uid).maybeSingle();
  return !!pr?.is_admin;
}
async function smConfirm(depId: string, payId: string, testOk = false): Promise<number | null> {
  const sig = await sha256([depId, env('SM_SERVICE'), env('SM_HASH')].join('|'));
  const r = await fetch(`${SM_API}/v1/services/${env('SM_SERVICE')}/deposits/${depId}?signature=${sig}`, { headers: { authorization: 'Bearer ' + env('SM_TOKEN'), accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  const d = j?.data;
  if (!r.ok || !d) { console.log('skinsmoney confirm', r.status, JSON.stringify(j).slice(0, 300)); return null; }
  const usd = +(d.real_usd_value ?? d.end_value ?? 0);
  const okState = d.trade_state == null || +d.trade_state === 3; // 3 — обмен в Steam принят
  if (d.status !== 'success' || !d.traded_at || !okState || String(d.custom || '') !== payId || !(usd > 0)) {
    console.log('skinsmoney not settled', JSON.stringify({ status: d.status, traded_at: d.traded_at, trade_state: d.trade_state, usd })); return null;
  }
  if (+d.test_mode === 1 && !testOk) { console.log('skinsmoney test deposit not credited', payId); return null; }
  return usd;
}
async function skinsIpn(req: Request, admin: ReturnType<typeof createClient>) {
  const raw = await req.text();
  let j: Record<string, unknown>; try { j = JSON.parse(raw); } catch (_) { return new Response('bad json', { status: 400 }); }
  if (String(j.serviceId) !== env('SM_SERVICE') || !(await smVerify(raw, j))) { console.log('skinsmoney bad signature'); return new Response('bad signature', { status: 403 }); }
  const ok = () => new Response('OK', { status: 200, headers: { 'content-type': 'text/plain' } });
  const id = String(j.custom || ''), st = String(j.status || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return ok();                              // депозит не с нашего сайта
  const testOk = await smTestOk(admin, id);
  if (+(j.isTest as number) === 1 && !testOk) return ok(); // тестовые депозиты не зачисляем (кроме владельцев при SM_ALLOW_TEST=1)
  if (st === 'failure') { await admin.rpc('pay_fail', { p_id: id, p_raw: j }); return ok(); }
  if (st !== 'success') return ok();                                           // waiting / pending — ждём следующего уведомления
  // уведомлению не верим на слово: спрашиваем SkinsMoney сами. Не подтвердили — не зачисляем, отвечаем ошибкой, они пришлют уведомление повторно
  const usd = await smConfirm(String(j.transactionId || ''), id, testOk);
  if (usd === null) return new Response('not settled yet', { status: 409 });
  const { error } = await admin.rpc('pay_skins', { p_id: id, p_ext: String(j.transactionId || ''), p_usd: usd, p_raw: j });
  if (error) { console.log('skinsmoney credit', error.message); return new Response(error.message, { status: 400 }); } // SkinsMoney повторит
  return ok();
}

// ---------- пополнение скинами: Skinslink (skinslink.com, API https://docs.skinslink.com) ----------
// Секреты: SL_KEY (API key), SL_SECRET (merchant secret — подпись уведомлений). Адрес уведомлений передаём в каждом депозите (result_url).
// Страница Skinslink показывает игроку рубли по нашему курсу (custom_currency RUB). Зачисляем ТОЛЬКО статус completed
// (hold — скины на 7-дневной блокировке Steam, деньги ещё могут откатиться) и только после перепроверки статуса у Skinslink.
const SL_API = 'https://api.skinslink.com/api/v1';
const slOn = () => !!(env('SL_KEY') && env('SL_SECRET'));
const b64 = (hexStr: string) => btoa(String.fromCharCode(...hexStr.match(/../g)!.map(h => parseInt(h, 16))));
async function slCreate(req: Request, admin: ReturnType<typeof createClient>) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: 'not authenticated' }, 401);
  const b = await req.json().catch(() => ({}));
  const promo = typeof b.promo === 'string' && /^[A-Za-z0-9]{2,24}$/.test(b.promo) ? b.promo.toUpperCase() : null;
  const { data: cfg } = await admin.from('site_cfg').select('v').eq('k', 'skins').maybeSingle();
  const rate = Math.max(.1, +(cfg?.v?.rate ?? 90) || 90);
  const { data: prof } = await admin.from('profiles').select('data').eq('id', u.user.id).maybeSingle();
  const tm = tradeParse(b.trade) || tradeParse(prof?.data?.trade); // ссылка из окна пополнения, иначе из профиля
  const { data: pay, error } = await admin.from('payments').insert({ uid: u.user.id, amount: 1, method: 'skins', promo, provider: 'skinslink' }).select('id').single();
  if (error || !pay) return json({ error: 'db error' }, 500);
  const body: Record<string, unknown> = { merchant_tx_id: pay.id, game: 'csgo', result_url: `${env('SUPABASE_URL')}/functions/v1/payment?action=skinslink`,
    success_url: SITE + '?pay=ok', fail_url: SITE + '?pay=fail', custom_currency: 'RUB', custom_currency_multiplier: 1, custom_currency_rate: rate };
  if (tm) { body.partner = tm.partner; body.token = tm.token; }
  try {
    const r = await fetch(`${SL_API}/merchant/create-intent`, { method: 'POST', headers: { 'x-api-key': env('SL_KEY'), 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success || !j?.data?.url) { console.log('skinslink create', r.status, JSON.stringify(j).slice(0, 400)); throw new Error('create failed'); }
    await admin.from('payments').update({ ext_id: String(j.data.id) }).eq('id', pay.id);
    return json({ url: j.data.url, id: pay.id });
  } catch (_) { await admin.rpc('pay_fail', { p_id: pay.id }); return json({ error: 'provider unavailable' }, 502); }
}
// перепроверка у Skinslink: статус completed, наш номер заказа; сумма в рублях — из их ответа (custom_currency_sum)
async function slConfirm(payId: string): Promise<{ usd: number; raw: unknown } | null> {
  const r = await fetch(`${SL_API}/merchant/deposit/status?merchant_tx_id=${encodeURIComponent(payId)}`, { headers: { 'x-api-key': env('SL_KEY'), accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  const d = j?.data;
  if (!r.ok || !j?.success || !d) { console.log('skinslink confirm', r.status, JSON.stringify(j).slice(0, 300)); return null; }
  if (d.status !== 'completed' || String(d.merchant_tx_id) !== payId) { console.log('skinslink not completed', d.status); return null; }
  const sum = +d.custom_currency_sum, rate = +d.custom_currency_rate;
  if (d.custom_currency !== 'RUB' || !(sum > 0) || !(rate > 0)) { console.log('skinslink no rub sum', JSON.stringify(d).slice(0, 300)); return null; }
  return { usd: sum / rate, raw: d }; // pay_skins умножит обратно на курс — получится та же сумма в рублях
}
// конец 7-дневного ожидания: перепроверяем у провайдера и только потом зачисляем
async function release(admin: ReturnType<typeof createClient>) {
  const { data: due } = await admin.from('payments').select('id, provider, ext_id, amount, raw').eq('status', 'hold').lte('hold_until', new Date().toISOString()).order('hold_until').limit(30);
  const res = { credited: 0, failed: 0, waiting: 0 };
  for (const p of (due || []) as { id: string; provider: string; ext_id: string; amount: number; raw: unknown }[]) {
    let ok = false, bad = false;
    try {
      if (p.provider === 'skinslink') {
        const r = await fetch(`${SL_API}/merchant/deposit/status?merchant_tx_id=${encodeURIComponent(p.id)}`, { headers: { 'x-api-key': env('SL_KEY'), accept: 'application/json' } });
        const j = await r.json().catch(() => ({})), d = j?.data;
        if (r.ok && j?.success && d && String(d.merchant_tx_id) === p.id) {
          if (['reverted', 'failed', 'canceled'].includes(d.status)) bad = true;
          else ok = d.status === 'completed' && +d.custom_currency_sum >= +p.amount - 0.01;
        }
      } else if (p.provider === 'skinsmoney') {
        ok = (await smConfirm(String(p.ext_id || ''), p.id, await smTestOk(admin, p.id))) !== null;
      }
    } catch (e) { console.log('release check', p.id, String(e)); }
    if (bad) { await admin.rpc('pay_fail', { p_id: p.id, p_raw: p.raw }); res.failed++; continue; }
    if (!ok) { console.log('release: provider did not confirm, keep waiting', p.id, p.provider); res.waiting++; continue; }
    const { error } = await admin.rpc('pay_credit', { p_id: p.id, p_ext: p.ext_id, p_amount: p.amount, p_raw: p.raw });
    if (error) { console.log('release credit', p.id, error.message); res.waiting++; } else res.credited++;
  }
  return json(res);
}
async function slWebhook(req: Request, admin: ReturnType<typeof createClient>) {
  const raw = await req.text();
  let j: Record<string, unknown>; try { j = JSON.parse(raw); } catch (_) { return new Response('bad json', { status: 400 }); }
  // подпись: base64( sha256( trade_id + merchant_secret ) )
  const want = b64(await sha256(String(j.trade_id ?? '') + env('SL_SECRET')));
  if (!safeEq(String(j.sign || ''), want)) { console.log('skinslink bad signature'); return new Response('bad signature', { status: 403 }); }
  const ok = () => new Response('OK', { status: 200 });
  const id = String(j.merchant_tx_id || ''), st = String(j.status || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return ok();
  if (st === 'failed' || st === 'canceled') { await admin.rpc('pay_fail', { p_id: id, p_raw: j }); return ok(); }
  if (st === 'reverted') { console.log('skinslink reverted', id); await admin.rpc('pay_fail', { p_id: id, p_raw: j }); return ok(); } // откат обмена — ожидание отменяется, баланс не придёт
  if (st !== 'completed') return ok();                                               // hold — ждём окончания блокировки Steam
  const c = await slConfirm(id);
  if (!c) return new Response('not completed yet', { status: 409 });
  const { error } = await admin.rpc('pay_skins', { p_id: id, p_ext: 'sl-' + String(j.trade_id ?? ''), p_usd: c.usd, p_raw: { webhook: j, status: c.raw } });
  if (error) { console.log('skinslink credit', error.message); return new Response(error.message, { status: 400 }); }
  return ok();
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const url = new URL(req.url), action = url.searchParams.get('action');
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const P = PROVIDERS[env('PAY_PROVIDER')];
  const METHODS = (env('PAY_METHODS') || 'sbp,card,intl,crypto').split(',').map(x => x.trim()).filter(x => ['sbp', 'card', 'intl', 'crypto'].includes(x));
  if (action === 'status') {
    let rate = 0; if (smOn()) { const { data } = await admin.from('site_cfg').select('v').eq('k', 'skins').maybeSingle(); rate = +(data?.v?.rate ?? 90) || 90; }
    if (!rate && slOn()) { const { data } = await admin.from('site_cfg').select('v').eq('k', 'skins').maybeSingle(); rate = +(data?.v?.rate ?? 90) || 90; }
    return json({ live: !!P, methods: METHODS, skins: smOn(), skinslink: slOn(), skinsRate: rate });
  }
  // пополнение скинами работает независимо от основной кассы
  if (action === 'release') return release(admin);
  if (action === 'skins_create') return smOn() ? skinsCreate(req, admin) : json({ error: 'skins disabled' }, 503);
  if (action === 'skins') return smOn() ? skinsIpn(req, admin) : new Response('disabled', { status: 503 });
  if (action === 'skinslink_create') return slOn() ? slCreate(req, admin) : json({ error: 'skinslink disabled' }, 503);
  if (action === 'skinslink') return slOn() ? slWebhook(req, admin) : new Response('disabled', { status: 503 });
  // уведомления FreeKassa принимаем и когда основной кассой выбрана другая: платёж мог начаться до переключения
  const fkOn = !!(env('FKC_SHOP_ID') && env('FKC_SECRET1') && env('FKC_SECRET2') && env('FKC_API_KEY'));
  if (action === 'fk_hook' && !fkOn) return new Response('disabled', { status: 503 });
  const H = action === 'fk_hook' ? PROVIDERS.freekassa : P;
  if (!H) return json({ error: 'payments disabled' }, 503);

  // 1) игрок создаёт платёж
  if (action === 'create') {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: 'not authenticated' }, 401);
    const b = await req.json().catch(() => ({}));
    const amount = Math.round(+b.amount), method = METHODS.includes(b.method) ? b.method : METHODS[0] || 'sbp';
    if (!(amount >= 100 && amount <= 1000000)) return json({ error: 'bad amount' }, 400);
    const promo = typeof b.promo === 'string' && /^[A-Za-z0-9]{2,24}$/.test(b.promo) ? b.promo.toUpperCase() : null;
    const { data: pay, error } = await admin.from('payments').insert({ uid: u.user.id, amount, method, promo, provider: env('PAY_PROVIDER') }).select('id, amount, method').single();
    if (error || !pay) return json({ error: 'db error' }, 500);
    try { return json({ url: await P.createUrl(pay as Pay), id: pay.id }); }
    catch (_) { await admin.rpc('pay_fail', { p_id: pay.id }); return json({ error: 'provider unavailable' }, 502); }
  }

  // 2) уведомление кассы
  if (action === 'webhook' || action === 'fk_hook') {
    const raw = await req.text();
    let n: Note | null;
    try { n = await H.parse(req, raw); } catch (_) { return json({ error: 'not confirmed yet' }, 409); } // касса не подтвердила оплату — пусть пришлёт уведомление ещё раз
    if (!n) return json({ error: 'bad signature' }, 403);
    let rawJson: unknown = raw; try { rawJson = JSON.parse(raw); } catch (_) { /* форма */ }
    if (n.skip) return n.ok({ ok: true });
    if (!n.paid) { await admin.rpc('pay_fail', { p_id: n.id, p_raw: rawJson }); return n.ok({ ok: true }); }
    const { data, error } = await admin.rpc('pay_credit', { p_id: n.id, p_ext: n.ext, p_amount: n.amount, p_raw: rawJson });
    if (error) return json({ error: error.message }, 400);   // касса повторит уведомление
    return n.ok(data);
  }

  // тестовая «страница оплаты» (только PAY_PROVIDER=test)
  if (action === 'testpay' && env('PAY_PROVIDER') === 'test') {
    const id = url.searchParams.get('id') || '', { data: pay } = await admin.from('payments').select('id, amount').eq('id', id).maybeSingle();
    if (!pay) return json({ error: 'not found' }, 404);
    const body = JSON.stringify({ order_id: pay.id, amount: pay.amount, sign: await sha256(`${pay.id}:${pay.amount}:${env('PAY_SECRET')}`) });
    await fetch(`${env('SUPABASE_URL')}/functions/v1/payment?action=webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    return Response.redirect(SITE + '?pay=ok', 302);
  }
  return json({ error: 'unknown action' }, 400);
});

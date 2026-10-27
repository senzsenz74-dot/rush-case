// RUSH CASE — приём оплаты (Supabase Edge Function «payment»). Проверку JWT для функции ВЫКЛЮЧИТЬ:
// уведомления кассы приходят без токена; игрока проверяем сами по его токену в заголовке Authorization.
//
//   POST /functions/v1/payment?action=create   (игрок)  {amount, method: 'sbp'|'card', promo?} → {url}  — переход на оплату
//   POST /functions/v1/payment?action=webhook  (касса)  уведомление → проверка подписи → pay_credit
//
// Секреты (Edge Functions → Secrets): PAY_PROVIDER (имя адаптера ниже), PAY_SHOP_ID, PAY_SECRET, PAY_SECRET2 (если касса даёт второй ключ).
// Чтобы подключить кассу: дописать её адаптер в PROVIDERS (2 функции по её документации) и задать секреты.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://rush-case.ru/';
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
type Note = { id: string; ext: string; amount: number; paid: boolean; ok: (r: unknown) => Response };
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
void md5; void hmac; // для адаптеров касс с подписью MD5 / HMAC-SHA512

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const url = new URL(req.url), action = url.searchParams.get('action');
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const P = PROVIDERS[env('PAY_PROVIDER')];
  if (!P) return json({ error: 'payments disabled' }, 503);

  // 1) игрок создаёт платёж
  if (action === 'create') {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: 'not authenticated' }, 401);
    const b = await req.json().catch(() => ({}));
    const amount = Math.round(+b.amount), method = b.method === 'card' ? 'card' : 'sbp';
    if (!(amount >= 100 && amount <= 1000000)) return json({ error: 'bad amount' }, 400);
    const promo = typeof b.promo === 'string' && /^[A-Za-z0-9]{2,24}$/.test(b.promo) ? b.promo.toUpperCase() : null;
    const { data: pay, error } = await admin.from('payments').insert({ uid: u.user.id, amount, method, promo, provider: env('PAY_PROVIDER') }).select('id, amount, method').single();
    if (error || !pay) return json({ error: 'db error' }, 500);
    try { return json({ url: await P.createUrl(pay as Pay), id: pay.id }); }
    catch (_) { await admin.rpc('pay_fail', { p_id: pay.id }); return json({ error: 'provider unavailable' }, 502); }
  }

  // 2) уведомление кассы
  if (action === 'webhook') {
    const raw = await req.text();
    const n = await P.parse(req, raw).catch(() => null);
    if (!n) return json({ error: 'bad signature' }, 403);
    let rawJson: unknown = raw; try { rawJson = JSON.parse(raw); } catch (_) { /* форма */ }
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

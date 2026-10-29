// RUSH CASE — вывод скинов через market.csgo (Supabase Edge Function «market»). Проверку JWT для функции ВЫКЛЮЧИТЬ:
// её раз в минуту зовёт pg_cron (supabase/market.sql) без токена; админа проверяем сами по его токену.
//
//   POST /functions/v1/market?action=tick     (кто угодно, не чаще раза в 8 с) — купить новые заявки, проверить статусы
//   POST /functions/v1/market?action=balance  (админ) — баланс маркета
//
// Секрет (Edge Functions → Secrets): MARKET_API_KEY — ключ API market.csgo. Валюта аккаунта маркета — RUB.
import { createClient } from 'npm:@supabase/supabase-js@2';

const API = 'https://market.csgo.com/api/v2/';
const env = (k: string) => Deno.env.get(k) || '';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'content-type': 'application/json' } });
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// запрос к маркету; ключ — только здесь, в ответы и логи не попадает
async function market(method: string, params: Record<string, string | number>, list: [string, string][] = []) {
  const q = new URLSearchParams({ key: env('MARKET_API_KEY') });
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  for (const [k, v] of list) q.append(k, v);
  const r = await fetch(API + method + '?' + q, { headers: { accept: 'application/json' } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { success: false, error: `HTTP ${r.status}` }; }
}
const set = (id: number, status: string, patch: Record<string, unknown> = {}) => db.rpc('market_set', { p_id: id, p_status: status, p_patch: patch });

// ошибки buy-for, в которых виноват аккаунт игрока: заявка отменяется, предмет возвращается в инвентарь
const PLAYER_ERR: Record<number, string> = {
  3: 'не удалось проверить трейд-ссылку — обновите её в профиле', 5: 'ваш инвентарь Steam скрыт — откройте его и выведите снова',
  6: 'аккаунт Steam заблокирован', 7: 'к аккаунту Steam не привязан мобильный аутентификатор',
  8: 'проверьте, что на аккаунте Steam доступен обмен', 12: 'неверная трейд-ссылка — обновите её в профиле',
  21: 'инвентарь Steam переполнен — освободите место и выведите снова',
};

async function buy(w: Record<string, any>, over: number) {
  const max = Math.round(+w.price * (1 + over / 100) * 100) / 100;
  const r = await market('buy-for', { hash_name: w.h, price: Math.round(max * 100), partner: w.partner, token: w.token, custom_id: 'rc' + w.id });
  if (r.success) return set(w.id, 'sent', { market_id: String(r.id || ''), max_price: max });
  const code = +r.code || 0, msg = String(r.error || r.message || 'ошибка маркета');
  if (PLAYER_ERR[code]) return set(w.id, 'fail', { err: PLAYER_ERR[code], max_price: max });
  if (/money|balance|fund|средств|баланс/i.test(msg)) return set(w.id, 'wait', { err: 'на балансе маркета не хватает денег — пополните и одобрите заново', max_price: max });
  if (/no.?item|not found|нет предмет|не найден|price|цен/i.test(msg)) return set(w.id, 'wait', { err: `нет на маркете до ${max} ₽ (${msg})`, max_price: max });
  // неизвестная ошибка — ещё две попытки, потом к админу
  return set(w.id, w.tries < 3 ? 'new' : 'wait', { err: msg, max_price: max });
}

async function poll() {
  const { data: open } = await db.from('withdrawals').select('id, status, updated_at').in('status', ['buying', 'sent', 'prot']).order('id').limit(200);
  if (!open?.length) return 0;
  for (let i = 0; i < open.length; i += 50) {
    const part = open.slice(i, i + 50);
    const r = await market('get-list-buy-info-by-custom-id', {}, part.map(w => ['custom_id[]', 'rc' + w.id]));
    const data = (r && r.data) || {};
    for (const w of part) {
      const x = data['rc' + w.id];
      if (!x) {
        // заявка «покупается», а маркет о ней не знает дольше 5 минут — пусть посмотрит админ (повтор мог бы купить дважды)
        if (w.status === 'buying' && Date.now() - Date.parse(w.updated_at) > 5 * 60e3) await set(w.id, 'wait', { err: 'маркет не подтвердил покупку — проверьте историю маркета' });
        continue;
      }
      const stage = +x.stage || 0, settlement = +x.settlement || 0, base = { stage, settlement, paid: +x.paid || null, market_id: x.item_id ? String(x.item_id) : undefined, trade_id: x.trade_id ? String(x.trade_id) : undefined };
      if (stage === 2) await set(w.id, 'done', base);
      else if (stage === 5) await set(w.id, 'fail', { ...base, err: x.causer === 'buyer' ? 'обмен не принят в Steam — предмет возвращён, выведите снова' : 'продавец не передал предмет — предмет возвращён, выведите снова' });
      else if (stage === 1) { const s = settlement > 0 ? 'prot' : 'sent'; if (s !== w.status || base.trade_id) await set(w.id, s, base); }
    }
    if (i + 50 < open.length) await sleep(300);
  }
  return open.length;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const action = new URL(req.url).searchParams.get('action') || 'tick';
  if (!env('MARKET_API_KEY')) return json({ error: 'MARKET_API_KEY not set' }, 500);
  try {
    if (action === 'tick') {
      const { data: cfg } = await db.rpc('market_tick', { p_sec: 8 });
      if (!cfg || !cfg.id) return json({ skip: true });
      const { data: claimed } = await db.rpc('market_claim', { p_limit: 3 });
      for (const w of claimed || []) { await buy(w, +cfg.over_pct || 0); await sleep(300); }
      const checked = await poll();
      return json({ bought: (claimed || []).length, checked });
    }
    if (action === 'balance') {
      const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
      const { data: u } = await db.auth.getUser(token);
      const { data: p } = u?.user ? await db.from('profiles').select('is_admin').eq('id', u.user.id).maybeSingle() : { data: null };
      if (!p?.is_admin) return json({ error: 'forbidden' }, 403);
      const r = await market('get-money', {});
      if (r.money == null) return json({ error: r.error || 'market error' }, 502);
      await db.rpc('market_balance', { p_v: +r.money });
      return json({ money: +r.money, currency: r.currency });
    }
    return json({ error: 'bad action' }, 400);
  } catch (e) {
    console.error('market', (e as Error).message);
    return json({ error: 'server error' }, 500);
  }
});

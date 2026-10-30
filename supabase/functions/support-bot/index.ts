// RUSH CASE — Telegram-бот поддержки (Supabase Edge Function «support-bot»). Проверку JWT для функции ВЫКЛЮЧИТЬ:
// Telegram присылает сообщения без токена; его проверяем по секрету вебхука, админа — по его токену.
//
//   POST ?action=info     (сайт)     → {bot}  — @ник бота для кнопки «Написать в Telegram»
//   POST ?action=webhook  (Telegram) сообщение в боте → диалог в админке (support_threads / support_msgs)
//   POST ?action=setup    (админ)    подключить бота: Telegram начнёт присылать сообщения сюда
//   POST ?action=reply    (админ)    {thread, text} — ответ из админки уходит в Telegram от имени бота
//   (отвечать и закрывать может только админ, за которым закреплено обращение — supabase/support_owner.sql)
//   POST ?action=close    (админ)    {thread} — обращение закрыто: в Telegram — просьба оценить помощь кнопками ⭐1–5
//   POST ?action=shop_new (админ)    {id} — заявка сотрудника на витрину → в чат владельцев с кнопками ✅ / ❌ (supabase/shop_requests.sql)
//   POST ?action=shop_upd (админ)    {id} — решение принято на сайте → обновить сообщение в чате владельцев
//   В группе владельцев: «/link@бот КОД» (код — в админке, вкладка «Сотрудники») привязывает чат.
//
// Секрет (Edge Functions → Secrets): TG_BOT_TOKEN — токен бота от @BotFather. После него — кнопка «Подключить бота» в админке.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) || '';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'content-type': 'application/json' } });
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const tg = async (method: string, body: Record<string, unknown> = {}) => {
  const r = await fetch(`https://api.telegram.org/bot${env('TG_BOT_TOKEN')}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return await r.json().catch(() => ({ ok: false }));
};
// секрет вебхука — из токена бота (отдельный секрет заводить не нужно)
const hookSecret = async () => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rc-hook:' + env('TG_BOT_TOKEN'))))].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
let botName: string | null = null;
const getBot = async () => { if (botName === null) { const r = await tg('getMe'); botName = r.ok ? r.result.username : ''; } return botName; };
async function adminOf(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return null;
  const { data: p } = await db.from('profiles').select('name, is_admin').eq('id', u.user.id).maybeSingle();
  return p?.is_admin ? { id: u.user.id, name: p.name || 'Поддержка' } : null;
}
// заявки на витрину: текст сообщения в чате владельцев
const SR_ST: Record<string, string> = { approved: '✅ Одобрено', rejected: '❌ Отклонено', failed: '⚠️ Одобрено, но не применилось' };
function srText(r: Record<string, any>, sync = false) {
  const lines = (Array.isArray(r.lines) ? r.lines : []).slice(0, 40).map((l: string) => '• ' + String(l).slice(0, 300));
  let t = `📝 Заявка №${r.id} — ${r.title}\nОт: ${r.name || 'сотрудник'}\n\n${lines.join('\n') || '(без описания)'}`;
  if (r.status && r.status !== 'pending') {
    const at = r.decided_at ? new Date(r.decided_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    t += `\n\n${SR_ST[r.status] || r.status}: ${r.decided_name || ''}${at ? ', ' + at : ''}`;
    if (r.err) t += `\nОшибка: ${r.err}`;
    if (sync && r.status === 'approved') t += '\n⚠️ Цены и шансы встроенных кейсов попадут на сервер, когда владелец откроет админку на сайте.';
  }
  return t.slice(0, 4000);
}
const srKeys = (id: number) => ({ inline_keyboard: [[{ text: '✅ Одобрить', callback_data: `sr:${id}:1` }, { text: '❌ Отклонить', callback_data: `sr:${id}:0` }]] });
const ownerChat = async () => { const { data } = await db.from('bot_cfg').select('v').eq('k', 'owner_chat').maybeSingle(); return data?.v ? Number(data.v) : null; };

const STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const ASK = 'Спасибо за честную оценку. Напишите, пожалуйста, коротко — что можно было сделать лучше?';
const WELCOME = 'Здравствуйте! Это поддержка RUSH CASE 👋\nНапишите вопрос одним сообщением — ответим здесь же. Отвечаем ежедневно, обычно за 15 минут.\nЕсли вопрос по аккаунту — укажите ваш ID на сайте (он в профиле).';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const action = new URL(req.url).searchParams.get('action') || '';
  if (!env('TG_BOT_TOKEN')) return action === 'info' ? json({ bot: null }) : json({ error: 'TG_BOT_TOKEN not set' }, 503);
  try {
    if (action === 'info') return json({ bot: (await getBot()) || null });

    if (action === 'webhook') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== await hookSecret()) return json({ error: 'forbidden' }, 403);
      const u = await req.json().catch(() => ({}));
      const cq = u.callback_query;
      if (cq) {
        // заявка на витрину: решает только привязанный чат владельцев (проверяет shop_decide_tg)
        const sr = /^sr:(\d+):([01])$/.exec(cq.data || '');
        if (sr && cq.message?.chat?.id) {
          const who = [cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(' ') || cq.from?.username || 'Telegram';
          const { data: d, error } = await db.rpc('shop_decide_tg', { p_id: +sr[1], p_ok: sr[2] === '1', p_chat: cq.message.chat.id, p_name: who });
          if (error) { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: /not owners chat/.test(error.message) ? 'Решать можно только в чате владельцев' : 'Ошибка: ' + error.message, show_alert: true }); return json({ ok: true }); }
          const { data: r } = await db.from('shop_requests').select('*').eq('id', +sr[1]).maybeSingle();
          await tg('answerCallbackQuery', { callback_query_id: cq.id, text: d?.ok ? (SR_ST[d.status] || 'Готово') : `Уже решено: ${d?.by || ''}` });
          if (r) await tg('editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: srText(r, !!d?.sync) });
          return json({ ok: true });
        }
        const mt = /^rate:(\d+):([1-5])$/.exec(cq.data || ''), chat = cq.message?.chat?.id;
        if (mt && chat) {
          const { data: k } = await db.from('support_tickets').select('id, thread, support_threads!inner(tg_chat)').eq('id', +mt[1]).maybeSingle();
          // @ts-ignore — вложенная строка диалога
          if (k && Number(k.support_threads?.tg_chat) === Number(chat)) {
            const { data: r } = await db.rpc('_support_rate', { p_ticket: k.id, p_stars: +mt[2] });
            const n = r?.rating || +mt[2];
            await tg('answerCallbackQuery', { callback_query_id: cq.id, text: r?.ok ? 'Спасибо за оценку!' : 'Оценка уже сохранена' });
            await tg('editMessageText', { chat_id: chat, message_id: cq.message.message_id, text: `Обращение закрыто. Ваша оценка: ${STARS(n)} — спасибо!` });
            if (r?.ok && n < 4) await tg('sendMessage', { chat_id: chat, text: ASK });
            return json({ ok: true });
          }
        }
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        return json({ ok: true });
      }
      const m = u.message;
      // привязка чата владельцев: «/link@бот КОД» (в личке — «/link КОД»)
      const lk = /^\/link(?:@\w+)?\s+([A-Za-z0-9]{4,12})\s*$/.exec(m?.text || '');
      if (lk && m.chat) {
        const { data: ok } = await db.rpc('bot_link_chat', { p_code: lk[1], p_chat: m.chat.id, p_title: m.chat.title || [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') });
        await tg('sendMessage', { chat_id: m.chat.id, text: ok ? 'Чат владельцев привязан ✅ Сюда будут приходить заявки сотрудников на изменение витрины.' : 'Код неверный или устарел — возьмите новый в админке (вкладка «Сотрудники»).' });
        return json({ ok: true });
      }
      if (!m || !m.chat || m.chat.type !== 'private') return json({ ok: true });
      const chat = m.chat.id, from = m.from || {};
      const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Без имени', user = from.username || null;
      let text: string = m.text || m.caption || '';
      if (!text) text = m.photo ? '[фото]' : m.sticker ? `[стикер ${m.sticker.emoji || ''}]` : m.voice ? '[голосовое сообщение]' : m.document ? '[файл]' : m.video ? '[видео]' : '[сообщение]';
      else if (m.photo || m.document) text = (m.photo ? '[фото] ' : '[файл] ') + text;
      if (text.trim() === '/start') { await tg('sendMessage', { chat_id: chat, text: WELCOME }); return json({ ok: true }); }
      let { data: th } = await db.from('support_threads').select('id').eq('tg_chat', chat).maybeSingle();
      const isNew = !th;
      if (!th) ({ data: th } = await db.from('support_threads').insert({ tg_chat: chat, tg_name: name, tg_user: user }).select('id').single());
      else await db.from('support_threads').update({ tg_name: name, tg_user: user }).eq('id', th.id);
      if (!th) return json({ ok: true });
      await db.rpc('_support_add', { p_thread: th.id, p_text: text, p_src: 'tg' });
      if (isNew) await tg('sendMessage', { chat_id: chat, text: 'Сообщение получено ✅ Ответим здесь же, обычно в течение 15 минут.' });
      return json({ ok: true });
    }

    const admin = await adminOf(req);
    if (!admin) return json({ error: 'forbidden' }, 403);

    if (action === 'setup') {
      const url = `${env('SUPABASE_URL')}/functions/v1/support-bot?action=webhook`;
      const r = await tg('setWebhook', { url, secret_token: await hookSecret(), allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
      if (!r.ok) return json({ error: r.description || 'telegram error' }, 502);
      botName = null;
      return json({ ok: true, bot: await getBot() });
    }

    if (action === 'reply') {
      const b = await req.json().catch(() => ({}));
      const text = String(b.text || '').trim().slice(0, 4000);
      if (!text) return json({ error: 'empty' }, 400);
      const { data: th } = await db.from('support_threads').select('id, tg_chat').eq('id', +b.thread).maybeSingle();
      if (!th) return json({ error: 'not found' }, 404);
      // отвечать может только ответственный за обращение (свободное — закрепится за ответившим)
      const { error: own } = await db.rpc('_support_must_own', { p_thread: th.id, p_admin: admin.id });
      if (own) return json({ error: own.message }, 403);
      if (th.tg_chat) {
        const r = await tg('sendMessage', { chat_id: th.tg_chat, text });
        if (!r.ok) return json({ error: r.description || 'telegram error' }, 502);
      }
      const { data: id, error } = await db.rpc('_support_add', { p_thread: th.id, p_text: text, p_src: 'admin', p_admin: admin.name });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, id });
    }
    if (action === 'close') {
      const b = await req.json().catch(() => ({}));
      const { data: th } = await db.from('support_threads').select('id, tg_chat, uid').eq('id', +b.thread).maybeSingle();
      if (!th) return json({ error: 'not found' }, 404);
      const { data: r, error } = await db.rpc('_support_close', { p_thread: th.id, p_admin: admin.id });
      if (error) return json({ error: error.message }, 400);
      if (th.tg_chat && !th.uid) {
        const t = r.ticket;
        await tg('sendMessage', { chat_id: th.tg_chat, text: 'Обращение закрыто ✅\nПожалуйста, оцените качество помощи:', reply_markup: { inline_keyboard: [[1, 2, 3, 4, 5].map(n => ({ text: n + ' ⭐', callback_data: `rate:${t}:${n}` }))] } });
      }
      return json({ ok: true, ticket: r.ticket });
    }
    if (action === 'shop_new' || action === 'shop_upd') {
      const b = await req.json().catch(() => ({}));
      const { data: r } = await db.from('shop_requests').select('*').eq('id', +b.id).maybeSingle();
      if (!r) return json({ error: 'not found' }, 404);
      const chat = await ownerChat();
      if (!chat) return json({ ok: true, tg: false });
      if (action === 'shop_new') {
        if (r.uid !== admin.id || r.tg_msg || r.status !== 'pending') return json({ ok: true, tg: false });
        const s = await tg('sendMessage', { chat_id: chat, text: srText(r), reply_markup: srKeys(r.id) });
        if (!s.ok) return json({ error: s.description || 'telegram error' }, 502);
        await db.from('shop_requests').update({ tg_msg: s.result.message_id }).eq('id', r.id);
        return json({ ok: true, tg: true });
      }
      if (r.tg_msg && r.status !== 'pending') await tg('editMessageText', { chat_id: chat, message_id: r.tg_msg, text: srText(r, !!b.sync) });
      return json({ ok: true });
    }
    return json({ error: 'bad action' }, 400);
  } catch (e) {
    console.error('support-bot', (e as Error).message);
    return json({ error: 'server error' }, 500);
  }
});

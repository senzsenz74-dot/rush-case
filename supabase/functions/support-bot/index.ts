// RUSH CASE — Telegram-бот поддержки (Supabase Edge Function «support-bot»). Проверку JWT для функции ВЫКЛЮЧИТЬ:
// Telegram присылает сообщения без токена; его проверяем по секрету вебхука, админа — по его токену.
//
//   POST ?action=info     (сайт)     → {bot}  — @ник бота для кнопки «Написать в Telegram»
//   POST ?action=webhook  (Telegram) сообщение в боте → диалог в админке (support_threads / support_msgs)
//   POST ?action=setup    (админ)    подключить бота: Telegram начнёт присылать сообщения сюда
//   POST ?action=reply    (админ)    {thread, text} — ответ из админки уходит в Telegram от имени бота
//   POST ?action=close    (админ)    {thread} — обращение закрыто: в Telegram — просьба оценить помощь кнопками ⭐1–5
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
    return json({ error: 'bad action' }, 400);
  } catch (e) {
    console.error('support-bot', (e as Error).message);
    return json({ error: 'server error' }, 500);
  }
});

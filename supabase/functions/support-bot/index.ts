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
//   POST ?action=ticket   (база)     {ticket} — новое обращение → в группу поддержки (триггер supabase/staff_perms.sql, шлёт один раз)
//   POST ?action=shift    (база)     {id} — отчёт смены сотрудника → в чат владельцев (supabase/shift_report.sql, шлёт один раз)
//   POST ?action=wd       (база)     {id} — событие вывода скина → в тему выводов (триггер supabase/wd_tg.sql, шлёт один раз)
//   POST ?action=wd_test  (владелец) проверочное сообщение с кнопками в тему выводов
//   POST ?action=fin      (база)     {id} — тема финансов: пополнение, скины в ожидании, отчёт за день в 00:00 МСК (pg_cron),
//                                    баланс маркета меньше 700 ₽ / пополнен (supabase/fin_tg.sql, шлёт один раз)
//   POST ?action=fin_test (владелец) отчёт за сегодня (на текущий момент) в тему финансов — проверка
//   В теме финансов: «/link@бот КОД» (код — вкладка «Сотрудники», «Telegram — финансы»).
//   В теме выводов: «/link@бот КОД» (код — вкладка «Сотрудники», «Telegram — выводы скинов»). Кнопки «Подтвердить» / «Вернуть игроку»
//   работают только у владельцев, которые привязали свой Telegram: боту в личные сообщения «/owner КОД» (код — там же).
//   В группе поддержки: «/link@бот КОД» (код — вкладка «Сотрудники», «Telegram — группа поддержки») привязывает её.
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

// выводы скинов: сообщения в тему выводов (supabase/wd_tg.sql). В группе есть сотрудники — цену покупки не пишем.
const rub = (v: unknown) => (+(v as number) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
const msk = (d = new Date()) => d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const WD_HEAD: Record<string, string> = { wait: '🟡 Вывод ждёт решения', auto: '🔵 Автовывод', done: '✅ Вывод выполнен', fail: '❌ Вывод не удался' };
function wdText(t: Record<string, any>) {
  const L = [`${WD_HEAD[t.ev] || 'Вывод'} · заявка №${t.wid}`, `Игрок: #${t.pid} ${t.name || 'Без ника'}`, `Предмет: ${t.n}`, `Сумма: ${rub(t.price)}`];
  if (t.ev === 'wait') L.push('Почему ждёт: ' + (t.err || (!t.auto ? 'автовывод выключен' : `дороже порога автовывода (${rub(t.auto_max)})`)));
  if (t.ev === 'auto') L.push('Подтверждать не нужно — выводится автоматически.');
  if (t.ev === 'done') L.push(t.err === 'отправлено вручную' ? 'Отмечено на сайте: отправлено вручную.' : 'Предмет у игрока в Steam.');
  if (t.ev === 'fail') L.push('Причина: ' + (t.err || 'вывод отменён'), 'Предмет вернулся в инвентарь игрока.');
  L.push(`Профиль: https://rush-case.online/#/u/${t.pid}`);
  return L.join('\n');
}
const wdKeys = (id: number) => ({ inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: `wd:${id}:a` }, { text: '↩️ Вернуть игроку', callback_data: `wd:${id}:b` }]] });
// решение по заявке: строка, которую дописываем к сообщению с кнопками (кнопки при этом убираются)
const WD_RES: Record<string, string> = { new: '✅ Подтверждено', fail: '↩️ Возвращено игроку', done: '✋ Отмечено «отправлено вручную»' };
const wdDone = (txt: string, line: string) => `${txt}\n\n${line}, ${msk()}`.slice(0, 4096);
async function wdSend(b: Record<string, any>) {
  const { data: t } = await db.rpc('bot_wd_take', { p_id: Number(b.id) || 0 });
  if (!t || !t.chat || !t.wid) return;
  if (t.ev === 'res') { // решили на сайте — у сообщений с кнопками пишем кто, кнопки убираем
    for (const m of t.open || []) {
      await tg('editMessageText', { chat_id: m.chat, message_id: m.msg, text: wdDone(m.txt || '', `${WD_RES[t.st] || 'Решено'} на сайте: ${t.by || 'администратор'}`), disable_web_page_preview: true });
      await db.from('wd_tg').update({ closed: true }).eq('id', m.id);
    }
    return;
  }
  let text = wdText(t);
  const keys = t.ev === 'wait' && t.status === 'wait'; // успели решить до отправки — без кнопок
  if (t.ev === 'wait' && !keys) text += '\n\nУже решено на сайте.';
  const s = await tg('sendMessage', { chat_id: Number(t.chat), ...(t.topic ? { message_thread_id: Number(t.topic) } : {}),
    ...(t.reply ? { reply_parameters: { message_id: Number(t.reply), allow_sending_without_reply: true } } : {}),
    text, disable_web_page_preview: true, ...(keys ? { reply_markup: wdKeys(t.wid) } : {}) });
  if (!s.ok) { console.error('support-bot wd', s.description); return; }
  if (t.ev === 'wait' || t.ev === 'auto') await db.from('wd_tg').update({ chat: Number(t.chat), msg: s.result.message_id, txt: text, ...(keys ? {} : { closed: true }) }).eq('id', t.id);
}

// финансы: тема «Финансы» (supabase/fin_tg.sql). Админские аккаунты в отчёте не считаются — как в статистике админки.
const pl = (n: number, a: string, b: string, c: string) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c; };
const sgn = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + rub(Math.abs(v));
const PAY_HOW: Record<string, string> = { sbp: 'СБП', card: 'карта', intl: 'зарубежная карта', crypto: 'крипта', skins: 'скины' };
const PAY_PROV: Record<string, string> = { '1plat': '1plata', freekassa: 'FreeKassa', prime: 'Prime', brpay: 'Black Rabbit', enot: 'Enot', coinso: 'Coinso',
  skinsmoney: 'SkinsMoney', skinslink: 'Skinslink', test: 'тест', generic: 'касса' };
const isSkins = (p: Record<string, any>) => p.provider === 'skinsmoney' || p.provider === 'skinslink';
const at = (v: unknown) => msk(new Date(v as string));
function depText(t: Record<string, any>) {
  const p = t.pay, prov = PAY_PROV[p.provider] || p.provider || 'касса', who = `Игрок: #${t.pid} ${t.name || 'Без ника'}`, L: string[] = [];
  if (t.ev === 'hold') L.push(`📦 Скины приняты · ${rub(p.amount)} · ${prov}`, who, p.hold_until ? `Зачислятся ${at(p.hold_until)} — 7 дней защиты от отката обмена.` : 'Зачислятся после проверки.');
  else {
    const late = isSkins(p) && p.hold_until;
    L.push(late ? `✅ Зачислены скины · ${rub(p.amount)} · ${prov}` : `💰 Пополнение · ${rub(p.amount)} · ${isSkins(p) ? 'скины' : PAY_HOW[p.method] || p.method} (${prov})`, who);
    if (late) L.push(`7 дней ожидания прошли (платёж от ${at(p.created_at)}).`);
    if (+p.credited > +p.amount) L.push(`Зачислено с бонусом: ${rub(p.credited)} (+${Math.round((p.credited / p.amount - 1) * 100)}%${p.promo ? ', промокод ' + p.promo : ''})`);
    L.push(t.first ? '🎉 Первое пополнение игрока' : `Всего пополнил: ${rub(t.all?.sum)} (${t.all?.n} ${pl(+t.all?.n || 0, 'раз', 'раза', 'раз')})`);
    if (!t.admin) L.push(`За сегодня на сайте: ${rub(t.today?.sum)} (${t.today?.n} шт.)`);
  }
  if (t.admin) L.push('⚠️ Аккаунт администратора — в отчёт не попадает.');
  L.push(`Профиль: https://rush-case.online/#/u/${t.pid}`);
  return L.join('\n');
}
const WDAY = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function reportText(r: Record<string, any>, test = false) {
  const day = String(r.day), dd = day.split('-').reverse().join('.'), n = (v: unknown) => +(v as number) || 0;
  const L: string[] = [test ? `🧪 Проверка — отчёт за сегодня, ${dd}, на ${msk().slice(-5)}` : `📊 Отчёт за ${dd} (${WDAY[new Date(day + 'T12:00:00Z').getUTCDay()]})`, ''];
  L.push(`💰 Пополнения: ${rub(r.dep)} — ${n(r.depN)} ${pl(n(r.depN), 'пополнение', 'пополнения', 'пополнений')}, ${n(r.depP)} ${pl(n(r.depP), 'игрок', 'игрока', 'игроков')}`);
  const by = Object.entries(r.depBy || {}).sort((a, b) => n(b[1]) - n(a[1])).map(([k, v]) => `${PAY_HOW[k] || k} ${rub(v)}`).join(' · ');
  if (by) L.push(`   ${by}`);
  if (n(r.depFirst)) L.push(`   первых пополнений: ${n(r.depFirst)}`);
  if (n(r.holdN)) L.push(`   скины в ожидании 7 дней (всего сейчас): ${n(r.holdN)} на ${rub(r.hold)}`);
  L.push(`📤 Выводы: ${n(r.outN)} — оплачено маркету ${rub(r.out)}`);
  L.push(`🧾 Расходы (Бухгалтерия): ${rub(r.exp)}`);
  L.push(`📈 Чистая прибыль: ${sgn(n(r.net))}`, '   пополнения − расходы − выводы', '');
  L.push(`👥 Новых игроков: ${n(r.reg)}`);
  L.push(`🟢 Онлайн за день: ${n(r.visitors)} ${pl(n(r.visitors), 'посетитель', 'посетителя', 'посетителей')} · пик ${n(r.peak)} одновременно · вошли в аккаунт ${n(r.players)}`);
  const t = r.top;
  L.push(t ? `🏆 Самый дорогой дроп: ${t.n} — ${rub(t.p)}\n   #${t.pid} ${t.name || 'Без ника'} · ${t.t === 'upg' ? 'апгрейд' : t.t === 'con' ? 'контракт' : t.case ? `кейс «${t.case}»` : 'кейс'}` : '🏆 Самый дорогой дроп: дропов не было');
  const w = r.worst;
  L.push(w ? `📉 Самый убыточный кейс: «${w.name}» ${sgn(-n(w.loss))}\n   открыто ${n(w.n)}, потрачено ${rub(w.spent)}, выдано ${rub(w.won)}` : '📉 Убыточных кейсов нет ✅');
  L.push(`💬 Обращений в поддержку: ${n(r.tickets)}${n(r.tickets) ? ` (закрыто ${n(r.ticketsClosed)})` : ''}`);
  L.push(`🏪 Баланс маркета: ${r.mbal == null ? 'неизвестен' : rub(r.mbal) + (r.mbal_at ? ` (на ${at(r.mbal_at)})` : '')}${r.mbal != null && n(r.mbal) < 700 ? ' ⚠️ пополните' : ''}`);
  return L.join('\n');
}
function mktText(t: Record<string, any>) {
  const x = t.x || {};
  if (t.ev === 'mok') return `✅ Баланс маркета пополнен: ${rub(x.bal)}`;
  const L = [x.repeat ? `⏰ Напоминание: на балансе маркета всё ещё ${rub(x.bal)} — меньше ${rub(x.min)} с ${msk(new Date(+x.since * 1000))}` : `⚠️ На балансе маркета ${rub(x.bal)} — меньше ${rub(x.min)}`,
    'Пополните маркет — иначе выводы скинов встанут в «ждёт решения».'];
  if (+t.wait?.n) L.push(`Сейчас ждут вывода: ${t.wait.n} ${pl(+t.wait.n, 'заявка', 'заявки', 'заявок')} на ${rub(t.wait.sum)}`);
  L.push('Напомню через 3 часа, если баланс не пополнят.');
  return L.join('\n');
}
async function finSend(b: Record<string, any>) {
  const { data: t } = await db.rpc('bot_fin_take', { p_id: Number(b.id) || 0 });
  if (!t || !t.chat) return;
  let text = '';
  if (t.ev === 'dep' || t.ev === 'hold') { if (!t.pay) return; text = depText(t); }
  else if (t.ev === 'report') {
    const { data: r, error } = await db.rpc('bot_fin_day', { p_day: t.day });
    text = r && !error ? reportText(r) : `📊 Отчёт за ${String(t.day).split('-').reverse().join('.')} не собрался: ${error?.message || 'нет данных'}`;
  } else if (t.ev === 'mlow' || t.ev === 'mok') text = mktText(t);
  if (!text) return;
  const s = await tg('sendMessage', { chat_id: Number(t.chat), ...(t.topic ? { message_thread_id: Number(t.topic) } : {}), text: text.slice(0, 4096), disable_web_page_preview: true });
  if (!s.ok) console.error('support-bot fin', s.description);
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

    if (action === 'ticket') { // новое обращение → в группу поддержки; база отдаёт его только один раз (bot_ticket_take)
      const b = await req.json().catch(() => ({}));
      const { data: t } = await db.rpc('bot_ticket_take', { p_ticket: Number(b.ticket) || 0 });
      if (!t || !t.chat) return json({ ok: true });
      const who = t.src === 'site' ? `${t.name || 'Игрок'}${t.pid ? ' (#' + t.pid + ')' : ''} — с сайта` : `${t.name || 'Без имени'}${t.tg_user ? ' @' + t.tg_user : ''} — из Telegram-бота`;
      await tg('sendMessage', { chat_id: Number(t.chat), ...(t.topic ? { message_thread_id: Number(t.topic) } : {}), text: `🆕 Новое обращение №${t.ticket}
От: ${who}

${String(t.text || '').slice(0, 3500)}

Ответить: https://rush-case.online/#/admin`, disable_web_page_preview: true });
      return json({ ok: true });
    }

    if (action === 'wd') { // событие вывода скина → тема выводов; база отдаёт его только один раз (bot_wd_take)
      await wdSend(await req.json().catch(() => ({})));
      return json({ ok: true });
    }

    if (action === 'fin') { // тема финансов: пополнение / отчёт за день / баланс маркета; база отдаёт событие только один раз (bot_fin_take)
      await finSend(await req.json().catch(() => ({})));
      return json({ ok: true });
    }

    if (action === 'shift') { // отчёт смены → чат владельцев; база отдаёт его только один раз (bot_shift_take)
      const b = await req.json().catch(() => ({}));
      const { data: t } = await db.rpc('bot_shift_take', { p_id: Number(b.id) || 0 });
      if (!t || !t.chat) return json({ ok: true });
      await tg('sendMessage', { chat_id: Number(t.chat), ...(t.topic ? { message_thread_id: Number(t.topic) } : {}), text: String(t.text || '').slice(0, 4096), disable_web_page_preview: true });
      return json({ ok: true });
    }

    if (action === 'webhook') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== await hookSecret()) return json({ error: 'forbidden' }, 403);
      const u = await req.json().catch(() => ({}));
      const cq = u.callback_query;
      if (cq) {
        // вывод скина «ждёт решения»: решает только привязанный владелец и только в теме выводов (проверяет wd_decide_tg)
        const wm = /^wd:(\d+):([ab])$/.exec(cq.data || '');
        if (wm && cq.message?.chat?.id) {
          const act = wm[2] === 'a' ? 'approve' : 'back';
          const { data: d, error } = await db.rpc('wd_decide_tg', { p_id: +wm[1], p_act: act, p_tg: cq.from?.id || 0, p_chat: cq.message.chat.id });
          if (error) {
            const msg = /not owner/.test(error.message) ? 'Решать выводы могут только владельцы. Владелец: привяжите свой Telegram в админке («Сотрудники» → «Telegram — выводы скинов»).'
              : /not wd chat/.test(error.message) ? 'Решать можно только в теме выводов' : 'Ошибка: ' + error.message;
            await tg('answerCallbackQuery', { callback_query_id: cq.id, text: msg.slice(0, 200), show_alert: true });
            return json({ ok: true });
          }
          if (d?.test) { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: `Кнопки работают ✅ Вы — владелец ${d.by}. Это проверка, ничего не изменилось.`.slice(0, 200), show_alert: true }); return json({ ok: true }); }
          if (!d?.ok) {
            await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Эта заявка уже решена', show_alert: true });
            await tg('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
            return json({ ok: true });
          }
          const line = `${act === 'approve' ? '✅ Подтвердил' : '↩️ Вернул игроку'}: ${d.by}`;
          const L: Record<string, any>[] = d.msgs || [];
          if (!L.some(m => Number(m.msg) === cq.message.message_id)) L.push({ chat: cq.message.chat.id, msg: cq.message.message_id, txt: cq.message.text || '' });
          for (const m of L) await tg('editMessageText', { chat_id: m.chat, message_id: m.msg, text: wdDone(m.txt || '', line), disable_web_page_preview: true });
          await tg('answerCallbackQuery', { callback_query_id: cq.id, text: act === 'approve' ? 'Подтверждено — выводим' : 'Предмет возвращён игроку' });
          if (act === 'approve') await fetch(`${env('SUPABASE_URL')}/functions/v1/market?action=tick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => null); // сразу на покупку, не ждать минуту
          return json({ ok: true });
        }
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
        const title = m.chat.title || [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ');
        const topic = m.is_topic_message && m.message_thread_id ? { message_thread_id: m.message_thread_id } : {}; // группа с темами — отвечаем в ту же тему
        const { data: sup } = await db.rpc('bot_link_sup', { p_code: lk[1], p_chat: m.chat.id, p_title: title, p_topic: topic.message_thread_id || null });
        if (sup) { await tg('sendMessage', { chat_id: m.chat.id, ...topic, text: 'Группа поддержки привязана ✅ Сюда будут приходить новые обращения игроков.' }); return json({ ok: true }); }
        const { data: wd } = await db.rpc('bot_link_wd', { p_code: lk[1], p_chat: m.chat.id, p_title: title, p_topic: topic.message_thread_id || null });
        if (wd) { await tg('sendMessage', { chat_id: m.chat.id, ...topic, text: 'Тема выводов привязана ✅ Сюда будут приходить все выводы скинов, а заявки, которые ждут решения, — с кнопками «Подтвердить» и «Вернуть игроку».' }); return json({ ok: true }); }
        const { data: fin } = await db.rpc('bot_link_fin', { p_code: lk[1], p_chat: m.chat.id, p_title: title, p_topic: topic.message_thread_id || null });
        if (fin) { await tg('sendMessage', { chat_id: m.chat.id, ...topic, text: 'Тема финансов привязана ✅ Сюда будут приходить пополнения, отчёт за день в 00:00 по Москве и сигнал, когда на маркете меньше 700 ₽.' }); return json({ ok: true }); }
        const { data: ok } = await db.rpc('bot_link_chat', { p_code: lk[1], p_chat: m.chat.id, p_title: title, p_topic: topic.message_thread_id || null });
        await tg('sendMessage', { chat_id: m.chat.id, ...topic, text: ok ? 'Чат владельцев привязан ✅ Сюда будут приходить отчёты смен сотрудников.' : 'Код неверный или устарел — возьмите новый в админке (вкладка «Сотрудники»).' });
        return json({ ok: true });
      }
      // Telegram владельца для кнопок выводов: «/owner КОД» (код — админка, «Сотрудники»; лучше в личные сообщения боту)
      const ow = /^\/owner(?:@\w+)?\s+([A-Za-z0-9]{4,12})\s*$/.exec(m?.text || '');
      if (ow && m.chat && m.from?.id) {
        const topic = m.is_topic_message && m.message_thread_id ? { message_thread_id: m.message_thread_id } : {};
        const nm = [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') + (m.from.username ? ' @' + m.from.username : '');
        const { data: o } = await db.rpc('bot_link_owner', { p_code: ow[1], p_tg: m.from.id, p_tg_name: nm });
        await tg('sendMessage', { chat_id: m.chat.id, ...topic, text: o ? `Готово ✅ Это Telegram владельца ${o.name || ''} (#${o.pid}). Теперь у выводов кнопки «Подтвердить» и «Вернуть игроку» работают для вас.` : 'Код неверный или устарел — возьмите новый в админке («Сотрудники» → «Telegram — выводы скинов»).' });
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
    if (action === 'fin_test') { // проверка темы финансов: отчёт за сегодня на текущий момент (только владелец — в отчёте деньги сайта)
      const { data: st } = await db.from('staff').select('role').eq('uid', admin.id).maybeSingle();
      if (st?.role !== 'owner') return json({ error: 'forbidden' }, 403);
      const { data: c } = await db.from('bot_cfg').select('k, v').in('k', ['fin_chat', 'fin_topic']);
      const cf = Object.fromEntries((c || []).map(x => [x.k, x.v]));
      if (!cf.fin_chat) return json({ error: 'тема финансов не привязана' }, 400);
      const { data: r, error } = await db.rpc('bot_fin_day', { p_day: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }) });
      if (error || !r) return json({ error: error?.message || 'нет данных — выполните supabase/fin_tg.sql' }, 500);
      const s = await tg('sendMessage', { chat_id: Number(cf.fin_chat), ...(cf.fin_topic ? { message_thread_id: Number(cf.fin_topic) } : {}), text: reportText(r, true).slice(0, 4096), disable_web_page_preview: true });
      if (!s.ok) return json({ error: s.description || 'telegram error' }, 502);
      return json({ ok: true });
    }
    if (action === 'wd_test') { // проверка темы выводов: сообщение с кнопками (заявка №0 — ничего не меняет)
      const { data: st } = await db.from('staff').select('role').eq('uid', admin.id).maybeSingle();
      if (st?.role !== 'owner') return json({ error: 'forbidden' }, 403);
      const { data: c } = await db.from('bot_cfg').select('k, v').in('k', ['wd_chat', 'wd_topic']);
      const cf = Object.fromEntries((c || []).map(x => [x.k, x.v]));
      if (!cf.wd_chat) return json({ error: 'тема выводов не привязана' }, 400);
      const s = await tg('sendMessage', { chat_id: Number(cf.wd_chat), ...(cf.wd_topic ? { message_thread_id: Number(cf.wd_topic) } : {}),
        text: `🧪 Проверка уведомлений о выводах\nТак придёт заявка, которая ждёт решения: ID игрока, ник, предмет и сумма — и две кнопки.\nНажмите любую: владельцу бот ответит «Кнопки работают», остальным — что решать могут только владельцы. Ничего не изменится.\n\nОтправил: ${admin.name}, ${msk()}`, reply_markup: wdKeys(0) });
      if (!s.ok) return json({ error: s.description || 'telegram error' }, 502);
      return json({ ok: true });
    }
    return json({ error: 'bad action' }, 400);
  } catch (e) {
    console.error('support-bot', (e as Error).message);
    return json({ error: 'server error' }, 500);
  }
});

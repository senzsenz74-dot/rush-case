-- ============================================================
-- RUSH CASE — финансы → Telegram (бот поддержки, группа с темами, отдельная тема «Финансы»)
-- Выполнить один раз в Supabase → SQL Editor ПОСЛЕ wd_tg.sql, payments.sql, skins_hold.sql, finance.sql, market.sql,
-- stats.sql, live.sql и support_tickets.sql. Потом выложить supabase/functions/support-bot и supabase/functions/market
-- (Code → вставить файл → Deploy). Повторный запуск безопасен.
--
-- Что приходит в тему:
--   dep    — пополнение зачислено игроку (ID, ник, сумма, способ, бонус, первое ли, итог дня)
--   hold   — скины приняты, зачислятся через 7 дней (skins_hold.sql); когда зачислятся — придёт dep
--   report — каждый день в 00:00 по Москве отчёт за прошедший день (pg_cron 'fin-report', 21:00 UTC)
--   mlow   — на балансе маркета меньше 700 ₽: сразу, потом раз в 3 часа, пока не пополнят
--   mok    — баланс маркета снова 700 ₽ и больше
-- Баланс маркета обновляет функция market раз в 5 минут (market_balance) — на это смотрит триггер market_cfg_fin.
-- Привязка темы: админка → «Сотрудники» → «Telegram — финансы» → код → в нужной теме «/link@бот КОД» → bot_link_fin.
-- Порог: bot_cfg 'fin_mlow_min' (по умолчанию 700 ₽).
-- Админские аккаунты (profiles.is_admin) в отчёте не считаются — как в статистике админки; их пополнения помечаются.
-- ============================================================

create table if not exists public.bot_cfg (k text primary key, v text, updated_at timestamptz not null default now());
alter table public.bot_cfg enable row level security;
grant all on public.bot_cfg to service_role;

-- события для темы финансов: бот забирает каждое один раз
create table if not exists public.fin_tg (
  id bigserial primary key,
  ev text not null check (ev in ('dep', 'hold', 'report', 'mlow', 'mok')),
  pay uuid references public.payments (id) on delete cascade,
  day date,                -- для report: за какой день (по Москве)
  x jsonb,                 -- для mlow/mok: баланс, порог, с какого времени мало
  sent boolean,
  created_at timestamptz not null default now()
);
create index if not exists fin_tg_day on public.fin_tg (ev, day);
alter table public.fin_tg enable row level security; -- политик нет: только функции и бот
grant all on public.fin_tg to service_role;
grant usage, select on sequence public.fin_tg_id_seq to service_role;

-- ---------- тема финансов: привязка кодом (как тема выводов) ----------
create or replace function public.admin_fin_chat(p_new_code boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_new_code then
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    insert into public.bot_cfg (k, v) values ('fin_link_code', c || ':' || extract(epoch from now() + interval '30 minutes')::bigint)
      on conflict (k) do update set v = excluded.v, updated_at = now();
  end if;
  return jsonb_build_object('chat', (select v from public.bot_cfg where k = 'fin_chat'), 'title', (select v from public.bot_cfg where k = 'fin_chat_title'),
    'topic', (select v from public.bot_cfg where k = 'fin_topic'), 'linked_at', (select updated_at from public.bot_cfg where k = 'fin_chat'), 'code', c);
end $$;
create or replace function public.bot_link_fin(p_code text, p_chat bigint, p_title text, p_topic bigint default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select bot_cfg.v into v from public.bot_cfg where k = 'fin_link_code';
  if v is null or split_part(v, ':', 1) <> upper(trim(p_code)) or split_part(v, ':', 2)::bigint < extract(epoch from now()) then return false; end if;
  insert into public.bot_cfg (k, v) values ('fin_chat', p_chat::text), ('fin_chat_title', left(coalesce(p_title, ''), 100)), ('fin_topic', p_topic::text)
    on conflict (k) do update set v = excluded.v, updated_at = now();
  delete from public.bot_cfg where k = 'fin_link_code';
  return true;
end $$;

-- ---------- названия кейсов для отчёта (встроенные кейсы живут в коде сайта — admSync присылает их сюда) ----------
create or replace function public.admin_case_names(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if jsonb_typeof(p) <> 'object' or length(p::text) > 60000 then raise exception 'bad names'; end if;
  insert into public.bot_cfg (k, v) values ('case_names', p::text) on conflict (k) do update set v = excluded.v, updated_at = now();
end $$;
create or replace function public._case_name(p_id text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(v->>'name', '') from public.site_cfg where k = 'case:' || p_id),
    (select name from public.custom_cases where id = p_id),
    (select (v::jsonb)->>p_id from public.bot_cfg where k = 'case_names'),
    p_id)
$$;

-- ---------- событие → бот (pg_net); тема не привязана — ничего не делаем ----------
create extension if not exists pg_net with schema extensions;
create or replace function public._fin_ev(p_ev text, p_pay uuid default null, p_day date default null, p_x jsonb default null) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare nid bigint;
begin
  if not exists (select 1 from public.bot_cfg where k = 'fin_chat') then return null; end if;
  insert into public.fin_tg (ev, pay, day, x) values (p_ev, p_pay, p_day, p_x) returning id into nid;
  perform net.http_post(url := 'https://gkeexoyrxnsarosymdyp.supabase.co/functions/v1/support-bot?action=fin',
    headers := '{"content-type":"application/json"}'::jsonb, body := jsonb_build_object('id', nid));
  return nid;
end $$;

-- пополнение зачислено (paid) или скины приняты в ожидание (hold)
create or replace function public._fin_pay() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then perform public._fin_ev('dep', new.id);
  elsif new.status = 'hold' and (tg_op = 'INSERT' or old.status is distinct from 'hold') then perform public._fin_ev('hold', new.id);
  end if;
  return new;
exception when others then return new; -- Telegram не должен ломать зачисление
end $$;
drop trigger if exists payments_fin on public.payments;
create trigger payments_fin after insert or update of status on public.payments for each row execute function public._fin_pay();

-- баланс маркета: меньше порога — сразу, потом раз в 3 часа; снова в норме — «пополнен»
create or replace function public._fin_mkt() returns trigger language plpgsql security definer set search_path = public as $$
declare lim numeric := coalesce((select nullif(v, '')::numeric from public.bot_cfg where k = 'fin_mlow_min'), 700); st public.bot_cfg;
begin
  if new.balance is null or not exists (select 1 from public.bot_cfg where k = 'fin_chat') then return new; end if;
  select * into st from public.bot_cfg where k = 'fin_mlow'; -- есть строка = сейчас «мало»; v — с какого времени, updated_at — последнее сообщение
  if new.balance < lim then
    if st.k is null or st.updated_at < now() - interval '3 hours' then
      insert into public.bot_cfg (k, v) values ('fin_mlow', extract(epoch from now())::bigint::text)
        on conflict (k) do update set updated_at = now();
      perform public._fin_ev('mlow', null, null, jsonb_build_object('bal', new.balance, 'min', lim, 'repeat', st.k is not null,
        'since', coalesce(nullif(st.v, '')::bigint, extract(epoch from now())::bigint)));
    end if;
  elsif st.k is not null then
    delete from public.bot_cfg where k = 'fin_mlow';
    perform public._fin_ev('mok', null, null, jsonb_build_object('bal', new.balance, 'min', lim));
  end if;
  return new;
exception when others then return new; -- Telegram не должен ломать выводы
end $$;
drop trigger if exists market_cfg_fin on public.market_cfg;
create trigger market_cfg_fin after update of balance on public.market_cfg for each row execute function public._fin_mkt();

-- ---------- отчёт за день по Москве (без админских аккаунтов, как в админке) ----------
create or replace function public.bot_fin_day(p_day date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d_from timestamptz := p_day::timestamp at time zone 'Europe/Moscow'; d_to timestamptz := (p_day + 1)::timestamp at time zone 'Europe/Moscow';
  adm uuid[]; r jsonb;
begin
  adm := coalesce((select array_agg(id) from public.profiles where is_admin), '{}');
  with pay as (
    select p.*, case when p.provider in ('skinsmoney', 'skinslink') then 'skins' else p.method end as how,
      not exists (select 1 from public.payments q where q.uid = p.uid and q.id <> p.id and q.status = 'paid' and q.paid_at < p.paid_at) as first
    from public.payments p where p.status = 'paid' and p.paid_at >= d_from and p.paid_at < d_to and p.uid <> all (adm)),
  wd as (
    select w.*, case when w.paid is null then w.price when w.paid > w.price * 20 then w.paid / 100 else w.paid end as cost
    from public.withdrawals w where w.status in ('done', 'prot') and w.created_at >= d_from and w.created_at < d_to and w.uid <> all (adm)),
  ev as (select * from public.site_events e where e.ts >= d_from and e.ts < d_to),
  admsid as (select distinct e.sid from public.site_events e where e.uid = any (adm)),
  evo as (select * from ev where (uid is null or uid <> all (adm)) and sid not in (select sid from admsid)),
  slots as (select floor(extract(epoch from ts) / 300) as s, count(distinct sid) as n from evo where kind = 'hb' group by 1),
  cs as (
    select e.c, sum(greatest(e.x, 1)) as n, sum(e.amount) as spent, sum(e.won) as won, sum(e.won) - sum(e.amount) as loss
    from ev e where e.kind = 'open' and e.c is not null and (e.uid is null or e.uid <> all (adm)) group by e.c),
  drop1 as (
    select d.n, d.t, d.c, c.p, pr.pid, pr.name from public.live_drops d join public.catalog c on c.n = d.n left join public.profiles pr on pr.id = d.uid
    where d.ts >= d_from and d.ts < d_to and d.uid <> all (adm) order by c.p desc, d.id limit 1),
  fo as (select * from public.fin_ops o where o.kind = 'expense' and o.op_date = p_day)
  select jsonb_build_object(
    'day', p_day, 'from', d_from, 'to', d_to,
    'dep', (select coalesce(sum(amount), 0) from pay), 'depN', (select count(*) from pay), 'depP', (select count(distinct uid) from pay),
    'depFirst', (select count(*) from pay where first),
    'depBy', (select coalesce(jsonb_object_agg(how, s), '{}'::jsonb) from (select how, sum(amount) s from pay group by how) x),
    'hold', (select coalesce(sum(amount), 0) from public.payments where status = 'hold' and uid <> all (adm)),
    'holdN', (select count(*) from public.payments where status = 'hold' and uid <> all (adm)),
    'exp', (select coalesce(sum(amount), 0) from fo), 'expN', (select count(*) from fo),
    'out', (select coalesce(sum(cost), 0) from wd), 'outN', (select count(*) from wd), 'outSite', (select coalesce(sum(price), 0) from wd),
    'reg', (select count(*) from public.profiles where created_at >= d_from and created_at < d_to),
    'visitors', (select count(distinct sid) from evo where kind = 'hb'),
    'players', (select count(distinct uid) from evo where uid is not null),
    'peak', (select coalesce(max(n), 0) from slots),
    'top', (select to_jsonb(d) || jsonb_build_object('case', case when d.c is not null then public._case_name(d.c) end) from drop1 d),
    'worst', (select jsonb_build_object('c', c, 'name', public._case_name(c), 'n', n, 'spent', spent, 'won', won, 'loss', loss) from cs where loss > 0 order by loss desc limit 1),
    'tickets', (select count(*) from public.support_tickets where opened_at >= d_from and opened_at < d_to),
    'ticketsClosed', (select count(*) from public.support_tickets where opened_at >= d_from and opened_at < d_to and closed_at is not null),
    'mbal', (select balance from public.market_cfg where id = 1), 'mbal_at', (select balance_at from public.market_cfg where id = 1)
  ) into r;
  return r || jsonb_build_object('net', (r->>'dep')::numeric - (r->>'exp')::numeric - (r->>'out')::numeric);
end $$;

-- pg_cron в 00:00 по Москве: отчёт за прошедший день (один раз за день)
create or replace function public.fin_report_send() returns bigint
language plpgsql security definer set search_path = public as $$
declare d date := ((now() - interval '1 hour') at time zone 'Europe/Moscow')::date; -- запуск в 00:00 МСК → вчерашний день
begin
  if exists (select 1 from public.fin_tg where ev = 'report' and day = d) then return null; end if;
  return public._fin_ev('report', null, d);
end $$;

-- бот забирает событие один раз (повторный вызов ничего не пришлёт)
create or replace function public.bot_fin_take(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.fin_tg; p public.payments; pr public.profiles; f timestamptz; o jsonb;
begin
  update public.fin_tg set sent = true where id = p_id and sent is null and created_at > now() - interval '1 hour' returning * into e;
  if e.id is null then return null; end if;
  o := jsonb_build_object('id', e.id, 'ev', e.ev, 'day', e.day, 'x', e.x,
    'chat', (select v from public.bot_cfg where k = 'fin_chat'), 'topic', (select v from public.bot_cfg where k = 'fin_topic'));
  if e.ev = 'mlow' then
    o := o || jsonb_build_object('wait', (select jsonb_build_object('n', count(*), 'sum', coalesce(sum(price), 0)) from public.withdrawals where status in ('wait', 'new')));
  end if;
  if e.pay is null then return o; end if;
  select * into p from public.payments where id = e.pay;
  select * into pr from public.profiles where id = p.uid;
  f := date_trunc('day', now() at time zone 'Europe/Moscow') at time zone 'Europe/Moscow';
  return o || jsonb_build_object('pay', jsonb_build_object('amount', p.amount, 'credited', p.credited, 'method', p.method, 'provider', p.provider,
      'promo', p.promo, 'hold_until', p.hold_until, 'created_at', p.created_at, 'status', p.status),
    'pid', pr.pid, 'name', pr.name, 'admin', coalesce(pr.is_admin, false),
    'first', not exists (select 1 from public.payments q where q.uid = p.uid and q.id <> p.id and q.status = 'paid' and q.paid_at < coalesce(p.paid_at, now())),
    'all', (select jsonb_build_object('n', count(*), 'sum', coalesce(sum(amount), 0)) from public.payments where uid = p.uid and status = 'paid'),
    'today', (select jsonb_build_object('n', count(*), 'sum', coalesce(sum(q.amount), 0)) from public.payments q join public.profiles qp on qp.id = q.uid
      where q.status = 'paid' and q.paid_at >= f and not coalesce(qp.is_admin, false)));
end $$;

revoke all on function public.admin_fin_chat(boolean), public.bot_link_fin(text, bigint, text, bigint), public.admin_case_names(jsonb), public._case_name(text),
  public._fin_ev(text, uuid, date, jsonb), public._fin_pay(), public._fin_mkt(), public.bot_fin_day(date), public.fin_report_send(), public.bot_fin_take(bigint)
  from public, anon, authenticated;
grant execute on function public.admin_fin_chat(boolean), public.admin_case_names(jsonb) to authenticated;
grant execute on function public.bot_link_fin(text, bigint, text, bigint), public.bot_fin_day(date), public.bot_fin_take(bigint) to service_role;

-- ---------- каждый день в 21:00 UTC = 00:00 по Москве ----------
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'fin-report';
select cron.schedule('fin-report', '0 21 * * *', $cron$ select public.fin_report_send() $cron$);

select 'финансы → Telegram готовы; тема: ' || coalesce((select v from public.bot_cfg where k = 'fin_chat_title'), 'не привязана') as result;

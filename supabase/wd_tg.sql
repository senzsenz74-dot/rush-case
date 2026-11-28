-- ============================================================
-- RUSH CASE — выводы скинов → Telegram (бот поддержки, группа с темами, отдельная тема)
-- Выполнить один раз в Supabase → SQL Editor ПОСЛЕ market.sql, staff_perms.sql и shift_report.sql.
-- Потом выложить supabase/functions/support-bot (Code → вставить файл → Deploy).
--
-- Как работает:
--   тема для выводов: админка → «Сотрудники» → «Telegram — выводы скинов» → код → в нужной теме «/link@бот КОД» → bot_link_wd
--   владельцы: там же «Мой Telegram для кнопок» → код → боту в личные сообщения «/owner КОД» → owner_tg
--     (кнопки «Подтвердить» / «Вернуть игроку» работают только у привязанных владельцев и только в теме выводов)
--   любое изменение заявки на вывод → триггер пишет событие в wd_tg и зовёт support-bot ?action=wd → bot_wd_take (отдаёт событие один раз)
--     wait — ждёт решения админа: сообщение с кнопками
--     auto — автовывод: просто уведомление
--     done — выведено, fail — не получилось (с причиной): оба ответом на первое сообщение о заявке
--     res  — решение принято на сайте: у сообщения с кнопками дописывается, кто решил, кнопки убираются
--   кнопка в Telegram → wd_decide_tg: то же, что «Купить» / «Вернуть игроку» во вкладке «Выводы Steam»
-- ============================================================

-- настройки бота (не секреты) — та же таблица, что в shop_requests.sql / staff_perms.sql
create table if not exists public.bot_cfg (k text primary key, v text, updated_at timestamptz not null default now());
alter table public.bot_cfg enable row level security; -- политик нет: только функции и бот (service_role)
grant all on public.bot_cfg to service_role;

-- Telegram владельцев (кто может нажимать кнопки выводов)
create table if not exists public.owner_tg (
  uid uuid primary key references public.profiles (id) on delete cascade,
  tg_id bigint not null unique,
  tg_name text,
  linked_at timestamptz not null default now()
);
alter table public.owner_tg enable row level security; -- политик нет: только функции и бот
grant all on public.owner_tg to service_role;

-- события выводов для Telegram (что отправлено и какое сообщение потом править)
create table if not exists public.wd_tg (
  id bigserial primary key,
  wid bigint not null references public.withdrawals (id) on delete cascade,
  ev text not null check (ev in ('wait', 'auto', 'done', 'fail', 'res')),
  st text,                 -- статус заявки в момент события
  err text,                -- причина (ждёт решения / не получилось)
  by_name text,            -- кто решил на сайте (для res)
  sent boolean,            -- бот уже забрал событие
  chat bigint, msg bigint, txt text, -- отправленное сообщение (для wait/auto)
  closed boolean,          -- у сообщения с кнопками уже записано решение
  created_at timestamptz not null default now()
);
create index if not exists wd_tg_wid on public.wd_tg (wid, id);
alter table public.wd_tg enable row level security;
grant all on public.wd_tg to service_role;
grant usage, select on sequence public.wd_tg_id_seq to service_role;

-- ---------- тема выводов: привязка кодом (как группа поддержки) ----------
create or replace function public.admin_wd_chat(p_new_code boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_new_code then
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    insert into public.bot_cfg (k, v) values ('wd_link_code', c || ':' || extract(epoch from now() + interval '30 minutes')::bigint)
      on conflict (k) do update set v = excluded.v, updated_at = now();
  end if;
  return jsonb_build_object('chat', (select v from public.bot_cfg where k = 'wd_chat'), 'title', (select v from public.bot_cfg where k = 'wd_chat_title'),
    'topic', (select v from public.bot_cfg where k = 'wd_topic'), 'linked_at', (select updated_at from public.bot_cfg where k = 'wd_chat'), 'code', c);
end $$;
create or replace function public.bot_link_wd(p_code text, p_chat bigint, p_title text, p_topic bigint default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select bot_cfg.v into v from public.bot_cfg where k = 'wd_link_code';
  if v is null or split_part(v, ':', 1) <> upper(trim(p_code)) or split_part(v, ':', 2)::bigint < extract(epoch from now()) then return false; end if;
  insert into public.bot_cfg (k, v) values ('wd_chat', p_chat::text), ('wd_chat_title', left(coalesce(p_title, ''), 100)), ('wd_topic', p_topic::text)
    on conflict (k) do update set v = excluded.v, updated_at = now();
  delete from public.bot_cfg where k = 'wd_link_code';
  return true;
end $$;

-- ---------- Telegram владельца: каждый привязывает себя сам ----------
create or replace function public.admin_my_tg(p_new_code boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text; o public.owner_tg;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_new_code then
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    insert into public.bot_cfg (k, v) values ('owner_code:' || auth.uid(), c || ':' || extract(epoch from now() + interval '30 minutes')::bigint)
      on conflict (k) do update set v = excluded.v, updated_at = now();
  end if;
  select * into o from public.owner_tg where uid = auth.uid();
  return jsonb_build_object('linked', o.uid is not null, 'tg_name', o.tg_name, 'linked_at', o.linked_at, 'code', c);
end $$;
create or replace function public.bot_link_owner(p_code text, p_tg bigint, p_tg_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.bot_cfg; u uuid;
begin
  select * into r from public.bot_cfg where left(k, 11) = 'owner_code:' and split_part(v, ':', 1) = upper(trim(p_code)) limit 1;
  if r.k is null then return null; end if;
  delete from public.bot_cfg where k = r.k; -- код одноразовый
  if split_part(r.v, ':', 2)::bigint < extract(epoch from now()) then return null; end if;
  u := substr(r.k, 12)::uuid;
  if not exists (select 1 from public.staff where uid = u and role = 'owner') then return null; end if;
  delete from public.owner_tg where tg_id = p_tg and uid <> u;
  insert into public.owner_tg (uid, tg_id, tg_name) values (u, p_tg, left(coalesce(p_tg_name, ''), 100))
    on conflict (uid) do update set tg_id = excluded.tg_id, tg_name = excluded.tg_name, linked_at = now();
  return (select jsonb_build_object('pid', p.pid, 'name', p.name) from public.profiles p where p.id = u);
end $$;

-- ---------- события: триггер на заявки ----------
create extension if not exists pg_net with schema extensions;
create or replace function public._wd_tg() returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare evs text[] := '{}'; e text; nid bigint; who text;
begin
  if not exists (select 1 from public.bot_cfg where k = 'wd_chat') then return new; end if;
  if tg_op = 'INSERT' then
    evs := array[case when new.status = 'wait' then 'wait' else 'auto' end];
  elsif new.status is distinct from old.status then
    -- решение по заявке «ждёт решения» на сайте (из Telegram сообщение правит сам бот)
    if old.status = 'wait' and coalesce(current_setting('rc.wd_tg', true), '') <> '1' then evs := evs || 'res'::text; end if;
    if new.status = 'wait' then evs := evs || 'wait'::text;
    elsif new.status = 'done' then evs := evs || 'done'::text;
    elsif new.status = 'fail' and old.status <> 'wait' then evs := evs || 'fail'::text; -- «Вернуть игроку» из «ждёт решения» — это решение, оно уже в res
    end if;
  end if;
  if cardinality(evs) = 0 then return new; end if;
  if 'res' = any(evs) then select coalesce(nullif(p.name, ''), 'Без ника') || ' (#' || p.pid || ')' into who from public.profiles p where p.id = auth.uid(); end if;
  foreach e in array evs loop
    insert into public.wd_tg (wid, ev, st, err, by_name) values (new.id, e, new.status, new.err, case when e = 'res' then coalesce(who, 'администратор') end)
      returning id into nid;
    perform net.http_post(url := 'https://gkeexoyrxnsarosymdyp.supabase.co/functions/v1/support-bot?action=wd',
      headers := '{"content-type":"application/json"}'::jsonb, body := jsonb_build_object('id', nid));
  end loop;
  return new;
exception when others then return new; -- Telegram не должен ломать выводы
end $$;
drop trigger if exists withdrawals_tg on public.withdrawals;
create trigger withdrawals_tg after insert or update of status on public.withdrawals for each row execute function public._wd_tg();

-- бот забирает событие один раз (повторный вызов ничего не пришлёт)
create or replace function public.bot_wd_take(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.wd_tg; w public.withdrawals; c public.market_cfg; pp bigint; pn text; first_msg bigint; op jsonb;
begin
  update public.wd_tg set sent = true where id = p_id and sent is null and created_at > now() - interval '1 hour' returning * into t;
  if t.id is null then return null; end if;
  select * into w from public.withdrawals where id = t.wid;
  select * into c from public.market_cfg where id = 1;
  select p.pid, p.name into pp, pn from public.profiles p where p.id = w.uid;
  select m.msg into first_msg from public.wd_tg m where m.wid = t.wid and m.ev in ('wait', 'auto') and m.msg is not null order by m.id limit 1;
  if t.ev = 'res' then
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'chat', m.chat, 'msg', m.msg, 'txt', m.txt) order by m.id), '[]'::jsonb) into op
    from public.wd_tg m where m.wid = t.wid and m.ev = 'wait' and m.msg is not null and m.closed is null;
  end if;
  return jsonb_build_object('id', t.id, 'ev', t.ev, 'st', t.st, 'err', t.err, 'by', t.by_name, 'wid', w.id, 'status', w.status,
    'pid', pp, 'name', pn, 'n', w.n, 'price', w.price, 'auto', c.auto, 'auto_max', c.auto_max,
    'chat', (select v from public.bot_cfg where k = 'wd_chat'), 'topic', (select v from public.bot_cfg where k = 'wd_topic'),
    'reply', first_msg, 'open', op);
end $$;

-- кнопка в Telegram: только привязанный владелец и только в теме выводов; p_id = 0 — проверочное сообщение из админки
create or replace function public.wd_decide_tg(p_id bigint, p_act text, p_tg bigint, p_chat bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid; who text; w public.withdrawals; msgs jsonb;
begin
  if p_chat::text is distinct from (select v from public.bot_cfg where k = 'wd_chat') then raise exception 'not wd chat'; end if;
  select o.uid into u from public.owner_tg o join public.staff s on s.uid = o.uid and s.role = 'owner' where o.tg_id = p_tg;
  if u is null then raise exception 'not owner'; end if;
  select coalesce(nullif(p.name, ''), 'Без ника') || ' (#' || p.pid || ')' into who from public.profiles p where p.id = u;
  if p_id = 0 then return jsonb_build_object('ok', false, 'test', true, 'by', who); end if;
  select * into w from public.withdrawals where id = p_id for update;
  if w.id is null then raise exception 'not found'; end if;
  if w.status <> 'wait' then return jsonb_build_object('ok', false, 'status', w.status, 'by', who); end if;
  perform set_config('rc.wd_tg', '1', true);
  if p_act = 'approve' then
    update public.withdrawals set status = 'new', err = null, updated_at = now() where id = p_id;
    perform public._inv_patch(w.uid, w.item, 'pend', jsonb_build_object('ws', 'new'));
  elsif p_act = 'back' then
    perform public.market_set(p_id, 'fail', jsonb_build_object('err', 'вывод отменён администратором — предмет возвращён'));
  else raise exception 'bad action';
  end if;
  perform set_config('rc.wd_tg', '', true);
  with x as (update public.wd_tg set closed = true where wid = p_id and ev = 'wait' and msg is not null and closed is null returning id, chat, msg, txt)
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'chat', x.chat, 'msg', x.msg, 'txt', x.txt)), '[]'::jsonb) into msgs from x;
  return jsonb_build_object('ok', true, 'act', p_act, 'by', who, 'msgs', msgs);
end $$;

revoke all on function public.admin_wd_chat(boolean), public.bot_link_wd(text, bigint, text, bigint), public.admin_my_tg(boolean),
  public.bot_link_owner(text, bigint, text), public._wd_tg(), public.bot_wd_take(bigint), public.wd_decide_tg(bigint, text, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.admin_wd_chat(boolean), public.admin_my_tg(boolean) to authenticated;
grant execute on function public.bot_link_wd(text, bigint, text, bigint), public.bot_link_owner(text, bigint, text),
  public.bot_wd_take(bigint), public.wd_decide_tg(bigint, text, bigint, bigint) to service_role;

select 'выводы → Telegram готовы; тема: ' || coalesce((select v from public.bot_cfg where k = 'wd_chat_title'), 'не привязана') as result;

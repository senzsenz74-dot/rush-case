-- RUSH CASE — отчёт смены сотрудника → чат владельцев в Telegram (владелец 19.11.2026, этап 3 ПЛАН_РОЛИ.md)
--   staff_log    — что сотрудник менял (пишут триггеры на таблицах, только для role = 'staff')
--   staff_ping   — «сотрудник в админке» раз в минуту (сайт) → время в админке и какие окна открывал
--   staff_shifts — отчёты: кнопка «Сдать смену» (staff_shift_submit) или авто через 30 мин после конца смены по графику (pg_cron)
--   отправка: триггер → pg_net → support-bot ?action=shift → bot_shift_take (отдаёт отчёт один раз) → чат владельцев
--   чат владельцев: admin_owner_chat (код) → в группе «/link@бот КОД» → bot_link_chat
-- Запускать ПОСЛЕ staff_perms.sql. Можно запускать повторно.

create table if not exists public.bot_cfg (k text primary key, v text, updated_at timestamptz not null default now());
alter table public.bot_cfg enable row level security;
grant all on public.bot_cfg to service_role;

create table if not exists public.staff_log (id bigserial primary key, uid uuid not null, ts timestamptz not null default now(), tbl text, detail text);
create index if not exists staff_log_uid on public.staff_log (uid, ts);
create table if not exists public.staff_ping (uid uuid not null, ts timestamptz not null default now(), tab text);
create index if not exists staff_ping_uid on public.staff_ping (uid, ts);
create table if not exists public.staff_shifts (id bigserial primary key, uid uuid not null, from_at timestamptz not null, to_at timestamptz not null,
  comment text, auto boolean not null default false, sent boolean, created_at timestamptz not null default now());
create index if not exists staff_shifts_uid on public.staff_shifts (uid, to_at desc);
alter table public.staff_log enable row level security;
alter table public.staff_ping enable row level security;
alter table public.staff_shifts enable row level security;
drop policy if exists "owner read" on public.staff_log;
create policy "owner read" on public.staff_log for select to authenticated using (public.is_admin());
drop policy if exists "owner read" on public.staff_shifts;
create policy "owner read" on public.staff_shifts for select to authenticated using (public.is_admin() or uid = auth.uid());

-- ---------- журнал действий: один триггер на все таблицы ----------
create or replace function public._staff_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare v_u uuid := auth.uid(); o jsonb; n jsonb; x jsonb; ident text; lbl text; ch text := ''; key text; a text; b text;
  ru jsonb := '{"disabled":"закрыт","luck":"удача","status":"статус","active":"активен","amount":"сумма","is_new":"новое","hit":"хит","price":"цена",
    "name":"название","title":"название","max_uses":"лимит","reward":"награда","pct":"процент","starts_at":"начало","ends_at":"конец","prize_pool":"призовой фонд"}';
begin
  if v_u is null or not exists (select 1 from public.staff where uid = v_u and role = 'staff') then return null; end if;
  o := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  x := coalesce(n, o);
  lbl := case tg_table_name
    when 'site_cfg' then case when x->>'k' like 'case:%' then 'Кейс' else 'Настройка' end
    when 'case_settings' then 'Кейс' when 'custom_cases' then 'Кейс' when 'promo_codes' then 'Промокод' when 'withdrawals' then 'Вывод'
    when 'balance_grants' then 'Начисление' when 'profiles' then 'Игрок' when 'fin_ops' then 'Бухгалтерия' when 'giveaways' then 'Розыгрыш'
    when 'ga_cfg' then 'Розыгрыши: настройки' when 'ref_partners' then 'Партнёр' when 'player_notices' then 'Уведомление'
    when 'tournaments' then 'Турнир' when 'tournament_teams' then 'Турнир: команда' else tg_table_name end;
  ident := case
    when tg_table_name = 'site_cfg' then case when x->>'k' like 'case:%' then substr(x->>'k', 6) else x->>'k' end
    when tg_table_name = 'profiles' then '#' || coalesce(x->>'pid', '?')
    when tg_table_name = 'case_settings' then '«' || coalesce(x->>'id', '?') || '»'
    when tg_table_name in ('balance_grants', 'player_notices') then coalesce('#' || (select p.pid::text from public.profiles p where p.id = (x->>'uid')::uuid), '')
    else coalesce('«' || coalesce(x->>'name', x->>'title', x->>'code') || '»', '№' || (x->>'id'), '') end;
  if tg_op = 'UPDATE' then
    for key in select jsonb_object_keys(n) loop
      continue when key in ('updated_at', 'updated_by', 'data', 'v', 'balance_at') or (o->key) is not distinct from (n->key);
      a := o->>key; b := n->>key;
      ch := ch || case when ch = '' then '' else ', ' end || coalesce(ru->>key, key)
        || case when length(coalesce(a, '')) <= 30 and length(coalesce(b, '')) <= 30 then ': ' || coalesce(a, '—') || ' → ' || coalesce(b, '—') else '' end;
    end loop;
    if ch = '' and tg_table_name <> 'site_cfg' then return null; end if; -- ничего важного не поменялось
  end if;
  insert into public.staff_log (uid, tbl, detail) values (v_u, tg_table_name, left(lbl || ' ' || ident || ': '
    || case tg_op when 'INSERT' then 'создано' when 'DELETE' then 'удалено' else 'изменено' end
    || case when tg_op = 'INSERT' and tg_table_name = 'balance_grants' then ' ' || coalesce(x->>'amount', '') || ' ₽' else '' end
    || case when ch <> '' then ' (' || ch || ')' else '' end, 300));
  return null;
exception when others then return null; -- журнал не должен ломать работу
end $$;

do $do$
declare t record;
begin
  for t in select * from (values
      ('site_cfg', 'insert or update or delete', null), ('case_settings', 'insert or update or delete', null), ('custom_cases', 'insert or update or delete', null),
      ('promo_codes', 'insert or update or delete', null), ('withdrawals', 'update', null), ('balance_grants', 'insert', null),
      ('profiles', 'update of luck', 'old.luck is distinct from new.luck'), ('fin_ops', 'insert or update or delete', null),
      ('giveaways', 'insert or update or delete', null), ('ga_cfg', 'insert or update', null), ('ref_partners', 'insert or update or delete', null),
      ('player_notices', 'insert', null), ('tournaments', 'insert or update or delete', null), ('tournament_teams', 'delete', null)) as v(tb, ev, cond) loop
    if to_regclass('public.' || t.tb) is null then raise notice 'нет таблицы %, пропускаем', t.tb; continue; end if;
    execute format('drop trigger if exists staff_audit on public.%I', t.tb);
    execute format('create trigger staff_audit after %s on public.%I for each row %s execute function public._staff_audit()', t.ev, t.tb,
      case when t.cond is null then '' else 'when (' || t.cond || ')' end);
  end loop;
end $do$;

-- ---------- «я в админке»: раз в минуту с сайта ----------
create or replace function public.staff_ping(p_tab text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.staff where uid = auth.uid() and role = 'staff') then return; end if;
  if exists (select 1 from public.staff_ping where uid = auth.uid() and ts > now() - interval '40 seconds') then return; end if;
  insert into public.staff_ping (uid, tab) values (auth.uid(), left(p_tab, 20));
end $$;

-- ---------- текст отчёта ----------
create or replace function public._shift_text(p_uid uuid, p_from timestamptz, p_to timestamptz, p_comment text, p_auto boolean) returns text
language plpgsql stable security definer set search_path = public as $$
declare nm text; v_pid bigint; mins int; tabs text; cl int; rt numeric; rn int; logs text; nlog int; wd int; gr int; t text;
  tabname jsonb := '{"dash":"Дашборд","money":"Касса","books":"Бухгалтерия","online":"Онлайн","cases":"Кейсы","bets":"Ставки","upg":"Апгрейд","crash":"Краш",
    "build":"Собери сам","tower":"Башня","out":"Выводы Steam","players":"Игроки","support":"Поддержка","promo":"Промокоды","ga":"Розыгрыши","ref":"Рефералы",
    "shop":"Управление витриной","news":"Новости","ann":"Объявление","tours":"Турниры"}';
  f text := 'DD.MM HH24:MI';
begin
  select p.name, p.pid into nm, v_pid from public.profiles p where p.id = p_uid;
  select count(distinct date_trunc('minute', ts)) into mins from public.staff_ping where uid = p_uid and ts between p_from and p_to;
  select string_agg(coalesce(tabname->>tab, tab), ', ' order by c desc) into tabs
    from (select tab, count(*) c from public.staff_ping where uid = p_uid and ts between p_from and p_to and tab is not null group by tab) z;
  select count(*), round(avg(rating), 1), count(rating) into cl, rt, rn from public.support_tickets where closed_by = p_uid and closed_at between p_from and p_to;
  select count(*) filter (where tbl = 'withdrawals'), count(*) filter (where tbl = 'balance_grants'), count(*) into wd, gr, nlog
    from public.staff_log where uid = p_uid and ts between p_from and p_to;
  select string_agg('• ' || to_char(ts at time zone 'Europe/Moscow', 'HH24:MI') || ' ' || detail, E'\n' order by id) into logs
    from (select * from public.staff_log where uid = p_uid and ts between p_from and p_to order by id limit 60) z;
  t := '📋 Отчёт смены — ' || coalesce(nm, '?') || coalesce(' (#' || v_pid || ')', '') || E'\n'
    || to_char(p_from at time zone 'Europe/Moscow', f) || ' – ' || to_char(p_to at time zone 'Europe/Moscow', f) || ' МСК'
    || case when p_auto then E'\n⚠️ Смену не сдал — отчёт отправлен автоматически' else ' · сдал сам' end || E'\n\n'
    || '⏱ В админке: ' || case when mins >= 60 then mins / 60 || ' ч ' else '' end || mins % 60 || ' мин' || E'\n'
    || '🗂 Окна: ' || coalesce(tabs, '—') || E'\n'
    || '💬 Обращений закрыто: ' || cl || case when rn > 0 then ' · оценка ' || replace(rt::text, '.', ',') || ' (' || rn || ')' else '' end || E'\n'
    || '💸 Выводов обработано: ' || wd || E'\n'
    || '➕ Начислений: ' || gr || E'\n'
    || '✏️ Изменений: ' || nlog || case when nlog > 0 then E'\n' || logs || case when nlog > 60 then E'\n…и ещё ' || (nlog - 60) else '' end else '' end
    || case when nullif(trim(p_comment), '') is not null then E'\n\n💭 Комментарий: ' || trim(p_comment) else '' end;
  return left(t, 4000);
end $$;

-- начало текущей смены сотрудника: после прошлого отчёта, но не раньше чем 24 ч назад
create or replace function public._shift_from(p_uid uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  with b as (select greatest(coalesce((select max(to_at) from public.staff_shifts where uid = p_uid), '-infinity'), now() - interval '24 hours') t)
  select coalesce((select min(ts) from public.staff_ping, b where uid = p_uid and ts > b.t), (select min(ts) from public.staff_log, b where uid = p_uid and ts > b.t), now())
$$;

create or replace function public.staff_shift_preview() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.staff where uid = auth.uid() and role = 'staff') then raise exception 'forbidden'; end if;
  return jsonb_build_object('text', public._shift_text(auth.uid(), public._shift_from(auth.uid()), now(), null, false),
    'chat', exists (select 1 from public.bot_cfg where k = 'owner_chat'));
end $$;

create or replace function public.staff_shift_submit(p_comment text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from public.staff where uid = auth.uid() and role = 'staff') then raise exception 'forbidden'; end if;
  if exists (select 1 from public.staff_shifts where uid = auth.uid() and created_at > now() - interval '5 minutes') then raise exception 'too often'; end if;
  insert into public.staff_shifts (uid, from_at, to_at, comment) values (auth.uid(), public._shift_from(auth.uid()), now(), nullif(left(trim(p_comment), 1000), ''))
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- авто-отчёт: смена по графику закончилась 30 мин назад, отчёта нет, а сотрудник в эту смену работал
create or replace function public._shift_auto() returns int
language plpgsql security definer set search_path = public as $$
declare s record; dd date; v_start timestamptz; v_end timestamptz; v_from timestamptz; c int := 0;
begin
  for s in select uid, schedule from public.staff where role = 'staff' and schedule ? 'days' loop
    for dd in select ((now() at time zone 'Europe/Moscow')::date - g) from generate_series(0, 1) g loop
      continue when not (s.schedule->'days') @> to_jsonb(extract(isodow from dd)::int);
      begin
        v_start := (dd + coalesce(s.schedule->>'from', '10:00')::time) at time zone 'Europe/Moscow';
        v_end := (dd + coalesce(s.schedule->>'to', '22:00')::time) at time zone 'Europe/Moscow';
      exception when others then continue; end;
      if v_end <= v_start then v_end := v_end + interval '1 day'; end if;
      continue when now() < v_end + interval '30 minutes' or now() > v_end + interval '6 hours';
      continue when exists (select 1 from public.staff_shifts where uid = s.uid and to_at > v_start);
      select least(coalesce(min(ts), v_start), v_start) into v_from from public.staff_ping where uid = s.uid and ts between v_start - interval '2 hours' and v_end;
      continue when not exists (select 1 from public.staff_ping where uid = s.uid and ts between v_start - interval '2 hours' and v_end)
        and not exists (select 1 from public.staff_log where uid = s.uid and ts between v_start - interval '2 hours' and v_end);
      insert into public.staff_shifts (uid, from_at, to_at, auto) values (s.uid, v_from, v_end, true);
      c := c + 1;
    end loop;
  end loop;
  return c;
end $$;

-- ---------- отправка в Telegram ----------
create or replace function public.bot_shift_take(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sh public.staff_shifts;
begin
  if not exists (select 1 from public.bot_cfg where k = 'owner_chat') then return null; end if; -- чат владельцев не привязан — отчёт остаётся в базе (staff_shifts)
  update public.staff_shifts set sent = true where id = p_id and sent is null and created_at > now() - interval '1 hour' returning * into sh;
  if sh.id is null then return null; end if;
  return jsonb_build_object('chat', (select c.v from public.bot_cfg c where c.k = 'owner_chat'), 'topic', (select c.v from public.bot_cfg c where c.k = 'owner_topic'),
    'text', public._shift_text(sh.uid, sh.from_at, sh.to_at, sh.comment, sh.auto));
end $$;

create extension if not exists pg_net with schema extensions;
create or replace function public._shift_tg() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(url := 'https://gkeexoyrxnsarosymdyp.supabase.co/functions/v1/support-bot?action=shift',
    headers := '{"content-type":"application/json"}'::jsonb, body := jsonb_build_object('id', new.id));
  return new;
exception when others then return new;
end $$;
drop trigger if exists shift_tg on public.staff_shifts;
create trigger shift_tg after insert on public.staff_shifts for each row execute function public._shift_tg();

-- ---------- чат владельцев: привязка кодом (группа с темами — запоминаем тему) ----------
create or replace function public.admin_owner_chat(p_new_code boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_new_code then
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    insert into public.bot_cfg (k, v) values ('link_code', c || ':' || extract(epoch from now() + interval '30 minutes')::bigint)
      on conflict (k) do update set v = excluded.v, updated_at = now();
  end if;
  return jsonb_build_object('chat', (select v from public.bot_cfg where k = 'owner_chat'), 'title', (select v from public.bot_cfg where k = 'owner_chat_title'),
    'linked_at', (select updated_at from public.bot_cfg where k = 'owner_chat'), 'code', c);
end $$;
drop function if exists public.bot_link_chat(text, bigint, text);
create or replace function public.bot_link_chat(p_code text, p_chat bigint, p_title text, p_topic bigint default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select bot_cfg.v into v from public.bot_cfg where k = 'link_code';
  if v is null or split_part(v, ':', 1) <> upper(trim(p_code)) or split_part(v, ':', 2)::bigint < extract(epoch from now()) then return false; end if;
  insert into public.bot_cfg (k, v) values ('owner_chat', p_chat::text), ('owner_chat_title', left(coalesce(p_title, ''), 100)), ('owner_topic', p_topic::text)
    on conflict (k) do update set v = excluded.v, updated_at = now();
  delete from public.bot_cfg where k = 'link_code';
  return true;
end $$;

revoke all on function public._staff_audit(), public._shift_text(uuid, timestamptz, timestamptz, text, boolean), public._shift_from(uuid), public._shift_auto(),
  public.bot_shift_take(bigint), public.bot_link_chat(text, bigint, text, bigint), public.admin_owner_chat(boolean),
  public.staff_ping(text), public.staff_shift_preview(), public.staff_shift_submit(text) from public, anon, authenticated;
grant execute on function public.staff_ping(text), public.staff_shift_preview(), public.staff_shift_submit(text), public.admin_owner_chat(boolean) to authenticated;
grant execute on function public.bot_shift_take(bigint), public.bot_link_chat(text, bigint, text, bigint) to service_role;

-- авто-отчёты: каждые 10 минут
select cron.unschedule(jobid) from cron.job where jobname = 'shift-auto';
select cron.schedule('shift-auto', '*/10 * * * *', $cron$ select public._shift_auto() $cron$);

select 'Отчёт смены — готово' as result;

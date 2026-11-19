-- RUSH CASE — права сотрудников на ЛЮБОЕ окно админки + новые обращения поддержки в группу Telegram (владелец 19.11.2026)
--   Одна галочка на окно = окно целиком, как у владельца. Ключи — как вкладки в js/app.js (ADM_TABS), кроме 'staff' (только владельцы).
--   Отдельная галочка 'grant' — начисления баланса и удача (игрокам и кейсам).
--   Запускать ПОСЛЕ roles.sql и shop_requests.sql. Можно запускать повторно.

-- ---------- проверки ----------
create or replace function public.has_any_perm(p text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.staff where uid = auth.uid() and role = 'staff' and perms && p)
$$;
create or replace function public.is_staff() returns boolean -- владелец или сотрудник хоть с одной галочкой
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.staff where uid = auth.uid() and role = 'staff' and cardinality(perms) > 0)
$$;
-- настройки сайта (site_cfg): какой ключ к какому окну
create or replace function public.cfg_perm(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.has_perm(case
    when k like 'case:%' or k in ('blocks', 'banners') then 'shop'
    when k = 'news' then 'news' when k = 'announce' then 'ann'
    when k = 'build' then 'build' when k = 'tower' then 'tower' end)
$$;
grant execute on function public.has_any_perm(text[]), public.is_staff(), public.cfg_perm(text) to authenticated;

-- ---------- сохранение сотрудника: все окна + «Начисления» ----------
create or replace function public.admin_staff_save(p_pid bigint, p_perms text[], p_schedule jsonb default '{}', p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid; nm text; ok text[] := array['dash', 'money', 'books', 'online', 'cases', 'bets', 'upg', 'crash', 'build', 'tower', 'out', 'players',
  'support', 'promo', 'ga', 'ref', 'shop', 'news', 'ann', 'tours', 'grant'];
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select id, name into u, nm from public.profiles where pid = p_pid;
  if u is null then raise exception 'player not found'; end if;
  if exists (select 1 from public.staff where uid = u and role = 'owner') then raise exception 'is owner'; end if;
  if jsonb_typeof(coalesce(p_schedule, '{}'::jsonb)) <> 'object' then raise exception 'bad schedule'; end if;
  insert into public.staff (uid, role, perms, schedule, note, updated_by)
    values (u, 'staff', array(select distinct x from unnest(coalesce(p_perms, '{}')) x where x = any(ok) order by 1), coalesce(p_schedule, '{}'::jsonb), nullif(left(trim(p_note), 200), ''), auth.uid())
  on conflict (uid) do update set perms = excluded.perms, schedule = excluded.schedule, note = excluded.note, updated_at = now(), updated_by = auth.uid();
  update public.profiles set is_admin = true where id = u and not is_admin;
  return jsonb_build_object('ok', true, 'uid', u, 'name', nm);
end $$;

-- ---------- функции админки: «только владелец» → «владелец или сотрудник с галочкой окна» ----------
do $do$
declare r record; def text; nd text; rep text;
  st text := 'public.has_any_perm(array[''dash'',''money'',''books'',''online'',''cases'',''bets'',''upg'',''crash'',''out''])';
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (
      'admin_period', 'admin_stats', 'admin_upg', 'admin_bets', 'admin_cases_period', 'admin_crash', 'admin_day_top', 'admin_upg_players', 'admin_online',
      'admin_market_cfg', 'admin_hold_cancel', 'admin_fin_add', 'admin_fin_delete', 'admin_wd',
      'admin_ga', 'admin_ga_cfg', 'admin_ga_cancel', 'admin_promo_save', 'admin_promo_toggle',
      'admin_ref', 'admin_ref_cfg', 'admin_ref_partner', 'admin_ref_partner_del', 'admin_ref_wallet',
      'admin_tour_save', 'admin_tour_delete', 'admin_tour_teams', 'admin_tour_kick', 'team_contact',
      'admin_grant', 'admin_set_luck', 'admin_sync', 'crash_mode', 'crash_set_mode', 'tower_admin_stats', 'admin_support_stats') loop
    def := pg_get_functiondef(r.oid);
    if position('has_any_perm' in def) > 0 then continue; end if; -- уже переведена
    rep := case
      when r.proname in ('admin_period', 'admin_stats', 'admin_upg', 'admin_bets', 'admin_cases_period', 'admin_crash', 'admin_day_top', 'admin_upg_players', 'admin_online') then st
      when r.proname in ('admin_market_cfg', 'admin_hold_cancel') then 'public.has_any_perm(array[''money'',''books'',''out''])'
      when r.proname like 'admin_fin_%' then 'public.has_any_perm(array[''books''])'
      when r.proname = 'admin_wd' then 'public.has_any_perm(array[''out''])'
      when r.proname like 'admin_ga%' then 'public.has_any_perm(array[''ga''])'
      when r.proname like 'admin_promo_%' then 'public.has_any_perm(array[''promo''])'
      when r.proname like 'admin_ref%' then 'public.has_any_perm(array[''ref''])'
      when r.proname like 'admin_tour_%' or r.proname = 'team_contact' then 'public.has_any_perm(array[''tours''])'
      when r.proname in ('admin_grant', 'admin_set_luck') then 'public.has_any_perm(array[''grant''])'
      when r.proname = 'admin_sync' then 'public.has_any_perm(array[''shop''])'
      when r.proname like 'crash_%' then 'public.has_any_perm(array[''crash''])'
      when r.proname = 'tower_admin_stats' then 'public.has_any_perm(array[''tower''])'
      when r.proname = 'admin_support_stats' then 'public.has_any_perm(array[''support''])' end;
    nd := def;
    -- выводы: раньше сотрудник решал только «ждут решения» — теперь окно целиком
    nd := regexp_replace(nd, 'if not public\.is_admin\(\) and w\.status <> ''wait''[^;]*;\s*end if;', '', 'g');
    nd := regexp_replace(nd, 'public\._inner_ok\(\)', '(public._inner_ok() or ' || rep || ')', 'g');
    nd := regexp_replace(nd, 'public\.has_perm\(''(online|out|support)''(::text)?\)', rep, 'g');
    nd := regexp_replace(nd, '(public\.)?is_admin\(\)', rep, 'g');
    if nd <> def then execute nd; end if;
  end loop;
end $do$;

-- ---------- чтение и запись таблиц: доп. разрешения (складываются с владельческими через «или») ----------
do $do$
declare st text := 'public.has_any_perm(array[''dash'',''money'',''books'',''online'',''cases'',''bets'',''upg'',''crash'',''out''])';
  t record;
begin
  for t in select * from (values
      ('profiles', 'select', 'public.is_staff()'),
      ('withdrawals', 'select', st), ('fin_ops', 'select', st), ('market_cfg', 'select', st), ('payments', 'select', st),
      ('balance_grants', 'select', 'public.has_any_perm(array[''players'',''grant''])'),
      ('promo_codes', 'select', 'public.has_any_perm(array[''promo''])'),
      ('ref_earn', 'select', 'public.has_any_perm(array[''ref''])'),
      ('shop_requests', 'select', 'public.has_any_perm(array[''shop''])'),
      ('tournaments', 'select', 'public.has_any_perm(array[''tours''])'),
      ('support_threads', 'select', 'public.has_any_perm(array[''support''])'),
      ('support_msgs', 'select', 'public.has_any_perm(array[''support''])'),
      ('support_tickets', 'select', 'public.has_any_perm(array[''support''])'),
      ('case_settings', 'all', 'public.has_any_perm(array[''shop''])'),
      ('custom_cases', 'all', 'public.has_any_perm(array[''shop''])'),
      ('site_cfg', 'all', 'public.cfg_perm(k)')) as x(tb, cmd, expr) loop
    if to_regclass('public.' || t.tb) is null then raise notice 'нет таблицы %, пропускаем', t.tb; continue; end if;
    execute format('drop policy if exists "staff perms" on public.%I', t.tb);
    execute format('create policy "staff perms" on public.%I for %s to authenticated using (%s)%s', t.tb, t.cmd, t.expr,
      case when t.cmd = 'all' then format(' with check (%s)', t.expr) else '' end);
  end loop;
end $do$;

-- удача кейсов — только с галочкой «Начисления и удача» (витрину без неё менять можно)
create or replace function public._case_luck_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_perm('grant') then return new; end if;
  if coalesce(new.luck, 1) is distinct from (case when tg_op = 'UPDATE' then coalesce(old.luck, 1) else 1 end) then raise exception 'no grant'; end if;
  return new;
end $$;
drop trigger if exists case_luck_guard on public.case_settings;
create trigger case_luck_guard before insert or update on public.case_settings for each row execute function public._case_luck_guard();

-- картинки (кейсы, баннеры, новости, объявление, турниры)
do $$ begin
  drop policy if exists "case-img: staff perms" on storage.objects;
  create policy "case-img: staff perms" on storage.objects for all to authenticated
    using (bucket_id = 'case-img' and public.has_any_perm(array['shop', 'news', 'ann']))
    with check (bucket_id = 'case-img' and public.has_any_perm(array['shop', 'news', 'ann']));
  drop policy if exists "tour-img: staff perms" on storage.objects;
  create policy "tour-img: staff perms" on storage.objects for all to authenticated
    using (bucket_id = 'tour-img' and public.has_any_perm(array['tours'])) with check (bucket_id = 'tour-img' and public.has_any_perm(array['tours']));
exception when others then raise notice 'картинки: политику хранилища создать не удалось (%)', sqlerrm;
end $$;

-- ---------- группа поддержки в Telegram: каждое НОВОЕ обращение → сообщение в группу ----------
alter table public.support_tickets add column if not exists tg_sent boolean;
-- настройки бота (не секреты): группа, коды привязки — та же таблица, что в shop_requests.sql
create table if not exists public.bot_cfg (k text primary key, v text, updated_at timestamptz not null default now());
alter table public.bot_cfg enable row level security; -- политик нет: только функции и бот (service_role)
grant all on public.bot_cfg to service_role;
-- код привязки группы (как у чата владельцев, но другой ключ)
create or replace function public.admin_sup_chat(p_new_code boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_new_code then
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    insert into public.bot_cfg (k, v) values ('sup_link_code', c || ':' || extract(epoch from now() + interval '30 minutes')::bigint)
      on conflict (k) do update set v = excluded.v, updated_at = now();
  end if;
  return jsonb_build_object('chat', (select v from public.bot_cfg where k = 'sup_chat'), 'title', (select v from public.bot_cfg where k = 'sup_chat_title'),
    'linked_at', (select updated_at from public.bot_cfg where k = 'sup_chat'), 'code', c);
end $$;
drop function if exists public.bot_link_sup(text, bigint, text);
create or replace function public.bot_link_sup(p_code text, p_chat bigint, p_title text, p_topic bigint default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select bot_cfg.v into v from public.bot_cfg where k = 'sup_link_code';
  if v is null or split_part(v, ':', 1) <> upper(trim(p_code)) or split_part(v, ':', 2)::bigint < extract(epoch from now()) then return false; end if;
  insert into public.bot_cfg (k, v) values ('sup_chat', p_chat::text), ('sup_chat_title', left(coalesce(p_title, ''), 100)), ('sup_topic', p_topic::text)
    on conflict (k) do update set v = excluded.v, updated_at = now();
  delete from public.bot_cfg where k = 'sup_link_code';
  return true;
end $$;
-- бот забирает обращение один раз (повторный вызов ничего не пришлёт)
create or replace function public.bot_ticket_take(p_ticket bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare tk public.support_tickets; th public.support_threads; ppid bigint; pnm text; m text;
begin
  update public.support_tickets set tg_sent = true where id = p_ticket and tg_sent is null and opened_at > now() - interval '1 hour' returning * into tk;
  if tk.id is null then return null; end if;
  select * into th from public.support_threads where id = tk.thread;
  if th.uid is not null then select p.pid, p.name into ppid, pnm from public.profiles p where p.id = th.uid; end if;
  select s.text into m from public.support_msgs s where s.thread = tk.thread and not s.from_admin order by s.id desc limit 1;
  return jsonb_build_object('ticket', tk.id, 'chat', (select c.v from public.bot_cfg c where c.k = 'sup_chat'), 'topic', (select c.v from public.bot_cfg c where c.k = 'sup_topic'),
    'pid', ppid, 'name', coalesce(pnm, th.tg_name), 'tg_user', th.tg_user, 'src', case when th.uid is null then 'tg' else 'site' end, 'text', m);
end $$;
revoke all on function public.admin_sup_chat(boolean), public.bot_link_sup(text, bigint, text, bigint), public.bot_ticket_take(bigint) from public, anon, authenticated;
grant execute on function public.admin_sup_chat(boolean) to authenticated;
grant execute on function public.bot_link_sup(text, bigint, text, bigint), public.bot_ticket_take(bigint) to service_role;

create extension if not exists pg_net with schema extensions;
create or replace function public._ticket_tg() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from public.bot_cfg where k = 'sup_chat') then
    perform net.http_post(url := 'https://gkeexoyrxnsarosymdyp.supabase.co/functions/v1/support-bot?action=ticket',
      headers := '{"content-type":"application/json"}'::jsonb, body := jsonb_build_object('ticket', new.id));
  end if;
  return new;
exception when others then return new; -- Telegram не должен ломать поддержку
end $$;
drop trigger if exists ticket_tg on public.support_tickets;
create trigger ticket_tg after insert on public.support_tickets for each row execute function public._ticket_tg();

select 'Права сотрудников на все окна и группа поддержки в Telegram — готово' as result;

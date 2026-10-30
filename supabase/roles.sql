-- =====================================================================
-- RUSH CASE — роли в админке: Владелец / Сотрудник (этап 1 из ПЛАН_РОЛИ.md).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
--
-- Как устроено:
--   public.staff — кто в админке: role 'owner' (всё) или 'staff' (только вкладки из perms), график смен.
--   public.is_admin()  — теперь значит «ВЛАДЕЛЕЦ». Все старые admin_* функции и политики, которые проверяют
--                        is_admin(), автоматически становятся только для владельца (безопасно по умолчанию).
--   public.has_perm(k) — владелец или сотрудник с галочкой k. На has_perm переводятся только функции и политики,
--                        которые сотруднику можно: поддержка, выводы (только «ждут решения»), игроки (поиск), онлайн.
--   Колонка profiles.is_admin — «есть доступ в админку» (владелец или сотрудник): по ней сайт показывает
--   ссылку на админку, бот и маркет узнают админа, статистика не считает админские аккаунты.
-- Новые функции для владельца — проверять public.is_admin(); для сотрудника — public.has_perm('ключ').
-- =====================================================================

-- ---------- владельцы: игроки #100003 и #100004 ----------
do $$ begin
  if (select count(*) from public.profiles where pid in (100003, 100004)) < 2 then
    raise exception 'Не найдены игроки #100003 и #100004 — роли не изменены';
  end if;
end $$;

-- ---------- кто в админке ----------
create table if not exists public.staff (
  uid uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  perms text[] not null default '{}',          -- вкладки сотрудника: support, out, online, players, shop (витрина — через заявки, shop_requests.sql)
  schedule jsonb not null default '{}',        -- график смен (для отчётов): {"days":[1..7], "from":"10:00", "to":"22:00"}
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.staff enable row level security; -- политик нет: читать и менять — только через функции ниже
grant all on public.staff to service_role;

insert into public.staff (uid, role) select id, 'owner' from public.profiles where pid in (100003, 100004)
  on conflict (uid) do update set role = 'owner', updated_at = now();
-- остальные текущие админы → сотрудники без вкладок (галочки ставит владелец)
insert into public.staff (uid, role) select id, 'staff' from public.profiles where is_admin on conflict (uid) do nothing;
update public.profiles set is_admin = true where id in (select uid from public.staff) and not is_admin;

-- ---------- проверки прав ----------
create or replace function public.is_admin() returns boolean -- = владелец
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where uid = auth.uid() and role = 'owner')
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$ select public.is_admin() $$;
create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.staff where uid = auth.uid() and role = 'staff' and p = any(perms))
$$;
-- владелец или вызов изнутри admin_online (онлайн без денег для сотрудника)
create or replace function public._inner_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(current_setting('rc.inner', true), '') = '1'
$$;
grant execute on function public.is_admin(), public.is_owner(), public.has_perm(text) to anon, authenticated;
revoke all on function public._inner_ok() from public, anon, authenticated;

-- ---------- функции, которые можно сотруднику: is_admin() → has_perm(…) ----------
do $do$
declare r record; def text; nd text; rep text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_support_seen', 'admin_support_reply', 'admin_support_take', 'admin_support_pass',
      'admin_support_close', 'admin_wd', 'admin_players', 'admin_period', 'admin_stats') loop
    def := pg_get_functiondef(r.oid);
    if position('public.is_admin()' in def) = 0 then continue; end if; -- уже переведена
    rep := case
      when r.proname like 'admin_support_%' then 'public.has_perm(''support'')'
      when r.proname = 'admin_wd' then 'public.has_perm(''out'')'
      when r.proname = 'admin_players' then 'public.has_perm(''players'')'
      else 'public._inner_ok()' end;
    nd := replace(def, 'public.is_admin()', rep);
    if r.proname = 'admin_wd' then -- сотрудник решает только заявки «ждут решения» (дороже порога автовывода)
      nd := replace(nd, 'if w.id is null then raise exception ''not found''; end if;',
        'if w.id is null then raise exception ''not found''; end if;' || E'\n  ' ||
        'if not public.is_admin() and w.status <> ''wait'' then raise exception ''only wait''; end if;');
      if position('only wait' in nd) = 0 then raise exception 'admin_wd: не нашли место для проверки статуса'; end if;
    end if;
    execute nd;
  end loop;
end $do$;

-- ---------- политики чтения для сотрудника: поддержка, выводы, профили игроков ----------
do $do$
declare r record; rep text; sql text;
begin
  for r in select * from pg_policies where schemaname = 'public'
    and tablename in ('support_threads', 'support_msgs', 'support_tickets', 'withdrawals', 'profiles')
    and coalesce(qual, '') ~ 'is_admin\(\)' loop
    rep := case r.tablename
      when 'withdrawals' then 'public.has_perm(''out'')'
      when 'profiles' then '(public.has_perm(''support'') or public.has_perm(''out'') or public.has_perm(''players''))'
      else 'public.has_perm(''support'')' end;
    sql := format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, regexp_replace(r.qual, '(public\.)?is_admin\(\)', rep, 'g'));
    if r.with_check is not null then sql := sql || format(' with check (%s)', regexp_replace(r.with_check, '(public\.)?is_admin\(\)', rep, 'g')); end if;
    execute sql;
  end loop;
end $do$;

-- ---------- онлайн для сотрудника: те же цифры, что у владельца, но без денег ----------
create or replace function public.admin_online(p_from timestamptz, p_to timestamptz, p_bucket text default 'day') returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; s jsonb;
begin
  if not public.has_perm('online') then raise exception 'forbidden'; end if;
  perform set_config('rc.inner', '1', true);
  r := public.admin_period(p_from, p_to, p_bucket);
  s := public.admin_stats();
  perform set_config('rc.inner', '', true);
  return jsonb_build_object(
    'series', coalesce((select jsonb_agg(jsonb_build_object('t', e->'t', 'peak', e->'peak', 'avg', e->'avg', 'visitors', e->'visitors', 'players', e->'players', 'reg', e->'reg') order by i)
      from jsonb_array_elements(coalesce(r->'series', '[]'::jsonb)) with ordinality x(e, i)), '[]'::jsonb),
    'total', jsonb_build_object('peak', r->'total'->'peak', 'avg', r->'total'->'avg', 'visitors', r->'total'->'visitors', 'players', r->'total'->'players', 'reg', r->'total'->'reg'),
    'online', s->'online', 'users', s->'users', 'new24', s->'new24');
end $$;

-- ---------- моя роль (для сайта: какие вкладки показать) ----------
create or replace function public.my_staff() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('role', role, 'perms', to_jsonb(perms), 'schedule', schedule) from public.staff where uid = auth.uid()
$$;

-- ---------- вкладка «Сотрудники» (только владелец) ----------
create or replace function public.admin_staff_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('uid', s.uid, 'pid', p.pid, 'name', p.name, 'ava', p.ava, 'role', s.role, 'perms', to_jsonb(s.perms),
      'schedule', s.schedule, 'note', s.note, 'since', s.created_at, 'seen', p.updated_at) order by s.role, s.created_at)
    from public.staff s join public.profiles p on p.id = s.uid), '[]'::jsonb);
end $$;

create or replace function public.admin_staff_save(p_pid bigint, p_perms text[], p_schedule jsonb default '{}', p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid; nm text; ok text[] := array['support', 'out', 'online', 'players', 'shop'];
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

create or replace function public.admin_staff_remove(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if exists (select 1 from public.staff where uid = p_uid and role = 'owner') then raise exception 'is owner'; end if;
  delete from public.staff where uid = p_uid;
  update public.profiles set is_admin = false where id = p_uid;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_online(timestamptz, timestamptz, text), public.my_staff(), public.admin_staff_list(),
  public.admin_staff_save(bigint, text[], jsonb, text), public.admin_staff_remove(uuid) from public, anon;
grant execute on function public.admin_online(timestamptz, timestamptz, text), public.my_staff(), public.admin_staff_list(),
  public.admin_staff_save(bigint, text[], jsonb, text), public.admin_staff_remove(uuid) to authenticated;

select 'роли готовы: владельцы — ' || (select string_agg('#' || p.pid, ', ' order by p.pid) from public.staff s join public.profiles p on p.id = s.uid where s.role = 'owner')
  || '; сотрудников — ' || (select count(*) from public.staff where role = 'staff') as result;

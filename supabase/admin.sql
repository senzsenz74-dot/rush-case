-- =====================================================================
-- RUSH CASE — админ-панель: права, настройки кейсов, начисления, статистика.
-- Запуск: Supabase → SQL Editor → New query → вставить весь файл → Run (после schema.sql).
-- Затем назначить себя админом (последний блок файла: впишите свой e-mail).
-- =====================================================================

-- ---------- права администратора ----------
alter table public.profiles add column if not exists is_admin boolean not null default false;
-- игрок может менять в своём профиле только игровые данные — не is_admin, не имя
revoke update on public.profiles from authenticated;
grant update (data, updated_at) on public.profiles to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- админ видит профили всех игроков
drop policy if exists "profiles: admin read" on public.profiles;
create policy "profiles: admin read" on public.profiles for select to authenticated using (public.is_admin());

-- ---------- настройки кейсов: закрыт / множитель удачи ----------
create table if not exists public.case_settings (
  id text primary key,                         -- id кейса из сайта (sifon, coco, donk, …)
  disabled boolean not null default false,     -- кейс закрыт: открыть нельзя
  luck numeric not null default 1 check (luck between 0.2 and 5), -- ×шанс предметов дороже кейса
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.case_settings enable row level security;
drop policy if exists "case_settings: read all" on public.case_settings;
drop policy if exists "case_settings: admin insert" on public.case_settings;
drop policy if exists "case_settings: admin update" on public.case_settings;
create policy "case_settings: read all" on public.case_settings for select to anon, authenticated using (true);
create policy "case_settings: admin insert" on public.case_settings for insert to authenticated with check (public.is_admin());
create policy "case_settings: admin update" on public.case_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.case_settings to anon, authenticated;
grant insert, update on public.case_settings to authenticated;

-- ---------- начисления на баланс (игрок забирает при входе / раз в 30 с) ----------
create table if not exists public.balance_grants (
  id bigserial primary key,
  uid uuid not null references auth.users on delete cascade,
  amount numeric not null,
  note text,
  by_uid uuid,
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.balance_grants enable row level security;
drop policy if exists "grants: read own or admin" on public.balance_grants;
create policy "grants: read own or admin" on public.balance_grants for select to authenticated using (uid = auth.uid() or public.is_admin());
grant select on public.balance_grants to authenticated;

create or replace function public.admin_grant(p_uid uuid, p_amount numeric, p_note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare gid bigint;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 10000000 then raise exception 'bad amount'; end if;
  if not exists (select 1 from public.profiles where id = p_uid) then raise exception 'no player'; end if;
  insert into public.balance_grants (uid, amount, note, by_uid) values (p_uid, round(p_amount, 2), left(p_note, 200), auth.uid()) returning id into gid;
  return gid;
end $$;

create or replace function public.claim_grants() returns setof public.balance_grants
language sql security definer set search_path = public as $$
  update public.balance_grants set claimed = true where uid = auth.uid() and not claimed returning *;
$$;

-- ---------- игроки и статистика для админки ----------
create or replace function public.admin_players(p_q text default '', p_limit int default 100)
returns table (id uuid, name text, email text, balance numeric, rcoin numeric, opened numeric, spent numeric, dep numeric, created_at timestamptz, last_seen timestamptz, is_admin boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, p.name, u.email::text,
         coalesce((p.data->>'balance')::numeric, 0), coalesce((p.data->>'rcoin')::numeric, 0),
         coalesce((p.data->'stats'->>'opened')::numeric, 0), coalesce((p.data->'stats'->>'spent')::numeric, 0), coalesce((p.data->'stats'->>'dep')::numeric, 0),
         p.created_at, p.updated_at, p.is_admin
  from public.profiles p join auth.users u on u.id = p.id
  where coalesce(p_q, '') = '' or p.name ilike '%' || p_q || '%' or u.email ilike '%' || p_q || '%'
  order by p.updated_at desc
  limit least(greatest(p_limit, 1), 500);
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'new24', (select count(*) from public.profiles where created_at > now() - interval '24 hours'),
    'online', (select count(*) from public.profiles where updated_at > now() - interval '10 minutes'),
    'balance', (select coalesce(sum((data->>'balance')::numeric), 0) from public.profiles),
    'rcoin', (select coalesce(sum((data->>'rcoin')::numeric), 0) from public.profiles),
    'opened', (select coalesce(sum((data->'stats'->>'opened')::numeric), 0) from public.profiles),
    'spent', (select coalesce(sum((data->'stats'->>'spent')::numeric), 0) from public.profiles),
    'dep', (select coalesce(sum((data->'stats'->>'dep')::numeric), 0) from public.profiles),
    'jpRounds24', (select count(*) from public.jp_rounds where spin_at > now() - interval '24 hours'),
    'jpPot24', (select coalesce(sum(total), 0) from public.jp_rounds where spin_at > now() - interval '24 hours'),
    'jpRealBets24', (select count(*) from public.jp_bets where uid is not null and created_at > now() - interval '24 hours'),
    'jpRealSum24', (select coalesce(sum(value), 0) from public.jp_bets where uid is not null and created_at > now() - interval '24 hours'),
    'grants24', (select coalesce(sum(amount), 0) from public.balance_grants where created_at > now() - interval '24 hours'),
    'regDays', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb) from (
       select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') d, count(*) n from public.profiles
       where created_at > now() - interval '14 days' group by 1) t)
  ) into r;
  return r;
end $$;

revoke all on function public.admin_grant(uuid, numeric, text), public.admin_players(text, int), public.admin_stats() from public, anon;
grant execute on function public.admin_grant(uuid, numeric, text), public.admin_players(text, int), public.admin_stats(), public.claim_grants() to authenticated;

-- ---------- назначить себя админом: впишите e-mail своего аккаунта на сайте и запустите ----------
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'ВАШ_EMAIL@mail.ru');

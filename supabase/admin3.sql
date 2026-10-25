-- =====================================================================
-- RUSH CASE — ID игрока и личная «удача» (множитель шансов), меняется из админ-панели.
-- Запуск: Supabase → SQL Editor → New query → вставить весь файл → Run (после admin2.sql).
-- =====================================================================

-- короткий номер игрока (100001, 100002, …) — виден в профиле, по нему ищет админ
create sequence if not exists public.player_pid_seq start 100001;
alter table public.profiles add column if not exists pid bigint;
update public.profiles set pid = nextval('public.player_pid_seq') where pid is null;
alter table public.profiles alter column pid set default nextval('public.player_pid_seq');
alter table public.profiles alter column pid set not null;
create unique index if not exists profiles_pid on public.profiles (pid);

-- личный множитель удачи: ×шанс предметов дороже кейса и шанс апгрейда. Игрок сам изменить не может (ему разрешено писать только data)
alter table public.profiles add column if not exists luck numeric not null default 1;
alter table public.profiles drop constraint if exists profiles_luck_check;
alter table public.profiles add constraint profiles_luck_check check (luck between 0.1 and 10);

create or replace function public.admin_set_luck(p_uid uuid, p_luck numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.profiles set luck = round(p_luck, 2) where id = p_uid;
  if not found then raise exception 'no player'; end if;
end $$;
revoke all on function public.admin_set_luck(uuid, numeric) from public, anon;
grant execute on function public.admin_set_luck(uuid, numeric) to authenticated;

-- список игроков: + pid и удача; поиск по ID (числом), нику или e-mail
drop function if exists public.admin_players(text, int);
create or replace function public.admin_players(p_q text default '', p_limit int default 100)
returns table (id uuid, pid bigint, name text, email text, balance numeric, rcoin numeric, opened numeric, spent numeric, dep numeric, created_at timestamptz, last_seen timestamptz, is_admin boolean, luck numeric)
language plpgsql security definer set search_path = public as $$
declare q text := trim(coalesce(p_q, ''));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, p.pid, p.name, u.email::text,
         coalesce((p.data->>'balance')::numeric, 0), coalesce((p.data->>'rcoin')::numeric, 0),
         coalesce((p.data->'stats'->>'opened')::numeric, 0), coalesce((p.data->'stats'->>'spent')::numeric, 0), coalesce((p.data->'stats'->>'dep')::numeric, 0),
         p.created_at, p.updated_at, p.is_admin, p.luck
  from public.profiles p join auth.users u on u.id = p.id
  where q = '' or (q ~ '^\d+$' and p.pid = q::bigint) or p.name ilike '%' || q || '%' or u.email ilike '%' || q || '%'
  order by p.updated_at desc
  limit least(greatest(p_limit, 1), 500);
end $$;
revoke all on function public.admin_players(text, int) from public, anon;
grant execute on function public.admin_players(text, int) to authenticated;

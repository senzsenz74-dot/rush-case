-- =====================================================================
-- RUSH CASE — турниры CS2, этап 1: команды и регистрация.
-- Команды: создаёт игрок с привязанным Steam, вступление — по ссылке-приглашению, один игрок — одна команда.
-- Турниры: создаёт админ (формат 1x1 / 2x2 / 5x5, пул карт, призы по местам, правила, античит, лимит команд).
-- Регистрация — только капитан, только полным основным составом под формат турнира (+ замены).
-- Все изменения — через функции ниже (прямая запись в таблицы закрыта).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run.
-- =====================================================================

-- публичная карточка игрока: ник, аватар, ID, SteamID (профили закрыты RLS, а составы команд видят все)
create or replace view public.players_pub as select id, name, ava, pid, steamid from public.profiles;
grant select on public.players_pub to anon, authenticated;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text not null,
  logo text,
  captain uuid not null references public.profiles(id) on delete cascade,
  captain_tg text,
  invite text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
create unique index if not exists teams_name_uq on public.teams (lower(name));
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  uid uuid not null unique references public.profiles(id) on delete cascade,  -- один игрок — одна команда
  joined_at timestamptz not null default now(),
  primary key (team_id, uid)
);
create table if not exists public.tournaments (
  id bigserial primary key,
  title text not null,
  description text not null default '',
  rules text not null default '',
  anticheat text not null default '',
  format int not null default 5 check (format in (1, 2, 5)),       -- игроков в основном составе
  subs_max int not null default 2 check (subs_max between 0 and 5),
  max_teams int not null default 16 check (max_teams between 2 and 256),
  prize_pool text not null default '',
  prizes jsonb not null default '[]'::jsonb,                        -- ["1 место — …", "2 место — …", …]
  banner text,
  map_pool text[] not null default '{}',
  reg_end timestamptz,
  starts_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'reg', 'closed', 'live', 'done')),
  created_at timestamptz not null default now()
);
create table if not exists public.tournament_teams (
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  roster uuid[] not null,
  subs uuid[] not null default '{}',
  registered_at timestamptz not null default now(),
  primary key (tournament_id, team_id)
);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
drop policy if exists "teams: read" on public.teams;
drop policy if exists "team_members: read" on public.team_members;
drop policy if exists "tournaments: read" on public.tournaments;
drop policy if exists "tournament_teams: read" on public.tournament_teams;
create policy "teams: read" on public.teams for select to anon, authenticated using (true);
create policy "team_members: read" on public.team_members for select to anon, authenticated using (true);
create policy "tournaments: read" on public.tournaments for select to anon, authenticated using (status <> 'draft' or public.is_admin());
create policy "tournament_teams: read" on public.tournament_teams for select to anon, authenticated using (true);
-- приглашение видят только участники команды (иначе любой вступит без ссылки)
revoke select on public.teams from anon, authenticated;
grant select (id, name, tag, logo, captain, created_at) on public.teams to anon, authenticated;
grant select on public.team_members, public.tournaments, public.tournament_teams to anon, authenticated;

-- ---------- помощники ----------
create or replace function public._my_team() returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.team_members where uid = auth.uid()
$$;
create or replace function public._need_steam() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if (select steamid from public.profiles where id = auth.uid()) is null then raise exception 'steam required'; end if;
end $$;
create or replace function public._captain() returns uuid language plpgsql stable security definer set search_path = public as $$
declare t uuid := public._my_team();
begin
  if t is null or (select captain from public.teams where id = t) <> auth.uid() then raise exception 'not captain'; end if;
  return t;
end $$;
-- команда участвует в турнире, который ещё идёт (составом менять нельзя)
create or replace function public._team_busy(p_team uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournament_teams tt join public.tournaments t on t.id = tt.tournament_id
                 where tt.team_id = p_team and t.status in ('closed', 'live'))
$$;
create or replace function public._clean(p text, n int) returns text language sql immutable as $$
  select nullif(left(trim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), n), '')
$$;

-- ---------- команды ----------
create or replace function public.team_create(p_name text, p_tag text, p_logo text default null, p_tg text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; n text := public._clean(p_name, 24); g text := upper(public._clean(p_tag, 5));
begin
  perform public._need_steam();
  if public._my_team() is not null then raise exception 'already in team'; end if;
  if n is null or length(n) < 2 then raise exception 'bad name'; end if;
  if g is null or g !~ '^[A-Z0-9А-ЯЁ]{2,5}$' then raise exception 'bad tag'; end if;
  if exists (select 1 from public.teams where lower(name) = lower(n)) then raise exception 'name taken'; end if;
  insert into public.teams (name, tag, logo, captain, captain_tg) values (n, g, public._clean(p_logo, 400), auth.uid(), public._clean(p_tg, 40)) returning id into t;
  insert into public.team_members (team_id, uid) values (t, auth.uid());
  return t;
end $$;

create or replace function public.team_update(p_name text, p_tag text, p_logo text, p_tg text) returns void
language plpgsql security definer set search_path = public as $$
declare t uuid := public._captain(); n text := public._clean(p_name, 24); g text := upper(public._clean(p_tag, 5));
begin
  if n is null or length(n) < 2 then raise exception 'bad name'; end if;
  if g is null or g !~ '^[A-Z0-9А-ЯЁ]{2,5}$' then raise exception 'bad tag'; end if;
  if exists (select 1 from public.teams where lower(name) = lower(n) and id <> t) then raise exception 'name taken'; end if;
  update public.teams set name = n, tag = g, logo = public._clean(p_logo, 400), captain_tg = public._clean(p_tg, 40) where id = t;
end $$;

-- ссылка-приглашение: видит только участник команды
create or replace function public.team_invite(p_new boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare t uuid := public._my_team(); v text;
begin
  if t is null then raise exception 'no team'; end if;
  if p_new then perform public._captain(); update public.teams set invite = replace(gen_random_uuid()::text, '-', '') where id = t; end if;
  select invite into v from public.teams where id = t; return v;
end $$;

-- превью команды по приглашению (до вступления)
create or replace function public.team_by_invite(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo', t.logo, 'n', (select count(*) from public.team_members m where m.team_id = t.id))
  from public.teams t where t.invite = p_code
$$;

create or replace function public.team_join(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  perform public._need_steam();
  if public._my_team() is not null then raise exception 'already in team'; end if;
  select id into t from public.teams where invite = p_code;
  if t is null then raise exception 'bad invite'; end if;
  if (select count(*) from public.team_members where team_id = t) >= 10 then raise exception 'team full'; end if;
  if public._team_busy(t) then raise exception 'team busy'; end if;
  insert into public.team_members (team_id, uid) values (t, auth.uid());
  return t;
end $$;

create or replace function public.team_leave() returns void
language plpgsql security definer set search_path = public as $$
declare t uuid := public._my_team();
begin
  if t is null then raise exception 'no team'; end if;
  if (select captain from public.teams where id = t) = auth.uid() then raise exception 'captain cannot leave'; end if;
  if public._team_busy(t) then raise exception 'team busy'; end if;
  delete from public.team_members where team_id = t and uid = auth.uid();
  -- снять из составов на открытых турнирах
  update public.tournament_teams set roster = array_remove(roster, auth.uid()), subs = array_remove(subs, auth.uid()) where team_id = t;
end $$;

create or replace function public.team_kick(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t uuid := public._captain();
begin
  if p_uid = auth.uid() then raise exception 'bad player'; end if;
  if public._team_busy(t) then raise exception 'team busy'; end if;
  delete from public.team_members where team_id = t and uid = p_uid;
  if not found then raise exception 'bad player'; end if;
  update public.tournament_teams set roster = array_remove(roster, p_uid), subs = array_remove(subs, p_uid) where team_id = t;
end $$;

create or replace function public.team_transfer(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t uuid := public._captain();
begin
  if not exists (select 1 from public.team_members where team_id = t and uid = p_uid) or p_uid = auth.uid() then raise exception 'bad player'; end if;
  update public.teams set captain = p_uid, captain_tg = null where id = t;
end $$;

create or replace function public.team_disband() returns void
language plpgsql security definer set search_path = public as $$
declare t uuid := public._captain();
begin
  if public._team_busy(t) then raise exception 'team busy'; end if;
  delete from public.teams where id = t;  -- участники и регистрации удалятся каскадом
end $$;

-- ---------- регистрация на турнир (капитан) ----------
create or replace function public.tour_register(p_tour bigint, p_roster uuid[], p_subs uuid[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare t uuid := public._captain(); r public.tournaments; x uuid; all_ids uuid[] := coalesce(p_roster, '{}') || coalesce(p_subs, '{}');
begin
  select * into r from public.tournaments where id = p_tour;
  if r.id is null or r.status <> 'reg' or (r.reg_end is not null and now() > r.reg_end) then raise exception 'registration closed'; end if;
  if coalesce(array_length(p_roster, 1), 0) <> r.format then raise exception 'bad roster'; end if;
  if coalesce(array_length(p_subs, 1), 0) > r.subs_max then raise exception 'too many subs'; end if;
  if (select count(distinct v) from unnest(all_ids) v) <> coalesce(array_length(all_ids, 1), 0) then raise exception 'bad roster'; end if;
  foreach x in array all_ids loop
    if not exists (select 1 from public.team_members where team_id = t and uid = x) then raise exception 'bad roster'; end if;
    if (select steamid from public.profiles where id = x) is null then raise exception 'steam required'; end if;
  end loop;
  if not exists (select 1 from public.tournament_teams where tournament_id = p_tour and team_id = t)
     and (select count(*) from public.tournament_teams where tournament_id = p_tour) >= r.max_teams then raise exception 'tournament full'; end if;
  insert into public.tournament_teams (tournament_id, team_id, roster, subs) values (p_tour, t, p_roster, coalesce(p_subs, '{}'))
    on conflict (tournament_id, team_id) do update set roster = excluded.roster, subs = excluded.subs;
end $$;

create or replace function public.tour_unregister(p_tour bigint) returns void
language plpgsql security definer set search_path = public as $$
declare t uuid := public._captain();
begin
  if (select status from public.tournaments where id = p_tour) <> 'reg' then raise exception 'registration closed'; end if;
  delete from public.tournament_teams where tournament_id = p_tour and team_id = t;
end $$;

-- ---------- админ ----------
create or replace function public.admin_tour_save(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint := nullif(p->>'id', '')::bigint;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if public._clean(p->>'title', 80) is null then raise exception 'bad title'; end if;
  if v is null then
    insert into public.tournaments (title) values (public._clean(p->>'title', 80)) returning id into v;
  end if;
  update public.tournaments set
    title = public._clean(p->>'title', 80),
    description = coalesce(left(p->>'description', 4000), ''),
    rules = coalesce(left(p->>'rules', 8000), ''),
    anticheat = coalesce(left(p->>'anticheat', 400), ''),
    format = coalesce((p->>'format')::int, 5),
    subs_max = coalesce((p->>'subs_max')::int, 2),
    max_teams = coalesce((p->>'max_teams')::int, 16),
    prize_pool = coalesce(left(p->>'prize_pool', 80), ''),
    prizes = coalesce(p->'prizes', '[]'::jsonb),
    banner = public._clean(p->>'banner', 400),
    map_pool = coalesce((select array_agg(left(trim(m), 30)) from jsonb_array_elements_text(coalesce(p->'map_pool', '[]'::jsonb)) m where trim(m) <> ''), '{}'),
    reg_end = nullif(p->>'reg_end', '')::timestamptz,
    starts_at = nullif(p->>'starts_at', '')::timestamptz,
    status = coalesce(p->>'status', 'draft')
  where id = v;
  return v;
end $$;

create or replace function public.admin_tour_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.tournaments where id = p_id;
end $$;

create or replace function public.admin_tour_kick(p_tour bigint, p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.tournament_teams where tournament_id = p_tour and team_id = p_team;
end $$;

-- контакты капитанов для админа (Telegram видят только админы и сама команда)
create or replace function public.admin_tour_teams(p_tour bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then null else coalesce(jsonb_agg(jsonb_build_object(
    'team', t.id, 'name', t.name, 'tag', t.tag, 'logo', t.logo, 'tg', t.captain_tg, 'captain', t.captain,
    'roster', tt.roster, 'subs', tt.subs, 'at', tt.registered_at) order by tt.registered_at), '[]'::jsonb) end
  from public.tournament_teams tt join public.teams t on t.id = tt.team_id where tt.tournament_id = p_tour
$$;
-- Telegram капитана скрыт от посторонних (столбец не выдан): видит только команда и админ
create or replace function public.team_contact(p_team uuid) returns text
language sql stable security definer set search_path = public as $$
  select captain_tg from public.teams where id = p_team and (public.is_admin() or id = public._my_team())
$$;

revoke execute on function public.team_create(text, text, text, text), public.team_update(text, text, text, text), public.team_invite(boolean), public.team_join(text),
  public.team_leave(), public.team_kick(uuid), public.team_transfer(uuid), public.team_disband(), public.tour_register(bigint, uuid[], uuid[]), public.tour_unregister(bigint),
  public.admin_tour_save(jsonb), public.admin_tour_delete(bigint), public.admin_tour_kick(bigint, uuid), public.admin_tour_teams(bigint), public.team_contact(uuid) from public, anon;
grant execute on function public.team_create(text, text, text, text), public.team_update(text, text, text, text), public.team_invite(boolean), public.team_join(text),
  public.team_leave(), public.team_kick(uuid), public.team_transfer(uuid), public.team_disband(), public.tour_register(bigint, uuid[], uuid[]), public.tour_unregister(bigint),
  public.admin_tour_save(jsonb), public.admin_tour_delete(bigint), public.admin_tour_kick(bigint, uuid), public.admin_tour_teams(bigint), public.team_contact(uuid) to authenticated;
grant execute on function public.team_by_invite(text) to anon, authenticated;
revoke execute on function public._my_team(), public._need_steam(), public._captain(), public._team_busy(uuid) from public, anon, authenticated;

-- ---------- картинки: логотипы команд (игрок — в свою папку) и баннеры турниров (админ) ----------
insert into storage.buckets (id, name, public) values ('team-logo', 'team-logo', true) on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('tour-img', 'tour-img', true) on conflict (id) do update set public = true;
drop policy if exists "team-logo: read" on storage.objects;
drop policy if exists "team-logo: own upload" on storage.objects;
drop policy if exists "team-logo: own change" on storage.objects;
drop policy if exists "tour-img: read" on storage.objects;
drop policy if exists "tour-img: admin upload" on storage.objects;
drop policy if exists "tour-img: admin change" on storage.objects;
create policy "team-logo: read" on storage.objects for select to anon, authenticated using (bucket_id = 'team-logo');
create policy "team-logo: own upload" on storage.objects for insert to authenticated with check (bucket_id = 'team-logo' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "team-logo: own change" on storage.objects for update to authenticated using (bucket_id = 'team-logo' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "tour-img: read" on storage.objects for select to anon, authenticated using (bucket_id = 'tour-img');
create policy "tour-img: admin upload" on storage.objects for insert to authenticated with check (bucket_id = 'tour-img' and public.is_admin());
create policy "tour-img: admin change" on storage.objects for update to authenticated using (bucket_id = 'tour-img' and public.is_admin());

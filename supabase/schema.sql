-- =====================================================================
-- RUSH CASE — схема базы Supabase.
-- Запуск: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Скрипт можно запускать повторно: он пересоздаёт функции и политики.
-- =====================================================================

-- ---------- профили игроков ----------
-- data — снимок игрового профиля (баланс, R-COIN, инвентарь, статистика, бонусы).
-- ВНИМАНИЕ (прототип): игровая логика пока в браузере, поэтому data пишет сам клиент.
-- Перед запуском на реальные деньги баланс и инвентарь надо менять только через серверные функции.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  ava text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant select, update on public.profiles to authenticated;

-- новый пользователь → профиль с ником из регистрации и +100 ₽
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, data)
  values (new.id,
          left(coalesce(nullif(trim(new.raw_user_meta_data->>'nick'), ''), split_part(new.email, '@', 1)), 16),
          jsonb_build_object('balance', 100))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- ставки (джекпот): общие раунды для всех игроков ----------
create table if not exists public.jp_rounds (
  id bigserial primary key,
  room text not null,
  status text not null default 'wait',   -- wait → open (идёт таймер) → spin (розыгрыш) → done
  ends_at timestamptz,
  spin_at timestamptz,
  winner text,
  winner_uid uuid,
  w_point double precision,              -- точка остановки стрелки внутри сектора победителя (0..1)
  total numeric not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists jp_rounds_one_active on public.jp_rounds (room) where status <> 'done';
create index if not exists jp_rounds_room_id on public.jp_rounds (room, id desc);

create table if not exists public.jp_bets (
  id bigserial primary key,
  round_id bigint not null references public.jp_rounds on delete cascade,
  room text not null,
  uid uuid,                              -- null — бот
  name text not null,
  ava text,
  items jsonb not null,                  -- массив названий предметов
  value numeric not null check (value > 0),
  created_at timestamptz not null default now()
);
create index if not exists jp_bets_round on public.jp_bets (round_id, id);

-- выигрыш реального игрока: забирает при следующем заходе (даже если был не в сети)
create table if not exists public.jp_payouts (
  round_id bigint primary key references public.jp_rounds on delete cascade,
  uid uuid not null,
  items jsonb not null,
  total numeric not null,
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.jp_rounds enable row level security;
alter table public.jp_bets enable row level security;
alter table public.jp_payouts enable row level security;
drop policy if exists "jp_rounds: read all" on public.jp_rounds;
drop policy if exists "jp_bets: read all" on public.jp_bets;
drop policy if exists "jp_payouts: read own" on public.jp_payouts;
create policy "jp_rounds: read all" on public.jp_rounds for select to anon, authenticated using (true);
create policy "jp_bets: read all" on public.jp_bets for select to anon, authenticated using (true);
create policy "jp_payouts: read own" on public.jp_payouts for select to authenticated using (uid = auth.uid());
grant select on public.jp_rounds, public.jp_bets to anon, authenticated;
grant select on public.jp_payouts to authenticated;

-- изменения раундов и ставок — в реальном времени
do $$ begin
  begin alter publication supabase_realtime add table public.jp_rounds; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.jp_bets; exception when duplicate_object then null; end;
end $$;

-- настройки сессий: таймер и диапазон ставки ботов
create or replace function public.jp_cfg(p_room text, out t int, out lo numeric, out hi numeric)
language sql immutable as $$
  select case p_room when 'fast' then 15 else 30 end,
         case p_room when 'low' then 4 when 'mid' then 300 when 'fast' then 50 when 'high' then 5000 end,
         case p_room when 'low' then 500 when 'mid' then 8000 when 'fast' then 3000 when 'high' then 239000 end
$$;

-- активный раунд сессии (создаёт новый, если прошлый показан); под блокировкой
create or replace function public.jp_active(p_room text) returns public.jp_rounds
language plpgsql security definer set search_path = public as $$
declare r public.jp_rounds;
begin
  if p_room not in ('low', 'mid', 'fast', 'high') then raise exception 'unknown room'; end if;
  select * into r from public.jp_rounds where room = p_room and status <> 'done' for update;
  -- раунд разыгран и показан (10 с прокрутка + 7 с итоги) — закрываем
  if r.id is not null and r.status = 'spin' and now() > r.spin_at + interval '17 seconds' then
    update public.jp_rounds set status = 'done' where id = r.id;
    r := null;
  end if;
  if r.id is null then
    begin
      insert into public.jp_rounds (room) values (p_room) returning * into r;
    exception when unique_violation then
      select * into r from public.jp_rounds where room = p_room and status <> 'done' for update;
    end;
  end if;
  return r;
end $$;

-- розыгрыш: победитель пропорционально ставке (случайность — на сервере)
create or replace function public.jp_settle(p_round bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r public.jp_rounds; tot numeric; cnt int; x numeric; acc numeric := 0; p record; w record;
begin
  select * into r from public.jp_rounds where id = p_round for update;
  if r.status <> 'open' or now() < r.ends_at then return; end if;
  select coalesce(sum(value), 0), count(distinct name) into tot, cnt from public.jp_bets where round_id = r.id;
  if cnt < 2 then  -- один игрок — ждём ещё 5 с
    update public.jp_rounds set ends_at = now() + interval '5 seconds' where id = r.id; return;
  end if;
  x := random() * tot;
  for p in select name, (array_agg(uid))[1] as uid, sum(value) as s, min(id) as first
           from public.jp_bets where round_id = r.id group by name order by min(id) loop
    acc := acc + p.s; w := p;
    exit when x < acc;
  end loop;
  update public.jp_rounds set status = 'spin', spin_at = now(), winner = w.name, winner_uid = w.uid,
         w_point = 0.15 + random() * 0.7, total = tot where id = r.id;
  if w.uid is not null then
    insert into public.jp_payouts (round_id, uid, items, total)
    select r.id, w.uid, coalesce(jsonb_agg(e), '[]'::jsonb), tot
    from public.jp_bets b, jsonb_array_elements(b.items) e where b.round_id = r.id
    on conflict (round_id) do nothing;
  end if;
end $$;

-- «пульс» сессии: вызывает любой открытый сайт. Двигает раунд, иногда добавляет бота (общего для всех)
create or replace function public.jp_tick(p_room text, p_bot jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.jp_rounds; c record; n int; last_at timestamptz; v numeric; k int;
begin
  r := public.jp_active(p_room);
  if r.status = 'open' and now() >= r.ends_at then
    perform public.jp_settle(r.id);
    select * into r from public.jp_rounds where id = r.id;
  end if;
  if p_bot is not null and r.status in ('wait', 'open') then
    select * into c from public.jp_cfg(p_room);
    select count(distinct name), max(created_at) into n, last_at from public.jp_bets where round_id = r.id;
    v := (p_bot->>'value')::numeric;
    k := jsonb_array_length(coalesce(p_bot->'items', '[]'::jsonb));
    if n < 20 and k between 1 and 4 and v between c.lo * 0.5 and c.hi * 4
       and length(coalesce(p_bot->>'name', '')) between 2 and 24
       and (last_at is null or now() - last_at > interval '1.2 seconds')
       and (r.status = 'open' and r.ends_at - now() > interval '1.5 seconds' or r.status = 'wait' and now() - r.created_at > interval '2.5 seconds')
       and not exists (select 1 from public.jp_bets where round_id = r.id and name = p_bot->>'name') then
      insert into public.jp_bets (round_id, room, uid, name, items, value) values (r.id, p_room, null, p_bot->>'name', p_bot->'items', v);
      if r.status = 'wait' then
        update public.jp_rounds set status = 'open', ends_at = now() + make_interval(secs => c.t) where id = r.id returning * into r;
      end if;
    end if;
  end if;
  return jsonb_build_object('round', to_jsonb(r), 'now', now());
end $$;

-- ставка реального игрока
create or replace function public.jp_bet(p_room text, p_items jsonb, p_value numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.jp_rounds; c record; me public.profiles; n int; mine boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'no profile'; end if;
  if p_value is null or p_value <= 0 or p_value > 10000000 or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'bad bet'; end if;
  r := public.jp_active(p_room);
  if r.status not in ('wait', 'open') or (r.status = 'open' and now() >= r.ends_at) then raise exception 'closed'; end if;
  select count(distinct name), bool_or(uid = auth.uid()) into n, mine from public.jp_bets where round_id = r.id;
  if n >= 20 and not coalesce(mine, false) then raise exception 'full'; end if;
  insert into public.jp_bets (round_id, room, uid, name, ava, items, value) values (r.id, p_room, auth.uid(), me.name, me.ava, p_items, p_value);
  select * into c from public.jp_cfg(p_room);
  if r.status = 'wait' then
    update public.jp_rounds set status = 'open', ends_at = now() + make_interval(secs => c.t) where id = r.id;
  end if;
  return jsonb_build_object('round', r.id);
end $$;

-- забрать свои выигрыши (один раз)
create or replace function public.jp_claim() returns setof public.jp_payouts
language sql security definer set search_path = public as $$
  update public.jp_payouts set claimed = true where uid = auth.uid() and not claimed returning *;
$$;

revoke all on function public.jp_active(text), public.jp_settle(bigint) from public, anon, authenticated;
grant execute on function public.jp_tick(text, jsonb) to anon, authenticated;
grant execute on function public.jp_bet(text, jsonb, numeric), public.jp_claim() to authenticated;

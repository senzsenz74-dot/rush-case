-- ============================================================
-- RUSH CASE — «Краш»: режим (ползунок владельца) и статистика для админки (после crash.sql и crash_bots.sql).
-- Режим: -2 агрессивный (почти всегда взрыв сразу), -1 жёсткий, 0 баланс (окупаемость 90%), 1 щедрый, 2 дающий (держит до 40 с).
-- Режим действует со следующего раунда. Менять и видеть может только владелец (is_admin()).
-- Статистика — только реальные игроки (без ботов и админов), только завершённые раунды.
-- Выполнить в Supabase → SQL Editor.
-- ============================================================
create table if not exists public.crash_cfg (k text primary key, v numeric not null);
alter table public.crash_cfg enable row level security;
revoke all on public.crash_cfg from anon, authenticated;
insert into public.crash_cfg values ('mode', 0) on conflict (k) do nothing;
alter table public.crash_rounds add column if not exists mode int not null default 0;

create or replace function public._crash_mode() returns int language sql stable as $$
  select coalesce((select v::int from public.crash_cfg where k = 'mode'), 0)
$$;
-- точка взрыва по режиму: x = отдача / (1 − u); доля мгновенных взрывов = 1 − отдача
create or replace function public._crash_point(m int) returns numeric language plpgsql volatile as $$
declare rtp numeric;
begin
  if m >= 2 and random() < .65 then return 100; end if;           -- дающий: чаще всего дотягивает до 40-й секунды
  rtp := case m when -2 then .30 when -1 then .65 when 1 then 1.15 when 2 then 1.5 else .90 end;
  return least(100, greatest(1, floor(rtp / (1 - random()) * 100) / 100));
end $$;

create or replace function public._crash_cur() returns public.crash_rounds language plpgsql as $$
declare r public.crash_rounds; x numeric; s timestamptz; m int;
begin
  select * into r from public.crash_rounds order by id desc limit 1;
  if r.id is not null and clock_timestamp() < r.crash_at + interval '4 seconds' then return r; end if;
  perform pg_advisory_xact_lock(hashtext('rush-crash'));
  select * into r from public.crash_rounds order by id desc limit 1; -- вдруг уже создал соседний запрос
  if r.id is not null and clock_timestamp() < r.crash_at + interval '4 seconds' then return r; end if;
  m := public._crash_mode();
  x := public._crash_point(m);
  s := clock_timestamp() + interval '15 seconds';
  insert into public.crash_rounds (start_at, crash_x, crash_at, created_at, mode)
    values (s, x, s + make_interval(secs => public._crash_ms(x) / 1000), clock_timestamp(), m) returning * into r;
  perform public._crash_bots(r);
  return r;
end $$;

-- ползунок владельца
create or replace function public.crash_mode() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object('mode', public._crash_mode());
end $$;
create or replace function public.crash_set_mode(p_mode int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_mode not between -2 and 2 then raise exception 'bad mode'; end if;
  insert into public.crash_cfg values ('mode', p_mode) on conflict (k) do update set v = excluded.v;
  return jsonb_build_object('mode', p_mode);
end $$;

-- статистика краша за период: итоги, по часам/дням, игроки, распределение точек взрыва, режимы
create or replace function public.admin_crash(p_from timestamptz, p_to timestamptz, p_bucket text default 'day') returns jsonb
language plpgsql security definer set search_path = public as $$
declare b text := case when p_bucket = 'hour' then 'hour' else 'day' end; r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  with rr as (select * from public.crash_rounds where crash_at >= p_from and crash_at < p_to and crash_at <= now()),
  bb as (
    select x.*, rr.crash_at as t, rr.crash_x, p.pid, p.name as pname
    from public.crash_bets x join rr on rr.id = x.round_id join public.profiles p on p.id = x.uid
    where not x.bot and x.uid is not null and not p.is_admin),
  buckets as (select date_trunc(b, gs) as t from generate_series(date_trunc(b, p_from), p_to - interval '1 second', ('1 ' || b)::interval) gs),
  per as (
    select k.t,
      (select count(*) from rr where date_trunc(b, rr.crash_at) = k.t) as rounds,
      (select count(distinct round_id) from bb where date_trunc(b, bb.t) = k.t) as live,
      (select count(*) from bb where date_trunc(b, bb.t) = k.t) as bets,
      (select count(distinct uid) from bb where date_trunc(b, bb.t) = k.t) as players,
      (select count(*) from bb where cash_x is not null and date_trunc(b, bb.t) = k.t) as wins,
      (select coalesce(sum(stake), 0) from bb where date_trunc(b, bb.t) = k.t) as stake,
      (select coalesce(sum(prize_p), 0) from bb where cash_x is not null and date_trunc(b, bb.t) = k.t) as won
    from buckets k)
  select jsonb_build_object(
    'series', coalesce((select jsonb_agg(jsonb_build_object('t', per.t, 'rounds', per.rounds, 'live', per.live, 'bets', per.bets, 'players', per.players,
        'wins', per.wins, 'stake', per.stake, 'won', per.won, 'profit', per.stake - per.won) order by per.t) from per), '[]'::jsonb),
    'total', jsonb_build_object(
      'rounds', (select count(*) from rr), 'live', (select count(distinct round_id) from bb),
      'bets', (select count(*) from bb), 'players', (select count(distinct uid) from bb),
      'wins', (select count(*) from bb where cash_x is not null),
      'stake', (select coalesce(sum(stake), 0) from bb), 'won', (select coalesce(sum(prize_p), 0) from bb where cash_x is not null),
      'profit', (select coalesce(sum(stake), 0) - coalesce(sum(prize_p) filter (where cash_x is not null), 0) from bb),
      'avgX', (select round(avg(crash_x), 2) from rr), 'instant', (select count(*) from rr where crash_x <= 1),
      'maxWin', (select coalesce(max(prize_p), 0) from bb where cash_x is not null), 'maxX', (select coalesce(max(cash_x), 0) from bb)),
    'bands', (select jsonb_agg(jsonb_build_object('lo', lo, 'n', (select count(*) from rr where crash_x >= lo and crash_x < hi))) from (values
        (1::numeric, 1.01::numeric), (1.01, 1.5), (1.5, 2), (2, 3), (3, 5), (5, 10), (10, 20), (20, 100), (100, 1000)) v(lo, hi)),
    'modes', coalesce((select jsonb_object_agg(mode::text, n) from (select mode, count(*) as n from rr group by mode) m), '{}'::jsonb),
    'players', coalesce((select jsonb_agg(to_jsonb(t) order by t.stake desc) from (
      select pid, max(pname) as name, count(*) as n, count(*) filter (where cash_x is not null) as wins, sum(stake) as stake,
        coalesce(sum(prize_p) filter (where cash_x is not null), 0) as won, max(cash_x) as max_x
      from bb group by pid order by sum(stake) desc limit 30) t), '[]'::jsonb),
    'mode', public._crash_mode()
  ) into r;
  return r;
end $$;

revoke all on function public.crash_mode(), public.crash_set_mode(int), public.admin_crash(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.crash_mode(), public.crash_set_mode(int), public.admin_crash(timestamptz, timestamptz, text) to authenticated;
revoke all on function public._crash_point(int), public._crash_mode() from public, anon, authenticated;

select 'краш: режим и статистика готовы' as result;

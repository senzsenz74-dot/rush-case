-- ============================================================
-- RUSH CASE — статистика без админских аккаунтов (их тесты на начисленных деньгах искажают цифры)
--   деньги, кейсы, апгрейд, ставки, разбор дня — без событий админов; онлайн — как раньше (без их аккаунтов и устройств)
--   ставки: админ в раунде считается как бот (сайт) — его ставка не «реальная», его выигрыш — выигрыш сайта
-- Выполнить в Supabase → SQL Editor.
-- ============================================================
create or replace function public._adm_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where is_admin
$$;
revoke all on function public._adm_ids() from public, anon, authenticated;

-- ---------- общая статистика за период ----------
create or replace function public.admin_period(p_from timestamptz, p_to timestamptz, p_bucket text default 'day') returns jsonb
language plpgsql security definer set search_path = public as $$
declare b text := case when p_bucket = 'hour' then 'hour' else 'day' end; r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  with ev0 as (select * from public.site_events where ts >= p_from and ts < p_to),
  adm as (select id from public.profiles where is_admin),
  admsid as (select distinct e.sid from public.site_events e where e.uid in (select id from adm)),
  ev as (select * from ev0 where uid is null or uid not in (select id from adm)),           -- деньги и игра — без админов
  evo as (select * from ev where sid not in (select sid from admsid)),                      -- онлайн — ещё и без их устройств
  slots as (select to_timestamp(floor(extract(epoch from ts) / 300) * 300) as t, count(distinct sid) as n from evo where kind = 'hb' group by 1),
  regs as (select created_at from public.profiles where created_at >= p_from and created_at < p_to and not is_admin),
  gr as (select g.created_at, g.amount from public.balance_grants g where g.created_at >= p_from and g.created_at < p_to and g.uid not in (select id from adm)),
  buckets as (select date_trunc(b, gs) as t from generate_series(date_trunc(b, p_from), p_to - interval '1 second', ('1 ' || b)::interval) gs),
  per as (
    select k.t,
      (select coalesce(max(s.n), 0) from slots s where date_trunc(b, s.t) = k.t) as peak,
      (select coalesce(round(avg(s.n), 1), 0) from slots s where date_trunc(b, s.t) = k.t) as avg,
      (select count(distinct e.sid) from evo e where e.kind = 'hb' and date_trunc(b, e.ts) = k.t) as visitors,
      (select count(distinct e.uid) from evo e where e.uid is not null and date_trunc(b, e.ts) = k.t) as players,
      (select coalesce(sum(e.amount), 0) from ev e where e.kind = 'dep' and date_trunc(b, e.ts) = k.t) as dep,
      (select coalesce(sum(e.amount), 0) from ev e where e.kind = 'out' and date_trunc(b, e.ts) = k.t) as out,
      (select coalesce(sum(e.amount), 0) from ev e where e.kind = 'open' and date_trunc(b, e.ts) = k.t) as spent,
      (select coalesce(sum(e.won), 0) from ev e where e.kind = 'open' and date_trunc(b, e.ts) = k.t) as won,
      (select count(*) from regs p where date_trunc(b, p.created_at) = k.t) as reg
    from buckets k)
  select jsonb_build_object(
    'bucket', b,
    'series', coalesce((select jsonb_agg(to_jsonb(per) order by per.t) from per), '[]'::jsonb),
    'total', jsonb_build_object(
      'peak', (select coalesce(max(n), 0) from slots),
      'avg', (select coalesce(round(avg(n), 1), 0) from slots),
      'visitors', (select count(distinct sid) from evo where kind = 'hb'),
      'players', (select count(distinct uid) from evo where uid is not null),
      'reg', (select count(*) from regs),
      'dep', (select coalesce(sum(amount), 0) from ev where kind = 'dep'),
      'depN', (select count(*) from ev where kind = 'dep'),
      'out', (select coalesce(sum(amount), 0) from ev where kind = 'out'),
      'outN', (select count(*) from ev where kind = 'out'),
      'spent', (select coalesce(sum(amount), 0) from ev where kind = 'open'),
      'won', (select coalesce(sum(won), 0) from ev where kind = 'open'),
      'opens', (select count(*) from ev where kind = 'open'),
      'jp', (select coalesce(sum(total), 0) from public.jp_rounds where spin_at >= p_from and spin_at < p_to),
      'grants', (select coalesce(sum(amount), 0) from gr))
  ) into r;
  return r;
end $$;

-- ---------- апгрейд ----------
create or replace function public.admin_upg(p_from timestamptz, p_to timestamptz, p_bucket text default 'day') returns jsonb
language plpgsql security definer set search_path = public as $$
declare b text := case when p_bucket = 'hour' then 'hour' else 'day' end; r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  with ev as (select * from public.site_events where kind = 'upg' and ts >= p_from and ts < p_to and (uid is null or uid not in (select public._adm_ids()))),
  buckets as (select date_trunc(b, gs) as t from generate_series(date_trunc(b, p_from), p_to - interval '1 second', ('1 ' || b)::interval) gs),
  per as (
    select k.t,
      (select count(*) from ev e where date_trunc(b, e.ts) = k.t) as n,
      (select count(*) from ev e where e.won > 0 and date_trunc(b, e.ts) = k.t) as wins,
      (select coalesce(sum(e.amount), 0) from ev e where date_trunc(b, e.ts) = k.t) as stake,
      (select coalesce(sum(e.won), 0) from ev e where date_trunc(b, e.ts) = k.t) as won
    from buckets k)
  select jsonb_build_object(
    'series', coalesce((select jsonb_agg(to_jsonb(per) order by per.t) from per), '[]'::jsonb),
    'total', (select jsonb_build_object('n', count(*), 'wins', count(*) filter (where won > 0), 'stake', coalesce(sum(amount), 0), 'won', coalesce(sum(won), 0),
        'players', count(distinct uid), 'avgX', coalesce(round(avg(x), 2), 0), 'maxWin', coalesce(max(won), 0), 'maxX', coalesce(max(x) filter (where won > 0), 0)) from ev),
    'byX', coalesce((select jsonb_agg(to_jsonb(t) order by t.lo) from (
        select case when x < 1.5 then 1 when x < 2 then 1.5 when x < 3 then 2 when x < 5 then 3 when x < 10 then 5 when x < 20 then 10 else 20 end as lo,
               count(*) as n, count(*) filter (where won > 0) as wins, coalesce(sum(amount), 0) as stake, coalesce(sum(won), 0) as won
        from ev group by 1) t), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- ---------- ставки: админ — как бот (сайт) ----------
create or replace function public.admin_bets(p_from timestamptz, p_to timestamptz, p_bucket text default 'day') returns jsonb
language plpgsql security definer set search_path = public as $$
declare b text := case when p_bucket = 'hour' then 'hour' else 'day' end; r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  with adm as (select public._adm_ids() as id),
  rb as (select * from public.jp_bets x where x.uid is not null and x.uid not in (select id from adm)),
  rr as (
    select jr.id, coalesce(jr.spin_at, jr.created_at) as t, jr.total,
      case when jr.winner_uid in (select id from adm) then null else jr.winner_uid end as winner_uid,
      coalesce((select sum(value) from rb where rb.round_id = jr.id), 0) as real_bets
    from public.jp_rounds jr where jr.status = 'done' and coalesce(jr.spin_at, jr.created_at) >= p_from and coalesce(jr.spin_at, jr.created_at) < p_to),
  rp as (select *, case when real_bets = 0 then 0 when winner_uid is not null then real_bets - total else real_bets end as profit from rr),
  buckets as (select date_trunc(b, gs) as t from generate_series(date_trunc(b, p_from), p_to - interval '1 second', ('1 ' || b)::interval) gs),
  per as (
    select k.t,
      (select count(*) from rp where date_trunc(b, rp.t) = k.t) as rounds,
      (select count(*) from rp where rp.real_bets > 0 and date_trunc(b, rp.t) = k.t) as live,
      (select coalesce(sum(total), 0) from rp where date_trunc(b, rp.t) = k.t) as pot,
      (select coalesce(sum(real_bets), 0) from rp where date_trunc(b, rp.t) = k.t) as bets,
      (select count(distinct x.uid) from rb x join rp on rp.id = x.round_id where date_trunc(b, rp.t) = k.t) as players,
      (select count(*) from rp where rp.winner_uid is not null and rp.real_bets > 0 and date_trunc(b, rp.t) = k.t) as pwins,
      (select coalesce(sum(profit), 0) from rp where date_trunc(b, rp.t) = k.t) as profit
    from buckets k)
  select jsonb_build_object(
    'series', coalesce((select jsonb_agg(to_jsonb(per) order by per.t) from per), '[]'::jsonb),
    'total', jsonb_build_object(
      'rounds', (select count(*) from rp), 'live', (select count(*) from rp where real_bets > 0),
      'pot', (select coalesce(sum(total), 0) from rp), 'bets', (select coalesce(sum(real_bets), 0) from rp),
      'players', (select count(distinct x.uid) from rb x join rp on rp.id = x.round_id),
      'pwins', (select count(*) from rp where winner_uid is not null and real_bets > 0), 'profit', (select coalesce(sum(profit), 0) from rp),
      'maxPot', (select coalesce(max(total), 0) from rp))
  ) into r;
  return r;
end $$;

-- ---------- кейсы за период ----------
create or replace function public.admin_cases_period(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('c', c, 'n', n, 'calls', calls, 'players', players, 'spent', spent, 'won', won) order by spent desc) from (
    select c, sum(greatest(x, 1)) n, count(*) calls, count(distinct uid) players, sum(amount) spent, sum(won) won
    from public.site_events where kind = 'open' and c is not null and ts >= p_from and ts < p_to and (uid is null or uid not in (select public._adm_ids())) group by c) t), '[]'::jsonb);
end $$;

-- ---------- разбор дня: крупнейшие выигрыши ----------
create or replace function public.admin_day_top(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.net desc) from (
    select e.ts, e.kind, e.c, e.amount, e.won, e.x, e.won - e.amount as net, p.name, p.pid
    from public.site_events e left join public.profiles p on p.id = e.uid
    where e.kind in ('open', 'upg') and e.ts >= p_from and e.ts < p_to and e.won > e.amount and not coalesce(p.is_admin, false)
    order by e.won - e.amount desc limit 10) t), '[]'::jsonb);
end $$;

select 'статистика без админов' as result;

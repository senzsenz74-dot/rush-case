-- Онлайн и посетители без админов (их аккаунтов и устройств). Посетитель = устройство (сайт хранит номер устройства в браузере).
-- Запустить в Supabase → SQL Editor (то же уже есть в stats.sql).
create or replace function public.admin_period(p_from timestamptz, p_to timestamptz, p_bucket text default 'day') returns jsonb
language plpgsql security definer set search_path = public as $$
declare b text := case when p_bucket = 'hour' then 'hour' else 'day' end; r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  with ev as (select * from public.site_events where ts >= p_from and ts < p_to),
  -- онлайн и посетители — без админов: их аккаунтов и всех устройств (sid), с которых админ хоть раз заходил
  adm as (select id from public.profiles where is_admin),
  admsid as (select distinct e.sid from public.site_events e where e.uid in (select id from adm)),
  evo as (select * from ev where (uid is null or uid not in (select id from adm)) and sid not in (select sid from admsid)),
  slots as (  -- онлайн в каждые 5 минут: сколько разных устройств прислали пульс
    select to_timestamp(floor(extract(epoch from ts) / 300) * 300) as t, count(distinct sid) as n
    from evo where kind = 'hb' group by 1),
  buckets as (
    select date_trunc(b, gs) as t from generate_series(date_trunc(b, p_from), p_to - interval '1 second', ('1 ' || b)::interval) gs),
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
      (select count(*) from public.profiles p where p.created_at >= p_from and p.created_at < p_to and date_trunc(b, p.created_at) = k.t) as reg
    from buckets k)
  select jsonb_build_object(
    'bucket', b,
    'series', coalesce((select jsonb_agg(to_jsonb(per) order by per.t) from per), '[]'::jsonb),
    'total', jsonb_build_object(
      'peak', (select coalesce(max(n), 0) from slots),
      'avg', (select coalesce(round(avg(n), 1), 0) from slots),
      'visitors', (select count(distinct sid) from evo where kind = 'hb'),
      'players', (select count(distinct uid) from evo where uid is not null),
      'reg', (select count(*) from public.profiles where created_at >= p_from and created_at < p_to),
      'dep', (select coalesce(sum(amount), 0) from ev where kind = 'dep'),
      'depN', (select count(*) from ev where kind = 'dep'),
      'out', (select coalesce(sum(amount), 0) from ev where kind = 'out'),
      'outN', (select count(*) from ev where kind = 'out'),
      'spent', (select coalesce(sum(amount), 0) from ev where kind = 'open'),
      'won', (select coalesce(sum(won), 0) from ev where kind = 'open'),
      'opens', (select count(*) from ev where kind = 'open'),
      'jp', (select coalesce(sum(total), 0) from public.jp_rounds where spin_at >= p_from and spin_at < p_to),
      'grants', (select coalesce(sum(amount), 0) from public.balance_grants where created_at >= p_from and created_at < p_to))
  ) into r;
  return r;
end $$;

select 'онлайн без админов' as result;

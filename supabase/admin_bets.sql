-- Ставки (джекпот) за период для админ-панели: раунды, реальные игроки, их ставки, прибыль сайта.
-- Прибыль сайта с раунда: боты — это сайт. Выиграл бот → сайту ставки реальных игроков; выиграл игрок → он забрал весь банк,
-- сайт: ставки реальных игроков − банк (минус, если в банке были ставки ботов).
-- Запустить в Supabase → SQL Editor.
create or replace function public.admin_bets(p_from timestamptz, p_to timestamptz, p_bucket text default 'day') returns jsonb
language plpgsql security definer set search_path = public as $$
declare b text := case when p_bucket = 'hour' then 'hour' else 'day' end; r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  with rr as (
    select jr.id, coalesce(jr.spin_at, jr.created_at) as t, jr.total, jr.winner_uid,
      coalesce((select sum(value) from public.jp_bets x where x.round_id = jr.id and x.uid is not null), 0) as real_bets,
      (select count(distinct x.uid) from public.jp_bets x where x.round_id = jr.id and x.uid is not null) as real_players
    from public.jp_rounds jr where jr.status = 'done' and coalesce(jr.spin_at, jr.created_at) >= p_from and coalesce(jr.spin_at, jr.created_at) < p_to),
  rp as (select *, case when real_bets = 0 then 0 when winner_uid is not null then real_bets - total else real_bets end as profit from rr),
  buckets as (select date_trunc(b, gs) as t from generate_series(date_trunc(b, p_from), p_to - interval '1 second', ('1 ' || b)::interval) gs),
  per as (
    select k.t,
      (select count(*) from rp where date_trunc(b, rp.t) = k.t) as rounds,
      (select count(*) from rp where rp.real_bets > 0 and date_trunc(b, rp.t) = k.t) as live,
      (select coalesce(sum(total), 0) from rp where date_trunc(b, rp.t) = k.t) as pot,
      (select coalesce(sum(real_bets), 0) from rp where date_trunc(b, rp.t) = k.t) as bets,
      (select count(distinct x.uid) from public.jp_bets x join rp on rp.id = x.round_id where x.uid is not null and date_trunc(b, rp.t) = k.t) as players,
      (select count(*) from rp where rp.winner_uid is not null and date_trunc(b, rp.t) = k.t) as pwins,
      (select coalesce(sum(profit), 0) from rp where date_trunc(b, rp.t) = k.t) as profit
    from buckets k)
  select jsonb_build_object(
    'series', coalesce((select jsonb_agg(to_jsonb(per) order by per.t) from per), '[]'::jsonb),
    'total', jsonb_build_object(
      'rounds', (select count(*) from rp), 'live', (select count(*) from rp where real_bets > 0),
      'pot', (select coalesce(sum(total), 0) from rp), 'bets', (select coalesce(sum(real_bets), 0) from rp),
      'players', (select count(distinct x.uid) from public.jp_bets x join rp on rp.id = x.round_id where x.uid is not null),
      'pwins', (select count(*) from rp where winner_uid is not null), 'profit', (select coalesce(sum(profit), 0) from rp),
      'maxPot', (select coalesce(max(total), 0) from rp))
  ) into r;
  return r;
end $$;
revoke all on function public.admin_bets(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_bets(timestamptz, timestamptz, text) to authenticated;

select 'ставки в админке' as result;

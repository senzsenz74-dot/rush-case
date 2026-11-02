-- ============================================================
-- RUSH CASE — «Краш»: боты в каждом раунде (после crash.sql).
-- 3–9 ботов на раунд; ставки 1–3 скина из каталога: обычно 50–500 ₽, иногда до 5000 ₽.
-- Ведут себя как живые: у каждого свой x вывода (чаще x1.2–2, иногда x5–20+), успевает только тот,
-- чей x меньше настоящей точки взрыва. Появляются в списке постепенно, пока идёт приём ставок.
-- Боты ничего не получают и не теряют: строки только для витрины (uid пустой, settled сразу).
-- Выполнить в Supabase → SQL Editor.
-- ============================================================
alter table public.crash_bets alter column uid drop not null;
alter table public.crash_bets add column if not exists bot boolean not null default false;

create or replace function public._crash_bots(r public.crash_rounds) returns void language plpgsql as $$
declare
  names text[] := (select array_agg(n order by random()) from unnest(array[
    'Kirill_KZ','ShadowFox','Clutch_King','toxic_ivan','Zeus77','dimon228','ProSniper','lazy_cat','Smurfik','Vanya_AWP',
    'Gromila','Kolya','rush_b','FragMaster','HeadHunter','Снайпер','Сашка','Мангуст','ПашаТехник','Lynx','Bober',
    'xXx_Sniper','monkey_d','Flick_God','Tima','Raptor','NeoNoir','Artem2009','Viper','Kenny']) n);
  cnt int := 3 + floor(random() * 7)::int; i int; k int; j int; tgt numeric; one numeric; it text; its jsonb; s numeric; u double precision; ax numeric;
begin
  for i in 1..cnt loop
    -- размер ставки: 85% — 50–500 ₽, 15% — 500–5000 ₽ (равномерно по порядку величины)
    tgt := case when random() < .85 then 50 * power(10, random()) else 500 * power(10, random()) end;
    k := 1 + floor(random() * 3)::int; its := '[]'::jsonb; s := 0;
    for j in 1..k loop
      one := tgt / k;
      select n into it from public.catalog where c <> 'cash' and p between one * .75 and one * 1.25 order by random() limit 1;
      if it is null then select n into it from public.catalog where c <> 'cash' and p > 0 order by abs(p - one) limit 1; end if;
      its := its || to_jsonb(it); s := s + public._price(it); it := null;
    end loop;
    if s < 50 then continue; end if;
    -- x вывода: чаще рано, иногда жадно
    u := random();
    ax := round((case when u < .5 then 1.15 + random() * .85 when u < .8 then 2 + random() * 3 when u < .95 then 5 + random() * 15 else 20 + random() * 60 end)::numeric, 2);
    insert into public.crash_bets (round_id, uid, name, items, stake, auto_x, prize, prize_p, settled, bot, created_at)
      values (r.id, null, names[i], its, s, ax, public._crash_prize(s * ax), null, true, true,
              r.created_at + make_interval(secs => .6 + random() * 13));
  end loop;
end $$;

-- раунд создаётся вместе с ботами
create or replace function public._crash_cur() returns public.crash_rounds language plpgsql as $$
declare r public.crash_rounds; x numeric; s timestamptz;
begin
  select * into r from public.crash_rounds order by id desc limit 1;
  if r.id is not null and clock_timestamp() < r.crash_at + interval '4 seconds' then return r; end if;
  perform pg_advisory_xact_lock(hashtext('rush-crash'));
  select * into r from public.crash_rounds order by id desc limit 1; -- вдруг уже создал соседний запрос
  if r.id is not null and clock_timestamp() < r.crash_at + interval '4 seconds' then return r; end if;
  x := least(100, greatest(1, floor(0.90 / (1 - random()) * 100) / 100));
  s := clock_timestamp() + interval '15 seconds';
  insert into public.crash_rounds (start_at, crash_x, crash_at, created_at)
    values (s, x, s + make_interval(secs => public._crash_ms(x) / 1000), clock_timestamp()) returning * into r;
  perform public._crash_bots(r);
  return r;
end $$;

-- состояние: боты видны с момента «своей» ставки; выигранный скин — только когда вывод уже случился
create or replace function public.crash_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.crash_rounds; d jsonb; now_ts timestamptz; crashed boolean; fly_ms double precision;
begin
  r := public._crash_cur();
  d := public._crash_settle_me();
  now_ts := clock_timestamp();
  crashed := now_ts >= r.crash_at;
  fly_ms := extract(epoch from (least(now_ts, r.crash_at) - r.start_at)) * 1000;
  return jsonb_build_object(
    'now', public._ts_ms(now_ts),
    'round', jsonb_build_object('id', r.id, 'start', public._ts_ms(r.start_at),
      'phase', case when now_ts < r.start_at then 'bet' when crashed then 'crash' else 'fly' end,
      'crash_x', case when crashed then r.crash_x end, 'crash_at', case when crashed then public._ts_ms(r.crash_at) end),
    'bets', coalesce((select jsonb_agg(jsonb_build_object('uid', t.uid, 'name', t.name, 'ava', t.ava, 'items', t.items, 'stake', t.stake, 'me', coalesce(t.uid = auth.uid(), false),
        'auto', case when t.uid = auth.uid() then t.auto_x end, 'cash', t.cash,
        'prize', case when t.cash is not null then t.prize end) order by t.stake desc)
      from (select b.*, coalesce(b.cash_x, case when b.auto_x is not null and b.auto_x < r.crash_x and fly_ms >= public._crash_ms(b.auto_x) then b.auto_x end) as cash
            from public.crash_bets b where b.round_id = r.id and b.created_at <= now_ts) t), '[]'::jsonb),
    'hist', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'x', h.crash_x) order by h.id desc)
      from (select id, crash_x from public.crash_rounds where crash_at <= now_ts order by id desc limit 30) h), '[]'::jsonb),
    'data', d);
end $$;

revoke all on function public._crash_bots(public.crash_rounds) from public, anon, authenticated;
select 'краш: боты готовы' as result;

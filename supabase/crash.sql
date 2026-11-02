-- ============================================================
-- RUSH CASE — режим «Краш» (бомба C4): общий раунд для всех игроков.
-- 15 с приём ставок (скины, до 10 шт., от 50 ₽) → множитель растёт x(t) = e^(k·t), k = ln(100)/40
-- (x2 ≈ 6 с, x10 ≈ 20 с, x100 = 40 с) → «БУМ» в случайный момент, не позже 40 с → 4 с итоги → новый раунд.
-- Точка краша: P(краш выше x) = 0,90 / x (окупаемость 90%), 10% раундов взрываются сразу на x1.00, максимум x100.
-- Точку краша клиент не видит, пока бомба не взорвалась. Забрал на x — получает случайный скин ценой ≈ ставка × x (±5%).
-- Раунд создаётся «лениво» — первым запросом после окончания прошлого (отдельный таймер на сервере не нужен).
-- Выполнить в Supabase → SQL Editor.
-- ============================================================
create table if not exists public.crash_rounds (
  id bigserial primary key,
  start_at timestamptz not null,          -- конец приёма ставок = старт бомбы
  crash_x numeric not null,               -- множитель взрыва (секрет до crash_at)
  crash_at timestamptz not null,          -- момент взрыва
  created_at timestamptz not null default now()
);
create table if not exists public.crash_bets (
  id bigserial primary key,
  round_id bigint not null references public.crash_rounds on delete cascade,
  uid uuid not null,
  name text,
  ava text,
  items jsonb not null,                   -- названия поставленных скинов
  stake numeric not null check (stake > 0),
  auto_x numeric,                         -- автовывод (необязательно)
  cash_x numeric,                         -- на каком x забрал (null — не забрал)
  prize text,
  prize_p numeric,
  settled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (round_id, uid)
);
create index if not exists crash_bets_uid on public.crash_bets (uid) where not settled;
create index if not exists crash_bets_ts on public.crash_bets (created_at);
-- таблицы закрыты: всё только через функции ниже
alter table public.crash_rounds enable row level security;
alter table public.crash_bets enable row level security;
revoke all on public.crash_rounds, public.crash_bets from anon, authenticated;

-- лента живых выигрышей: новый тип 'crash'
alter table public.live_drops drop constraint if exists live_drops_t_check;
alter table public.live_drops add constraint live_drops_t_check check (t in ('case', 'upg', 'con', 'crash'));

create or replace function public._crash_k() returns double precision language sql immutable as $$ select ln(100::double precision) / 40 $$;
-- множитель через ms миллисекунд полёта (вниз до сотых)
create or replace function public._crash_x(ms double precision) returns numeric language sql immutable as $$
  select least(100, floor(exp(public._crash_k() * greatest(0, ms) / 1000) * 100) / 100)::numeric
$$;
-- сколько миллисекунд до множителя x
create or replace function public._crash_ms(x numeric) returns double precision language sql immutable as $$
  select ln(greatest(1, x)::double precision) / public._crash_k() * 1000
$$;
create or replace function public._ts_ms(t timestamptz) returns bigint language sql immutable as $$ select (extract(epoch from t) * 1000)::bigint $$;

-- текущий раунд (создаёт новый, если прошлый взорвался больше 4 с назад)
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
  insert into public.crash_rounds (start_at, crash_x, crash_at)
    values (s, x, s + make_interval(secs => public._crash_ms(x) / 1000)) returning * into r;
  return r;
end $$;

-- случайный скин ценой ≈ v (±5%), иначе ближайший по цене
create or replace function public._crash_prize(v numeric) returns text language sql volatile as $$
  select coalesce(
    (select n from public.catalog where c <> 'cash' and p between v * 0.95 and v * 1.05 order by random() limit 1),
    (select n from public.catalog where c <> 'cash' and p > 0 order by abs(p - v), random() limit 1))
$$;

-- выплата по ставке: d — профиль владельца ставки (auth.uid()), возвращает обновлённый d
create or replace function public._crash_win(d jsonb, b public.crash_bets, x numeric) returns jsonb language plpgsql as $$
declare pz text := public._crash_prize(b.stake * x); pp numeric := public._price(pz);
begin
  d := public._stat(public._give(d, pz, 'crash'), 'crashWin', 1);
  update public.crash_bets set cash_x = x, prize = pz, prize_p = pp, settled = true where id = b.id;
  perform public._live(pz, 'crash', null, x);
  return d;
end $$;

-- рассчитать свои незакрытые ставки: автовывод сработал / бомба взорвалась
create or replace function public._crash_settle_me() returns jsonb language plpgsql as $$
declare b public.crash_bets; r public.crash_rounds; d jsonb; ch boolean := false; now_ts timestamptz := clock_timestamp();
begin
  if auth.uid() is null or not exists (select 1 from public.crash_bets where uid = auth.uid() and not settled) then return null; end if;
  d := public._me();
  for b in select * from public.crash_bets where uid = auth.uid() and not settled for update loop
    select * into r from public.crash_rounds where id = b.round_id;
    if b.auto_x is not null and b.auto_x < r.crash_x and now_ts >= r.start_at + make_interval(secs => public._crash_ms(b.auto_x) / 1000) then
      d := public._crash_win(d, b, b.auto_x); ch := true;
    elsif now_ts >= r.crash_at then
      update public.crash_bets set settled = true where id = b.id;
    end if;
  end loop;
  if ch then perform public._save(d); return d; end if;
  return null;
end $$;

-- состояние для страницы: раунд, ставки, история; заодно рассчитывает свои ставки
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
    'bets', coalesce((select jsonb_agg(jsonb_build_object('uid', b.uid, 'name', b.name, 'ava', b.ava, 'items', b.items, 'stake', b.stake, 'me', b.uid = auth.uid(),
        'auto', case when b.uid = auth.uid() then b.auto_x end,
        'cash', coalesce(b.cash_x, case when b.auto_x is not null and b.auto_x < r.crash_x and fly_ms >= public._crash_ms(b.auto_x) then b.auto_x end),
        'prize', b.prize) order by b.stake desc)
      from public.crash_bets b where b.round_id = r.id), '[]'::jsonb),
    'hist', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'x', h.crash_x) order by h.id desc)
      from (select id, crash_x from public.crash_rounds where crash_at <= now_ts order by id desc limit 30) h), '[]'::jsonb),
    'data', d);
end $$;

-- ставка скинами в текущий раунд (только пока идёт приём ставок)
create or replace function public.crash_bet(p_ids text[], p_auto numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.crash_rounds; d jsonb; m jsonb; me public.profiles; v numeric;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(array_length(p_ids, 1), 0) not between 1 and 10 then raise exception 'bad bet'; end if;
  if p_auto is not null and (p_auto < 1.01 or p_auto > 100) then raise exception 'bad auto'; end if;
  r := public._crash_cur();
  if clock_timestamp() >= r.start_at then raise exception 'closed'; end if;
  if exists (select 1 from public.crash_bets where round_id = r.id and uid = auth.uid()) then raise exception 'already bet'; end if;
  select * into me from public.profiles where id = auth.uid();
  d := public._me();
  m := public._mark(d->'inv', p_ids, 'crash', jsonb_build_object('round', r.id));
  if (m->>'n')::int <> array_length(p_ids, 1) then raise exception 'items unavailable'; end if;
  v := (m->>'sum')::numeric;
  if v < 50 then raise exception 'stake too small'; end if;
  d := public._stat(jsonb_set(d, '{inv}', m->'inv'), 'crash', 1);
  insert into public.crash_bets (round_id, uid, name, ava, items, stake, auto_x)
    values (r.id, auth.uid(), me.name, me.ava, m->'names', v, round(p_auto, 2));
  perform public._save(d);
  return jsonb_build_object('ok', true, 'round', r.id, 'stake', v, 'data', d);
end $$;

-- забрать ставку: множитель считается по времени сервера
create or replace function public.crash_cashout(p_round bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.crash_rounds; b public.crash_bets; d jsonb; now_ts timestamptz := clock_timestamp(); x numeric;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into r from public.crash_rounds where id = p_round;
  select * into b from public.crash_bets where round_id = p_round and uid = auth.uid() for update;
  if b.id is null then raise exception 'no bet'; end if;
  if b.settled then
    return jsonb_build_object('win', b.cash_x is not null, 'x', b.cash_x, 'prize', b.prize, 'crash_x', case when now_ts >= r.crash_at then r.crash_x end);
  end if;
  if now_ts < r.start_at then raise exception 'not started'; end if;
  d := public._me();
  x := public._crash_x(extract(epoch from (now_ts - r.start_at)) * 1000);
  if b.auto_x is not null and b.auto_x < r.crash_x and b.auto_x <= x then x := b.auto_x; -- автовывод сработал раньше
  elsif now_ts >= r.crash_at or x >= r.crash_x then
    update public.crash_bets set settled = true where id = b.id;
    return jsonb_build_object('win', false, 'crash_x', r.crash_x);
  end if;
  d := public._crash_win(d, b, x);
  perform public._save(d);
  return jsonb_build_object('win', true, 'x', x, 'prize', (select prize from public.crash_bets where id = b.id), 'id', d->'inv'->0->>'id', 'data', d);
end $$;

revoke all on function public.crash_state(), public.crash_bet(text[], numeric), public.crash_cashout(bigint) from public;
grant execute on function public.crash_state() to anon, authenticated;
grant execute on function public.crash_bet(text[], numeric), public.crash_cashout(bigint) to authenticated;
revoke all on function public._crash_cur(), public._crash_prize(numeric), public._crash_win(jsonb, public.crash_bets, numeric), public._crash_settle_me() from public, anon, authenticated;

select 'краш: готово' as result;

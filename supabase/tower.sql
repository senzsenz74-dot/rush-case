-- ============================================================
-- RUSH CASE — режим «Башня»: 8 этажей × 4 клетки, в каждом ряду 1–3 бомбы (выбирает игрок).
-- Ставка: скины из инвентаря и/или рубли с баланса (вместе от 10 ₽).
-- На каждом этаже игрок открывает одну клетку: пусто — поднимается выше, бомба — ставка сгорает.
-- Множитель этажа k (1..8): плавно растёт от m1 = окупаемость / p до «вершины» T на 8-м этаже, p = (4 − бомб) / 4:
--   M(k) = min( окупаемость / p^k ,  m1 · (T / m1)^((k−1)/7) )  — никогда не выше честного (окупаемость на любом этаже ≤ заданной).
--   Вершины по умолчанию: 1 бомба ×7,5, 2 бомбы ×20, 3 бомбы ×50 (site_cfg 'tower' → top: [7.5, 20, 50]).
--   При 75%: 1 бомба ×1 … ×7,49; 2 бомбы ×1,5 … ×20; 3 бомбы ×3 … ×50.
-- Забрать можно после любого пройденного этажа: выдаётся случайный скин ценой ≈ ставка × M (как в краше).
-- Раскладку бомб знает только сервер; игрок видит её после конца игры.
-- Окупаемость и «режим закрыт»: site_cfg 'tower' → {"rtp": 0.75, "off": false} (админка → Игры → Башня).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run (после server.sql, crash.sql, site_cfg.sql).
-- ============================================================

create table if not exists public.tower_games (
  id bigserial primary key,
  uid uuid not null,
  bombs int not null check (bombs between 1 and 3),
  stake numeric not null check (stake > 0),   -- вся ставка в рублях (скины + баланс)
  items jsonb not null default '[]'::jsonb,   -- названия поставленных скинов
  bal numeric not null default 0,             -- сколько рублей с баланса
  rtp numeric not null,                       -- окупаемость на момент старта
  top numeric not null default 10,             -- множитель вершины (8-й этаж) на момент старта
  layout jsonb not null,                      -- [[колонки с бомбами], …] по этажам снизу вверх — секрет до конца игры
  picks jsonb not null default '[]'::jsonb,   -- выбранные клетки по этажам
  level int not null default 0,               -- сколько этажей пройдено
  status text not null default 'play' check (status in ('play', 'lost', 'cash')),
  mult numeric,                               -- множитель при выводе
  prize text,
  prize_p numeric,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists tower_games_uid on public.tower_games (uid, id desc);
create unique index if not exists tower_games_one_active on public.tower_games (uid) where status = 'play';
alter table public.tower_games add column if not exists top numeric not null default 10;
alter table public.tower_games enable row level security;
revoke all on public.tower_games from anon, authenticated;

-- лента живых выигрышей: новый тип 'tower'
alter table public.live_drops drop constraint if exists live_drops_t_check;
alter table public.live_drops add constraint live_drops_t_check check (t in ('case', 'upg', 'con', 'crash', 'tower'));

insert into public.site_cfg (k, v) values ('tower', '{"rtp": 0.75, "top": [7.5, 20, 50]}'::jsonb) on conflict (k) do nothing;

create or replace function public._tower_rtp() returns numeric language sql stable as $$
  select least(0.98, greatest(0.3, coalesce((select (v->>'rtp')::numeric from public.site_cfg where k = 'tower'), 0.75)))
$$;
-- множитель после k пройденных этажей
-- вершина для числа бомб из настроек
create or replace function public._tower_top(p_bombs int) returns numeric language sql stable as $$
  select greatest(1.01, least(1000, coalesce((select (v->'top'->>(p_bombs - 1))::numeric from public.site_cfg where k = 'tower'), (array[7.5, 20, 50])[p_bombs])))
$$;
drop function if exists public._tower_m(int, int, numeric);
create or replace function public._tower_m(p_bombs int, p_k int, p_rtp numeric, p_top numeric) returns numeric language sql immutable as $$
  select case when p_k <= 0 then 0 else round(least(p_rtp / power((4 - p_bombs) / 4.0, p_k),
    (p_rtp / ((4 - p_bombs) / 4.0)) * power(greatest(1, p_top / (p_rtp / ((4 - p_bombs) / 4.0))), (p_k - 1) / 7.0)), 2) end
$$;
-- публичный вид игры (без раскладки, пока игра идёт)
create or replace function public._tower_pub(g public.tower_games) returns jsonb language sql stable as $$
  select jsonb_build_object('id', g.id, 'bombs', g.bombs, 'stake', g.stake, 'items', g.items, 'bal', g.bal, 'rtp', g.rtp,
    'top', g.top, 'level', g.level, 'picks', g.picks, 'status', g.status, 'mult', g.mult, 'prize', g.prize, 'prize_p', g.prize_p,
    'layout', case when g.status = 'play' then null else g.layout end)
$$;

-- выплата: скин ≈ ставка × M
create or replace function public._tower_pay(d jsonb, g public.tower_games) returns jsonb language plpgsql as $$
declare m numeric := public._tower_m(g.bombs, g.level, g.rtp, g.top); pz text := public._crash_prize(g.stake * m); pp numeric := public._price(pz);
begin
  d := public._stat(public._give(d, pz, 'tower'), 'towerWin', 1);
  update public.tower_games set status = 'cash', mult = m, prize = pz, prize_p = pp, ended_at = now() where id = g.id;
  perform public._live(pz, 'tower', null, m);
  return d;
end $$;

-- состояние: незаконченная игра (если есть) и 10 последних своих игр
create or replace function public.tower_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g public.tower_games;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into g from public.tower_games where uid = auth.uid() and status = 'play' limit 1;
  return jsonb_build_object('game', case when g.id is null then null else public._tower_pub(g) end, 'rtp', public._tower_rtp(),
    'top', jsonb_build_array(public._tower_top(1), public._tower_top(2), public._tower_top(3)),
    'off', coalesce((select (v->>'off')::boolean from public.site_cfg where k = 'tower'), false),
    'last', coalesce((select jsonb_agg(jsonb_build_object('bombs', t.bombs, 'stake', t.stake, 'level', t.level, 'status', t.status, 'mult', t.mult, 'prize', t.prize, 'prize_p', t.prize_p) order by t.id desc)
      from (select * from public.tower_games where uid = auth.uid() and status <> 'play' order by id desc limit 10) t), '[]'::jsonb));
end $$;

-- старт: ставка скинами (p_ids — id предметов инвентаря) и/или балансом (p_bal), p_bombs — бомб в ряду
create or replace function public.tower_start(p_ids text[], p_bal numeric, p_bombs int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; m jsonb; sv numeric := 0; b numeric := round(coalesce(p_bal, 0), 2); lay jsonb := '[]'::jsonb; i int; g public.tower_games; rtp numeric := public._tower_rtp();
begin
  if coalesce((select (v->>'off')::boolean from public.site_cfg where k = 'tower'), false) then raise exception 'case closed'; end if;
  if p_bombs is null or p_bombs not between 1 and 3 then raise exception 'bad bet'; end if;
  if b < 0 then raise exception 'bad bet'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 10 then raise exception 'bad bet'; end if;
  d := public._me();
  if exists (select 1 from public.tower_games where uid = auth.uid() and status = 'play') then raise exception 'game active'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 0 then
    m := public._mark(d->'inv', p_ids, 'tower');
    if (m->>'n')::int <> array_length(p_ids, 1) then raise exception 'items unavailable'; end if;
    sv := (m->>'sum')::numeric;
    d := jsonb_set(d, '{inv}', m->'inv');
  end if;
  if b > 0 then
    if coalesce((d->>'balance')::numeric, 0) < b then raise exception 'not enough balance'; end if;
    d := public._bal(d, -b);
  end if;
  if sv + b < 10 then raise exception 'stake too small'; end if;
  -- раскладка: на каждом этаже p_bombs разных колонок из 0..3
  for i in 1..8 loop
    lay := lay || jsonb_build_array((select jsonb_agg(c order by c) from (select c from generate_series(0, 3) c order by random() limit p_bombs) t));
  end loop;
  d := public._stat(d, 'tower', 1);
  insert into public.tower_games (uid, bombs, stake, items, bal, rtp, top, layout)
    values (auth.uid(), p_bombs, sv + b, coalesce(m->'names', '[]'::jsonb), b, rtp, public._tower_top(p_bombs), lay) returning * into g;
  perform public._save(d);
  return jsonb_build_object('game', public._tower_pub(g), 'data', d);
end $$;

-- ход: открыть клетку p_col (0..3) на текущем этаже
create or replace function public.tower_step(p_id bigint, p_col int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.tower_games; d jsonb; boom boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_col is null or p_col not between 0 and 3 then raise exception 'bad bet'; end if;
  select * into g from public.tower_games where id = p_id and uid = auth.uid() for update;
  if g.id is null or g.status <> 'play' then raise exception 'game over'; end if;
  boom := (g.layout->g.level) @> to_jsonb(p_col);
  g.picks := g.picks || to_jsonb(p_col);
  if boom then
    update public.tower_games set picks = g.picks, status = 'lost', ended_at = now() where id = g.id returning * into g;
    return jsonb_build_object('boom', true, 'game', public._tower_pub(g));
  end if;
  update public.tower_games set picks = g.picks, level = level + 1 where id = g.id returning * into g;
  -- верх башни — забираем автоматически
  if g.level >= 8 then
    d := public._me();
    d := public._tower_pay(d, g);
    perform public._save(d);
    select * into g from public.tower_games where id = p_id;
    return jsonb_build_object('boom', false, 'game', public._tower_pub(g), 'data', d);
  end if;
  return jsonb_build_object('boom', false, 'game', public._tower_pub(g));
end $$;

-- забрать выигрыш (после хотя бы одного пройденного этажа)
create or replace function public.tower_cash(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.tower_games; d jsonb;
begin
  d := public._me();
  select * into g from public.tower_games where id = p_id and uid = auth.uid() for update;
  if g.id is null or g.status <> 'play' then raise exception 'game over'; end if;
  if g.level < 1 then raise exception 'too early'; end if;
  d := public._tower_pay(d, g);
  perform public._save(d);
  select * into g from public.tower_games where id = p_id;
  return jsonb_build_object('game', public._tower_pub(g), 'data', d);
end $$;

-- админка: итоги за период (ставки, выплаты, игры)
create or replace function public.tower_admin_stats(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return (select jsonb_build_object('n', count(*), 'stake', coalesce(sum(stake), 0), 'paid', coalesce(sum(prize_p) filter (where status = 'cash'), 0),
    'won', count(*) filter (where status = 'cash'), 'lost', count(*) filter (where status = 'lost'), 'play', count(*) filter (where status = 'play'))
    from public.tower_games where created_at >= p_from and created_at < p_to);
end $$;

revoke all on function public._tower_rtp(), public._tower_top(int), public._tower_m(int, int, numeric, numeric), public._tower_pub(public.tower_games), public._tower_pay(jsonb, public.tower_games) from public, anon, authenticated;
revoke all on function public.tower_state(), public.tower_start(text[], numeric, int), public.tower_step(bigint, int), public.tower_cash(bigint), public.tower_admin_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.tower_state(), public.tower_start(text[], numeric, int), public.tower_step(bigint, int), public.tower_cash(bigint), public.tower_admin_stats(timestamptz, timestamptz) to authenticated;

select 'Башня — готово' as result;

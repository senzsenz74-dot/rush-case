-- =====================================================================
-- RUSH CASE — еженедельный набор: каждую среду в 03:00 МСК у игрока 4 случайных скина (20–200 ₽), забрать можно один.
-- Условие: за текущую неделю открыто 20 и больше кейсов ценой от 50 ₽ (кейсы за R-COIN не считаются).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
--
-- Открытия считаем по profiles.data → stats.opened: его меняет только сервер (журнал site_events не подходит —
-- записи в него может добавлять сам браузер). Поэтому счёт идёт с момента запуска этого файла.
-- =====================================================================

create table if not exists public.weekly_drops (
  uid uuid not null references public.profiles (id) on delete cascade,
  wk timestamptz not null,          -- начало недели (среда 03:00 МСК)
  opened int not null default 0,    -- сколько кейсов открыто за эту неделю
  offers jsonb,                     -- 4 предмета на выбор: [{n, p}]
  got text,                         -- что забрал игрок
  got_at timestamptz,
  primary key (uid, wk)
);
-- читать и менять таблицу напрямую нельзя никому: только через функции ниже
alter table public.weekly_drops enable row level security;
revoke all on public.weekly_drops from anon, authenticated;

-- начало текущей недели: последняя среда 03:00 по Москве
create or replace function public._wk_start(p timestamptz default now()) returns timestamptz language sql stable as $$
  with l as (select (p at time zone 'Europe/Moscow') - interval '3 hours' as t)
  select (date_trunc('day', t) - make_interval(days => (extract(isodow from t)::int + 4) % 7) + interval '3 hours') at time zone 'Europe/Moscow' from l
$$;

-- счётчик открытий недели: прибавляем, когда сервер увеличил stats.opened
create or replace function public._wk_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n numeric := coalesce((new.data->'stats'->>'opened')::numeric, 0) - coalesce((old.data->'stats'->>'opened')::numeric, 0);
  s numeric := coalesce((new.data->'stats'->>'spent')::numeric, 0) - coalesce((old.data->'stats'->>'spent')::numeric, 0);
begin
  -- одно сохранение профиля = одно открытие (x1…x7) одного кейса, поэтому s / n — цена кейса; у кейсов за R-COIN s = 0
  if n > 0 and s / n >= 50 then
    insert into public.weekly_drops (uid, wk, opened) values (new.id, public._wk_start(), n::int)
    on conflict (uid, wk) do update set opened = public.weekly_drops.opened + excluded.opened;
  end if;
  return null;
end $$;
drop trigger if exists profiles_wk_count on public.profiles;
create trigger profiles_wk_count after update of data on public.profiles for each row execute function public._wk_count();

-- состояние набора; 4 предмета выбираются один раз за неделю и больше не меняются
create or replace function public.weekly_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w timestamptz := public._wk_start(); r public.weekly_drops; o jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.weekly_drops (uid, wk) values (me, w) on conflict (uid, wk) do nothing;
  select * into r from public.weekly_drops where uid = me and wk = w for update;
  if r.offers is null or jsonb_array_length(r.offers) < 4 then
    select jsonb_agg(jsonb_build_object('n', n, 'p', p)) into o from (select n, p from public.catalog where c = 'skin' and p >= 20 and p <= 200 order by random() limit 4) t;
    if o is null or jsonb_array_length(o) < 4 then raise exception 'weekly empty'; end if;
    update public.weekly_drops set offers = o where uid = me and wk = w returning * into r;
  end if;
  return jsonb_build_object('offers', r.offers, 'got', r.got, 'opened', r.opened, 'need', 20,
    'next', (extract(epoch from w + interval '7 days') * 1000)::bigint, 'now', public._ms());
end $$;

-- забрать один предмет: сервер сам проверяет условие, неделю и что предмет был среди предложенных
create or replace function public.weekly_claim(p_n text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w timestamptz := public._wk_start(); r public.weekly_drops; d jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  d := public._me(); -- сначала профиль, потом строка недели: тот же порядок, что при открытии кейса
  select * into r from public.weekly_drops where uid = me and wk = w for update;
  if not found or r.offers is null then raise exception 'weekly item'; end if;
  if r.got is not null then raise exception 'weekly taken'; end if;
  if r.opened < 20 then raise exception 'weekly locked'; end if;
  if not exists (select 1 from jsonb_array_elements(r.offers) e where e->>'n' = p_n) or public._price(p_n) is null then raise exception 'weekly item'; end if;
  d := public._give(d, p_n, 'weekly');
  perform public._save(d);
  update public.weekly_drops set got = p_n, got_at = now() where uid = me and wk = w;
  return jsonb_build_object('n', p_n, 'id', d->'inv'->0->>'id', 'data', d);
end $$;

revoke execute on function public._wk_count() from anon, authenticated, public;
revoke execute on function public.weekly_status() from anon, public;
revoke execute on function public.weekly_claim(text) from anon, public;
grant execute on function public.weekly_status() to authenticated;
grant execute on function public.weekly_claim(text) to authenticated;

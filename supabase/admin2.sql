-- =====================================================================
-- RUSH CASE — статистика апгрейда и кейсы из админ-панели.
-- Запуск: Supabase → SQL Editor → New query → вставить весь файл → Run (после stats.sql).
-- =====================================================================

-- ---------- апгрейд в журнале событий ----------
alter table public.site_events add column if not exists x numeric not null default 0;   -- множитель апгрейда
alter table public.site_events drop constraint if exists site_events_kind_check;
alter table public.site_events add constraint site_events_kind_check check (kind in ('hb', 'dep', 'out', 'open', 'upg'));

-- статистика апгрейда за период: итоги + ряд по часам/дням
create or replace function public.admin_upg(p_from timestamptz, p_to timestamptz, p_bucket text default 'day') returns jsonb
language plpgsql security definer set search_path = public as $$
declare b text := case when p_bucket = 'hour' then 'hour' else 'day' end; r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  with ev as (select * from public.site_events where kind = 'upg' and ts >= p_from and ts < p_to),
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
revoke all on function public.admin_upg(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_upg(timestamptz, timestamptz, text) to authenticated;

-- ---------- кейсы, созданные в админ-панели ----------
create table if not exists public.custom_cases (
  id text primary key check (id ~ '^[a-z0-9_-]{2,32}$'),
  name text not null,
  price numeric not null check (price > 0),
  img text not null,
  accent text not null default '#f5c76b',
  block text not null default 'pop',          -- раздел на странице кейсов (pop, pro, allin, farm)
  is_new boolean not null default true,
  sub text,
  items jsonb not null,                        -- [{ "n": "название скина", "ch": шанс 0..1 }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.custom_cases enable row level security;
drop policy if exists "custom_cases: read all" on public.custom_cases;
drop policy if exists "custom_cases: admin write" on public.custom_cases;
create policy "custom_cases: read all" on public.custom_cases for select to anon, authenticated using (true);
create policy "custom_cases: admin write" on public.custom_cases for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.custom_cases to anon, authenticated;
grant insert, update, delete on public.custom_cases to authenticated;

-- ---------- хранилище картинок кейсов (публичное, загружать может только админ) ----------
insert into storage.buckets (id, name, public) values ('case-img', 'case-img', true) on conflict (id) do update set public = true;
drop policy if exists "case-img: read" on storage.objects;
drop policy if exists "case-img: admin upload" on storage.objects;
drop policy if exists "case-img: admin change" on storage.objects;
drop policy if exists "case-img: admin delete" on storage.objects;
create policy "case-img: read" on storage.objects for select to anon, authenticated using (bucket_id = 'case-img');
create policy "case-img: admin upload" on storage.objects for insert to authenticated with check (bucket_id = 'case-img' and public.is_admin());
create policy "case-img: admin change" on storage.objects for update to authenticated using (bucket_id = 'case-img' and public.is_admin());
create policy "case-img: admin delete" on storage.objects for delete to authenticated using (bucket_id = 'case-img' and public.is_admin());

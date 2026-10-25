-- =====================================================================
-- RUSH CASE — общая лента LIVE: дропы реальных игроков видят все.
-- Запуск: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- =====================================================================
create table if not exists public.live_drops (
  id bigserial primary key,
  ts timestamptz not null default now(),
  uid uuid not null,
  name text not null,
  n text not null,                                   -- название предмета
  t text not null default 'case' check (t in ('case', 'upg', 'con')),
  c text,                                            -- id кейса
  x numeric not null default 0
);
create index if not exists live_drops_ts on public.live_drops (ts desc);
alter table public.live_drops enable row level security;
drop policy if exists "live: read all" on public.live_drops;
drop policy if exists "live: insert own" on public.live_drops;
create policy "live: read all" on public.live_drops for select to anon, authenticated using (true);
-- писать можно только от своего имени (ник — как в профиле) и только «сейчас»
create policy "live: insert own" on public.live_drops for insert to authenticated
  with check (uid = auth.uid() and name = (select p.name from public.profiles p where p.id = auth.uid())
              and ts > now() - interval '1 minute' and length(n) between 2 and 120 and x between 0 and 100000);
grant select on public.live_drops to anon, authenticated;
grant insert on public.live_drops to authenticated;
grant usage, select on sequence public.live_drops_id_seq to authenticated;
do $$ begin
  begin alter publication supabase_realtime add table public.live_drops; exception when duplicate_object then null; end;
end $$;

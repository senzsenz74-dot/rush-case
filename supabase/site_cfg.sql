-- Правки витрины из админ-панели: разделы и любые поля кейсов (в т.ч. кейсов из кода).
--   k = 'blocks'      → v = [{ id, t, sub, wm, ic, a, rc? }, …] — список и порядок разделов
--   k = 'case:<id>'   → v = { name, sub, price, img, ar, a, block, ord, isNew, hit, items: [{ n, ch }] } — только изменённые поля
-- Читают все, пишет только админ. Цены и наполнение для открытия сервер берёт из cases_srv (их загружает админ-панель).
-- Запустить один раз в Supabase → SQL Editor.
create table if not exists public.site_cfg (
  k text primary key,
  v jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_cfg enable row level security;
drop policy if exists "site_cfg: read all" on public.site_cfg;
drop policy if exists "site_cfg: admin write" on public.site_cfg;
create policy "site_cfg: read all" on public.site_cfg for select to anon, authenticated using (true);
create policy "site_cfg: admin write" on public.site_cfg for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.site_cfg to anon, authenticated;
grant insert, update, delete on public.site_cfg to authenticated;

select 'site_cfg готова' as result;

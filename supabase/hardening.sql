-- =====================================================================
-- RUSH CASE — укрепление прав (25.11.2026). Можно запускать сколько угодно раз.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run (жмёт владелец).
-- Смысл: из браузера игрок только читает и вызывает серверные функции; писать в таблицы напрямую нельзя.
-- =====================================================================

-- 1) профиль (баланс, предметы, is_admin) — только серверные функции
revoke insert, update, delete on public.profiles from anon, authenticated;
drop policy if exists "profiles: update own" on public.profiles;

-- 2) лента LIVE и топ — дропы пишет только сервер (_live внутри функций открытия/апгрейда/контрактов)
drop policy if exists "live: insert own" on public.live_drops;
revoke insert, update, delete on public.live_drops from anon, authenticated;

-- 3) пульс онлайна из браузера — только «я на сайте» (hb) без сумм; пополнения/выводы/открытия пишет сервер (_ev)
alter table public.site_events add column if not exists x numeric not null default 0;
alter table public.site_events add column if not exists c text;
drop policy if exists "events: insert own" on public.site_events;
create policy "events: insert own" on public.site_events for insert to anon, authenticated
  with check (kind = 'hb' and amount = 0 and won = 0 and coalesce(x, 0) = 0 and c is null
              and (uid is null or uid = auth.uid()) and ts > now() - interval '1 minute' and ts < now() + interval '1 minute'
              and length(sid) between 6 and 64);
revoke update, delete on public.site_events from anon, authenticated;

-- 4) «Джекпот» убран с сайта — новые ставки и ходы закрыты. jp_claim остаётся: забрать старые выигрыши
-- (по имени, любые версии параметров — на боевой базе они могут отличаться от файлов)
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('jp_tick', 'jp_bet') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- 5) хранилище картинок: только картинки (и видео для кейсов), с пределом размера. Старые файлы не трогаются
update storage.buckets set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'], file_size_limit = 2097152 where id = 'team-logo';   -- 2 МБ
update storage.buckets set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'], file_size_limit = 8388608 where id = 'tour-img';    -- 8 МБ
update storage.buckets set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'], file_size_limit = 52428800 where id = 'case-img';   -- 50 МБ

-- проверка: в строках «должно быть false» — false; ниже — кто есть в команде (staff)
select 'игрок меняет профиль (должно быть false)' as k, has_table_privilege('authenticated', 'public.profiles', 'UPDATE')::text as v
union all select 'игрок пишет в ленту LIVE (должно быть false)', has_table_privilege('authenticated', 'public.live_drops', 'INSERT')::text
union all select 'джекпот открыт игрокам или гостям (должно быть false)', (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('jp_tick', 'jp_bet')
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))))::text
union all select 'выигрышей джекпота за всё время', count(*)::text || ' шт.' from public.jp_payouts
union all select 'команда: ' || s.role, coalesce('#' || p.pid::text, '?') || ' ' || coalesce(p.name, '') from public.staff s left join public.profiles p on p.id = s.uid;

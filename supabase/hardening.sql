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
drop policy if exists "events: insert own" on public.site_events;
create policy "events: insert own" on public.site_events for insert to anon, authenticated
  with check (kind = 'hb' and amount = 0 and won = 0 and coalesce(x, 0) = 0 and c is null
              and (uid is null or uid = auth.uid()) and ts > now() - interval '1 minute' and ts < now() + interval '1 minute'
              and length(sid) between 6 and 64);
revoke update, delete on public.site_events from anon, authenticated;

-- проверка: все три значения должны быть false
select has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as players_update_profiles,
       has_table_privilege('authenticated', 'public.live_drops', 'INSERT') as players_insert_live,
       exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles: update own') as old_policy_left;

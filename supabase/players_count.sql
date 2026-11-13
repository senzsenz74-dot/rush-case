-- Сколько игроков зарегистрировано всего — для счётчика у иконки над лентой LIVE (liveOnlineInit в js/app.js).
-- Отдаёт только число, без данных игроков. Запуск: Supabase → SQL Editor → вставить → Run (13.11.2026).
create or replace function public.players_count() returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from public.profiles
$$;
revoke all on function public.players_count() from public;
grant execute on function public.players_count() to anon, authenticated;

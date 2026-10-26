-- RUSH CASE — вход через Steam: SteamID в профиле. Запуск: SQL Editor → вставить → Run.
alter table public.profiles add column if not exists steamid text;
create unique index if not exists profiles_steamid on public.profiles (steamid) where steamid is not null;

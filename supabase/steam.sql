-- RUSH CASE — вход через Steam: SteamID в профиле. Запуск: SQL Editor → вставить → Run.
alter table public.profiles add column if not exists steamid text;
create unique index if not exists profiles_steamid on public.profiles (steamid) where steamid is not null;
-- функции steam-auth (серверная роль) нужно право записать SteamID и аватар
grant select, update on public.profiles to service_role;
-- кто уже вошёл через Steam до этой правки — берём SteamID и аватар из данных входа
update public.profiles p set steamid = u.raw_user_meta_data->>'steamid', ava = coalesce(p.ava, u.raw_user_meta_data->>'avatar')
  from auth.users u where u.id = p.id and u.email like 'steam%@steam.rushcase.app' and p.steamid is null;

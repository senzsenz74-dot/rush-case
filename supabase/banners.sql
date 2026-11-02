-- =====================================================================
-- RUSH CASE — баннеры главной в «Управлении витриной»: настройка site_cfg 'banners' (порядок, скрытые, «до даты», свои баннеры).
-- Владелец пишет её напрямую (политика site_cfg — владелец); сотрудник с «Управлением витриной» — заявкой (shop_request):
-- разрешаем в заявках ключ 'banners'. Картинки — в хранилище case-img (сотруднику загрузка уже разрешена, shop_requests.sql).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- =====================================================================
do $do$
declare f record; def text;
  old text := '(o->>''k'' = ''blocks'' or o->>''k'' like ''case:%'')';
  neu text := '(o->>''k'' in (''blocks'', ''banners'') or o->>''k'' like ''case:%'')';
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'shop_request' loop
    def := pg_get_functiondef(f.oid);
    if position(neu in def) > 0 then continue; end if;
    if position(old in def) = 0 then raise exception 'shop_request: не нашли проверку ключей — функция изменилась'; end if;
    execute replace(def, old, neu);
  end loop;
end $do$;

select 'баннеры: заявки сотрудника принимают ключ banners — ' || (select count(*) from pg_proc where proname = 'shop_request' and prosrc like '%''banners''%') as result;

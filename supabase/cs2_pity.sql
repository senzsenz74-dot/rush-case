-- =====================================================================
-- RUSH CASE — гарант выпадения в кейсах с открытием как в CS2 (CS2 CASE / «BLAST»).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
--
-- Правила (их же видит игрок в окне «Правила» на странице кейса):
--   * счётчик ведётся у каждого игрока для каждого такого кейса отдельно: profiles.data → pity → { "<id кейса>": N },
--     N — сколько открытий подряд прошло без «Засекреченного» (Тайное, красный) и «Редкого предмета» (нож);
--   * 75-е открытие подряд без них — с вероятностью 50% приносит «Засекреченный» предмет;
--   * 150-е открытие подряд без них — приносит его гарантированно: 50% «Засекреченный», 50% «Редкий»;
--   * выпал «Засекреченный» или «Редкий» (сам или по гаранту) — счётчик обнуляется.
-- Какие предметы «Засекреченные» и «Редкие», сайт передаёт при синхронизации кейсов (admSync): у предмета в cases_srv.items
-- метка "g": "covert" / "rare". Гарант включается только у кейса, где такие метки есть, — остальные кейсы не меняются.
-- Шансы в таблице кейса сайт уже уменьшил с учётом гаранта, чтобы окупаемость осталась 80% (js/app.js, pityEv).
--
-- Как устроено: функция open_case не переписывается целиком — в неё точечно вставляются куски (как в camo_case.sql).
-- Если нужное место не найдено, файл остановится с ошибкой и ничего не изменит.
-- =====================================================================

do $do$
declare f record; def text; nd text; n int := 0;
  -- что ищем → на что меняем
  a_decl text := 'cst jsonb; dis boolean := false; cl numeric := 1;';
  b_decl text := 'cst jsonb; dis boolean := false; cl numeric := 1; pg text; pc int := 0; gp boolean := false; gt numeric; its2 jsonb;';
  a_its text := '''cash'', c.c = ''cash''))';
  b_its text := '''cash'', c.c = ''cash'', ''g'', e->>''g''))';
  a_loop text := 'for i in 1..p_n loop';
  b_loop text := '-- гарант CS2 (supabase/cs2_pity.sql): счётчик открытий подряд без «Засекреченного» и «Редкого»' || E'\n  ' ||
    'gp := exists (select 1 from jsonb_array_elements(its) x where x->>''g'' in (''covert'', ''rare''));' || E'\n  ' ||
    'if gp then pc := coalesce((d->''pity''->>p_case)::int, 0); end if;' || E'\n  ' ||
    'for i in 1..p_n loop';
  a_roll text := 'r := random() * tot; pick := null;';
  b_roll text := 'pick := null; pg := null; its2 := its;' || E'\n    ' ||
    'if gp then' || E'\n      ' ||
      'pc := pc + 1;' || E'\n      ' ||
      'if pc >= 150 then pg := case when random() < 0.5 then ''covert'' else ''rare'' end;' || E'\n      ' ||
      'elsif pc = 75 and random() < 0.5 then pg := ''covert''; end if;' || E'\n      ' ||
      '-- в кейсе нет предметов этой группы — берём другую' || E'\n      ' ||
      'if pg is not null and not exists (select 1 from jsonb_array_elements(its) x where x->>''g'' = pg) then' || E'\n        ' ||
        'pg := case when pg = ''rare'' then ''covert'' else ''rare'' end; end if;' || E'\n      ' ||
      'if pg is not null then' || E'\n        ' ||
        'select jsonb_agg(x), sum((x->>''w'')::numeric) into its2, gt from jsonb_array_elements(its) x where x->>''g'' = pg;' || E'\n      ' ||
      'end if;' || E'\n    ' ||
    'end if;' || E'\n    ' ||
    'r := random() * (case when pg is null then tot else gt end);';
  a_for text := 'for it in select value from jsonb_array_elements(its) loop r := r - (it->>''w'')::numeric;';
  b_for text := 'for it in select value from jsonb_array_elements(its2) loop r := r - (it->>''w'')::numeric;';
  a_last text := 'if pick is null then pick := its->(jsonb_array_length(its) - 1); end if;';
  b_last text := 'if pick is null then pick := its2->(jsonb_array_length(its2) - 1); end if;' || E'\n    ' ||
    'if gp and pick->>''g'' in (''covert'', ''rare'') then pc := 0; end if; -- выпал особый предмет — гарант обнуляется';
  a_save text := 'd := public._stat(d, ''opened'', p_n);';
  b_save text := 'if gp then d := jsonb_set(d, ''{pity}'', coalesce(d->''pity'', ''{}''::jsonb) || jsonb_build_object(p_case, pc)); end if;' || E'\n  ' ||
    'd := public._stat(d, ''opened'', p_n);';
begin
  for f in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'open_case' loop
    def := pg_get_functiondef(f.oid);
    if position('its2' in def) > 0 then continue; end if; -- гарант уже вставлен
    if position(a_decl in def) = 0 then raise exception 'open_case: не нашли объявления переменных — функция изменилась, гарант не вставлен'; end if;
    if position(a_its in def) = 0 then raise exception 'open_case: не нашли список предметов (its) — гарант не вставлен'; end if;
    if position(a_loop in def) = 0 then raise exception 'open_case: не нашли цикл открытий — гарант не вставлен'; end if;
    if position(a_roll in def) = 0 then raise exception 'open_case: не нашли розыгрыш (random) — гарант не вставлен'; end if;
    if position(a_for in def) = 0 then raise exception 'open_case: не нашли перебор предметов — гарант не вставлен'; end if;
    if position(a_last in def) = 0 then raise exception 'open_case: не нашли запасной выбор предмета — гарант не вставлен'; end if;
    if position(a_save in def) = 0 then raise exception 'open_case: не нашли запись статистики — гарант не вставлен'; end if;
    nd := replace(def, a_decl, b_decl);
    nd := replace(nd, a_its, b_its);
    nd := replace(nd, a_loop, b_loop);
    nd := replace(nd, a_roll, b_roll);
    nd := replace(nd, a_for, b_for);
    nd := replace(nd, a_last, b_last);
    nd := replace(nd, a_save, b_save);
    execute nd;
    n := n + 1;
  end loop;
end $do$;

select case when exists (select 1 from pg_proc where proname = 'open_case' and prosrc like '%its2%')
  then 'гарант CS2 включён: open_case обновлена. Теперь откройте #/admin под админом — сайт отправит кейс с метками «Засекречено» и «Редкий»'
  else 'гарант НЕ вставлен — пришлите этот результат в чат' end as result;

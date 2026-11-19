-- =====================================================================
-- «Подарок» в ленте кейса (владелец 20.11.2026, кейс «КАРАМЕЛЬНОЕ ЯБЛОКО»):
--   * в составе кейса есть особый предмет каталога с категорией c = 'gift' («Подарок: +2 открытия»);
--   * выпал подарок — в инвентарь ничего не кладётся, игроку добавляется 2 бесплатных открытия ЭТОГО кейса:
--     profiles.data → free → { "<id кейса>": N };
--   * open_case_free(id) тратит одно бесплатное открытие и открывает кейс без списания денег
--     (в бесплатном открытии подарок тоже может выпасть — цепочка, так решил владелец).
-- Окупаемость: сайт считает подарок предметом ценой 2 × (цена кейса × 0,8) — так ожидаемая выдача вместе
--   с бесплатными открытиями остаётся 80% (js/app.js, кейс apple, GIFT_ITEM).
-- Порядок запуска: СНАЧАЛА этот файл, потом выкладка сайта и #/admin (иначе старая open_case выдала бы
--   подарок как обычный предмет в инвентарь).
-- Как устроено: open_case не переписывается целиком — точечные вставки (как cs2_pity.sql, camo_case.sql).
-- Если нужное место не найдено (или найдено не один раз) — файл остановится с ошибкой и ничего не изменит.
-- Повторный запуск безопасен: уже обновлённая функция пропускается.
-- =====================================================================

do $do$
declare f record; def text; nd text; n int := 0;
  a_decl text := 'cst jsonb; dis boolean := false; cl numeric := 1;';
  b_decl text := 'cst jsonb; dis boolean := false; cl numeric := 1; fr int := 0;';
  a_its text := '''cash'', c.c = ''cash''';
  b_its text := '''cash'', c.c = ''cash'', ''gift'', c.c = ''gift''';
  a_cost text := 'cost := cs.price * p_n;';
  b_cost text := 'cost := cs.price * p_n;' || E'\n  ' ||
    'if coalesce(current_setting(''rushcase.free_open'', true), '''') = p_case then cost := 0; end if; -- бесплатное открытие (open_case_free, supabase/gift_open.sql)';
  a_cash text := 'if (pick->>''cash'')::boolean then';
  b_cash text := 'if coalesce((pick->>''gift'')::boolean, false) then' || E'\n      ' ||
    '-- подарок (supabase/gift_open.sql): +2 бесплатных открытия этого кейса, в инвентарь ничего' || E'\n      ' ||
    'fr := fr + 2; won := won - pp; drops := drops || jsonb_build_object(''n'', pn, ''gift'', 2);' || E'\n    ' ||
    'elsif (pick->>''cash'')::boolean then';
  a_save text := 'd := public._stat(d, ''opened'', p_n);';
  b_save text := 'if fr > 0 then d := jsonb_set(d, ''{free}'', coalesce(d->''free'', ''{}''::jsonb) || jsonb_build_object(p_case, coalesce((d->''free''->>p_case)::int, 0) + fr)); end if;' || E'\n  ' ||
    'd := public._stat(d, ''opened'', p_n);';
  -- сколько раз встречается кусок (должно быть ровно 1)
  cnt int;
begin
  for f in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'open_case' loop
    def := pg_get_functiondef(f.oid);
    if position('rushcase.free_open' in def) > 0 then continue; end if; -- подарок уже вставлен
    cnt := (length(def) - length(replace(def, a_decl, ''))) / length(a_decl);
    if cnt <> 1 then raise exception 'open_case: объявления переменных найдены % раз — подарок не вставлен', cnt; end if;
    cnt := (length(def) - length(replace(def, a_its, ''))) / length(a_its);
    if cnt <> 1 then raise exception 'open_case: список предметов (its) найден % раз — подарок не вставлен', cnt; end if;
    cnt := (length(def) - length(replace(def, a_cost, ''))) / length(a_cost);
    if cnt <> 1 then raise exception 'open_case: расчёт цены найден % раз — подарок не вставлен', cnt; end if;
    cnt := (length(def) - length(replace(def, a_cash, ''))) / length(a_cash);
    if cnt <> 1 then raise exception 'open_case: выдача денег (cash) найдена % раз — подарок не вставлен', cnt; end if;
    cnt := (length(def) - length(replace(def, a_save, ''))) / length(a_save);
    if cnt <> 1 then raise exception 'open_case: запись статистики найдена % раз — подарок не вставлен', cnt; end if;
    nd := replace(def, a_decl, b_decl);
    nd := replace(nd, a_its, b_its);
    nd := replace(nd, a_cost, b_cost);
    nd := replace(nd, a_cash, b_cash);
    nd := replace(nd, a_save, b_save);
    execute nd;
    n := n + 1;
  end loop;
end $do$;

-- открыть кейс бесплатно: одно бесплатное открытие из подарка
create or replace function public.open_case_free(p_case text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; k int; r jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select public._norm(data) into d from public.profiles where id = auth.uid() for update;
  if d is null then raise exception 'not authenticated'; end if;
  k := coalesce((d->'free'->>p_case)::int, 0);
  if k < 1 then raise exception 'no free opens'; end if;
  update public.profiles set data = jsonb_set(d, '{free}', coalesce(d->'free', '{}'::jsonb) || jsonb_build_object(p_case, k - 1)), updated_at = now()
    where id = auth.uid();
  perform set_config('rushcase.free_open', p_case, true);  -- до конца этой транзакции; open_case поставит цену 0
  r := public.open_case(p_case, 1);
  perform set_config('rushcase.free_open', '', true);
  return r;
end $$;
revoke all on function public.open_case_free(text) from public, anon;
grant execute on function public.open_case_free(text) to authenticated;

select case
  when exists (select 1 from pg_proc where proname = 'open_case' and prosrc like '%rushcase.free_open%')
   and exists (select 1 from pg_proc where proname = 'open_case_free')
  then 'подарок включён: open_case обновлена, open_case_free создана. Теперь выкладка сайта и #/admin под админом'
  else 'подарок НЕ включён — пришлите этот результат в чат' end as result;

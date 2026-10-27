-- RUSH CASE — апгрейд: максимальный шанс 75% и свои множители игрока (кнопки x1.5…x10 можно заменить, хранятся в профиле — data.umults).
-- Запуск: SQL Editor → вставить → Run.

create or replace function public.upgrade(p_ids text[], p_bal numeric, p_target text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); m jsonb; v numeric; tp numeric := public._price(p_target); x numeric; ch numeric; win boolean;
begin
  p_bal := round(coalesce(p_bal, 0));
  if p_bal < 0 or p_bal > coalesce((d->>'balance')::numeric, 0) then raise exception 'bad balance'; end if;
  if tp is null or (select c from public.catalog where n = p_target) = 'cash' then raise exception 'bad target'; end if;
  m := public._mark(d->'inv', coalesce(p_ids, '{}'), 'upg');
  if (m->>'n')::int <> coalesce(array_length(p_ids, 1), 0) then raise exception 'items unavailable'; end if;
  v := (m->>'sum')::numeric + p_bal;
  if v <= 0 then raise exception 'empty stake'; end if;
  if tp <= v * 1.05 then raise exception 'target too cheap'; end if;
  x := tp / v;
  ch := least(0.75, 0.92 / x * (case when x > 20 then power(20 / x, 3) else 1 end) * public._luck());
  win := random() < ch;
  d := public._bal(jsonb_set(d, '{inv}', m->'inv'), -p_bal);
  d := public._stat(d, 'upg', 1);
  if win then
    d := public._stat(public._give(d, p_target, 'upgrade'), 'upgWin', 1);
    perform public._live(p_target, 'upg', null, x);
  else
    d := public._rc(d, v * 0.005, 'Утешительный бонус: апгрейд');
  end if;
  perform public._ev('upg', v, case when win then tp else 0 end, x);
  perform public._save(d);
  return jsonb_build_object('win', win, 'chance', ch, 'id', case when win then d->'inv'->0->>'id' end, 'data', d);
end $$;

-- свои множители: 6 значений от 1.2 до 20 (шаг 0.1); пустой массив — вернуть стандартные
create or replace function public.save_umults(p_m numeric[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); v numeric; res numeric[] := '{}';
begin
  if coalesce(array_length(p_m, 1), 0) = 0 then d := d - 'umults'; perform public._save(d); return jsonb_build_object('data', d); end if;
  if array_length(p_m, 1) <> 6 then raise exception 'bad mults'; end if;
  foreach v in array p_m loop
    if v is null or v < 1.2 or v > 20 then raise exception 'bad mults'; end if;
    res := res || round(v, 1);
  end loop;
  d := jsonb_set(d, '{umults}', to_jsonb(res));
  perform public._save(d);
  return jsonb_build_object('data', d);
end $$;
revoke execute on function public.save_umults(numeric[]) from public, anon;
grant execute on function public.save_umults(numeric[]) to authenticated;

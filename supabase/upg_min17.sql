-- =====================================================================
-- RUSH CASE — апгрейд (владелец 29.11.2026): максимальный шанс 70% (было 75%), минимальный множитель ×1,7
--   (было ×1,05 — скин-цель должен стоить хотя бы в 1,7 раза больше ставки); свои множители игрока — от ×1,7 до ×20 (было от ×1,2).
--   Остальное как в profile_v2.sql: шанс = min(70%, окупаемость (site_cfg 'upg', upg_rtp_admin.sql) / икс × срез после ×20 × удача).
--   Сайт (js/app.js: UPG_MAX, UPG_MIN_X) показывает то же самое.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- =====================================================================

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
  if tp < v * 1.7 then raise exception 'target too cheap'; end if;   -- минимум ×1,7
  x := tp / v;
  ch := least(0.70, public._upg_rtp(x) / x * (case when x > 20 then power(20 / x, 3) else 1 end) * public._luck());   -- максимум 70%
  win := random() < ch;
  d := public._bal(jsonb_set(d, '{inv}', m->'inv'), -p_bal);
  d := public._stat(d, 'upg', 1);
  if win then
    d := public._stat(public._give(d, p_target, 'upgrade'), 'upgWin', 1);
    perform public._live(p_target, 'upg', null, x);
  else
    d := public._rc(d, v * 0.005, 'Утешительный бонус: апгрейд');
  end if;
  perform public._ev('upg', v, case when win then tp else 0 end, x, p_target);
  perform public._save(d);
  return jsonb_build_object('win', win, 'chance', ch, 'id', case when win then d->'inv'->0->>'id' end, 'data', d);
end $$;

-- свои множители: 6 значений от 1.7 до 20 (шаг 0.1); пустой массив — вернуть стандартные
create or replace function public.save_umults(p_m numeric[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); v numeric; res numeric[] := '{}';
begin
  if coalesce(array_length(p_m, 1), 0) = 0 then d := d - 'umults'; perform public._save(d); return jsonb_build_object('data', d); end if;
  if array_length(p_m, 1) <> 6 then raise exception 'bad mults'; end if;
  foreach v in array p_m loop
    if v is null or v < 1.7 or v > 20 then raise exception 'bad mults'; end if;
    res := res || round(v, 1);
  end loop;
  d := jsonb_set(d, '{umults}', to_jsonb(res));
  perform public._save(d);
  return jsonb_build_object('data', d);
end $$;
revoke execute on function public.save_umults(numeric[]) from public, anon;
grant execute on function public.save_umults(numeric[]) to authenticated;

select 'апгрейд: максимум 70%, минимум ×1,7; шанс на ×1,7 — ' || round(least(0.70, public._upg_rtp(1.7) / 1.7) * 100, 1) || '%' as result;

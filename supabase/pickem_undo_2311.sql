-- =====================================================================
-- RUSH CASE — пикем: ОТМЕНА ИТОГА матча HEROIC — Imperial (этап I, 0-0), владелец 23.11.2026.
-- Итог внесли заранее (матч 24.11 в 07:00 МСК). Что делает:
--   1) забирает скины, выданные за этот итог, из инвентаря игроков (если скин ещё лежит — не продан и не выведен);
--   2) снимает отметки «угадано / не угадано» с прогнозов на этот матч;
--   3) матч снова без результата — прогнозы на него открыты до начала.
-- Запуск: Supabase → SQL Editor → вставить → Run. Повторный запуск ничего не сломает (итога уже нет — сообщит и выйдет).
-- =====================================================================
do $$
declare m public.pk_matches; r record; d jsonb; nm text; idx bigint; took int := 0; miss int := 0;
begin
  select * into m from public.pk_matches where stage = 1 and slot = '0-0' and ta = 'heroic' and tb = 'imperial' for update;
  if not found then raise notice 'Матч HEROIC — Imperial не найден'; return; end if;
  if m.win is null then raise notice 'У матча уже нет итога — отменять нечего'; return; end if;

  for r in select * from public.pk_picks where mid = m.id and jsonb_array_length(prize) > 0 loop
    select public._norm(data) into d from public.profiles where id = r.uid for update;
    if d is null then continue; end if;
    for nm in select jsonb_array_elements_text(r.prize) loop
      -- первый такой же скин из пикема, который ещё в инвентаре
      select min(i) into idx from jsonb_array_elements(d->'inv') with ordinality t(e, i)
       where e->>'n' = nm and e->>'from' = 'pickem' and e->>'st' = 'own';
      if idx is null then miss := miss + 1; continue; end if;   -- уже продан / выведен — не трогаем
      d := jsonb_set(d, '{inv}', (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(d->'inv') with ordinality t(e, i) where i <> idx));
      took := took + 1;
    end loop;
    update public.profiles set data = d, updated_at = now() where id = r.uid;
  end loop;

  update public.pk_picks set ok_win = null, ok_score = null, prize = '[]'::jsonb where mid = m.id;
  -- расстановка команд: если после этого матча чья-то команда «закрылась» (3 победы / 3 поражения) — тоже снять отметки (после 1-го матча такого нет)
  update public.pk_stage_picks set ok = null, prize = '[]'::jsonb where stage = m.stage and team in (m.ta, m.tb) and ok is not null;
  update public.pk_matches set win = null, score = null, done_at = null where id = m.id;
  raise notice 'Итог отменён. Забрано скинов: %, уже не было в инвентаре: %', took, miss;
end $$;

select id, ta, tb, win, score, (select count(*) from public.pk_picks p where p.mid = m.id) as picks
from public.pk_matches m where stage = 1 and slot = '0-0' and ta = 'heroic' and tb = 'imperial';

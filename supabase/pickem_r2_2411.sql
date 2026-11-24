-- =====================================================================
-- RUSH CASE — пикем, этап I (24.11.2026): итоги раунда 1 + пары раунда 2.
-- Данные — HLTV (PGL Major Singapore 2026 Stage 1). BC.Game на сайте — команда «gosh» (решение владельца: оставить GOSH).
-- 1) итоги 8 матчей раунда 1 через admin_pk_result (скины игрокам за верные прогнозы — как кнопка «Итог» в админке);
-- 2) 8 матчей раунда 2 (1:0 и 0:1), BO1, время UTC (по Москве +3 ч).
-- Запуск: Supabase → SQL Editor → вставить → Run. Повторный запуск ничего не задвоит (итог только где его нет, матч только если такой пары нет).
-- =====================================================================
do $$
declare ow uuid; r record; m public.pk_matches; res jsonb; n_res int := 0; n_add int := 0;
begin
  -- функции админки проверяют, кто вызывает: в SQL Editor действуем от имени владельца
  select uid into ow from public.staff where role = 'owner' order by uid limit 1;
  if ow is null then raise exception 'нет владельца в staff'; end if;
  perform set_config('request.jwt.claim.sub', ow::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);

  -- 1) итоги раунда 1
  for r in select * from (values
    ('heroic', 'imperial', 'imperial'), ('9z', 'lynn', 'lynn'), ('nip', 'm80', 'nip'), ('100t', 'chinggis', '100t'),
    ('parivision', 'dendele', 'parivision'), ('liquid', 'gosh', 'liquid'), ('faze', 'wildcard', 'wildcard'), ('ef', 'flyquest', 'flyquest')
  ) v(a, b, w) loop
    select * into m from public.pk_matches where stage = 1 and slot = '0-0'
      and ((ta = r.a and tb = r.b) or (ta = r.b and tb = r.a)) limit 1;
    if not found then raise notice 'нет матча % — %', r.a, r.b; continue; end if;
    if m.win is not null then raise notice 'итог уже есть: % — %', r.a, r.b; continue; end if;
    res := public.admin_pk_result(m.id, r.w, null);
    n_res := n_res + 1;
    raise notice 'итог % — %: победил %, %', r.a, r.b, r.w, res;
  end loop;

  -- 2) раунд 2
  for r in select * from (values
    ('1-0', 1, 'nip', 'lynn', timestamptz '2026-11-24 09:00+00'),
    ('1-0', 2, '100t', 'imperial', timestamptz '2026-11-24 10:00+00'),
    ('1-0', 3, 'parivision', 'flyquest', timestamptz '2026-11-24 11:00+00'),
    ('1-0', 4, 'liquid', 'wildcard', timestamptz '2026-11-24 12:00+00'),
    ('0-1', 1, 'heroic', 'chinggis', timestamptz '2026-11-24 09:00+00'),
    ('0-1', 2, '9z', 'm80', timestamptz '2026-11-24 10:00+00'),
    ('0-1', 3, 'ef', 'dendele', timestamptz '2026-11-24 11:00+00'),
    ('0-1', 4, 'faze', 'gosh', timestamptz '2026-11-24 12:00+00')
  ) v(sl, o, a, b, t) loop
    if exists (select 1 from public.pk_matches where stage = 1 and ((ta = r.a and tb = r.b) or (ta = r.b and tb = r.a)) and slot = r.sl) then continue; end if;
    insert into public.pk_matches (stage, slot, ord, ta, tb, bo, starts_at) values (1, r.sl, r.o, r.a, r.b, 1, r.t);
    n_add := n_add + 1;
  end loop;

  raise notice 'Готово: итогов внесено %, матчей раунда 2 добавлено %', n_res, n_add;
end $$;

select slot as "раунд", ta, tb, win as "победил", to_char(starts_at at time zone 'Europe/Moscow', 'DD.MM HH24:MI') as "начало (МСК)"
from public.pk_matches where stage = 1 order by slot = '0-0' desc, slot, ord;

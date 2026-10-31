-- =====================================================================
-- RUSH CASE — раздел «В гостях у бабушки» и кейс «Баба Боря» (89 ₽, 27 скинов, возврат 80%, дороже кейса — 31,8% открытий).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен (кейс обновится, раздел не задвоится).
-- Кейс — как созданный в админке (custom_cases): его можно править в «Управлении витриной».
-- Дороже кейса — заданные шансы «1 из N» (перчатки «Сад» 1 из 200 000 … Glock «Ядерный сад» 1 из 3,4), дешевле — веса ~ цена^-1.
-- =====================================================================

-- раздел: сразу после «Популярных»
update public.site_cfg set v = (
  select jsonb_agg(x order by o) from (
    select e as x, i * 2 as o from jsonb_array_elements(site_cfg.v) with ordinality t(e, i)
    union all
    select '{"id":"babushka","t":"В гостях у бабушки","sub":"Бабушкины соленья, тёплый свитер и редкий дроп","wm":"БАБУЛЯ","ic":"leaf","a":"#e53935"}'::jsonb,
      coalesce((select i * 2 + 1 from jsonb_array_elements(site_cfg.v) with ordinality t(e, i) where e->>'id' = 'pop'), 1)
  ) z)
where k = 'blocks' and not exists (select 1 from jsonb_array_elements(site_cfg.v) e where e->>'id' = 'babushka');

-- кейс
insert into public.custom_cases (id, name, price, img, accent, block, is_new, sub, items, updated_at)
values ('bababorya', 'Баба Боря', 89, 'assets/case-bababorya.webp', '#e53935', 'babushka', true,
  'Бабушкины соленья и редкий дроп: перчатки «Сад», Karambit | Crimson Web и ещё 25 скинов. Каждое третье открытие окупается.',
  '[{"n":"★ Driver Gloves | Garden (Factory New)","ch":0.000005},{"n":"★ Karambit | Crimson Web (Minimal Wear)","ch":0.000006667},{"n":"★ Driver Gloves | Brocade Flowers (Minimal Wear)","ch":0.000016667},{"n":"★ Hand Wraps | Overprint (Field-Tested)","ch":0.00005},{"n":"AK-47 | Red Laminate (Minimal Wear)","ch":0.000066667},{"n":"USP-S | Kill Confirmed (Field-Tested)","ch":0.000083333},{"n":"MP7 | Бирюзовое цветение (Закалённое в боях)","ch":0.0001},{"n":"AWP | Wildfire (После полевых испытаний)","ch":0.000125},{"n":"M4A4 | В живом цвете (После полевых испытаний)","ch":0.000166667},{"n":"MP7 | Bloodsport (Field-Tested)","ch":0.000166667},{"n":"P250 | Red Rock (Battle-Scarred)","ch":0.000333333},{"n":"MAC-10 | Ядерный сад (После полевых испытаний)","ch":0.0004},{"n":"Nova | Bloomstick (Field-Tested)","ch":0.000666667},{"n":"M4A4 | Dark Blossom (Field-Tested)","ch":0.000714286},{"n":"Desert Eagle | Crimson Web (Field-Tested)","ch":0.000714286},{"n":"FAMAS | Pulse (Field-Tested)","ch":0.001428571},{"n":"M4A1-S | Basilisk (Field-Tested)","ch":0.001666667},{"n":"AK-47 | Цвет джунглей (После полевых испытаний)","ch":0.008333333},{"n":"SSG 08 | Red Stone (Field-Tested)","ch":0.009090909},{"n":"Glock-18 | Ядерный сад (После полевых испытаний)","ch":0.294117647},{"n":"CZ75-Auto | Red Astor (Well-Worn)","ch":0.029071974},{"n":"MP9 | Ruby Poison Dart (Field-Tested)","ch":0.032493928},{"n":"Dual Berettas | Flora Carnivora (Well-Worn)","ch":0.101327696},{"n":"MP5-SD | Agent (Well-Worn)","ch":0.076263988},{"n":"MAC-10 | Pipe Down (Field-Tested)","ch":0.078211816},{"n":"Tec-9 | Red Quartz (Field-Tested)","ch":0.137193183},{"n":"Five-SeveN | Flame Test (Battle-Scarred)","ch":0.22718505}]'::jsonb, now())
on conflict (id) do update set name = excluded.name, price = excluded.price, img = excluded.img, accent = excluded.accent, block = excluded.block,
  sub = excluded.sub, items = excluded.items, updated_at = now();

select 'Баба Боря: предметов ' || (select jsonb_array_length(items) from public.custom_cases where id = 'bababorya')
  || ', сумма шансов ' || (select round(sum((e->>'ch')::numeric), 6) from public.custom_cases c, jsonb_array_elements(c.items) e where c.id = 'bababorya')
  || '; раздел в витрине: ' || (select count(*) from public.site_cfg, jsonb_array_elements(v) e where k = 'blocks' and e->>'id' = 'babushka') as result;

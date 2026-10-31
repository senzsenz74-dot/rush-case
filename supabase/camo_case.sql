-- =====================================================================
-- RUSH CASE — кейс «Камуфляж» (farm1, 5 ₽): 60 камуфляжных скинов + 2 джекпота, возврат 80%; фарм-режим для кейсов из админки.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
--   Кейсы из админки в разделе «Фарм» (block = 'farm') открываются по 20 / 30 / 50 / 100 штук,
--   дроп дешевле 100 ₽ сразу продаётся на баланс — как «Лови аптечку».
--   Шансы: веса ~ цена^-2.41 под 80% (tools: подбор в сессии 31.10), джекпоты ★ Karambit | Boreal Forest (FN)
--   и ★ M9 Bayonet | Boreal Forest (FN) — по 1 из 500 000.
-- =====================================================================

-- open_case: кейсы из админки в разделе «Фарм» — до 100 за раз и автопродажа дешёвого дропа
do $do$
declare f record; def text; nd text;
  old text := '7 as maxn, null::numeric as sell_below into cs from public.custom_cases where id = p_case';
  neu text := 'case when block = ''farm'' then 100 else 7 end as maxn, case when block = ''farm'' then 100::numeric end as sell_below into cs from public.custom_cases where id = p_case';
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'open_case' loop
    def := pg_get_functiondef(f.oid);
    if position(neu in def) > 0 then continue; end if; -- уже переведена
    if position(old in def) = 0 then raise exception 'open_case: не нашли место для фарм-режима — функция изменилась'; end if;
    nd := replace(def, old, neu);
    execute nd;
  end loop;
end $do$;

-- наполнение и картинка (кейс без пустых полей вокруг — assets/case-camo.webp на сайте)
update public.custom_cases set
  items = '[{"n":"PP-Bizon | Wood Block Camo (Minimal Wear)","ch":0.31946046},{"n":"P90 | Пустынные полутона (Прямо с завода)","ch":0.11947391},{"n":"M249 | Sage Camo (Factory New)","ch":0.11947391},{"n":"P250 | Boreal Forest (Battle-Scarred)","ch":0.11947391},{"n":"M249 | Gator Mesh (Field-Tested)","ch":0.05996743},{"n":"MP7 | Forest DDPAT (Minimal Wear)","ch":0.05996743},{"n":"Tec-9 | Армейская сетка (Прямо с завода)","ch":0.02253923},{"n":"USP-S | Forest Leaves (Battle-Scarred)","ch":0.02253923},{"n":"XM1014 | CaliCamo (Field-Tested)","ch":0.01125677},{"n":"AK-47 | Safari Mesh (Well-Worn)","ch":0.00845746},{"n":"SCAR-20 | Arctic Camo Panels (Minimal Wear)","ch":0.0065695},{"n":"P90 | Пиксельный камуфляж «Пустыня» (После полевых испытаний)","ch":0.00423095},{"n":"P2000 | Urban Hazard (Battle-Scarred)","ch":0.00423095},{"n":"M4A1-S | Boreal Forest (Field-Tested)","ch":0.00423095},{"n":"Sawed-Off | Snake Camo (Minimal Wear)","ch":0.00423095},{"n":"SG 553 | Safari Print (Factory New)","ch":0.00423095},{"n":"AWP | Африканская сетка (После полевых испытаний)","ch":0.00348371},{"n":"Zeus x27 | Пиксельный камуфляж «Болото» (После полевых испытаний)","ch":0.00348371},{"n":"G3SG1 | Смешанный камуфляж (После полевых испытаний)","ch":0.00348371},{"n":"SG 553 | Армейский блеск (Прямо с завода)","ch":0.00348371},{"n":"G3SG1 | Полярный камуфляж (Поношенное)","ch":0.00348371},{"n":"MP7 | Армейский спецназ (После полевых испытаний)","ch":0.00348371},{"n":"AUG | Contractor (Field-Tested)","ch":0.00348371},{"n":"AWP | Safari Mesh (Field-Tested)","ch":0.00348371},{"n":"Dual Berettas | Contractor (Minimal Wear)","ch":0.00348371},{"n":"Five-SeveN | Forest Night (Field-Tested)","ch":0.00348371},{"n":"G3SG1 | Polar Camo (Well-Worn)","ch":0.00348371},{"n":"G3SG1 | Desert Storm (Minimal Wear)","ch":0.00348371},{"n":"Galil AR | VariCamo (Battle-Scarred)","ch":0.00348371},{"n":"MAC-10 | Storm Camo (Field-Tested)","ch":0.00348371},{"n":"MAG-7 | Metallic DDPAT (Factory New)","ch":0.00348371},{"n":"MP7 | Army Recon (Field-Tested)","ch":0.00348371},{"n":"Nova | Sand Dune (Well-Worn)","ch":0.00348371},{"n":"Nova | Polar Mesh (Well-Worn)","ch":0.00348371},{"n":"Nova | Predator (Field-Tested)","ch":0.00348371},{"n":"P250 | Metallic DDPAT (Factory New)","ch":0.00348371},{"n":"R8 Revolver | Desert Brush (Field-Tested)","ch":0.00348371},{"n":"Sawed-Off | Forest DDPAT (Field-Tested)","ch":0.00348371},{"n":"SCAR-20 | Contractor (Minimal Wear)","ch":0.00348371},{"n":"SCAR-20 | Sand Mesh (Field-Tested)","ch":0.00348371},{"n":"Tec-9 | Urban DDPAT (Battle-Scarred)","ch":0.00348371},{"n":"Tec-9 | VariCamo (Minimal Wear)","ch":0.00348371},{"n":"UMP-45 | Urban DDPAT (Minimal Wear)","ch":0.00348371},{"n":"XM1014 | Blue Spruce (Field-Tested)","ch":0.00348371},{"n":"M4A4 | Urban DDPAT (Field-Tested)","ch":0.00246673},{"n":"USP-S | Desert Tactical (Well-Worn)","ch":0.00246673},{"n":"MP5-SD | Desert Strike (Battle-Scarred)","ch":0.00211306},{"n":"Desert Eagle | Urban Rubble (Field-Tested)","ch":0.0013946},{"n":"SCAR-20 | Jungle Slipstream (Field-Tested)","ch":0.00109543},{"n":"USP-S | Alpine Camo (Battle-Scarred)","ch":0.00079322},{"n":"FAMAS | CaliCamo (Field-Tested)","ch":0.00065394},{"n":"MP9 | Storm (Battle-Scarred)","ch":0.00059737},{"n":"Tec-9 | Sandstorm (Well-Worn)","ch":0.00026179},{"n":"M249 | Predator (Field-Tested)","ch":0.0001651},{"n":"P250 | Forest Night (Battle-Scarred)","ch":0.00005599},{"n":"XM1014 | Urban Perforated (Field-Tested)","ch":0.00001735},{"n":"Dual Berettas | Urban Shock (Field-Tested)","ch":0.00001125},{"n":"Five-SeveN | Contractor (Field-Tested)","ch":0.00000984},{"n":"AUG | Arctic Wolf (Battle-Scarred)","ch":0.00000853},{"n":"Galil AR | Sandstorm (Battle-Scarred)","ch":0.00000714},{"n":"★ Karambit | Boreal Forest (Factory New)","ch":0.000002},{"n":"★ M9 Bayonet | Boreal Forest (Factory New)","ch":0.000002}]'::jsonb,
  img = 'assets/case-camo.webp',
  sub = 'Фарм-кейс: 60 камуфляжных скинов, открывай по 20, 30, 50 или 100 штук. Дешёвый дроп сразу продаётся на баланс. Джекпоты — ★ Karambit и ★ M9 Bayonet | Boreal Forest.',
  updated_at = now()
where id = 'farm1';

select 'Камуфляж: предметов ' || (select jsonb_array_length(items) from public.custom_cases where id = 'farm1')
  || ', сумма шансов ' || (select round(sum((e->>'ch')::numeric), 6) from public.custom_cases c, jsonb_array_elements(c.items) e where c.id = 'farm1') as result;

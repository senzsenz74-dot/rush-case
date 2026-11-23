-- =====================================================================
-- RUSH CASE — окупаемость 9 щедрых кейсов → 85% (владелец 23.11.2026, по финмодели).
-- Было (с гарантом 75/150 и удачей кейса из админки): Сифон и Борода 101,8%, Попрошайка 102,1%, ЖАБ ЖАБЫЧ 104,2%,
--   ГРЯДКА 97,5%, ВНУКА ВНУК 102,2%, Деда Дед 100,9%, MAJOR 95,7%, ВСЕМИРНАЯ ЭЛИТА 97,3%, Premium 95,8%.
-- Меняется только «удача» кейса (case_settings.luck — ×шанс предметов дороже кейса). Состав и цены те же.
-- Сервер (open_case) берёт удачу сразу: выкладка сайта и admSync не нужны. В админке ползунки покажут новые значения.
-- Старые значения сохраняются в site_cfg 'bak:case_luck:20261123' (вернуть — тем же insert … on conflict со старыми числами).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- =====================================================================
insert into public.site_cfg (k, v, updated_at)
  select 'bak:case_luck:20261123', coalesce(jsonb_object_agg(id, luck), '{}'::jsonb), now()
  from public.case_settings where id in ('sifon', 'poproshayka', 'zhaba', '1133444', 'tnir', 'dedaded', 'major', 'elite', 'premium')
  on conflict (k) do nothing;

insert into public.case_settings (id, luck, updated_at) values
  ('sifon',       0.50, now()),  -- было ×1,35 → 85%
  ('poproshayka', 1.14, now()),  -- было ×2,2  → 85%
  ('zhaba',       1.06, now()),  -- было ×2    → 85%
  ('1133444',     1.20, now()),  -- ГРЯДКА, было ×1,85 → 85%
  ('tnir',        1.17, now()),  -- ВНУКА ВНУК, было ×1,95 → 85%
  ('dedaded',     1.19, now()),  -- было ×2    → 85%
  ('major',       1.58, now()),  -- было ×3    → 85%
  ('elite',       1.18, now()),  -- было ×1,65 → 85%
  ('premium',     0.72, now())   -- было ×1    → 85%
on conflict (id) do update set luck = excluded.luck, updated_at = now();

select id, luck from public.case_settings
  where id in ('sifon', 'poproshayka', 'zhaba', '1133444', 'tnir', 'dedaded', 'major', 'elite', 'premium') order by id;

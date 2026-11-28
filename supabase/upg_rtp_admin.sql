-- =====================================================================
-- RUSH CASE — окупаемость апгрейда из админки (владелец 28.11.2026).
--   Число хранится в site_cfg 'upg' → {"rtp": 0.8} (вкладка «Апгрейд» в админке, поле «Окупаемость, %», 30–98%).
--   Шанс = min(75%, окупаемость / икс × срез после ×20 × удача игрока) — как раньше, только 80% больше не зашито.
--   Сайт (js/app.js, UPG.rtp) читает то же число и показывает игроку тот же шанс.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен (число в site_cfg не трогает).
-- =====================================================================

-- окупаемость апгрейда: из site_cfg 'upg', по умолчанию 80%, всегда в пределах 30–98%
create or replace function public._upg_rtp(x numeric) returns numeric language sql stable as $$
  select least(0.98, greatest(0.3, coalesce(
    (select (v->>'rtp')::numeric from public.site_cfg where k = 'upg' and jsonb_typeof(v->'rtp') = 'number'), 0.8)))
$$;

-- начальное значение — 80%, как сейчас (если уже есть — не меняем)
insert into public.site_cfg (k, v, updated_at) values ('upg', '{"rtp": 0.8}'::jsonb, now())
  on conflict (k) do nothing;

select 'апгрейд: окупаемость ' || round(public._upg_rtp(2) * 100) || '%, шанс на ×2 — ' || round(least(0.75, public._upg_rtp(2) / 2) * 100, 1)
  || '%, на ×5 — ' || round(public._upg_rtp(5) / 5 * 100, 1) || '%' as result;

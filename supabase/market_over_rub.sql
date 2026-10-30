-- =====================================================================
-- RUSH CASE — вывод: переплата маркету не только в %, но и в ₽ (берётся большее).
-- Пример: скин 19,33 ₽, +10% = 21,26 ₽, +5 ₽ = 24,33 ₽ → можно купить до 24,33 ₽.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run (после market.sql и roles.sql). Повторный запуск безопасен.
-- =====================================================================
alter table public.market_cfg add column if not exists over_rub numeric not null default 5; -- переплата до, ₽

create or replace function public.admin_market_cfg(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if; -- только владелец (roles.sql)
  update public.market_cfg set
    auto = coalesce((p->>'auto')::boolean, auto),
    auto_max = greatest(0, coalesce((p->>'auto_max')::numeric, auto_max)),
    over_pct = least(100, greatest(0, coalesce((p->>'over_pct')::numeric, over_pct))),
    over_rub = least(1000, greatest(0, coalesce((p->>'over_rub')::numeric, over_rub))),
    day_max = greatest(1, coalesce((p->>'day_max')::int, day_max))
  where id = 1;
  return (select to_jsonb(c) - 'last_tick' from public.market_cfg c where id = 1);
end $$;

select 'переплата в ₽ готова: до ' || (select over_rub from public.market_cfg where id = 1) || ' ₽' as result;

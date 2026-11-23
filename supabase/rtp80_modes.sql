-- =====================================================================
-- RUSH CASE — окупаемость режимов (владелец 23.11.2026, по финмодели):
--   апгрейд — возврат 80% на ВСЕХ множителях (было 80% до ×5 и 92% от ×6); срез шанса выше ×20 остаётся (в upgrade());
--   краш — 80% в обычном режиме «Баланс» (было 90%): P(взрыв выше x) = 0,80 / x, 20% раундов взрываются сразу; режимы −2…2 как были;
--   контракты — 80% (было 90%): средняя цена выданного скина = 80% от суммы вложенных;
--   русская рулетка — комиссия сайта 7% с банка (было 5%), настройка site_cfg 'rr' → fee.
-- Сайт (js/app.js upgRtp, тексты «90%», js/krot.js) выкладывается после этого Run.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- =====================================================================

-- апгрейд: одинаковый возврат на всех множителях
create or replace function public._upg_rtp(x numeric) returns numeric language sql immutable as $$
  select 0.80::numeric
$$;

-- краш: точка взрыва по режиму (как в crash_admin.sql, «Баланс» 0,90 → 0,80)
create or replace function public._crash_point(m int) returns numeric language plpgsql volatile as $$
declare rtp numeric;
begin
  if m >= 2 and random() < .65 then return 100; end if;           -- дающий: чаще всего дотягивает до 40-й секунды
  rtp := case m when -2 then .30 when -1 then .65 when 1 then 1.15 when 2 then 1.5 else .80 end;
  return least(100, greatest(1, floor(rtp / (1 - random()) * 100) / 100));
end $$;
revoke all on function public._crash_point(int) from public, anon, authenticated;

-- контракты: как в server.sql, цель 0,9 → 0,8
create or replace function public.contract(p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); m jsonb; s numeric; lo numeric := 0; hi numeric := 10; k numeric; ev numeric; i int; r numeric; tot numeric; pn text; pp numeric; rr record;
begin
  if coalesce(array_length(p_ids, 1), 0) not between 3 and 5 then raise exception 'need 3-5 items'; end if;
  m := public._mark(d->'inv', p_ids, 'con');
  if (m->>'n')::int <> array_length(p_ids, 1) then raise exception 'items unavailable'; end if;
  s := (m->>'sum')::numeric;
  create temp table if not exists _pool (n text, p double precision) on commit drop; delete from _pool where true;
  insert into _pool select n, p from public.catalog where c <> 'cash' and p >= s * 0.25 and p <= s * 4;
  if (select count(*) from _pool) < 4 then
    delete from _pool where true; insert into _pool select n, p from public.catalog where c <> 'cash' and p > 0 order by abs(ln(p / s)) limit 8;
  end if;
  -- веса ~ p^-k, k подбирается так, чтобы средний выигрыш = 90% суммы контракта
  for i in 1..60 loop
    k := (lo + hi) / 2;
    select sum(p * power(p, -k)) / sum(power(p, -k)) into ev from _pool;
    if ev > s * 0.8 then lo := k; else hi := k; end if;
  end loop;
  k := (lo + hi) / 2;
  select sum(power(p, -k)) into tot from _pool;
  r := random() * tot;
  for rr in select n, p from _pool order by p loop r := r - power(rr.p, -k); pn := rr.n; pp := rr.p; exit when r <= 0; end loop;
  d := public._give(jsonb_set(d, '{inv}', m->'inv'), pn, 'contract');
  d := public._stat(d, 'con', 1);
  perform public._live(pn, 'con', null, pp / s);
  perform public._save(d);
  return jsonb_build_object('n', pn, 'id', d->'inv'->0->>'id', 'sum', s, 'data', d);
end $$;

-- русская рулетка: комиссия сайта с банка 7%
insert into public.site_cfg (k, v, updated_at) values ('rr', '{"fee": 0.07}'::jsonb, now())
  on conflict (k) do update set v = (case when jsonb_typeof(public.site_cfg.v) = 'object' then public.site_cfg.v else '{}'::jsonb end) || '{"fee": 0.07}'::jsonb, updated_at = now();

select 'апгрейд: шанс на ×2 — ' || round(least(0.75, public._upg_rtp(2) / 2) * 100, 1) || '%, на ×10 — ' || round(public._upg_rtp(10) / 10 * 100, 1)
  || '%; рулетка: комиссия ' || ((select v->>'fee' from public.site_cfg where k = 'rr')) as result;

-- ============================================================
-- RUSH CASE — новый профиль (12.11.2026): вкладка «Апгрейды», почта игрока, персональный купон.
--   1) upgrade() — тот же апгрейд, что в upg_tune.sql (шансы и выплаты НЕ менялись),
--      только теперь в журнал (site_events.c) пишется, на какой скин была ставка.
--   2) my_upgrades() — история апгрейдов игрока для вкладки «Апгрейды» (последние 100).
--   3) set_cmail(p_email) — почта для предложений (игроки со Steam): хранится в профиле, data.cmail.
--      Письмо с подтверждением добавим, когда подключим почтовый сервис.
--   Купон в профиле вызывает уже готовую use_promo(p_code) (promo_admin.sql) — её не трогаем.
-- Выполнить в Supabase → SQL Editor → Run. Можно запускать повторно.
-- ============================================================

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
  ch := least(0.75, public._upg_rtp(x) / x * (case when x > 20 then power(20 / x, 3) else 1 end) * public._luck());
  win := random() < ch;
  d := public._bal(jsonb_set(d, '{inv}', m->'inv'), -p_bal);
  d := public._stat(d, 'upg', 1);
  if win then
    d := public._stat(public._give(d, p_target, 'upgrade'), 'upgWin', 1);
    perform public._live(p_target, 'upg', null, x);
  else
    d := public._rc(d, v * 0.005, 'Утешительный бонус: апгрейд');
  end if;
  perform public._ev('upg', v, case when win then tp else 0 end, x, p_target); -- новое: скин-цель в журнал
  perform public._save(d);
  return jsonb_build_object('win', win, 'chance', ch, 'id', case when win then d->'inv'->0->>'id' end, 'data', d);
end $$;

-- быстрый поиск апгрейдов игрока
create index if not exists site_events_upg_uid on public.site_events (uid, ts desc) where kind = 'upg';

-- история апгрейдов игрока: ts, amount (ставка), won (выигрыш, 0 — проигрыш), x (множитель), c (скин-цель; у старых записей пусто)
create or replace function public.my_upgrades() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('ts', e.ts, 'amount', e.amount, 'won', e.won, 'x', e.x, 'c', e.c) order by e.ts desc), '[]'::jsonb)
  from (select ts, amount, won, x, c from public.site_events where kind = 'upg' and uid = auth.uid() order by ts desc limit 100) e
$$;
revoke all on function public.my_upgrades() from public, anon;
grant execute on function public.my_upgrades() to authenticated;

-- почта для предложений: пустая строка — отвязать
create or replace function public.set_cmail(p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); e text := lower(trim(coalesce(p_email, '')));
begin
  if e = '' then d := d - 'cmail';
  else
    if length(e) > 120 or e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'bad email'; end if;
    d := jsonb_set(d, '{cmail}', to_jsonb(e));
  end if;
  perform public._save(d);
  return jsonb_build_object('data', d);
end $$;
revoke all on function public.set_cmail(text) from public, anon;
grant execute on function public.set_cmail(text) to authenticated;

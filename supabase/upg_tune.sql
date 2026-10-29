-- ============================================================
-- RUSH CASE — апгрейд: на множителях x1,5–5 отдаёт 80% (было 92%), плавный переход x1,3–1,5 и x5–6;
-- игроки апгрейда для админки (кто сколько поставил и выиграл, удача).
-- Шанс = min(75%, отдача(x) / x × срез после x20 × удача игрока). На сайте (js/app.js, upgRtp) — та же формула.
-- Выполнить в Supabase → SQL Editor.
-- ============================================================
create or replace function public._upg_rtp(x numeric) returns numeric language sql immutable as $$
  select case when x < 1.3 then 0.92
              when x < 1.5 then 0.92 - (x - 1.3) / 0.2 * 0.12
              when x <= 5 then 0.80
              when x < 6 then 0.80 + (x - 5) * 0.12
              else 0.92 end
$$;

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
  perform public._ev('upg', v, case when win then tp else 0 end, x);
  perform public._save(d);
  return jsonb_build_object('win', win, 'chance', ch, 'id', case when win then d->'inv'->0->>'id' end, 'data', d);
end $$;

-- игроки апгрейда за период (без админов): попыток, побед, поставлено, выдано, удача
create or replace function public.admin_upg_players(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.stake desc) from (
    select p.pid, p.name, p.luck, count(*) as n, count(*) filter (where e.won > 0) as wins,
      sum(e.amount) as stake, sum(e.won) as won, max(e.won) as max_win, round(avg(e.x), 2) as avg_x
    from public.site_events e join public.profiles p on p.id = e.uid
    where e.kind = 'upg' and e.ts >= p_from and e.ts < p_to and not p.is_admin
    group by p.id, p.pid, p.name, p.luck order by sum(e.amount) desc limit 30) t), '[]'::jsonb);
end $$;
revoke all on function public.admin_upg_players(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_upg_players(timestamptz, timestamptz) to authenticated;

select 'апгрейд: x1,5–5 отдаёт 80%' as result;

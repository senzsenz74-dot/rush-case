-- RUSH CASE — исправление контракта (Supabase запрещает DELETE без WHERE). Запустить в SQL Editor → Run.
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
    if ev > s * 0.9 then lo := k; else hi := k; end if;
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


-- =====================================================================
-- RUSH CASE — «СОБЕРИ САМ», покупка и открытие отдельно.
-- 1) build_buy  — игрок покупает кейс со своим набором (4–20 скинов) и даёт ему название (2–24 символа): списание, R-COIN 2%, «потрачено»;
--    кейс ложится в профиль: data->'bc' = [{id, name, items:[{n,p,ch}], price, ts}] (шансы и цена зафиксированы на момент покупки).
-- 2) build_open — открыть купленный кейс по id: выпадение по зафиксированным шансам (+ личная удача), кейс исчезает.
-- Купленный кейс нельзя продать — только открыть. В инвентаре — не больше 50 неоткрытых.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run (после build_case.sql).
-- =====================================================================

-- минимум скинов в наборе теперь 4
create or replace function public.build_calc(p_items text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ns text[]; ps numeric[]; ch numeric[]; fx boolean[]; n int; i int; fl numeric := 0.0001; sw numeric; fm numeric; more boolean; ev numeric := 0; price numeric; res jsonb := '[]'::jsonb;
begin
  select array_agg(c.n order by c.p desc, c.n), array_agg(c.p order by c.p desc, c.n) into ns, ps
    from public.catalog c where c.n = any(p_items) and c.p > 0 and c.c <> 'cash';
  n := coalesce(array_length(ns, 1), 0);
  if n <> (select count(distinct x) from unnest(p_items) x) then raise exception 'items unavailable'; end if;
  if n < 4 or n > 20 then raise exception 'bad build'; end if;
  fx := array_fill(false, array[n]); ch := array_fill(0::numeric, array[n]);
  loop
    sw := 0; fm := 0;
    for i in 1..n loop if fx[i] then fm := fm + fl; else sw := sw + 1 / ps[i]; end if; end loop;
    more := false;
    for i in 1..n loop
      if fx[i] then ch[i] := fl; else ch[i] := (1 - fm) * (1 / ps[i]) / sw; if ch[i] < fl then fx[i] := true; more := true; end if; end if;
    end loop;
    exit when not more;
  end loop;
  for i in 1..n loop ev := ev + ch[i] * ps[i]; res := res || jsonb_build_object('n', ns[i], 'p', ps[i], 'ch', ch[i]); end loop;
  price := greatest(10, round(ev / public._build_rtp(), 2));
  return jsonb_build_object('items', res, 'price', price, 'ev', round(ev, 2), 'rtp', public._build_rtp());
end $$;

drop function if exists public.build_buy(text[], numeric);
create or replace function public.build_buy(p_items text[], p_price numeric, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; b jsonb; price numeric; bc jsonb; cst jsonb; nm text;
begin
  -- название кейса от игрока: 2–24 символа, без < > и служебных символов
  nm := left(btrim(regexp_replace(coalesce(p_name, ''), '[<>[:cntrl:]]', '', 'g')), 24);
  if char_length(nm) < 2 then raise exception 'bad name'; end if;
  if coalesce((select (v->>'off')::boolean from public.site_cfg where k = 'build'), false) then raise exception 'case closed'; end if;
  b := public.build_calc(p_items); price := (b->>'price')::numeric;
  if p_price is null or abs(p_price - price) > greatest(0.05, price * 0.01) then raise exception 'build price changed'; end if;
  d := public._me();
  if jsonb_array_length(coalesce(d->'bc', '[]'::jsonb)) >= 50 then raise exception 'too many cases'; end if;
  if coalesce((d->>'balance')::numeric, 0) < price then raise exception 'not enough balance'; end if;
  d := public._bal(d, -price);
  bc := jsonb_build_object('id', public._uid(), 'name', nm, 'items', b->'items', 'price', price, 'ts', public._ms());
  d := jsonb_set(d, '{bc}', jsonb_build_array(bc) || coalesce(d->'bc', '[]'::jsonb));
  d := public._stat(d, 'spent', price);
  cst := coalesce(d->'stats'->'cs'->'build', '{"n":0,"spent":0,"won":0}'::jsonb);
  d := jsonb_set(d, '{stats}', (d->'stats') || jsonb_build_object('cs', coalesce(d->'stats'->'cs', '{}'::jsonb) || jsonb_build_object('build',
    cst || jsonb_build_object('spent', (cst->>'spent')::numeric + price))));
  d := public._rc(d, price * 0.02, 'Кейс «' || nm || '»');
  perform public._save(d);
  return jsonb_build_object('id', bc->>'id', 'price', price, 'data', d);
end $$;

create or replace function public.build_open(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; bc jsonb; its jsonb; luck numeric := public._luck(); price numeric; tot numeric; r numeric; it jsonb; pick jsonb; pn text; pp numeric; cst jsonb;
begin
  d := public._me();
  select x into bc from jsonb_array_elements(coalesce(d->'bc', '[]'::jsonb)) x where x->>'id' = p_id limit 1;
  if bc is null then raise exception 'case not found'; end if;
  -- убрать кейс из профиля
  d := jsonb_set(d, '{bc}', coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'bc') x where x->>'id' <> p_id), '[]'::jsonb));
  price := (bc->>'price')::numeric;
  -- личная удача (как в open_case): предметы дороже кейса ×luck
  select jsonb_agg(x || jsonb_build_object('w', (x->>'ch')::numeric * (case when (x->>'p')::numeric >= price then luck else 1 end))) into its from jsonb_array_elements(bc->'items') x;
  select sum((x->>'w')::numeric) into tot from jsonb_array_elements(its) x;
  r := random() * tot;
  for it in select value from jsonb_array_elements(its) loop r := r - (it->>'w')::numeric; if r <= 0 then pick := it; exit; end if; end loop;
  if pick is null then pick := its->(jsonb_array_length(its) - 1); end if;
  pn := pick->>'n'; pp := (pick->>'p')::numeric;
  d := public._give(d, pn, 'build');
  perform public._live(pn, 'case', 'build', 0);
  d := public._stat(d, 'opened', 1);
  cst := coalesce(d->'stats'->'cs'->'build', '{"n":0,"spent":0,"won":0}'::jsonb);
  d := jsonb_set(d, '{stats}', (d->'stats') || jsonb_build_object('cs', coalesce(d->'stats'->'cs', '{}'::jsonb) || jsonb_build_object('build',
    cst || jsonb_build_object('n', (cst->>'n')::numeric + 1, 'won', (cst->>'won')::numeric + pp))));
  perform public._ev('open', price, pp, 1, 'build');
  perform public._save(d);
  return jsonb_build_object('drops', jsonb_build_array(jsonb_build_object('n', pn, 'id', d->'inv'->0->>'id')), 'price', price, 'data', d);
end $$;

-- старое «открыть сразу» больше не используется
revoke execute on function public.build_case(text[], int, numeric) from authenticated;
revoke all on function public.build_buy(text[], numeric, text), public.build_open(text) from public, anon;
grant execute on function public.build_buy(text[], numeric, text), public.build_open(text) to authenticated;

select 'Собери сам: покупка в инвентарь — готово' as result;

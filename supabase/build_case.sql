-- =====================================================================
-- RUSH CASE — «СОБЕРИ САМ»: игрок сам выбирает 3–20 скинов, сервер сам считает шансы и цену и решает выпадение.
-- Формула (такая же в js/app.js, buildCalc):
--   цена предмета p — из public.catalog (без «₽ на баланс»), вес ~ 1/p (дешёвые — чаще, дорогие — реже);
--   шанс каждого предмета не меньше 0,01% (иначе поднимается до 0,01%, остальные пропорционально реже);
--   цена кейса = матожидание / окупаемость, не меньше 10 ₽, округление до копеек.
-- Окупаемость: site_cfg 'build' → {"rtp": 0.8, "off": false} (правит админка, вкладка «Собери сам»).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run (после server.sql и site_cfg.sql).
-- =====================================================================

create or replace function public._build_rtp() returns numeric language sql stable as $$
  select least(0.98, greatest(0.3, coalesce((select (v->>'rtp')::numeric from public.site_cfg where k = 'build'), 0.8)))
$$;

-- состав → {items:[{n,p,ch}], price, ev}; ошибка, если состав неправильный
create or replace function public.build_calc(p_items text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ns text[]; ps numeric[]; ch numeric[]; fx boolean[]; n int; i int; fl numeric := 0.0001; sw numeric; fm numeric; more boolean; ev numeric := 0; price numeric; res jsonb := '[]'::jsonb;
begin
  -- без повторов, только предметы каталога с ценой > 0 и не «на баланс»; порядок — от дорогих к дешёвым
  select array_agg(c.n order by c.p desc, c.n), array_agg(c.p order by c.p desc, c.n) into ns, ps
    from public.catalog c where c.n = any(p_items) and c.p > 0 and c.c <> 'cash';
  n := coalesce(array_length(ns, 1), 0);
  if n <> (select count(distinct x) from unnest(p_items) x) then raise exception 'items unavailable'; end if;
  if n < 3 or n > 20 then raise exception 'bad build'; end if;
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

create or replace function public.build_case(p_items text[], p_n int default 1, p_price numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; b jsonb; its jsonb; luck numeric := public._luck(); price numeric; cost numeric; tot numeric; r numeric; it jsonb; pick jsonb;
  pn text; pp numeric; won numeric := 0; drops jsonb := '[]'::jsonb; i int; cst jsonb;
begin
  if coalesce((select (v->>'off')::boolean from public.site_cfg where k = 'build'), false) then raise exception 'case closed'; end if;
  if p_n is null or p_n < 1 or p_n > 7 then raise exception 'bad count'; end if;
  b := public.build_calc(p_items); price := (b->>'price')::numeric;
  -- цена на экране игрока не совпала с серверной (цены обновились) — не списываем, пусть обновит страницу
  if p_price is not null and abs(p_price - price) > greatest(0.05, price * 0.01) then raise exception 'build price changed'; end if;
  -- личная удача (как в open_case): предметы дороже кейса ×luck
  select jsonb_agg(x || jsonb_build_object('w', (x->>'ch')::numeric * (case when (x->>'p')::numeric >= price then luck else 1 end))) into its from jsonb_array_elements(b->'items') x;
  select sum((x->>'w')::numeric) into tot from jsonb_array_elements(its) x;
  d := public._me();
  cost := price * p_n;
  if coalesce((d->>'balance')::numeric, 0) < cost then raise exception 'not enough balance'; end if;
  d := public._bal(d, -cost);
  for i in 1..p_n loop
    r := random() * tot; pick := null;
    for it in select value from jsonb_array_elements(its) loop r := r - (it->>'w')::numeric; if r <= 0 then pick := it; exit; end if; end loop;
    if pick is null then pick := its->(jsonb_array_length(its) - 1); end if;
    pn := pick->>'n'; pp := (pick->>'p')::numeric; won := won + pp;
    d := public._give(d, pn, 'build'); drops := drops || jsonb_build_object('n', pn, 'id', d->'inv'->0->>'id');
    perform public._live(pn, 'case', 'build', 0);
  end loop;
  d := public._stat(d, 'opened', p_n);
  d := public._stat(d, 'spent', cost);
  cst := coalesce(d->'stats'->'cs'->'build', '{"n":0,"spent":0,"won":0}'::jsonb);
  d := jsonb_set(d, '{stats}', (d->'stats') || jsonb_build_object('cs', coalesce(d->'stats'->'cs', '{}'::jsonb) || jsonb_build_object('build',
    jsonb_build_object('n', (cst->>'n')::numeric + p_n, 'spent', (cst->>'spent')::numeric + cost, 'won', (cst->>'won')::numeric + won))));
  d := public._rc(d, cost * 0.02, 'Кейс «Собери сам»' || case when p_n > 1 then ' ×' || p_n else '' end);
  perform public._ev('open', cost, won, p_n, 'build');
  perform public._save(d);
  return jsonb_build_object('drops', drops, 'price', price, 'data', d);
end $$;

revoke all on function public.build_case(text[], int, numeric), public.build_calc(text[]) from public, anon;
grant execute on function public.build_case(text[], int, numeric) to authenticated;
grant execute on function public.build_calc(text[]) to anon, authenticated;
insert into public.site_cfg (k, v) values ('build', '{"rtp": 0.8}'::jsonb) on conflict (k) do nothing;

select 'Собери сам — готово' as result;

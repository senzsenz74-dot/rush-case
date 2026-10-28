-- Фарм-кейсы (Лови аптечку): открытие до maxn штук за раз, ширп дешевле sell_below ₽ продаётся сразу.
-- Запустить в Supabase → SQL Editor (то же самое уже есть в server.sql). Потом открыть админ-панель — кейсы загрузятся с новыми полями.
-- фарм-кейсы: открытие до maxn штук за раз, дроп дешевле sell_below ₽ продаётся сразу (на баланс, в инвентарь не попадает)
alter table public.cases_srv add column if not exists maxn int not null default 7;
alter table public.cases_srv add column if not exists sell_below numeric;

create or replace function public.open_case(p_case text, p_n int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; cs record; its jsonb; luck numeric := public._luck(); cost numeric; drops jsonb := '[]'::jsonb; it jsonb; tot numeric; r numeric;
  pick jsonb; pn text; pp numeric; cashv numeric; won numeric := 0; i int; cst jsonb; dis boolean := false; cl numeric := 1;
begin
  select id, price, rc, rate, items, maxn, sell_below into cs from public.cases_srv where id = p_case;
  if not found then
    select id, price, false as rc, 0.02::numeric as rate, items, 7 as maxn, null::numeric as sell_below into cs from public.custom_cases where id = p_case;
    if not found then raise exception 'case not found'; end if;
  end if;
  if p_n is null or p_n < 1 or p_n > coalesce(cs.maxn, 7) then raise exception 'bad count'; end if;
  select coalesce(disabled, false), coalesce(case_settings.luck, 1) into dis, cl from public.case_settings where id = p_case;
  if coalesce(dis, false) then raise exception 'case closed'; end if;
  luck := luck * coalesce(cl, 1);
  -- шансы с удачей: предметы дороже кейса ×luck
  select jsonb_agg(jsonb_build_object('n', e->>'n', 'w', (e->>'ch')::numeric * (case when coalesce(c.p, 0) >= cs.price then luck else 1 end), 'p', c.p, 'cash', c.c = 'cash'))
    into its from jsonb_array_elements(cs.items) e join public.catalog c on c.n = e->>'n' where (e->>'ch')::numeric > 0;
  if its is null or jsonb_array_length(its) < 2 then raise exception 'case not synced'; end if;
  select sum((x->>'w')::numeric) into tot from jsonb_array_elements(its) x;
  d := public._me();
  cost := cs.price * p_n;
  if cs.rc then
    if coalesce((d->>'rcoin')::numeric, 0) < cost then raise exception 'not enough rcoin'; end if;
    d := public._rc(d, -cost, 'Кейс ' || p_case || case when p_n > 1 then ' ×' || p_n else '' end);
  else
    if coalesce((d->>'balance')::numeric, 0) < cost then raise exception 'not enough balance'; end if;
    d := public._bal(d, -cost);
  end if;
  for i in 1..p_n loop
    r := random() * tot; pick := null;
    for it in select value from jsonb_array_elements(its) loop r := r - (it->>'w')::numeric; if r <= 0 then pick := it; exit; end if; end loop;
    if pick is null then pick := its->(jsonb_array_length(its) - 1); end if;
    pn := pick->>'n'; pp := (pick->>'p')::numeric; won := won + pp;
    if (pick->>'cash')::boolean then
      d := public._bal(d, pp); drops := drops || jsonb_build_object('n', pn, 'cash', pp);
    elsif cs.sell_below is not null and pp < cs.sell_below then
      d := public._bal(d, pp); drops := drops || jsonb_build_object('n', pn, 'sold', pp); -- ширп фарм-кейса — сразу на баланс
    else
      d := public._give(d, pn, p_case); drops := drops || jsonb_build_object('n', pn, 'id', d->'inv'->0->>'id');
      if not cs.rc then perform public._live(pn, 'case', p_case, 0); end if;
    end if;
  end loop;
  d := public._stat(d, 'opened', p_n);
  if not cs.rc then
    d := public._stat(d, 'spent', cost);
    cst := coalesce(d->'stats'->'cs'->p_case, '{"n":0,"spent":0,"won":0}'::jsonb);
    d := jsonb_set(d, '{stats}', (d->'stats') || jsonb_build_object('cs', coalesce(d->'stats'->'cs', '{}'::jsonb) || jsonb_build_object(p_case,
      jsonb_build_object('n', (cst->>'n')::numeric + p_n, 'spent', (cst->>'spent')::numeric + cost, 'won', (cst->>'won')::numeric + won))));
    d := public._rc(d, cost * cs.rate, 'Кейс ' || p_case || case when p_n > 1 then ' ×' || p_n else '' end);
    perform public._ev('open', cost, won);
  end if;
  perform public._save(d);
  return jsonb_build_object('drops', drops, 'data', d);
end $$;

create or replace function public.admin_sync(p_catalog jsonb, p_cases jsonb, p_version text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare nc int := 0; ncs int := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_catalog is not null then
    insert into public.catalog (n, p, c) select e->>0, (e->>1)::numeric, coalesce(e->>2, 'skin') from jsonb_array_elements(p_catalog) e
      on conflict (n) do update set p = excluded.p, c = excluded.c;
    get diagnostics nc = row_count;
  end if;
  if p_cases is not null then
    insert into public.cases_srv (id, price, rc, rate, items, maxn, sell_below, updated_at)
      select e->>'id', (e->>'price')::numeric, coalesce((e->>'rc')::boolean, false), coalesce((e->>'rate')::numeric, 0), e->'items', coalesce((e->>'maxn')::int, 7), (e->>'sell_below')::numeric, now() from jsonb_array_elements(p_cases) e
      on conflict (id) do update set price = excluded.price, rc = excluded.rc, rate = excluded.rate, items = excluded.items, maxn = excluded.maxn, sell_below = excluded.sell_below, updated_at = now();
    get diagnostics ncs = row_count;
  end if;
  if p_version is not null then insert into public.srv_meta values ('version', p_version) on conflict (k) do update set v = excluded.v; end if;
  return jsonb_build_object('catalog', nc, 'cases', ncs);
end $$;

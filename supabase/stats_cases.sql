-- Статистика кейсов за любой период (выгрузка в Excel из админки).
-- Каждое открытие пишет в site_events id кейса (c) и сколько кейсов открыто разом (x). Учёт — с момента запуска этого файла.
-- Запустить в Supabase → SQL Editor (то же уже есть в server.sql).
-- p_c — id кейса (для открытий): статистика кейсов за любой период; p_x у открытия — сколько кейсов открыто разом
alter table public.site_events add column if not exists c text;
create index if not exists site_events_open_c on public.site_events (kind, ts, c);
drop function if exists public._ev(text, numeric, numeric, numeric);
create or replace function public._ev(p_kind text, p_amount numeric, p_won numeric default 0, p_x numeric default 0, p_c text default null) returns void language sql as $$
  insert into public.site_events (uid, sid, kind, amount, won, x, c) values (auth.uid(), 'srv-' || substr(auth.uid()::text, 1, 8), p_kind, greatest(0, round(p_amount, 2)), greatest(0, round(p_won, 2)), round(p_x, 2), p_c)
$$;
revoke all on function public._ev(text, numeric, numeric, numeric, text) from public, anon, authenticated;

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
    perform public._ev('open', cost, won, p_n, p_case);
  end if;
  perform public._save(d);
  return jsonb_build_object('drops', drops, 'data', d);
end $$;

-- ---------- статистика кейсов за период (выгрузка в Excel): открытий, игроков, потрачено, выдано ----------
create or replace function public.admin_cases_period(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('c', c, 'n', n, 'calls', calls, 'players', players, 'spent', spent, 'won', won) order by spent desc) from (
    select c, sum(greatest(x, 1)) n, count(*) calls, count(distinct uid) players, sum(amount) spent, sum(won) won
    from public.site_events where kind = 'open' and c is not null and ts >= p_from and ts < p_to group by c) t), '[]'::jsonb);
end $$;
revoke all on function public.admin_cases_period(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_cases_period(timestamptz, timestamptz) to authenticated;

select 'статистика кейсов включена' as result;

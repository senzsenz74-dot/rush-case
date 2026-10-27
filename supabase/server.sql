-- =====================================================================
-- RUSH CASE — вся игровая логика с деньгами и выпадением — на сервере.
-- Кейсы, апгрейд, контракты, продажа, вывод, пополнение (тест), бонусы, ставки.
-- Баланс, R-COIN и инвентарь меняет ТОЛЬКО сервер; браузер лишь показывает результат.
-- Запуск: Supabase → SQL Editor → New query → вставить весь файл → Run (после всех прежних файлов).
-- После запуска зайдите в админ-панель сайта: она сама загрузит на сервер каталог цен и составы кейсов.
-- =====================================================================

-- ---------- справочники, которые загружает админ-панель ----------
create table if not exists public.catalog (
  n text primary key,            -- название предмета (как на сайте)
  p numeric not null,            -- цена, ₽
  c text not null default 'skin' -- категория (skin, knife, gloves, sticker, …, cash)
);
create table if not exists public.cases_srv (
  id text primary key,
  price numeric not null,
  rc boolean not null default false,      -- открывается за R-COIN
  rate numeric not null default 0,        -- доля цены, возвращаемая в R-COIN
  items jsonb not null,                   -- [{ "n": ..., "ch": 0..1 }]
  updated_at timestamptz not null default now()
);
create table if not exists public.srv_meta (k text primary key, v text);
alter table public.catalog enable row level security;
alter table public.cases_srv enable row level security;
alter table public.srv_meta enable row level security;
drop policy if exists "catalog: read" on public.catalog;
drop policy if exists "cases_srv: read" on public.cases_srv;
drop policy if exists "srv_meta: read" on public.srv_meta;
create policy "catalog: read" on public.catalog for select to anon, authenticated using (true);
create policy "cases_srv: read" on public.cases_srv for select to anon, authenticated using (true);
create policy "srv_meta: read" on public.srv_meta for select to anon, authenticated using (true);
grant select on public.catalog, public.cases_srv, public.srv_meta to anon, authenticated;

create table if not exists public.promo_codes (code text primary key, t text not null check (t in ('bal', 'dep')), v numeric not null);
insert into public.promo_codes values ('WELCOME', 'bal', 50), ('RUSH35', 'dep', 35), ('GLHF', 'bal', 30) on conflict (code) do nothing;
alter table public.promo_codes enable row level security;

-- игрок больше не может менять свой профиль напрямую (только через функции ниже)
revoke update on public.profiles from authenticated;

-- ---------- служебные функции ----------
create or replace function public._price(p_n text) returns numeric language sql stable as $$ select p from public.catalog where n = p_n $$;
create or replace function public._ms() returns bigint language sql stable as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;
create or replace function public._uid() returns text language sql volatile as $$ select substr(md5(random()::text || clock_timestamp()::text), 1, 12) $$;
-- недостающие поля профиля
create or replace function public._norm(d jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('balance', 0, 'rcoin', 0, 'rlog', '[]'::jsonb, 'inv', '[]'::jsonb, 'stats', '{}'::jsonb, 'daily', 0, 'promos', '[]'::jsonb, 'depBonus', 0, 'socials', '[]'::jsonb, 'trade', '')
         || coalesce(d, '{}'::jsonb)
$$;
-- выдать предмет: в начало инвентаря, обновить «лучший дроп»
create or replace function public._give(d jsonb, p_n text, p_from text) returns jsonb language plpgsql as $$
declare it jsonb := jsonb_build_object('id', public._uid(), 'n', p_n, 'from', p_from, 'ts', public._ms(), 'st', 'own'); b text := d->'stats'->>'best';
begin
  d := jsonb_set(d, '{inv}', jsonb_build_array(it) || coalesce(d->'inv', '[]'::jsonb));
  if b is null or coalesce(public._price(b), 0) < coalesce(public._price(p_n), 0) then d := jsonb_set(d, '{stats}', coalesce(d->'stats', '{}'::jsonb) || jsonb_build_object('best', p_n)); end if;
  return d;
end $$;
create or replace function public._stat(d jsonb, k text, add numeric) returns jsonb language sql immutable as $$
  select jsonb_set(d, '{stats}', coalesce(d->'stats', '{}'::jsonb) || jsonb_build_object(k, coalesce((d->'stats'->>k)::numeric, 0) + add))
$$;
create or replace function public._bal(d jsonb, add numeric) returns jsonb language sql immutable as $$
  select jsonb_set(d, '{balance}', to_jsonb(round(greatest(0, coalesce((d->>'balance')::numeric, 0) + add), 2)))
$$;
create or replace function public._rc(d jsonb, v numeric, note text) returns jsonb language plpgsql as $$
begin
  v := round(v, 2); if v = 0 then return d; end if;
  d := jsonb_set(d, '{rcoin}', to_jsonb(round(greatest(0, coalesce((d->>'rcoin')::numeric, 0) + v), 2)));
  return jsonb_set(d, '{rlog}', (select coalesce(jsonb_agg(x order by i), '[]'::jsonb) from jsonb_array_elements(jsonb_build_array(jsonb_build_object('v', v, 'note', note, 'ts', public._ms())) || coalesce(d->'rlog', '[]'::jsonb)) with ordinality t(x, i) where i <= 60));
end $$;
-- пометить свои предметы (st = own) новым состоянием; вернуть {inv, sum, n, names}
create or replace function public._mark(inv jsonb, ids text[], new_st text, extra jsonb default '{}'::jsonb) returns jsonb language plpgsql as $$
declare el jsonb; out jsonb := '[]'::jsonb; s numeric := 0; k int := 0; names jsonb := '[]'::jsonb;
begin
  for el in select value from jsonb_array_elements(coalesce(inv, '[]'::jsonb)) loop
    if el->>'id' = any(ids) and el->>'st' = 'own' and public._price(el->>'n') is not null then
      s := s + public._price(el->>'n'); k := k + 1; names := names || to_jsonb(el->>'n');
      el := el || jsonb_build_object('st', new_st) || extra;
    end if;
    out := out || jsonb_build_array(el);
  end loop;
  return jsonb_build_object('inv', out, 'sum', s, 'n', k, 'names', names);
end $$;
create or replace function public._me() returns jsonb language plpgsql as $$
declare d jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select public._norm(data) into d from public.profiles where id = auth.uid() for update;
  if d is null then raise exception 'no profile'; end if;
  return d;
end $$;
create or replace function public._save(d jsonb) returns void language sql as $$ update public.profiles set data = d, updated_at = now() where id = auth.uid() $$;
create or replace function public._luck() returns numeric language sql stable as $$ select least(5, greatest(0.1, coalesce((select luck from public.profiles where id = auth.uid()), 1))) $$;
create or replace function public._live(p_n text, p_t text, p_c text, p_x numeric) returns void language sql as $$
  insert into public.live_drops (uid, name, n, t, c, x) select auth.uid(), p.name, p_n, p_t, p_c, round(least(p_x, 99999), 2) from public.profiles p where p.id = auth.uid()
$$;
create or replace function public._ev(p_kind text, p_amount numeric, p_won numeric default 0, p_x numeric default 0) returns void language sql as $$
  insert into public.site_events (uid, sid, kind, amount, won, x) values (auth.uid(), 'srv-' || substr(auth.uid()::text, 1, 8), p_kind, greatest(0, round(p_amount, 2)), greatest(0, round(p_won, 2)), round(p_x, 2))
$$;

-- ---------- кейсы ----------
create or replace function public.open_case(p_case text, p_n int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; cs record; its jsonb; luck numeric := public._luck(); cost numeric; drops jsonb := '[]'::jsonb; it jsonb; tot numeric; r numeric;
  pick jsonb; pn text; pp numeric; cashv numeric; won numeric := 0; i int; cst jsonb; dis boolean := false; cl numeric := 1;
begin
  if p_n is null or p_n < 1 or p_n > 7 then raise exception 'bad count'; end if;
  select id, price, rc, rate, items into cs from public.cases_srv where id = p_case;
  if not found then
    select id, price, false as rc, 0.02::numeric as rate, items into cs from public.custom_cases where id = p_case;
    if not found then raise exception 'case not found'; end if;
  end if;
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

-- ---------- продажа ----------
create or replace function public.sell_items(p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); m jsonb;
begin
  m := public._mark(d->'inv', p_ids, 'sold');
  if (m->>'n')::int = 0 then raise exception 'nothing to sell'; end if;
  d := public._bal(jsonb_set(d, '{inv}', m->'inv'), (m->>'sum')::numeric);
  perform public._save(d);
  return jsonb_build_object('sum', m->'sum', 'data', d);
end $$;

-- ---------- апгрейд ----------
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
  ch := least(0.75, 0.92 / x * (case when x > 20 then power(20 / x, 3) else 1 end) * public._luck());
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

-- ---------- контракт ----------
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

-- ---------- вывод в Steam ----------
create or replace function public.withdraw(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); m jsonb;
begin
  if coalesce(d->>'trade', '') = '' then raise exception 'no trade link'; end if;
  m := public._mark(d->'inv', array[p_id], 'out');
  if (m->>'n')::int = 0 then raise exception 'item unavailable'; end if;
  d := jsonb_set(d, '{inv}', m->'inv');
  perform public._ev('out', (m->>'sum')::numeric);
  perform public._save(d);
  return jsonb_build_object('data', d);
end $$;
create or replace function public.save_trade(p_trade text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me();
begin
  if p_trade !~ '^https://steamcommunity\.com/tradeoffer/new/\?partner=\d+&token=[\w-]+$' then raise exception 'bad trade link'; end if;
  d := jsonb_set(d, '{trade}', to_jsonb(p_trade)); perform public._save(d); return jsonb_build_object('data', d);
end $$;

-- ---------- пополнение (ТЕСТОВОЕ: без оплаты; заменить на вебхук платёжки) ----------
-- пополнение без кассы выключено (supabase/deposit_off.sql): баланс начисляет только админ (admin_grant)
create or replace function public.deposit_test(p_amount numeric, p_promo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'payments disabled';
end $$;
revoke execute on function public.deposit_test(numeric, text) from authenticated, anon, public;

-- ---------- бонусы ----------
create or replace function public.claim_daily() returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); r numeric := random() * 100; v numeric;
begin
  if coalesce((d->>'daily')::bigint, 0) + 86400000 > public._ms() then raise exception 'too early'; end if;
  -- те же веса, что на сайте: 5(30) 10(26) 15(18) 25(12) 50(8) 100(4,5) 250(1,5)
  v := case when r < 30 then 5 when r < 56 then 10 when r < 74 then 15 when r < 86 then 25 when r < 94 then 50 when r < 98.5 then 100 else 250 end;
  d := public._bal(jsonb_set(d, '{daily}', to_jsonb(public._ms())), v);
  perform public._save(d);
  return jsonb_build_object('v', v, 'data', d);
end $$;
create or replace function public.use_promo(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); pr record;
begin
  select * into pr from public.promo_codes where code = upper(trim(p_code));
  if not found then raise exception 'promo not found'; end if;
  if d->'promos' ? pr.code then raise exception 'promo used'; end if;
  d := jsonb_set(d, '{promos}', (d->'promos') || to_jsonb(pr.code));
  if pr.t = 'bal' then d := public._bal(d, pr.v); else d := jsonb_set(d, '{depBonus}', to_jsonb(pr.v)); end if;
  perform public._save(d);
  return jsonb_build_object('t', pr.t, 'v', pr.v, 'data', d);
end $$;
create or replace function public.claim_social(p_k text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me();
begin
  if p_k not in ('tg', 'vk', 'yt') then raise exception 'bad social'; end if;
  if d->'socials' ? p_k then raise exception 'already claimed'; end if;
  d := public._bal(jsonb_set(d, '{socials}', (d->'socials') || to_jsonb(p_k)), 10);
  perform public._save(d);
  return jsonb_build_object('data', d);
end $$;

-- ---------- начисления админа — сразу на баланс ----------
create or replace function public.admin_grant(p_uid uuid, p_amount numeric, p_note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare gid bigint;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 10000000 then raise exception 'bad amount'; end if;
  update public.profiles set data = public._bal(public._norm(data), round(p_amount, 2)), updated_at = now() where id = p_uid;
  if not found then raise exception 'no player'; end if;
  insert into public.balance_grants (uid, amount, note, by_uid) values (p_uid, round(p_amount, 2), left(p_note, 200), auth.uid()) returning id into gid;
  return gid;
end $$;

-- ---------- ставки: ставка своими предметами, итоги — сразу в инвентарь ----------
drop function if exists public.jp_bet(text, jsonb, numeric);
create or replace function public.jp_bet(p_room text, p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.jp_rounds; c record; me public.profiles; n int; mine boolean; d jsonb; m jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into me from public.profiles where id = auth.uid();
  if coalesce(array_length(p_ids, 1), 0) not between 1 and 50 then raise exception 'bad bet'; end if;
  r := public.jp_active(p_room);
  if r.status not in ('wait', 'open') or (r.status = 'open' and now() >= r.ends_at) then raise exception 'closed'; end if;
  select count(distinct name), bool_or(uid = auth.uid()) into n, mine from public.jp_bets where round_id = r.id;
  if n >= 20 and not coalesce(mine, false) then raise exception 'full'; end if;
  d := public._me();
  m := public._mark(d->'inv', p_ids, 'bet', jsonb_build_object('round', r.id, 'room', p_room));
  if (m->>'n')::int <> array_length(p_ids, 1) then raise exception 'items unavailable'; end if;
  perform public._save(jsonb_set(d, '{inv}', m->'inv'));
  insert into public.jp_bets (round_id, room, uid, name, ava, items, value) values (r.id, p_room, auth.uid(), me.name, me.ava, m->'names', (m->>'sum')::numeric);
  select * into c from public.jp_cfg(p_room);
  if r.status = 'wait' then update public.jp_rounds set status = 'open', ends_at = now() + make_interval(secs => c.t) where id = r.id; end if;
  return jsonb_build_object('round', r.id, 'value', m->'sum', 'data', jsonb_set(d, '{inv}', m->'inv'));
end $$;
grant execute on function public.jp_bet(text, text[]) to authenticated;

create or replace function public.jp_settle(p_round bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r public.jp_rounds; tot numeric; cnt int; x numeric; acc numeric := 0; p record; w record; u uuid; pot jsonb; dd jsonb; el jsonb; nm text; newinv jsonb;
begin
  select * into r from public.jp_rounds where id = p_round for update;
  if r.status <> 'open' or now() < r.ends_at then return; end if;
  select coalesce(sum(value), 0), count(distinct name) into tot, cnt from public.jp_bets where round_id = r.id;
  if cnt < 2 then update public.jp_rounds set ends_at = now() + interval '5 seconds' where id = r.id; return; end if;
  x := random() * tot;
  for p in select name, (array_agg(uid))[1] as uid, sum(value) as s, min(id) as first from public.jp_bets where round_id = r.id group by name order by min(id) loop
    acc := acc + p.s; w := p; exit when x < acc;
  end loop;
  update public.jp_rounds set status = 'spin', spin_at = now(), winner = w.name, winner_uid = w.uid, w_point = 0.15 + random() * 0.7, total = tot where id = r.id;
  -- поставленные предметы реальных игроков — «ушли в банк»
  for u in select distinct uid from public.jp_bets where round_id = r.id and uid is not null loop
    select public._norm(data) into dd from public.profiles where id = u for update;
    newinv := '[]'::jsonb;
    for el in select value from jsonb_array_elements(dd->'inv') loop
      if el->>'st' = 'bet' and (el->>'round')::bigint = r.id then el := el || '{"st":"jp"}'::jsonb; end if;
      newinv := newinv || jsonb_build_array(el);
    end loop;
    update public.profiles set data = jsonb_set(dd, '{inv}', newinv), updated_at = now() where id = u;
  end loop;
  -- победитель-игрок получает весь банк сразу в инвентарь
  if w.uid is not null then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into pot from public.jp_bets b, jsonb_array_elements(b.items) e where b.round_id = r.id;
    select public._norm(data) into dd from public.profiles where id = w.uid for update;
    for nm in select value #>> '{}' from jsonb_array_elements(pot) loop
      if public._price(nm) is not null then dd := public._give(dd, nm, 'jackpot'); end if;
    end loop;
    update public.profiles set data = dd, updated_at = now() where id = w.uid;
    insert into public.jp_payouts (round_id, uid, items, total) values (r.id, w.uid, pot, tot) on conflict (round_id) do nothing;
  end if;
end $$;

-- ---------- загрузка каталога и составов кейсов (из админ-панели) ----------
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
    insert into public.cases_srv (id, price, rc, rate, items, updated_at)
      select e->>'id', (e->>'price')::numeric, coalesce((e->>'rc')::boolean, false), coalesce((e->>'rate')::numeric, 0), e->'items', now() from jsonb_array_elements(p_cases) e
      on conflict (id) do update set price = excluded.price, rc = excluded.rc, rate = excluded.rate, items = excluded.items, updated_at = now();
    get diagnostics ncs = row_count;
  end if;
  if p_version is not null then insert into public.srv_meta values ('version', p_version) on conflict (k) do update set v = excluded.v; end if;
  return jsonb_build_object('catalog', nc, 'cases', ncs);
end $$;

-- ---------- права ----------
revoke all on function public._me(), public._save(jsonb), public._live(text, text, text, numeric), public._ev(text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.open_case(text, int), public.sell_items(text[]), public.upgrade(text[], numeric, text), public.contract(text[]), public.withdraw(text),
  public.save_trade(text), public.claim_daily(), public.use_promo(text), public.claim_social(text), public.admin_sync(jsonb, jsonb, text) to authenticated;

-- свои множители: 6 значений от 1.2 до 20 (шаг 0.1); пустой массив — вернуть стандартные
create or replace function public.save_umults(p_m numeric[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); v numeric; res numeric[] := '{}';
begin
  if coalesce(array_length(p_m, 1), 0) = 0 then d := d - 'umults'; perform public._save(d); return jsonb_build_object('data', d); end if;
  if array_length(p_m, 1) <> 6 then raise exception 'bad mults'; end if;
  foreach v in array p_m loop
    if v is null or v < 1.2 or v > 20 then raise exception 'bad mults'; end if;
    res := res || round(v, 1);
  end loop;
  d := jsonb_set(d, '{umults}', to_jsonb(res));
  perform public._save(d);
  return jsonb_build_object('data', d);
end $$;
revoke execute on function public.save_umults(numeric[]) from public, anon;
grant execute on function public.save_umults(numeric[]) to authenticated;

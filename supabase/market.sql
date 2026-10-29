-- ============================================================
-- RUSH CASE — вывод скинов через market.csgo (запасной вариант; основной — Lis-Skins, позже)
-- Выполнить один раз в Supabase → SQL Editor ПОСЛЕ supabase/market_names.sql.
--
-- Как работает:
--   1) игрок жмёт «Вывести» → withdraw(): предмет в инвентаре становится «pend» (выводится), создаётся заявка в public.withdrawals
--      статус 'new' — купить автоматически; 'wait' — ждёт админа (автовывод выключен или предмет дороже порога)
--   2) функция market (supabase/functions/market) раз в минуту (pg_cron) и сразу после заявки:
--      покупает 'new' через buy-for (на трейд-ссылку игрока, custom_id = 'rc<id заявки>'), затем проверяет все незавершённые
--      через get-list-buy-info-by-custom-id
--   3) stage 2 — игрок получил предмет: заявка 'done', предмет «Выведен в Steam»
--      stage 1 + settlement > 0 — обмен принят, идёт Trade Protection: 'prot'
--      stage 5 — обмен отменён (продавцом или игроком): заявка 'fail', предмет возвращается в инвентарь игрока
-- Ключ маркета — только в секретах функции (MARKET_API_KEY), в базе его нет.
-- ============================================================

-- ---------- настройки (одна строка; меняет админ во вкладке «Выводы Steam») ----------
create table if not exists public.market_cfg (
  id int primary key default 1 check (id = 1),
  auto boolean not null default false,         -- автовывод включён
  auto_max numeric not null default 3000,      -- автоматически покупать предметы до этой цены, ₽ (дороже — ждут админа)
  over_pct numeric not null default 10,        -- можно заплатить на маркете дороже цены сайта не больше чем на %
  day_max int not null default 10,             -- заявок на вывод в сутки на игрока
  last_tick timestamptz not null default 'epoch',
  balance numeric, balance_at timestamptz      -- баланс маркета (обновляет функция)
);
insert into public.market_cfg (id) values (1) on conflict (id) do nothing;
alter table public.market_cfg enable row level security;
drop policy if exists "market_cfg: admin read" on public.market_cfg;
create policy "market_cfg: admin read" on public.market_cfg for select to authenticated using (public.is_admin());

-- ---------- заявки на вывод ----------
create table if not exists public.withdrawals (
  id bigserial primary key,
  uid uuid not null references public.profiles (id) on delete cascade,
  item text not null,                 -- id предмета в инвентаре игрока
  n text not null,                    -- название на сайте
  h text not null,                    -- market_hash_name
  price numeric not null,             -- цена предмета на сайте, ₽
  max_price numeric,                  -- сколько разрешили заплатить на маркете, ₽
  trade text not null, partner text not null, token text not null,
  status text not null default 'new' check (status in ('wait', 'new', 'buying', 'sent', 'prot', 'done', 'fail')),
  stage int, settlement bigint, paid numeric, market_id text, trade_id text,
  err text,                           -- причина (видна игроку при отмене и админу)
  tries int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), done_at timestamptz
);
create index if not exists withdrawals_uid on public.withdrawals (uid, created_at desc);
create index if not exists withdrawals_open on public.withdrawals (status) where status in ('wait', 'new', 'buying', 'sent', 'prot');
alter table public.withdrawals enable row level security;
drop policy if exists "withdrawals: own read" on public.withdrawals;
create policy "withdrawals: own read" on public.withdrawals for select to authenticated using (uid = auth.uid() or public.is_admin());

-- ---------- помощники ----------
-- market_hash_name по названию на сайте (таблица market_names — только там, где названия различаются)
create or replace function public._mhn(p_n text) returns text language sql stable as $$
  select coalesce((select h from public.market_names where n = p_n), p_n)
$$;
-- поменять предмет в инвентаре любого игрока: только если он в состоянии p_from; p_drop — какие поля убрать
create or replace function public._inv_patch(p_uid uuid, p_item text, p_from text, p_patch jsonb, p_drop text[] default '{}') returns boolean
language plpgsql as $$
declare hit boolean := false;
begin
  update public.profiles p set data = jsonb_set(p.data, '{inv}', (
      select coalesce(jsonb_agg(case when e->>'id' = p_item and e->>'st' = p_from then (e - p_drop) || p_patch else e end order by i), '[]'::jsonb)
      from jsonb_array_elements(coalesce(p.data->'inv', '[]'::jsonb)) with ordinality t(e, i))), updated_at = now()
    where p.id = p_uid and exists (select 1 from jsonb_array_elements(coalesce(p.data->'inv', '[]'::jsonb)) e where e->>'id' = p_item and e->>'st' = p_from)
    returning true into hit;
  return coalesce(hit, false);
end $$;

-- ---------- вывод (игрок) ----------
create or replace function public.withdraw(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); m jsonb; c public.market_cfg; tr text := d->>'trade'; nm text; pr numeric; st text; wid bigint;
begin
  if coalesce(tr, '') = '' then raise exception 'no trade link'; end if;
  if tr !~ '^https://steamcommunity\.com/tradeoffer/new/\?partner=\d+&token=[\w-]+$' then raise exception 'bad trade link'; end if;
  select * into c from public.market_cfg where id = 1;
  if (select count(*) from public.withdrawals where uid = auth.uid() and created_at > now() - interval '1 day') >= c.day_max then raise exception 'withdraw limit'; end if;
  m := public._mark(d->'inv', array[p_id], 'pend', jsonb_build_object('ot', public._ms(), 'ws', 'new'));
  if (m->>'n')::int = 0 then raise exception 'item unavailable'; end if;
  nm := m->'names'->>0; pr := (m->>'sum')::numeric;
  if (select c2.c from public.catalog c2 where c2.n = nm) = 'cash' then raise exception 'item unavailable'; end if;
  st := case when c.auto and pr <= c.auto_max then 'new' else 'wait' end;
  insert into public.withdrawals (uid, item, n, h, price, trade, partner, token, status)
    values (auth.uid(), p_id, nm, public._mhn(nm), pr, tr, substring(tr from 'partner=(\d+)'), substring(tr from 'token=([\w-]+)'), st)
    returning id into wid;
  d := jsonb_set(d, '{inv}', (select jsonb_agg(case when e->>'id' = p_id then (e - 'wf' - 'wft') || jsonb_build_object('ws', st, 'wid', wid) else e end order by i) from jsonb_array_elements(m->'inv') with ordinality t(e, i)));
  perform public._save(d);
  return jsonb_build_object('data', d, 'wid', wid, 'status', st);
end $$;

-- мои заявки (для статусов в профиле)
create or replace function public.my_withdrawals() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'item', item, 'n', n, 'price', price, 'status', status, 'err', err, 'trade_id', trade_id, 'ts', created_at) order by id desc), '[]'::jsonb)
  from (select * from public.withdrawals where uid = auth.uid() order by id desc limit 30) t
$$;
grant execute on function public.my_withdrawals() to authenticated;

-- ---------- для функции market (только service_role) ----------
-- не чаще раза в p_sec секунд (защита ключа маркета: больше 5 запросов в секунду — ключ удаляют)
create or replace function public.market_tick(p_sec int) returns public.market_cfg
language sql security definer set search_path = public as $$
  update public.market_cfg set last_tick = now() where id = 1 and last_tick < now() - make_interval(secs => p_sec) returning *
$$;
-- забрать заявки на покупку (две функции одновременно одну заявку не возьмут)
create or replace function public.market_claim(p_limit int) returns setof public.withdrawals
language sql security definer set search_path = public as $$
  update public.withdrawals w set status = 'buying', tries = w.tries + 1, updated_at = now()
  where w.id in (select id from public.withdrawals where status = 'new' order by id limit p_limit for update skip locked)
  returning w.*
$$;
-- новый статус заявки + что происходит с предметом игрока
create or replace function public.market_set(p_id bigint, p_status text, p_patch jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare w public.withdrawals;
begin
  select * into w from public.withdrawals where id = p_id for update;
  if w.id is null or w.status in ('done', 'fail') then return; end if;
  update public.withdrawals set status = p_status, updated_at = now(),
    stage = coalesce((p_patch->>'stage')::int, stage), settlement = coalesce((p_patch->>'settlement')::bigint, settlement),
    paid = coalesce((p_patch->>'paid')::numeric, paid), market_id = coalesce(p_patch->>'market_id', market_id),
    trade_id = coalesce(p_patch->>'trade_id', trade_id), max_price = coalesce((p_patch->>'max_price')::numeric, max_price),
    err = case when p_patch ? 'err' then p_patch->>'err' else err end,
    done_at = case when p_status in ('done', 'fail') then now() else done_at end
  where id = p_id;
  if p_status = 'done' then
    perform public._inv_patch(w.uid, w.item, 'pend', jsonb_build_object('st', 'out'), array['ws']);
    insert into public.site_events (uid, sid, kind, amount) values (w.uid, 'srv-' || substr(w.uid::text, 1, 8), 'out', round(w.price, 2));
  elsif p_status = 'fail' then
    perform public._inv_patch(w.uid, w.item, 'pend', jsonb_build_object('st', 'own', 'wf', coalesce(p_patch->>'err', 'вывод отменён'), 'wft', public._ms()), array['ws', 'ot', 'wid']);
  else
    perform public._inv_patch(w.uid, w.item, 'pend', jsonb_build_object('ws', p_status));
  end if;
end $$;
create or replace function public.market_balance(p_v numeric) returns void language sql security definer set search_path = public as $$
  update public.market_cfg set balance = p_v, balance_at = now() where id = 1
$$;
revoke all on function public.market_tick(int) from public, anon, authenticated;
revoke all on function public.market_claim(int) from public, anon, authenticated;
revoke all on function public.market_set(bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.market_balance(numeric) from public, anon, authenticated;
revoke all on function public._inv_patch(uuid, text, text, jsonb, text[]) from public, anon, authenticated;

-- ---------- админ ----------
-- p_act: approve — купить (wait → new); back — отменить и вернуть предмет игроку; done — отправлен вручную
create or replace function public.admin_wd(p_id bigint, p_act text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w public.withdrawals;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into w from public.withdrawals where id = p_id;
  if w.id is null then raise exception 'not found'; end if;
  if p_act = 'approve' and w.status = 'wait' then
    update public.withdrawals set status = 'new', err = null, updated_at = now() where id = p_id;
    perform public._inv_patch(w.uid, w.item, 'pend', jsonb_build_object('ws', 'new'));
  elsif p_act = 'back' and w.status in ('wait', 'new') then
    perform public.market_set(p_id, 'fail', jsonb_build_object('err', 'вывод отменён администратором — предмет возвращён'));
  elsif p_act = 'done' and w.status not in ('done', 'fail') then
    perform public.market_set(p_id, 'done', jsonb_build_object('err', 'отправлено вручную'));
  else raise exception 'bad action';
  end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.admin_market_cfg(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.market_cfg set
    auto = coalesce((p->>'auto')::boolean, auto),
    auto_max = greatest(0, coalesce((p->>'auto_max')::numeric, auto_max)),
    over_pct = least(100, greatest(0, coalesce((p->>'over_pct')::numeric, over_pct))),
    day_max = greatest(1, coalesce((p->>'day_max')::int, day_max))
  where id = 1;
  return (select to_jsonb(c) - 'last_tick' from public.market_cfg c where id = 1);
end $$;
revoke all on function public.admin_wd(bigint, text) from public, anon;
revoke all on function public.admin_market_cfg(jsonb) from public, anon;
grant execute on function public.admin_wd(bigint, text) to authenticated;
grant execute on function public.admin_market_cfg(jsonb) to authenticated;

-- ---------- раз в минуту — проверка заявок (pg_cron + pg_net) ----------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'market-tick';
select cron.schedule('market-tick', '* * * * *', $cron$
  select net.http_post(url := 'https://gkeexoyrxnsarosymdyp.supabase.co/functions/v1/market?action=tick', headers := '{"content-type":"application/json"}'::jsonb, body := '{}'::jsonb)
$cron$);

select 'вывод через market.csgo готов' as result;

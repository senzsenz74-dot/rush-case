-- Ночной робот цен (.github/workflows/market-sync.yml → tools/market-bot.js send, 28.11.2026).
-- Каждую ночь отправляет на сервер то, что раньше уходило только из #/admin (admSync): каталог цен и составы встроенных кейсов (cases_srv),
-- а ещё новые составы кейсов из админки (custom_cases) и встроенных кейсов, у которых состав переписан в админке (site_cfg 'case:<id>'.items).
-- Робот входит своим ключом: сам ключ хранится только в секретах GitHub (RC_BOT_KEY), здесь — лишь его отпечаток (sha256).
-- Запуск: Supabase → SQL Editor → вставить → Run. Последняя строка с отпечатком ключа подставляется при вставке (в git — заглушка).

create table if not exists public.bot_keys (name text primary key, hash text not null, created_at timestamptz not null default now());
alter table public.bot_keys enable row level security;
revoke all on public.bot_keys from anon, authenticated;

-- копии составов перед заменой — первая за день (откат: update custom_cases c set items = b.items from market_bak b where b.kind = 'custom' and b.id = c.id and b.day = '<дата>')
create table if not exists public.market_bak (day date not null default current_date, kind text not null, id text not null, items jsonb, saved_at timestamptz not null default now(), primary key (day, kind, id));
alter table public.market_bak enable row level security;
revoke all on public.market_bak from anon, authenticated;

-- журнал прогонов робота
create table if not exists public.market_runs (at timestamptz primary key default now(), catalog int, cases int, custom int, cfg int, version text);
alter table public.market_runs enable row level security;
revoke all on public.market_runs from anon, authenticated;

create or replace function public.market_bot_sync(p_key text, p_catalog jsonb, p_cases jsonb, p_version text, p_custom jsonb, p_cfg jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare nc int := 0; ncs int := 0; ncu int := 0; ncf int := 0;
begin
  if p_key is null or length(p_key) < 32
     or not exists (select 1 from public.bot_keys where name = 'market' and hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')) then
    raise exception 'forbidden';
  end if;
  -- каталог и встроенные кейсы — так же, как admin_sync (supabase/farm.sql)
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
  -- кейсы из админки: новые составы (копия старых — в market_bak)
  if p_custom is not null and jsonb_array_length(p_custom) > 0 then
    insert into public.market_bak (kind, id, items)
      select 'custom', c.id, c.items from public.custom_cases c join jsonb_array_elements(p_custom) e on e->>'id' = c.id
      on conflict do nothing;
    update public.custom_cases c set items = e->'items' from jsonb_array_elements(p_custom) e
      where c.id = e->>'id' and jsonb_typeof(e->'items') = 'array' and jsonb_array_length(e->'items') >= 2;
    get diagnostics ncu = row_count;
  end if;
  -- встроенные кейсы с составом из админки: только поле items в site_cfg 'case:<id>'
  if p_cfg is not null and jsonb_array_length(p_cfg) > 0 then
    insert into public.market_bak (kind, id, items)
      select 'cfg', s.k, s.v->'items' from public.site_cfg s join jsonb_array_elements(p_cfg) e on e->>'k' = s.k
      on conflict do nothing;
    update public.site_cfg s set v = jsonb_set(s.v, '{items}', e->'items'), updated_at = now() from jsonb_array_elements(p_cfg) e
      where s.k = e->>'k' and s.k like 'case:%' and s.v ? 'items' and jsonb_typeof(e->'items') = 'array' and jsonb_array_length(e->'items') >= 2;
    get diagnostics ncf = row_count;
  end if;
  if p_version is not null then
    insert into public.srv_meta values ('version', p_version) on conflict (k) do update set v = excluded.v;
    insert into public.market_runs (catalog, cases, custom, cfg, version) values (nc, ncs, ncu, ncf, p_version) on conflict do nothing;
  end if;
  return jsonb_build_object('catalog', nc, 'cases', ncs, 'custom', ncu, 'cfg', ncf);
end $$;
revoke all on function public.market_bot_sync(text, jsonb, jsonb, text, jsonb, jsonb) from public;
grant execute on function public.market_bot_sync(text, jsonb, jsonb, text, jsonb, jsonb) to anon, authenticated;

-- отпечаток ключа робота (sha256 от RC_BOT_KEY). Новый ключ — заменить отпечаток здесь и секрет в GitHub.
insert into public.bot_keys (name, hash) values ('market', '__HASH__') on conflict (name) do update set hash = excluded.hash, created_at = now();

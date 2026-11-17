-- =====================================================================
-- RUSH CASE — розыгрыши на странице «Бонусы» (владелец 17.11.2026).
--   Каждый час / день / неделю (время Москвы: час — с начала часа, день — с полуночи, неделя — с понедельника 00:00):
--     приз — случайный скин из диапазона цен, который задаёт владелец в админке (вкладка «Розыгрыши», ga_cfg);
--     новый розыгрыш начинается сам, как только закончился прошлый. Начатый идёт по своим условиям до конца.
--   Розыгрыши стримеров: стример (ref_partners, выдаёт админ во вкладке «Рефералы») запускает сам на странице
--     «Пригласить друзей»: свой скин из инвентаря (от 50 ₽, на время розыгрыша заморожен), сумма «от» (от 100 ₽),
--     длительность 10 минут – 7 дней; один розыгрыш за раз; сам стример в нём не участвует. Сайт ничего не платит.
--   Участие: сумма ПОПОЛНЕНИЙ ДЕНЬГАМИ (payments: status 'paid', кроме method 'skins') за время розыгрыша
--     не меньше суммы на карточке. Нажимать ничего не нужно, одно участие на игрока.
--   Победитель — с проверкой честности: при старте сервер публикует hash = sha256(seed); seed секретный.
--     После итогов seed раскрывается. Участники — по возрастанию ID игрока (pid) через запятую;
--     h = sha256(seed || ':' || список), номер победителя = первые 12 hex-символов h (число) mod кол-во участников.
--   Итоги подводит pg_cron раз в минуту (ga-tick) + страница сама подводит просроченный розыгрыш при открытии.
--   Приз — сразу в инвентарь победителя (from 'giveaway'); при заходе на сайт он видит окно «Вы выиграли!».
--   Никто не участвовал — приз никому (у стримера скин возвращается в инвентарь).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- Нужны уже запущенные: server.sql, payments.sql, skins_hold.sql, roles.sql, referral2.sql.
-- =====================================================================

-- ---------- 1. настройки «час / день / неделя» ----------
create table if not exists public.ga_cfg (
  k text primary key check (k in ('hour', 'day', 'week')),
  active boolean not null default true,      -- розыгрыш идёт
  p_min numeric not null,                    -- приз: цена скина от, ₽
  p_max numeric not null,                    -- приз: цена скина до, ₽
  min_dep numeric not null,                  -- участвует, кто пополнил за время розыгрыша от, ₽
  updated_at timestamptz not null default now(),
  updated_by uuid
);
-- владелец 17.11: сразу включить со стартовыми цифрами
insert into public.ga_cfg (k, active, p_min, p_max, min_dep) values
  ('hour', true, 50, 150, 300), ('day', true, 500, 1500, 1000), ('week', true, 3000, 8000, 3000)
  on conflict (k) do nothing;
alter table public.ga_cfg enable row level security; -- политик нет: только через функции ниже
revoke all on public.ga_cfg from anon, authenticated;
grant all on public.ga_cfg to service_role;

-- ---------- 2. розыгрыши и участники ----------
create table if not exists public.giveaways (
  id bigserial primary key,
  k text not null check (k in ('hour', 'day', 'week', 'str')),
  by_uid uuid references public.profiles (id) on delete set null,   -- стример (для 'str')
  item text not null,                        -- приз: название скина (как в catalog)
  price numeric not null,                    -- цена приза на момент старта
  inv_id text,                               -- стример: id предмета в его инвентаре
  min_dep numeric not null,                  -- пополнить за время розыгрыша от, ₽
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  seed text not null,                        -- секрет; раскрывается после итогов
  hash text not null,                        -- sha256(seed), виден с самого начала
  status text not null default 'live' check (status in ('live', 'done', 'empty', 'cancelled')),
  n int,                                     -- участников на момент итогов
  winner uuid references public.profiles (id) on delete set null,
  win_idx int,                               -- номер победителя в списке участников (с 0)
  seen boolean not null default false,       -- победитель увидел окно «Вы выиграли!»
  drawn_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists giveaways_live_k on public.giveaways (k) where status = 'live' and k <> 'str';
create unique index if not exists giveaways_live_str on public.giveaways (by_uid) where status = 'live' and k = 'str';
create index if not exists giveaways_hist on public.giveaways (k, ends_at desc) where status = 'done';
create index if not exists giveaways_by on public.giveaways (by_uid, ends_at desc) where by_uid is not null;
create index if not exists giveaways_win on public.giveaways (winner) where status = 'done' and not seen;
alter table public.giveaways enable row level security;
revoke all on public.giveaways from anon, authenticated;
grant all on public.giveaways to service_role;
grant usage, select on sequence public.giveaways_id_seq to service_role;

-- участники на момент итогов (список для проверки честности; pid — публичный номер игрока)
create table if not exists public.ga_entries (
  gid bigint not null references public.giveaways (id) on delete cascade,
  uid uuid not null,
  pid bigint not null,
  dep numeric not null,
  primary key (gid, uid)
);
alter table public.ga_entries enable row level security;
revoke all on public.ga_entries from anon, authenticated;
grant all on public.ga_entries to service_role;

-- быстрый поиск пополнений по времени зачисления
create index if not exists payments_paid_at on public.payments (paid_at) where status = 'paid';

-- ---------- 3. помощники ----------
create or replace function public._ga_ms(t timestamptz) returns bigint language sql immutable as $$
  select (extract(epoch from t) * 1000)::bigint
$$;
create or replace function public._ga_hash(s text) returns text language sql immutable as $$
  select encode(sha256(convert_to(s, 'UTF8')), 'hex')
$$;
-- секрет: 64 hex-символа из криптостойкого генератора (gen_random_uuid)
create or replace function public._ga_seed() returns text language sql volatile as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;
-- начало текущего часа / дня / недели (по Москве) и длина
create or replace function public._ga_start(p_k text, p_t timestamptz default now()) returns timestamptz language sql stable as $$
  select case p_k
    when 'hour' then date_trunc('hour', p_t)
    when 'day' then date_trunc('day', p_t at time zone 'Europe/Moscow') at time zone 'Europe/Moscow'
    else date_trunc('week', p_t at time zone 'Europe/Moscow') at time zone 'Europe/Moscow' end
$$;
create or replace function public._ga_len(p_k text) returns interval language sql immutable as $$
  select case p_k when 'hour' then interval '1 hour' when 'day' then interval '1 day' else interval '7 days' end
$$;
-- пополнения деньгами за время розыгрыша (по игрокам); стример в своём розыгрыше не участвует
create or replace function public._ga_deps(g public.giveaways) returns table (uid uuid, dep numeric) language sql stable as $$
  select p.uid, sum(p.amount) from public.payments p
  where p.status = 'paid' and p.method <> 'skins' and p.paid_at >= g.starts_at and p.paid_at < g.ends_at
    and p.uid is distinct from g.by_uid
  group by p.uid
$$;
create or replace function public._ga_count(g public.giveaways) returns int language sql stable as $$
  select count(*)::int from public._ga_deps(g) x where x.dep >= g.min_dep
$$;
-- случайный скин в диапазоне цен (только оружие, ножи и перчатки с износом)
create or replace function public._ga_pick(p_min numeric, p_max numeric) returns table (n text, p numeric) language sql volatile as $$
  select c.n, c.p from public.catalog c
  where c.c in ('skin', 'knife', 'gloves') and c.p >= p_min and c.p <= p_max and c.n like '%(%)'
  order by random() limit 1
$$;
-- поменять состояние предмета в инвентаре (стример: own → ga → own/gave)
create or replace function public._ga_inv_st(d jsonb, p_id text, p_from text, p_to text) returns jsonb language sql immutable as $$
  select jsonb_set(d, '{inv}', coalesce((select jsonb_agg(case when e->>'id' = p_id and e->>'st' = p_from then e || jsonb_build_object('st', p_to) else e end order by i)
    from jsonb_array_elements(coalesce(d->'inv', '[]'::jsonb)) with ordinality t(e, i)), '[]'::jsonb))
$$;
create or replace function public._ga_has(d jsonb, p_id text, p_st text) returns boolean language sql immutable as $$
  select exists (select 1 from jsonb_array_elements(coalesce(d->'inv', '[]'::jsonb)) e where e->>'id' = p_id and e->>'st' = p_st)
$$;
-- вернуть стримеру замороженный скин
create or replace function public._ga_return(g public.giveaways) returns void language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if g.k <> 'str' or g.by_uid is null or g.inv_id is null then return; end if;
  select public._norm(data) into d from public.profiles where id = g.by_uid for update;
  if d is null or not public._ga_has(d, g.inv_id, 'ga') then return; end if;
  update public.profiles set data = public._ga_inv_st(d, g.inv_id, 'ga', 'own'), updated_at = now() where id = g.by_uid;
end $$;
-- игрок для карточки: ID, ник, аватарка
create or replace function public._ga_who(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('pid', p.pid, 'name', p.name, 'ava', p.ava) from public.profiles p where p.id = p_uid
$$;

-- ---------- 4. итоги одного розыгрыша ----------
create or replace function public._ga_draw(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare g public.giveaways; v_n int; v_pids text; v_h text; v_idx int; v_win uuid; d jsonb; sd jsonb;
begin
  select * into g from public.giveaways where id = p_id and status = 'live' for update;
  if g.id is null or g.ends_at > now() then return 'skip'; end if;
  delete from public.ga_entries where gid = g.id;
  insert into public.ga_entries (gid, uid, pid, dep)
    select g.id, x.uid, pr.pid, x.dep from public._ga_deps(g) x join public.profiles pr on pr.id = x.uid where x.dep >= g.min_dep;
  select count(*)::int, string_agg(e.pid::text, ',' order by e.pid) into v_n, v_pids from public.ga_entries e where e.gid = g.id;
  if v_n = 0 then
    perform public._ga_return(g);
    update public.giveaways set status = 'empty', n = 0, drawn_at = now() where id = g.id;
    return 'empty';
  end if;
  v_h := public._ga_hash(g.seed || ':' || v_pids);
  v_idx := (('x' || substr(v_h, 1, 12))::bit(48)::bigint % v_n)::int;
  select e.uid into v_win from public.ga_entries e where e.gid = g.id order by e.pid offset v_idx limit 1;
  if g.k = 'str' then -- приз стримера: забираем замороженный скин из его инвентаря
    select public._norm(data) into sd from public.profiles where id = g.by_uid for update;
    if sd is null or not public._ga_has(sd, g.inv_id, 'ga') then
      update public.giveaways set status = 'cancelled', n = v_n, drawn_at = now() where id = g.id;
      return 'no item';
    end if;
    update public.profiles set data = public._ga_inv_st(sd, g.inv_id, 'ga', 'gave'), updated_at = now() where id = g.by_uid;
  end if;
  select public._norm(data) into d from public.profiles where id = v_win for update;
  d := public._give(d, g.item, 'giveaway');
  update public.profiles set data = d, updated_at = now() where id = v_win;
  update public.giveaways set status = 'done', n = v_n, winner = v_win, win_idx = v_idx, drawn_at = now() where id = g.id;
  return 'done';
end $$;

-- ---------- 5. таймер: подвести просроченные, начать новые (pg_cron раз в минуту) ----------
create or replace function public.ga_tick() returns int
language plpgsql security definer set search_path = public as $$
declare r record; c public.ga_cfg; v_n text; v_p numeric; v_s timestamptz; v_seed text; v_k int := 0;
begin
  if not pg_try_advisory_xact_lock(7712017) then return 0; end if; -- уже идёт в другом месте
  for r in select id from public.giveaways where status = 'live' and ends_at <= now() order by ends_at limit 50 loop
    begin
      perform public._ga_draw(r.id); v_k := v_k + 1;
    exception when others then raise warning 'giveaway % draw failed: %', r.id, sqlerrm;
    end;
  end loop;
  for c in select * from public.ga_cfg where active order by k loop
    if not exists (select 1 from public.giveaways g where g.k = c.k and g.status = 'live') then
      v_n := null; select x.n, x.p into v_n, v_p from public._ga_pick(c.p_min, c.p_max) x;
      if v_n is not null then
        v_s := public._ga_start(c.k); v_seed := public._ga_seed();
        insert into public.giveaways (k, item, price, min_dep, starts_at, ends_at, seed, hash)
          values (c.k, v_n, v_p, c.min_dep, v_s, v_s + public._ga_len(c.k), v_seed, public._ga_hash(v_seed));
      end if;
    end if;
  end loop;
  return v_k;
end $$;

-- ---------- 6. для страницы «Бонусы» ----------
-- прошлые победители: того же вида (час/день/неделя) или того же стримера
create or replace function public._ga_past(g public.giveaways, p_lim int default 5) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by t desc), '[]'::jsonb) from (
    select jsonb_build_object('id', h.id, 'item', h.item, 'price', h.price, 'end', public._ga_ms(h.ends_at), 'n', h.n, 'win', public._ga_who(h.winner)) x, h.ends_at t
    from public.giveaways h
    where h.status = 'done' and h.k = g.k and (g.k <> 'str' or h.by_uid = g.by_uid)
    order by h.ends_at desc limit p_lim) q
$$;
create or replace function public.ga_list() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_live jsonb;
begin
  -- просроченный или недостающий розыгрыш — подводим/начинаем сразу, не дожидаясь таймера
  if exists (select 1 from public.giveaways where status = 'live' and ends_at <= now())
     or exists (select 1 from public.ga_cfg c where c.active and not exists (select 1 from public.giveaways g where g.k = c.k and g.status = 'live')) then
    perform public.ga_tick();
  end if;
  select coalesce(jsonb_agg(x order by o, e), '[]'::jsonb) into v_live from (
    select jsonb_build_object('id', g.id, 'k', g.k, 'item', g.item, 'price', g.price, 'min', g.min_dep,
        'start', public._ga_ms(g.starts_at), 'end', public._ga_ms(g.ends_at), 'hash', g.hash,
        'by', case when g.by_uid is null then null else public._ga_who(g.by_uid) end,
        'n', public._ga_count(g),
        'me', case when me is null then null else jsonb_build_object('dep', coalesce((select x.dep from public._ga_deps(g) x where x.uid = me), 0), 'own', g.by_uid is not distinct from me) end,
        'past', public._ga_past(g)) x,
      case g.k when 'hour' then 1 when 'day' then 2 when 'week' then 3 else 4 end o, g.ends_at e
    from public.giveaways g where g.status = 'live') q;
  return jsonb_build_object('now', public._ga_ms(clock_timestamp()), 'live', v_live);
end $$;

-- проверка честности: секрет (после итогов), хэш и список участников по возрастанию ID
create or replace function public.ga_verify(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.giveaways;
begin
  select * into g from public.giveaways where id = p_id;
  if g.id is null then raise exception 'ga not found'; end if;
  return jsonb_build_object('id', g.id, 'k', g.k, 'item', g.item, 'price', g.price, 'status', g.status, 'hash', g.hash,
    'seed', case when g.status = 'live' then null else g.seed end,
    'n', g.n, 'idx', g.win_idx, 'win', public._ga_who(g.winner), 'end', public._ga_ms(g.ends_at),
    'pids', coalesce((select jsonb_agg(e.pid order by e.pid) from public.ga_entries e where e.gid = g.id), '[]'::jsonb));
end $$;

-- окно «Вы выиграли!»: выигрыши, которые игрок ещё не видел
create or replace function public.ga_wins() returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'k', g.k, 'item', g.item, 'price', g.price, 'n', g.n,
      'end', public._ga_ms(g.ends_at), 'by', case when g.by_uid is null then null else public._ga_who(g.by_uid) end) order by g.ends_at), '[]'::jsonb)
  from public.giveaways g where g.winner = auth.uid() and g.status = 'done' and not g.seen
$$;
create or replace function public.ga_seen(p_ids bigint[]) returns void
language sql security definer set search_path = public as $$
  update public.giveaways set seen = true where winner = auth.uid() and id = any(p_ids) and not seen
$$;

-- ---------- 7. стример: свой розыгрыш ----------
create or replace function public.ga_str_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.giveaways; v_live jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.ref_partners where uid = me and active) then return jsonb_build_object('partner', false); end if;
  select * into g from public.giveaways where by_uid = me and k = 'str' and status = 'live';
  if g.id is not null then
    v_live := jsonb_build_object('id', g.id, 'item', g.item, 'price', g.price, 'min', g.min_dep, 'start', public._ga_ms(g.starts_at), 'end', public._ga_ms(g.ends_at), 'n', public._ga_count(g), 'hash', g.hash);
  end if;
  return jsonb_build_object('partner', true, 'now', public._ga_ms(clock_timestamp()), 'live', v_live,
    'lim', jsonb_build_object('price', 50, 'min', 100, 'from', 10, 'to', 10080),
    'past', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'item', h.item, 'price', h.price, 'status', h.status, 'n', h.n, 'end', public._ga_ms(h.ends_at), 'win', public._ga_who(h.winner)) order by h.ends_at desc)
      from (select * from public.giveaways where by_uid = me and k = 'str' and status <> 'live' order by ends_at desc limit 10) h), '[]'::jsonb));
end $$;

create or replace function public.ga_str_create(p_inv text, p_min numeric, p_minutes int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d jsonb; v_n text; v_p numeric; v_seed text; v_id bigint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.ref_partners where uid = me and active) then raise exception 'ga not partner'; end if;
  if p_minutes is null or p_minutes < 10 or p_minutes > 10080 then raise exception 'ga bad time'; end if;
  p_min := round(coalesce(p_min, 0), 2);
  if p_min < 100 or p_min > 1000000 then raise exception 'ga bad min'; end if;
  d := public._me();
  if exists (select 1 from public.giveaways where by_uid = me and k = 'str' and status = 'live') then raise exception 'ga busy'; end if;
  select e->>'n' into v_n from jsonb_array_elements(d->'inv') e where e->>'id' = p_inv and e->>'st' = 'own' limit 1;
  if v_n is null then raise exception 'ga bad item'; end if;
  select c.p into v_p from public.catalog c where c.n = v_n and c.c <> 'cash';
  if v_p is null or v_p < 50 then raise exception 'ga bad item'; end if;
  d := public._ga_inv_st(d, p_inv, 'own', 'ga');
  perform public._save(d);
  v_seed := public._ga_seed();
  insert into public.giveaways (k, by_uid, item, price, inv_id, min_dep, starts_at, ends_at, seed, hash)
    values ('str', me, v_n, v_p, p_inv, p_min, now(), now() + make_interval(mins => p_minutes), v_seed, public._ga_hash(v_seed))
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'data', d);
end $$;

-- отменить свой розыгрыш можно, пока нет ни одного участника; скин возвращается
create or replace function public.ga_str_cancel(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.giveaways; d jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.giveaways where id = p_id and by_uid = me and k = 'str' and status = 'live' for update;
  if g.id is null then raise exception 'ga not found'; end if;
  if public._ga_count(g) > 0 then raise exception 'ga has players'; end if;
  d := public._me();
  if public._ga_has(d, g.inv_id, 'ga') then d := public._ga_inv_st(d, g.inv_id, 'ga', 'own'); perform public._save(d); end if;
  update public.giveaways set status = 'cancelled', n = 0, drawn_at = now() where id = g.id;
  return jsonb_build_object('ok', true, 'data', d);
end $$;

-- ---------- 8. админка (только владелец) ----------
create or replace function public.admin_ga() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'cfg', (select coalesce(jsonb_agg(to_jsonb(c) order by case c.k when 'hour' then 1 when 'day' then 2 else 3 end), '[]'::jsonb) from public.ga_cfg c),
    'live', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'k', g.k, 'item', g.item, 'price', g.price, 'min', g.min_dep,
        'start', public._ga_ms(g.starts_at), 'end', public._ga_ms(g.ends_at), 'n', public._ga_count(g),
        'by', case when g.by_uid is null then null else public._ga_who(g.by_uid) end) order by case g.k when 'hour' then 1 when 'day' then 2 when 'week' then 3 else 4 end, g.ends_at), '[]'::jsonb)
      from public.giveaways g where g.status = 'live'),
    'past', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'k', h.k, 'item', h.item, 'price', h.price, 'min', h.min_dep, 'status', h.status, 'n', h.n,
        'end', public._ga_ms(h.ends_at), 'win', public._ga_who(h.winner), 'by', case when h.by_uid is null then null else public._ga_who(h.by_uid) end) order by h.ends_at desc), '[]'::jsonb)
      from (select * from public.giveaways where status <> 'live' order by ends_at desc limit 60) h),
    'tot', (select jsonb_build_object('n', count(*), 'sum', coalesce(sum(price), 0), 'sum_site', coalesce(sum(price) filter (where k <> 'str'), 0))
      from public.giveaways where status = 'done' and ends_at > now() - interval '30 days'),
    'streamers', (select coalesce(jsonb_agg(public._ga_who(r.uid) order by r.created_at), '[]'::jsonb) from public.ref_partners r where r.active));
end $$;

create or replace function public.admin_ga_cfg(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_k text := p->>'k'; v_on boolean := coalesce((p->>'active')::boolean, false);
  v_a numeric := round(coalesce(nullif(p->>'p_min', '')::numeric, 0), 2); v_b numeric := round(coalesce(nullif(p->>'p_max', '')::numeric, 0), 2);
  v_m numeric := round(coalesce(nullif(p->>'min_dep', '')::numeric, 0), 2);
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v_k is null or v_k not in ('hour', 'day', 'week') then raise exception 'ga bad kind'; end if;
  if v_a <= 0 or v_b < v_a or v_b > 10000000 then raise exception 'ga bad price'; end if;
  if v_m < 1 or v_m > 1000000 then raise exception 'ga bad min'; end if;
  if v_on and not exists (select 1 from public._ga_pick(v_a, v_b)) then raise exception 'ga no skins'; end if;
  insert into public.ga_cfg (k, active, p_min, p_max, min_dep, updated_at, updated_by) values (v_k, v_on, v_a, v_b, v_m, now(), auth.uid())
    on conflict (k) do update set active = excluded.active, p_min = excluded.p_min, p_max = excluded.p_max, min_dep = excluded.min_dep, updated_at = now(), updated_by = auth.uid();
  perform public.ga_tick(); -- включили — розыгрыш начнётся сразу
  return jsonb_build_object('ok', true);
end $$;

-- отменить идущий розыгрыш (приз никому; у стримера скин возвращается). Час/день/неделя сразу начнётся заново с новым скином.
create or replace function public.admin_ga_cancel(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.giveaways;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into g from public.giveaways where id = p_id and status = 'live' for update;
  if g.id is null then raise exception 'ga not found'; end if;
  perform public._ga_return(g);
  update public.giveaways set status = 'cancelled', drawn_at = now() where id = g.id;
  perform public.ga_tick();
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 9. права ----------
revoke all on function public._ga_ms(timestamptz), public._ga_hash(text), public._ga_seed(), public._ga_start(text, timestamptz), public._ga_len(text),
  public._ga_deps(public.giveaways), public._ga_count(public.giveaways), public._ga_pick(numeric, numeric), public._ga_inv_st(jsonb, text, text, text),
  public._ga_has(jsonb, text, text), public._ga_return(public.giveaways), public._ga_who(uuid), public._ga_draw(bigint), public.ga_tick(),
  public._ga_past(public.giveaways, int) from public, anon, authenticated;
revoke all on function public.ga_list(), public.ga_verify(bigint), public.ga_wins(), public.ga_seen(bigint[]), public.ga_str_me(),
  public.ga_str_create(text, numeric, int), public.ga_str_cancel(bigint), public.admin_ga(), public.admin_ga_cfg(jsonb), public.admin_ga_cancel(bigint) from public, anon;
grant execute on function public.ga_list(), public.ga_verify(bigint) to anon, authenticated;
grant execute on function public.ga_wins(), public.ga_seen(bigint[]), public.ga_str_me(), public.ga_str_create(text, numeric, int), public.ga_str_cancel(bigint),
  public.admin_ga(), public.admin_ga_cfg(jsonb), public.admin_ga_cancel(bigint) to authenticated;

-- ---------- 10. таймер: раз в минуту ----------
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'ga-tick';
select cron.schedule('ga-tick', '* * * * *', $cron$ select public.ga_tick() $cron$);
select public.ga_tick(); -- первые розыгрыши — сразу

-- ============================================================
-- RUSH CASE — реферальная система v2 (владелец 15.11.2026). Выполнять ПОСЛЕ referral.sql (он уже запущен).
--   Ссылка: https://rush-case.online/?ref=<код>  — код = ник латиницей (по умолчанию из ника Steam, игрок меняет сам);
--           старые ссылки ?ref=<ID игрока> работают как раньше.
--   Пригласившему: ref_cfg.pct (5%) от КАЖДОГО онлайн-пополнения друга НАВСЕГДА (ref_cfg.days = 0) — в реферальный кошелёк
--           (ref_users.bal), оттуда кнопкой «Забрать на баланс» (ref_claim). Вывод на карту — позже, из этого же кошелька.
--   Другу по умолчанию: +ref_cfg.friend_pct (10%) к первому пополнению.
--   Стримеры (ref_partners, выдаёт админ): личный % себе, а друзьям — подарок на выбор (% к первому пополнению, ₽ на баланс,
--           кейс) для первых N друзей, в пределах лимитов админа. Подарки — за счёт сайта.
--   Защита: себя пригласить нельзя; пригласивший один навсегда; только новые аккаунты (не старше суток);
--           одно устройство/IP с пригласившим (или устройство другого его друга) — не привязываем, пишем в ref_log ('block');
--           ₽ и кейс в подарок — только аккаунтам Steam старше ref_cfg.steam_days дней с CS2 (данные пишет функция steam-auth);
--           получил ₽/кейс в подарок — вывод скинов только после первого пополнения (триггер на withdrawals).
--   Всё считает сервер; игрок напрямую в эти таблицы не пишет и не читает (только через функции ниже).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- ============================================================

-- ---------- 1. настройки: таблица ref_cfg из referral.sql + новые поля ----------
alter table public.ref_cfg add column if not exists active boolean not null default true;        -- программа включена
alter table public.ref_cfg add column if not exists ip_check boolean not null default true;      -- проверка устройства/IP
alter table public.ref_cfg add column if not exists steam_check boolean not null default true;   -- ₽/кейс только «живым» Steam
alter table public.ref_cfg add column if not exists steam_days int not null default 30;          -- аккаунту Steam не меньше N дней
alter table public.ref_cfg add column if not exists cs2_hours numeric not null default 2;        -- часов в CS2 не меньше (0 — достаточно, что CS2 есть)
alter table public.ref_cfg add column if not exists min_claim numeric not null default 1;        -- забрать из кошелька — от N ₽
alter table public.ref_cfg add column if not exists v2 boolean not null default false;
update public.ref_cfg set days = 0, v2 = true where id = 1 and not v2;                           -- владелец: 5% навсегда

-- данные Steam для проверки «живого» аккаунта (пишет функция steam-auth; игрок изменить не может — update у него отозван)
alter table public.profiles add column if not exists steam_since timestamptz;   -- когда создан аккаунт Steam (null — профиль закрыт)
alter table public.profiles add column if not exists steam_cs2h numeric;        -- часов в CS2 (null — библиотека закрыта / нет CS2)
alter table public.profiles add column if not exists steam_checked timestamptz;

alter table public.ref_earn add column if not exists pct numeric;               -- каким процентом начислено

-- ---------- 2. таблицы ----------
-- реферальный кошелёк и код ссылки (на каждого, кто хоть раз открыл страницу или получил начисление)
create table if not exists public.ref_users (
  uid uuid primary key references public.profiles (id) on delete cascade,
  code text unique,                         -- код для ссылки ?ref=<код>: a-z, 0-9, _ (3–16, хотя бы одна буква)
  code_at timestamptz,                      -- когда менял код (менять — не чаще раза в сутки)
  bal numeric not null default 0,           -- в кошельке (ещё не забрано)
  earned numeric not null default 0,        -- начислено всего
  claimed numeric not null default 0,       -- забрано на баланс всего
  frozen boolean not null default false,    -- заморожен админом: забрать нельзя
  updated_at timestamptz not null default now()
);
-- стримеры и партнёры: права и лимиты (админ) + выбор подарка (сам стример)
create table if not exists public.ref_partners (
  uid uuid primary key references public.profiles (id) on delete cascade,
  active boolean not null default true,
  pct numeric,                              -- личный % пригласившему (null — общий из ref_cfg)
  max_pct numeric not null default 20,      -- лимит: % к первому пополнению друга
  max_bal numeric not null default 0,       -- лимит: ₽ на баланс одному другу (0 — нельзя)
  max_case numeric not null default 0,      -- лимит: цена кейса в подарок (0 — нельзя)
  max_gifts int not null default 100,       -- лимит: сколько друзей всего могут получить подарок
  g_pct numeric,                            -- выбор стримера: % к первому пополнению
  g_bal numeric not null default 0,         -- выбор стримера: ₽ на баланс
  g_case text,                              -- выбор стримера: кейс
  g_n int not null default 0,               -- выбор стримера: скольким друзьям (не больше max_gifts)
  used int not null default 0,              -- подарков выдано
  note text,                                -- заметка админа
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- приглашённый: откуда пришёл и что получил
create table if not exists public.ref_meta (
  uid uuid primary key references public.profiles (id) on delete cascade,   -- друг
  ref uuid references public.profiles (id) on delete set null,             -- кто пригласил
  ip text, sid text,                                                        -- IP и устройство при привязке
  g_pct numeric,                                                            -- % к первому пополнению (снимок подарка)
  g_bal numeric not null default 0,                                         -- выдано ₽ в подарок
  g_case text,                                                              -- кейс в подарок
  case_used boolean not null default false,                                 -- кейс открыт
  steam_ok boolean,                                                         -- прошёл проверку Steam
  partner boolean not null default false,                                   -- подарок стримера
  created_at timestamptz not null default now()
);
-- где бывал игрок: IP (k = 'i') и устройство (k = 's', номер браузера rc.vid) — для проверки «одно устройство»
create table if not exists public.ref_seen (
  uid uuid not null references public.profiles (id) on delete cascade,
  k char(1) not null check (k in ('i', 's')),
  v text not null,
  ts timestamptz not null default now(),
  primary key (uid, k, v)
);
create index if not exists ref_seen_v on public.ref_seen (k, v);
-- журнал: привязки, отказы, подарки, выплаты из кошелька, действия админа
create table if not exists public.ref_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  kind text not null,          -- bind, block, case, claim, code, freeze, unfreeze, writeoff, partner
  uid uuid,                    -- игрок (друг / владелец кошелька)
  ref uuid,                    -- пригласивший
  amount numeric not null default 0,
  info jsonb
);
create index if not exists ref_log_ts on public.ref_log (ts desc);
create index if not exists ref_log_ref on public.ref_log (ref, ts desc);
create index if not exists ref_earn_friend on public.ref_earn (friend);

alter table public.ref_users enable row level security;
alter table public.ref_partners enable row level security;
alter table public.ref_meta enable row level security;
alter table public.ref_seen enable row level security;
alter table public.ref_log enable row level security;
revoke all on public.ref_users, public.ref_partners, public.ref_meta, public.ref_seen, public.ref_log from anon, authenticated;
grant all on public.ref_users, public.ref_partners, public.ref_meta, public.ref_seen, public.ref_log to service_role;
grant usage, select on sequence public.ref_log_id_seq to service_role;

-- ---------- 3. служебные функции ----------
-- IP игрока из заголовков запроса (Supabase стоит за Cloudflare)
create or replace function public._ref_ip() returns text language plpgsql stable as $$
declare h json;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then return null; end;
  if h is null then return null; end if;
  return nullif(left(trim(coalesce(h->>'cf-connecting-ip', split_part(h->>'x-forwarded-for', ',', 1), h->>'x-real-ip', '')), 64), '');
end $$;

-- ник → код ссылки: латиница (кириллица транслитом), цифры, _ ; до 16 знаков
create or replace function public._ref_slug(t text) returns text language sql immutable as $$
  select left(regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(
      translate(lower(coalesce(t, '')), 'абвгдезийклмнопрстуфыэАБВГДЕЗИЙКЛМНОПРСТУФЫЭ', 'abvgdeziyklmnoprstufyeabvgdeziyklmnoprstufye'),
      'ё', 'e'), 'ж', 'zh'), 'х', 'h'), 'ц', 'c'), 'ч', 'ch'), 'ш', 'sh'), 'щ', 'sch'), 'ю', 'yu'), 'я', 'ya'),
    '[^a-z0-9_]', '', 'g'), 16)
$$;
create or replace function public._ref_reserved(k text) returns boolean language sql immutable as $$
  select k = any (array['admin', 'admins', 'rush', 'rushcase', 'rush_case', 'support', 'staff', 'official', 'moder', 'moderator', 'owner', 'null', 'undefined'])
$$;

-- строка кошелька с кодом (создаёт при первом обращении; код — из ника, занят — с номером игрока)
create or replace function public._ref_user(p_uid uuid) returns public.ref_users
language plpgsql security definer set search_path = public as $$
declare u public.ref_users; p public.profiles; base text; c text;
begin
  select * into u from public.ref_users where uid = p_uid;
  if u.uid is not null and u.code is not null then return u; end if;
  select * into p from public.profiles where id = p_uid;
  if p.id is null then return u; end if;
  base := public._ref_slug(p.name);
  if length(base) < 3 or base !~ '[a-z]' then base := 'rush' || p.pid; end if;
  c := base;
  if public._ref_reserved(c) or exists (select 1 from public.ref_users where code = c) then c := left(base, 16 - length(p.pid::text)) || p.pid; end if;
  begin
    insert into public.ref_users (uid, code) values (p_uid, c)
      on conflict (uid) do update set code = coalesce(public.ref_users.code, excluded.code) returning * into u;
  exception when unique_violation then
    c := 'p' || p.pid || substr(md5(random()::text), 1, 3);
    insert into public.ref_users (uid, code) values (p_uid, c)
      on conflict (uid) do update set code = coalesce(public.ref_users.code, excluded.code) returning * into u;
  end;
  return u;
end $$;

-- цена кейса для подарка (только кейсы за рубли; null — нет такого или за R-COIN)
create or replace function public._ref_case_price(p_case text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select price from public.cases_srv where id = p_case and not rc), (select price from public.custom_cases where id = p_case))
$$;

-- «живой» аккаунт Steam: старше steam_days дней и есть CS2 (часы — не меньше cs2_hours)
create or replace function public._ref_steam_ok(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not c.steam_check or (
      (c.steam_days <= 0 or (p.steam_since is not null and p.steam_since <= now() - make_interval(days => c.steam_days)))
      and p.steam_cs2h is not null and p.steam_cs2h >= c.cs2_hours)
    from public.profiles p, public.ref_cfg c where p.id = p_uid and c.id = 1), false)
$$;

-- ---------- 4. привязка друга к пригласившему + подарок ----------
create or replace function public._ref_bind(p_ref text, p_sid text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; r public.profiles; c public.ref_cfg; pt public.ref_partners; d jsonb;
  k text := lower(trim(coalesce(p_ref, ''))); sid text := nullif(left(trim(coalesce(p_sid, '')), 64), ''); ip text := public._ref_ip();
  g_pct numeric; g_bal numeric := 0; g_case text; cp numeric; ok_steam boolean; is_pt boolean := false; why text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into c from public.ref_cfg where id = 1;
  if not coalesce(c.active, true) then return jsonb_build_object('ok', false, 'why', 'off'); end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if me.ref_by is not null then return jsonb_build_object('ok', false, 'why', 'already'); end if;
  if me.created_at < now() - interval '1 day' then return jsonb_build_object('ok', false, 'why', 'old'); end if;
  if k ~ '^\d{1,12}$' then select * into r from public.profiles where pid::text = k;
  elsif k ~ '^[a-z0-9_]{3,16}$' then select p.* into r from public.ref_users u join public.profiles p on p.id = u.uid where u.code = k;
  end if;
  if r.id is null then return jsonb_build_object('ok', false, 'why', 'not found'); end if;
  if r.id = me.id or r.ref_by = me.id then return jsonb_build_object('ok', false, 'why', 'self'); end if;
  -- одно устройство / IP с пригласившим, или устройство другого его друга — не привязываем
  if coalesce(c.ip_check, true) then
    why := case
      when sid is not null and exists (select 1 from public.ref_seen s where s.uid = r.id and s.k = 's' and s.v = sid) then 'sid'
      when ip is not null and exists (select 1 from public.ref_seen s where s.uid = r.id and s.k = 'i' and s.v = ip and s.ts > now() - interval '30 days') then 'ip'
      when sid is not null and exists (select 1 from public.ref_seen s join public.profiles f on f.id = s.uid
                                       where s.k = 's' and s.v = sid and s.uid <> me.id and f.ref_by = r.id) then 'friend' end;
    if why is not null then
      insert into public.ref_log (kind, uid, ref, info) values ('block', me.id, r.id, jsonb_build_object('why', why));
      return jsonb_build_object('ok', false, 'why', 'device');
    end if;
  end if;
  -- подарок: стример с неистраченными подарками — его выбор (в пределах лимитов), иначе обычный % к первому пополнению
  g_pct := c.friend_pct;
  update public.ref_partners set used = used + 1, updated_at = now()
    where uid = r.id and active and used < least(g_n, max_gifts) returning * into pt;
  if pt.uid is not null then
    is_pt := true;
    g_pct := greatest(c.friend_pct, least(coalesce(pt.g_pct, c.friend_pct), pt.max_pct));
    g_bal := greatest(0, least(coalesce(pt.g_bal, 0), pt.max_bal));
    if pt.g_case is not null then cp := public._ref_case_price(pt.g_case); if cp is not null and cp <= pt.max_case then g_case := pt.g_case; end if; end if;
  end if;
  if g_bal > 0 or g_case is not null then
    ok_steam := public._ref_steam_ok(me.id);
    if not ok_steam then g_bal := 0; g_case := null; end if;
  end if;
  d := public._norm(me.data);
  if g_bal > 0 then d := public._bal(public._stat(d, 'refGift', g_bal), g_bal); end if;
  update public.profiles set ref_by = r.id, ref_at = now(), data = d, updated_at = now() where id = me.id;
  insert into public.ref_meta (uid, ref, ip, sid, g_pct, g_bal, g_case, steam_ok, partner)
    values (me.id, r.id, ip, sid, g_pct, g_bal, g_case, ok_steam, is_pt)
    on conflict (uid) do update set ref = excluded.ref, ip = excluded.ip, sid = excluded.sid, g_pct = excluded.g_pct, g_bal = excluded.g_bal,
      g_case = excluded.g_case, case_used = false, steam_ok = excluded.steam_ok, partner = excluded.partner, created_at = now();
  insert into public.ref_log (kind, uid, ref, amount, info)
    values ('bind', me.id, r.id, g_bal, jsonb_build_object('pct', g_pct, 'bal', g_bal, 'case', g_case, 'steam', ok_steam, 'partner', is_pt, 'code', k));
  return jsonb_build_object('ok', true, 'name', r.name, 'pct', g_pct, 'bal', g_bal, 'case', g_case,
    'steam', ok_steam, 'data', case when g_bal > 0 then d end);
end $$;

-- вызывает сайт при каждом входе: запоминает IP и устройство; пришёл по ссылке (p_ref) — привязка.
-- Возвращает кейс в подарок, если он ещё не открыт.
create or replace function public.ref_hello(p_sid text default null, p_ref text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ip text := public._ref_ip(); sid text := nullif(left(trim(coalesce(p_sid, '')), 64), ''); res jsonb := '{}'::jsonb; m public.ref_meta;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if ip is not null then insert into public.ref_seen (uid, k, v) values (auth.uid(), 'i', ip) on conflict (uid, k, v) do update set ts = now(); end if;
  if sid is not null then insert into public.ref_seen (uid, k, v) values (auth.uid(), 's', sid) on conflict (uid, k, v) do update set ts = now(); end if;
  delete from public.ref_seen where uid = auth.uid() and k = 'i' and ts < now() - interval '90 days';
  if nullif(trim(coalesce(p_ref, '')), '') is not null then res := jsonb_build_object('bind', public._ref_bind(p_ref, sid)); end if;
  select * into m from public.ref_meta where uid = auth.uid();
  return res || jsonb_build_object('gift_case', case when m.g_case is not null and not m.case_used then m.g_case end);
end $$;

-- старое имя (сайт из кэша): привязка без номера устройства
create or replace function public.set_ref(p_ref text) returns jsonb
language sql security definer set search_path = public as $$ select public._ref_bind(p_ref, null) $$;

-- ---------- 5. начисления (их вызывает pay_credit из payments.sql / dep_rcoin.sql — менять его не нужно) ----------
-- бонус другу к первому пополнению, % (0 — не положен); p_dep — сколько игрок пополнял до этого
create or replace function public._ref_first_bonus(p_uid uuid, p_dep numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select greatest(c.friend_pct, coalesce(m.g_pct, 0))
    from public.profiles p cross join public.ref_cfg c left join public.ref_meta m on m.uid = p.id
    where p.id = p_uid and c.id = 1 and c.active and p.ref_by is not null and coalesce(p_dep, 0) = 0
      and (c.days <= 0 or p.ref_at > now() - make_interval(days => c.days))), 0)
$$;
-- % пригласившему от пополнения друга — в реферальный кошелёк
create or replace function public._ref_reward(p_uid uuid, p_amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare p public.profiles; c public.ref_cfg; pc numeric; v numeric;
begin
  select * into p from public.profiles where id = p_uid;
  select * into c from public.ref_cfg where id = 1;
  if p.ref_by is null or not coalesce(c.active, true) or (c.days > 0 and p.ref_at <= now() - make_interval(days => c.days)) then return 0; end if;
  pc := coalesce((select rp.pct from public.ref_partners rp where rp.uid = p.ref_by and rp.active and rp.pct is not null), c.pct);
  v := round(coalesce(p_amount, 0) * pc / 100, 2);
  if v <= 0 then return 0; end if;
  insert into public.ref_users (uid, bal, earned) values (p.ref_by, v, v)
    on conflict (uid) do update set bal = public.ref_users.bal + v, earned = public.ref_users.earned + v, updated_at = now();
  insert into public.ref_earn (uid, friend, amount, reward, pct) values (p.ref_by, p_uid, p_amount, v, pc);
  return v;
end $$;

-- запрет вывода скинов: получил ₽ или кейс в подарок по ссылке и ещё ни разу не пополнял (с 24.11 стримеры без запрета — новая версия в no_reg_bonus.sql)
create or replace function public._ref_wd_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.ref_meta m where m.uid = new.uid and (m.g_bal > 0 or m.g_case is not null))
     and not exists (select 1 from public.payments p where p.uid = new.uid and p.status = 'paid') then
    raise exception 'ref lock';
  end if;
  return new;
end $$;
drop trigger if exists withdrawals_ref_lock on public.withdrawals;
create trigger withdrawals_ref_lock before insert on public.withdrawals for each row execute function public._ref_wd_lock();

-- ---------- 6. функции игрока ----------
-- забрать реферальный кошелёк на баланс
create or replace function public.ref_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u public.ref_users; c public.ref_cfg; d jsonb; v numeric;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into c from public.ref_cfg where id = 1;
  select * into u from public.ref_users where uid = auth.uid() for update;
  v := round(coalesce(u.bal, 0), 2);
  if v <= 0 then raise exception 'ref empty'; end if;
  if u.frozen then raise exception 'ref frozen'; end if;
  if v < coalesce(c.min_claim, 0) then raise exception 'ref min'; end if;
  d := public._me();
  d := public._bal(public._stat(d, 'refEarn', v), v);
  perform public._save(d);
  update public.ref_users set bal = bal - v, claimed = claimed + v, updated_at = now() where uid = u.uid;
  insert into public.ref_log (kind, uid, amount) values ('claim', u.uid, v);
  return jsonb_build_object('data', d, 'amount', v);
end $$;

-- сменить код ссылки (не чаще раза в сутки; старые ссылки с прежним кодом перестают работать, ссылка с ID — работает всегда)
create or replace function public.ref_set_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text := lower(trim(coalesce(p_code, ''))); u public.ref_users;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if k !~ '^[a-z0-9_]{3,16}$' or k !~ '[a-z]' then raise exception 'ref bad code'; end if;
  if public._ref_reserved(k) then raise exception 'ref code taken'; end if;
  u := public._ref_user(auth.uid());
  if u.code = k then return jsonb_build_object('ok', true, 'code', k); end if;
  if u.code_at is not null and u.code_at > now() - interval '1 day' then raise exception 'ref code wait'; end if;
  if exists (select 1 from public.ref_users where code = k and uid <> auth.uid()) then raise exception 'ref code taken'; end if;
  update public.ref_users set code = k, code_at = now(), updated_at = now() where uid = auth.uid();
  insert into public.ref_log (kind, uid, info) values ('code', auth.uid(), jsonb_build_object('from', u.code, 'to', k));
  return jsonb_build_object('ok', true, 'code', k);
exception when unique_violation then raise exception 'ref code taken';
end $$;

-- стример выбирает подарок друзьям (в пределах лимитов админа)
create or replace function public.ref_partner_gift(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pt public.ref_partners; c public.ref_cfg; v_pct numeric; v_bal numeric; v_case text; v_n int; cp numeric;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into pt from public.ref_partners where uid = auth.uid() and active for update;
  if pt.uid is null then raise exception 'forbidden'; end if;
  select * into c from public.ref_cfg where id = 1;
  v_pct := round(coalesce(nullif(p->>'pct', '')::numeric, c.friend_pct), 1);
  v_bal := round(coalesce(nullif(p->>'bal', '')::numeric, 0), 2);
  v_case := nullif(trim(coalesce(p->>'case', '')), '');
  v_n := coalesce(nullif(p->>'n', '')::int, 0);
  if v_pct < c.friend_pct or v_pct > greatest(pt.max_pct, c.friend_pct) then raise exception 'ref bad pct'; end if;
  if v_bal < 0 or v_bal > pt.max_bal then raise exception 'ref bad bal'; end if;
  if v_case is not null then cp := public._ref_case_price(v_case); if cp is null or cp > pt.max_case then raise exception 'ref bad case'; end if; end if;
  if v_n < 0 or v_n > pt.max_gifts then raise exception 'ref bad n'; end if;
  update public.ref_partners set g_pct = v_pct, g_bal = v_bal, g_case = v_case, g_n = v_n, updated_at = now() where uid = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

-- открыть кейс, подаренный по ссылке: сервер кладёт цену кейса и сразу открывает его обычным open_case
create or replace function public.ref_gift_open(p_case text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.ref_meta; pr numeric; r jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into m from public.ref_meta where uid = auth.uid() for update;
  if m.uid is null or m.g_case is null or m.case_used or m.g_case <> p_case then raise exception 'ref no gift'; end if;
  pr := public._ref_case_price(p_case);
  if pr is null then raise exception 'case not found'; end if;
  update public.profiles set data = public._bal(public._norm(data), pr), updated_at = now() where id = auth.uid();
  r := public.open_case(p_case, 1);
  update public.ref_meta set case_used = true where uid = auth.uid();
  insert into public.ref_log (kind, uid, ref, amount, info) values ('case', auth.uid(), m.ref, pr, jsonb_build_object('case', p_case));
  return r;
end $$;

-- кто пригласил (для окна «Вас пригласил…» до входа): ник, аватар и подарок
create or replace function public.ref_info(p_ref text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare k text := lower(trim(coalesce(p_ref, ''))); r public.profiles; c public.ref_cfg; pt public.ref_partners; g_case text; cp numeric;
begin
  if k ~ '^\d{1,12}$' then select * into r from public.profiles where pid::text = k;
  elsif k ~ '^[a-z0-9_]{3,16}$' then select p.* into r from public.ref_users u join public.profiles p on p.id = u.uid where u.code = k;
  end if;
  if r.id is null then return null; end if;
  select * into c from public.ref_cfg where id = 1;
  if not coalesce(c.active, true) then return null; end if;
  select * into pt from public.ref_partners where uid = r.id and active and used < least(g_n, max_gifts);
  if pt.uid is null then return jsonb_build_object('name', r.name, 'ava', r.ava, 'pid', r.pid, 'pct', c.friend_pct, 'bal', 0); end if;
  if pt.g_case is not null then cp := public._ref_case_price(pt.g_case); if cp is not null and cp <= pt.max_case then g_case := pt.g_case; end if; end if;
  return jsonb_build_object('name', r.name, 'ava', r.ava, 'pid', r.pid, 'partner', true,
    'pct', greatest(c.friend_pct, least(coalesce(pt.g_pct, c.friend_pct), pt.max_pct)), 'bal', least(pt.g_bal, pt.max_bal), 'case', g_case,
    'left', least(pt.g_n, pt.max_gifts) - pt.used, 'steam_days', case when c.steam_check then c.steam_days end);
end $$;

-- страница «Пригласить друзей»: код, кошелёк, подарки, итоги и график за p_days дней (по Москве)
create or replace function public.ref_page(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; u public.ref_users; c public.ref_cfg; pt public.ref_partners; m public.ref_meta; byp public.profiles;
  n int := least(greatest(coalesce(p_days, 30), 7), 365); my_pct numeric; res jsonb; tz text := 'Europe/Moscow';
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into me from public.profiles where id = auth.uid();
  u := public._ref_user(me.id);
  select * into c from public.ref_cfg where id = 1;
  select * into pt from public.ref_partners where uid = me.id and active;
  select * into m from public.ref_meta where uid = me.id;
  select * into byp from public.profiles where id = me.ref_by;
  my_pct := coalesce(pt.pct, c.pct);
  with f as (select id, ref_at, coalesce((data->'stats'->>'opened')::numeric, 0) opens, coalesce((data->'stats'->>'spent')::numeric, 0) spent
             from public.profiles where ref_by = me.id),
    pay as (select p.uid, p.amount, p.paid_at, p.status from public.payments p join f on f.id = p.uid where p.status in ('paid', 'hold')),
    ern as (select reward, ts from public.ref_earn where uid = me.id),
    dd as (select (g)::date d from generate_series((now() at time zone tz)::date - (n - 1), (now() at time zone tz)::date, interval '1 day') g),
    fr as (select (ref_at at time zone tz)::date d, count(*) k from f group by 1),
    pd as (select (paid_at at time zone tz)::date d, sum(amount) s, count(distinct uid) k from pay where status = 'paid' group by 1),
    ed as (select (ts at time zone tz)::date d, sum(reward) s from ern group by 1)
  select jsonb_build_object(
    'tot', jsonb_build_object(
      'friends', (select count(*) from f),
      'today', (select count(*) from f where (ref_at at time zone tz)::date = (now() at time zone tz)::date),
      'deps', (select count(distinct uid) from pay where status = 'paid'),
      'dep7', (select coalesce(sum(amount), 0) from pay where status = 'paid' and paid_at > now() - interval '7 days'),
      'dep30', (select coalesce(sum(amount), 0) from pay where status = 'paid' and paid_at > now() - interval '30 days'),
      'depAll', (select coalesce(sum(amount), 0) from pay where status = 'paid'),
      'depN', (select count(*) from pay where status = 'paid'),
      'earn7', (select coalesce(sum(reward), 0) from ern where ts > now() - interval '7 days'),
      'earn30', (select coalesce(sum(reward), 0) from ern where ts > now() - interval '30 days'),
      'earnAll', (select coalesce(sum(reward), 0) from ern),
      'hold', (select coalesce(sum(amount), 0) from pay where status = 'hold'),
      'pending', round((select coalesce(sum(amount), 0) from pay where status = 'hold') * my_pct / 100, 2),
      'opens', (select coalesce(sum(opens), 0) from f),
      'spent', (select coalesce(sum(spent), 0) from f)),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('d', to_char(dd.d, 'YYYY-MM-DD'), 'r', coalesce(fr.k, 0), 'dep', coalesce(pd.s, 0), 'p', coalesce(pd.k, 0), 'earn', coalesce(ed.s, 0)) order by dd.d), '[]'::jsonb)
               from dd left join fr on fr.d = dd.d left join pd on pd.d = dd.d left join ed on ed.d = dd.d)
  ) into res;
  return res || jsonb_build_object(
    'pid', me.pid, 'code', u.code, 'code_at', u.code_at, 'pct', my_pct, 'days', n,
    'cfg', jsonb_build_object('pct', c.pct, 'friend_pct', c.friend_pct, 'days', c.days, 'active', c.active, 'min_claim', c.min_claim,
      'steam_check', c.steam_check, 'steam_days', c.steam_days, 'cs2_hours', c.cs2_hours),
    'wallet', jsonb_build_object('bal', u.bal, 'earned', u.earned, 'claimed', u.claimed, 'frozen', u.frozen),
    'partner', case when pt.uid is null then null else jsonb_build_object('pct', pt.pct, 'max_pct', pt.max_pct, 'max_bal', pt.max_bal, 'max_case', pt.max_case,
      'max_gifts', pt.max_gifts, 'g_pct', pt.g_pct, 'g_bal', pt.g_bal, 'g_case', pt.g_case, 'g_n', pt.g_n, 'used', pt.used) end,
    'by', case when byp.id is null then null else jsonb_build_object('name', byp.name, 'pid', byp.pid, 'ava', byp.ava) end,
    'mine', case when m.uid is null then null else jsonb_build_object('pct', greatest(coalesce(m.g_pct, 0), c.friend_pct), 'bal', m.g_bal, 'case', m.g_case,
      'case_used', m.case_used, 'steam_ok', m.steam_ok, 'partner', m.partner,
      'dep', exists (select 1 from public.payments p where p.uid = me.id and p.status = 'paid')) end);
end $$;

-- список приглашённых: сортировка, поиск, страницы
create or replace function public.ref_friends(p_sort text default 'reg', p_q text default '', p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text := trim(coalesce(p_q, '')); lim int := least(greatest(coalesce(p_limit, 50), 1), 200); off int := greatest(coalesce(p_offset, 0), 0);
  my_pct numeric; res jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  my_pct := coalesce((select rp.pct from public.ref_partners rp where rp.uid = auth.uid() and rp.active and rp.pct is not null), (select pct from public.ref_cfg where id = 1));
  with f as (select p.id, p.pid, p.name, p.ava, p.ref_at, p.updated_at,
                    coalesce((p.data->'stats'->>'opened')::numeric, 0) opens, coalesce((p.data->'stats'->>'spent')::numeric, 0) spent
             from public.profiles p where p.ref_by = auth.uid()
               and (q = '' or p.pid::text = q or p.name ilike '%' || replace(replace(q, '%', ''), '_', '') || '%')),
    pay as (select uid,
              sum(amount) filter (where status = 'paid' and paid_at > now() - interval '7 days') d7,
              sum(amount) filter (where status = 'paid' and paid_at > now() - interval '30 days') d30,
              sum(amount) filter (where status = 'paid') dall,
              count(*) filter (where status = 'paid') dn,
              sum(amount) filter (where status = 'hold') hold
            from public.payments where uid in (select id from f) and status in ('paid', 'hold') group by uid),
    ern as (select friend, sum(reward) s from public.ref_earn where uid = auth.uid() group by friend),
    rows as (select f.pid, f.name, f.ava, f.ref_at, f.updated_at, f.opens, f.spent,
               coalesce(pay.d7, 0) d7, coalesce(pay.d30, 0) d30, coalesce(pay.dall, 0) dall, coalesce(pay.dn, 0) dn,
               coalesce(ern.s, 0) earned, round(coalesce(pay.hold, 0) * my_pct / 100, 2) pend,
               coalesce(m.g_bal, 0) g_bal, m.g_case, m.partner
             from f left join pay on pay.uid = f.id left join ern on ern.friend = f.id left join public.ref_meta m on m.uid = f.id)
  select jsonb_build_object('n', (select count(*) from rows), 'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select * from rows order by
        case when p_sort = 'dep' then dall when p_sort = 'dep7' then d7 when p_sort = 'dep30' then d30
             when p_sort = 'earn' then earned when p_sort = 'opens' then opens end desc nulls last,
        ref_at desc limit lim offset off) r), '[]'::jsonb)) into res;
  return res;
end $$;

-- для окна пополнения (старое имя): положен ли бонус к первому пополнению и какой
create or replace function public.my_referrals() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me public.profiles; b numeric;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into me from public.profiles where id = auth.uid();
  b := public._ref_first_bonus(me.id, (me.data->'stats'->>'dep')::numeric);
  return jsonb_build_object('pid', me.pid, 'bonus', b > 0, 'friend_pct', b, 'by', (select name from public.profiles where id = me.ref_by));
end $$;

-- ---------- 7. админка (только владелец: is_admin) ----------
create or replace function public.admin_ref_cfg(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_pct numeric := (p->>'pct')::numeric; v_fp numeric := (p->>'friend_pct')::numeric; v_days int := (p->>'days')::int;
  v_sd int := (p->>'steam_days')::int; v_ch numeric := (p->>'cs2_hours')::numeric; v_min numeric := (p->>'min_claim')::numeric;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v_pct is null or v_pct < 0 or v_pct > 50 or v_fp is null or v_fp < 0 or v_fp > 200 or v_days is null or v_days < 0 or v_days > 3650
     or v_sd is null or v_sd < 0 or v_sd > 3650 or v_ch is null or v_ch < 0 or v_ch > 10000 or v_min is null or v_min < 0 or v_min > 100000 then
    raise exception 'bad value';
  end if;
  update public.ref_cfg set pct = v_pct, friend_pct = v_fp, days = v_days, steam_days = v_sd, cs2_hours = v_ch, min_claim = v_min,
    active = coalesce((p->>'active')::boolean, active), ip_check = coalesce((p->>'ip_check')::boolean, ip_check),
    steam_check = coalesce((p->>'steam_check')::boolean, steam_check) where id = 1;
end $$;

-- выдать / изменить права стримера (по ID игрока); p.code — задать ему код ссылки
create or replace function public.admin_ref_partner(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.profiles; k text := lower(trim(coalesce(p->>'code', ''))); v_pct numeric := nullif(p->>'pct', '')::numeric;
  v_mp numeric := coalesce(nullif(p->>'max_pct', '')::numeric, 20); v_mb numeric := coalesce(nullif(p->>'max_bal', '')::numeric, 0);
  v_mc numeric := coalesce(nullif(p->>'max_case', '')::numeric, 0); v_mg int := coalesce(nullif(p->>'max_gifts', '')::int, 100);
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into r from public.profiles where pid::text = trim(coalesce(p->>'pid', ''));
  if r.id is null then raise exception 'player not found'; end if;
  if (v_pct is not null and (v_pct < 0 or v_pct > 50)) or v_mp < 0 or v_mp > 200 or v_mb < 0 or v_mb > 100000 or v_mc < 0 or v_mc > 100000 or v_mg < 0 or v_mg > 1000000 then
    raise exception 'bad value';
  end if;
  insert into public.ref_partners (uid, active, pct, max_pct, max_bal, max_case, max_gifts, note)
    values (r.id, coalesce((p->>'active')::boolean, true), v_pct, v_mp, v_mb, v_mc, v_mg, nullif(trim(coalesce(p->>'note', '')), ''))
    on conflict (uid) do update set active = excluded.active, pct = excluded.pct, max_pct = excluded.max_pct, max_bal = excluded.max_bal,
      max_case = excluded.max_case, max_gifts = excluded.max_gifts, note = excluded.note, updated_at = now(),
      g_n = least(public.ref_partners.g_n, excluded.max_gifts);
  perform public._ref_user(r.id);
  if k <> '' then
    if k !~ '^[a-z0-9_]{3,16}$' or k !~ '[a-z]' then raise exception 'ref bad code'; end if;
    if exists (select 1 from public.ref_users where code = k and uid <> r.id) then raise exception 'ref code taken'; end if;
    update public.ref_users set code = k, updated_at = now() where uid = r.id;
  end if;
  insert into public.ref_log (kind, uid, info) values ('partner', r.id, p);
  return jsonb_build_object('ok', true, 'name', r.name);
end $$;
create or replace function public.admin_ref_partner_del(p_pid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.ref_partners where uid = (select id from public.profiles where pid = p_pid);
end $$;
-- заморозить / разморозить кошелёк, списать из кошелька (накрутка)
create or replace function public.admin_ref_wallet(p_pid bigint, p_act text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.profiles; u public.ref_users;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into r from public.profiles where pid = p_pid;
  if r.id is null then raise exception 'player not found'; end if;
  u := public._ref_user(r.id);
  if p_act = 'freeze' then update public.ref_users set frozen = true, updated_at = now() where uid = r.id;
  elsif p_act = 'unfreeze' then update public.ref_users set frozen = false, updated_at = now() where uid = r.id;
  elsif p_act = 'writeoff' then update public.ref_users set bal = 0, updated_at = now() where uid = r.id;
  else raise exception 'bad action'; end if;
  insert into public.ref_log (kind, uid, amount) values (p_act, r.id, case when p_act = 'writeoff' then u.bal else 0 end);
  return jsonb_build_object('ok', true);
end $$;

-- вкладка «Рефералы»: настройки, итоги, стримеры, топ, подозрительные, журнал
create or replace function public.admin_ref() returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  with fr as (select id, ref_by from public.profiles where ref_by is not null),
    paid as (select p.uid, sum(p.amount) s from public.payments p join fr on fr.id = p.uid where p.status = 'paid' group by p.uid),
    per as (select fr.ref_by uid, count(*) friends, count(paid.uid) deps, coalesce(sum(paid.s), 0) dep from fr left join paid on paid.uid = fr.id group by fr.ref_by),
    shared_ip as (select f1.ref_by uid, count(distinct s1.uid) k from fr f1 join public.ref_seen s1 on s1.uid = f1.id and s1.k = 'i'
                  join public.ref_seen s2 on s2.k = 'i' and s2.v = s1.v and s2.uid <> s1.uid join fr f2 on f2.id = s2.uid and f2.ref_by = f1.ref_by group by 1),
    shared_dev as (select f1.ref_by uid, count(distinct s1.uid) k from fr f1 join public.ref_seen s1 on s1.uid = f1.id and s1.k = 's'
                  join public.ref_seen s2 on s2.k = 's' and s2.v = s1.v and s2.uid <> s1.uid join fr f2 on f2.id = s2.uid and f2.ref_by = f1.ref_by group by 1),
    blk as (select ref uid, count(*) k from public.ref_log where kind = 'block' and ts > now() - interval '30 days' group by ref),
    nodep as (select m.ref uid, count(*) k from public.ref_meta m where (m.g_bal > 0 or m.g_case is not null)
              and not exists (select 1 from public.payments p where p.uid = m.uid and p.status = 'paid') group by m.ref),
    who as (select p.id, p.pid, p.name, u.code, coalesce(u.bal, 0) bal, coalesce(u.earned, 0) earned, coalesce(u.claimed, 0) claimed, coalesce(u.frozen, false) frozen,
              coalesce(per.friends, 0) friends, coalesce(per.deps, 0) deps, coalesce(per.dep, 0) dep,
              coalesce(blk.k, 0) blocked, coalesce(nodep.k, 0) nodep, coalesce(shared_ip.k, 0) ip, coalesce(shared_dev.k, 0) dev
            from public.profiles p left join public.ref_users u on u.uid = p.id left join per on per.uid = p.id left join blk on blk.uid = p.id
              left join nodep on nodep.uid = p.id left join shared_ip on shared_ip.uid = p.id left join shared_dev on shared_dev.uid = p.id
            where p.id in (select uid from per union select uid from public.ref_users where earned > 0 or bal > 0 union select uid from blk union select uid from public.ref_partners))
  select jsonb_build_object(
    'cfg', (select to_jsonb(c) from public.ref_cfg c where id = 1),
    'tot', jsonb_build_object(
      'friends', (select count(*) from fr),
      'refs', (select count(*) from per),
      'deps', (select coalesce(sum(deps), 0) from per),
      'dep', (select coalesce(sum(dep), 0) from per),
      'earned', (select coalesce(sum(earned), 0) from public.ref_users),
      'bal', (select coalesce(sum(bal), 0) from public.ref_users),
      'claimed', (select coalesce(sum(claimed), 0) from public.ref_users),
      'gift_bal', (select coalesce(sum(g_bal), 0) from public.ref_meta),
      'gift_case', (select count(*) from public.ref_meta where g_case is not null),
      'case_used', (select coalesce(sum(amount), 0) from public.ref_log where kind = 'case'),
      'blocked', (select count(*) from public.ref_log where kind = 'block' and ts > now() - interval '30 days')),
    'partners', (select coalesce(jsonb_agg(jsonb_build_object('pid', w.pid, 'name', w.name, 'code', w.code, 'active', rp.active, 'pct', rp.pct,
        'max_pct', rp.max_pct, 'max_bal', rp.max_bal, 'max_case', rp.max_case, 'max_gifts', rp.max_gifts, 'g_pct', rp.g_pct, 'g_bal', rp.g_bal,
        'g_case', rp.g_case, 'g_n', rp.g_n, 'used', rp.used, 'note', rp.note, 'friends', w.friends, 'deps', w.deps, 'dep', w.dep,
        'earned', w.earned, 'bal', w.bal, 'frozen', w.frozen) order by w.dep desc), '[]'::jsonb)
      from public.ref_partners rp join who w on w.id = rp.uid),
    'top', (select coalesce(jsonb_agg(to_jsonb(t) - 'id' order by t.earned desc, t.friends desc), '[]'::jsonb)
      from (select * from who where friends > 0 or earned > 0 order by earned desc, friends desc limit 30) t),
    'sus', (select coalesce(jsonb_agg(to_jsonb(t) - 'id' order by t.score desc), '[]'::jsonb)
      from (select *, blocked * 2 + dev * 3 + ip + nodep as score from who where blocked > 0 or dev > 0 or ip >= 2 or nodep >= 3 order by score desc limit 40) t),
    'log', (select coalesce(jsonb_agg(x order by x->>'ts' desc), '[]'::jsonb) from (
        select jsonb_build_object('ts', l.ts, 'kind', l.kind, 'amount', l.amount, 'info', l.info,
          'u', (select jsonb_build_object('pid', pid, 'name', name) from public.profiles where id = l.uid),
          'r', (select jsonb_build_object('pid', pid, 'name', name) from public.profiles where id = l.ref)) x
        from (select * from public.ref_log order by ts desc limit 60) l
        union all
        select jsonb_build_object('ts', e.ts, 'kind', 'earn', 'amount', e.reward, 'info', jsonb_build_object('dep', e.amount, 'pct', e.pct),
          'u', (select jsonb_build_object('pid', pid, 'name', name) from public.profiles where id = e.friend),
          'r', (select jsonb_build_object('pid', pid, 'name', name) from public.profiles where id = e.uid))
        from (select * from public.ref_earn order by ts desc limit 60) e) z)
  ) into res;
  return res;
end $$;

-- ---------- 8. права на функции ----------
revoke all on function public._ref_ip(), public._ref_user(uuid), public._ref_case_price(text), public._ref_steam_ok(uuid), public._ref_bind(text, text),
  public._ref_first_bonus(uuid, numeric), public._ref_reward(uuid, numeric), public._ref_wd_lock() from public, anon, authenticated;
grant execute on function public._ref_first_bonus(uuid, numeric), public._ref_reward(uuid, numeric) to service_role;
revoke all on function public.ref_hello(text, text), public.set_ref(text), public.ref_claim(), public.ref_set_code(text), public.ref_partner_gift(jsonb),
  public.ref_gift_open(text), public.ref_page(int), public.ref_friends(text, text, int, int), public.my_referrals(),
  public.admin_ref_cfg(jsonb), public.admin_ref_partner(jsonb), public.admin_ref_partner_del(bigint), public.admin_ref_wallet(bigint, text), public.admin_ref()
  from public, anon;
grant execute on function public.ref_hello(text, text), public.set_ref(text), public.ref_claim(), public.ref_set_code(text), public.ref_partner_gift(jsonb),
  public.ref_gift_open(text), public.ref_page(int), public.ref_friends(text, text, int, int), public.my_referrals(),
  public.admin_ref_cfg(jsonb), public.admin_ref_partner(jsonb), public.admin_ref_partner_del(bigint), public.admin_ref_wallet(bigint, text), public.admin_ref()
  to authenticated;
revoke all on function public.ref_info(text) from public;
grant execute on function public.ref_info(text) to anon, authenticated;

select 'Реферальная система v2 готова' as result;

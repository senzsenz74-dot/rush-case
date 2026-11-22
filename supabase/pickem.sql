-- =====================================================================
-- RUSH CASE — ПИКЕМ на PGL Major Singapore 2026 (страница #/pickem, владелец 23.11.2026).
-- Пропуск (499 ₽ с баланса) → можно делать прогнозы на матчи: победитель и счёт (до начала матча).
-- Верный победитель → случайный скин 5–10 ₽ в инвентарь; верный счёт (Bo3/Bo5) → ещё один скин.
--   Скины выдаёт сервер в момент, когда админ вносит результат матча (admin_pk_result).
-- Главный приз (скин из настроек) — тому, у кого больше всего верных; при равенстве — у кого больше верных
--   победителей, дальше — кто раньше сделал свои прогнозы. Выдаёт админ кнопкой (admin_pk_final).
-- Расстановка команд этапа (как в CS2): 2 команды «3:0», 6 — «3:1 / 3:2 прошли», 2 — «0:3 выбыли»; до первого матча этапа.
--   Верно поставленная команда → скин 5–10 ₽ и 1 очко; выдаётся сам, как только у команды 3 победы или 3 поражения (admin_pk_result).
-- Билет «Пропуск PIKEM · Major 2026» может выпасть из кейса MAJOR (5%): в инвентаре «Активировать» (pk_activate) или продать; вывод в Steam запрещён.
-- Медаль пропуска: pk_passes.show — показывать значок у аватарки (видят все, pk_medals).
-- Настройки — site_cfg 'pickem': { price, rw: [от, до], prize: { n }, off } (пишет админ).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- =====================================================================

-- ---------- матчи ----------
create table if not exists public.pk_matches (
  id bigserial primary key,
  stage int not null check (stage between 1 and 4),   -- 1–3 этапы (Swiss), 4 — плей-офф
  slot text not null,                                 -- Swiss: 0-0, 1-0, 0-1, 2-0, 1-1, 0-2, 2-1, 1-2, 2-2; плей-офф: qf, sf, f
  ord int not null default 0,                         -- порядок в столбце
  ta text not null, tb text not null,                 -- id команд (картинка assets/pickem/<id>.webp)
  bo int not null default 1 check (bo in (1, 3, 5)),
  starts_at timestamptz not null,                     -- прогнозы принимаются до этого времени
  win text,                                           -- победитель (ta или tb); null — ещё не сыгран
  score text,                                         -- счёт, победитель первым: 1:0, 2:1, 3:2
  done_at timestamptz,
  check (ta <> tb)
);
create index if not exists pk_matches_stage on public.pk_matches (stage, slot, ord);

-- ---------- пропуска (= медаль в инвентаре) ----------
create table if not exists public.pk_passes (
  uid uuid primary key references public.profiles (id) on delete cascade,
  price numeric not null,
  show boolean not null default true,                 -- значок медали у аватарки
  bought_at timestamptz not null default now()
);

-- ---------- прогнозы ----------
create table if not exists public.pk_picks (
  uid uuid not null references public.profiles (id) on delete cascade,
  mid bigint not null references public.pk_matches (id) on delete cascade,
  win text not null,
  score text not null,
  ts timestamptz not null default now(),
  ok_win boolean,                                     -- после результата: угадан победитель
  ok_score boolean,                                   -- угадан счёт (только Bo3/Bo5)
  prize jsonb not null default '[]'::jsonb,           -- выданные скины: ["название", …]
  primary key (uid, mid)
);
create index if not exists pk_picks_mid on public.pk_picks (mid);

-- ---------- кому выдан главный приз ----------
create table if not exists public.pk_final (
  k text primary key default 'main',
  uid uuid references public.profiles (id) on delete set null,
  n text, pts int, ts timestamptz not null default now()
);

-- ---------- расстановка команд этапа ----------
create table if not exists public.pk_stage_picks (
  uid uuid not null references public.profiles (id) on delete cascade,
  stage int not null check (stage between 1 and 3),
  team text not null,
  box text not null check (box in ('30', '3x', '03')),   -- 3:0 / 3:1-3:2 прошли / 0:3 выбыли
  ts timestamptz not null default now(),
  ok boolean,                                          -- после итога команды: угадано
  prize jsonb not null default '[]'::jsonb,
  primary key (uid, stage, team)
);

-- читать и менять таблицы напрямую нельзя: только через функции ниже
alter table public.pk_matches enable row level security;
alter table public.pk_passes enable row level security;
alter table public.pk_picks enable row level security;
alter table public.pk_final enable row level security;
alter table public.pk_stage_picks enable row level security;
revoke all on public.pk_matches, public.pk_passes, public.pk_picks, public.pk_final, public.pk_stage_picks from anon, authenticated;

insert into public.site_cfg (k, v) values ('pickem', '{"price": 499, "rw": [5, 10], "prize": {}}'::jsonb) on conflict (k) do nothing;

-- ---------- служебное ----------
create or replace function public._pk_scores(p_bo int) returns text[] language sql immutable as $$
  select case p_bo when 3 then array['2:0', '2:1'] when 5 then array['3:0', '3:1', '3:2'] else array['1:0'] end
$$;

-- таблица лидеров: очки = верные победители + верные счета + верно поставленные команды; только у кого есть пропуск
create or replace function public._pk_board() returns table (uid uuid, pts int, ok int, last timestamptz, pos bigint)
language sql stable security definer set search_path = public as $$
  select b.uid, b.pts, b.ok, b.last, row_number() over (order by b.pts desc, b.ok desc, b.last asc) as pos
  from (select u.uid, sum(u.pts)::int as pts, sum(u.ok)::int as ok, max(u.last) as last
        from (select p.uid, count(*) filter (where p.ok_win) + count(*) filter (where p.ok_score) as pts, count(*) filter (where p.ok_win) as ok, max(p.ts) as last
                from public.pk_picks p group by p.uid
              union all
              select sp.uid, count(*) filter (where sp.ok), count(*) filter (where sp.ok), max(sp.ts)
                from public.pk_stage_picks sp group by sp.uid) u
        join public.pk_passes s on s.uid = u.uid
        group by u.uid) b
$$;

-- счёт команды на этапе по сыгранным матчам
create or replace function public._pk_rec(p_stage int, p_team text) returns table (w int, l int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where win = p_team)::int, count(*) filter (where win <> p_team)::int
  from public.pk_matches where stage = p_stage and win is not null and (ta = p_team or tb = p_team)
$$;

-- выдать игроку случайный скин из диапазона наград; вернуть название
create or replace function public._pk_give(p_uid uuid, p_lo numeric, p_hi numeric) returns text
language plpgsql security definer set search_path = public as $$
declare d jsonb; sk text;
begin
  select public._norm(data) into d from public.profiles where id = p_uid for update;
  if d is null then return null; end if;
  select n into sk from public.catalog where c = 'skin' and p >= p_lo and p <= p_hi order by random() limit 1;
  if sk is null then raise exception 'pickem no skins'; end if;
  d := public._give(d, sk, 'pickem');
  update public.profiles set data = d, updated_at = now() where id = p_uid;
  return sk;
end $$;

-- ---------- всё для страницы ----------
create or replace function public.pk_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); mine record;
begin
  select * into mine from public._pk_board() b where b.uid = me;
  return jsonb_build_object(
    'now', public._ms(),
    'cfg', (select v from public.site_cfg where k = 'pickem'),
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'st', m.stage, 'sl', m.slot, 'o', m.ord, 'a', m.ta, 'b', m.tb, 'bo', m.bo,
        't', (extract(epoch from m.starts_at) * 1000)::bigint, 'w', m.win, 's', m.score,
        'n', (select count(*) from public.pk_picks p where p.mid = m.id),
        'na', (select count(*) from public.pk_picks p where p.mid = m.id and p.win = m.ta)
      ) order by m.stage, m.slot, m.ord, m.id) from public.pk_matches m), '[]'::jsonb),
    'passes', (select count(*) from public.pk_passes),
    'top', coalesce((select jsonb_agg(jsonb_build_object('pos', b.pos, 'name', pr.name, 'ava', pr.ava, 'pid', pr.pid, 'pts', b.pts, 'ok', b.ok, 'md', s.show) order by b.pos)
        from public._pk_board() b join public.profiles pr on pr.id = b.uid join public.pk_passes s on s.uid = b.uid where b.pos <= 10 and b.pts > 0), '[]'::jsonb),
    'final', (select jsonb_build_object('n', f.n, 'pts', f.pts, 'name', pr.name, 'pid', pr.pid, 'ava', pr.ava) from public.pk_final f left join public.profiles pr on pr.id = f.uid where f.k = 'main'),
    'me', case when me is null then null else jsonb_build_object(
        'pass', exists (select 1 from public.pk_passes where uid = me),
        'show', coalesce((select show from public.pk_passes where uid = me), false),
        'pts', coalesce(mine.pts, 0), 'ok', coalesce(mine.ok, 0), 'pos', mine.pos,
        'picks', coalesce((select jsonb_agg(jsonb_build_object('m', mid, 'w', win, 's', score, 'ow', ok_win, 'os', ok_score, 'pz', prize)) from public.pk_picks where uid = me), '[]'::jsonb),
        'sp', coalesce((select jsonb_agg(jsonb_build_object('st', stage, 't', team, 'b', box, 'ok', ok, 'pz', prize)) from public.pk_stage_picks where uid = me), '[]'::jsonb)
      ) end);
end $$;

-- ---------- купить пропуск ----------
create or replace function public.pk_buy() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d jsonb; cfg jsonb; price numeric;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select v into cfg from public.site_cfg where k = 'pickem';
  if coalesce((cfg->>'off')::boolean, false) or exists (select 1 from public.pk_final where k = 'main') then raise exception 'pickem closed'; end if;
  price := coalesce((cfg->>'price')::numeric, 499);
  if price < 1 then raise exception 'pickem price'; end if;
  d := public._me(); -- сначала профиль (блокировка), потом проверка: два нажатия подряд не спишут дважды
  if exists (select 1 from public.pk_passes where uid = me) then raise exception 'pickem has pass'; end if;
  if coalesce((d->>'balance')::numeric, 0) < price then raise exception 'pickem balance'; end if;
  d := public._bal(d, -price);
  perform public._save(d);
  insert into public.pk_passes (uid, price) values (me, price);
  return jsonb_build_object('ok', true, 'price', price, 'data', d);
end $$;

-- ---------- прогноз на матч (p_win = null — убрать прогноз) ----------
create or replace function public.pk_pick(p_mid bigint, p_win text, p_score text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.pk_matches;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.pk_passes where uid = me) then raise exception 'pickem no pass'; end if;
  select * into m from public.pk_matches where id = p_mid;
  if not found then raise exception 'pickem match'; end if;
  if m.win is not null or m.starts_at <= now() then raise exception 'pickem locked'; end if;
  if p_win is null then
    delete from public.pk_picks where uid = me and mid = p_mid;
    return jsonb_build_object('m', p_mid, 'w', null);
  end if;
  if p_win not in (m.ta, m.tb) then raise exception 'pickem team'; end if;
  if m.bo = 1 then p_score := '1:0';
  elsif p_score is null or not (p_score = any (public._pk_scores(m.bo))) then raise exception 'pickem score'; end if;
  insert into public.pk_picks (uid, mid, win, score) values (me, p_mid, p_win, p_score)
  on conflict (uid, mid) do update set win = excluded.win, score = excluded.score, ts = now();
  return jsonb_build_object('m', p_mid, 'w', p_win, 's', p_score);
end $$;

-- ---------- расстановка команд этапа: p = {"30": [..2], "3x": [..6], "03": [..2]} (можно не полностью) ----------
create or replace function public.pk_stage_set(p_stage int, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t0 timestamptz; allowed text[]; all_t text[] := '{}'; bx text; lim int; t text; n int := 0;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.pk_passes where uid = me) then raise exception 'pickem no pass'; end if;
  if p_stage not between 1 and 3 then raise exception 'pickem stage'; end if;
  select min(starts_at), array_agg(distinct x) into t0, allowed
    from public.pk_matches m, lateral unnest(array[m.ta, m.tb]) x where m.stage = p_stage;
  if t0 is null then raise exception 'pickem stage closed'; end if;
  -- закрыто с начала первого матча этапа или как только внесён любой результат этапа (если матч начали раньше расписания)
  if t0 <= now() or exists (select 1 from public.pk_matches where stage = p_stage and win is not null) then raise exception 'pickem stage locked'; end if;
  foreach bx in array array['30', '3x', '03'] loop
    lim := case bx when '3x' then 6 else 2 end;
    if jsonb_array_length(coalesce(p->bx, '[]'::jsonb)) > lim then raise exception 'pickem stage count'; end if;
    for t in select jsonb_array_elements_text(coalesce(p->bx, '[]'::jsonb)) loop
      if not (t = any (allowed)) or t = any (all_t) then raise exception 'pickem team'; end if;
      all_t := all_t || t;
    end loop;
  end loop;
  delete from public.pk_stage_picks where uid = me and stage = p_stage;
  foreach bx in array array['30', '3x', '03'] loop
    for t in select jsonb_array_elements_text(coalesce(p->bx, '[]'::jsonb)) loop
      insert into public.pk_stage_picks (uid, stage, team, box) values (me, p_stage, t, bx); n := n + 1;
    end loop;
  end loop;
  return jsonb_build_object('stage', p_stage, 'n', n);
end $$;

-- ---------- билет из кейса MAJOR → пропуск ----------
create or replace function public.pk_activate(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  d := public._me();
  if exists (select 1 from public.pk_passes where uid = me) then raise exception 'pickem has pass'; end if;
  if not exists (select 1 from jsonb_array_elements(d->'inv') e where e->>'id' = p_id and e->>'n' = 'Пропуск PIKEM · Major 2026' and e->>'st' = 'own') then raise exception 'pickem ticket'; end if;
  d := jsonb_set(d, '{inv}', (select jsonb_agg(case when e->>'id' = p_id then e || jsonb_build_object('st', 'used', 'ut', public._ms()) else e end order by i)
                              from jsonb_array_elements(d->'inv') with ordinality t(e, i)));
  perform public._save(d);
  insert into public.pk_passes (uid, price) values (me, 0);
  return jsonb_build_object('ok', true, 'data', d);
end $$;

-- билет не выводится в Steam (такого предмета там нет)
create or replace function public._pk_no_withdraw() returns trigger language plpgsql as $$
begin
  if new.n = 'Пропуск PIKEM · Major 2026' then raise exception 'item unavailable'; end if;
  return new;
end $$;
do $$ begin
  if to_regclass('public.withdrawals') is not null then
    drop trigger if exists pk_no_withdraw on public.withdrawals;
    create trigger pk_no_withdraw before insert on public.withdrawals for each row execute function public._pk_no_withdraw();
  end if;
end $$;

-- ---------- медаль у аватарки: показывать / скрыть ----------
create or replace function public.pk_show(p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.pk_passes set show = coalesce(p_on, false) where uid = auth.uid();
  if not found then raise exception 'pickem no pass'; end if;
  return coalesce(p_on, false);
end $$;

-- у кого показывать медаль (для значка у аватарок по всему сайту)
create or replace function public.pk_medals() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('u', coalesce(jsonb_agg(p.id), '[]'::jsonb), 'p', coalesce(jsonb_agg(p.pid), '[]'::jsonb))
  from public.pk_passes s join public.profiles p on p.id = s.uid where s.show
$$;

-- =====================================================================
-- админка (только владелец: is_admin())
-- =====================================================================

-- добавить / изменить матч: p = { id?, st, sl, o, a, b, bo, t (мс) }
create or replace function public.admin_pk_save(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare r public.pk_matches; nid bigint; t timestamptz := to_timestamp((p->>'t')::numeric / 1000);
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if coalesce(p->>'a', '') = '' or coalesce(p->>'b', '') = '' or p->>'a' = p->>'b' then raise exception 'pickem team'; end if;
  if (p->>'id') is not null then
    select * into r from public.pk_matches where id = (p->>'id')::bigint for update;
    if not found then raise exception 'pickem match'; end if;
    if r.win is not null then raise exception 'pickem done'; end if;
    -- команды менять нельзя, если на матч уже есть прогнозы (иначе прогнозы потеряют смысл)
    if (r.ta <> p->>'a' or r.tb <> p->>'b') and exists (select 1 from public.pk_picks where mid = r.id) then raise exception 'pickem has picks'; end if;
    update public.pk_matches set stage = (p->>'st')::int, slot = p->>'sl', ord = coalesce((p->>'o')::int, 0), ta = p->>'a', tb = p->>'b',
      bo = coalesce((p->>'bo')::int, 1), starts_at = t where id = r.id;
    return r.id;
  end if;
  insert into public.pk_matches (stage, slot, ord, ta, tb, bo, starts_at)
  values ((p->>'st')::int, p->>'sl', coalesce((p->>'o')::int, 0), p->>'a', p->>'b', coalesce((p->>'bo')::int, 1), t)
  returning id into nid;
  return nid;
end $$;

create or replace function public.admin_pk_del(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if exists (select 1 from public.pk_matches where id = p_id and win is not null) then raise exception 'pickem done'; end if;
  delete from public.pk_matches where id = p_id;
end $$;

-- результат матча → проверка прогнозов и выдача скинов (один раз, отменить нельзя);
-- если у команды стало 3 победы или 3 поражения — проверка её расстановки (3:0 / прошли / 0:3) и скины за верную
create or replace function public.admin_pk_result(p_id bigint, p_win text, p_score text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.pk_matches; cfg jsonb; lo numeric; hi numeric; r record; sp record; rc record; ow boolean; os boolean; sok boolean;
        nk int; sk text; pz jsonb; tm text; bx text;
        n_ok int := 0; n_sc int := 0; n_st int := 0; n_sk int := 0; s_sk numeric := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into m from public.pk_matches where id = p_id for update;
  if not found then raise exception 'pickem match'; end if;
  if m.win is not null then raise exception 'pickem done'; end if;
  if p_win not in (m.ta, m.tb) then raise exception 'pickem team'; end if;
  if m.bo = 1 then p_score := '1:0';
  elsif p_score is null or not (p_score = any (public._pk_scores(m.bo))) then raise exception 'pickem score'; end if;
  select v into cfg from public.site_cfg where k = 'pickem';
  lo := coalesce((cfg->'rw'->>0)::numeric, 5); hi := coalesce((cfg->'rw'->>1)::numeric, 10);
  if not exists (select 1 from public.catalog where c = 'skin' and p >= lo and p <= hi) then raise exception 'pickem no skins'; end if;

  update public.pk_matches set win = p_win, score = p_score, done_at = now() where id = p_id;

  -- прогнозы на матч
  for r in select pk.* from public.pk_picks pk join public.pk_passes ps on ps.uid = pk.uid where pk.mid = p_id order by pk.ts loop
    ow := r.win = p_win;
    os := case when m.bo = 1 then null else ow and r.score = p_score end;   -- у Bo1 счёт не угадывают
    nk := ow::int + coalesce(os, false)::int;
    pz := '[]'::jsonb;
    for i in 1..nk loop
      sk := public._pk_give(r.uid, lo, hi);
      if sk is not null then pz := pz || to_jsonb(sk); n_sk := n_sk + 1; s_sk := s_sk + coalesce(public._price(sk), 0); end if;
    end loop;
    if ow then n_ok := n_ok + 1; end if;
    if os then n_sc := n_sc + 1; end if;
    update public.pk_picks set ok_win = ow, ok_score = os, prize = pz where uid = r.uid and mid = p_id;
  end loop;
  -- прогнозы без пропуска (пропуск удалён вручную) — просто отмечаем, без наград
  update public.pk_picks set ok_win = (win = p_win), ok_score = case when m.bo = 1 then null else win = p_win and score = p_score end
   where mid = p_id and ok_win is null;

  -- расстановка команд этапа: итог команды известен (3 победы или 3 поражения)
  if m.stage <= 3 then
    foreach tm in array array[m.ta, m.tb] loop
      select * into rc from public._pk_rec(m.stage, tm);
      if rc.w >= 3 or rc.l >= 3 then
        bx := case when rc.w >= 3 and rc.l = 0 then '30' when rc.w >= 3 then '3x' when rc.w = 0 then '03' else 'out' end;
        for sp in select s.* from public.pk_stage_picks s join public.pk_passes ps on ps.uid = s.uid where s.stage = m.stage and s.team = tm and s.ok is null loop
          sok := sp.box = bx; pz := '[]'::jsonb;
          if sok then
            sk := public._pk_give(sp.uid, lo, hi);
            if sk is not null then pz := to_jsonb(array[sk]); n_sk := n_sk + 1; s_sk := s_sk + coalesce(public._price(sk), 0); end if;
            n_st := n_st + 1;
          end if;
          update public.pk_stage_picks set ok = sok, prize = pz where uid = sp.uid and stage = sp.stage and team = sp.team;
        end loop;
        update public.pk_stage_picks set ok = (box = bx) where stage = m.stage and team = tm and ok is null;
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', n_ok, 'score', n_sc, 'stage', n_st, 'skins', n_sk, 'sum', s_sk);
end $$;

-- главный приз — лидеру таблицы (один раз)
create or replace function public.admin_pk_final() returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; pn text; w record; d jsonb; nm text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if exists (select 1 from public.pk_final where k = 'main') then raise exception 'pickem final done'; end if;
  select v into cfg from public.site_cfg where k = 'pickem';
  pn := cfg->'prize'->>'n';
  if pn is null or public._price(pn) is null then raise exception 'pickem prize'; end if;
  select * into w from public._pk_board() b where b.pos = 1 and b.pts > 0;
  if not found then raise exception 'pickem no winner'; end if;
  select public._norm(data), name into d, nm from public.profiles where id = w.uid for update;
  d := public._give(d, pn, 'pickem');
  update public.profiles set data = d, updated_at = now() where id = w.uid;
  insert into public.pk_final (k, uid, n, pts) values ('main', w.uid, pn, w.pts);
  return jsonb_build_object('uid', w.uid, 'name', nm, 'n', pn, 'pts', w.pts);
end $$;

-- цифры для админки
create or replace function public.admin_pk_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'passes', (select count(*) from public.pk_passes),
    'income', (select coalesce(sum(price), 0) from public.pk_passes),
    'picks', (select count(*) from public.pk_picks),
    'players', (select count(distinct uid) from public.pk_picks),
    'skins', (select coalesce(sum(jsonb_array_length(prize)), 0) from public.pk_picks) + (select coalesce(sum(jsonb_array_length(prize)), 0) from public.pk_stage_picks),
    'spent', (select coalesce(sum(public._price(e)), 0) from public.pk_picks, jsonb_array_elements_text(prize) e) + (select coalesce(sum(public._price(e)), 0) from public.pk_stage_picks, jsonb_array_elements_text(prize) e),
    'stage', (select count(distinct uid) from public.pk_stage_picks),
    'top', coalesce((select jsonb_agg(jsonb_build_object('pos', b.pos, 'name', pr.name, 'pid', pr.pid, 'pts', b.pts, 'ok', b.ok) order by b.pos)
        from public._pk_board() b join public.profiles pr on pr.id = b.uid where b.pos <= 5), '[]'::jsonb));
end $$;

-- ---------- права ----------
revoke all on function public._pk_board(), public._pk_rec(int, text), public._pk_give(uuid, numeric, numeric), public._pk_no_withdraw() from public, anon, authenticated;
revoke all on function public.pk_state(), public.pk_buy(), public.pk_pick(bigint, text, text), public.pk_show(boolean), public.pk_medals(), public.pk_stage_set(int, jsonb), public.pk_activate(text),
  public.admin_pk_save(jsonb), public.admin_pk_del(bigint), public.admin_pk_result(bigint, text, text), public.admin_pk_final(), public.admin_pk_stats() from public, anon;
grant execute on function public.pk_state(), public.pk_medals() to anon, authenticated;
grant execute on function public.pk_buy(), public.pk_pick(bigint, text, text), public.pk_show(boolean), public.pk_stage_set(int, jsonb), public.pk_activate(text),
  public.admin_pk_save(jsonb), public.admin_pk_del(bigint), public.admin_pk_result(bigint, text, text), public.admin_pk_final(), public.admin_pk_stats() to authenticated;

-- ---------- Stage 1, раунд 1 (24.11.2026, время UTC; по Москве +3 ч) — только если матчей ещё нет ----------
insert into public.pk_matches (stage, slot, ord, ta, tb, bo, starts_at)
select v.* from (values
  (1, '0-0', 1, 'heroic', 'imperial', 1, timestamptz '2026-11-24 04:00+00'),
  (1, '0-0', 2, '9z', 'lynn', 1, timestamptz '2026-11-24 04:00+00'),
  (1, '0-0', 3, 'nip', 'm80', 1, timestamptz '2026-11-24 05:00+00'),
  (1, '0-0', 4, '100t', 'chinggis', 1, timestamptz '2026-11-24 05:00+00'),
  (1, '0-0', 5, 'parivision', 'dendele', 1, timestamptz '2026-11-24 06:00+00'),
  (1, '0-0', 6, 'liquid', 'gosh', 1, timestamptz '2026-11-24 06:00+00'),
  (1, '0-0', 7, 'faze', 'wildcard', 1, timestamptz '2026-11-24 07:00+00'),
  (1, '0-0', 8, 'ef', 'flyquest', 1, timestamptz '2026-11-24 07:00+00')
) v(stage, slot, ord, ta, tb, bo, starts_at)
where not exists (select 1 from public.pk_matches);

select 'Пикем готов' as result;

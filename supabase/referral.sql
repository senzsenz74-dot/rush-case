-- ============================================================
-- RUSH CASE — реферальная программа
--   Ссылка игрока: https://rush-case.online/?ref=<его ID (pid)>
--   Друг регистрируется по ссылке → привязка к пригласившему (только новые аккаунты, не старше суток; себя пригласить нельзя)
--   В течение ref_cfg.days дней (30) с привязки: пригласившему ref_cfg.pct (5%) от каждого онлайн-пополнения друга — на баланс;
--   другу — ref_cfg.friend_pct (+10%) к первому пополнению (не суммируется с промокодом — берётся больший бонус).
--   Начисляет pay_credit (supabase/payments.sql) после подтверждения оплаты кассой; ручные начисления админа не считаются.
-- Выполнить в Supabase → SQL Editor до payments.sql.
-- ============================================================
alter table public.profiles add column if not exists ref_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists ref_at timestamptz;
create index if not exists profiles_ref_by on public.profiles (ref_by) where ref_by is not null;

create table if not exists public.ref_cfg (
  id int primary key default 1 check (id = 1),
  pct numeric not null default 5,          -- % пригласившему от пополнений друга
  friend_pct numeric not null default 10,  -- % другу к первому пополнению
  days int not null default 30             -- сколько дней с привязки действует
);
insert into public.ref_cfg (id) values (1) on conflict (id) do nothing;
alter table public.ref_cfg enable row level security;
drop policy if exists "ref_cfg: read" on public.ref_cfg;
create policy "ref_cfg: read" on public.ref_cfg for select using (true);
grant select on public.ref_cfg to anon, authenticated;

-- начисления пригласившим (история)
create table if not exists public.ref_earn (
  id bigserial primary key,
  uid uuid not null references public.profiles (id) on delete cascade,     -- пригласивший
  friend uuid not null references public.profiles (id) on delete cascade,  -- друг
  amount numeric not null,                                                 -- пополнение друга
  reward numeric not null,                                                 -- начислено пригласившему
  ts timestamptz not null default now()
);
create index if not exists ref_earn_uid on public.ref_earn (uid, ts desc);
alter table public.ref_earn enable row level security;
drop policy if exists "ref_earn: own" on public.ref_earn;
create policy "ref_earn: own" on public.ref_earn for select to authenticated using (uid = auth.uid() or public.is_admin());
grant select on public.ref_earn to authenticated;
grant all on public.ref_earn, public.ref_cfg to service_role;
grant usage, select on sequence public.ref_earn_id_seq to service_role;

-- привязка к пригласившему (зовёт сайт после входа, если игрок пришёл по ссылке)
create or replace function public.set_ref(p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; r public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if me.ref_by is not null then return jsonb_build_object('ok', false, 'why', 'already'); end if;
  if me.created_at < now() - interval '1 day' then return jsonb_build_object('ok', false, 'why', 'old'); end if;
  select * into r from public.profiles where pid::text = trim(p_ref);
  if r.id is null then return jsonb_build_object('ok', false, 'why', 'not found'); end if;
  if r.id = me.id or r.ref_by = me.id then return jsonb_build_object('ok', false, 'why', 'self'); end if;
  update public.profiles set ref_by = r.id, ref_at = now() where id = me.id;
  return jsonb_build_object('ok', true, 'name', r.name);
end $$;
revoke all on function public.set_ref(text) from public, anon;
grant execute on function public.set_ref(text) to authenticated;

-- бонус другу к первому пополнению, % (0 — не положен); p_dep — сколько игрок пополнял до этого
create or replace function public._ref_first_bonus(p_uid uuid, p_dep numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select c.friend_pct from public.profiles p, public.ref_cfg c
    where p.id = p_uid and p.ref_by is not null and coalesce(p_dep, 0) = 0 and p.ref_at > now() - make_interval(days => c.days)), 0)
$$;
-- 5% пригласившему от пополнения друга (в течение срока)
create or replace function public._ref_reward(p_uid uuid, p_amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare p public.profiles; c public.ref_cfg; v numeric;
begin
  select * into p from public.profiles where id = p_uid;
  select * into c from public.ref_cfg where id = 1;
  if p.ref_by is null or p.ref_at <= now() - make_interval(days => c.days) then return 0; end if;
  v := round(p_amount * c.pct / 100, 2);
  if v <= 0 then return 0; end if;
  update public.profiles set data = public._bal(public._stat(public._norm(data), 'refEarn', v), v), updated_at = now() where id = p.ref_by;
  insert into public.ref_earn (uid, friend, amount, reward) values (p.ref_by, p_uid, p_amount, v);
  return v;
end $$;
revoke all on function public._ref_first_bonus(uuid, numeric), public._ref_reward(uuid, numeric) from public, anon, authenticated;
grant execute on function public._ref_first_bonus(uuid, numeric), public._ref_reward(uuid, numeric) to service_role;

-- страница бонусов: моя ссылка, друзья, сколько заработано; кто пригласил меня и положен ли бонус
create or replace function public.my_referrals() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me public.profiles; c public.ref_cfg; by_name text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into me from public.profiles where id = auth.uid();
  select * into c from public.ref_cfg where id = 1;
  select name into by_name from public.profiles where id = me.ref_by;
  return jsonb_build_object(
    'pid', me.pid, 'pct', c.pct, 'friend_pct', c.friend_pct, 'days', c.days,
    'by', by_name, 'bonus', public._ref_first_bonus(me.id, (me.data->'stats'->>'dep')::numeric) > 0,
    'earned', coalesce((select sum(reward) from public.ref_earn where uid = me.id), 0),
    'friends', coalesce((select jsonb_agg(jsonb_build_object('pid', f.pid, 'name', f.name, 'ava', f.ava, 'at', f.ref_at,
        'left', greatest(0, ceil(extract(epoch from (f.ref_at + make_interval(days => c.days) - now())) / 86400)),
        'earned', coalesce((select sum(reward) from public.ref_earn e where e.uid = me.id and e.friend = f.id), 0)) order by f.ref_at desc)
      from (select * from public.profiles where ref_by = me.id order by ref_at desc limit 50) f), '[]'::jsonb),
    'count', (select count(*) from public.profiles where ref_by = me.id));
end $$;
revoke all on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

select 'реферальная программа готова' as result;

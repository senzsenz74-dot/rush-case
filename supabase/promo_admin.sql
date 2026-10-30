-- ============================================================
-- RUSH CASE — промокоды из админки: % к пополнению или ₽ на баланс, срок, лимит активаций, персональный (один игрок), вкл/выкл
-- Выполнить в Supabase → SQL Editor после promo_hello25.sql.
-- ============================================================
alter table public.promo_codes add column if not exists max_uses int;          -- null — без лимита
alter table public.promo_codes add column if not exists used int not null default 0;
alter table public.promo_codes add column if not exists only_uid uuid;          -- персональный: только этот игрок
alter table public.promo_codes add column if not exists active boolean not null default true;
alter table public.promo_codes add column if not exists note text;
alter table public.promo_codes add column if not exists created_at timestamptz not null default now();
drop policy if exists "promo_codes: admin read" on public.promo_codes;
create policy "promo_codes: admin read" on public.promo_codes for select to authenticated using (public.is_admin());
grant select on public.promo_codes to authenticated;

-- код действует для игрока?
create or replace function public._promo_ok(pr public.promo_codes, p_uid uuid) returns boolean language sql stable as $$
  select pr.active and (pr.expires_at is null or pr.expires_at > now()) and (pr.max_uses is null or pr.used < pr.max_uses)
     and (pr.only_uid is null or pr.only_uid = p_uid)
$$;
create or replace function public.use_promo(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); pr public.promo_codes;
begin
  select * into pr from public.promo_codes where code = upper(trim(p_code)) for update;
  if pr.code is null or not public._promo_ok(pr, auth.uid()) then raise exception 'promo not found'; end if;
  if d->'promos' ? pr.code then raise exception 'promo used'; end if;
  d := jsonb_set(d, '{promos}', (d->'promos') || to_jsonb(pr.code));
  if pr.t = 'bal' then d := public._bal(d, pr.v); else d := jsonb_set(d, '{depBonus}', to_jsonb(pr.v)); end if;
  update public.promo_codes set used = used + 1 where code = pr.code;
  perform public._save(d);
  return jsonb_build_object('t', pr.t, 'v', pr.v, 'data', d);
end $$;

-- админ: создать / изменить (p: code, t 'dep'|'bal', v, expires_at, max_uses, pid, active, note)
create or replace function public.admin_promo_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text := upper(trim(p->>'code')); u uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if c !~ '^[A-Z0-9_-]{3,24}$' then raise exception 'bad code'; end if;
  if (p->>'t') not in ('dep', 'bal') or coalesce((p->>'v')::numeric, 0) <= 0 then raise exception 'bad value'; end if;
  if (p->>'t') = 'dep' and (p->>'v')::numeric > 200 then raise exception 'bad value'; end if;
  if nullif(p->>'pid', '') is not null then
    select id into u from public.profiles where pid::text = trim(p->>'pid');
    if u is null then raise exception 'player not found'; end if;
  end if;
  insert into public.promo_codes (code, t, v, expires_at, max_uses, only_uid, active, note)
  values (c, p->>'t', (p->>'v')::numeric, nullif(p->>'expires_at', '')::timestamptz, nullif(p->>'max_uses', '')::int, u, coalesce((p->>'active')::boolean, true), nullif(p->>'note', ''))
  on conflict (code) do update set t = excluded.t, v = excluded.v, expires_at = excluded.expires_at, max_uses = excluded.max_uses,
    only_uid = excluded.only_uid, active = excluded.active, note = excluded.note;
  return jsonb_build_object('code', c);
end $$;
create or replace function public.admin_promo_toggle(p_code text, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.promo_codes set active = p_active where code = upper(p_code);
end $$;
revoke all on function public.admin_promo_save(jsonb), public.admin_promo_toggle(text, boolean) from public, anon;
grant execute on function public.admin_promo_save(jsonb), public.admin_promo_toggle(text, boolean) to authenticated;

select 'промокоды из админки готовы' as result;

-- RUSH CASE, владелец 24.11.2026:
--   1) Без бонуса за регистрацию: раньше новый игрок получал +100 ₽ (handle_new_user в schema.sql), теперь баланс 0.
--      Промокоды и подарок по реферальной ссылке остаются.
--   2) Стримеры (активные в ref_partners — «Стример» в реферальной админке) выводят скины без пополнения.
--      Остальные — как раньше: вывод только после пополнения (wd_dep_lock.sql, referral2.sql).

-- 1. стартовый баланс 0
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, data)
  values (new.id,
          left(coalesce(nullif(trim(new.raw_user_meta_data->>'nick'), ''), split_part(new.email, '@', 1)), 16),
          jsonb_build_object('balance', 0))
  on conflict (id) do nothing;
  return new;
end $$;

-- 2. кто выводит без пополнения: владельцы и активные стримеры
create or replace function public._wd_free(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s where s.uid = p_uid and s.role = 'owner')
      or exists (select 1 from public.ref_partners rp where rp.uid = p_uid and rp.active)
$$;

create or replace function public._wd_dep_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public._wd_free(new.uid) then return new; end if;
  if public._wd_dep(new.uid) < public._wd_min() then raise exception 'dep lock'; end if;
  return new;
end $$;

create or replace function public._ref_wd_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public._wd_free(new.uid) then return new; end if;
  if exists (select 1 from public.ref_meta m where m.uid = new.uid and (m.g_bal > 0 or m.g_case is not null))
     and not exists (select 1 from public.payments p where p.uid = new.uid and p.status = 'paid') then
    raise exception 'ref lock';
  end if;
  return new;
end $$;

create or replace function public.wd_gate() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('min', public._wd_min(), 'dep', public._wd_dep(auth.uid()),
    'ok', public._wd_free(auth.uid()) or public._wd_dep(auth.uid()) >= public._wd_min())
$$;

revoke all on function public._wd_free(uuid), public._wd_dep_lock(), public._ref_wd_lock() from public, anon, authenticated;
revoke all on function public.wd_gate() from public, anon;
grant execute on function public.wd_gate() to authenticated;

select 'регистрация без бонуса; стримеры выводят без пополнения' as result;

-- ============================================================
-- RUSH CASE — вывод скинов только после пополнения (владелец 23.11.2026)
--   Правило: пока игрок не пополнил баланс в сумме от site_cfg 'wd'.min_dep (по умолчанию 100 ₽),
--   вывести в Steam нельзя ни один скин — весь инвентарь. Без пополнения у игрока на сайте есть только
--   бонусные деньги (WELCOME, GLHF, ежедневный бонус, подарки), значит любой его скин выигран на бонус.
--   Так мультиаккаунты не забирают приветственный бонус, а новичок видит повод пополнить.
--   Считаются только подтверждённые пополнения: payments.status = 'paid' (деньги — после проверки у кассы,
--   скины — после 7-дневной проверки). Ожидающие, отменённые и возвращённые — не считаются.
--   Владельцы (staff.role = 'owner') — без ограничения.
--   Проверка — триггер на таблицу withdrawals (как «ref lock» в referral2.sql): любой путь вывода упирается в него.
--   wd_gate() — для сайта: сколько пополнено, сколько нужно, открыт ли вывод (окно с замком и «Пополнить»).
-- Сменить сумму: update public.site_cfg set v = v || '{"min_dep": 300}' where k = 'wd';
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- ============================================================

-- сумма, с которой открывается вывод (повторный запуск не сбрасывает уже изменённую сумму)
insert into public.site_cfg (k, v) values ('wd', '{"min_dep": 100}'::jsonb)
  on conflict (k) do update set v = jsonb_build_object('min_dep', 100) || public.site_cfg.v;

create or replace function public._wd_min() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (v->>'min_dep')::numeric from public.site_cfg where k = 'wd'), 100)
$$;

-- сколько игрок пополнил всего (только подтверждённые платежи)
create or replace function public._wd_dep(p_uid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from public.payments where uid = p_uid and status = 'paid'
$$;

-- запрет вывода до пополнения (с 24.11 стримеры без запрета — новая версия в no_reg_bonus.sql)
create or replace function public._wd_dep_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.staff s where s.uid = new.uid and s.role = 'owner') then return new; end if;
  if public._wd_dep(new.uid) < public._wd_min() then raise exception 'dep lock'; end if;
  return new;
end $$;
drop trigger if exists withdrawals_dep_lock on public.withdrawals;
create trigger withdrawals_dep_lock before insert on public.withdrawals for each row execute function public._wd_dep_lock();

-- для сайта: открыт ли вывод у меня
create or replace function public.wd_gate() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('min', public._wd_min(), 'dep', public._wd_dep(auth.uid()),
    'ok', exists (select 1 from public.staff s where s.uid = auth.uid() and s.role = 'owner') or public._wd_dep(auth.uid()) >= public._wd_min())
$$;

revoke all on function public._wd_min(), public._wd_dep(uuid), public._wd_dep_lock() from public, anon, authenticated;
revoke all on function public.wd_gate() from public, anon;
grant execute on function public.wd_gate() to authenticated;

select 'вывод скинов — только после пополнения от ' || public._wd_min() || ' ₽' as result;

-- =====================================================================
-- RUSH CASE — вкладка «Бухгалтерия»: ручные расходы, пополнения маркета, обналичивание (только владелец).
-- Выводы скинов в расходы попадают сами — из таблицы withdrawals (сколько заплачено маркету).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run (после roles.sql). Повторный запуск безопасен.
-- =====================================================================
create table if not exists public.fin_ops (
  id bigserial primary key,
  kind text not null check (kind in ('expense', 'market', 'cashout')), -- расход / пополнение маркета / деньги пришли на карту
  cat text check (cat in ('ads', 'services', 'salary', 'fee', 'other')), -- для расходов: реклама, сервисы, зарплата, комиссия кассы, другое
  amount numeric not null check (amount > 0),
  op_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists fin_ops_date on public.fin_ops (op_date);
alter table public.fin_ops enable row level security;
drop policy if exists "fin_ops: owner read" on public.fin_ops;
create policy "fin_ops: owner read" on public.fin_ops for select to authenticated using (public.is_admin()); -- is_admin() = владелец
grant select on public.fin_ops to authenticated;
grant all on public.fin_ops to service_role;
grant usage, select on sequence public.fin_ops_id_seq to service_role;

create or replace function public.admin_fin_add(p_kind text, p_cat text, p_amount numeric, p_date date, p_note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then raise exception 'bad amount'; end if;
  if p_date is null or p_date > current_date + 1 then raise exception 'bad date'; end if;
  insert into public.fin_ops (kind, cat, amount, op_date, note, created_by)
    values (p_kind, case when p_kind = 'expense' then coalesce(p_cat, 'other') end, round(p_amount, 2), p_date, nullif(left(trim(p_note), 300), ''), auth.uid())
    returning id into i;
  return i;
end $$;

create or replace function public.admin_fin_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.fin_ops where id = p_id;
end $$;

revoke all on function public.admin_fin_add(text, text, numeric, date, text), public.admin_fin_delete(bigint) from public, anon;
grant execute on function public.admin_fin_add(text, text, numeric, date, text), public.admin_fin_delete(bigint) to authenticated;

select 'бухгалтерия готова: записей ' || (select count(*) from public.fin_ops) as result;

-- RUSH CASE — пополнение без кассы: тестовое пополнение выключено. Баланс начисляет только админ (admin_grant).
-- Запуск: SQL Editor → вставить → Run. Когда подключим кассу — пополнение будет делать её вебхук, а не игрок.
revoke execute on function public.deposit_test(numeric, text) from authenticated, anon, public;
create or replace function public.deposit_test(p_amount numeric, p_promo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'payments disabled';
end $$;
revoke execute on function public.deposit_test(numeric, text) from authenticated, anon, public;

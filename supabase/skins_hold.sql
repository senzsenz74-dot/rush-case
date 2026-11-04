-- ============================================================
-- RUSH CASE — защита от отката обмена Steam: пополнение скинами зачисляется только через 7 дней.
-- Обмен подтверждён провайдером → pay_skins ставит платёж в «ожидание» (status 'hold', hold_until = сейчас + 7 дней),
-- баланс не меняется. Раз в 10 минут pay_release (pg_cron) зачисляет созревшие платежи обычным pay_credit
-- (бонусы, промокод, R-COIN, рефералка — как раньше).
-- Если Steam откатил обмен — админ отменяет ожидание: select public.admin_hold_cancel('<id платежа>');
-- Срок: site_cfg 'skins' → "hold" (дней, по умолчанию 7; 0 — зачислять сразу).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run (после payments.sql и skins_pay.sql).
-- ============================================================
alter table public.payments add column if not exists hold_until timestamptz;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check check (status in ('pending', 'hold', 'paid', 'failed', 'refunded'));
create index if not exists payments_hold on public.payments (hold_until) where status = 'hold';
update public.site_cfg set v = v || '{"hold": 7}'::jsonb where k = 'skins' and not (v ? 'hold');

create or replace function public.pay_skins(p_id uuid, p_ext text, p_usd numeric, p_raw jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pay public.payments; rate numeric; rub numeric; days numeric;
begin
  select * into pay from public.payments where id = p_id for update;
  if pay.id is null or pay.method <> 'skins' then raise exception 'payment not found'; end if;
  if pay.status in ('paid', 'hold', 'refunded') then return jsonb_build_object('ok', true, 'repeat', true); end if;  -- повторное уведомление
  rate := coalesce((select (v->>'rate')::numeric from public.site_cfg where k = 'skins'), 90);
  days := greatest(0, coalesce((select (v->>'hold')::numeric from public.site_cfg where k = 'skins'), 7));
  rub := round(coalesce(p_usd, 0) * rate, 2);
  if rub <= 0 or rub > 1000000 then raise exception 'bad amount'; end if;
  update public.payments set amount = rub where id = p_id;
  if days = 0 then return public.pay_credit(p_id, p_ext, rub, p_raw); end if;
  update public.payments set status = 'hold', ext_id = coalesce(p_ext, ext_id), raw = p_raw, hold_until = now() + make_interval(secs => days * 86400) where id = p_id;
  return jsonb_build_object('ok', true, 'hold', true, 'amount', rub);
end $$;
revoke all on function public.pay_skins(uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.pay_skins(uuid, text, numeric, jsonb) to service_role;

-- зачислить созревшие ожидания (вызывает pg_cron)
create or replace function public.pay_release() returns int
language plpgsql security definer set search_path = public as $$
declare p public.payments; k int := 0;
begin
  for p in select * from public.payments where status = 'hold' and hold_until <= now() order by hold_until limit 200 loop
    perform public.pay_credit(p.id, p.ext_id, p.amount, p.raw); k := k + 1;
  end loop;
  return k;
end $$;
revoke all on function public.pay_release() from public, anon, authenticated;

-- откат обмена: админ отменяет ожидание — баланс не зачислится
create or replace function public.admin_hold_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.payments set status = 'refunded' where id = p_id and status = 'hold';
  if not found then raise exception 'payment not on hold'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_hold_cancel(uuid) from public, anon;
grant execute on function public.admin_hold_cancel(uuid) to authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'skins-release';
select cron.schedule('skins-release', '*/10 * * * *', $cron$ select public.pay_release() $cron$);

select 'Защита от отката обмена (7 дней) — готово' as result;

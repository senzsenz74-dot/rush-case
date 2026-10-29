-- =====================================================================
-- RUSH CASE — приём оплаты через платёжный агрегатор (общая основа под любую кассу).
-- Поток: сайт → функция payment (create) создаёт счёт в payments и ссылку на оплату у кассы →
--        касса присылает уведомление на payment (webhook) → функция проверяет подпись → pay_credit зачисляет баланс.
-- Зачисляет только серверная роль (ключ функции), игрок напрямую не может. Повторное уведомление не зачисляет дважды.
-- Запуск: SQL Editor → вставить → Run. Перед этим — supabase/referral.sql (реферальные начисления).
-- =====================================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null check (amount >= 100 and amount <= 1000000),
  method text not null default 'sbp' check (method in ('sbp', 'card')),
  promo text,
  provider text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  ext_id text,                                   -- номер платежа у кассы
  credited numeric,                              -- сколько зачислено (с бонусом промокода)
  raw jsonb,                                     -- последнее уведомление кассы (для разбора спорных случаев)
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payments_uid on public.payments (uid, created_at desc);
create unique index if not exists payments_ext on public.payments (provider, ext_id) where ext_id is not null;
alter table public.payments enable row level security;
drop policy if exists "payments: read own" on public.payments;
create policy "payments: read own" on public.payments for select to authenticated using (uid = auth.uid() or public.is_admin());
grant select on public.payments to authenticated;
grant select, insert, update on public.payments to service_role;

-- зачисление оплаты: вызывает только функция payment (серверная роль) после проверки подписи кассы
create or replace function public.pay_credit(p_id uuid, p_ext text, p_amount numeric, p_raw jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pay public.payments; d jsonb; bonus numeric := 0; pr record; total numeric;
begin
  select * into pay from public.payments where id = p_id for update;
  if pay.id is null then raise exception 'payment not found'; end if;
  if pay.status = 'paid' then return jsonb_build_object('ok', true, 'repeat', true); end if;  -- повторное уведомление
  if round(p_amount, 2) <> round(pay.amount, 2) then
    update public.payments set raw = p_raw where id = p_id;
    raise exception 'amount mismatch';
  end if;
  select data into d from public.profiles where id = pay.uid for update;
  d := public._norm(d);
  bonus := coalesce((d->>'depBonus')::numeric, 0);
  if pay.promo is not null then
    select * into pr from public.promo_codes where code = upper(pay.promo) and t = 'dep';
    if found and not (d->'promos' ? pr.code) then bonus := greatest(bonus, pr.v); d := jsonb_set(d, '{promos}', (d->'promos') || to_jsonb(pr.code)); end if;
  end if;
  bonus := greatest(bonus, public._ref_first_bonus(pay.uid, (d->'stats'->>'dep')::numeric));  -- пришёл по ссылке друга: бонус к первому пополнению
  total := round(pay.amount * (1 + bonus / 100), 2);
  d := public._bal(jsonb_set(d, '{depBonus}', '0'), total);
  d := jsonb_set(d, '{stats}', coalesce(d->'stats', '{}') || jsonb_build_object('dep', coalesce((d->'stats'->>'dep')::numeric, 0) + pay.amount));
  d := public._rc(d, pay.amount * 0.005, 'Пополнение');
  update public.profiles set data = d, updated_at = now() where id = pay.uid;
  perform public._ref_reward(pay.uid, pay.amount);  -- 5% пригласившему (если срок не вышел)
  update public.payments set status = 'paid', ext_id = coalesce(p_ext, ext_id), credited = total, raw = p_raw, paid_at = now() where id = p_id;
  insert into public.site_events (uid, sid, kind, amount, won, x) values (pay.uid, 'pay-' || left(p_id::text, 8), 'dep', pay.amount, 0, 0);
  return jsonb_build_object('ok', true, 'credited', total);
end $$;
create or replace function public.pay_fail(p_id uuid, p_raw jsonb default null) returns void
language sql security definer set search_path = public as $$
  update public.payments set status = 'failed', raw = p_raw where id = p_id and status = 'pending'
$$;
revoke execute on function public.pay_credit(uuid, text, numeric, jsonb), public.pay_fail(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pay_credit(uuid, text, numeric, jsonb), public.pay_fail(uuid, jsonb) to service_role;

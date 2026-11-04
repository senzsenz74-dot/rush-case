-- ============================================================
-- RUSH CASE — пополнение скинами через SkinsMoney (skinsmoney.gg).
-- Игрок отдаёт скины обменом в Steam на странице SkinsMoney; они присылают уведомление (IPN) с суммой в долларах.
-- Сумма заранее неизвестна: платёж создаётся с суммой-заглушкой, по уведомлению pay_skins записывает рубли
-- (доллары × курс из site_cfg 'skins') и вызывает обычное зачисление pay_credit (бонусы, промокод, R-COIN, рефералка).
-- Курс и минимум: site_cfg 'skins' → {"rate": 90, "min": 1}  (рублей за 1 $, минимальная сумма скинов в $).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run (после payments.sql и dep_rcoin.sql).
-- ============================================================
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('sbp', 'card', 'intl', 'crypto', 'skins'));
-- у скинов сумма становится известна только после обмена — для них разрешаем и меньше 100 ₽
alter table public.payments drop constraint if exists payments_amount_check;
alter table public.payments add constraint payments_amount_check check (amount > 0 and amount <= 1000000 and (method = 'skins' or amount >= 100));

insert into public.site_cfg (k, v) values ('skins', '{"rate": 90, "min": 1}'::jsonb) on conflict (k) do nothing;

create or replace function public.pay_skins(p_id uuid, p_ext text, p_usd numeric, p_raw jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pay public.payments; rate numeric; rub numeric;
begin
  select * into pay from public.payments where id = p_id for update;
  if pay.id is null or pay.method <> 'skins' then raise exception 'payment not found'; end if;
  if pay.status = 'paid' then return jsonb_build_object('ok', true, 'repeat', true); end if;  -- повторное уведомление
  rate := coalesce((select (v->>'rate')::numeric from public.site_cfg where k = 'skins'), 90);
  rub := round(coalesce(p_usd, 0) * rate, 2);
  if rub <= 0 or rub > 1000000 then raise exception 'bad amount'; end if;
  update public.payments set amount = rub where id = p_id;
  return public.pay_credit(p_id, p_ext, rub, p_raw);
end $$;
revoke all on function public.pay_skins(uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.pay_skins(uuid, text, numeric, jsonb) to service_role;

select 'Пополнение скинами — готово' as result;

-- 04.11.2026: функция оплаты (серверная роль) читает курс из site_cfg и ссылку на обмен из profiles — без этих прав брала курс 90 по умолчанию
grant select on public.site_cfg to service_role;
grant select on public.profiles to service_role;

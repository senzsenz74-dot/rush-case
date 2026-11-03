-- 04.11.2026: R-COIN за пополнение — 5% от суммы оплаты (было 0,5%). Запустить в Supabase → SQL Editor.
-- Та же функция pay_credit из payments.sql, изменена одна строка (_rc ... 0.05).
create or replace function public.pay_credit(p_id uuid, p_ext text, p_amount numeric, p_raw jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pay public.payments; d jsonb; bonus numeric := 0; pr public.promo_codes; total numeric;
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
    select * into pr from public.promo_codes where code = upper(pay.promo) and t = 'dep';  -- срок, лимит, персональный — promo_admin.sql
    if found and public._promo_ok(pr, pay.uid) and not (d->'promos' ? pr.code) then bonus := greatest(bonus, pr.v); d := jsonb_set(d, '{promos}', (d->'promos') || to_jsonb(pr.code)); update public.promo_codes set used = used + 1 where code = pr.code; end if;
  end if;
  bonus := greatest(bonus, public._ref_first_bonus(pay.uid, (d->'stats'->>'dep')::numeric));  -- пришёл по ссылке друга: бонус к первому пополнению
  total := round(pay.amount * (1 + bonus / 100), 2);
  d := public._bal(jsonb_set(d, '{depBonus}', '0'), total);
  d := jsonb_set(d, '{stats}', coalesce(d->'stats', '{}') || jsonb_build_object('dep', coalesce((d->'stats'->>'dep')::numeric, 0) + pay.amount));
  d := public._rc(d, pay.amount * 0.05, 'Пополнение');
  update public.profiles set data = d, updated_at = now() where id = pay.uid;
  perform public._ref_reward(pay.uid, pay.amount);  -- 5% пригласившему (если срок не вышел)
  update public.payments set status = 'paid', ext_id = coalesce(p_ext, ext_id), credited = total, raw = p_raw, paid_at = now() where id = p_id;
  insert into public.site_events (uid, sid, kind, amount, won, x) values (pay.uid, 'pay-' || left(p_id::text, 8), 'dep', pay.amount, 0, 0);
  return jsonb_build_object('ok', true, 'credited', total);
end $$;

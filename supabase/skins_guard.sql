-- ============================================================
-- RUSH CASE — баланс только за деньги, которые точно пришли (дополнение к skins_hold.sql).
-- 1) Конец 7-дневного ожидания скинов теперь проверяет функция payment (?action=release): спрашивает провайдера,
--    что обмен не откатили, и только тогда зачисляет. Не подтвердил — ждём дальше; откатили — платёж «не прошёл».
-- 2) Отказ / откат, пришедший во время ожидания, отменяет ожидание (pay_fail понимает status 'hold').
-- 3) Зачисленный платёж pay_fail больше не трогает (как и раньше).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run (после skins_hold.sql). Функцию payment выложить (Deploy).
-- ============================================================
create or replace function public.pay_fail(p_id uuid, p_raw jsonb default null) returns void
language sql security definer set search_path = public as $$
  update public.payments set status = 'failed', raw = coalesce(p_raw, raw) where id = p_id and status in ('pending', 'hold')
$$;
revoke execute on function public.pay_fail(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pay_fail(uuid, jsonb) to service_role;

-- зачисление скинов после ожидания — только через функцию payment (с перепроверкой у провайдера)
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'skins-release';
select cron.schedule('skins-release', '*/10 * * * *', $cron$
  select net.http_post(url := 'https://gkeexoyrxnsarosymdyp.supabase.co/functions/v1/payment?action=release', headers := '{"content-type":"application/json"}'::jsonb, body := '{}'::jsonb)
$cron$);

select 'Перепроверка скинов перед зачислением — готово' as result;

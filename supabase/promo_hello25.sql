-- ============================================================
-- RUSH CASE — промокоды со сроком действия + HELLO25 (+25% к пополнению, до конца 3 ноября по Москве)
--   expires_at — до какого момента код работает (null — бессрочный). После срока: «Промокод не найден».
-- Выполнить в Supabase → SQL Editor.
-- ============================================================
alter table public.promo_codes add column if not exists expires_at timestamptz;
insert into public.promo_codes (code, t, v, expires_at) values ('HELLO25', 'dep', 25, '2026-11-04 00:00:00+03')
  on conflict (code) do update set t = excluded.t, v = excluded.v, expires_at = excluded.expires_at;

-- активация промокода (бонус на баланс или к пополнению) — с учётом срока
create or replace function public.use_promo(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); pr record;
begin
  select * into pr from public.promo_codes where code = upper(trim(p_code)) and (expires_at is null or expires_at > now());
  if not found then raise exception 'promo not found'; end if;
  if d->'promos' ? pr.code then raise exception 'promo used'; end if;
  d := jsonb_set(d, '{promos}', (d->'promos') || to_jsonb(pr.code));
  if pr.t = 'bal' then d := public._bal(d, pr.v); else d := jsonb_set(d, '{depBonus}', to_jsonb(pr.v)); end if;
  perform public._save(d);
  return jsonb_build_object('t', pr.t, 'v', pr.v, 'data', d);
end $$;

select 'HELLO25 действует до 03.11 включительно' as result;

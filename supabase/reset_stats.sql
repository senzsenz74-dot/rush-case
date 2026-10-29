-- ============================================================
-- RUSH CASE — обнуление статистики перед тестом (30.10.2026)
--   Аккаунты остаются: вход, ник, ID, Steam, аватар, админка, трейд-ссылка, свои множители апгрейда.
--   У всех игроков (и админов): баланс и R-COIN → 0, инвентарь, история, статистика профиля, бонусы (ежедневный, промокоды, соцсети) — с нуля, удача → ×1, реферальная привязка снята.
--   Стирается: статистика админки (site_events), начисления админа (balance_grants), лента дропов (live_drops → и топ игроков),
--   раунды и ставки (jp_*), рефералы (ref_earn), заявки на вывод (withdrawals), платежи (payments, если есть).
--   Остаются: кейсы, каталог, настройки сайта и маркета, промокоды, команды и турниры.
-- ПЕРЕД удалением всё копируется в схему backup_1030 — вернуть можно оттуда; когда не нужно — drop schema backup_1030 cascade.
-- Выполнить в Supabase → SQL Editor ОДИН раз.
-- ============================================================
create schema if not exists backup_1030;
do $$
declare t text;
begin
  foreach t in array array['profiles', 'site_events', 'balance_grants', 'live_drops', 'jp_rounds', 'jp_bets', 'jp_payouts', 'ref_earn', 'withdrawals', 'payments'] loop
    if to_regclass('public.' || t) is not null and to_regclass('backup_1030.' || t) is null then
      execute format('create table backup_1030.%I as table public.%I', t, t);
    end if;
  end loop;
end $$;

-- профили: всё игровое — с нуля, аккаунт и трейд-ссылка — как были
update public.profiles set
  data = jsonb_build_object('balance', 0, 'rcoin', 0, 'rlog', '[]'::jsonb, 'inv', '[]'::jsonb, 'stats', '{}'::jsonb, 'daily', 0,
                            'promos', '[]'::jsonb, 'depBonus', 0, 'socials', '[]'::jsonb, 'trade', coalesce(data->>'trade', ''))
         || case when data ? 'umults' then jsonb_build_object('umults', data->'umults') else '{}'::jsonb end,
  luck = 1, ref_by = null, ref_at = null, updated_at = now()
where true;

-- общие данные сайта
do $$
declare t text;
begin
  foreach t in array array['jp_payouts', 'jp_bets', 'jp_rounds', 'live_drops', 'site_events', 'balance_grants', 'ref_earn', 'withdrawals', 'payments'] loop
    if to_regclass('public.' || t) is not null then execute format('delete from public.%I where true', t); end if;
  end loop;
end $$;

select (select count(*) from public.profiles) as accounts_kept,
       (select count(*) from public.site_events) as events_left,
       (select count(*) from backup_1030.profiles) as profiles_backed_up;

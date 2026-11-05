-- Админка онлайн (05.11.2026): лента «Сейчас на сайте» получает пополнения и выводы сразу, без перезагрузки.
-- Что делает: добавляет таблицы payments и withdrawals в рассылку изменений Supabase Realtime (publication supabase_realtime).
-- Безопасность: Realtime отдаёт строку только тому, кто может её прочитать по правилам RLS —
--   payments и withdrawals: свой платёж/вывод или is_admin() (владелец). Чужие деньги игроки не увидят.
-- live_drops и support_tickets уже в рассылке (live.sql, support_owner.sql).
-- Запуск: Supabase → SQL Editor → вставить → Run (можно запускать повторно).

do $$ begin
  begin alter publication supabase_realtime add table public.payments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.withdrawals; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.live_drops; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.support_tickets; exception when duplicate_object then null; end;
end $$;

-- проверка: должно показать все четыре таблицы
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename in ('payments', 'withdrawals', 'live_drops', 'support_tickets')
order by 1;

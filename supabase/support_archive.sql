-- ============================================================
-- RUSH CASE — поддержка: закрытое обращение — только просмотр (архив)
--   Пока у диалога нет открытого обращения, админы не могут туда писать (и с сайта, и через бота).
--   Клиент пишет снова — открывается новое обращение, диалог возвращается в активные.
-- Выполнить в Supabase → SQL Editor после support_owner.sql.
-- ============================================================
create or replace function public._support_must_own(p_thread bigint, p_admin uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r jsonb := public._support_claim(p_thread, p_admin);
begin
  if r->>'ticket' is null then raise exception 'ticket closed'; end if;
  if not (r->>'mine')::boolean then raise exception 'chat owned by %', r->>'owner_name'; end if;
end $$;
revoke all on function public._support_must_own(bigint, uuid) from public, anon, authenticated;
grant execute on function public._support_must_own(bigint, uuid) to service_role;

select 'закрытые обращения — только просмотр' as result;

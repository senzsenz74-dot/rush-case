-- ============================================================
-- RUSH CASE — поддержка: обращение закреплено за админом
--   Админ открыл диалог с открытым обращением, у которого ещё нет ответственного, — обращение закрепляется за ним.
--   Отвечать и закрывать может только ответственный. Он может передать обращение другому админу.
--   Если клиент ждёт ответа больше 15 минут (последнее сообщение — от клиента), любой админ может забрать обращение себе.
--   Закрытое обращение ни за кем не закреплено: следующее закрепится за тем, кто откроет.
-- Выполнить в Supabase → SQL Editor после support_tickets.sql.
-- ============================================================
alter table public.support_tickets add column if not exists owner uuid;
alter table public.support_tickets add column if not exists owner_name text;
alter table public.support_tickets add column if not exists taken_at timestamptz;
do $$ begin
  begin alter publication supabase_realtime add table public.support_tickets; exception when duplicate_object then null; end;
end $$;

-- клиент ждёт ответа дольше 15 минут?
create or replace function public._support_waiting(p_thread bigint) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not from_admin and created_at < now() - interval '15 minutes' from public.support_msgs
                   where thread = p_thread and coalesce(kind, '') not in ('rated') order by id desc limit 1), false)
$$;
-- закрепить / проверить: p_force — забрать у другого (только если клиент ждёт > 15 мин)
create or replace function public._support_claim(p_thread bigint, p_admin uuid, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k public.support_tickets; nm text;
begin
  select * into k from public.support_tickets where thread = p_thread and closed_at is null order by id desc limit 1 for update;
  if k.id is null then return jsonb_build_object('ticket', null); end if;            -- открытого обращения нет — отвечать может любой
  select name into nm from public.profiles where id = p_admin;
  if k.owner is null or k.owner = p_admin or (p_force and public._support_waiting(p_thread)) then
    if k.owner is distinct from p_admin then update public.support_tickets set owner = p_admin, owner_name = nm, taken_at = now() where id = k.id; end if;
    return jsonb_build_object('ticket', k.id, 'owner', p_admin, 'owner_name', nm, 'mine', true);
  end if;
  if p_force then raise exception 'not waiting'; end if;
  return jsonb_build_object('ticket', k.id, 'owner', k.owner, 'owner_name', k.owner_name, 'mine', false, 'can_take', public._support_waiting(p_thread));
end $$;
revoke all on function public._support_waiting(bigint), public._support_claim(bigint, uuid, boolean) from public, anon, authenticated;
grant execute on function public._support_waiting(bigint), public._support_claim(bigint, uuid, boolean) to service_role;
-- проверка перед ответом/закрытием: чужое обращение — ошибка
create or replace function public._support_must_own(p_thread bigint, p_admin uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r jsonb := public._support_claim(p_thread, p_admin);
begin
  if r->>'ticket' is not null and not (r->>'mine')::boolean then raise exception 'chat owned by %', r->>'owner_name'; end if;
end $$;
revoke all on function public._support_must_own(bigint, uuid) from public, anon, authenticated;
grant execute on function public._support_must_own(bigint, uuid) to service_role;

-- админ открыл диалог: закрепить за собой, если свободно (p_force — забрать у пропавшего)
create or replace function public.admin_support_take(p_thread bigint, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return public._support_claim(p_thread, auth.uid(), p_force);
end $$;
-- передать обращение другому админу (только ответственный)
create or replace function public.admin_support_pass(p_thread bigint, p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k public.support_tickets; nm text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into k from public.support_tickets where thread = p_thread and closed_at is null order by id desc limit 1 for update;
  if k.id is null then raise exception 'no open ticket'; end if;
  if k.owner is not null and k.owner <> auth.uid() then raise exception 'chat owned by %', k.owner_name; end if;
  select name into nm from public.profiles where id = p_to and is_admin;
  if nm is null then raise exception 'not admin'; end if;
  update public.support_tickets set owner = p_to, owner_name = nm, taken_at = now() where id = k.id;
  return jsonb_build_object('ticket', k.id, 'owner', p_to, 'owner_name', nm);
end $$;
revoke all on function public.admin_support_take(bigint, boolean), public.admin_support_pass(bigint, uuid) from public, anon;
grant execute on function public.admin_support_take(bigint, boolean), public.admin_support_pass(bigint, uuid) to authenticated;

-- ответ и закрытие — только ответственный (свободное обращение закрепляется за ответившим)
create or replace function public.admin_support_reply(p_thread bigint, p_text text) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.support_threads; nm text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into t from public.support_threads where id = p_thread;
  if t.id is null then raise exception 'not found'; end if;
  if t.tg_chat is not null and t.uid is null then raise exception 'use bot'; end if;
  perform public._support_must_own(p_thread, auth.uid());
  select name into nm from public.profiles where id = auth.uid();
  return jsonb_build_object('id', public._support_add(p_thread, p_text, 'admin', nm));
end $$;
create or replace function public._support_close(p_thread bigint, p_admin uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k public.support_tickets; nm text;
begin
  perform public._support_must_own(p_thread, p_admin);
  select name into nm from public.profiles where id = p_admin;
  select * into k from public.support_tickets where thread = p_thread and closed_at is null order by id desc limit 1;
  if k.id is null then raise exception 'no open ticket'; end if;
  update public.support_tickets set closed_at = now(), closed_by = p_admin, closed_by_name = nm where id = k.id;
  perform public._support_add(p_thread, 'Обращение закрыто. Пожалуйста, оцените качество помощи — это займёт секунду 🙏', 'admin', nm, 'rate', k.id);
  return jsonb_build_object('ticket', k.id);
end $$;

select 'обращения закрепляются за админом' as result;

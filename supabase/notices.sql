-- =====================================================================
-- RUSH CASE — уведомления игроку от администрации (владелец 15.11.2026).
-- Админка → «Игроки» → «Уведомление»: заголовок (необязательно) и текст одному игроку.
-- Игрок видит окно поверх всего при заходе на сайт (или в течение 30 с, если уже на сайте)
-- с подписью «С уважением, команда RUSH CASE»; закрыть можно только кнопкой «Принять».
-- Писать могут владельцы и сотрудники с вкладкой «Игроки» (has_perm('players'), supabase/roles.sql).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.player_notices (
  id bigserial primary key,
  uid uuid not null references public.profiles(id) on delete cascade, -- кому
  title text,
  body text not null,
  by_uid uuid,                                  -- кто написал
  created_at timestamptz not null default now(),
  accepted_at timestamptz,                      -- когда игрок нажал «Принять»
  revoked_at timestamptz                        -- отозвано до того, как игрок принял
);
create index if not exists player_notices_wait on public.player_notices (uid) where accepted_at is null and revoked_at is null;
create index if not exists player_notices_uid on public.player_notices (uid, id desc);
alter table public.player_notices enable row level security; -- политик нет: читать и писать — только через функции ниже
grant all on public.player_notices to service_role;
grant usage, select on sequence public.player_notices_id_seq to service_role;

-- ---------- админка ----------
create or replace function public.admin_notice_send(p_uid uuid, p_title text, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare nid bigint;
begin
  if not public.has_perm('players') then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.profiles where id = p_uid) then raise exception 'no player'; end if;
  p_body := btrim(coalesce(p_body, ''));
  if p_body = '' then raise exception 'empty text'; end if;
  if length(p_body) > 2000 then raise exception 'text too long'; end if;
  if (select count(*) from public.player_notices where by_uid = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'too many';
  end if;
  insert into public.player_notices (uid, title, body, by_uid)
    values (p_uid, nullif(left(btrim(coalesce(p_title, '')), 80), ''), p_body, auth.uid())
    returning id into nid;
  return nid;
end $$;

-- последние уведомления игроку: статус «ждёт» / «принял» / «отозвано», кто написал
create or replace function public.admin_notice_list(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('players') then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(x order by x.id desc) from (
      select n.id, n.title, n.body, n.created_at, n.accepted_at, n.revoked_at, p.name as by_name
      from public.player_notices n left join public.profiles p on p.id = n.by_uid
      where n.uid = p_uid order by n.id desc limit 30
    ) x), '[]'::jsonb);
end $$;

-- отозвать, пока игрок не принял
create or replace function public.admin_notice_revoke(p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('players') then raise exception 'forbidden'; end if;
  update public.player_notices set revoked_at = now() where id = p_id and accepted_at is null and revoked_at is null;
  return found;
end $$;

-- ---------- игрок ----------
create or replace function public.my_notices() returns table (id bigint, title text, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, n.title, n.body, n.created_at from public.player_notices n
  where n.uid = auth.uid() and n.accepted_at is null and n.revoked_at is null
  order by n.id limit 10
$$;

create or replace function public.notice_accept(p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.player_notices set accepted_at = now() where id = p_id and uid = auth.uid() and accepted_at is null;
  return found;
end $$;

revoke all on function public.admin_notice_send(uuid, text, text), public.admin_notice_list(uuid), public.admin_notice_revoke(bigint),
  public.my_notices(), public.notice_accept(bigint) from public, anon;
grant execute on function public.admin_notice_send(uuid, text, text), public.admin_notice_list(uuid), public.admin_notice_revoke(bigint),
  public.my_notices(), public.notice_accept(bigint) to authenticated;

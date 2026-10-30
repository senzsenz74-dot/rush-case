-- ============================================================
-- RUSH CASE — чат поддержки: сайт (вошедшие игроки) + Telegram-бот → один чат в админке
--   support_threads — диалог (игрок сайта по uid или собеседник в Telegram по tg_chat)
--   support_msgs    — сообщения; ответы админа в Telegram отправляет функция support-bot
--   Мгновенно: таблицы в supabase_realtime — админка и чат игрока получают новые сообщения сразу.
-- Выполнить в Supabase → SQL Editor.
-- ============================================================
create table if not exists public.support_threads (
  id bigserial primary key,
  uid uuid unique references public.profiles (id) on delete cascade,  -- игрок сайта
  tg_chat bigint unique,                                             -- чат с ботом в Telegram
  tg_name text, tg_user text,                                        -- имя и @ник в Telegram
  last_text text, last_at timestamptz not null default now(),
  unread_admin int not null default 0,                               -- не прочитано админами
  unread_user int not null default 0,                                -- не прочитано игроком (сайт)
  created_at timestamptz not null default now(),
  check (uid is not null or tg_chat is not null)
);
create index if not exists support_threads_last on public.support_threads (last_at desc);
create table if not exists public.support_msgs (
  id bigserial primary key,
  thread bigint not null references public.support_threads (id) on delete cascade,
  from_admin boolean not null default false,
  admin_name text,
  src text not null default 'site' check (src in ('site', 'tg', 'admin')),
  text text not null check (length(text) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists support_msgs_thread on public.support_msgs (thread, id);

alter table public.support_threads enable row level security;
alter table public.support_msgs enable row level security;
drop policy if exists "support_threads: read" on public.support_threads;
create policy "support_threads: read" on public.support_threads for select to authenticated using (uid = auth.uid() or public.is_admin());
drop policy if exists "support_msgs: read" on public.support_msgs;
create policy "support_msgs: read" on public.support_msgs for select to authenticated
  using (public.is_admin() or exists (select 1 from public.support_threads t where t.id = thread and t.uid = auth.uid()));
grant select on public.support_threads, public.support_msgs to authenticated;
grant all on public.support_threads, public.support_msgs to service_role;
grant usage, select on sequence public.support_threads_id_seq, public.support_msgs_id_seq to service_role;
do $$ begin
  begin alter publication supabase_realtime add table public.support_msgs; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.support_threads; exception when duplicate_object then null; end;
end $$;

-- новое сообщение в диалог (общая часть для сайта, бота и админа)
create or replace function public._support_add(p_thread bigint, p_text text, p_src text, p_admin text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare mid bigint; t text := left(trim(p_text), 4000);
begin
  if t = '' then raise exception 'empty'; end if;
  insert into public.support_msgs (thread, from_admin, admin_name, src, text) values (p_thread, p_src = 'admin', p_admin, p_src, t) returning id into mid;
  update public.support_threads set last_text = left(t, 140), last_at = now(),
    unread_admin = case when p_src = 'admin' then 0 else unread_admin + 1 end,
    unread_user = case when p_src = 'admin' then unread_user + 1 else 0 end
  where id = p_thread;
  return mid;
end $$;
revoke all on function public._support_add(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public._support_add(bigint, text, text, text) to service_role;

-- игрок сайта пишет в поддержку (не больше 20 сообщений за 10 минут)
create or replace function public.support_send(p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare th bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if length(trim(coalesce(p_text, ''))) = 0 then raise exception 'empty'; end if;
  insert into public.support_threads (uid) values (auth.uid()) on conflict (uid) do nothing;
  select id into th from public.support_threads where uid = auth.uid();
  if (select count(*) from public.support_msgs where thread = th and not from_admin and created_at > now() - interval '10 minutes') >= 20 then raise exception 'too many messages'; end if;
  perform public._support_add(th, p_text, 'site');
  return jsonb_build_object('thread', th);
end $$;
-- игрок прочитал ответы
create or replace function public.support_seen() returns void language sql security definer set search_path = public as $$
  update public.support_threads set unread_user = 0 where uid = auth.uid() and unread_user > 0
$$;
-- админ прочитал диалог
create or replace function public.admin_support_seen(p_thread bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.support_threads set unread_admin = 0 where id = p_thread;
end $$;
-- ответ админа игроку сайта (в Telegram отвечает функция support-bot — ей нужен токен бота)
create or replace function public.admin_support_reply(p_thread bigint, p_text text) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.support_threads; nm text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into t from public.support_threads where id = p_thread;
  if t.id is null then raise exception 'not found'; end if;
  if t.tg_chat is not null and t.uid is null then raise exception 'use bot'; end if;
  select name into nm from public.profiles where id = auth.uid();
  return jsonb_build_object('id', public._support_add(p_thread, p_text, 'admin', nm));
end $$;
revoke all on function public.support_send(text), public.support_seen(), public.admin_support_seen(bigint), public.admin_support_reply(bigint, text) from public, anon;
grant execute on function public.support_send(text), public.support_seen(), public.admin_support_seen(bigint), public.admin_support_reply(bigint, text) to authenticated;

select 'чат поддержки готов' as result;

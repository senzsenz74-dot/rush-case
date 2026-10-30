-- ============================================================
-- RUSH CASE — обращения в поддержку: открыто / закрыто, оценка клиента 1–5, статистика (в т.ч. по админам)
--   Обращение открывается само, когда клиент пишет, а открытого обращения нет.
--   Админ нажимает «Обращение закрыто» → клиенту приходит просьба оценить помощь (на сайте — звёзды в чате, в Telegram — кнопки).
--   Оценка ниже 4 — просим коротко написать, что не так; следующее сообщение клиента (в течение 30 минут) — комментарий к оценке, а не новое обращение.
-- Выполнить в Supabase → SQL Editor после support.sql.
-- ============================================================
create table if not exists public.support_tickets (
  id bigserial primary key,
  thread bigint not null references public.support_threads (id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz, closed_by uuid, closed_by_name text,
  rating int check (rating between 1 and 5), rated_at timestamptz, comment text
);
create index if not exists support_tickets_thread on public.support_tickets (thread, id desc);
create index if not exists support_tickets_open on public.support_tickets (thread) where closed_at is null;
alter table public.support_tickets enable row level security;
drop policy if exists "support_tickets: read" on public.support_tickets;
create policy "support_tickets: read" on public.support_tickets for select to authenticated
  using (public.is_admin() or exists (select 1 from public.support_threads t where t.id = thread and t.uid = auth.uid()));
grant select on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;
grant usage, select on sequence public.support_tickets_id_seq to service_role;
-- сообщение-событие: kind = 'rate' (просьба оценить, ticket — какое обращение), 'rated' (оценка клиента)
alter table public.support_msgs add column if not exists kind text;
alter table public.support_msgs add column if not exists ticket bigint;

-- уже начатые диалоги без обращения — открытое обращение с момента первого сообщения
insert into public.support_tickets (thread, opened_at)
select t.id, coalesce((select min(created_at) from public.support_msgs m where m.thread = t.id), t.created_at)
from public.support_threads t where not exists (select 1 from public.support_tickets k where k.thread = t.id);

-- новое сообщение: + обращение (если клиент пишет, а открытого нет)
drop function if exists public._support_add(bigint, text, text, text);
create or replace function public._support_add(p_thread bigint, p_text text, p_src text, p_admin text default null, p_kind text default null, p_ticket bigint default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare mid bigint; t text := left(trim(p_text), 4000); last public.support_tickets;
begin
  if t = '' then raise exception 'empty'; end if;
  if p_src <> 'admin' and p_kind is null then
    select * into last from public.support_tickets where thread = p_thread order by id desc limit 1;
    if last.id is null or last.closed_at is not null then
      if last.id is not null and last.rating < 4 and last.comment is null and last.rated_at > now() - interval '30 minutes' then
        update public.support_tickets set comment = t where id = last.id;   -- комментарий к низкой оценке
      else
        insert into public.support_tickets (thread) values (p_thread);
      end if;
    end if;
  end if;
  insert into public.support_msgs (thread, from_admin, admin_name, src, text, kind, ticket) values (p_thread, p_src = 'admin', p_admin, p_src, t, p_kind, p_ticket) returning id into mid;
  update public.support_threads set last_text = left(t, 140), last_at = now(),
    unread_admin = case when p_src = 'admin' then 0 when p_kind is not null then unread_admin else unread_admin + 1 end,
    unread_user = case when p_src = 'admin' then unread_user + 1 else 0 end
  where id = p_thread;
  return mid;
end $$;
revoke all on function public._support_add(bigint, text, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public._support_add(bigint, text, text, text, text, bigint) to service_role;

-- закрыть обращение (админ): возвращает обращение — функция бота шлёт в Telegram кнопки оценки
create or replace function public._support_close(p_thread bigint, p_admin uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k public.support_tickets; nm text;
begin
  select name into nm from public.profiles where id = p_admin;
  select * into k from public.support_tickets where thread = p_thread and closed_at is null order by id desc limit 1;
  if k.id is null then raise exception 'no open ticket'; end if;
  update public.support_tickets set closed_at = now(), closed_by = p_admin, closed_by_name = nm where id = k.id;
  perform public._support_add(p_thread, 'Обращение закрыто. Пожалуйста, оцените качество помощи — это займёт секунду 🙏', 'admin', nm, 'rate', k.id);
  return jsonb_build_object('ticket', k.id);
end $$;
revoke all on function public._support_close(bigint, uuid) from public, anon, authenticated;
grant execute on function public._support_close(bigint, uuid) to service_role;
create or replace function public.admin_support_close(p_thread bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return public._support_close(p_thread, auth.uid());
end $$;
revoke all on function public.admin_support_close(bigint) from public, anon;
grant execute on function public.admin_support_close(bigint) to authenticated;

-- оценка (общая часть): один раз на обращение
create or replace function public._support_rate(p_ticket bigint, p_stars int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k public.support_tickets;
begin
  if p_stars not between 1 and 5 then raise exception 'bad rating'; end if;
  select * into k from public.support_tickets where id = p_ticket for update;
  if k.id is null or k.closed_at is null then raise exception 'not closed'; end if;
  if k.rating is not null then return jsonb_build_object('ok', false, 'rating', k.rating); end if;
  update public.support_tickets set rating = p_stars, rated_at = now() where id = k.id;
  perform public._support_add(k.thread, 'Оценка: ' || repeat('★', p_stars) || repeat('☆', 5 - p_stars),
    case when exists (select 1 from public.support_threads where id = k.thread and uid is null) then 'tg' else 'site' end, null, 'rated', k.id);
  if p_stars < 4 then perform public._support_add(k.thread, 'Спасибо за честную оценку. Напишите, пожалуйста, коротко — что можно было сделать лучше?', 'admin', 'Поддержка', 'ask', k.id); end if;
  return jsonb_build_object('ok', true, 'rating', p_stars, 'thread', k.thread);
end $$;
revoke all on function public._support_rate(bigint, int) from public, anon, authenticated;
grant execute on function public._support_rate(bigint, int) to service_role;
-- оценка с сайта (игрок — только своё обращение)
create or replace function public.support_rate(p_ticket bigint, p_stars int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.support_tickets k join public.support_threads t on t.id = k.thread where k.id = p_ticket and t.uid = auth.uid()) then raise exception 'forbidden'; end if;
  return public._support_rate(p_ticket, p_stars);
end $$;
revoke all on function public.support_rate(bigint, int) from public, anon;
grant execute on function public.support_rate(bigint, int) to authenticated;

-- статистика обращений за период: всего, закрыто, открыто сейчас, оценки; по админам
create or replace function public.admin_support_stats(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'opened', (select count(*) from public.support_tickets where opened_at >= p_from and opened_at < p_to),
    'closed', (select count(*) from public.support_tickets where closed_at >= p_from and closed_at < p_to),
    'open_now', (select count(*) from public.support_tickets where closed_at is null),
    'rated', (select count(*) from public.support_tickets where rated_at >= p_from and rated_at < p_to),
    'avg', (select round(avg(rating), 2) from public.support_tickets where rated_at >= p_from and rated_at < p_to),
    'stars', (select coalesce(jsonb_object_agg(rating, n), '{}'::jsonb) from (select rating, count(*) n from public.support_tickets where rated_at >= p_from and rated_at < p_to group by rating) s),
    'admins', coalesce((select jsonb_agg(to_jsonb(a) order by a.closed desc) from (
      select coalesce(closed_by_name, '—') as name, count(*) as closed, count(rating) as rated, round(avg(rating), 2) as avg,
             count(*) filter (where rating <= 3) as low
      from public.support_tickets where closed_at >= p_from and closed_at < p_to group by coalesce(closed_by_name, '—')) a), '[]'::jsonb),
    'low', coalesce((select jsonb_agg(to_jsonb(l) order by l.rated_at desc) from (
      select k.id, k.thread, k.rating, k.comment, k.rated_at, k.closed_by_name, coalesce(p.name, t.tg_name) as client
      from public.support_tickets k join public.support_threads t on t.id = k.thread left join public.profiles p on p.id = t.uid
      where k.rated_at >= p_from and k.rated_at < p_to and k.rating <= 3 order by k.rated_at desc limit 20) l), '[]'::jsonb));
end $$;
revoke all on function public.admin_support_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_support_stats(timestamptz, timestamptz) to authenticated;

select 'обращения и оценки готовы' as result;

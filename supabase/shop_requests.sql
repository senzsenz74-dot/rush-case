-- =====================================================================
-- RUSH CASE — этап 2 ролей: правки витрины от сотрудника → заявка → владелец одобряет (Telegram-чат владельцев или админка).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run (после roles.sql). Повторный запуск безопасен.
--
--   Сотрудник с галочкой «Управление витриной» (perm 'shop') ничего не пишет в витрину сам: shop_request() сохраняет заявку
--   (что поменять — ops, как это прочитать человеку — lines). Владелец одобряет: admin_shop_decide() на сайте или кнопкой
--   в Telegram (бот → shop_decide_tg, только из привязанного чата владельцев). Одобрено — ops применяются разом.
--   Чат владельцев: владелец берёт код в админке (admin_owner_chat), пишет в группе «/link@бот КОД» → bot_link_chat.
-- =====================================================================

-- ---------- галочка «Управление витриной» для сотрудника ----------
create or replace function public.admin_staff_save(p_pid bigint, p_perms text[], p_schedule jsonb default '{}', p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid; nm text; ok text[] := array['support', 'out', 'online', 'players', 'shop'];
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select id, name into u, nm from public.profiles where pid = p_pid;
  if u is null then raise exception 'player not found'; end if;
  if exists (select 1 from public.staff where uid = u and role = 'owner') then raise exception 'is owner'; end if;
  if jsonb_typeof(coalesce(p_schedule, '{}'::jsonb)) <> 'object' then raise exception 'bad schedule'; end if;
  insert into public.staff (uid, role, perms, schedule, note, updated_by)
    values (u, 'staff', array(select distinct x from unnest(coalesce(p_perms, '{}')) x where x = any(ok) order by 1), coalesce(p_schedule, '{}'::jsonb), nullif(left(trim(p_note), 200), ''), auth.uid())
  on conflict (uid) do update set perms = excluded.perms, schedule = excluded.schedule, note = excluded.note, updated_at = now(), updated_by = auth.uid();
  update public.profiles set is_admin = true where id = u and not is_admin;
  return jsonb_build_object('ok', true, 'uid', u, 'name', nm);
end $$;

-- сотрудник с галочкой может загружать картинки кейсов (сама картинка на сайте появится только после одобрения заявки)
do $$ begin
  drop policy if exists "case-img: staff upload" on storage.objects;
  create policy "case-img: staff upload" on storage.objects for insert to authenticated with check (bucket_id = 'case-img' and public.has_perm('shop'));
exception when others then raise notice 'картинки: политику хранилища создать не удалось (%), сотрудник сможет вставлять только ссылку на картинку', sqlerrm;
end $$;

-- ---------- настройки бота (не секреты): чат владельцев, код привязки ----------
create table if not exists public.bot_cfg (k text primary key, v text, updated_at timestamptz not null default now());
alter table public.bot_cfg enable row level security; -- политик нет: только функции и бот (service_role)
grant all on public.bot_cfg to service_role;

create or replace function public.admin_owner_chat(p_new_code boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_new_code then
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    insert into public.bot_cfg (k, v) values ('link_code', c || ':' || extract(epoch from now() + interval '30 minutes')::bigint)
      on conflict (k) do update set v = excluded.v, updated_at = now();
  end if;
  return jsonb_build_object('chat', (select v from public.bot_cfg where k = 'owner_chat'), 'title', (select v from public.bot_cfg where k = 'owner_chat_title'),
    'linked_at', (select updated_at from public.bot_cfg where k = 'owner_chat'), 'code', c);
end $$;

create or replace function public.bot_link_chat(p_code text, p_chat bigint, p_title text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select bot_cfg.v into v from public.bot_cfg where k = 'link_code';
  if v is null or split_part(v, ':', 1) <> upper(trim(p_code)) or split_part(v, ':', 2)::bigint < extract(epoch from now()) then return false; end if;
  insert into public.bot_cfg (k, v) values ('owner_chat', p_chat::text), ('owner_chat_title', left(coalesce(p_title, ''), 100))
    on conflict (k) do update set v = excluded.v, updated_at = now();
  delete from public.bot_cfg where k = 'link_code';
  return true;
end $$;

-- ---------- заявки ----------
create table if not exists public.shop_requests (
  id bigserial primary key,
  uid uuid not null,
  name text,
  title text not null,
  lines jsonb not null default '[]',  -- что меняется — по-человечески, для Telegram и админки
  ops jsonb not null,                 -- что записать: [{t:'cfg',k,v} | {t:'case',row} | {t:'case_del',id} | {t:'new',id,on} | {t:'open',id,disabled}]
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'failed')),
  err text,
  decided_name text,
  decided_at timestamptz,
  tg_msg bigint,
  created_at timestamptz not null default now()
);
alter table public.shop_requests enable row level security;
drop policy if exists "shop_requests: own or owner" on public.shop_requests;
create policy "shop_requests: own or owner" on public.shop_requests for select to authenticated using (uid = auth.uid() or public.is_admin());
grant select on public.shop_requests to authenticated;
grant all on public.shop_requests to service_role;
grant usage, select on sequence public.shop_requests_id_seq to service_role;

create or replace function public.shop_request(p_title text, p_lines jsonb, p_ops jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint; o jsonb; nm text;
begin
  if not public.has_perm('shop') then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) = 0 or jsonb_array_length(p_ops) > 300 or length(p_ops::text) > 300000 then raise exception 'bad ops'; end if;
  for o in select value from jsonb_array_elements(p_ops) loop
    if coalesce(o->>'t', '') not in ('cfg', 'case', 'case_del', 'new', 'open') then raise exception 'bad op'; end if;
    if o->>'t' = 'cfg' and not (o->>'k' = 'blocks' or o->>'k' like 'case:%') then raise exception 'bad cfg key'; end if;
  end loop;
  select '#' || pid || ' ' || coalesce(name, '') into nm from public.profiles where id = auth.uid();
  insert into public.shop_requests (uid, name, title, lines, ops)
    values (auth.uid(), nm, left(coalesce(nullif(trim(p_title), ''), 'Витрина'), 120), case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end, p_ops)
    returning id into i;
  return i;
end $$;

-- применить одобренную заявку (всё или ничего)
create or replace function public._shop_apply(p_ops jsonb, p_by uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o jsonb; c jsonb;
begin
  for o in select value from jsonb_array_elements(p_ops) loop
    if o->>'t' = 'cfg' then
      if o->'v' is null or jsonb_typeof(o->'v') = 'null' or o->'v' = '{}'::jsonb then delete from public.site_cfg where k = o->>'k';
      else insert into public.site_cfg (k, v, updated_at) values (o->>'k', o->'v', now()) on conflict (k) do update set v = excluded.v, updated_at = now();
      end if;
    elsif o->>'t' = 'case' then
      c := o->'row';
      insert into public.custom_cases (id, name, price, img, accent, block, is_new, sub, items, updated_at)
        values (c->>'id', c->>'name', (c->>'price')::numeric, c->>'img', coalesce(c->>'accent', '#f5c76b'), coalesce(c->>'block', 'pop'), coalesce((c->>'is_new')::boolean, true), c->>'sub', c->'items', now())
        on conflict (id) do update set name = excluded.name, price = excluded.price, img = excluded.img, accent = excluded.accent, block = excluded.block,
          is_new = excluded.is_new, sub = excluded.sub, items = excluded.items, updated_at = now();
    elsif o->>'t' = 'case_del' then delete from public.custom_cases where id = o->>'id';
    elsif o->>'t' = 'new' then update public.custom_cases set is_new = (o->>'on')::boolean, updated_at = now() where id = o->>'id';
    elsif o->>'t' = 'open' then -- закрыть/открыть кейс; удачу не трогаем
      insert into public.case_settings (id, disabled, luck, updated_at, updated_by) values (o->>'id', (o->>'disabled')::boolean, 1, now(), p_by)
        on conflict (id) do update set disabled = excluded.disabled, updated_at = now(), updated_by = p_by;
    end if;
  end loop;
end $$;

create or replace function public._shop_decide(p_id bigint, p_ok boolean, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.shop_requests; st text; er text;
begin
  select * into r from public.shop_requests where id = p_id for update;
  if r.id is null then raise exception 'not found'; end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'status', r.status, 'by', r.decided_name); end if;
  st := case when p_ok then 'approved' else 'rejected' end;
  if p_ok then
    begin perform public._shop_apply(r.ops, r.uid);
    exception when others then st := 'failed'; er := sqlerrm; end;
  end if;
  update public.shop_requests set status = st, err = er, decided_name = left(p_name, 60), decided_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'status', st, 'err', er, 'by', p_name,
    -- встроенные кейсы (их цены и шансы) попадут на сервер, когда владелец откроет админку
    'sync', exists (select 1 from jsonb_array_elements(r.ops) x where x->>'t' = 'cfg' and x->>'k' like 'case:%'));
end $$;

create or replace function public.admin_shop_decide(p_id bigint, p_ok boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return public._shop_decide(p_id, p_ok, coalesce((select name from public.profiles where id = auth.uid()), 'владелец'));
end $$;

-- кнопка в Telegram: решает только привязанный чат владельцев
create or replace function public.shop_decide_tg(p_id bigint, p_ok boolean, p_chat bigint, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_chat::text is distinct from (select v from public.bot_cfg where k = 'owner_chat') then raise exception 'not owners chat'; end if;
  return public._shop_decide(p_id, p_ok, coalesce(nullif(p_name, ''), 'Telegram'));
end $$;

revoke all on function public.admin_owner_chat(boolean), public.bot_link_chat(text, bigint, text), public.shop_request(text, jsonb, jsonb),
  public._shop_apply(jsonb, uuid), public._shop_decide(bigint, boolean, text), public.admin_shop_decide(bigint, boolean),
  public.shop_decide_tg(bigint, boolean, bigint, text) from public, anon, authenticated;
grant execute on function public.admin_owner_chat(boolean), public.shop_request(text, jsonb, jsonb), public.admin_shop_decide(bigint, boolean) to authenticated;
grant execute on function public.bot_link_chat(text, bigint, text), public.shop_decide_tg(bigint, boolean, bigint, text) to service_role;

select 'заявки витрины готовы; чат владельцев: ' || coalesce((select v from public.bot_cfg where k = 'owner_chat_title'), 'не привязан') as result;

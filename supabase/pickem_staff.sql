-- =====================================================================
-- RUSH CASE — галочка «Пикем» для сотрудников (владелец 23.11.2026).
-- Сотрудник с галочкой «Пикем» (админка → «Сотрудники») видит вкладку «Пикем» и может добавлять / править / удалять матчи
-- и вносить «Итог». Настройки пикема (цена, награда, главный приз — site_cfg 'pickem') и «Выдать главный приз» — только владелец.
-- Запускать ПОСЛЕ staff_perms.sql и pickem.sql. Можно запускать повторно.
-- =====================================================================

-- сохранение сотрудника: к списку окон добавлен 'pickem' (остальное — как в staff_perms.sql)
create or replace function public.admin_staff_save(p_pid bigint, p_perms text[], p_schedule jsonb default '{}', p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid; nm text; ok text[] := array['dash', 'money', 'books', 'online', 'cases', 'bets', 'upg', 'crash', 'build', 'tower', 'out', 'players',
  'support', 'promo', 'ga', 'ref', 'shop', 'news', 'ann', 'tours', 'grant', 'pickem'];
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

-- функции пикема для матчей: «только владелец» → «владелец или сотрудник с галочкой «Пикем»» (admin_pk_final остаётся у владельца)
do $do$
declare r record; def text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('admin_pk_save', 'admin_pk_del', 'admin_pk_result', 'admin_pk_stats') loop
    def := pg_get_functiondef(r.oid);
    if position('has_any_perm' in def) > 0 then continue; end if; -- уже переведена
    execute replace(def, 'public.is_admin()', 'public.has_any_perm(array[''pickem''])');
  end loop;
end $do$;

select 'Галочка «Пикем» для сотрудников готова' as result;

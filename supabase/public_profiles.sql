-- Публичные профили игроков, поиск игроков, разбор дня в админке, время вывода предмета.
-- Запустить в Supabase → SQL Editor.

-- ---------- карточка игрока (видна всем): ник, аватар, ID, дата, Steam, статистика, инвентарь, команда, последние дропы ----------
-- без e-mail, баланса и сумм пополнений; spent отдаётся только для ранга
create or replace function public.player_card(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pr record; d jsonb;
begin
  select id, name, ava, pid, steamid, created_at, data, is_admin into pr from public.profiles
   where (p_id ~ '^\d{1,12}$' and pid = p_id::bigint) or (p_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and id = p_id::uuid);
  if not found then raise exception 'player not found'; end if;
  d := coalesce(pr.data, '{}'::jsonb);
  return jsonb_build_object(
    'id', pr.id, 'pid', pr.pid, 'name', pr.name, 'ava', pr.ava, 'steamid', pr.steamid, 'created_at', pr.created_at, 'admin', pr.is_admin,
    'stats', jsonb_build_object('opened', coalesce((d->'stats'->>'opened')::numeric, 0), 'spent', coalesce((d->'stats'->>'spent')::numeric, 0),
      'upg', coalesce((d->'stats'->>'upg')::numeric, 0), 'upgWin', coalesce((d->'stats'->>'upgWin')::numeric, 0), 'con', coalesce((d->'stats'->>'con')::numeric, 0), 'best', d->'stats'->>'best'),
    'fav', (select key from jsonb_each(coalesce(d->'stats'->'cs', '{}'::jsonb)) order by (value->>'n')::numeric desc limit 1),
    'inv', (select coalesce(jsonb_agg(e->>'n' order by coalesce(public._price(e->>'n'), 0) desc), '[]'::jsonb) from jsonb_array_elements(coalesce(d->'inv', '[]'::jsonb)) e where e->>'st' in ('own', 'bet')),
    'team', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo', t.logo, 'captain', t.captain = pr.id) from public.team_members m join public.teams t on t.id = m.team_id where m.uid = pr.id limit 1),
    'drops', (select coalesce(jsonb_agg(jsonb_build_object('n', z.n, 't', z.t, 'c', z.c, 'x', z.x, 'ts', z.ts) order by z.ts desc), '[]'::jsonb)
              from (select n, t, c, x, ts from public.live_drops where uid = pr.id order by ts desc limit 12) z)
  );
end $$;
revoke all on function public.player_card(text) from public;
grant execute on function public.player_card(text) to anon, authenticated;

-- ---------- поиск игрока по нику или ID ----------
create or replace function public.search_players(p_q text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'pid', pid, 'name', name, 'ava', ava) order by (pid::text = trim(p_q)) desc, length(name)), '[]'::jsonb)
  from (select id, pid, name, ava from public.profiles
        where length(trim(coalesce(p_q, ''))) >= 1 and (pid::text = trim(p_q) or name ilike '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%')
        limit 12) t
$$;
revoke all on function public.search_players(text) from public;
grant execute on function public.search_players(text) to anon, authenticated;

-- ---------- вывод: время заявки на предмете (ot, мс) — для вкладки «Выводы Steam» ----------
create or replace function public.withdraw(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := public._me(); m jsonb;
begin
  if coalesce(d->>'trade', '') = '' then raise exception 'no trade link'; end if;
  m := public._mark(d->'inv', array[p_id], 'out', jsonb_build_object('ot', public._ms()));
  if (m->>'n')::int = 0 then raise exception 'item unavailable'; end if;
  d := jsonb_set(d, '{inv}', m->'inv');
  perform public._ev('out', (m->>'sum')::numeric);
  perform public._save(d);
  return jsonb_build_object('data', d);
end $$;

-- ---------- разбор дня в админке: крупнейшие выигрыши игроков (кейсы и апгрейд) ----------
create or replace function public.admin_day_top(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.net desc) from (
    select e.ts, e.kind, e.c, e.amount, e.won, e.x, e.won - e.amount as net, p.name, p.pid
    from public.site_events e left join public.profiles p on p.id = e.uid
    where e.kind in ('open', 'upg') and e.ts >= p_from and e.ts < p_to and e.won > e.amount
    order by e.won - e.amount desc limit 10) t), '[]'::jsonb);
end $$;
revoke all on function public.admin_day_top(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_day_top(timestamptz, timestamptz) to authenticated;

select 'профили игроков и разбор дня' as result;

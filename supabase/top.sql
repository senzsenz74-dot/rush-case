-- RUSH CASE — топ игроков из реальных дропов (кейсы, апгрейды, контракты из live_drops), цены — по каталогу.
-- Запуск: SQL Editor → вставить → Run. Админы в топ не попадают (их баланс — тестовые начисления).
create index if not exists live_drops_uid on public.live_drops (uid, ts);

create or replace function public.top_players(p_period text default 'week') returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (
    select l.uid, l.n, l.t, coalesce(c.p, 0) as p
    from public.live_drops l left join public.catalog c on c.n = l.n
    where l.ts > case p_period when 'week' then now() - interval '7 days' when 'month' then now() - interval '30 days' else '-infinity'::timestamptz end
  ), agg as (
    select d.uid, sum(d.p) as won, count(*) filter (where d.t = 'case') as opened, (array_agg(d.n order by d.p desc))[1] as best
    from d join public.profiles pr on pr.id = d.uid
    where not pr.is_admin
    group by d.uid having sum(d.p) > 0
  ), r as (
    select agg.*, rank() over (order by won desc) as pos from agg
  )
  select jsonb_build_object(
    'list', coalesce((select jsonb_agg(jsonb_build_object('pos', t.pos, 'name', p.name, 'ava', p.ava, 'pid', p.pid, 'won', round(t.won, 2),
                        'opened', t.opened, 'best', t.best, 'me', t.uid = auth.uid()) order by t.pos)
                      from (select * from r order by pos limit 25) t join public.profiles p on p.id = t.uid), '[]'::jsonb),
    'me', (select jsonb_build_object('pos', pos, 'won', round(won, 2), 'opened', opened) from r where uid = auth.uid()),
    'total', (select count(*) from r)
  )
$$;
revoke execute on function public.top_players(text) from public;
grant execute on function public.top_players(text) to anon, authenticated;

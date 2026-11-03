-- Обучение новичков: какие обучения игрок уже прошёл (upgrade, contracts, crash…)
-- Сайт читает profiles.tut при входе и отмечает пройденное функцией tut_done.
alter table public.profiles add column if not exists tut text[] not null default '{}';

create or replace function public.tut_done(p_key text) returns void
language sql security definer set search_path = public as $$
  update public.profiles set tut = array_append(tut, left(p_key, 24))
  where id = auth.uid() and p_key ~ '^[a-z0-9_-]{1,24}$' and not (left(p_key, 24) = any(tut));
$$;
revoke all on function public.tut_done(text) from public, anon;
grant execute on function public.tut_done(text) to authenticated;

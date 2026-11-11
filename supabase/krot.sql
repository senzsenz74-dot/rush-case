-- ============================================================
-- RUSH CASE — режим «КРОТ» (социальная дедукция за столом), этап 1: игровое ядро на сервере.
-- ТЗ: RUSH_CASE_KROT_Подробная_концепция_и_дизайн.docx (разделы 2, 3, 6.4–6.6, 7.4, 9); план — ПЛАН_КРОТ.md.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- В конце файл сам прогоняет самопроверку (krot_selftest) — в ответе должно быть "ok": true.
--
-- Матч: 4 игрока = 3 Оперативника + 1 Крот. 4 контейнера 01–04 с открытыми признаками (символ / оружие / цвет).
-- Каждый Оперативник получает одну правдивую улику (один признак цели); Крот знает цель и секретное задание.
-- Фазы (секунды по умолчанию, меняются в site_cfg 'krot'):
--   lobby (ждём 4-х; быстрая игра — старт через 20 с, все «Готов» — через 3 с; комната по коду — когда все «Готов»)
--   → brief 12 → talk 75 → vote 15 → [revote 12, только при ничьей] → open 8 → debrief 20 → done.
-- Подсчёт (ТЗ 2.7–2.8): в исход входят только голоса Оперативников, голос Крота сохраняется и раскрывается в разборе.
--   3 голоса: 3:0 / 2:1 — итог; 1:1:1 — доп. голосование между тремя.
--   2 голоса (один не проголосовал): одинаковые — итог; 1:1 — доп. голосование между двумя. Случайный голос не подставляется.
--   0–1 голос — раунд отменяется.
--   Доп. голосование: кто не переголосовал — остаётся его прежний выбор. Снова ничья → команда не выбрала цель → победа Крота
--   (его задание «Разделить мнения» как раз про это).
--   Итог = цель → победа Оперативников, иначе — победа Крота.
-- Связь (ТЗ 2.8): игрок пропал до голосования (brief/talk) → таймер на паузе до 30 с, не вернулся → раунд отменён;
--   пропал после фиксации голоса → голос сохранён, после возвращения менять его нельзя.
-- Честность (ТЗ 9.2): цель, роли и улики выбираются ДО брифинга; сразу публикуется commit = sha256(proof),
--   proof = 'RUSHKROT|<раунд>|1:sym:gun:col;2:…;3:…;4:…|<цель>|<соль>'. Цель и соль открываются во вскрытии —
--   любой может пересчитать sha256 и убедиться, что цель не меняли.
-- Тайна (ТЗ 9.4): таблица krot_rounds закрыта целиком; krot_secrets — только своя строка; чужие роли, улики,
--   задание Крота и голоса отдаёт только krot_state и только в фазе разбора (debrief/done). Цель — с фазы open.
-- Очки — только в быстрой игре (kind 'quick') и только тем, кто искал игру один (krot_players.solo);
--   комнаты по коду и группы с друзьями — без очков (защита от фарма сговором).
-- Группы и подбор как в CS2 (раздел «Группы и подбор матча» ниже): группа на главном → «Играть» → поиск →
--   «Ваша игра готова!» → «Принять» (15 с) → все приняли → брифинг.
--
-- Как пользуется сайт (этап 2):
--   krot_quick() / krot_create(true) / krot_join('КОД') → снимок комнаты (как krot_state); 'rejoin': true — вернули в идущий матч.
--   krot_tick(room) каждые 3 с — «пульс» (иначе игрок считается пропавшим) и ленивый переход фазы по дедлайну.
--   Изменился rev (или пришло событие Realtime по krot_rooms) → krot_state(room, номер_последнего_сообщения).
--   Чат: krot_chat_send(room, text); новые сообщения — Realtime INSERT в krot_chat (видят только участники) или krot_state.
--   Голос: krot_vote(room, box, action_id) — action_id = crypto.randomUUID() на каждое нажатие; повтор отправки — с тем же id.
--   krot_ready(room, true/false), krot_leave(room), krot_report(room, seat, reason, note).
--   Закрытый канал Realtime 'krot:<room_id>' (private: true) — пускает только участников комнаты (голос, поворот головы).
-- ============================================================

-- ---------- таблицы ----------
create table if not exists public.krot_rooms (
  id bigserial primary key,
  code text not null,                       -- код комнаты (6 знаков) — для приглашения друзей
  kind text not null check (kind in ('quick', 'private')),
  owner uuid,                               -- кто создал (переходит к следующему, если ушёл из лобби)
  phase text not null default 'lobby' check (phase in ('lobby', 'brief', 'talk', 'vote', 'revote', 'open', 'debrief', 'done')),
  phase_at timestamptz not null default now(),   -- начало фазы
  phase_deadline timestamptz,                    -- конец фазы (null — ждём игроков); на паузе — срок возвращения
  paused_at timestamptz,                         -- пауза: кто-то пропал до голосования
  pause_left interval,                           -- сколько оставалось фазе в момент паузы
  pause_seat smallint,                           -- чьё место пропало
  round_id bigint,
  rev int not null default 1,                    -- растёт при каждом изменении — сигнал клиенту перечитать снимок
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists krot_rooms_code on public.krot_rooms (code) where phase <> 'done';
create index if not exists krot_rooms_lobby on public.krot_rooms (kind, id) where phase = 'lobby';

create table if not exists public.krot_players (
  room_id bigint not null references public.krot_rooms on delete cascade,
  uid uuid not null references public.profiles (id) on delete cascade,
  seat smallint not null check (seat between 1 and 4),
  name text, ava text, pid bigint,            -- снимок профиля на момент входа
  ready boolean not null default false,
  seen_at timestamptz not null default now(), -- последний «пульс»
  left_at timestamptz,                        -- вышел посреди матча (может вернуться)
  joined_at timestamptz not null default now(),
  primary key (room_id, uid),
  unique (room_id, seat)
);
create index if not exists krot_players_uid on public.krot_players (uid);

create table if not exists public.krot_rounds (
  id bigserial primary key,
  room_id bigint not null references public.krot_rooms on delete cascade,
  kind text not null,                       -- копия вида комнаты: очки только в 'quick'
  pattern text not null,                    -- схема генератора: pair / blank
  boxes jsonb not null,                     -- [{n, sym, gun, col}] — открытые признаки (видят все)
  target smallint not null check (target between 1 and 4),  -- СЕКРЕТ до вскрытия
  salt text not null,                       -- СЕКРЕТ до вскрытия
  commit text not null,                     -- sha256(proof) — виден с брифинга
  task jsonb not null,                      -- задание Крота (СЕКРЕТ до разбора)
  krot_seat smallint not null,              -- СЕКРЕТ до разбора
  candidates smallint[],                    -- доп. голосование: между какими контейнерами
  chosen smallint,                          -- итоговый выбор команды (null — не договорились)
  outcome text check (outcome in ('team', 'krot', 'cancel')),
  reason text,                              -- majority / revote / split / few_votes / disconnect / abandoned
  tally jsonb,                              -- подсчёт голосов и очки — для разбора
  pauses int not null default 0,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists krot_rounds_room on public.krot_rounds (room_id);

create table if not exists public.krot_secrets (
  round_id bigint not null references public.krot_rounds on delete cascade,
  uid uuid not null,
  seat smallint not null,
  role text not null check (role in ('agent', 'krot')),
  card jsonb not null,                      -- агент: {attr, val, label, text}; крот: {target, task}
  primary key (round_id, uid)
);

create table if not exists public.krot_votes (
  round_id bigint not null references public.krot_rounds on delete cascade,
  uid uuid not null,
  seat smallint not null,
  stage text not null check (stage in ('main', 'revote')),
  box smallint not null check (box between 1 and 4),
  rev int not null default 1,               -- ревизия: сколько раз менял выбор
  action_id uuid not null,                  -- id последнего принятого действия
  locked boolean not null default false,    -- вернулся после отключения — менять нельзя (ТЗ 2.8)
  confirmed_at timestamptz not null default now(),
  primary key (round_id, uid, stage)
);

create table if not exists public.krot_chat (
  id bigserial primary key,                 -- серверный порядковый номер (догрузка после переподключения)
  room_id bigint not null references public.krot_rooms on delete cascade,
  uid uuid, seat smallint, name text,       -- у системных сообщений пусто
  kind text not null default 'msg' check (kind in ('msg', 'sys')),
  text text not null check (char_length(text) between 1 and 400),
  created_at timestamptz not null default now()
);
create index if not exists krot_chat_room on public.krot_chat (room_id, id);
create index if not exists krot_chat_uid on public.krot_chat (uid, created_at) where uid is not null;

create table if not exists public.krot_points (   -- очки быстрой игры по дням (неделя = сумма дней; дневной потолок)
  uid uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  pts int not null default 0,
  games int not null default 0,
  wins int not null default 0,
  primary key (uid, day)
);

create table if not exists public.krot_reports (   -- жалобы (разбирает админка, этап 4)
  id bigserial primary key,
  room_id bigint not null references public.krot_rooms on delete cascade,
  round_id bigint,
  from_uid uuid not null,
  to_uid uuid not null,
  reason text not null check (reason in ('abuse', 'cheat', 'spam', 'afk', 'other')),
  note text,
  status text not null default 'new' check (status in ('new', 'ok', 'ban')),
  created_at timestamptz not null default now(),
  unique (room_id, from_uid, to_uid)
);

create table if not exists public.krot_log (       -- журнал событий матча (ТЗ 9.2); action_id — защита от повторной отправки
  id bigserial primary key,
  room_id bigint, round_id bigint, uid uuid,
  kind text not null,
  data jsonb,
  action_id uuid unique,
  at timestamptz not null default now()
);
create index if not exists krot_log_room on public.krot_log (room_id, id);

-- ---------- доступ: всё меняется только функциями ниже ----------
alter table public.krot_rooms enable row level security;
alter table public.krot_players enable row level security;
alter table public.krot_rounds enable row level security;
alter table public.krot_secrets enable row level security;
alter table public.krot_votes enable row level security;
alter table public.krot_chat enable row level security;
alter table public.krot_points enable row level security;
alter table public.krot_reports enable row level security;
alter table public.krot_log enable row level security;
revoke all on public.krot_rooms, public.krot_players, public.krot_rounds, public.krot_secrets, public.krot_votes,
  public.krot_chat, public.krot_points, public.krot_reports, public.krot_log from anon, authenticated;

-- ---------- группы и подбор матча (как в CS2) ----------
create table if not exists public.krot_party (       -- группа на главном экране: до 4 человек, вход по коду
  id bigserial primary key,
  code text not null,
  leader uuid not null,
  state text not null default 'idle' check (state in ('idle', 'search', 'match')),
  search_at timestamptz,                    -- начало поиска: очередь — кто раньше начал
  room_id bigint,                           -- state 'match': найденный матч (окно «Принять»), потом сама игра
  note jsonb,                               -- последнее событие для всей группы: {kind, names, uids}
  note_at timestamptz,
  rev int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists krot_party_code on public.krot_party (code);
create index if not exists krot_party_search on public.krot_party (search_at) where state = 'search';
create table if not exists public.krot_party_members (
  uid uuid primary key references public.profiles (id) on delete cascade,   -- человек — не больше чем в одной группе
  party_id bigint not null references public.krot_party on delete cascade,
  name text, ava text, pid bigint,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now()  -- «пульс» (krot_mm_state раз в 2–4 с)
);
create index if not exists krot_party_members_party on public.krot_party_members (party_id, joined_at);
alter table public.krot_rooms add column if not exists mm boolean not null default false;      -- собрана подбором: лобби = окно «Принять»
alter table public.krot_players add column if not exists solo boolean not null default true;   -- искал игру один (очки — только одиночкам)
alter table public.krot_players add column if not exists party_id bigint;
alter table public.krot_rooms add column if not exists load_at timestamptz;              -- все приняли: экран загрузки (проверка микрофона) до старта
alter table public.krot_players add column if not exists loaded boolean not null default false;   -- игра у игрока загрузилась (krot_loaded)
alter table public.krot_party enable row level security;           -- из браузера не читаются: только через функции
alter table public.krot_party_members enable row level security;

-- участник комнаты (для политик чтения и закрытого канала Realtime)
create or replace function public._krot_member(p_room bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.krot_players where room_id = p_room and uid = auth.uid())
$$;

drop policy if exists "krot_rooms: members" on public.krot_rooms;
create policy "krot_rooms: members" on public.krot_rooms for select to authenticated using (public._krot_member(id));
drop policy if exists "krot_players: members" on public.krot_players;
create policy "krot_players: members" on public.krot_players for select to authenticated using (public._krot_member(room_id));
drop policy if exists "krot_chat: members" on public.krot_chat;
create policy "krot_chat: members" on public.krot_chat for select to authenticated using (public._krot_member(room_id));
drop policy if exists "krot_secrets: own" on public.krot_secrets;
create policy "krot_secrets: own" on public.krot_secrets for select to authenticated using (uid = auth.uid());
drop policy if exists "krot_votes: own" on public.krot_votes;
create policy "krot_votes: own" on public.krot_votes for select to authenticated using (uid = auth.uid());
drop policy if exists "krot_points: own" on public.krot_points;
create policy "krot_points: own" on public.krot_points for select to authenticated using (uid = auth.uid());
-- krot_rounds, krot_reports, krot_log — политик нет: из браузера не читаются вообще
grant select on public.krot_rooms, public.krot_players, public.krot_chat, public.krot_secrets, public.krot_votes, public.krot_points to authenticated;

-- мгновенные обновления: фаза/состав (krot_rooms.rev) и чат; Realtime сам отсекает чужие комнаты по политикам выше
do $$ begin
  begin alter publication supabase_realtime add table public.krot_rooms; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.krot_chat; exception when duplicate_object then null; end;
end $$;

-- ---------- настройки и мелкие помощники ----------
-- числа по умолчанию; переопределяются записью site_cfg k='krot' (только нужные поля), например {"talk": 60, "pts_agent": 12}
create or replace function public._krot_cfg() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'lobby', 20, 'ready', 3, 'brief', 12, 'talk', 75, 'vote', 15, 'revote', 12, 'open', 8, 'debrief', 20,
    'offline', 15,       -- без «пульса» столько секунд — игрок пропал
    'reconnect', 30,     -- столько ждём пропавшего (пауза), потом отмена раунда
    'stale', 30,         -- в лобби пропавшего убираем с места через столько секунд
    'max_pauses', 3,     -- больше пауз за раунд — отмена
    'blank_pct', 33,     -- доля раундов, где один признак одинаковый у всех контейнеров (см. генератор)
    'chat_len', 300, 'chat_gap', 1, 'chat_burst', 5, 'chat_burst_s', 10, 'chat_repeat_s', 60,
    'pts_agent', 10, 'pts_krot', 15, 'day_cap', 300,
    'accept', 15,        -- окно «Ваша игра готова!» — столько секунд на «Принять»
    'load', 10,          -- экран загрузки после «Принять»: проверка микрофона и звука
    'load_max', 25,      -- кто не загрузился — ждём его до стольких секунд, потом старт без него
    'mm_stale', 45)      -- без «пульса» столько секунд — человек выходит из группы
  || coalesce((select v from public.site_cfg where k = 'krot' and jsonb_typeof(v) = 'object'), '{}'::jsonb)
$$;
create or replace function public._krot_dur(c jsonb, k text) returns interval language sql immutable as $$
  select make_interval(secs => greatest(1, coalesce((c->>k)::float8, 1)))
$$;
create or replace function public._krot_ms(t timestamptz) returns bigint language sql immutable as $$
  select (extract(epoch from t) * 1000)::bigint
$$;
-- случайное 0..n-1 из криптостойкого генератора (gen_random_uuid)
create or replace function public._krot_rnd(n int) returns int language sql volatile as $$
  select (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % greatest(n, 1))::int
$$;
create or replace function public._krot_hash(s text) returns text language sql immutable as $$
  select encode(sha256(convert_to(s, 'UTF8')), 'hex')
$$;
-- строчные буквы без зависимости от локали базы (кириллица)
create or replace function public._krot_low(t text) returns text language sql immutable as $$
  select lower(translate(t, 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'))
$$;
create or replace function public._krot_code() returns text language plpgsql volatile as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(a, 1 + public._krot_rnd(32), 1); end loop;
    exit when not exists (select 1 from public.krot_rooms where code = c and phase <> 'done');
  end loop;
  return c;
end $$;
create or replace function public._krot_sys(p_room bigint, p_text text) returns void language sql as $$
  insert into public.krot_chat (room_id, kind, text, created_at) values (p_room, 'sys', left(p_text, 400), clock_timestamp())
$$;
create or replace function public._krot_log(p_room bigint, p_round bigint, p_kind text, p_data jsonb) returns void language sql as $$
  insert into public.krot_log (room_id, round_id, uid, kind, data, at) values (p_room, p_round, auth.uid(), p_kind, p_data, clock_timestamp())
$$;
create or replace function public._krot_nn(n int) returns text language sql immutable as $$ select lpad(n::text, 2, '0') $$;

-- ---------- признаки контейнеров ----------
create or replace function public._krot_dict() returns jsonb language sql immutable as $$ select '{
  "sym": {"tri": "треугольник", "circle": "круг", "hex": "шестиугольник", "rhomb": "ромб"},
  "gun": {"pistol": "пистолет", "rifle": "винтовка", "sniper": "снайперская винтовка", "knife": "нож"},
  "col": {"amber": "янтарная", "red": "красная", "green": "зелёная", "blue": "синяя"}}'::jsonb
$$;
create or replace function public._krot_clue(a text, v text) returns jsonb language sql immutable as $$
  select jsonb_build_object('attr', a, 'val', v, 'label', public._krot_dict()->a->>v,
    'text', case a when 'sym' then 'Знак на цели — ' when 'gun' then 'Внутри цели — ' else 'Маркировка цели — ' end
      || (public._krot_dict()->a->>v) || '.')
$$;

-- ---------- генератор раунда ----------
-- Правила, которые проверяет _krot_check:
--   1) все четыре контейнера разные; три улики (признаки цели) вместе подходят ровно к одному — к цели;
--   2) каждая улика по отдельности подходит минимум к двум контейнерам;
--   3) таблица не выдаёт цель: по тем же правилам целью мог бы быть ЛЮБОЙ из четырёх (цель выбирается равновероятно);
--   4) у Крота есть правдоподобная ложь: есть контейнер, отличающийся от цели ровно одним признаком
--      (подменив одну улику, Крот получает непротиворечивую версию; иначе его ложь видна сразу).
-- С 4 контейнерами эти правила выполняют ровно две схемы (сетка 2×2):
--   pair  — два признака «ходят парой» (одинаково делят контейнеры 2+2), решает третий, «ключевой» признак;
--   blank — два признака делят 2+2 крест-накрест, третий одинаковый у всех (эта улика сама по себе ничего не сужает).
-- «Любые две улики не решают» невозможно одновременно с правилом 3: такая таблица выдала бы цель без улик.
create or replace function public._krot_gen(p_blank int default 33) returns jsonb language plpgsql volatile as $$
declare
  dict jsonb := public._krot_dict(); attrs text[] := array['sym', 'gun', 'col'];
  pattern text := case when public._krot_rnd(100) < greatest(0, least(100, coalesce(p_blank, 33))) then 'blank' else 'pair' end;
  k text := attrs[1 + public._krot_rnd(3)];   -- особый признак: ключевой (pair) или одинаковый у всех (blank)
  rest text[]; v jsonb := '{}'::jsonb; a text; perm int[]; i int; r int; q int; boxes jsonb := '[]'::jsonb;
begin
  foreach a in array attrs loop   -- по 2 разных случайных значения каждого признака из 4
    v := v || jsonb_build_object(a, (select jsonb_agg(x) from (select x from jsonb_object_keys(dict->a) x order by gen_random_uuid() limit 2) s));
  end loop;
  rest := array(select x from unnest(attrs) x where x <> k);
  perm := array(select g from generate_series(1, 4) g order by gen_random_uuid());   -- клетки сетки → места 01–04 вперемешку
  for i in 0..3 loop
    r := i / 2; q := i % 2;
    boxes := boxes || jsonb_build_array(jsonb_build_object('n', perm[i + 1],
      rest[1], v->rest[1]->>r,
      rest[2], v->rest[2]->>(case when pattern = 'pair' then r else q end),
      k, v->k->>(case when pattern = 'pair' then q else 0 end)));
  end loop;
  return jsonb_build_object('pattern', pattern, 'key', k,
    'boxes', (select jsonb_agg(x order by (x->>'n')::int) from jsonb_array_elements(boxes) x),
    'target', 1 + public._krot_rnd(4));
end $$;

-- проверка одной цели (правила 1, 2, 4); null — всё верно, иначе — что не так
create or replace function public._krot_check1(boxes jsonb, t int) returns text language plpgsql immutable as $$
declare tb jsonb; a text; cnt int;
begin
  select x into tb from jsonb_array_elements(boxes) x where (x->>'n')::int = t;
  if tb is null then return 'нет контейнера ' || t; end if;
  select count(*) into cnt from jsonb_array_elements(boxes) x
    where x->>'sym' = tb->>'sym' and x->>'gun' = tb->>'gun' and x->>'col' = tb->>'col';
  if cnt <> 1 then return format('три улики подходят к %s контейнерам', cnt); end if;
  foreach a in array array['sym', 'gun', 'col'] loop
    select count(*) into cnt from jsonb_array_elements(boxes) x where x->>a = tb->>a;
    if cnt < 2 then return format('улика %s подходит только к %s контейнеру', a, cnt); end if;
  end loop;
  select count(*) into cnt from jsonb_array_elements(boxes) x where (x->>'n')::int <> t
    and (x->>'sym' = tb->>'sym')::int + (x->>'gun' = tb->>'gun')::int + (x->>'col' = tb->>'col')::int = 2;
  if cnt = 0 then return 'у Крота нет правдоподобной лжи'; end if;
  return null;
end $$;
-- полная проверка таблицы и цели (правила 1–4)
create or replace function public._krot_check(boxes jsonb, t int) returns text language plpgsql immutable as $$
declare e text; i int;
begin
  if jsonb_typeof(boxes) <> 'array' or jsonb_array_length(boxes) <> 4 then return 'не 4 контейнера'; end if;
  if (select count(distinct x->>'n') from jsonb_array_elements(boxes) x where x->>'n' in ('1', '2', '3', '4')) <> 4 then return 'номера не 01–04'; end if;
  if exists (select 1 from jsonb_array_elements(boxes) x, unnest(array['sym', 'gun', 'col']) a where coalesce(x->>a, '') = '') then return 'пустой признак'; end if;
  if (select count(distinct (x->>'sym') || '|' || (x->>'gun') || '|' || (x->>'col')) from jsonb_array_elements(boxes) x) <> 4 then return 'есть одинаковые контейнеры'; end if;
  e := public._krot_check1(boxes, t);
  if e is not null then return 'цель: ' || e; end if;
  for i in 1..4 loop
    e := public._krot_check1(boxes, i);
    if e is not null then return format('таблица выдаёт цель: контейнер %s не мог бы быть целью (%s)', i, e); end if;
  end loop;
  return null;
end $$;

-- секретное задание Крота (ТЗ 2.6) — направляющее, не обязательное
create or replace function public._krot_task(boxes jsonb, t int) returns jsonb language plpgsql volatile as $$
declare d int;
begin
  -- «ложная цель»: отличается от настоящей одним признаком — на неё правдоподобнее всего уводить
  select (x->>'n')::int into d from jsonb_array_elements(boxes) x,
    (select y from jsonb_array_elements(boxes) y where (y->>'n')::int = t) tt(tb)
  where (x->>'n')::int <> t and (x->>'sym' = tb->>'sym')::int + (x->>'gun' = tb->>'gun')::int + (x->>'col' = tb->>'col')::int = 2
  order by gen_random_uuid() limit 1;
  return case public._krot_rnd(5)
    when 0 then jsonb_build_object('id', 'push', 'title', 'Продвинуть вариант', 'box', d,
      'text', format('Добейся, чтобы команда чаще обсуждала контейнер %s.', public._krot_nn(d)))
    when 1 then jsonb_build_object('id', 'split', 'title', 'Разделить мнения',
      'text', 'Добейся, чтобы голоса команды разделились между двумя вариантами.')
    when 2 then jsonb_build_object('id', 'doubt', 'title', 'Посеять сомнение',
      'text', 'Заставь Оперативников усомниться в одной из правдивых улик.')
    when 3 then jsonb_build_object('id', 'rush', 'title', 'Ускорить решение',
      'text', 'Подтолкни команду зафиксировать выбор раньше, чем все сверят данные.')
    else jsonb_build_object('id', 'lead', 'title', 'Перехватить лидерство',
      'text', 'Стань главным в обсуждении и навяжи свою версию.')
  end;
end $$;

-- строка-«отпечаток» для commit–reveal и её хеш
create or replace function public._krot_proof(rid bigint, boxes jsonb, t int, salt text) returns text language sql immutable as $$
  select 'RUSHKROT|' || rid || '|'
    || (select string_agg((x->>'n') || ':' || (x->>'sym') || ':' || (x->>'gun') || ':' || (x->>'col'), ';' order by (x->>'n')::int)
        from jsonb_array_elements(boxes) x)
    || '|' || t || '|' || salt
$$;

-- ---------- подсчёт голосов (ТЗ 2.7–2.8) ----------
-- v — голоса Оперативников основного голосования (null — не проголосовал)
create or replace function public._krot_tally(v int[]) returns jsonb language plpgsql immutable as $$
declare n int; top int; leaders int[];
begin
  select count(x) into n from unnest(v) x;
  if n < 2 then return jsonb_build_object('res', 'cancel', 'n', n, 'votes', to_jsonb(v)); end if;
  select max(cnt) into top from (select count(*) cnt from unnest(v) x where x is not null group by x) s;
  leaders := array(select x from unnest(v) x where x is not null group by x having count(*) = top order by x);
  if top >= 2 then   -- 3:0, 2:1 или 2:0 (один не проголосовал)
    return jsonb_build_object('res', 'chosen', 'box', leaders[1], 'n', n, 'votes', to_jsonb(v));
  end if;
  -- все голоса разные: 1:1 (двое) или 1:1:1 (трое) → доп. голосование между ними
  return jsonb_build_object('res', 'revote', 'cands', to_jsonb(leaders), 'n', n, 'votes', to_jsonb(v));
end $$;
-- доп. голосование: cands — варианты; v1 — основные голоса, v2 — повторные (те же Оперативники, тот же порядок).
-- Не переголосовал — остаётся прежний выбор (если он среди вариантов). Нет большинства → 'split' (цель не выбрана).
create or replace function public._krot_tally2(cands int[], v1 int[], v2 int[]) returns jsonb language plpgsql immutable as $$
declare eff int[] := '{}'; i int; n int; top int; leaders int[];
begin
  for i in 1..coalesce(array_length(v1, 1), 0) loop
    eff := eff || coalesce(case when v2[i] = any(cands) then v2[i] end, case when v1[i] = any(cands) then v1[i] end);
  end loop;
  select count(x) into n from unnest(eff) x;
  select max(cnt) into top from (select count(*) cnt from unnest(eff) x where x is not null group by x) s;
  leaders := array(select x from unnest(eff) x where x is not null group by x having count(*) = top order by x);
  if coalesce(top, 0) >= 2 and array_length(leaders, 1) = 1 then
    return jsonb_build_object('res', 'chosen', 'box', leaders[1], 'n', n, 'votes', to_jsonb(eff));
  end if;
  return jsonb_build_object('res', 'split', 'n', n, 'votes', to_jsonb(eff));
end $$;
-- голоса Оперативников раунда в порядке мест (null — нет голоса); голос Крота сюда не входит
create or replace function public._krot_votes(p_round bigint, p_stage text) returns int[] language sql stable as $$
  select array_agg(v.box::int order by s.seat) from public.krot_secrets s
    left join public.krot_votes v on v.round_id = s.round_id and v.uid = s.uid and v.stage = p_stage
  where s.round_id = p_round and s.role = 'agent'
$$;

-- ---------- фильтр чата: маскирует мат звёздочками (базовый, ТЗ 6.6) ----------
create or replace function public._krot_clean(t text) returns text language sql immutable as $$
  select coalesce(string_agg(case when translate(regexp_replace(public._krot_low(w), '[^a-zа-яё]', '', 'g'), 'aceopxyё', 'асеорхуе')
      ~ '^(на|по|о|ни|за|от|до)?ху[йяеиюё]|пизд|^(вы|за|у|от|отъ|съ|раз|разъ|на|по|до|при|про|недо|долбо)?еб(а|у|л|и|н|ы|ш)|^бля|пид[оа]р|мудак|мудил|гандон|шлюх|^сук(а|и|у)$|^чмо$|^чмош'
    then repeat('*', char_length(w)) else w end, ' ' order by i), '')
  from unnest(string_to_array(t, ' ')) with ordinality as x(w, i)
$$;

-- ---------- жизненный цикл матча ----------
create or replace function public._krot_phase(p_room bigint, p_phase text) returns void language plpgsql as $$
declare c jsonb := public._krot_cfg(); now_ts timestamptz := clock_timestamp(); rid bigint;
begin
  update public.krot_rooms set phase = p_phase, phase_at = now_ts,
    phase_deadline = case when p_phase = 'done' then null else now_ts + public._krot_dur(c, p_phase) end,
    paused_at = null, pause_left = null, pause_seat = null, rev = rev + 1, updated_at = now_ts
  where id = p_room returning round_id into rid;
  perform public._krot_log(p_room, rid, 'phase', jsonb_build_object('phase', p_phase));
end $$;

-- старт раунда: таблица, цель, commit, роли и улики — всё до брифинга
create or replace function public._krot_start(p_room bigint) returns void language plpgsql as $$
declare
  rm public.krot_rooms; c jsonb := public._krot_cfg(); g jsonb; e text; k int := 0; tgt int; tb jsonb;
  rid bigint; salt text; ks smallint; task jsonb; attrs text[]; p public.krot_players; i int := 0; cm text;
begin
  select * into rm from public.krot_rooms where id = p_room for no key update;
  loop   -- генератор сразу строит верную таблицу; проверка — страховка
    g := public._krot_gen((c->>'blank_pct')::int);
    e := public._krot_check(g->'boxes', (g->>'target')::int);
    exit when e is null;
    k := k + 1;
    if k >= 20 then raise exception 'krot generator: %', e; end if;
  end loop;
  tgt := (g->>'target')::int;
  select x into tb from jsonb_array_elements(g->'boxes') x where (x->>'n')::int = tgt;
  salt := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  rid := nextval(pg_get_serial_sequence('public.krot_rounds', 'id'));
  cm := public._krot_hash(public._krot_proof(rid, g->'boxes', tgt, salt));
  select seat into ks from public.krot_players where room_id = p_room order by gen_random_uuid() limit 1;
  task := public._krot_task(g->'boxes', tgt);
  insert into public.krot_rounds (id, room_id, kind, pattern, boxes, target, salt, commit, task, krot_seat)
    values (rid, p_room, rm.kind, g->>'pattern', g->'boxes', tgt, salt, cm, task, ks);
  attrs := array(select x from unnest(array['sym', 'gun', 'col']) x order by gen_random_uuid());   -- какой Оперативник какой признак знает
  for p in select * from public.krot_players where room_id = p_room order by seat loop
    if p.seat = ks then
      insert into public.krot_secrets (round_id, uid, seat, role, card)
        values (rid, p.uid, p.seat, 'krot', jsonb_build_object('target', tgt, 'task', task,
          'text', format('Ты — КРОТ. Цель — контейнер %s. Уведи команду от него и не выдай себя.', public._krot_nn(tgt))));
    else
      i := i + 1;
      insert into public.krot_secrets (round_id, uid, seat, role, card)
        values (rid, p.uid, p.seat, 'agent', public._krot_clue(attrs[i], tb->>attrs[i]));
    end if;
  end loop;
  update public.krot_rooms set round_id = rid where id = p_room;
  perform public._krot_phase(p_room, 'brief');
  perform public._krot_log(p_room, rid, 'start', jsonb_build_object('commit', cm));
  perform public._krot_sys(p_room, 'Операция начинается. Проверьте личные данные.');
end $$;

-- очки быстрой игры: победителям, с дневным потолком (день по Москве)
create or replace function public._krot_award(p_round bigint) returns jsonb language plpgsql as $$
declare rd public.krot_rounds; s public.krot_secrets; c jsonb := public._krot_cfg(); win boolean; add int; cur int;
  res jsonb := '{}'::jsonb; d date := (now() at time zone 'Europe/Moscow')::date;
begin
  select * into rd from public.krot_rounds where id = p_round;
  if rd.kind <> 'quick' or rd.outcome not in ('team', 'krot') then return res; end if;
  for s in select * from public.krot_secrets where round_id = p_round order by seat loop
    win := (rd.outcome = 'team' and s.role = 'agent') or (rd.outcome = 'krot' and s.role = 'krot');
    add := case when not win then 0 when s.role = 'agent' then (c->>'pts_agent')::int else (c->>'pts_krot')::int end;
    if not coalesce((select solo from public.krot_players where room_id = rd.room_id and uid = s.uid), true) then add := 0; end if;   -- в группе с друзьями — без очков
    select pts into cur from public.krot_points where uid = s.uid and day = d;
    add := greatest(0, least(add, (c->>'day_cap')::int - coalesce(cur, 0)));
    begin
      insert into public.krot_points (uid, day, pts, games, wins) values (s.uid, d, add, 1, win::int)
        on conflict (uid, day) do update set pts = public.krot_points.pts + excluded.pts,
          games = public.krot_points.games + 1, wins = public.krot_points.wins + excluded.wins;
    exception when foreign_key_violation then add := 0;   -- профиль удалён
    end;
    res := res || jsonb_build_object(s.seat::text, add);
  end loop;
  return res;
end $$;

-- итог: выбор команды → исход, очки, вскрытие
create or replace function public._krot_finish(p_room bigint, p_chosen int, p_reason text, p_tally jsonb) returns void language plpgsql as $$
declare rm public.krot_rooms; rd public.krot_rounds; pts jsonb;
begin
  select * into rm from public.krot_rooms where id = p_room for no key update;
  select * into rd from public.krot_rounds where id = rm.round_id for no key update;
  update public.krot_rounds set chosen = p_chosen, reason = p_reason, tally = p_tally, ended_at = clock_timestamp(),
    outcome = case when p_chosen is not null and p_chosen = rd.target then 'team' else 'krot' end
  where id = rd.id;
  pts := public._krot_award(rd.id);
  update public.krot_rounds set tally = coalesce(tally, '{}'::jsonb) || jsonb_build_object('pts', pts) where id = rd.id;
  perform public._krot_phase(p_room, 'open');
  perform public._krot_log(p_room, rd.id, 'result', jsonb_build_object('chosen', p_chosen, 'reason', p_reason, 'target', rd.target, 'pts', pts));
  perform public._krot_sys(p_room, case when p_chosen is null then 'Команда не договорилась. Вскрываем контейнеры…'
    else format('Команда выбрала контейнер %s. Вскрываем…', public._krot_nn(p_chosen)) end);
end $$;

-- отмена раунда (очков нет)
create or replace function public._krot_cancel(p_room bigint, p_why text) returns void language plpgsql as $$
declare rid bigint;
begin
  select round_id into rid from public.krot_rooms where id = p_room;
  update public.krot_rounds set outcome = 'cancel', reason = p_why, ended_at = clock_timestamp() where id = rid and outcome is null;
  perform public._krot_phase(p_room, 'done');
  perform public._krot_log(p_room, rid, 'cancel', jsonb_build_object('why', p_why));
  perform public._krot_sys(p_room, 'Раунд отменён: ' || case p_why
    when 'disconnect' then 'игрок не вернулся вовремя'
    when 'few_votes' then 'проголосовало меньше двух Оперативников'
    when 'abandoned' then 'все игроки вышли'
    else p_why end || '.');
end $$;

-- один шаг «ленивого таймера»: true — что-то изменилось (тогда шагаем ещё раз)
create or replace function public._krot_step(p_room bigint) returns boolean language plpgsql as $$
declare
  rm public.krot_rooms; rd public.krot_rounds; c jsonb := public._krot_cfg(); now_ts timestamptz := clock_timestamp();
  p public.krot_players; n int; nready int; ch boolean := false; t jsonb;
begin
  select * into rm from public.krot_rooms where id = p_room for no key update;
  if rm.id is null or rm.phase = 'done' then return false; end if;
  if rm.round_id is not null then select * into rd from public.krot_rounds where id = rm.round_id for no key update; end if;

  -- ---------- матч из подбора: лобби = окно «Принять» ----------
  if rm.phase = 'lobby' and rm.mm then
    select count(*), count(*) filter (where ready) into n, nready from public.krot_players where room_id = rm.id;
    if n = 4 and nready = 4 then
      if rm.load_at is null then   -- все приняли → экран загрузки (load, ~10 с): все успевают открыть игру, проверить микрофон и звук
        update public.krot_rooms set load_at = now_ts, phase_deadline = now_ts + public._krot_dur(c, 'load'), rev = rev + 1, updated_at = now_ts where id = rm.id;
        return true;
      elsif now_ts >= rm.phase_deadline and (not exists (select 1 from public.krot_players where room_id = rm.id and not loaded)
            or now_ts >= rm.load_at + public._krot_dur(c, 'load_max')) then   -- все загрузились (или ждали достаточно) — брифинг
        update public.krot_players set seen_at = now_ts where room_id = rm.id;
        perform public._krot_start(rm.id);
        return true;
      end if;
      return false;
    end if;
    if n < 4 or (rm.load_at is null and now_ts >= rm.phase_deadline) then   -- не все приняли (или кто-то ушёл) — матч не собран; группы разберёт _krot_mm_sync
      update public.krot_rooms set phase = 'done', phase_deadline = null, rev = rev + 1, updated_at = now_ts where id = rm.id;
      perform public._krot_log(rm.id, null, 'mm_fail', jsonb_build_object('accepted', nready));
      return true;
    end if;
    return false;
  end if;

  -- ---------- лобби ----------
  if rm.phase = 'lobby' then
    for p in delete from public.krot_players where room_id = rm.id and seen_at < now_ts - public._krot_dur(c, 'stale') returning * loop
      perform public._krot_sys(rm.id, format('Игрок %s покинул комнату.', p.name));
      ch := true;
    end loop;
    select count(*), count(*) filter (where ready) into n, nready from public.krot_players where room_id = rm.id;
    if n = 0 then perform public._krot_phase(rm.id, 'done'); return true; end if;
    if ch then
      update public.krot_rooms set rev = rev + 1, updated_at = now_ts,
        owner = case when exists (select 1 from public.krot_players where room_id = rm.id and uid = rm.owner) then owner
                     else (select uid from public.krot_players where room_id = rm.id order by seat limit 1) end
      where id = rm.id;
    end if;
    if n < 4 or (rm.kind = 'private' and nready < 4) then
      if rm.phase_deadline is not null then   -- кто-то ушёл / снял «Готов» — отсчёт сбрасывается
        update public.krot_rooms set phase_deadline = null, rev = rev + 1, updated_at = now_ts where id = rm.id;
        return true;
      end if;
    elsif rm.phase_deadline is null or (nready = 4 and rm.phase_deadline > now_ts + public._krot_dur(c, 'ready')) then
      update public.krot_rooms set phase_deadline = now_ts + public._krot_dur(c, case when nready = 4 then 'ready' else 'lobby' end),
        rev = rev + 1, updated_at = now_ts where id = rm.id;
      return true;
    elsif now_ts >= rm.phase_deadline then
      perform public._krot_start(rm.id);
      return true;
    end if;
    return ch;
  end if;

  -- ---------- идёт раунд: все пропали надолго — комната брошена ----------
  if rm.phase in ('brief', 'talk', 'vote', 'revote') and not exists (select 1 from public.krot_players where room_id = rm.id
       and left_at is null and seen_at >= now_ts - public._krot_dur(c, 'offline') - public._krot_dur(c, 'reconnect')) then
    perform public._krot_cancel(rm.id, 'abandoned');
    return true;
  end if;

  -- ---------- до голосования: пропал игрок → пауза, не вернулся → отмена (ТЗ 2.8) ----------
  if rm.phase in ('brief', 'talk') then
    select * into p from public.krot_players where room_id = rm.id
      and (left_at is not null or seen_at < now_ts - public._krot_dur(c, 'offline')) order by seat limit 1;
    if rm.paused_at is not null then
      if p.uid is null then
        update public.krot_rooms set phase_deadline = now_ts + pause_left, paused_at = null, pause_left = null, pause_seat = null,
          rev = rev + 1, updated_at = now_ts where id = rm.id;
        perform public._krot_sys(rm.id, 'Все на месте — продолжаем.');
        perform public._krot_log(rm.id, rd.id, 'resume', null);
        return true;
      elsif now_ts >= rm.phase_deadline then
        perform public._krot_cancel(rm.id, 'disconnect');
        return true;
      end if;
      return false;
    end if;
    if p.uid is not null then
      if rd.pauses >= (c->>'max_pauses')::int then perform public._krot_cancel(rm.id, 'disconnect'); return true; end if;
      update public.krot_rounds set pauses = pauses + 1 where id = rd.id;
      update public.krot_rooms set paused_at = now_ts, pause_seat = p.seat,
        pause_left = greatest(phase_deadline - now_ts, interval '3 seconds'),
        phase_deadline = now_ts + public._krot_dur(c, 'reconnect'), rev = rev + 1, updated_at = now_ts
      where id = rm.id;
      perform public._krot_sys(rm.id, format('Игрок %s потерял связь. Таймер на паузе: ждём %s с, потом раунд отменится.', p.name, c->>'reconnect'));
      perform public._krot_log(rm.id, rd.id, 'pause', jsonb_build_object('seat', p.seat));
      return true;
    end if;
  end if;

  if rm.phase_deadline is null or now_ts < rm.phase_deadline then return false; end if;

  -- ---------- дедлайн фазы прошёл ----------
  case rm.phase
  when 'brief' then
    perform public._krot_phase(rm.id, 'talk');
    perform public._krot_sys(rm.id, 'Брифинг окончен. Обсуждайте — голосом и в чате.');
  when 'talk' then
    perform public._krot_phase(rm.id, 'vote');
    perform public._krot_sys(rm.id, 'Обсуждение завершено. Зафиксируйте контейнер.');
  when 'vote' then
    t := public._krot_tally(public._krot_votes(rd.id, 'main'));
    if t->>'res' = 'cancel' then
      update public.krot_rounds set tally = jsonb_build_object('main', t) where id = rd.id;
      perform public._krot_cancel(rm.id, 'few_votes');
    elsif t->>'res' = 'chosen' then
      perform public._krot_finish(rm.id, (t->>'box')::int, 'majority', jsonb_build_object('main', t));
    else
      update public.krot_rounds set tally = jsonb_build_object('main', t),
        candidates = array(select x::smallint from jsonb_array_elements_text(t->'cands') x) where id = rd.id;
      perform public._krot_phase(rm.id, 'revote');
      perform public._krot_sys(rm.id, 'Голоса разделились. Доп. голосование: '
        || (select string_agg(public._krot_nn(x::int), ' или ') from jsonb_array_elements_text(t->'cands') x) || '.');
    end if;
  when 'revote' then
    t := public._krot_tally2(rd.candidates::int[], public._krot_votes(rd.id, 'main'), public._krot_votes(rd.id, 'revote'));
    perform public._krot_finish(rm.id, (t->>'box')::int, case when t->>'res' = 'chosen' then 'revote' else 'split' end,
      coalesce(rd.tally, '{}'::jsonb) || jsonb_build_object('revote', t));
  when 'open' then
    perform public._krot_phase(rm.id, 'debrief');
    perform public._krot_sys(rm.id, format('Цель — контейнер %s. Роли раскрыты.', public._krot_nn(rd.target)));
  when 'debrief' then
    perform public._krot_phase(rm.id, 'done');
  else
    return false;
  end case;
  return true;
end $$;

create or replace function public._krot_advance(p_room bigint) returns void language plpgsql as $$
declare i int;
begin
  for i in 1..10 loop exit when not public._krot_step(p_room); end loop;
end $$;

-- «пульс» игрока; вернулся после отключения → сообщение и блокировка уже зафиксированного голоса (ТЗ 2.8)
create or replace function public._krot_touch(p_room bigint) returns public.krot_players language plpgsql as $$
declare me public.krot_players; rm public.krot_rooms; c jsonb := public._krot_cfg(); now_ts timestamptz := clock_timestamp();
begin
  select * into me from public.krot_players where room_id = p_room and uid = auth.uid();
  if me.uid is null then return me; end if;
  if me.left_at is not null or me.seen_at < now_ts - public._krot_dur(c, 'offline') then
    select * into rm from public.krot_rooms where id = p_room;
    if rm.phase in ('brief', 'talk', 'vote', 'revote') then
      update public.krot_votes set locked = true where round_id = rm.round_id and uid = auth.uid();
      update public.krot_rooms set rev = rev + 1, updated_at = now_ts where id = p_room;
      perform public._krot_sys(p_room, format('Игрок %s восстановил соединение.', me.name));
    end if;
  end if;
  update public.krot_players set seen_at = now_ts, left_at = null where room_id = p_room and uid = auth.uid() returning * into me;
  return me;
end $$;

-- моя текущая комната (идущий матч или лобби); заодно двигает её таймер
create or replace function public._krot_active() returns bigint language plpgsql as $$
declare rid bigint; i int;
begin
  for i in 1..2 loop
    select p.room_id into rid from public.krot_players p join public.krot_rooms r on r.id = p.room_id
      where p.uid = auth.uid() and r.phase <> 'done' and not (r.phase in ('open', 'debrief') and p.left_at is not null)
      order by p.room_id desc limit 1;
    if rid is null or i = 2 then return rid; end if;
    perform 1 from public.krot_rooms where id = rid for no key update;
    perform public._krot_advance(rid);   -- лобби могло убрать меня, матч — закончиться
  end loop;
  return rid;
end $$;

-- сесть за стол: первое свободное место
create or replace function public._krot_enter(p_room bigint) returns void language plpgsql as $$
declare pr record; s int;
begin
  select name, ava, pid into pr from public.profiles where id = auth.uid();
  select min(g) into s from generate_series(1, 4) g
    where not exists (select 1 from public.krot_players where room_id = p_room and seat = g);
  if s is null then raise exception 'room full'; end if;
  insert into public.krot_players (room_id, uid, seat, name, ava, pid, seen_at)
    values (p_room, auth.uid(), s, coalesce(pr.name, 'Игрок'), pr.ava, pr.pid, clock_timestamp());
  update public.krot_rooms set rev = rev + 1, updated_at = clock_timestamp() where id = p_room;
  perform public._krot_sys(p_room, format('Игрок %s вошёл в комнату.', coalesce(pr.name, 'Игрок')));
  perform public._krot_log(p_room, null, 'join', jsonb_build_object('seat', s));
end $$;

-- ============================================================
-- Функции для сайта
-- ============================================================

-- снимок комнаты (ТЗ 7.4): фаза, дедлайн, игроки, моя роль/улика, мой голос; p_after — догрузить чат после этого номера
create or replace function public.krot_state(p_room bigint, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rm public.krot_rooms; rd public.krot_rounds; me public.krot_players; sec public.krot_secrets; c jsonb := public._krot_cfg();
  now_ts timestamptz; reveal boolean; roles boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform 1 from public.krot_rooms where id = p_room for no key update;
  me := public._krot_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  perform public._krot_advance(p_room);
  select * into rm from public.krot_rooms where id = p_room;
  select * into me from public.krot_players where room_id = p_room and uid = auth.uid();
  if rm.round_id is not null then
    select * into rd from public.krot_rounds where id = rm.round_id;
    select * into sec from public.krot_secrets where round_id = rd.id and uid = auth.uid();
  end if;
  now_ts := clock_timestamp();
  reveal := rd.outcome is not null and rm.phase in ('open', 'debrief', 'done');   -- цель, соль, выбор команды
  roles := reveal and rm.phase in ('debrief', 'done');                           -- роли, улики, задание, голоса
  return jsonb_build_object(
    'now', public._krot_ms(now_ts),
    'room', jsonb_build_object('id', rm.id, 'code', rm.code, 'kind', rm.kind, 'points', rm.kind = 'quick' and coalesce(me.solo, true), 'mm', rm.mm,
      'phase', rm.phase, 'rev', rm.rev, 'phase_at', public._krot_ms(rm.phase_at), 'deadline', public._krot_ms(rm.phase_deadline),
      'load_at', public._krot_ms(rm.load_at), 'paused', rm.paused_at is not null, 'pause_seat', rm.pause_seat,
      'pause_left', case when rm.pause_left is not null then (extract(epoch from rm.pause_left) * 1000)::bigint end,
      'owner', rm.owner = auth.uid(),
      'times', jsonb_build_object('brief', c->'brief', 'talk', c->'talk', 'vote', c->'vote', 'revote', c->'revote', 'open', c->'open', 'debrief', c->'debrief')),
    'players', coalesce((select jsonb_agg(jsonb_build_object('seat', p.seat, 'name', p.name, 'loaded', p.loaded, 'ava', p.ava, 'pid', p.pid,
        'ready', p.ready, 'me', p.uid = auth.uid(),
        'online', p.left_at is null and p.seen_at >= now_ts - public._krot_dur(c, 'offline'), 'left', p.left_at is not null) order by p.seat)
      from public.krot_players p where p.room_id = rm.id), '[]'::jsonb),
    'me', jsonb_build_object('seat', me.seat, 'ready', me.ready,
      'role', sec.role, 'card', sec.card,
      'vote', (select box from public.krot_votes where round_id = rd.id and uid = auth.uid() and stage = 'main'),
      'revote', (select box from public.krot_votes where round_id = rd.id and uid = auth.uid() and stage = 'revote'),
      'locked', coalesce((select bool_or(locked) from public.krot_votes where round_id = rd.id and uid = auth.uid()), false)),
    'round', case when rd.id is null then null else jsonb_build_object(
      'id', rd.id, 'boxes', rd.boxes, 'dict', public._krot_dict(), 'commit', rd.commit, 'cands', to_jsonb(rd.candidates),
      'target', case when reveal then rd.target end,
      'salt', case when reveal then rd.salt end,
      'proof', case when reveal then public._krot_proof(rd.id, rd.boxes, rd.target, rd.salt) end,
      'chosen', case when reveal then rd.chosen end,
      'outcome', case when reveal then rd.outcome end,
      'reason', case when reveal then rd.reason end,
      'roles', case when roles then (select jsonb_agg(jsonb_build_object('seat', s.seat, 'role', s.role, 'card', s.card) order by s.seat)
        from public.krot_secrets s where s.round_id = rd.id) end,
      'votes', case when roles then (select jsonb_agg(jsonb_build_object('seat', v.seat, 'stage', v.stage, 'box', v.box, 'rev', v.rev,
          'at', public._krot_ms(v.confirmed_at)) order by v.stage, v.seat) from public.krot_votes v where v.round_id = rd.id) end,
      'timeline', case when roles then (select jsonb_agg(jsonb_build_object('seat', (l.data->>'seat')::int, 'stage', l.data->>'stage',
          'box', (l.data->>'box')::int, 'at', public._krot_ms(l.at)) order by l.id) from public.krot_log l where l.round_id = rd.id and l.kind = 'vote') end,
      'tally', case when roles then rd.tally end) end,
    'chat', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'seat', m.seat, 'name', m.name, 'text', m.text,
        'at', public._krot_ms(m.created_at)) order by m.id)
      from (select * from public.krot_chat where room_id = rm.id and id > coalesce(p_after, 0) order by id desc limit 100) m), '[]'::jsonb));
end $$;

-- лёгкий «пульс» раз в 3 с: отмечает, что игрок на связи, и двигает фазы по дедлайну (проверка now() на сервере)
create or replace function public.krot_tick(p_room bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rm public.krot_rooms; me public.krot_players;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform 1 from public.krot_rooms where id = p_room for no key update;
  me := public._krot_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  perform public._krot_advance(p_room);
  select * into rm from public.krot_rooms where id = p_room;
  return jsonb_build_object('now', public._krot_ms(clock_timestamp()), 'phase', rm.phase, 'rev', rm.rev,
    'deadline', public._krot_ms(rm.phase_deadline), 'paused', rm.paused_at is not null);
end $$;

-- выйти: из лобби — освободить место; из идущего матча — считается отключением (пауза/отмена по ТЗ 2.8)
create or replace function public.krot_leave(p_room bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rm public.krot_rooms; me public.krot_players;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into rm from public.krot_rooms where id = p_room for no key update;
  select * into me from public.krot_players where room_id = p_room and uid = auth.uid();
  if me.uid is null then return jsonb_build_object('ok', true); end if;
  if rm.phase = 'lobby' then
    delete from public.krot_players where room_id = p_room and uid = auth.uid();
    update public.krot_rooms set rev = rev + 1, updated_at = clock_timestamp(),
      owner = case when owner = auth.uid() then (select uid from public.krot_players where room_id = p_room order by seat limit 1) else owner end
    where id = p_room;
    perform public._krot_sys(p_room, format('Игрок %s покинул комнату.', me.name));
  elsif me.left_at is null then
    update public.krot_players set left_at = clock_timestamp() where room_id = p_room and uid = auth.uid();
    update public.krot_rooms set rev = rev + 1, updated_at = clock_timestamp() where id = p_room;
    if rm.phase in ('brief', 'talk', 'vote', 'revote') then
      perform public._krot_sys(p_room, format('Игрок %s покинул операцию.', me.name));
    end if;
  end if;
  perform public._krot_log(p_room, rm.round_id, 'leave', null);
  perform public._krot_advance(p_room);
  return jsonb_build_object('ok', true);
end $$;

-- создать комнату: private = true — по коду для друзей (без очков); false — открытое лобби быстрой игры
create or replace function public.krot_create(p_private boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  rid := public._krot_active();
  if rid is not null then
    if (select phase from public.krot_rooms where id = rid) <> 'lobby' then
      return public.krot_state(rid) || jsonb_build_object('rejoin', true);
    end if;
    perform public.krot_leave(rid);
  end if;
  if (select count(*) from public.krot_log where uid = auth.uid() and kind = 'create' and at > now() - interval '1 hour') >= 15 then
    raise exception 'too many rooms';
  end if;
  -- брошенные лобби (никого не было на связи 10 минут) закрываем, чтобы не держали коды
  update public.krot_rooms r set phase = 'done', phase_deadline = null, rev = rev + 1, updated_at = now()
    where r.phase = 'lobby' and r.updated_at < now() - interval '10 minutes'
      and not exists (select 1 from public.krot_players p where p.room_id = r.id and p.seen_at > now() - interval '10 minutes');
  insert into public.krot_rooms (code, kind, owner) values (public._krot_code(), case when p_private then 'private' else 'quick' end, auth.uid())
    returning id into rid;
  perform public._krot_log(rid, null, 'create', jsonb_build_object('private', p_private));
  perform public._krot_enter(rid);
  return public.krot_state(rid);
end $$;

-- войти по коду (только комнаты для друзей)
create or replace function public.krot_join(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid bigint; rm public.krot_rooms; cd text := upper(btrim(coalesce(p_code, '')));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  rid := public._krot_active();
  if rid is not null then
    select * into rm from public.krot_rooms where id = rid;
    if rm.phase <> 'lobby' then return public.krot_state(rid) || jsonb_build_object('rejoin', true); end if;
    if rm.code = cd then return public.krot_state(rid); end if;
    perform public.krot_leave(rid);
  end if;
  select * into rm from public.krot_rooms where code = cd and phase <> 'done' and kind = 'private' for no key update;
  if rm.id is null then raise exception 'room not found'; end if;
  perform public._krot_advance(rm.id);   -- вычистить пропавших, освободить места
  select * into rm from public.krot_rooms where id = rm.id;
  if rm.phase <> 'lobby' then raise exception 'already started'; end if;
  if (select count(*) from public.krot_players where room_id = rm.id) >= 4 then raise exception 'room full'; end if;
  perform public._krot_enter(rm.id);
  return public.krot_state(rm.id);
end $$;

-- быстрая игра: сесть в самое заполненное открытое лобби или открыть новое
create or replace function public.krot_quick() returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid bigint; rm public.krot_rooms; cand bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  rid := public._krot_active();
  if rid is not null then
    select * into rm from public.krot_rooms where id = rid;
    if rm.phase <> 'lobby' then return public.krot_state(rid) || jsonb_build_object('rejoin', true); end if;
    if rm.kind = 'quick' then return public.krot_state(rid); end if;
    perform public.krot_leave(rid);   -- был в комнате друзей — выходим
  end if;
  perform pg_advisory_xact_lock(hashtext('rush-krot-quick'));
  for cand in select r.id from public.krot_rooms r where r.kind = 'quick' and r.phase = 'lobby' and not r.mm
      order by (select count(*) from public.krot_players p where p.room_id = r.id) desc, r.id limit 20 loop
    perform 1 from public.krot_rooms where id = cand for no key update;
    perform public._krot_advance(cand);
    if (select phase from public.krot_rooms where id = cand) = 'lobby'
       and (select count(*) from public.krot_players where room_id = cand) between 1 and 3 then
      perform public._krot_enter(cand);
      perform public._krot_advance(cand);   -- четвёртый — запускается отсчёт
      return public.krot_state(cand);
    end if;
  end loop;
  insert into public.krot_rooms (code, kind, owner) values (public._krot_code(), 'quick', auth.uid()) returning id into rid;
  perform public._krot_log(rid, null, 'create', jsonb_build_object('quick', true));
  perform public._krot_enter(rid);
  return public.krot_state(rid);
end $$;

-- «Готов к операции» (только в лобби)
create or replace function public.krot_ready(p_room bigint, p_ready boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rm public.krot_rooms; me public.krot_players;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into rm from public.krot_rooms where id = p_room for no key update;
  me := public._krot_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  if rm.phase <> 'lobby' then raise exception 'not lobby'; end if;
  update public.krot_players set ready = coalesce(p_ready, true) where room_id = p_room and uid = auth.uid();
  update public.krot_rooms set rev = rev + 1, updated_at = clock_timestamp() where id = p_room;
  return public.krot_tick(p_room);
end $$;

-- голос: выбрать контейнер в фазе vote (1–4) или revote (только варианты ничьей). Можно менять до конца таймера.
-- p_action — id нажатия: повтор с тем же id не меняет ничего и возвращает тот же ответ (идемпотентно).
create or replace function public.krot_vote(p_room bigint, p_box int, p_action uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rm public.krot_rooms; rd public.krot_rounds; me public.krot_players; v public.krot_votes; stg text; prev jsonb; res jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_action is null then raise exception 'no action id'; end if;
  perform 1 from public.krot_rooms where id = p_room for no key update;
  me := public._krot_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  -- это нажатие уже принято — тот же ответ
  select data into prev from public.krot_log where action_id = p_action;
  if found then
    if (select uid from public.krot_log where action_id = p_action) is distinct from auth.uid() then raise exception 'bad action id'; end if;
    return prev || jsonb_build_object('repeat', true);
  end if;
  perform public._krot_advance(p_room);
  select * into rm from public.krot_rooms where id = p_room;
  if rm.phase not in ('vote', 'revote') or rm.paused_at is not null or clock_timestamp() >= rm.phase_deadline then raise exception 'closed'; end if;
  select * into rd from public.krot_rounds where id = rm.round_id;
  stg := case rm.phase when 'vote' then 'main' else 'revote' end;
  if p_box is null or p_box not between 1 and 4 or (stg = 'revote' and not (p_box = any(rd.candidates))) then raise exception 'bad box'; end if;
  select * into v from public.krot_votes where round_id = rd.id and uid = auth.uid() and stage = stg for update;
  if v.locked then raise exception 'vote locked'; end if;
  insert into public.krot_votes (round_id, uid, seat, stage, box, action_id, confirmed_at)
    values (rd.id, auth.uid(), me.seat, stg, p_box, p_action, clock_timestamp())
  on conflict (round_id, uid, stage) do update set box = excluded.box, rev = public.krot_votes.rev + 1,
    action_id = excluded.action_id, confirmed_at = excluded.confirmed_at
  returning * into v;
  res := jsonb_build_object('ok', true, 'seat', me.seat, 'stage', stg, 'box', v.box, 'rev', v.rev, 'msg', 'Ваш выбор сохранён.');
  insert into public.krot_log (room_id, round_id, uid, kind, data, action_id, at) values (p_room, rd.id, auth.uid(), 'vote', res, p_action, clock_timestamp());
  return res;
end $$;

-- сообщение в чат комнаты: длина, частота, повторы, фильтр мата (ТЗ 6.4, 6.6)
create or replace function public.krot_chat_send(p_room bigint, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.krot_players; c jsonb := public._krot_cfg(); t text; mid bigint; now_ts timestamptz := clock_timestamp(); last_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into me from public.krot_players where room_id = p_room and uid = auth.uid() for update;   -- по одному сообщению за раз
  if me.uid is null then raise exception 'not in room'; end if;
  t := regexp_replace(coalesce(p_text, ''), '[\x01-\x09\x0b-\x1f\x7f]', '', 'g');   -- служебные символы (кроме переноса строки)
  t := regexp_replace(t, '\n{3,}', E'\n\n', 'g');
  t := btrim(t, E' \n');
  if t = '' then raise exception 'empty'; end if;
  if char_length(t) > (c->>'chat_len')::int then raise exception 'too long'; end if;
  select max(created_at) into last_at from public.krot_chat where room_id = p_room and uid = auth.uid();
  if last_at > now_ts - make_interval(secs => (c->>'chat_gap')::float8)
     or (select count(*) from public.krot_chat where uid = auth.uid() and created_at > now_ts - public._krot_dur(c, 'chat_burst_s')) >= (c->>'chat_burst')::int then
    raise exception 'too fast';
  end if;
  t := public._krot_clean(t);
  if exists (select 1 from public.krot_chat where room_id = p_room and uid = auth.uid()
             and created_at > now_ts - public._krot_dur(c, 'chat_repeat_s') and public._krot_low(text) = public._krot_low(t)) then
    raise exception 'repeat';
  end if;
  insert into public.krot_chat (room_id, uid, seat, name, kind, text, created_at) values (p_room, auth.uid(), me.seat, me.name, 'msg', t, now_ts)
    returning id into mid;
  return jsonb_build_object('ok', true, 'id', mid, 'text', t, 'at', public._krot_ms(now_ts));
end $$;

-- жалоба на игрока этой комнаты (по месту за столом)
create or replace function public.krot_report(p_room bigint, p_seat int, p_reason text default 'other', p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare tu uuid; rid bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public._krot_member(p_room) then raise exception 'not in room'; end if;
  select uid into tu from public.krot_players where room_id = p_room and seat = p_seat;
  if tu is null or tu = auth.uid() then raise exception 'bad player'; end if;
  if coalesce(p_reason, '') not in ('abuse', 'cheat', 'spam', 'afk', 'other') then raise exception 'bad reason'; end if;
  if (select count(*) from public.krot_reports where from_uid = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many reports';
  end if;
  select round_id into rid from public.krot_rooms where id = p_room;
  insert into public.krot_reports (room_id, round_id, from_uid, to_uid, reason, note)
    values (p_room, rid, auth.uid(), tu, p_reason, nullif(left(btrim(coalesce(p_note, '')), 300), ''))
  on conflict (room_id, from_uid, to_uid) do update set reason = excluded.reason,
    note = coalesce(excluded.note, public.krot_reports.note), created_at = now();
  perform public._krot_log(p_room, rid, 'report', jsonb_build_object('seat', p_seat, 'reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- Группы и подбор матча (как в CS2). Группа живёт на главном экране: до 4 человек, вход по коду или ссылке.
--   krot_mm_state()          — «пульс» раз в 2–4 с: состав группы, поиск, найденный матч («Принять»), идущая игра.
--   krot_party_open()        — создать свою группу (если нет): нужен код для приглашения.
--   krot_party_join(code)    — войти в группу друга (её поиск при этом сбрасывается, как в CS2).
--   krot_party_leave()       — выйти из группы;  krot_party_kick(n) — лидер убирает игрока n (по порядку входа).
--   krot_search(true/false)  — лидер начинает поиск, любой участник отменяет.
--   krot_accept()            — «Принять» в окне «Ваша игра готова!».
-- Подбор: группы в поиске по очереди (кто раньше начал) складываются ровно в 4 (4, 3+1, 2+2, 2+1+1, 1+1+1+1);
--   в подбор идут только группы, где все на связи (пульс не старше 20 с).
-- Найден матч → комната kind 'quick', mm = true; её лобби = окно «Принять» (accept, 15 с).
--   Все четверо приняли → через 1,5 с брифинг. Не все → матч не собран: группы, где приняли все, сами
--   возвращаются в поиск (место в очереди сохраняется), группы с не принявшим выходят из поиска. Штрафа нет.
-- Блокировки: сначала рекомендательная 'rush-krot-mm', потом строки комнат. Функции самих комнат группы не трогают.
-- ============================================================
create or replace function public._krot_pcode() returns text language plpgsql volatile as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(a, 1 + public._krot_rnd(32), 1); end loop;
    exit when not exists (select 1 from public.krot_party where code = c);
  end loop;
  return c;
end $$;

-- моя идущая игра: комната не в лобби и не закончена, я в ней (после вскрытия «вышел» — уже не держит)
create or replace function public._krot_game() returns bigint language sql stable as $$
  select p.room_id from public.krot_players p join public.krot_rooms r on r.id = p.room_id
  where p.uid = auth.uid() and (r.phase not in ('lobby', 'done') or (r.phase = 'lobby' and r.mm and r.load_at is not null))
    and not (r.phase in ('open', 'debrief') and p.left_at is not null)
  order by r.id desc limit 1
$$;

create or replace function public._krot_party_new() returns bigint language plpgsql as $$
declare ptid bigint; pr record;
begin
  select name, ava, pid into pr from public.profiles where id = auth.uid();
  insert into public.krot_party (code, leader) values (public._krot_pcode(), auth.uid()) returning id into ptid;
  insert into public.krot_party_members (uid, party_id, name, ava, pid) values (auth.uid(), ptid, coalesce(pr.name, 'Игрок'), pr.ava, pr.pid);
  return ptid;
end $$;

-- событие для всей группы (клиент показывает его один раз — по note_at)
create or replace function public._krot_pnote(p_party bigint, p_kind text, p_names jsonb, p_uids uuid[] default null) returns void language sql as $$
  update public.krot_party set note = jsonb_build_object('kind', p_kind, 'names', coalesce(p_names, '[]'::jsonb), 'uids', to_jsonb(coalesce(p_uids, '{}'::uuid[]))),
    note_at = clock_timestamp(), rev = rev + 1, updated_at = clock_timestamp()
  where id = p_party
$$;

-- убрать человека из группы (вышел, исключён, пропал). Поиск группы при этом сбрасывается.
create or replace function public._krot_party_out(p_uid uuid, p_why text) returns void language plpgsql as $$
declare m public.krot_party_members; pt public.krot_party;
begin
  select * into m from public.krot_party_members where uid = p_uid;
  if m.uid is null then return; end if;
  select * into pt from public.krot_party where id = m.party_id;
  if pt.state = 'match' and exists (select 1 from public.krot_rooms where id = pt.room_id and phase = 'lobby') then
    raise exception 'match pending';   -- идёт «Принять»: выйти можно после
  end if;
  delete from public.krot_party_members where uid = p_uid;
  if not exists (select 1 from public.krot_party_members where party_id = pt.id) then
    delete from public.krot_party where id = pt.id;
    return;
  end if;
  update public.krot_party set
    leader = case when leader = p_uid then (select uid from public.krot_party_members where party_id = pt.id order by joined_at limit 1) else leader end,
    state = case when state = 'search' then 'idle' else state end,
    search_at = case when state = 'search' then null else search_at end
  where id = pt.id;
  perform public._krot_pnote(pt.id, p_why, jsonb_build_array(coalesce(m.name, 'Игрок')), array[p_uid]);
end $$;

-- подбор: складываем группы из очереди ровно в 4 и создаём комнату матча (окно «Принять»)
create or replace function public._krot_mm_match() returns int language plpgsql as $$
declare
  c jsonb := public._krot_cfg(); now_ts timestamptz := clock_timestamp(); made int := 0;
  anc record; q record; pick bigint[]; need int; rid bigint; s int; m record;
begin
  perform pg_advisory_xact_lock(hashtext('rush-krot-mm'));
  loop
    pick := null;
    for anc in select pt.id, count(mb.uid)::int n from public.krot_party pt join public.krot_party_members mb on mb.party_id = pt.id
        where pt.state = 'search' group by pt.id, pt.search_at
        having bool_and(mb.seen_at >= now_ts - interval '20 seconds') order by pt.search_at, pt.id loop
      pick := array[anc.id]; need := 4 - anc.n;
      for q in select pt.id, count(mb.uid)::int n from public.krot_party pt join public.krot_party_members mb on mb.party_id = pt.id
          where pt.state = 'search' and pt.id <> anc.id group by pt.id, pt.search_at
          having bool_and(mb.seen_at >= now_ts - interval '20 seconds') order by pt.search_at, pt.id loop
        exit when need <= 0;
        if q.n <= need then pick := pick || q.id; need := need - q.n; end if;
      end loop;
      exit when need = 0;
      pick := null;
    end loop;
    exit when pick is null;
    insert into public.krot_rooms (code, kind, owner, mm, phase_deadline)
      values (public._krot_code(), 'quick', (select leader from public.krot_party where id = pick[1]), true, now_ts + public._krot_dur(c, 'accept'))
      returning id into rid;
    s := 0;
    for m in select mb.uid, mb.party_id, mb.name, mb.ava, mb.pid, (select count(*) from public.krot_party_members x where x.party_id = mb.party_id) psize
        from public.krot_party_members mb join unnest(pick) with ordinality u(ptid, ord) on u.ptid = mb.party_id
        order by u.ord, mb.joined_at loop
      s := s + 1;
      insert into public.krot_players (room_id, uid, seat, name, ava, pid, seen_at, solo, party_id)
        values (rid, m.uid, s, coalesce(m.name, 'Игрок'), m.ava, m.pid, now_ts, m.psize = 1, m.party_id);
    end loop;
    update public.krot_party set state = 'match', room_id = rid, note = null, rev = rev + 1, updated_at = now_ts where id = any(pick);
    perform public._krot_log(rid, null, 'mm_match', jsonb_build_object('parties', to_jsonb(pick)));
    made := made + 1;
  end loop;
  return made;
end $$;

-- группа после найденного матча: ещё «Принять» / не собрался (снова в поиск или выход) / идёт игра / игра кончилась
create or replace function public._krot_mm_sync(p_party bigint) returns void language plpgsql as $$
declare pt public.krot_party; rm public.krot_rooms; miss jsonb; muids uuid[]; now_ts timestamptz := clock_timestamp();
begin
  select * into pt from public.krot_party where id = p_party;
  if pt.id is null or pt.state <> 'match' then return; end if;
  if pt.room_id is not null then
    perform 1 from public.krot_rooms where id = pt.room_id for no key update;
    perform public._krot_advance(pt.room_id);
    select * into rm from public.krot_rooms where id = pt.room_id;
  end if;
  if rm.id is null then
    update public.krot_party set state = 'idle', room_id = null, search_at = null, rev = rev + 1, updated_at = now_ts where id = p_party;
    return;
  end if;
  if rm.phase = 'lobby' or (rm.phase <> 'done' and rm.round_id is not null) then return; end if;   -- ещё «Принять» или идёт игра
  if rm.round_id is null and rm.load_at is not null then   -- все приняли, но кто-то вышел на загрузке — матч отменён, поиск заново
    update public.krot_party set state = 'idle', room_id = null, search_at = null, rev = rev + 1, updated_at = now_ts where id = p_party;
    perform public._krot_pnote(p_party, 'abort', '[]'::jsonb);
    return;
  end if;
  if rm.round_id is null then   -- матч не собрался: не все приняли
    select jsonb_agg(coalesce(name, 'Игрок') order by seat), array_agg(uid) into miss, muids
      from public.krot_players where room_id = rm.id and party_id = p_party and not ready;
    if miss is null then   -- у нас приняли все — снова в поиск, место в очереди то же
      update public.krot_party set state = 'search', room_id = null, rev = rev + 1, updated_at = now_ts where id = p_party;
      perform public._krot_pnote(p_party, 'requeue', (select jsonb_agg(coalesce(name, 'Игрок') order by seat) from public.krot_players where room_id = rm.id and not ready));
    else
      update public.krot_party set state = 'idle', room_id = null, search_at = null, rev = rev + 1, updated_at = now_ts where id = p_party;
      perform public._krot_pnote(p_party, 'missed', miss, muids);
    end if;
    return;
  end if;
  -- игра закончилась — группа снова свободна
  update public.krot_party set state = 'idle', room_id = null, search_at = null, rev = rev + 1, updated_at = now_ts where id = p_party;
end $$;

-- «пульс» группы: состав, поиск, окно «Принять», идущая игра
create or replace function public.krot_mm_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb := public._krot_cfg(); now_ts timestamptz := clock_timestamp(); me public.krot_party_members; pt public.krot_party; rm public.krot_rooms;
  u uuid; mt jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-krot-mm'));
  select * into me from public.krot_party_members where uid = auth.uid();
  if me.uid is not null then
    update public.krot_party_members set seen_at = now_ts where uid = auth.uid();
    perform public._krot_mm_sync(me.party_id);
    select * into pt from public.krot_party where id = me.party_id;
    if pt.state <> 'match' then   -- закрыл сайт и пропал надолго — выходит из группы сам
      for u in select uid from public.krot_party_members where party_id = pt.id and uid <> auth.uid() and seen_at < now_ts - public._krot_dur(c, 'mm_stale') loop
        perform public._krot_party_out(u, 'gone');
      end loop;
    end if;
    select * into pt from public.krot_party where id = me.party_id;
    if pt.state = 'search' then perform public._krot_mm_match(); select * into pt from public.krot_party where id = me.party_id; end if;
    if pt.state = 'match' and pt.room_id is not null then
      update public.krot_players set seen_at = now_ts where room_id = pt.room_id and uid = auth.uid();
      select * into rm from public.krot_rooms where id = pt.room_id;
      if rm.phase = 'lobby' and rm.load_at is null then
        mt := jsonb_build_object('room', rm.id, 'deadline', public._krot_ms(rm.phase_deadline), 'total', public._krot_dur(c, 'accept'),
          'accepted', (select count(*) from public.krot_players where room_id = rm.id and ready),
          'me_ready', coalesce((select ready from public.krot_players where room_id = rm.id and uid = auth.uid()), false),
          'players', (select jsonb_agg(jsonb_build_object('seat', p.seat, 'ready', p.ready, 'me', p.uid = auth.uid(), 'mine', p.party_id = pt.id) order by p.seat)
            from public.krot_players p where p.room_id = rm.id));
      end if;
    end if;
  end if;
  return jsonb_build_object('now', public._krot_ms(now_ts), 'game', public._krot_game(), 'match', mt,
    'party', case when pt.id is null then null else jsonb_build_object('id', pt.id, 'code', pt.code, 'state', pt.state, 'rev', pt.rev,
      'leader', pt.leader = auth.uid(), 'search_at', public._krot_ms(pt.search_at),
      'note', case when pt.note is null then null else jsonb_build_object('kind', pt.note->>'kind', 'names', pt.note->'names',
        'me', coalesce(pt.note->'uids' ? auth.uid()::text, false), 'at', public._krot_ms(pt.note_at)) end,
      'members', (select jsonb_agg(jsonb_build_object('name', mb.name, 'ava', mb.ava, 'pid', mb.pid, 'me', mb.uid = auth.uid(),
          'leader', mb.uid = pt.leader, 'online', mb.seen_at >= now_ts - interval '20 seconds') order by mb.joined_at)
        from public.krot_party_members mb where mb.party_id = pt.id)) end);
end $$;

create or replace function public.krot_party_open() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-krot-mm'));
  if not exists (select 1 from public.krot_party_members where uid = auth.uid()) then perform public._krot_party_new(); end if;
  return public.krot_mm_state();
end $$;

create or replace function public.krot_party_join(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pt public.krot_party; cur bigint; cd text := upper(btrim(coalesce(p_code, ''))); nm text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-krot-mm'));
  select * into pt from public.krot_party where code = cd;
  if pt.id is null then raise exception 'party not found'; end if;
  select party_id into cur from public.krot_party_members where uid = auth.uid();
  if cur = pt.id then return public.krot_mm_state(); end if;
  perform public._krot_mm_sync(pt.id);
  select * into pt from public.krot_party where id = pt.id;
  if pt.state = 'match' and exists (select 1 from public.krot_rooms where id = pt.room_id and phase = 'lobby') then raise exception 'party busy'; end if;
  if (select count(*) from public.krot_party_members where party_id = pt.id) >= 4 then raise exception 'party full'; end if;
  if cur is not null then perform public._krot_party_out(auth.uid(), 'left'); end if;
  select coalesce(name, 'Игрок') into nm from public.profiles where id = auth.uid();
  insert into public.krot_party_members (uid, party_id, name, ava, pid) select auth.uid(), pt.id, coalesce(p.name, 'Игрок'), p.ava, p.pid from public.profiles p where p.id = auth.uid();
  update public.krot_party set state = case when state = 'search' then 'idle' else state end,
    search_at = case when state = 'search' then null else search_at end where id = pt.id;
  perform public._krot_pnote(pt.id, 'join', jsonb_build_array(coalesce(nm, 'Игрок')), array[auth.uid()]);
  return public.krot_mm_state();
end $$;

create or replace function public.krot_party_leave() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-krot-mm'));
  perform public._krot_party_out(auth.uid(), 'left');
  return public.krot_mm_state();
end $$;

create or replace function public.krot_party_kick(p_n int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ptid bigint; u uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-krot-mm'));
  select p.id into ptid from public.krot_party p join public.krot_party_members mb on mb.party_id = p.id where mb.uid = auth.uid() and p.leader = auth.uid();
  if ptid is null then raise exception 'not leader'; end if;
  select uid into u from public.krot_party_members where party_id = ptid order by joined_at offset greatest(coalesce(p_n, 0) - 1, 0) limit 1;
  if u is null or u = auth.uid() then raise exception 'bad player'; end if;
  perform public._krot_party_out(u, 'kicked');
  return public.krot_mm_state();
end $$;

-- «Играть» (лидер) / отмена поиска (любой участник)
create or replace function public.krot_search(p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.krot_party_members; pt public.krot_party; rm public.krot_rooms;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-krot-mm'));
  select * into me from public.krot_party_members where uid = auth.uid();
  if not coalesce(p_on, true) then
    if me.uid is not null then
      select * into pt from public.krot_party where id = me.party_id;
      if pt.state = 'search' then
        update public.krot_party set state = 'idle', search_at = null where id = pt.id;
        perform public._krot_pnote(pt.id, 'cancel', jsonb_build_array(coalesce(me.name, 'Игрок')), array[auth.uid()]);
      end if;
    end if;
    return public.krot_mm_state();
  end if;
  if me.uid is null then perform public._krot_party_new(); select * into me from public.krot_party_members where uid = auth.uid(); end if;
  perform public._krot_mm_sync(me.party_id);
  select * into pt from public.krot_party where id = me.party_id;
  if pt.leader <> auth.uid() then raise exception 'not leader'; end if;
  if pt.state = 'search' then return public.krot_mm_state(); end if;
  if pt.state = 'match' then
    select * into rm from public.krot_rooms where id = pt.room_id;
    if rm.phase = 'lobby' then return public.krot_mm_state(); end if;
    if rm.phase in ('brief', 'talk', 'vote', 'revote') then raise exception 'in game'; end if;
  end if;
  if exists (select 1 from public.krot_party_members mb join public.krot_players p on p.uid = mb.uid join public.krot_rooms r on r.id = p.room_id
      where mb.party_id = pt.id and r.phase in ('brief', 'talk', 'vote', 'revote') and p.left_at is null) then
    raise exception 'member in game';
  end if;
  update public.krot_party set state = 'search', search_at = clock_timestamp(), room_id = null, note = null, rev = rev + 1, updated_at = clock_timestamp() where id = pt.id;
  update public.krot_party_members set seen_at = clock_timestamp() where uid = auth.uid();
  perform public._krot_mm_match();
  return public.krot_mm_state();
end $$;

-- игра у игрока загрузилась (экран загрузки → «готов»)
create or replace function public.krot_loaded(p_room bigint) returns jsonb
language plpgsql security definer set search_path = public as $x$
declare me public.krot_players;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform 1 from public.krot_rooms where id = p_room for no key update;
  me := public._krot_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  if not me.loaded then
    update public.krot_players set loaded = true where room_id = p_room and uid = auth.uid();
    update public.krot_rooms set rev = rev + 1, updated_at = clock_timestamp() where id = p_room;
  end if;
  perform public._krot_advance(p_room);
  return public.krot_tick(p_room);
end $x$;

-- «Принять» в окне «Ваша игра готова!»
create or replace function public.krot_accept() returns jsonb
language plpgsql security definer set search_path = public as $$
declare pt public.krot_party; rm public.krot_rooms;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-krot-mm'));
  select p.* into pt from public.krot_party p join public.krot_party_members mb on mb.party_id = p.id where mb.uid = auth.uid();
  if pt.id is null or pt.state <> 'match' or pt.room_id is null then raise exception 'no match'; end if;
  perform 1 from public.krot_rooms where id = pt.room_id for no key update;
  perform public._krot_advance(pt.room_id);
  select * into rm from public.krot_rooms where id = pt.room_id;
  if rm.phase <> 'lobby' then
    if rm.round_id is null then raise exception 'too late'; end if;
    return public.krot_mm_state();   -- уже стартовали
  end if;
  update public.krot_players set ready = true, seen_at = clock_timestamp() where room_id = rm.id and uid = auth.uid();
  update public.krot_rooms set rev = rev + 1, updated_at = clock_timestamp() where id = rm.id;
  perform public._krot_advance(rm.id);
  return public.krot_mm_state();
end $$;

-- ---------- закрытый канал Realtime 'krot:<room_id>' — только участники комнаты ----------
do $do$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "krot: members receive" on realtime.messages';
    execute 'drop policy if exists "krot: members send" on realtime.messages';
    execute $p$create policy "krot: members receive" on realtime.messages for select to authenticated using (
      realtime.topic() ~ '^krot:[0-9]{1,18}$' and public._krot_member(split_part(realtime.topic(), ':', 2)::bigint))$p$;
    execute $p$create policy "krot: members send" on realtime.messages for insert to authenticated with check (
      realtime.topic() ~ '^krot:[0-9]{1,18}$' and public._krot_member(split_part(realtime.topic(), ':', 2)::bigint))$p$;
  end if;
exception when others then raise notice 'krot: политика Realtime не создана (%), голос подключим на этапе 3', sqlerrm;
end $do$;

-- ============================================================
-- Самопроверка: генератор (много раундов), подсчёт голосов по ТЗ 2.7–2.8, commit–reveal, фильтр чата.
-- Запуск вручную: select public.krot_selftest(5000);
-- ============================================================
create or replace function public.krot_selftest(p_n int default 2000) returns jsonb language plpgsql as $$
declare
  g jsonb; e text; fails int := 0; errs jsonb := '[]'::jsonb; pos int[] := array[0, 0, 0, 0]; pat jsonb := '{}'::jsonb;
  i int; t int; cs jsonb; r jsonb; bad jsonb := '[]'::jsonb; skew boolean := false; ok_hash boolean; ok_chat boolean;
  bx jsonb := '[{"n":1,"sym":"tri","gun":"pistol","col":"red"},{"n":2,"sym":"tri","gun":"pistol","col":"blue"},
               {"n":3,"sym":"hex","gun":"rifle","col":"red"},{"n":4,"sym":"hex","gun":"rifle","col":"blue"}]';
begin
  -- 1) генератор
  for i in 1..greatest(p_n, 1) loop
    g := public._krot_gen(33);
    t := (g->>'target')::int;
    e := public._krot_check(g->'boxes', t);
    if e is not null then
      fails := fails + 1;
      if jsonb_array_length(errs) < 5 then errs := errs || jsonb_build_array(jsonb_build_object('err', e, 'gen', g)); end if;
    end if;
    pos[t] := pos[t] + 1;
    pat := pat || jsonb_build_object(g->>'pattern', coalesce((pat->>(g->>'pattern'))::int, 0) + 1);
  end loop;
  if p_n >= 1000 then   -- цель должна выпадать на любое место примерно поровну
    skew := exists (select 1 from unnest(pos) x where x < p_n * 0.18 or x > p_n * 0.32);
  end if;
  -- проверка ловит плохие таблицы (защита от ошибок в самой проверке)
  if public._krot_check(bx, 1) is not null then bad := bad || '["ок-таблица забракована"]'::jsonb; end if;
  if public._krot_check('[{"n":1,"sym":"tri","gun":"pistol","col":"amber"},{"n":2,"sym":"circle","gun":"rifle","col":"red"},
      {"n":3,"sym":"hex","gun":"rifle","col":"green"},{"n":4,"sym":"tri","gun":"sniper","col":"green"}]', 3) is null then
    bad := bad || '["таблица-пример из ТЗ 2.3 (одиночные признаки) принята"]'::jsonb;
  end if;
  if public._krot_check('[{"n":1,"sym":"tri","gun":"pistol","col":"red"},{"n":2,"sym":"tri","gun":"rifle","col":"blue"},
      {"n":3,"sym":"hex","gun":"pistol","col":"blue"},{"n":4,"sym":"hex","gun":"rifle","col":"red"}]', 1) is null then
    bad := bad || '["таблица без правдоподобной лжи принята"]'::jsonb;
  end if;
  -- 2) подсчёт: голоса трёх Оперативников → итог
  for cs in select * from jsonb_array_elements('[
      {"v":[3,3,1],"res":"chosen","box":3}, {"v":[2,2,2],"res":"chosen","box":2}, {"v":[4,null,4],"res":"chosen","box":4},
      {"v":[1,2,null],"res":"revote","cands":[1,2]}, {"v":[3,1,2],"res":"revote","cands":[1,2,3]},
      {"v":[1,null,null],"res":"cancel"}, {"v":[null,null,null],"res":"cancel"}]'::jsonb) loop
    r := public._krot_tally(array(select x::int from jsonb_array_elements_text(cs->'v') x));
    if r->>'res' <> cs->>'res' or (cs ? 'box' and r->>'box' is distinct from cs->>'box') or (cs ? 'cands' and r->'cands' <> cs->'cands') then
      bad := bad || jsonb_build_array(jsonb_build_object('case', cs, 'got', r));
    end if;
  end loop;
  for cs in select * from jsonb_array_elements('[
      {"c":[1,2],"v1":[1,2,null],"v2":[2,null,null],"res":"chosen","box":2},
      {"c":[1,2],"v1":[1,2,null],"v2":[null,null,1],"res":"chosen","box":1},
      {"c":[1,2],"v1":[1,2,null],"v2":[null,null,null],"res":"split"},
      {"c":[1,2],"v1":[1,2,null],"v2":[2,1,null],"res":"split"},
      {"c":[1,2,3],"v1":[1,2,3],"v2":[2,2,null],"res":"chosen","box":2},
      {"c":[1,2,3],"v1":[1,2,3],"v2":[2,3,1],"res":"split"}]'::jsonb) loop
    r := public._krot_tally2(array(select x::int from jsonb_array_elements_text(cs->'c') x),
      array(select x::int from jsonb_array_elements_text(cs->'v1') x), array(select x::int from jsonb_array_elements_text(cs->'v2') x));
    if r->>'res' <> cs->>'res' or (cs ? 'box' and r->>'box' is distinct from cs->>'box') then
      bad := bad || jsonb_build_array(jsonb_build_object('case', cs, 'got', r));
    end if;
  end loop;
  -- 3) commit–reveal: sha256 как в браузере (crypto.subtle), другая цель — другой хеш
  ok_hash := public._krot_hash('abc') = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    and public._krot_hash(public._krot_proof(7, bx, 2, 'salt')) <> public._krot_hash(public._krot_proof(7, bx, 3, 'salt'))
    and public._krot_proof(7, bx, 2, 's') = 'RUSHKROT|7|1:tri:pistol:red;2:tri:pistol:blue;3:hex:rifle:red;4:hex:rifle:blue|2|s';
  -- 4) фильтр чата: мат прячется, обычные слова — нет
  ok_chat := public._krot_clean('ну ты ХУЙ') = 'ну ты ***' and public._krot_clean('xyйня какая') = '***** какая'
    and public._krot_clean('ПИЗДЕЦ!') = '*******' and public._krot_clean('два рубля, небанально, застрахуй, сукно') = 'два рубля, небанально, застрахуй, сукно'
    and public._krot_clean('цель 03 зелёная') = 'цель 03 зелёная';
  return jsonb_build_object('ok', fails = 0 and not skew and bad = '[]'::jsonb and ok_hash and ok_chat,
    'rounds', p_n, 'gen_fails', fails, 'gen_errors', errs, 'target_pos', to_jsonb(pos), 'target_skew', skew, 'patterns', pat,
    'rules_bad', bad, 'hash_ok', ok_hash, 'chat_ok', ok_chat);
end $$;

-- ---------- права на функции ----------
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like '\_krot%' or p.proname like 'krot\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
grant execute on function public._krot_member(bigint) to authenticated;   -- нужна политикам чтения
grant execute on function public.krot_state(bigint, bigint), public.krot_tick(bigint), public.krot_leave(bigint),
  public.krot_create(boolean), public.krot_join(text), public.krot_quick(), public.krot_ready(bigint, boolean),
  public.krot_vote(bigint, int, uuid), public.krot_chat_send(bigint, text), public.krot_report(bigint, int, text, text),
  public.krot_mm_state(), public.krot_party_open(), public.krot_party_join(text), public.krot_party_leave(), public.krot_party_kick(int),
  public.krot_search(boolean), public.krot_accept(), public.krot_loaded(bigint) to authenticated;
-- krot_selftest — только из SQL Editor

select public.krot_selftest(2000) as "КРОТ: самопроверка";

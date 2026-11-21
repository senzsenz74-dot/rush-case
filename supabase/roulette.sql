-- ============================================================
-- RUSH CASE — режим «РУССКАЯ РУЛЕТКА» (заменяет «Крота»), этап 2: сервер.
-- План — ПЛАН_РУЛЕТКА.md, ход работы — ЖУРНАЛ.md (20.11.2026). Образец — supabase/krot.sql.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- В конце файл сам прогоняет самопроверку (rr_selftest) — в ответе должно быть "ok": true.
-- Свои таблицы и функции rr_*: «Крот» (krot_*) на сайте работает как раньше, пока рулетку не выложат.
--
-- Правила: за столом ровно 5 игроков. Револьвер на 6 гнёзд; игра начинается с 1 патрона; купленные голосованием патроны остаются и в следующих раундах (владелец 21.11), всего не больше 4
--   (владелец 21.11: максимум 4, два гнезда всегда пустые). Внутри раунда +1 патрон — только голосованием живых: начал — рука вверх,
--   нужно не меньше половины «за» (rr_vote_start / rr_vote), в игре на деньги из банка — половина самой маленькой ставки (все по 100 → 50 ₽); не больше 4.
--   Предложить патрон может только тот, кто выстрелил и выжил, и только пока следующий не выстрелил (один ход; владелец 21.11). В финале (вдвоём) — нельзя.
-- Деньги (владелец 21.11): только быстрая игра (без ботов и не группа из 5 друзей — там же, где очки). На старте у каждого списывается
--   100 ₽ (у кого меньше — поиск и запуск не проходят), за 15 с знакомства ставку можно поднять (rr_bet). Победитель забирает с каждого
--   не больше своей ставки (остальное возвращается проигравшему), минус купленные патроны (vspent), минус 5% сайту (site_cfg 'rr': fee).
--   Игра админа с ботами — тоже на деньги, если людей хотя бы двое: ставят только люди, боты не ставят, банк — лучшему из людей (_rr_money_on).
--   Патроны — в случайных гнёздах. Кто стреляет первым в раунде — случайно, дальше по кругу (по возрастанию места).
--   В свой ход (20 с) можно крутить барабан сколько угодно раз, потом выстрел в себя. Не крутил — выстрел из следующего гнезда.
--   Не успел — выстрел сам, без прокрутки; вышел из игры — то же, но сразу (через 2 с после начала его хода).
--   Раунд — до первой смерти, потом пауза 5 с. Последний живой — 1-е место.
-- Фазы комнаты: lobby → next (15 с знакомства, game.round = 0) → play (ход: phase_at — начало хода, deadline — конец) → next (5 с после выстрела) → … → done.
--   Все ушли со стола (никто не на связи 45 с) — игра доигрывается сама сразу, выстрелами без прокрутки.
-- Очки недели (быстрая игра): 1-е место 10, 2-е — 6, 3-е — 3, 4-е — 1, 5-е — 0, дневной потолок 300 (site_cfg k='rr').
--   Комната друзей — без очков; группа из 5 друзей, которую подбор собрал саму с собой, — тоже без очков (решение владельца 20.11).
-- Честность (проверяемо): в начале раунда сервер берёт случайный seed и сразу публикует commit = sha256(proof),
--   proof = 'RUSHRR|<игра>|<раунд>|<места живых через запятую>|<патронов>|<seed>'. Всё в раунде выводится из seed:
--   h(тег) = первые 8 hex-знаков sha256('<seed>:<тег>') как число;
--   патроны — гнёзда 0–5, упорядоченные по h('c0')…h('c5'), первые <патронов>; патрон за голосование — следующий по этому порядку;
--   первый стрелок — места живых по возрастанию, номер h('f') mod <живых>;
--   гнездо в начале раунда — h('p0') mod 6, после k-й прокрутки в раунде — h('p<k>') mod 6; пустой выстрел — гнездо +1 (mod 6).
--   После выстрела боевым seed и proof раунда открываются (game.rounds) — любой может пересчитать.
-- Тайна: где патроны и seed идущего раунда — только в rr_games, из браузера она не читается.
--
-- Как пользуется сайт (js/krot.js; имена krot_* сайт сам меняет на rr_*):
--   rr_quick() / rr_create(true) / rr_join('КОД') → снимок комнаты (как rr_state); 'rejoin': true — вернули в идущую игру.
--   rr_tick(room) каждые 3 с — «пульс» и ленивый таймер; изменился rev (или Realtime по rr_rooms) → rr_state(room, номер_сообщения).
--   rr_spin(room, n) / rr_shoot(room, n) — n = game.n (номер хода): защита от двойного нажатия.
--   rr_bet(room, ₽) — ставка за 15 с знакомства; rr_vote_start(room) / rr_vote(room, да/нет) — голосование за патрон.
--   rr_ready, rr_loaded, rr_leave, rr_chat_send, rr_report; подбор и группы — rr_mm_state, rr_party_*, rr_search, rr_accept.
--   Закрытый канал Realtime 'rr:<room_id>' — только участники комнаты (голос, поворот головы).
-- ============================================================

-- ---------- таблицы ----------
create table if not exists public.rr_rooms (
  id bigserial primary key,
  code text not null,                       -- код комнаты (6 знаков) — для приглашения друзей
  kind text not null check (kind in ('quick', 'private')),
  owner uuid,                               -- кто создал (переходит к следующему, если ушёл из лобби)
  mm boolean not null default false,        -- собрана подбором: лобби = окно «Принять»
  phase text not null default 'lobby' check (phase in ('lobby', 'play', 'next', 'done')),
  phase_at timestamptz not null default now(),   -- начало фазы (в play — начало хода)
  phase_deadline timestamptz,                    -- конец фазы (null — ждём игроков)
  load_at timestamptz,                           -- все приняли: экран загрузки (проверка микрофона) до старта
  game_id bigint,                                -- игра началась
  points boolean not null default false,         -- за игру начисляются очки недели (решается на старте)
  rev int not null default 1,                    -- растёт при каждом изменении — сигнал клиенту перечитать снимок
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rr_rooms_code on public.rr_rooms (code) where phase <> 'done';
create index if not exists rr_rooms_lobby on public.rr_rooms (kind, id) where phase = 'lobby';

create table if not exists public.rr_players (
  room_id bigint not null references public.rr_rooms on delete cascade,
  uid uuid not null references public.profiles (id) on delete cascade,
  seat smallint not null check (seat between 1 and 5),
  name text, ava text, pid bigint,            -- снимок профиля на момент входа
  ready boolean not null default false,
  loaded boolean not null default false,      -- игра у игрока загрузилась (rr_loaded)
  solo boolean not null default true,         -- искал игру один
  party_id bigint,
  seen_at timestamptz not null default now(), -- последний «пульс»
  left_at timestamptz,                        -- вышел посреди игры
  joined_at timestamptz not null default now(),
  alive boolean not null default true,
  place smallint,                             -- место: выбыл первым — 5, победитель — 1
  pts int,                                    -- начислено очков недели (null — игра без очков или не кончилась)
  clicks int not null default 0,              -- пережитые пустые выстрелы
  spins int not null default 0,               -- прокрутки барабана
  primary key (room_id, uid),
  unique (room_id, seat)
);
create index if not exists rr_players_uid on public.rr_players (uid);
-- боты (владелец 20.11): админ добавляет их в комнату друзей кнопкой «+ Бот»; uid бота — случайный, профиля нет (поэтому без ссылки на profiles)
alter table public.rr_players add column if not exists bot boolean not null default false;
alter table public.rr_players drop constraint if exists rr_players_uid_fkey;
-- деньги (владелец 21.11)
alter table public.rr_players add column if not exists bet int;        -- ставка ₽ (null — игра без денег)
alter table public.rr_players add column if not exists back numeric;   -- возвращено после игры (часть ставки сверх ставки победителя)
alter table public.rr_players add column if not exists won numeric;    -- выплачено победителю
alter table public.rr_rooms add column if not exists money boolean not null default false;   -- игра на деньги (решается на старте)

create table if not exists public.rr_games (   -- барабан и ход; из браузера не читается (тайна: где патроны)
  id bigserial primary key,
  room_id bigint not null unique references public.rr_rooms on delete cascade,
  round smallint not null default 0,
  seats smallint[],                         -- места живых в начале раунда (входят в proof)
  bullets smallint,
  seed text,                                -- СЕКРЕТ до выстрела боевым
  commit text,                              -- sha256(proof) — виден сразу
  chambers smallint[],                      -- СЕКРЕТ: гнёзда с патронами (0–5)
  pos smallint,                             -- СЕКРЕТ: гнездо напротив ствола
  rspins int not null default 0,            -- прокруток в раунде (номер k для h('p<k>'))
  turn smallint, first smallint,
  clicks smallint not null default 0,       -- пустых щелчков подряд после последней прокрутки (шанс b / (6 − k))
  spins smallint not null default 0,        -- прокруток в текущем ходе
  n int not null default 0,                 -- номер хода (p_turn в rr_spin / rr_shoot)
  evn int not null default 0,
  evs jsonb not null default '[]'::jsonb,   -- последние 12 событий стола
  rounds jsonb not null default '[]'::jsonb,   -- раскрытые раунды (seed, proof, патроны)
  last_spin timestamptz,
  winner smallint,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.rr_games add column if not exists bot_n int;            -- ход бота (n), для которого план ниже
alter table public.rr_games add column if not exists bot_at timestamptz;   -- когда бот сделает следующее действие
alter table public.rr_games add column if not exists bot_spins smallint;   -- сколько ещё раз бот крутит перед выстрелом
alter table public.rr_games add column if not exists bul0 smallint;                          -- патронов в начале раунда (входит в proof)
alter table public.rr_games add column if not exists added smallint not null default 0;      -- добавлено голосованием в этом раунде
alter table public.rr_games add column if not exists votes int not null default 0;           -- принятых голосований за игру
alter table public.rr_games add column if not exists vspent numeric not null default 0;      -- потрачено из банка на патроны (₽)
alter table public.rr_games add column if not exists vote jsonb;                             -- идущее голосование {by, at, until, need, yes, no, rem, cost}
alter table public.rr_games add column if not exists vused smallint[] not null default '{}'; -- кто уже начинал голосование в этом раунде (для журнала)
alter table public.rr_games add column if not exists vby smallint;   -- кто последним выстрелил и выжил — он может предложить патрон…
alter table public.rr_games add column if not exists vn int;         -- …только в этот ход (n); предложил — null

create table if not exists public.rr_chat (
  id bigserial primary key,                 -- серверный порядковый номер (догрузка после переподключения)
  room_id bigint not null references public.rr_rooms on delete cascade,
  uid uuid, seat smallint, name text,       -- у системных сообщений пусто
  kind text not null default 'msg' check (kind in ('msg', 'sys')),
  text text not null check (char_length(text) between 1 and 400),
  created_at timestamptz not null default now()
);
create index if not exists rr_chat_room on public.rr_chat (room_id, id);
create index if not exists rr_chat_uid on public.rr_chat (uid, created_at) where uid is not null;

create table if not exists public.rr_points (   -- очки быстрой игры по дням (неделя = сумма дней; дневной потолок)
  uid uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  pts int not null default 0,
  games int not null default 0,
  wins int not null default 0,
  primary key (uid, day)
);
alter table public.rr_points add column if not exists won numeric not null default 0;   -- выиграно ₽ (владелец 21.11: в рейтинг)

create table if not exists public.rr_reports (   -- жалобы (разбирает админка)
  id bigserial primary key,
  room_id bigint not null references public.rr_rooms on delete cascade,
  game_id bigint,
  from_uid uuid not null,
  to_uid uuid not null,
  reason text not null check (reason in ('abuse', 'cheat', 'spam', 'afk', 'other')),
  note text,
  status text not null default 'new' check (status in ('new', 'ok', 'ban')),
  created_at timestamptz not null default now(),
  unique (room_id, from_uid, to_uid)
);

create table if not exists public.rr_log (       -- журнал событий игры (каждый выстрел, прокрутка, seed раунда)
  id bigserial primary key,
  room_id bigint, game_id bigint, uid uuid,
  kind text not null,
  data jsonb,
  at timestamptz not null default now()
);
create index if not exists rr_log_room on public.rr_log (room_id, id);
create index if not exists rr_log_uid on public.rr_log (uid, kind, at);

-- группы и подбор (как в CS2): до 5 человек, вход по коду
create table if not exists public.rr_party (
  id bigserial primary key,
  code text not null,
  leader uuid not null,
  state text not null default 'idle' check (state in ('idle', 'search', 'match')),
  search_at timestamptz,                    -- начало поиска: очередь — кто раньше начал
  room_id bigint,                           -- state 'match': найденная игра (окно «Принять»), потом сама игра
  note jsonb,                               -- последнее событие для всей группы: {kind, names, uids}
  note_at timestamptz,
  rev int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rr_party_code on public.rr_party (code);
alter table public.rr_party add column if not exists bots text[] not null default '{}';   -- боты лобби (имена; добавляет админ, владелец 20.11)
create index if not exists rr_party_search on public.rr_party (search_at) where state = 'search';
create table if not exists public.rr_party_members (
  uid uuid primary key references public.profiles (id) on delete cascade,   -- человек — не больше чем в одной группе
  party_id bigint not null references public.rr_party on delete cascade,
  name text, ava text, pid bigint,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now()  -- «пульс» (rr_mm_state раз в 2–4 с)
);
create index if not exists rr_party_members_party on public.rr_party_members (party_id, joined_at);

-- ---------- доступ: всё меняется только функциями ниже ----------
alter table public.rr_rooms enable row level security;
alter table public.rr_players enable row level security;
alter table public.rr_games enable row level security;
alter table public.rr_chat enable row level security;
alter table public.rr_points enable row level security;
alter table public.rr_reports enable row level security;
alter table public.rr_log enable row level security;
alter table public.rr_party enable row level security;
alter table public.rr_party_members enable row level security;
revoke all on public.rr_rooms, public.rr_players, public.rr_games, public.rr_chat, public.rr_points, public.rr_reports,
  public.rr_log, public.rr_party, public.rr_party_members from anon, authenticated;

-- участник комнаты (для политик чтения и закрытого канала Realtime)
create or replace function public._rr_member(p_room bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rr_players where room_id = p_room and uid = auth.uid())
$$;

drop policy if exists "rr_rooms: members" on public.rr_rooms;
create policy "rr_rooms: members" on public.rr_rooms for select to authenticated using (public._rr_member(id));
drop policy if exists "rr_players: members" on public.rr_players;
create policy "rr_players: members" on public.rr_players for select to authenticated using (public._rr_member(room_id));
drop policy if exists "rr_chat: members" on public.rr_chat;
create policy "rr_chat: members" on public.rr_chat for select to authenticated using (public._rr_member(room_id));
drop policy if exists "rr_points: own" on public.rr_points;
create policy "rr_points: own" on public.rr_points for select to authenticated using (uid = auth.uid());
-- rr_games, rr_reports, rr_log, rr_party* — политик нет: из браузера не читаются вообще
grant select on public.rr_rooms, public.rr_players, public.rr_chat, public.rr_points to authenticated;

-- мгновенные обновления: фаза/состав (rr_rooms.rev) и чат; Realtime сам отсекает чужие комнаты по политикам выше
do $$ begin
  begin alter publication supabase_realtime add table public.rr_rooms; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.rr_chat; exception when duplicate_object then null; end;
exception when undefined_object then raise notice 'rr: нет публикации supabase_realtime';
end $$;

-- ---------- настройки и мелкие помощники ----------
-- числа по умолчанию; переопределяются записью site_cfg k='rr' (только нужные поля), например {"turn": 25, "pts": {"1": 12}}
create or replace function public._rr_cfg() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'turn', 20,          -- секунд на ход
    'next', 5,           -- пауза после выстрела боевым
    'intro', 15,         -- после загрузки: знакомство за столом до раунда 1 (владелец 20.11, без надписей на экране)
    'round_delay', 5,    -- заставка «Раунд N» и жребий: револьвер крутится в центре и показывает на первого (владелец 21.11) — до первого хода
    'click_delay', 1.4,  -- после пустого щелчка — до хода следующего
    'gone_shot', 2,      -- вышел из игры: выстрел за него через столько секунд после начала его хода
    'spin_gap', 0.8,     -- прокрутки не чаще (сайт сам ждёт 1,25 с)
    'bul', jsonb_build_object('5', 1, '4', 1, '3', 1, '2', 1), 'max_bul', 4,   -- владелец 21.11: в каждом раунде 1 патрон (дальше — покупают голосованием), максимум 4, два гнезда всегда пустые          -- патронов при стольких живых
    'pts', jsonb_build_object('1', 10, '2', 6, '3', 3, '4', 1, '5', 0), -- очки по местам
    'day_cap', 300,
    'lobby', 20, 'ready', 3,   -- открытое лобби быстрой игры: старт через 20 с после пятого, все «Готов» — через 3 с
    'offline', 15,       -- без «пульса» столько секунд — игрок «нет связи»
    'reconnect', 30,     -- + столько — и игрок не считается за столом (все так — игра доигрывается сама)
    'stale', 30,         -- в лобби пропавшего убираем с места через столько секунд
    'chat_len', 300, 'chat_gap', 1, 'chat_burst', 5, 'chat_burst_s', 10, 'chat_repeat_s', 60,
    'accept', 15,        -- окно «Ваша игра готова!» — столько секунд на «Принять»
    'load', 10,          -- экран загрузки после «Принять»: проверка микрофона и звука
    'load_max', 25,      -- кто не загрузился — ждём его до стольких секунд, потом старт без него
    'mm_stale', 45,      -- без «пульса» столько секунд — человек выходит из группы
    'min_bet', 100, 'max_bet', 100000, 'fee', 0.05,   -- деньги (владелец 21.11): ставка от / до ₽, комиссия сайта с банка
    'vote_pct', 0.5, 'vote_sec', 10)                   -- патрон из банка: доля самой маленькой ставки (100 → 50 ₽); секунд на голосование
  || coalesce((select v from public.site_cfg where k = 'rr' and jsonb_typeof(v) = 'object'), '{}'::jsonb)
$$;
create or replace function public._rr_dur(c jsonb, k text) returns interval language sql immutable as $$
  select make_interval(secs => greatest(0, coalesce((c->>k)::float8, 1)))
$$;
-- текущее время (одно место — проверка на PGlite подменяет его, чтобы «прокручивать» таймеры)
create or replace function public._rr_now() returns timestamptz language sql volatile as $$ select clock_timestamp() $$;
create or replace function public._rr_ms(t timestamptz) returns bigint language sql immutable as $$
  select (extract(epoch from t) * 1000)::bigint
$$;
-- случайное 0..n-1 из криптостойкого генератора (gen_random_uuid)
create or replace function public._rr_rnd(n int) returns int language sql volatile as $$
  select (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % greatest(n, 1))::int
$$;
create or replace function public._rr_hash(s text) returns text language sql immutable as $$
  select encode(sha256(convert_to(s, 'UTF8')), 'hex')
$$;
-- h(тег) из seed раунда: первые 8 hex-знаков sha256('<seed>:<тег>') как число 0 … 4294967295
create or replace function public._rr_h(p_seed text, p_tag text) returns bigint language sql immutable as $$
  select ('x' || substr(encode(sha256(convert_to(p_seed || ':' || p_tag, 'UTF8')), 'hex'), 1, 8))::bit(32)::bigint
$$;
-- гнёзда с патронами: 0–5 по возрастанию h('c<i>'), первые p_n (ответ — по возрастанию номера гнезда)
create or replace function public._rr_chambers(p_seed text, p_n int) returns smallint[] language sql immutable as $$
  select array(select x::smallint from (select i as x from generate_series(0, 5) i
    order by public._rr_h(p_seed, 'c' || i), i limit greatest(1, least(coalesce(p_n, 1), 5))) q order by x)
$$;
create or replace function public._rr_proof(p_game bigint, p_round int, p_seats smallint[], p_bul int, p_seed text) returns text language sql immutable as $$
  select format('RUSHRR|%s|%s|%s|%s|%s', p_game, p_round, array_to_string(p_seats, ','), p_bul, p_seed)
$$;
-- строчные буквы без зависимости от локали базы (кириллица)
create or replace function public._rr_low(t text) returns text language sql immutable as $$
  select lower(translate(t, 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'))
$$;
-- фильтр чата: маскирует мат звёздочками (как в «Кроте»)
create or replace function public._rr_clean(t text) returns text language sql immutable as $$
  select coalesce(string_agg(case when translate(regexp_replace(public._rr_low(w), '[^a-zа-яё]', '', 'g'), 'aceopxyё', 'асеорхуе')
      ~ '^(на|по|о|ни|за|от|до)?ху[йяеиюё]|пизд|^(вы|за|у|от|отъ|съ|раз|разъ|на|по|до|при|про|недо|долбо)?еб(а|у|л|и|н|ы|ш)|^бля|пид[оа]р|мудак|мудил|гандон|шлюх|^сук(а|и|у)$|^чмо$|^чмош'
    then repeat('*', char_length(w)) else w end, ' ' order by i), '')
  from unnest(string_to_array(t, ' ')) with ordinality as x(w, i)
$$;
create or replace function public._rr_code() returns text language plpgsql volatile as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v text; i int;
begin
  loop
    v := '';
    for i in 1..6 loop v := v || substr(a, 1 + public._rr_rnd(32), 1); end loop;
    exit when not exists (select 1 from public.rr_rooms where code = v and phase <> 'done');
  end loop;
  return v;
end $$;
create or replace function public._rr_pcode() returns text language plpgsql volatile as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v text; i int;
begin
  loop
    v := '';
    for i in 1..6 loop v := v || substr(a, 1 + public._rr_rnd(32), 1); end loop;
    exit when not exists (select 1 from public.rr_party where code = v);
  end loop;
  return v;
end $$;
-- служебное сообщение в чат (сайт их не показывает — решение владельца 20.11; нужны для журнала и проверки)
create or replace function public._rr_sys(p_room bigint, p_text text) returns void language sql as $$
  insert into public.rr_chat (room_id, kind, text, created_at) values (p_room, 'sys', left(p_text, 400), public._rr_now())
$$;
create or replace function public._rr_log(p_room bigint, p_game bigint, p_kind text, p_data jsonb) returns void language sql as $$
  insert into public.rr_log (room_id, game_id, uid, kind, data, at) values (p_room, p_game, auth.uid(), p_kind, p_data, public._rr_now())
$$;
-- событие стола (начало раунда, прокрутка, щелчок, выстрел) — сайт по нему играет звук, надпись и 3D
create or replace function public._rr_ev(p_room bigint, p_kind text, p_seat int, p_x jsonb) returns void language plpgsql as $$
declare g public.rr_games; e jsonb; arr jsonb;
begin
  select * into g from public.rr_games where room_id = p_room for update;
  e := jsonb_build_object('n', g.evn + 1, 'kind', p_kind, 'seat', p_seat, 'at', public._rr_ms(public._rr_now())) || coalesce(p_x, '{}'::jsonb);
  arr := g.evs || jsonb_build_array(e);
  while jsonb_array_length(arr) > 12 loop arr := arr - 0; end loop;
  update public.rr_games set evn = g.evn + 1, evs = arr where id = g.id;
end $$;
-- будут ли очки (и рейтинг): быстрая игра без ботов, кроме группы из 5 друзей, собравшейся сама с собой;
-- игра с ботами — тоже, если людей хотя бы двое (как деньги, владелец 22.11): очки, игры, победы и выигрыш — только людям
create or replace function public._rr_pts_on(p_room bigint) returns boolean language sql stable as $$
  select (r.kind = 'quick' and not exists (select 1 from public.rr_players b where b.room_id = r.id and b.bot) and not coalesce((select count(*) = 5 and count(distinct p.party_id) = 1 and bool_and(p.party_id is not null)
    from public.rr_players p where p.room_id = r.id), false))
    or (exists (select 1 from public.rr_players b where b.room_id = r.id and b.bot)
      and (select count(*) from public.rr_players h where h.room_id = r.id and not h.bot) >= 2)
  from public.rr_rooms r where r.id = p_room
$$;

-- ---------- боты ----------
-- админ: владелец или сотрудник (is_staff из staff_perms.sql; если её нет — is_admin; если нет и её — никто)
create or replace function public._rr_staff() returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  begin return coalesce(public.is_staff(), false); exception when undefined_function then null; end;
  begin return coalesce(public.is_admin(), false); exception when undefined_function then return false; end;
end $$;
-- реплика бота в чат (как в демо): turn — свой ход, click — пусто, bang — кого-то убило
create or replace function public._rr_bot_say(p_room bigint, p_seat int, p_kind text) returns void language plpgsql as $$
declare p public.rr_players; l text[] := case p_kind
  when 'turn' then array['Ну, с богом.', 'Моя очередь…', 'Руки трясутся, честно.', 'Давай уже.', 'Ладно, поехали.']
  when 'click' then array['Фух.', 'Пусто!', 'Живой.', 'Следующий!']
  when 'bang' then array['Минус один…', 'Жёстко.', 'Вот и раунд.', 'Ох.']
  else array['Ага.', 'Посмотрим.', 'Удачи всем.', 'Не тяни.'] end;
begin
  select * into p from public.rr_players where room_id = p_room and seat = p_seat and bot and alive;
  if p.uid is null then return; end if;
  insert into public.rr_chat (room_id, uid, seat, name, kind, text, created_at)
    values (p_room, p.uid, p.seat, p.name || ' · БОТ', 'msg', l[1 + floor(random() * cardinality(l))::int], public._rr_now());
end $$;
-- прокрутка барабана места p_seat (и для игрока — rr_spin, и для бота): гнездо — h('p<k>') из seed раунда
-- ---------- деньги и голосование (владелец 21.11) ----------
-- игра на деньги: быстрая игра с очками; игра админа с ботами — тоже, если людей хотя бы двое (ставят только люди, банк — лучшему из людей)
create or replace function public._rr_money_on(p_room bigint) returns boolean language sql stable as $$
  select public._rr_pts_on(p_room) or (exists (select 1 from public.rr_players b where b.room_id = p_room and b.bot)
    and (select count(*) from public.rr_players h where h.room_id = p_room and not h.bot) >= 2)
$$;
-- баланс игрока (profiles.data.balance): + / −; меньше нуля — 'low balance'; профиля нет — null
create or replace function public._rr_bal(p_uid uuid, p_add numeric) returns numeric language plpgsql as $$
declare b numeric;
begin
  select coalesce((data->>'balance')::numeric, 0) into b from public.profiles where id = p_uid for update;
  if not found then return null; end if;
  if round(b + p_add, 2) < 0 then raise exception 'low balance'; end if;
  update public.profiles set data = jsonb_set(coalesce(data, '{}'::jsonb), '{balance}', to_jsonb(round(b + p_add, 2))) where id = p_uid;
  return round(b + p_add, 2);
end $$;

-- цена патрона (владелец 21.11): половина самой маленькой ставки за столом; игра без денег — 0
create or replace function public._rr_vcost(p_room bigint) returns int language sql stable as $$
  select case when r.money then coalesce((select floor(min(p.bet) * (public._rr_cfg()->>'vote_pct')::numeric)::int
    from public.rr_players p where p.room_id = r.id and p.bet is not null), 0) else 0 end
  from public.rr_rooms r where r.id = p_room
$$;

-- итог голосования: «за» не меньше половины живых — +1 патрон (следующий по порядку из seed), иначе нет; p_force — время вышло
create or replace function public._rr_vote_check(p_room bigint, p_force boolean) returns boolean language plpgsql as $$
declare c jsonb := public._rr_cfg(); g public.rr_games; v_yes int; v_no int; v_alive int; v_need int; v_ok boolean; v_nb int;
  now_ts timestamptz := public._rr_now();
begin
  select * into g from public.rr_games where room_id = p_room for update;
  if g.vote is null then return false; end if;
  v_yes := jsonb_array_length(g.vote->'yes'); v_no := jsonb_array_length(g.vote->'no'); v_need := (g.vote->>'need')::int;
  select count(*) into v_alive from public.rr_players where room_id = p_room and alive;
  if v_yes >= v_need then v_ok := true;
  elsif p_force or v_yes + greatest(0, v_alive - v_yes - v_no) < v_need then v_ok := false;
  else return false;
  end if;
  v_ok := v_ok and g.bullets < (c->>'max_bul')::int;
  v_nb := g.bullets + v_ok::int;
  update public.rr_games set vote = null, bullets = v_nb, added = added + v_ok::int, votes = votes + v_ok::int,
    vspent = vspent + case when v_ok then coalesce((g.vote->>'cost')::numeric, 0) else 0 end,
    chambers = case when v_ok then public._rr_chambers(seed, v_nb) else chambers end,
    bot_at = greatest(coalesce(bot_at, now_ts), now_ts + interval '1.5 seconds')
  where id = g.id;
  -- ход продолжается: сколько оставалось до голосования (не меньше 6 с)
  update public.rr_rooms set phase_deadline = now_ts + make_interval(secs => greatest(6, coalesce((g.vote->>'rem')::numeric, 6))),
    rev = rev + 1, updated_at = now_ts
  where id = p_room and phase = 'play';
  perform public._rr_ev(p_room, 'vote_end', (g.vote->>'by')::int, jsonb_build_object('ok', v_ok, 'yes', v_yes, 'no', v_no, 'bullets', v_nb,
    'cost', case when v_ok then coalesce((g.vote->>'cost')::int, 0) else 0 end));
  perform public._rr_log(p_room, g.id, 'vote_end', jsonb_build_object('round', g.round, 'ok', v_ok, 'yes', g.vote->'yes', 'no', g.vote->'no', 'bullets', v_nb));
  perform public._rr_sys(p_room, case when v_ok then format('Голосование прошло (%s «за»): в барабане %s патрона.', v_yes, v_nb)
    else format('Голосование не прошло (%s «за» из %s нужных).', v_yes, v_need) end);
  return true;
end $$;

-- голос места p_seat (сам игрок или бот)
create or replace function public._rr_vote_cast(p_room bigint, p_seat int, p_yes boolean) returns void language plpgsql as $$
declare k text := case when p_yes then 'yes' else 'no' end;
begin
  update public.rr_games set vote = jsonb_set(vote, array[k], (vote->k) || to_jsonb(p_seat)) where room_id = p_room and vote is not null;
  update public.rr_rooms set rev = rev + 1, updated_at = public._rr_now() where id = p_room;
  perform public._rr_vote_check(p_room, false);
end $$;

-- боты голосуют (через 1,5 с после начала): «за» чуть чаще
create or replace function public._rr_vote_bots(p_room bigint) returns boolean language plpgsql as $$
declare g public.rr_games; b record; v_any boolean := false;
begin
  select * into g from public.rr_games where room_id = p_room;
  for b in select seat from public.rr_players where room_id = p_room and bot and alive
      and not ((g.vote->'yes') @> to_jsonb(seat::int) or (g.vote->'no') @> to_jsonb(seat::int)) order by seat loop
    exit when (select vote from public.rr_games where room_id = p_room) is null;
    perform public._rr_vote_cast(p_room, b.seat, random() < .55);
    v_any := true;
  end loop;
  return v_any;
end $$;

-- начать голосование: ход стоит (срок хода — на время голосования), начавший — сразу «за»
create or replace function public._rr_vote_open(p_room bigint, p_seat int) returns void language plpgsql as $$
declare c jsonb := public._rr_cfg(); rm public.rr_rooms; v_alive int; v_need int; v_cost int; now_ts timestamptz := public._rr_now();
begin
  select * into rm from public.rr_rooms where id = p_room;
  select count(*) into v_alive from public.rr_players where room_id = p_room and alive;
  v_need := ceil(v_alive / 2.0)::int;
  v_cost := public._rr_vcost(p_room);
  update public.rr_games set vused = vused || p_seat::smallint, vn = null,
    vote = jsonb_build_object('by', p_seat, 'at', public._rr_ms(now_ts), 'until', public._rr_ms(now_ts + public._rr_dur(c, 'vote_sec')),
      'need', v_need, 'yes', jsonb_build_array(p_seat), 'no', '[]'::jsonb, 'cost', v_cost,
      'rem', extract(epoch from rm.phase_deadline - now_ts))
  where room_id = p_room;
  update public.rr_rooms set phase_deadline = now_ts + public._rr_dur(c, 'vote_sec') + interval '1 second', rev = rev + 1, updated_at = now_ts where id = p_room;
  perform public._rr_ev(p_room, 'vote', p_seat, jsonb_build_object('need', v_need, 'cost', v_cost));
  perform public._rr_log(p_room, rm.game_id, 'vote', jsonb_build_object('seat', p_seat, 'need', v_need, 'cost', v_cost));
  perform public._rr_sys(p_room, format('%s поднимает руку: добавить патрон%s. Нужно «за»: %s из %s.',
    coalesce((select name from public.rr_players where room_id = p_room and seat = p_seat), 'Игрок'),
    case when v_cost > 0 then format(' (−%s ₽ из банка)', v_cost) else '' end, v_need, v_alive));
  perform public._rr_vote_check(p_room, false);
end $$;

create or replace function public._rr_spin_at(p_room bigint, p_seat int) returns void language plpgsql as $$
declare g public.rr_games; now_ts timestamptz := public._rr_now();
begin
  select * into g from public.rr_games where room_id = p_room for update;
  update public.rr_games set rspins = rspins + 1, pos = (public._rr_h(g.seed, 'p' || (g.rspins + 1)) % 6)::smallint,
    clicks = 0, spins = spins + 1, last_spin = now_ts
  where id = g.id;
  update public.rr_players set spins = spins + 1 where room_id = p_room and seat = p_seat;
  perform public._rr_ev(p_room, 'spin', p_seat, null);
  perform public._rr_log(p_room, g.id, 'spin', jsonb_build_object('round', g.round, 'seat', p_seat, 'k', g.rspins + 1, 'turn', g.n));
  update public.rr_rooms set rev = rev + 1, updated_at = now_ts where id = p_room;
end $$;

-- ---------- ход игры ----------
-- ход места p_seat: начнётся через p_delay (ключ настроек), на ход — turn секунд (вышедшему — gone_shot)
create or replace function public._rr_turn(p_room bigint, p_seat int, p_delay text) returns void language plpgsql as $$
declare c jsonb := public._rr_cfg(); t timestamptz := public._rr_now() + public._rr_dur(public._rr_cfg(), p_delay); v_gone boolean;
begin
  select left_at is not null into v_gone from public.rr_players where room_id = p_room and seat = p_seat;
  update public.rr_games set n = n + 1, spins = 0, turn = p_seat where room_id = p_room;
  update public.rr_rooms set phase = 'play', phase_at = t,
    phase_deadline = t + public._rr_dur(c, case when v_gone then 'gone_shot' else 'turn' end),
    rev = rev + 1, updated_at = public._rr_now()
  where id = p_room;
end $$;

-- новый раунд: seed, патроны, первый стрелок — всё до первого хода, commit публикуется сразу
create or replace function public._rr_round(p_room bigint) returns void language plpgsql as $$
declare c jsonb := public._rr_cfg(); g public.rr_games; v_seats smallint[]; v_bul int; v_seed text; v_cm text; v_first int; v_round int;
begin
  select * into g from public.rr_games where room_id = p_room for update;
  v_seats := array(select seat from public.rr_players where room_id = p_room and alive order by seat);
  v_round := g.round + 1;
  -- 1 патрон + все купленные за игру (переходят из раунда в раунд, владелец 21.11), не больше max_bul
  v_bul := greatest(1, least(coalesce((c->>'max_bul')::int, 4), coalesce((c->'bul'->>cardinality(v_seats)::text)::int, 1) + coalesce(g.votes, 0)));
  v_seed := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_first := v_seats[1 + (public._rr_h(v_seed, 'f') % cardinality(v_seats))::int];
  v_cm := public._rr_hash(public._rr_proof(g.id, v_round, v_seats, v_bul, v_seed));
  update public.rr_games set round = v_round, seats = v_seats, bullets = v_bul, seed = v_seed, commit = v_cm,
    chambers = public._rr_chambers(v_seed, v_bul), pos = (public._rr_h(v_seed, 'p0') % 6)::smallint,
    rspins = 0, clicks = 0, first = v_first, bul0 = v_bul, added = 0, vote = null, vused = '{}', vby = null, vn = null
  where id = g.id;
  perform public._rr_ev(p_room, 'start', v_first, jsonb_build_object('round', v_round, 'bullets', v_bul, 'commit', v_cm));
  perform public._rr_log(p_room, g.id, 'round', jsonb_build_object('round', v_round, 'seats', to_jsonb(v_seats), 'bullets', v_bul,
    'first', v_first, 'commit', v_cm));
  perform public._rr_sys(p_room, format('Раунд %s: патронов в барабане — %s. Первым стреляет %s.', v_round, v_bul,
    coalesce((select name from public.rr_players where room_id = p_room and seat = v_first), 'Игрок')));
  perform public._rr_turn(p_room, v_first, 'round_delay');
end $$;

-- старт игры (все пятеро за столом)
create or replace function public._rr_start(p_room bigint) returns void language plpgsql as $$
declare c jsonb := public._rr_cfg(); v_gid bigint; v_pts boolean := public._rr_pts_on(p_room); v_money boolean := public._rr_money_on(p_room); v_min int := (c->>'min_bet')::int; v_low text; pl public.rr_players;
begin
  -- деньги (владелец 21.11): у кого на балансе меньше минимальной ставки — запуск не проходит; он — как «не принял»
  -- (его группа выходит из поиска, остальные снова в поиске — _rr_mm_sync)
  if v_money then
    select string_agg(coalesce(p.name, 'Игрок'), ', ' order by p.seat) into v_low from public.rr_players p left join public.profiles f on f.id = p.uid
      where p.room_id = p_room and not p.bot and coalesce((f.data->>'balance')::numeric, 0) < v_min;
    if v_low is not null then
      update public.rr_players x set ready = false where x.room_id = p_room and not x.bot
        and coalesce((select (f.data->>'balance')::numeric from public.profiles f where f.id = x.uid), 0) < v_min;
      perform public._rr_log(p_room, null, 'low_balance', jsonb_build_object('names', v_low, 'min', v_min));
      perform public._rr_sys(p_room, format('Игра не началась: не хватает баланса (нужно %s ₽) — %s.', v_min, v_low));
      update public.rr_rooms set phase = 'done', load_at = null, phase_deadline = null, rev = rev + 1, updated_at = public._rr_now() where id = p_room;
      return;
    end if;
  end if;
  insert into public.rr_games (room_id) values (p_room) returning id into v_gid;
  update public.rr_players set alive = true, place = null, pts = null, clicks = 0, spins = 0, seen_at = public._rr_now(),
    bet = null, back = null, won = null where room_id = p_room;
  if v_money then   -- минимальная ставка списывается сразу (только у людей); поднять — rr_bet за 15 с знакомства
    for pl in select * from public.rr_players where room_id = p_room and not bot order by seat loop
      perform public._rr_bal(pl.uid, -v_min);
      update public.rr_players set bet = v_min where room_id = p_room and uid = pl.uid;
    end loop;
  end if;
  update public.rr_rooms set game_id = v_gid, points = v_pts, money = v_money where id = p_room;
  perform public._rr_log(p_room, v_gid, 'start', jsonb_build_object('points', v_pts, 'money', v_money, 'players',
    (select jsonb_agg(jsonb_build_object('seat', seat, 'uid', uid, 'party', party_id) order by seat) from public.rr_players where room_id = p_room)));
  perform public._rr_sys(p_room, 'Игра начинается. Револьвер на шесть гнёзд, патроны — в случайных гнёздах.');
  -- 15 с знакомства (фаза next при game.round = 0): потом обычный шаг next запускает раунд 1
  update public.rr_rooms set phase = 'next', phase_at = public._rr_now(), phase_deadline = public._rr_now() + public._rr_dur(public._rr_cfg(), 'intro'),
    rev = rev + 1, updated_at = public._rr_now()
  where id = p_room;
end $$;

-- выстрел места p_seat (p_auto — сам: время вышло или игрок вышел)
create or replace function public._rr_fire(p_room bigint, p_seat int, p_auto boolean) returns void language plpgsql as $$
declare c jsonb := public._rr_cfg(); g public.rr_games; v_left int; v_nx int; v_nm text; v_proof text;
begin
  select * into g from public.rr_games where room_id = p_room for update;
  select name into v_nm from public.rr_players where room_id = p_room and seat = p_seat;
  if not (g.pos = any (g.chambers)) then   -- пусто: барабан на гнездо дальше, ход следующему живому по кругу
    update public.rr_games set pos = ((pos + 1) % 6)::smallint, clicks = clicks + 1, vby = p_seat, vn = g.n + 1 where id = g.id;   -- vn: следующий ход (_rr_turn: n + 1)
    update public.rr_players set clicks = clicks + 1 where room_id = p_room and seat = p_seat;
    perform public._rr_ev(p_room, 'click', p_seat, jsonb_build_object('auto', p_auto));
    if random() < .3 then perform public._rr_bot_say(p_room, p_seat, 'click'); end if;
    perform public._rr_log(p_room, g.id, 'click', jsonb_build_object('round', g.round, 'seat', p_seat, 'auto', p_auto, 'pos', g.pos, 'turn', g.n));
    select seat into v_nx from public.rr_players where room_id = p_room and alive and seat <> p_seat order by (seat - p_seat + 5) % 5 limit 1;
    perform public._rr_turn(p_room, coalesce(v_nx, p_seat), 'click_delay');
    return;
  end if;
  -- боевой: игрок выбывает, место = сколько было живых; раунд раскрывается
  select count(*) into v_left from public.rr_players where room_id = p_room and alive;
  update public.rr_players set alive = false, place = v_left where room_id = p_room and seat = p_seat;
  v_proof := public._rr_proof(g.id, g.round, g.seats, coalesce(g.bul0, g.bullets), g.seed);
  update public.rr_games set rounds = rounds || jsonb_build_array(jsonb_build_object('round', g.round, 'bullets', coalesce(g.bul0, g.bullets),
      'added', g.added, 'final', g.bullets,
      'seats', to_jsonb(g.seats), 'first', g.first, 'commit', g.commit, 'seed', g.seed, 'proof', v_proof,
      'chambers', to_jsonb(g.chambers), 'spins', g.rspins, 'loser', p_seat))
  where id = g.id;
  perform public._rr_ev(p_room, 'bang', p_seat, jsonb_build_object('auto', p_auto, 'place', v_left));
  perform public._rr_log(p_room, g.id, 'bang', jsonb_build_object('round', g.round, 'seat', p_seat, 'auto', p_auto, 'place', v_left,
    'pos', g.pos, 'turn', g.n, 'seed', g.seed, 'proof', v_proof));
  perform public._rr_sys(p_room, format('%s выбывает — %s место.', coalesce(v_nm, 'Игрок'), v_left));
  if random() < .6 then   -- кто-то из живых ботов отзывается
    perform public._rr_bot_say(p_room, (select seat from public.rr_players where room_id = p_room and bot and alive order by random() limit 1), 'bang');
  end if;
  update public.rr_rooms set phase = 'next', phase_at = public._rr_now(), phase_deadline = public._rr_now() + public._rr_dur(c, 'next'),
    rev = rev + 1, updated_at = public._rr_now()
  where id = p_room;
end $$;

-- конец игры: последний живой — 1-е место, очки недели (быстрая игра), день по Москве; деньги (владелец 21.11)
create or replace function public._rr_finish(p_room bigint) returns void language plpgsql as $$
declare c jsonb := public._rr_cfg(); rm public.rr_rooms; g public.rr_games; p public.rr_players; w public.rr_players; v_win int; v_add int; v_cur int;
  res jsonb := '{}'::jsonb; mon jsonb; v_bank numeric := 0; v_t numeric; v_cost numeric := 0; v_pay numeric := 0;
  d date := (public._rr_now() at time zone 'Europe/Moscow')::date;
begin
  select * into rm from public.rr_rooms where id = p_room;
  select * into g from public.rr_games where room_id = p_room;
  select seat into v_win from public.rr_players where room_id = p_room and alive order by seat limit 1;
  update public.rr_players set place = 1 where room_id = p_room and seat = v_win;
  -- победитель берёт с каждого не больше своей ставки (остальное — назад проигравшему); из банка — голосования и комиссия сайта
  if rm.money then
    select * into w from public.rr_players where room_id = p_room and not bot order by coalesce(place, 99), seat limit 1;   -- банк — лучшему из людей (с ботами последним может выжить бот)
    v_bank := coalesce(w.bet, 0);
    for p in select * from public.rr_players where room_id = p_room and seat <> w.seat and bet is not null order by seat loop
      v_t := least(p.bet, coalesce(w.bet, 0));
      v_bank := v_bank + v_t;
      if p.bet > v_t then perform public._rr_bal(p.uid, p.bet - v_t); end if;
      update public.rr_players set back = p.bet - v_t where room_id = p_room and uid = p.uid;
    end loop;
    v_cost := least(v_bank, coalesce(g.vspent, 0));
    v_pay := greatest(0, floor((v_bank - v_cost) * (1 - (c->>'fee')::numeric)));
    if v_pay > 0 then perform public._rr_bal(w.uid, v_pay); end if;
    update public.rr_players set won = v_pay, back = 0 where room_id = p_room and seat = w.seat;
    mon := jsonb_build_object('bank', v_bank, 'votes', coalesce(g.votes, 0), 'cost', v_cost, 'pay', v_pay, 'site', v_bank - v_pay);
  end if;
  for p in select * from public.rr_players where room_id = p_room order by seat loop
    if rm.points and not p.bot then   -- боту очков нет (и в рейтинг он не попадает)
      v_add := coalesce((c->'pts'->>coalesce(p.place, 5)::text)::int, 0);
      select pts into v_cur from public.rr_points where uid = p.uid and day = d;
      v_add := greatest(0, least(v_add, (c->>'day_cap')::int - coalesce(v_cur, 0)));
      begin
        insert into public.rr_points (uid, day, pts, games, wins, won) values (p.uid, d, v_add, 1, (p.place = 1)::int, case when p.seat = w.seat then v_pay else 0 end)
          on conflict (uid, day) do update set pts = public.rr_points.pts + excluded.pts,
            games = public.rr_points.games + 1, wins = public.rr_points.wins + excluded.wins, won = public.rr_points.won + excluded.won;
      exception when foreign_key_violation then v_add := 0;   -- профиль удалён
      end;
      update public.rr_players set pts = v_add where room_id = p_room and uid = p.uid;
      res := res || jsonb_build_object(p.seat::text, v_add);
    end if;
  end loop;
  update public.rr_games set winner = v_win, ended_at = public._rr_now() where room_id = p_room;
  update public.rr_rooms set phase = 'done', phase_at = public._rr_now(), phase_deadline = null, rev = rev + 1, updated_at = public._rr_now()
  where id = p_room;
  perform public._rr_log(p_room, rm.game_id, 'result', jsonb_build_object('winner', v_win, 'points', rm.points, 'pts', res, 'money', mon,
    'places', (select jsonb_object_agg(seat::text, place) from public.rr_players where room_id = p_room)));
  perform public._rr_sys(p_room, format('Победил %s%s. Игра окончена.',
    coalesce((select name from public.rr_players where room_id = p_room and seat = v_win), '—'),
    case when rm.money and w.seat = v_win then format(' и забирает %s ₽', v_pay) when rm.money then format('. Банк %s ₽ забирает %s', v_pay, coalesce(w.name, 'Игрок')) else '' end));
end $$;

-- один шаг «ленивого таймера»: true — что-то изменилось (тогда шагаем ещё раз)
create or replace function public._rr_step(p_room bigint) returns boolean language plpgsql as $$
declare
  rm public.rr_rooms; g public.rr_games; tp public.rr_players; p public.rr_players; c jsonb := public._rr_cfg();
  now_ts timestamptz := public._rr_now(); v_n int; v_ready int; v_h int; ch boolean := false; v_away boolean; v_dl timestamptz; v_sp int;
begin
  select * into rm from public.rr_rooms where id = p_room for no key update;
  if rm.id is null or rm.phase = 'done' then return false; end if;

  -- ---------- игра из подбора: лобби = окно «Принять», потом экран загрузки ----------
  if rm.phase = 'lobby' and rm.mm then
    select count(*), count(*) filter (where ready) into v_n, v_ready from public.rr_players where room_id = rm.id;
    if v_n = 5 and v_ready = 5 then
      if rm.load_at is null then   -- все приняли → экран загрузки (load, ~10 с)
        update public.rr_rooms set load_at = now_ts, phase_deadline = now_ts + public._rr_dur(c, 'load'), rev = rev + 1, updated_at = now_ts where id = rm.id;
        return true;
      elsif now_ts >= rm.phase_deadline and (not exists (select 1 from public.rr_players where room_id = rm.id and not loaded)
            or now_ts >= rm.load_at + public._rr_dur(c, 'load_max')) then   -- все загрузились (или ждали достаточно) — игра
        perform public._rr_start(rm.id);
        return true;
      end if;
      return false;
    end if;
    if v_n < 5 or (rm.load_at is null and now_ts >= rm.phase_deadline) then   -- не все приняли (или кто-то ушёл) — игра не собрана
      update public.rr_rooms set phase = 'done', phase_deadline = null, rev = rev + 1, updated_at = now_ts where id = rm.id;
      perform public._rr_log(rm.id, null, 'mm_fail', jsonb_build_object('accepted', v_ready, 'players', v_n));
      return true;
    end if;
    return false;
  end if;

  -- ---------- лобби: комната друзей (все «Готов») или открытое лобби быстрой игры ----------
  if rm.phase = 'lobby' then
    for p in delete from public.rr_players where room_id = rm.id and not bot and seen_at < now_ts - public._rr_dur(c, 'stale') returning * loop
      perform public._rr_sys(rm.id, format('Игрок %s покинул комнату.', p.name));
      ch := true;
    end loop;
    select count(*), count(*) filter (where ready), count(*) filter (where not bot) into v_n, v_ready, v_h from public.rr_players where room_id = rm.id;
    if v_h = 0 then   -- людей не осталось (одни боты) — комната закрывается
      update public.rr_rooms set phase = 'done', phase_deadline = null, rev = rev + 1, updated_at = now_ts where id = rm.id;
      return true;
    end if;
    if ch then
      update public.rr_rooms set rev = rev + 1, updated_at = now_ts,
        owner = case when exists (select 1 from public.rr_players where room_id = rm.id and uid = rm.owner) then owner
                     else (select uid from public.rr_players where room_id = rm.id and not bot order by seat limit 1) end
      where id = rm.id;
    end if;
    if v_n < 5 or (rm.kind = 'private' and v_ready < 5) then
      if rm.phase_deadline is not null then   -- кто-то ушёл / снял «Готов» — отсчёт сбрасывается
        update public.rr_rooms set phase_deadline = null, rev = rev + 1, updated_at = now_ts where id = rm.id;
        return true;
      end if;
    elsif rm.phase_deadline is null or (v_ready = 5 and rm.phase_deadline > now_ts + public._rr_dur(c, 'ready')) then
      update public.rr_rooms set phase_deadline = now_ts + public._rr_dur(c, case when v_ready = 5 then 'ready' else 'lobby' end),
        rev = rev + 1, updated_at = now_ts where id = rm.id;
      return true;
    elsif now_ts >= rm.phase_deadline then
      perform public._rr_start(rm.id);
      return true;
    end if;
    return ch;
  end if;

  -- ---------- идёт игра ----------
  select * into g from public.rr_games where room_id = rm.id;
  -- за столом никого (все вышли или без связи дольше offline + reconnect) — доигрываем сразу, выстрелами без прокрутки
  v_away := not exists (select 1 from public.rr_players where room_id = rm.id and not bot and left_at is null
    and seen_at >= now_ts - public._rr_dur(c, 'offline') - public._rr_dur(c, 'reconnect'));   -- боты не в счёт
  if rm.phase = 'play' then
    if g.vote is not null then   -- идёт голосование за патрон: ход стоит; боты голосуют; срок вышел (или все ушли) — итог
      if v_away or public._rr_ms(now_ts) >= (g.vote->>'until')::bigint then perform public._rr_vote_check(rm.id, true); return true; end if;
      if public._rr_ms(now_ts) >= (g.vote->>'at')::bigint + 1500 and public._rr_vote_bots(rm.id) then return true; end if;
      return false;
    end if;
    if v_away or now_ts >= rm.phase_deadline then   -- время вышло — выстрел сам, без прокрутки
      perform public._rr_fire(rm.id, g.turn, true);
      return true;
    end if;
    select * into tp from public.rr_players where room_id = rm.id and seat = g.turn;
    if tp.bot then   -- ход бота (как в демо): думает 1,6–4,2 с; крутит барабан (чаще, когда после пустых щелчков шанс вырос); потом выстрел
      if g.bot_n is distinct from g.n then
        v_sp := case when g.bullets::numeric / greatest(1, 6 - g.clicks) > g.bullets::numeric / 6 + 0.001
                     then case when random() < .85 then 1 + floor(random() * 2)::int else 0 end
                     else case when random() < .3 then 1 else 0 end end;
        update public.rr_games set bot_n = g.n, bot_spins = v_sp,
          bot_at = greatest(rm.phase_at, now_ts) + make_interval(secs => 1.6 + random() * 2.6) where id = g.id;
        if random() < .35 then perform public._rr_bot_say(rm.id, tp.seat, 'turn'); end if;
        return true;
      end if;
      if now_ts >= g.bot_at then
        if g.bot_spins > 0 then
          perform public._rr_spin_at(rm.id, tp.seat);
          update public.rr_games set bot_spins = bot_spins - 1, bot_at = now_ts + make_interval(secs => 1.1 + random() * .9) where id = g.id;
        else
          perform public._rr_fire(rm.id, tp.seat, false);
        end if;
        return true;
      end if;
      return false;
    end if;
    if tp.left_at is not null then   -- ходящий вышел посреди своего хода — выстрел за него через gone_shot
      v_dl := greatest(rm.phase_at, tp.left_at) + public._rr_dur(c, 'gone_shot');
      if rm.phase_deadline > v_dl then
        update public.rr_rooms set phase_deadline = v_dl, rev = rev + 1, updated_at = now_ts where id = rm.id;
        return true;
      end if;
    end if;
    return false;
  end if;
  if rm.phase = 'next' then
    if v_away or now_ts >= rm.phase_deadline then
      if (select count(*) from public.rr_players where room_id = rm.id and alive) <= 1 then perform public._rr_finish(rm.id);
      else perform public._rr_round(rm.id);
      end if;
      return true;
    end if;
  end if;
  return false;
end $$;

create or replace function public._rr_advance(p_room bigint) returns void language plpgsql as $$
declare i int;
begin
  for i in 1..100 loop exit when not public._rr_step(p_room); end loop;   -- брошенная игра доигрывается за один вызов (≤ ~30 шагов)
end $$;

-- «пульс» игрока: на связи; вернулся после выхода — снова за столом
create or replace function public._rr_touch(p_room bigint) returns public.rr_players language plpgsql as $$
declare me public.rr_players; v_ph text;
begin
  select * into me from public.rr_players where room_id = p_room and uid = auth.uid();
  if me.uid is null then return me; end if;
  if me.left_at is not null then
    select phase into v_ph from public.rr_rooms where id = p_room;
    if v_ph in ('play', 'next') then
      update public.rr_rooms set rev = rev + 1, updated_at = public._rr_now() where id = p_room;
      perform public._rr_sys(p_room, format('Игрок %s вернулся за стол.', me.name));
    end if;
  end if;
  update public.rr_players set seen_at = public._rr_now(), left_at = null where room_id = p_room and uid = auth.uid() returning * into me;
  return me;
end $$;

-- моя текущая комната (идущая игра или лобби; из игры, откуда вышел сам, — не возвращаем); заодно двигает её таймер
create or replace function public._rr_active() returns bigint language plpgsql as $$
declare rid bigint; i int;
begin
  for i in 1..2 loop
    select p.room_id into rid from public.rr_players p join public.rr_rooms r on r.id = p.room_id
      where p.uid = auth.uid() and r.phase <> 'done' and not (r.phase in ('play', 'next') and p.left_at is not null)
      order by p.room_id desc limit 1;
    if rid is null or i = 2 then return rid; end if;
    perform 1 from public.rr_rooms where id = rid for no key update;
    perform public._rr_advance(rid);   -- лобби могло убрать меня, игра — закончиться
  end loop;
  return rid;
end $$;

-- сесть за стол: случайное свободное место (владелец 22.11: места каждую игру случайно, друзья тоже)
create or replace function public._rr_enter(p_room bigint) returns void language plpgsql as $$
declare pr record; s int;
begin
  select name, ava, pid into pr from public.profiles where id = auth.uid();
  select x into s from generate_series(1, 5) x
    where not exists (select 1 from public.rr_players where room_id = p_room and seat = x) order by random() limit 1;
  if s is null then raise exception 'room full'; end if;
  insert into public.rr_players (room_id, uid, seat, name, ava, pid, seen_at)
    values (p_room, auth.uid(), s, coalesce(pr.name, 'Игрок'), pr.ava, pr.pid, public._rr_now());
  update public.rr_rooms set rev = rev + 1, updated_at = public._rr_now() where id = p_room;
  perform public._rr_sys(p_room, format('Игрок %s сел за стол.', coalesce(pr.name, 'Игрок')));
  perform public._rr_log(p_room, null, 'join', jsonb_build_object('seat', s));
end $$;

-- ============================================================
-- Функции для сайта
-- ============================================================

-- снимок комнаты: фаза, срок, игроки (жив, место, очки, щелчки, прокрутки), ход игры, события стола; p_after — догрузить чат
create or replace function public.rr_state(p_room bigint, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rm public.rr_rooms; g public.rr_games; me public.rr_players; c jsonb := public._rr_cfg(); now_ts timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform 1 from public.rr_rooms where id = p_room for no key update;
  me := public._rr_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  perform public._rr_advance(p_room);
  select * into rm from public.rr_rooms where id = p_room;
  select * into me from public.rr_players where room_id = p_room and uid = auth.uid();
  select * into g from public.rr_games where room_id = p_room;
  now_ts := public._rr_now();
  return jsonb_build_object(
    'now', public._rr_ms(now_ts),
    'room', jsonb_build_object('id', rm.id, 'code', rm.code, 'kind', rm.kind, 'mm', rm.mm,
      'points', case when rm.game_id is not null then rm.points else public._rr_pts_on(rm.id) end,
      'phase', rm.phase, 'rev', rm.rev, 'phase_at', public._rr_ms(rm.phase_at), 'deadline', public._rr_ms(rm.phase_deadline),
      'load_at', public._rr_ms(rm.load_at), 'paused', false, 'owner', rm.owner = auth.uid(),
      'turn_sec', (c->>'turn')::numeric, 'next_sec', (c->>'next')::numeric, 'intro_sec', (c->>'intro')::numeric,
      -- деньги (владелец 21.11): игра на деньги, банк (сумма ставок), правила ставок и голосования
      'money', case when rm.game_id is not null then rm.money else public._rr_money_on(rm.id) end,
      'bank', greatest(0, (select coalesce(sum(x.bet), 0) from public.rr_players x where x.room_id = rm.id) - coalesce(g.vspent, 0)),   -- минус купленные патроны
      'min_bet', (c->>'min_bet')::numeric, 'max_bet', (c->>'max_bet')::numeric, 'fee', (c->>'fee')::numeric,
      'vote_cost', public._rr_vcost(rm.id), 'vote_sec', (c->>'vote_sec')::numeric, 'max_bul', (c->>'max_bul')::int),
    'players', coalesce((select jsonb_agg(jsonb_build_object('seat', p.seat, 'name', p.name, 'ava', p.ava, 'pid', p.pid,
        'me', p.uid = auth.uid(), 'ready', p.ready, 'loaded', p.loaded, 'bot', p.bot,
        'online', p.bot or (p.left_at is null and p.seen_at >= now_ts - public._rr_dur(c, 'offline')), 'left', p.left_at is not null,
        'alive', p.alive, 'place', p.place, 'pts', p.pts, 'clicks', p.clicks, 'spins', p.spins, 'bet', p.bet, 'won', p.won, 'back', p.back,
        -- очки за всё время — звание над головой в комнате (владелец 21.11); у ботов звание рисует сайт
        'tp', case when p.bot then null else (select coalesce(sum(x.pts), 0) from public.rr_points x where x.uid = p.uid) end) order by p.seat)
      from public.rr_players p where p.room_id = rm.id), '[]'::jsonb),
    'me', jsonb_build_object('seat', me.seat, 'ready', me.ready, 'alive', me.alive, 'admin', public._rr_staff(),
      'bal', (select coalesce((f.data->>'balance')::numeric, 0) from public.profiles f where f.id = auth.uid())),
    'game', case when g.id is null then null else jsonb_build_object('id', g.id, 'round', g.round, 'bullets', g.bullets,
      'turn', g.turn, 'first', g.first, 'clicks', g.clicks, 'spins', g.spins, 'n', g.n,
      'evs', g.evs, 'ev', case when jsonb_array_length(g.evs) > 0 then g.evs->-1 end,
      'commit', g.commit, 'rounds', g.rounds, 'vote', g.vote, 'votes', g.votes, 'added', g.added, 'bul0', g.bul0, 'vby', g.vby, 'vn', g.vn) end,
    'chat', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'seat', m.seat, 'name', m.name, 'text', m.text,
        'at', public._rr_ms(m.created_at)) order by m.id)
      from (select * from public.rr_chat where room_id = rm.id and id > coalesce(p_after, 0) order by id desc limit 100) m), '[]'::jsonb));
end $$;

-- лёгкий «пульс» раз в 3 с: отмечает, что игрок на связи, и двигает фазы по сроку (время — на сервере)
create or replace function public.rr_tick(p_room bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rm public.rr_rooms; me public.rr_players;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform 1 from public.rr_rooms where id = p_room for no key update;
  me := public._rr_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  perform public._rr_advance(p_room);
  select * into rm from public.rr_rooms where id = p_room;
  return jsonb_build_object('now', public._rr_ms(public._rr_now()), 'phase', rm.phase, 'rev', rm.rev,
    'deadline', public._rr_ms(rm.phase_deadline), 'paused', false);
end $$;

-- выйти: из лобби — освободить место; из игры — за вас стреляют сами (без прокрутки), вернуть в эту игру сайт уже не предложит
create or replace function public.rr_leave(p_room bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rm public.rr_rooms; me public.rr_players;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into rm from public.rr_rooms where id = p_room for no key update;
  select * into me from public.rr_players where room_id = p_room and uid = auth.uid();
  if me.uid is null then return jsonb_build_object('ok', true); end if;
  if rm.phase = 'lobby' then
    delete from public.rr_players where room_id = p_room and uid = auth.uid();
    update public.rr_rooms set rev = rev + 1, updated_at = public._rr_now(),
      owner = case when owner = auth.uid() then (select uid from public.rr_players where room_id = p_room and not bot order by seat limit 1) else owner end
    where id = p_room;
    perform public._rr_sys(p_room, format('Игрок %s покинул комнату.', me.name));
  elsif me.left_at is null then
    update public.rr_players set left_at = public._rr_now() where room_id = p_room and uid = auth.uid();
    update public.rr_rooms set rev = rev + 1, updated_at = public._rr_now() where id = p_room;
    if rm.phase in ('play', 'next') and me.alive then
      perform public._rr_sys(p_room, format('Игрок %s вышел из игры — за него стреляют без прокрутки.', me.name));
    end if;
  end if;
  perform public._rr_log(p_room, rm.game_id, 'leave', jsonb_build_object('phase', rm.phase, 'alive', me.alive));
  perform public._rr_advance(p_room);
  return jsonb_build_object('ok', true);
end $$;

-- создать комнату: private = true — по коду для друзей (без очков); false — открытое лобби быстрой игры
create or replace function public.rr_create(p_private boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  rid := public._rr_active();
  if rid is not null then
    if (select phase from public.rr_rooms where id = rid) <> 'lobby' then
      return public.rr_state(rid) || jsonb_build_object('rejoin', true);
    end if;
    perform public.rr_leave(rid);
  end if;
  if (select count(*) from public.rr_log where uid = auth.uid() and kind = 'create' and at > public._rr_now() - interval '1 hour') >= 15 then
    raise exception 'too many rooms';
  end if;
  -- брошенные лобби (никого не было на связи 10 минут) закрываем, чтобы не держали коды
  update public.rr_rooms r set phase = 'done', phase_deadline = null, rev = rev + 1, updated_at = public._rr_now()
    where r.phase = 'lobby' and r.updated_at < public._rr_now() - interval '10 minutes'
      and not exists (select 1 from public.rr_players p where p.room_id = r.id and p.seen_at > public._rr_now() - interval '10 minutes');
  insert into public.rr_rooms (code, kind, owner, phase_at) values (public._rr_code(), case when p_private then 'private' else 'quick' end, auth.uid(), public._rr_now())
    returning id into rid;
  perform public._rr_log(rid, null, 'create', jsonb_build_object('private', p_private));
  perform public._rr_enter(rid);
  return public.rr_state(rid);
end $$;

-- войти по коду (только комнаты для друзей)
create or replace function public.rr_join(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid bigint; rm public.rr_rooms; cd text := upper(btrim(coalesce(p_code, '')));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  rid := public._rr_active();
  if rid is not null then
    select * into rm from public.rr_rooms where id = rid;
    if rm.phase <> 'lobby' then return public.rr_state(rid) || jsonb_build_object('rejoin', true); end if;
    if rm.code = cd then return public.rr_state(rid); end if;
    perform public.rr_leave(rid);
  end if;
  select * into rm from public.rr_rooms where code = cd and phase <> 'done' and kind = 'private' for no key update;
  if rm.id is null then raise exception 'room not found'; end if;
  perform public._rr_advance(rm.id);   -- вычистить пропавших, освободить места
  select * into rm from public.rr_rooms where id = rm.id;
  if rm.phase <> 'lobby' then raise exception 'already started'; end if;
  if (select count(*) from public.rr_players where room_id = rm.id) >= 5 then raise exception 'room full'; end if;
  perform public._rr_enter(rm.id);
  return public.rr_state(rm.id);
end $$;

-- быстрая игра без группы: сесть в самое заполненное открытое лобби или открыть новое
create or replace function public.rr_quick() returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid bigint; rm public.rr_rooms; cand bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  rid := public._rr_active();
  if rid is not null then
    select * into rm from public.rr_rooms where id = rid;
    if rm.phase <> 'lobby' then return public.rr_state(rid) || jsonb_build_object('rejoin', true); end if;
    if rm.kind = 'quick' then return public.rr_state(rid); end if;
    perform public.rr_leave(rid);   -- был в комнате друзей — выходим
  end if;
  if coalesce((select (data->>'balance')::numeric from public.profiles where id = auth.uid()), 0) < (public._rr_cfg()->>'min_bet')::numeric then
    raise exception 'low balance';   -- владелец 21.11: быстрая игра — на деньги, минимум 100 ₽
  end if;
  perform pg_advisory_xact_lock(hashtext('rush-rr-quick'));
  for cand in select r.id from public.rr_rooms r where r.kind = 'quick' and r.phase = 'lobby' and not r.mm
      order by (select count(*) from public.rr_players p where p.room_id = r.id) desc, r.id limit 20 loop
    perform 1 from public.rr_rooms where id = cand for no key update;
    perform public._rr_advance(cand);
    if (select phase from public.rr_rooms where id = cand) = 'lobby'
       and (select count(*) from public.rr_players where room_id = cand) between 1 and 4 then
      perform public._rr_enter(cand);
      perform public._rr_advance(cand);   -- пятый — запускается отсчёт
      return public.rr_state(cand);
    end if;
  end loop;
  insert into public.rr_rooms (code, kind, owner, phase_at) values (public._rr_code(), 'quick', auth.uid(), public._rr_now()) returning id into rid;
  perform public._rr_log(rid, null, 'create', jsonb_build_object('quick', true));
  perform public._rr_enter(rid);
  return public.rr_state(rid);
end $$;

-- «Готов» (только в лобби)
create or replace function public.rr_ready(p_room bigint, p_ready boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rm public.rr_rooms; me public.rr_players;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into rm from public.rr_rooms where id = p_room for no key update;
  me := public._rr_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  if rm.phase <> 'lobby' then raise exception 'not lobby'; end if;
  update public.rr_players set ready = coalesce(p_ready, true) where room_id = p_room and uid = auth.uid();
  update public.rr_rooms set rev = rev + 1, updated_at = public._rr_now() where id = p_room;
  return public.rr_tick(p_room);
end $$;

-- проверки хода для rr_spin / rr_shoot: мой ход, я жив, номер хода совпал
create or replace function public._rr_my_turn(p_room bigint, p_turn int) returns public.rr_players language plpgsql as $$
declare rm public.rr_rooms; me public.rr_players; g public.rr_games;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform 1 from public.rr_rooms where id = p_room for no key update;
  me := public._rr_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  perform public._rr_advance(p_room);
  select * into rm from public.rr_rooms where id = p_room;
  select * into me from public.rr_players where room_id = p_room and uid = auth.uid();
  select * into g from public.rr_games where room_id = p_room;
  if g.vote is not null then raise exception 'vote on'; end if;   -- идёт голосование за патрон — ход стоит
  if rm.phase <> 'play' or g.turn is distinct from me.seat or not me.alive or public._rr_now() >= rm.phase_deadline
     or (p_turn is not null and p_turn <> g.n) then
    raise exception 'not your turn';
  end if;
  return me;
end $$;

-- прокрутить барабан (сколько угодно раз за ход): гнездо — h('p<k>') из seed раунда
create or replace function public.rr_spin(p_room bigint, p_turn int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.rr_players; g public.rr_games; c jsonb := public._rr_cfg(); now_ts timestamptz;
begin
  me := public._rr_my_turn(p_room, p_turn);
  now_ts := public._rr_now();
  select * into g from public.rr_games where room_id = p_room for update;
  if g.last_spin > now_ts - public._rr_dur(c, 'spin_gap') then raise exception 'too fast'; end if;
  perform public._rr_spin_at(p_room, me.seat);
  return jsonb_build_object('ok', true, 'n', g.n);
end $$;

-- выстрел в себя
create or replace function public.rr_shoot(p_room bigint, p_turn int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.rr_players; g public.rr_games;
begin
  me := public._rr_my_turn(p_room, p_turn);
  select * into g from public.rr_games where room_id = p_room;
  perform public._rr_fire(p_room, me.seat, false);
  return jsonb_build_object('ok', true, 'n', g.n);
end $$;

-- ставка за 15 с знакомства (только игра на деньги): от min_bet до max_bet; разница списывается / возвращается сразу
create or replace function public.rr_bet(p_room bigint, p_amount int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c jsonb := public._rr_cfg(); rm public.rr_rooms; me public.rr_players; g public.rr_games;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform 1 from public.rr_rooms where id = p_room for no key update;
  me := public._rr_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  perform public._rr_advance(p_room);
  select * into rm from public.rr_rooms where id = p_room;
  select * into me from public.rr_players where room_id = p_room and uid = auth.uid();
  select * into g from public.rr_games where room_id = p_room;
  if not rm.money or me.bet is null then raise exception 'no money game'; end if;
  if rm.phase <> 'next' or g.round <> 0 or public._rr_now() >= rm.phase_deadline - interval '1 second' then raise exception 'bets closed'; end if;
  if p_amount is null or p_amount < (c->>'min_bet')::int or p_amount > (c->>'max_bet')::int then raise exception 'bad bet'; end if;
  if p_amount <> me.bet then
    perform public._rr_bal(auth.uid(), me.bet - p_amount);   -- не хватает — 'low balance'
    update public.rr_players set bet = p_amount where room_id = p_room and uid = auth.uid();
    perform public._rr_ev(p_room, 'bet', me.seat, jsonb_build_object('bet', p_amount));
    update public.rr_rooms set rev = rev + 1, updated_at = public._rr_now() where id = p_room;
  end if;
  return jsonb_build_object('ok', true, 'bet', p_amount, 'data', (select data from public.profiles where id = auth.uid()));
end $$;

-- голосование за патрон: начать (живой, патронов меньше max_bul, раз за раунд) и голосовать (живые, один раз)
create or replace function public.rr_vote_start(p_room bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c jsonb := public._rr_cfg(); rm public.rr_rooms; me public.rr_players; g public.rr_games;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform 1 from public.rr_rooms where id = p_room for no key update;
  me := public._rr_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  perform public._rr_advance(p_room);
  select * into rm from public.rr_rooms where id = p_room;
  select * into me from public.rr_players where room_id = p_room and uid = auth.uid();
  select * into g from public.rr_games where room_id = p_room;
  if rm.phase <> 'play' or not me.alive or public._rr_now() >= rm.phase_deadline - interval '2 seconds' then raise exception 'not vote time'; end if;
  if g.vote is not null then raise exception 'vote on'; end if;
  if g.bullets >= (c->>'max_bul')::int then raise exception 'max bullets'; end if;
  if (select count(*) from public.rr_players where room_id = p_room and alive) <= 2 then raise exception 'final no vote'; end if;   -- владелец 21.11: вдвоём голосовать нельзя
  if g.vby is distinct from me.seat or g.vn is distinct from g.n then raise exception 'vote not yours'; end if;   -- только выживший и только этот ход
  perform public._rr_vote_open(p_room, me.seat);
  return public.rr_tick(p_room);
end $$;

create or replace function public.rr_vote(p_room bigint, p_yes boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.rr_players; g public.rr_games;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform 1 from public.rr_rooms where id = p_room for no key update;
  me := public._rr_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  perform public._rr_advance(p_room);
  select * into me from public.rr_players where room_id = p_room and uid = auth.uid();
  select * into g from public.rr_games where room_id = p_room;
  if g.vote is null then raise exception 'no vote'; end if;
  if not me.alive then raise exception 'not alive'; end if;
  if (g.vote->'yes') @> to_jsonb(me.seat::int) or (g.vote->'no') @> to_jsonb(me.seat::int) then raise exception 'voted'; end if;
  perform public._rr_vote_cast(p_room, me.seat, coalesce(p_yes, true));
  return public.rr_tick(p_room);
end $$;

-- сообщение в чат комнаты: длина, частота, повторы, фильтр мата; выбывшие во время игры только читают
create or replace function public.rr_chat_send(p_room bigint, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.rr_players; c jsonb := public._rr_cfg(); t text; mid bigint; now_ts timestamptz := public._rr_now(); last_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into me from public.rr_players where room_id = p_room and uid = auth.uid() for update;   -- по одному сообщению за раз
  if me.uid is null then raise exception 'not in room'; end if;
  if not me.alive and (select phase from public.rr_rooms where id = p_room) in ('play', 'next') then raise exception 'dead'; end if;
  t := regexp_replace(coalesce(p_text, ''), '[\x01-\x09\x0b-\x1f\x7f]', '', 'g');   -- служебные символы (кроме переноса строки)
  t := regexp_replace(t, '\n{3,}', E'\n\n', 'g');
  t := btrim(t, E' \n');
  if t = '' then raise exception 'empty'; end if;
  if char_length(t) > (c->>'chat_len')::int then raise exception 'too long'; end if;
  select max(created_at) into last_at from public.rr_chat where room_id = p_room and uid = auth.uid();
  if last_at > now_ts - make_interval(secs => (c->>'chat_gap')::float8)
     or (select count(*) from public.rr_chat where uid = auth.uid() and created_at > now_ts - public._rr_dur(c, 'chat_burst_s')) >= (c->>'chat_burst')::int then
    raise exception 'too fast';
  end if;
  t := public._rr_clean(t);
  if exists (select 1 from public.rr_chat where room_id = p_room and uid = auth.uid()
             and created_at > now_ts - public._rr_dur(c, 'chat_repeat_s') and public._rr_low(text) = public._rr_low(t)) then
    raise exception 'repeat';
  end if;
  insert into public.rr_chat (room_id, uid, seat, name, kind, text, created_at) values (p_room, auth.uid(), me.seat, me.name, 'msg', t, now_ts)
    returning id into mid;
  return jsonb_build_object('ok', true, 'id', mid, 'text', t, 'at', public._rr_ms(now_ts));
end $$;

-- жалоба на игрока этой комнаты (по месту за столом)
create or replace function public.rr_report(p_room bigint, p_seat int, p_reason text default 'other', p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare tu uuid; gid bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public._rr_member(p_room) then raise exception 'not in room'; end if;
  select uid into tu from public.rr_players where room_id = p_room and seat = p_seat and not bot;
  if tu is null or tu = auth.uid() then raise exception 'bad player'; end if;
  if coalesce(p_reason, '') not in ('abuse', 'cheat', 'spam', 'afk', 'other') then raise exception 'bad reason'; end if;
  if (select count(*) from public.rr_reports where from_uid = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many reports';
  end if;
  select game_id into gid from public.rr_rooms where id = p_room;
  insert into public.rr_reports (room_id, game_id, from_uid, to_uid, reason, note)
    values (p_room, gid, auth.uid(), tu, p_reason, nullif(left(btrim(coalesce(p_note, '')), 300), ''))
  on conflict (room_id, from_uid, to_uid) do update set reason = excluded.reason,
    note = coalesce(excluded.note, public.rr_reports.note), created_at = now();
  perform public._rr_log(p_room, gid, 'report', jsonb_build_object('seat', p_seat, 'reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

-- игра у игрока загрузилась (экран загрузки → «готов»)
create or replace function public.rr_loaded(p_room bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.rr_players;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform 1 from public.rr_rooms where id = p_room for no key update;
  me := public._rr_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  if not me.loaded then
    update public.rr_players set loaded = true where room_id = p_room and uid = auth.uid();
    update public.rr_rooms set rev = rev + 1, updated_at = public._rr_now() where id = p_room;
  end if;
  perform public._rr_advance(p_room);
  return public.rr_tick(p_room);
end $$;

-- ============================================================
-- Группы и подбор (как в CS2). Группа живёт на главном экране: до 5 человек, вход по коду или ссылке.
--   rr_mm_state()          — «пульс» раз в 2–4 с: состав группы, поиск, найденная игра («Принять»), идущая игра.
--   rr_party_open()        — создать свою группу (если нет): нужен код для приглашения.
--   rr_party_join(code)    — войти в группу друга (её поиск при этом сбрасывается, как в CS2).
--   rr_party_leave()       — выйти из группы;  rr_party_kick(n) — лидер убирает игрока n (по порядку входа).
--   rr_search(true/false)  — лидер начинает поиск, любой участник отменяет.
--   rr_accept()            — «Принять» в окне «Ваша игра готова!».
-- Подбор: группы в поиске по очереди (кто раньше начал) складываются ровно в 5 (5, 4+1, 3+2, 3+1+1, 2+2+1, …, 1×5) —
--   недостающих добирает поиск; в подбор идут только группы, где все на связи (пульс не старше 20 с).
-- Найдена игра → комната kind 'quick', mm = true; её лобби = окно «Принять» (accept, 15 с). Все пятеро приняли →
--   экран загрузки → игра. Не все → игра не собрана: группы, где приняли все, сами возвращаются в поиск (место в очереди
--   сохраняется), группы с не принявшим выходят из поиска. Штрафа нет.
-- Блокировки: сначала рекомендательная 'rush-rr-mm', потом строки комнат.
-- ============================================================

-- моя идущая игра: идёт (или экран загрузки), я в ней и не вышел сам
create or replace function public._rr_game() returns bigint language sql stable as $$
  select p.room_id from public.rr_players p join public.rr_rooms r on r.id = p.room_id
  where p.uid = auth.uid() and p.left_at is null
    and (r.phase in ('play', 'next') or (r.phase = 'lobby' and r.mm and r.load_at is not null))
  order by r.id desc limit 1
$$;

create or replace function public._rr_party_new() returns bigint language plpgsql as $$
declare ptid bigint; pr record;
begin
  select name, ava, pid into pr from public.profiles where id = auth.uid();
  insert into public.rr_party (code, leader) values (public._rr_pcode(), auth.uid()) returning id into ptid;
  insert into public.rr_party_members (uid, party_id, name, ava, pid, seen_at) values (auth.uid(), ptid, coalesce(pr.name, 'Игрок'), pr.ava, pr.pid, public._rr_now());
  return ptid;
end $$;

-- событие для всей группы (клиент показывает его один раз — по note_at)
create or replace function public._rr_pnote(p_party bigint, p_kind text, p_names jsonb, p_uids uuid[] default null) returns void language sql as $$
  update public.rr_party set note = jsonb_build_object('kind', p_kind, 'names', coalesce(p_names, '[]'::jsonb), 'uids', to_jsonb(coalesce(p_uids, '{}'::uuid[]))),
    note_at = public._rr_now(), rev = rev + 1, updated_at = public._rr_now()
  where id = p_party
$$;

-- убрать человека из группы (вышел, исключён, пропал). Поиск группы при этом сбрасывается.
create or replace function public._rr_party_out(p_uid uuid, p_why text) returns void language plpgsql as $$
declare m public.rr_party_members; pt public.rr_party;
begin
  select * into m from public.rr_party_members where uid = p_uid;
  if m.uid is null then return; end if;
  select * into pt from public.rr_party where id = m.party_id;
  if pt.state = 'match' and exists (select 1 from public.rr_rooms where id = pt.room_id and phase = 'lobby' and load_at is null) then
    raise exception 'match pending';   -- идёт «Принять»: выйти можно после
  end if;
  delete from public.rr_party_members where uid = p_uid;
  if not exists (select 1 from public.rr_party_members where party_id = pt.id) then
    delete from public.rr_party where id = pt.id;
    return;
  end if;
  update public.rr_party set
    leader = case when leader = p_uid then (select uid from public.rr_party_members where party_id = pt.id order by joined_at limit 1) else leader end,
    state = case when state = 'search' then 'idle' else state end,
    search_at = case when state = 'search' then null else search_at end
  where id = pt.id;
  perform public._rr_pnote(pt.id, p_why, jsonb_build_array(coalesce(m.name, 'Игрок')), array[p_uid]);
end $$;

-- подбор: складываем группы из очереди ровно в 5 и создаём комнату игры (окно «Принять»)
create or replace function public._rr_mm_match() returns int language plpgsql as $$
declare
  c jsonb := public._rr_cfg(); now_ts timestamptz := public._rr_now(); made int := 0;
  anc record; q record; pick bigint[]; need int; rid bigint; s int; m record; bn text; v_seat int[];
begin
  perform pg_advisory_xact_lock(hashtext('rush-rr-mm'));
  loop
    pick := null;
    for anc in select pt.id, count(mb.uid)::int cnt, cardinality(pt.bots) nb from public.rr_party pt join public.rr_party_members mb on mb.party_id = pt.id
        where pt.state = 'search' group by pt.id, pt.search_at, pt.bots
        having bool_and(mb.seen_at >= now_ts - interval '20 seconds') and count(mb.uid) + cardinality(pt.bots) <= 5 order by pt.search_at, pt.id loop
      pick := array[anc.id]; need := case when anc.nb > 0 then 0 else 5 - anc.cnt end;   -- с ботами — стол только из своих, остальное — боты
      for q in select pt.id, count(mb.uid)::int cnt from public.rr_party pt join public.rr_party_members mb on mb.party_id = pt.id
          where pt.state = 'search' and pt.id <> anc.id and cardinality(pt.bots) = 0 group by pt.id, pt.search_at
          having bool_and(mb.seen_at >= now_ts - interval '20 seconds') order by pt.search_at, pt.id loop
        exit when need <= 0;
        if q.cnt <= need then pick := pick || q.id; need := need - q.cnt; end if;
      end loop;
      exit when need = 0;
      pick := null;
    end loop;
    exit when pick is null;
    insert into public.rr_rooms (code, kind, owner, mm, phase_at, phase_deadline)
      values (public._rr_code(), 'quick', (select leader from public.rr_party where id = pick[1]), true, now_ts, now_ts + public._rr_dur(c, 'accept'))
      returning id into rid;
    s := 0; v_seat := array(select x from generate_series(1, 5) x order by random());   -- места вперемешку: и друзья группы, и боты (владелец 22.11)
    for m in select mb.uid, mb.party_id, mb.name, mb.ava, mb.pid, (select count(*) from public.rr_party_members x where x.party_id = mb.party_id) psize
        from public.rr_party_members mb join unnest(pick) with ordinality u(ptid, ord) on u.ptid = mb.party_id
        order by u.ord, mb.joined_at loop
      s := s + 1;
      insert into public.rr_players (room_id, uid, seat, name, ava, pid, seen_at, solo, party_id)
        values (rid, m.uid, v_seat[s], coalesce(m.name, 'Игрок'), m.ava, m.pid, now_ts, m.psize = 1, m.party_id);
    end loop;
    for bn in select b from public.rr_party pt, unnest(pt.bots) b where pt.id = pick[1] loop   -- боты лобби, потом — до пяти
      exit when s >= 5; s := s + 1;
      insert into public.rr_players (room_id, uid, seat, name, ready, loaded, bot, seen_at) values (rid, gen_random_uuid(), v_seat[s], bn, true, true, true, now_ts);
    end loop;
    while s < 5 and (select cardinality(bots) from public.rr_party where id = pick[1]) > 0 loop
      s := s + 1;
      select n into bn from unnest(array['Viper', 'Сова', 'Grizzly', 'Lynx', 'Кобра', 'Shade', 'Гром', 'Ghost', 'Рысь', 'Волк']) n where not exists (select 1 from public.rr_players where room_id = rid and name = n) order by random() limit 1;
      insert into public.rr_players (room_id, uid, seat, name, ready, loaded, bot, seen_at) values (rid, gen_random_uuid(), v_seat[s], coalesce(bn, 'Бот ' || v_seat[s]), true, true, true, now_ts);
    end loop;
    update public.rr_party set state = 'match', room_id = rid, note = null, rev = rev + 1, updated_at = now_ts where id = any(pick);
    perform public._rr_log(rid, null, 'mm_match', jsonb_build_object('parties', to_jsonb(pick)));
    made := made + 1;
  end loop;
  return made;
end $$;

-- группа после найденной игры: ещё «Принять» / не собралась (снова в поиск или выход) / идёт игра / игра кончилась
create or replace function public._rr_mm_sync(p_party bigint) returns void language plpgsql as $$
declare pt public.rr_party; rm public.rr_rooms; miss jsonb; muids uuid[]; now_ts timestamptz := public._rr_now();
begin
  select * into pt from public.rr_party where id = p_party;
  if pt.id is null or pt.state <> 'match' then return; end if;
  if pt.room_id is not null then
    perform 1 from public.rr_rooms where id = pt.room_id for no key update;
    perform public._rr_advance(pt.room_id);
    select * into rm from public.rr_rooms where id = pt.room_id;
  end if;
  if rm.id is null then
    update public.rr_party set state = 'idle', room_id = null, search_at = null, rev = rev + 1, updated_at = now_ts where id = p_party;
    return;
  end if;
  if rm.phase = 'lobby' or (rm.phase <> 'done' and rm.game_id is not null) then return; end if;   -- ещё «Принять» или идёт игра
  if rm.game_id is null and rm.load_at is not null then   -- все приняли, но кто-то вышел на загрузке — игра отменена, поиск заново
    update public.rr_party set state = 'idle', room_id = null, search_at = null, rev = rev + 1, updated_at = now_ts where id = p_party;
    perform public._rr_pnote(p_party, 'abort', '[]'::jsonb);
    return;
  end if;
  if rm.game_id is null then   -- игра не собралась: не все приняли
    select jsonb_agg(coalesce(name, 'Игрок') order by seat), array_agg(uid) into miss, muids
      from public.rr_players where room_id = rm.id and party_id = p_party and not ready;
    if miss is null then   -- у нас приняли все — снова в поиск, место в очереди то же
      update public.rr_party set state = 'search', room_id = null, rev = rev + 1, updated_at = now_ts where id = p_party;
      perform public._rr_pnote(p_party, 'requeue', (select jsonb_agg(coalesce(name, 'Игрок') order by seat) from public.rr_players where room_id = rm.id and not ready));
    else
      update public.rr_party set state = 'idle', room_id = null, search_at = null, rev = rev + 1, updated_at = now_ts where id = p_party;
      perform public._rr_pnote(p_party, 'missed', miss, muids);
    end if;
    return;
  end if;
  -- игра закончилась — группа снова свободна
  update public.rr_party set state = 'idle', room_id = null, search_at = null, rev = rev + 1, updated_at = now_ts where id = p_party;
end $$;

-- «пульс» группы: состав, поиск, окно «Принять», идущая игра
create or replace function public.rr_mm_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb := public._rr_cfg(); now_ts timestamptz := public._rr_now(); me public.rr_party_members; pt public.rr_party; rm public.rr_rooms;
  u uuid; mt jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-rr-mm'));
  select * into me from public.rr_party_members where uid = auth.uid();
  if me.uid is not null then
    update public.rr_party_members set seen_at = now_ts where uid = auth.uid();
    perform public._rr_mm_sync(me.party_id);
    select * into pt from public.rr_party where id = me.party_id;
    if pt.state <> 'match' then   -- закрыл сайт и пропал надолго — выходит из группы сам
      for u in select uid from public.rr_party_members where party_id = pt.id and uid <> auth.uid() and seen_at < now_ts - public._rr_dur(c, 'mm_stale') loop
        perform public._rr_party_out(u, 'gone');
      end loop;
    end if;
    select * into pt from public.rr_party where id = me.party_id;
    if pt.state = 'search' then perform public._rr_mm_match(); select * into pt from public.rr_party where id = me.party_id; end if;
    if pt.state = 'match' and pt.room_id is not null then
      update public.rr_players set seen_at = now_ts where room_id = pt.room_id and uid = auth.uid();
      select * into rm from public.rr_rooms where id = pt.room_id;
      if rm.phase = 'lobby' and rm.load_at is null then
        mt := jsonb_build_object('room', rm.id, 'deadline', public._rr_ms(rm.phase_deadline), 'total', (c->>'accept')::numeric,
          'accepted', (select count(*) from public.rr_players where room_id = rm.id and ready),
          'me_ready', coalesce((select ready from public.rr_players where room_id = rm.id and uid = auth.uid()), false),
          'players', (select jsonb_agg(jsonb_build_object('seat', p.seat, 'ready', p.ready, 'me', p.uid = auth.uid(), 'mine', p.party_id = pt.id) order by p.seat)
            from public.rr_players p where p.room_id = rm.id));
      end if;
    end if;
  end if;
  return jsonb_build_object('now', public._rr_ms(now_ts), 'game', public._rr_game(), 'match', mt,
    'party', case when pt.id is null then null else jsonb_build_object('id', pt.id, 'code', pt.code, 'state', pt.state, 'rev', pt.rev,
      'leader', pt.leader = auth.uid(), 'search_at', public._rr_ms(pt.search_at),
      'note', case when pt.note is null then null else jsonb_build_object('kind', pt.note->>'kind', 'names', pt.note->'names',
        'me', coalesce(pt.note->'uids' ? auth.uid()::text, false), 'at', public._rr_ms(pt.note_at)) end,
      'members', (select jsonb_agg(jsonb_build_object('name', mb.name, 'ava', mb.ava, 'pid', mb.pid, 'me', mb.uid = auth.uid(),
          'leader', mb.uid = pt.leader, 'online', mb.seen_at >= now_ts - interval '20 seconds') order by mb.joined_at)
        from public.rr_party_members mb where mb.party_id = pt.id),
      'bots', coalesce((select jsonb_agg(jsonb_build_object('name', b, 'n', i) order by i) from unnest(pt.bots) with ordinality x(b, i)), '[]'::jsonb),
      'admin', public._rr_staff()) end);
end $$;

create or replace function public.rr_party_open() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-rr-mm'));
  if not exists (select 1 from public.rr_party_members where uid = auth.uid()) then perform public._rr_party_new(); end if;
  return public.rr_mm_state();
end $$;

create or replace function public.rr_party_join(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pt public.rr_party; cur bigint; cd text := upper(btrim(coalesce(p_code, ''))); nm text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-rr-mm'));
  select * into pt from public.rr_party where code = cd;
  if pt.id is null then raise exception 'party not found'; end if;
  select party_id into cur from public.rr_party_members where uid = auth.uid();
  if cur = pt.id then return public.rr_mm_state(); end if;
  perform public._rr_mm_sync(pt.id);
  select * into pt from public.rr_party where id = pt.id;
  if pt.state = 'match' and exists (select 1 from public.rr_rooms where id = pt.room_id and phase = 'lobby') then raise exception 'party busy'; end if;
  if (select count(*) from public.rr_party_members where party_id = pt.id) + cardinality(pt.bots) >= 5 then raise exception 'party full'; end if;
  if cur is not null then perform public._rr_party_out(auth.uid(), 'left'); end if;
  select coalesce(name, 'Игрок') into nm from public.profiles where id = auth.uid();
  insert into public.rr_party_members (uid, party_id, name, ava, pid, seen_at)
    select auth.uid(), pt.id, coalesce(p.name, 'Игрок'), p.ava, p.pid, public._rr_now() from public.profiles p where p.id = auth.uid();
  update public.rr_party set state = case when state = 'search' then 'idle' else state end,
    search_at = case when state = 'search' then null else search_at end where id = pt.id;
  perform public._rr_pnote(pt.id, 'join', jsonb_build_array(coalesce(nm, 'Игрок')), array[auth.uid()]);
  return public.rr_mm_state();
end $$;

create or replace function public.rr_party_leave() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-rr-mm'));
  perform public._rr_party_out(auth.uid(), 'left');
  return public.rr_mm_state();
end $$;

create or replace function public.rr_party_kick(p_n int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ptid bigint; u uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-rr-mm'));
  select p.id into ptid from public.rr_party p join public.rr_party_members mb on mb.party_id = p.id where mb.uid = auth.uid() and p.leader = auth.uid();
  if ptid is null then raise exception 'not leader'; end if;
  select uid into u from public.rr_party_members where party_id = ptid order by joined_at offset greatest(coalesce(p_n, 0) - 1, 0) limit 1;
  if u is null or u = auth.uid() then raise exception 'bad player'; end if;
  perform public._rr_party_out(u, 'kicked');
  return public.rr_mm_state();
end $$;

-- бот в лобби (владелец 20.11): p_add — добавить (случайное имя), иначе убрать бота номер p_n; только админ, лобби свободно
create or replace function public.rr_party_bot(p_add boolean default true, p_n int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.rr_party_members; pt public.rr_party; v_nm text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public._rr_staff() then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-rr-mm'));
  select * into me from public.rr_party_members where uid = auth.uid();
  if me.uid is null then perform public._rr_party_new(); select * into me from public.rr_party_members where uid = auth.uid(); end if;
  perform public._rr_mm_sync(me.party_id);
  select * into pt from public.rr_party where id = me.party_id;
  if pt.state <> 'idle' then raise exception 'party busy'; end if;
  if coalesce(p_add, true) then
    if (select count(*) from public.rr_party_members where party_id = pt.id) + cardinality(pt.bots) >= 5 then raise exception 'party full'; end if;
    select n into v_nm from unnest(array['Viper', 'Сова', 'Grizzly', 'Lynx', 'Кобра', 'Shade', 'Гром', 'Ghost', 'Рысь', 'Волк']) n
      where not (n = any (pt.bots)) and not exists (select 1 from public.rr_party_members where party_id = pt.id and name = n) order by random() limit 1;
    update public.rr_party set bots = bots || coalesce(v_nm, 'Бот ' || (cardinality(bots) + 1)), rev = rev + 1, updated_at = public._rr_now() where id = pt.id;
  else
    if p_n is null or p_n < 1 or p_n > cardinality(pt.bots) then raise exception 'not bot'; end if;
    update public.rr_party set bots = bots[1:p_n - 1] || bots[p_n + 1:], rev = rev + 1, updated_at = public._rr_now() where id = pt.id;
  end if;
  return public.rr_mm_state();
end $$;

-- «Играть» (лидер) / отмена поиска (любой участник)
create or replace function public.rr_search(p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.rr_party_members; pt public.rr_party; rm public.rr_rooms; v_low text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-rr-mm'));
  select * into me from public.rr_party_members where uid = auth.uid();
  if not coalesce(p_on, true) then
    if me.uid is not null then
      select * into pt from public.rr_party where id = me.party_id;
      if pt.state = 'search' then
        update public.rr_party set state = 'idle', search_at = null where id = pt.id;
        perform public._rr_pnote(pt.id, 'cancel', jsonb_build_array(coalesce(me.name, 'Игрок')), array[auth.uid()]);
      end if;
    end if;
    return public.rr_mm_state();
  end if;
  if me.uid is null then perform public._rr_party_new(); select * into me from public.rr_party_members where uid = auth.uid(); end if;
  perform public._rr_mm_sync(me.party_id);
  select * into pt from public.rr_party where id = me.party_id;
  if pt.leader <> auth.uid() then raise exception 'not leader'; end if;
  if pt.state = 'search' then return public.rr_mm_state(); end if;
  if pt.state = 'match' then
    select * into rm from public.rr_rooms where id = pt.room_id;
    if rm.phase = 'lobby' then return public.rr_mm_state(); end if;
    if rm.phase in ('play', 'next') then raise exception 'in game'; end if;
  end if;
  if exists (select 1 from public.rr_party_members mb join public.rr_players p on p.uid = mb.uid join public.rr_rooms r on r.id = p.room_id
      where mb.party_id = pt.id and r.phase in ('play', 'next') and p.left_at is null) then
    raise exception 'member in game';
  end if;
  -- деньги (владелец 21.11): у всех в группе — не меньше минимальной ставки; группа с ботами и группа из 5 — без денег
  if (cardinality(pt.bots) = 0 and (select count(*) from public.rr_party_members where party_id = pt.id) < 5)
     or (cardinality(pt.bots) > 0 and (select count(*) from public.rr_party_members where party_id = pt.id) >= 2) then   -- с ботами — на деньги, если людей от двух
    select string_agg(coalesce(mb.name, 'Игрок'), ', ') into v_low from public.rr_party_members mb left join public.profiles f on f.id = mb.uid
      where mb.party_id = pt.id and coalesce((f.data->>'balance')::numeric, 0) < (public._rr_cfg()->>'min_bet')::numeric;
    if v_low is not null then raise exception 'low balance: %', v_low; end if;
  end if;
  update public.rr_party set state = 'search', search_at = public._rr_now(), room_id = null, note = null, rev = rev + 1, updated_at = public._rr_now() where id = pt.id;
  update public.rr_party_members set seen_at = public._rr_now() where uid = auth.uid();
  perform public._rr_mm_match();
  return public.rr_mm_state();
end $$;

-- «Принять» в окне «Ваша игра готова!»
create or replace function public.rr_accept() returns jsonb
language plpgsql security definer set search_path = public as $$
declare pt public.rr_party; rm public.rr_rooms;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('rush-rr-mm'));
  select p.* into pt from public.rr_party p join public.rr_party_members mb on mb.party_id = p.id where mb.uid = auth.uid();
  if pt.id is null or pt.state <> 'match' or pt.room_id is null then raise exception 'no match'; end if;
  perform 1 from public.rr_rooms where id = pt.room_id for no key update;
  perform public._rr_advance(pt.room_id);
  select * into rm from public.rr_rooms where id = pt.room_id;
  if rm.phase <> 'lobby' then
    if rm.game_id is null then raise exception 'too late'; end if;
    return public.rr_mm_state();   -- уже стартовали
  end if;
  update public.rr_players set ready = true, seen_at = public._rr_now() where room_id = rm.id and uid = auth.uid();
  update public.rr_rooms set rev = rev + 1, updated_at = public._rr_now() where id = rm.id;
  perform public._rr_advance(rm.id);
  return public.rr_mm_state();
end $$;

-- ---------- закрытый канал Realtime 'rr:<room_id>' — только участники комнаты ----------
do $do$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "rr: members receive" on realtime.messages';
    execute 'drop policy if exists "rr: members send" on realtime.messages';
    execute $p$create policy "rr: members receive" on realtime.messages for select to authenticated using (
      realtime.topic() ~ '^rr:[0-9]{1,18}$' and public._rr_member(split_part(realtime.topic(), ':', 2)::bigint))$p$;
    execute $p$create policy "rr: members send" on realtime.messages for insert to authenticated with check (
      realtime.topic() ~ '^rr:[0-9]{1,18}$' and public._rr_member(split_part(realtime.topic(), ':', 2)::bigint))$p$;
  end if;
exception when others then raise notice 'rr: политика Realtime не создана (%)', sqlerrm;
end $do$;

-- ============================================================
-- Самопроверка: патроны и первый стрелок из seed (равномерно, без повторов), commit–reveal, фильтр чата.
-- Запуск вручную: select public.rr_selftest(3000);
-- ============================================================
create or replace function public.rr_selftest(p_n int default 3000) returns jsonb language plpgsql as $$
declare
  i int; b int; v_seed text; ch smallint[]; cnt int[] := array[0, 0, 0, 0, 0, 0]; fst int[] := array[0, 0, 0, 0, 0];
  p0 int[] := array[0, 0, 0, 0, 0, 0]; bad jsonb := '[]'::jsonb; skew boolean := false; ok_hash boolean; ok_chat boolean; h bigint;
  n int := greatest(p_n, 1);
begin
  for i in 1..n loop
    v_seed := md5(i::text || ':' || random()::text) || md5(random()::text);
    for b in 1..5 loop   -- нужное число разных гнёзд 0–5, по возрастанию
      ch := public._rr_chambers(v_seed, b);
      if cardinality(ch) <> b or (select count(distinct x) from unnest(ch) x) <> b or exists (select 1 from unnest(ch) x where x < 0 or x > 5)
         or ch <> array(select x from unnest(ch) x order by x) then
        if jsonb_array_length(bad) < 5 then bad := bad || jsonb_build_array(jsonb_build_object('seed', v_seed, 'b', b, 'ch', to_jsonb(ch))); end if;
      end if;
    end loop;
    ch := public._rr_chambers(v_seed, 1);
    cnt[ch[1] + 1] := cnt[ch[1] + 1] + 1;
    h := public._rr_h(v_seed, 'f');
    if h < 0 or h > 4294967295 then bad := bad || '["h вне 0…2^32−1"]'::jsonb; end if;
    fst[1 + (h % 5)::int] := fst[1 + (h % 5)::int] + 1;
    p0[1 + (public._rr_h(v_seed, 'p0') % 6)::int] := p0[1 + (public._rr_h(v_seed, 'p0') % 6)::int] + 1;
  end loop;
  if n >= 1000 then   -- патрон, первый стрелок, гнездо в начале — примерно поровну
    skew := exists (select 1 from unnest(cnt) x where x < n * 0.12 or x > n * 0.215)
         or exists (select 1 from unnest(fst) x where x < n * 0.15 or x > n * 0.25)
         or exists (select 1 from unnest(p0) x where x < n * 0.12 or x > n * 0.215);
  end if;
  -- commit–reveal: sha256 как в браузере (crypto.subtle); формат proof; другой seed — другой хеш
  ok_hash := public._rr_hash('abc') = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    and public._rr_proof(7, 2, array[1, 3, 4]::smallint[], 2, 'ab') = 'RUSHRR|7|2|1,3,4|2|ab'
    and public._rr_hash(public._rr_proof(7, 4, array[1, 2]::smallint[], 5, 'a')) <> public._rr_hash(public._rr_proof(7, 4, array[1, 2]::smallint[], 5, 'b'))
    and public._rr_h('s', 't') = ('x' || substr(public._rr_hash('s:t'), 1, 8))::bit(32)::bigint
    and public._rr_h('s', 't') = (select sum(get_byte(decode(substr(public._rr_hash('s:t'), 1, 8), 'hex'), k)::bigint << (8 * (3 - k))) from generate_series(0, 3) k);
  ok_chat := public._rr_clean('ну ты ХУЙ') = 'ну ты ***' and public._rr_clean('ПИЗДЕЦ!') = '*******'
    and public._rr_clean('два рубля, сукно, застрахуй') = 'два рубля, сукно, застрахуй' and public._rr_clean('крути барабан') = 'крути барабан';
  return jsonb_build_object('ok', bad = '[]'::jsonb and not skew and ok_hash and ok_chat,
    'seeds', n, 'bad', bad, 'bullet_pos', to_jsonb(cnt), 'first_seat', to_jsonb(fst), 'start_pos', to_jsonb(p0), 'skew', skew,
    'hash_ok', ok_hash, 'chat_ok', ok_chat);
end $$;

-- ---------- боты: добавить / убрать (владелец 20.11: только админы — владелец и сотрудники; только лобби комнаты друзей) ----------
create or replace function public._rr_bot_room(p_room bigint) returns public.rr_rooms language plpgsql as $$
declare rm public.rr_rooms; me public.rr_players;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public._rr_staff() then raise exception 'forbidden'; end if;
  select * into rm from public.rr_rooms where id = p_room for no key update;
  me := public._rr_touch(p_room);
  if me.uid is null then raise exception 'not in room'; end if;
  if rm.phase <> 'lobby' or rm.kind <> 'private' or rm.mm then raise exception 'not lobby'; end if;
  return rm;
end $$;
create or replace function public.rr_bot_add(p_room bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s int; v_nm text;
begin
  perform public._rr_bot_room(p_room);
  select x into s from generate_series(1, 5) x where not exists (select 1 from public.rr_players where room_id = p_room and seat = x) order by random() limit 1;   -- случайное свободное место
  if s is null then raise exception 'room full'; end if;
  select n into v_nm from unnest(array['Viper', 'Сова', 'Grizzly', 'Lynx', 'Кобра', 'Shade', 'Гром', 'Ghost', 'Рысь', 'Волк']) n
    where not exists (select 1 from public.rr_players where room_id = p_room and name = n) order by random() limit 1;
  v_nm := coalesce(v_nm, 'Бот ' || s);
  insert into public.rr_players (room_id, uid, seat, name, ready, loaded, bot, seen_at)
    values (p_room, gen_random_uuid(), s, v_nm, true, true, true, public._rr_now());
  update public.rr_rooms set rev = rev + 1, updated_at = public._rr_now() where id = p_room;
  perform public._rr_sys(p_room, format('Бот %s сел за стол.', v_nm));
  perform public._rr_log(p_room, null, 'bot_add', jsonb_build_object('seat', s, 'name', v_nm));
  return public.rr_tick(p_room);
end $$;
create or replace function public.rr_bot_del(p_room bigint, p_seat int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_nm text;
begin
  perform public._rr_bot_room(p_room);
  delete from public.rr_players where room_id = p_room and seat = p_seat and bot returning name into v_nm;
  if v_nm is null then raise exception 'not bot'; end if;
  update public.rr_rooms set rev = rev + 1, updated_at = public._rr_now() where id = p_room;
  perform public._rr_sys(p_room, format('Бот %s ушёл из-за стола.', v_nm));
  perform public._rr_log(p_room, null, 'bot_del', jsonb_build_object('seat', p_seat));
  return public.rr_tick(p_room);
end $$;

-- ---------- рейтинг (владелец 21.11): очки за всё время, топ до 100 + своё место; видят и гости ----------
create or replace function public.rr_top(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 100), 1), 100); v_rows jsonb; v_me jsonb; v_total int;
begin
  with t as (
    select uid, sum(pts)::int as pts, sum(games)::int as games, sum(wins)::int as wins, sum(won) as won
      from public.rr_points group by uid having sum(pts) > 0 or sum(won) > 0
  ), r as (
    select t.*, rank() over (order by t.pts desc, t.wins desc) as place from t
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('place', x.place, 'pid', x.pid, 'name', coalesce(x.name, 'Игрок'), 'ava', x.ava,
        'pts', x.pts, 'games', x.games, 'wins', x.wins, 'won', x.won, 'me', coalesce(x.uid = auth.uid(), false)) order by x.place, x.pid), '[]'::jsonb)
       from (select r.*, p.pid, p.name, p.ava from r join public.profiles p on p.id = r.uid order by r.place, p.pid limit lim) x),
    (select jsonb_build_object('place', r.place, 'pts', coalesce(r.pts, 0), 'games', coalesce(r.games, 0), 'wins', coalesce(r.wins, 0), 'won', coalesce(r.won, 0),
        'pid', p.pid, 'name', coalesce(p.name, 'Игрок'), 'ava', p.ava, 'me', true)
       from public.profiles p left join r on r.uid = p.id where p.id = auth.uid()),
    (select count(*)::int from r)
  into v_rows, v_me, v_total;
  return jsonb_build_object('rows', v_rows, 'me', v_me, 'total', v_total, 'pts', public._rr_cfg()->'pts');
end $$;

-- ---------- права на функции ----------
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like '\_rr\_%' or p.proname like 'rr\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
grant execute on function public._rr_member(bigint) to authenticated;   -- нужна политикам чтения
grant execute on function public.rr_state(bigint, bigint), public.rr_tick(bigint), public.rr_leave(bigint),
  public.rr_create(boolean), public.rr_join(text), public.rr_quick(), public.rr_ready(bigint, boolean),
  public.rr_spin(bigint, int), public.rr_shoot(bigint, int), public.rr_chat_send(bigint, text), public.rr_report(bigint, int, text, text),
  public.rr_loaded(bigint), public.rr_mm_state(), public.rr_party_open(), public.rr_party_join(text), public.rr_party_leave(),
  public.rr_party_kick(int), public.rr_search(boolean), public.rr_accept(), public.rr_bot_add(bigint), public.rr_bot_del(bigint, int), public.rr_party_bot(boolean, int),
  public.rr_bet(bigint, int), public.rr_vote_start(bigint), public.rr_vote(bigint, boolean) to authenticated;
grant execute on function public.rr_top(int) to anon, authenticated;   -- рейтинг видят и гости
-- rr_selftest — только из SQL Editor

select public.rr_selftest(3000) as "РУЛЕТКА: самопроверка";

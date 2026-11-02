-- 02.11.2026: 1VS5 — новый дроп в js/app.js (78%, каждое 16-е открытие дороже кейса). Открываем кейс.
-- Запустить в Supabase → SQL Editor, затем открыть #/admin под владельцем (admSync зальёт новый состав на сервер).
update public.case_settings set disabled = false, updated_at = now() where id = '1vs5';
select id, disabled, luck from public.case_settings where id = '1vs5';

-- 02.11.2026: пересобран дроп 16 кейсов (js/app.js). У «Сладкой ваты», Mirage и ELITE GLOVES состав раньше правили в админке —
-- эта правка перекрывает код. Убираем из неё только список скинов (items); цена перчаток 7 999 ₽, картинка Mirage и остальное — остаются.
-- Запустить в Supabase → SQL Editor, затем открыть #/admin под владельцем (admSync зальёт новые кейсы на сервер).
update public.site_cfg set v = v - 'items', updated_at = now() where k in ('case:cotton', 'case:mirage', 'case:gloves');
select k, v from public.site_cfg where k in ('case:cotton', 'case:mirage', 'case:gloves');

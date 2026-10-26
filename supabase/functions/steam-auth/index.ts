// RUSH CASE — вход через Steam (OpenID 2.0) для Supabase.
// Supabase → Edge Functions → функция «steam-auth». Проверку JWT для неё ВЫКЛЮЧИТЬ (Steam возвращает игрока без токена).
// Секрет STEAM_API_KEY (необязательно) — чтобы подтянуть ник и аватар из Steam.
//
// Как работает:
//  1) сайт отправляет игрока на  .../functions/v1/steam-auth?start=1&ret=<адрес сайта>
//  2) функция перенаправляет на официальный вход Steam
//  3) Steam возвращает игрока сюда; функция проверяет ответ у самого Steam (check_authentication) и получает SteamID
//  4) создаёт (или находит) аккаунт, выпускает одноразовый токен входа и возвращает игрока на сайт: ?steam_token=...
//  5) сайт меняет токен на сессию (verifyOtp)
import { createClient } from 'npm:@supabase/supabase-js@2';

// куда разрешено возвращать игрока
const SITES = ['https://senzsenz74-dot.github.io/rush-case/', 'http://localhost:5178/'];

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const base = Deno.env.get('SUPABASE_URL')!;
  const self = `${base}/functions/v1/steam-auth`;
  const ret = url.searchParams.get('ret') || SITES[0];
  if (!SITES.some((s) => ret.startsWith(s))) return new Response('bad return url', { status: 400 });
  const back = (q: string) => Response.redirect(ret.split('#')[0].split('?')[0] + '?' + q, 302);

  // 1–2. старт: на страницу входа Steam
  if (url.searchParams.get('start')) {
    const p = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': `${self}?ret=${encodeURIComponent(ret)}`,
      'openid.realm': new URL(self).origin,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });
    return Response.redirect('https://steamcommunity.com/openid/login?' + p.toString(), 302);
  }

  // 3. ответ Steam
  if (url.searchParams.get('openid.mode') !== 'id_res') return back('steam_error=cancel');
  if (!(url.searchParams.get('openid.return_to') || '').startsWith(self)) return back('steam_error=bad');
  const check = new URLSearchParams();
  url.searchParams.forEach((v, k) => { if (k.startsWith('openid.')) check.set(k, v); });
  check.set('openid.mode', 'check_authentication');
  const vr = await fetch('https://steamcommunity.com/openid/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: check.toString() });
  if (!/is_valid\s*:\s*true/.test(await vr.text())) return back('steam_error=invalid');
  const m = (url.searchParams.get('openid.claimed_id') || '').match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  if (!m) return back('steam_error=invalid');
  const sid = m[1];

  // ник и аватар из Steam
  let nick = 'Steam_' + sid.slice(-5), avatar: string | null = null;
  const key = Deno.env.get('STEAM_API_KEY');
  if (key) {
    try {
      const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${sid}`);
      const pl = (await r.json())?.response?.players?.[0];
      if (pl) { nick = String(pl.personaname || nick).trim().slice(0, 16) || nick; avatar = pl.avatarfull || null; }
    } catch (_) { /* без ника из Steam */ }
  }

  // 4. аккаунт и одноразовый токен входа
  const admin = createClient(base, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const email = `steam${sid}@steam.rushcase.app`;
  await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { nick, steamid: sid, avatar } }); // уже есть — не страшно
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !link?.properties?.hashed_token) return back('steam_error=link');
  const upd: Record<string, string> = { steamid: sid };
  if (avatar) upd.ava = avatar;
  await admin.from('profiles').update(upd).eq('id', link.user.id);
  return back('steam_token=' + encodeURIComponent(link.properties.hashed_token));
});

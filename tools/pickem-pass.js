// Пропуск пикема: билет (рендер blender-coin/pickem_ticket.py) + монета (pickem_coin.py) внизу слева, как в CS2 → assets/pickem/pass.webp
// node tools/pickem-pass.js <ticket.png> <coin.png> <выход.webp>
const path = require('path');
let sharp; for (const p of ['sharp', path.join(__dirname, '..', 'promo-video', 'node_modules', 'sharp'), 'D:/Кейсы/promo-video/node_modules/sharp']) { try { sharp = require(p); break; } catch (e) { /* дальше */ } }
const [tk, cn, out] = process.argv.slice(2);
(async () => {
  const t = await sharp(tk).trim().png().toBuffer(), tm = await sharp(t).metadata();
  const D = Math.round(tm.height * 0.6);
  const c = await sharp(cn).trim().resize(D, D, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const sh = await sharp(c).ensureAlpha().linear([0, 0, 0, 0.55], [0, 0, 0, 0]).blur(14).png().toBuffer();   // тень монеты
  const ox = Math.round(D * 0.3), W = tm.width + ox, H = Math.round(tm.height + D * 0.18);
  const full = await sharp({ create: { width: W, height: H + 14, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: t, left: ox, top: 0 }, { input: sh, left: 10, top: H - D + 12 }, { input: c, left: 0, top: H - D }]).png().toBuffer(); // сначала склеить, потом уменьшать (иначе sharp уменьшит основу раньше)
  await sharp(full).resize(760).webp({ quality: 88, alphaQuality: 100 }).toFile(out);
  console.log('pass', W, H, '→', out);
})();

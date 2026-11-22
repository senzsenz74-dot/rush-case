// Логотипы команд пикема: PNG с Liquipedia → assets/pickem/<id>.webp (128×128, прозрачный фон, логотип по центру).
// node tools/pickem-logos.js <папка с png> <папка вывода>   (sharp берём из promo-video/node_modules)
const path = require('path'), fs = require('fs');
const sharp = require(path.join(__dirname, '..', '..', '..', '..', 'promo-video', 'node_modules', 'sharp'));
const [src, out] = process.argv.slice(2);
(async () => {
  for (const f of fs.readdirSync(src).filter(f => f.endsWith('.png'))) {
    const id = f.replace(/\.png$/, '');
    const trimmed = await sharp(path.join(src, f)).trim().png().toBuffer();
    await sharp(trimmed).resize(112, 112, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(out, id + '.webp'));
  }
  console.log(fs.readdirSync(out).map(f => f + ' ' + fs.statSync(path.join(out, f)).size).join('\n'));
})();

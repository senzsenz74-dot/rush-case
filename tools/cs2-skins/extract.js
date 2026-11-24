// Выгрузка из VPK всего, что нужно для партии скинов: модель оружия, «входы покраски» оружия, материал окраски.
// Уже выгруженное пропускает. Запуск: node extract.js <партия.json>   (партия — список {w, kit} из match.js)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const R = 'C:/Users/Admin/tools/cs2x', CLI = 'C:/Users/Admin/tools/s2v-cli/Source2Viewer-CLI.exe';
const VPK = 'D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive/game/csgo/pak01_dir.vpk';
const IG = fs.readFileSync(R + '/scripts/items/items_game.txt', 'utf8');
const run = (f, out, extra = []) => { try { execFileSync(CLI, ['-i', VPK, '-f', f + ',cfg/video_version.txt', '-o', out, '-d', ...extra], { stdio: 'pipe' }); } catch (e) { console.log('ERR', f, String(e.stderr || e).slice(0, 200)); } };
// путь модели оружия: "model_player" в блоке оружия или его prefab
function modelOf(w) {
  for (const re of [new RegExp('"name"\\s+"' + w + '"\\s*\\n((?:[^{}\\n]*\\n){0,12})'), new RegExp('"' + w + '_prefab"\\s*\\n\\s*\\{\\s*\\n((?:[^{}\\n]*\\n){0,14})')]) {
    const b = re.exec(IG); const m = b && /"model_player"\s+"([^"]+)"/.exec(b[1]); if (m) return m[1];
  }
  const b = new RegExp('"name"\\s+"' + w + '"\\s*\\n\\s*"prefab"\\s+"([^"]+)"').exec(IG);
  if (b) { const p = new RegExp('"' + b[1] + '"\\s*\\n\\s*\\{\\s*\\n((?:[^{}\\n]*\\n){0,14})').exec(IG); const m = p && /"model_player"\s+"([^"]+)"/.exec(p[1]); if (m) return m[1]; }
  return null;
}
const walk = (d, re) => { const o = []; if (!fs.existsSync(d)) return o; (function w(p) { for (const f of fs.readdirSync(p)) { const q = path.join(p, f); if (fs.statSync(q).isDirectory()) w(q); else if (re.test(f)) o.push(q.replace(/\\/g, '/')); } })(d); return o; };
// Новые скины CS2 (с 2023): окраска в .vcompmat (kv3). Переводим в привычный .vmat ("ключ" "значение"), который читает build_skin3.py:
// шаблон (workshop/paintkits/templates/<префикс>_template) → F_PAINT_STYLE, цвета 0–255 → 0–1, картинки выгружаем рядом.
const TPL = { cu: 6, aq: 7, gs: 8, sp: 2, an: 4, am: 4, aa: 5, hy: 1 };
function fromCompMat(kit, cpath, pd) {
  const tmp = R + '/cm/' + kit; run(cpath + '_c', tmp);
  const f = walk(tmp, /\.vcompmat$/)[0]; if (!f) return console.log('NO VCOMPMAT', kit);
  const t = fs.readFileSync(f, 'utf8');
  const tpl = /templates\/([a-z]+)_[a-z_]*template[^"]*\.vmat/.exec(t);
  const V = { F_PAINT_STYLE: String(TPL[tpl && tpl[1]] || 6), FROM_COMPMAT: '1' }; // FROM_COMPMAT: металл не в альфе рисунка (build_skin3.py)
  const parts = t.split(/m_strName = "/).slice(1);
  const tex = {};
  for (const p of parts) {
    const n = p.slice(0, p.indexOf('"')), b = p.slice(0, p.search(/\n\s*\}/) + 1);
    let m;
    if ((m = /m_cValueColor4 = \[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(b))) V[n] = `[${(m[1] / 255).toFixed(4)} ${(m[2] / 255).toFixed(4)} ${(m[3] / 255).toFixed(4)} 1]`;
    else if ((m = /m_strTextureRuntimeResourcePath = resource_name:"([^"]+)"/.exec(b))) tex[n] = m[1];
    else if ((m = /m_bValueBoolean = (true|false)/.exec(b))) V[n] = m[1] === 'true' ? '1' : '0';
    else if ((m = /m_flValueFloatX = ([-\d.e]+)/.exec(b))) { const y = /m_flValueFloatY = ([-\d.e]+)/.exec(b); V[n] = y ? `[${m[1]} ${y[1]} 0 0]` : m[1]; }
    else if ((m = /m_nValueIntX = (-?\d+)/.exec(b))) V[n] = m[1];
    if (!(n in V) && !(n in tex) && /m_strName/.test(b) === false && /LOOSE_VARIABLE_TYPE_BOOLEAN/.test(b)) V[n] = '0';
  }
  if (!tex.g_tPattern) return console.log('NO PATTERN', kit);
  const want = ['g_tPattern', 'g_tNormal', 'g_tFinalAmbientOcclusion', 'g_tPaintRoughness'].filter(k => tex[k] && !/default\//.test(tex[k]));
  run(want.map(k => tex[k] + '_c').join(','), pd);
  const dir = path.posix.dirname(walk(pd, /\.png$/)[0] || pd + '/x');
  V.TexturePattern = tex.g_tPattern;
  if (tex.g_tNormal && V.g_bUseNormalMap === '1') V.TextureNormal = tex.g_tNormal;
  if (tex.g_tFinalAmbientOcclusion && V.g_bOverrideAmbientOcclusion === '1') V.TextureAO = tex.g_tFinalAmbientOcclusion;
  if (tex.g_tPaintRoughness && V.g_bUseRoughness === '1') V.TextureRoughness = tex.g_tPaintRoughness;
  fs.writeFileSync(dir + '/' + kit + '.vmat', '"Layer0"\n{\n' + Object.entries(V).map(([k, v]) => `\t"${k}"\t"${v}"`).join('\n') + '\n}\n');
  console.log('vcompmat', kit, 'tpl', tpl && tpl[1], 'style', V.F_PAINT_STYLE);
}
const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const W = {};
for (const it of list) {
  if (!W[it.w]) {
    const mp = modelOf(it.w); if (!mp) { console.log('NO MODEL', it.w); continue; }
    const dir = path.posix.dirname(mp), base = path.posix.basename(mp, '.vmdl');
    const gltf = R + '/models/' + dir + '/' + base + '.gltf';
    if (!fs.existsSync(gltf)) run(mp + '_c', R + '/models/' + dir, ['--gltf_export_format', 'gltf', '--gltf_export_materials', '--gltf_textures_adapt']);
    const cid = R + '/ci/' + it.w;
    if (!walk(cid, /_composite_inputs\.vmat$/).length) run(dir + '/materials/composite_inputs/', cid);
    const ci = walk(cid, /_composite_inputs\.vmat$/).sort((a, b) => a.length - b.length)[0];
    W[it.w] = { model: fs.existsSync(gltf) ? gltf : walk(R + '/models/' + dir, /\.gltf$/).find(f => !/physics/.test(f)), ci };
    console.log('weapon', it.w, !!W[it.w].model, !!ci);
  }
  const pd = R + '/paints/' + it.kit;
  const cmp = new RegExp('"name"\\s+"' + it.kit.replace(/[-]/g, '\\-') + '"\\s*\\n(?:[^{}\\n]*\\n){0,10}?\\s*"composite_material_path"\\s+"([^"]+)"').exec(IG);
  if (cmp && !walk(pd, new RegExp('^' + it.kit.replace(/[-]/g, '\\-') + '\\.vmat$')).length) fromCompMat(it.kit, cmp[1], pd);
  else if (!walk(pd, new RegExp('^' + it.kit.replace(/[-]/g, '\\-') + '\\.vmat$')).length) run('materials/models/weapons/customization/paints/vmats/' + it.kit + '.vmat_c', pd);
  it.paint_vmat = walk(pd, new RegExp('^' + it.kit.replace(/[-]/g, '\\-') + '\\.vmat$'))[0];
  Object.assign(it, W[it.w]);
  if (!it.paint_vmat) console.log('NO PAINT', it.kit);
}
fs.writeFileSync(process.argv[2].replace(/\.json$/, '.x.json'), JSON.stringify(list, null, 1));
console.log('ok', list.length);

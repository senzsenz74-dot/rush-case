// Калибровка «Тактики» (бот против бота): гоняем раунды без экрана и считаем, как часто выигрывает сторона игрока
// при разной силе соперников. Своя пятёрка — фулл бай по ролям, гранаты кидают боты (игрок не помогает).
//   node tools/tac-calibrate.js [раундов=300] [s1,s2,…] [CT|T]   — s: сила соперников 0…1 (0.5 — как своя пятёрка)
// Цель: без помощи игрока p = 0,8 / множитель (×1,5 ≈ 53,3%, ×2 = 40%, ×5 = 16%) — см. BET.TIERS в js/tac/sim.js.
'use strict';
const path = require('path');
const root = path.join(__dirname, '..');
for (const f of ['assets/tac/map1-nav.js', 'js/tac/nav.js', 'js/tac/sim.js']) require(path.join(root, f));
const E = globalThis.TacEngine;
const N = +process.argv[2] || 300;
const S = (process.argv[3] || '0,0.25,0.5,0.75,1').split(',').map(Number);
const SIDES = process.argv[4] ? [process.argv[4]] : ['CT', 'T'];
for (const side of SIDES) for (const s of S) {
  let win = 0, len = 0;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const G = new E.TacGame({ side, auto: true, rounds: 1, seed: (i * 2654435761 + 12345) >>> 0, money: E.BET.MONEY, skillUs: E.BET.US, skillThem: E.betSkill(s) });
    G.startRound(); G.markBuyStart();
    for (const p of G.team(G.us)) G.autoBuy(p, 'full');
    const r = G.replay([]);
    if (r && r.win) win++;
    len += G.t;
  }
  const p = win / N, se = Math.sqrt(p * (1 - p) / N);
  console.log(`${side.padEnd(2)} сила соперников ${s.toFixed(2)}: побед ${(p * 100).toFixed(1)}% ±${(se * 196).toFixed(1)}  (раунд ~${Math.round(len / N)} с, ${Math.round((Date.now() - t0) / N)} мс)`);
}

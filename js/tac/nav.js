// RUSH CASE · «Тактика» — карта, проходимость, пути. Движок общий для сайта и сервера (Edge Function «tactic»),
// поэтому результат не должен зависеть от браузера: только + − × ÷ и Math.sqrt (в IEEE-754 везде одинаковы),
// свои sin / cos / atan2, никакого Math.random.
(function (root) {
'use strict';
const PI = 3.141592653589793, TWO_PI = 6.283185307179586, HALF_PI = 1.5707963267948966;
const thyp = (x, y) => Math.sqrt(x * x + y * y);
function tsin(x) {
  x -= TWO_PI * Math.floor((x + PI) / TWO_PI); // в [-π, π)
  if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x; // в [-π/2, π/2]
  const q = x * x;
  return x * (1 + q * (-1 / 6 + q * (1 / 120 + q * (-1 / 5040 + q * (1 / 362880 + q * (-1 / 39916800 + q * (1 / 6227020800 + q * (-1 / 1307674368000))))))));
}
const tcos = x => tsin(x + HALF_PI);
function tatan1(x) { // |x| ≤ 1: два раза делим угол пополам, потом ряд
  const y = x / (1 + Math.sqrt(1 + x * x)), z = y / (1 + Math.sqrt(1 + y * y)), q = z * z;
  let s = 0;
  for (let k = 21; k >= 1; k -= 2) s = 1 / k - q * s;
  return 4 * z * s;
}
function tatan2(y, x) {
  if (x === 0 && y === 0) return 0;
  if (Math.abs(x) >= Math.abs(y)) { const a = tatan1(y / x); return x > 0 ? a : y >= 0 ? a + PI : a - PI; }
  const a = tatan1(x / y);
  return y > 0 ? HALF_PI - a : -HALF_PI - a;
}
root.TacMath = { thyp, tsin, tcos, tatan2, PI };
/* =====================================================================
   Тактика: навигация по карте-радару.
   Координаты — пиксели картинки (1024×1024). Сетка 256×256 клеток по 4 px:
   0 — стена, 1 — пол, 2 — ящик (не пройти и не видно насквозь).
   ===================================================================== */

class TacNav {
  constructor(map) {
    this.map = map;
    this.n = map.n; this.cell = map.cell; this.size = map.n * map.cell;
    const bin = atob(map.grid);
    this.grid = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) this.grid[i] = bin.charCodeAt(i);
    this.buildClearance();
    // рабочие массивы A* (переиспользуются между поисками)
    const N = this.n * this.n;
    this.g = new Float32Array(N); this.par = new Int32Array(N); this.gen = new Uint32Array(N); this.closed = new Uint32Array(N);
    this.curGen = 0;
    this.extraCost = null; // функция (клетка) → доп. стоимость (огонь и т.п.)
  }

  // расстояние (в клетках) до ближайшей непроходимой клетки — чтобы пути шли не вплотную к стенам
  buildClearance() {
    const n = this.n, d = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) d[i] = this.grid[i] === 1 ? 1e6 : 0;
    const D = Math.SQRT2;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x; if (!d[i]) continue;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y > 0) { d[i] = Math.min(d[i], d[i - n] + 1); if (x > 0) d[i] = Math.min(d[i], d[i - n - 1] + D); if (x < n - 1) d[i] = Math.min(d[i], d[i - n + 1] + D); }
    }
    for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x; if (!d[i]) continue;
      if (x < n - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < n - 1) { d[i] = Math.min(d[i], d[i + n] + 1); if (x < n - 1) d[i] = Math.min(d[i], d[i + n + 1] + D); if (x > 0) d[i] = Math.min(d[i], d[i + n - 1] + D); }
    }
    this.clear = d;
  }

  cellOf(x, y) { return [Math.floor(x / this.cell), Math.floor(y / this.cell)]; }
  idx(x, y) { const c = this.cell; const cx = Math.floor(x / c), cy = Math.floor(y / c); return cx < 0 || cy < 0 || cx >= this.n || cy >= this.n ? -1 : cy * this.n + cx; }
  walkable(x, y) { const i = this.idx(x, y); return i >= 0 && this.grid[i] === 1; }
  clearanceAt(x, y) { const i = this.idx(x, y); return i < 0 ? 0 : this.clear[i] * this.cell; }
  center(i) { const c = this.cell; return [(i % this.n) * c + c / 2, Math.floor(i / this.n) * c + c / 2]; }

  // ближайшая проходимая точка (с запасом от стен, если можно)
  nearestFloor(x, y, minClear = 2) {
    const n = this.n, [cx, cy] = this.cellOf(x, y);
    for (let r = 0; r < 40; r++) {
      let best = -1, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const X = cx + dx, Y = cy + dy;
        if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
        const i = Y * n + X;
        if (this.grid[i] !== 1 || this.clear[i] < minClear) continue;
        const dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = i; }
      }
      if (best >= 0) return this.center(best);
    }
    return minClear > 1 ? this.nearestFloor(x, y, 1) : [x, y];
  }

  /* ---------- видимость ---------- */
  // сплошная прямая между точками: стены и ящики закрывают; smokes — [{x,y,r}]
  los(x0, y0, x1, y1, smokes) {
    const dx = x1 - x0, dy = y1 - y0, L = thyp(dx, dy);
    const steps = Math.ceil(L / 2);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const i = this.idx(x0 + dx * t, y0 + dy * t);
      if (i < 0 || this.grid[i] !== 1) return false;
    }
    if (smokes) for (const s of smokes) if (segCircle(x0, y0, x1, y1, s.x, s.y, s.r)) return false;
    return true;
  }

  // можно ли пройти по прямой (с запасом от стен)
  walkLine(x0, y0, x1, y1, minClear = 1.5) {
    const dx = x1 - x0, dy = y1 - y0, L = thyp(dx, dy);
    const steps = Math.ceil(L / 2);
    for (let k = 0; k <= steps; k++) {
      const i = this.idx(x0 + dx * k / steps, y0 + dy * k / steps);
      if (i < 0 || this.grid[i] !== 1 || this.clear[i] < minClear) return false;
    }
    return true;
  }

  /* ---------- поиск пути A* (8 направлений) ---------- */
  path(x0, y0, x1, y1, opts = {}) {
    const n = this.n, c = this.cell;
    let s = this.idx(x0, y0), t = this.idx(x1, y1);
    if (s < 0 || this.grid[s] !== 1) { const p = this.nearestFloor(x0, y0, 1); s = this.idx(p[0], p[1]); }
    if (t < 0 || this.grid[t] !== 1 || this.clear[t] < 1.5) { const p = this.nearestFloor(x1, y1, 2); t = this.idx(p[0], p[1]); x1 = p[0]; y1 = p[1]; }
    if (s === t) return [[x1, y1]];
    const gen = ++this.curGen;
    const g = this.g, par = this.par, seen = this.gen, closed = this.closed, clear = this.clear, grid = this.grid;
    const tx = t % n, ty = (t / n) | 0;
    const h = i => { const dx = Math.abs(i % n - tx), dy = Math.abs(((i / n) | 0) - ty); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    const heap = new MinHeap();
    g[s] = 0; seen[s] = gen; par[s] = -1;
    heap.push(s, h(s));
    const penalty = opts.penalty; // Map/Set клеток с доп. стоимостью (для альтернативных маршрутов)
    const extra = this.extraCost;
    let found = false, iters = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === t) { found = true; break; }
      if (++iters > 60000) break;
      const cx = cur % n, cy = (cur / n) | 0;
      for (let k = 0; k < 8; k++) {
        const dx = DX8[k], dy = DY8[k], nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const ni = ny * n + nx;
        if (grid[ni] !== 1 || closed[ni] === gen) continue;
        if (dx && dy && (grid[cy * n + nx] !== 1 || grid[ny * n + cx] !== 1)) continue; // не срезаем углы
        const cl = clear[ni];
        let cost = (dx && dy ? Math.SQRT2 : 1) * (cl < 1.5 ? 4 : cl < 2.5 ? 1.6 : 1);
        if (penalty && penalty.has(ni)) cost += penalty.get ? penalty.get(ni) : 6;
        if (extra) cost += extra(ni);
        const ng = g[cur] + cost;
        if (seen[ni] !== gen || ng < g[ni]) { seen[ni] = gen; g[ni] = ng; par[ni] = cur; heap.push(ni, ng + h(ni)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = t; i !== -1; i = par[i]) cells.push(i);
    cells.reverse();
    if (opts.cells) return cells;
    const pts = cells.map(i => this.center(i));
    pts[pts.length - 1] = [x1, y1];
    return this.smooth([[x0, y0], ...pts]).slice(1);
  }

  // спрямление пути: от точки идём к самой дальней видимой по проходимой прямой
  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.walkLine(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  pathLength(pts, x0, y0) {
    let L = 0, px = x0, py = y0;
    for (const [x, y] of pts) { L += thyp(x - px, y - py); px = x; py = y; }
    return L;
  }

  /* ---------- ключевые точки для ботов (считаются один раз по карте) ---------- */
  analyze() {
    const M = this.map, sp = M.spawns, out = { sites: {} };
    const pathCells = (a, b, penalty) => this.path(a[0], a[1], b[0], b[1], { cells: true, penalty });
    // путь T → CT через карту: середина — «мид»
    const tct = pathCells(sp.T, sp.CT) || [];
    out.midPath = tct.map(i => this.center(i));
    for (const [name, site] of Object.entries(M.sites)) {
      const S = { name, x: site[0], y: site[1], r: M.siteR };
      // два разных маршрута T на плэнт: основной и обходной (штраф за клетки основного)
      const p1 = pathCells(sp.T, site) || [];
      const pen = new Map();
      for (const i of p1) for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) pen.set(i + dy * this.n + dx, 14);
      const p2 = pathCells(sp.T, site, pen) || [];
      S.tRoutes = [p1, p2].map(cs => cs.map(i => this.center(i)));
      S.ctRoute = (pathCells(sp.CT, site) || []).map(i => this.center(i));
      // точки входа на плэнт (где маршрут пересекает окружность ~r+40)
      const entryOf = route => {
        for (let k = route.length - 1; k >= 0; k--) if (thyp(route[k][0] - S.x, route[k][1] - S.y) > S.r + 40) return route[k];
        return route[0];
      };
      S.tEntries = S.tRoutes.map(entryOf);
      S.ctEntry = entryOf(S.ctRoute);
      // точка сбора T перед заходом (≈ 230 px до центра по маршруту)
      const stageOf = route => {
        for (let k = route.length - 1; k >= 0; k--) if (thyp(route[k][0] - S.x, route[k][1] - S.y) > 230) return route[k];
        return route[0];
      };
      S.tStages = S.tRoutes.map(stageOf);
      S.ctGather = stageOf(S.ctRoute);
      S.ctHolds = this.pickSpots(S, S.tEntries, 4);   // CT держат углы на заходы T
      S.tPost = this.pickSpots(S, [S.ctEntry], 3);     // T после закладки держат заход CT
      out.sites[name] = S;
    }
    // мид: точка на пути T→CT ближе к CT, с которой виден путь в сторону T
    const mp = out.midPath;
    if (mp.length) {
      const k = Math.floor(mp.length * 0.62), look = mp[Math.floor(mp.length * 0.4)];
      out.midHold = this.pickSpots({ x: mp[k][0], y: mp[k][1], r: 0 }, [look], 1, 20, 90)[0] || { x: mp[k][0], y: mp[k][1], face: tatan2(look[1] - mp[k][1], look[0] - mp[k][0]) };
      out.midT = mp[Math.floor(mp.length * 0.35)];
    }
    this.info = out;
    return out;
  }

  // позиции с укрытием рядом, откуда видно заданные точки входа на расстоянии 80–280 px
  pickSpots(S, looks, count, rMin = 30, rMax = 150) {
    const c = this.cell, cand = [];
    const [cx, cy] = this.cellOf(S.x, S.y), R = Math.ceil(rMax / c);
    for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
      const X = cx + dx, Y = cy + dy;
      if (X < 0 || Y < 0 || X >= this.n || Y >= this.n) continue;
      const i = Y * this.n + X;
      if (this.grid[i] !== 1 || this.clear[i] < 2) continue;
      const [x, y] = this.center(i), d = thyp(x - S.x, y - S.y);
      if (d < rMin || d > rMax) continue;
      let score = 0, face = null;
      for (const L of looks) {
        const dl = thyp(L[0] - x, L[1] - y);
        if (dl < 70 || dl > 300 || !this.los(x, y, L[0], L[1])) continue;
        score += 3 - Math.abs(dl - 160) / 100;
        if (face === null) face = tatan2(L[1] - y, L[0] - x);
      }
      if (!score) continue;
      // укрытие: стена/ящик в 2–3 клетках (но не вплотную)
      score += this.clear[i] < 4 ? 1.2 : this.clear[i] < 6 ? 0.5 : 0;
      cand.push({ x, y, face, score: score + ((Math.imul(Math.floor(x) | 0, 73856093) ^ Math.imul(Math.floor(y) | 0, 19349663)) >>> 0) % 1000 / 1000 * 0.3 });
    }
    cand.sort((a, b) => b.score - a.score);
    const out = [];
    for (const p of cand) {
      if (out.every(q => thyp(q.x - p.x, q.y - p.y) > 45)) out.push(p);
      if (out.length >= count) break;
    }
    return out;
  }
}

const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DY8 = [0, 0, 1, -1, 1, -1, 1, -1];

// пересекает ли отрезок окружность
function segCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / L2)) : 0;
  const px = x0 + dx * t - cx, py = y0 + dy * t - cy;
  return px * px + py * py < r * r;
}

class MinHeap {
  constructor() { this.i = []; this.k = []; }
  get size() { return this.i.length; }
  push(item, key) {
    const I = this.i, K = this.k;
    let p = I.length; I.push(item); K.push(key);
    while (p > 0) {
      const q = (p - 1) >> 1;
      if (K[q] <= key) break;
      I[p] = I[q]; K[p] = K[q]; p = q;
    }
    I[p] = item; K[p] = key;
  }
  pop() {
    const I = this.i, K = this.k, top = I[0];
    const li = I.pop(), lk = K.pop();
    if (I.length) {
      let p = 0;
      const n = I.length;
      for (;;) {
        let c = 2 * p + 1;
        if (c >= n) break;
        if (c + 1 < n && K[c + 1] < K[c]) c++;
        if (K[c] >= lk) break;
        I[p] = I[c]; K[p] = K[c]; p = c;
      }
      I[p] = li; K[p] = lk;
    }
    return top;
  }
}
root.TacNav = TacNav;
})(typeof window !== 'undefined' ? window : globalThis);

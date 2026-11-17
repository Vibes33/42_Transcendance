import { RIFT_WALK, RIFT_WALK_SIZE } from "./riftWalk";

// Navigation sur la Faille : les joueurs contournent les murs comme dans le jeu. La carte des cases
// praticables vient de l'image de la carte (scripts/rift-walk.ts). Un graphe de passage (un nœud au
// centre de chaque zone libre de 4 % de côté) relie les couloirs ; un trajet suit le plus court
// chemin dans ce graphe, en coupant au plus court dès qu'un point plus lointain est en vue.

const N = RIFT_WALK_SIZE;
const CELL = 100 / N;
/** Côté des carrés du graphe de passage (en cases). */
const STEP = 8;

let walk: Uint8Array | null = null;
const grid = () => {
  if (walk) return walk;
  const bin = atob(RIFT_WALK);
  const bits = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
  walk = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) walk[k] = (bits[k >> 3] >> (k & 7)) & 1;
  return walk;
};

const cellOf = (v: number) => Math.max(0, Math.min(N - 1, Math.floor(v / CELL)));

/** Le point (en % de la carte) est-il praticable ? */
export function walkable(x: number, y: number) {
  return grid()[cellOf(y) * N + cellOf(x)] === 1;
}

/** Ligne de vue : le segment ne traverse aucun mur. */
export function clearPath(ax: number, ay: number, bx: number, by: number) {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / (CELL * 0.35));
  for (let i = 1; i <= n; i++) if (!walkable(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n)) return false;
  return true;
}

// --- Distance aux murs (pour placer les nœuds au milieu des couloirs) et nœuds ---
interface Nav {
  nodes: [number, number][];
  edges: { to: number; w: number }[][];
  /** Nœud de chaque carré (−1 : carré sans zone libre). */
  square: Int16Array;
  /** Nœud le plus proche en vue, par case (−2 : pas encore calculé, −1 : aucun). */
  near: Int16Array;
  trees: Map<number, { next: Int16Array; cost: Float64Array }>;
}
let nav: Nav | null = null;

function build(): Nav {
  const g = grid();
  // Distance (en cases) à la case murée la plus proche, par parcours en largeur
  const dist = new Int16Array(N * N).fill(-1);
  const queue: number[] = [];
  for (let k = 0; k < N * N; k++)
    if (!g[k]) {
      dist[k] = 0;
      queue.push(k);
    }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q];
    const x = k % N;
    const y = (k / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const nk = ny * N + nx;
      if (dist[nk] < 0) {
        dist[nk] = dist[k] + 1;
        queue.push(nk);
      }
    }
  }
  const S = N / STEP;
  const nodes: [number, number][] = [];
  const square = new Int16Array(S * S).fill(-1);
  for (let sy = 0; sy < S; sy++)
    for (let sx = 0; sx < S; sx++) {
      let best = -1;
      let bestD = 1;
      for (let y = sy * STEP; y < (sy + 1) * STEP; y++)
        for (let x = sx * STEP; x < (sx + 1) * STEP; x++) {
          const v = dist[y * N + x];
          if (v > bestD) {
            bestD = v;
            best = y * N + x;
          }
        }
      if (best < 0) continue;
      square[sy * S + sx] = nodes.length;
      nodes.push([((best % N) + 0.5) * CELL, (((best / N) | 0) + 0.5) * CELL]);
    }
  // Arêtes : nœuds de carrés voisins (jusqu'à 2 carrés) qui se voient
  const edges: { to: number; w: number }[][] = nodes.map(() => []);
  for (let sy = 0; sy < S; sy++)
    for (let sx = 0; sx < S; sx++) {
      const a = square[sy * S + sx];
      if (a < 0) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const tx = sx + dx;
          const ty = sy + dy;
          if ((dx === 0 && dy === 0) || tx < 0 || ty < 0 || tx >= S || ty >= S) continue;
          const b = square[ty * S + tx];
          if (b < 0 || b < a) continue;
          const [ax, ay] = nodes[a];
          const [bx, by] = nodes[b];
          if (!clearPath(ax, ay, bx, by)) continue;
          const w = Math.hypot(bx - ax, by - ay);
          edges[a].push({ to: b, w });
          edges[b].push({ to: a, w });
        }
    }
  return { nodes, edges, square, near: new Int16Array(N * N).fill(-2), trees: new Map() };
}
const getNav = () => (nav ??= build());

/** Nœud le plus proche que l'on voit depuis le point (mis en cache par case). */
function nearNode(x: number, y: number): number {
  const n = getNav();
  const k = cellOf(y) * N + cellOf(x);
  if (n.near[k] !== -2) return n.near[k];
  const S = N / STEP;
  const sx = Math.floor(cellOf(x) / STEP);
  const sy = Math.floor(cellOf(y) / STEP);
  let best = -1;
  let bestD = Infinity;
  let fallback = -1;
  let fallbackD = Infinity;
  for (let r = 0; r <= 3 && best < 0; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = sx + dx;
        const ty = sy + dy;
        if (tx < 0 || ty < 0 || tx >= S || ty >= S) continue;
        const i = n.square[ty * S + tx];
        if (i < 0) continue;
        const d = Math.hypot(n.nodes[i][0] - x, n.nodes[i][1] - y);
        if (d < fallbackD) {
          fallbackD = d;
          fallback = i;
        }
        if (d < bestD && clearPath(x, y, n.nodes[i][0], n.nodes[i][1])) {
          bestD = d;
          best = i;
        }
      }
  n.near[k] = best >= 0 ? best : fallback;
  return n.near[k];
}

/** Plus courts chemins vers un nœud : le nœud suivant depuis chaque nœud (Dijkstra, mis en cache). */
function treeTo(goal: number): { next: Int16Array; cost: Float64Array } {
  const n = getNav();
  const cached = n.trees.get(goal);
  if (cached) return cached;
  const next = new Int16Array(n.nodes.length).fill(-1);
  const cost = new Float64Array(n.nodes.length).fill(Infinity);
  const done = new Uint8Array(n.nodes.length);
  cost[goal] = 0;
  next[goal] = goal;
  for (;;) {
    let u = -1;
    for (let i = 0; i < cost.length; i++) if (!done[i] && cost[i] < Infinity && (u < 0 || cost[i] < cost[u])) u = i;
    if (u < 0) break;
    done[u] = 1;
    for (const { to, w } of n.edges[u])
      if (cost[u] + w < cost[to]) {
        cost[to] = cost[u] + w;
        next[to] = u;
      }
  }
  const tree = { next, cost };
  n.trees.set(goal, tree);
  return tree;
}

/** Longueur (en % de la carte) du chemin à pied entre deux points, détours des murs compris. */
export function pathLength(x: number, y: number, tx: number, ty: number): number {
  if (clearPath(x, y, tx, ty)) return Math.hypot(tx - x, ty - y);
  const n = getNav();
  const from = nearNode(x, y);
  const to = nearNode(tx, ty);
  if (from < 0 || to < 0) return Math.hypot(tx - x, ty - y) * 1.4;
  const c = treeTo(to).cost[from];
  if (!Number.isFinite(c)) return Math.hypot(tx - x, ty - y) * 1.4;
  return Math.hypot(n.nodes[from][0] - x, n.nodes[from][1] - y) + c + Math.hypot(tx - n.nodes[to][0], ty - n.nodes[to][1]);
}

/** Le point praticable le plus proche (le point lui-même s'il l'est). */
export function snapWalkable(x: number, y: number): [number, number] {
  if (walkable(x, y)) return [x, y];
  for (let r = 1; r <= 24; r++)
    for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * r * CELL;
      const py = y + Math.sin((a / 16) * Math.PI * 2) * r * CELL;
      if (px >= 0 && py >= 0 && px < 100 && py < 100 && walkable(px, py)) return [px, py];
    }
  return [x, y];
}

/**
 * Prochain point où se diriger pour aller de (x, y) à (tx, ty) sans traverser de mur : la cible si
 * elle est en vue, sinon le point le plus lointain du plus court chemin que l'on voit déjà.
 */
export function steer(x: number, y: number, tx: number, ty: number): [number, number] {
  if (clearPath(x, y, tx, ty)) return [tx, ty];
  const n = getNav();
  const from = nearNode(x, y);
  const to = nearNode(tx, ty);
  if (from < 0 || to < 0) return [tx, ty];
  const tree = treeTo(to).next;
  const path: number[] = [from];
  for (let i = from, guard = 0; i !== to && tree[i] >= 0 && guard < 6; guard++) path.push((i = tree[i]));
  if (path[path.length - 1] === to && path.length < 6) {
    // Le but est proche dans le graphe : on peut viser la cible elle-même depuis le dernier nœud
    const [lx, ly] = n.nodes[to];
    if (clearPath(x, y, lx, ly) && clearPath(lx, ly, tx, ty)) return [lx, ly];
  }
  for (let j = path.length - 1; j > 0; j--) {
    const [px, py] = n.nodes[path[j]];
    if (clearPath(x, y, px, py)) return [px, py];
  }
  return n.nodes[from];
}

/** Point de passage le plus proche (au milieu d'un couloir, relié au reste de la carte). */
export function onPath(x: number, y: number): [number, number] {
  const i = nearNode(...snapWalkable(x, y));
  if (i < 0) return snapWalkable(x, y);
  const [nx, ny] = getNav().nodes[i];
  return [+nx.toFixed(1), +ny.toFixed(1)];
}

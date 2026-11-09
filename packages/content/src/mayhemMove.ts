import { RIFT, laneAt, mayhemRespawn, type MayhemEvent, type MayhemGame } from "./mayhem";

// Déplacements d'une partie de World Mayhem : à partir des actions décidées par le serveur (qui
// combat où, qui meurt, quelles tours tombent), chaque joueur est animé seconde par seconde comme
// dans une vraie partie vue de très loin : placement en voie, farm, gank du jungler, retours en
// base, rotations vers les objectifs, regroupement en milieu de partie, combats d'équipe.
// Tout dépend de la partie elle-même : une même partie se rejoue à l'identique.

type Side = "a" | "b";
const SIDES: Side[] = ["a", "b"];
const other = (s: Side): Side => (s === "a" ? "b" : "a");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Fontaine de chaque équipe (coin de la carte). */
export const FOUNTAIN: Record<Side, [number, number]> = { a: [6.5, 93.5], b: [93.5, 6.5] };
/** Vitesse de déplacement en % de la carte par seconde (top, jungle, mid, ADC, support). */
const SPEED = [2.0, 2.25, 2.1, 2.1, 2.0];
/** Les sbires traversent une voie en 78 s. */
const MINION_CROSS = 78;
const LANE_PHASE_END = 840;

/** Graine d'une partie : ses participants, sa durée et ses actions. */
function seedOf(g: MayhemGame): number {
  let h = 2166136261;
  const mix = (n: number) => {
    h ^= Math.round(n * 10) & 0xffffff;
    h = Math.imul(h, 16777619);
  };
  [g.blue, g.red, g.duration, g.events.length, ...g.events.slice(0, 12).flatMap((e) => [e.t, e.at[0], e.at[1]])].forEach(mix);
  return h >>> 0;
}
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Actor {
  x: number;
  y: number;
  /** Mort : en attente de réapparition. */
  dead: boolean;
  /** Retour en base (canalisation du rappel). */
  recall: boolean;
}

export interface Movement {
  /** Position des 5 joueurs de chaque côté à la seconde `t` de la partie. */
  actors(t: number): Record<Side, Actor[]>;
  /** Sbires en marche ou en combat dans les voies. */
  minions(t: number): { x: number; y: number; side: Side }[];
  /** Tours détruites (index dans RIFT.towers) de chaque camp. */
  towersDown(t: number): Record<Side, Set<number>>;
  /** Objectifs neutres en vie. */
  objectives(t: number): { dragon: boolean; herald: boolean; baron: boolean };
  /** Secondes avant l'apparition de chaque objectif neutre (null : en vie, ou plus de réapparition). */
  timers(t: number): { dragon: number | null; herald: number | null; baron: number | null };
  /** Trajet récent de chaque joueur (`span` dernières secondes), coupé aux morts et aux retours en base. */
  trails(t: number, span?: number, step?: number): Record<Side, [number, number][][]>;
  /** Éliminations / morts / assistances de chaque joueur (null pour une partie sans détail). */
  kda(t: number): Record<Side, [number, number, number][]> | null;
}

/** Combien de temps avant l'action les joueurs concernés se mettent en route. */
const LEAD: Record<MayhemEvent["kind"], number> = { firstblood: 10, kill: 9, skirmish: 14, teamfight: 24, dragon: 30, herald: 28, tower: 16, inhib: 20, baron: 32, nexus: 20 };

export function buildMovement(game: MayhemGame): Movement {
  const D = Math.ceil(game.duration) + 2;
  const r = mulberry(seedOf(game));
  const events = game.events;
  const idx = (s: Side, i: number) => (s === "a" ? 0 : 5) + i;

  // --- Morts et réapparitions, par seconde ---
  const dead = new Uint8Array(D * 10);
  const diedAt = new Float32Array(D * 10).fill(-1);
  for (const e of events)
    for (const s of SIDES)
      for (const v of e.dead[s]) {
        const until = Math.min(D, Math.ceil(e.t + mayhemRespawn(e.t)));
        for (let t = Math.ceil(e.t); t < until; t++) {
          dead[t * 10 + idx(s, v)] = 1;
          diedAt[t * 10 + idx(s, v)] = e.t;
        }
      }

  // --- Tours détruites : voie et avancée du front ---
  const falls: { t: number; owner: Side; lane: number; idx: number }[] = [];
  for (const e of events) {
    if (e.kind !== "tower") continue;
    const owner = other(e.side);
    const k = RIFT.towers[owner].findIndex((p) => p[0] === e.at[0] && p[1] === e.at[1]);
    if (k >= 0) falls.push({ t: e.t, owner, lane: k < 9 ? Math.floor(k / 3) : 1, idx: k });
  }
  // Front de chaque voie (0 : base bleue, 1 : base rouge) : il avance quand des tours tombent
  const front: Float32Array[] = [0, 1, 2].map((lane) => {
    const f = new Float32Array(D);
    let cur = 0.5;
    const phase = r() * 6;
    for (let t = 0; t < D; t++) {
      const push = falls.reduce((n, x) => n + (x.lane === lane && x.t <= t ? (x.owner === "b" ? 1 : -1) : 0), 0);
      const goal = clamp(0.5 + push * 0.105 + 0.045 * Math.sin(t / 38 + phase + lane * 2), 0.14, 0.86);
      cur += (goal - cur) * 0.05;
      f[t] = cur;
    }
    return f;
  });

  // --- Plan de macro : voie défendue ou attaquée par chaque équipe, rotations, retours en base ---
  const rally: Record<Side, number[]> = { a: [], b: [] };
  for (const s of SIDES) {
    let prev = 1;
    for (let w = 0; w < D / 110 + 2; w++) {
      const roll = r();
      let lane = roll < 0.45 ? 1 : roll < 0.75 ? 2 : 0;
      if (lane === prev && r() < 0.5) lane = [0, 1, 2].filter((l) => l !== lane)[Math.floor(r() * 2)];
      rally[s].push(lane);
      prev = lane;
    }
  }
  /** Fenêtres de déplacement d'un joueur vers une autre voie (roam du mid et du support). */
  const roams: Record<string, { from: number; to: number; lane: number }[]> = {};
  for (const s of SIDES)
    for (const role of [2, 4]) {
      const list: { from: number; to: number; lane: number }[] = [];
      for (let t = role === 4 ? 170 + r() * 60 : 280 + r() * 80; t < D - 100; t += role === 4 ? 140 + r() * 60 : 230 + r() * 90) list.push({ from: t, to: t + 20 + r() * 8, lane: role === 4 ? 1 : r() < 0.5 ? 0 : 2 });
      roams[s + role] = list;
    }
  const backs: Record<string, number[]> = {};
  for (const s of SIDES) for (let i = 0; i < 5; i++) backs[s + i] = Array.from({ length: Math.ceil(D / 250) }, (_, n) => 300 + n * (250 + r() * 70) + r() * 60 + i * 9);
  // Camps de la jungle de chaque équipe, dans un ordre de nettoyage
  const campsOf = (s: Side) => {
    const own = RIFT.camps.map((c) => c.at).filter((p) => Math.hypot(p[0] - RIFT.nexus[s][0], p[1] - RIFT.nexus[s][1]) < Math.hypot(p[0] - RIFT.nexus[other(s)][0], p[1] - RIFT.nexus[other(s)][1]));
    return own.sort((p, q) => Math.hypot(p[0] - FOUNTAIN[s][0], p[1] - FOUNTAIN[s][1]) - Math.hypot(q[0] - FOUNTAIN[s][0], q[1] - FOUNTAIN[s][1]));
  };
  const camps = { a: campsOf("a"), b: campsOf("b") };
  const ganks: Record<Side, number[]> = { a: [], b: [] };
  for (const s of SIDES) for (let n = 0; n < 40; n++) ganks[s].push(r() < 0.5 ? 1 : r() < 0.5 ? 0 : 2);

  // --- Actions auxquelles chaque joueur participe ---
  const mine: MayhemEvent[][] = Array.from({ length: 10 }, () => []);
  for (const e of events) for (const s of SIDES) for (const i of e.who[s]) mine[idx(s, i)].push(e);

  const phase = Array.from({ length: 10 }, () => ({ a: r() * 6.28, b: r() * 6.28, c: r() * 6.28 }));
  const pos = new Float32Array(D * 10 * 2);
  const flags = new Uint8Array(D * 10);
  const state = Array.from({ length: 10 }, (_, n) => ({ x: FOUNTAIN[n < 5 ? "a" : "b"][0], y: FOUNTAIN[n < 5 ? "a" : "b"][1], recallFrom: -1, recallUntil: -1, nextBack: 0 }));

  const lanePos = (s: Side, lane: number, t: number, ds: number): [number, number] => laneAt(lane, front[lane][Math.min(D - 1, t)] + (s === "a" ? -ds : ds));

  /** Où se place un joueur quand rien de précis ne l'appelle. */
  const idle = (s: Side, i: number, t: number): [number, number] => {
    const win = Math.floor(t / 110);
    const rl = rally[s][win] ?? 1;
    const grouped = t >= LANE_PHASE_END && (i !== 0 || rl === 0 || t > 1500);
    if (i === 1) {
      // Jungler : tour des camps, puis gank d'une voie, puis un détour par la rivière
      if (t < 8) return camps[s][0] ?? FOUNTAIN[s];
      const cs = camps[s];
      const seg = Math.floor(t / 17);
      const m = seg % (cs.length + 2);
      if (grouped && t > 1000) return lanePos(s, rl, t, 0.04);
      if (m < cs.length) return cs[m];
      if (m === cs.length) return lanePos(s, ganks[s][Math.floor(seg / (cs.length + 2)) % 40], t, 0.06);
      return s === "a" ? [38 + 4 * Math.sin(t / 9), 60] : [62 + 4 * Math.sin(t / 9), 40];
    }
    if (grouped) return lanePos(s, rl, t, 0.035);
    // Phase de voie : chacun dans sa voie, le support avec l'ADC
    const lane = i === 0 ? 0 : i === 2 ? 1 : 2;
    const roam = roams[s + i]?.find((w) => t >= w.from && t <= w.to);
    if (roam) return lanePos(s, roam.lane, t, 0.05);
    const trade = 0.022 * Math.sin(t / (9 + i * 1.3) + phase[idx(s, i)].c) + (i === 3 ? 0.012 : 0);
    const spot = lanePos(s, lane, t, 0.045 + (i === 4 ? 0.02 : 0) - trade);
    // Le support se tient juste derrière l'ADC, de l'autre côté de la voie
    return i === 4 ? [spot[0] + (s === "a" ? 1.4 : -1.4), spot[1] + (s === "a" ? 1.4 : -1.4)] : spot;
  };

  for (let t = 0; t < D; t++) {
    for (const s of SIDES) {
      for (let i = 0; i < 5; i++) {
        const k = idx(s, i);
        const st = state[k];
        const o = (t * 10 + k) * 2;
        const f = FOUNTAIN[s];
        if (dead[t * 10 + k]) {
          // Mort : le joueur reste 2 s sur place avant de revenir en base
          if (t - diedAt[t * 10 + k] > 2) [st.x, st.y] = f;
          flags[t * 10 + k] = 1;
          st.recallFrom = st.recallUntil = -1;
        } else {
          // Rappel (retour en base) : canalisation de 8 s sur place, puis achats à la fontaine
          const nb = backs[s + i].find((b) => b >= t - 1);
          const inFight = mine[k].some((e) => t >= e.t - LEAD[e.kind] && t <= e.t + 6);
          if (st.recallUntil < 0 && nb !== undefined && t >= nb && t <= nb + 2 && !inFight && Math.hypot(st.x - f[0], st.y - f[1]) > 25) {
            st.recallFrom = t;
            st.recallUntil = t + 16;
          }
          if (st.recallUntil >= 0) {
            if (t >= st.recallFrom + 8) [st.x, st.y] = f;
            else flags[t * 10 + k] = 2;
            if (t >= st.recallUntil) st.recallUntil = st.recallFrom = -1;
          } else {
            // Cible : une action en cours ou imminente, sinon le comportement de son poste
            const ev = mine[k].find((e) => t >= e.t - LEAD[e.kind] && t <= e.t + 6);
            let tx: number;
            let ty: number;
            let boost = 1;
            if (ev) {
              const fighting = Math.abs(t - ev.t) <= 5;
              const ang = (i * 72 + (s === "b" ? 36 : 0)) * (Math.PI / 180) + (fighting ? t * 0.65 + phase[k].a : 0);
              const rad = fighting ? 2.3 : 3.4;
              tx = ev.at[0] + Math.cos(ang) * rad + (s === "a" ? -1 : 1) * 1.2;
              ty = ev.at[1] + Math.sin(ang) * rad + (s === "a" ? 1 : -1) * 1.2;
              boost = 1.1;
              if (fighting) flags[t * 10 + k] |= 4;
            } else {
              [tx, ty] = idle(s, i, t);
            }
            // Un joueur n'est jamais parfaitement immobile : petits déplacements autour de sa cible
            tx += Math.sin(t * 0.23 + phase[k].a) * 1.0;
            ty += Math.cos(t * 0.19 + phase[k].b) * 1.0;
            const dx = tx - st.x;
            const dy = ty - st.y;
            const d = Math.hypot(dx, dy);
            const v = SPEED[i] * boost * (1 + 0.05 * Math.sin(t * 0.7 + phase[k].c));
            if (d <= v) {
              st.x = tx;
              st.y = ty;
            } else {
              st.x += (dx / d) * v;
              st.y += (dy / d) * v;
            }
          }
        }
        st.x = clamp(st.x, 1, 99);
        st.y = clamp(st.y, 1, 99);
        pos[o] = st.x;
        pos[o + 1] = st.y;
        if (dead[t * 10 + k]) flags[t * 10 + k] = (flags[t * 10 + k] & ~2) | 1;
      }
    }
  }

  // --- Objectifs neutres et éliminations ---
  const dragonKills = events.filter((e) => e.kind === "dragon").map((e) => e.t);
  const heraldKill = events.find((e) => e.kind === "herald")?.t ?? Infinity;
  const baronKills = events.filter((e) => e.kind === "baron").map((e) => e.t);
  const killEvents = events.filter((e) => e.ks);

  return {
    actors(time) {
      const t = clamp(time, 0, D - 2);
      const a = Math.floor(t);
      const frac = t - a;
      const out = { a: [] as Actor[], b: [] as Actor[] };
      for (const s of SIDES)
        for (let i = 0; i < 5; i++) {
          const k = idx(s, i);
          const p0 = (a * 10 + k) * 2;
          const p1 = ((a + 1) * 10 + k) * 2;
          const fl = flags[a * 10 + k];
          // Pas d'interpolation à la mort ou au retour en base (la position saute d'un coup)
          const jump = Math.hypot(pos[p1] - pos[p0], pos[p1 + 1] - pos[p0 + 1]) > 6;
          const w = jump ? 0 : frac;
          out[s].push({ x: pos[p0] + (pos[p1] - pos[p0]) * w, y: pos[p0 + 1] + (pos[p1 + 1] - pos[p0 + 1]) * w, dead: !!(fl & 1), recall: !!(fl & 2) });
        }
      return out;
    },
    minions(time) {
      const list: { x: number; y: number; side: Side }[] = [];
      const wave0 = Math.max(0, Math.floor((time - 65 - 110) / 30));
      for (let lane = 0; lane < 3; lane++)
        for (let w = wave0; 65 + w * 30 <= time; w++) {
          const age = time - (65 + w * 30);
          const fr = front[lane][Math.min(D - 1, Math.floor(time))];
          for (const s of SIDES) {
            // Les sbires marchent jusqu'au front, s'y battent une vingtaine de secondes, puis disparaissent
            const walk = s === "a" ? age / MINION_CROSS : 1 - age / MINION_CROSS;
            const stop = s === "a" ? fr - 0.02 : fr + 0.02;
            const arrived = s === "a" ? walk >= stop : walk <= stop;
            const fightAge = arrived ? Math.abs(walk - stop) * MINION_CROSS : 0;
            if (arrived && fightAge > 20) continue;
            const alive = arrived ? Math.max(1, Math.ceil(6 * (1 - fightAge / 20))) : 6;
            const at = arrived ? stop : walk;
            for (let m = 0; m < alive; m++) {
              const [x, y] = laneAt(lane, at + (s === "a" ? -1 : 1) * m * 0.006);
              list.push({ x: x + ((m % 2) - 0.5) * 0.9, y: y + ((m % 3) - 1) * 0.5, side: s });
            }
          }
        }
      return list;
    },
    towersDown(time) {
      const out = { a: new Set<number>(), b: new Set<number>() };
      for (const f of falls) if (f.t <= time) out[f.owner].add(f.idx);
      return out;
    },
    objectives(time) {
      return {
        dragon: time >= 300 && dragonKills.every((k) => k > time || time - k >= 300),
        herald: time >= 480 && time < 1140 && heraldKill > time,
        baron: time >= 1200 && baronKills.every((k) => k > time || time - k >= 360)
      };
    },
    timers(time) {
      const lastKill = (kills: number[]) => kills.filter((k) => k <= time).pop();
      const next = (first: number, kills: number[], respawn: number) => {
        const k = lastKill(kills);
        const at = k === undefined ? first : k + respawn;
        return at > time ? Math.ceil(at - time) : null;
      };
      return {
        dragon: next(300, dragonKills, 300),
        herald: time >= heraldKill || time >= 1140 ? null : next(480, [], 0),
        baron: next(1200, baronKills, 360)
      };
    },
    trails(time, span = 45, step = 3) {
      const t1 = clamp(time, 0, D - 2);
      const out = { a: [] as [number, number][][], b: [] as [number, number][][] };
      for (const s of SIDES)
        for (let i = 0; i < 5; i++) {
          const k = idx(s, i);
          let pts: [number, number][] = [];
          const t0 = Math.max(0, t1 - span);
          const n = Math.ceil((t1 - t0) / step);
          for (let q = 0; q <= n; q++) {
            const tt = Math.min(t1, t0 + q * step);
            const a = Math.floor(tt);
            const frac = tt - a;
            if (flags[a * 10 + k] & 3) {
              pts = [];
              continue;
            }
            const p0 = (a * 10 + k) * 2;
            const p1 = ((a + 1) * 10 + k) * 2;
            const x = pos[p0] + (pos[p1] - pos[p0]) * frac;
            const y = pos[p0 + 1] + (pos[p1 + 1] - pos[p0 + 1]) * frac;
            const last = pts[pts.length - 1];
            if (last && Math.hypot(x - last[0], y - last[1]) > 8) pts = [];
            pts.push([x, y]);
          }
          out[s].push(pts);
        }
      return out;
    },
    kda(time) {
      if (!events.some((e) => e.ks)) return null;
      const out = { a: Array.from({ length: 5 }, () => [0, 0, 0] as [number, number, number]), b: Array.from({ length: 5 }, () => [0, 0, 0] as [number, number, number]) };
      for (const e of killEvents) {
        if (e.t > time) break;
        for (const [side, killer, victim, helpers] of e.ks!) {
          out[side][killer][0]++;
          out[other(side)][victim][1]++;
          for (const h of helpers ?? []) out[side][h][2]++;
        }
      }
      return out;
    }
  };
}

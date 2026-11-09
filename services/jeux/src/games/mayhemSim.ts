import { rng, shuffle } from "@loltr/shared";
import {
  MAYHEM_CHAMPS,
  MAYHEM_COMPS,
  MAYHEM_ROLES,
  MAYHEM_TEAMS,
  RIFT,
  laneAt,
  mayhemRating,
  mayhemRespawn,
  rosterPicks,
  type MayhemEntrant,
  type MayhemEvent,
  type MayhemGame,
  type MayhemGroup,
  type MayhemMatch,
  type MayhemTournament
} from "@loltr/content";
import REAL from "./mayhemReal.json";

// World Mayhem : tournoi à 8 (quarts en Bo1, demies en Bo3, finale en Bo5) simulé à partir des notes
// d'équipe. Chaque partie produit une chronologie d'actions placées sur la carte, que l'interface
// rejoue. Tout dépend de la graine : un même tournoi se recalcule à l'identique.

type R = () => number;
type Side = "a" | "b";
const other = (s: Side): Side => (s === "a" ? "b" : "a");
const pick = <T>(r: R, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const int = (r: R, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const some = (r: R, n: number) => shuffle([0, 1, 2, 3, 4], r).slice(0, Math.max(0, Math.min(5, n)));

/**
 * Écart de note qui fait passer de 50 % à 73 % de chances de gagner une partie : plus il est petit,
 * moins le hasard compte (une équipe bien plus forte gagne presque toujours).
 */
export const MAYHEM_SPREAD = 3;

/** Probabilité de victoire d'une partie (écart de note d'équipe). */
export const winProb = (ra: number, rb: number) => 1 / (1 + Math.exp(-(ra - rb) / MAYHEM_SPREAD));

const near = (r: R, [x, y]: [number, number], spread = 2.5): [number, number] => [+(x + (r() - 0.5) * spread).toFixed(1), +(y + (r() - 0.5) * spread).toFixed(1)];
/** Lieux de combat de la rivière, des camps et du centre (les voies se calculent à part). */
const SPOTS: [number, number][] = [[50, 50], [44, 56], [56, 44], [38, 62], [62, 38], [30, 70], [70, 30], ...RIFT.camps.map((c) => c.at)];

type Plan = {
  t: number;
  kind: MayhemEvent["kind"];
  side: Side;
  at: [number, number];
  /** Éliminations du côté `side` sur l'autre, puis de l'autre côté sur `side`. */
  kills: [number, number];
  /** Joueurs engagés de chaque côté (`side` d'abord). */
  part: [number, number];
  /** Joueurs en vie minimum de `side` pour que l'action ait lieu (objectifs). */
  need?: number;
  tries?: number;
};

// --- Gabarits de vraies parties pro (Oracle's Elixir, voir scripts/mayhem-calibrate.ts) ----------
// Chaque partie simulée reprend le déroulé chiffré d'une vraie partie : durée, kills de chaque camp
// minute par minute, tours, dragons, hérauts, barons, inhibiteurs, premiers objectifs, écart d'or.
// Les données de jeu appartiennent à Riot Games.
type Tpl = Record<string, number>;
const FIELDS = REAL.fields.split(",");
const roles = REAL.roles;
/** Gabarits du plus serré au plus écrasant (écart d'or à 15 min, écart de kills, brièveté). */
const TEMPLATES: Tpl[] = (() => {
  const all = (REAL.games as number[][]).map((g) => Object.fromEntries(FIELDS.map((f, i) => [f, g[i]])) as Tpl);
  const rank = (key: (t: Tpl) => number) => {
    const sorted = all.map((t, i) => [key(t), i]).sort((x, y) => x[0] - y[0]);
    const out = new Array<number>(all.length);
    sorted.forEach(([, i], k) => (out[i] = k / all.length));
    return out;
  };
  const gd = rank((t) => t.gd15);
  const kd = rank((t) => (t.kw - t.kl) / (t.kw + t.kl + 1));
  const short = rank((t) => -t.len);
  const dom = all.map((_, i) => gd[i] + kd[i] + short[i] * 0.4);
  return all.map((t, i) => [dom[i], t] as const).sort((x, y) => x[0] - y[0]).map(([, t]) => t);
})();

/**
 * Gabarit d'une partie : un favori qui gagne tire plutôt une partie à sens unique, un outsider qui
 * gagne plutôt une partie serrée ; le hasard garde de la variété.
 */
function pickTemplate(r: R, gap: number): Tpl {
  const target = Math.min(0.999, Math.max(0, 0.5 + 0.025 * gap + (r() - 0.5) * 0.9));
  return TEMPLATES[Math.floor(target * TEMPLATES.length)];
}

/** Tirage pondéré sans remise. */
function weighted(r: R, pool: number[], weights: readonly number[], n: number) {
  const left = [...pool];
  const out: number[] = [];
  while (out.length < n && left.length) {
    const total = left.reduce((s, i) => s + weights[i], 0);
    let x = r() * total;
    let k = 0;
    while (k < left.length - 1 && (x -= weights[left[k]]) > 0) k++;
    out.push(left.splice(k, 1)[0]);
  }
  return out;
}

/** Répartit n instants triés dans [lo, hi]. */
const times = (r: R, n: number, lo: number, hi: number) => Array.from({ length: n }, () => lo + r() * Math.max(0, hi - lo)).sort((x, y) => x - y);

function simGame(r: R, blue: number, red: number, ra: number, rb: number): MayhemGame {
  const blueWins = r() < winProb(ra, rb);
  const W: Side = blueWins ? "a" : "b";
  const L = other(W);
  const tpl = pickTemplate(r, (blueWins ? ra - rb : rb - ra));
  const duration = Math.max(960, Math.round(tpl.len + (r() - 0.5) * 30));
  // Compositions de vrais matchs récents des Worlds (côtés tirés au hasard) ; à défaut, des pools par poste
  let champs: { a: string[]; b: string[] };
  if (MAYHEM_COMPS.length) {
    const [x, y] = pick(r, MAYHEM_COMPS);
    champs = r() < 0.5 ? { a: [...x], b: [...y] } : { a: [...y], b: [...x] };
  } else {
    const a = MAYHEM_ROLES.map((role) => pick(r, MAYHEM_CHAMPS[role]));
    champs = { a, b: MAYHEM_ROLES.map((role, i) => pick(r, MAYHEM_CHAMPS[role].filter((c) => c !== a[i]))) };
  }
  const kda = { a: MAYHEM_ROLES.map(() => [0, 0, 0] as [number, number, number]), b: MAYHEM_ROLES.map(() => [0, 0, 0] as [number, number, number]) };
  const events: MayhemEvent[] = [];
  const deadUntil = { a: [0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0] };
  const alive = (s: Side, t: number) => [0, 1, 2, 3, 4].filter((i) => deadUntil[s][i] <= t);
  const end = duration - 130;

  // --- Plan de la partie, calqué sur le gabarit ---
  const plans: Plan[] = [];
  const lanePoint = (lane: number, s: number) => near(r, laneAt(lane, s), 3);

  // Objectifs neutres : dragons dès 5 min puis 5 min après chaque prise, Héraut vers 14-17 min,
  // Baron après 20 min puis 6 min après chaque prise. Le premier revient à qui l'a eu en vrai.
  const objective = (kind: "dragon" | "herald" | "baron", n: number, nw: number, firstW: number, t0: number, gap: number, at: [number, number], need: number) => {
    const owners = shuffle([...Array(nw).fill(W), ...Array(Math.max(0, n - nw)).fill(L)] as Side[], r);
    if (firstW >= 0 && owners.length) {
      const k = owners.indexOf(firstW === 1 ? W : L);
      if (k > 0) [owners[0], owners[k]] = [owners[k], owners[0]];
    }
    let t = t0;
    for (const s of owners) {
      if (t > end - 30) break;
      plans.push({ t, kind, side: s, at: near(r, at, 1.5), kills: [0, 0], part: [int(r, 3, 5), 0], need });
      t += gap + 20 + r() * 80;
    }
  };
  objective("dragon", tpl.dw + tpl.dl, tpl.dw, tpl.fd, 320 + r() * 120, 300, RIFT.dragon, 3);
  objective("herald", Math.min(1, tpl.hw + tpl.hl), Math.min(1, tpl.hw), -1, 860 + r() * 160, 0, RIFT.baron, 3);
  objective("baron", tpl.bw + tpl.bl, tpl.bw, tpl.fbaron, Math.max(1230, Math.min(end - 90, 1260 + r() * 420)), 360, RIFT.baron, 4);

  // Tours et inhibiteurs : le vainqueur ouvre au moins une voie entière, ses inhibiteurs et les
  // 2 tours du Nexus ; les tours tombent de l'extérieur vers la base, de plus en plus vite.
  const siege = (s: Side, count: number, inhibs: number, winner: boolean) => {
    const o = other(s);
    const lane = Math.max(0, Math.min(9, winner ? Math.max(3, count - 2) : count));
    const open = Math.max(winner ? 1 : 0, Math.min(inhibs, Math.floor(lane / 3)));
    // Voies ouvertes en entier, le reste réparti de l'extérieur vers l'intérieur
    const lanes = shuffle([0, 1, 2], r);
    const per = [0, 0, 0];
    for (let k = 0; k < open; k++) per[lanes[k]] = 3;
    for (let left = lane - open * 3; left > 0; left--) {
      const free = [0, 1, 2].filter((l) => per[l] < 3);
      if (!free.length) break;
      per[pick(r, free)]++;
    }
    const order = shuffle(per.flatMap((n, l) => Array(n).fill(l) as number[]), r);
    const last = winner ? duration - 110 : Math.min(duration - 200, 1500 + r() * 400);
    const at = times(r, order.length, 600, Math.max(700, last));
    const fell = [0, 0, 0];
    const inhibAt: number[] = [];
    order.forEach((l, i) => {
      const k = fell[l]++;
      plans.push({ t: at[i], kind: "tower", side: s, at: RIFT.towers[o][l * 3 + k], kills: [0, 0], part: [int(r, 1, 3), 0], need: 1 });
      if (k === 2 && inhibAt.length < open) inhibAt.push(l);
    });
    // Inhibiteurs : peu après la tour qui les protège ; le dernier du vainqueur ouvre la fin
    inhibAt.forEach((l, i) => {
      const tower = plans.find((p) => p.kind === "tower" && p.side === s && p.at === RIFT.towers[o][l * 3 + 2])!;
      const t = winner && i === inhibAt.length - 1 ? duration - 75 : Math.min(duration - 90, tower.t + 20 + r() * 50);
      plans.push({ t: Math.max(t, tower.t + 8), kind: "inhib", side: s, at: RIFT.inhibs[o][l], kills: [0, 0], part: [int(r, 3, 5), 0], need: 2 });
    });
    return order.length;
  };
  siege(W, Math.max(5, tpl.tw), Math.max(1, tpl.iw), true);
  siege(L, tpl.tl, tpl.il, false);
  // La première tour revient au camp qui l'a prise en vrai (avancer sa première tour garde l'ordre)
  const firstTower = (s: Side) => plans.filter((p) => p.kind === "tower" && p.side === s).sort((x, y) => x.t - y.t)[0];
  const [ft, fo] = tpl.ft === 0 ? [firstTower(L), firstTower(W)] : [firstTower(W), firstTower(L)];
  if (ft && fo && fo.t <= ft.t) ft.t = Math.max(300, fo.t - 20 - r() * 60);
  plans.push({ t: duration - 45, kind: "tower", side: W, at: RIFT.towers[L][9], kills: [0, 0], part: [int(r, 3, 5), 0], need: 1 });
  plans.push({ t: duration - 30, kind: "tower", side: W, at: RIFT.towers[L][10], kills: [0, 0], part: [int(r, 3, 5), 0], need: 1 });

  // Éliminations : le nombre de kills de chaque camp entre 0-10, 10-15, 15-20, 20-25 min et la fin,
  // regroupés en kills isolés, escarmouches et combats d'équipe (de plus en plus fréquents).
  const marks: [number, number, number][] = [[0, 0, 0]];
  for (const m of [10, 15, 20, 25]) {
    const kw = tpl[`k${m}w`];
    const kl = tpl[`k${m}l`];
    if (m * 60 < duration - 60 && kw >= 0 && kl >= 0) marks.push([m * 60, Math.min(kw, tpl.kw), Math.min(kl, tpl.kl)]);
  }
  marks.push([end, tpl.kw, tpl.kl]);
  // Combat final devant la base du perdant
  const lastW = marks.at(-1)![1] - Math.max(marks.at(-2)![1], 0);
  const finalW = Math.min(Math.max(0, lastW), int(r, 2, 4));
  const finalL = finalW && r() < 0.4 ? Math.min(1, tpl.kl - Math.max(0, marks.at(-2)![2])) : 0;
  marks[marks.length - 1] = [end, tpl.kw - finalW, tpl.kl - Math.max(0, finalL)];
  if (finalW) plans.push({ t: end, kind: "teamfight", side: W, at: near(r, RIFT.nexus[L], 6), kills: [finalW, Math.max(0, finalL)], part: [5, 5] });
  for (let i = 1; i < marks.length; i++) {
    const [a, pw, pl] = marks[i - 1];
    const [b, cw, cl] = marks[i];
    const left = { [W]: Math.max(0, cw - Math.max(0, pw)), [L]: Math.max(0, cl - Math.max(0, pl)) } as Record<Side, number>;
    const big = a < 600 ? 0.04 : a < 900 ? 0.2 : a < 1200 ? 0.35 : 0.5;
    while (left.a + left.b > 0) {
      const s: Side = r() * (left.a + left.b) < left[W] ? W : L;
      const o = other(s);
      const t = Math.max(150, a + r() * (b - a));
      const roll = r();
      if (left.a + left.b >= 3 && roll < big) {
        const k: [number, number] = [Math.min(left[s], int(r, 2, 4)), Math.min(left[o], int(r, 0, 2))];
        left[s] -= k[0];
        left[o] -= k[1];
        plans.push({ t, kind: "teamfight", side: s, at: near(r, pick(r, SPOTS), 5), kills: k, part: [int(r, 4, 5), int(r, 4, 5)] });
      } else if (left.a + left.b >= 2 && roll < big + 0.4) {
        const k: [number, number] = [Math.min(left[s], int(r, 1, 2)), Math.min(left[o], r() < 0.4 ? 1 : 0)];
        left[s] -= k[0];
        left[o] -= k[1];
        plans.push({ t, kind: "skirmish", side: s, at: near(r, pick(r, SPOTS), 4), kills: k, part: [int(r, 2, 4), int(r, 2, 4)] });
      } else {
        left[s]--;
        const early = t < 900;
        const lane = pick(r, [0, 1, 1, 2, 2]);
        plans.push({ t, kind: "kill", side: s, at: early ? lanePoint(lane, 0.5 + (s === "a" ? 0.08 : -0.08) * r()) : near(r, pick(r, SPOTS), 4), kills: [1, 0], part: [early && r() < 0.5 ? 2 : int(r, 1, 3), 1] });
      }
    }
  }
  // Premier sang : pour le camp qui l'a eu en vrai (on échange avec sa première élimination)
  const killPlans = plans.filter((p) => p.kills[0] + p.kills[1] > 0 && p.t !== end).sort((x, y) => x.t - y.t);
  const fbSide: Side | null = tpl.fb === 1 ? W : tpl.fb === 0 ? L : null;
  if (fbSide && killPlans.length && killPlans[0].side !== fbSide) {
    const mine = killPlans.find((p) => p.side === fbSide && p.t < 900);
    if (mine) [mine.t, killPlans[0].t] = [killPlans[0].t, mine.t];
  }
  // Un combat proche d'un objectif se joue sur l'objectif, juste avant sa prise
  const snapped = new Set<Plan>();
  for (const ob of plans.filter((p) => p.kind === "dragon" || p.kind === "baron" || p.kind === "herald")) {
    const fight = plans.find((p) => (p.kind === "skirmish" || p.kind === "teamfight") && p.t !== end && Math.abs(p.t - ob.t) < 75 && !snapped.has(p));
    if (!fight) continue;
    fight.t = ob.t - 6 - r() * 14;
    fight.at = near(r, ob.at, 3);
    snapped.add(fight);
  }
  plans.push({ t: duration, kind: "nexus", side: W, at: RIFT.nexus[L], kills: [0, 0], part: [3, 0], need: 1 });

  // --- Déroulé : les morts réapparaissent après un délai, personne ne combat sans être en vie ---
  const pending = plans;
  while (pending.length) {
    pending.sort((x, y) => x.t - y.t);
    const pl = pending.shift()!;
    const s = pl.side;
    const o = other(s);
    const t = Math.round(pl.kind === "nexus" || pl.kind === "inhib" ? pl.t : Math.min(pl.t, end - 10));
    const aliveS = alive(s, t);
    const final = pl.kind === "nexus" || pl.kind === "inhib" || (pl.kind === "teamfight" && pl.t === end);
    // Pas assez de joueurs en vie pour l'objectif : il est repoussé à la prochaine réapparition
    if (pl.need && aliveS.length < pl.need && !final && (pl.tries ?? 0) < 4) {
      const next = Math.min(...deadUntil[s].filter((d) => d > t));
      pending.push({ ...pl, t: Math.min(end - 20, next + 4), tries: (pl.tries ?? 0) + 1 });
      continue;
    }
    if (pl.need && aliveS.length < pl.need && !final) continue;
    // Les actions de fin se jouent avec ce qu'il reste : les morts sont réanimés pour l'assaut final
    const poolS = final ? [0, 1, 2, 3, 4].filter((i) => aliveS.includes(i) || pl.kind !== "teamfight") : aliveS;
    const poolO = alive(o, t);
    const whoS = shuffle(poolS.length ? poolS : [0], r).slice(0, Math.max(0, Math.min(pl.part[0], poolS.length || 1)));
    const whoO = shuffle(poolO, r).slice(0, Math.max(0, Math.min(Math.max(pl.part[1], pl.kills[0]), poolO.length)));
    const killsS = Math.min(pl.kills[0], whoO.length);
    const killsO = Math.min(pl.kills[1], whoS.length);
    // Kills impossibles faute d'adversaires en vie : ils se jouent un peu plus tard
    const rest: [number, number] = [pl.kills[0] - killsS, pl.kills[1] - killsO];
    if (rest[0] + rest[1] > 0 && !final && (pl.tries ?? 0) < 4 && t + 30 < end - 10) {
      pending.push({ ...pl, t: Math.min(end - 10, t + 30 + r() * 40), kind: rest[0] + rest[1] > 2 ? "teamfight" : rest[0] + rest[1] > 1 ? "skirmish" : "kill", kills: rest, part: [Math.max(rest[0], 2), Math.max(rest[1], 2)], need: undefined, tries: (pl.tries ?? 0) + 1 });
    }
    if (pl.kills[0] + pl.kills[1] > 0 && killsS + killsO === 0) continue;
    const ks: NonNullable<MayhemEvent["ks"]> = [];
    // Les victimes et les tueurs suivent la répartition des vraies parties par poste
    const deadO = weighted(r, whoO, roles.deaths, killsS);
    const deadS = weighted(r, whoS, roles.deaths, killsO);
    const credit = (killers: number[], assist: number[], victims: number[], from: Side) => {
      for (const v of victims) {
        const killer = weighted(r, killers, roles.kills, 1)[0];
        kda[from][killer][0]++;
        const helpers = assist.filter((a) => a !== killer && r() < Math.min(0.95, 0.5 + roles.assists[a] * 1.6));
        for (const a of helpers) kda[from][a][2]++;
        kda[other(from)][v][1]++;
        ks.push([from, killer, v, helpers]);
      }
    };
    credit(whoS.length ? whoS : [0], whoS, deadO, s);
    credit(whoO.length ? whoO : [0], whoO, deadS, o);
    for (const v of deadO) deadUntil[o][v] = t + mayhemRespawn(t);
    for (const v of deadS) deadUntil[s][v] = t + mayhemRespawn(t);
    const ev: MayhemEvent = { t, kind: pl.kind, side: s, at: pl.at, ka: s === "a" ? deadO.length : deadS.length, kb: s === "a" ? deadS.length : deadO.length, who: { a: [], b: [] }, dead: { a: [], b: [] }, ks };
    ev.who[s] = whoS;
    ev.who[o] = whoO;
    ev.dead[s] = deadS;
    ev.dead[o] = deadO;
    if (deadO.length) {
      ev.killer = ks.find((x) => x[0] === s)?.[1];
      ev.victim = deadO[0];
    }
    events.push(ev);
  }
  events.sort((x, y) => x.t - y.t);
  // Premier sang : la première élimination de la partie
  const first = events.find((e) => (e.ks?.length ?? 0) > 0);
  if (first && (first.kind === "kill" || first.kind === "skirmish")) first.kind = "firstblood";

  // Écart d'or : celui de la vraie partie à 10, 15, 20 et 25 min ; entre deux repères et après le
  // dernier, chaque action rapporte de l'or à son camp
  const VALUE: Record<MayhemEvent["kind"], number> = { firstblood: 400, kill: 300, skirmish: 200, teamfight: 300, dragon: 250, herald: 350, tower: 550, inhib: 450, baron: 1500, nexus: 0 };
  const sign = W === "a" ? 1 : -1;
  const anchors: [number, number][] = [[0, 0]];
  for (const m of [10, 15, 20, 25]) if (m * 60 < duration - 60 && tpl[`gd${m}`] !== -1) anchors.push([m * 60, sign * tpl[`gd${m}`]]);
  const raw: number[] = [];
  let acc = 0;
  for (const e of events) raw.push((acc += (e.side === "a" ? 1 : -1) * VALUE[e.kind] + (e.ka - e.kb) * 300));
  const rawAt = (t: number) => {
    let v = 0;
    events.forEach((e, i) => e.t <= t && (v = raw[i]));
    return v;
  };
  const gold: [number, number][] = [[0, 0]];
  events.forEach((e, i) => {
    const k = anchors.findIndex(([at]) => at > e.t);
    let v: number;
    if (k > 0) {
      // Entre deux repères : la courbe réelle, avec les à-coups des actions
      const [t0, g0] = anchors[k - 1];
      const [t1, g1] = anchors[k];
      const f = (e.t - t0) / (t1 - t0);
      v = g0 + (g1 - g0) * f + (raw[i] - (rawAt(t0) + (rawAt(t1) - rawAt(t0)) * f)) * 0.25;
    } else {
      const [t0, g0] = anchors.at(-1)!;
      v = g0 + raw[i] - rawAt(t0);
    }
    gold.push([e.t, Math.round(v)]);
  });
  return { blue, red, winner: blueWins ? blue : red, duration, champs, kda, events, gold };
}

function simMatch(r: R, a: number, b: number, entrants: MayhemEntrant[], bo: number): MayhemMatch {
  const need = (bo + 1) / 2;
  const wins: [number, number] = [0, 0];
  const games: MayhemGame[] = [];
  for (let g = 0; wins[0] < need && wins[1] < need; g++) {
    // Les côtés alternent à chaque partie
    const [blue, red] = g % 2 === 0 ? [a, b] : [b, a];
    const game = simGame(r, blue, red, entrants[blue].rating, entrants[red].rating);
    games.push(game);
    wins[game.winner === a ? 0 : 1]++;
  }
  return { a, b, bo, wins, winner: wins[0] >= need ? a : b, games };
}

/** Journées d'une poule de 4 (index dans la poule) : chacun joue contre chacun en Bo1. */
const DAYS: [number, number][][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]]
];

function simGroup(r: R, name: string, members: number[], entrants: MayhemEntrant[]): MayhemGroup {
  const matches = DAYS.flat().map(([i, j]) => simMatch(r, members[i], members[j], entrants, 1));
  const wins = (e: number) => matches.filter((m) => m.winner === e).length;
  // Classement : victoires, puis confrontation directe (égalité à deux), puis note d'équipe
  const standings = [...members].sort((x, y) => {
    if (wins(y) !== wins(x)) return wins(y) - wins(x);
    const tied = members.filter((e) => wins(e) === wins(x));
    if (tied.length === 2) {
      const h2h = matches.find((m) => (m.a === x && m.b === y) || (m.a === y && m.b === x));
      if (h2h) return h2h.winner === x ? -1 : 1;
    }
    return entrants[y].rating - entrants[x].rating;
  });
  return { name, members, matches, standings };
}

/**
 * Tournoi complet à 16 : 4 poules de 4 (Bo1, chacun contre chacun), puis quarts (Bo1),
 * demies (Bo3) et finale (Bo5). Les participants sont répartis dans l'ordre : le n°0 est en poule A.
 */
export function simulateTournament(seed: string, entrants: MayhemEntrant[]): MayhemTournament {
  const r = rng(seed + ":tournoi");
  const groups = ["A", "B", "C", "D"].map((name, g) => simGroup(r, name, [g, g + 4, g + 8, g + 12], entrants));
  const [A, B, C, D] = groups.map((g) => g.standings);
  // Quarts croisés : 1er d'une poule contre 2e d'une autre
  let alive = [A[0], B[1], C[0], D[1], B[0], A[1], D[0], C[1]];
  const rounds: MayhemMatch[][] = [];
  for (const bo of [1, 3, 5]) {
    const matches: MayhemMatch[] = [];
    for (let i = 0; i < alive.length; i += 2) matches.push(simMatch(r, alive[i], alive[i + 1], entrants, bo));
    rounds.push(matches);
    alive = matches.map((m) => m.winner);
  }
  return { entrants, groups, rounds, champion: alive[0] };
}

import { rng, shuffle } from "@loltr/shared";
import {
  MAYHEM_CHAMPS,
  MAYHEM_COMPS,
  MAYHEM_ROLES,
  MAYHEM_TEAMS,
  RIFT,
  mayhemRating,
  rosterPicks,
  type MayhemEntrant,
  type MayhemEvent,
  type MayhemGame,
  type MayhemGroup,
  type MayhemMatch,
  type MayhemTournament
} from "@loltr/content";

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
const SPOTS: [number, number][] = [[9, 30], [27, 8.5], [50, 50], [44, 56], [56, 44], [80, 91.5], [91.5, 74], ...RIFT.camps.map((c) => c.at)];

function simGame(r: R, blue: number, red: number, ra: number, rb: number): MayhemGame {
  const blueWins = r() < winProb(ra, rb);
  const W: Side = blueWins ? "a" : "b";
  const duration = Math.max(1320, Math.round(1500 + r() * 600 - Math.abs(ra - rb) * 12));
  const side = (p: number): Side => (r() < p ? W : other(W));
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
  const towersDown = { a: 0, b: 0 };
  const towerOrder = [0, 3, 6, 1, 4, 7, 2, 5, 8];

  // Kills : `n` victimes du côté `victims`, tuées par les joueurs `killers` du camp adverse
  const kills = (victims: Side, n: number, whoV: number[], whoK: number[]) => {
    const dead = whoV.slice(0, n);
    for (const v of dead) {
      kda[victims][v][1]++;
      const k = pick(r, whoK);
      kda[other(victims)][k][0]++;
      for (const as of whoK) if (as !== k) kda[other(victims)][as][2]++;
    }
    return dead;
  };
  const add = (t: number, kind: MayhemEvent["kind"], s: Side, at: [number, number], whoS: number[], whoO: number[], killsS: number, killsO: number) => {
    const deadO = kills(other(s), killsS, whoO, whoS.length ? whoS : [0]);
    const deadS = kills(s, killsO, whoS, whoO.length ? whoO : [0]);
    // Tout se joue avant l'inhibiteur final et le Nexus
    const when = kind === "nexus" || kind === "inhib" ? t : Math.min(t, duration - 120);
    const ev: MayhemEvent = { t: Math.round(when), kind, side: s, at, ka: s === "a" ? deadO.length : deadS.length, kb: s === "a" ? deadS.length : deadO.length, who: { a: [], b: [] }, dead: { a: [], b: [] } };
    ev.who[s] = whoS;
    ev.who[other(s)] = whoO;
    ev.dead[s] = deadS;
    ev.dead[other(s)] = deadO;
    if (deadO.length) {
      ev.killer = whoS[0];
      ev.victim = deadO[0];
    }
    events.push(ev);
  };

  // Premier sang
  {
    const s = side(0.6);
    const killer = int(r, 0, 4);
    const victim = int(r, 0, 4);
    const helpers = r() < 0.6 ? [killer, (killer + 1 + int(r, 0, 3)) % 5] : [killer];
    add(140 + r() * 200, "firstblood", s, near(r, pick(r, SPOTS)), helpers, [victim], 1, 0);
  }
  // Dragons toutes les 6 minutes environ, Héraut vers 14 minutes
  for (let t = 330 + r() * 60; t < duration - 150; t += 330 + r() * 60) {
    const s = side(0.58);
    const fight = r() < 0.4;
    add(t, "dragon", s, near(r, RIFT.dragon, 1.5), some(r, int(r, 3, 5)), fight ? some(r, int(r, 2, 4)) : [], fight ? int(r, 1, 2) : 0, fight ? int(r, 0, 1) : 0);
  }
  if (duration > 900) {
    const s = side(0.6);
    add(800 + r() * 120, "herald", s, near(r, RIFT.baron, 1.5), some(r, 3), [], 0, 0);
  }
  // Escarmouches et combats d'équipe
  for (let i = 0; i < int(r, 2, 4); i++) {
    const s = side(0.62);
    const big = r() < 0.35;
    const t = 420 + r() * (duration - 700);
    add(t, big ? "teamfight" : "skirmish", s, near(r, pick(r, SPOTS), 4), some(r, big ? 5 : int(r, 2, 3)), some(r, big ? 5 : int(r, 2, 3)), big ? int(r, 2, 4) : int(r, 1, 2), big ? int(r, 0, 2) : int(r, 0, 1));
  }
  // Kills isolés
  for (let i = 0; i < int(r, 2, 4); i++) {
    const s = side(0.6);
    add(300 + r() * (duration - 500), "kill", s, near(r, pick(r, SPOTS), 3), [int(r, 0, 4)], [int(r, 0, 4)], 1, 0);
  }
  // Tours : l'équipe `s` détruit une tour du camp adverse, dans l'ordre extérieur → base
  for (let i = 0; i < int(r, 4, 7); i++) {
    const s = side(0.66);
    const o = other(s);
    if (towersDown[o] >= towerOrder.length) continue;
    const at = RIFT.towers[o][towerOrder[towersDown[o]++]];
    add(560 + i * 170 + r() * 90, "tower", s, at, some(r, int(r, 1, 3)), [], 0, 0);
  }
  // Baron Nashor
  if (duration > 1350) {
    const s = side(0.75);
    add(1260 + r() * Math.max(60, duration - 1450), "baron", s, near(r, RIFT.baron, 1.5), some(r, 5), some(r, int(r, 3, 5)), int(r, 2, 4), int(r, 0, 2));
  }
  // Fin : inhibiteur puis Nexus de l'équipe perdante
  const L = other(W);
  add(duration - 80, "inhib", W, pick(r, RIFT.inhibs[L]), some(r, 5), some(r, int(r, 1, 3)), int(r, 1, 3), int(r, 0, 1));
  add(duration, "nexus", W, RIFT.nexus[L], some(r, 5), [], 0, 0);
  events.sort((x, y) => x.t - y.t);

  // Écart d'or : chaque action rapporte de l'or à son camp, avec une dérive vers le vainqueur
  const VALUE: Record<MayhemEvent["kind"], number> = { firstblood: 400, kill: 300, skirmish: 200, teamfight: 300, dragon: 250, herald: 350, tower: 550, inhib: 450, baron: 1500, nexus: 0 };
  let diff = 0;
  const gold: [number, number][] = [[0, 0]];
  for (const e of events) {
    diff += (e.side === "a" ? 1 : -1) * VALUE[e.kind] + (e.ka - e.kb) * 300 + (W === "a" ? 1 : -1) * 120;
    gold.push([e.t, Math.round(diff)]);
  }
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

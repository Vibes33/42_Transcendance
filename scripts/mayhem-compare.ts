// Statistiques des parties simulées de World Mayhem, à comparer avec celles des vraies parties
// qu'affiche scripts/mayhem-calibrate.ts.
//
//   bun run scripts/mayhem-compare.ts [nombre de tournois]

import type { MayhemGame } from "@loltr/content";
import { botFill } from "../services/jeux/src/games/mayhemDraft";
import { simulateTournament } from "../services/jeux/src/games/mayhemSim";

const N = Number(process.argv[2] ?? 60);
const games: MayhemGame[] = [];
for (let i = 0; i < N; i++) {
  const t = simulateTournament("s" + i, botFill("b" + i, 16));
  for (const m of [...t.groups.flatMap((g) => g.matches), ...t.rounds.flat()]) games.push(...m.games);
}

type Side = "a" | "b";
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const stat = (label: string, xs: number[]) => console.log(label.padEnd(26), [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => String(q(xs, p)).padStart(6)).join(""));
const W = (g: MayhemGame): Side => (g.winner === g.blue ? "a" : "b");
const L = (g: MayhemGame): Side => (W(g) === "a" ? "b" : "a");
const count = (g: MayhemGame, kind: string, s?: Side) => g.events.filter((e) => e.kind === kind && (!s || e.side === s)).length;
const kills = (g: MayhemGame, s: Side) => g.kda[s].reduce((n, k) => n + k[0], 0);
const goldAt = (g: MayhemGame, t: number) => {
  let v = 0;
  for (const [at, d] of g.gold) if (at <= t) v = d;
  return (W(g) === "a" ? 1 : -1) * v;
};
const first = (kind: string) => {
  const xs = games.map((g) => g.events.find((e) => e.kind === kind)).map((e, i) => (e ? (e.side === W(games[i]) ? 1 : 0) : -1)).filter((x) => x >= 0);
  return `${((100 * xs.filter((x) => x).length) / xs.length).toFixed(1)} %`;
};

console.log(`${games.length} parties simulées\n${"".padEnd(26)}    p5   p25   p50   p75   p95`);
stat("durée (min)", games.map((g) => Math.round(g.duration / 6) / 10));
stat("kills total", games.map((g) => kills(g, "a") + kills(g, "b")));
stat("kills vainqueur", games.map((g) => kills(g, W(g))));
stat("kills perdant", games.map((g) => kills(g, L(g))));
stat("tours vainqueur", games.map((g) => count(g, "tower", W(g))));
stat("tours perdant", games.map((g) => count(g, "tower", L(g))));
stat("dragons total", games.map((g) => count(g, "dragon")));
stat("barons total", games.map((g) => count(g, "baron")));
stat("inhibs vainqueur", games.map((g) => count(g, "inhib", W(g))));
stat("écart d'or 15 min (w)", games.map((g) => goldAt(g, 900)));
console.log("premier sang → victoire".padEnd(26), first("firstblood"));
console.log("premier dragon → victoire".padEnd(26), first("dragon"));
console.log("première tour → victoire".padEnd(26), first("tower"));
console.log("premier baron → victoire".padEnd(26), first("baron"));
const share = (k: 0 | 1) => {
  const xs = [0, 0, 0, 0, 0];
  for (const g of games) for (const s of ["a", "b"] as const) g.kda[s].forEach((v, i) => (xs[i] += v[k]));
  const sum = xs.reduce((a, b) => a + b);
  return xs.map((x) => (x / sum).toFixed(3)).join(" / ");
};
console.log("part des kills par poste", share(0));

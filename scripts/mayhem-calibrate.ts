// Calibrage de World Mayhem sur de vraies parties pro (Oracle's Elixir, https://oracleselixir.com).
// Lit data/oracleselixir/<année>.csv (non versionnés, à télécharger depuis leur Google Drive) et écrit
// services/jeux/src/games/mayhemReal.json : un « gabarit » par partie des grandes ligues et des
// compétitions internationales, vu du vainqueur. Le simulateur en tire un au hasard pour chaque partie.
// Les statistiques de jeu appartiennent à Riot Games : usage de fan, non commercial.
//
//   bun run scripts/mayhem-calibrate.ts [années…]   (défaut : 2024 2025 2026)

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const YEARS = process.argv.slice(2).length ? process.argv.slice(2) : ["2024", "2025", "2026"];
/** Ligues majeures et compétitions internationales : le niveau des Worlds. */
const LEAGUES = new Set(["LCK", "LPL", "LEC", "LCS", "LTA N", "LTA S", "LCP", "CBLOL", "PCS", "VCS", "LJL", "WLDs", "MSI", "FST", "EWC"]);
const OUT = "services/jeux/src/games/mayhemReal.json";
/** Nombre de parties gardées dans le fichier. */
const CAP = 2400;

type Row = Record<string, string>;
const num = (v: string | undefined) => (v === undefined || v === "" ? NaN : Number(v));

const teams = new Map<string, Row[]>();
const players = new Map<string, Row[]>();
for (const y of YEARS) {
  const file = `data/oracleselixir/${y}.csv`;
  if (!existsSync(file)) {
    console.warn(`absent : ${file}`);
    continue;
  }
  const lines = readFileSync(file, "utf8").split("\n");
  const head = lines[0].split(",");
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(",");
    if (f.length < head.length || f[col.datacompleteness] !== "complete" || !LEAGUES.has(f[col.league])) continue;
    const row: Row = {};
    for (const h of head) row[h] = f[col[h]];
    const map = row.position === "team" ? teams : players;
    const list = map.get(row.gameid) ?? [];
    list.push(row);
    map.set(row.gameid, list);
  }
}

/**
 * Gabarit d'une partie, du point de vue du vainqueur (w) puis du perdant (l) :
 * [durée s, kills w, kills l, tours w, tours l, dragons w, dragons l, ancestraux w, ancestraux l,
 *  hérauts w, hérauts l, barons w, barons l, inhibs w, inhibs l, larves w, larves l,
 *  premier sang w?, premier dragon w?, première tour w?, premier baron w?,
 *  kills à 10/15/20/25 min (w, l)…, écart d'or à 10/15/20/25 min (w − l), bleu vainqueur?]
 */
type Template = number[];
const templates: Template[] = [];
const roleShare = { kills: [0, 0, 0, 0, 0], deaths: [0, 0, 0, 0, 0], assists: [0, 0, 0, 0, 0] };
const ROLE = { top: 0, jng: 1, mid: 2, bot: 3, sup: 4 } as Record<string, number>;

for (const [id, rows] of teams) {
  if (rows.length !== 2) continue;
  const w = rows.find((r) => r.result === "1");
  const l = rows.find((r) => r.result === "0");
  if (!w || !l) continue;
  const g = (r: Row, k: string) => num(r[k]);
  const pair = (k: string) => [g(w, k), g(l, k)];
  const first = (k: string) => (g(w, k) === 1 ? 1 : g(l, k) === 1 ? 0 : -1);
  const at = [10, 15, 20, 25].flatMap((m) => [g(w, `killsat${m}`), g(l, `killsat${m}`)]);
  const gd = [10, 15, 20, 25].map((m) => g(w, `golddiffat${m}`));
  const t: Template = [
    g(w, "gamelength"),
    ...pair("teamkills"),
    ...pair("towers"),
    ...pair("dragons"),
    ...pair("elders"),
    ...pair("heralds"),
    ...pair("barons"),
    ...pair("inhibitors"),
    ...pair("void_grubs"),
    first("firstblood"),
    first("firstdragon"),
    first("firsttower"),
    first("firstbaron"),
    ...at,
    ...gd,
    w.side === "Blue" ? 1 : 0
  ];
  // Valeurs absentes (25 min d'une partie plus courte…) : -1 plutôt que NaN
  templates.push(t.map((v) => (Number.isFinite(v) ? v : -1)));
  for (const p of players.get(id) ?? []) {
    const i = ROLE[p.position];
    if (i === undefined) continue;
    roleShare.kills[i] += g(p, "kills") || 0;
    roleShare.deaths[i] += g(p, "deaths") || 0;
    roleShare.assists[i] += g(p, "assists") || 0;
  }
}

const norm = (xs: number[]) => {
  const s = xs.reduce((a, b) => a + b, 0) || 1;
  return xs.map((x) => +(x / s).toFixed(3));
};
// Un échantillon régulier suffit (et garde le fichier léger) : l'ordre d'origine est chronologique
const step = Math.max(1, templates.length / CAP);
const kept = templates.length > CAP ? Array.from({ length: CAP }, (_, i) => templates[Math.floor(i * step)]) : templates;
const out = {
  source: "Oracle's Elixir — " + YEARS.join(", "),
  fields: "len,kw,kl,tw,tl,dw,dl,ew,el,hw,hl,bw,bl,iw,il,gw,gl,fb,fd,ft,fbaron,k10w,k10l,k15w,k15l,k20w,k20l,k25w,k25l,gd10,gd15,gd20,gd25,blue",
  roles: { kills: norm(roleShare.kills), deaths: norm(roleShare.deaths), assists: norm(roleShare.assists) },
  games: kept
};
writeFileSync(OUT, JSON.stringify(out).replace(/\],\[/g, "],\n["));

// --- Résumé lisible ---
const q = (xs: number[], p: number) => {
  const s = xs.filter((x) => x !== -1).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const col = (i: number) => templates.map((t) => t[i]);
const stat = (label: string, xs: number[]) => console.log(label.padEnd(26), [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => String(q(xs, p)).padStart(6)).join(""));
const rate = (label: string, i: number) => {
  const xs = col(i).filter((x) => x >= 0);
  console.log(label.padEnd(26), `${((100 * xs.filter((x) => x === 1).length) / xs.length).toFixed(1)} % (${xs.length})`);
};
console.log(`${templates.length} parties (${kept.length} gardées) → ${OUT}\n${"".padEnd(26)}    p5   p25   p50   p75   p95`);
stat("durée (min)", col(0).map((s) => Math.round(s / 6) / 10));
stat("kills total", templates.map((t) => t[1] + t[2]));
stat("kills vainqueur", col(1));
stat("kills perdant", col(2));
stat("tours vainqueur", col(3));
stat("tours perdant", col(4));
stat("dragons total", templates.map((t) => t[5] + t[6]));
stat("barons total", templates.map((t) => t[11] + t[12]));
stat("inhibs vainqueur", col(13));
stat("larves total", templates.map((t) => (t[15] < 0 ? -1 : t[15] + t[16])));
stat("écart d'or 15 min (w)", col(30));
rate("premier sang → victoire", 17);
rate("premier dragon → victoire", 18);
rate("première tour → victoire", 19);
rate("premier baron → victoire", 20);
rate("côté bleu → victoire", 33);
console.log("part des kills par poste", out.roles.kills.join(" / "));

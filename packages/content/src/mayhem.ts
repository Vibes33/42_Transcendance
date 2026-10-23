// World Mayhem : rosters des Worlds 2020 à 2025, notes des cartes, liens d'équipe et repères de la
// Faille de l'invocateur. Partagé par le moteur (service jeux) et l'interface.
// Notes PROVISOIRES : à recalculer depuis les stats de l'année (Oracle's Elixir, gol.gg) et le
// parcours de l'équipe aux Worlds (Liquipedia).

export type MayhemRole = "top" | "jgl" | "mid" | "adc" | "sup";
export const MAYHEM_ROLES: MayhemRole[] = ["top", "jgl", "mid", "adc", "sup"];
export const MAYHEM_ROLE_LABEL: Record<MayhemRole, string> = { top: "Top", jgl: "Jungle", mid: "Mid", adc: "ADC", sup: "Support" };

/** Parcours de l'équipe aux Worlds : 1 champion, 2 finaliste, 3 demi-finale, 4 quart. */
export type MayhemPlace = 1 | 2 | 3 | 4;
export const MAYHEM_PLACE_LABEL: Record<MayhemPlace, string> = { 1: "Champion", 2: "Finaliste", 3: "Demi-finale", 4: "Quart de finale" };

export interface MayhemPlayer {
  name: string;
  role: MayhemRole;
  /** Note de la carte (stats de l'année + palmarès + parcours de l'équipe). */
  ovr: number;
}

export interface MayhemTeam {
  id: string;
  org: string;
  tag: string;
  year: number;
  place: MayhemPlace;
  color: string;
  /** Un joueur par poste, dans l'ordre top, jungle, mid, ADC, support. */
  players: MayhemPlayer[];
}

function team(id: string, org: string, tag: string, year: number, place: MayhemPlace, color: string, players: [string, number][]): MayhemTeam {
  return { id, org, tag, year, place, color, players: players.map(([name, ovr], i) => ({ name, ovr, role: MAYHEM_ROLES[i] })) };
}

export const MAYHEM_TEAMS: MayhemTeam[] = [
  team("t1-23", "T1", "T1", 2023, 1, "#C8102E", [["Zeus", 93], ["Oner", 91], ["Faker", 95], ["Gumayusi", 92], ["Keria", 94]]),
  team("t1-24", "T1", "T1", 2024, 1, "#C8102E", [["Zeus", 94], ["Oner", 92], ["Faker", 93], ["Gumayusi", 93], ["Keria", 93]]),
  team("t1-25", "T1", "T1", 2025, 1, "#C8102E", [["Doran", 89], ["Oner", 90], ["Faker", 92], ["Gumayusi", 93], ["Keria", 94]]),
  team("dwg-20", "DAMWON", "DWG", 2020, 1, "#1C7C8C", [["Nuguri", 94], ["Canyon", 95], ["ShowMaker", 95], ["Ghost", 88], ["BeryL", 91]]),
  team("edg-21", "EDG", "EDG", 2021, 1, "#3A4A5C", [["Flandre", 87], ["Jiejie", 89], ["Scout", 92], ["Viper", 94], ["Meiko", 90]]),
  team("drx-22", "DRX", "DRX", 2022, 1, "#3D6CE0", [["Kingen", 89], ["Pyosik", 88], ["Zeka", 93], ["Deft", 92], ["BeryL", 91]]),
  team("blg-24", "BLG", "BLG", 2024, 2, "#1F74B3", [["Bin", 94], ["XUN", 87], ["knight", 94], ["Elk", 91], ["ON", 88]]),
  team("kt-25", "KT Rolster", "KT", 2025, 2, "#C02A21", [["PerfecT", 87], ["Cuzz", 88], ["Bdd", 90], ["deokdam", 89], ["Peter", 87]]),
  team("wbg-23", "Weibo", "WBG", 2023, 2, "#A86A12", [["TheShy", 88], ["Weiwei", 86], ["Xiaohu", 89], ["Light", 87], ["Crisp", 87]]),
  team("geng-24", "Gen.G", "GEN", 2024, 3, "#8A6F1E", [["Kiin", 91], ["Canyon", 90], ["Chovy", 94], ["Peyz", 90], ["Lehends", 89]]),
  team("jdg-23", "JDG", "JDG", 2023, 3, "#B3202F", [["369", 90], ["Kanavi", 91], ["knight", 93], ["Ruler", 93], ["MISSING", 88]]),
  team("g2-20", "G2", "G2", 2020, 3, "#5F6670", [["Wunder", 86], ["Jankos", 88], ["Caps", 91], ["Perkz", 89], ["Mikyx", 87]]),
  team("dk-21", "DWG KIA", "DK", 2021, 3, "#16697A", [["Khan", 89], ["Canyon", 93], ["ShowMaker", 93], ["Ghost", 88], ["BeryL", 90]]),
  team("t1-22", "T1", "T1", 2022, 2, "#C8102E", [["Zeus", 91], ["Oner", 89], ["Faker", 93], ["Gumayusi", 91], ["Keria", 93]]),
  team("geng-22", "Gen.G", "GEN", 2022, 3, "#8A6F1E", [["Doran", 88], ["Peanut", 89], ["Chovy", 93], ["Ruler", 92], ["Lehends", 88]]),
  team("jdg-22", "JDG", "JDG", 2022, 3, "#B3202F", [["369", 88], ["Kanavi", 90], ["Yagao", 88], ["Hope", 87], ["MISSING", 87]]),
  team("blg-23", "BLG", "BLG", 2023, 3, "#1F74B3", [["Bin", 91], ["XUN", 87], ["Yagao", 88], ["Elk", 90], ["ON", 87]]),
  team("wbg-24", "Weibo", "WBG", 2024, 3, "#A86A12", [["Breathe", 87], ["Tarzan", 89], ["Xiaohu", 89], ["Light", 88], ["Crisp", 87]])
];
export const MAYHEM_TEAM_BY_ID: Record<string, MayhemTeam> = Object.fromEntries(MAYHEM_TEAMS.map((t) => [t.id, t]));

export const MAYHEM_JOKERS = 3;
/** Plafond du bonus de liens d'équipe. */
export const MAYHEM_LINK_CAP = 10;
/** Score du jour (équipe du jour) : note d'équipe + 2 points par victoire (poules et phase finale). */
export const MAYHEM_WIN_POINTS = 2;

/** Paires de postes qui se complètent ; les autres paires d'un même roster valent +1. */
const PAIRS: Record<string, [number, string]> = {
  "top|jgl": [2, "Duo top-jungle"],
  "jgl|mid": [3, "Duo mid-jungle"],
  "jgl|sup": [2, "Jungle-support"],
  "mid|sup": [1, "Mid-support"],
  "adc|sup": [4, "Duo bot"]
};

/** Choix d'un poste : équipe tirée et index du joueur (= son poste). */
export interface MayhemPick {
  t: string;
  i: number;
}
export type MayhemPicks = Partial<Record<MayhemRole, MayhemPick>>;

export interface MayhemLink {
  roles: [MayhemRole, MayhemRole] | null;
  names: string;
  /** Duo bot, même roster… (libellé français, traduit par l'interface). */
  kind: string;
  /** Roster ou structure concerné (« T1 2023 », « T1 »). */
  ref: string;
  same: "roster" | "structure" | "noyau";
  bonus: number;
}

export interface MayhemRating {
  avg: number;
  links: MayhemLink[];
  linkBonus: number;
  /** Note d'équipe sur 100 : 90 % de la moyenne des cartes + liens. */
  rating: number;
}

export const mayhemLabel = (t: MayhemTeam) => `${t.org} ${t.year}`;
export const pickedPlayer = (p: MayhemPick) => MAYHEM_TEAM_BY_ID[p.t]?.players[p.i];

export function mayhemRating(picks: MayhemPicks): MayhemRating {
  const chosen = MAYHEM_ROLES.map((r) => (picks[r] ? { role: r, team: MAYHEM_TEAM_BY_ID[picks[r]!.t], player: pickedPlayer(picks[r]!) } : null));
  const links: MayhemLink[] = [];
  for (let a = 0; a < 5; a++) {
    for (let b = a + 1; b < 5; b++) {
      const pa = chosen[a];
      const pb = chosen[b];
      if (!pa || !pb) continue;
      const def = PAIRS[pa.role + "|" + pb.role];
      const w = def ? def[0] : 0;
      const roles: [MayhemRole, MayhemRole] = [pa.role, pb.role];
      const names = pa.player.name + " + " + pb.player.name;
      if (pa.team.id === pb.team.id) links.push({ roles, names, kind: def ? def[1] : "Même roster", ref: mayhemLabel(pa.team), same: "roster", bonus: w || 1 });
      else if (pa.team.org === pb.team.org && Math.floor(w / 2) > 0) links.push({ roles, names, kind: def![1], ref: pa.team.org, same: "structure", bonus: Math.floor(w / 2) });
    }
  }
  const counts: Record<string, number> = {};
  for (const c of chosen) if (c) counts[c.team.id] = (counts[c.team.id] ?? 0) + 1;
  for (const [id, n] of Object.entries(counts)) {
    if (n >= 3) links.push({ roles: null, names: mayhemLabel(MAYHEM_TEAM_BY_ID[id]), kind: "Noyau", ref: String(n), same: "noyau", bonus: n >= 4 ? 5 : 3 });
  }
  const ovrs = chosen.filter((c) => c).map((c) => c!.player.ovr);
  const avg = ovrs.length ? ovrs.reduce((s, x) => s + x, 0) / ovrs.length : 0;
  const linkBonus = Math.min(MAYHEM_LINK_CAP, links.reduce((s, l) => s + l.bonus, 0));
  return { avg, links, linkBonus, rating: ovrs.length ? Math.min(100, Math.round(avg * 0.9 + linkBonus)) : 0 };
}

/** Une équipe historique complète, notée comme une équipe draftée. */
export const rosterPicks = (t: MayhemTeam): MayhemPicks => Object.fromEntries(MAYHEM_ROLES.map((r, i) => [r, { t: t.id, i }]));

/** Pools de champions par poste (identifiants Data Dragon allégés) pour les matchs simulés. */
export const MAYHEM_CHAMPS: Record<MayhemRole, string[]> = {
  top: ["ksante", "jax", "aatrox", "gnar", "renekton", "rumble", "jayce"],
  jgl: ["leesin", "viego", "sejuani", "maokai", "xinzhao", "monkeyking", "jarvaniv"],
  mid: ["azir", "ahri", "orianna", "sylas", "taliyah", "corki", "leblanc"],
  adc: ["kaisa", "varus", "xayah", "aphelios", "zeri", "jinx", "ezreal"],
  sup: ["rakan", "nautilus", "alistar", "rell", "renata", "thresh", "braum"]
};

// --- Repères de la carte (en % de la minimap, coordonnées du jeu converties) --------------------
const X = (x: number) => +((x / 14870) * 100).toFixed(1);
const Y = (y: number) => +((1 - y / 14980) * 100).toFixed(1);
const P = (x: number, y: number): [number, number] => [X(x), Y(y)];

/** Côté bleu = équipe A (en bas à gauche), côté rouge = équipe B. */
export const RIFT = {
  baron: P(5007, 10471),
  dragon: P(9866, 4414),
  nexus: { a: P(1551, 1659), b: P(13276, 13265) },
  inhibs: { a: [P(1171, 3571), P(3203, 3208), P(3452, 1236)], b: [P(11261, 13676), P(11598, 11667), P(13604, 11316)] },
  /** Tours par voie, de l'extérieur vers la base : top, mid, bot ; puis les 2 tours du Nexus. */
  towers: {
    a: [P(981, 10441), P(1512, 6699), P(1169, 4287), P(5846, 6396), P(5048, 4812), P(3651, 3696), P(10504, 1029), P(6919, 1483), P(4281, 1253), P(1748, 2270), P(2177, 1807)],
    b: [P(4318, 13875), P(7943, 13411), P(10481, 13650), P(8955, 8510), P(9767, 10113), P(11134, 11207), P(13866, 4505), P(13327, 8226), P(13624, 10572), P(12611, 13084), P(13052, 12612)]
  },
  camps: [
    { at: P(3821, 8101), kind: "blue" },
    { at: P(2288, 8448), kind: "camp" },
    { at: P(3783, 6495), kind: "camp" },
    { at: P(6990, 5432), kind: "camp" },
    { at: P(7765, 4020), kind: "red" },
    { at: P(8394, 2641), kind: "camp" },
    { at: P(11131, 6990), kind: "blue" },
    { at: P(12703, 6443), kind: "camp" },
    { at: P(11008, 8387), kind: "camp" },
    { at: P(7852, 9471), kind: "camp" },
    { at: P(7101, 10856), kind: "red" },
    { at: P(6476, 12142), kind: "camp" },
    { at: P(4400, 9600), kind: "scuttle" },
    { at: P(10500, 5100), kind: "scuttle" }
  ] as { at: [number, number]; kind: "blue" | "red" | "camp" | "scuttle" }[],
  /** Position de départ de chaque poste (phase de lane). */
  lanes: {
    a: [[9, 30], P(3821, 8101), [44, 56], [78, 91.5], [74, 92.5]] as [number, number][],
    b: [[27, 8.5], P(11131, 6990), [56, 44], [91.5, 74], [92.5, 70]] as [number, number][]
  }
};

// --- Tournoi simulé (calculé par le serveur, rejoué par l'interface) ------------------------------

export interface MayhemEntrant {
  kind: "me" | "friend" | "histo";
  /** Joueur du site (moi ou un ami du groupe). */
  userId?: string;
  /** Équipe historique qui complète le tableau. */
  teamId?: string;
  picks: MayhemPicks;
  rating: number;
}

export type MayhemEventKind = "firstblood" | "kill" | "skirmish" | "teamfight" | "dragon" | "herald" | "tower" | "inhib" | "baron" | "nexus";

/** Action d'une partie. `a` = côté bleu, `b` = côté rouge ; les rôles sont des index 0 (top) à 4 (support). */
export interface MayhemEvent {
  t: number;
  kind: MayhemEventKind;
  side: "a" | "b";
  at: [number, number];
  /** Kills de chaque côté pendant l'action. */
  ka: number;
  kb: number;
  /** Auteur et victime principaux (kills). */
  killer?: number;
  victim?: number;
  who: { a: number[]; b: number[] };
  dead: { a: number[]; b: number[] };
}

export interface MayhemGame {
  /** Index des participants côté bleu et côté rouge. */
  blue: number;
  red: number;
  winner: number;
  duration: number;
  champs: { a: string[]; b: string[] };
  kda: { a: [number, number, number][]; b: [number, number, number][] };
  events: MayhemEvent[];
  /** Écart d'or (bleu − rouge) au fil de la partie. */
  gold: [number, number][];
}

export interface MayhemMatch {
  a: number;
  b: number;
  bo: number;
  wins: [number, number];
  winner: number;
  games: MayhemGame[];
}

export interface MayhemGroup {
  name: string;
  /** 4 participants ; chaque journée compte 2 matchs (Bo1), dans l'ordre. */
  members: number[];
  matches: MayhemMatch[];
  /** Classement final de la poule : les 2 premiers vont en quarts. */
  standings: number[];
}

export interface MayhemTournament {
  entrants: MayhemEntrant[];
  /** Phase de poules : 4 poules de 4, 3 journées. */
  groups: MayhemGroup[];
  /** Phase finale : quarts, demies, finale. */
  rounds: MayhemMatch[][];
  champion: number;
}

export const MAYHEM_ENTRANTS = 16;
export const MAYHEM_GROUP_DAYS = 3;

/** Victoires d'un participant sur tout le tournoi (poules comprises, 0 à 6). */
export const mayhemWins = (tour: MayhemTournament, idx: number) => [...tour.groups.flatMap((g) => g.matches), ...tour.rounds.flat()].filter((m) => m.winner === idx).length;

/** Bilan d'un participant dans sa poule, jusqu'à la journée `days` incluse. */
export function groupRecord(g: MayhemGroup, idx: number, days = MAYHEM_GROUP_DAYS) {
  const played = g.matches.slice(0, days * 2).filter((m) => m.a === idx || m.b === idx);
  const wins = played.filter((m) => m.winner === idx).length;
  return { wins, losses: played.length - wins };
}

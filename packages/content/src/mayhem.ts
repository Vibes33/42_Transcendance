// World Mayhem : rosters des Worlds 2020 à 2025, notes des cartes, liens d'équipe et repères de la
// Faille de l'invocateur. Partagé par le moteur (service jeux) et l'interface.
// Notes PROVISOIRES : selon le parcours de l'équipe aux Worlds ; à recalculer depuis les stats de
// l'année (Oracle's Elixir, gol.gg).
import { COMPS, CRESTS, ROSTERS } from "./mayhem.data";

export type MayhemRole = "top" | "jgl" | "mid" | "adc" | "sup";
export const MAYHEM_ROLES: MayhemRole[] = ["top", "jgl", "mid", "adc", "sup"];
export const MAYHEM_ROLE_LABEL: Record<MayhemRole, string> = { top: "Top", jgl: "Jungle", mid: "Mid", adc: "ADC", sup: "Support" };

/** Parcours de l'équipe aux Worlds : 1 champion, 2 finaliste, 3 demi-finale, 4 quart, 5 phase principale, 6 play-in. */
export type MayhemPlace = 1 | 2 | 3 | 4 | 5 | 6;
export const MAYHEM_PLACE_LABEL: Record<MayhemPlace, string> = { 1: "Champion", 2: "Finaliste", 3: "Demi-finale", 4: "Quart de finale", 5: "Phase principale", 6: "Play-in" };

export interface MayhemPlayer {
  name: string;
  role: MayhemRole;
  /** Note de la carte (stats de l'année + palmarès + parcours de l'équipe). */
  ovr: number;
}

export interface MayhemTeam {
  id: string;
  /** Structure (même organisation au fil des années, malgré ses changements de nom). */
  org: string;
  /** Nom de l'équipe cette année-là. */
  name: string;
  tag: string;
  year: number;
  place: MayhemPlace;
  color: string;
  /** Un joueur par poste, dans l'ordre top, jungle, mid, ADC, support. */
  players: MayhemPlayer[];
}

export const MAYHEM_TEAMS: MayhemTeam[] = ROSTERS.map(([id, org, name, tag, year, place, color, players]) => ({
  id,
  org,
  name,
  tag,
  year,
  place,
  color,
  players: players.map(([n, ovr], i) => ({ name: n, ovr, role: MAYHEM_ROLES[i] }))
}));
export const MAYHEM_TEAM_BY_ID: Record<string, MayhemTeam> = Object.fromEntries(MAYHEM_TEAMS.map((t) => [t.id, t]));

/** Écusson d'équipe : choisi par le joueur (nom modifiable), porté par les bots. */
export interface MayhemCrest {
  /** Identifiant de l'écusson (logo /mayhem/logos/<id>.png). */
  id: string;
  name: string;
  tag: string;
  color: string;
}
export const MAYHEM_CRESTS: MayhemCrest[] = CRESTS;
export const MAYHEM_CREST_BY_ID: Record<string, MayhemCrest> = Object.fromEntries(CRESTS.map((c) => [c.id, c]));
export const crestLogo = (id: string) => `/mayhem/logos/${id}.png`;
/** Nom d'équipe choisi par le joueur : 2 à 24 caractères. */
export const MAYHEM_NAME_MAX = 24;

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
  same: "roster" | "structure" | "noyau" | "passe" | "ecusson";
  bonus: number;
}

export interface MayhemRating {
  avg: number;
  links: MayhemLink[];
  linkBonus: number;
  /** Note d'équipe sur 100 : 90 % de la moyenne des cartes + liens. */
  rating: number;
}

export const mayhemLabel = (t: MayhemTeam) => `${t.name} ${t.year}`;
export const pickedPlayer = (p: MayhemPick) => MAYHEM_TEAM_BY_ID[p.t]?.players[p.i];

/** Rosters (saisons) où chaque joueur a joué, par nom : sert aux liens entre années différentes. */
const SEASONS_OF: Record<string, Set<string>> = {};
for (const t of MAYHEM_TEAMS) for (const p of t.players) (SEASONS_OF[p.name] ??= new Set()).add(t.id);
/** Saisons jouées ensemble par deux joueurs (Keria et Faker : T1 2022, 2023, 2024, 2025). */
const seasonsTogether = (a: string, b: string) => [...(SEASONS_OF[a] ?? [])].filter((id) => SEASONS_OF[b]?.has(id)).length;

const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** Structure d'un écusson (même nom que l'organisation, ex. « T1 »), ou null (Karmine Corp : aucun roster). */
const ORG_OF_CREST: Record<string, string> = Object.fromEntries(MAYHEM_TEAMS.map((t) => [slug(t.org), t.org]));
export const crestOrg = (crestId: string | null | undefined) => (crestId ? (ORG_OF_CREST[crestId] ?? null) : null);

/**
 * Note d'équipe. Liens : même roster (+ poids du duo), joueurs qui ont déjà joué ensemble une autre
 * année (léger bonus), même structure (moitié) ; noyau de 3 joueurs d'un même roster ; et, avec
 * l'écusson d'une structure, 3 joueurs ou plus de cette structure.
 */
export function mayhemRating(picks: MayhemPicks, crestId?: string | null): MayhemRating {
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
      else {
        // Déjà coéquipiers une autre année : léger bonus (moitié du poids du duo, au moins +1)
        const together = seasonsTogether(pa.player.name, pb.player.name);
        if (together > 0) links.push({ roles, names, kind: def ? def[1] : "Anciens coéquipiers", ref: String(together), same: "passe", bonus: Math.max(1, Math.floor(w / 2)) });
        else if (pa.team.org === pb.team.org && Math.floor(w / 2) > 0) links.push({ roles, names, kind: def![1], ref: pa.team.org, same: "structure", bonus: Math.floor(w / 2) });
      }
    }
  }
  const counts: Record<string, number> = {};
  for (const c of chosen) if (c) counts[c.team.id] = (counts[c.team.id] ?? 0) + 1;
  for (const [id, n] of Object.entries(counts)) {
    if (n >= 3) links.push({ roles: null, names: mayhemLabel(MAYHEM_TEAM_BY_ID[id]), kind: "Noyau", ref: String(n), same: "noyau", bonus: n >= 4 ? 5 : 3 });
  }
  // Écusson d'une structure : 3 joueurs ou plus de cette structure (toutes années) donnent un bonus d'équipe
  const org = crestOrg(crestId);
  if (org) {
    const n = chosen.filter((c) => c && c.team.org === org).length;
    if (n >= 3) links.push({ roles: null, names: org, kind: "Écusson", ref: String(n), same: "ecusson", bonus: n >= 4 ? 2 : 1 });
  }
  const ovrs = chosen.filter((c) => c).map((c) => c!.player.ovr);
  const avg = ovrs.length ? ovrs.reduce((s, x) => s + x, 0) / ovrs.length : 0;
  const linkBonus = Math.min(MAYHEM_LINK_CAP, links.reduce((s, l) => s + l.bonus, 0));
  return { avg, links, linkBonus, rating: ovrs.length ? Math.min(100, Math.round(avg * 0.9 + linkBonus)) : 0 };
}

/** Une équipe historique complète, notée comme une équipe draftée. */
export const rosterPicks = (t: MayhemTeam): MayhemPicks => Object.fromEntries(MAYHEM_ROLES.map((r, i) => [r, { t: t.id, i }]));

/** Compositions de vrais matchs des Worlds 2023-2025 : [bleu, rouge], champions de top à support. */
export const MAYHEM_COMPS: [string[], string[]][] = COMPS;

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
  /** « histo » : roster complet (anciens tournois) ; « bot » : équipe draftée par un bot. */
  kind: "me" | "friend" | "histo" | "bot";
  /** Écusson et nom affichés (le joueur choisit les siens, les bots portent ceux d'une vraie équipe). */
  crest?: MayhemCrest;
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

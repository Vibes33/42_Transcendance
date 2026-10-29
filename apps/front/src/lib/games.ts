import type { GameKey } from "@loltr/shared";

// Catalogue affiché sur la page « Tous les jeux » et dans la rotation du jour. Les jeux sans `key`
// ne sont pas encore jouables.

export interface GameCard {
  key: GameKey | null;
  name: string;
  /** Chibi mascotte du jeu (illustration de la carte). */
  img: string;
  tint: string;
  solo: boolean;
  multi: boolean;
  tags: string;
  desc: string;
  /** Sous-titre court dans la liste de la rotation du jour. */
  short?: string;
}

const art = (k: string) => `/img/chibis/${k}.jpg`;

export const GAME_CARDS: GameCard[] = [
  { key: "cdj", name: "Champion du jour", img: art("yasuo"), tint: "#A195FF", solo: true, multi: true, tags: "Défi du jour uniquement", short: "Devine le champion caché", desc: "Devine le champion caché : chaque essai compare genre, rôle, espèce, ressource, portée, région et année." },
  { key: "meli", name: "Méli-MéLoL", img: art("zoe"), tint: "#FF8AD1", solo: true, multi: true, tags: "Solo · Groupe jusqu’à 6", short: "4 sorts dans la grille", desc: "Trouve les 4 sorts du champion dans une grille de 25 icônes avant la fin du chrono : +5 s par champion complété." },
  { key: "portrait", name: "Portrait mystère", short: "Le champion décrit", img: art("syndra"), tint: "#B58CFF", solo: true, multi: true, tags: "Solo · Groupe jusqu’à 6", desc: "Devine le champion à partir de sa description, dévoilée ligne par ligne." },
  { key: "connexions", name: "Connexions visuelles", short: "4 liens cachés", img: art("jhin"), tint: "#F07C7C", solo: true, multi: true, tags: "Solo · Groupe jusqu’à 4", desc: "Regroupe les images qui partagent un lien caché : région, rôle, classe." },
  { key: "chaudfroid", name: "Chaud-Froid", short: "Réponses chiffrées", img: art("ashe"), tint: "#7FD8F2", solo: true, multi: true, tags: "Solo · Groupe jusqu’à 6", desc: "Questions à réponse chiffrée : plus tu es proche, plus tu marques de points." },
  { key: "codenames", name: "Codenames de la Faille", short: "Deux équipes, un indice", img: art("zed"), tint: "#FF8A70", solo: false, multi: true, tags: "Groupe de 4 à 6", desc: "Deux équipes, deux maîtres-espions, une grille de mots de Runeterra." },
  { key: "buildpath", name: "Build Path", short: "Les composants de l’objet", img: art("blitzcrank"), tint: "#F2C14E", solo: true, multi: true, tags: "Solo · Groupe jusqu’à 6", desc: "Reconstitue l’arbre de fabrication d’un objet, composant par composant." },
  { key: "devine", name: "Fais-moi deviner", short: "Sans dire le mot", img: art("sona"), tint: "#7FB8FF", solo: false, multi: true, tags: "Groupe de 2 à 6", desc: "Fais deviner un mot de l’univers LoL à ton équipier sans le prononcer." },
  { key: "mayhem", name: "World Mayhem", img: art("jinx"), tint: "#FF78B7", solo: true, multi: true, tags: "Solo · Groupe jusqu’à 6", short: "Draft et tournoi des Worlds", desc: "Compose une équipe de légende avec les joueurs des Worlds 2020 à 2025, puis mène-la dans un tournoi simulé, seul ou contre tes amis." },
  { key: "se", name: "Sorts éclair", img: art("lux"), tint: "#FFD76A", solo: true, multi: true, tags: "Solo · Groupe jusqu’à 6", short: "Contre la montre", desc: "Une icône de sort s’affiche : à qui appartient-elle ? Chaque bonne réponse ajoute 3 s au chrono de 30 s." },
  { key: "splash", name: "Splash mystère", img: art("ahri"), tint: "#FF9AA8", solo: true, multi: true, tags: "Solo · Groupe jusqu’à 6", short: "Le zoom se dévoile", desc: "Un splash art très zoomé se dévoile à chaque erreur. Bonus si tu reconnais aussi le skin." },
  { key: "qcm", name: "QCM de la Faille", short: "Quatre réponses", img: art("lulu"), tint: "#C9A2FF", solo: true, multi: true, tags: "Solo · Groupe jusqu’à 6", desc: "Quatre réponses, une seule bonne : lore, gameplay, esport." },
  { key: "parfait", name: "Champion parfait", short: "Duels de champions", img: art("seraphine"), tint: "#FF9AD5", solo: true, multi: false, tags: "Solo · Vote communautaire", desc: "Vote pour ton champion préféré et compare ton choix à celui des autres joueurs." },
  { key: "sudoku", name: "Sudoku LoL", short: "La grille du jour", img: art("vex"), tint: "#9A8BFF", solo: true, multi: false, tags: "Solo · Grille du jour", desc: "Un sudoku où les chiffres laissent place aux icônes de champions." },
  { key: null, name: "Jeu surprise", img: art("teemo"), tint: "#7EDC8A", solo: true, multi: true, tags: "Bientôt", desc: "Un nouveau jeu arrive bientôt dans la rotation." }
];

export const CARD_BY_KEY = Object.fromEntries(GAME_CARDS.filter((g) => g.key).map((g) => [g.key!, g])) as Record<GameKey, GameCard>;

/** Nom du jeu, accent sur la seconde partie (« Méli-MéLoL », « Sorts éclair »). */
export const GAME_TITLE: Record<GameKey, [string, string]> = {
  cdj: ["Champion", "du jour"],
  meli: ["Méli-", "MéLoL"],
  se: ["Sorts", "éclair"],
  splash: ["Splash", "mystère"],
  mayhem: ["World", "Mayhem"],
  portrait: ["Portrait", "mystère"],
  connexions: ["Connexions", "visuelles"],
  chaudfroid: ["Chaud", "-Froid"],
  codenames: ["Codenames", "de la Faille"],
  buildpath: ["Build", "Path"],
  devine: ["Fais-moi", "deviner"],
  qcm: ["QCM", "de la Faille"],
  parfait: ["Champion", "parfait"],
  sudoku: ["Sudoku", "LoL"]
};

// Jeu affiché par la roue de « Tous les jeux » : retrouvé en revenant d'une partie
const LAST_GAME = "loltr:jeux-carte";

export function rememberGame(index: number) {
  try {
    sessionStorage.setItem(LAST_GAME, String(index));
  } catch {
    /* stockage indisponible : la roue repart du jeu par défaut */
  }
}

export function rememberGameKey(key: GameKey) {
  const i = GAME_CARDS.findIndex((g) => g.key === key);
  if (i >= 0) rememberGame(i);
}

export function lastGameIndex(fallback: number): number {
  try {
    const i = Number(sessionStorage.getItem(LAST_GAME));
    return Number.isInteger(i) && i >= 0 && i < GAME_CARDS.length && sessionStorage.getItem(LAST_GAME) !== null ? i : fallback;
  } catch {
    return fallback;
  }
}

// Règles et valeurs du cahier des charges. Toute valeur marquée PROVISOIRE reste à trancher
// (section 17 du cahier des charges) : on la change ici, à un seul endroit.

export const GAME_KEYS = ["cdj", "meli", "se", "splash", "mayhem"] as const;
export type GameKey = (typeof GAME_KEYS)[number];

export type GameContext = "defi" | "classique" | "streamer";

/** Fiche de chaque jeu (contrat de jeu, section 7). */
export interface GameManifest {
  key: GameKey;
  modes: ("solo" | "groupe" | "streamer")[];
  minPlayers: number;
  maxPlayers: number;
  /** Peut être tiré dans la rotation du défi du jour. */
  dailyEligible: boolean;
  /** Toujours présent dans le défi du jour (Champion du jour). */
  alwaysInDaily: boolean;
  /** Jouable en mode classique (Champion du jour ne l'est pas). */
  classicPlayable: boolean;
}

export const GAMES: Record<GameKey, GameManifest> = {
  cdj: { key: "cdj", modes: ["solo", "groupe", "streamer"], minPlayers: 1, maxPlayers: 6, dailyEligible: true, alwaysInDaily: true, classicPlayable: false },
  meli: { key: "meli", modes: ["solo", "groupe", "streamer"], minPlayers: 1, maxPlayers: 6, dailyEligible: true, alwaysInDaily: false, classicPlayable: true },
  se: { key: "se", modes: ["solo", "groupe", "streamer"], minPlayers: 1, maxPlayers: 6, dailyEligible: true, alwaysInDaily: false, classicPlayable: true },
  splash: { key: "splash", modes: ["solo", "groupe", "streamer"], minPlayers: 1, maxPlayers: 6, dailyEligible: true, alwaysInDaily: false, classicPlayable: true },
  // World Mayhem : draft puis tournoi simulé, hors défi du jour (son classement est l'équipe du jour)
  mayhem: { key: "mayhem", modes: ["solo", "groupe"], minPlayers: 1, maxPlayers: 6, dailyEligible: false, alwaysInDaily: false, classicPlayable: true }
};

/** Nombre de jeux du défi du jour : Champion du jour + 3 tirés au hasard. */
export const DAILY_GAME_COUNT = 4;

// --- Points (section 8) -------------------------------------------------------------
/** Chaque jeu rapporte au plus 250 points : 100 si réussi, jusqu'à 150 selon le classement mondial. */
export const BASE_POINTS = 100;
export const MAX_BONUS_POINTS = 150;
/** Splash mystère : le champion vaut 70 des 100 points de base, le skin 30. */
export const SPLASH_CHAMPION_POINTS = 70;
export const SPLASH_SKIN_POINTS = 30;

/**
 * Paliers fixes qui répartissent les 150 points selon le percentile du joueur sur un jeu.
 * PROVISOIRE : valeurs à définir (section 17). `top` = part des meilleurs joueurs du jour.
 */
export const BONUS_TIERS: { top: number; points: number }[] = [
  { top: 0.01, points: 150 },
  { top: 0.05, points: 130 },
  { top: 0.1, points: 110 },
  { top: 0.25, points: 85 },
  { top: 0.5, points: 60 },
  { top: 0.75, points: 35 },
  { top: 1, points: 15 }
];

/** Seuils de réussite (100 points de base) et sens de la mesure de classement, par jeu. */
export const SUCCESS = {
  /** Champion du jour : le champion est trouvé. */
  cdj: { metric: "tries" as const, better: "lower" as const },
  /** Méli-MéLoL : plus de 10 champions complétés. */
  meli: { metric: "champions" as const, better: "higher" as const, moreThan: 10 },
  /** Sorts éclair : PROVISOIRE, seuil à définir (section 17). */
  se: { metric: "correct" as const, better: "higher" as const, atLeast: 12 },
  /** Splash mystère : champion 70 + skin 30 ; classé au nombre d'essais. */
  splash: { metric: "tries" as const, better: "lower" as const }
};

// --- Chronos et limites (section 6) -------------------------------------------------
export const CDJ_MAX_TRIES = 20;
export const CDJ_MAX_MS = 10 * 60_000;
export const MELI_START_MS = 30_000;
export const MELI_BONUS_MS = 5_000;
export const SE_START_MS = 30_000;
export const SE_BONUS_MS = 3_000;
/** Défloutage avant le départ du chrono (Méli-MéLoL et Sorts éclair). */
export const WARMUP_MS = 1_000;
/** Splash mystère : dézoom en 6 crans, un par erreur. */
export const SPLASH_SCALE = [3.2, 2.6, 2.1, 1.75, 1.45, 1.2, 1];
export const SPLASH_BLUR = [14, 10, 7, 4.5, 2.5, 1, 0];
/** Tolérance réseau sur les chronos validés par le serveur. */
export const TIMER_GRACE_MS = 1_500;

// --- Défi du jour (section 5) -------------------------------------------------------
/** Le jour change à 3 h, heure de Paris. */
export const DAY_TIMEZONE = "Europe/Paris";
export const DAY_CHANGE_HOUR = 3;
/** Un défi commencé la veille peut être fini jusqu'à 3 h 30. */
export const FORCE_CLOSE_MINUTES = 30;
export const GROUP_MAX = 6;

// --- Éclats (section 9) -------------------------------------------------------------
export const SHARDS = {
  seasonGlobal: [
    { top: 10, shards: 600 },
    { top: 100, shards: 350 },
    { top: 1_000, shards: 220 },
    { top: 10_000, shards: 180 }
  ],
  seasonGlobalParticipation: { minDays: 10, shards: 40 },
  seasonFriends: [120, 80, 50],
  seasonFriendsParticipation: 15,
  seasonFriendsMinActive: 4,
  per500Points: 10,
  dailyCompleted: 10,
  /** À confirmer (section 17) : bonus de 30 éclats pour un Champion du jour trouvé. */
  cdjFound: 30,
  weeklyBonus: { minDays: 5, shards: 50 }
};
/** Saisons de 4 semaines. */
export const SEASON_WEEKS = 4;
/** Lundi 3 h, heure de Paris, qui ouvre la saison 1. */
export const SEASON_EPOCH = "2026-09-07";

// --- Boutique (section 9) -----------------------------------------------------------
export const CLASSIC_UNLOCK_PRICE = 500;
/**
 * PROVISOIRE : finir le défi du jour débloque un jeu classique (le premier de la rotation pas encore
 * débloqué), et un second avec une bonne performance (au moins 3 jeux réussis sur 4).
 */
export const DAILY_UNLOCKS = { onCompleted: 1, bonus: 1, bonusMinSucceeded: 3 };
/** PROVISOIRE : prix des chibis et des skins à définir (section 17). */
export const PRICES = { chibi: 800, skin: 600, prestigeDefault: 2000 };

// --- Rangs (section 8) --------------------------------------------------------------
/** Paliers par percentile. Challenger, GM et Maître sont fixés ; le reste est PROVISOIRE. */
export const RANKS: { id: string; top: number }[] = [
  { id: "challenger", top: 0.01 },
  { id: "grandmaster", top: 0.03 },
  { id: "master", top: 0.06 },
  { id: "diamond", top: 0.12 },
  { id: "emerald", top: 0.22 },
  { id: "platinum", top: 0.35 },
  { id: "gold", top: 0.5 },
  { id: "silver", top: 0.7 },
  { id: "bronze", top: 1 }
];

export const SITE_LANGS = ["fr", "en"] as const;
export type SiteLang = (typeof SITE_LANGS)[number];

import { BASE_POINTS, BONUS_TIERS, RANKS, SPLASH_CHAMPION_POINTS, SPLASH_SKIN_POINTS, SUCCESS, type GameKey } from "./rules";

/** Résultat d'une manche du défi du jour, tel que le serveur l'a validé. */
export interface RoundResult {
  game: GameKey;
  /** Champion du jour et Splash : champion trouvé. Méli / Sorts éclair : non utilisé. */
  found?: boolean;
  /** Splash : skin trouvé. */
  skinFound?: boolean;
  /** Essais (Champion du jour, Splash). */
  tries?: number;
  /** Champions complétés (Méli-MéLoL). */
  champions?: number;
  /** Bonnes réponses (Sorts éclair). */
  correct?: number;
  /** Durée de la manche, pour départager. */
  durationMs: number;
}

/** Points de base (0 à 100) selon le seuil de réussite de chaque jeu. */
export function basePoints(r: RoundResult): number {
  switch (r.game) {
    case "cdj":
      return r.found ? BASE_POINTS : 0;
    case "meli":
      return (r.champions ?? 0) > SUCCESS.meli.moreThan ? BASE_POINTS : 0;
    case "se":
      return (r.correct ?? 0) >= SUCCESS.se.atLeast ? BASE_POINTS : 0;
    case "splash":
      return (r.found ? SPLASH_CHAMPION_POINTS : 0) + (r.found && r.skinFound ? SPLASH_SKIN_POINTS : 0);
  }
}

/** Le joueur a-t-il produit une performance classable (sinon pas de bonus de percentile) ? */
export function hasPerformance(r: RoundResult): boolean {
  switch (r.game) {
    case "cdj":
    case "splash":
      return !!r.found;
    case "meli":
      return (r.champions ?? 0) > 0;
    case "se":
      return (r.correct ?? 0) > 0;
  }
}

/** Ordre de classement d'un jeu : négatif si `a` est meilleur que `b`. */
export function compareResults(a: RoundResult, b: RoundResult): number {
  const pa = hasPerformance(a) ? 1 : 0;
  const pb = hasPerformance(b) ? 1 : 0;
  if (pa !== pb) return pb - pa;
  switch (a.game) {
    case "cdj":
      return (a.tries ?? 99) - (b.tries ?? 99) || a.durationMs - b.durationMs;
    case "splash":
      return Number(!!b.skinFound) - Number(!!a.skinFound) || (a.tries ?? 99) - (b.tries ?? 99) || a.durationMs - b.durationMs;
    case "meli":
      return (b.champions ?? 0) - (a.champions ?? 0);
    case "se":
      return (b.correct ?? 0) - (a.correct ?? 0);
  }
}

/** Part des meilleurs joueurs (0 < top ≤ 1) : rang / effectif, à égalité on prend le meilleur rang. */
export function topFraction<T extends RoundResult>(mine: T, all: T[]): number {
  if (all.length === 0) return 1;
  const better = all.filter((x) => compareResults(x, mine) < 0).length;
  return (better + 1) / all.length;
}

/** Points bonus (0 à 150) selon le palier de percentile. */
export function bonusPoints(top: number, performed: boolean): number {
  if (!performed) return 0;
  return (BONUS_TIERS.find((t) => top <= t.top) ?? BONUS_TIERS[BONUS_TIERS.length - 1]).points;
}

export interface RankInfo {
  id: string;
  /** Division 1 (meilleure) à 3 ; null pour Challenger, Grand Maître et Maître. */
  division: number | null;
}

/** Rang de Bronze à Challenger d'après la part des meilleurs joueurs de la saison. */
export function rankFor(top: number): RankInfo {
  let prev = 0;
  for (const r of RANKS) {
    if (top <= r.top) {
      if (["challenger", "grandmaster", "master"].includes(r.id)) return { id: r.id, division: null };
      const span = r.top - prev;
      const pos = (top - prev) / span;
      return { id: r.id, division: pos <= 1 / 3 ? 1 : pos <= 2 / 3 ? 2 : 3 };
    }
    prev = r.top;
  }
  return { id: "bronze", division: 3 };
}

import type { GameKey, RoundResult } from "@loltr/shared";
import { CHAMPIONS, CHAMPION_BY_ID, CDJ_POOL, type Champion } from "@loltr/content";
import { matchName } from "@loltr/shared";
import { HttpError } from "@loltr/shared/server";

// Contrat de jeu côté serveur (section 7 du cahier des charges) : chaque jeu génère sa manche,
// valide chaque action, décompte son chrono et calcule son résultat. Ajouter un jeu = écrire un
// nouveau moteur et l'enregistrer dans games/index.ts.

export interface CreateCtx {
  seed: string;
  now: number;
  /** Contenu déjà vu par le joueur (clés de contenu), à éviter. */
  seen: Set<string>;
  /** Partie de groupe (classique) : le jeu peut attendre le reste du groupe. */
  group?: boolean;
}

export interface ActOutcome<S> {
  state: S;
  /** Retour immédiat pour l'interface (bonne réponse, erreur…), sans jamais dévoiler la réponse. */
  feedback: Record<string, unknown>;
}

export interface GameEngine<S = any> {
  key: GameKey;
  create(ctx: CreateCtx): { state: S; contentKey: string };
  /** Ce que le joueur a le droit de voir. */
  publicState(state: S, now: number): Record<string, unknown>;
  act(state: S, action: Record<string, unknown>, now: number): ActOutcome<S>;
  isOver(state: S, now: number): boolean;
  /** Termine la manche (abandon ou fin de chrono). */
  finish(state: S, now: number): S;
  result(state: S, now: number): RoundResult;
  reveal(state: S): Record<string, unknown>;
  /** Avancement public pour le classement en direct et le panneau de groupe. */
  progress(state: S, now: number): { tries?: number; score?: number; leftMs?: number; step?: number; found?: boolean; colors?: string };
  /** Images à servir par le proxy (leurs URL d'origine trahiraient la réponse). */
  image?(state: S, slot: string): string | null;
  timers?(state: S): { endsAt: number | null; warmUntil: number | null };
}

/** Action refusée par un jeu (409) : passe par le format d'erreur commun des services. */
export class GameError extends HttpError {
  constructor(code: string, message?: string) {
    super(409, code, message);
  }
}

/** Résout une réponse : un identifiant de champion (autocomplétion) ou un texte libre (tolérant). */
export function resolveChampion(action: Record<string, unknown>, pool: Champion[] = CHAMPIONS): Champion {
  if (typeof action.champion === "string") {
    const c = CHAMPION_BY_ID[action.champion];
    if (c && pool.includes(c)) return c;
  }
  if (typeof action.text === "string") {
    const m = matchName(action.text, pool.map((c) => ({ id: c.id, names: c.matchNames })));
    if (m) return CHAMPION_BY_ID[m.id];
  }
  throw new GameError("unknown_champion", "Champion inconnu.");
}

export { CDJ_POOL };

import { PARFAIT_CHAMPIONS, rng, shuffle } from "@loltr/shared";
import { CHAMPIONS } from "@loltr/content";
import { GameError, type GameEngine } from "./engine";

// Champion parfait : 16 champions en tournoi à élimination directe (15 duels). Le dernier debout
// est le champion parfait du joueur ; les votes de tous forment le classement de la communauté.

interface S {
  seed: string;
  /** Champions encore en lice, dans l'ordre des duels du tour en cours. */
  alive: string[];
  /** Vainqueurs du tour en cours. */
  next: string[];
  duel: number;
  /** Duels joués (gagnant puis perdant), pour l'historique. */
  log: [string, string][];
  startedAt: number;
  endedAt: number | null;
}

const ROUND_NAMES = ["Huitièmes", "Quarts", "Demies", "Finale"];

export const parfait: GameEngine<S> = {
  key: "parfait",
  create({ seed, now, seen }) {
    const fresh = CHAMPIONS.filter((c) => !seen.has(c.id));
    const pool = fresh.length >= PARFAIT_CHAMPIONS ? fresh : CHAMPIONS;
    const alive = shuffle(pool, rng(seed + ":parfait")).slice(0, PARFAIT_CHAMPIONS).map((c) => c.id);
    return { state: { seed, alive, next: [], duel: 0, log: [], startedAt: now, endedAt: null }, contentKey: alive[0] };
  },
  publicState(s, now) {
    const done = s.log.length;
    const stage = Math.round(Math.log2(PARFAIT_CHAMPIONS / s.alive.length));
    return {
      pair: this.isOver(s, now) ? null : [s.alive[s.duel * 2], s.alive[s.duel * 2 + 1]],
      duel: done + 1,
      total: PARFAIT_CHAMPIONS - 1,
      stage: ROUND_NAMES[Math.min(stage, ROUND_NAMES.length - 1)],
      winner: this.isOver(s, now) && s.alive.length === 1 ? s.alive[0] : null,
      finalist: this.isOver(s, now) ? (s.log[s.log.length - 1]?.[1] ?? null) : null,
      log: s.log,
      over: this.isOver(s, now)
    };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "Le tournoi est terminé.");
    if (action.type !== "pick") throw new GameError("bad_action");
    const a = s.alive[s.duel * 2];
    const b = s.alive[s.duel * 2 + 1];
    // « Je n'arrive pas à choisir » : tirage au sort, toujours le même pour un même duel
    const win = action.champion === a || action.champion === b ? String(action.champion) : rng(s.seed + ":skip:" + s.log.length)() < 0.5 ? a : b;
    const lose = win === a ? b : a;
    const next = [...s.next, win];
    const log: [string, string][] = [...s.log, [win, lose]];
    if (s.duel * 2 + 2 < s.alive.length) return { state: { ...s, next, duel: s.duel + 1, log }, feedback: {} };
    // Tour terminé : les vainqueurs repartent pour le tour suivant
    if (next.length === 1) return { state: { ...s, alive: next, next: [], duel: 0, log, endedAt: now }, feedback: { winner: win } };
    return { state: { ...s, alive: next, next: [], duel: 0, log }, feedback: {} };
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: now };
  },
  result(s, now) {
    return { game: "parfait", winner: s.endedAt && s.alive.length === 1 ? s.alive[0] : undefined, durationMs: (s.endedAt ?? now) - s.startedAt };
  },
  reveal(s) {
    return { log: s.log };
  },
  progress(s) {
    return { step: s.log.length };
  }
};

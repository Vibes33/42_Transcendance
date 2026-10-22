import { CDJ_MAX_MS, CDJ_MAX_TRIES, pick, rng } from "@loltr/shared";
import { CHAMPION_BY_ID, CDJ_POOL, type ChampionAttributes } from "@loltr/content";
import { GameError, resolveChampion, type GameEngine } from "./engine";

// Champion du jour : deviner le champion caché ; chaque essai compare 7 attributs.
// Limite : 20 essais ou 10 minutes. Réussi = champion trouvé.

export type Code = "g" | "p" | "r" | "u" | "d";
export const COLUMNS = ["gender", "positions", "species", "resource", "range", "regions", "year"] as const;

interface S {
  target: string;
  guesses: string[];
  startedAt: number;
  endedAt: number | null;
}

const arr = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);

/** Compare un essai à la cible : correct (g), partiel (p), incorrect (r), sorti plus tard (u) / plus tôt (d). */
export function compare(guess: ChampionAttributes, target: ChampionAttributes): Code[] {
  return COLUMNS.map((col) => {
    if (col === "year") return guess.year === target.year ? "g" : target.year > guess.year ? "u" : "d";
    const a = arr(guess[col] as string | string[]);
    const b = arr(target[col] as string | string[]);
    if (a.length === b.length && a.every((x) => b.includes(x))) return "g";
    return a.some((x) => b.includes(x)) ? "p" : "r";
  });
}

const found = (s: S) => s.guesses.includes(s.target);

export const cdj: GameEngine<S> = {
  key: "cdj",
  create({ seed, now, seen }) {
    const r = rng(seed);
    const pool = CDJ_POOL.filter((c) => !seen.has(c.id));
    const target = pick(pool.length ? pool : CDJ_POOL, r).id;
    return { state: { target, guesses: [], startedAt: now, endedAt: null }, contentKey: target };
  },
  publicState(s, now) {
    const t = CHAMPION_BY_ID[s.target].attributes!;
    return {
      guesses: s.guesses.map((g) => ({ champion: g, codes: compare(CHAMPION_BY_ID[g].attributes!, t) })),
      tries: s.guesses.length,
      maxTries: CDJ_MAX_TRIES,
      deadline: s.startedAt + CDJ_MAX_MS,
      found: found(s),
      over: this.isOver(s, now)
    };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "La manche est terminée.");
    if (action.type !== "guess") throw new GameError("bad_action");
    const c = resolveChampion(action, CDJ_POOL);
    if (s.guesses.includes(c.id)) throw new GameError("already_guessed", "Déjà proposé.");
    const next = { ...s, guesses: [...s.guesses, c.id] };
    const codes = compare(c.attributes!, CHAMPION_BY_ID[s.target].attributes!);
    if (c.id === s.target || next.guesses.length >= CDJ_MAX_TRIES) next.endedAt = now;
    return { state: next, feedback: { champion: c.id, codes, correct: c.id === s.target } };
  },
  isOver(s, now) {
    return s.endedAt !== null || found(s) || s.guesses.length >= CDJ_MAX_TRIES || now >= s.startedAt + CDJ_MAX_MS;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: Math.min(now, s.startedAt + CDJ_MAX_MS) };
  },
  result(s, now) {
    return { game: "cdj", found: found(s), tries: s.guesses.length, durationMs: (s.endedAt ?? now) - s.startedAt };
  },
  reveal(s) {
    return { target: s.target };
  },
  progress(s) {
    const last = s.guesses[s.guesses.length - 1];
    return {
      tries: s.guesses.length,
      found: found(s),
      colors: last ? compare(CHAMPION_BY_ID[last].attributes!, CHAMPION_BY_ID[s.target].attributes!).join("") : ""
    };
  },
  timers(s) {
    return { endsAt: s.startedAt + CDJ_MAX_MS, warmUntil: null };
  }
};

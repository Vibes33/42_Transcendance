import { MELI_BONUS_MS, MELI_START_MS, TIMER_GRACE_MS, WARMUP_MS, pick, rng, shuffle } from "@loltr/shared";
import { CHAMPIONS, CHAMPION_BY_ID, img } from "@loltr/content";
import { GameError, type GameEngine } from "./engine";

// Méli-MéLoL : retrouver 4 sorts du champion dans une grille de 25 icônes.
// Chrono 30 s, +5 s par champion complété ; une erreur fait trembler la case, sans pénalité.

interface Board {
  target: string;
  /** Références « champion:emplacement » des 25 cases. */
  tiles: string[];
  goal: number[];
}

interface S {
  seed: string;
  round: number;
  board: Board;
  found: number[];
  champions: number;
  history: string[];
  startedAt: number;
  warmUntil: number;
  endsAt: number;
  endedAt: number | null;
}

const SLOTS = ["P", "Q", "W", "E", "R"] as const;

function makeBoard(seed: string, round: number, avoid: Set<string>): Board {
  const r = rng(seed + ":" + round);
  const pool = CHAMPIONS.filter((c) => !avoid.has(c.id));
  const target = pick(pool.length ? pool : CHAMPIONS, r);
  const drop = Math.floor(r() * 5);
  const goalRefs = SLOTS.filter((_, i) => i !== drop).map((s) => target.id + ":" + s);
  const others = shuffle(
    CHAMPIONS.filter((c) => c.id !== target.id).flatMap((c) => SLOTS.map((s) => c.id + ":" + s)),
    r
  ).slice(0, 21);
  const tiles = shuffle([...goalRefs, ...others], r);
  return { target: target.id, tiles, goal: goalRefs.map((g) => tiles.indexOf(g)) };
}

export const meli: GameEngine<S> = {
  key: "meli",
  create({ seed, now, seen }) {
    const board = makeBoard(seed, 0, seen);
    return {
      state: { seed, round: 0, board, found: [], champions: 0, history: [], startedAt: now, warmUntil: now + WARMUP_MS, endsAt: now + WARMUP_MS + MELI_START_MS, endedAt: null },
      contentKey: board.target
    };
  },
  publicState(s, now) {
    return {
      target: s.board.target,
      tileCount: s.board.tiles.length,
      round: s.round,
      found: s.found,
      champions: s.champions,
      history: s.history,
      endsAt: s.endsAt,
      warmUntil: s.warmUntil,
      over: this.isOver(s, now)
    };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "Temps écoulé.");
    if (now < s.warmUntil - 200) throw new GameError("warming");
    if (action.type !== "click" || typeof action.tile !== "number") throw new GameError("bad_action");
    const tile = action.tile;
    if (tile < 0 || tile >= s.board.tiles.length) throw new GameError("bad_tile");
    if (s.found.includes(tile)) return { state: s, feedback: { already: true } };
    if (!s.board.goal.includes(tile)) return { state: s, feedback: { wrong: tile } };
    const found = [...s.found, tile];
    if (found.length < 4) return { state: { ...s, found }, feedback: { good: tile } };
    // Champion complété : +5 s et nouvelle grille
    const history = [...s.history, s.board.target];
    const round = s.round + 1;
    const next: S = { ...s, round, found: [], champions: s.champions + 1, history, board: makeBoard(s.seed, round, new Set(history)), endsAt: s.endsAt + MELI_BONUS_MS };
    return { state: next, feedback: { good: tile, completed: s.board.target, bonusMs: MELI_BONUS_MS } };
  },
  isOver(s, now) {
    return s.endedAt !== null || now > s.endsAt + TIMER_GRACE_MS;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: Math.min(now, s.endsAt) };
  },
  result(s, now) {
    return { game: "meli", champions: s.champions, durationMs: (s.endedAt ?? Math.min(now, s.endsAt)) - s.warmUntil };
  },
  reveal(s) {
    return { target: s.board.target, goal: s.board.goal, tiles: s.board.tiles };
  },
  progress(s, now) {
    return { score: s.champions, leftMs: Math.max(0, s.endsAt - now) };
  },
  image(s, slot) {
    const i = Number(slot);
    const ref = s.board.tiles[i];
    if (!ref) return null;
    const [champ, sl] = ref.split(":");
    const sp = CHAMPION_BY_ID[champ]?.spells.find((x) => x.slot === sl);
    return sp ? img.spell(sp) : null;
  },
  timers(s) {
    return { endsAt: s.endsAt, warmUntil: s.warmUntil };
  }
};

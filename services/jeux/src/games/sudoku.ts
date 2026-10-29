import { SUDOKU_MAX_ERRORS, rng, shuffle } from "@loltr/shared";
import { CDJ_POOL, CHAMPION_BY_ID, img } from "@loltr/content";
import { GameError, type GameEngine } from "./engine";

// Sudoku LoL : grille 6 × 6 (blocs de 2 × 3) où 6 champions remplacent les chiffres. La grille est
// celle du jour, la même pour tout le monde ; 3 erreurs permises, classement au temps.

interface S {
  seed: string;
  day: string;
  champions: string[];
  solution: number[];
  /** Cases données (-1 : vide au départ). */
  given: number[];
  grid: number[];
  errors: number;
  startedAt: number;
  endedAt: number | null;
}

const N = 6;

/** Grille résolue : un motif de base, mélangé (symboles, lignes dans leur bande, bandes, colonnes, piles). */
function solved(r: () => number): number[] {
  const base = (row: number, col: number) => ((row % 2) * 3 + Math.floor(row / 2) + col) % N;
  const syms = shuffle([0, 1, 2, 3, 4, 5], r);
  const bands = shuffle([0, 1, 2], r);
  const rows = bands.flatMap((b) => shuffle([0, 1], r).map((x) => b * 2 + x));
  const stacks = shuffle([0, 1], r);
  const cols = stacks.flatMap((st) => shuffle([0, 1, 2], r).map((x) => st * 3 + x));
  const g: number[] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) g.push(syms[base(rows[i], cols[j])]);
  return g;
}

/** Nombre de solutions (arrêté à 2), pour garder une grille à solution unique. */
function countSolutions(g: number[], limit = 2): number {
  const i = g.indexOf(-1);
  if (i < 0) return 1;
  const row = Math.floor(i / N);
  const col = i % N;
  let n = 0;
  for (let v = 0; v < N && n < limit; v++) {
    if (!allowed(g, row, col, v)) continue;
    g[i] = v;
    n += countSolutions(g, limit - n);
    g[i] = -1;
  }
  return n;
}

function allowed(g: number[], row: number, col: number, v: number) {
  for (let k = 0; k < N; k++) if (g[row * N + k] === v || g[k * N + col] === v) return false;
  const r0 = Math.floor(row / 2) * 2;
  const c0 = Math.floor(col / 3) * 3;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) if (g[(r0 + a) * N + c0 + b] === v) return false;
  return true;
}

/** Grille du jour : on retire des cases tant que la solution reste unique. */
export function sudokuOfDay(day: string) {
  const r = rng("sudoku:" + day);
  const solution = solved(r);
  const given = [...solution];
  for (const i of shuffle([...Array(N * N).keys()], r)) {
    const keep = given[i];
    given[i] = -1;
    if (countSolutions([...given]) !== 1) given[i] = keep;
    if (given.filter((x) => x >= 0).length <= 12) break;
  }
  const champions = shuffle(CDJ_POOL, r).slice(0, N).map((c) => c.id);
  return { solution, given, champions };
}

export const sudoku: GameEngine<S> = {
  key: "sudoku",
  create({ seed, now }) {
    // La graine porte le jour (« sudoku:AAAA-MM-JJ ») : tout le monde a la même grille
    const day = seed.startsWith("sudoku:") ? seed.slice(7) : new Date(now).toISOString().slice(0, 10);
    const { solution, given, champions } = sudokuOfDay(day);
    return { state: { seed, day, champions, solution, given, grid: [...given], errors: 0, startedAt: now, endedAt: null }, contentKey: "sudoku:" + day };
  },
  publicState(s, now) {
    return {
      day: s.day,
      champions: s.champions.map((id) => ({ id, image: img.square(CHAMPION_BY_ID[id]) })),
      given: s.given.map((v) => v >= 0),
      grid: s.grid,
      errors: s.errors,
      maxErrors: SUDOKU_MAX_ERRORS,
      solved: s.grid.every((v, i) => v === s.solution[i]),
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      // Grille ratée : la solution se dévoile
      solution: this.isOver(s, now) ? s.solution : null,
      over: this.isOver(s, now)
    };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "La grille est terminée.");
    if (action.type !== "place") throw new GameError("bad_action");
    const cell = Number(action.cell);
    const v = Number(action.value);
    if (!Number.isInteger(cell) || cell < 0 || cell >= N * N || s.given[cell] >= 0) throw new GameError("bad_cell");
    if (!Number.isInteger(v) || v < 0 || v >= N) throw new GameError("bad_value");
    if (s.grid[cell] === s.solution[cell]) throw new GameError("already_filled");
    if (s.solution[cell] !== v) {
      const errors = s.errors + 1;
      return { state: { ...s, errors, endedAt: errors >= SUDOKU_MAX_ERRORS ? now : null }, feedback: { wrong: cell } };
    }
    const grid = s.grid.map((x, i) => (i === cell ? v : x));
    const solvedNow = grid.every((x, i) => x === s.solution[i]);
    return { state: { ...s, grid, endedAt: solvedNow ? now : null }, feedback: { correct: cell } };
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: now };
  },
  result(s, now) {
    return { game: "sudoku", solved: s.grid.every((v, i) => v === s.solution[i]), tries: s.errors, durationMs: (s.endedAt ?? now) - s.startedAt };
  },
  reveal(s) {
    return { solution: s.solution };
  },
  progress(s) {
    return { step: s.grid.filter((v) => v >= 0).length, tries: s.errors };
  }
};

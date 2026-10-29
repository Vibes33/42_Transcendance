import { CODENAMES_TURN_MS, DEVINE_TURN_MS, matchName, rng, shuffle, type GameKey } from "@loltr/shared";
import { CODENAMES_WORDS, DEVINE_WORDS, type Lang } from "@loltr/content";
import { GameError, type GameEngine } from "./engine";

// Jeux de groupe à plateau partagé : Codenames de la Faille et Fais-moi deviner. Tout le groupe
// joue sur un seul état (table `parties`) ; chaque joueur garde aussi sa manche, close quand la
// partie se termine, avec son score. L'interface relit l'état partagé toutes les secondes.

export interface PartyGame<S> {
  key: GameKey;
  minPlayers: number;
  create(seed: string, members: string[], now: number): S;
  /** Ce qu'un joueur voit (le maître-espion voit les couleurs, celui qui fait deviner voit le mot…). */
  view(s: S, userId: string, now: number): Record<string, unknown>;
  act(s: S, userId: string, action: Record<string, unknown>, now: number): S;
  /** Avance l'état avec le temps (fin de tour). */
  tick(s: S, now: number): S;
  isOver(s: S): boolean;
  scoreOf(s: S, userId: string): number;
}

type T = Record<Lang, string>;
const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();

// --- Codenames de la Faille ------------------------------------------------------------

type Team = "a" | "b";
type Color = Team | "n" | "x";

export interface CodenamesState {
  teams: Record<Team, string[]>;
  spy: Record<Team, string>;
  words: T[];
  key: Color[];
  revealed: boolean[];
  turn: Team;
  phase: "clue" | "guess";
  clue: { word: string; n: number } | null;
  guessesLeft: number;
  turnEndsAt: number;
  winner: Team | null;
  log: { team: Team; clue: string; n: number; found: string[] }[];
  endedAt: number | null;
}

const other = (t: Team): Team => (t === "a" ? "b" : "a");

export const codenamesParty: PartyGame<CodenamesState> = {
  key: "codenames",
  minPlayers: 4,
  create(seed, members, now) {
    const r = rng(seed + ":codenames");
    const order = shuffle(members, r);
    const teams: Record<Team, string[]> = { a: order.filter((_, i) => i % 2 === 0), b: order.filter((_, i) => i % 2 === 1) };
    const words = shuffle(CODENAMES_WORDS, r).slice(0, 25);
    // L'équipe bleue commence et a une carte de plus
    const key = shuffle<Color>([...Array(9).fill("a"), ...Array(8).fill("b"), ...Array(7).fill("n"), "x"], r);
    return { teams, spy: { a: teams.a[0], b: teams.b[0] }, words, key, revealed: Array(25).fill(false), turn: "a", phase: "clue", clue: null, guessesLeft: 0, turnEndsAt: now + CODENAMES_TURN_MS, winner: null, log: [], endedAt: null };
  },
  view(s, userId) {
    const team: Team | null = s.teams.a.includes(userId) ? "a" : s.teams.b.includes(userId) ? "b" : null;
    const isSpy = team !== null && s.spy[team] === userId;
    const over = s.endedAt !== null;
    return {
      teams: s.teams,
      spy: s.spy,
      me: { team, spy: isSpy },
      cards: s.words.map((word, i) => ({ word, revealed: s.revealed[i], color: s.revealed[i] || isSpy || over ? s.key[i] : null })),
      left: { a: s.key.filter((c, i) => c === "a" && !s.revealed[i]).length, b: s.key.filter((c, i) => c === "b" && !s.revealed[i]).length },
      turn: s.turn,
      phase: s.phase,
      clue: s.clue,
      guessesLeft: s.guessesLeft,
      turnEndsAt: s.turnEndsAt,
      winner: s.winner,
      log: s.log,
      over
    };
  },
  act(s, userId, action, now) {
    if (s.endedAt) throw new GameError("round_over", "La partie est terminée.");
    const team = s.teams.a.includes(userId) ? "a" : s.teams.b.includes(userId) ? "b" : null;
    if (team !== s.turn) throw new GameError("not_your_turn", "Ce n'est pas le tour de ton équipe.");
    const isSpy = s.spy[team] === userId;
    if (action.type === "clue") {
      if (!isSpy || s.phase !== "clue") throw new GameError("not_your_turn", "C'est au maître-espion de donner l'indice.");
      const word = String(action.word ?? "").trim().slice(0, 30);
      const n = Math.round(Number(action.n));
      if (!word || /\s/.test(word)) throw new GameError("bad_clue", "Un seul mot, sans espace.");
      if (!Number.isInteger(n) || n < 1 || n > 9) throw new GameError("bad_clue", "Indique entre 1 et 9 cartes.");
      if (s.words.some((w, i) => !s.revealed[i] && (norm(w.fr) === norm(word) || norm(w.en) === norm(word)))) throw new GameError("bad_clue", "L'indice ne peut pas être un mot de la grille.");
      return { ...s, phase: "guess", clue: { word, n }, guessesLeft: n + 1, turnEndsAt: now + CODENAMES_TURN_MS, log: [...s.log, { team, clue: word, n, found: [] }] };
    }
    if (isSpy || s.phase !== "guess") throw new GameError("not_your_turn", "Attends l'indice de ton maître-espion.");
    if (action.type === "pass") return endTurn(s, now);
    if (action.type !== "guess") throw new GameError("bad_action");
    const i = Number(action.card);
    if (!Number.isInteger(i) || i < 0 || i >= 25 || s.revealed[i]) throw new GameError("bad_card");
    const revealed = s.revealed.map((x, j) => x || j === i);
    const color = s.key[i];
    const log = s.log.map((l, j) => (j === s.log.length - 1 ? { ...l, found: [...l.found, s.words[i].fr] } : l));
    const next: CodenamesState = { ...s, revealed, log };
    if (color === "x") return { ...next, winner: other(team), endedAt: now };
    const remaining = (t: Team) => s.key.filter((c, j) => c === t && !revealed[j]).length;
    if (remaining("a") === 0) return { ...next, winner: "a", endedAt: now };
    if (remaining("b") === 0) return { ...next, winner: "b", endedAt: now };
    if (color !== team) return endTurn(next, now);
    const guessesLeft = s.guessesLeft - 1;
    return guessesLeft <= 0 ? endTurn(next, now) : { ...next, guessesLeft };
  },
  tick(s, now) {
    return !s.endedAt && now > s.turnEndsAt ? endTurn(s, now) : s;
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  scoreOf(s, userId) {
    const team = s.teams.a.includes(userId) ? "a" : "b";
    return s.winner === team ? 100 : 0;
  }
};

function endTurn(s: CodenamesState, now: number): CodenamesState {
  return { ...s, turn: other(s.turn), phase: "clue", clue: null, guessesLeft: 0, turnEndsAt: now + CODENAMES_TURN_MS };
}

// --- Fais-moi deviner ------------------------------------------------------------------

export interface DevineState {
  /** Équipes de deux (une équipe de trois si le groupe est impair). */
  teams: string[][];
  points: number[];
  /** Ordre des tours : [équipe, joueur qui fait deviner]. */
  turns: [number, string][];
  t: number;
  words: number[];
  w: number;
  turnEndsAt: number;
  feed: { by: string; text: string; kind: "clue" | "guess" | "found" | "skip" }[];
  found: string[];
  endedAt: number | null;
}

export const devineParty: PartyGame<DevineState> = {
  key: "devine",
  minPlayers: 2,
  create(seed, members, now) {
    const r = rng(seed + ":devine");
    const order = shuffle(members, r);
    const teams: string[][] = [];
    for (let i = 0; i < order.length; i += 2) teams.push(order.slice(i, i + 2));
    if (teams.length > 1 && teams[teams.length - 1].length === 1) teams[teams.length - 2].push(teams.pop()![0]);
    // Chaque joueur fait deviner une fois, les équipes alternent
    const turns: [number, string][] = [];
    const most = Math.max(...teams.map((t) => t.length));
    for (let k = 0; k < most; k++) teams.forEach((t, ti) => t[k] && turns.push([ti, t[k]]));
    const words = shuffle([...DEVINE_WORDS.keys()], r);
    return { teams, points: teams.map(() => 0), turns, t: 0, words, w: 0, turnEndsAt: now + DEVINE_TURN_MS, feed: [], found: [], endedAt: null };
  },
  view(s, userId, now) {
    const [team, teller] = s.turns[s.t] ?? [0, ""];
    const mine = s.teams.findIndex((t) => t.includes(userId));
    const role = s.endedAt ? "fin" : userId === teller ? "conteur" : mine === team ? "devin" : "spectateur";
    const word = DEVINE_WORDS[s.words[s.w % s.words.length]];
    // Celui qui devine ne voit que la longueur du mot ; les autres le voient
    return {
      teams: s.teams,
      points: s.points,
      turn: { n: s.t + 1, total: s.turns.length, team, teller },
      role,
      word: role === "devin" ? null : word,
      mask: { fr: word.fr.word.replace(/[^\s'-]/g, "_"), en: word.en.word.replace(/[^\s'-]/g, "_") },
      turnEndsAt: s.turnEndsAt,
      feed: s.feed.slice(-14),
      found: s.found,
      over: s.endedAt !== null,
      now
    };
  },
  act(s, userId, action, now) {
    if (s.endedAt) throw new GameError("round_over", "La partie est terminée.");
    const [team, teller] = s.turns[s.t];
    const word = DEVINE_WORDS[s.words[s.w % s.words.length]];
    const text = String(action.text ?? "").trim().slice(0, 120);
    if (action.type === "clue" || action.type === "skip") {
      if (userId !== teller) throw new GameError("not_your_turn", "Ce n'est pas à toi de faire deviner.");
      if (action.type === "skip") return { ...s, w: s.w + 1, points: s.points.map((p, i) => (i === team ? Math.max(0, p - 1) : p)), feed: [...s.feed, { by: userId, text: "", kind: "skip" }] };
      if (!text) throw new GameError("empty");
      // Mots interdits et mot à deviner bloqués, dans les deux langues
      const tokens = norm(text).split(/\s+/);
      const banned = [...word.fr.banned, ...word.en.banned, ...word.fr.word.split(/\s+/), ...word.en.word.split(/\s+/)].map(norm).filter((x) => x.length > 1);
      const hit = banned.find((b) => (b.includes(" ") ? norm(text).includes(b) : tokens.includes(b)));
      if (hit) throw new GameError("banned_word", "Mot interdit dans ton indice.");
      return { ...s, feed: [...s.feed, { by: userId, text, kind: "clue" }] };
    }
    if (action.type !== "guess") throw new GameError("bad_action");
    if (!s.teams[team].includes(userId) || userId === teller) throw new GameError("not_your_turn", "Seul ton équipier peut deviner.");
    if (!text) throw new GameError("empty");
    const ok = [word.fr.word, word.en.word].some((x) => matchName(text, [{ id: "w", names: [x] }]));
    if (!ok) return { ...s, feed: [...s.feed, { by: userId, text, kind: "guess" }] };
    return { ...s, w: s.w + 1, points: s.points.map((p, i) => (i === team ? p + 1 : p)), found: [...s.found, word.fr.word], feed: [...s.feed, { by: userId, text, kind: "found" }] };
  },
  tick(s, now) {
    if (s.endedAt || now <= s.turnEndsAt) return s;
    const t = s.t + 1;
    if (t >= s.turns.length) return { ...s, endedAt: now };
    return { ...s, t, w: s.w + 1, turnEndsAt: now + DEVINE_TURN_MS, feed: [] };
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  scoreOf(s, userId) {
    const i = s.teams.findIndex((t) => t.includes(userId));
    return i >= 0 ? s.points[i] * 100 : 0;
  }
};

export const PARTIES: Partial<Record<GameKey, PartyGame<any>>> = { codenames: codenamesParty, devine: devineParty };

// Manche individuelle d'un jeu de groupe : elle ne fait que pointer vers la partie partagée.
interface RoundS {
  partyId: string;
  score: number | null;
  startedAt: number;
  endedAt: number | null;
}

function partyRound(key: GameKey): GameEngine<RoundS> {
  return {
    key,
    create({ seed, now }) {
      return { state: { partyId: seed, score: null, startedAt: now, endedAt: null }, contentKey: seed };
    },
    publicState(s, now) {
      return { partyId: s.partyId, score: s.score, over: this.isOver(s, now) };
    },
    act() {
      throw new GameError("bad_action", "Ce jeu se joue sur le plateau du groupe.");
    },
    isOver(s) {
      return s.endedAt !== null;
    },
    finish(s, now) {
      return s.endedAt ? s : { ...s, endedAt: now };
    },
    result(s, now) {
      return { game: key, score: s.score ?? 0, durationMs: (s.endedAt ?? now) - s.startedAt };
    },
    reveal() {
      return {};
    },
    progress(s) {
      return { score: s.score ?? 0 };
    }
  };
}

export const codenames = partyRound("codenames");
export const devine = partyRound("devine");

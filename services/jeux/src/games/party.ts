import { CODENAMES_TURN_MS, DEVINE_TURNS, DEVINE_TURN_MS, matchName, rng, shuffle, type GameKey } from "@loltr/shared";
import { CODENAMES_WORDS, DEVINE_WORDS, type DevineWord, type Lang } from "@loltr/content";
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
  /** Avance l'état avec le temps (fin de tour) et les départs : `present` liste les joueurs encore là. */
  tick(s: S, now: number, present?: string[]): S;
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
  /** Cartes trouvées dans les deux langues (l'interface affiche celle du joueur). */
  log: { team: Team; clue: string; n: number; found: T[] }[];
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
    const log = s.log.map((l, j) => (j === s.log.length - 1 ? { ...l, found: [...l.found, s.words[i]] } : l));
    const next: CodenamesState = { ...s, revealed, log };
    if (color === "x") return { ...next, winner: other(team), endedAt: now };
    const remaining = (t: Team) => s.key.filter((c, j) => c === t && !revealed[j]).length;
    if (remaining("a") === 0) return { ...next, winner: "a", endedAt: now };
    if (remaining("b") === 0) return { ...next, winner: "b", endedAt: now };
    if (color !== team) return endTurn(next, now);
    const guessesLeft = s.guessesLeft - 1;
    return guessesLeft <= 0 ? endTurn(next, now) : { ...next, guessesLeft };
  },
  tick(s, now, present) {
    if (s.endedAt) return s;
    if (present) {
      // Un maître-espion parti est remplacé par un équipier encore là ; une équipe vide perd
      const here = (t: Team) => s.teams[t].filter((u) => present.includes(u));
      const a = here("a");
      const b = here("b");
      if (!a.length || !b.length) return { ...s, winner: a.length ? "a" : b.length ? "b" : null, endedAt: now };
      const spy = { a: a.includes(s.spy.a) ? s.spy.a : a[0], b: b.includes(s.spy.b) ? s.spy.b : b[0] };
      if (spy.a !== s.spy.a || spy.b !== s.spy.b) s = { ...s, spy };
    }
    return now > s.turnEndsAt ? endTurn(s, now) : s;
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  scoreOf(s, userId) {
    // Un spectateur (hors des deux équipes) ne marque rien
    const team = s.teams.a.includes(userId) ? "a" : s.teams.b.includes(userId) ? "b" : null;
    return team && s.winner === team ? 100 : 0;
  }
};

function endTurn(s: CodenamesState, now: number): CodenamesState {
  return { ...s, turn: other(s.turn), phase: "clue", clue: null, guessesLeft: 0, turnEndsAt: now + CODENAMES_TURN_MS };
}

// --- Fais-moi deviner ------------------------------------------------------------------
// Comme skribbl.io : tout le groupe joue ensemble. À chaque tour, un joueur (le conteur) décrit un
// mot sans le dire ; les autres le cherchent. Plus on trouve vite, plus on marque ; le conteur marque
// pour chaque joueur qui trouve. Le tour finit quand tout le monde a trouvé ou au bout du chrono.

/** Points d'un joueur qui trouve : de 300 (tout de suite) à 100 (à la dernière seconde). */
export const devineFinderPoints = (leftMs: number) => 100 + Math.round((200 * Math.max(0, Math.min(DEVINE_TURN_MS, leftMs))) / DEVINE_TURN_MS);
/** Points du conteur pour chaque joueur qui trouve : 200 répartis entre ceux qui cherchent. */
export const devineTellerPoints = (guessers: number) => Math.round(200 / Math.max(1, guessers));

type FeedKind = "clue" | "guess" | "found" | "skip" | "reveal";

export interface DevineState {
  players: string[];
  points: Record<string, number>;
  /** Conteur de chaque tour. */
  turns: string[];
  t: number;
  words: number[];
  w: number;
  turnEndsAt: number;
  /** Joueurs qui ont trouvé le mot du tour, dans l'ordre. */
  foundBy: string[];
  /** Messages du tour ; « reveal » donne le mot du tour précédent (index dans DEVINE_WORDS). */
  feed: { by: string; text: string; kind: FeedKind; word?: number; points?: number }[];
  /** Tours où le mot a été trouvé par au moins un joueur. */
  wordsFound: number;
  endedAt: number | null;
}

const devineWord = (s: DevineState) => DEVINE_WORDS[s.words[s.w % s.words.length]];
const answers = (x: DevineWord) => [x.fr, x.en, ...(x.alias ?? [])];

/** Passe au tour suivant (le mot du tour fini est dévoilé dans le fil), ou termine la partie. */
function nextDevineTurn(s: DevineState, now: number): DevineState {
  const reveal = { by: s.turns[s.t], text: "", kind: "reveal" as const, word: s.words[s.w % s.words.length] };
  const wordsFound = s.wordsFound + (s.foundBy.length ? 1 : 0);
  const t = s.t + 1;
  if (t >= s.turns.length) return { ...s, wordsFound, feed: [...s.feed, reveal], endedAt: now };
  return { ...s, t, w: s.w + 1, wordsFound, foundBy: [], turnEndsAt: now + DEVINE_TURN_MS, feed: [reveal] };
}

export const devineParty: PartyGame<DevineState> = {
  key: "devine",
  minPlayers: 2,
  create(seed, members, now) {
    const r = rng(seed + ":devine");
    const players = shuffle(members, r);
    // Chacun fait deviner à son tour, sur DEVINE_TURNS tours au moins
    const turns: string[] = [];
    while (turns.length < Math.max(DEVINE_TURNS, players.length)) turns.push(...players);
    const words = shuffle([...DEVINE_WORDS.keys()], r);
    return { players, points: Object.fromEntries(players.map((p) => [p, 0])), turns, t: 0, words, w: 0, turnEndsAt: now + DEVINE_TURN_MS, foundBy: [], feed: [], wordsFound: 0, endedAt: null };
  },
  view(s, userId, now) {
    const teller = s.turns[s.t] ?? "";
    const found = s.foundBy.includes(userId);
    const role = s.endedAt ? "fin" : userId === teller ? "conteur" : found ? "trouve" : s.players.includes(userId) ? "devin" : "spectateur";
    const word = devineWord(s);
    const mask = (x: string) => x.replace(/[^\s'-]/g, "_");
    return {
      players: s.players,
      points: s.points,
      turn: { n: s.t + 1, total: s.turns.length, teller },
      role,
      // Le mot est visible du conteur, de ceux qui l'ont trouvé et à la fin
      word: role === "devin" || role === "spectateur" ? null : { fr: word.fr, en: word.en },
      mask: { fr: mask(word.fr), en: mask(word.en) },
      turnEndsAt: s.turnEndsAt,
      foundBy: s.foundBy,
      feed: s.feed.slice(-80).map((e) => (e.word !== undefined ? { ...e, reveal: { fr: DEVINE_WORDS[e.word].fr, en: DEVINE_WORDS[e.word].en } } : e)),
      wordsFound: s.wordsFound,
      over: s.endedAt !== null,
      now
    };
  },
  act(s, userId, action, now) {
    if (s.endedAt) throw new GameError("round_over", "La partie est terminée.");
    const teller = s.turns[s.t];
    const word = devineWord(s);
    const text = String(action.text ?? "").trim().slice(0, 120);
    if (action.type === "clue" || action.type === "skip") {
      if (userId !== teller) throw new GameError("not_your_turn", "Ce n'est pas à toi de faire deviner.");
      // Passer : un autre mot, sans points (on ne peut plus passer une fois qu'un joueur a trouvé)
      if (action.type === "skip") {
        if (s.foundBy.length) throw new GameError("skip_late", "Quelqu’un a déjà trouvé ce mot.");
        return { ...s, w: s.w + 1, feed: [...s.feed, { by: userId, text: "", kind: "skip" }] };
      }
      if (!text) throw new GameError("empty");
      // Seul le mot à faire deviner (et ses raccourcis) est interdit, dans les deux langues
      const said = ` ${norm(text)} `;
      const banned = answers(word).map(norm).filter((x) => x.length > 0);
      if (banned.some((b) => said.includes(` ${b} `) || (b.length > 3 && said.replace(/ /g, "").includes(b.replace(/ /g, ""))))) throw new GameError("banned_word", "Tu ne peux pas écrire le mot à faire deviner.");
      return { ...s, feed: [...s.feed, { by: userId, text, kind: "clue" }] };
    }
    if (action.type !== "guess") throw new GameError("bad_action");
    if (userId === teller) throw new GameError("not_your_turn", "C’est toi qui fais deviner.");
    if (!s.players.includes(userId)) throw new GameError("not_your_turn", "Tu regardes cette partie.");
    if (s.foundBy.includes(userId)) throw new GameError("already_found", "Tu as déjà trouvé.");
    if (!text) throw new GameError("empty");
    const ok = answers(word).some((x) => matchName(text, [{ id: "w", names: [x] }]));
    if (!ok) return { ...s, feed: [...s.feed, { by: userId, text, kind: "guess" }] };
    const gain = devineFinderPoints(s.turnEndsAt - now);
    const bonus = devineTellerPoints(s.players.length - 1);
    const points = { ...s.points, [userId]: (s.points[userId] ?? 0) + gain, [teller]: (s.points[teller] ?? 0) + bonus };
    const next: DevineState = { ...s, points, foundBy: [...s.foundBy, userId], feed: [...s.feed, { by: userId, text: "", kind: "found", points: gain }] };
    // Tout le monde a trouvé : tour suivant tout de suite
    return next.foundBy.length >= s.players.length - 1 ? nextDevineTurn(next, now) : next;
  },
  tick(s, now, present) {
    if (s.endedAt) return s;
    const teller = s.turns[s.t];
    if (present) {
      // Moins de deux joueurs encore là : la partie s'arrête
      if (s.players.filter((p) => present.includes(p)).length < 2) return { ...s, endedAt: now };
      // Conteur parti : tour suivant ; tous ceux qui restent ont trouvé : tour suivant
      if (!present.includes(teller)) return nextDevineTurn(s, now);
      const seekers = s.players.filter((p) => p !== teller && present.includes(p));
      if (seekers.length && seekers.every((p) => s.foundBy.includes(p))) return nextDevineTurn(s, now);
    }
    return now > s.turnEndsAt ? nextDevineTurn(s, now) : s;
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  scoreOf(s, userId) {
    return s.points[userId] ?? 0;
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

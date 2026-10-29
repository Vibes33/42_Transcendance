import { CHAUDFROID_QUESTIONS, rng } from "@loltr/shared";
import { ATTRIBUTE_LABELS, CDJ_POOL, CHAMPION_BY_ID, FINAL_ITEMS, img, itemImg, type Lang } from "@loltr/content";
import { GameError, type GameEngine } from "./engine";

// Chaud-Froid : 5 questions à réponse chiffrée (année de sortie, nombre de champions d'une région,
// nombre de skins, prix d'un objet). Plus la réponse est proche, plus elle rapporte :
// pile 100, très proche 70, proche 40, loin 10.

interface Question {
  kind: "year" | "region" | "skins" | "gold";
  ref: string;
  answer: number;
  min: number;
  max: number;
  step: number;
}

interface S {
  seed: string;
  questions: Question[];
  i: number;
  answers: number[];
  startedAt: number;
  endedAt: number | null;
}

const L = ATTRIBUTE_LABELS;

function makeQuestion(seed: string, k: number): Question {
  const r = rng(seed + ":q" + k);
  // Les 4 types de question tournent, à partir d'un type tiré au sort
  const offset = Math.floor(rng(seed + ":kinds")() * 4);
  const kind = (["year", "region", "skins", "gold"] as const)[(k + offset) % 4];
  if (kind === "year") {
    const c = CDJ_POOL[Math.floor(r() * CDJ_POOL.length)];
    return { kind, ref: c.id, answer: c.attributes!.year, min: 2009, max: 2026, step: 1 };
  }
  if (kind === "region") {
    const regions = Object.keys(L.region).filter((x) => CDJ_POOL.filter((c) => c.attributes!.regions.includes(x as never)).length >= 4);
    const reg = regions[Math.floor(r() * regions.length)];
    return { kind, ref: reg, answer: CDJ_POOL.filter((c) => c.attributes!.regions.includes(reg as never)).length, min: 0, max: 40, step: 1 };
  }
  if (kind === "skins") {
    const pool = CDJ_POOL.filter((c) => c.skins.length > 3);
    const c = pool[Math.floor(r() * pool.length)];
    return { kind, ref: c.id, answer: c.skins.length - 1, min: 0, max: 40, step: 1 };
  }
  const it = FINAL_ITEMS[Math.floor(r() * FINAL_ITEMS.length)];
  return { kind, ref: it.id, answer: it.gold, min: 2000, max: 4000, step: 50 };
}

/** Points d'une réponse : écart absolu pour les années, écart relatif pour le reste. */
export function heatPoints(q: Pick<Question, "kind" | "answer">, v: number): number {
  const d = Math.abs(v - q.answer);
  if (d === 0) return 100;
  if (q.kind === "year") return d === 1 ? 70 : d <= 3 ? 40 : 10;
  const rel = d / Math.max(1, q.answer);
  return rel <= 0.1 ? 70 : rel <= 0.25 ? 40 : 10;
}

/** Texte de la question et visuel, dans les deux langues. */
function present(q: Question) {
  if (q.kind === "year") {
    const c = CHAMPION_BY_ID[q.ref];
    return { text: { fr: `Quelle est l'année de sortie de ${c.names.fr} ?`, en: `In which year was ${c.names.en} released?` }, category: { fr: "Histoire du jeu", en: "Game history" }, image: img.square(c), unit: null };
  }
  if (q.kind === "region") {
    const reg = L.region[q.ref as keyof typeof L.region];
    return { text: { fr: `Combien de champions viennent de ${reg.fr} ?`, en: `How many champions come from ${reg.en}?` }, category: { fr: "Lore", en: "Lore" }, image: null, unit: null };
  }
  if (q.kind === "skins") {
    const c = CHAMPION_BY_ID[q.ref];
    return { text: { fr: `Combien de skins compte ${c.names.fr}, hors apparence classique ?`, en: `How many skins does ${c.names.en} have, not counting the classic one?` }, category: { fr: "Collection", en: "Collection" }, image: img.square(c), unit: null };
  }
  const it = FINAL_ITEMS.find((x) => x.id === q.ref)!;
  return { text: { fr: `Combien coûte ${it.names.fr} ?`, en: `How much does ${it.names.en} cost?` }, category: { fr: "Boutique", en: "Shop" }, image: itemImg(it), unit: { fr: "PO", en: "gold" } };
}

export const chaudfroid: GameEngine<S> = {
  key: "chaudfroid",
  create({ seed, now }) {
    const questions = Array.from({ length: CHAUDFROID_QUESTIONS }, (_, k) => makeQuestion(seed, k));
    return { state: { seed, questions, i: 0, answers: [], startedAt: now, endedAt: null }, contentKey: questions.map((q) => q.kind + ":" + q.ref).join("|") };
  },
  publicState(s, now) {
    const q = s.questions[s.i];
    const answered = s.answers.length > s.i;
    return {
      i: s.i,
      total: CHAUDFROID_QUESTIONS,
      question: { ...present(q), min: q.min, max: q.max, step: q.step },
      // La bonne réponse n'est donnée qu'après validation
      result: answered ? { answer: q.answer, guess: s.answers[s.i], points: heatPoints(q, s.answers[s.i]) } : null,
      history: s.answers.map((v, j) => heatPoints(s.questions[j], v)),
      score: score(s),
      over: this.isOver(s, now)
    };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "La partie est terminée.");
    const q = s.questions[s.i];
    if (action.type === "next") {
      if (s.answers.length <= s.i) throw new GameError("not_answered", "Réponds d'abord à la question.");
      const i = s.i + 1;
      return { state: i >= CHAUDFROID_QUESTIONS ? { ...s, endedAt: now } : { ...s, i }, feedback: {} };
    }
    if (action.type !== "answer") throw new GameError("bad_action");
    if (s.answers.length > s.i) throw new GameError("already_answered", "Déjà répondu.");
    const v = Math.round(Number(action.value));
    if (!Number.isFinite(v)) throw new GameError("bad_value", "Réponse invalide.");
    const value = Math.max(q.min, Math.min(q.max, v));
    return { state: { ...s, answers: [...s.answers, value] }, feedback: { points: heatPoints(q, value), answer: q.answer } };
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: now };
  },
  result(s, now) {
    return { game: "chaudfroid", score: score(s), durationMs: (s.endedAt ?? now) - s.startedAt };
  },
  reveal(s) {
    return { answers: s.questions.map((q) => q.answer) };
  },
  progress(s) {
    return { score: score(s), step: s.answers.length };
  }
};

function score(s: S) {
  return s.answers.reduce((sum, v, j) => sum + heatPoints(s.questions[j], v), 0);
}

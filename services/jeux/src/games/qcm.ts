import { QCM_QUESTIONS, QCM_QUESTION_MS, TIMER_GRACE_MS, rng, shuffle } from "@loltr/shared";
import { ATTRIBUTE_LABELS, CDJ_POOL, CHAMPIONS, QCM_ESPORT, type Champion, type Lang } from "@loltr/content";
import { GameError, type GameEngine } from "./engine";

// QCM de la Faille : 10 questions, 4 réponses, 15 s chacune. Lore et gameplay sont tirés des
// données des champions, l'esport d'une liste écrite à la main. 100 points par bonne réponse.

type T = Record<Lang, string>;
interface Question {
  category: "lore" | "gameplay" | "esport";
  text: T;
  choices: T[];
  correct: number;
}

interface S {
  seed: string;
  questions: Question[];
  i: number;
  /** Réponse donnée à chaque question (-1 : temps écoulé). */
  answers: number[];
  askedAt: number;
  startedAt: number;
  endedAt: number | null;
}

const L = ATTRIBUTE_LABELS;
const pickN = <X>(r: () => number, xs: X[], n: number, not: (x: X) => boolean) => shuffle(xs.filter((x) => !not(x)), r).slice(0, n);

function make(seed: string, k: number): Question {
  const r = rng(seed + ":qcm" + k);
  const kinds = ["region", "title", "spell", "esport", "year", "resource", "spell", "title", "esport", "region"] as const;
  const kind = kinds[(k + Math.floor(rng(seed + ":start")() * kinds.length)) % kinds.length];
  const champ = (pool: Champion[] = CDJ_POOL) => pool[Math.floor(r() * pool.length)];
  const finish = (category: Question["category"], text: T, right: T, wrong: T[]): Question => {
    const choices = shuffle([right, ...wrong], r);
    return { category, text, choices, correct: choices.indexOf(right) };
  };
  if (kind === "esport") {
    const q = QCM_ESPORT[Math.floor(r() * QCM_ESPORT.length)];
    return finish("esport", q.q, q.answers[0], q.answers.slice(1));
  }
  if (kind === "region") {
    const c = champ(CDJ_POOL.filter((x) => x.attributes!.regions.length === 1 && x.attributes!.regions[0] !== "runeterra"));
    const reg = c.attributes!.regions[0];
    const others = pickN(r, Object.keys(L.region), 3, (x) => x === reg || x === "runeterra").map((x) => L.region[x as keyof typeof L.region]);
    return finish("lore", { fr: `De quelle région vient ${c.names.fr} ?`, en: `Which region is ${c.names.en} from?` }, L.region[reg], others);
  }
  if (kind === "title") {
    const c = champ(CHAMPIONS);
    const others = pickN(r, CHAMPIONS, 3, (x) => x.id === c.id).map((x) => x.titles);
    return finish("lore", { fr: `Quel est le titre de ${c.names.fr} ?`, en: `What is ${c.names.en}'s title?` }, c.titles, others);
  }
  if (kind === "spell") {
    const c = champ(CHAMPIONS);
    const sp = c.spells[1 + Math.floor(r() * 4)];
    const others = pickN(r, CHAMPIONS, 3, (x) => x.id === c.id).map((x) => x.names);
    return finish("gameplay", { fr: `À quel champion appartient le sort « ${sp.names.fr} » ?`, en: `Which champion has the ability "${sp.names.en}"?` }, c.names, others);
  }
  if (kind === "resource") {
    const c = champ(CDJ_POOL.filter((x) => x.attributes!.resource !== "mana"));
    const res = c.attributes!.resource;
    const others = pickN(r, Object.keys(L.resource), 3, (x) => x === res).map((x) => L.resource[x as keyof typeof L.resource]);
    return finish("gameplay", { fr: `Quelle ressource utilise ${c.names.fr} ?`, en: `Which resource does ${c.names.en} use?` }, L.resource[res], others);
  }
  const c = champ();
  const y = c.attributes!.year;
  const years = shuffle([y - 3, y - 2, y - 1, y + 1, y + 2, y + 3].filter((x) => x >= 2009 && x <= 2026), r).slice(0, 3);
  const asT = (n: number) => ({ fr: String(n), en: String(n) });
  return finish("gameplay", { fr: `Quelle est l'année de sortie de ${c.names.fr} ?`, en: `In which year was ${c.names.en} released?` }, asT(y), years.map(asT));
}

export const qcm: GameEngine<S> = {
  key: "qcm",
  create({ seed, now }) {
    const questions: Question[] = [];
    for (let k = 0; questions.length < QCM_QUESTIONS && k < 60; k++) {
      const q = make(seed, k);
      // Pas deux fois la même question dans une partie
      if (!questions.some((x) => x.text.fr === q.text.fr)) questions.push(q);
    }
    return { state: { seed, questions, i: 0, answers: [], askedAt: now, startedAt: now, endedAt: null }, contentKey: questions[0].text.en };
  },
  publicState(s, now) {
    const q = s.questions[s.i];
    const answered = s.answers.length > s.i;
    return {
      i: s.i,
      total: QCM_QUESTIONS,
      question: { category: q.category, text: q.text, choices: q.choices },
      deadline: s.askedAt + QCM_QUESTION_MS,
      // La bonne réponse n'est donnée qu'une fois la question jouée
      result: answered ? { picked: s.answers[s.i], correct: q.correct } : null,
      history: s.answers.map((a, j) => a === s.questions[j].correct),
      streak: streak(s),
      score: score(s),
      over: this.isOver(s, now)
    };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "La partie est terminée.");
    const q = s.questions[s.i];
    if (action.type === "next") {
      if (s.answers.length <= s.i) throw new GameError("not_answered");
      const i = s.i + 1;
      return { state: i >= QCM_QUESTIONS ? { ...s, endedAt: now } : { ...s, i, askedAt: now }, feedback: {} };
    }
    if (s.answers.length > s.i) throw new GameError("already_answered", "Déjà répondu.");
    // Temps écoulé (signalé par l'interface, vérifié ici) ou réponse hors délai : comptée fausse
    const late = now > s.askedAt + QCM_QUESTION_MS + TIMER_GRACE_MS;
    if (action.type === "timeout") {
      if (now < s.askedAt + QCM_QUESTION_MS - 200) throw new GameError("not_yet");
      return { state: { ...s, answers: [...s.answers, -1] }, feedback: { correct: q.correct, timeout: true } };
    }
    if (action.type !== "answer") throw new GameError("bad_action");
    const pick = Number(action.choice);
    if (!Number.isInteger(pick) || pick < 0 || pick >= q.choices.length) throw new GameError("bad_choice");
    const value = late ? -1 : pick;
    return { state: { ...s, answers: [...s.answers, value] }, feedback: { correct: q.correct, right: value === q.correct } };
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: now };
  },
  result(s, now) {
    const correct = s.answers.filter((a, j) => a === s.questions[j].correct).length;
    return { game: "qcm", score: score(s), correct, durationMs: (s.endedAt ?? now) - s.startedAt };
  },
  reveal(s) {
    return { correct: s.questions.map((q) => q.correct) };
  },
  progress(s) {
    return { score: score(s), step: s.answers.length };
  }
};

function score(s: S) {
  return s.answers.filter((a, j) => a === s.questions[j].correct).length * 100;
}

function streak(s: S) {
  let n = 0;
  for (let j = s.answers.length - 1; j >= 0 && s.answers[j] === s.questions[j].correct; j--) n++;
  return n;
}

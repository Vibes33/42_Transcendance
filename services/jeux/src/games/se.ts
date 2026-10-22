import { SE_BONUS_MS, SE_START_MS, TIMER_GRACE_MS, WARMUP_MS, rng } from "@loltr/shared";
import { CHAMPIONS, CHAMPION_BY_ID, img } from "@loltr/content";
import { GameError, resolveChampion, type GameEngine } from "./engine";

// Sorts éclair : une icône de sort s'affiche, à quel champion appartient-elle ?
// Chrono 30 s, +3 s par bonne réponse ; « Passer » change de sort sans pénalité.

interface S {
  seed: string;
  q: number;
  /** Sort courant « champion:emplacement ». */
  current: string;
  asked: string[];
  correct: number;
  skipped: number;
  last: { kind: "ok" | "skip"; ref: string } | null;
  startedAt: number;
  warmUntil: number;
  endsAt: number;
  endedAt: number | null;
}

const SLOTS = ["P", "Q", "W", "E", "R"];

function question(seed: string, q: number, avoid: Set<string>): string {
  const r = rng(seed + ":q" + q);
  for (let i = 0; i < 50; i++) {
    const c = CHAMPIONS[Math.floor(r() * CHAMPIONS.length)];
    const ref = c.id + ":" + SLOTS[Math.floor(r() * 5)];
    if (!avoid.has(ref)) return ref;
  }
  return CHAMPIONS[0].id + ":Q";
}

const owner = (ref: string) => ref.split(":")[0];

export const se: GameEngine<S> = {
  key: "se",
  create({ seed, now, seen }) {
    const current = question(seed, 0, seen);
    return {
      state: { seed, q: 0, current, asked: [current], correct: 0, skipped: 0, last: null, startedAt: now, warmUntil: now + WARMUP_MS, endsAt: now + WARMUP_MS + SE_START_MS, endedAt: null },
      contentKey: current
    };
  },
  publicState(s, now) {
    return { q: s.q, correct: s.correct, skipped: s.skipped, last: s.last, endsAt: s.endsAt, warmUntil: s.warmUntil, over: this.isOver(s, now) };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "Temps écoulé.");
    if (now < s.warmUntil - 200) throw new GameError("warming");
    const next = (extra: Partial<S>, kind: "ok" | "skip"): S => {
      const q = s.q + 1;
      const current = question(s.seed, q, new Set(s.asked));
      return { ...s, ...extra, q, current, asked: [...s.asked, current], last: { kind, ref: s.current } };
    };
    if (action.type === "skip") return { state: next({ skipped: s.skipped + 1 }, "skip"), feedback: { skipped: s.current } };
    if (action.type !== "answer") throw new GameError("bad_action");
    const c = resolveChampion(action);
    if (c.id !== owner(s.current)) return { state: s, feedback: { wrong: c.id } };
    return { state: next({ correct: s.correct + 1, endsAt: s.endsAt + SE_BONUS_MS }, "ok"), feedback: { correct: s.current, bonusMs: SE_BONUS_MS } };
  },
  isOver(s, now) {
    return s.endedAt !== null || now > s.endsAt + TIMER_GRACE_MS;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: Math.min(now, s.endsAt) };
  },
  result(s, now) {
    return { game: "se", correct: s.correct, durationMs: (s.endedAt ?? Math.min(now, s.endsAt)) - s.warmUntil };
  },
  reveal(s) {
    return { current: s.current };
  },
  progress(s, now) {
    return { score: s.correct, leftMs: Math.max(0, s.endsAt - now) };
  },
  image(s, slot) {
    if (Number(slot) !== s.q) return null;
    const [champ, sl] = s.current.split(":");
    const sp = CHAMPION_BY_ID[champ]?.spells.find((x) => x.slot === sl);
    return sp ? img.spell(sp) : null;
  },
  timers(s) {
    return { endsAt: s.endsAt, warmUntil: s.warmUntil };
  }
};

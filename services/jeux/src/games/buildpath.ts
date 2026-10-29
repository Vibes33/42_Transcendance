import { BUILDPATH_ITEMS, BUILDPATH_MS, TIMER_GRACE_MS, WARMUP_MS, rng, shuffle } from "@loltr/shared";
import { COMPONENT_ITEMS, FINAL_ITEMS, ITEM_BY_ID, itemImg } from "@loltr/content";
import { GameError, type GameEngine } from "./engine";

// Build Path : un objet final s'affiche, retrouve ses composants parmi tous les composants de la
// boutique. 5 objets en 60 s ; +100 par objet reconstitué, −10 par composant faux.

interface Target {
  item: string;
  /** Composants déjà placés (un même composant peut revenir deux fois). */
  placed: string[];
}

interface S {
  seed: string;
  targets: Target[];
  i: number;
  done: number;
  wrong: number;
  last: { kind: "ok" | "wrong"; item: string } | null;
  startedAt: number;
  warmUntil: number;
  endsAt: number;
  endedAt: number | null;
}

function makeTargets(seed: string, seen: Set<string>): Target[] {
  const r = rng(seed + ":items");
  const fresh = FINAL_ITEMS.filter((i) => !seen.has(i.id));
  return shuffle(fresh.length >= BUILDPATH_ITEMS ? fresh : FINAL_ITEMS, r)
    .slice(0, BUILDPATH_ITEMS)
    .map((it) => ({ item: it.id, placed: [] }));
}

const view = (id: string) => {
  const it = ITEM_BY_ID[id];
  return { id, names: it.names, gold: it.gold, basic: it.basic, image: itemImg(it) };
};

const withParts = (id: string) => ({ ...view(id), parts: ITEM_BY_ID[id].from.map(view) });

/** Tous les composants de la boutique, du moins cher au plus cher : c'est là qu'on pioche. */
const CATALOG = [...COMPONENT_ITEMS].sort((a, b) => a.gold - b.gold || a.names.fr.localeCompare(b.names.fr)).map((i) => view(i.id));
const IN_CATALOG = new Set(CATALOG.map((i) => i.id));

export const buildpath: GameEngine<S> = {
  key: "buildpath",
  create({ seed, now, seen }) {
    const targets = makeTargets(seed, seen);
    return {
      state: { seed, targets, i: 0, done: 0, wrong: 0, last: null, startedAt: now, warmUntil: now + WARMUP_MS, endsAt: now + WARMUP_MS + BUILDPATH_MS, endedAt: null },
      contentKey: targets[0].item
    };
  },
  publicState(s, now) {
    const t = s.targets[s.i];
    const it = ITEM_BY_ID[t.item];
    const recipe = it.gold - it.from.reduce((sum, c) => sum + ITEM_BY_ID[c].gold, 0);
    return {
      i: s.i,
      total: BUILDPATH_ITEMS,
      target: { ...view(t.item), recipe, slots: it.from.length },
      // Un composant placé montre ses propres composants (Phage : Épée longue + Cristal de rubis)
      placed: t.placed.map(withParts),
      catalog: CATALOG,
      done: s.done,
      wrong: s.wrong,
      last: s.last,
      score: score(s),
      endsAt: s.endsAt,
      warmUntil: s.warmUntil,
      // Partie perdue (temps écoulé) : le build complet de l'objet en cours se dévoile
      answer: this.isOver(s, now) && s.done < BUILDPATH_ITEMS ? { ...view(t.item), components: ITEM_BY_ID[t.item].from.map(withParts) } : null,
      over: this.isOver(s, now)
    };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "Temps écoulé.");
    if (now < s.warmUntil - 200) throw new GameError("warming");
    if (action.type !== "pick") throw new GameError("bad_action");
    const t = s.targets[s.i];
    const id = String(action.item);
    if (!IN_CATALOG.has(id)) throw new GameError("bad_item");
    const need = [...ITEM_BY_ID[t.item].from];
    for (const p of t.placed) need.splice(need.indexOf(p), 1);
    if (!need.includes(id)) return { state: { ...s, wrong: s.wrong + 1, last: { kind: "wrong", item: id } }, feedback: { wrong: id } };
    const placed = [...t.placed, id];
    const complete = placed.length === ITEM_BY_ID[t.item].from.length;
    const targets = s.targets.map((x, j) => (j === s.i ? { ...x, placed } : x));
    if (!complete) return { state: { ...s, targets, last: { kind: "ok", item: id } }, feedback: { correct: id } };
    const done = s.done + 1;
    const i = s.i + 1;
    const next = { ...s, targets, done, last: { kind: "ok" as const, item: t.item } };
    return { state: i >= BUILDPATH_ITEMS ? { ...next, endedAt: now } : { ...next, i }, feedback: { correct: id, completed: t.item } };
  },
  isOver(s, now) {
    return s.endedAt !== null || now > s.endsAt + TIMER_GRACE_MS;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: Math.min(now, s.endsAt) };
  },
  result(s, now) {
    return { game: "buildpath", score: score(s), correct: s.done, durationMs: (s.endedAt ?? Math.min(now, s.endsAt)) - s.warmUntil };
  },
  reveal(s) {
    return { items: s.targets.map((t) => ({ item: t.item, from: ITEM_BY_ID[t.item].from })) };
  },
  progress(s, now) {
    return { score: score(s), step: s.done, leftMs: Math.max(0, s.endsAt - now) };
  },
  timers(s) {
    return { endsAt: s.endsAt, warmUntil: s.warmUntil };
  }
};

function score(s: S) {
  return Math.max(0, s.done * 100 - s.wrong * 10);
}

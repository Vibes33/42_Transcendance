import { PORTRAIT_LINES, PORTRAIT_ROUNDS, rng } from "@loltr/shared";
import { ATTRIBUTE_LABELS, CDJ_POOL, CHAMPION_BY_ID, img, type Champion, type Lang } from "@loltr/content";
import { GameError, resolveChampion, type GameEngine } from "./engine";

// Portrait mystère : un champion est décrit en 5 lignes, de la plus vague à la plus précise.
// 100 points à la première ligne, 20 de moins à chaque ligne dévoilée ; une erreur dévoile la
// ligne suivante, et après la dernière ligne une erreur fait perdre le portrait. 5 portraits.

interface Portrait {
  champion: string;
  shown: number;
  misses: string[];
  /** null : en cours ; true : trouvé ; false : raté. */
  found: boolean | null;
}

interface S {
  seed: string;
  portraits: Portrait[];
  i: number;
  score: number;
  startedAt: number;
  endedAt: number | null;
}

type Line = Record<Lang, string>;
const L = ATTRIBUTE_LABELS;
const list = (xs: string[], lang: Lang) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + (lang === "fr" ? " et " : " and ") + xs[xs.length - 1]);

/** Les 5 lignes d'un portrait, tirées des attributs du champion (identiques pour une même graine). */
export function portraitLines(c: Champion, seed: string): Line[] {
  const a = c.attributes!;
  const r = rng(seed + ":" + c.id);
  const regions = (lang: Lang) => list(a.regions.map((x) => L.region[x][lang]), lang);
  const species = (lang: Lang) => list(a.species.map((x) => L.species[x][lang].toLowerCase()), lang);
  const pos = (lang: Lang) => list(a.positions.map((x) => L.position[x][lang]), lang);
  const range = a.range.length > 1 ? { fr: "au corps à corps comme à distance", en: "both in melee and at range" } : a.range[0] === "ranged" ? { fr: "à distance", en: "at range" } : { fr: "au corps à corps", en: "in melee" };
  const spells = c.spells.filter((s) => s.slot !== "R");
  const spell = spells[Math.floor(r() * spells.length)];
  return [
    { fr: `Je viens de ${regions("fr")} ; mon espèce : ${species("fr")}.`, en: `I come from ${regions("en")}; my species: ${species("en")}.` },
    { fr: `On me joue surtout en ${pos("fr")}, ${range.fr}.`, en: `I'm mostly played ${pos("en")}, ${range.en}.` },
    { fr: `Ma sortie date de ${a.year} et ma ressource : ${L.resource[a.resource].fr.toLowerCase()}.`, en: `I was released in ${a.year}; my resource: ${L.resource[a.resource].en.toLowerCase()}.` },
    { fr: `Un de mes sorts s'appelle « ${spell.names.fr} ».`, en: `One of my abilities is called "${spell.names.en}".` },
    { fr: `On me surnomme « ${c.titles.fr} ».`, en: `They call me "${c.titles.en}".` }
  ];
}

const worth = (shown: number) => Math.max(20, 100 - (shown - 1) * 20);

function pickChampions(seed: string, seen: Set<string>): string[] {
  const r = rng(seed + ":portraits");
  const pool = CDJ_POOL.filter((c) => !seen.has(c.id));
  const from = pool.length >= PORTRAIT_ROUNDS ? pool : CDJ_POOL;
  const out: string[] = [];
  while (out.length < PORTRAIT_ROUNDS) {
    const c = from[Math.floor(r() * from.length)].id;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

export const portrait: GameEngine<S> = {
  key: "portrait",
  create({ seed, now, seen }) {
    const champs = pickChampions(seed, seen);
    return {
      state: { seed, portraits: champs.map((champion) => ({ champion, shown: 1, misses: [], found: null })), i: 0, score: 0, startedAt: now, endedAt: null },
      contentKey: champs[0]
    };
  },
  publicState(s, now) {
    const p = s.portraits[s.i];
    const lines = portraitLines(CHAMPION_BY_ID[p.champion], s.seed);
    return {
      i: s.i,
      total: PORTRAIT_ROUNDS,
      lines: lines.slice(0, p.found === null ? p.shown : PORTRAIT_LINES),
      shown: p.shown,
      worth: worth(p.shown),
      misses: p.misses,
      found: p.found,
      // Le champion n'est dévoilé qu'une fois le portrait terminé
      answer: p.found === null ? null : { champion: p.champion, image: img.square(CHAMPION_BY_ID[p.champion]) },
      history: s.portraits.slice(0, s.i).map((x) => ({ champion: x.champion, found: x.found, shown: x.shown })),
      score: s.score,
      over: this.isOver(s, now)
    };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "La partie est terminée.");
    const p = s.portraits[s.i];
    const set = (patch: Partial<Portrait>, extra: Partial<S> = {}): S => ({ ...s, ...extra, portraits: s.portraits.map((x, j) => (j === s.i ? { ...x, ...patch } : x)) });
    if (action.type === "next") {
      if (p.found === null) throw new GameError("not_done", "Termine d'abord ce portrait.");
      const i = s.i + 1;
      return { state: i >= PORTRAIT_ROUNDS ? { ...s, endedAt: now } : { ...s, i }, feedback: {} };
    }
    if (p.found !== null) throw new GameError("portrait_done");
    if (action.type === "reveal") {
      if (p.shown >= PORTRAIT_LINES) throw new GameError("all_shown", "Toutes les lignes sont déjà dévoilées.");
      return { state: set({ shown: p.shown + 1 }), feedback: {} };
    }
    if (action.type !== "guess") throw new GameError("bad_action");
    const c = resolveChampion(action, CDJ_POOL);
    if (p.misses.includes(c.id)) throw new GameError("already_tried", "Déjà proposé.");
    if (c.id === p.champion) {
      const gain = worth(p.shown);
      return { state: set({ found: true }, { score: s.score + gain }), feedback: { correct: true, gain } };
    }
    // Erreur : la ligne suivante se dévoile ; après la dernière, le portrait est perdu
    if (p.shown >= PORTRAIT_LINES) return { state: set({ found: false, misses: [...p.misses, c.id] }), feedback: { wrong: c.id, lost: true } };
    return { state: set({ shown: p.shown + 1, misses: [...p.misses, c.id] }), feedback: { wrong: c.id } };
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: now };
  },
  result(s, now) {
    return { game: "portrait", score: s.score, durationMs: (s.endedAt ?? now) - s.startedAt };
  },
  reveal(s) {
    return { champions: s.portraits.map((p) => p.champion) };
  },
  progress(s) {
    return { score: s.score, step: s.i + 1 };
  }
};

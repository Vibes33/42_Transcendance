import { CONNEXIONS_MAX_ERRORS, rng, shuffle } from "@loltr/shared";
import { ATTRIBUTE_LABELS, CDJ_POOL, img, CHAMPION_BY_ID, type Champion, type Lang } from "@loltr/content";
import { GameError, type GameEngine } from "./engine";

// Connexions visuelles : 16 champions à ranger en 4 groupes de 4 qui partagent un lien caché
// (région, espèce, poste, ressource, année de sortie). Chaque champion n'appartient qu'à un des
// 4 groupes tirés. 4 erreurs permises ; 100 points par groupe, 20 de moins par erreur.

interface Group {
  label: Record<Lang, string>;
  champs: string[];
}

interface S {
  seed: string;
  groups: Group[];
  order: string[];
  found: number[];
  errors: number;
  /** Combinaisons déjà proposées (ensembles triés), pour ne pas pénaliser deux fois la même. */
  tried: string[];
  startedAt: number;
  endedAt: number | null;
}

type Criterion = { key: string; label: Record<Lang, string>; test: (c: Champion) => boolean };
const L = ATTRIBUTE_LABELS;

function criteria(): Criterion[] {
  const out: Criterion[] = [];
  for (const [k, v] of Object.entries(L.region)) out.push({ key: "region:" + k, label: { fr: `Région : ${v.fr}`, en: `Region: ${v.en}` }, test: (c) => c.attributes!.regions.includes(k as never) });
  for (const [k, v] of Object.entries(L.species)) if (k !== "human" && k !== "unknown") out.push({ key: "species:" + k, label: { fr: `Espèce : ${v.fr}`, en: `Species: ${v.en}` }, test: (c) => c.attributes!.species.includes(k as never) });
  for (const [k, v] of Object.entries(L.position)) out.push({ key: "position:" + k, label: { fr: `Joués uniquement ${v.fr}`, en: `Played only ${v.en}` }, test: (c) => c.attributes!.positions.length === 1 && c.attributes!.positions[0] === k });
  for (const [k, v] of Object.entries(L.resource)) if (k !== "mana") out.push({ key: "resource:" + k, label: { fr: `Ressource : ${v.fr}`, en: `Resource: ${v.en}` }, test: (c) => c.attributes!.resource === k });
  for (let y = 2009; y <= 2026; y++) out.push({ key: "year:" + y, label: { fr: `Sortis en ${y}`, en: `Released in ${y}` }, test: (c) => c.attributes!.year === y });
  return out;
}

/** Tire 4 critères et 4 champions par critère, chacun ne vérifiant qu'un seul des 4 critères. */
export function buildBoard(seed: string): Group[] {
  const all = criteria();
  for (let attempt = 0; attempt < 200; attempt++) {
    const r = rng(seed + ":board:" + attempt);
    const pool = shuffle(all.filter((c) => CDJ_POOL.filter(c.test).length >= 4), r);
    // Pas deux critères du même type (deux régions, deux années…) pour varier les liens
    const picked: Criterion[] = [];
    for (const c of pool) {
      if (picked.length === 4) break;
      if (picked.some((p) => p.key.split(":")[0] === c.key.split(":")[0])) continue;
      picked.push(c);
    }
    if (picked.length < 4) continue;
    const groups: Group[] = [];
    for (const c of picked) {
      const only = CDJ_POOL.filter((ch) => c.test(ch) && picked.filter((p) => p.test(ch)).length === 1);
      if (only.length < 4) break;
      groups.push({ label: c.label, champs: shuffle(only, r).slice(0, 4).map((ch) => ch.id) });
    }
    if (groups.length === 4) return groups;
  }
  throw new Error("connexions : impossible de construire une grille");
}

export const connexions: GameEngine<S> = {
  key: "connexions",
  create({ seed, now }) {
    const groups = buildBoard(seed);
    const order = shuffle(groups.flatMap((g) => g.champs), rng(seed + ":order"));
    return { state: { seed, groups, order, found: [], errors: 0, tried: [], startedAt: now, endedAt: null }, contentKey: groups.map((g) => g.label.en).sort().join("|") };
  },
  publicState(s, now) {
    const over = this.isOver(s, now);
    const inFound = new Set(s.found.flatMap((g) => s.groups[g].champs));
    const show = (g: number) => ({ index: g, label: s.groups[g].label, champs: s.groups[g].champs.map((id) => ({ id, image: img.square(CHAMPION_BY_ID[id]) })) });
    return {
      tiles: s.order.filter((id) => !inFound.has(id)).map((id) => ({ id, image: img.square(CHAMPION_BY_ID[id]) })),
      found: s.found.map(show),
      // Fin de partie : les groupes manqués se dévoilent
      missed: over ? s.groups.map((_, g) => g).filter((g) => !s.found.includes(g)).map(show) : [],
      errors: s.errors,
      maxErrors: CONNEXIONS_MAX_ERRORS,
      score: score(s),
      over
    };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "La partie est terminée.");
    if (action.type === "shuffle") return { state: { ...s, order: shuffle(s.order, rng(s.seed + ":shuffle:" + now)) }, feedback: {} };
    if (action.type !== "submit") throw new GameError("bad_action");
    const ids = Array.isArray(action.champions) ? [...new Set(action.champions.map(String))] : [];
    if (ids.length !== 4 || !ids.every((id) => s.order.includes(id))) throw new GameError("bad_selection", "Choisis 4 champions.");
    const key = [...ids].sort().join(",");
    if (s.tried.includes(key)) return { state: s, feedback: { already: true } };
    const g = s.groups.findIndex((x) => ids.every((id) => x.champs.includes(id)));
    if (g >= 0 && !s.found.includes(g)) {
      const found = [...s.found, g];
      return { state: { ...s, found, tried: [...s.tried, key], endedAt: found.length === 4 ? now : null }, feedback: { correct: g } };
    }
    const best = Math.max(...s.groups.map((x) => ids.filter((id) => x.champs.includes(id)).length));
    const errors = s.errors + 1;
    return { state: { ...s, errors, tried: [...s.tried, key], endedAt: errors >= CONNEXIONS_MAX_ERRORS ? now : null }, feedback: { wrong: true, close: best === 3 } };
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: now };
  },
  result(s, now) {
    return { game: "connexions", score: score(s), correct: s.found.length, durationMs: (s.endedAt ?? now) - s.startedAt };
  },
  reveal(s) {
    return { groups: s.groups };
  },
  progress(s) {
    return { score: score(s), step: s.found.length, tries: s.errors };
  }
};

function score(s: S) {
  return Math.max(0, s.found.length * 100 - s.errors * 20);
}

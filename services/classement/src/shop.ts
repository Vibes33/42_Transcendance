import { CLASSIC_UNLOCK_PRICE, GAMES, GAME_KEYS, addDays, dayKey, dayStart, rng, shuffle, weekKey } from "@loltr/shared";
import { CHIBIS, CHIBI_BY_KEY, SKIN_BY_ID } from "@loltr/content";

// Boutique : trois onglets (Chibis, Skins, Prestige) + le déblocage des jeux classiques (page Jeux).

export interface CatalogItem {
  id: string;
  kind: "chibi" | "skin" | "prestige" | "game";
  ref: string;
  price: number;
  /** Objet à posséder avant d'acheter celui-ci (le chibi pour ses skins). */
  requires: string | null;
}

export const CATALOG: CatalogItem[] = [
  ...CHIBIS.map((c) => ({ id: "chibi:" + c.key, kind: "chibi" as const, ref: c.key, price: c.price, requires: null })),
  ...CHIBIS.flatMap((c) =>
    c.skins
      .filter((s) => s.kind !== "base")
      .map((s) => ({ id: "skin:" + s.id, kind: s.kind === "prestige" ? ("prestige" as const) : ("skin" as const), ref: s.id, price: s.price, requires: "chibi:" + c.key }))
  ),
  ...GAME_KEYS.filter((k) => GAMES[k].classicPlayable).map((k) => ({ id: "game:" + k, kind: "game" as const, ref: k, price: CLASSIC_UNLOCK_PRICE, requires: null }))
];

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((i) => [i.id, i]));

/** Skin prestige mis en avant cette semaine (change chaque lundi à 3 h). */
export function featuredPrestige(now: number): { id: string; until: number } | null {
  const prestige = CATALOG.filter((i) => i.kind === "prestige");
  if (!prestige.length) return null;
  const week = weekKey(dayKey(now));
  const pickd = shuffle(prestige, rng("featured:" + week))[0];
  return { id: pickd.id, until: dayStart(addDays(week, 7)) };
}

export const isKnownItem = (id: string) => !!CATALOG_BY_ID[id] || (id.startsWith("chibi:") && !!CHIBI_BY_KEY[id.slice(6)]) || (id.startsWith("skin:") && !!SKIN_BY_ID[id.slice(5)]);

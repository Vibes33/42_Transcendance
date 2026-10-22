import generated from "../data/champions.generated.json";
import { ALIASES, ATTRIBUTES, BOTH_RANGES, LABELS, RESOURCE_OF, type Gender, type Position, type Region, type Species } from "./attributes";

export const DDRAGON_VERSION: string = generated.version;
export const DDRAGON = "https://ddragon.leagueoflegends.com";

export type Lang = "fr" | "en";
export type Spell = { slot: "P" | "Q" | "W" | "E" | "R"; names: Record<Lang, string>; image: string };

export interface ChampionAttributes {
  gender: Gender;
  positions: Position[];
  species: Species[];
  resource: keyof typeof LABELS.resource;
  range: ("melee" | "ranged")[];
  regions: Region[];
  year: number;
}

export interface Champion {
  /** Identifiant Data Dragon, ex. "MonkeyKing". */
  ddId: string;
  /** Identifiant LolTR, ex. "monkeyking". */
  id: string;
  names: Record<Lang, string>;
  titles: Record<Lang, string>;
  spells: Spell[];
  skins: { num: number; names: Record<Lang, string> }[];
  /** Absent si le champion n'est pas encore complété à la main : il n'est alors pas tiré au Champion du jour. */
  attributes: ChampionAttributes | null;
  /** Noms dans toutes les langues + alias, pour la saisie tolérante. */
  matchNames: string[];
}

type Gen = (typeof generated.champions)[number];

function attributesOf(c: Gen & { stats?: unknown }): ChampionAttributes | null {
  const row = ATTRIBUTES[c.slug];
  if (!row) return null;
  const [gender, positions, species, regions, year] = row;
  const ranged = RANGED.has(c.slug);
  return {
    gender,
    positions: positions.split("").map((p) => p as Position),
    species,
    resource: RESOURCE_OF[c.partype] ?? "mana",
    range: BOTH_RANGES.includes(c.slug) ? ["melee", "ranged"] : ranged ? ["ranged"] : ["melee"],
    regions,
    year
  };
}

// Portée : Data Dragon ne la donne que via la portée d'attaque ; on l'a figée à l'import (> 300 = distance).
import ranges from "../data/ranges.generated.json";
const RANGED = new Set<string>(ranges.ranged);

export const CHAMPIONS: Champion[] = generated.champions.map((c) => ({
  ddId: c.id,
  id: c.slug,
  names: c.names as Record<Lang, string>,
  titles: c.titles as Record<Lang, string>,
  spells: c.spells as Spell[],
  skins: c.skins as Champion["skins"],
  attributes: attributesOf(c),
  matchNames: Array.from(new Set([c.names.fr, c.names.en, ...(ALIASES[c.slug] ?? [])]))
}));

export const CHAMPION_BY_ID: Record<string, Champion> = Object.fromEntries(CHAMPIONS.map((c) => [c.id, c]));

/** Champions complets, tirables au Champion du jour. */
export const CDJ_POOL = CHAMPIONS.filter((c) => c.attributes);

export const img = {
  square: (c: Champion) => `${DDRAGON}/cdn/${DDRAGON_VERSION}/img/champion/${c.ddId}.png`,
  spell: (s: Spell) => `${DDRAGON}/cdn/${DDRAGON_VERSION}/img/${s.image}`,
  splash: (c: Champion, num: number) => `${DDRAGON}/cdn/img/champion/splash/${c.ddId}_${num}.jpg`,
  loading: (c: Champion, num: number) => `${DDRAGON}/cdn/img/champion/loading/${c.ddId}_${num}.jpg`
};

export { LABELS };

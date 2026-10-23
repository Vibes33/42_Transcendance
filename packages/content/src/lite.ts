// Point d'entrée pour le navigateur : champions allégés, chibis et libellés, sans le gros fichier Data Dragon.
import lite from "../data/champions.lite.json";
import type { ChampionAttributes, Lang } from "./champions";

export type { ChampionAttributes, Lang };
export * from "./chibis";
export * from "./mayhem";
export { LABELS as ATTRIBUTE_LABELS } from "./attributes";

export const DDRAGON = "https://ddragon.leagueoflegends.com";
export const DDRAGON_VERSION: string = lite.version;

export interface LiteChampion {
  id: string;
  ddId: string;
  names: Record<Lang, string>;
  titles: Record<Lang, string>;
  spells: { slot: "P" | "Q" | "W" | "E" | "R"; names: Record<Lang, string>; image: string }[];
  attributes: ChampionAttributes | null;
  matchNames: string[];
}

export const LITE_CHAMPIONS = lite.champions as LiteChampion[];
export const LITE_BY_ID: Record<string, LiteChampion> = Object.fromEntries(LITE_CHAMPIONS.map((c) => [c.id, c]));
export const squareImg = (c: LiteChampion) => `${DDRAGON}/cdn/${DDRAGON_VERSION}/img/champion/${c.ddId}.png`;
export const spellImg = (s: { image: string }) => `${DDRAGON}/cdn/${DDRAGON_VERSION}/img/${s.image}`;
export const splashImg = (c: LiteChampion, num = 0) => `${DDRAGON}/cdn/img/champion/splash/${c.ddId}_${num}.jpg`;

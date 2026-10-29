import generated from "../data/items.generated.json";
import type { Lang } from "./champions";

// Objets de la Faille de l'invocateur (Data Dragon), pour Build Path : objets finaux et composants.
// À mettre à jour à chaque patch : bun run content:items

export interface Item {
  id: string;
  names: Record<Lang, string>;
  gold: number;
  /** Composants directs (objets finaux et composants intermédiaires), dans l'ordre de Data Dragon. */
  from: string[];
  /** Objet de base (sans composant), sinon objet intermédiaire ou final. */
  basic: boolean;
  image: string;
}

export const ITEMS_VERSION: string = generated.version;
export const ITEMS: Item[] = generated.items as Item[];
export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
/** Objets finaux tirables à Build Path. */
export const FINAL_ITEMS: Item[] = generated.finals.map((id) => ITEM_BY_ID[id]);
/** Composants qui entrent dans au moins un objet final (leurres de Build Path). */
export const COMPONENT_ITEMS: Item[] = [...new Set(FINAL_ITEMS.flatMap((i) => i.from))].map((id) => ITEM_BY_ID[id]);

export const itemImg = (i: Item) => `https://ddragon.leagueoflegends.com/cdn/${ITEMS_VERSION}/img/item/${i.image}`;

import { t } from "../i18n";

// Paliers Bronze → Challenger (par percentile de la saison), avec division I à III.

const NAMES: Record<string, string> = {
  challenger: "Challenger",
  grandmaster: "Grand maître",
  master: "Maître",
  diamond: "Diamant",
  emerald: "Émeraude",
  platinum: "Platine",
  gold: "Or",
  silver: "Argent",
  bronze: "Bronze"
};

const ROMAN = ["", "I", "II", "III"];

export function tierLabel(tier: string, division: number | null): string {
  return t(NAMES[tier] ?? tier) + (division ? " " + ROMAN[division] : "");
}

/** Emblème officiel du palier (CommunityDragon, comme les images Data Dragon chargées par le navigateur). */
export function rankEmblem(tier: string): string {
  const id = NAMES[tier] ? tier : "bronze";
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${id}.png`;
}

/**
 * Zone utile des emblèmes (image 1280 × 720 presque vide) : la boîte du plus grand, Challenger.
 * Les paliers bas paraissent plus petits, comme dans le client LoL.
 */
export const EMBLEM_BOX = { x: 480, y: 220, w: 320, h: 240, imgW: 1280, imgH: 720 };

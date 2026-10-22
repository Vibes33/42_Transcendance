import { PRICES } from "@loltr/shared";
import { CHIBI_DATA } from "./chibis.data";

export type ChibiSkinKind = "base" | "normal" | "prestige";

export interface ChibiSkin {
  /** Identifiant global : "<chibi>-<skin>", ex. "lux-sg". */
  id: string;
  key: string;
  name: { fr: string; en: string };
  kind: ChibiSkinKind;
  price: number;
  art: string;
  cut: string | null;
}

export interface Chibi {
  key: string;
  skins: ChibiSkin[];
  price: number;
  /** Couleur d'accent [mode sombre, mode clair] ; sinon l'accent générique. */
  accent: [string, string] | null;
  /**
   * Modèle 3D (GLB) affiché à la place de l'image quand il existe. Laisser vide pour l'instant :
   * il suffit d'ajouter l'URL du fichier ici (ex. "/models/zeri.glb") pour qu'il apparaisse partout.
   */
  model3d: string | null;
}

/** Accents [sombre, clair] : ceux de la maquette, puis un par chibi. */
export const ACCENTS: Record<string, [string, string]> = {
  generic: ["#A195FF", "#4A38C2"],
  neutre: ["#D5D9E0", "#2E3239"],
  lux: ["#FFE680", "#1D55B5"],
  jinx: ["#FF78B7", "#B01C68"],
  ekko: ["#56E0AA", "#0C7550"],
  sett: ["#FF7F6E", "#B0302A"],
  ahri: ["#FF8FB8", "#B0245E"],
  yasuo: ["#8EC5FF", "#1F5FA8"],
  zoe: ["#FF9BE0", "#A3247C"],
  teemo: ["#9BE36D", "#3D7A1C"],
  seraphine: ["#FFA6D9", "#A3246F"],
  ashe: ["#8FE3FF", "#146F99"],
  lulu: ["#C9A2FF", "#6A3DB8"],
  annie: ["#FF9666", "#B0431A"],
  // Les autres chibis : une couleur tirée de leur apparence
  aatrox: ["#FF8A6B", "#9E2E1E"],
  akali: ["#6EE7C8", "#0E7A63"],
  amumu: ["#8FD8C8", "#237566"],
  blitzcrank: ["#E8D04E", "#7A6A00"],
  briar: ["#FF6E8A", "#B01C3F"],
  caitlyn: ["#B5A0FF", "#5A3FB0"],
  ezreal: ["#FFD36B", "#8C6200"],
  gwen: ["#A0C4FF", "#3352A8"],
  irelia: ["#7FA8FF", "#2F4FB0"],
  janna: ["#8FF0E0", "#137A6E"],
  jhin: ["#F59A6B", "#A64618"],
  kaisa: ["#FF8CE6", "#A0237F"],
  katarina: ["#FF5C6C", "#B0182D"],
  kayle: ["#FFE08A", "#8E6A00"],
  leesin: ["#FFA45C", "#A64D0E"],
  lillia: ["#FFB3D9", "#A33A78"],
  malphite: ["#C9A27A", "#7A5530"],
  missfortune: ["#FF8FA3", "#B3264A"],
  morgana: ["#9F8CFF", "#4733B0"],
  neeko: ["#7FE3A0", "#23803E"],
  orianna: ["#66C2FF", "#105C99"],
  riven: ["#A8C8FF", "#3D5A9E"],
  shyvana: ["#FF8C42", "#B04A0A"],
  sona: ["#7FB8FF", "#2459A8"],
  soraka: ["#C6B5FF", "#5B45B0"],
  syndra: ["#D48CFF", "#8A2DB0"],
  tristana: ["#FFB04D", "#A65A00"],
  vex: ["#A0A8FF", "#4048B0"],
  vi: ["#FF8FD0", "#A8246A"],
  xayah: ["#FF6FA8", "#A81E5C"],
  yone: ["#FF7B7B", "#A82828"],
  yunara: ["#8FE0D0", "#1F7A6B"],
  yuumi: ["#FFB3E6", "#A33A88"],
  zed: ["#FF5C5C", "#A81E1E"],
  zeri: ["#B8F25C", "#4E7A0E"]
};

/** Modèles 3D par chibi (voir Chibi.model3d). */
export const MODELS_3D: Record<string, string> = {};

/** Les 4 chibis proposés à la première connexion. */
export const STARTERS = ["lux", "jinx", "ekko", "sett"] as const;
export const STARTER_TAGLINES: Record<string, { fr: string; en: string }> = {
  lux: { fr: "Lumière et bonne humeur", en: "Light and good vibes" },
  jinx: { fr: "Explosive et imprévisible", en: "Explosive and unpredictable" },
  ekko: { fr: "Toujours un coup d’avance", en: "Always one step ahead" },
  sett: { fr: "La force tranquille… ou pas", en: "Quiet strength… or not" }
};

export const CHIBIS: Chibi[] = CHIBI_DATA.map((c) => ({
  key: c.key,
  price: PRICES.chibi,
  accent: ACCENTS[c.key] ?? null,
  model3d: MODELS_3D[c.key] ?? null,
  skins: c.skins.map((s) => ({
    id: c.key + "-" + s.id,
    key: c.key,
    name: s.name,
    kind: s.kind,
    price: s.kind === "base" ? 0 : s.price ?? (s.kind === "prestige" ? PRICES.prestigeDefault : PRICES.skin),
    art: "/img/chibis/" + s.art,
    cut: s.cut ? "/img/chibis/" + s.cut : null
  }))
}));

export const CHIBI_BY_KEY: Record<string, Chibi> = Object.fromEntries(CHIBIS.map((c) => [c.key, c]));
export const SKIN_BY_ID: Record<string, ChibiSkin> = Object.fromEntries(CHIBIS.flatMap((c) => c.skins.map((s) => [s.id, s])));

/** Illustration affichée pour un chibi « aléatoire » pas encore révélé. */
export const RANDOM_ART = "/img/chibis/yasuo.jpg";

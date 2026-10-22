import { ACCENTS, CHIBI_BY_KEY, LITE_BY_ID, RANDOM_ART, SKIN_BY_ID, type Chibi, type ChibiSkin } from "@loltr/content/lite";
import type { SiteLang } from "@loltr/shared";

// Chibis : nom, image (avatar, détouré) et couleur d'accent du site.

export function chibiName(key: string, lang: SiteLang): string {
  return LITE_BY_ID[key]?.names[lang] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function skinOf(chibi: string, skin: string | null | undefined): ChibiSkin | null {
  const c = CHIBI_BY_KEY[chibi];
  if (!c) return null;
  return (skin && SKIN_BY_ID[skin]?.key === chibi ? SKIN_BY_ID[skin] : null) ?? c.skins[0];
}

/** Illustration de l'avatar d'un joueur (chibi équipé, ou chibi aléatoire). */
export function avatarOf(p: { chibi: string; skin: string | null } | null | undefined): string {
  if (!p || p.chibi === "random") return RANDOM_ART;
  return skinOf(p.chibi, p.skin)?.art ?? RANDOM_ART;
}

export function skinLabel(chibi: Chibi, skin: ChibiSkin, lang: SiteLang): string {
  return chibiName(chibi.key, lang) + (skin.kind === "base" ? "" : " " + skin.name[lang]);
}

/** Accent du site : [sombre, clair] du thème, sinon l'accent générique. */
export function accentFor(themeKey: string, mode: "dark" | "light"): string {
  const a = ACCENTS[themeKey] ?? ACCENTS.generic;
  return mode === "dark" ? a[0] : a[1];
}

export const hasTheme = (key: string) => !!ACCENTS[key];

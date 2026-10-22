import { create } from "zustand";
import type { SiteLang } from "@loltr/shared";
import { EN } from "./en";

// Textes du site : on écrit le français directement dans les composants (t("Jouer en solo")) et la
// traduction anglaise se trouve dans en.ts, indexée par la phrase française. Une phrase sans
// traduction reste en français : `bun run i18n:check` liste celles qui manquent.

const STORAGE = "loltr:lang";

function initialLang(): SiteLang {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved === "fr" || saved === "en") return saved;
  } catch {}
  return typeof navigator !== "undefined" && navigator.language.startsWith("fr") ? "fr" : "en";
}

export const useLang = create<{ lang: SiteLang; setLang: (l: SiteLang) => void }>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE, lang);
    } catch {}
    document.documentElement.lang = lang;
    set({ lang });
  }
}));

type Params = Record<string, string | number>;

export function translate(lang: SiteLang, fr: string, params?: Params): string {
  let s = lang === "en" ? (EN[fr] ?? fr) : fr;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split("{" + k + "}").join(String(v));
  return s;
}

/** Traduction réactive : le composant se met à jour quand la langue change. */
export function useT() {
  const lang = useLang((s) => s.lang);
  return (fr: string, params?: Params) => translate(lang, fr, params);
}

/** Traduction hors composant (messages d'erreur, notifications). */
export const t = (fr: string, params?: Params) => translate(useLang.getState().lang, fr, params);

/** Nombres au format de la langue (1 240 / 1,240). */
export function fmt(n: number, lang: SiteLang = useLang.getState().lang): string {
  return n.toLocaleString(lang === "fr" ? "fr-FR" : "en-US");
}

/** Pluriel simple : plural(3, "essai", "essais"). */
export const plural = (n: number, one: string, many: string) => (Math.abs(n) > 1 ? many : one);

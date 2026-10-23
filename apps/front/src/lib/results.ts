import type { HistoryGame } from "../api/queries";
import { plural, t } from "../i18n";

// Libellés des résultats du défi du jour : percentile d'un jeu et résumé d'une manche.

/** « Top 12 % » : part des meilleurs joueurs du jour sur ce jeu (null sans performance classable). */
export function topLabel(top: number | null, players: number): string {
  if (top === null) return t("Non classé");
  if (players <= 1) return t("Premier joueur du jour");
  return t("Top {n} %", { n: Math.max(1, Math.ceil(top * 100)) });
}

/** « Trouvé en 4 essais », « 12 champions »… */
export function resultLine(g: Pick<HistoryGame, "game" | "result">): string {
  const r = g.result;
  switch (g.game) {
    case "cdj":
      return r.found ? t(plural(r.tries ?? 0, "Trouvé en {n} essai", "Trouvé en {n} essais"), { n: r.tries ?? 0 }) : t("Pas trouvé");
    case "splash":
      return r.found ? (r.skinFound ? t("Champion et skin trouvés") : t("Champion trouvé")) : t("Pas trouvé");
    case "meli":
      return t("{n} " + plural(r.champions ?? 0, "champion", "champions"), { n: r.champions ?? 0 });
    case "se":
      return t("{n} " + plural(r.correct ?? 0, "bonne réponse", "bonnes réponses"), { n: r.correct ?? 0 });
  }
}

/** « jeudi 22 octobre » pour une clé de jour (AAAA-MM-JJ). */
export function dayLabel(day: string, lang: string): string {
  return new Date(day + "T12:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

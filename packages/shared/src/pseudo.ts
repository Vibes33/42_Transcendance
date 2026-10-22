// Pseudo en jeu : 3 à 16 caractères, lettres, chiffres et _, sans espace. Le site ajoute un tag à 4 chiffres.

export const PSEUDO_MIN = 3;
export const PSEUDO_MAX = 16;
export const BANNED_WORDS = ["admin", "modo", "moderateur", "moderator", "riot", "loltr", "staff"];

export type PseudoError = "empty" | "short" | "long" | "chars" | "banned";

export function validatePseudo(raw: string): PseudoError | null {
  const p = raw.trim();
  if (!p) return "empty";
  if (p.length < PSEUDO_MIN) return "short";
  if (p.length > PSEUDO_MAX) return "long";
  if (!/^[\p{L}\p{N}_]+$/u.test(p)) return "chars";
  const low = p.toLowerCase();
  if (BANNED_WORDS.some((b) => low.includes(b))) return "banned";
  return null;
}

/** Tag à 4 chiffres dérivé du pseudo (le même que celui affiché dans l'aperçu). */
export function tagOf(pseudo: string): string {
  let h = 7;
  for (const ch of pseudo.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 9000;
  return String(1000 + h);
}

/** Propositions quand un pseudo est déjà pris. */
export function pseudoSuggestions(p: string): string[] {
  return [p + "_TR", p + tagOf(p).slice(-2), p + "Main", "Le" + p].filter((x) => x.length <= PSEUDO_MAX);
}

const ADJ = ["Rapide", "Rusé", "Brave", "Malin", "Vif", "Fier", "Discret", "Agile"];
const NOUNS = ["Poro", "Baron", "Herald", "Minion", "Drake", "Krug", "Gromp", "Wolf"];

/** Pseudo aléatoire pour les invités et les spectateurs d'un stream. */
export function randomPseudo(r: () => number = Math.random): string {
  const a = ADJ[Math.floor(r() * ADJ.length)];
  const n = NOUNS[Math.floor(r() * NOUNS.length)];
  return n + a + Math.floor(r() * 90 + 10);
}

// Saisie des réponses : tolérante aux fautes de frappe et aux accents, dans n'importe quelle langue.

/** Minuscules, sans accents, sans ponctuation ni espaces. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Distance d'édition (Levenshtein), arrêtée dès que `max` est dépassé. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Tolérance de la correspondance : distance d'édition ≤ 2 après normalisation. */
export const MAX_TYPOS = 2;

export interface Matchable {
  id: string;
  /** Noms dans toutes les langues + alias (table d'alias). */
  names: string[];
}

/**
 * Trouve l'entrée qui correspond à une saisie libre. Une correspondance exacte (normalisée)
 * l'emporte ; sinon la plus proche à 2 fautes au plus, si elle est unique.
 * Les noms très courts (≤ 3 lettres, ex. « Vi ») n'acceptent pas de faute pour éviter les confusions.
 */
export function matchName<T extends Matchable>(input: string, items: T[]): T | null {
  const q = normalize(input);
  if (!q) return null;
  for (const it of items) if (it.names.some((n) => normalize(n) === q)) return it;
  let best: T | null = null;
  let bestD = Infinity;
  let tie = false;
  for (const it of items) {
    for (const n of it.names) {
      const nn = normalize(n);
      const allowed = Math.min(MAX_TYPOS, nn.length <= 3 ? 0 : nn.length <= 5 ? 1 : MAX_TYPOS);
      const d = editDistance(q, nn, allowed);
      if (d <= allowed) {
        if (d < bestD) { best = it; bestD = d; tie = false; }
        else if (d === bestD && best && best.id !== it.id) tie = true;
      }
    }
  }
  return tie ? null : best;
}

/** Propositions d'autocomplétion : préfixe sur le nom affiché dans la langue active. */
export function suggest<T extends { id: string; label: string; names: string[] }>(input: string, items: T[], limit = 6): T[] {
  const q = normalize(input);
  if (!q) return [];
  const starts = items.filter((it) => normalize(it.label).startsWith(q));
  const others = items.filter((it) => !starts.includes(it) && it.names.some((n) => normalize(n).startsWith(q)));
  return starts
    .sort((a, b) => a.label.localeCompare(b.label))
    .concat(others.sort((a, b) => a.label.localeCompare(b.label)))
    .slice(0, limit);
}

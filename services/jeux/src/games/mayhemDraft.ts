import { rng, shuffle } from "@loltr/shared";
import { MAYHEM_CRESTS, MAYHEM_JOKERS, MAYHEM_ROLES, MAYHEM_TEAMS, MAYHEM_TEAM_BY_ID, mayhemRating, type MayhemEntrant, type MayhemPicks } from "@loltr/content";

// Tirages du draft de World Mayhem, communs au joueur et aux bots : mêmes règles, même niveau.

/** Chance qu'une équipe déjà utilisée revienne au tirage suivant (pour viser des liens de roster). */
export const RETURN_CHANCE = 0.3;

/**
 * Paquet mélangé, sans remise : les équipes défilent sans se répéter, et deux rosters de la même
 * structure (T1 2023 puis T1 2024…) ne se suivent pas.
 */
function deck(seed: string, cycle: number): string[] {
  const pile = shuffle(MAYHEM_TEAMS, rng(seed + ":paquet" + cycle));
  const out: typeof pile = [];
  while (pile.length) {
    const i = pile.findIndex((t) => t.org !== out[out.length - 1]?.org);
    out.push(pile.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return out.map((t) => t.id);
}

const fromDeck = (seed: string, pos: number) => deck(seed, Math.floor(pos / MAYHEM_TEAMS.length))[pos % MAYHEM_TEAMS.length];

/** Premier tirage d'un draft. */
export const firstDraw = (seed: string) => ({ current: fromDeck(seed, 0), deckPos: 1 });

/**
 * Tirage n°`n` : le plus souvent l'équipe suivante du paquet ; parfois (30 %) le retour d'une équipe
 * dont un joueur est déjà pris, pour pouvoir réunir un duo ou un noyau. Jamais deux fois la même d'affilée.
 */
export function nextDraw(seed: string, n: number, deckPos: number, picks: MayhemPicks, prev: string): { current: string; deckPos: number } {
  const r = rng(seed + ":tirage" + n);
  const used = [...new Set(Object.values(picks).map((p) => p!.t))].filter((t) => t !== prev);
  if (used.length > 0 && r() < RETURN_CHANCE) return { current: used[Math.floor(r() * used.length)], deckPos };
  let pos = deckPos;
  let current = fromDeck(seed, pos++);
  if (current === prev) current = fromDeck(seed, pos++);
  return { current, deckPos: pos };
}

/**
 * Draft d'un bot, avec les mêmes tirages qu'un joueur : il prend le meilleur choix sur un poste libre
 * (note + liens gagnés, parfois le deuxième), et saute au joker une équipe sans joueur intéressant.
 */
export function botDraft(seed: string): MayhemPicks {
  const r = rng(seed + ":choix");
  let picks: MayhemPicks = {};
  let { current, deckPos } = firstDraw(seed);
  let jokers = MAYHEM_JOKERS;
  for (let n = 1; Object.keys(picks).length < 5 && n < 60; n++) {
    const team = MAYHEM_TEAM_BY_ID[current];
    const before = mayhemRating(picks).linkBonus;
    const scored = team.players
      .map((p, i) => ({ i, p }))
      .filter(({ i }) => !picks[MAYHEM_ROLES[i]])
      .map(({ i, p }) => ({ i, score: p.ovr + mayhemRating({ ...picks, [MAYHEM_ROLES[i]]: { t: current, i } }).linkBonus - before }))
      .sort((a, b) => b.score - a.score);
    if (jokers > 0 && scored[0].score < 89 && r() < 0.6) jokers--;
    else {
      const choice = scored.length > 1 && r() < 0.25 ? scored[1] : scored[0];
      picks = { ...picks, [MAYHEM_ROLES[choice.i]]: { t: current, i: choice.i } };
    }
    ({ current, deckPos } = nextDraw(seed, n, deckPos, picks, current));
  }
  return picks;
}

/**
 * Bots qui complètent le tournoi : chacun drafte avec les mêmes règles qu'un joueur (stats équilibrées)
 * et porte l'écusson et le nom d'une vraie équipe des Worlds, jamais deux fois la même.
 */
export function botFill(seed: string, count: number, takenCrests: string[] = []): MayhemEntrant[] {
  const crests = shuffle(
    MAYHEM_CRESTS.filter((c) => !takenCrests.includes(c.id)),
    rng(seed + ":ecussons")
  );
  return Array.from({ length: count }, (_, k) => {
    const picks = botDraft(seed + ":bot" + k);
    const crest = crests[k % crests.length];
    return { kind: "bot" as const, picks, rating: mayhemRating(picks, crest.id).rating, crest };
  });
}

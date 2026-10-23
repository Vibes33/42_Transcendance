import { rng, shuffle } from "@loltr/shared";
import {
  MAYHEM_ENTRANTS,
  MAYHEM_JOKERS,
  MAYHEM_ROLES,
  MAYHEM_TEAMS,
  MAYHEM_TEAM_BY_ID,
  mayhemRating,
  mayhemWins,
  type MayhemPicks,
  type MayhemTournament
} from "@loltr/content";
import { GameError, type GameEngine } from "./engine";
import { historicFill, simulateTournament } from "./mayhemSim";

// World Mayhem : une équipe des Worlds 2020-2025 est tirée au sort, le joueur y prend un joueur pour
// un poste libre, puis une nouvelle équipe est tirée automatiquement. 3 jokers pour relancer une
// équipe. Équipe complète : en solo le tournoi est simulé tout de suite ; en groupe il l'est quand
// tout le groupe a validé (service jeux, route /mayhem/group). La manche se termine une fois le
// tournoi regardé (ou passé).

export interface MayhemState {
  seed: string;
  group: boolean;
  /** Nombre de tirages faits ; l'équipe courante est `current`. */
  draws: number;
  current: string;
  picks: MayhemPicks;
  jokers: number;
  history: { t: string; what: string | null }[];
  locked: boolean;
  tournament: MayhemTournament | null;
  /** Index de mon équipe dans le tournoi. */
  me: number;
  startedAt: number;
  endedAt: number | null;
}

/**
 * Paquet mélangé, sans remise : aucune équipe ne revient tant que le paquet n'est pas épuisé, et
 * deux rosters de la même structure (T1 2023 puis T1 2024…) ne se suivent pas.
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

/** Tirage n°`n` du draft. */
const draw = (seed: string, n: number) => deck(seed, Math.floor(n / MAYHEM_TEAMS.length))[n % MAYHEM_TEAMS.length];

/** Tournoi solo : mon équipe en poule A, contre 15 équipes historiques. */
export function soloTournament(s: MayhemState): MayhemTournament {
  return simulateTournament(s.seed, [{ kind: "me", picks: s.picks, rating: mayhemRating(s.picks).rating }, ...historicFill(s.seed, MAYHEM_ENTRANTS - 1)]);
}

export const mayhem: GameEngine<MayhemState> = {
  key: "mayhem",
  create({ seed, now, group }) {
    const current = draw(seed, 0);
    return {
      state: { seed, group: !!group, draws: 1, current, picks: {}, jokers: MAYHEM_JOKERS, history: [], locked: false, tournament: null, me: 0, startedAt: now, endedAt: null },
      contentKey: "draft:" + seed
    };
  },
  publicState(s, now) {
    return {
      current: s.locked ? null : s.current,
      picks: s.picks,
      jokers: s.jokers,
      history: s.history,
      locked: s.locked,
      group: s.group,
      tournament: s.tournament,
      me: s.me,
      rating: mayhemRating(s.picks),
      over: this.isOver(s, now)
    };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "La partie est terminée.");
    const next = (patch: Partial<MayhemState>, what: string | null): MayhemState => {
      const st: MayhemState = { ...s, ...patch, history: [...s.history, { t: s.current, what }] };
      if (Object.keys(st.picks).length < 5) return { ...st, current: draw(s.seed, s.draws), draws: s.draws + 1 };
      return st;
    };
    switch (action.type) {
      case "pick": {
        if (s.locked) throw new GameError("locked", "Ton équipe est déjà validée.");
        const i = Number(action.index);
        const role = MAYHEM_ROLES[i];
        const player = MAYHEM_TEAM_BY_ID[s.current]?.players[i];
        if (!role || !player) throw new GameError("bad_action");
        if (s.picks[role]) throw new GameError("role_taken", "Ce poste est déjà pris.");
        return { state: next({ picks: { ...s.picks, [role]: { t: s.current, i } } }, player.name), feedback: { picked: player.name } };
      }
      case "reroll": {
        if (s.locked || Object.keys(s.picks).length >= 5) throw new GameError("locked");
        if (s.jokers <= 0) throw new GameError("no_joker", "Plus de joker.");
        return { state: next({ jokers: s.jokers - 1 }, null), feedback: { rerolled: true } };
      }
      case "lock": {
        if (s.locked) return { state: s, feedback: {} };
        if (Object.keys(s.picks).length < 5) throw new GameError("incomplete", "Il manque des postes.");
        const locked = { ...s, locked: true };
        return { state: s.group ? locked : { ...locked, tournament: soloTournament(locked), me: 0 }, feedback: { locked: true } };
      }
      case "done": {
        if (!s.tournament) throw new GameError("no_tournament", "Le tournoi n’a pas encore commencé.");
        return { state: { ...s, endedAt: now }, feedback: {} };
      }
      default:
        throw new GameError("bad_action");
    }
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: now };
  },
  result(s, now) {
    return {
      game: "mayhem",
      rating: mayhemRating(s.picks).rating,
      wins: s.tournament ? mayhemWins(s.tournament, s.me) : 0,
      durationMs: (s.endedAt ?? now) - s.startedAt
    };
  },
  reveal(s) {
    return { tournament: s.tournament };
  },
  progress(s) {
    return { step: Object.keys(s.picks).length, score: mayhemRating(s.picks).rating };
  }
};

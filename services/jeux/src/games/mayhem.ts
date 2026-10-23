import {
  MAYHEM_ENTRANTS,
  MAYHEM_JOKERS,
  MAYHEM_ROLES,
  MAYHEM_TEAM_BY_ID,
  mayhemRating,
  mayhemWins,
  type MayhemPicks,
  type MayhemTournament
} from "@loltr/content";
import { GameError, type GameEngine } from "./engine";
import { botFill, firstDraw, nextDraw } from "./mayhemDraft";
import { simulateTournament } from "./mayhemSim";

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
  /** Position dans le paquet d'équipes (les retours d'équipe ne l'avancent pas). */
  deckPos?: number;
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

/** Tournoi solo : mon équipe en poule A, contre 15 bots qui ont drafté avec les mêmes règles. */
export function soloTournament(s: MayhemState): MayhemTournament {
  return simulateTournament(s.seed, [{ kind: "me", picks: s.picks, rating: mayhemRating(s.picks).rating }, ...botFill(s.seed, MAYHEM_ENTRANTS - 1)]);
}

export const mayhem: GameEngine<MayhemState> = {
  key: "mayhem",
  create({ seed, now, group }) {
    const { current, deckPos } = firstDraw(seed);
    return {
      state: { seed, group: !!group, draws: 1, deckPos, current, picks: {}, jokers: MAYHEM_JOKERS, history: [], locked: false, tournament: null, me: 0, startedAt: now, endedAt: null },
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
      if (Object.keys(st.picks).length < 5) return { ...st, ...nextDraw(s.seed, s.draws, s.deckPos ?? s.draws, st.picks, s.current), draws: s.draws + 1 };
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

import {
  MAYHEM_CREST_BY_ID,
  MAYHEM_ENTRANTS,
  MAYHEM_NAME_MAX,
  MAYHEM_JOKERS,
  MAYHEM_ROLES,
  MAYHEM_TEAM_BY_ID,
  mayhemRating,
  mayhemWins,
  type MayhemCrest,
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
  /** Écusson et nom d'équipe choisis avant le draft. */
  crest?: MayhemCrest | null;
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
  /** Parties de mon parcours déjà regardées ou passées : le tournoi reprend là après une sortie. */
  watched?: number;
  startedAt: number;
  endedAt: number | null;
}

/** Tournoi solo : mon équipe en poule A, contre 15 bots qui ont drafté avec les mêmes règles. */
export function soloTournament(s: MayhemState): MayhemTournament {
  const me = { kind: "me" as const, picks: s.picks, rating: mayhemRating(s.picks).rating, crest: s.crest ?? undefined };
  return simulateTournament(s.seed, [me, ...botFill(s.seed, MAYHEM_ENTRANTS - 1, s.crest ? [s.crest.id] : [])]);
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
      crest: s.crest ?? null,
      current: s.locked ? null : s.current,
      picks: s.picks,
      jokers: s.jokers,
      history: s.history,
      locked: s.locked,
      group: s.group,
      tournament: s.tournament,
      me: s.me,
      watched: s.watched ?? 0,
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
      case "crest": {
        // Écusson parmi les équipes des Worlds, nom libre (2 à 24 caractères)
        const base = MAYHEM_CREST_BY_ID[String(action.id)];
        const name = String(action.name ?? "")
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, MAYHEM_NAME_MAX);
        if (!base) throw new GameError("bad_crest", "Écusson inconnu.");
        if (name.length < 2) throw new GameError("bad_name", "Donne un nom d’au moins 2 caractères à ton équipe.");
        if (s.locked) throw new GameError("locked", "Ton équipe est déjà validée.");
        return { state: { ...s, crest: { ...base, name } }, feedback: {} };
      }
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
      case "watched": {
        if (!s.locked) throw new GameError("not_locked", "Le tournoi n’a pas encore commencé.");
        const step = Math.max(0, Math.min(64, Math.floor(Number(action.step)) || 0));
        return { state: { ...s, watched: Math.max(s.watched ?? 0, step) }, feedback: {} };
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

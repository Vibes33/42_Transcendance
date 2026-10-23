import type { GameContext, GameKey, SiteLang } from "./rules";

// Contrats d'API partagés entre le front et les services.

export type Provider = "google" | "apple" | "discord";

export interface SessionInfo {
  userId: string | null;
  kind: "user" | "guest" | "anonymous";
  provider: Provider | null;
  /** Fournisseurs OAuth configurés sur ce serveur (les autres boutons sont désactivés). */
  providers: Provider[];
  /** Connexion de test activée (développement uniquement). */
  devLogin?: boolean;
  /** Le joueur est connecté avec un compte de test : le panneau de test est disponible. */
  testAccount?: boolean;
}

export interface Profile {
  userId: string;
  kind: "user" | "guest";
  pseudo: string | null;
  tag: string | null;
  role: string | null;
  namesLang: SiteLang;
  siteLang: SiteLang;
  reminder: boolean;
  mode: "sombre" | "clair";
  /** Clé du chibi équipé, ou "random". */
  chibi: string;
  skin: string | null;
  starter: string | null;
  onboarded: boolean;
  tutorials: Record<string, boolean>;
}

export interface PublicPlayer {
  userId: string;
  pseudo: string;
  tag: string;
  /** Clé de chibi (ou "random") et skin, pour l'avatar. */
  chibi: string;
  skin: string | null;
}

export type PresenceState = "online" | "game" | "away" | "offline";

export interface FriendEntry extends PublicPlayer {
  presence: PresenceState;
  note: string;
  lastSeen: number | null;
}

export interface FriendRequest extends PublicPlayer {
  direction: "incoming" | "outgoing";
  at: number;
}

export interface GroupMember extends PublicPlayer {
  status: "member" | "invited";
  leader: boolean;
}

export interface GroupInfo {
  id: string;
  leader: string;
  members: GroupMember[];
}

export interface DailyGame {
  key: GameKey;
  done: boolean;
  basePoints: number;
  /** Points prévisionnels (base + bonus de percentile provisoire). */
  projected: number;
  /** Percentile prévisionnel (part des meilleurs joueurs du jour sur ce jeu) ; null sans performance classable. */
  top: number | null;
  /** Joueurs du jour sur ce jeu. */
  players: number;
  /** Manche jouée (pour la reprendre ou afficher la carte de partage). */
  roundId: string | null;
}

export interface DailyState {
  day: string;
  nextRotationAt: number;
  games: DailyGame[];
  /** null : pas commencé ; sinon mode fixé pour la journée. */
  mode: "solo" | "groupe" | null;
  status: "todo" | "running" | "done" | "closed";
  nextGame: GameKey | null;
  /** Total prévisionnel de la journée, mis à jour au fil des parties des autres joueurs. */
  projectedTotal: number;
  groupSessionId: string | null;
  /** Champion du jour, une fois la manche terminée par le joueur (jamais avant). */
  cdjChampion: string | null;
  cdjFound: boolean;
}

/** État public d'une manche : ne contient jamais la réponse tant que la manche n'est pas finie. */
export interface RoundState<P = unknown> {
  id: string;
  game: GameKey;
  context: GameContext;
  sessionId: string | null;
  startedAt: number;
  endsAt: number | null;
  warmUntil: number | null;
  over: boolean;
  public: P;
  /** Rempli à la fin : réponse et points. */
  reveal: unknown | null;
  points: { base: number; projected: number } | null;
}

export interface LeaderRow extends PublicPlayer {
  rank: number;
  points: number;
  tier: string;
  division: number | null;
  streak: number;
}

export interface ShopItem {
  id: string;
  kind: "chibi" | "skin" | "prestige" | "game";
  ref: string;
  price: number;
  owned: boolean;
  /** Objet à posséder d'abord (le chibi, pour ses skins). */
  requires: string | null;
  featured?: boolean;
  availableUntil?: number;
}

// --- Temps réel : sessions de groupe et de stream ------------------------------------------

export type LiveMemberStatus = "active" | "disconnected" | "away" | "left";

export interface LiveGameResult {
  game: GameKey;
  done: boolean;
  basePoints: number;
  projected: number;
  /** Résumé sans spoiler : essais, score, trouvé… */
  summary: { tries?: number; score?: number; found?: boolean; skinFound?: boolean; champions?: number; correct?: number; rating?: number; wins?: number; durationMs?: number } | null;
}

export interface LiveMember extends PublicPlayer {
  status: LiveMemberStatus;
  ready: boolean;
  /** En tutoriel pendant que le groupe continue (compte comme prêt). */
  tutorial: boolean;
  isGuest: boolean;
  results: LiveGameResult[];
  progress: { tries?: number; score?: number; leftMs?: number; step?: number; found?: boolean; colors?: string } | null;
  total: number;
}

export interface LiveSession {
  id: string;
  kind: "group" | "stream";
  context: GameContext;
  leader: string;
  day: string;
  games: GameKey[];
  index: number;
  phase: "playing" | "recap" | "done";
  members: LiveMember[];
  /** Mode streamer : code à afficher à l'écran et identifiant du streamer. */
  code: string | null;
  streamerId: string | null;
  createdAt: number;
}

export type WsServerMessage =
  | { type: "hello"; userId: string | null }
  | { type: "session"; session: LiveSession | null }
  | { type: "progress"; sessionId: string; userId: string; progress: LiveMember["progress"] }
  | { type: "presence"; userId: string; state: PresenceState; note: string }
  | { type: "notify"; event: string; data: Record<string, unknown> };

export type WsClientMessage =
  | { type: "presence"; state: Exclude<PresenceState, "offline">; note?: string }
  | { type: "watch"; code: string }
  | { type: "ping" };

import { useQuery, useQueryClient, QueryClient } from "@tanstack/react-query";
import type {
  DailyState,
  FriendEntry,
  FriendRequest,
  GameKey,
  GroupInfo,
  LeaderRow,
  LiveSession,
  Profile,
  PublicPlayer,
  RoundState,
  SessionInfo,
  ShopItem
} from "@loltr/shared";
import { get, post } from "./client";

// Requêtes de lecture (react-query) et clés d'invalidation, une par ressource des services.

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: (n, e: any) => n < 2 && (!e?.status || e.status >= 500), refetchOnWindowFocus: true } }
});

export const keys = {
  session: ["session"] as const,
  profile: ["profile"] as const,
  daily: ["daily"] as const,
  me: ["classement-me"] as const,
  history: ["history"] as const,
  leaderboard: (scope: string, period: string) => ["leaderboard", scope, period] as const,
  shop: ["shop"] as const,
  inventory: ["inventory"] as const,
  friends: ["friends"] as const,
  group: ["group"] as const,
  stats: ["stats"] as const,
  live: ["live-session"] as const,
  round: (id: string) => ["round", id] as const
};

export interface ClassementMe {
  balance: number;
  streak: { current: number; best: number };
  season: { number: number; endsAt: number; progress: number; points: number; daysPlayed: number };
  rank: { tier: string; division: number | null; position: number | null; total: number };
  today: { projected: number; games: Record<string, { base: number; bonus: number; projected: number }>; unlocks: string[] };
  recentShards: { delta: number; reason: string; ref: string; at: number }[];
}

export interface HistoryGame {
  game: GameKey;
  result: { found?: boolean; skinFound?: boolean; tries?: number; champions?: number; correct?: number; score?: number; solved?: boolean; durationMs: number };
  base: number;
  bonus: number;
  projected: number;
  top: number;
  ranked: boolean;
  players: number;
}

export interface HistoryDay {
  day: string;
  completed: boolean;
  /** Bonus de percentile définitifs (jour clos à 3 h 30). */
  final: boolean;
  total: number;
  games: HistoryGame[];
}

export interface Leaderboard {
  scope: "mondial" | "copains";
  period: "jour" | "semaine" | "saison" | "toujours";
  season: { number: number; endsAt: number; progress: number };
  rows: LeaderRow[];
  me: LeaderRow | null;
  myRank: { id: string; division: number | null; position: number | null; total: number; points: number } | null;
  friendsTotal: number | null;
}

export interface ShopData {
  balance: number;
  items: ShopItem[];
  featured: { id: string; until: number } | null;
}

export interface FriendsData {
  friends: FriendEntry[];
  requests: FriendRequest[];
  invites: { groupId: string; from: PublicPlayer }[];
}

export interface StatsData {
  byGame: Record<string, { played: number; success: number }>;
  recent: { game: GameKey; context: string; day: string; result: any; basePoints: number | null }[];
  defisCompleted: number;
}

export const useSession = () => useQuery({ queryKey: keys.session, queryFn: () => get<SessionInfo>("/api/auth/session"), staleTime: 60_000 });

export function useProfile(enabled = true) {
  return useQuery({ queryKey: keys.profile, queryFn: () => get<Profile>("/api/profil/me"), enabled });
}

export const useDaily = () => useQuery({ queryKey: keys.daily, queryFn: () => get<DailyState>("/api/jeux/daily"), refetchInterval: 60_000 });

export const useClassementMe = (enabled: boolean) =>
  useQuery({ queryKey: keys.me, queryFn: () => get<ClassementMe>("/api/classement/me"), enabled });

export const useLeaderboard = (scope: "mondial" | "copains", period: "jour" | "semaine" | "saison" | "toujours", enabled = true) =>
  useQuery({ queryKey: keys.leaderboard(scope, period), queryFn: () => get<Leaderboard>(`/api/classement/leaderboard?scope=${scope}&period=${period}`), enabled });

export const useHistory = (enabled = true) =>
  useQuery({ queryKey: keys.history, queryFn: async () => (await get<{ days: HistoryDay[] }>("/api/classement/history?limit=60")).days, enabled });

export const useShop = () => useQuery({ queryKey: keys.shop, queryFn: () => get<ShopData>("/api/classement/shop") });

export const useInventory = (enabled: boolean) =>
  useQuery({ queryKey: keys.inventory, queryFn: async () => (await get<{ items: string[] }>("/api/classement/inventory")).items, enabled });

export const useFriends = (enabled: boolean) => useQuery({ queryKey: keys.friends, queryFn: () => get<FriendsData>("/api/social/friends"), enabled });

export const useGroup = (enabled: boolean) => useQuery({ queryKey: keys.group, queryFn: () => get<GroupInfo | null>("/api/social/group"), enabled });

export const useStats = (enabled: boolean) => useQuery({ queryKey: keys.stats, queryFn: () => get<StatsData>("/api/jeux/stats"), enabled });

export const useRound = (id: string | null) =>
  useQuery({ queryKey: keys.round(id ?? ""), queryFn: () => get<RoundState<any>>(`/api/jeux/rounds/${id}`), enabled: !!id });

export function useInvalidate() {
  const qc = useQueryClient();
  return (...ks: readonly (readonly unknown[])[]) => Promise.all(ks.map((k) => qc.invalidateQueries({ queryKey: k as unknown[] })));
}

export const actions = {
  guest: () => post<{ userId: string; kind: string }>("/api/auth/guest"),
  logout: () => post("/api/auth/logout"),
  devLogin: (name: string) => post("/api/auth/dev-login", { name }),
  liveSession: () => get<{ session: LiveSession | null }>("/api/temps-reel/session")
};

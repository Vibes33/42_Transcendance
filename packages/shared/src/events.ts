import Redis from "ioredis";
import type { GameContext, GameKey } from "./rules";
import type { RoundResult } from "./scoring";

// Événements entre services, transportés par Redis Streams (un flux par domaine).

export const STREAMS = {
  user: "ev:user",
  social: "ev:social",
  round: "ev:round",
  defi: "ev:defi",
  score: "ev:score",
  shop: "ev:shop"
} as const;

export interface EventMap {
  /** auth : un invité vient de se connecter avec un compte. */
  "user.merged": { guestId: string; userId: string; day: string };
  "user.created": { userId: string; kind: "user" | "guest" };
  /** profil : pseudo ou chibi modifié. */
  "profile.updated": { userId: string; pseudo: string; tag: string; avatar: string; chibi: string };
  /** social */
  "friend.request": { from: string; to: string };
  "friend.accepted": { a: string; b: string };
  "friend.removed": { a: string; b: string };
  "group.updated": { groupId: string; members: string[]; leader: string; disbanded?: boolean };
  "group.invite": { groupId: string; from: string; to: string };
  /** jeux */
  "defi.started": { userId: string; day: string; mode: "solo" | "groupe"; groupSessionId: string | null; games: GameKey[] };
  "round.progress": {
    roundId: string;
    userId: string;
    game: GameKey;
    context: GameContext;
    sessionId: string | null;
    /** Avancement public : jamais la réponse. */
    progress: { tries?: number; score?: number; leftMs?: number; step?: number; found?: boolean; colors?: string };
  };
  "round.finished": {
    roundId: string;
    userId: string;
    kind: "user" | "guest";
    day: string;
    game: GameKey;
    context: GameContext;
    sessionId: string | null;
    result: RoundResult;
    basePoints: number;
  };
  "defi.completed": { userId: string; day: string };
  /** classement */
  "points.updated": { userId: string; day: string; projected: number };
  "wallet.updated": { userId: string; balance: number };
  /** classement : jeux classiques débloqués par le défi du jour. */
  "unlock.granted": { userId: string; day: string; items: string[] };
}

export type EventType = keyof EventMap;

export interface EventEnvelope<T extends EventType = EventType> {
  id: string;
  type: T;
  at: number;
  data: EventMap[T];
}

export function createRedis(url = process.env.REDIS_URL ?? "redis://localhost:6379"): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
}

export async function publish<T extends EventType>(redis: Redis, stream: string, type: T, data: EventMap[T]): Promise<string | null> {
  return redis.xadd(stream, "MAXLEN", "~", "100000", "*", "type", type, "at", String(Date.now()), "data", JSON.stringify(data));
}

export interface ConsumeOptions {
  streams: string[];
  group: string;
  consumer: string;
  handler: (ev: EventEnvelope) => Promise<void> | void;
  signal?: AbortSignal;
}

/** Lit des flux avec un groupe de consommateurs : chaque événement est traité une fois par service. */
export async function consume(redis: Redis, opts: ConsumeOptions): Promise<void> {
  for (const s of opts.streams) {
    try {
      await redis.xgroup("CREATE", s, opts.group, "$", "MKSTREAM");
    } catch (e) {
      if (!String(e).includes("BUSYGROUP")) throw e;
    }
  }
  const handle = async (stream: string, id: string, fields: string[]) => {
    const f: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) f[fields[i]] = fields[i + 1];
    try {
      await opts.handler({ id, type: f.type as EventType, at: Number(f.at), data: JSON.parse(f.data ?? "{}") });
      await redis.xack(stream, opts.group, id);
    } catch (e) {
      console.error(`[${opts.group}] échec du traitement de ${f.type} (${id})`, e);
    }
  };
  // Reprend d'abord les messages restés en attente (service redémarré en cours de traitement)
  for (const s of opts.streams) {
    const pending = (await redis.xreadgroup("GROUP", opts.group, opts.consumer, "COUNT", 500, "STREAMS", s, "0")) as [string, [string, string[]][]][] | null;
    for (const [stream, entries] of pending ?? []) for (const [id, fields] of entries) await handle(stream, id, fields);
  }
  while (!opts.signal?.aborted) {
    const res = (await redis.xreadgroup(
      "GROUP", opts.group, opts.consumer, "COUNT", 100, "BLOCK", 5000, "STREAMS", ...opts.streams, ...opts.streams.map(() => ">")
    )) as [string, [string, string[]][]][] | null;
    for (const [stream, entries] of res ?? []) for (const [id, fields] of entries) await handle(stream, id, fields);
  }
}

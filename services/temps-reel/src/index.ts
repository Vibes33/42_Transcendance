import type { PublicPlayer } from "@loltr/shared";
import { consume, createRedis, internal, STREAMS, type EventMap } from "@loltr/shared/server";
import { createTempsReelApp } from "./app";
import { Hub, type Store } from "./hub";

const redis = createRedis();
const store: Store = {
  get: (k) => redis.get(k),
  set: async (k, v, ttl) => {
    if (ttl) await redis.set(k, v, "EX", ttl);
    else await redis.set(k, v);
  },
  del: async (k) => void (await redis.del(k))
};

const hub = new Hub({
  store,
  players: (ids) => (ids.length ? internal<PublicPlayer[]>("profil", `/api/profil/internal/players?ids=${ids.join(",")}`) : Promise.resolve([])),
  groupOf: (userId) => internal<{ id: string; leader: string; members: string[] } | null>("social", `/api/social/internal/group-of/${userId}`),
  friendsOf: async (userId) => (await internal<{ ids: string[] }>("social", `/api/social/internal/friends/${userId}`)).ids,
  projections: (ids, day) => internal("classement", `/api/classement/internal/projections?ids=${ids.join(",")}&day=${day}`),
  forfeit: async (userId, day, upTo) => {
    await internal("jeux", "/api/jeux/internal/forfeit", { body: { userId, day, upTo } });
  }
});

createTempsReelApp(hub).listen({ port: 3000, hostname: "0.0.0.0" });
console.log("temps-reel prêt sur :3000");
setInterval(() => hub.heartbeat().catch(() => {}), 45_000);

// Événements des autres services → sessions en direct et notifications des joueurs connectés.
consume(createRedis(), {
  streams: [STREAMS.round, STREAMS.social, STREAMS.score, STREAMS.shop],
  group: "temps-reel",
  consumer: "temps-reel-1",
  handler: async (ev) => {
    const d = ev.data as any;
    switch (ev.type) {
      case "round.progress":
        hub.onProgress(d as EventMap["round.progress"]);
        break;
      case "round.finished":
        await hub.onRoundFinished(d as EventMap["round.finished"]);
        hub.notify([d.userId], "round.finished", { game: d.game, context: d.context });
        break;
      case "friend.request":
        hub.notify([d.to], "friend.request", { from: d.from });
        break;
      case "friend.accepted":
      case "friend.removed":
        hub.notify([d.a, d.b], ev.type, d);
        break;
      case "group.invite":
        hub.notify([d.to], "group.invite", d);
        break;
      case "group.updated":
        hub.notify(d.members, "group.updated", d);
        await hub.onGroupUpdated(d.groupId, d.members, !!d.disbanded);
        break;
      case "points.updated":
      case "wallet.updated":
      case "unlock.granted":
        hub.notify([d.userId], ev.type, d);
        break;
    }
  }
}).catch((e) => console.error("consommateur temps-reel arrêté", e));

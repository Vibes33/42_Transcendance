import type { PublicPlayer } from "@loltr/shared";
import { consume, createRedis, internal, publish, STREAMS, type EventMap } from "@loltr/shared/server";
import { createSocialApp, type Presence } from "./app";
import { createDb } from "./db";

const redis = createRedis();
const app = createSocialApp({
  db: createDb(),
  publish: (type, data) => publish(redis, STREAMS.social, type, data),
  players: (ids) => (ids.length ? internal<PublicPlayer[]>("profil", "/api/profil/internal/players", { body: { ids } }) : Promise.resolve([])),
  lookup: (q) => internal<PublicPlayer>("profil", `/api/profil/internal/lookup?q=${encodeURIComponent(q)}`).catch(() => null),
  // Présence tenue par le service temps réel dans Redis
  presence: async (ids) => {
    if (!ids.length) return {};
    const vals = await redis.mget(...ids.map((id) => "presence:" + id));
    return Object.fromEntries(ids.map((id, i) => [id, vals[i] ? (JSON.parse(vals[i]!) as Presence) : { state: "offline", note: "", lastSeen: null }]));
  }
});
app.listen({ port: 3000, hostname: "0.0.0.0" });
console.log("social prêt sur :3000");

// Compte supprimé : amitiés, demandes, blocages et groupe effacés.
consume(createRedis(), {
  streams: [STREAMS.user],
  group: "social",
  consumer: "social-1",
  handler: async (ev) => {
    if (ev.type === "user.deleted") await app.forget((ev.data as EventMap["user.deleted"]).userId);
  }
}).catch((e) => console.error("consommateur social arrêté", e));

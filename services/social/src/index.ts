import type { PublicPlayer } from "@loltr/shared";
import { createRedis, internal, publish, STREAMS } from "@loltr/shared/server";
import { createSocialApp, type Presence } from "./app";
import { createDb } from "./db";

const redis = createRedis();
const app = createSocialApp({
  db: createDb(),
  publish: (type, data) => publish(redis, STREAMS.social, type, data),
  players: (ids) => (ids.length ? internal<PublicPlayer[]>("profil", `/api/profil/internal/players?ids=${ids.join(",")}`) : Promise.resolve([])),
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

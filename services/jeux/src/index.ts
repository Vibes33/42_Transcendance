import { consume, createRedis, internal, publish, STREAMS, type EventMap } from "@loltr/shared/server";
import { createJeuxApp, mergeGuest } from "./app";
import { createDb } from "./db";

const redis = createRedis();
const db = createDb();
const app = createJeuxApp({
  db,
  publish: (type, data) => publish(redis, type.startsWith("round") ? STREAMS.round : STREAMS.defi, type, data),
  owns: async (userId, item) => (await internal<{ owns: boolean }>("classement", `/api/classement/internal/owns?userId=${userId}&item=${encodeURIComponent(item)}`)).owns,
  groupOf: (userId) => internal<{ id: string; members: string[] } | null>("social", `/api/social/internal/group-of/${userId}`),
  session: (id) => internal<any>("temps-reel", `/api/temps-reel/internal/session/${id}`).catch(() => null),
  players: (ids) => (ids.length ? internal<any[]>("profil", "/api/profil/internal/players", { body: { ids } }) : Promise.resolve([])),
  friends: async (userId) => (await internal<{ ids: string[] }>("social", `/api/social/internal/friends/${userId}`)).ids,
  projection: (userId, day) => internal<any>("classement", `/api/classement/internal/projection/${userId}/${day}`)
});
app.listen({ port: 3000, hostname: "0.0.0.0" });
console.log("jeux prêt sur :3000");

// Un invité qui se connecte : son défi rejoint son compte (s'il n'en a pas déjà un), et le classement
// suit cette décision. Un compte supprimé : ses manches sont effacées.
consume(createRedis(), {
  streams: [STREAMS.user],
  group: "jeux",
  consumer: "jeux-1",
  handler: async (ev) => {
    if (ev.type === "user.merged") {
      const d = ev.data as EventMap["user.merged"];
      for (const day of mergeGuest(db, d.guestId, d.userId, d.day)) await publish(redis, STREAMS.defi, "defi.merged", { guestId: d.guestId, userId: d.userId, day });
    } else if (ev.type === "user.deleted") app.forget((ev.data as EventMap["user.deleted"]).userId);
  }
}).catch((e) => console.error("consommateur jeux arrêté", e));

setInterval(() => app.closeExpired().catch((e) => console.error("clôture des défis", e)), 60_000);

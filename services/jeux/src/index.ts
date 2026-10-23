import { consume, createRedis, internal, publish, STREAMS } from "@loltr/shared/server";
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
  players: (ids) => (ids.length ? internal<any[]>("profil", `/api/profil/internal/players?ids=${ids.join(",")}`) : Promise.resolve([])),
  friends: async (userId) => (await internal<{ ids: string[] }>("social", `/api/social/internal/friends/${userId}`)).ids,
  projection: (userId, day) => internal<any>("classement", `/api/classement/internal/projection/${userId}/${day}`)
});
app.listen({ port: 3000, hostname: "0.0.0.0" });
console.log("jeux prêt sur :3000");

// Un invité qui se connecte : son défi du jour rejoint son compte (s'il n'en a pas déjà un).
consume(createRedis(), {
  streams: [STREAMS.user],
  group: "jeux",
  consumer: "jeux-1",
  handler: (ev) => {
    if (ev.type === "user.merged") {
      const d = ev.data as { guestId: string; userId: string; day: string };
      mergeGuest(db, d.guestId, d.userId, d.day);
    }
  }
}).catch((e) => console.error("consommateur jeux arrêté", e));

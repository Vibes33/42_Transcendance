import { eq } from "drizzle-orm";
import { consume, createRedis, internal, publish, STREAMS, type EventMap } from "@loltr/shared/server";
import { createProfilApp } from "./app";
import { createDb } from "./db";
import { profiles } from "./schema";

const redis = createRedis();
const db = createDb();
const app = createProfilApp({
  db,
  publish: (type, data) => publish(redis, STREAMS.user, type, data),
  inventory: async (userId) => (await internal<{ items: string[] }>("classement", `/api/classement/internal/inventory/${userId}`)).items,
  grant: (userId, item, reason) => internal("classement", "/api/classement/internal/grant", { body: { userId, item, reason } })
});
app.listen({ port: 3000, hostname: "0.0.0.0" });
console.log("profil prêt sur :3000");

// Invité fusionné dans un compte, ou compte supprimé : son profil (et son pseudo) est libéré.
consume(createRedis(), {
  streams: [STREAMS.user],
  group: "profil",
  consumer: "profil-1",
  handler: (ev) => {
    const id = ev.type === "user.merged" ? (ev.data as EventMap["user.merged"]).guestId : ev.type === "user.deleted" ? (ev.data as EventMap["user.deleted"]).userId : null;
    if (id) db.delete(profiles).where(eq(profiles.userId, id)).run();
  }
}).catch((e) => console.error("consommateur profil arrêté", e));

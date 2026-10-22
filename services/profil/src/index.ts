import { createRedis, internal, publish, STREAMS } from "@loltr/shared/server";
import { createProfilApp } from "./app";
import { createDb } from "./db";

const redis = createRedis();
const app = createProfilApp({
  db: createDb(),
  publish: (type, data) => publish(redis, STREAMS.user, type, data),
  inventory: async (userId) => (await internal<{ items: string[] }>("classement", `/api/classement/internal/inventory/${userId}`)).items,
  grant: (userId, item, reason) => internal("classement", "/api/classement/internal/grant", { body: { userId, item, reason } })
});
app.listen({ port: 3000, hostname: "0.0.0.0" });
console.log("profil prêt sur :3000");

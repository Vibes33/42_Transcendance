import { createRedis, publish, STREAMS } from "@loltr/shared/server";
import { createAuthApp } from "./app";
import { createDb } from "./db";

const redis = createRedis();
const app = createAuthApp({
  db: createDb(),
  publish: (type, data) => publish(redis, STREAMS.user, type, data)
});
app.listen({ port: 3000, hostname: "0.0.0.0" });
console.log("auth prêt sur :3000");

import type { PublicPlayer } from "@loltr/shared";
import { consume, createRedis, internal, publish, STREAMS, type EventMap } from "@loltr/shared/server";
import { createClassementApp } from "./app";
import { createDb } from "./db";
import { finalizeDays, grantDailyUnlocks, mergeGuest, paySeasons, recordCommunity, recordCompleted, recordResult, seasonPlayers, seasonsToPay } from "./core";

const redis = createRedis();
const db = createDb();
const pub = <T extends keyof EventMap>(type: T, data: EventMap[T]) => publish(redis, STREAMS.score, type, data);
const players = (ids: string[]) => (ids.length ? internal<PublicPlayer[]>("profil", `/api/profil/internal/players?ids=${ids.join(",")}`) : Promise.resolve([]));

const app = createClassementApp({
  db,
  publish: (type, data) => publish(redis, type === "wallet.updated" ? STREAMS.shop : STREAMS.score, type, data),
  players,
  friends: async (userId) => (await internal<{ ids: string[] }>("social", `/api/social/internal/friends/${userId}`)).ids
});
app.listen({ port: 3000, hostname: "0.0.0.0" });
console.log("classement prêt sur :3000");

// Résultats du défi du jour, défis terminés, fusions invité → compte, manches de stream.
consume(createRedis(), {
  streams: [STREAMS.round, STREAMS.defi, STREAMS.user],
  group: "classement",
  consumer: "classement-1",
  handler: async (ev) => {
    const now = Date.now();
    if (ev.type === "round.finished") {
      const d = ev.data as EventMap["round.finished"];
      if (d.context === "defi") {
        recordResult(db, d, now);
        await pub("points.updated", { userId: d.userId, day: d.day, projected: 0 });
      } else if (d.context === "streamer" && d.sessionId && d.kind === "user") {
        const s = await internal<{ streamerId: string } | null>("temps-reel", `/api/temps-reel/internal/session/${d.sessionId}`).catch(() => null);
        if (s?.streamerId) recordCommunity(db, s.streamerId, d.userId, d.basePoints || (await import("@loltr/shared")).basePoints(d.result), d.day);
      }
    } else if (ev.type === "defi.completed") {
      const d = ev.data as EventMap["defi.completed"];
      recordCompleted(db, d.userId, d.day, now);
      const items = grantDailyUnlocks(db, d.userId, d.day, now);
      if (items.length) await publish(redis, STREAMS.shop, "unlock.granted", { userId: d.userId, day: d.day, items });
    } else if (ev.type === "user.merged") {
      const d = ev.data as EventMap["user.merged"];
      mergeGuest(db, d.guestId, d.userId, d.day, now);
    }
  }
}).catch((e) => console.error("consommateur classement arrêté", e));

// Toutes les minutes : clôture des jours passés (3 h 30) et versement des fins de saison.
async function jobs() {
  try {
    finalizeDays(db, Date.now());
    for (const season of seasonsToPay(db, Date.now())) {
      const ids = seasonPlayers(db, season);
      const friends = ids.length ? await internal<Record<string, string[]>>("social", `/api/social/internal/friends-of-many?ids=${ids.join(",")}`) : {};
      paySeasons(db, Date.now(), friends);
    }
  } catch (e) {
    console.error("tâches classement", e);
  }
}
setInterval(jobs, 60_000);
jobs();

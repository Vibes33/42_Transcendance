import { basePoints, type PublicPlayer } from "@loltr/shared";
import { consume, createRedis, internal, publish, STREAMS, type EventMap } from "@loltr/shared/server";
import { createClassementApp } from "./app";
import { createDb } from "./db";
import { balanceOf, finalizeDays, forget, grantDailyUnlocks, mergeGuest, paySeasons, recordCommunity, recordCompleted, recordResult, seasonPlayers, seasonsToPay } from "./core";

const redis = createRedis();
const db = createDb();
const pub = <T extends keyof EventMap>(type: T, data: EventMap[T]) => publish(redis, STREAMS.score, type, data);
const players = (ids: string[]) => (ids.length ? internal<PublicPlayer[]>("profil", "/api/profil/internal/players", { body: { ids } }) : Promise.resolve([]));

const app = createClassementApp({
  db,
  publish: (type, data) => publish(redis, type === "wallet.updated" ? STREAMS.shop : STREAMS.score, type, data),
  players,
  friends: async (userId) => (await internal<{ ids: string[] }>("social", `/api/social/internal/friends/${userId}`)).ids
});
app.listen({ port: 3000, hostname: "0.0.0.0" });
console.log("classement prêt sur :3000");

const walletOf = (userId: string) => publish(redis, STREAMS.shop, "wallet.updated", { userId, balance: balanceOf(db, userId) });

// Résultats du défi du jour, défis terminés, fusions invité → compte, manches de stream, comptes supprimés.
consume(createRedis(), {
  streams: [STREAMS.round, STREAMS.defi, STREAMS.user],
  group: "classement",
  consumer: "classement-1",
  handler: async (ev) => {
    const now = Date.now();
    if (ev.type === "round.finished") {
      const d = ev.data as EventMap["round.finished"];
      if (d.context === "defi") {
        if (recordResult(db, d, now)) {
          await pub("points.updated", { userId: d.userId, day: d.day, projected: 0 });
          if (d.game === "cdj") await walletOf(d.userId);
        }
      } else if (d.context === "streamer" && d.sessionId && d.kind === "user") {
        const s = await internal<{ streamerId: string } | null>("temps-reel", `/api/temps-reel/internal/session/${d.sessionId}`).catch(() => null);
        if (s?.streamerId) recordCommunity(db, s.streamerId, d.userId, d.basePoints || basePoints(d.result), d.day, d.roundId);
      }
    } else if (ev.type === "defi.completed") {
      const d = ev.data as EventMap["defi.completed"];
      if (recordCompleted(db, d.userId, d.day, now, d.kind ?? "user")) {
        const items = grantDailyUnlocks(db, d.userId, d.day, now);
        if (items.length) await publish(redis, STREAMS.shop, "unlock.granted", { userId: d.userId, day: d.day, items });
        await walletOf(d.userId);
      }
    } else if (ev.type === "defi.merged") {
      // La fusion est décidée par le service jeux : le classement la suit, jour par jour
      const d = ev.data as EventMap["defi.merged"];
      if (mergeGuest(db, d.guestId, d.userId, d.day, now)) {
        grantDailyUnlocks(db, d.userId, d.day, now);
        await walletOf(d.userId);
      }
    } else if (ev.type === "user.deleted") {
      forget(db, (ev.data as EventMap["user.deleted"]).userId);
    }
  }
}).catch((e) => console.error("consommateur classement arrêté", e));

// Toutes les minutes : clôture des jours passés (3 h 30) et versement des fins de saison.
async function jobs() {
  try {
    const credited = new Set<string>();
    finalizeDays(db, Date.now(), credited);
    for (const season of seasonsToPay(db, Date.now())) {
      const ids = seasonPlayers(db, season);
      const friends = ids.length ? await internal<Record<string, string[]>>("social", "/api/social/internal/friends-of-many", { body: { ids } }) : {};
      paySeasons(db, Date.now(), friends, credited);
    }
    for (const u of credited) await walletOf(u);
  } catch (e) {
    console.error("tâches classement", e);
  }
}
setInterval(jobs, 60_000);
jobs();

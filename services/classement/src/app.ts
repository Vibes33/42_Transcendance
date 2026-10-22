import { Elysia, t } from "elysia";
import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { addDays, dayKey, seasonOf, weekKey, type LeaderRow, type PublicPlayer, type ShopItem } from "@loltr/shared";
import { callerPlugin, fail, health, internalGuard, requireAccount, requireSession, requireTester, type EventMap, type EventType } from "@loltr/shared/server";
import type { Db } from "./db";
import { community, days, inventory, ledger, results, streaks, wallets, weeks } from "./schema";
import { balanceOf, credit, dailyUnlocksOf, ownedItems, periodPoints, projection, projectedTotal, rankOf, streakOf, type Period } from "./core";
import { CATALOG, CATALOG_BY_ID, featuredPrestige, isKnownItem } from "./shop";

export interface ClassementDeps {
  db: Db;
  publish: <T extends EventType>(type: T, data: EventMap[T]) => Promise<unknown>;
  players: (ids: string[]) => Promise<PublicPlayer[]>;
  friends: (userId: string) => Promise<string[]>;
  now?: () => number;
}

export function createClassementApp(deps: ClassementDeps) {
  const { db } = deps;
  const now = deps.now ?? Date.now;

  async function rows(ids: string[], points: Map<string, number>, season: number, today: string): Promise<LeaderRow[]> {
    const sorted = ids.filter((id) => (points.get(id) ?? 0) > 0).sort((a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0));
    const profiles = Object.fromEntries((await deps.players(sorted)).map((p) => [p.userId, p]));
    return sorted
      .filter((id) => profiles[id])
      .map((id, i) => {
        const r = rankOf(db, id, season);
        return { ...profiles[id], rank: i + 1, points: points.get(id) ?? 0, tier: r.id, division: r.division, streak: streakOf(db, id, today).current };
      });
  }

  return new Elysia({ prefix: "/api/classement" })
    .use(callerPlugin)
    .use(health)
    // Points prévisionnels du jour : points de base + bonus selon le classement mondial de chaque jeu.
    .get("/day", ({ caller }) => {
      const me = requireSession(caller);
      const day = dayKey(now());
      const games = projection(db, me, day);
      return { day, games, projectedTotal: Object.values(games).reduce((s, g) => s + g.projected, 0) };
    })
    .get("/me", ({ caller }) => {
      const me = requireSession(caller);
      const today = dayKey(now());
      const season = seasonOf(today, now());
      const rank = rankOf(db, me, season.number);
      const recent = db.select().from(ledger).where(and(eq(ledger.userId, me), gt(ledger.delta, 0))).orderBy(desc(ledger.at)).limit(8).all();
      return {
        balance: balanceOf(db, me),
        streak: streakOf(db, me, today),
        season: { number: season.number, endsAt: season.endsAt, progress: season.progress, points: rank.points, daysPlayed: rank.daysPlayed },
        rank: { tier: rank.id, division: rank.division, position: rank.position, total: rank.total },
        today: { projected: projectedTotal(db, me, today), games: projection(db, me, today), unlocks: dailyUnlocksOf(db, me, today) },
        recentShards: recent.map((l) => ({ delta: l.delta, reason: l.reason, ref: l.ref, at: l.at }))
      };
    })
    .get(
      "/leaderboard",
      async ({ caller, query }) => {
        const today = dayKey(now());
        const season = seasonOf(today, now());
        const period = (query.period ?? "saison") as Period;
        let ids: string[] | null = null;
        if (query.scope === "copains") {
          const me = requireAccount(caller);
          ids = [me, ...(await deps.friends(me))];
        }
        const pts = periodPoints(db, ids, period, now());
        const list = await rows(ids ?? [...pts.keys()], pts, season.number, today);
        const meId = caller.kind === "user" ? caller.id : null;
        const meRow = meId ? list.find((r) => r.userId === meId) ?? null : null;
        return {
          scope: query.scope,
          period,
          season: { number: season.number, endsAt: season.endsAt, progress: season.progress },
          rows: list.slice(0, 100),
          me: meRow,
          myRank: meId ? rankOf(db, meId, season.number) : null,
          friendsTotal: ids ? ids.length : null
        };
      },
      { query: t.Object({ scope: t.Union([t.Literal("mondial"), t.Literal("copains")]), period: t.Optional(t.Union([t.Literal("jour"), t.Literal("semaine"), t.Literal("saison"), t.Literal("toujours")])) }) }
    )
    // Classement persistant de la communauté d'un streamer
    .get("/community/:streamerId", async ({ params }) => {
      const season = seasonOf(dayKey(now()), now()).number;
      const list = db.select().from(community).where(and(eq(community.streamerId, params.streamerId), eq(community.season, season))).orderBy(desc(community.points)).limit(50).all();
      const profiles = Object.fromEntries((await deps.players(list.map((r) => r.userId))).map((p) => [p.userId, p]));
      return { season, rows: list.map((r, i) => ({ rank: i + 1, points: r.points, player: profiles[r.userId] ?? null })) };
    })
    .get("/shop", ({ caller }) => {
      const me = caller.id && caller.kind === "user" ? caller.id : null;
      const owned = new Set(me ? ownedItems(db, me) : []);
      const featured = featuredPrestige(now());
      const items: ShopItem[] = CATALOG.map((i) => ({
        id: i.id,
        kind: i.kind,
        ref: i.ref,
        price: i.price,
        owned: owned.has(i.id),
        requires: i.requires,
        featured: featured?.id === i.id,
        availableUntil: featured?.id === i.id ? featured.until : undefined
      }));
      return { balance: me ? balanceOf(db, me) : 0, items, featured };
    })
    .get("/inventory", ({ caller }) => ({ items: ownedItems(db, requireAccount(caller)) }))
    // Achat en éclats : transaction unique (solde, journal, inventaire), jamais de double débit.
    .post(
      "/shop/buy",
      async ({ caller, body }) => {
        const me = requireAccount(caller);
        const item = CATALOG_BY_ID[body.itemId];
        if (!item) fail(404, "item_not_found");
        const t0 = now();
        db.transaction((tx) => {
          if (tx.select().from(inventory).where(and(eq(inventory.userId, me), eq(inventory.item, item!.id))).get()) fail(409, "already_owned", "Déjà dans ta collection.");
          if (item!.requires && !tx.select().from(inventory).where(and(eq(inventory.userId, me), eq(inventory.item, item!.requires))).get())
            fail(409, "requires_chibi", "Débloque d’abord ce chibi.");
          const bal = tx.select().from(wallets).where(eq(wallets.userId, me)).get()?.balance ?? 0;
          if (bal < item!.price) fail(402, "not_enough", "Pas assez d’éclats.");
          credit(tx, me, -item!.price, "purchase", item!.id, t0);
          tx.insert(inventory).values({ userId: me, item: item!.id, source: "shop", at: t0 }).run();
        });
        const balance = balanceOf(db, me);
        await deps.publish("wallet.updated", { userId: me, balance });
        return { ok: true, balance, items: ownedItems(db, me) };
      },
      { body: t.Object({ itemId: t.String() }) }
    )
    // --- Outils des comptes de test (AUTH_DEV_LOGIN=true) -------------------------------
    .group("/dev", (g) =>
      g
        .post(
          "/shards",
          async ({ caller, body }) => {
            const me = requireTester(caller);
            // Jamais de solde négatif : un retrait est plafonné au solde actuel
            const delta = Math.max(body.amount, -balanceOf(db, me));
            if (delta !== 0) credit(db, me, delta, "dev", crypto.randomUUID(), now());
            const balance = balanceOf(db, me);
            await deps.publish("wallet.updated", { userId: me, balance });
            return { balance };
          },
          { body: t.Object({ amount: t.Integer({ minimum: -1_000_000, maximum: 1_000_000 }) }) }
        )
        // Tout débloquer : chibis, skins, prestiges et jeux classiques
        .post("/unlock-all", async ({ caller }) => {
          const me = requireTester(caller);
          const t0 = now();
          db.transaction((tx) => {
            for (const i of CATALOG) tx.insert(inventory).values({ userId: me, item: i.id, source: "dev", at: t0 }).onConflictDoNothing().run();
          });
          return { items: ownedItems(db, me) };
        })
        // Vider l'inventaire, sauf le premier chibi offert
        .post("/reset-inventory", ({ caller }) => {
          const me = requireTester(caller);
          db.delete(inventory).where(and(eq(inventory.userId, me), ne(inventory.source, "starter"))).run();
          return { items: ownedItems(db, me) };
        })
        // Série affichée : n jours, le prochain défi terminé la prolonge
        .post(
          "/streak",
          ({ caller, body }) => {
            const me = requireTester(caller);
            const today = dayKey(now());
            const row = { current: body.days, best: body.days, lastDay: body.days > 0 ? addDays(today, -1) : null };
            db.insert(streaks)
              .values({ userId: me, ...row })
              .onConflictDoUpdate({ target: streaks.userId, set: { current: row.current, best: sql`max(${streaks.best}, ${body.days})`, lastDay: row.lastDay } })
              .run();
            return streakOf(db, me, today);
          },
          { body: t.Object({ days: t.Integer({ minimum: 0, maximum: 3650 }) }) }
        )
        // Rejouer le défi du jour : résultats, points et éclats du jour effacés
        .post("/reset-day", async ({ caller }) => {
          const me = requireTester(caller);
          const day = dayKey(now());
          db.transaction((tx) => {
            const d = tx.select().from(days).where(and(eq(days.userId, me), eq(days.day, day))).get();
            const gained = tx
              .select()
              .from(ledger)
              .where(and(eq(ledger.userId, me), eq(ledger.ref, day), inArray(ledger.reason, ["daily_completed", "cdj_found"])))
              .all();
            const refund = gained.reduce((a, l) => a + l.delta, 0);
            if (gained.length) {
              tx.delete(ledger).where(inArray(ledger.id, gained.map((l) => l.id))).run();
              tx.update(wallets).set({ balance: sql`max(0, ${wallets.balance} - ${refund})` }).where(eq(wallets.userId, me)).run();
            }
            if (d?.completed)
              tx.update(weeks).set({ completed: sql`max(0, ${weeks.completed} - 1)` }).where(and(eq(weeks.userId, me), eq(weeks.week, weekKey(day)))).run();
            tx.delete(results).where(and(eq(results.userId, me), eq(results.day, day))).run();
            tx.delete(days).where(and(eq(days.userId, me), eq(days.day, day))).run();
          });
          const balance = balanceOf(db, me);
          await deps.publish("wallet.updated", { userId: me, balance });
          return { balance };
        })
    )
    .group("/internal", (g) =>
      g
        .use(internalGuard)
        .get("/inventory/:userId", ({ params }) => ({ items: ownedItems(db, params.userId) }))
        .get("/owns", ({ query }) => ({ owns: ownedItems(db, query.userId).includes(query.item) }), { query: t.Object({ userId: t.String(), item: t.String() }) })
        .post(
          "/grant",
          ({ body }) => {
            if (!isKnownItem(body.item)) fail(400, "unknown_item");
            db.insert(inventory).values({ userId: body.userId, item: body.item, source: body.reason, at: now() }).onConflictDoNothing().run();
            return { ok: true };
          },
          { body: t.Object({ userId: t.String(), item: t.String(), reason: t.String() }) }
        )
        .get("/projection/:userId/:day", ({ params }) => projection(db, params.userId, params.day))
        .get(
          "/projections",
          ({ query }) => Object.fromEntries(query.ids.split(",").filter(Boolean).map((id) => [id, projection(db, id, query.day)])),
          { query: t.Object({ ids: t.String(), day: t.String() }) }
        )
    );
}

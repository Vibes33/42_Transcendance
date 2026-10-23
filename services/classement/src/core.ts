import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import {
  DAILY_UNLOCKS,
  GAMES,
  GAME_KEYS,
  SHARDS,
  SPLASH_CHAMPION_POINTS,
  addDays,
  bonusPoints,
  dayKey,
  forceCloseAt,
  hasPerformance,
  rankFor,
  seasonOf,
  topFraction,
  rotationFor,
  weekKey,
  type GameKey,
  type RoundResult
} from "@loltr/shared";
import type { Db } from "./db";
import { community, days, finalizedDays, inventory, ledger, paidSeasons, results, seasonPoints, streaks, wallets, weeks } from "./schema";

// Règles de points et d'éclats (sections 8 et 9 du cahier des charges).

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Crédite (ou débite) des éclats une seule fois par (joueur, motif, référence). Renvoie false si déjà fait. */
export function credit(tx: Db | Tx, userId: string, delta: number, reason: string, ref: string, at: number): boolean {
  // bun:sqlite renvoie { changes } à l’exécution, même si le type Drizzle annonce void
  const ins = tx.insert(ledger).values({ userId, delta, reason, ref, at }).onConflictDoNothing().run() as unknown as { changes: number };
  if (ins.changes === 0) return false;
  tx.insert(wallets)
    .values({ userId, balance: delta })
    .onConflictDoUpdate({ target: wallets.userId, set: { balance: sql`${wallets.balance} + ${delta}` } })
    .run();
  return true;
}

export function balanceOf(db: Db, userId: string): number {
  return db.select().from(wallets).where(eq(wallets.userId, userId)).get()?.balance ?? 0;
}

export function ownedItems(db: Db, userId: string): string[] {
  return db.select({ i: inventory.item }).from(inventory).where(eq(inventory.userId, userId)).all().map((r) => r.i);
}

export interface GameProjection {
  base: number;
  bonus: number;
  projected: number;
  /** Part des meilleurs joueurs du jour sur ce jeu (0 < top ≤ 1). */
  top: number;
  /** Performance classable : sinon pas de bonus de percentile. */
  ranked: boolean;
  /** Joueurs du jour sur ce jeu. */
  players: number;
}

/** Bonus prévisionnel par jeu : percentile du joueur parmi tous les résultats du jour pour ce jeu. */
export function projection(db: Db, userId: string, day: string): Record<string, GameProjection> {
  const mine = db.select().from(results).where(and(eq(results.userId, userId), eq(results.day, day))).all();
  const out: Record<string, GameProjection> = {};
  for (const r of mine) {
    const all = db.select({ result: results.result }).from(results).where(and(eq(results.day, day), eq(results.game, r.game))).all().map((x) => x.result as RoundResult);
    const me = r.result as RoundResult;
    const top = topFraction(me, all);
    const ranked = hasPerformance(me);
    const bonus = bonusPoints(top, ranked);
    out[r.game] = { base: r.basePoints, bonus, projected: r.basePoints + bonus, top, ranked, players: all.length };
  }
  return out;
}

/** Historique du défi du jour : les dernières journées du joueur, jeu par jeu (percentile définitif une fois le jour clos). */
export function history(db: Db, userId: string, limit: number) {
  const list = db.select().from(days).where(eq(days.userId, userId)).orderBy(desc(days.day)).limit(limit).all();
  return list.map((d) => {
    const proj = projection(db, userId, d.day);
    const rows = db.select().from(results).where(and(eq(results.userId, userId), eq(results.day, d.day))).all();
    const order = rotationFor(d.day);
    const games = rows
      .sort((a, b) => order.indexOf(a.game as GameKey) - order.indexOf(b.game as GameKey))
      .map((r) => ({ game: r.game as GameKey, result: r.result as RoundResult, ...proj[r.game] }));
    const final = !!db.select().from(finalizedDays).where(eq(finalizedDays.day, d.day)).get();
    return { day: d.day, completed: d.completed, final, total: final && d.finalTotal !== null ? d.finalTotal : games.reduce((s, g) => s + g.projected, 0), games };
  });
}

export function projectedTotal(db: Db, userId: string, day: string): number {
  return Object.values(projection(db, userId, day)).reduce((s, g) => s + g.projected, 0);
}

/** Une manche du défi du jour terminée. */
export function recordResult(db: Db, ev: { userId: string; kind: "user" | "guest"; day: string; game: GameKey; result: RoundResult; basePoints: number }, at: number) {
  db.transaction((tx) => {
    tx.insert(results)
      .values({ userId: ev.userId, day: ev.day, game: ev.game, kind: ev.kind, result: ev.result, basePoints: ev.basePoints, finishedAt: at })
      .onConflictDoNothing()
      .run();
    tx.insert(days).values({ userId: ev.userId, day: ev.day, kind: ev.kind }).onConflictDoNothing().run();
    // À confirmer (section 17) : 30 éclats pour un Champion du jour trouvé
    if (ev.game === "cdj" && ev.result.found && SHARDS.cdjFound > 0) credit(tx, ev.userId, SHARDS.cdjFound, "cdj_found", ev.day, at);
  });
}

/** Défi du jour terminé : 10 éclats, série, et 50 éclats au 5e défi de la semaine. */
export function recordCompleted(db: Db, userId: string, day: string, at: number) {
  db.transaction((tx) => {
    tx.update(days).set({ completed: true }).where(and(eq(days.userId, userId), eq(days.day, day))).run();
    credit(tx, userId, SHARDS.dailyCompleted, "daily_completed", day, at);
    const s = tx.select().from(streaks).where(eq(streaks.userId, userId)).get();
    if (!s) tx.insert(streaks).values({ userId, current: 1, best: 1, lastDay: day }).run();
    else if (s.lastDay !== day) {
      const current = s.lastDay === addDays(day, -1) ? s.current + 1 : 1;
      tx.update(streaks).set({ current, best: Math.max(s.best, current), lastDay: day }).where(eq(streaks.userId, userId)).run();
    }
    const week = weekKey(day);
    tx.insert(weeks)
      .values({ userId, week, completed: 1 })
      .onConflictDoUpdate({ target: [weeks.userId, weeks.week], set: { completed: sql`${weeks.completed} + 1` } })
      .run();
    const w = tx.select().from(weeks).where(and(eq(weeks.userId, userId), eq(weeks.week, week))).get()!;
    if (w.completed >= SHARDS.weeklyBonus.minDays) credit(tx, userId, SHARDS.weeklyBonus.shards, "weekly_bonus", week, at);
  });
}

/** Série en cours : remise à zéro si le joueur a manqué un jour. */
export function streakOf(db: Db, userId: string, today: string): { current: number; best: number } {
  const s = db.select().from(streaks).where(eq(streaks.userId, userId)).get();
  if (!s) return { current: 0, best: 0 };
  const alive = s.lastDay === today || s.lastDay === addDays(today, -1);
  return { current: alive ? s.current : 0, best: s.best };
}

/**
 * Clôt les jours passés (après 3 h 30, pour inclure les défis finis en retard) :
 * bonus de percentile définitifs, points de saison, 10 éclats par tranche de 500 points.
 */
export function finalizeDays(db: Db, now: number): string[] {
  const today = dayKey(now);
  const pending = db
    .selectDistinct({ day: days.day })
    .from(days)
    .where(lt(days.day, today))
    .all()
    .map((r) => r.day)
    .filter((d) => now >= forceCloseAt(d) && !db.select().from(finalizedDays).where(eq(finalizedDays.day, d)).get());
  for (const day of pending.sort()) {
    const players = db.select().from(days).where(eq(days.day, day)).all();
    const season = seasonOf(day).number;
    db.transaction((tx) => {
      for (const p of players) {
        const total = Object.values(projection(db, p.userId, day)).reduce((s, g) => s + g.projected, 0);
        tx.update(days).set({ finalTotal: total }).where(and(eq(days.userId, p.userId), eq(days.day, day))).run();
        if (p.kind === "user")
          tx.insert(seasonPoints)
            .values({ userId: p.userId, season, points: total, daysPlayed: 1 })
            .onConflictDoUpdate({ target: [seasonPoints.userId, seasonPoints.season], set: { points: sql`${seasonPoints.points} + ${total}`, daysPlayed: sql`${seasonPoints.daysPlayed} + 1` } })
            .run();
        const chunks = Math.floor(total / 500);
        if (chunks > 0) credit(tx, p.userId, chunks * SHARDS.per500Points, "points_500", day, now);
      }
      tx.insert(finalizedDays).values({ day, at: now }).run();
    });
  }
  return pending;
}

/** Fin de saison : éclats du classement mondial et du classement copains (environ 3 fois moins). */
export function seasonsToPay(db: Db, now: number): number[] {
  const current = seasonOf(dayKey(now)).number;
  return db
    .selectDistinct({ s: seasonPoints.season })
    .from(seasonPoints)
    .where(lt(seasonPoints.season, current))
    .all()
    .map((r) => r.s)
    .filter((s) => !db.select().from(paidSeasons).where(eq(paidSeasons.season, s)).get());
}

export function seasonPlayers(db: Db, season: number): string[] {
  return db.select({ u: seasonPoints.userId }).from(seasonPoints).where(eq(seasonPoints.season, season)).all().map((r) => r.u);
}

export function paySeasons(db: Db, now: number, friends: Record<string, string[]>): number[] {
  const paid: number[] = [];
  for (const season of seasonsToPay(db, now)) {
    const rows = db.select().from(seasonPoints).where(eq(seasonPoints.season, season)).orderBy(desc(seasonPoints.points)).all();
    const pts = Object.fromEntries(rows.map((r) => [r.userId, r]));
    db.transaction((tx) => {
      rows.forEach((r, i) => {
        const tier = SHARDS.seasonGlobal.find((t) => i < t.top);
        if (tier) credit(tx, r.userId, tier.shards, "season_global", String(season), now);
        else if (r.daysPlayed >= SHARDS.seasonGlobalParticipation.minDays) credit(tx, r.userId, SHARDS.seasonGlobalParticipation.shards, "season_global", String(season), now);
        // Copains : seulement avec au moins 4 copains actifs cette saison
        const circle = (friends[r.userId] ?? []).filter((f) => pts[f]?.daysPlayed > 0);
        if (circle.length >= SHARDS.seasonFriendsMinActive) {
          const ranked = [r.userId, ...circle].sort((a, b) => pts[b].points - pts[a].points);
          const pos = ranked.indexOf(r.userId);
          credit(tx, r.userId, SHARDS.seasonFriends[pos] ?? SHARDS.seasonFriendsParticipation, "season_friends", String(season), now);
        }
      });
      tx.insert(paidSeasons).values({ season, at: now }).run();
    });
    paid.push(season);
  }
  return paid;
}

/** Rang (Bronze → Challenger) d'après la part des meilleurs joueurs de la saison. */
export function rankOf(db: Db, userId: string, season: number) {
  const me = db.select().from(seasonPoints).where(and(eq(seasonPoints.userId, userId), eq(seasonPoints.season, season))).get();
  const total = db.select({ n: sql<number>`count(*)` }).from(seasonPoints).where(and(eq(seasonPoints.season, season), gt(seasonPoints.points, 0))).get()?.n ?? 0;
  if (!me || me.points <= 0 || total === 0) return { ...rankFor(1), position: null as number | null, total, points: me?.points ?? 0, daysPlayed: me?.daysPlayed ?? 0 };
  const better = db.select({ n: sql<number>`count(*)` }).from(seasonPoints).where(and(eq(seasonPoints.season, season), gt(seasonPoints.points, me.points))).get()?.n ?? 0;
  return { ...rankFor((better + 1) / total), position: better + 1, total, points: me.points, daysPlayed: me.daysPlayed };
}

/** Points d'un ensemble de joueurs sur une période (définitifs + aujourd'hui en prévisionnel). */
export type Period = "jour" | "semaine" | "saison" | "toujours";

export function periodPoints(db: Db, ids: string[] | null, period: Period, now: number): Map<string, number> {
  const today = dayKey(now);
  const from = period === "jour" ? today : period === "semaine" ? weekKey(today) : period === "saison" ? seasonOf(today, now).startKey : "0000-00-00";
  const out = new Map<string, number>();
  const q = db.select().from(days).where(ids ? and(inArray(days.userId, ids), gt(days.day, addDays(from, -1))) : gt(days.day, addDays(from, -1)));
  for (const d of q.all()) {
    if (d.kind !== "user") continue;
    const v = d.day === today || d.finalTotal === null ? projectedTotal(db, d.userId, d.day) : d.finalTotal;
    out.set(d.userId, (out.get(d.userId) ?? 0) + v);
  }
  return out;
}

/** Fusion invité → compte : la journée de l'invité et ses éclats passent au compte, sauf si le compte a déjà joué. */
export function mergeGuest(db: Db, guestId: string, userId: string, day: string, at: number): boolean {
  if (db.select().from(results).where(and(eq(results.userId, userId), eq(results.day, day))).get()) return false;
  db.transaction((tx) => {
    tx.update(results).set({ userId, kind: "user" }).where(eq(results.userId, guestId)).run();
    tx.update(days).set({ userId, kind: "user" }).where(eq(days.userId, guestId)).run();
    const entries = tx.select().from(ledger).where(eq(ledger.userId, guestId)).all();
    for (const e of entries) credit(tx, userId, e.delta, e.reason, e.ref, at);
    tx.delete(ledger).where(eq(ledger.userId, guestId)).run();
    tx.delete(wallets).where(eq(wallets.userId, guestId)).run();
    const st = tx.select().from(streaks).where(eq(streaks.userId, guestId)).get();
    if (st && !tx.select().from(streaks).where(eq(streaks.userId, userId)).get()) tx.insert(streaks).values({ ...st, userId }).run();
  });
  return true;
}

/** Points d'une manche de stream pour le classement de la communauté du streamer. */
export function recordCommunity(db: Db, streamerId: string, userId: string, points: number, day: string) {
  const season = seasonOf(day).number;
  db.insert(community)
    .values({ streamerId, season, userId, points })
    .onConflictDoUpdate({ target: [community.streamerId, community.season, community.userId], set: { points: sql`${community.points} + ${points}` } })
    .run();
}

/**
 * Défi du jour terminé : déblocage de jeux classiques (le premier de la rotation pas encore à soi,
 * puis un second si au moins 3 jeux sont réussis). Une seule fois par jour ; les invités n'en ont pas.
 */
export function grantDailyUnlocks(db: Db, userId: string, day: string, at: number): string[] {
  const d = db.select().from(days).where(and(eq(days.userId, userId), eq(days.day, day))).get();
  if (!d || d.kind !== "user") return [];
  const source = "daily:" + day;
  if (db.select().from(inventory).where(and(eq(inventory.userId, userId), eq(inventory.source, source))).get()) return [];
  const succeeded = db
    .select()
    .from(results)
    .where(and(eq(results.userId, userId), eq(results.day, day)))
    .all()
    .filter((r) => r.basePoints >= SPLASH_CHAMPION_POINTS).length;
  const count = DAILY_UNLOCKS.onCompleted + (succeeded >= DAILY_UNLOCKS.bonusMinSucceeded ? DAILY_UNLOCKS.bonus : 0);
  const owned = new Set(ownedItems(db, userId));
  // La rotation du jour d'abord, puis les autres jeux classiques
  const order = [...rotationFor(day), ...GAME_KEYS].filter((k, i, a) => a.indexOf(k) === i && GAMES[k].classicPlayable);
  const items = order.map((k) => "game:" + k).filter((id) => !owned.has(id)).slice(0, count);
  for (const item of items) db.insert(inventory).values({ userId, item, source, at }).onConflictDoNothing().run();
  return items;
}

/** Jeux débloqués par le défi d'un jour donné. */
export function dailyUnlocksOf(db: Db, userId: string, day: string): string[] {
  return db.select().from(inventory).where(and(eq(inventory.userId, userId), eq(inventory.source, "daily:" + day))).all().map((r) => r.item);
}

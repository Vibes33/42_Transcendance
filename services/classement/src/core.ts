import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import {
  DAILY_UNLOCKS,
  GAMES,
  GAME_KEYS,
  SHARDS,
  SPLASH_CHAMPION_POINTS,
  addDays,
  bonusPoints,
  compareResults,
  dayKey,
  daysBetween,
  forceCloseAt,
  hasPerformance,
  rankFor,
  seasonOf,
  topOf,
  rotationFor,
  weekKey,
  type GameKey,
  type RoundResult
} from "@loltr/shared";
import type { Db } from "./db";
import { community, communityRounds, days, finalizedDays, inventory, ledger, paidSeasons, results, seasonPoints, streaks, wallets, weeks } from "./schema";

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
  /** Part des joueurs du jour meilleurs que lui sur ce jeu (0 ≤ top < 1). */
  top: number;
  /** Performance classable : sinon pas de bonus de percentile. */
  ranked: boolean;
  /** Joueurs du jour sur ce jeu. */
  players: number;
}

// Résultats du jour par jeu, triés du meilleur au moins bon, gardés en mémoire jusqu'au prochain
// changement : un percentile se lit alors par recherche dichotomique au lieu de tout reparcourir.
const sortedCache = new WeakMap<object, { version: number; byKey: Map<string, RoundResult[]> }>();
const versions = new WeakMap<object, number>();

/** À appeler après tout ajout, déplacement ou effacement de résultats. */
export function resultsChanged(db: Db) {
  versions.set(db, (versions.get(db) ?? 0) + 1);
}

function sortedResults(db: Db, day: string, game: string): RoundResult[] {
  const version = versions.get(db) ?? 0;
  let c = sortedCache.get(db);
  if (!c || c.version !== version) sortedCache.set(db, (c = { version, byKey: new Map() }));
  const key = day + ":" + game;
  let list = c.byKey.get(key);
  if (!list) {
    list = db.select({ result: results.result }).from(results).where(and(eq(results.day, day), eq(results.game, game))).all().map((x) => x.result as RoundResult);
    list.sort(compareResults);
    c.byKey.set(key, list);
  }
  return list;
}

/** Nombre de résultats strictement meilleurs que `me` dans une liste triée. */
function betterThan(sorted: RoundResult[], me: RoundResult): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (compareResults(sorted[mid], me) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Bonus prévisionnel par jeu : percentile du joueur parmi tous les résultats du jour pour ce jeu. */
export function projection(db: Db, userId: string, day: string): Record<string, GameProjection> {
  const mine = db.select().from(results).where(and(eq(results.userId, userId), eq(results.day, day))).all();
  const out: Record<string, GameProjection> = {};
  for (const r of mine) {
    const all = sortedResults(db, day, r.game);
    const me = r.result as RoundResult;
    const top = topOf(betterThan(all, me), all.length);
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

/** Bilan sur toutes les journées jouées (l'historique affiché, lui, est limité aux plus récentes). */
export function historyTotals(db: Db, userId: string) {
  const all = db.select().from(days).where(eq(days.userId, userId)).all();
  const totals = all.map((d) => (d.finalTotal !== null ? d.finalTotal : projectedTotal(db, userId, d.day)));
  return { days: all.length, points: totals.reduce((a, b) => a + b, 0), best: Math.max(0, ...totals) };
}

export function projectedTotal(db: Db, userId: string, day: string): number {
  return Object.values(projection(db, userId, day)).reduce((s, g) => s + g.projected, 0);
}

const isFinalized = (db: Db | Tx, day: string) => !!db.select().from(finalizedDays).where(eq(finalizedDays.day, day)).get();

/** Une manche du défi du jour terminée. Ignorée si le jour est déjà soldé (3 h 30 passé). */
export function recordResult(db: Db, ev: { userId: string; kind: "user" | "guest"; day: string; game: GameKey; result: RoundResult; basePoints: number }, at: number): boolean {
  if (isFinalized(db, ev.day)) return false;
  db.transaction((tx) => {
    tx.insert(results)
      .values({ userId: ev.userId, day: ev.day, game: ev.game, kind: ev.kind, result: ev.result, basePoints: ev.basePoints, finishedAt: at })
      .onConflictDoNothing()
      .run();
    tx.insert(days).values({ userId: ev.userId, day: ev.day, kind: ev.kind }).onConflictDoNothing().run();
    // La série compte les jours joués : un jeu du défi terminé suffit (règle P2)
    markPlayed(tx, ev.userId, ev.day);
    // À confirmer (section 17) : 30 éclats pour un Champion du jour trouvé
    if (ev.game === "cdj" && ev.result.found && SHARDS.cdjFound > 0) credit(tx, ev.userId, SHARDS.cdjFound, "cdj_found", ev.day, at);
  });
  resultsChanged(db);
  return true;
}

/**
 * Jour joué (un jeu du défi terminé) : la série avance d'un jour, ou repart à 1 après un trou. Un
 * jour déjà compté, ou plus ancien que le dernier jour compté, ne change rien.
 */
function markPlayed(tx: Tx, userId: string, day: string) {
  const s = tx.select().from(streaks).where(eq(streaks.userId, userId)).get();
  if (!s) tx.insert(streaks).values({ userId, current: 1, best: 1, lastDay: day }).run();
  else if (!s.lastDay || s.lastDay < day) {
    const current = s.lastDay === addDays(day, -1) ? s.current + 1 : 1;
    tx.update(streaks).set({ current, best: Math.max(s.best, current), lastDay: day }).where(eq(streaks.userId, userId)).run();
  }
}

/**
 * Le jour passe à « terminé » : 10 éclats, semaine et bonus hebdomadaire (la série, elle, avance dès
 * le premier jeu terminé). Ne fait rien si le jour l'était déjà (événement rejoué ou reçu en
 * double) : la semaine n'est comptée qu'une fois.
 */
function completeDay(tx: Tx, userId: string, day: string, kind: "user" | "guest", at: number): boolean {
  const ch = tx
    .insert(days)
    .values({ userId, day, kind, completed: true })
    .onConflictDoUpdate({ target: [days.userId, days.day], set: { completed: true }, where: eq(days.completed, false) })
    .run() as unknown as { changes: number };
  if (ch.changes === 0) return false;
  credit(tx, userId, SHARDS.dailyCompleted, "daily_completed", day, at);
  const week = weekKey(day);
  tx.insert(weeks)
    .values({ userId, week, completed: 1 })
    .onConflictDoUpdate({ target: [weeks.userId, weeks.week], set: { completed: sql`${weeks.completed} + 1` } })
    .run();
  const w = tx.select().from(weeks).where(and(eq(weeks.userId, userId), eq(weeks.week, week))).get()!;
  if (w.completed >= SHARDS.weeklyBonus.minDays) credit(tx, userId, SHARDS.weeklyBonus.shards, "weekly_bonus", week, at);
  return true;
}

/** Défi du jour terminé : 10 éclats, et 50 éclats au 5e défi de la semaine. */
export function recordCompleted(db: Db, userId: string, day: string, at: number, kind: "user" | "guest" = "user"): boolean {
  if (isFinalized(db, day)) return false;
  return db.transaction((tx) => completeDay(tx, userId, day, kind, at));
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
 * bonus de percentile définitifs, points de saison, 10 éclats par tranche de 500 points. Les points
 * se cumulent d'un jour à l'autre (règle P3) : le reste sous une tranche est gardé, pas perdu.
 */
export function finalizeDays(db: Db, now: number, credited?: Set<string>): string[] {
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
        const carry = (tx.select({ c: wallets.pointsCarry }).from(wallets).where(eq(wallets.userId, p.userId)).get()?.c ?? 0) + total;
        const chunks = Math.floor(carry / SHARDS.pointsPerChunk);
        if (chunks > 0 && credit(tx, p.userId, chunks * SHARDS.per500Points, "points_500", day, now)) credited?.add(p.userId);
        const rest = carry - chunks * SHARDS.pointsPerChunk;
        tx.insert(wallets).values({ userId: p.userId, balance: 0, pointsCarry: rest }).onConflictDoUpdate({ target: wallets.userId, set: { pointsCarry: rest } }).run();
      }
      tx.insert(finalizedDays).values({ day, at: now }).run();
    });
  }
  return pending;
}

/**
 * Saisons à payer : finies, et dont tous les jours sont soldés (le dernier jour reste jouable
 * jusqu'à 3 h 30 le premier jour de la saison suivante).
 */
export function seasonsToPay(db: Db, now: number): number[] {
  const current = seasonOf(dayKey(now)).number;
  return db
    .selectDistinct({ s: seasonPoints.season })
    .from(seasonPoints)
    .where(lt(seasonPoints.season, current))
    .all()
    .map((r) => r.s)
    .filter((s) => {
      if (db.select().from(paidSeasons).where(eq(paidSeasons.season, s)).get()) return false;
      const cur = seasonOf(dayKey(now));
      const len = daysBetween(cur.startKey, cur.endKey) + 1;
      const start = addDays(cur.startKey, -(current - s) * len);
      const end = addDays(start, len - 1);
      if (now < forceCloseAt(end)) return false;
      return !db
        .selectDistinct({ day: days.day })
        .from(days)
        .where(and(gt(days.day, addDays(start, -1)), lt(days.day, addDays(end, 1))))
        .all()
        .some((d) => !isFinalized(db, d.day));
    });
}

export function seasonPlayers(db: Db, season: number): string[] {
  return db.select({ u: seasonPoints.userId }).from(seasonPoints).where(eq(seasonPoints.season, season)).all().map((r) => r.u);
}

export function paySeasons(db: Db, now: number, friends: Record<string, string[]>, credited?: Set<string>): number[] {
  const paid: number[] = [];
  for (const season of seasonsToPay(db, now)) {
    // Seuls les joueurs avec des points sont payés ; des ex aequo partagent le même rang (et le même palier)
    const rows = db.select().from(seasonPoints).where(and(eq(seasonPoints.season, season), gt(seasonPoints.points, 0))).orderBy(desc(seasonPoints.points)).all();
    const pts = Object.fromEntries(rows.map((r) => [r.userId, r]));
    const ranks: number[] = [];
    rows.forEach((r, i) => ranks.push(i > 0 && r.points === rows[i - 1].points ? ranks[i - 1] : i));
    db.transaction((tx) => {
      rows.forEach((r, i) => {
        const tier = SHARDS.seasonGlobal.find((t) => ranks[i] < t.top);
        if (tier) credit(tx, r.userId, tier.shards, "season_global", String(season), now);
        else if (r.daysPlayed >= SHARDS.seasonGlobalParticipation.minDays) credit(tx, r.userId, SHARDS.seasonGlobalParticipation.shards, "season_global", String(season), now);
        credited?.add(r.userId);
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

/**
 * Rang (Bronze → Challenger) et position mondiale d'après les points de la saison, journée en cours
 * comprise en prévisionnel : les mêmes points que le classement mondial affiché. `points` évite de
 * les recalculer pour chaque ligne d'un classement.
 */
export function rankOf(db: Db, userId: string, season: number, now: number, points = periodPoints(db, null, "saison", now)) {
  const me = db.select().from(seasonPoints).where(and(eq(seasonPoints.userId, userId), eq(seasonPoints.season, season))).get();
  const daysPlayed = me?.daysPlayed ?? 0;
  const mine = points.get(userId) ?? 0;
  const all = [...points.values()].filter((p) => p > 0);
  if (mine <= 0 || all.length === 0) return { ...rankFor(1), position: null as number | null, total: all.length, points: mine, daysPlayed };
  const better = all.filter((p) => p > mine).length;
  return { ...rankFor(topOf(better, all.length)), position: better + 1, total: all.length, points: mine, daysPlayed };
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

/**
 * Fusion invité → compte d'un jour donné, décidée par le service jeux (événement `defi.merged`) :
 * résultats, journée, éclats du jour, série et semaine passent au compte. Refusée si le compte a
 * déjà des résultats ce jour-là.
 */
export function mergeGuest(db: Db, guestId: string, userId: string, day: string, at: number): boolean {
  if (db.select().from(results).where(and(eq(results.userId, userId), eq(results.day, day))).get()) return false;
  const guestDay = db.select().from(days).where(and(eq(days.userId, guestId), eq(days.day, day))).get();
  db.transaction((tx) => {
    const movedResults = tx.update(results).set({ userId, kind: "user" }).where(and(eq(results.userId, guestId), eq(results.day, day))).run() as unknown as { changes: number };
    if (movedResults.changes > 0) markPlayed(tx, userId, day);
    if (guestDay) {
      tx.delete(days).where(and(eq(days.userId, guestId), eq(days.day, day))).run();
      tx.insert(days).values({ userId, day, kind: "user", completed: false, finalTotal: guestDay.finalTotal }).onConflictDoNothing().run();
    }
    // Éclats gagnés ce jour-là (Champion du jour trouvé, tranches de points) ; le défi terminé et la
    // semaine sont recomptés pour le compte
    const entries = tx.select().from(ledger).where(and(eq(ledger.userId, guestId), eq(ledger.ref, day))).all();
    for (const e of entries) credit(tx, userId, e.delta, e.reason, e.ref, at);
    if (guestDay?.completed) completeDay(tx, userId, day, "user", at);
    const moved = entries.reduce((a, e) => a + e.delta, 0);
    tx.delete(ledger).where(and(eq(ledger.userId, guestId), eq(ledger.ref, day))).run();
    tx.update(wallets).set({ balance: sql`max(0, ${wallets.balance} - ${moved})` }).where(eq(wallets.userId, guestId)).run();
    // Points pas encore convertis de l'invité : ils rejoignent le reste du compte
    const guestCarry = tx.select({ c: wallets.pointsCarry }).from(wallets).where(eq(wallets.userId, guestId)).get()?.c ?? 0;
    if (guestCarry > 0) {
      tx.insert(wallets).values({ userId, balance: 0, pointsCarry: guestCarry }).onConflictDoUpdate({ target: wallets.userId, set: { pointsCarry: sql`${wallets.pointsCarry} + ${guestCarry}` } }).run();
      tx.update(wallets).set({ pointsCarry: 0 }).where(eq(wallets.userId, guestId)).run();
    }
  });
  resultsChanged(db);
  return true;
}

/** Compte supprimé : tout ce que le classement garde de lui est effacé. */
export function forget(db: Db, userId: string) {
  db.transaction((tx) => {
    tx.delete(results).where(eq(results.userId, userId)).run();
    tx.delete(days).where(eq(days.userId, userId)).run();
    tx.delete(seasonPoints).where(eq(seasonPoints.userId, userId)).run();
    tx.delete(weeks).where(eq(weeks.userId, userId)).run();
    tx.delete(wallets).where(eq(wallets.userId, userId)).run();
    tx.delete(ledger).where(eq(ledger.userId, userId)).run();
    tx.delete(inventory).where(eq(inventory.userId, userId)).run();
    tx.delete(streaks).where(eq(streaks.userId, userId)).run();
    tx.delete(community).where(or(eq(community.userId, userId), eq(community.streamerId, userId))).run();
  });
  resultsChanged(db);
}

/** Points d'une manche de stream pour le classement de la communauté du streamer (une fois par manche). */
export function recordCommunity(db: Db, streamerId: string, userId: string, points: number, day: string, roundId: string) {
  const once = db.insert(communityRounds).values({ roundId }).onConflictDoNothing().run() as unknown as { changes: number };
  if (once.changes === 0) return;
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

import { describe, expect, test } from "bun:test";
import { BONUS_TIERS, dayKey, type RoundResult } from "@loltr/shared";
import { createClassementApp } from "./app";
import { balanceOf, finalizeDays, grantDailyUnlocks, mergeGuest, paySeasons, projection, recordCompleted, recordResult, streakOf } from "./core";
import { rotationFor } from "@loltr/shared";
import { createDb } from "./db";

const T = Date.UTC(2026, 9, 21, 12, 0);
const DAY = dayKey(T);

function cdj(userId: string, tries: number, found = true, kind: "user" | "guest" = "user") {
  return { userId, kind, day: DAY, game: "cdj" as const, result: { game: "cdj", found, tries, durationMs: 60_000 } as RoundResult, basePoints: found ? 100 : 0 };
}

describe("classement", () => {
  test("bonus de percentile : le meilleur du jour reçoit le palier le plus haut", () => {
    const db = createDb(":memory:");
    for (let i = 1; i <= 100; i++) recordResult(db, cdj("u" + i, i % 20 + 1), T);
    recordResult(db, cdj("best", 1), T);
    const p = projection(db, "best", DAY).cdj;
    expect(p.base).toBe(100);
    expect(p.bonus).toBe(BONUS_TIERS[0].points); // ex aequo : on prend le meilleur rang
    expect(projection(db, "u19", DAY).cdj.bonus).toBeLessThan(p.bonus);
    // pas trouvé : ni base ni bonus
    recordResult(db, cdj("nul", 20, false), T);
    expect(projection(db, "nul", DAY).cdj.projected).toBe(0);
  });

  test("défi terminé : 10 éclats une seule fois, série et bonus de la semaine", () => {
    const db = createDb(":memory:");
    // lundi 19 → vendredi 23 octobre 2026
    for (const d of ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]) {
      recordResult(db, { ...cdj("u1", 3), day: d }, T);
      recordCompleted(db, "u1", d, T);
      recordCompleted(db, "u1", d, T); // rejoué : pas de double versement
    }
    // 5 × (10 terminé + 30 Champion du jour trouvé) + 50 bonus hebdomadaire
    expect(balanceOf(db, "u1")).toBe(5 * 40 + 50);
    expect(streakOf(db, "u1", "2026-10-23").current).toBe(5);
    expect(streakOf(db, "u1", "2026-10-25").current).toBe(0);
  });

  test("clôture du jour : points de saison et éclats par tranche de 500", () => {
    const db = createDb(":memory:");
    recordResult(db, cdj("u1", 1), T);
    const later = T + 2 * 86_400_000;
    expect(finalizeDays(db, later)).toEqual([DAY]);
    expect(finalizeDays(db, later)).toEqual([]);
  });

  test("fusion invité → compte, sauf si le compte a déjà joué", () => {
    const db = createDb(":memory:");
    recordResult(db, cdj("g1", 2, true, "guest"), T);
    recordCompleted(db, "g1", DAY, T);
    expect(mergeGuest(db, "g1", "u1", DAY, T)).toBe(true);
    expect(balanceOf(db, "u1")).toBe(40);
    expect(balanceOf(db, "g1")).toBe(0);
    recordResult(db, cdj("g2", 2, true, "guest"), T);
    expect(mergeGuest(db, "g2", "u1", DAY, T)).toBe(false);
  });

  test("fin de saison : copains comptés seulement avec 4 copains actifs", () => {
    const db = createDb(":memory:");
    const users = ["a", "b", "c", "d", "e"];
    users.forEach((u, i) => recordResult(db, { ...cdj(u, i + 1), day: "2026-09-10" }, T));
    finalizeDays(db, Date.UTC(2026, 8, 12));
    const friends = Object.fromEntries(users.map((u) => [u, users.filter((x) => x !== u)]));
    expect(paySeasons(db, T, friends)).toEqual([1]);
    // a est 1er mondial (600) et 1er de ses copains (120), en plus des éclats du jour
    expect(balanceOf(db, "a")).toBeGreaterThanOrEqual(600 + 120);
    expect(paySeasons(db, T, friends)).toEqual([]);
  });

  test("boutique : achat en éclats, prérequis et solde", async () => {
    const db = createDb(":memory:");
    const app = createClassementApp({ db, publish: async () => {}, players: async () => [], friends: async () => [], now: () => T });
    const buy = (itemId: string) =>
      app.handle(new Request("http://localhost/api/classement/shop/buy", { method: "POST", headers: { "x-user-id": "u1", "x-user-kind": "user", "content-type": "application/json" }, body: JSON.stringify({ itemId }) }));
    expect((await buy("game:meli")).status).toBe(402);
    for (let i = 0; i < 30; i++) recordCompleted(db, "u1", "2026-01-" + String(i + 1).padStart(2, "0"), T);
    expect((await buy("skin:lux-sg")).status).toBe(409); // il faut d'abord le chibi Lux
    expect((await buy("game:meli")).status).toBe(200);
    expect((await buy("game:meli")).status).toBe(409);
  });

  test("outils de test : réservés aux comptes de test quand AUTH_DEV_LOGIN=true", async () => {
    const db = createDb(":memory:");
    const app = createClassementApp({ db, publish: async () => {}, players: async () => [], friends: async () => [], now: () => T });
    const call = (path: string, body: unknown, test: boolean) =>
      app.handle(
        new Request("http://localhost/api/classement" + path, {
          method: "POST",
          headers: { "x-user-id": "u1", "x-user-kind": "user", "content-type": "application/json", ...(test ? { "x-user-test": "1" } : {}) },
          body: JSON.stringify(body)
        })
      );
    const prev = process.env.AUTH_DEV_LOGIN;
    process.env.AUTH_DEV_LOGIN = "true";
    expect((await call("/dev/shards", { amount: 500 }, false)).status).toBe(404);
    expect(((await (await call("/dev/shards", { amount: 500 }, true)).json()) as any).balance).toBe(500);
    expect(((await (await call("/dev/shards", { amount: -9999 }, true)).json()) as any).balance).toBe(0);
    process.env.AUTH_DEV_LOGIN = "false";
    expect((await call("/dev/shards", { amount: 500 }, true)).status).toBe(404);
    process.env.AUTH_DEV_LOGIN = prev;
  });

  test("défi terminé : 1 jeu classique débloqué, 2 avec au moins 3 jeux réussis, une fois par jour", () => {
    const db = createDb(":memory:");
    const play = (u: string, day: string, ok: boolean) => {
      for (const game of rotationFor(day))
        recordResult(db, { userId: u, kind: "user", day, game, result: { game, found: ok, tries: 2, champions: ok ? 12 : 0, correct: ok ? 15 : 0, durationMs: 1 } as RoundResult, basePoints: ok ? 100 : 0 }, T);
      recordCompleted(db, u, day, T);
    };
    play("faible", DAY, false);
    expect(grantDailyUnlocks(db, "faible", DAY, T)).toHaveLength(1);
    expect(grantDailyUnlocks(db, "faible", DAY, T)).toEqual([]); // déjà fait aujourd'hui
    play("fort", DAY, true);
    const two = grantDailyUnlocks(db, "fort", DAY, T);
    expect(two).toHaveLength(2);
    // le premier débloqué suit l'ordre de la rotation du jour
    expect(two[0]).toBe("game:" + rotationFor(DAY).find((k) => k !== "cdj"));
    // les invités ne débloquent rien
    recordResult(db, { ...cdj("g1", 1, true, "guest") }, T);
    expect(grantDailyUnlocks(db, "g1", DAY, T)).toEqual([]);
  });
});

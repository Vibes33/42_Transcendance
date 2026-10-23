import { Elysia, t } from "elysia";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  GAMES,
  basePoints,
  dayKey,
  forceCloseAt,
  nextRotationAt,
  randomSeed,
  type DailyState,
  type GameContext,
  type GameKey,
  type RoundState
} from "@loltr/shared";
import { callerPlugin, fail, health, internalGuard, requireSession, requireTester, type Caller, type EventMap, type EventType } from "@loltr/shared/server";
import type { Db } from "./db";
import { daily, rounds, seen } from "./schema";
import { ENGINES } from "./games";
import { rotationFor } from "@loltr/shared";

export interface JeuxDeps {
  db: Db;
  publish: <T extends EventType>(type: T, data: EventMap[T]) => Promise<unknown>;
  /** L'utilisateur possède-t-il cet objet (déblocage d'un jeu classique : "game:meli") ? */
  owns: (userId: string, item: string) => Promise<boolean>;
  /** Membres du groupe de l'utilisateur (lui compris), ou null. */
  groupOf: (userId: string) => Promise<{ id: string; members: string[] } | null>;
  /** Session temps réel (groupe ou stream) : graine partagée et membres. */
  session: (sessionId: string) => Promise<{ kind: "group" | "stream"; seed: string; members: string[]; game?: string | null } | null>;
  /** Points prévisionnels de la journée (service classement), au mieux. */
  projection: (userId: string, day: string) => Promise<Record<string, { base: number; projected: number; top?: number; ranked?: boolean; players?: number }>>;
  fetchImage?: (url: string) => Promise<Response>;
  now?: () => number;
}

type RoundRow = typeof rounds.$inferSelect;
const RECENT_SEEN = 400;

export function createJeuxApp(deps: JeuxDeps) {
  const { db } = deps;
  const now = deps.now ?? Date.now;
  const imageCache = new Map<string, { body: ArrayBuffer; type: string }>();

  function seenSet(userId: string, game: string): Set<string> {
    const rows = db.select({ k: seen.contentKey }).from(seen).where(and(eq(seen.userId, userId), eq(seen.game, game))).orderBy(desc(seen.at)).limit(RECENT_SEEN).all();
    return new Set(rows.map((r) => r.k));
  }

  function dailyRow(userId: string, day: string) {
    return db.select().from(daily).where(and(eq(daily.userId, userId), eq(daily.day, day))).get() ?? null;
  }

  /** Jour de rattachement du défi : un défi commencé la veille reste jouable jusqu'à 3 h 30. */
  function activeDay(userId: string, t: number): string {
    const today = dayKey(t);
    const prev = db.select().from(daily).where(and(eq(daily.userId, userId), eq(daily.status, "running"))).orderBy(desc(daily.startedAt)).get();
    if (prev && prev.day !== today) {
      if (t < forceCloseAt(prev.day)) return prev.day;
      db.update(daily).set({ status: "closed" }).where(and(eq(daily.userId, userId), eq(daily.day, prev.day))).run();
    }
    return today;
  }

  function defiRounds(userId: string, day: string) {
    return db.select().from(rounds).where(and(eq(rounds.userId, userId), eq(rounds.day, day), eq(rounds.context, "defi"))).all();
  }

  async function dailyState(userId: string, t: number): Promise<DailyState> {
    const day = activeDay(userId, t);
    const row = dailyRow(userId, day);
    const games = (row?.games as GameKey[]) ?? rotationFor(day);
    const played = defiRounds(userId, day);
    const proj = await deps.projection(userId, day).catch(() => ({}) as Awaited<ReturnType<JeuxDeps["projection"]>>);
    const list = games.map((key) => {
      const r = played.find((x) => x.game === key && x.over);
      const base = r?.basePoints ?? 0;
      const any = r ?? played.find((x) => x.game === key);
      const p = r ? proj[key] : undefined;
      return { key, done: !!r, basePoints: base, projected: p?.projected ?? base, top: p?.ranked && p.top !== undefined ? p.top : null, players: p?.players ?? 0, roundId: any?.id ?? null };
    });
    const cdj = played.find((x) => x.game === "cdj" && x.over);
    const next = list.find((g) => !g.done)?.key ?? null;
    return {
      day,
      nextRotationAt: nextRotationAt(t),
      games: list,
      mode: row?.mode ?? null,
      status: !row ? "todo" : row.status === "closed" ? "closed" : next ? "running" : "done",
      nextGame: row?.status === "closed" ? null : next,
      projectedTotal: list.reduce((s, g) => s + g.projected, 0),
      groupSessionId: row?.sessionId ?? null,
      cdjChampion: cdj ? ((cdj.state as { target: string }).target ?? null) : null,
      cdjFound: !!(cdj?.result as { found?: boolean } | null)?.found
    };
  }

  function toState(r: RoundRow, t: number): RoundState {
    const e = ENGINES[r.game as GameKey];
    const timers = e.timers?.(r.state) ?? { endsAt: null, warmUntil: null };
    return {
      id: r.id,
      game: r.game as GameKey,
      context: r.context as GameContext,
      sessionId: r.sessionId,
      startedAt: r.startedAt,
      endsAt: timers.endsAt,
      warmUntil: timers.warmUntil,
      over: r.over,
      public: e.publicState(r.state, t),
      reveal: r.over ? e.reveal(r.state) : null,
      points: r.over ? { base: r.basePoints ?? 0, projected: r.basePoints ?? 0 } : null
    };
  }

  /** Clôt une manche : résultat, points de base, événements ; marque le défi terminé au besoin. */
  async function finalize(r: RoundRow, t: number): Promise<RoundRow> {
    if (r.over) return r;
    const e = ENGINES[r.game as GameKey];
    const state = e.finish(r.state, t);
    const result = e.result(state, t);
    const base = r.context === "defi" ? basePoints(result) : 0;
    db.update(rounds).set({ state, over: true, result, basePoints: base, finishedAt: t }).where(eq(rounds.id, r.id)).run();
    const done = { ...r, state, over: true, result, basePoints: base, finishedAt: t };
    await deps.publish("round.finished", {
      roundId: r.id,
      userId: r.userId,
      kind: r.kind as "user" | "guest",
      day: r.day,
      game: r.game as GameKey,
      context: r.context as GameContext,
      sessionId: r.sessionId,
      result,
      basePoints: base
    });
    if (r.context === "defi") {
      const row = dailyRow(r.userId, r.day);
      const played = defiRounds(r.userId, r.day).filter((x) => x.over || x.id === r.id);
      if (row && (row.games as string[]).every((g) => played.some((p) => p.game === g))) {
        db.update(daily).set({ status: "done" }).where(and(eq(daily.userId, r.userId), eq(daily.day, r.day))).run();
        await deps.publish("defi.completed", { userId: r.userId, day: r.day });
      }
    }
    return done;
  }

  async function loadRound(id: string, caller: Caller): Promise<RoundRow> {
    const me = requireSession(caller);
    const r = db.select().from(rounds).where(eq(rounds.id, id)).get();
    if (!r || r.userId !== me) fail(404, "round_not_found");
    const t = now();
    if (!r!.over && ENGINES[r!.game as GameKey].isOver(r!.state, t)) return finalize(r!, t);
    return r!;
  }

  /** Le jeu classique est-il débloqué (par moi, ou par un membre de mon groupe) ? */
  async function classicUnlocked(userId: string, game: GameKey): Promise<boolean> {
    if (await deps.owns(userId, "game:" + game)) return true;
    const g = await deps.groupOf(userId);
    if (!g) return false;
    for (const m of g.members) if (m !== userId && (await deps.owns(m, "game:" + game))) return true;
    return false;
  }

  return new Elysia({ prefix: "/api/jeux" })
    .use(callerPlugin)
    .use(health)
    .get("/rotation", () => {
      const day = dayKey(now());
      return { day, games: rotationFor(day), nextRotationAt: nextRotationAt(now()) };
    })
    .get("/daily", ({ caller }) => {
      if (!caller.id) {
        const day = dayKey(now());
        return { day, nextRotationAt: nextRotationAt(now()), games: rotationFor(day).map((key) => ({ key, done: false, basePoints: 0, projected: 0, top: null, players: 0, roundId: null })), mode: null, status: "todo", nextGame: "cdj", projectedTotal: 0, groupSessionId: null, cdjChampion: null, cdjFound: false } satisfies DailyState;
      }
      return dailyState(caller.id, now());
    })
    // Démarre le défi du jour : le mode (solo ou groupe) est fixé pour la journée.
    .post(
      "/daily/start",
      async ({ caller, body }) => {
        const me = requireSession(caller);
        const t = now();
        const day = activeDay(me, t);
        const row = dailyRow(me, day);
        if (row) {
          if (row.mode !== body.mode) fail(409, "mode_locked", row.mode === "solo" ? "Tu as déjà commencé le défi du jour en solo." : "Tu as déjà commencé le défi du jour en groupe.");
          if (body.mode === "groupe" && body.sessionId && row.sessionId !== body.sessionId) {
            db.update(daily).set({ sessionId: body.sessionId }).where(and(eq(daily.userId, me), eq(daily.day, day))).run();
          }
          return dailyState(me, t);
        }
        if (caller.kind === "guest") {
          // Un même appareil ne peut produire qu'un seul défi par jour
          if (!caller.device) fail(400, "device_required");
          const other = db.select().from(daily).where(and(eq(daily.deviceId, caller.device!), eq(daily.day, day), eq(daily.kind, "guest"), ne(daily.userId, me))).get();
          if (other) fail(409, "device_used", "Le défi du jour a déjà été joué depuis cet appareil.");
        }
        if (body.mode === "groupe") {
          if (caller.kind !== "user") fail(403, "account_required");
          const s = body.sessionId ? await deps.session(body.sessionId) : null;
          if (!s || s.kind !== "group" || !s.members.includes(me)) fail(403, "not_in_session");
        }
        db.insert(daily)
          .values({ userId: me, day, kind: caller.kind === "guest" ? "guest" : "user", mode: body.mode, sessionId: body.sessionId ?? null, games: rotationFor(day), status: "running", deviceId: caller.device, startedAt: t })
          .run();
        await deps.publish("defi.started", { userId: me, day, mode: body.mode, groupSessionId: body.sessionId ?? null, games: rotationFor(day) });
        return dailyState(me, t);
      },
      { body: t.Object({ mode: t.Union([t.Literal("solo"), t.Literal("groupe")]), sessionId: t.Optional(t.String()) }) }
    )
    // Nouvelle manche : défi du jour (le prochain jeu de la rotation), classique (jeu débloqué) ou stream.
    .post(
      "/rounds",
      async ({ caller, body }) => {
        const me = requireSession(caller);
        const game = body.game as GameKey;
        if (!ENGINES[game]) fail(400, "unknown_game");
        const t = now();
        let day = dayKey(t);
        let seed = randomSeed();
        if (body.context === "defi") {
          day = activeDay(me, t);
          const st = await dailyState(me, t);
          const row = dailyRow(me, day);
          if (!row) fail(409, "daily_not_started");
          if (st.status === "closed") fail(409, "daily_closed", "Le défi d’hier est clos.");
          if (st.nextGame !== game) fail(409, "not_next_game");
          // Reprise d'une manche en cours (reconnexion) : même instance, le chrono serveur a continué
          const open = defiRounds(me, day).find((x) => x.game === game && !x.over);
          if (open) {
            const cur = ENGINES[game].isOver(open.state, t) ? await finalize(open, t) : open;
            return toState(cur, t);
          }
        } else if (body.context === "classique") {
          if (!GAMES[game].classicPlayable) fail(403, "not_classic", "Ce jeu se joue uniquement dans le défi du jour.");
          if (caller.kind !== "user") fail(403, "account_required");
          if (!(await classicUnlocked(me, game))) fail(402, "locked", "Débloque ce jeu à la boutique pour y jouer en illimité.");
        } else {
          // Mode streamer : même contenu pour toute la session (graine partagée), jamais de points classés
          const s = body.sessionId ? await deps.session(body.sessionId) : null;
          if (!s || s.kind !== "stream" || !s.members.includes(me)) fail(403, "not_in_session");
          seed = s!.seed + ":" + game;
        }
        const engine = ENGINES[game];
        const { state, contentKey } = engine.create({ seed, now: t, seen: body.context === "streamer" ? new Set() : seenSet(me, game) });
        const id = crypto.randomUUID();
        db.transaction((tx) => {
          tx.insert(rounds)
            .values({ id, userId: me, kind: caller.kind === "guest" ? "guest" : "user", day, game, context: body.context, sessionId: body.context === "defi" ? (dailyRow(me, day)?.sessionId ?? null) : (body.sessionId ?? null), state, startedAt: t })
            .run();
          tx.insert(seen).values({ userId: me, game, contentKey, at: t }).onConflictDoUpdate({ target: [seen.userId, seen.game, seen.contentKey], set: { at: t } }).run();
        });
        return toState(db.select().from(rounds).where(eq(rounds.id, id)).get()!, t);
      },
      {
        body: t.Object({
          game: t.String(),
          context: t.Union([t.Literal("defi"), t.Literal("classique"), t.Literal("streamer")]),
          sessionId: t.Optional(t.String())
        })
      }
    )
    .get("/rounds/:id", async ({ caller, params }) => toState(await loadRound(params.id, caller), now()))
    .post(
      "/rounds/:id/act",
      async ({ caller, params, body }) => {
        const r = await loadRound(params.id, caller);
        const t = now();
        if (r.over) fail(409, "round_over", "La manche est terminée.");
        const engine = ENGINES[r.game as GameKey];
        const { state, feedback } = engine.act(r.state, body as Record<string, unknown>, t);
        db.update(rounds).set({ state }).where(eq(rounds.id, r.id)).run();
        let cur: RoundRow = { ...r, state };
        if (engine.isOver(state, t)) cur = await finalize(cur, t);
        if (r.sessionId || r.context === "defi") {
          await deps.publish("round.progress", {
            roundId: r.id,
            userId: r.userId,
            game: r.game as GameKey,
            context: r.context as GameContext,
            sessionId: r.sessionId,
            progress: engine.progress(cur.state, t)
          });
        }
        return { state: toState(cur, t), feedback };
      },
      { body: t.Record(t.String(), t.Unknown()) }
    )
    // Fin de chrono signalée par le client (le serveur vérifie l'heure) ou abandon.
    .post(
      "/rounds/:id/finish",
      async ({ caller, params, body }) => {
        const r = await loadRound(params.id, caller);
        const t = now();
        if (r.over) return toState(r, t);
        const engine = ENGINES[r.game as GameKey];
        if (!body.quit && !engine.isOver(r.state, t)) fail(409, "not_over");
        return toState(await finalize(r, t), t);
      },
      { body: t.Object({ quit: t.Optional(t.Boolean()) }) }
    )
    // Images servies par le serveur : leur adresse d'origine trahirait la réponse.
    .get("/rounds/:id/image/:slot", async ({ caller, params, set }) => {
      const r = await loadRound(params.id, caller);
      const url = ENGINES[r.game as GameKey].image?.(r.state, params.slot);
      if (!url) fail(404, "no_image");
      let hit = imageCache.get(url!);
      if (!hit) {
        const res = await (deps.fetchImage ?? fetch)(url!);
        if (!res.ok) fail(502, "image_unavailable");
        hit = { body: await res.arrayBuffer(), type: res.headers.get("content-type") ?? "image/png" };
        if (imageCache.size > 2000) imageCache.delete(imageCache.keys().next().value!);
        imageCache.set(url!, hit);
      }
      set.headers["content-type"] = hit.type;
      set.headers["cache-control"] = "private, max-age=600";
      return new Response(hit.body, { headers: { "content-type": hit.type, "cache-control": "private, max-age=600" } });
    })
    // Statistiques personnelles : tes points faibles, pour l'entraînement ciblé.
    .get("/stats", ({ caller }) => {
      const me = requireSession(caller);
      const all = db.select().from(rounds).where(and(eq(rounds.userId, me), eq(rounds.over, true))).orderBy(desc(rounds.finishedAt)).limit(500).all();
      const byGame: Record<string, { played: number; success: number }> = {};
      for (const r of all) {
        const g = (byGame[r.game] ??= { played: 0, success: 0 });
        g.played++;
        if ((r.basePoints ?? 0) >= 100 || (r.result as any)?.found) g.success++;
      }
      const recent = all.slice(0, 10).map((r) => ({ game: r.game, context: r.context, day: r.day, result: r.result, basePoints: r.basePoints }));
      return { byGame, recent, defisCompleted: db.select().from(daily).where(and(eq(daily.userId, me), eq(daily.status, "done"))).all().length };
    })
    // Compte de test : efface le défi du jour (et ses manches) pour le rejouer
    .post("/dev/reset-day", ({ caller }) => {
      const me = requireTester(caller);
      const day = activeDay(me, now());
      db.transaction((tx) => {
        tx.delete(rounds).where(and(eq(rounds.userId, me), eq(rounds.day, day), eq(rounds.context, "defi"))).run();
        tx.delete(daily).where(and(eq(daily.userId, me), eq(daily.day, day))).run();
      });
      return { day };
    })
    .group("/internal", (g) =>
      g
        .use(internalGuard)
        // Fusion invité → compte : le défi du jour de l'invité passe au compte, sauf si le compte l'a déjà fait.
        .post("/merge", ({ body }) => ({ moved: mergeGuest(db, body.guestId, body.userId, body.day) }), {
          body: t.Object({ guestId: t.String(), userId: t.String(), day: t.String() })
        })
        // Retour dans le groupe après une déconnexion : les jeux du défi manqués valent 0 point.
        .post(
          "/forfeit",
          async ({ body }) => {
            const row = dailyRow(body.userId, body.day);
            if (!row) return { forfeited: [] };
            const games = row.games as GameKey[];
            const upTo = games.indexOf(body.upTo as GameKey);
            const t = now();
            const out: string[] = [];
            for (const game of games.slice(0, upTo < 0 ? games.length : upTo)) {
              const played = defiRounds(body.userId, body.day).filter((x) => x.game === game);
              const open = played.find((x) => !x.over);
              if (played.some((x) => x.over)) continue;
              if (open) {
                await finalize(open, t);
              } else {
                const { state } = ENGINES[game].create({ seed: randomSeed(), now: t, seen: new Set() });
                const id = crypto.randomUUID();
                db.insert(rounds).values({ id, userId: body.userId, kind: row.kind, day: body.day, game, context: "defi", sessionId: row.sessionId, state, startedAt: t }).run();
                await finalize(db.select().from(rounds).where(eq(rounds.id, id)).get()!, t);
              }
              out.push(game);
            }
            return { forfeited: out };
          },
          { body: t.Object({ userId: t.String(), day: t.String(), upTo: t.String() }) }
        )
    );
}

/** Fusion invité → compte : le défi du jour de l'invité passe au compte, sauf si le compte l'a déjà fait. */
export function mergeGuest(db: Db, guestId: string, userId: string, day: string): boolean {
  const has = db.select().from(daily).where(and(eq(daily.userId, userId), eq(daily.day, day))).get();
  if (has) return false;
  db.transaction((tx) => {
    tx.update(daily).set({ userId, kind: "user" }).where(and(eq(daily.userId, guestId), eq(daily.day, day))).run();
    tx.update(rounds).set({ userId, kind: "user" }).where(and(eq(rounds.userId, guestId), eq(rounds.day, day))).run();
  });
  return true;
}

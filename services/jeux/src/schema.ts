import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Défi du jour d'un joueur : une instance unique par jour, mode fixé à la première manche. */
export const daily = sqliteTable(
  "daily",
  {
    userId: text("user_id").notNull(),
    day: text("day").notNull(),
    kind: text("kind", { enum: ["user", "guest"] }).notNull(),
    mode: text("mode", { enum: ["solo", "groupe"] }).notNull(),
    sessionId: text("session_id"),
    games: text("games", { mode: "json" }).$type<string[]>().notNull(),
    status: text("status", { enum: ["running", "done", "closed"] }).notNull(),
    deviceId: text("device_id"),
    startedAt: integer("started_at").notNull()
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] }), index("daily_device").on(t.deviceId, t.day)]
);

/** Manches jouées. `state` contient la réponse : il ne quitte jamais le serveur avant la fin. */
export const rounds = sqliteTable(
  "rounds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind", { enum: ["user", "guest"] }).notNull(),
    day: text("day").notNull(),
    game: text("game").notNull(),
    context: text("context", { enum: ["defi", "classique", "streamer"] }).notNull(),
    sessionId: text("session_id"),
    state: text("state", { mode: "json" }).notNull(),
    startedAt: integer("started_at").notNull(),
    over: integer("over", { mode: "boolean" }).notNull().default(false),
    result: text("result", { mode: "json" }),
    basePoints: integer("base_points"),
    finishedAt: integer("finished_at")
  },
  (t) => [index("rounds_user_day").on(t.userId, t.day, t.context)]
);

/** Contenu déjà vu, pour ne pas reproposer la même manche. */
export const seen = sqliteTable(
  "seen",
  { userId: text("user_id").notNull(), game: text("game").notNull(), contentKey: text("content_key").notNull(), at: integer("at").notNull() },
  (t) => [primaryKey({ columns: [t.userId, t.game, t.contentKey] })]
);

/** Jeux de groupe à plateau partagé (Codenames, Fais-moi deviner) : un état pour tout le groupe. */
export const parties = sqliteTable(
  "parties",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    game: text("game").notNull(),
    state: text("state", { mode: "json" }).notNull(),
    over: integer("over", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull()
  },
  (t) => [index("parties_session").on(t.sessionId, t.game)]
);

import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Résultats du défi du jour, par joueur, jour et jeu (pour les percentiles). */
export const results = sqliteTable(
  "results",
  {
    userId: text("user_id").notNull(),
    day: text("day").notNull(),
    game: text("game").notNull(),
    kind: text("kind", { enum: ["user", "guest"] }).notNull(),
    result: text("result", { mode: "json" }).notNull(),
    basePoints: integer("base_points").notNull(),
    finishedAt: integer("finished_at").notNull()
  },
  (t) => [primaryKey({ columns: [t.userId, t.day, t.game] }), index("results_day_game").on(t.day, t.game)]
);

/** Journée d'un joueur : défi terminé, total définitif une fois le jour clos (3 h). */
export const days = sqliteTable(
  "days",
  {
    userId: text("user_id").notNull(),
    day: text("day").notNull(),
    kind: text("kind", { enum: ["user", "guest"] }).notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    finalTotal: integer("final_total")
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] }), index("days_day").on(t.day)]
);

/** Jours dont les bonus de percentile sont calculés et versés. */
export const finalizedDays = sqliteTable("finalized_days", { day: text("day").primaryKey(), at: integer("at").notNull() });

export const seasonPoints = sqliteTable(
  "season_points",
  {
    userId: text("user_id").notNull(),
    season: integer("season").notNull(),
    points: integer("points").notNull().default(0),
    daysPlayed: integer("days_played").notNull().default(0)
  },
  (t) => [primaryKey({ columns: [t.userId, t.season] }), index("season_rank").on(t.season, t.points)]
);

export const paidSeasons = sqliteTable("paid_seasons", { season: integer("season").primaryKey(), at: integer("at").notNull() });

export const streaks = sqliteTable("streaks", {
  userId: text("user_id").primaryKey(),
  current: integer("current").notNull().default(0),
  best: integer("best").notNull().default(0),
  lastDay: text("last_day")
});

export const weeks = sqliteTable(
  "weeks",
  { userId: text("user_id").notNull(), week: text("week").notNull(), completed: integer("completed").notNull().default(0) },
  (t) => [primaryKey({ columns: [t.userId, t.week] })]
);

export const wallets = sqliteTable("wallets", { userId: text("user_id").primaryKey(), balance: integer("balance").notNull().default(0) });

/** Journal des éclats ; (joueur, motif, référence) unique pour qu'un gain ne soit jamais versé deux fois. */
export const ledger = sqliteTable(
  "ledger",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    ref: text("ref").notNull(),
    at: integer("at").notNull()
  },
  (t) => [uniqueIndex("ledger_once").on(t.userId, t.reason, t.ref), index("ledger_user").on(t.userId, t.at)]
);

/** Objets possédés : "chibi:<clé>", "skin:<id>", "game:<jeu>". */
export const inventory = sqliteTable(
  "inventory",
  { userId: text("user_id").notNull(), item: text("item").notNull(), source: text("source").notNull(), at: integer("at").notNull() },
  (t) => [primaryKey({ columns: [t.userId, t.item] })]
);

/** Classement persistant de la communauté de chaque streamer, par saison. */
export const community = sqliteTable(
  "community",
  { streamerId: text("streamer_id").notNull(), season: integer("season").notNull(), userId: text("user_id").notNull(), points: integer("points").notNull().default(0) },
  (t) => [primaryKey({ columns: [t.streamerId, t.season, t.userId] })]
);

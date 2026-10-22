import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  kind: text("kind", { enum: ["user", "guest"] }).notNull(),
  pseudo: text("pseudo"),
  /** Pseudo en minuscules : unique, pour « déjà pris ». */
  pseudoLower: text("pseudo_lower").unique(),
  tag: text("tag"),
  role: text("role"),
  namesLang: text("names_lang", { enum: ["fr", "en"] }).notNull().default("fr"),
  siteLang: text("site_lang", { enum: ["fr", "en"] }).notNull().default("fr"),
  reminder: integer("reminder", { mode: "boolean" }).notNull().default(true),
  mode: text("mode", { enum: ["sombre", "clair"] }).notNull().default("sombre"),
  chibi: text("chibi").notNull().default("random"),
  skin: text("skin"),
  starter: text("starter"),
  onboarded: integer("onboarded", { mode: "boolean" }).notNull().default(false),
  tutorials: text("tutorials", { mode: "json" }).$type<Record<string, boolean>>().notNull().default({}),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

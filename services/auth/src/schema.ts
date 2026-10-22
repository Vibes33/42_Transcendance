import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Comptes. Aucune donnée personnelle : on ne garde que l'empreinte (SHA-256) de l'identifiant
 * renvoyé par le fournisseur OAuth, jamais l'e-mail ni le nom.
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["user", "guest"] }).notNull(),
    provider: text("provider", { enum: ["google", "apple", "discord", "dev"] }),
    subjectHash: text("subject_hash").unique(),
    createdAt: integer("created_at").notNull(),
    mergedInto: text("merged_into")
  },
  (t) => [index("users_kind").on(t.kind)]
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 du jeton de session (le jeton lui-même n'est que dans le cookie). */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id"),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull()
  },
  (t) => [index("sessions_user").on(t.userId)]
);

/** États OAuth en cours (anti-CSRF + PKCE), valables 10 minutes. */
export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  provider: text("provider").notNull(),
  codeVerifier: text("code_verifier"),
  createdAt: integer("created_at").notNull()
});

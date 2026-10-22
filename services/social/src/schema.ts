import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Amitié : une ligne par paire, userA < userB. */
export const friendships = sqliteTable(
  "friendships",
  { userA: text("user_a").notNull(), userB: text("user_b").notNull(), createdAt: integer("created_at").notNull() },
  (t) => [primaryKey({ columns: [t.userA, t.userB] }), index("friend_b").on(t.userB)]
);

/** Demandes d'ami en attente : elles doivent être acceptées. */
export const friendRequests = sqliteTable(
  "friend_requests",
  { fromId: text("from_id").notNull(), toId: text("to_id").notNull(), createdAt: integer("created_at").notNull() },
  (t) => [primaryKey({ columns: [t.fromId, t.toId] }), index("req_to").on(t.toId)]
);

export const blocks = sqliteTable(
  "blocks",
  { blocker: text("blocker").notNull(), blocked: text("blocked").notNull(), createdAt: integer("created_at").notNull() },
  (t) => [primaryKey({ columns: [t.blocker, t.blocked] })]
);

export const reports = sqliteTable("reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reporter: text("reporter").notNull(),
  reported: text("reported").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull()
});

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  leader: text("leader").notNull(),
  createdAt: integer("created_at").notNull()
});

export const groupMembers = sqliteTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    status: text("status", { enum: ["member", "invited"] }).notNull(),
    invitedBy: text("invited_by"),
    at: integer("at").notNull()
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("gm_user").on(t.userId)]
);

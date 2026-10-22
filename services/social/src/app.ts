import { Elysia, t } from "elysia";
import { and, eq, or } from "drizzle-orm";
import { GROUP_MAX, type FriendEntry, type FriendRequest, type GroupInfo, type PresenceState, type PublicPlayer } from "@loltr/shared";
import { callerPlugin, fail, health, internalGuard, requireAccount, type EventMap, type EventType } from "@loltr/shared/server";
import type { Db } from "./db";
import { blocks, friendRequests, friendships, groupMembers, groups, reports } from "./schema";

export interface Presence {
  state: PresenceState;
  note: string;
  lastSeen: number | null;
}

export interface SocialDeps {
  db: Db;
  publish: <T extends EventType>(type: T, data: EventMap[T]) => Promise<unknown>;
  players: (ids: string[]) => Promise<PublicPlayer[]>;
  lookup: (query: string) => Promise<PublicPlayer | null>;
  presence: (ids: string[]) => Promise<Record<string, Presence>>;
  now?: () => number;
}

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export function createSocialApp(deps: SocialDeps) {
  const { db } = deps;
  const now = deps.now ?? Date.now;

  const friendIds = (u: string): string[] =>
    db
      .select()
      .from(friendships)
      .where(or(eq(friendships.userA, u), eq(friendships.userB, u)))
      .all()
      .map((f) => (f.userA === u ? f.userB : f.userA));

  const areFriends = (a: string, b: string) => {
    const [x, y] = pair(a, b);
    return !!db.select().from(friendships).where(and(eq(friendships.userA, x), eq(friendships.userB, y))).get();
  };

  const isBlocked = (a: string, b: string) =>
    !!db
      .select()
      .from(blocks)
      .where(or(and(eq(blocks.blocker, a), eq(blocks.blocked, b)), and(eq(blocks.blocker, b), eq(blocks.blocked, a))))
      .get();

  function makeFriends(a: string, b: string) {
    const [x, y] = pair(a, b);
    db.transaction((tx) => {
      tx.delete(friendRequests).where(or(and(eq(friendRequests.fromId, a), eq(friendRequests.toId, b)), and(eq(friendRequests.fromId, b), eq(friendRequests.toId, a)))).run();
      tx.insert(friendships).values({ userA: x, userB: y, createdAt: now() }).onConflictDoNothing().run();
    });
  }

  function removeFriend(a: string, b: string) {
    const [x, y] = pair(a, b);
    db.delete(friendships).where(and(eq(friendships.userA, x), eq(friendships.userB, y))).run();
  }

  // --- Groupes ---------------------------------------------------------------------------
  const membershipOf = (u: string) =>
    db.select().from(groupMembers).where(and(eq(groupMembers.userId, u), eq(groupMembers.status, "member"))).get() ?? null;

  function groupRaw(groupId: string) {
    const g = db.select().from(groups).where(eq(groups.id, groupId)).get();
    if (!g) return null;
    const members = db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId)).all();
    return { ...g, members };
  }

  async function groupInfo(groupId: string): Promise<GroupInfo | null> {
    const g = groupRaw(groupId);
    if (!g) return null;
    const profiles = await deps.players(g.members.map((m) => m.userId));
    const byId = Object.fromEntries(profiles.map((p) => [p.userId, p]));
    return {
      id: g.id,
      leader: g.leader,
      members: g.members
        .sort((a, b) => (a.userId === g.leader ? -1 : b.userId === g.leader ? 1 : a.at - b.at))
        .map((m) => ({ ...(byId[m.userId] ?? { userId: m.userId, pseudo: "…", tag: "", chibi: "random", skin: null }), status: m.status, leader: m.userId === g.leader }))
    };
  }

  async function announceGroup(groupId: string, disbanded = false) {
    const g = groupRaw(groupId);
    const members = g ? g.members.filter((m) => m.status === "member").map((m) => m.userId) : [];
    await deps.publish("group.updated", { groupId, members, leader: g?.leader ?? "", disbanded });
  }

  /** Quitte le groupe courant ; le chef suivant est le membre le plus ancien ; un groupe vide est dissous. */
  async function leaveGroup(u: string) {
    const m = membershipOf(u);
    if (!m) return;
    const g = groupRaw(m.groupId)!;
    const rest = g.members.filter((x) => x.userId !== u && x.status === "member").sort((a, b) => a.at - b.at);
    db.transaction((tx) => {
      tx.delete(groupMembers).where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, u))).run();
      if (rest.length === 0) tx.delete(groups).where(eq(groups.id, g.id)).run();
      else if (g.leader === u) tx.update(groups).set({ leader: rest[0].userId }).where(eq(groups.id, g.id)).run();
    });
    await deps.publish("group.updated", { groupId: g.id, members: rest.map((r) => r.userId), leader: rest[0]?.userId ?? "", disbanded: rest.length === 0 });
    // L'ancien membre est aussi prévenu
    await deps.publish("group.updated", { groupId: g.id, members: [u], leader: "", disbanded: true });
  }

  return new Elysia({ prefix: "/api/social" })
    .use(callerPlugin)
    .use(health)
    .get("/friends", async ({ caller }) => {
      const me = requireAccount(caller);
      const ids = friendIds(me);
      const incoming = db.select().from(friendRequests).where(eq(friendRequests.toId, me)).all();
      const outgoing = db.select().from(friendRequests).where(eq(friendRequests.fromId, me)).all();
      const invites = db.select().from(groupMembers).where(and(eq(groupMembers.userId, me), eq(groupMembers.status, "invited"))).all();
      const all = Array.from(new Set([...ids, ...incoming.map((r) => r.fromId), ...outgoing.map((r) => r.toId), ...invites.map((i) => i.invitedBy ?? "")])).filter(Boolean);
      const [players, presence] = await Promise.all([deps.players(all), deps.presence(ids)]);
      const p = Object.fromEntries(players.map((x) => [x.userId, x]));
      const unknown = (id: string): PublicPlayer => ({ userId: id, pseudo: "…", tag: "", chibi: "random", skin: null });
      const friends: FriendEntry[] = ids.map((id) => {
        const pr = presence[id] ?? { state: "offline", note: "", lastSeen: null };
        return { ...(p[id] ?? unknown(id)), presence: pr.state, note: pr.note, lastSeen: pr.lastSeen };
      });
      const requests: FriendRequest[] = [
        ...incoming.map((r) => ({ ...(p[r.fromId] ?? unknown(r.fromId)), direction: "incoming" as const, at: r.createdAt })),
        ...outgoing.map((r) => ({ ...(p[r.toId] ?? unknown(r.toId)), direction: "outgoing" as const, at: r.createdAt }))
      ];
      return { friends, requests, invites: invites.map((i) => ({ groupId: i.groupId, from: p[i.invitedBy ?? ""] ?? unknown(i.invitedBy ?? "") })) };
    })
    // Ajout par pseudo (ou pseudo#tag) : envoie une demande, qui doit être acceptée.
    .post(
      "/friends/request",
      async ({ caller, body }) => {
        const me = requireAccount(caller);
        const q = body.query.trim();
        if (q.length < 3) fail(400, "too_short", "Un pseudo fait au moins 3 caractères.");
        const target = await deps.lookup(q);
        if (!target) fail(404, "player_not_found", "Aucun joueur ne porte ce pseudo.");
        const to = target!.userId;
        if (to === me) fail(400, "self", "Tu ne peux pas t’ajouter toi-même.");
        if (isBlocked(me, to)) fail(403, "blocked", "Impossible d’ajouter ce joueur.");
        if (areFriends(me, to)) fail(409, "already_friends", `${target!.pseudo} est déjà dans tes amis.`);
        if (db.select().from(friendRequests).where(and(eq(friendRequests.fromId, me), eq(friendRequests.toId, to))).get())
          fail(409, "already_requested", `Demande déjà envoyée à ${target!.pseudo}.`);
        // Il m'avait déjà demandé : on devient amis directement
        if (db.select().from(friendRequests).where(and(eq(friendRequests.fromId, to), eq(friendRequests.toId, me))).get()) {
          makeFriends(me, to);
          await deps.publish("friend.accepted", { a: me, b: to });
          return { status: "friends", player: target };
        }
        db.insert(friendRequests).values({ fromId: me, toId: to, createdAt: now() }).run();
        await deps.publish("friend.request", { from: me, to });
        return { status: "requested", player: target };
      },
      { body: t.Object({ query: t.String({ maxLength: 40 }) }) }
    )
    .post(
      "/friends/accept",
      async ({ caller, body }) => {
        const me = requireAccount(caller);
        const req = db.select().from(friendRequests).where(and(eq(friendRequests.fromId, body.userId), eq(friendRequests.toId, me))).get();
        if (!req) fail(404, "no_request");
        makeFriends(me, body.userId);
        await deps.publish("friend.accepted", { a: me, b: body.userId });
        return { ok: true };
      },
      { body: t.Object({ userId: t.String() }) }
    )
    .post(
      "/friends/decline",
      ({ caller, body }) => {
        const me = requireAccount(caller);
        db.delete(friendRequests).where(and(eq(friendRequests.fromId, body.userId), eq(friendRequests.toId, me))).run();
        return { ok: true };
      },
      { body: t.Object({ userId: t.String() }) }
    )
    .post(
      "/friends/cancel",
      ({ caller, body }) => {
        const me = requireAccount(caller);
        db.delete(friendRequests).where(and(eq(friendRequests.fromId, me), eq(friendRequests.toId, body.userId))).run();
        return { ok: true };
      },
      { body: t.Object({ userId: t.String() }) }
    )
    .delete("/friends/:userId", async ({ caller, params }) => {
      const me = requireAccount(caller);
      removeFriend(me, params.userId);
      await deps.publish("friend.removed", { a: me, b: params.userId });
      return { ok: true };
    })
    .post(
      "/block",
      async ({ caller, body }) => {
        const me = requireAccount(caller);
        if (body.userId === me) fail(400, "self");
        db.transaction((tx) => {
          tx.insert(blocks).values({ blocker: me, blocked: body.userId, createdAt: now() }).onConflictDoNothing().run();
          const [x, y] = pair(me, body.userId);
          tx.delete(friendships).where(and(eq(friendships.userA, x), eq(friendships.userB, y))).run();
          tx.delete(friendRequests)
            .where(or(and(eq(friendRequests.fromId, me), eq(friendRequests.toId, body.userId)), and(eq(friendRequests.fromId, body.userId), eq(friendRequests.toId, me))))
            .run();
        });
        await deps.publish("friend.removed", { a: me, b: body.userId });
        return { ok: true };
      },
      { body: t.Object({ userId: t.String() }) }
    )
    .delete("/block/:userId", ({ caller, params }) => {
      const me = requireAccount(caller);
      db.delete(blocks).where(and(eq(blocks.blocker, me), eq(blocks.blocked, params.userId))).run();
      return { ok: true };
    })
    .get("/blocks", async ({ caller }) => {
      const me = requireAccount(caller);
      const ids = db.select().from(blocks).where(eq(blocks.blocker, me)).all().map((b) => b.blocked);
      return deps.players(ids);
    })
    .post(
      "/report",
      ({ caller, body }) => {
        const me = requireAccount(caller);
        db.insert(reports).values({ reporter: me, reported: body.userId, reason: body.reason, createdAt: now() }).run();
        return { ok: true };
      },
      { body: t.Object({ userId: t.String(), reason: t.String({ minLength: 1, maxLength: 500 }) }) }
    )
    // --- Groupes (6 joueurs au plus) -----------------------------------------------------
    .get("/group", async ({ caller }) => {
      const me = requireAccount(caller);
      const m = membershipOf(me);
      return m ? await groupInfo(m.groupId) : null;
    })
    .post("/group", async ({ caller }) => {
      const me = requireAccount(caller);
      if (membershipOf(me)) fail(409, "already_in_group");
      const id = crypto.randomUUID();
      db.transaction((tx) => {
        tx.insert(groups).values({ id, leader: me, createdAt: now() }).run();
        tx.insert(groupMembers).values({ groupId: id, userId: me, status: "member", invitedBy: null, at: now() }).run();
      });
      await announceGroup(id);
      return groupInfo(id);
    })
    .post(
      "/group/invite",
      async ({ caller, body }) => {
        const me = requireAccount(caller);
        const m = membershipOf(me);
        if (!m) fail(409, "no_group", "Crée d’abord un groupe.");
        if (!areFriends(me, body.userId)) fail(403, "not_friend");
        const g = groupRaw(m!.groupId)!;
        if (g.members.some((x) => x.userId === body.userId)) fail(409, "already_invited");
        if (g.members.length >= GROUP_MAX) fail(409, "group_full", "Le groupe est complet (6 joueurs).");
        db.insert(groupMembers).values({ groupId: g.id, userId: body.userId, status: "invited", invitedBy: me, at: now() }).run();
        await deps.publish("group.invite", { groupId: g.id, from: me, to: body.userId });
        await announceGroup(g.id);
        return groupInfo(g.id);
      },
      { body: t.Object({ userId: t.String() }) }
    )
    .post(
      "/group/accept",
      async ({ caller, body }) => {
        const me = requireAccount(caller);
        const inv = db.select().from(groupMembers).where(and(eq(groupMembers.groupId, body.groupId), eq(groupMembers.userId, me), eq(groupMembers.status, "invited"))).get();
        if (!inv) fail(404, "no_invite");
        if (membershipOf(me)) await leaveGroup(me);
        db.update(groupMembers).set({ status: "member", at: now() }).where(and(eq(groupMembers.groupId, body.groupId), eq(groupMembers.userId, me))).run();
        await announceGroup(body.groupId);
        return groupInfo(body.groupId);
      },
      { body: t.Object({ groupId: t.String() }) }
    )
    .post(
      "/group/decline",
      async ({ caller, body }) => {
        const me = requireAccount(caller);
        db.delete(groupMembers).where(and(eq(groupMembers.groupId, body.groupId), eq(groupMembers.userId, me), eq(groupMembers.status, "invited"))).run();
        await announceGroup(body.groupId);
        return { ok: true };
      },
      { body: t.Object({ groupId: t.String() }) }
    )
    .post("/group/leave", async ({ caller }) => {
      const me = requireAccount(caller);
      await leaveGroup(me);
      return { ok: true };
    })
    .post(
      "/group/kick",
      async ({ caller, body }) => {
        const me = requireAccount(caller);
        const m = membershipOf(me);
        if (!m) fail(409, "no_group");
        const g = groupRaw(m!.groupId)!;
        if (g.leader !== me) fail(403, "not_leader", "Seul le chef du groupe peut retirer un joueur.");
        db.delete(groupMembers).where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, body.userId))).run();
        await announceGroup(g.id);
        await deps.publish("group.updated", { groupId: g.id, members: [body.userId], leader: "", disbanded: true });
        return groupInfo(g.id);
      },
      { body: t.Object({ userId: t.String() }) }
    )
    .group("/internal", (g) =>
      g
        .use(internalGuard)
        .get("/friends/:userId", ({ params }) => ({ ids: friendIds(params.userId) }))
        .get("/group-of/:userId", ({ params }) => {
          const m = membershipOf(params.userId);
          const g = m ? groupRaw(m.groupId) : null;
          return g ? { id: g.id, leader: g.leader, members: g.members.filter((x) => x.status === "member").map((x) => x.userId) } : null;
        })
        .get(
          "/friends-of-many",
          ({ query }) => {
            const ids = query.ids.split(",").filter(Boolean);
            return Object.fromEntries(ids.map((id) => [id, friendIds(id)]));
          },
          { query: t.Object({ ids: t.String() }) }
        )
    );
}


import { describe, expect, test } from "bun:test";
import { createSocialApp } from "./app";
import { createDb } from "./db";

function setup() {
  const names: Record<string, string> = { u1: "Ryan", u2: "Lina", u3: "Noe", u4: "Tom", u5: "Sacha", u6: "Ines", u7: "Hugo" };
  const events: string[] = [];
  const app = createSocialApp({
    db: createDb(":memory:"),
    publish: async (type) => { events.push(type); },
    players: async (ids) => ids.map((id) => ({ userId: id, pseudo: names[id] ?? id, tag: "1000", chibi: "lux", skin: null })),
    lookup: async (q) => { const id = Object.keys(names).find((k) => names[k].toLowerCase() === q.toLowerCase()); return id ? { userId: id, pseudo: names[id], tag: "1000", chibi: "lux", skin: null } : null; },
    presence: async (ids) => Object.fromEntries(ids.map((id) => [id, { state: "online" as const, note: "En ligne", lastSeen: null }]))
  });
  const call = (path: string, user: string, init: RequestInit = {}) =>
    app.handle(new Request("http://localhost/api/social" + path, { ...init, headers: { "x-user-id": user, "x-user-kind": "user", "content-type": "application/json" } }));
  const post = (path: string, user: string, body: unknown) => call(path, user, { method: "POST", body: JSON.stringify(body) });
  return { call, post, events };
}

describe("social", () => {
  test("une demande d'ami doit être acceptée", async () => {
    const { call, post } = setup();
    expect((await post("/friends/request", "u1", { query: "Lina" })).status).toBe(200);
    expect((await (await call("/friends", "u1")).json()).friends.length).toBe(0);
    const inc = await (await call("/friends", "u2")).json();
    expect(inc.requests[0].direction).toBe("incoming");
    await post("/friends/accept", "u2", { userId: "u1" });
    expect((await (await call("/friends", "u1")).json()).friends[0].pseudo).toBe("Lina");
    expect((await post("/friends/request", "u1", { query: "Lina" })).status).toBe(409);
    expect((await post("/friends/request", "u1", { query: "Inconnu" })).status).toBe(404);
  });

  test("bloquer retire l'ami et empêche une nouvelle demande", async () => {
    const { call, post } = setup();
    await post("/friends/request", "u1", { query: "Lina" });
    await post("/friends/accept", "u2", { userId: "u1" });
    await post("/block", "u2", { userId: "u1" });
    expect((await (await call("/friends", "u1")).json()).friends.length).toBe(0);
    expect((await post("/friends/request", "u1", { query: "Lina" })).status).toBe(403);
  });

  test("groupe : invitations, 6 joueurs au plus, départ du chef", async () => {
    const { call, post } = setup();
    for (const [id, n] of [["u2", "Lina"], ["u3", "Noe"], ["u4", "Tom"], ["u5", "Sacha"], ["u6", "Ines"], ["u7", "Hugo"]]) {
      await post("/friends/request", "u1", { query: n });
      await post("/friends/accept", id, { userId: "u1" });
    }
    const g = await (await post("/group", "u1", {})).json();
    for (const id of ["u2", "u3", "u4", "u5", "u6"]) expect((await post("/group/invite", "u1", { userId: id })).status).toBe(200);
    expect((await post("/group/invite", "u1", { userId: "u7" })).status).toBe(409);
    await post("/group/accept", "u2", { groupId: g.id });
    const info = await (await call("/group", "u2")).json();
    expect(info.members.filter((m: any) => m.status === "member").length).toBe(2);
    await post("/group/leave", "u1", {});
    const after = await (await call("/group", "u2")).json();
    expect(after.leader).toBe("u2");
  });
});

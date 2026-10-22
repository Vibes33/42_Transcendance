import { describe, expect, test } from "bun:test";
import { createProfilApp } from "./app";
import { createDb } from "./db";

function setup() {
  const owned: Record<string, Set<string>> = {};
  const app = createProfilApp({
    db: createDb(":memory:"),
    publish: async () => {},
    inventory: async (u) => [...(owned[u] ?? [])],
    grant: async (u, item) => { (owned[u] ??= new Set()).add(item); }
  });
  const call = (path: string, user: string, kind = "user", init: RequestInit = {}) =>
    app.handle(new Request("http://localhost/api/profil" + path, { ...init, headers: { "x-user-id": user, "x-user-kind": kind, "content-type": "application/json", ...(init.headers ?? {}) } }));
  return { app, call, owned };
}

describe("profil", () => {
  test("parcours de première connexion : pseudo puis premier chibi", async () => {
    const { call } = setup();
    const me = await (await call("/me", "u1")).json();
    expect(me.onboarded).toBe(false);
    expect(me.pseudo).toBeNull();
    const chk = await (await call("/pseudo/check?p=Ry", "u1")).json();
    expect(chk.error).toBe("short");
    const r = await call("/pseudo", "u1", "user", { method: "POST", body: JSON.stringify({ pseudo: "Ryan", role: "mid", namesLang: "fr", reminder: true }) });
    expect(r.status).toBe(200);
    const st = await (await call("/starter", "u1", "user", { method: "POST", body: JSON.stringify({ chibi: "ekko" }) })).json();
    expect(st.onboarded).toBe(true);
    expect(st.chibi).toBe("ekko");
  });

  test("pseudo déjà pris, avec propositions", async () => {
    const { call } = setup();
    await call("/pseudo", "u1", "user", { method: "POST", body: JSON.stringify({ pseudo: "Faker", namesLang: "fr", reminder: true }) });
    const chk = await (await call("/pseudo/check?p=faker", "u2")).json();
    expect(chk.error).toBe("taken");
    expect(chk.suggestions.length).toBeGreaterThan(0);
    const r = await call("/pseudo", "u2", "user", { method: "POST", body: JSON.stringify({ pseudo: "FAKER", namesLang: "fr", reminder: true }) });
    expect(r.status).toBe(409);
  });

  test("on ne peut équiper que ce qu'on possède", async () => {
    const { call, owned } = setup();
    await call("/pseudo", "u1", "user", { method: "POST", body: JSON.stringify({ pseudo: "Ryan", namesLang: "fr", reminder: true }) });
    expect((await call("/equip", "u1", "user", { method: "POST", body: JSON.stringify({ chibi: "ahri" }) })).status).toBe(403);
    owned.u1 = new Set(["chibi:ahri", "skin:ahri-sg"]);
    const ok = await (await call("/equip", "u1", "user", { method: "POST", body: JSON.stringify({ chibi: "ahri", skin: "ahri-sg" }) })).json();
    expect(ok.skin).toBe("ahri-sg");
  });

  test("un invité reçoit un pseudo et un chibi au hasard, sans onboarding", async () => {
    const { call } = setup();
    const me = await (await call("/me", "g1", "guest")).json();
    expect(me.onboarded).toBe(true);
    expect(me.pseudo).toBeTruthy();
    expect(me.chibi).not.toBe("random");
    expect((await call("/pseudo/check?p=abc", "g1", "guest")).status).toBe(403);
  });
});

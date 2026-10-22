import { describe, expect, test } from "bun:test";
import { createAuthApp } from "./app";
import { createDb } from "./db";

const events: { type: string; data: any }[] = [];
const app = () => createAuthApp({ db: createDb(":memory:"), publish: async (type, data) => { events.push({ type, data }); } });
const cookieOf = (res: Response) => (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

describe("auth", () => {
  test("anonyme : verify renvoie un appelant anonyme", async () => {
    const res = await app().handle(new Request("http://localhost/api/auth/verify"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-user-kind")).toBe("anonymous");
    expect(res.headers.get("x-user-id")).toBe("");
  });

  test("invité puis fusion avec un compte à la connexion", async () => {
    process.env.AUTH_DEV_LOGIN = "true";
    const a = app();
    const g = await a.handle(new Request("http://localhost/api/auth/guest", { method: "POST" }));
    const guest = (await g.json()) as { userId: string };
    const guestCookie = cookieOf(g);
    const v = await a.handle(new Request("http://localhost/api/auth/verify", { headers: { cookie: guestCookie } }));
    expect(v.headers.get("x-user-kind")).toBe("guest");
    expect(v.headers.get("x-user-id")).toBe(guest.userId);

    const login = await a.handle(new Request("http://localhost/api/auth/dev-login", { method: "POST", headers: { cookie: guestCookie, "content-type": "application/json" }, body: JSON.stringify({ name: "Ryan" }) }));
    expect(login.status).toBe(200);
    const merged = events.find((e) => e.type === "user.merged");
    expect(merged?.data.guestId).toBe(guest.userId);
    const v2 = await a.handle(new Request("http://localhost/api/auth/verify", { headers: { cookie: cookieOf(login) } }));
    expect(v2.headers.get("x-user-kind")).toBe("user");
    // L'ancienne session invité n'est plus valable
    const v3 = await a.handle(new Request("http://localhost/api/auth/verify", { headers: { cookie: guestCookie } }));
    expect(v3.headers.get("x-user-kind")).toBe("anonymous");
  });

  test("même compte : même identifiant à chaque connexion", async () => {
    process.env.AUTH_DEV_LOGIN = "true";
    const a = app();
    const req = () => new Request("http://localhost/api/auth/dev-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Lina" }) });
    const id1 = (await a.handle(new Request("http://localhost/api/auth/verify", { headers: { cookie: cookieOf(await a.handle(req())) } }))).headers.get("x-user-id");
    const id2 = (await a.handle(new Request("http://localhost/api/auth/verify", { headers: { cookie: cookieOf(await a.handle(req())) } }))).headers.get("x-user-id");
    expect(id1).toBe(id2!);
  });

  test("fournisseur non configuré : 404", async () => {
    const res = await app().handle(new Request("http://localhost/api/auth/login/google"));
    expect(res.status).toBe(404);
  });
});

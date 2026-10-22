import { describe, expect, test } from "bun:test";
import { CHAMPION_BY_ID } from "@loltr/content";
import { CDJ_MAX_TRIES, dayKey } from "@loltr/shared";
import { createJeuxApp } from "./app";
import { createDb } from "./db";
import { compare } from "./games/cdj";
import { ENGINES } from "./games";
import { rotationFor } from "@loltr/shared";

function setup(opts: { owned?: Record<string, string[]>; t0?: number } = {}) {
  let t = opts.t0 ?? Date.UTC(2026, 9, 21, 12, 0, 0);
  const events: { type: string; data: any }[] = [];
  const app = createJeuxApp({
    db: createDb(":memory:"),
    publish: async (type, data) => { events.push({ type, data }); },
    owns: async (u, item) => (opts.owned?.[u] ?? []).includes(item),
    groupOf: async () => null,
    session: async (id) => (id === "g1" ? { kind: "group", seed: "s", members: ["u1", "u2"] } : null),
    projection: async () => ({}),
    now: () => t
  });
  const call = async (path: string, user: string, init: RequestInit = {}, kind = "user", device = "dev-1") => {
    const res = await app.handle(new Request("http://localhost/api/jeux" + path, { ...init, headers: { "x-user-id": user, "x-user-kind": kind, "x-device-id": device, "content-type": "application/json" } }));
    return { status: res.status, body: (await res.json()) as any };
  };
  const post = (path: string, user: string, body: unknown, kind = "user", device = "dev-1") => call(path, user, { method: "POST", body: JSON.stringify(body) }, kind, device);
  return { app, call, post, events, advance: (ms: number) => { t += ms; } };
}

describe("moteurs", () => {
  test("Champion du jour : comparaison des attributs", () => {
    const codes = compare(CHAMPION_BY_ID.lux.attributes!, CHAMPION_BY_ID.ekko.attributes!);
    // genre ≠, postes partiels (mid), espèce humain =, ressource mana =, portée ≠, région ≠, année : Ekko sorti plus tard
    expect(codes).toEqual(["r", "p", "g", "g", "r", "r", "u"]);
    expect(compare(CHAMPION_BY_ID.ekko.attributes!, CHAMPION_BY_ID.ekko.attributes!).every((c) => c === "g")).toBe(true);
  });

  test("Méli-MéLoL : 4 bons sorts = champion complété et +5 s", () => {
    const e = ENGINES.meli;
    let { state } = e.create({ seed: "x", now: 0, seen: new Set() });
    const end0 = state.endsAt;
    const goal: number[] = (e.reveal(state) as any).goal;
    for (const tile of goal) state = e.act(state, { type: "click", tile }, 2000).state;
    expect(e.result(state, 2000).champions).toBe(1);
    expect(state.endsAt).toBe(end0 + 5000);
    // une erreur ne coûte rien
    const wrong = [...Array(25).keys()].find((i) => !(e.reveal(state) as any).goal.includes(i))!;
    expect(e.act(state, { type: "click", tile: wrong }, 2100).feedback.wrong).toBe(wrong);
  });

  test("Sorts éclair : réponse tolérante aux fautes, +3 s", () => {
    const e = ENGINES.se;
    const { state } = e.create({ seed: "y", now: 0, seen: new Set() });
    const owner = (e.reveal(state) as any).current.split(":")[0];
    const name = CHAMPION_BY_ID[owner].names.fr;
    const typo = name.length > 6 ? name.slice(0, -1) : name;
    const out = e.act(state, { type: "answer", text: typo }, 1500);
    expect(out.state.correct).toBe(1);
    expect(out.state.endsAt).toBe(state.endsAt + 3000);
  });

  test("Splash mystère : 70 pour le champion, 30 pour le skin, une seule tentative", () => {
    const e = ENGINES.splash;
    let { state } = e.create({ seed: "z", now: 0, seen: new Set() });
    const rev = e.reveal(state) as any;
    state = e.act(state, { type: "guess", champion: rev.champion }, 10).state;
    expect((e.publicState(state, 10) as any).skinChoices.length).toBeGreaterThan(1);
    state = e.act(state, { type: "skin", num: rev.skinNum }, 20).state;
    expect(e.result(state, 20)).toMatchObject({ found: true, skinFound: true, tries: 1 });
    expect(() => e.act(state, { type: "skin", num: rev.skinNum }, 30)).toThrow();
  });

  test("rotation : Champion du jour en premier, puis 3 jeux", () => {
    const r = rotationFor("2026-10-21");
    expect(r[0]).toBe("cdj");
    expect(new Set(r).size).toBe(4);
    expect(rotationFor("2026-10-21")).toEqual(r);
  });
});

describe("défi du jour", () => {
  test("ordre des jeux imposé et mode verrouillé", async () => {
    const { post, call } = setup();
    expect((await post("/rounds", "u1", { game: "cdj", context: "defi" })).status).toBe(409);
    await post("/daily/start", "u1", { mode: "solo" });
    const order = (await call("/daily", "u1")).body.games.map((g: any) => g.key);
    expect((await post("/rounds", "u1", { game: order[1], context: "defi" })).body.error).toBe("not_next_game");
    expect((await post("/daily/start", "u1", { mode: "groupe", sessionId: "g1" })).body.error).toBe("mode_locked");
  });

  test("Champion du jour : 20 essais au plus, puis jeu suivant", async () => {
    const { post, call, events } = setup();
    await post("/daily/start", "u1", { mode: "solo" });
    const r = (await post("/rounds", "u1", { game: "cdj", context: "defi" })).body;
    const ids = Object.keys(CHAMPION_BY_ID).filter((k) => CHAMPION_BY_ID[k].attributes);
    let last: any;
    for (let i = 0, n = 0; n < CDJ_MAX_TRIES; i++) {
      const res = await post(`/rounds/${r.id}/act`, "u1", { type: "guess", champion: ids[i] });
      if (res.status !== 200) break;
      last = res.body;
      n++;
      if (last.state.over) break;
    }
    expect(last.state.over).toBe(true);
    expect(events.some((e) => e.type === "round.finished")).toBe(true);
    const d = (await call("/daily", "u1")).body;
    expect(d.games[0].done).toBe(true);
    expect(d.nextGame).toBe(d.games[1].key);
  });

  test("chrono vérifié par le serveur et reprise après reconnexion", async () => {
    const { post, advance, call } = setup();
    await post("/daily/start", "u1", { mode: "solo" });
    // passer le Champion du jour en abandonnant
    const c = (await post("/rounds", "u1", { game: "cdj", context: "defi" })).body;
    await post(`/rounds/${c.id}/finish`, "u1", { quit: true });
    const next = (await call("/daily", "u1")).body.nextGame;
    const r = (await post("/rounds", "u1", { game: next, context: "defi" })).body;
    expect((await post(`/rounds/${r.id}/finish`, "u1", {})).body.error).toBe("not_over");
    // reconnexion : on récupère la même manche
    expect((await post("/rounds", "u1", { game: next, context: "defi" })).body.id).toBe(r.id);
    if (next !== "splash") {
      advance(40_000);
      expect((await call(`/rounds/${r.id}`, "u1")).body.over).toBe(true);
    }
  });

  test("invités : un seul défi par appareil et par jour", async () => {
    const { post } = setup();
    expect((await post("/daily/start", "g1", { mode: "solo" }, "guest", "phone")).status).toBe(200);
    expect((await post("/daily/start", "g2", { mode: "solo" }, "guest", "phone")).body.error).toBe("device_used");
    expect((await post("/daily/start", "g3", { mode: "solo" }, "guest", "laptop")).status).toBe(200);
  });

  test("le jour change à 3 h et un défi entamé reste jouable jusqu'à 3 h 30", async () => {
    // 21 octobre 2026, 2 h 50 à Paris = 0 h 50 UTC (heure d'été) : encore le 20
    const { post, call, advance } = setup({ t0: Date.UTC(2026, 9, 21, 0, 50) });
    expect(dayKey(Date.UTC(2026, 9, 21, 0, 50))).toBe("2026-10-20");
    await post("/daily/start", "u1", { mode: "solo" });
    advance(20 * 60_000); // 3 h 10 : le défi du 20 continue
    expect((await call("/daily", "u1")).body.day).toBe("2026-10-20");
    advance(30 * 60_000); // 3 h 40 : clos d'office, place au 21
    expect((await call("/daily", "u1")).body.day).toBe("2026-10-21");
  });
});

describe("groupe", () => {
  test("retour dans le groupe : les jeux manqués valent 0 point", async () => {
    const { post, call, app } = setup();
    await post("/daily/start", "u1", { mode: "groupe", sessionId: "g1" });
    const d0 = (await call("/daily", "u1")).body;
    const order = d0.games.map((g: any) => g.key);
    const body = JSON.stringify({ userId: "u1", day: d0.day, upTo: order[2] });
    const req = (token?: string) =>
      app.handle(new Request("http://localhost/api/jeux/internal/forfeit", { method: "POST", body, headers: { "content-type": "application/json", ...(token ? { "x-internal-token": token } : {}) } }));
    expect((await req()).status).toBe(403); // jeton interne requis
    expect(((await (await req(process.env.INTERNAL_TOKEN ?? "dev-internal-token")).json()) as any).forfeited).toEqual(order.slice(0, 2));
    const d = (await call("/daily", "u1")).body;
    expect(d.games.slice(0, 2).every((g: any) => g.done && g.basePoints === 0)).toBe(true);
    expect(d.nextGame).toBe(order[2]);
  });
});

describe("mode classique", () => {
  test("un jeu doit être débloqué ; Champion du jour n'y est pas jouable", async () => {
    const { post } = setup({ owned: { u2: ["game:meli"] } });
    expect((await post("/rounds", "u1", { game: "meli", context: "classique" })).status).toBe(402);
    expect((await post("/rounds", "u2", { game: "meli", context: "classique" })).status).toBe(200);
    expect((await post("/rounds", "u2", { game: "cdj", context: "classique" })).status).toBe(403);
    expect((await post("/rounds", "g9", { game: "meli", context: "classique" }, "guest")).status).toBe(403);
  });
});

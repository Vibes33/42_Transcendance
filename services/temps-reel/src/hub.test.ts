import { describe, expect, test } from "bun:test";
import type { RoundResult, WsServerMessage } from "@loltr/shared";
import { Hub, memoryStore } from "./hub";

function setup() {
  const store = memoryStore();
  const forfeits: string[] = [];
  const hub = new Hub({
    store,
    players: async (ids) => ids.map((id) => ({ userId: id, pseudo: id.toUpperCase(), tag: "0001", chibi: "lux", skin: null })),
    groupOf: async () => ({ id: "grp", leader: "a", members: ["a", "b", "c"] }),
    friendsOf: async () => [],
    projections: async (ids) => Object.fromEntries(ids.map((id) => [id, {}])),
    forfeit: async (u, _d, upTo) => void forfeits.push(`${u}:${upTo}`),
    owns: async () => true,
    daily: async (u) => (u === "done" ? { status: "done", mode: "groupe" } : { status: "todo", mode: null }),
    graceMs: 0
  });
  const inbox: Record<string, WsServerMessage[]> = {};
  const sock = (u: string) => ({ send: (m: WsServerMessage) => void (inbox[u] ??= []).push(m) });
  return { hub, store, forfeits, inbox, sock };
}

const cdj = (found: boolean): RoundResult => ({ game: "cdj", found, tries: 3, durationMs: 1000 });
const finished = (sessionId: string, userId: string, result: RoundResult, basePoints = 100) =>
  ({ sessionId, userId, game: result.game, context: "defi" as const, result, basePoints });

describe("groupe", () => {
  test("défi du jour déjà fini par le chef : pas de nouvelle partie de groupe", async () => {
    const { hub } = setup();
    await expect(hub.createGroup("done", "defi")).rejects.toMatchObject({ code: "defi_done" });
  });

  test("récap quand tout le monde a fini, puis barrière « prêt »", async () => {
    const { hub } = setup();
    const s = await hub.createGroup("a", "defi");
    expect(s.games[0]).toBe("cdj");
    await hub.onRoundFinished(finished(s.id, "a", cdj(true)));
    await hub.onRoundFinished(finished(s.id, "b", cdj(false), 0));
    expect((await hub.get(s.id))!.phase).toBe("playing");
    await hub.onRoundFinished(finished(s.id, "c", cdj(true)));
    const recap = (await hub.get(s.id))!;
    expect(recap.phase).toBe("recap");
    expect(hub.view(recap).members[2].userId).toBe("b"); // trié par total
    await hub.ready(s.id, "a");
    await hub.ready(s.id, "b");
    expect((await hub.get(s.id))!.index).toBe(0);
    const next = await hub.ready(s.id, "c");
    expect(next.index).toBe(1);
    expect(next.phase).toBe("playing");
  });

  test("déconnexion : on continue sans lui, il revient dans le groupe avec 0 point aux jeux manqués", async () => {
    const { hub, sock, forfeits } = setup();
    const s = await hub.createGroup("a", "defi");
    const sc = sock("c");
    await hub.connect("c", sc);
    await hub.disconnect("c", sc);
    await new Promise((r) => setTimeout(r, 5));
    expect((await hub.get(s.id))!.members.find((m) => m.userId === "c")!.status).toBe("disconnected");
    await hub.onRoundFinished(finished(s.id, "a", cdj(true)));
    await hub.onRoundFinished(finished(s.id, "b", cdj(true)));
    // le récap attend c tant que le groupe ne décide pas de continuer
    expect((await hub.get(s.id))!.phase).toBe("playing");
    const cont = await hub.continueWithout(s.id, "a");
    expect(cont.phase).toBe("recap");
    await hub.ready(s.id, "a");
    await hub.ready(s.id, "b");
    const back = await hub.rejoin(s.id, "c", "groupe");
    expect(forfeits).toEqual([`c:${s.games[1]}`]);
    expect(back.members.find((m) => m.userId === "c")!.results[0].basePoints).toBe(0);
  });

  test("classique : un nouveau jeu remplace la partie en cours, avec tout le groupe (même ceux qui l'avaient quittée)", async () => {
    const { hub, sock, inbox } = setup();
    await hub.connect("b", sock("b"));
    const first = await hub.createGroup("a", "classique", "meli");
    await hub.leave(first.id, "c");
    // Le groupe lance un autre jeu : nouvelle session, c en fait partie, l'ancienne est terminée
    const second = await hub.createGroup("b", "classique", "se");
    expect(second.id).not.toBe(first.id);
    expect(second.games).toEqual(["se"]);
    expect(second.members.map((m) => m.userId).sort()).toEqual(["a", "b", "c"]);
    expect((await hub.get(first.id))!.phase).toBe("done");
    expect((await hub.sessionOf("c"))!.id).toBe(second.id);
    // b est prévenu de la fin de l'ancienne partie puis de la nouvelle
    const sessions = inbox.b.filter((m) => m.type === "session").map((m) => (m as any).session);
    expect(sessions.at(-1).id).toBe(second.id);
    expect(sessions.some((s: any) => s.id === first.id && s.phase === "done")).toBe(true);
  });

  test("défi du jour en cours : il se reprend, et bloque une partie classique", async () => {
    const { hub } = setup();
    const s = await hub.createGroup("a", "defi");
    expect((await hub.createGroup("b", "defi")).id).toBe(s.id);
    await expect(hub.createGroup("b", "classique", "meli")).rejects.toThrow();
  });

  test("le groupe dissous termine la session", async () => {
    const { hub } = setup();
    const s = await hub.createGroup("a", "classique", "meli");
    await hub.onGroupUpdated("grp", ["b"], true); // b quitte le groupe
    expect((await hub.get(s.id))!.members.find((m) => m.userId === "b")!.status).toBe("left");
    await hub.onGroupUpdated("grp", [], true);
    expect((await hub.get(s.id))!.phase).toBe("done");
  });
});

describe("mode streamer", () => {
  test("code, viewers invités, graine propre à chaque manche et carte de résultat", async () => {
    const { hub } = setup();
    const s = await hub.createStream("streamer", "defi");
    expect(s.code).toMatch(/^[A-Z2-9]{6}$/);
    await hub.joinStream("v1", s.code!.toLowerCase(), true);
    await hub.joinStream("v2", s.code!, false);
    const iv = await hub.internalView(s.id);
    expect(iv!.members).toEqual(["streamer", "v1", "v2"]);
    expect(iv!.seed.endsWith(":0")).toBe(true);
    const ev = (u: string, found: boolean) => ({ ...finished(s.id, u, cdj(found), 0), context: "streamer" as const });
    await hub.onRoundFinished(ev("streamer", false));
    await hub.onRoundFinished(ev("v1", true));
    await hub.onRoundFinished(ev("v2", false));
    const card = await hub.streamCard(s.id, "v1");
    expect(card.total).toBe(100);
    expect(card.beatPercent).toBe(100);
    expect(card.beatStreamer).toBe(true);
    const next = await hub.streamNext(s.id, "streamer");
    expect(next.index).toBe(1);
    expect((await hub.internalView(s.id))!.seed.endsWith(":1")).toBe(true);
    // la vue publique (OBS) ne contient pas la graine
    expect(JSON.stringify(await hub.streamPublic(s.code!))).not.toContain(iv!.seed.split(":")[0]);
  });
});

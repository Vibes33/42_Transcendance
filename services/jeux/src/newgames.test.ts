import { describe, expect, test } from "bun:test";
import { CHAMPION_BY_ID, ITEM_BY_ID } from "@loltr/content";
import { createJeuxApp } from "./app";
import { createDb } from "./db";
import { ENGINES } from "./games";
import { heatPoints } from "./games/chaudfroid";
import { sudokuOfDay } from "./games/sudoku";

// Jeux ajoutés après le lancement : moteurs et plateau partagé des jeux de groupe.

describe("nouveaux jeux", () => {
  test("Portrait mystère : une erreur dévoile une ligne, trouver rapporte selon la ligne", () => {
    const e = ENGINES.portrait;
    let { state } = e.create({ seed: "p", now: 0, seen: new Set() });
    const target = state.portraits[0].champion;
    const wrong = target === "lux" ? "ekko" : "lux";
    state = e.act(state, { type: "guess", champion: wrong }, 1).state;
    expect((e.publicState(state, 1) as any).lines.length).toBe(2);
    state = e.act(state, { type: "guess", champion: target }, 2).state;
    expect(state.score).toBe(80);
    expect((e.publicState(state, 2) as any).answer.champion).toBe(target);
  });

  test("Connexions visuelles : chaque champion n'appartient qu'à un groupe, 4 erreurs maximum", () => {
    const e = ENGINES.connexions;
    let { state } = e.create({ seed: "c", now: 0, seen: new Set() });
    const ids = state.groups.flatMap((g: any) => g.champs);
    expect(new Set(ids).size).toBe(16);
    state = e.act(state, { type: "submit", champions: state.groups[0].champs }, 1).state;
    expect(state.found).toEqual([0]);
    const mixed = [state.groups[1].champs[0], state.groups[2].champs[0], state.groups[3].champs[0], state.groups[1].champs[1]];
    for (let k = 0; k < 4; k++) {
      const pick = k === 0 ? mixed : [state.groups[1].champs[k], state.groups[2].champs[k], state.groups[3].champs[(k + 1) % 4], state.groups[2].champs[(k + 1) % 4]];
      state = e.act(state, { type: "submit", champions: pick }, 2 + k).state;
    }
    expect(e.isOver(state, 10)).toBe(true);
    expect(e.result(state, 10).score).toBe(20);
  });

  test("Chaud-Froid : barème selon l'écart", () => {
    expect(heatPoints({ kind: "year", answer: 2013 }, 2013)).toBe(100);
    expect(heatPoints({ kind: "year", answer: 2013 }, 2014)).toBe(70);
    expect(heatPoints({ kind: "year", answer: 2013 }, 2016)).toBe(40);
    expect(heatPoints({ kind: "gold", answer: 3000 }, 3200)).toBe(70);
    const e = ENGINES.chaudfroid;
    let { state } = e.create({ seed: "h", now: 0, seen: new Set() });
    state = e.act(state, { type: "answer", value: state.questions[0].answer }, 1).state;
    expect(e.result(state, 1).score).toBe(100);
  });

  test("Build Path : les composants de l'objet, une erreur coûte 10 points", () => {
    const e = ENGINES.buildpath;
    let { state } = e.create({ seed: "b", now: 0, seen: new Set() });
    const t0 = state.warmUntil;
    const item = ITEM_BY_ID[state.targets[0].item];
    const catalog = (e.publicState(state, t0) as any).catalog as { id: string }[];
    expect(catalog.length).toBeGreaterThan(40);
    const decoy = catalog.find((c) => !item.from.includes(c.id))!.id;
    state = e.act(state, { type: "pick", item: decoy }, t0).state;
    for (const c of item.from) state = e.act(state, { type: "pick", item: c }, t0 + 1).state;
    expect(state.done).toBe(1);
    expect(e.result(state, t0 + 2).score).toBe(90);
    // Temps écoulé : le build complet de l'objet en cours se dévoile, sous-composants compris
    const end = e.publicState(state, state.endsAt + 5000) as any;
    expect(end.answer.id).toBe(state.targets[1].item);
    expect(end.answer.components.length).toBe(ITEM_BY_ID[state.targets[1].item].from.length);
    expect(end.answer.components.every((c: any) => Array.isArray(c.parts))).toBe(true);
  });

  test("QCM : 100 par bonne réponse, une réponse hors délai compte fausse", () => {
    const e = ENGINES.qcm;
    let { state } = e.create({ seed: "q", now: 0, seen: new Set() });
    expect(state.questions.length).toBe(10);
    state = e.act(state, { type: "answer", choice: state.questions[0].correct }, 1000).state;
    state = e.act(state, { type: "next" }, 2000).state;
    state = e.act(state, { type: "answer", choice: state.questions[1].correct }, 2000 + 20_000).state;
    expect(e.result(state, 30_000)).toMatchObject({ score: 100, correct: 1 });
  });

  test("Champion parfait : 15 duels, un vainqueur", () => {
    const e = ENGINES.parfait;
    let { state } = e.create({ seed: "f", now: 0, seen: new Set() });
    const fav = state.alive[3];
    for (let k = 0; k < 15; k++) {
      const pair = (e.publicState(state, k) as any).pair as string[];
      state = e.act(state, { type: "pick", champion: pair.includes(fav) ? fav : pair[0] }, k).state;
    }
    expect(e.isOver(state, 20)).toBe(true);
    expect(e.result(state, 20).winner).toBe(fav);
    expect(CHAMPION_BY_ID[fav]).toBeDefined();
  });

  test("Sudoku LoL : grille du jour à solution unique, 3 erreurs maximum", () => {
    const g = sudokuOfDay("2026-10-29");
    expect(g.solution.length).toBe(36);
    expect(sudokuOfDay("2026-10-29")).toEqual(g);
    const e = ENGINES.sudoku;
    let { state } = e.create({ seed: "sudoku:2026-10-29", now: 0, seen: new Set() });
    const empty = state.given.map((v: number, i: number) => (v < 0 ? i : -1)).filter((i: number) => i >= 0);
    for (const i of empty) state = e.act(state, { type: "place", cell: i, value: state.solution[i] }, 5000).state;
    expect(e.result(state, 5000)).toMatchObject({ solved: true, tries: 0 });
    let s2 = e.create({ seed: "sudoku:2026-10-29", now: 0, seen: new Set() }).state;
    const i = empty[0];
    for (let k = 0; k < 3; k++) s2 = e.act(s2, { type: "place", cell: i, value: (s2.solution[i] + 1) % 6 }, k).state;
    expect(e.isOver(s2, 10)).toBe(true);
  });
});

describe("jeux de groupe à plateau partagé", () => {
  function setup(members: string[]) {
    let t = Date.UTC(2026, 9, 21, 12, 0, 0);
    const app = createJeuxApp({
      db: createDb(":memory:"),
      publish: async () => {},
      owns: async () => true,
      groupOf: async () => null,
      session: async (id) => (id === "g" ? { kind: "group", seed: "s", members } : null),
      projection: async () => ({}),
      now: () => t
    });
    const call = async (path: string, user: string, body?: unknown) => {
      const res = await app.handle(new Request("http://localhost/api/jeux" + path, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined, headers: { "x-user-id": user, "x-user-kind": "user", "content-type": "application/json" } }));
      return { status: res.status, body: (await res.json()) as any };
    };
    return { call, advance: (ms: number) => (t += ms) };
  }

  test("Codenames : il faut 4 joueurs ; l'assassin fait gagner l'autre équipe et clôt les manches", async () => {
    const few = setup(["u1", "u2", "u3"]);
    expect((await few.call("/rounds", "u1", { game: "codenames", context: "classique", sessionId: "g" })).body.error).toBe("not_enough_players");

    const { call } = setup(["u1", "u2", "u3", "u4"]);
    const ids: Record<string, string> = {};
    for (const u of ["u1", "u2", "u3", "u4"]) ids[u] = (await call("/rounds", u, { game: "codenames", context: "classique", sessionId: "g" })).body.id;
    const v = (await call(`/party/${ids.u1}`, "u1")).body.view;
    // Tout le monde joue sur la même partie
    expect((await call(`/party/${ids.u4}`, "u4")).body.view.teams).toEqual(v.teams);
    const spyA = v.spy.a;
    const agentA = v.teams.a.find((u: string) => u !== spyA);
    // Seul le maître-espion voit les couleurs
    expect((await call(`/party/${ids[spyA]}`, spyA)).body.view.cards.every((c: any) => c.color)).toBe(true);
    expect((await call(`/party/${ids[agentA]}`, agentA)).body.view.cards.some((c: any) => c.color)).toBe(false);
    expect((await call(`/party/${ids[agentA]}/act`, agentA, { type: "clue", word: "Test", n: 1 })).status).toBe(409);
    const spyView = (await call(`/party/${ids[spyA]}/act`, spyA, { type: "clue", word: "Indice", n: 2 })).body.view;
    const killer = spyView.cards.findIndex((c: any) => c.color === "x");
    const end = (await call(`/party/${ids[agentA]}/act`, agentA, { type: "guess", card: killer })).body;
    expect(end.view.winner).toBe("b");
    expect(end.round.over).toBe(true);
    const spyB = v.spy.b;
    expect((await call(`/rounds/${ids[spyB]}`, spyB)).body.over).toBe(true);
  });

  test("Fais-moi deviner : mots interdits bloqués, mot trouvé par l'équipier", async () => {
    const { call, advance } = setup(["u1", "u2"]);
    const ids: Record<string, string> = {};
    for (const u of ["u1", "u2"]) ids[u] = (await call("/rounds", u, { game: "devine", context: "classique", sessionId: "g" })).body.id;
    const v = (await call(`/party/${ids.u1}`, "u1")).body.view;
    const teller = v.turn.teller as string;
    const guesser = teller === "u1" ? "u2" : "u1";
    const tv = (await call(`/party/${ids[teller]}`, teller)).body.view;
    expect((await call(`/party/${ids[guesser]}`, guesser)).body.view.word).toBeNull();
    expect((await call(`/party/${ids[teller]}/act`, teller, { type: "clue", text: "un indice avec " + tv.word.fr.banned[0] })).body.error).toBe("banned_word");
    const found = (await call(`/party/${ids[guesser]}/act`, guesser, { type: "guess", text: tv.word.fr.word })).body.view;
    expect(found.points[0]).toBe(1);
    // Fin des tours : les manches se closent avec le score de l'équipe
    advance(61_000);
    await call(`/party/${ids.u1}`, "u1");
    advance(61_000);
    const last = (await call(`/party/${ids.u1}`, "u1")).body;
    expect(last.view.over).toBe(true);
    expect(last.round.over).toBe(true);
  });
});

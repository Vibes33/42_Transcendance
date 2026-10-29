import { describe, expect, test } from "bun:test";
import { MAYHEM_CREST_BY_ID, MAYHEM_ROLES, MAYHEM_TEAM_BY_ID, mayhemRating, mayhemWins, rosterPicks } from "@loltr/content";
import { mayhem, type MayhemState } from "./games/mayhem";
import { botFill } from "./games/mayhemDraft";
import { simulateTournament } from "./games/mayhemSim";

const T0 = 1_000_000;

function draft(seed = "graine"): MayhemState {
  let s = mayhem.create({ seed, now: T0, seen: new Set() }).state;
  // Prend à chaque tirage le premier poste encore libre
  while (Object.keys(s.picks).length < 5) {
    const i = MAYHEM_ROLES.findIndex((r) => !s.picks[r]);
    s = mayhem.act(s, { type: "pick", index: i }, T0).state;
  }
  return s;
}

describe("World Mayhem", () => {
  test("note d'équipe : un roster complet a tous ses liens (plafonnés à +10)", () => {
    const r = mayhemRating(rosterPicks(MAYHEM_TEAM_BY_ID["t1-23"]));
    expect(r.linkBonus).toBe(10);
    expect(r.rating).toBe(Math.round(93 * 0.9 + 10));
  });

  test("duo bot du même roster : +4, même structure une autre année : moitié", () => {
    expect(mayhemRating({ adc: { t: "t1-23", i: 3 }, sup: { t: "t1-23", i: 4 } }).linkBonus).toBe(4);
    expect(mayhemRating({ adc: { t: "t1-23", i: 3 }, sup: { t: "t1-24", i: 4 } }).linkBonus).toBe(2);
    expect(mayhemRating({ adc: { t: "t1-23", i: 3 }, sup: { t: "drx-22", i: 4 } }).linkBonus).toBe(0);
  });

  test("anciens coéquipiers : un lien même si ce n'est pas la même année", () => {
    // Faker (T1 2022) et Keria (T1 2024) ont joué ensemble en 2022, 2023, 2024 et 2025 : léger bonus
    const r = mayhemRating({ mid: { t: "t1-22", i: 2 }, sup: { t: "t1-24", i: 4 } });
    expect(r.links.map((l) => [l.same, l.bonus])).toEqual([["passe", 1]]);
    // Un duo bot d'années différentes vaut la moitié du duo du même roster (+4 → +2)
    expect(mayhemRating({ adc: { t: "t1-23", i: 3 }, sup: { t: "t1-24", i: 4 } }).links[0]).toMatchObject({ same: "passe", bonus: 2 });
    // Jamais coéquipiers : aucun lien
    expect(mayhemRating({ mid: { t: "t1-22", i: 2 }, sup: { t: "drx-22", i: 4 } }).linkBonus).toBe(0);
  });

  test("écusson : 3 joueurs de la structure +1, 4 ou plus +2, sans écusson ou autre structure rien", () => {
    const three = { top: { t: "t1-23", i: 0 }, jgl: { t: "t1-24", i: 1 }, mid: { t: "t1-22", i: 2 }, adc: { t: "drx-22", i: 3 }, sup: { t: "dwg-20", i: 4 } };
    const bonus = (picks: typeof three, crest?: string) => mayhemRating(picks, crest).links.filter((l) => l.same === "ecusson").map((l) => l.bonus);
    expect(bonus(three, "t1")).toEqual([1]);
    expect(bonus(three)).toEqual([]);
    expect(bonus(three, "drx")).toEqual([]);
    expect(bonus({ ...three, adc: { t: "t1-25", i: 3 } }, "t1")).toEqual([2]);
    // Karmine Corp n'a pas de roster aux Worlds : pas de bonus
    expect(bonus(three, "karminecorp")).toEqual([]);
  });

  test("un poste ne se prend qu'une fois, et chaque choix tire une nouvelle équipe", () => {
    let s = mayhem.create({ seed: "x", now: T0, seen: new Set() }).state;
    s = mayhem.act(s, { type: "pick", index: 2 }, T0).state;
    expect(s.picks.mid).toBeTruthy();
    expect(s.draws).toBe(2);
    expect(() => mayhem.act(s, { type: "pick", index: 2 }, T0)).toThrow();
  });

  test("tirages : jamais deux fois la même équipe d'affilée, et une équipe ne revient que si on y a pris un joueur", () => {
    let returns = 0;
    for (let k = 0; k < 40; k++) {
      let s = mayhem.create({ seed: "t" + k, now: T0, seen: new Set() }).state;
      const seen = new Set([s.current]);
      while (Object.keys(s.picks).length < 5) {
        const prev = s.current;
        const free = MAYHEM_ROLES.findIndex((r) => !s.picks[r]);
        s = mayhem.act(s, { type: "pick", index: free }, T0).state;
        if (Object.keys(s.picks).length === 5) break;
        expect(s.current).not.toBe(prev);
        if (seen.has(s.current)) {
          returns++;
          expect(Object.values(s.picks).some((p) => p!.t === s.current)).toBe(true);
        }
        seen.add(s.current);
      }
    }
    // Les retours d'équipe existent (environ 3 tirages sur 10), pour viser des liens de roster
    expect(returns).toBeGreaterThan(10);
  });

  test("équilibre : les bots draftent comme un joueur, sans rosters complets", () => {
    const bots = botFill("equilibre", 200);
    const avg = bots.reduce((n, b) => n + b.rating, 0) / bots.length;
    expect(avg).toBeGreaterThan(80);
    expect(avg).toBeLessThan(87);
    // Un roster complet (5 joueurs de la même équipe) reste rare
    const full = bots.filter((b) => new Set(Object.values(b.picks).map((p) => p!.t)).size === 1).length;
    expect(full).toBeLessThan(10);
  });

  test("les 15 bots d'un tournoi portent 15 écussons de vraies équipes, jamais celui du joueur", () => {
    const bots = botFill("noms", 15, ["t1"]);
    const ids = bots.map((b) => b.crest!.id);
    expect(new Set(ids).size).toBe(15);
    expect(ids).not.toContain("t1");
    for (const b of bots) expect(MAYHEM_CREST_BY_ID[b.crest!.id]).toBeTruthy();
  });

  test("écusson : choisi avant le draft, nom libre (2 à 24 caractères), porté dans le tournoi", () => {
    let s = mayhem.create({ seed: "e", now: T0, seen: new Set() }).state;
    expect(() => mayhem.act(s, { type: "crest", id: "inconnu", name: "Équipe" }, T0)).toThrow();
    expect(() => mayhem.act(s, { type: "crest", id: "karminecorp", name: " a " }, T0)).toThrow();
    s = mayhem.act(s, { type: "crest", id: "karminecorp", name: "  Les   Blue Wall du KC — édition très spéciale  " }, T0).state;
    expect(s.crest!.name).toBe("Les Blue Wall du KC — éd");
    expect(s.crest!.tag).toBe("KC");
    while (Object.keys(s.picks).length < 5) s = mayhem.act(s, { type: "pick", index: MAYHEM_ROLES.findIndex((r) => !s.picks[r]) }, T0).state;
    s = mayhem.act(s, { type: "lock" }, T0).state;
    expect(s.tournament!.entrants[0].crest!.id).toBe("karminecorp");
    expect(s.tournament!.entrants.slice(1).every((e) => e.crest && e.crest.id !== "karminecorp")).toBe(true);
  });

  test("3 jokers, pas un de plus", () => {
    let s = mayhem.create({ seed: "j", now: T0, seen: new Set() }).state;
    for (let i = 0; i < 3; i++) s = mayhem.act(s, { type: "reroll" }, T0).state;
    expect(s.jokers).toBe(0);
    expect(() => mayhem.act(s, { type: "reroll" }, T0)).toThrow();
  });

  test("solo : valider l'équipe simule le tournoi, la manche finit après", () => {
    let s = draft();
    expect(() => mayhem.act(s, { type: "done" }, T0)).toThrow();
    s = mayhem.act(s, { type: "lock" }, T0).state;
    expect(s.tournament!.entrants.length).toBe(16);
    expect(s.tournament!.groups.map((g) => g.matches.length)).toEqual([6, 6, 6, 6]);
    expect(s.tournament!.groups[0].members).toContain(0);
    expect(s.tournament!.rounds.map((r) => r.length)).toEqual([4, 2, 1]);
    s = mayhem.act(s, { type: "done" }, T0 + 5000).state;
    expect(mayhem.isOver(s, T0 + 5000)).toBe(true);
    const res = mayhem.result(s, T0 + 5000);
    expect(res.wins).toBe(mayhemWins(s.tournament!, 0));
    expect(res.rating).toBe(mayhemRating(s.picks).rating);
  });

  test("avancement du tournoi enregistré : il ne recule jamais et reprend après une sortie", () => {
    let s = draft();
    expect(() => mayhem.act(s, { type: "watched", step: 1 }, T0)).toThrow();
    s = mayhem.act(s, { type: "lock" }, T0).state;
    expect((mayhem.publicState(s, T0) as { watched: number }).watched).toBe(0);
    s = mayhem.act(s, { type: "watched", step: 3 }, T0).state;
    s = mayhem.act(s, { type: "watched", step: 1 }, T0).state;
    expect((mayhem.publicState(s, T0) as { watched: number }).watched).toBe(3);
  });

  test("simulation : déterministe, Bo respectés, chronologie cohérente", () => {
    const entrants = botFill("fill", 16);
    const a = simulateTournament("seed", entrants);
    const b = simulateTournament("seed", entrants);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Les quarts réunissent les 2 premiers de chaque poule
    const qualified = a.groups.flatMap((g) => g.standings.slice(0, 2)).sort();
    expect(a.rounds[0].flatMap((m) => [m.a, m.b]).sort()).toEqual(qualified);
    for (const g of a.groups) for (const m of g.matches) expect(m.games.length).toBe(1);
    for (const [round, bo] of a.rounds.map((r, i) => [r, [1, 3, 5][i]] as const)) {
      for (const m of round) {
        expect(Math.max(...m.wins)).toBe((bo + 1) / 2);
        for (const g of m.games) {
          const ev = g.events;
          expect(ev.at(-1)!.kind).toBe("nexus");
          expect(ev.every((e, i) => i === 0 || e.t >= ev[i - 1].t)).toBe(true);
          const kills = ev.reduce((n, e) => n + e.ka, 0);
          expect(g.kda.a.reduce((n, k) => n + k[0], 0)).toBe(kills);
        }
      }
    }
  });
});

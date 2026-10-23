import { describe, expect, test } from "bun:test";
import { MAYHEM_ROLES, MAYHEM_TEAM_BY_ID, mayhemRating, mayhemWins, rosterPicks } from "@loltr/content";
import { mayhem, type MayhemState } from "./games/mayhem";
import { simulateTournament, historicFill } from "./games/mayhemSim";

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

  test("un poste ne se prend qu'une fois, et chaque choix tire une nouvelle équipe", () => {
    let s = mayhem.create({ seed: "x", now: T0, seen: new Set() }).state;
    s = mayhem.act(s, { type: "pick", index: 2 }, T0).state;
    expect(s.picks.mid).toBeTruthy();
    expect(s.draws).toBe(2);
    expect(() => mayhem.act(s, { type: "pick", index: 2 }, T0)).toThrow();
  });

  test("tirages sans remise : pas de doublon ni deux rosters de la même structure d'affilée", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      let s = mayhem.create({ seed, now: T0, seen: new Set() }).state;
      const drawn = [s.current];
      for (let i = 0; i < 3; i++) {
        s = mayhem.act(s, { type: "reroll" }, T0).state;
        drawn.push(s.current);
      }
      for (let i = 0; i < 4; i++) {
        const free = MAYHEM_ROLES.findIndex((r) => !s.picks[r]);
        s = mayhem.act(s, { type: "pick", index: free }, T0).state;
        drawn.push(s.current);
      }
      expect(new Set(drawn).size).toBe(drawn.length);
      const orgs = drawn.map((id) => MAYHEM_TEAM_BY_ID[id].org);
      expect(orgs.every((o, i) => i === 0 || o !== orgs[i - 1])).toBe(true);
    }
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

  test("simulation : déterministe, Bo respectés, chronologie cohérente", () => {
    const entrants = historicFill("fill", 16);
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

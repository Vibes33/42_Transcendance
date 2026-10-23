import { LITE_BY_ID, LITE_CHAMPIONS, mayhemRating, spellImg, splashImg, type ChampionAttributes } from "@loltr/content/lite";
import { CDJ_MAX_MS, CDJ_MAX_TRIES, SPLASH_BLUR, SPLASH_SCALE, WARMUP_MS, type GameKey, type RoundState } from "@loltr/shared";

// Manches d'exemple pour les tutoriels : le vrai jeu s'affiche avec un contenu de démonstration,
// sans créer de manche côté serveur (le chrono ne démarre qu'après le tutoriel).

type Code = "g" | "p" | "r" | "u" | "d";

function compare(guess: ChampionAttributes, target: ChampionAttributes): Code[] {
  const set = (a: string[], b: string[]): Code => (a.length === b.length && a.every((x) => b.includes(x)) ? "g" : a.some((x) => b.includes(x)) ? "p" : "r");
  return [
    guess.gender === target.gender ? "g" : "r",
    set(guess.positions, target.positions),
    set(guess.species, target.species),
    guess.resource === target.resource ? "g" : "r",
    set(guess.range, target.range),
    set(guess.regions, target.regions),
    guess.year === target.year ? "g" : target.year > guess.year ? "u" : "d"
  ];
}

export function demoRound(game: GameKey): RoundState<any> {
  const now = Date.now();
  const base = { id: "demo", game, context: "defi" as const, sessionId: null, startedAt: now, over: false, reveal: null, points: null };
  const lux = LITE_BY_ID.lux;
  const ahri = LITE_BY_ID.ahri;

  if (game === "cdj") {
    const guesses = ["ahri", "jinx"].map((id) => ({ champion: id, codes: compare(LITE_BY_ID[id].attributes!, LITE_BY_ID.ekko.attributes!) }));
    return {
      ...base,
      endsAt: now + CDJ_MAX_MS,
      warmUntil: null,
      public: { guesses, tries: guesses.length, maxTries: CDJ_MAX_TRIES, deadline: now + CDJ_MAX_MS, found: false, over: false }
    };
  }

  if (game === "meli") {
    // Les 4 sorts de Lux mêlés à 21 sorts d'autres champions, toujours dans le même ordre
    const goal = lux.spells.filter((s) => s.slot !== "P");
    const others = LITE_CHAMPIONS.filter((c) => c.id !== "lux")
      .slice(0, 21)
      .map((c, i) => c.spells[1 + (i % 4)]);
    const tiles = [...others];
    [2, 8, 16, 22].forEach((pos, i) => tiles.splice(pos, 0, goal[i]));
    return {
      ...base,
      endsAt: now + WARMUP_MS + 30_000,
      warmUntil: now + WARMUP_MS,
      public: { target: "lux", tileCount: 25, round: 0, found: [], champions: 0, history: [], endsAt: now + WARMUP_MS + 30_000, warmUntil: now + WARMUP_MS, over: false, demoImages: tiles.map(spellImg) }
    };
  }

  if (game === "mayhem") {
    // Draft en cours : Faker au mid, l'équipe tirée est BLG 2024
    const picks = { mid: { t: "t1-23", i: 2 } };
    return {
      ...base,
      endsAt: null,
      warmUntil: null,
      public: { current: "blg-24", picks, jokers: 3, history: [{ t: "t1-23", what: "Faker" }], locked: false, group: false, tournament: null, me: 0, rating: mayhemRating(picks), over: false }
    };
  }

  if (game === "se") {
    return {
      ...base,
      endsAt: now + WARMUP_MS + 30_000,
      warmUntil: now + WARMUP_MS,
      public: { q: 0, correct: 0, skipped: 0, last: null, endsAt: now + WARMUP_MS + 30_000, warmUntil: now + WARMUP_MS, over: false, demoImage: spellImg(ahri.spells[1]) }
    };
  }

  return {
    ...base,
    endsAt: null,
    warmUntil: null,
    public: { step: 0, scale: SPLASH_SCALE[0], blur: SPLASH_BLUR[0], origin: "50% 35%", misses: [], found: false, champion: null, skinChoices: [], skinPick: null, over: false, demoImage: splashImg(ahri, 0) }
  };
}

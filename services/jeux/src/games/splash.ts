import { SPLASH_BLUR, SPLASH_SCALE, pick, rng, shuffle } from "@loltr/shared";
import { CHAMPIONS, CHAMPION_BY_ID, img } from "@loltr/content";
import { GameError, resolveChampion, type GameEngine } from "./engine";

// Splash mystère : un splash art très zoomé et flou se dévoile à chaque erreur (6 crans).
// Champion trouvé = 70 points, puis une seule tentative sur le skin (4 choix) = 30 points.

interface S {
  champ: string;
  skinNum: number;
  choices: number[];
  origin: string;
  misses: string[];
  found: boolean;
  skinPick: number | null;
  startedAt: number;
  endedAt: number | null;
}

const step = (s: S) => (s.found ? 6 : Math.min(6, s.misses.length));

export const splash: GameEngine<S> = {
  key: "splash",
  create({ seed, now, seen }) {
    const r = rng(seed);
    const pool = CHAMPIONS.filter((c) => c.skins.length >= 2 && !seen.has(c.id));
    const c = pick(pool.length ? pool : CHAMPIONS, r);
    const skin = pick(c.skins, r);
    const others = shuffle(c.skins.filter((k) => k.num !== skin.num), r).slice(0, 3);
    const choices = shuffle([skin, ...others], r).map((k) => k.num);
    const origin = `${Math.round(20 + r() * 60)}% ${Math.round(25 + r() * 50)}%`;
    return {
      state: { champ: c.id, skinNum: skin.num, choices, origin, misses: [], found: false, skinPick: null, startedAt: now, endedAt: null },
      contentKey: c.id + ":" + skin.num
    };
  },
  publicState(s, now) {
    const st = step(s);
    return {
      step: st,
      scale: SPLASH_SCALE[st],
      blur: SPLASH_BLUR[st],
      origin: s.origin,
      misses: s.misses,
      found: s.found,
      champion: s.found ? s.champ : null,
      // Les choix de skin n'apparaissent qu'une fois le champion trouvé
      skinChoices: s.found ? s.choices.map((num) => ({ num, names: CHAMPION_BY_ID[s.champ].skins.find((k) => k.num === num)!.names })) : [],
      skinPick: s.skinPick,
      over: this.isOver(s, now)
    };
  },
  act(s, action, now) {
    if (this.isOver(s, now)) throw new GameError("round_over", "La manche est terminée.");
    if (action.type === "guess") {
      if (s.found) throw new GameError("already_found");
      const c = resolveChampion(action);
      if (c.id === s.champ) return { state: { ...s, found: true }, feedback: { correct: c.id } };
      if (s.misses.includes(c.id)) throw new GameError("already_guessed", "Déjà proposé.");
      return { state: { ...s, misses: [...s.misses, c.id] }, feedback: { wrong: c.id } };
    }
    if (action.type === "skin") {
      if (!s.found) throw new GameError("champion_first");
      if (s.skinPick !== null) throw new GameError("skin_done", "Une seule tentative pour le skin.");
      const num = Number(action.num);
      if (!s.choices.includes(num)) throw new GameError("bad_skin");
      return { state: { ...s, skinPick: num, endedAt: now }, feedback: { skinCorrect: num === s.skinNum, skinNum: s.skinNum } };
    }
    throw new GameError("bad_action");
  },
  isOver(s) {
    return s.endedAt !== null;
  },
  finish(s, now) {
    return s.endedAt ? s : { ...s, endedAt: now };
  },
  result(s, now) {
    return {
      game: "splash",
      found: s.found,
      skinFound: s.found && s.skinPick === s.skinNum,
      tries: s.misses.length + (s.found ? 1 : 0),
      durationMs: (s.endedAt ?? now) - s.startedAt
    };
  },
  reveal(s) {
    return { champion: s.champ, skinNum: s.skinNum, skin: CHAMPION_BY_ID[s.champ].skins.find((k) => k.num === s.skinNum)?.names ?? null };
  },
  progress(s) {
    return { tries: s.misses.length + (s.found ? 1 : 0), step: step(s), found: s.found };
  },
  image(s) {
    return img.splash(CHAMPION_BY_ID[s.champ], s.skinNum);
  },
  timers() {
    return { endsAt: null, warmUntil: null };
  }
};

import { DAILY_GAME_COUNT, GAMES, GAME_KEYS, type GameKey } from "./rules";
import { rng, shuffle } from "./rng";

/**
 * Rotation du jour, la même pour tout le monde : Champion du jour toujours en premier,
 * puis 3 jeux tirés chaque jour parmi les jeux éligibles.
 */
export function rotationFor(day: string): GameKey[] {
  const always = GAME_KEYS.filter((k) => GAMES[k].alwaysInDaily);
  const drawn = shuffle(GAME_KEYS.filter((k) => GAMES[k].dailyEligible && !GAMES[k].alwaysInDaily), rng("rotation:" + day));
  return [...always, ...drawn].slice(0, DAILY_GAME_COUNT);
}

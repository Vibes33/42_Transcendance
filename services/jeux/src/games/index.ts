import type { GameKey } from "@loltr/shared";
import { cdj } from "./cdj";
import type { GameEngine } from "./engine";
import { mayhem } from "./mayhem";
import { meli } from "./meli";
import { se } from "./se";
import { splash } from "./splash";

/** Moteurs enregistrés. Un nouveau jeu = un moteur de plus ici + sa fiche dans shared/rules.ts. */
export const ENGINES: Record<GameKey, GameEngine> = { cdj, meli, se, splash, mayhem };
export { GameError } from "./engine";

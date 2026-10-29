import type { GameKey } from "@loltr/shared";
import { buildpath } from "./buildpath";
import { cdj } from "./cdj";
import { chaudfroid } from "./chaudfroid";
import { connexions } from "./connexions";
import type { GameEngine } from "./engine";
import { mayhem } from "./mayhem";
import { meli } from "./meli";
import { parfait } from "./parfait";
import { codenames, devine } from "./party";
import { portrait } from "./portrait";
import { qcm } from "./qcm";
import { se } from "./se";
import { splash } from "./splash";
import { sudoku } from "./sudoku";

/** Moteurs enregistrés. Un nouveau jeu = un moteur de plus ici + sa fiche dans shared/rules.ts. */
export const ENGINES: Record<GameKey, GameEngine> = { cdj, meli, se, splash, mayhem, portrait, connexions, chaudfroid, codenames, buildpath, devine, qcm, parfait, sudoku };
export { PARTIES } from "./party";
export { GameError } from "./engine";

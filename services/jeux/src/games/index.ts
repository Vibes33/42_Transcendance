import type { GameKey } from "@loltr/shared";
import { cdj } from "./cdj";
import type { GameEngine } from "./engine";
import { meli } from "./meli";
import { se } from "./se";
import { splash } from "./splash";

/** Moteurs enregistrés. Un nouveau jeu = un moteur de plus ici + sa fiche dans shared/rules.ts. */
export const ENGINES: Record<GameKey, GameEngine> = { cdj, meli, se, splash };
export { GameError } from "./engine";

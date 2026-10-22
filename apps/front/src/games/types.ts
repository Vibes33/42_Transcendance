import type { RoundState } from "@loltr/shared";
import type { GameFlow } from "../components/game";

// Contrat côté interface : chaque jeu reçoit sa manche (générée par le serveur), de quoi agir dessus
// et le déroulement de la partie. Ajouter un jeu = un composant + une entrée dans games/index.ts.

export interface GameProps<P = any> {
  round: RoundState<P>;
  /** Envoie une action au serveur ; renvoie le retour immédiat (bonne réponse, erreur…). */
  act: (action: Record<string, unknown>) => Promise<{ feedback: any } | null>;
  /** Fin de chrono signalée au serveur, ou abandon. */
  finish: (quit?: boolean) => Promise<void>;
  flow: GameFlow;
  groupSize: number;
  namesLang: "fr" | "en";
}

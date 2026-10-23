import type { ComponentType } from "react";
import type { GameKey } from "@loltr/shared";
import { ChampionDuJour } from "./ChampionDuJour";
import { MeliMelol } from "./MeliMelol";
import { SortsEclair } from "./SortsEclair";
import { SplashMystere } from "./SplashMystere";
import { WorldMayhem } from "./WorldMayhem";
import type { GameProps } from "./types";
import type { TourStep } from "../components/Tutorial";

// Registre des jeux côté interface : composant et tutoriel (joué à la première partie en solo).

/** Étape de tutoriel : `target` désigne l'élément du jeu mis en avant (attribut data-tuto). */
export type TutorialStep = TourStep;

export const GAME_UI: Record<GameKey, { component: ComponentType<GameProps>; tutorial: TutorialStep[] }> = {
  cdj: {
    component: ChampionDuJour,
    tutorial: [
      { target: "cdj-input", title: "Devine le champion caché", text: "Tape le nom d’un champion : chaque essai compare 7 attributs avec le champion du jour." },
      { target: "cdj-grid", title: "Lis les cases", text: "Vert ✓ : identique. Orange ≈ : en partie. Rouge ✕ : différent. Pour l’année, la flèche indique s’il est sorti plus tôt ou plus tard." },
      { target: "cdj-counter", title: "20 essais, 10 minutes", text: "Trouve-le pour gagner 100 points de base, puis jusqu’à 150 points selon ton classement mondial du jour." }
    ]
  },
  meli: {
    component: MeliMelol,
    tutorial: [
      { target: "meli-target", title: "Trouve les 4 sorts", text: "Un champion est affiché : retrouve ses 4 sorts dans la grille." },
      { target: "meli-grid", title: "La grille", text: "Clique ses sorts parmi les 25 icônes. Une erreur fait trembler la case, sans pénalité." },
      { target: "meli-timer", title: "Course contre la montre", text: "30 secondes au départ, +5 s par champion complété. La grille se dévoile en 1 seconde, puis le chrono démarre." },
      { target: "meli-counter", title: "Réussite", text: "Au défi du jour, plus de 10 champions complétés rapportent les 100 points de base." }
    ]
  },
  se: {
    component: SortsEclair,
    tutorial: [
      { target: "se-icon", title: "À qui est ce sort ?", text: "Une icône de sort s’affiche : à quel champion appartient-elle ?" },
      { target: "se-input", title: "Réponds vite", text: "Tape le nom du champion, les fautes de frappe sont tolérées. Tu peux passer un sort difficile." },
      { target: "se-timer", title: "Chaque seconde compte", text: "30 secondes au départ, +3 s par bonne réponse." }
    ]
  },
  splash: {
    component: SplashMystere,
    tutorial: [
      { target: "splash-image", title: "Un splash art caché", text: "L’image est très zoomée et floue. À chaque erreur, elle se dévoile un peu plus." },
      { target: "splash-steps", title: "Le zoom se dévoile", text: "Six crans de zoom : chaque erreur dézoome et défloute un peu l’image." },
      { target: "splash-input", title: "Champion, puis skin", text: "Le champion vaut 70 points. Ensuite, une seule tentative pour le skin, qui vaut 30 points." }
    ]
  },
  mayhem: {
    component: WorldMayhem,
    tutorial: [
      { target: "mayhem-draw", title: "Une équipe tirée au sort", text: "Une équipe des Worlds 2020 à 2025 est tirée : prends un de ses joueurs pour un poste libre. Une nouvelle équipe est tirée juste après." },
      { target: "mayhem-map", title: "Un joueur par poste", text: "Tes joueurs prennent place sur la carte. Les joueurs d’un même roster se complètent : duo bot, mid-jungle…" },
      { target: "mayhem-score", title: "Ta note d’équipe", text: "Elle combine la note des cartes et les liens. Valide ton équipe pour lancer un tournoi à 8 : quarts, demies, finale." }
    ]
  }
};

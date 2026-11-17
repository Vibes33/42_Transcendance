import type { NavigateFunction } from "react-router-dom";
import { GAMES, type GameKey, type LiveSession } from "@loltr/shared";
import { post } from "../api/client";
import { keys, queryClient } from "../api/queries";
import { useLive } from "../state/live";
import { useUi } from "../state/ui";
import { t } from "../i18n";

// Lancement des parties : défi du jour en solo, partie de groupe (défi ou classique) via le service temps réel.

export const partieUrl = (ctx: "defi" | "classique" | "streamer", game?: GameKey | null, session?: string | null) => {
  const q = new URLSearchParams({ ctx });
  if (game) q.set("game", game);
  if (session) q.set("session", session);
  return "/partie?" + q.toString();
};

export async function startDefiSolo(nav: NavigateFunction, status?: string) {
  try {
    // Un défi déjà commencé (même en groupe) se poursuit : c'est une reprise, pas un second défi
    if (status !== "running") await post("/api/jeux/daily/start", { mode: "solo" });
    await queryClient.invalidateQueries({ queryKey: keys.daily });
    nav(partieUrl("defi"));
  } catch (e) {
    useUi.getState().toast((e as Error).message, "danger");
  }
}

/** Pourquoi ce groupe ne peut pas lancer ce jeu, ou null s'il le peut. */
export function groupBlock(game: GameKey, size: number): string | null {
  const m = GAMES[game];
  if (!m.modes.includes("groupe")) return t("Ce jeu se joue seul.");
  if (size < m.minPlayers) return t("Il faut au moins {n} joueurs pour ce jeu.", { n: m.minPlayers });
  if (size > m.maxPlayers) return t("Ce jeu se joue à {n} au plus.", { n: m.maxPlayers });
  return null;
}

/**
 * Partie avec des amis : il faut un groupe avec au moins un autre joueur. Le service temps réel
 * inscrit tout le groupe ; chacun est emmené sur la partie par la connexion temps réel.
 */
export async function startGroup(
  nav: NavigateFunction,
  opts: { isUser: boolean; inGroup: boolean; mates: number; context: "defi" | "classique"; game?: GameKey; dailyMode?: "solo" | "groupe" | null }
) {
  const ui = useUi.getState();
  if (!opts.isUser) return ui.askLogin("amis");
  if (!opts.inGroup) return ui.setNeedGroup("aucun");
  if (opts.mates === 0) return ui.setNeedGroup("vide");
  // Nombre de joueurs et modes du jeu (manifeste) : le serveur refuse aussi, on prévient avant
  const why = opts.game ? groupBlock(opts.game, opts.mates + 1) : null;
  if (why) return ui.toast(why, "danger");
  // Chaque jour, le défi se fait en solo OU en groupe
  if (opts.context === "defi" && opts.dailyMode === "solo") return ui.toast(t("Tu as déjà commencé le défi du jour en solo."), "danger");
  try {
    const s = await post<LiveSession>("/api/temps-reel/sessions/group", { context: opts.context, game: opts.game });
    useLive.getState().setSession(s);
    if (s.context === "defi") await post("/api/jeux/daily/start", { mode: "groupe", sessionId: s.id });
    nav(partieUrl(s.context === "defi" ? "defi" : "classique", s.games[s.index], s.id));
  } catch (e) {
    ui.toast((e as Error).message, "danger");
  }
}

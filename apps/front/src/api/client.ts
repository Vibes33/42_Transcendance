import { hasTranslation, t } from "../i18n";

// Client HTTP des microservices, tous derrière Traefik sur /api/<service>.
// Le cookie de session part avec chaque requête ; Traefik vérifie l'identité auprès du service auth.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// Texte affiché pour chaque code d'erreur des services (le message du serveur, en français, n'est
// repris que s'il a sa traduction dans la langue du site).
const MESSAGES: Record<string, string> = {
  unauthenticated: "Connexion requise.",
  account_required: "Cette fonctionnalité demande un compte.",
  internal: "Le serveur a rencontré un problème. Réessaie dans un instant.",
  network: "Impossible de joindre le serveur.",
  rate_limited: "Trop de requêtes, patiente quelques secondes.",
  validation: "Données invalides.",
  bad_json: "Requête illisible.",
  not_found: "Introuvable.",
  not_in_session: "Tu ne fais pas partie de cette partie.",
  session_not_found: "Cette partie n’existe plus.",
  round_not_found: "Cette manche n’existe plus.",
  party_not_found: "Cette partie n’existe plus.",
  not_in_recap: "Le classement n’est pas affiché pour l’instant.",
  not_streamer: "Seul le streamer peut faire ça.",
  not_next_game: "Ce n’est pas le prochain jeu du défi.",
  daily_not_started: "Commence d’abord le défi du jour.",
  not_over: "La manche n’est pas encore finie.",
  not_classic: "Ce jeu se joue uniquement dans le défi du jour.",
  unknown_game: "Jeu inconnu.",
  no_group: "Crée d’abord un groupe.",
  already_in_group: "Ce joueur est déjà dans un groupe.",
  already_invited: "Ce joueur est déjà invité.",
  already_friends: "Ce joueur est déjà dans tes amis.",
  already_requested: "Demande déjà envoyée.",
  not_friend: "Ce joueur n’est pas dans tes amis.",
  no_invite: "Cette invitation n’existe plus.",
  no_request: "Cette demande n’existe plus.",
  player_not_found: "Aucun joueur avec ce pseudo.",
  self: "Tu ne peux pas faire ça avec toi-même.",
  device_required: "Recharge la page puis réessaie.",
  item_not_found: "Cet objet n’existe pas.",
  unknown_item: "Cet objet n’existe pas.",
  image_unavailable: "Image indisponible pour le moment.",
  no_image: "Image indisponible pour le moment.",
  role: "Rôle inconnu.",
  chibi_invalid: "Chibi inconnu.",
  skin_invalid: "Skin inconnu.",
  starter_invalid: "Ce chibi ne peut pas être choisi au départ.",
  not_enough_players: "Il n’y a pas assez de joueurs pour ce jeu.",
  too_many_players: "Il y a trop de joueurs pour ce jeu.",
  already_found: "Tu as déjà trouvé.",
  already_filled: "Cette case est déjà remplie.",
  champion_first: "Trouve d’abord le champion.",
  bad_action: "Action impossible.",
  bad_card: "Carte invalide.",
  bad_cell: "Case invalide.",
  bad_choice: "Choix invalide.",
  bad_item: "Objet invalide.",
  bad_skin: "Skin invalide.",
  bad_tile: "Case invalide.",
  bad_value: "Valeur invalide.",
  empty: "Réponse vide.",
  locked: "Débloque ce jeu à la boutique pour y jouer en illimité.",
  not_answered: "Réponds d’abord à la question.",
  not_yet: "Pas encore.",
  portrait_done: "Ce portrait est terminé.",
  warming: "Patiente, la manche commence."
};

// Décalage entre l'horloge du joueur et celle du serveur, mesuré à chaque réponse (la mesure faite
// avec l'aller-retour le plus court est la plus fiable)
let clockOffset = 0;
let bestRtt = Infinity;

/** Heure du serveur, à utiliser pour tout compte à rebours fondé sur un instant envoyé par le serveur. */
export const serverNow = () => Date.now() + clockOffset;

function learnClock(res: Response, sentAt: number) {
  const server = Number(res.headers.get("x-server-time"));
  if (!server) return;
  const back = Date.now();
  const rtt = back - sentAt;
  // Une mesure ancienne perd de sa valeur : l'horloge du joueur peut avoir été corrigée entre-temps
  bestRtt = Math.min(bestRtt * 1.05, 5000);
  if (rtt > bestRtt) return;
  bestRtt = rtt;
  clockOffset = server - (sentAt + back) / 2;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  const sentAt = Date.now();
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      credentials: "include",
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network", t(MESSAGES.network));
  }
  learnClock(res, sentAt);
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const code = (data as { error?: string } | null)?.error ?? (res.status === 429 ? "rate_limited" : "http_" + res.status);
    const server = (data as { message?: string } | null)?.message;
    const msg = server && hasTranslation(server) ? server : (MESSAGES[code] ?? server ?? MESSAGES.internal);
    throw new ApiError(res.status, code, t(msg));
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { body });
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const del = <T,>(path: string) => api<T>(path, { method: "DELETE" });

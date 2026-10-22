import { t } from "../i18n";

// Client HTTP des microservices, tous derrière Traefik sur /api/<service>.
// Le cookie de session part avec chaque requête ; Traefik vérifie l'identité auprès du service auth.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  unauthenticated: "Connexion requise.",
  account_required: "Cette fonctionnalité demande un compte.",
  internal: "Le serveur a rencontré un problème. Réessaie dans un instant.",
  network: "Impossible de joindre le serveur.",
  rate_limited: "Trop de requêtes, patiente quelques secondes."
};

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
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
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const code = (data as { error?: string } | null)?.error ?? (res.status === 429 ? "rate_limited" : "http_" + res.status);
    const msg = (data as { message?: string } | null)?.message ?? MESSAGES[code] ?? t(MESSAGES.internal);
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

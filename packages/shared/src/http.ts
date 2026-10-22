import { Elysia } from "elysia";

// Identité transmise par Traefik : le middleware forwardAuth appelle le service auth, qui renvoie
// ces en-têtes. Traefik retire d'abord ceux envoyés par le client (voir traefik/dynamic/middlewares.yml).

export type UserKind = "user" | "guest" | "anonymous";

export interface Caller {
  id: string | null;
  kind: UserKind;
  device: string | null;
  /** Compte de test (connexion de développement), seulement si AUTH_DEV_LOGIN=true sur ce service. */
  test: boolean;
}

export function callerFrom(headers: Record<string, string | undefined>): Caller {
  const kind = (headers["x-user-kind"] as UserKind) || "anonymous";
  const id = headers["x-user-id"] || null;
  const test = !!id && headers["x-user-test"] === "1" && process.env.AUTH_DEV_LOGIN === "true";
  return { id: kind === "anonymous" ? null : id, kind: id ? kind : "anonymous", device: headers["x-device-id"] || null, test };
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export const fail = (status: number, code: string, message?: string): never => {
  throw new HttpError(status, code, message);
};

/** Plugin commun : identité de l'appelant, gardes et format d'erreur unique. */
export const callerPlugin = new Elysia({ name: "loltr-caller" })
  .error({ HttpError })
  .onError({ as: "global" }, ({ code, error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.status;
      return { error: error.code, message: error.message };
    }
    if (code === "PARSE") {
      set.status = 400;
      return { error: "bad_json", message: "Requête illisible." };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "validation", message: "Données invalides." };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "not_found" };
    }
    console.error(error);
    set.status = 500;
    return { error: "internal" };
  })
  .derive({ as: "global" }, ({ headers }) => ({ caller: callerFrom(headers) }));

/** L'appelant doit avoir une session (compte ou invité). */
export function requireSession(caller: Caller): string {
  if (!caller.id) fail(401, "unauthenticated", "Connexion requise.");
  return caller.id as string;
}

/** Outils de test : réservés aux comptes de test, invisibles (404) pour tous les autres. */
export function requireTester(caller: Caller): string {
  if (!caller.test || !caller.id) fail(404, "not_found");
  return caller.id as string;
}

/** L'appelant doit avoir un vrai compte (pas un invité). */
export function requireAccount(caller: Caller): string {
  const id = requireSession(caller);
  if (caller.kind !== "user") fail(403, "account_required", "Cette fonctionnalité demande un compte.");
  return id;
}

// --- Appels internes entre services (jamais exposés par Traefik) ----------------------------

const INTERNAL_TOKEN = () => process.env.INTERNAL_TOKEN ?? "dev-internal-token";

export const SERVICE_URLS: Record<string, string> = {
  auth: process.env.AUTH_URL ?? "http://auth:3000",
  profil: process.env.PROFIL_URL ?? "http://profil:3000",
  social: process.env.SOCIAL_URL ?? "http://social:3000",
  jeux: process.env.JEUX_URL ?? "http://jeux:3000",
  classement: process.env.CLASSEMENT_URL ?? "http://classement:3000",
  "temps-reel": process.env.TEMPS_REEL_URL ?? "http://temps-reel:3000"
};

export async function internal<T = unknown>(service: keyof typeof SERVICE_URLS | string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(SERVICE_URLS[service] + path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-internal-token": INTERNAL_TOKEN() },
    body: init.body ? JSON.stringify(init.body) : undefined
  });
  if (!res.ok) throw new HttpError(res.status, "internal_call_failed", `${service}${path} → ${res.status}`);
  return (await res.json()) as T;
}

/** Garde des routes /internal : seul un service muni du jeton partagé peut les appeler. */
export const internalGuard = new Elysia({ name: "loltr-internal" }).onBeforeHandle({ as: "scoped" }, ({ headers, set }) => {
  if (headers["x-internal-token"] !== INTERNAL_TOKEN()) {
    set.status = 403;
    return { error: "forbidden" };
  }
});

export const health = new Elysia({ name: "loltr-health" }).get("/health", () => ({ ok: true }));

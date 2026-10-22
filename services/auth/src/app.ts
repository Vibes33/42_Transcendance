import { Elysia, t } from "elysia";
import { and, eq, gt, lt } from "drizzle-orm";
import { dayKey, type Provider, type SessionInfo } from "@loltr/shared";
import { callerPlugin, fail, health, type EventMap, type EventType } from "@loltr/shared/server";
import type { Db } from "./db";
import { oauthStates, sessions, users } from "./schema";
import { configuredProviders, finishAuth, startAuth } from "./providers";

const SESSION_COOKIE = "loltr_session";
const DEVICE_COOKIE = "loltr_device";
const SESSION_DAYS = 30;

export interface AuthDeps {
  db: Db;
  publish: <T extends EventType>(type: T, data: EventMap[T]) => Promise<unknown>;
  now?: () => number;
}

const sha256 = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
const randomToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function createAuthApp(deps: AuthDeps) {
  const { db } = deps;
  const now = deps.now ?? Date.now;
  const secure = (process.env.PUBLIC_URL ?? "https://").startsWith("https");
  const cookieOpts = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };

  /** Session valide liée au jeton, ou null. */
  function sessionOf(token: string | null) {
    if (!token) return null;
    const row = db
      .select({ userId: sessions.userId, kind: users.kind, provider: users.provider, mergedInto: users.mergedInto })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, now())))
      .get();
    return row && !row.mergedInto ? row : null;
  }

  function createSession(userId: string, deviceId: string | null) {
    const token = randomToken();
    db.insert(sessions).values({ id: sha256(token), userId, deviceId, createdAt: now(), expiresAt: now() + SESSION_DAYS * 86_400_000 }).run();
    return token;
  }

  /** Connexion réussie : crée ou retrouve le compte, et fusionne l'invité en cours s'il y en a un. */
  async function signIn(provider: Provider | "dev", subject: string, cookieHeader: string | undefined) {
    const subjectHash = sha256(provider + ":" + subject);
    let user = db.select().from(users).where(eq(users.subjectHash, subjectHash)).get();
    if (!user) {
      user = { id: crypto.randomUUID(), kind: "user", provider, subjectHash, createdAt: now(), mergedInto: null };
      db.insert(users).values(user).run();
      await deps.publish("user.created", { userId: user.id, kind: "user" });
    }
    const current = sessionOf(readCookie(cookieHeader, SESSION_COOKIE));
    if (current && current.kind === "guest" && current.userId !== user.id) {
      db.update(users).set({ mergedInto: user.id }).where(eq(users.id, current.userId)).run();
      db.delete(sessions).where(eq(sessions.userId, current.userId)).run();
      await deps.publish("user.merged", { guestId: current.userId, userId: user.id, day: dayKey(now()) });
    }
    return createSession(user.id, readCookie(cookieHeader, DEVICE_COOKIE));
  }

  const devLogin = () => process.env.AUTH_DEV_LOGIN === "true";

  return new Elysia({ prefix: "/api/auth" })
    .use(callerPlugin)
    .use(health)
    // Appelé par Traefik (forwardAuth) avant chaque requête d'API : identité vérifiée en en-têtes.
    .get("/verify", ({ headers, set }) => {
      const s = sessionOf(readCookie(headers.cookie, SESSION_COOKIE));
      set.headers["x-user-id"] = s?.userId ?? "";
      set.headers["x-user-kind"] = s ? s.kind : "anonymous";
      set.headers["x-device-id"] = readCookie(headers.cookie, DEVICE_COOKIE) ?? "";
      set.headers["x-user-test"] = s?.provider === "dev" && devLogin() ? "1" : "";
      return "ok";
    })
    .get("/session", ({ headers, cookie }): SessionInfo => {
      if (!readCookie(headers.cookie, DEVICE_COOKIE)) {
        cookie[DEVICE_COOKIE].set({ value: crypto.randomUUID(), ...cookieOpts, maxAge: 5 * 365 * 86_400 });
      }
      const s = sessionOf(readCookie(headers.cookie, SESSION_COOKIE));
      const providers = configuredProviders();
      return {
        userId: s?.userId ?? null,
        kind: s ? s.kind : "anonymous",
        provider: (s?.provider === "dev" ? null : s?.provider) ?? null,
        providers,
        ...(devLogin() ? { devLogin: true, testAccount: s?.provider === "dev" } : {})
      } as SessionInfo;
    })
    // « Jouer hors ligne » : un invité identifié côté serveur.
    .post("/guest", async ({ headers, cookie }) => {
      const existing = sessionOf(readCookie(headers.cookie, SESSION_COOKIE));
      if (existing) return { userId: existing.userId, kind: existing.kind };
      const id = crypto.randomUUID();
      db.insert(users).values({ id, kind: "guest", provider: null, subjectHash: null, createdAt: now(), mergedInto: null }).run();
      const token = createSession(id, readCookie(headers.cookie, DEVICE_COOKIE));
      cookie[SESSION_COOKIE].set({ value: token, ...cookieOpts, maxAge: SESSION_DAYS * 86_400 });
      await deps.publish("user.created", { userId: id, kind: "guest" });
      return { userId: id, kind: "guest" };
    })
    .get("/login/:provider", ({ params, redirect: go }) => {
      const p = params.provider as Provider;
      if (!configuredProviders().includes(p)) fail(404, "provider_disabled", "Ce mode de connexion n’est pas configuré.");
      const s = startAuth(p);
      db.delete(oauthStates).where(lt(oauthStates.createdAt, now() - 600_000)).run();
      db.insert(oauthStates).values({ state: s.state, provider: p, codeVerifier: s.codeVerifier, createdAt: now() }).run();
      return go(s.url.toString(), 302);
    })
    .get(
      "/callback/:provider",
      async ({ params, query, headers, cookie, redirect: go }) => {
        const p = params.provider as Provider;
        const st = db.select().from(oauthStates).where(eq(oauthStates.state, query.state ?? "")).get();
        if (!st || st.provider !== p || st.createdAt < now() - 600_000 || !query.code) return go("/connexion?erreur=oauth", 302);
        db.delete(oauthStates).where(eq(oauthStates.state, st.state)).run();
        let subject: string;
        try {
          subject = await finishAuth(p, query.code, st.codeVerifier);
        } catch (e) {
          console.error("OAuth", p, e);
          return go("/connexion?erreur=oauth", 302);
        }
        const token = await signIn(p, subject, headers.cookie);
        cookie[SESSION_COOKIE].set({ value: token, ...cookieOpts, maxAge: SESSION_DAYS * 86_400 });
        return go("/", 302);
      },
      { query: t.Object({ code: t.Optional(t.String()), state: t.Optional(t.String()), error: t.Optional(t.String()) }) }
    )
    // Connexion de test (développement uniquement, désactivée par défaut).
    .post(
      "/dev-login",
      async ({ body, headers, cookie }) => {
        if (!devLogin()) fail(404, "not_found");
        const token = await signIn("dev", body.name.trim().toLowerCase(), headers.cookie);
        cookie[SESSION_COOKIE].set({ value: token, ...cookieOpts, maxAge: SESSION_DAYS * 86_400 });
        return { ok: true };
      },
      { body: t.Object({ name: t.String({ minLength: 1, maxLength: 32 }) }) }
    )
    .post("/logout", ({ headers, cookie }) => {
      const token = readCookie(headers.cookie, SESSION_COOKIE);
      if (token) db.delete(sessions).where(eq(sessions.id, sha256(token))).run();
      cookie[SESSION_COOKIE].set({ value: "", ...cookieOpts, maxAge: 0 });
      return { ok: true };
    })
    // Suppression du compte (RGPD) : le compte, ses sessions ; les autres services nettoient sur l'événement.
    .delete("/me", async ({ headers, cookie }) => {
      const s = sessionOf(readCookie(headers.cookie, SESSION_COOKIE));
      if (!s) fail(401, "unauthenticated");
      db.delete(users).where(eq(users.id, s!.userId)).run();
      cookie[SESSION_COOKIE].set({ value: "", ...cookieOpts, maxAge: 0 });
      return { ok: true };
    });
}

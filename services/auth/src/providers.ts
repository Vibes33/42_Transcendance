import { Apple, Discord, Google, decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import type { Provider } from "@loltr/shared";

// Fournisseurs OAuth. On ne demande aucune donnée personnelle : seulement l'identifiant du compte.

const base = () => process.env.PUBLIC_URL ?? "https://localhost:8443";
const redirect = (p: Provider) => `${base()}/api/auth/callback/${p}`;

function pemToPkcs8(pem: string): Uint8Array {
  const b64 = pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function configuredProviders(): Provider[] {
  const e = process.env;
  const out: Provider[] = [];
  if (e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET) out.push("google");
  if (e.APPLE_CLIENT_ID && e.APPLE_TEAM_ID && e.APPLE_KEY_ID && e.APPLE_PRIVATE_KEY) out.push("apple");
  if (e.DISCORD_CLIENT_ID && e.DISCORD_CLIENT_SECRET) out.push("discord");
  return out;
}

export interface AuthStart {
  url: URL;
  state: string;
  codeVerifier: string | null;
}

export function startAuth(p: Provider): AuthStart {
  const e = process.env;
  const state = generateState();
  if (p === "google") {
    const codeVerifier = generateCodeVerifier();
    const g = new Google(e.GOOGLE_CLIENT_ID!, e.GOOGLE_CLIENT_SECRET!, redirect("google"));
    return { url: g.createAuthorizationURL(state, codeVerifier, ["openid"]), state, codeVerifier };
  }
  if (p === "discord") {
    const codeVerifier = generateCodeVerifier();
    const d = new Discord(e.DISCORD_CLIENT_ID!, e.DISCORD_CLIENT_SECRET!, redirect("discord"));
    return { url: d.createAuthorizationURL(state, codeVerifier, ["identify"]), state, codeVerifier };
  }
  const a = new Apple(e.APPLE_CLIENT_ID!, e.APPLE_TEAM_ID!, e.APPLE_KEY_ID!, pemToPkcs8(e.APPLE_PRIVATE_KEY!), redirect("apple"));
  return { url: a.createAuthorizationURL(state, []), state, codeVerifier: null };
}

/** Échange le code contre l'identifiant stable du compte chez le fournisseur. */
export async function finishAuth(p: Provider, code: string, codeVerifier: string | null): Promise<string> {
  const e = process.env;
  if (p === "google") {
    const g = new Google(e.GOOGLE_CLIENT_ID!, e.GOOGLE_CLIENT_SECRET!, redirect("google"));
    const tokens = await g.validateAuthorizationCode(code, codeVerifier!);
    return String((decodeIdToken(tokens.idToken()) as { sub: string }).sub);
  }
  if (p === "discord") {
    const d = new Discord(e.DISCORD_CLIENT_ID!, e.DISCORD_CLIENT_SECRET!, redirect("discord"));
    const tokens = await d.validateAuthorizationCode(code, codeVerifier);
    const res = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tokens.accessToken()}` } });
    if (!res.ok) throw new Error("discord_profile");
    return String(((await res.json()) as { id: string }).id);
  }
  const a = new Apple(e.APPLE_CLIENT_ID!, e.APPLE_TEAM_ID!, e.APPLE_KEY_ID!, pemToPkcs8(e.APPLE_PRIVATE_KEY!), redirect("apple"));
  const tokens = await a.validateAuthorizationCode(code);
  return String((decodeIdToken(tokens.idToken()) as { sub: string }).sub);
}

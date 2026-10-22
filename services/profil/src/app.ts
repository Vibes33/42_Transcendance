import { Elysia, t } from "elysia";
import { eq, inArray } from "drizzle-orm";
import { pseudoSuggestions, randomPseudo, tagOf, validatePseudo, type Profile, type PublicPlayer } from "@loltr/shared";
import { callerPlugin, fail, health, internalGuard, requireAccount, requireSession, type EventMap, type EventType } from "@loltr/shared/server";
import { ACCENTS, CHIBI_BY_KEY, SKIN_BY_ID, STARTERS } from "@loltr/content";
import type { Db } from "./db";
import { profiles } from "./schema";

export interface ProfilDeps {
  db: Db;
  publish: <T extends EventType>(type: T, data: EventMap[T]) => Promise<unknown>;
  /** Objets possédés (service classement) : "chibi:lux", "skin:lux-sg", "game:meli"… */
  inventory: (userId: string) => Promise<string[]>;
  grant: (userId: string, item: string, reason: string) => Promise<unknown>;
  now?: () => number;
}

type Row = typeof profiles.$inferSelect;

const ROLES = ["top", "jungle", "mid", "bot", "support"];
const THEMED = Object.keys(ACCENTS).filter((k) => k !== "generic" && k !== "neutre");

export const toProfile = (r: Row): Profile => ({
  userId: r.userId,
  kind: r.kind,
  pseudo: r.pseudo,
  tag: r.tag,
  role: r.role,
  namesLang: r.namesLang,
  siteLang: r.siteLang,
  reminder: r.reminder,
  mode: r.mode,
  chibi: r.chibi,
  skin: r.skin,
  starter: r.starter,
  onboarded: r.onboarded,
  tutorials: r.tutorials ?? {}
});

export const toPublic = (r: Row): PublicPlayer => ({ userId: r.userId, pseudo: r.pseudo ?? "…", tag: r.tag ?? "", chibi: r.chibi, skin: r.skin });

export function createProfilApp(deps: ProfilDeps) {
  const { db } = deps;
  const now = deps.now ?? Date.now;

  /** Profil de l'appelant, créé à la première visite. Un invité reçoit un pseudo et un chibi au hasard. */
  function ensure(userId: string, kind: "user" | "guest"): Row {
    const found = db.select().from(profiles).where(eq(profiles.userId, userId)).get();
    if (found) return found;
    const guest = kind === "guest";
    let pseudo: string | null = null;
    if (guest) {
      do pseudo = randomPseudo();
      while (db.select({ id: profiles.userId }).from(profiles).where(eq(profiles.pseudoLower, pseudo.toLowerCase())).get());
    }
    const row: Row = {
      userId,
      kind,
      pseudo,
      pseudoLower: pseudo?.toLowerCase() ?? null,
      tag: pseudo ? tagOf(pseudo) : null,
      role: null,
      namesLang: "fr",
      siteLang: "fr",
      reminder: true,
      mode: "sombre",
      chibi: guest ? THEMED[Math.floor(Math.random() * THEMED.length)] : "random",
      skin: null,
      starter: null,
      onboarded: guest,
      tutorials: {},
      createdAt: now(),
      updatedAt: now()
    };
    db.insert(profiles).values(row).run();
    return row;
  }

  const announce = (r: Row) =>
    deps.publish("profile.updated", { userId: r.userId, pseudo: r.pseudo ?? "", tag: r.tag ?? "", avatar: r.skin ?? r.chibi, chibi: r.chibi });

  function pseudoTaken(p: string, self: string): boolean {
    const r = db.select({ id: profiles.userId }).from(profiles).where(eq(profiles.pseudoLower, p.toLowerCase())).get();
    return !!r && r.id !== self;
  }

  return new Elysia({ prefix: "/api/profil" })
    .use(callerPlugin)
    .use(health)
    .get("/me", ({ caller }) => {
      const id = requireSession(caller);
      return toProfile(ensure(id, caller.kind === "guest" ? "guest" : "user"));
    })
    .get(
      "/pseudo/check",
      ({ caller, query }) => {
        const id = requireAccount(caller);
        const p = query.p.trim();
        const error = validatePseudo(p);
        if (error) return { ok: false, error, suggestions: [], tag: tagOf(p || "x") };
        if (pseudoTaken(p, id)) return { ok: false, error: "taken", suggestions: pseudoSuggestions(p).filter((s) => !pseudoTaken(s, id)).slice(0, 3), tag: tagOf(p) };
        return { ok: true, error: null, suggestions: [], tag: tagOf(p) };
      },
      { query: t.Object({ p: t.String({ maxLength: 32 }) }) }
    )
    // Première connexion, étape 1 : pseudo, rôle préféré, langue des noms, rappel.
    .post(
      "/pseudo",
      async ({ caller, body }) => {
        const id = requireAccount(caller);
        ensure(id, "user");
        const p = body.pseudo.trim();
        const error = validatePseudo(p);
        if (error) fail(400, "pseudo_" + error);
        if (pseudoTaken(p, id)) fail(409, "pseudo_taken", "Ce pseudo est déjà pris.");
        if (body.role && !ROLES.includes(body.role)) fail(400, "role");
        db.update(profiles)
          .set({ pseudo: p, pseudoLower: p.toLowerCase(), tag: tagOf(p), role: body.role ?? null, namesLang: body.namesLang, reminder: body.reminder, updatedAt: now() })
          .where(eq(profiles.userId, id))
          .run();
        const row = ensure(id, "user");
        await announce(row);
        return toProfile(row);
      },
      { body: t.Object({ pseudo: t.String({ maxLength: 32 }), role: t.Optional(t.Nullable(t.String())), namesLang: t.Union([t.Literal("fr"), t.Literal("en")]), reminder: t.Boolean() }) }
    )
    // Première connexion, étape 2 : le premier chibi, offert.
    .post(
      "/starter",
      async ({ caller, body }) => {
        const id = requireAccount(caller);
        const row = ensure(id, "user");
        if (!row.pseudo) fail(409, "pseudo_required", "Choisis d’abord un pseudo.");
        if (row.starter) fail(409, "starter_done", "Le premier chibi est déjà choisi.");
        if (!(STARTERS as readonly string[]).includes(body.chibi)) fail(400, "starter_invalid");
        await deps.grant(id, "chibi:" + body.chibi, "starter");
        db.update(profiles).set({ starter: body.chibi, chibi: body.chibi, skin: null, onboarded: true, updatedAt: now() }).where(eq(profiles.userId, id)).run();
        const next = ensure(id, "user");
        await announce(next);
        return toProfile(next);
      },
      { body: t.Object({ chibi: t.String() }) }
    )
    .patch(
      "/me",
      async ({ caller, body }) => {
        const id = requireSession(caller);
        ensure(id, caller.kind === "guest" ? "guest" : "user");
        if (body.role !== undefined && body.role !== null && !ROLES.includes(body.role)) fail(400, "role");
        db.update(profiles).set({ ...body, updatedAt: now() }).where(eq(profiles.userId, id)).run();
        return toProfile(ensure(id, "user"));
      },
      {
        body: t.Object({
          siteLang: t.Optional(t.Union([t.Literal("fr"), t.Literal("en")])),
          namesLang: t.Optional(t.Union([t.Literal("fr"), t.Literal("en")])),
          mode: t.Optional(t.Union([t.Literal("sombre"), t.Literal("clair")])),
          reminder: t.Optional(t.Boolean()),
          role: t.Optional(t.Nullable(t.String()))
        })
      }
    )
    // Équiper un chibi (ou « aléatoire ») et un de ses skins, s'ils sont possédés.
    .post(
      "/equip",
      async ({ caller, body }) => {
        const id = requireAccount(caller);
        ensure(id, "user");
        let skin: string | null = null;
        if (body.chibi !== "random") {
          if (!CHIBI_BY_KEY[body.chibi]) fail(400, "chibi_invalid");
          const owned = new Set(await deps.inventory(id));
          if (!owned.has("chibi:" + body.chibi)) fail(403, "not_owned", "Tu ne possèdes pas ce chibi.");
          if (body.skin && body.skin !== body.chibi + "-base") {
            const s = SKIN_BY_ID[body.skin];
            if (!s || s.key !== body.chibi) fail(400, "skin_invalid");
            if (!owned.has("skin:" + body.skin)) fail(403, "not_owned", "Tu ne possèdes pas ce skin.");
            skin = body.skin;
          }
        }
        db.update(profiles).set({ chibi: body.chibi, skin, updatedAt: now() }).where(eq(profiles.userId, id)).run();
        const row = ensure(id, "user");
        await announce(row);
        return toProfile(row);
      },
      { body: t.Object({ chibi: t.String(), skin: t.Optional(t.Nullable(t.String())) }) }
    )
    // Tutoriels vus (site et chaque jeu) ; « rejouer » depuis les paramètres remet à false.
    .post(
      "/tutorials",
      ({ caller, body }) => {
        const id = requireSession(caller);
        const row = ensure(id, caller.kind === "guest" ? "guest" : "user");
        const tutorials = { ...(row.tutorials ?? {}), [body.key]: body.done };
        db.update(profiles).set({ tutorials, updatedAt: now() }).where(eq(profiles.userId, id)).run();
        return toProfile(ensure(id, "user"));
      },
      { body: t.Object({ key: t.String({ maxLength: 32 }), done: t.Boolean() }) }
    )
    .get(
      "/players",
      ({ query }) => {
        const ids = query.ids.split(",").filter(Boolean).slice(0, 200);
        if (!ids.length) return [];
        return db.select().from(profiles).where(inArray(profiles.userId, ids)).all().map(toPublic);
      },
      { query: t.Object({ ids: t.String() }) }
    )
    .group("/internal", (g) =>
      g
        .use(internalGuard)
        .get(
          "/players",
          ({ query }) => {
            const ids = query.ids.split(",").filter(Boolean);
            if (!ids.length) return [];
            return db.select().from(profiles).where(inArray(profiles.userId, ids)).all().map(toPublic);
          },
          { query: t.Object({ ids: t.String() }) }
        )
        // Retrouve un joueur par « pseudo » ou « pseudo#tag » (ajout d'ami).
        .get(
          "/lookup",
          ({ query }) => {
            const [p, tag] = query.q.trim().split("#");
            const r = db.select().from(profiles).where(eq(profiles.pseudoLower, (p ?? "").toLowerCase())).get();
            if (!r || r.kind !== "user" || (tag && r.tag !== tag)) fail(404, "player_not_found");
            return toPublic(r!);
          },
          { query: t.Object({ q: t.String() }) }
        )
    );
}

import { Elysia, t } from "elysia";
import type { GameKey, WsClientMessage, WsServerMessage } from "@loltr/shared";
import { callerFrom, callerPlugin, fail, health, internalGuard, requireAccount, requireSession } from "@loltr/shared/server";
import { Hub, type Socket } from "./hub";

const gameKey = t.Optional(t.String());

export function createTempsReelApp(hub: Hub) {
  // Une même socket Elysia est reçue sous plusieurs objets : on garde notre adaptateur par identifiant.
  const adapters = new Map<string, Socket & { userId: string | null }>();

  return new Elysia()
    .use(callerPlugin)
    .use(health)
    .ws("/ws", {
      open(ws) {
        const caller = callerFrom(ws.data.headers as Record<string, string | undefined>);
        const socket = { userId: caller.id, send: (msg: WsServerMessage) => ws.send(JSON.stringify(msg)) };
        adapters.set(ws.id, socket);
        if (caller.id) hub.connect(caller.id, socket);
        else socket.send({ type: "hello", userId: null });
      },
      message(ws, raw) {
        const socket = adapters.get(ws.id);
        if (!socket) return;
        let msg: WsClientMessage;
        try {
          msg = (typeof raw === "string" ? JSON.parse(raw) : raw) as WsClientMessage;
        } catch {
          return;
        }
        if (msg.type === "watch" && typeof msg.code === "string") hub.watch(msg.code, socket);
        else if (msg.type === "presence" && socket.userId && ["online", "game", "away"].includes(msg.state))
          hub.setPresence(socket.userId, msg.state, String(msg.note ?? "").slice(0, 60));
      },
      close(ws) {
        const socket = adapters.get(ws.id);
        adapters.delete(ws.id);
        if (socket?.userId) hub.disconnect(socket.userId, socket);
      }
    })
    .group("/api/temps-reel", (app) =>
      app
        .get("/session", async ({ caller }) => {
          const me = requireSession(caller);
          const s = await hub.sessionOf(me);
          return { session: s ? hub.view(s) : null };
        })
        .get("/sessions/:id", async ({ caller, params }) => {
          const me = requireSession(caller);
          const s = await hub.get(params.id);
          if (!s || !s.members.some((m) => m.userId === me)) fail(404, "session_not_found");
          return hub.view(s!);
        })
        // Partie de groupe lancée par le chef : défi du jour ou jeu classique
        .post(
          "/sessions/group",
          ({ caller, body }) => hub.createGroup(requireAccount(caller), body.context, body.game as GameKey | undefined),
          { body: t.Object({ context: t.Union([t.Literal("defi"), t.Literal("classique")]), game: gameKey }) }
        )
        .post(
          "/sessions/:id/ready",
          ({ caller, params, body }) => hub.ready(params.id, requireSession(caller), body.tutorial ?? false),
          { body: t.Object({ tutorial: t.Optional(t.Boolean()) }) }
        )
        .post("/sessions/:id/continue", ({ caller, params }) => hub.continueWithout(params.id, requireSession(caller)))
        .post(
          "/sessions/:id/rejoin",
          ({ caller, params, body }) => hub.rejoin(params.id, requireSession(caller), body.choice),
          { body: t.Object({ choice: t.Union([t.Literal("groupe"), t.Literal("solo")]) }) }
        )
        .post("/sessions/:id/leave", async ({ caller, params }) => {
          await hub.leave(params.id, requireSession(caller));
          return { ok: true };
        })
        // --- Mode streamer -----------------------------------------------------------------
        .post(
          "/streams",
          ({ caller, body }) => hub.createStream(requireAccount(caller), body.context, body.game as GameKey | undefined),
          { body: t.Object({ context: t.Union([t.Literal("defi"), t.Literal("classique")]), game: gameKey }) }
        )
        .post(
          "/streams/join",
          ({ caller, body }) => hub.joinStream(requireSession(caller), body.code, caller.kind === "guest"),
          { body: t.Object({ code: t.String({ minLength: 4, maxLength: 8 }) }) }
        )
        .post("/streams/:id/next", ({ caller, params }) => hub.streamNext(params.id, requireAccount(caller)))
        .get("/streams/:id/card", ({ caller, params }) => hub.streamCard(params.id, requireSession(caller)))
        // Vue publique (capture OBS, page d'accueil du viewer) : jamais la réponse
        .get("/streams/code/:code", async ({ params }) => {
          const s = await hub.streamPublic(params.code);
          if (!s) fail(404, "stream_not_found", "Aucune session en cours avec ce code.");
          return s;
        })
        .group("/internal", (g) => g.use(internalGuard).get("/session/:id", ({ params }) => hub.internalView(params.id)))
    );
}

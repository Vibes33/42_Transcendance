import { create } from "zustand";
import type { GameKey, LiveMember, LiveSession, PresenceState, WsClientMessage, WsServerMessage } from "@loltr/shared";
import { CARD_BY_KEY } from "../lib/games";
import { keys, queryClient } from "../api/queries";
import { t } from "../i18n";
import { useUi } from "./ui";

// Connexion temps réel (service temps-reel, /ws) : présence des amis, partie de groupe ou de stream,
// avancement des autres joueurs et notifications. Se reconnecte toute seule.

interface LiveState {
  connected: boolean;
  session: LiveSession | null;
  /** Avancement des joueurs de la session, mis à jour sans recharger toute la session. */
  progress: Record<string, LiveMember["progress"]>;
  presence: Record<string, { state: PresenceState; note: string }>;
  setSession: (s: LiveSession | null) => void;
}

export const useLive = create<LiveState>((set) => ({
  connected: false,
  session: null,
  progress: {},
  presence: {},
  setSession: (session) => set({ session, progress: {} })
}));

let socket: WebSocket | null = null;
let retry = 0;
let wanted = false;
let lastPresence: WsClientMessage | null = null;
let watchCode: string | null = null;

function url() {
  return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
}

function send(msg: WsClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function onMessage(msg: WsServerMessage) {
  const live = useLive.getState();
  switch (msg.type) {
    case "hello":
      if (lastPresence) send(lastPresence);
      if (watchCode) send({ type: "watch", code: watchCode });
      break;
    case "session":
      useLive.setState({ session: msg.session, progress: msg.session && live.session?.id === msg.session.id ? live.progress : {} });
      break;
    case "progress":
      if (live.session?.id === msg.sessionId) useLive.setState({ progress: { ...live.progress, [msg.userId]: msg.progress } });
      break;
    case "presence":
      useLive.setState({ presence: { ...live.presence, [msg.userId]: { state: msg.state, note: msg.note } } });
      queryClient.invalidateQueries({ queryKey: keys.friends });
      break;
    case "notify":
      onNotify(msg.event, msg.data);
      break;
  }
}

function onNotify(event: string, data: Record<string, any>) {
  const ui = useUi.getState();
  switch (event) {
    case "friend.request":
      queryClient.invalidateQueries({ queryKey: keys.friends });
      ui.toast(t("Nouvelle demande d’ami"), "info", { label: t("Voir"), run: () => ui.setFriends(true) });
      break;
    case "friend.accepted":
    case "friend.removed":
      queryClient.invalidateQueries({ queryKey: keys.friends });
      break;
    case "group.invite":
      queryClient.invalidateQueries({ queryKey: keys.friends });
      ui.toast(t("Invitation dans un groupe"), "info", { label: t("Voir"), run: () => ui.setFriends(true) });
      break;
    case "group.updated":
      queryClient.invalidateQueries({ queryKey: keys.group });
      queryClient.invalidateQueries({ queryKey: keys.friends });
      break;
    case "points.updated":
      queryClient.invalidateQueries({ queryKey: keys.daily });
      queryClient.invalidateQueries({ queryKey: keys.me });
      break;
    case "wallet.updated":
      queryClient.invalidateQueries({ queryKey: keys.me });
      queryClient.invalidateQueries({ queryKey: keys.shop });
      break;
    case "unlock.granted": {
      for (const k of [keys.inventory, keys.me, keys.shop]) queryClient.invalidateQueries({ queryKey: k });
      const names = (data.items as string[]).map((i) => t(CARD_BY_KEY[i.slice(5) as GameKey]?.name ?? i)).join(", ");
      ui.toast(t("Débloqué en mode classique : {games}", { games: names }), "ok", { label: t("Jouer"), run: () => ui.go("/jeux") });
      break;
    }
    case "round.finished":
      queryClient.invalidateQueries({ queryKey: keys.daily });
      break;
  }
}

function open() {
  if (!wanted || socket) return;
  const ws = new WebSocket(url());
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    useLive.setState({ connected: true });
  };
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data) as WsServerMessage);
    } catch {}
  };
  ws.onclose = () => {
    socket = null;
    useLive.setState({ connected: false });
    if (!wanted) return;
    retry = Math.min(retry + 1, 6);
    setTimeout(open, 500 * 2 ** retry);
  };
}

/** Ouvre (ou rouvre après un changement de compte) la connexion temps réel. */
export function connectLive() {
  wanted = true;
  if (socket) socket.close();
  else open();
}

export function disconnectLive() {
  wanted = false;
  socket?.close();
  socket = null;
  useLive.setState({ session: null, progress: {}, presence: {} });
}

/** Présence affichée aux amis : en ligne, en partie (« En partie · Sorts éclair »), absent. */
export function setPresence(state: "online" | "game" | "away", note = "") {
  lastPresence = { type: "presence", state, note };
  send(lastPresence);
}

/** Vue OBS / viewer non inscrit : suit une session de stream par son code. */
export function watchStream(code: string) {
  watchCode = code;
  wanted = true;
  if (socket?.readyState === WebSocket.OPEN) send({ type: "watch", code });
  else open();
}

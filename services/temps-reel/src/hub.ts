import {
  GAMES,
  basePoints,
  compareResults,
  dayKey,
  randomSeed,
  rotationFor,
  type GameContext,
  type GameKey,
  type LiveMember,
  type LiveSession,
  type PresenceState,
  type PublicPlayer,
  type RoundResult,
  type WsServerMessage
} from "@loltr/shared";
import { fail } from "@loltr/shared/server";

// Cœur du temps réel : sessions de groupe (défi du jour ou classique) et sessions de stream.
// Les sessions vivent en mémoire et sont recopiées dans le magasin (Redis) pour survivre à un redémarrage.

export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export function memoryStore(): Store {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k)
  };
}

export interface HubDeps {
  store: Store;
  players: (ids: string[]) => Promise<PublicPlayer[]>;
  groupOf: (userId: string) => Promise<{ id: string; leader: string; members: string[] } | null>;
  friendsOf: (userId: string) => Promise<string[]>;
  projections: (ids: string[], day: string) => Promise<Record<string, Record<string, { base: number; projected: number }>>>;
  /** Met à 0 les jeux du défi manqués avant `upTo` (retour dans le groupe après une déconnexion). */
  forfeit: (userId: string, day: string, upTo: GameKey) => Promise<void>;
  now?: () => number;
  /** Délai avant de considérer un joueur comme déconnecté (il peut recharger sa page). */
  graceMs?: number;
}

interface Internal extends LiveSession {
  seed: string;
  groupId: string | null;
  /** Résultats bruts par joueur et par manche, pour le classement « streamer contre chat ». */
  raw: Record<string, Record<number, RoundResult>>;
}

const SESSION_TTL = 2 * 86_400;
const STREAM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface Socket {
  send(msg: WsServerMessage): void;
}

export class Hub {
  private sessions = new Map<string, Internal>();
  private sockets = new Map<string, Set<Socket>>();
  private watchers = new Map<string, Set<Socket>>();
  private presence = new Map<string, { state: PresenceState; note: string }>();
  private offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private now: () => number;

  constructor(private deps: HubDeps) {
    this.now = deps.now ?? Date.now;
  }

  // --- Connexions et présence ------------------------------------------------------------

  async connect(userId: string, socket: Socket) {
    let set = this.sockets.get(userId);
    if (!set) this.sockets.set(userId, (set = new Set()));
    set.add(socket);
    clearTimeout(this.offlineTimers.get(userId));
    this.offlineTimers.delete(userId);
    socket.send({ type: "hello", userId });
    if (set.size === 1) await this.setPresence(userId, "online", "");
    const s = await this.sessionOf(userId);
    if (s) {
      const m = s.members.find((x) => x.userId === userId)!;
      if (m.status === "disconnected") {
        m.status = "active";
        await this.save(s);
        this.broadcast(s);
      } else socket.send({ type: "session", session: this.view(s) });
    }
  }

  async disconnect(userId: string, socket: Socket) {
    const set = this.sockets.get(userId);
    set?.delete(socket);
    for (const w of this.watchers.values()) w.delete(socket);
    if (set && set.size > 0) return;
    this.sockets.delete(userId);
    // Petit délai : un rechargement de page ne doit pas compter comme une déconnexion
    const timer = setTimeout(async () => {
      this.offlineTimers.delete(userId);
      if (this.sockets.has(userId)) return;
      await this.setPresence(userId, "offline", "");
      const s = await this.sessionOf(userId);
      if (s && s.kind === "group" && s.phase !== "done") {
        const m = s.members.find((x) => x.userId === userId)!;
        if (m.status === "active") {
          m.status = "disconnected";
          await this.save(s);
          this.broadcast(s);
        }
      }
    }, this.deps.graceMs ?? 8000);
    this.offlineTimers.set(userId, timer);
  }

  watch(code: string, socket: Socket) {
    let set = this.watchers.get(code.toUpperCase());
    if (!set) this.watchers.set(code.toUpperCase(), (set = new Set()));
    set.add(socket);
    this.streamByCode(code).then((s) => socket.send({ type: "session", session: s ? this.publicStreamView(s) : null }));
  }

  online(userId: string) {
    return this.sockets.has(userId);
  }

  async setPresence(userId: string, state: PresenceState, note: string) {
    const prev = this.presence.get(userId);
    if (prev && prev.state === state && prev.note === note) return;
    if (state === "offline") this.presence.delete(userId);
    else this.presence.set(userId, { state, note });
    await this.deps.store.set("presence:" + userId, JSON.stringify({ state, note, lastSeen: this.now() }), state === "offline" ? undefined : 120);
    const friends = await this.deps.friendsOf(userId).catch(() => []);
    for (const f of friends) this.send(f, { type: "presence", userId, state, note });
  }

  /** Rafraîchit la présence des connectés (l'entrée Redis expire si le service s'arrête). */
  async heartbeat() {
    for (const [userId, p] of this.presence) {
      if (this.sockets.has(userId)) await this.deps.store.set("presence:" + userId, JSON.stringify({ ...p, lastSeen: this.now() }), 120);
    }
  }

  send(userId: string, msg: WsServerMessage) {
    for (const s of this.sockets.get(userId) ?? []) s.send(msg);
  }

  notify(userIds: string[], event: string, data: Record<string, unknown>) {
    for (const u of new Set(userIds)) this.send(u, { type: "notify", event, data });
  }

  // --- Sessions --------------------------------------------------------------------------

  private async save(s: Internal) {
    this.sessions.set(s.id, s);
    await this.deps.store.set("rt:session:" + s.id, JSON.stringify(s), SESSION_TTL);
  }

  async get(id: string): Promise<Internal | null> {
    const hit = this.sessions.get(id);
    if (hit) return hit;
    const raw = await this.deps.store.get("rt:session:" + id);
    if (!raw) return null;
    const s = JSON.parse(raw) as Internal;
    this.sessions.set(id, s);
    return s;
  }

  /** Session en cours d'un joueur (la plus récente non terminée). */
  async sessionOf(userId: string): Promise<Internal | null> {
    const id = await this.deps.store.get("rt:member:" + userId);
    if (!id) return null;
    const s = await this.get(id);
    if (!s || s.phase === "done") return null;
    const m = s.members.find((x) => x.userId === userId);
    return m && m.status !== "left" ? s : null;
  }

  private async streamByCode(code: string): Promise<Internal | null> {
    const id = await this.deps.store.get("rt:code:" + code.toUpperCase());
    return id ? this.get(id) : null;
  }

  private async newMembers(ids: string[], guests: Set<string> = new Set()): Promise<LiveMember[]> {
    const profiles = Object.fromEntries((await this.deps.players(ids).catch(() => [])).map((p) => [p.userId, p]));
    return ids.map((id) => ({
      ...(profiles[id] ?? { userId: id, pseudo: "Joueur", tag: "", chibi: "random", skin: null }),
      status: "active",
      ready: false,
      tutorial: false,
      isGuest: guests.has(id),
      results: [],
      progress: null,
      total: 0
    }));
  }

  /** Un membre lance une partie de groupe : tout le groupe y est inscrit. */
  async createGroup(leader: string, context: "defi" | "classique", game?: GameKey): Promise<LiveSession> {
    const g = await this.deps.groupOf(leader);
    if (!g) fail(409, "no_group", "Crée d’abord un groupe.");
    if (g!.members.length < 2) fail(409, "group_alone", "Invite au moins un copain.");
    const prev = await this.deps.store.get("rt:group:" + g!.id);
    const running = prev ? await this.get(prev) : null;
    if (running && running.phase !== "done") return this.view(running);
    const day = dayKey(this.now());
    let games: GameKey[];
    if (context === "defi") games = rotationFor(day);
    else {
      if (!game || !GAMES[game]?.classicPlayable) fail(400, "not_classic");
      games = [game!];
    }
    const s: Internal = {
      id: crypto.randomUUID(),
      kind: "group",
      context,
      leader,
      day,
      games,
      index: 0,
      phase: "playing",
      members: await this.newMembers(g!.members),
      code: null,
      streamerId: null,
      createdAt: this.now(),
      seed: randomSeed(),
      groupId: g!.id,
      raw: {}
    };
    await this.save(s);
    await this.deps.store.set("rt:group:" + g!.id, s.id, SESSION_TTL);
    for (const m of s.members) await this.deps.store.set("rt:member:" + m.userId, s.id, SESSION_TTL);
    this.broadcast(s);
    return this.view(s);
  }

  /** Le streamer ouvre une session : défi du jour (graine différente) ou jeu classique de son choix. */
  async createStream(streamerId: string, context: "defi" | "classique", game?: GameKey): Promise<LiveSession> {
    let code = "";
    for (let i = 0; i < 20; i++) {
      code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => STREAM_CODE_ALPHABET[b % STREAM_CODE_ALPHABET.length]).join("");
      if (!(await this.deps.store.get("rt:code:" + code))) break;
    }
    const day = dayKey(this.now());
    if (context === "classique" && (!game || !GAMES[game]?.classicPlayable)) fail(400, "not_classic");
    const s: Internal = {
      id: crypto.randomUUID(),
      kind: "stream",
      context: "streamer",
      leader: streamerId,
      day,
      games: context === "defi" ? rotationFor(day) : [game!],
      index: 0,
      phase: "playing",
      members: await this.newMembers([streamerId]),
      code,
      streamerId,
      createdAt: this.now(),
      seed: randomSeed(),
      groupId: null,
      raw: {}
    };
    await this.save(s);
    await this.deps.store.set("rt:code:" + code, s.id, SESSION_TTL);
    await this.deps.store.set("rt:member:" + streamerId, s.id, SESSION_TTL);
    this.broadcast(s);
    return this.view(s);
  }

  /** Un viewer rejoint la session du streamer avec le code (en invité s'il n'a pas de compte). */
  async joinStream(userId: string, code: string, isGuest: boolean): Promise<LiveSession> {
    const s = await this.streamByCode(code);
    if (!s || s.phase === "done") fail(404, "stream_not_found", "Aucune session en cours avec ce code.");
    let m = s!.members.find((x) => x.userId === userId);
    if (!m) {
      [m] = await this.newMembers([userId], isGuest ? new Set([userId]) : new Set());
      s!.members.push(m);
    }
    m.status = "active";
    await this.save(s!);
    await this.deps.store.set("rt:member:" + userId, s!.id, SESSION_TTL);
    this.broadcast(s!);
    return this.view(s!);
  }

  private member(s: Internal, userId: string) {
    const m = s.members.find((x) => x.userId === userId);
    if (!m) fail(403, "not_in_session");
    return m!;
  }

  private active(s: Internal) {
    return s.members.filter((m) => m.status === "active" || m.status === "disconnected");
  }

  /** Résultat d'une manche reçu du service jeux. */
  async onRoundFinished(ev: { sessionId: string | null; userId: string; game: GameKey; context: GameContext; result: RoundResult; basePoints: number }) {
    if (!ev.sessionId) return;
    const s = await this.get(ev.sessionId);
    if (!s || s.phase === "done") return;
    const m = s.members.find((x) => x.userId === ev.userId);
    if (!m) return;
    const index = s.context === "defi" ? s.games.indexOf(ev.game) : s.index;
    if (index < 0) return;
    const points = s.context === "classique" ? 0 : ev.context === "streamer" ? basePoints(ev.result) : ev.basePoints;
    m.results[index] = { game: ev.game, done: true, basePoints: points, projected: points, summary: summarize(ev.result) };
    m.progress = null;
    (s.raw[m.userId] ??= {})[index] = ev.result;
    m.total = m.results.reduce((t, r) => t + (r?.projected ?? 0), 0);
    if (s.kind === "group" && index === s.index && this.active(s).every((x) => x.results[s.index]?.done)) await this.toRecap(s);
    await this.save(s);
    this.broadcast(s);
  }

  /** Points prévisionnels (bonus de percentile provisoire) au moment du récap. */
  private async toRecap(s: Internal) {
    s.phase = "recap";
    for (const m of s.members) m.ready = m.tutorial;
    if (s.context !== "defi") return;
    const proj = await this.deps.projections(s.members.map((m) => m.userId), s.day).catch(() => ({}) as Record<string, any>);
    for (const m of s.members) {
      m.results.forEach((r, i) => {
        if (r) r.projected = proj[m.userId]?.[s.games[i]]?.projected ?? r.basePoints;
      });
      m.total = m.results.reduce((t, r) => t + (r?.projected ?? 0), 0);
    }
  }

  onProgress(ev: { sessionId: string | null; userId: string; progress: LiveMember["progress"] }) {
    if (!ev.sessionId) return;
    const s = this.sessions.get(ev.sessionId);
    if (!s) return;
    const m = s.members.find((x) => x.userId === ev.userId);
    if (!m) return;
    m.progress = ev.progress;
    const msg: WsServerMessage = { type: "progress", sessionId: s.id, userId: ev.userId, progress: ev.progress };
    for (const x of s.members) this.send(x.userId, msg);
    if (s.code) for (const w of this.watchers.get(s.code) ?? []) w.send(msg);
  }

  /** « Jeu suivant » : on attend que tout le groupe soit prêt. */
  async ready(id: string, userId: string, tutorial = false): Promise<LiveSession> {
    const s = await this.get(id);
    if (!s) fail(404, "session_not_found");
    const m = this.member(s!, userId);
    if (s!.phase !== "recap") fail(409, "not_in_recap");
    m.ready = true;
    m.tutorial = tutorial;
    if (this.active(s!).every((x) => x.ready)) this.advance(s!);
    await this.save(s!);
    this.broadcast(s!);
    return this.view(s!);
  }

  private advance(s: Internal) {
    if (s.context === "classique") s.games.push(s.games[s.index]);
    s.index++;
    for (const m of s.members) {
      m.ready = false;
      m.tutorial = false;
      m.progress = null;
    }
    s.phase = s.index >= s.games.length ? "done" : "playing";
  }

  /** Le groupe continue sans les joueurs déconnectés. */
  async continueWithout(id: string, userId: string): Promise<LiveSession> {
    const s = await this.get(id);
    if (!s) fail(404, "session_not_found");
    this.member(s!, userId);
    for (const m of s!.members) if (m.status === "disconnected") m.status = "away";
    if (s!.phase === "playing" && this.active(s!).every((x) => x.results[s!.index]?.done)) await this.toRecap(s!);
    else if (s!.phase === "recap" && this.active(s!).every((x) => x.ready)) this.advance(s!);
    await this.save(s!);
    this.broadcast(s!);
    return this.view(s!);
  }

  /**
   * Retour d'un joueur que le groupe a laissé : soit il rejoint le groupe là où il en est (les jeux
   * manqués valent 0 point), soit il reprend où il en était, en solo.
   */
  async rejoin(id: string, userId: string, choice: "groupe" | "solo"): Promise<LiveSession> {
    const s = await this.get(id);
    if (!s) fail(404, "session_not_found");
    const m = this.member(s!, userId);
    if (choice === "solo") {
      m.status = "left";
      await this.deps.store.del("rt:member:" + userId);
    } else {
      if (s!.context === "defi" && s!.phase !== "done") {
        await this.deps.forfeit(userId, s!.day, s!.games[s!.index]);
        for (let i = 0; i < s!.index; i++) m.results[i] ??= { game: s!.games[i], done: true, basePoints: 0, projected: 0, summary: null };
      }
      m.status = "active";
      m.ready = false;
    }
    await this.save(s!);
    this.broadcast(s!);
    return this.view(s!);
  }

  async leave(id: string, userId: string): Promise<void> {
    const s = await this.get(id);
    if (!s) return;
    const m = s.members.find((x) => x.userId === userId);
    if (!m) return;
    m.status = "left";
    await this.deps.store.del("rt:member:" + userId);
    const rest = s.members.filter((x) => x.status !== "left");
    if (s.kind === "stream" && userId === s.streamerId) s.phase = "done";
    else if (!rest.length) s.phase = "done";
    else {
      if (s.leader === userId) s.leader = rest[0].userId;
      if (s.phase === "playing" && this.active(s).every((x) => x.results[s.index]?.done)) await this.toRecap(s);
      else if (s.phase === "recap" && this.active(s).every((x) => x.ready)) this.advance(s);
    }
    await this.save(s);
    this.broadcast(s);
    this.send(userId, { type: "session", session: null });
  }

  /** Mode streamer : le streamer passe au jeu suivant ou à une nouvelle manche du jeu classique. */
  async streamNext(id: string, userId: string): Promise<LiveSession> {
    const s = await this.get(id);
    if (!s || s.kind !== "stream") fail(404, "session_not_found");
    if (s!.streamerId !== userId) fail(403, "not_streamer");
    this.advance(s!);
    await this.save(s!);
    this.broadcast(s!);
    return this.view(s!);
  }

  /** Carte de résultat d'un viewer : « tu as battu X % du chat » sur la session. */
  async streamCard(id: string, userId: string) {
    const s = await this.get(id);
    if (!s || s.kind !== "stream") fail(404, "session_not_found");
    const chat = s!.members.filter((m) => m.userId !== s!.streamerId);
    const ranked = [...s!.members].sort((a, b) => b.total - a.total);
    const me = this.member(s!, userId);
    const others = chat.filter((m) => m.userId !== userId);
    const beaten = others.filter((o) => this.beats(s!, userId, o.userId)).length;
    const streamer = s!.members.find((m) => m.userId === s!.streamerId);
    return {
      total: me.total,
      position: ranked.findIndex((m) => m.userId === userId) + 1,
      players: s!.members.length,
      beatPercent: others.length ? Math.round((beaten / others.length) * 100) : 100,
      beatStreamer: streamer && userId !== streamer.userId ? this.beats(s!, userId, streamer.userId) : null,
      streamer: streamer ? { pseudo: streamer.pseudo, tag: streamer.tag, total: streamer.total } : null
    };
  }

  /** a bat b : plus de points, puis meilleure performance sur les manches communes. */
  private beats(s: Internal, a: string, b: string): boolean {
    const ma = s.members.find((m) => m.userId === a)!;
    const mb = s.members.find((m) => m.userId === b)!;
    if (ma.total !== mb.total) return ma.total > mb.total;
    let score = 0;
    for (const [i, ra] of Object.entries(s.raw[a] ?? {})) {
      const rb = s.raw[b]?.[Number(i)];
      if (rb) score += Math.sign(compareResults(rb, ra));
    }
    return score > 0;
  }

  /** Données lues par le service jeux (graine de la manche, membres) et par classement (streamer). */
  async internalView(id: string) {
    const s = await this.get(id);
    if (!s) return null;
    return {
      kind: s.kind,
      seed: s.kind === "stream" ? `${s.seed}:${s.index}` : s.seed,
      members: s.members.filter((m) => m.status !== "left").map((m) => m.userId),
      streamerId: s.streamerId,
      game: s.games[s.index] ?? null
    };
  }

  view(s: Internal): LiveSession {
    const { seed: _seed, groupId: _g, raw: _r, ...pub } = s;
    return { ...pub, members: [...pub.members].sort((a, b) => b.total - a.total) };
  }

  /** Vue OBS et viewers non inscrits : jamais la réponse, et seulement le haut du classement. */
  publicStreamView(s: Internal): LiveSession {
    const v = this.view(s);
    return { ...v, members: v.members.slice(0, 50) };
  }

  async streamPublic(code: string) {
    const s = await this.streamByCode(code);
    return s ? this.publicStreamView(s) : null;
  }

  broadcast(s: Internal) {
    const v = this.view(s);
    for (const m of s.members) if (m.status !== "left") this.send(m.userId, { type: "session", session: v });
    if (s.code) {
      const pub = this.publicStreamView(s);
      for (const w of this.watchers.get(s.code) ?? []) w.send({ type: "session", session: pub });
    }
  }

  /** Le groupe a changé (social) : les joueurs retirés quittent la session. */
  async onGroupUpdated(groupId: string, members: string[], disbanded: boolean) {
    const id = await this.deps.store.get("rt:group:" + groupId);
    const s = id ? await this.get(id) : null;
    if (!s || s.phase === "done") return;
    // Dissolution : `members` liste ceux qui partent (vide = tout le groupe) ; sinon, ceux qui restent.
    const gone = (u: string) => (disbanded ? !members.length || members.includes(u) : !members.includes(u));
    for (const m of s.members) if (m.status !== "left" && gone(m.userId)) await this.leave(s.id, m.userId);
  }
}

function summarize(r: RoundResult): LiveMember["results"][number]["summary"] {
  return { tries: r.tries, found: r.found, skinFound: r.skinFound, champions: r.champions, correct: r.correct, durationMs: r.durationMs };
}

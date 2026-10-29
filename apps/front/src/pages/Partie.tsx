import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { GameKey, LiveSession, RoundState } from "@loltr/shared";
import { get, post } from "../api/client";
import { keys, queryClient } from "../api/queries";
import { LiveRanking, type GameFlow } from "../components/game";
import { Tutorial, markTutorial } from "../components/Tutorial";
import { Btn, Dialog } from "../components/ui";
import { GAME_UI } from "../games";
import { demoRound } from "../games/demo";
import { useT } from "../i18n";
import { avatarOf } from "../lib/chibi";
import { CARD_BY_KEY, rememberGameKey } from "../lib/games";
import { useMe } from "../state/app";
import { setPresence, useLive } from "../state/live";
import { StreamCard } from "./Stream";

// Page de partie : choisit la manche à jouer (défi du jour, classique, stream), la crée ou la reprend
// auprès du service jeux, affiche le jeu et enchaîne. En groupe, la suite est pilotée par le temps réel.

type Ctx = "defi" | "classique" | "streamer";

export function Partie() {
  const t = useT();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const ctx = (sp.get("ctx") as Ctx) || "defi";
  const sessionId = sp.get("session");
  const me = useMe();
  const live = useLive();
  const session: LiveSession | null = sessionId && live.session?.id === sessionId ? live.session : null;
  const [round, setRound] = useState<RoundState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tutorial, setTutorial] = useState<GameKey | null>(null);
  const creating = useRef<string | null>(null);
  const demo = useMemo(() => (tutorial ? demoRound(tutorial) : null), [tutorial]);
  const namesLang = me.profile?.namesLang ?? "fr";

  // Session de groupe ou de stream absente après un rechargement : on la redemande au serveur
  useEffect(() => {
    if (sessionId && !session)
      get<LiveSession>(`/api/temps-reel/sessions/${sessionId}`)
        .then((s) => useLive.getState().setSession(s))
        .catch(() => setError(t("Cette partie n’existe plus.")));
  }, [sessionId, !!session]);

  const daily = me.daily;
  // Jeu à jouer d'après le serveur ; la manche affichée garde le sien jusqu'à « Jeu suivant »
  const wanted: GameKey | null = session ? (session.games[session.index] ?? null) : ctx === "defi" ? (daily?.nextGame ?? null) : ((sp.get("game") as GameKey) ?? null);
  const game: GameKey | null = round?.game ?? wanted;
  const roundKey = `${ctx}:${sessionId ?? ""}:${session?.index ?? ""}:${wanted}:${attempt}`;
  const [roundIndex, setRoundIndex] = useState<number | null>(null);

  // Stream : le streamer passe au jeu suivant → nouvelle manche pour tout le monde
  useEffect(() => {
    if (round && session && roundIndex !== null && session.index !== roundIndex) {
      creating.current = null;
      setRound(null);
    }
  }, [session?.index]);
  const myMember = session?.members.find((m) => m.userId === me.profile?.userId);

  // Rejeu d'un tutoriel depuis les paramètres : démo sans vraie manche, puis retour aux paramètres.
  const tutoForce = ctx === "classique" && !session && sp.get("tuto") === "1";

  // Tutoriel à la première partie en solo de chaque jeu (avant de lancer le chrono)
  const needsTuto = !!game && GAME_UI[game].tutorial.length > 0 && !session && !!me.profile && ctx !== "streamer" && !me.profile.tutorials?.[game];

  useEffect(() => {
    if (needsTuto && !round) setTutorial(game);
  }, [needsTuto, game, !!round]);

  useEffect(() => {
    if (tutoForce && game && !round && !tutorial) setTutorial(game);
  }, [tutoForce, game, !!round, tutorial]);

  // Défi du jour terminé (ou pas commencé) : retour à l'accueil
  useEffect(() => {
    if (ctx === "defi" && !session && daily && !game && !round) nav("/", { replace: true });
  }, [ctx, session, daily, game, round]);

  // Création ou reprise de la manche
  useEffect(() => {
    if (round || !wanted || tutorial || tutoForce || !me.session || me.isAnon) return;
    if (sessionId && !session) return;
    if (session && session.phase !== "playing") return;
    if (myMember && myMember.status === "away") return;
    if (creating.current === roundKey) return;
    creating.current = roundKey;
    setError(null);
    const game = wanted;
    (async () => {
      if (ctx === "defi") {
        if (!daily) return;
        if (daily.status === "todo") await post("/api/jeux/daily/start", session ? { mode: "groupe", sessionId: session.id } : { mode: "solo" });
      }
      const r = await post<RoundState>("/api/jeux/rounds", { game, context: ctx, sessionId: session?.id });
      setRoundIndex(session?.index ?? null);
      setRound(r);
    })().catch((e) => {
      creating.current = null;
      setError((e as Error).message);
      // Impossible de jouer cette partie (défi déjà fait en solo…) : on libère le groupe
      if (session?.kind === "group") post(`/api/temps-reel/sessions/${session.id}/leave`).catch(() => {});
    });
  }, [roundKey, !!round, tutorial, tutoForce, !!daily, me.session?.userId, session?.phase, myMember?.status]);

  // Présence affichée aux amis pendant la partie
  useEffect(() => {
    if (game) setPresence("game", t("En partie · {game}", { game: t(CARD_BY_KEY[game].name) }));
    return () => setPresence("online");
  }, [game]);

  // En groupe : tout le monde a fini → récapitulatif ; jeu suivant lancé → nouvelle manche
  useEffect(() => {
    if (!session || session.kind !== "group") return;
    if (session.phase === "recap" || session.phase === "done") nav(`/recap?session=${session.id}`);
  }, [session?.phase, session?.index]);

  const act = useCallback(
    async (action: Record<string, unknown>) => {
      if (!round) return null;
      const res = await post<{ state: RoundState; feedback: any }>(`/api/jeux/rounds/${round.id}/act`, action);
      setRound(res.state);
      if (res.state.over) queryClient.invalidateQueries({ queryKey: keys.daily });
      return { feedback: res.feedback };
    },
    [round?.id]
  );

  const finish = useCallback(
    async (quit = false) => {
      if (!round) return;
      const r = await post<RoundState>(`/api/jeux/rounds/${round.id}/finish`, { quit }).catch(() => null);
      if (r) setRound(r);
      queryClient.invalidateQueries({ queryKey: keys.daily });
    },
    [round?.id]
  );

  // World Mayhem : quitter la page (bouton, menu du haut, retour arrière) abandonne la partie, la
  // prochaine repart d'un draft vierge. Recharger la page la reprend (pas de démontage dans ce cas).
  const mayhemOpen = useRef<RoundState | null>(null);
  mayhemOpen.current = round && round.game === "mayhem" && round.context === "classique" && !round.over ? round : null;
  const abandonMayhem = () => {
    const r = mayhemOpen.current;
    mayhemOpen.current = null;
    return r ? post(`/api/jeux/rounds/${r.id}/finish`, { quit: true }).catch(() => {}) : Promise.resolve();
  };
  useEffect(() => () => void abandonMayhem(), []);

  const quit = async () => {
    if (ctx === "classique" && game) rememberGameKey(game);
    // World Mayhem : on revient à son menu
    const mayhem = ctx === "classique" && game === "mayhem";
    await abandonMayhem();
    if (session?.kind === "group") await post(`/api/temps-reel/sessions/${session.id}/leave`).catch(() => {});
    if (session) useLive.getState().setSession(null);
    nav(mayhem ? "/mayhem" : ctx === "classique" ? "/jeux" : ctx === "streamer" ? "/stream" : "/");
  };

  const rank = ctx === "defi" && daily && game ? daily.games.findIndex((g) => g.key === game) + 1 : 1;
  const isStreamer = session?.kind === "stream" && session.streamerId === me.profile?.userId;

  const flow: GameFlow | null = useMemo(() => {
    if (!game) return null;
    const multi = !!session;
    const waiting = session
      ? session.members
          .filter((m) => m.userId !== me.profile?.userId && (m.status === "active" || m.status === "disconnected") && !m.results[session.index]?.done)
          .map((m) => {
            const p = live.progress[m.userId] ?? m.progress;
            return {
              name: m.pseudo,
              art: avatarOf(m),
              text: m.status === "disconnected" ? t("déconnecté") : p?.tries ? t("{n} essais · cherche", { n: p.tries }) : p?.score !== undefined ? t("{n} · en cours", { n: p.score }) : t("pas commencé")
            };
          })
      : [];
    return {
      ctx,
      multi,
      rank,
      total: daily?.games.length ?? 4,
      nextLabel:
        ctx === "classique" ? t("Rejouer") : ctx === "streamer" ? (isStreamer ? t("Jeu suivant") : t("En attente du streamer")) : rank < 4 ? t("Jeu suivant ({n}/4)", { n: rank + 1 }) : t("Terminer le défi"),
      onNext: async () => {
        if (ctx === "classique") {
          if (session) return;
          setRound(null);
          creating.current = null;
          setAttempt((a) => a + 1);
        } else if (ctx === "streamer") {
          if (isStreamer && session) await post(`/api/temps-reel/streams/${session.id}/next`).catch(() => {});
        } else {
          const d = await queryClient.fetchQuery({ queryKey: keys.daily, queryFn: () => get<typeof daily>("/api/jeux/daily"), staleTime: 0 });
          if (!d?.nextGame) return nav("/");
          creating.current = null;
          setRound(null);
        }
      },
      onQuit: quit,
      waiting,
      autoRecap: multi && session?.kind === "group",
      onTutorial:
        multi && session?.kind === "group" && game
          ? () => {
              post(`/api/temps-reel/sessions/${session.id}/ready`, { tutorial: true }).catch(() => {});
              setTutorial(game);
            }
          : undefined,
      extra: session?.kind === "stream" && round?.over ? <StreamCard sessionId={session.id} /> : undefined,
      side: session ? <LiveRanking game={game} members={session.members} index={session.index} progress={live.progress} meId={me.profile?.userId} /> : null
    };
  }, [game, session, live.progress, round?.over, rank, ctx, isStreamer, me.profile?.userId, daily]);

  // Tutoriel : le vrai jeu s'affiche avec une manche d'exemple, et chaque étape met en avant un de
  // ses éléments. La vraie manche (et son chrono) n'est créée qu'ensuite.
  if (tutorial) {
    const Demo = GAME_UI[tutorial].component;
    const demoFlow: GameFlow = { ctx, multi: false, rank, total: daily?.games.length ?? 4, nextLabel: "", onNext: () => {}, onQuit: tutoForce ? () => nav("/parametres") : quit, waiting: [], autoRecap: false, demo: true, side: null };
    return (
      <>
        <Demo round={demo ?? demoRound(tutorial)} act={async () => null} finish={async () => {}} flow={demoFlow} groupSize={1} namesLang={namesLang} />
        <Tutorial
          steps={GAME_UI[tutorial].tutorial}
          onDone={() => {
            markTutorial(tutorial);
            if (tutoForce) nav("/parametres");
            else setTutorial(null);
          }}
        />
      </>
    );
  }

  if (myMember?.status === "away" && session) return <RejoinDialog session={session} />;

  if (error)
    return (
      <div className="flex flex-col items-center justify-center gap-5 min-h-[60vh] text-center gutter">
        <p className="m-0 text-lg font-semibold">{error}</p>
        <Btn className="h-[52px] px-8 text-[15px]" onClick={() => nav(ctx === "classique" ? "/jeux" : "/")}>
          {ctx === "classique" ? t("Tous les jeux") : t("Retour à l’accueil")}
        </Btn>
      </div>
    );

  if (!round || !flow || !game)
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-mut" role="status">
        {session && session.phase !== "playing" ? t("En attente du groupe…") : t("Préparation de la manche…")}
      </div>
    );

  const Game = GAME_UI[round.game].component;
  return (
    <>
      <DisconnectBanner session={session} meId={me.profile?.userId} />
      <Game key={round.id} round={round} act={act} finish={finish} flow={flow} groupSize={session?.members.filter((m) => m.status !== "left").length ?? 1} namesLang={namesLang} />
    </>
  );
}

/** Un coéquipier s'est déconnecté : on peut l'attendre, ou continuer sans lui. */
function DisconnectBanner({ session, meId }: { session: LiveSession | null; meId?: string }) {
  const t = useT();
  if (!session || session.kind !== "group") return null;
  const gone = session.members.filter((m) => m.status === "disconnected" && m.userId !== meId);
  if (!gone.length) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-3 py-2.5 gutter text-sm font-semibold" style={{ background: "color-mix(in srgb, var(--warn) 18%, var(--surf))" }}>
      {t("{names} s’est déconnecté. Vous pouvez l’attendre au classement ou continuer sans lui.", { names: gone.map((m) => m.pseudo).join(", ") })}
      <button type="button" className="h-9 px-4 border-0 bg-surf2 text-ink cut-sm cursor-pointer font-bold text-[13px]" onClick={() => post(`/api/temps-reel/sessions/${session.id}/continue`).catch(() => {})}>
        {t("Continuer sans lui")}
      </button>
    </div>
  );
}

/** Retour après une déconnexion : rejoindre le groupe (jeux manqués à 0) ou reprendre en solo. */
function RejoinDialog({ session }: { session: LiveSession }) {
  const t = useT();
  const nav = useNavigate();
  const choose = async (choice: "groupe" | "solo") => {
    const s = await post<LiveSession>(`/api/temps-reel/sessions/${session.id}/rejoin`, { choice }).catch(() => null);
    await queryClient.invalidateQueries({ queryKey: keys.daily });
    if (choice === "solo") {
      useLive.getState().setSession(null);
      nav("/partie?ctx=defi", { replace: true });
    } else if (s) useLive.getState().setSession(s);
  };
  return (
    <Dialog labelledBy="titre-retour" width={520}>
      <h2 id="titre-retour" className="m-0 font-d font-bold text-[28px] leading-[1.1]">
        {t("Ton groupe a continué sans toi")}
      </h2>
      <p className="m-0 max-w-[400px] text-[15px] leading-relaxed text-mut">
        {t("Rejoins-le là où il en est (les jeux manqués comptent 0 point), ou reprends là où tu en étais, en solo.")}
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-1.5">
        <Btn variant="soft" className="h-[52px] px-8 text-[15px]" onClick={() => choose("solo")}>
          {t("Reprendre en solo")}
        </Btn>
        <Btn className="h-[52px] px-8 text-[15px]" onClick={() => choose("groupe")}>
          {t("Rejoindre le groupe")}
        </Btn>
      </div>
    </Dialog>
  );
}

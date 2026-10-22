import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { GameKey, LiveSession } from "@loltr/shared";
import { get, post } from "../api/client";
import { actions, useSession } from "../api/queries";
import { Btn, Pill, glow } from "../components/ui";
import { Broadcast, Logo } from "../components/icons";
import { fmt, useLang, useT } from "../i18n";
import { avatarOf } from "../lib/chibi";
import { CARD_BY_KEY } from "../lib/games";
import { partieUrl } from "../lib/play";
import { refreshMe, useMe, useThemeOverride } from "../state/app";
import { connectLive, useLive, watchStream } from "../state/live";
import { useUi } from "../state/ui";

// Mode streamer : le streamer ouvre une session (défi du jour avec une autre graine, ou jeu classique
// de son choix), ses viewers la rejoignent avec un code ou un lien, en invité s'ils n'ont pas de compte.
// Classement « streamer contre chat », vue OBS sans jamais la réponse, classement de la communauté.

const CLASSIC: GameKey[] = ["meli", "se", "splash"];

export function Stream() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const nav = useNavigate();
  const me = useMe();
  const live = useLive();
  const [choice, setChoice] = useState<"defi" | GameKey>("defi");
  const [busy, setBusy] = useState(false);
  const mine = live.session?.kind === "stream" && live.session.streamerId === me.profile?.userId && live.session.phase !== "done" ? live.session : null;
  const community = useQuery({
    queryKey: ["community", me.profile?.userId],
    queryFn: () => get<{ season: number; rows: { rank: number; points: number; player: { pseudo: string; chibi: string; skin: string | null } | null }[] }>(`/api/classement/community/${me.profile?.userId}`),
    enabled: !!me.profile?.userId
  });

  useEffect(() => {
    if (me.isUser && !live.session) actions.liveSession().then((r) => r.session && useLive.getState().setSession(r.session)).catch(() => {});
  }, [me.isUser]);

  if (!me.loading && !me.isUser) return <Navigate to="/" replace />;

  const create = async () => {
    setBusy(true);
    try {
      const s = await post<LiveSession>("/api/temps-reel/streams", choice === "defi" ? { context: "defi" } : { context: "classique", game: choice });
      useLive.getState().setSession(s);
    } catch (e) {
      useUi.getState().toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };
  const link = mine ? `${location.origin}/live/${mine.code}` : "";
  const obs = mine ? `${location.origin}/obs/${mine.code}` : "";
  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => useUi.getState().toast(t("Copié !"), "ok"));

  return (
    <div className="flex-auto flex flex-col items-center gap-8 pt-12 pb-16 gutter" style={{ background: glow("900px 520px at 50% 300px", 20) }}>
      <h1 className="m-0 font-d font-bold leading-[1.02] uppercase text-center" style={{ fontSize: "clamp(34px, 4vw, 56px)" }}>
        {lang === "fr" ? (
          <>
            Mode <span className="text-acc">streamer</span>
          </>
        ) : (
          <>
            Streamer <span className="text-acc">mode</span>
          </>
        )}
      </h1>
      {!mine ? (
        <div className="w-full max-w-[760px] p-[2px] bg-acc cut-lg">
          <div className="flex flex-col gap-5 px-8 max-sm:px-5 py-7 bg-surf cut-lg">
            <p className="m-0 text-base leading-relaxed text-mut">
              {t("Ton chat joue avec toi en direct sur LolTR, depuis n’importe quelle plateforme : il suffit du code affiché à l’écran. Les viewers sans compte jouent en invité avec un pseudo aléatoire. Aucun point classé n’est en jeu.")}
            </p>
            <div className="flex flex-col gap-2.5">
              <span className="label">{t("Que joue-t-on ?")}</span>
              <div className="flex flex-wrap gap-2">
                <Pill on={choice === "defi"} onClick={() => setChoice("defi")}>
                  {t("Défi du jour")}
                </Pill>
                {CLASSIC.map((g) => (
                  <Pill key={g} on={choice === g} onClick={() => setChoice(g)}>
                    {t(CARD_BY_KEY[g].name)}
                  </Pill>
                ))}
              </div>
              <span className="text-[13.5px] text-mut">
                {choice === "defi" ? t("Le défi du stream utilise un autre tirage que le défi classé : il ne dévoile ni ne consomme le tien.") : t("Un jeu classique, manche après manche, au rythme que tu choisis.")}
              </span>
            </div>
            <div>
              <Btn className="flex items-center gap-2.5 h-[54px] px-9 text-base" onClick={create} disabled={busy}>
                <Broadcast /> {t("Ouvrir la session")}
              </Btn>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-6 w-full max-w-[1200px]">
          <div className="flex-[1_1_420px] min-w-0 p-[2px] bg-acc cut-lg">
            <div className="flex flex-col gap-5 px-8 max-sm:px-5 py-7 bg-surf cut-lg">
              <span className="label">{t("Code à afficher")}</span>
              <span className="font-d font-bold text-[64px] leading-none tracking-[0.12em] text-acc">{mine.code}</span>
              <div className="flex flex-col gap-2 text-sm">
                <CopyRow label={t("Lien pour le chat")} value={link} onCopy={copy} />
                <CopyRow label={t("Vue OBS (source navigateur)")} value={obs} onCopy={copy} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="label">{t("Jeu en cours")}</span>
                <span className="font-d font-bold text-2xl">
                  {mine.games[mine.index] ? t(CARD_BY_KEY[mine.games[mine.index]].name) : t("Session terminée")}
                  {mine.context === "streamer" && mine.games.length > 1 && <span className="ml-2 text-base text-mut">{t("{i} sur {n}", { i: Math.min(mine.index + 1, mine.games.length), n: mine.games.length })}</span>}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <Btn className="h-[52px] px-8 text-[15px]" onClick={() => nav(partieUrl("streamer", mine.games[mine.index], mine.id))}>
                  {t("Jouer cette manche")}
                </Btn>
                <Btn variant="soft" className="h-[52px] px-8 text-[15px]" onClick={() => post(`/api/temps-reel/streams/${mine.id}/next`).catch(() => {})}>
                  {t("Manche suivante")}
                </Btn>
                <button
                  type="button"
                  className="tl text-sm"
                  onClick={async () => {
                    await post(`/api/temps-reel/sessions/${mine.id}/leave`).catch(() => {});
                    useLive.getState().setSession(null);
                  }}
                >
                  {t("Terminer la session")}
                </button>
              </div>
            </div>
          </div>
          <StreamBoard session={mine} />
        </div>
      )}
      {community.data && community.data.rows.length > 0 && (
        <div className="w-full max-w-[760px] p-[1.5px] bg-line cut-md">
          <div className="flex flex-col gap-2 px-6 py-5 bg-surf cut-md">
            <span className="label">{t("Classement de ta communauté · saison {n}", { n: community.data.season })}</span>
            {community.data.rows.slice(0, 10).map((r) => (
              <div key={r.rank} className="flex items-center gap-3.5 py-[7px] px-3.5 bg-surf2 cut-sm">
                <span className="basis-7 shrink-0 font-d font-bold text-acc">{r.rank}</span>
                <span className="flex-auto font-semibold">{r.player?.pseudo ?? "…"}</span>
                <span className="font-d font-semibold text-mut">{t("{n} pts", { n: fmt(r.points) })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CopyRow({ label, value, onCopy }: { label: string; value: string; onCopy: (s: string) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3">
      <span className="basis-48 shrink-0 text-mut">{label}</span>
      <code className="flex-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 bg-surf2 cut-sm">{value}</code>
      <button type="button" onClick={() => onCopy(value)} className="h-9 px-3.5 border-0 bg-surf2 text-ink cut-sm cursor-pointer font-bold text-[13px]">
        {t("Copier")}
      </button>
    </div>
  );
}

/** Classement « streamer contre chat ». */
export function StreamBoard({ session, big = false }: { session: LiveSession; big?: boolean }) {
  const t = useT();
  const rows = [...session.members].filter((m) => m.status !== "left").sort((a, b) => b.total - a.total);
  return (
    <div className={`${big ? "w-full" : "flex-[1_1_360px]"} min-w-0 p-[1.5px] bg-line cut-lg`}>
      <div className="flex flex-col gap-2 px-6 py-6 bg-surf cut-lg">
        <span className="font-d font-bold text-lg tracking-[0.04em] uppercase text-center">{t("Streamer contre chat")}</span>
        <span className="text-center text-[13px] text-mut">{t("{n} joueurs", { n: rows.length })}</span>
        {rows.slice(0, big ? 8 : 15).map((m, i) => (
          <div key={m.userId} className="flex items-center gap-3 h-12 pl-2 pr-4 cut-sm" style={{ background: m.userId === session.streamerId ? "color-mix(in srgb, var(--acc) 22%, var(--surf2))" : "var(--surf2)" }}>
            <span className="basis-6 shrink-0 text-center font-d font-bold" style={{ color: i === 0 ? "var(--acc)" : "var(--mut)" }}>
              {i + 1}
            </span>
            <span className="basis-9 shrink-0 h-9 overflow-hidden cut-sm">
              <img src={avatarOf(m)} alt="" className="block w-full h-full object-cover" />
            </span>
            <span className="flex-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold">
              {m.pseudo}
              {m.userId === session.streamerId && <span className="ml-2 text-xs text-acc uppercase">{t("streamer")}</span>}
            </span>
            <span className="font-d font-bold text-lg">{m.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Carte de résultat d'un viewer : « tu as battu 82 % du chat ». */
export function StreamCard({ sessionId }: { sessionId: string }) {
  const t = useT();
  const me = useMe();
  const card = useQuery({
    queryKey: ["stream-card", sessionId, useLive.getState().session?.index],
    queryFn: () => get<{ total: number; position: number; players: number; beatPercent: number; beatStreamer: boolean | null; streamer: { pseudo: string } | null }>(`/api/temps-reel/streams/${sessionId}/card`),
    refetchInterval: 5000
  });
  if (!card.data) return null;
  const c = card.data;
  return (
    <div className="flex flex-col items-center gap-1.5 w-[calc(100%-72px)] max-w-[380px] px-4 py-3.5 bg-surf2 cut-sm">
      <span className="font-d font-bold text-2xl">
        {t("Tu as battu")} <span className="text-acc">{c.beatPercent} %</span> {t("du chat")}
      </span>
      <span className="text-[13.5px] text-mut">
        {t("{p}ᵉ sur {n}", { p: c.position, n: c.players })}
        {c.beatStreamer !== null && c.streamer ? " · " + (c.beatStreamer ? t("devant {name} !", { name: c.streamer.pseudo }) : t("derrière {name}", { name: c.streamer.pseudo })) : ""}
      </span>
      {me.isGuest && (
        <button type="button" className="tl text-sm" onClick={() => useUi.getState().askLogin("compte")}>
          {t("Crée ton compte pour garder tes récompenses")}
        </button>
      )}
    </div>
  );
}

/** Page d'arrivée d'un viewer (lien ou code du streamer). */
export function Live() {
  const t = useT();
  const nav = useNavigate();
  const { code = "" } = useParams();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const info = useQuery({ queryKey: ["stream-public", code], queryFn: () => get<LiveSession>(`/api/temps-reel/streams/code/${code}`), retry: false });
  const streamer = info.data?.members.find((m) => m.userId === info.data?.streamerId);

  const join = async () => {
    setBusy(true);
    try {
      if (session.data?.kind === "anonymous") {
        await actions.guest();
        await refreshMe();
      }
      connectLive();
      const s = await post<LiveSession>("/api/temps-reel/streams/join", { code });
      useLive.getState().setSession(s);
      nav(partieUrl("streamer", s.games[s.index], s.id));
    } catch (e) {
      useUi.getState().toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-auto min-h-[calc(100vh-85px)] flex items-center justify-center gutter py-10" style={{ background: glow("900px 520px at 50% 50%", 22) }}>
      <div className="w-full max-w-[520px] p-[2px] bg-acc cut-lg">
        <div className="flex flex-col items-center gap-4 px-9 py-9 bg-surf cut-lg text-center">
          <Broadcast size={40} className="text-acc" />
          {info.isError ? (
            <>
              <h1 className="m-0 font-d font-bold text-[28px]">{t("Aucune session avec ce code")}</h1>
              <p className="m-0 text-mut">{t("Vérifie le code affiché par le streamer.")}</p>
            </>
          ) : (
            <>
              <h1 className="m-0 font-d font-bold text-[30px] leading-tight">
                {t("Joue avec")} <span className="text-acc">{streamer?.pseudo ?? "…"}</span>
              </h1>
              <p className="m-0 text-[15px] leading-relaxed text-mut">
                {info.data?.games[info.data.index] ? t("Manche en cours : {game}.", { game: t(CARD_BY_KEY[info.data.games[info.data.index]].name) }) : ""}{" "}
                {session.data?.kind === "anonymous" ? t("Pas besoin de compte : tu joues en invité avec un pseudo aléatoire.") : ""}
              </p>
              <Btn className="h-[54px] px-10 text-base" onClick={join} disabled={busy || !info.data}>
                {t("Rejoindre la partie")}
              </Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Vue OBS : code, lien, jeu en cours et classement, sans jamais la réponse. */
export function Obs() {
  const t = useT();
  const { code = "" } = useParams();
  const session = useLive((s) => s.session);
  useThemeOverride(null);
  useEffect(() => {
    get<LiveSession>(`/api/temps-reel/streams/code/${code}`).then((s) => useLive.getState().setSession(s)).catch(() => {});
    watchStream(code);
  }, [code]);
  return (
    <div className="min-h-screen flex flex-col gap-4 p-6" style={{ background: "transparent" }}>
      <div className="flex items-center gap-4 p-[2px] bg-acc cut-md self-start">
        <div className="flex items-center gap-4 px-5 py-3 bg-surf cut-md">
          <Logo size={30} className="text-acc" />
          <span className="font-d font-bold text-lg">
            {location.host}/live/<span className="text-acc text-2xl tracking-[0.1em]">{code.toUpperCase()}</span>
          </span>
        </div>
      </div>
      {session && (
        <>
          <span className="self-start px-4 py-2 bg-surf cut-sm font-d font-bold uppercase tracking-[0.06em]">
            {session.games[session.index] ? t(CARD_BY_KEY[session.games[session.index]].name) : t("Session terminée")}
          </span>
          <div className="max-w-[420px]">
            <StreamBoard session={session} big />
          </div>
        </>
      )}
    </div>
  );
}

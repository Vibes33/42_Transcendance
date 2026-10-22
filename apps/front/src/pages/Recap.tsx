import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { LiveMember, LiveSession } from "@loltr/shared";
import { get, post } from "../api/client";
import { keys, queryClient } from "../api/queries";
import { Btn, glow } from "../components/ui";
import { Check } from "../components/icons";
import { useT } from "../i18n";
import { avatarOf } from "../lib/chibi";
import { CARD_BY_KEY } from "../lib/games";
import { partieUrl } from "../lib/play";
import { useMe } from "../state/app";
import { useLive } from "../state/live";

// Récapitulatif du défi en groupe : points de chacun par jeu ; les lignes changent de place puis
// les totaux montent. « Jeu suivant » attend que tout le monde soit prêt.

const COLS = "minmax(240px, 1.7fr) repeat(4, minmax(110px, 1fr)) minmax(110px, 0.9fr) minmax(130px, 1fr)";

function cellValue(s: LiveSession, m: LiveMember, i: number): number | null {
  const r = m.results[i];
  if (!r?.done) return null;
  if (s.context === "defi") return r.projected;
  const x = r.summary;
  return x?.champions ?? x?.correct ?? (x?.found ? 1 : 0);
}

export function Recap() {
  const t = useT();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const id = sp.get("session");
  const me = useMe();
  const session = useLive((s) => (s.session?.id === id ? s.session : null));
  const [anim, setAnim] = useState(0);
  const started = useRef(Date.now());

  useEffect(() => {
    if (id && !session) get<LiveSession>(`/api/temps-reel/sessions/${id}`).then((s) => useLive.getState().setSession(s)).catch(() => nav("/"));
  }, [id, !!session]);

  // Animation d'arrivée : ancien classement, puis glissement vers le nouveau et montée des totaux
  useEffect(() => {
    started.current = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.max(0, Math.min(1, (Date.now() - started.current - 450) / 1300));
      setAnim(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    queryClient.invalidateQueries({ queryKey: keys.daily });
    return () => cancelAnimationFrame(raf);
  }, [session?.index, session?.phase]);

  // Tout le monde est prêt : le jeu suivant démarre
  useEffect(() => {
    if (session?.phase === "playing") nav(partieUrl(session.context === "defi" ? "defi" : "classique", session.games[session.index], session.id), { replace: true });
  }, [session?.phase, session?.index]);

  if (!session) return <div className="flex items-center justify-center min-h-[60vh] text-mut">{t("Chargement…")}</div>;

  const final = session.phase === "done";
  const lastIdx = final ? session.games.length - 1 : session.index;
  const from = Math.max(0, Math.min(lastIdx - 3, session.games.length - 4));
  const cols = session.games.slice(from, from + 4).map((g, j) => ({ g, i: from + j }));
  const players = session.members.filter((m) => m.status !== "left");
  const ease = 1 - Math.pow(1 - anim, 3);
  const total = (m: LiveMember) => session.games.reduce((s, _, i) => s + (session.context === "defi" ? (cellValue(session, m, i) ?? 0) : 0), 0);
  const metric = (m: LiveMember) => (session.context === "defi" ? total(m) : session.games.reduce((s, _, i) => s + (cellValue(session, m, i) ?? 0), 0));
  const prev = (m: LiveMember) => metric(m) - (cellValue(session, m, lastIdx) ?? 0);
  const order = [...players].sort((a, b) => (anim > 0 ? metric(b) - metric(a) : prev(b) - prev(a)));
  const winner = [...players].sort((a, b) => metric(b) - metric(a))[0];
  const myId = me.profile?.userId;
  const mine = players.find((m) => m.userId === myId);
  const readyCount = players.filter((m) => m.ready || m.status !== "active").length;
  const nextGame = session.context === "classique" ? session.games[session.index] : session.games[session.index + 1];
  const allReady = players.every((m) => m.ready || m.status !== "active");

  const ready = () => post(`/api/temps-reel/sessions/${session.id}/ready`, {}).catch(() => {});
  const home = async () => {
    useLive.getState().setSession(null);
    await queryClient.invalidateQueries({ queryKey: keys.daily });
    nav("/");
  };

  return (
    <div className="relative flex-auto flex flex-col items-center justify-center gap-7 pt-[30px] pb-10 gutter min-h-[calc(100vh-85px)]" style={{ background: glow("1000px 560px at 50% 520px", 20) }}>
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className="text-[13px] tracking-[0.1em] uppercase text-mut">
          {session.context === "defi"
            ? final
              ? t("Défi du jour en groupe · terminé")
              : t("Défi du jour en groupe · jeu {n} sur 4 terminé", { n: lastIdx + 1 })
            : t("Partie classique en groupe · manche {n}", { n: lastIdx + 1 })}
        </span>
        <h1 className="m-0 font-d font-bold leading-[1.02] uppercase" style={{ fontSize: "clamp(34px, 3.6vw, 52px)" }}>
          {final ? t("Victoire de") : t("Classement")} <span className="text-acc">{final ? winner?.pseudo : t("du défi")}</span>
        </h1>
      </div>

      <div className="p-[1.5px] bg-line cut-lg" style={{ width: "min(100%, 1240px)" }}>
        <div className="px-[26px] pt-[22px] pb-[26px] bg-surf cut-lg overflow-x-auto scroll">
          <div role="table" aria-label={t("Points de chaque joueur par jeu")} className="flex flex-col gap-2 min-w-[980px]">
            <div role="row" className="grid gap-2 items-end pb-1.5" style={{ gridTemplateColumns: COLS }}>
              <span role="columnheader" className="text-[12.5px] font-bold tracking-[0.08em] uppercase text-mut pl-3.5">
                {t("Joueur")}
              </span>
              {cols.map((c) => (
                <span key={c.i} role="columnheader" className="text-[12.5px] font-bold tracking-[0.08em] uppercase text-center" style={{ color: c.i === lastIdx ? "var(--acc)" : "var(--mut)" }}>
                  {t(CARD_BY_KEY[c.g].name)}
                </span>
              ))}
              {Array.from({ length: 4 - cols.length }, (_, i) => (
                <span key={"e" + i} />
              ))}
              <span role="columnheader" className="text-[12.5px] font-bold tracking-[0.08em] uppercase text-mut text-center">
                {t("Total")}
              </span>
              <span role="columnheader" className="text-[12.5px] font-bold tracking-[0.08em] uppercase text-mut text-center">
                {t("Jeu suivant")}
              </span>
            </div>
            <div className="relative" style={{ height: players.length * 72 - 8 }}>
              {players.map((m) => {
                const r = order.indexOf(m);
                const isMe = m.userId === myId;
                const shownTotal = Math.round(prev(m) + (metric(m) - prev(m)) * ease);
                const status = m.status === "disconnected" ? t("Déconnecté") : m.status === "away" ? t("Absent") : m.tutorial ? t("Tutoriel") : m.ready ? t("Prêt") : t("En attente…");
                return (
                  <div
                    role="row"
                    key={m.userId}
                    className="absolute left-0 right-0 h-16 grid gap-2 items-center cut-sm"
                    style={{ top: r * 72, gridTemplateColumns: COLS, background: isMe ? "color-mix(in srgb, var(--acc) 16%, var(--surf2))" : "var(--surf2)", transition: "top .6s cubic-bezier(.2,.8,.2,1)" }}
                  >
                    <span role="rowheader" className="flex items-center gap-3 px-3">
                      <span className="basis-[22px] shrink-0 text-center font-d font-bold text-lg" style={{ color: r === 0 ? "var(--acc)" : "var(--mut)" }}>
                        {r + 1}
                      </span>
                      <span className="basis-11 shrink-0 h-11 overflow-hidden cut-sm">
                        <img src={isMe ? me.meImg : avatarOf(m)} alt="" className="block w-full h-full object-cover" />
                      </span>
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold text-base">
                        {m.pseudo}
                        {isMe ? " " + t("(toi)") : ""}
                      </span>
                    </span>
                    {cols.map((c) => {
                      const raw = cellValue(session, m, c.i);
                      const v = raw !== null && c.i === lastIdx ? Math.round(raw * ease) : raw;
                      const last = c.i === lastIdx;
                      return (
                        <span
                          key={c.i}
                          role="cell"
                          className="self-stretch flex items-center justify-center font-d font-bold text-lg"
                          style={{ background: last ? "color-mix(in srgb, var(--acc) 10%, transparent)" : "transparent", color: v === null ? "var(--line)" : last ? "var(--acc)" : "var(--ink)" }}
                        >
                          {v === null ? "—" : v}
                        </span>
                      );
                    })}
                    {Array.from({ length: 4 - cols.length }, (_, i) => (
                      <span key={"e" + i} />
                    ))}
                    <span role="cell" className="text-center font-d font-bold text-2xl text-acc">
                      {shownTotal}
                    </span>
                    <span role="cell" className="flex items-center justify-center gap-2 text-sm font-bold" style={{ color: m.ready ? "var(--ok)" : "var(--mut)" }}>
                      {!final && m.ready && <Check w={3} />}
                      {final ? "—" : status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2.5">
        {final ? (
          <Btn className="h-[58px] px-[52px] text-[17px]" onClick={home}>
            {t("Retour à l’accueil")}
          </Btn>
        ) : mine && !mine.ready ? (
          <Btn className="h-[58px] px-[52px] text-[17px]" onClick={ready}>
            {session.context === "defi" ? (nextGame ? t("Jeu suivant ({n}/4) · {name}", { n: session.index + 2, name: t(CARD_BY_KEY[nextGame].name) }) : t("Classement final")) : t("Rejouer")}
          </Btn>
        ) : (
          <span role="status" className="inline-flex items-center h-[58px] px-11 bg-surf2 text-mut para font-d font-bold text-base tracking-[0.05em] uppercase">
            {allReady ? t("Tout le monde est prêt, c’est parti !") : t("En attente des autres · {n}/{total} prêts", { n: readyCount, total: players.length })}
          </span>
        )}
        {!final && (
          <button type="button" className="tl text-sm" onClick={async () => { await post(`/api/temps-reel/sessions/${session.id}/leave`).catch(() => {}); await home(); }}>
            {t("Quitter le groupe de jeu")}
          </button>
        )}
      </div>
    </div>
  );
}

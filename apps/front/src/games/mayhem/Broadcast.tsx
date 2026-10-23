import { useEffect, useState } from "react";
import { LITE_BY_ID, RIFT, squareImg, type MayhemGame, type MayhemTournament } from "@loltr/content/lite";
import { useLang, useT } from "../../i18n";
import { Head, Rift, entrantName, eventText, rosterOf } from "./util";

// Retransmission d'une partie simulée : la caméra est zoomée sur le mid, puis glisse vers chaque
// action au moment où elle a lieu. Score, objectifs, or et fil des actions avancent avec le chrono.

/** La caméra reste environ 3,5 s (temps réel) sur chaque action, quelle que soit la vitesse. */
const HOLD_REAL_S = 3.5;
/** Secondes d'affichage du score avant le retour aux poules ou à l'arbre. */
const AUTO_RETURN_S = 5;
const BLUE = "#3B82F6";
const RED = "#E5484D";
const mmss = (s: number) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function Broadcast({
  tour,
  game,
  mine,
  names,
  myId,
  stage,
  next,
  overview,
  autoReturn
}: {
  tour: MayhemTournament;
  game: MayhemGame;
  /** Index de mon équipe dans le tournoi. */
  mine: number;
  names: Record<string, string>;
  myId?: string;
  stage: string;
  /** Fin de partie : enchaîner sur la partie suivante (ou les résultats). */
  next: { label: string; go: () => void };
  /** Fin de partie : voir les poules ou l'arbre. */
  overview: { label: string; go: () => void };
  /** Entre deux matchs : retour automatique aux poules ou à l'arbre après le score. */
  autoReturn: boolean;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(2);
  const [paused, setPaused] = useState(false);
  const ended = time >= game.duration;
  const [left, setLeft] = useState(AUTO_RETURN_S);

  // Fin de partie (regardée ou passée) : le score s'affiche, puis retour au tournoi
  useEffect(() => {
    if (!ended || !autoReturn) return;
    setLeft(AUTO_RETURN_S);
    const id = setInterval(() => setLeft((v) => v - 1), 1000);
    return () => clearInterval(id);
  }, [ended, autoReturn]);
  useEffect(() => {
    if (ended && autoReturn && left <= 0) overview.go();
  }, [ended, autoReturn, left]);

  // x1 = 10 secondes de jeu par seconde
  useEffect(() => {
    if (paused || ended) return;
    const id = setInterval(() => setTime((v) => Math.min(game.duration, v + speed)), 100);
    return () => clearInterval(id);
  }, [paused, ended, speed, game.duration]);

  const blueE = tour.entrants[game.blue];
  const redE = tour.entrants[game.red];
  const side = { a: entrantName(t, blueE, names, myId), b: entrantName(t, redE, names, myId) };
  const roster = { a: rosterOf(blueE.picks), b: rosterOf(redE.picks) };
  const players = { a: roster.a.map((p) => p?.name ?? "?"), b: roster.b.map((p) => p?.name ?? "?") };
  const champ = (s: "a" | "b", i: number) => LITE_BY_ID[game.champs[s][i]]?.names[lang] ?? game.champs[s][i];
  const mySide: "a" | "b" | null = game.blue === mine ? "a" : game.red === mine ? "b" : null;
  const colorOf = (s: "a" | "b") => (s === mySide ? "var(--acc)" : s === "a" ? BLUE : RED);

  const past = game.events.filter((e) => e.t <= time);
  const last = past[past.length - 1];
  const focus = last && (time - last.t < HOLD_REAL_S * 10 * speed || ended) ? last : null;
  const z = focus ? 2.7 : 2.2;
  const [cx, cy] = focus ? focus.at : [50, 50];
  const tx = clamp(50 - cx * z, 100 - 100 * z, 0);
  const ty = clamp(28.125 - cy * z, 56.25 - 100 * z, 0);
  const sum = (f: (e: (typeof past)[number]) => number) => past.reduce((n, e) => n + f(e), 0);
  const ka = sum((e) => e.ka);
  const kb = sum((e) => e.kb);
  const count = (kind: string, s: "a" | "b") => sum((e) => (e.kind === kind && e.side === s ? 1 : 0));
  let diff = 0;
  for (const [gt, d] of game.gold) if (gt <= time) diff = d;
  const base = 2500 + time * 24;
  const k = (v: number) => (v / 1000).toFixed(1).replace(".", ",") + "k";
  const prob = ended ? (game.winner === game.blue ? 100 : 0) : Math.round(clamp(50 + diff / 90, 12, 88));
  const myProb = mySide === "b" ? 100 - prob : prob;

  const token = (s: "a" | "b", i: number) => {
    const inv = focus && focus.who[s].includes(i);
    const dead = !!focus && focus.dead[s].includes(i) && !ended;
    const ang = ((i * 72 + (s === "b" ? 36 : 0)) * Math.PI) / 180;
    const off = s === "a" ? -1.6 : 1.6;
    const [x, y] = inv ? [focus!.at[0] + off + Math.cos(ang) * 3, focus!.at[1] - off + Math.sin(ang) * 3] : RIFT.lanes[s][i];
    return { x, y, dead };
  };

  const feed = past.slice().reverse().slice(0, 5);
  const text = (e: (typeof past)[number]) => eventText(t, e, side, players, champ);
  const cap = focus ? text(focus) : null;
  const goldPts = [...game.gold.filter(([gt]) => gt <= time), [time, diff]].map(([gt, d]) => `${((gt / game.duration) * 600).toFixed(1)},${(60 - d / 90).toFixed(1)}`).join(" ");

  const Column = ({ s }: { s: "a" | "b" }) => (
    <section aria-label={side[s]} className="min-h-0 flex flex-col gap-1.5">
      <div className={`flex items-center gap-3 py-2.5 px-3.5 cut-md ${s === "b" ? "flex-row-reverse text-right" : ""}`} style={{ background: s === mySide ? "color-mix(in srgb, var(--acc) 16%, var(--surf))" : "var(--surf)" }}>
        <span className="basis-2 shrink-0 self-stretch" style={{ background: s === "a" ? BLUE : RED }} />
        <span className="flex-auto min-w-0 flex flex-col">
          <strong className="font-d text-[17px] truncate">{side[s]}</strong>
          <span className="text-[13px] text-mut">
            {s === "a" ? t("Côté bleu") : t("Côté rouge")} · {t("note {n}", { n: (s === "a" ? blueE : redE).rating })}
          </span>
        </span>
      </div>
      {roster[s].map((p, i) => {
        const tk = token(s, i);
        const kda = game.kda[s][i];
        const c = LITE_BY_ID[game.champs[s][i]];
        return (
          <div key={i} className={`flex items-center gap-2.5 py-1 bg-surf cut-sm ${s === "b" ? "flex-row-reverse pl-3 pr-1 text-right" : "pl-1 pr-3"}`} style={{ opacity: tk.dead ? 0.55 : 1 }}>
            <Head name={p?.name ?? ""} color={p?.team.color} dim={tk.dead} className="basis-10 shrink-0 w-10 h-10 cut-sm text-sm" />
            <span className="flex-auto min-w-0 flex flex-col">
              <strong className="text-[15px] truncate">{p?.name}</strong>
              <span className={`flex items-center gap-1.5 text-[12.5px] text-mut ${s === "b" ? "justify-end" : ""}`}>
                {c && <img src={squareImg(c)} alt="" className="w-4 h-4" />}
                {champ(s, i)}
              </span>
            </span>
            <span className="font-d font-bold text-[15px]" style={{ color: tk.dead ? "var(--danger)" : "var(--ink)" }}>
              {ended ? kda.join("/") : tk.dead ? t("Mort") : ""}
            </span>
          </div>
        );
      })}
    </section>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 pt-3 pb-4 gutter max-xl:overflow-y-auto">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-center gap-3.5">
          <span className="flex items-center gap-2 h-[34px] px-3 cut-sm font-d font-bold text-[13px] tracking-[0.08em] uppercase" style={{ background: ended ? "var(--surf2)" : "color-mix(in srgb, var(--danger) 18%, var(--surf))", color: ended ? "var(--mut)" : "var(--danger)" }}>
            <span className={ended ? "" : "live"} style={{ width: 8, height: 8, background: ended ? "var(--mut)" : "var(--danger)" }} />
            {ended ? t("Terminé") : t("En direct")}
          </span>
          <span className="font-d font-bold text-xl">{stage}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="label mr-1.5">{t("Vitesse")}</span>
          {[1, 2, 4].map((n) => (
            <button key={n} type="button" onClick={() => setSpeed(n)} aria-pressed={speed === n} className="w-14 h-11 border-0 cut-sm cursor-pointer font-d font-bold" style={{ background: speed === n ? "var(--acc)" : "var(--surf2)", color: speed === n ? "var(--on-acc)" : "var(--ink)" }}>
              x{n}
            </button>
          ))}
          <button type="button" onClick={() => (ended ? setTime(0) : setPaused(!paused))} aria-label={ended ? t("Revoir la partie") : paused ? t("Reprendre") : t("Pause")} className="w-14 h-11 border-0 bg-surf2 cut-sm cursor-pointer flex items-center justify-center text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={ended ? "M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" : paused ? "M8 5v14l11-7z" : "M7 5h4v14H7zM13 5h4v14h-4z"} />
            </svg>
          </button>
          <button type="button" className="tl min-h-11 ml-3 text-[15px]" onClick={() => setTime(game.duration)}>
            {t("Passer la partie")}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid gap-4 items-start grid-cols-1 xl:grid-cols-[minmax(220px,290px)_minmax(0,1fr)_minmax(220px,290px)]">
        <Column s="a" />
        <section aria-label={t("Match en direct")} className="min-w-0 xl:h-full min-h-0 flex flex-col gap-2.5 xl:order-none -order-1">
          <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 py-2 px-4 bg-surf cut-md">
            <span className="font-d font-bold text-[38px] leading-none" style={{ color: colorOf("a") }}>
              {ka}
            </span>
            <span className="flex flex-col items-center">
              <span className="label !text-xs">{t("Kills")}</span>
              <span className="font-d font-bold text-lg">{mmss(time)}</span>
            </span>
            <span className="font-d font-bold text-[38px] leading-none" style={{ color: colorOf("b") }}>
              {kb}
            </span>
            <div className="flex-[1_1_320px] grid grid-cols-4 gap-1.5">
              {[
                [t("Or"), k(base + diff / 2), k(base - diff / 2)],
                [t("Tours"), count("tower", "a"), count("tower", "b")],
                [t("Dragons"), count("dragon", "a"), count("dragon", "b")],
                [t("Barons"), count("baron", "a"), count("baron", "b")]
              ].map(([l, a, b]) => (
                <div key={String(l)} className="flex flex-col items-center p-1.5 bg-surf2 cut-sm">
                  <span className="label !text-[11.5px]">{l}</span>
                  <span className="font-d font-bold">
                    <span style={{ color: colorOf("a") }}>{a}</span> <span className="text-mut">·</span> <span style={{ color: colorOf("b") }}>{b}</span>
                  </span>
                </div>
              ))}
            </div>
            {mySide && (
              <div className="basis-full flex items-center gap-3">
                <span className="text-[13px] whitespace-nowrap">
                  <strong className="text-acc">{myProb} %</strong> <span className="text-mut">{t("de chances de victoire")}</span>
                </span>
                <div role="img" aria-label={t("Probabilité de victoire : {n} % pour ton équipe", { n: myProb })} className="flex-auto flex h-2 bg-surf2">
                  <span className="bg-acc transition-[width] duration-500" style={{ width: myProb + "%" }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-[200px] max-xl:h-[50vw] [container-type:size]">
          <div className="relative mx-auto aspect-video overflow-hidden cut-md" style={{ background: "#141A12", width: "min(100cqw, calc(100cqh * 16 / 9))" }}>
            <div className="absolute left-0 top-0 w-full aspect-square" style={{ transformOrigin: "0 0", transform: `translate(${tx}%, ${ty}%) scale(${z})`, transition: "transform 1.3s ease-in-out" }}>
              <Rift>
                {focus && !ended && <span className="ping absolute w-[70px] h-[70px] box-border" style={{ left: focus.at[0] + "%", top: focus.at[1] + "%", border: "3px solid " + colorOf(focus.side) }} />}
                {(["a", "b"] as const).flatMap((s) =>
                  roster[s].map((p, i) => {
                    const tk = token(s, i);
                    return (
                      <span
                        key={s + i}
                        className="absolute block w-10 h-10 p-[3px] box-border"
                        style={{ left: tk.x + "%", top: tk.y + "%", background: s === "a" ? BLUE : RED, boxShadow: "0 0 0 2px #0F1115", opacity: tk.dead ? 0.35 : 1, filter: tk.dead ? "grayscale(1)" : "none", transform: `translate(-50%, -50%) scale(${(1 / z).toFixed(3)})`, transition: "left 1.4s ease-in-out, top 1.4s ease-in-out, opacity .4s ease, transform 1.3s ease-in-out" }}
                      >
                        <Head name={p?.name ?? ""} color={p?.team.color} className="w-full h-full text-xs" />
                      </span>
                    );
                  })
                )}
              </Rift>
            </div>
            <div className="absolute left-4 top-4 max-w-[min(62%,520px)] flex gap-3 py-2.5 pl-3 pr-4 cut-sm text-[#EEF0F3]" style={{ background: "rgba(15,17,21,.84)" }}>
              <span className="basis-1 shrink-0 self-stretch" style={{ background: focus ? colorOf(focus.side) : "#A9B0BC" }} />
              <span className="flex flex-col gap-0.5" aria-live="polite">
                <span className="text-xs font-bold tracking-[0.08em] uppercase text-[#A9B0BC]">{focus ? mmss(focus.t) + " · " + (ended ? t("fin de la partie") : t("action en cours")) : t("Caméra sur le mid")}</span>
                <strong>{cap ? cap.title : time < 90 ? t("Début de la partie") : t("Phase de jeu")}</strong>
                <span className="text-[13px] text-[#C9CED6]">{cap ? cap.detail : t("La caméra rejoint chaque action dès qu’elle a lieu")}</span>
              </span>
            </div>
            <div className="absolute right-4 top-4 flex items-center gap-2 h-[34px] px-3 cut-sm font-d font-bold text-[15px] text-[#EEF0F3]" style={{ background: "rgba(15,17,21,.84)" }}>
              <span className={ended ? "" : "live"} style={{ width: 8, height: 8, background: ended ? "#A9B0BC" : "#FF6B6B" }} />
              {mmss(time)}
            </div>
            <div className="absolute right-4 bottom-4 w-[168px] aspect-square p-[2px] box-border cut-sm max-sm:hidden" style={{ background: "rgba(15,17,21,.84)" }}>
              <div className="relative w-full h-full overflow-hidden">
                <Rift>
                  {(["a", "b"] as const).flatMap((s) =>
                    [0, 1, 2, 3, 4].map((i) => {
                      const tk = token(s, i);
                      return <span key={s + i} className="absolute w-[7px] h-[7px] -translate-x-1/2 -translate-y-1/2" style={{ left: tk.x + "%", top: tk.y + "%", background: s === "a" ? BLUE : RED, opacity: tk.dead ? 0.35 : 1, transition: "left 1.4s ease-in-out, top 1.4s ease-in-out" }} />;
                    })
                  )}
                  <span className="absolute box-border border-2 border-[#EEF0F3]" style={{ left: -tx / z + "%", top: -ty / z + "%", width: 100 / z + "%", height: 56.25 / z + "%", transition: "all 1.3s ease-in-out" }} />
                </Rift>
              </div>
            </div>
            {ended && (
              <div className="rise absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-[#EEF0F3]" style={{ background: "rgba(15,17,21,.82)" }}>
                <span className="font-d font-bold text-[clamp(32px,4.5vw,60px)] leading-none tracking-[0.04em] uppercase" style={{ color: game.winner === mine ? "var(--acc)" : "#EEF0F3" }}>
                  {game.winner === mine ? t("Victoire") : mySide ? t("Défaite") : t("Victoire de {team}", { team: game.winner === game.blue ? side.a : side.b })}
                </span>
                <span className="flex items-center gap-3 font-d font-bold text-lg">
                  <span className="truncate max-w-[220px]">{side.a}</span>
                  <span className="text-3xl" style={{ color: colorOf("a") }}>{ka}</span>
                  <span className="text-[#A9B0BC]">–</span>
                  <span className="text-3xl" style={{ color: colorOf("b") }}>{kb}</span>
                  <span className="truncate max-w-[220px]">{side.b}</span>
                </span>
                <span className="text-[13px] text-[#A9B0BC]">{t("Kills · partie de {time}", { time: mmss(game.duration) })}</span>
                {autoReturn ? (
                  <>
                    <button type="button" onClick={overview.go} className="mt-1 h-[52px] px-[34px] border-0 para bg-acc text-on-acc cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                      {overview.label}
                    </button>
                    <span className="text-[13px] text-[#A9B0BC]" aria-live="polite">
                      {t("Retour au tournoi dans {n} s", { n: Math.max(0, left) })}
                    </span>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={next.go} className="mt-1 h-[52px] px-[34px] border-0 para bg-acc text-on-acc cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                      {next.label}
                    </button>
                    <button type="button" onClick={overview.go} className="min-h-11 border-0 bg-transparent p-0 cursor-pointer font-bold text-[15px] text-[#EEF0F3] underline decoration-2 underline-offset-[5px]" style={{ textDecorationColor: "var(--acc)" }}>
                      {overview.label}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          </div>

          <div className="shrink-0 flex flex-wrap gap-2.5 xl:h-[150px]">
            <div className="flex-[1_1_360px] min-w-0 h-full flex flex-col gap-1.5 py-2.5 px-3.5 bg-surf cut-md overflow-hidden">
              <span className="label">{t("Actions du match")}</span>
              {feed.length === 0 && <span className="text-sm text-mut">{t("Phase de lane : la caméra suit le mid.")}</span>}
              <ol className="m-0 p-0 list-none flex flex-col gap-1">
                {feed.slice(0, 3).map((e, i) => {
                  const x = text(e);
                  return (
                    <li key={e.t + e.kind} className={(i === 0 ? "rise " : "") + "flex gap-3 py-1 px-2.5 cut-sm"} style={{ background: i === 0 && focus ? "color-mix(in srgb, var(--acc) 14%, var(--surf2))" : "var(--surf2)" }}>
                      <span className="basis-[46px] shrink-0 font-d font-bold text-sm text-mut">{mmss(e.t)}</span>
                      <span className="basis-1 shrink-0 self-stretch" style={{ background: colorOf(e.side) }} />
                      <span className="min-w-0 flex items-baseline gap-2">
                        <strong className="text-sm whitespace-nowrap">{x.title}</strong>
                        <span className="text-[12.5px] text-mut truncate">{x.detail}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="flex-[1_1_360px] min-w-0 h-full flex flex-col gap-1 py-2.5 px-3.5 bg-surf cut-md">
              <div className="flex justify-between items-baseline">
                <span className="label">{t("Écart d’or")}</span>
                <strong className="font-d text-lg" style={{ color: colorOf(diff >= 0 ? "a" : "b") }}>
                  {diff >= 0 ? side.a : side.b} +{Math.abs(Math.round(diff / 100) * 100).toLocaleString("fr-FR")}
                </strong>
              </div>
              <svg viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label={t("Écart d’or au fil de la partie")} className="w-full flex-1 min-h-[60px]">
                <line x1="0" y1="60" x2="600" y2="60" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="4 4" />
                <polyline points={goldPts} fill="none" stroke="var(--acc)" strokeWidth="3" strokeLinejoin="bevel" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          </div>
        </section>
        <Column s="b" />
      </div>
    </div>
  );
}

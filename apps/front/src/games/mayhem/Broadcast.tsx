import { useEffect, useState } from "react";
import { LITE_BY_ID, RIFT, squareImg, type MayhemEvent, type MayhemGame, type MayhemTournament } from "@loltr/content/lite";
import { useLang, useT } from "../../i18n";
import { CrestBadge, Head, Rift, entrantName, rosterOf } from "./util";

// Retransmission d'une partie simulée : la carte entière, la caméra zoomée sur le mid qui glisse vers
// chaque action. Le bandeau ne montre que les moments forts (multi-kills, combats, Baron, victoire).

/** La caméra reste environ 3,5 s (temps réel) sur chaque action, quelle que soit la vitesse. */
const HOLD_REAL_S = 3.5;
/** Secondes d'affichage du score avant le retour aux poules ou à l'arbre. */
const AUTO_RETURN_S = 5;
/** Vitesses proposées : secondes de jeu par dixième de seconde. */
const SPEEDS = [
  { label: "x1", rate: 2 },
  { label: "x2", rate: 4 },
  { label: "x4", rate: 8 }
];
const BLUE = "#3B82F6";
const RED = "#E5484D";
const mmss = (s: number) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MULTI = ["", "", "Double kill de {name}", "Triple kill de {name}", "Quadra kill de {name}", "Pentakill de {name}"];

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
  const [speed, setSpeed] = useState(SPEEDS[1].rate);
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

  useEffect(() => {
    if (paused || ended) return;
    const id = setInterval(() => setTime((v) => Math.min(game.duration, v + speed)), 100);
    return () => clearInterval(id);
  }, [paused, ended, speed, game.duration]);

  const ent = { a: tour.entrants[game.blue], b: tour.entrants[game.red] };
  const side = { a: entrantName(t, ent.a, names, myId), b: entrantName(t, ent.b, names, myId) };
  const roster = { a: rosterOf(ent.a.picks), b: rosterOf(ent.b.picks) };
  const player = (s: "a" | "b", i?: number) => (i === undefined ? "?" : (roster[s][i]?.name ?? "?"));
  const champ = (s: "a" | "b", i: number) => LITE_BY_ID[game.champs[s][i]]?.names[lang] ?? game.champs[s][i];
  const mySide: "a" | "b" | null = game.blue === mine ? "a" : game.red === mine ? "b" : null;
  const colorOf = (s: "a" | "b") => (s === mySide ? "var(--acc)" : s === "a" ? BLUE : RED);

  const past = game.events.filter((e) => e.t <= time);
  const last = past[past.length - 1];
  const focus = last && (time - last.t < HOLD_REAL_S * 10 * speed || ended) ? last : null;
  // Carte presque entière à l’écran : la caméra ne fait que se rapprocher un peu des actions
  const z = focus ? 1.2 : 1;
  const [cx, cy] = focus ? focus.at : [50, 50];
  const tx = clamp(50 - cx * z, 100 - 100 * z, 0);
  const ty = clamp(50 - cy * z, 100 - 100 * z, 0);
  const sum = (f: (e: MayhemEvent) => number) => past.reduce((n, e) => n + f(e), 0);
  const ka = sum((e) => e.ka);
  const kb = sum((e) => e.kb);
  const count = (kind: string, s: "a" | "b") => sum((e) => (e.kind === kind && e.side === s ? 1 : 0));
  let diff = 0;
  for (const [gt, d] of game.gold) if (gt <= time) diff = d;
  const base = 2500 + time * 24;
  const k = (v: number) => (v / 1000).toFixed(1).replace(".", ",") + "k";
  const prob = ended ? (game.winner === game.blue ? 100 : 0) : Math.round(clamp(50 + diff / 90, 12, 88));
  const myProb = mySide === "b" ? 100 - prob : prob;

  /** Moment fort à afficher dans le bandeau (sinon rien) : joueurs nommés, sans leurs champions. */
  const highlight = (e: MayhemEvent): { title: string; detail: string } | null => {
    const o = e.side === "a" ? "b" : "a";
    const team = side[e.side];
    const mineK = e.side === "a" ? e.ka : e.kb;
    const theirs = e.side === "a" ? e.kb : e.ka;
    if (e.kind === "nexus") return { title: t("Victoire de {team}", { team }), detail: t("Le Nexus tombe à {time}", { time: mmss(e.t) }) };
    if (e.kind === "firstblood") return { title: t("Premier sang"), detail: t("{killer} sur {victim}", { killer: player(e.side, e.killer), victim: player(o, e.victim) }) };
    if (e.dead[o].length === 5) return { title: t("Ace pour {team}", { team }), detail: t("Toute l’équipe adverse tombe, {a} pour {b}", { a: mineK, b: theirs }) };
    if (mineK >= 2 && e.killer !== undefined) return { title: t(MULTI[Math.min(5, mineK)], { name: player(e.side, e.killer) }), detail: t("{team} gagne le combat {a} pour {b}", { team, a: mineK, b: theirs }) };
    if (e.kind === "baron") return { title: t("Baron Nashor pour {team}", { team }), detail: mineK ? t("Combat gagné {a} pour {b}", { a: mineK, b: theirs }) : t("Le Baron tombe sans combat") };
    if (e.kind === "teamfight" && mineK >= 1) return { title: t("Combat d’équipe pour {team}", { team }), detail: t("{a} pour {b}", { a: mineK, b: theirs }) };
    return null;
  };
  const cap = focus ? highlight(focus) : null;

  const token = (s: "a" | "b", i: number) => {
    const inv = focus && focus.who[s].includes(i);
    const dead = !!focus && focus.dead[s].includes(i) && !ended;
    const ang = ((i * 72 + (s === "b" ? 36 : 0)) * Math.PI) / 180;
    const off = s === "a" ? -1.6 : 1.6;
    const [x, y] = inv ? [focus!.at[0] + off + Math.cos(ang) * 3, focus!.at[1] - off + Math.sin(ang) * 3] : RIFT.lanes[s][i];
    return { x, y, dead };
  };

  // Les deux équipes ont exactement la même présentation
  const Column = ({ s }: { s: "a" | "b" }) => (
    <section aria-label={side[s]} className="min-h-0 flex flex-col gap-1.5">
      <div className="flex items-center gap-3 h-16 px-3 cut-md" style={{ background: s === mySide ? "color-mix(in srgb, var(--acc) 16%, var(--surf))" : "var(--surf)", boxShadow: `inset 4px 0 0 ${s === "a" ? BLUE : RED}` }}>
        <CrestBadge entrant={ent[s]} names={names} myId={myId} className="basis-10 shrink-0 w-10 h-10 ml-1" />
        <span className="flex-auto min-w-0 flex flex-col">
          <strong className="font-d text-base truncate">{side[s]}</strong>
          <span className="text-xs text-mut">
            {s === "a" ? t("Côté bleu") : t("Côté rouge")} · {t("note {n}", { n: ent[s].rating })}
          </span>
        </span>
      </div>
      {roster[s].map((p, i) => {
        const tk = token(s, i);
        const c = LITE_BY_ID[game.champs[s][i]];
        return (
          <div key={i} className="flex items-center gap-2.5 h-14 pl-1.5 pr-3 bg-surf cut-sm" style={{ opacity: tk.dead ? 0.55 : 1 }}>
            <Head name={p?.name ?? ""} color={p?.team.color} dim={tk.dead} className="basis-11 shrink-0 w-11 h-11 cut-sm text-sm" />
            <span className="flex-auto min-w-0 flex flex-col">
              <strong className="text-[15px] truncate">{p?.name}</strong>
              <span className="flex items-center gap-1.5 text-xs text-mut truncate">
                {c && <img src={squareImg(c)} alt="" className="w-4 h-4" />}
                {champ(s, i)}
              </span>
            </span>
            <span className="basis-14 shrink-0 text-right font-d font-bold text-sm" style={{ color: tk.dead ? "var(--danger)" : "var(--ink)" }}>
              {ended ? game.kda[s][i].join("/") : tk.dead ? t("Mort") : ""}
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
          {SPEEDS.map((s) => (
            <button key={s.label} type="button" onClick={() => setSpeed(s.rate)} aria-pressed={speed === s.rate} className="w-14 h-11 border-0 cut-sm cursor-pointer font-d font-bold" style={{ background: speed === s.rate ? "var(--acc)" : "var(--surf2)", color: speed === s.rate ? "var(--on-acc)" : "var(--ink)" }}>
              {s.label}
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

      <div className="flex-1 min-h-0 grid gap-4 items-start grid-cols-1 xl:grid-cols-[minmax(230px,280px)_minmax(0,1fr)_minmax(230px,280px)]">
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

          <div className="flex-1 min-h-[240px] max-xl:h-[56vw] [container-type:size]">
            <div className="relative mx-auto aspect-square overflow-hidden cut-md" style={{ background: "#141A12", width: "min(100cqw, 100cqh)" }}>
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
              {cap && !ended && (
                <div key={focus!.t} className="rise absolute left-4 top-4 max-w-[min(62%,520px)] flex gap-3 py-2.5 pl-3 pr-4 cut-sm text-[#EEF0F3]" style={{ background: "rgba(15,17,21,.84)" }} aria-live="polite">
                  <span className="basis-1 shrink-0 self-stretch" style={{ background: colorOf(focus!.side) }} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold tracking-[0.08em] uppercase text-[#A9B0BC]">{mmss(focus!.t)}</span>
                    <strong className="font-d text-lg leading-tight">{cap.title}</strong>
                    <span className="text-[13px] text-[#C9CED6]">{cap.detail}</span>
                  </span>
                </div>
              )}
              <div className="absolute right-4 top-4 flex items-center gap-2 h-[34px] px-3 cut-sm font-d font-bold text-[15px] text-[#EEF0F3]" style={{ background: "rgba(15,17,21,.84)" }}>
                <span className={ended ? "" : "live"} style={{ width: 8, height: 8, background: ended ? "#A9B0BC" : "#FF6B6B" }} />
                {mmss(time)}
              </div>
              {ended && (
                <div className="rise absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-[#EEF0F3]" style={{ background: "rgba(15,17,21,.82)" }}>
                  <span className="font-d font-bold text-[clamp(32px,4.5vw,60px)] leading-none tracking-[0.04em] uppercase" style={{ color: game.winner === mine ? "var(--acc)" : "#EEF0F3" }}>
                    {game.winner === mine ? t("Victoire") : mySide ? t("Défaite") : t("Victoire de {team}", { team: game.winner === game.blue ? side.a : side.b })}
                  </span>
                  <span className="flex items-center gap-3 font-d font-bold text-lg">
                    <span className="truncate max-w-[220px]">{side.a}</span>
                    <span className="text-3xl" style={{ color: colorOf("a") }}>
                      {ka}
                    </span>
                    <span className="text-[#A9B0BC]">–</span>
                    <span className="text-3xl" style={{ color: colorOf("b") }}>
                      {kb}
                    </span>
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
        </section>
        <Column s="b" />
      </div>
    </div>
  );
}

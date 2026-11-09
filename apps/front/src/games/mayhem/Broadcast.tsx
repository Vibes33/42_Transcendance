import { useEffect, useMemo, useRef, useState } from "react";
import { LITE_BY_ID, MAYHEM_ROLES, RIFT, buildMovement, squareImg, type MayhemEvent, type MayhemGame, type MayhemTournament } from "@loltr/content/lite";
import { useLang, useT } from "../../i18n";
import { CrestBadge, Rift, RoleIcon, entrantName, entrantTag, rosterOf } from "./util";

// Retransmission d'une partie simulée, sur le modèle d'un visualiseur de replay : toute la carte avec
// les 10 joueurs (jetons ronds de leur champion, cerclés de la couleur de l'équipe), leurs traînées, les
// sbires, les tours et les minuteurs des objectifs ; en dessous la lecture, les vitesses et une
// chronologie (activité, objectifs, curseur déplaçable) ; à droite la liste des objectifs. Les
// positions sont approximatives : la partie est simulée. Le bandeau ne montre que les moments forts.

/** Un moment fort reste affiché environ 3,5 s (temps réel), quelle que soit la vitesse. */
const HOLD_REAL_S = 3.5;
/** Secondes d'affichage du score avant le retour aux poules ou à l'arbre. */
const AUTO_RETURN_S = 5;
/** Vitesses : secondes de partie par seconde réelle ; « auto » accélère les temps morts et ralentit les actions. */
const SPEEDS = ["auto", 1, 4, 8, 16, 32] as const;
type Speed = (typeof SPEEDS)[number];
// --- Rythme automatique : avance rapide quand il ne se passe rien, ralenti pendant les actions ---
/** Vitesse des temps morts. */
const FAST = 36;
/** Vitesse pendant une action sans élimination, selon son type. */
const PACE: Record<MayhemEvent["kind"], number> = { firstblood: 4, kill: 4.5, skirmish: 3.5, teamfight: 2.5, dragon: 5, herald: 6, baron: 3, tower: 9, inhib: 6, nexus: 2.5 };
/** Secondes de partie avant l'action où le ralenti commence (les joueurs convergent). */
const BEFORE: Record<MayhemEvent["kind"], number> = { firstblood: 9, kill: 8, skirmish: 12, teamfight: 20, dragon: 14, herald: 10, baron: 20, tower: 6, inhib: 8, nexus: 14 };
/** Secondes de partie gardées au ralenti après l'action, puis rampe vers l'avance rapide. */
const AFTER = 5;
const RAMP = 8;
/** Une action est un vrai combat (zone, caméra) à partir de ce poids. */
const BIG = 3;
const killsOf = (e: MayhemEvent) => e.ks?.length ?? e.ka + e.kb;
/** Importance d'une action : éliminations, puis objectifs et combats d'équipe. */
const weightOf = (e: MayhemEvent) => killsOf(e) + (e.kind === "baron" || e.kind === "nexus" ? 3 : e.kind === "teamfight" ? 2 : e.kind === "dragon" || e.kind === "herald" ? 1 : 0);
const slowOf = (e: MayhemEvent) => {
  const k = killsOf(e);
  return Math.min(PACE[e.kind], k >= 4 ? 2 : k >= 2 ? 3 : k === 1 ? 4.5 : PACE[e.kind]);
};
const BLUE = "#3B82F6";
const RED = "#E5484D";
/** Traînée : secondes de trajet gardées derrière chaque joueur. */
const TRAIL_S = 45;
/** Largeur d'une colonne de la chronologie (secondes) : l'histogramme d'activité. */
const BIN_S = 20;
const mmss = (s: number) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MULTI = ["", "", "Double kill de {name}", "Triple kill de {name}", "Quadra kill de {name}", "Pentakill de {name}"];
const OBJECTIVE = { dragon: { label: "Dragon", color: "#FFB25B", glyph: "D" }, herald: { label: "Héraut de la Faille", color: "#5EE0D0", glyph: "H" }, baron: { label: "Baron Nashor", color: "#B58CFF", glyph: "B" } } as const;

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
  const [speed, setSpeed] = useState<Speed>("auto");
  const [paused, setPaused] = useState(false);
  const [trails, setTrails] = useState(true);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  // Caméra automatique : elle se rapproche des gros combats ; un zoom à la main la coupe
  const [camAuto, setCamAuto] = useState(true);
  const [full, setFull] = useState(false);
  const ended = time >= game.duration;
  const [left, setLeft] = useState(AUTO_RETURN_S);
  const mapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

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

  // Rythme automatique, seconde par seconde : chaque action ralentit le temps autour d'elle, avec
  // une rampe (log) pour que l'accélération et le ralenti se sentent sans à-coup
  const pace = useMemo(() => {
    const n = Math.ceil(game.duration) + 2;
    const out = new Array<number>(n).fill(FAST);
    for (const e of game.events) {
      const slow = slowOf(e);
      const a = e.t - BEFORE[e.kind];
      const b = e.t + AFTER;
      for (let s = Math.max(0, Math.floor(a - RAMP)); s <= Math.min(n - 1, Math.ceil(b + RAMP)); s++) {
        const d = Math.min(1, s < a ? (a - s) / RAMP : s > b ? (s - b) / RAMP : 0);
        const v = Math.exp(Math.log(slow) + (Math.log(FAST) - Math.log(slow)) * d);
        if (v < out[s]) out[s] = v;
      }
    }
    return out;
  }, [game]);
  const paceAt = (at: number) => {
    const i = clamp(Math.floor(at), 0, pace.length - 2);
    return pace[i] + (pace[i + 1] - pace[i]) * clamp(at - i, 0, 1);
  };
  const rate = speed === "auto" ? paceAt(time) : speed;

  useEffect(() => {
    if (paused || ended) return;
    // 20 images par seconde : les joueurs glissent d'une position à l'autre
    const id = setInterval(() => setTime((v) => Math.min(game.duration, v + (speed === "auto" ? paceAt(v) : speed) * 0.05)), 50);
    return () => clearInterval(id);
  }, [paused, ended, speed, pace, game.duration]);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === mapRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const ent = { a: tour.entrants[game.blue], b: tour.entrants[game.red] };
  const side = { a: entrantName(t, ent.a, names, myId), b: entrantName(t, ent.b, names, myId) };
  const roster = { a: rosterOf(ent.a.picks), b: rosterOf(ent.b.picks) };
  const player = (s: "a" | "b", i?: number) => (i === undefined ? "?" : (roster[s][i]?.name ?? "?"));
  const champ = (s: "a" | "b", i: number) => LITE_BY_ID[game.champs[s][i]]?.names[lang] ?? game.champs[s][i];
  const mySide: "a" | "b" | null = game.blue === mine ? "a" : game.red === mine ? "b" : null;
  const colorOf = (s: "a" | "b") => (s === mySide ? "var(--acc)" : s === "a" ? BLUE : RED);

  // Déplacements de la partie, calculés une fois (ils ne dépendent que de la partie)
  const mv = useMemo(() => buildMovement(game), [game]);
  const actors = mv.actors(time);
  const live = mv.kda(time);
  const objectives = mv.objectives(time);
  const timers = mv.timers(time);
  const past = game.events.filter((e) => e.t <= time);
  const last = past[past.length - 1];
  // En avance rapide, le moment fort ne reste pas affiché plus de 20 s de partie
  const focus = last && (time - last.t < Math.min(20, HOLD_REAL_S * rate) || ended) ? last : null;

  // Action en cours : la plus importante dont la fenêtre (approche, action, suite) contient l'instant
  let action: MayhemEvent | null = null;
  for (const e of game.events) if (time >= e.t - BEFORE[e.kind] && time <= e.t + AFTER && (!action || weightOf(e) > weightOf(action))) action = e;
  const fight = action && weightOf(action) >= BIG && !ended ? action : null;
  // Caméra : centrée sur un gros combat (approche comprise), sinon toute la carte
  const CAM_K = 1.7;
  const cam = !camAuto ? view : fight ? { k: CAM_K, x: clamp(50 - fight.at[0] * CAM_K, 100 - 100 * CAM_K, 0), y: clamp(50 - fight.at[1] * CAM_K, 100 - 100 * CAM_K, 0) } : { k: 1, x: 0, y: 0 };
  const inv = (1 / cam.k).toFixed(3);

  // Effets des actions récentes (secondes de partie) : éliminations, objectifs, tours, flash
  const effects = useMemo(() => {
    const kills: { key: string; x: number; y: number; color: string; delay: number }[] = [];
    const bursts: { key: string; x: number; y: number; color: string; size: number; label?: string }[] = [];
    let flash: string | null = null;
    for (const [n, e] of game.events.entries()) {
      if (time < e.t || time > e.t + 7) continue;
      if (e.ks?.length) {
        const at = mv.actors(Math.max(0, e.t - 0.5));
        e.ks.forEach(([s, , victim], j) => {
          const v = at[s === "a" ? "b" : "a"][victim];
          kills.push({ key: `${n}-${j}`, x: v.x, y: v.y, color: s === "a" ? BLUE : RED, delay: j * 160 });
        });
      }
      const team = e.side === "a" ? BLUE : RED;
      if (e.kind === "dragon" || e.kind === "herald" || e.kind === "baron") bursts.push({ key: `o${n}`, x: e.at[0], y: e.at[1], color: OBJECTIVE[e.kind].color, size: e.kind === "baron" ? 22 : 16, label: OBJECTIVE[e.kind].label });
      if (e.kind === "tower" || e.kind === "inhib") bursts.push({ key: `t${n}`, x: e.at[0], y: e.at[1], color: team, size: e.kind === "inhib" ? 12 : 9 });
      if (e.kind === "nexus") bursts.push({ key: `n${n}`, x: e.at[0], y: e.at[1], color: team, size: 34 });
      const opp = e.side === "a" ? "b" : "a";
      if (time <= e.t + 1.5 && (e.kind === "baron" || e.kind === "nexus" || e.dead[opp].length === 5)) flash = `${n}`;
    }
    return { kills, bursts, flash };
  }, [game, mv, Math.floor(time * 4)]);

  // Fil des éliminations : les plus récentes, tueur → victime
  const feed = useMemo(() => {
    const rows: { key: string; s: "a" | "b"; killer: number; victim: number }[] = [];
    for (const [n, e] of game.events.entries()) if (e.t <= time && time - e.t < 14) e.ks?.forEach(([s, killer, victim], j) => rows.push({ key: `${n}-${j}`, s, killer, victim }));
    return rows.slice(-5);
  }, [game, Math.floor(time * 4)]);
  const sum = (f: (e: MayhemEvent) => number) => past.reduce((n, e) => n + f(e), 0);
  const ka = sum((e) => e.ka);
  const kb = sum((e) => e.kb);
  const count = (kind: string, s: "a" | "b") => sum((e) => (e.kind === kind && e.side === s ? 1 : 0));
  let diff = 0;
  for (const [gt, d] of game.gold) if (gt <= time) diff = d;
  const base = 2500 + time * 24;
  const k = (v: number) => (v / 1000).toFixed(1).replace(".", ",") + "k";

  // Chronologie : activité (combats) par tranche de 20 s et repères d'objectifs
  const timeline = useMemo(() => {
    const bins = new Array(Math.ceil(game.duration / BIN_S)).fill(0);
    for (const e of game.events) bins[Math.min(bins.length - 1, Math.floor(e.t / BIN_S))] += (e.ks?.length ?? e.ka + e.kb) * 2 + (e.kind === "teamfight" ? 2 : e.kind === "skirmish" ? 1 : 0);
    const max = Math.max(1, ...bins);
    return { bins: bins.map((v: number) => v / max), objectives: game.events.filter((e) => e.kind === "dragon" || e.kind === "herald" || e.kind === "baron") };
  }, [game]);
  const objectiveEvents = timeline.objectives as (MayhemEvent & { kind: "dragon" | "herald" | "baron" })[];

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

  // --- Carte : zoom, déplacement, plein écran ---
  // Un zoom ou un glissement à la main reprend la main sur la caméra, à partir de ce qu'elle montre
  const zoomTo = (f: number) => {
    const v = cam;
    const nk = clamp(v.k * f, 1, 4);
    setCamAuto(false);
    // Le centre de la vue reste en place
    setView({ k: nk, x: clamp(50 - ((50 - v.x) * nk) / v.k, 100 - 100 * nk, 0), y: clamp(50 - ((50 - v.y) * nk) / v.k, 100 - 100 * nk, 0) });
  };
  const onDown = (ev: React.PointerEvent) => {
    if (cam.k === 1) return;
    if (camAuto) {
      setCamAuto(false);
      setView(cam);
    }
    drag.current = { x: ev.clientX, y: ev.clientY, vx: cam.x, vy: cam.y };
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  };
  const onMove = (ev: React.PointerEvent) => {
    const d = drag.current;
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    if (!d || !box.width) return;
    setView((v) => ({ ...v, x: clamp(d.vx + ((ev.clientX - d.x) / box.width) * 100, 100 - 100 * v.k, 0), y: clamp(d.vy + ((ev.clientY - d.y) / box.height) * 100, 100 - 100 * v.k, 0) }));
  };
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : mapRef.current?.requestFullscreen?.());

  // --- Chronologie : un clic ou un glissement place le curseur ---
  const seekFrom = (ev: React.PointerEvent) => {
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    setTime(clamp(((ev.clientX - box.left) / box.width) * game.duration, 0, game.duration));
  };

  const Ring = ({ s, i, size, dim }: { s: "a" | "b"; i: number; size: number | string; dim?: boolean }) => {
    const c = LITE_BY_ID[game.champs[s][i]];
    return (
      <span className="block shrink-0 rounded-full overflow-hidden box-border bg-surf2" style={{ width: size, aspectRatio: "1", border: `3px solid ${s === "a" ? BLUE : RED}`, filter: dim ? "grayscale(1)" : "none" }}>
        {c && <img src={squareImg(c)} alt="" draggable={false} className="block w-full h-full object-cover" />}
      </span>
    );
  };

  // Les deux équipes ont exactement la même présentation
  const Column = ({ s }: { s: "a" | "b" }) => (
    <section aria-label={side[s]} className="min-h-0 flex flex-col gap-1">
      <div className="flex items-center gap-2.5 h-10 px-3 cut-sm text-white" style={{ background: s === "a" ? BLUE : RED, boxShadow: s === mySide ? "0 0 0 2px var(--acc)" : "none" }}>
        <CrestBadge entrant={ent[s]} names={names} myId={myId} className="basis-7 shrink-0 w-7 h-7" />
        <span className="flex-auto min-w-0 flex flex-col leading-tight">
          <strong className="font-d text-[15px] truncate">{side[s]}</strong>
          <span className="text-[11.5px] opacity-85">
            {s === "a" ? t("Côté bleu") : t("Côté rouge")} · {t("note {n}", { n: ent[s].rating })}
          </span>
        </span>
      </div>
      {roster[s].map((p, i) => {
        const a = actors[s][i];
        return (
          <div key={i} className="flex items-center gap-2.5 h-[46px] pl-1.5 pr-2.5 bg-surf cut-sm" style={{ opacity: a.dead ? 0.55 : 1 }}>
            <Ring s={s} i={i} size={36} dim={a.dead} />
            <span className="flex-auto min-w-0 flex flex-col leading-tight">
              <strong className="text-sm truncate">{p?.name}</strong>
              <span className="text-xs text-mut truncate">{champ(s, i)}</span>
            </span>
            <span className="shrink-0 flex flex-col items-end leading-tight">
              <span className="font-d font-bold text-[13px]" style={{ color: a.dead ? "var(--danger)" : "var(--ink)" }}>
                {(ended ? game.kda[s][i] : live?.[s][i])?.join("/") ?? ""}
              </span>
              <span className="text-[10.5px] font-semibold text-mut">{!ended && a.dead ? t("Mort") : !ended && a.recall ? t("Retour en base") : ""}</span>
            </span>
            <RoleIcon role={MAYHEM_ROLES[i]} size={18} className="shrink-0 text-mut" />
          </div>
        );
      })}
    </section>
  );

  const objectiveTokens = [
    { key: "dragon", at: RIFT.dragon, o: OBJECTIVE.dragon, up: objectives.dragon, timer: timers.dragon },
    time < 1140 && (objectives.herald || timers.herald !== null)
      ? { key: "herald", at: RIFT.baron, o: OBJECTIVE.herald, up: objectives.herald, timer: timers.herald }
      : { key: "baron", at: RIFT.baron, o: OBJECTIVE.baron, up: objectives.baron, timer: timers.baron }
  ].filter((x) => x.up || x.timer !== null);

  const tl = clamp(time / game.duration, 0, 1) * 100;
  const trail = trails ? mv.trails(time, TRAIL_S, 3) : null;

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
        <button type="button" className="tl min-h-11 text-[15px]" onClick={() => setTime(game.duration)}>
          {t("Passer la partie")}
        </button>
      </div>

      <div className="flex-1 min-h-0 grid gap-4 items-start grid-cols-1 xl:grid-cols-[minmax(230px,270px)_minmax(0,1fr)_minmax(220px,270px)]">
        <div className="flex flex-col gap-2 max-xl:order-2">
          <Column s="a" />
          <Column s="b" />
        </div>

        <section aria-label={t("Match en direct")} className="min-w-0 xl:h-full min-h-0 flex flex-col gap-2.5 max-xl:order-1">
          <div className="shrink-0 flex flex-wrap items-center gap-x-5 gap-y-1 py-1.5 px-3.5 bg-surf cut-sm">
            <span className="flex items-center gap-2.5">
              <span className="font-d font-bold text-[28px] leading-none" style={{ color: colorOf("a") }}>
                {ka}
              </span>
              <span className="label !text-[11px]">{t("Kills")}</span>
              <span className="font-d font-bold text-[28px] leading-none" style={{ color: colorOf("b") }}>
                {kb}
              </span>
            </span>
            {[
              [t("Or"), k(base + diff / 2), k(base - diff / 2)],
              [t("Tours"), count("tower", "a"), count("tower", "b")],
              [t("Dragons"), count("dragon", "a"), count("dragon", "b")],
              [t("Barons"), count("baron", "a"), count("baron", "b")]
            ].map(([l, a, b]) => (
              <span key={String(l)} className="flex items-baseline gap-1.5">
                <span className="label !text-[11px]">{l}</span>
                <span className="font-d font-bold text-sm">
                  <span style={{ color: colorOf("a") }}>{a}</span> <span className="text-mut">·</span> <span style={{ color: colorOf("b") }}>{b}</span>
                </span>
              </span>
            ))}
          </div>

          <div className="flex-1 min-h-[240px] max-xl:h-[62vw] [container-type:size]">
            <div ref={mapRef} className="relative mx-auto aspect-square overflow-hidden cut-md touch-none" style={{ background: "#141A12", width: "min(100cqw, 100cqh)", cursor: cam.k > 1 ? "grab" : "default" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
              <div className="absolute left-0 top-0 w-full aspect-square" style={{ transformOrigin: "0 0", transform: `translate(${cam.x}%, ${cam.y}%) scale(${cam.k})`, transition: camAuto ? "transform 1.1s cubic-bezier(.25,.7,.2,1)" : "none" }}>
                <Rift down={mv.towersDown(time)} objectives={objectives} minions={mv.minions(time)}>
                  {trail && (
                    <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none">
                      {(["a", "b"] as const).flatMap((s) => trail[s].map((pts, i) => (pts.length > 1 ? <polyline key={s + i} points={pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")} fill="none" stroke={s === "a" ? BLUE : RED} strokeWidth="0.55" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" /> : null)))}
                    </svg>
                  )}
                  {/* Zone de combat : les joueurs y convergent pendant l'approche */}
                  {fight && time <= fight.t + 1.5 && (
                    <span key={"z" + fight.t} className="absolute pointer-events-none" style={{ left: fight.at[0] + "%", top: fight.at[1] + "%", width: (fight.kind === "teamfight" || fight.kind === "baron" ? 15 : 11) + "%", aspectRatio: "1", transform: "translate(-50%, -50%)" }}>
                      <span className="mm-zone block w-full h-full rounded-full box-border" style={{ border: "2px dashed rgba(255,255,255,.75)", background: `radial-gradient(circle, ${fight.side === "a" ? BLUE : RED}33, transparent 70%)` }} />
                    </span>
                  )}
                  {effects.bursts.map((b) => (
                    <span key={b.key} className="absolute pointer-events-none flex items-center justify-center" style={{ left: b.x + "%", top: b.y + "%", width: b.size + "%", aspectRatio: "1", transform: "translate(-50%, -50%)", zIndex: 3 }}>
                      <span className="mm-burst absolute inset-0 rounded-full box-border" style={{ border: `3px solid ${b.color}`, boxShadow: `0 0 18px ${b.color}, inset 0 0 18px ${b.color}` }} />
                      {b.label && (
                        <span className="mm-float relative whitespace-nowrap font-d font-bold text-[13px] tracking-[0.08em] uppercase [text-shadow:0_0_4px_#000,0_0_4px_#000]" style={{ color: b.color, transform: `scale(${inv})` }}>
                          {t(b.label)}
                        </span>
                      )}
                    </span>
                  ))}
                  {effects.kills.map((k) => (
                    <span key={k.key} className="absolute pointer-events-none" style={{ left: k.x + "%", top: k.y + "%", width: "3.6%", aspectRatio: "1", transform: `translate(-50%, -50%) scale(${inv})`, zIndex: 4 }}>
                      <span className="mm-burst absolute -inset-[60%] rounded-full box-border" style={{ border: `2px solid ${k.color}`, animationDelay: k.delay + "ms" }} />
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="mm-kill block w-full h-full" style={{ animationDelay: k.delay + "ms" }}>
                        <circle cx="12" cy="12" r="10.5" fill="rgba(15,17,21,.88)" stroke={k.color} strokeWidth="2.4" />
                        <path d="M8 8l8 8M16 8l-8 8" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" />
                      </svg>
                    </span>
                  ))}
                  {objectiveTokens.map((x) => (
                    <span key={x.key} className="absolute flex flex-col items-center" style={{ left: x.at[0] + "%", top: x.at[1] + "%", width: "5%", transform: `translate(-50%, -50%) scale(${inv})` }} title={t(x.o.label)}>
                      <span className="block w-full aspect-square rounded-full flex items-center justify-center font-d font-bold text-[13px]" style={{ background: "#14100C", border: `2px ${x.up ? "solid" : "dashed"} ${x.o.color}`, color: x.o.color, opacity: x.up ? 1 : 0.85 }}>
                        {x.o.glyph}
                      </span>
                      {x.timer !== null && <span className="mt-0.5 font-d font-bold text-[11px] text-white [text-shadow:0_0_3px_#000,0_0_3px_#000]">{mmss(x.timer)}</span>}
                    </span>
                  ))}
                  {(["a", "b"] as const).flatMap((s) =>
                    roster[s].map((p, i) => {
                      const a = actors[s][i];
                      return (
                        <span
                          key={s + i}
                          className="absolute block"
                          title={`${p?.name} · ${champ(s, i)}`}
                          style={{ left: a.x + "%", top: a.y + "%", width: "5.2%", opacity: a.dead ? 0.35 : 1, transform: `translate(-50%, -50%) scale(${inv})`, transition: "left .06s linear, top .06s linear, opacity .3s ease", filter: a.recall ? "drop-shadow(0 0 5px #fff)" : "none", zIndex: 2 }}
                        >
                          <Ring s={s} i={i} size="100%" dim={a.dead} />
                        </span>
                      );
                    })
                  )}
                </Rift>
              </div>

              {/* Ralenti : bords assombris pendant une grosse action ; flash sur un ace, le Baron, le Nexus */}
              <span className="absolute inset-0 z-[5] pointer-events-none" style={{ boxShadow: "inset 0 0 90px 10px rgba(0,0,0,.75)", opacity: !ended && rate <= 3.2 ? 1 : 0, transition: "opacity .6s ease" }} />
              {effects.flash && !ended && <span key={"f" + effects.flash} className="mm-flash absolute inset-0 z-[6] pointer-events-none bg-white" />}
              {!ended && feed.length > 0 && (
                <ol aria-label={t("Éliminations")} className="absolute right-3 bottom-3 z-10 m-0 p-0 list-none flex flex-col items-end gap-1">
                  {feed.map((f) => (
                    <li key={f.key} className="mm-feed flex items-center gap-1.5 h-8 pl-1 pr-1.5 cut-sm" style={{ background: "rgba(15,17,21,.86)", borderLeft: `3px solid ${f.s === "a" ? BLUE : RED}` }} title={`${player(f.s, f.killer)} → ${player(f.s === "a" ? "b" : "a", f.victim)}`}>
                      <Ring s={f.s} i={f.killer} size={24} />
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EEF0F3" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                        <path d="M5 5l14 14M19 5L5 19" />
                      </svg>
                      <Ring s={f.s === "a" ? "b" : "a"} i={f.victim} size={24} dim />
                    </li>
                  ))}
                </ol>
              )}
              <span className="absolute left-3 bottom-2 z-10 text-[11px] text-[#C9CED6] [text-shadow:0_0_3px_#000]">{t("Positions approximatives : la partie est simulée.")}</span>
              <div className="absolute right-3 top-3 flex flex-col gap-1.5 z-10">
                {[
                  { label: t("Zoom avant"), on: () => zoomTo(1.5), path: "M12 5v14M5 12h14" },
                  { label: t("Zoom arrière"), on: () => zoomTo(1 / 1.5), path: "M5 12h14" },
                  { label: t("Ajuster la carte"), on: () => { setCamAuto(false); setView({ k: 1, x: 0, y: 0 }); }, path: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" },
                  { label: full ? t("Quitter le plein écran") : t("Plein écran"), on: toggleFull, path: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" }
                ].map((b, i) => (
                  <button key={i} type="button" aria-label={b.label} title={b.label} onPointerDown={(e) => e.stopPropagation()} onClick={b.on} className="w-9 h-9 flex items-center justify-center border-0 cut-sm cursor-pointer text-[#EEF0F3] bg-[rgba(15,17,21,.84)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={b.path} />
                    </svg>
                  </button>
                ))}
              </div>

              {cap && !ended && (
                <div key={focus!.t} className="mm-banner absolute left-3 top-3 z-10 max-w-[min(58%,480px)] flex gap-3 py-2.5 pl-3 pr-4 cut-sm text-[#EEF0F3]" style={{ background: "rgba(15,17,21,.84)" }} aria-live="polite">
                  <span className="basis-1 shrink-0 self-stretch" style={{ background: colorOf(focus!.side) }} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold tracking-[0.08em] uppercase text-[#A9B0BC]">{mmss(focus!.t)}</span>
                    <strong className="font-d text-lg leading-tight">{cap.title}</strong>
                    <span className="text-[13px] text-[#C9CED6]">{cap.detail}</span>
                  </span>
                </div>
              )}
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

          <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={() => (ended ? setTime(0) : setPaused(!paused))} aria-label={ended ? t("Revoir la partie") : paused ? t("Reprendre") : t("Pause")} className="w-12 h-12 shrink-0 rounded-full border-0 bg-acc text-on-acc cursor-pointer flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d={ended ? "M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" : paused ? "M8 5v14l11-7z" : "M7 5h4v14H7zM13 5h4v14h-4z"} />
              </svg>
            </button>
            <span className="font-d font-bold text-[28px] leading-none">
              {mmss(time)} <span className="text-base text-mut">/ {mmss(game.duration)}</span>
            </span>
            {!ended && speed === "auto" && (
              <span className="flex items-center gap-1.5 w-[150px] h-8 px-3 cut-sm font-d font-bold text-xs tracking-[0.08em] uppercase" style={{ background: rate <= 6 ? "color-mix(in srgb, var(--danger) 16%, var(--surf))" : "var(--surf)", color: rate <= 6 ? "var(--danger)" : "var(--ink)" }} aria-hidden="true">
                {rate <= 6 ? (
                  <>
                    <span className="live" style={{ width: 7, height: 7, background: "var(--danger)" }} />
                    {t("Ralenti")}
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4 6v12l8-6zM12 6v12l8-6z" />
                    </svg>
                    {t("Avance rapide")}
                  </>
                )}
                <span className="ml-auto text-mut">×{Math.round(rate)}</span>
              </span>
            )}
            <div role="radiogroup" aria-label={t("Vitesse")} className="flex">
              {SPEEDS.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)} title={s === "auto" ? t("Accélère les temps morts, ralentit les actions") : undefined} className="min-w-12 h-11 px-2.5 border-0 cut-sm cursor-pointer font-d font-bold" style={{ background: speed === s ? "var(--acc)" : "var(--surf2)", color: speed === s ? "var(--on-acc)" : "var(--ink)" }}>
                  {s === "auto" ? t("Auto") : `${s}×`}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 min-h-11 px-3 bg-surf2 cut-sm cursor-pointer font-bold text-sm">
              <input type="checkbox" checked={trails} onChange={(e) => setTrails(e.target.checked)} className="w-4 h-4" style={{ accentColor: "var(--acc)" }} />
              {t("Traînées")}
            </label>
            <label className="flex items-center gap-2 min-h-11 px-3 bg-surf2 cut-sm cursor-pointer font-bold text-sm">
              <input type="checkbox" checked={camAuto} onChange={(e) => setCamAuto(e.target.checked)} className="w-4 h-4" style={{ accentColor: "var(--acc)" }} />
              {t("Caméra auto")}
            </label>
          </div>

          <div className="shrink-0 relative">
            <div role="slider" tabIndex={0} aria-label={t("Chronologie de la partie")} aria-valuemin={0} aria-valuemax={Math.round(game.duration)} aria-valuenow={Math.round(time)} aria-valuetext={mmss(time)} className="relative h-12 bg-surf2 cut-sm cursor-pointer touch-none select-none" onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekFrom(e); }} onPointerMove={(e) => e.buttons === 1 && seekFrom(e)} onKeyDown={(e) => { if (e.key === "ArrowRight") setTime((v) => Math.min(game.duration, v + 10)); if (e.key === "ArrowLeft") setTime((v) => Math.max(0, v - 10)); }}>
              <div className="absolute inset-x-0 bottom-0 top-3 flex items-end gap-px px-px">
                {timeline.bins.map((v: number, i: number) => (
                  <span key={i} className="flex-1" style={{ height: Math.max(8, v * 100) + "%", background: i * BIN_S <= time ? "var(--mut)" : "var(--line)", opacity: 0.75 }} />
                ))}
              </div>
              {objectiveEvents.map((e) => (
                <span key={e.t} className="absolute top-0.5 w-2.5 h-2.5 rotate-45" style={{ left: `calc(${(e.t / game.duration) * 100}% - 5px)`, background: e.t <= time ? (e.side === "a" ? BLUE : RED) : "var(--mut)", boxShadow: "0 0 0 1.5px var(--surf)" }} title={`${t(OBJECTIVE[e.kind].label)} · ${mmss(e.t)}`} />
              ))}
              <span className="absolute top-0 bottom-0 w-0.5 bg-ink pointer-events-none" style={{ left: `calc(${tl}% - 1px)` }} />
              <span className="absolute -top-1 w-3 h-3 rounded-full bg-ink pointer-events-none" style={{ left: `calc(${tl}% - 6px)` }} />
            </div>
            <div className="relative h-4 text-[11px] text-mut" aria-hidden="true">
              {Array.from({ length: Math.floor(game.duration / 300) }, (_, i) => (i + 1) * 300).map((s) => (
                <span key={s} className="absolute top-0.5 -translate-x-1/2" style={{ left: (s / game.duration) * 100 + "%" }}>
                  {mmss(s)}
                </span>
              ))}
            </div>
          </div>
        </section>

        <aside aria-label={t("Objectifs")} className="flex flex-col gap-2 max-xl:order-3">
          <span className="label">{t("Objectifs")}</span>
          {objectiveEvents.length === 0 && <span className="text-sm text-mut">{t("Aucun objectif neutre dans cette partie.")}</span>}
          {objectiveEvents.map((e) => {
            const done = e.t <= time;
            const o = OBJECTIVE[e.kind];
            return (
              <div key={e.t} className="flex items-center gap-2.5 h-11 pl-2 pr-1.5 bg-surf cut-sm">
                <span className="basis-7 shrink-0 h-7 rounded-full flex items-center justify-center font-d font-bold text-xs" style={{ background: "#14100C", border: `2px solid ${o.color}`, color: o.color }}>
                  {o.glyph}
                </span>
                <span className="flex-auto min-w-0 flex flex-col leading-tight">
                  <strong className="text-[13.5px] truncate">{t(o.label)}</strong>
                  <span className="font-d font-bold text-xs text-mut">{mmss(e.t)}</span>
                </span>
                <span className="px-2 h-6 flex items-center cut-sm font-d font-bold text-xs text-white" style={{ background: done ? (e.side === "a" ? BLUE : RED) : "var(--line)", color: done ? "#FFFFFF" : "var(--mut)" }}>
                  {done ? entrantTag(ent[e.side], names) : "?"}
                </span>
                <button type="button" aria-label={t("Aller à {time}", { time: mmss(Math.max(0, e.t - 15)) })} title={t("Aller à {time}", { time: mmss(Math.max(0, e.t - 15)) })} onClick={() => { setTime(Math.max(0, e.t - 15)); setPaused(false); }} className="w-9 h-9 border-0 bg-surf2 text-ink cut-sm cursor-pointer flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

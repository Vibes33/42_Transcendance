import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LITE_CHAMPIONS, squareImg } from "@loltr/content/lite";
import { suggest, type GameKey, type LiveMember } from "@loltr/shared";
import { useT } from "../i18n";
import { avatarOf } from "../lib/chibi";
import { GAME_TITLE } from "../lib/games";
import { clock } from "../lib/time";
import { useMe } from "../state/app";
import { Back } from "./icons";

// Briques communes à tous les jeux (contrat de jeu) : barre du haut, saisie avec autocomplétion,
// chrono, classement en direct du groupe et fenêtre de fin de manche.

/** Déroulement de la partie, fourni par la page Partie à chaque jeu. */
export interface GameFlow {
  ctx: "defi" | "classique" | "streamer";
  multi: boolean;
  /** Rang du jeu dans le défi (1 à 4). */
  rank: number;
  total: number;
  nextLabel: string;
  onNext: () => void;
  onQuit: () => void;
  /** En groupe : joueurs qui n'ont pas fini (fenêtre de fin). */
  waiting: { name: string; art: string; text: string }[];
  /** En groupe : le récapitulatif arrive tout seul. */
  autoRecap: boolean;
  /** Proposer le tutoriel du jeu (fin de partie en groupe). */
  onTutorial?: () => void;
  /** Démonstration du tutoriel : manche d'exemple, chrono figé, aucune action envoyée. */
  demo?: boolean;
  /** Mode streamer : carte de résultat. */
  extra?: ReactNode;
  side: ReactNode;
}

export function modeSub(t: ReturnType<typeof useT>, flow: GameFlow, groupSize: number) {
  const who = flow.ctx === "streamer" ? t("Stream") : flow.multi ? t("Groupe de {n}", { n: groupSize }) : t("Solo");
  const what = flow.ctx === "classique" ? t("classique, sans points") : flow.ctx === "streamer" ? t("avec le chat, sans points classés") : t("défi du jour, jeu {r} sur {n}", { r: flow.rank, n: flow.total });
  return who + " · " + what;
}

export function GameBar({ game, sub, counterLabel, counter, onQuit }: { game: GameKey; sub?: string; counterLabel: string; counter: ReactNode; onQuit: () => void }) {
  const t = useT();
  const [a, b] = GAME_TITLE[game];
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5 pt-3.5 gutter">
      <button type="button" onClick={onQuit} className="inline-flex items-center gap-2 min-h-11 text-mut font-semibold text-[15px] p-0 border-0 bg-transparent cursor-pointer">
        <Back />
        {t("Quitter la partie")}
      </button>
      <div className="flex items-baseline gap-3 flex-wrap justify-center">
        <span className="font-d font-bold text-[22px] tracking-[0.04em] uppercase">
          {t(a)}
          {game === "meli" ? "" : " "}
          <span className="text-acc">{t(b)}</span>
        </span>
        {sub && <span className="text-sm text-mut">{sub}</span>}
      </div>
      <div className="flex items-center gap-2 h-11 px-4 bg-surf cut-sm" data-tuto={`${game}-counter`}>
        <span className="label">{counterLabel}</span>
        <span className="font-d font-bold text-xl text-acc">{counter}</span>
      </div>
    </div>
  );
}

export interface ChampOption {
  id: string;
  label: string;
  names: string[];
  art: string;
}

export function useChampionOptions(lang: "fr" | "en", filter?: (id: string) => boolean): ChampOption[] {
  return useMemo(
    () => LITE_CHAMPIONS.filter((c) => !filter || filter(c.id)).map((c) => ({ id: c.id, label: c.names[lang], names: c.matchNames, art: squareImg(c) })),
    [lang, filter]
  );
}

/** Saisie d'un champion : autocomplétion dans la langue active, réponse acceptée dans toutes les langues. */
export function AnswerInput({
  options,
  exclude,
  onAnswer,
  disabled,
  placeholder,
  listAbove = false,
  withArt = true,
  shake = false,
  edge,
  children,
  width,
  tuto
}: {
  options: ChampOption[];
  exclude?: Set<string>;
  onAnswer: (a: { champion?: string; text?: string }) => void;
  disabled?: boolean;
  placeholder: string;
  listAbove?: boolean;
  withArt?: boolean;
  shake?: boolean;
  edge?: string;
  children?: ReactNode;
  width?: string;
  /** Repère du tutoriel (data-tuto). */
  tuto?: string;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  // La saisie reprend le focus dès qu'elle redevient active (fin du flou de départ, réponse validée)
  useEffect(() => {
    if (!disabled) input.current?.focus();
  }, [disabled]);
  const sugg = useMemo(() => suggest(q, exclude ? options.filter((o) => !exclude.has(o.id)) : options, 6), [q, options, exclude]);
  const submit = (id?: string) => {
    const pick = id ?? sugg[sel]?.id ?? sugg[0]?.id;
    if (pick) onAnswer({ champion: pick });
    else if (q.trim()) onAnswer({ text: q.trim() });
    else return;
    setQ("");
    setSel(0);
  };
  const expanded = sugg.length > 0 && !disabled;
  const listId = useMemo(() => "liste-" + Math.random().toString(36).slice(2, 8), []);
  return (
    <div className={`relative z-[5] max-w-full ${shake ? "shake" : ""}`} style={{ width: width ?? "100%" }} data-tuto={tuto}>
      <div className="flex gap-3">
        <div className="fr-in flex-auto p-[1.5px] cut-sm" style={{ background: edge ?? "var(--line)" }}>
          <input
            ref={input}
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel(Math.min(sugg.length - 1, sel + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel(Math.max(0, sel - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setQ("");
              }
            }}
            disabled={disabled}
            placeholder={placeholder}
            aria-label={t("Nom du champion")}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className="block w-full box-border h-[54px] px-[18px] border-0 outline-none bg-surf text-ink cut-sm font-b text-[17px] font-semibold disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          onClick={() => submit()}
          disabled={disabled}
          className="shrink-0 h-[57px] px-[34px] max-sm:px-5 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-base tracking-[0.05em] uppercase disabled:opacity-60"
        >
          {t("Valider")}
        </button>
        {children}
      </div>
      {expanded && (
        <div className={`absolute left-0 right-[140px] max-sm:right-0 p-[1.5px] bg-line cut-sm ${listAbove ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"}`}>
          <div id={listId} role="listbox" aria-label={t("Champions proposés")} className="flex flex-col gap-0.5 p-1.5 bg-surf cut-sm">
            {sugg.map((o, i) => (
              <button
                key={o.id}
                type="button"
                className="opt flex items-center gap-3 h-12 pl-1.5 pr-3 border-0 text-ink text-left cursor-pointer text-base font-semibold"
                role="option"
                aria-selected={i === sel}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(o.id)}
                style={{ background: i === sel ? "var(--surf2)" : "transparent", boxShadow: `inset 3px 0 0 ${i === sel ? "var(--acc)" : "transparent"}` }}
              >
                {withArt && (
                  <span className="basis-[38px] shrink-0 h-[38px] overflow-hidden cut-sm">
                    <img src={o.art} alt="" className="block w-full h-full object-cover" />
                  </span>
                )}
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Chrono en barre : rouge sous 10 s. */
export function TimerBar({ leftMs, totalMs, tuto }: { leftMs: number; totalMs: number; tuto?: string }) {
  const t = useT();
  const color = leftMs < 10_000 ? "var(--danger)" : "var(--acc)";
  const pct = Math.max(0, Math.min(100, (leftMs / totalMs) * 100));
  return (
    <div className="flex items-center gap-3.5 w-full" data-tuto={tuto}>
      <span className="shrink-0 min-w-[86px] font-d font-bold text-[30px]" style={{ color }}>
        {clock(leftMs)}
      </span>
      <div role="progressbar" aria-label={t("Temps restant")} aria-valuemin={0} aria-valuemax={Math.round(totalMs / 1000)} aria-valuenow={Math.round(leftMs / 1000)} className="flex-auto h-3 bg-surf2 cut-sm">
        <div style={{ width: pct + "%", height: 12, background: color, transition: "width .1s linear" }} />
      </div>
    </div>
  );
}

/** Mesure affichée dans le classement en direct, sans rien dévoiler de la réponse. */
function liveScore(game: GameKey, m: LiveMember, index: number, progress: LiveMember["progress"]) {
  const r = m.results[index];
  const p = progress ?? m.progress;
  if (r?.done) {
    const s = r.summary;
    if (game === "meli") return { v: s?.champions ?? 0, done: true, ok: (s?.champions ?? 0) > 0, tries: 0 };
    if (game === "se") return { v: s?.correct ?? 0, done: true, ok: (s?.correct ?? 0) > 0, tries: 0 };
    return { v: s?.found ? 1 : 0, done: true, ok: !!s?.found, tries: s?.tries ?? 99 };
  }
  if (game === "meli" || game === "se") return { v: p?.score ?? 0, done: false, ok: (p?.score ?? 0) > 0, tries: 0 };
  return { v: p?.found ? 1 : 0, done: false, ok: !!p?.found, tries: p?.tries ?? 0 };
}

/** Classement en direct d'une partie de groupe : les lignes changent de place avec une animation. */
export function LiveRanking({ game, members, index, progress, meId }: { game: GameKey; members: LiveMember[]; index: number; progress: Record<string, LiveMember["progress"]>; meId?: string }) {
  const t = useT();
  const me = useMe();
  const rows = members
    .filter((m) => m.status !== "left")
    .map((m) => ({ m, s: liveScore(game, m, index, progress[m.userId]) }));
  const timed = game === "meli" || game === "se";
  const order = [...rows].sort((a, b) => (timed ? b.s.v - a.s.v : Number(b.s.ok) - Number(a.s.ok) || (a.s.ok ? a.s.tries - b.s.tries : b.s.tries - a.s.tries)));
  // Ordre d'affichage stable (le DOM ne bouge pas) : seule la position verticale change
  const fixed = [...rows].sort((a, b) => a.m.userId.localeCompare(b.m.userId));
  const doneCount = rows.filter((r) => r.s.done).length;
  return (
    <aside aria-label={t("Avancée du groupe")} className="shrink basis-[340px] min-w-[280px] self-start p-[1.5px] bg-line cut-lg">
      <div className="flex flex-col gap-3 px-5 pt-5 pb-[22px] bg-surf cut-lg">
        <span className="font-d font-bold text-lg tracking-[0.04em] uppercase text-center">{t("Classement en direct")}</span>
        <div role="list" aria-label={t("Classement en direct de la partie")} className="relative" style={{ height: rows.length * 64 - 8 }}>
          {fixed.map(({ m, s }) => {
            const r = order.findIndex((x) => x.m.userId === m.userId);
            const mine = m.userId === meId;
            const value = timed ? String(s.v) : s.ok ? "✓ " + s.tries : s.tries ? String(s.tries) : "—";
            return (
              <div
                role="listitem"
                key={m.userId}
                aria-label={t("{r} : {name}", { r: r + 1, name: m.pseudo })}
                className="absolute left-0 right-0 h-14 box-border flex items-center gap-3 pl-2 pr-4 cut-sm"
                style={{ top: r * 64, background: mine ? "color-mix(in srgb, var(--acc) 20%, var(--surf2))" : "var(--surf2)", transition: "top .5s cubic-bezier(.2,.8,.2,1)" }}
              >
                <span className="basis-5 shrink-0 text-center font-d font-bold text-base" style={{ color: r === 0 ? "var(--acc)" : "var(--mut)" }}>
                  {r + 1}
                </span>
                <span className="basis-10 shrink-0 h-10 overflow-hidden cut-sm">
                  <img src={mine ? me.meImg : avatarOf(m)} alt="" className="block w-full h-full object-cover" style={{ filter: s.done ? "grayscale(1) brightness(0.75)" : "none" }} />
                </span>
                <span className="flex-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold text-[15px]">
                  {m.pseudo}
                  {m.status === "disconnected" && <span className="ml-1.5 text-xs font-semibold text-warn">{t("déconnecté")}</span>}
                </span>
                <span className="font-d font-bold text-xl" style={{ color: r === 0 ? "var(--acc)" : s.ok ? "var(--ink)" : "var(--mut)" }}>
                  {value}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between items-baseline gap-2.5 pt-2.5 border-t border-line">
          <span className="text-[13.5px] font-bold">{doneCount === rows.length ? t("Tout le monde a fini !") : t("{n} sur {total} ont fini", { n: doneCount, total: rows.length })}</span>
        </div>
      </div>
    </aside>
  );
}

/** Fenêtre de fin de manche : visuel, titre, statistiques, puis la suite (jeu suivant, attente du groupe). */
export function EndDialog({
  visual,
  label,
  title,
  stats,
  flow,
  children,
  width = 560,
  pad = "pt-7"
}: {
  visual?: ReactNode;
  label: string;
  title: ReactNode;
  stats: { v: ReactNode; l: string; acc?: boolean; color?: string }[];
  flow: GameFlow;
  children?: ReactNode;
  width?: number;
  pad?: string;
}) {
  const t = useT();
  const waiting = flow.multi && flow.waiting.length > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 box-border" style={{ background: "color-mix(in srgb, var(--bg) 45%, transparent)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="titre-fin" className="p-[2px] bg-acc cut-lg max-h-full overflow-auto" style={{ width: `min(100%, ${width}px)` }}>
        <div className={`flex flex-col items-center gap-4 ${pad} pb-[30px] bg-surf cut-lg text-center`}>
          {visual}
          <span className="text-[13px] tracking-[0.1em] uppercase text-mut px-6">{label}</span>
          <h2 id="titre-fin" className="m-0 px-6 font-d font-bold text-[40px] max-sm:text-[32px] leading-none uppercase">
            {title}
          </h2>
          {children}
          <div className="flex gap-7 py-1 px-6 flex-wrap justify-center">
            {stats.map((s, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <span className="font-d font-bold text-[40px]" style={{ color: s.color ?? (s.acc ? "var(--acc)" : undefined) }}>
                  {s.v}
                </span>
                <span className="text-[13px] text-mut">{s.l}</span>
              </div>
            ))}
          </div>
          {flow.extra}
          {waiting && (
            <div className="flex flex-col gap-1.5 w-[calc(100%-72px)] max-w-[380px] text-left">
              <span className="label">{t("En attente des autres joueurs")}</span>
              {flow.waiting.map((w) => (
                <div key={w.name} className="flex items-center gap-2.5 py-1.5 pr-3 pl-1.5 bg-surf2 cut-sm">
                  <span className="basis-[30px] shrink-0 h-[30px] overflow-hidden cut-sm">
                    <img src={w.art} alt="" className="block w-full h-full object-cover" />
                  </span>
                  <span className="flex-auto font-semibold text-[14.5px]">{w.name}</span>
                  <span className="text-[13.5px] text-mut">{w.text}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-center pt-1.5 px-6">
            {flow.autoRecap ? (
              <span className="flex flex-col items-center gap-3">
                <span role="status" className="inline-flex items-center h-[54px] px-9 bg-surf2 text-mut para font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                  {waiting ? t("Classement quand tous ont fini") : t("Tout le monde a fini · classement…")}
                </span>
                {flow.onTutorial && (
                  <button type="button" className="tl text-sm" onClick={flow.onTutorial}>
                    {t("Voir le tutoriel de ce jeu")}
                  </button>
                )}
              </span>
            ) : (
              <span className="flex flex-wrap justify-center gap-3">
                <button type="button" onClick={flow.onNext} className="inline-flex items-center h-[54px] px-11 bg-acc text-on-acc para font-d font-bold text-base tracking-[0.05em] uppercase border-0 cursor-pointer" autoFocus>
                  {flow.nextLabel}
                </button>
                {flow.ctx === "classique" && (
                  <button type="button" onClick={flow.onQuit} className="inline-flex items-center h-[54px] px-8 border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                    {t("Tous les jeux")}
                  </button>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Points affichés en fin de manche : « +100 », ou « 0 pt » hors défi du jour. */
export function pointsText(t: ReturnType<typeof useT>, flow: GameFlow, base: number) {
  return flow.ctx === "defi" ? "+" + base : t("0 pt");
}

export function pointsLabel(t: ReturnType<typeof useT>, flow: GameFlow) {
  return flow.ctx === "defi" ? t("Points de base") : flow.ctx === "streamer" ? t("Mode streamer") : t("Mode classique");
}

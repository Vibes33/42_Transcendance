import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LITE_BY_ID } from "@loltr/content/lite";
import { get } from "../api/client";
import { GameBar } from "../components/game";
import { fmt, useT } from "../i18n";
import { clock, useNow } from "../lib/time";
import type { GameProps } from "./types";

// Sudoku LoL : grille 6 × 6 du jour, 6 champions à la place des chiffres. 3 erreurs permises.

interface Pub {
  day: string;
  champions: { id: string; image: string }[];
  given: boolean[];
  grid: number[];
  errors: number;
  maxErrors: number;
  solved: boolean;
  startedAt: number;
  endedAt: number | null;
  solution: number[] | null;
  over: boolean;
}

interface Stats {
  solvers: number;
  medianMs: number | null;
  mine: number | null;
  fasterThan: number | null;
}

const N = 6;
/** Taille d'une case : la grille tient dans l'écran, en largeur comme en hauteur. */
const CELL = "min(96px, 12vw, calc((100svh - 410px) / 6))";

export function SudokuLol({ round, act, flow, namesLang }: GameProps<Pub>) {
  const t = useT();
  const now = useNow(1000);
  const pub = round.public;
  const over = round.over;
  const [sel, setSel] = useState<number | null>(() => pub.grid.findIndex((v) => v < 0));
  const [wrong, setWrong] = useState<{ cell: number; value: number; at: number } | null>(null);
  const stats = useQuery({ queryKey: ["sudoku-stats", round.id], queryFn: () => get<Stats>("/api/jeux/sudoku/stats"), enabled: over && !flow.demo });
  const name = (id: string) => LITE_BY_ID[id]?.names[namesLang] ?? id;
  const elapsed = (pub.endedAt ?? now) - pub.startedAt;
  const grid = over && pub.solution ? pub.solution : pub.grid;

  const place = async (v: number) => {
    if (sel === null || sel < 0 || over || pub.given[sel] || pub.grid[sel] >= 0) return;
    const res = await act({ type: "place", cell: sel, value: v }).catch(() => null);
    if (res?.feedback?.wrong !== undefined) setWrong({ cell: sel, value: v, at: Date.now() });
    else if (res?.feedback?.correct !== undefined) {
      setWrong(null);
      // Case suivante vide, pour enchaîner au clavier
      const next = pub.grid.findIndex((x, i) => x < 0 && i !== sel && i > sel);
      setSel(next >= 0 ? next : pub.grid.findIndex((x, i) => x < 0 && i !== sel));
    }
  };
  const counts = pub.champions.map((_, v) => pub.grid.filter((x) => x === v).length);
  const sr = sel !== null && sel >= 0 ? Math.floor(sel / N) : -1;
  const sc = sel !== null && sel >= 0 ? sel % N : -1;
  const related = (i: number) => sel !== null && sel >= 0 && !over && (Math.floor(i / N) === sr || i % N === sc || (Math.floor(Math.floor(i / N) / 2) === Math.floor(sr / 2) && Math.floor((i % N) / 3) === Math.floor(sc / 3)));

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(1000px 620px at 45% 50%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar game="sudoku" sub={t("Grille du jour · solo")} counterLabel={t("Erreurs")} counter={`${pub.errors}/${pub.maxErrors}`} onQuit={flow.onQuit} />
      <main className="flex-auto flex flex-wrap items-center content-center justify-center gap-x-16 gap-y-8 pt-6 pb-10 gutter">
        <section aria-label={t("Grille 6 par 6")} className="flex flex-col items-center gap-[18px]">
          <span className="font-d font-bold text-2xl text-acc">{clock(elapsed)}</span>
          <div className="p-[2px] cut-lg" style={{ background: over ? (pub.solved ? "var(--ok)" : "var(--danger)") : "var(--acc)", filter: "drop-shadow(0 20px 44px color-mix(in srgb, var(--acc) 16%, transparent))" }}>
            <div role="grid" aria-label={t("Sudoku : chaque champion une fois par ligne, par colonne et par bloc")} className="grid grid-cols-6 gap-1.5 p-6 max-sm:p-3 bg-surf cut-lg">
              {grid.map((v, i) => {
                const r = Math.floor(i / N);
                const c = i % N;
                const isSel = !over && i === sel;
                const bad = wrong && wrong.cell === i && Date.now() - wrong.at < 1500;
                const shown = bad ? wrong!.value : v;
                return (
                  <button
                    key={i}
                    type="button"
                    role="gridcell"
                    aria-selected={isSel}
                    aria-label={t("Ligne {r}, colonne {c}", { r: r + 1, c: c + 1 }) + " : " + (v >= 0 ? name(pub.champions[v].id) : t("vide"))}
                    onClick={() => !pub.given[i] && setSel(i)}
                    className={`relative p-0 border-0 cut-sm ${bad ? "shake" : ""}`}
                    style={{ width: CELL, height: CELL, marginRight: c === 2 ? 12 : 0, marginBottom: r === 1 || r === 3 ? 12 : 0, background: isSel ? "var(--acc)" : bad ? "var(--danger)" : "transparent", cursor: pub.given[i] || over ? "default" : "pointer" }}
                  >
                    <span className="absolute inset-[3px] block overflow-hidden cut-sm" style={{ background: related(i) ? "color-mix(in srgb, var(--acc) 10%, var(--surf2))" : "var(--surf2)" }}>
                      {shown >= 0 && <img src={pub.champions[shown].image} alt="" className={`block w-full h-full object-cover ${pub.given[i] ? "" : "appear"}`} style={{ filter: bad ? "grayscale(.5)" : over && pub.grid[i] < 0 ? "grayscale(.7) brightness(.7)" : "none" }} />}
                      {pub.given[i] && !over && <span aria-hidden="true" className="absolute right-1.5 bottom-1.5 w-2.5 h-2.5 bg-ink cut-sm opacity-70" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <span className="text-[14.5px] text-mut">{t("Chaque champion une seule fois par ligne, par colonne et par bloc de 2 × 3.")}</span>
        </section>

        {!over ? (
          <aside aria-label={t("Champions à placer")} className="flex-[0_1_400px] min-w-[280px] flex flex-col gap-3.5 p-6 bg-surf cut-lg">
            <span className="font-d font-bold text-lg tracking-[0.04em] uppercase">{t("Place un champion")}</span>
            <span className="text-[14.5px] text-mut">{sel !== null && sel >= 0 ? t("Case sélectionnée : ligne {r}, colonne {c}.", { r: sr + 1, c: sc + 1 }) : t("Choisis une case vide.")}</span>
            <div className="grid grid-cols-3 gap-2.5">
              {pub.champions.map((ch, v) => (
                <button key={ch.id} type="button" onClick={() => place(v)} disabled={counts[v] >= N} aria-label={t("Placer {name}", { name: name(ch.id) })} className="flex flex-col items-center gap-1.5 px-2 pt-2 pb-2.5 border-0 bg-surf2 cut-sm cursor-pointer transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-35 disabled:cursor-default">
                  <img src={ch.image} alt="" className="w-20 h-20 object-cover cut-sm" />
                  <span className="font-bold text-sm">{name(ch.id)}</span>
                  <span className="text-xs text-mut">{t("{n} à placer", { n: N - counts[v] })}</span>
                </button>
              ))}
            </div>
          </aside>
        ) : (
          <aside aria-label={t("Grille terminée")} className="appear flex-[0_1_440px] min-w-[280px] p-[2px] bg-acc cut-lg">
            <div className="flex flex-col gap-[18px] px-[30px] pt-[30px] pb-8 bg-surf cut-lg">
              <span className="label" style={{ color: pub.solved ? "var(--ok)" : "var(--danger)" }}>
                {pub.solved ? t("Grille du jour terminée") : t("3 erreurs : grille ratée")}
              </span>
              <h2 className="m-0 font-d font-bold text-[44px] leading-none uppercase">
                {pub.solved ? (
                  <>
                    {t("Bien")} <span className="text-acc">{t("joué")}</span>
                  </>
                ) : (
                  <>
                    {t("Presque")} <span className="text-acc">!</span>
                  </>
                )}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5 p-3.5 bg-surf2 cut-sm">
                  <span className="font-d font-bold text-[30px] text-acc">{clock(elapsed)}</span>
                  <span className="text-[13px] text-mut">{t("Temps")}</span>
                </div>
                <div className="flex flex-col gap-0.5 p-3.5 bg-surf2 cut-sm">
                  <span className="font-d font-bold text-[30px]">{pub.errors}</span>
                  <span className="text-[13px] text-mut">{t("Erreurs")}</span>
                </div>
              </div>
              {pub.solved && stats.data && (
                <div className="flex flex-col gap-2">
                  {stats.data.fasterThan !== null ? (
                    <>
                      <span className="flex justify-between text-[15px]">
                        <span>{t("Plus rapide que")}</span>
                        <strong className="font-d text-lg text-acc">{t("{n} % des joueurs", { n: Math.round(stats.data.fasterThan * 100) })}</strong>
                      </span>
                      <span aria-hidden="true" className="h-2.5 bg-surf2 cut-sm">
                        <span className="block h-full bg-acc" style={{ width: stats.data.fasterThan * 100 + "%" }} />
                      </span>
                    </>
                  ) : (
                    <span className="text-[15px] font-semibold">{t("Tu es parmi les premiers à finir la grille du jour !")}</span>
                  )}
                  <span className="text-[13.5px] text-mut">
                    {stats.data.medianMs !== null ? t("Temps médian aujourd’hui : {time} · {n} grilles réussies", { time: clock(stats.data.medianMs), n: fmt(stats.data.solvers) }) : ""}
                  </span>
                </div>
              )}
              <span className="text-[13.5px] text-mut">{t("Nouvelle grille chaque jour à 3:00.")}</span>
              <div className="flex gap-2.5">
                <button type="button" onClick={flow.onQuit} className="flex-auto h-[54px] border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                  {t("Tous les jeux")}
                </button>
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}

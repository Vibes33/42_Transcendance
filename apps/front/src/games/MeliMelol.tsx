import { useEffect, useRef, useState } from "react";
import { LITE_BY_ID, squareImg } from "@loltr/content/lite";
import { MELI_START_MS, SUCCESS, WARMUP_MS } from "@loltr/shared";
import { EndDialog, GameBar, TimerBar, modeSub, pointsLabel, pointsText } from "../components/game";
import { useT } from "../i18n";
import { useNow } from "../lib/time";
import type { GameProps } from "./types";

// Méli-MéLoL : trouver les 4 sorts d'un champion dans une grille de 25 icônes. Pas de bouton de
// départ : la grille est floue et se dévoile en 1 s, puis le chrono de 30 s démarre (+5 s par champion).

interface Pub {
  target: string;
  tileCount: number;
  round: number;
  found: number[];
  champions: number;
  history: string[];
  /** Démo du tutoriel : icônes d'exemple. */
  demoImages?: string[];
  endsAt: number;
  warmUntil: number;
  over: boolean;
}

export function MeliMelol({ round, act, finish, flow, groupSize, namesLang }: GameProps<Pub>) {
  const t = useT();
  const tick = useNow(100);
  const pub = round.public;
  // En démo (tutoriel), le temps est figé à la fin du flou de départ
  const now = flow.demo ? pub.warmUntil : tick;
  const [wrong, setWrong] = useState<{ tile: number; at: number } | null>(null);
  const [bonusAt, setBonusAt] = useState(0);
  const finishing = useRef(false);

  const warming = now < pub.warmUntil;
  const unblur = warming ? Math.max(0, Math.min(1, 1 - (pub.warmUntil - now) / WARMUP_MS)) : 1;
  const leftMs = Math.max(0, pub.endsAt - Math.max(now, pub.warmUntil));
  const over = round.over;

  // Chrono écoulé : le serveur clôt la manche après sa marge de tolérance, on redemande jusque-là
  const timeUp = !over && leftMs <= 0;
  useEffect(() => {
    if (!timeUp) return;
    const id = setInterval(() => {
      if (finishing.current) return;
      finishing.current = true;
      finish().finally(() => (finishing.current = false));
    }, 700);
    return () => clearInterval(id);
  }, [timeUp]);

  const click = async (tile: number) => {
    if (over || warming || pub.found.includes(tile)) return;
    const res = await act({ type: "click", tile }).catch(() => null);
    if (res?.feedback?.wrong !== undefined) setWrong({ tile, at: Date.now() });
    if (res?.feedback?.completed) setBonusAt(Date.now());
  };

  const tc = LITE_BY_ID[pub.target];
  const tileSize = 92;
  const gap = 10;
  const gridW = 5 * tileSize + 4 * gap;
  const covered = warming && unblur < 0.05;
  const imgUrl = (i: number) => pub.demoImages?.[i] ?? `/api/jeux/rounds/${round.id}/image/${i}?v=${pub.round}`;

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(900px 600px at 50% 55%, color-mix(in srgb, var(--acc) 16%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar game="meli" sub={modeSub(t, flow, groupSize)} counterLabel={t("Champions")} counter={pub.champions} onQuit={flow.onQuit} />
      <main className="flex-auto min-h-0 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 pt-2.5 pb-6 gutter">
        <div className="flex flex-col items-center gap-4 max-w-full">
          <div className="flex flex-col items-center gap-3 max-w-full" style={{ width: gridW }}>
            <div className="flex items-center gap-4 w-full" data-tuto="meli-target">
              <span className="basis-16 shrink-0 h-16 overflow-hidden bg-surf2 cut-sm">
                {tc && <img src={squareImg(tc)} alt="" className="block w-full h-full object-cover" style={{ filter: covered ? "brightness(0) blur(2px)" : "none" }} />}
              </span>
              <div className="flex-auto flex flex-col gap-0.5">
                <span className="label">{t("Trouve les 4 sorts de")}</span>
                <span className="font-d font-bold text-[36px] leading-none text-acc">{covered ? "..." : tc?.names[namesLang]}</span>
              </div>
              <div className="flex gap-1.5" role="img" aria-label={t("{n} sorts sur 4 trouvés", { n: pub.found.length })}>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="w-[34px] h-[34px] cut-sm" style={{ background: i < pub.found.length ? "var(--acc)" : "var(--surf2)" }} />
                ))}
              </div>
            </div>
            <TimerBar leftMs={warming ? MELI_START_MS : leftMs} totalMs={MELI_START_MS} tuto="meli-timer" />
          </div>

          <div className="relative max-w-full overflow-x-auto">
            <div role="grid" aria-label={t("Grille de 25 icônes de sorts")} data-tuto="meli-grid" className="grid" style={{ gridTemplateColumns: `repeat(5, ${tileSize}px)`, gap }}>
              {Array.from({ length: pub.tileCount }, (_, i) => {
                const isF = pub.found.includes(i);
                const bad = wrong?.tile === i && Date.now() - wrong.at < 400;
                const filter = covered
                  ? "blur(9px) saturate(.8) brightness(.7)"
                  : warming
                    ? `blur(${(9 * (1 - unblur)).toFixed(2)}px) saturate(${(0.8 + 0.2 * unblur).toFixed(2)}) brightness(${(0.7 + 0.3 * unblur).toFixed(2)})`
                    : isF
                      ? "brightness(1.08)"
                      : over
                        ? "grayscale(.6) brightness(.6)"
                        : "none";
                return (
                  <button
                    key={`${pub.round}-${i}`}
                    type="button"
                    className={`tile relative p-0 border-0 cut-sm cursor-pointer ${bad ? "shake" : ""}`}
                    onClick={() => click(i)}
                    disabled={over || warming}
                    aria-label={t("Sort {n}", { n: i + 1 })}
                    aria-pressed={isF}
                    style={{ width: tileSize, height: tileSize, background: isF ? "var(--acc)" : bad ? "var(--danger)" : "var(--line)" }}
                  >
                    <img src={imgUrl(i)} alt="" draggable={false} className="absolute inset-[3px] cut-sm object-cover" style={{ width: tileSize - 6, height: tileSize - 6, filter, opacity: isF ? 0.55 : 1 }} />
                    {isF && (
                      <span aria-hidden="true" className="absolute right-1.5 bottom-1.5 w-6 h-6 flex items-center justify-center bg-acc text-on-acc cut-sm">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {Date.now() - bonusAt < 1200 && (
              <span className="pop absolute -top-2.5 -right-2.5 px-4 py-2 bg-acc text-on-acc cut-sm font-d font-bold text-[22px]" aria-live="polite">
                +5 s
              </span>
            )}
          </div>
          <span aria-live="polite" className="text-sm text-mut">
            {t("{n} sur 4 · une erreur fait trembler la case, sans pénalité", { n: pub.found.length })}
          </span>
        </div>
        {flow.side}
      </main>

      {over && (
        <EndDialog
          flow={flow}
          pad="pt-9"
          label={`${t("Méli-MéLoL")} · ${flow.ctx === "defi" ? t("défi du jour") : flow.ctx === "streamer" ? t("stream") : t("classique")} · ${flow.multi ? t("groupe") : t("solo")}`}
          title={
            <>
              {t("Temps")} <span className="text-acc">{t("écoulé")}</span>
            </>
          }
          stats={[
            { v: pub.champions, l: t("Champions trouvés"), acc: true },
            { v: pointsText(t, flow, round.points?.base ?? 0), l: pointsLabel(t, flow) },
            { v: `> ${SUCCESS.meli.moreThan}`, l: t("Seuil de réussite"), color: pub.champions > SUCCESS.meli.moreThan ? "var(--ok)" : "var(--mut)" }
          ]}
        />
      )}
    </div>
  );
}

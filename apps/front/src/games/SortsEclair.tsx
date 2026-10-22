import { useEffect, useRef, useState } from "react";
import { LITE_BY_ID } from "@loltr/content/lite";
import { SE_BONUS_MS, SE_START_MS, SUCCESS, WARMUP_MS } from "@loltr/shared";
import { AnswerInput, EndDialog, GameBar, TimerBar, modeSub, pointsLabel, pointsText, useChampionOptions } from "../components/game";
import { useT } from "../i18n";
import { useNow } from "../lib/time";
import type { GameProps } from "./types";

// Sorts éclair : une icône de sort, à qui appartient-elle ? 30 s au départ, +3 s par bonne réponse.
// L'icône est servie par le serveur (son adresse d'origine trahirait le champion).

interface Pub {
  q: number;
  correct: number;
  skipped: number;
  last: { kind: "ok" | "skip"; ref: string } | null;
  demoImage?: string;
  endsAt: number;
  warmUntil: number;
  over: boolean;
}

export function SortsEclair({ round, act, finish, flow, groupSize, namesLang }: GameProps<Pub>) {
  const t = useT();
  const tick = useNow(100);
  const pub = round.public;
  const now = flow.demo ? pub.warmUntil : tick;
  const options = useChampionOptions(namesLang);
  const [wrong, setWrong] = useState<{ name: string; at: number } | null>(null);
  const [popAt, setPopAt] = useState(0);
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

  const describe = (ref: string) => {
    const [champ, slot] = ref.split(":");
    const c = LITE_BY_ID[champ];
    const sp = c?.spells.find((s) => s.slot === slot);
    return `${c?.names[namesLang] ?? champ} — ${slot === "P" ? t("Passif") : slot} : ${sp?.names[namesLang] ?? ""}`;
  };

  const answer = async (a: { champion?: string; text?: string }) => {
    if (over || warming) return;
    const res = await act({ type: "answer", ...a }).catch(() => null);
    if (res?.feedback?.wrong) setWrong({ name: LITE_BY_ID[res.feedback.wrong]?.names[namesLang] ?? "", at: Date.now() });
    if (res?.feedback?.correct) {
      setWrong(null);
      setPopAt(Date.now());
    }
  };

  const wrongRecent = !!wrong && Date.now() - wrong.at < 1400;
  let lastText = "";
  let lastColor = "var(--mut)";
  if (wrongRecent) {
    lastText = t("✕ Ce n’est pas {name}", { name: wrong!.name });
    lastColor = "var(--danger)";
  } else if (pub.last?.kind === "ok") {
    lastText = "✓ " + describe(pub.last.ref);
    lastColor = "var(--ok)";
  } else if (pub.last?.kind === "skip") lastText = t("Passé : {spell}", { spell: describe(pub.last.ref) });

  const iconPx = 200;
  const covered = warming && unblur < 0.05;
  const iconFilter = covered ? "blur(12px) brightness(.8)" : warming ? `blur(${(12 * (1 - unblur)).toFixed(2)}px) brightness(${(0.8 + 0.2 * unblur).toFixed(2)})` : "none";

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(900px 600px at 50% 45%, color-mix(in srgb, var(--acc) 16%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar game="se" sub={modeSub(t, flow, groupSize)} counterLabel={t("Sorts")} counter={pub.correct} onQuit={flow.onQuit} />
      <main className="flex-auto min-h-0 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 pt-2.5 pb-6 gutter">
        <section aria-label={t("Partie")} className="flex flex-col items-center gap-[18px] max-w-full" style={{ width: 640 }}>
          <TimerBar leftMs={warming ? SE_START_MS : leftMs} totalMs={SE_START_MS} tuto="se-timer" />
          <div className="relative" data-tuto="se-icon">
            <div
              key={pub.q}
              className={covered ? "" : "appear"}
              style={{ width: iconPx, height: iconPx, padding: 3, boxSizing: "border-box", background: pub.last?.kind === "ok" && Date.now() - popAt < 600 ? "var(--ok)" : "var(--acc)", clipPath: "var(--cut-md)", filter: "drop-shadow(0 18px 40px color-mix(in srgb, var(--acc) 22%, transparent))" }}
            >
              <div className="relative w-full h-full overflow-hidden cut-md bg-surf2">
                <img src={pub.demoImage ?? `/api/jeux/rounds/${round.id}/image/${pub.q}`} alt={t("Icône du sort à deviner")} draggable={false} className="absolute inset-0 w-full h-full object-cover" style={{ filter: iconFilter }} />
              </div>
            </div>
            {Date.now() - popAt < 1200 && (
              <span className="pop absolute -top-3.5 -right-[34px] px-4 py-2 bg-acc text-on-acc cut-sm font-d font-bold text-[22px]" aria-live="polite">
                +{SE_BONUS_MS / 1000} s
              </span>
            )}
          </div>
          <span aria-live="polite" className="min-h-[22px] text-[15px] font-semibold text-center" style={{ color: lastColor }}>
            {covered ? "" : lastText}
          </span>
          <AnswerInput
            options={options}
            onAnswer={answer}
            disabled={over || warming}
            placeholder={t("À quel champion appartient ce sort ?")}
            tuto="se-input"
            shake={wrongRecent}
            edge={wrongRecent ? "var(--danger)" : undefined}
          >
            <button
              type="button"
              onClick={() => act({ type: "skip" }).catch(() => null)}
              disabled={over || warming}
              className="shrink-0 h-[57px] px-[22px] border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase"
            >
              {t("Passer")}
            </button>
          </AnswerInput>
        </section>
        {flow.side}
      </main>

      {over && (
        <EndDialog
          flow={flow}
          pad="pt-9"
          label={`${t("Sorts éclair")} · ${flow.ctx === "defi" ? t("défi du jour") : flow.ctx === "streamer" ? t("stream") : t("classique")} · ${flow.multi ? t("groupe") : t("solo")}`}
          title={
            <>
              {t("Temps")} <span className="text-acc">{t("écoulé")}</span>
            </>
          }
          stats={[
            { v: pub.correct, l: t("Bonnes réponses"), acc: true },
            { v: pointsText(t, flow, round.points?.base ?? 0), l: pointsLabel(t, flow) },
            { v: `≥ ${SUCCESS.se.atLeast}`, l: t("Seuil de réussite"), color: pub.correct >= SUCCESS.se.atLeast ? "var(--ok)" : "var(--mut)" }
          ]}
        />
      )}
    </div>
  );
}

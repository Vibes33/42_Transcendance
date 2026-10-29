import { useEffect, useState } from "react";
import { EndDialog, GameBar, modeSub, pointsLabel, pointsText } from "../components/game";
import { fmt, useT } from "../i18n";
import { useBi, type Bi } from "./common";
import type { GameProps } from "./types";

// Chaud-Froid : questions à réponse chiffrée ; plus la réponse est proche, plus elle rapporte.

interface Pub {
  i: number;
  total: number;
  question: { text: Bi; category: Bi; image: string | null; unit: Bi | null; min: number; max: number; step: number };
  result: { answer: number; guess: number; points: number } | null;
  history: number[];
  score: number;
  over: boolean;
}

const TEMP: Record<number, { label: string; color: string }> = {
  100: { label: "Brûlant", color: "var(--danger)" },
  70: { label: "Chaud", color: "#FF9A6B" },
  40: { label: "Tiède", color: "var(--warn)" },
  10: { label: "Froid", color: "#6FB2FF" }
};

export function ChaudFroid({ round, act, flow, groupSize }: GameProps<Pub>) {
  const t = useT();
  const bi = useBi();
  const pub = round.public;
  const q = pub.question;
  const mid = Math.round((q.min + q.max) / 2 / q.step) * q.step;
  const [value, setValue] = useState(mid);
  // Nouvelle question : le curseur revient au milieu
  useEffect(() => setValue(mid), [pub.i]);
  const r = pub.result;
  const temp = r ? TEMP[r.points] : null;
  const pos = (v: number) => ((v - q.min) / (q.max - q.min)) * 100 + "%";
  const unit = q.unit ? " " + bi(q.unit) : "";

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(1000px 620px at 45% 50%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar game="chaudfroid" sub={modeSub(t, flow, groupSize)} counterLabel={t("Score")} counter={pub.score} onQuit={flow.onQuit} />
      <main className="flex-auto flex flex-wrap items-start content-center justify-center gap-x-10 gap-y-7 pt-6 pb-10 gutter">
        <section aria-label={t("Question")} className="flex-[1_1_820px] min-w-0 max-w-[960px] flex flex-col gap-5">
          <div role="img" aria-label={t("Question {n} sur {total}", { n: pub.i + 1, total: pub.total })} className="flex gap-1.5">
            {Array.from({ length: pub.total }, (_, k) => (
              <span key={k} className="flex-1 h-2 cut-sm" style={{ background: k < pub.history.length ? TEMP[pub.history[k]].color : k === pub.i ? "var(--acc)" : "var(--surf2)" }} />
            ))}
          </div>
          <div className="p-[2px] bg-acc cut-lg" style={{ filter: "drop-shadow(0 20px 44px color-mix(in srgb, var(--acc) 16%, transparent))" }}>
            <div className="flex items-center gap-7 px-8 py-7 bg-surf cut-lg">
              {q.image && <img src={q.image} alt="" className="basis-[120px] shrink-0 w-[120px] h-[120px] object-cover cut-md max-sm:hidden" />}
              <span className="flex flex-col gap-2.5">
                <span className="label !text-acc">
                  {bi(q.category)} · {t("Question {n} sur {total}", { n: pub.i + 1, total: pub.total })}
                </span>
                <h1 className="m-0 font-d font-bold text-[clamp(26px,3vw,38px)] leading-tight">{bi(q.text)}</h1>
              </span>
            </div>
          </div>

          {!r ? (
            <div className="flex flex-col gap-3.5 px-7 py-6 bg-surf cut-md">
              <div className="flex items-baseline justify-between">
                <span className="label">{t("Ta réponse")}</span>
                <span className="font-d font-bold text-[44px] text-acc">
                  {fmt(value)}
                  {unit}
                </span>
              </div>
              <input type="range" min={q.min} max={q.max} step={q.step} value={value} onChange={(e) => setValue(Number(e.target.value))} aria-label={t("Ta réponse")} className="w-full h-11 cursor-pointer" style={{ accentColor: "var(--acc)" }} />
              <div className="flex justify-between text-[13.5px] text-mut">
                <span>{fmt(q.min)}</span>
                <span>{fmt(q.max)}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <span className="text-[14.5px] text-mut">{t("Pile la bonne valeur : 100 · très proche : 70 · proche : 40 · loin : 10")}</span>
                <button type="button" onClick={() => act({ type: "answer", value }).catch(() => null)} className="h-14 px-11 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-base tracking-[0.05em] uppercase">
                  {t("Valider")}
                </button>
              </div>
            </div>
          ) : (
            <div className="appear flex flex-col gap-[18px] px-[30px] pt-[26px] pb-[30px] bg-surf cut-md">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <span className="flex flex-col gap-0.5">
                  <span className="label">{t("Bonne réponse")}</span>
                  <span className="font-d font-bold text-[48px] leading-none">
                    {fmt(r.answer)}
                    {unit}
                  </span>
                </span>
                <span className="flex items-center gap-3.5 h-16 px-6 cut-sm text-[#0F1115]" style={{ background: temp!.color }}>
                  <span className="flex flex-col">
                    <strong className="font-d text-2xl uppercase leading-none">{t(temp!.label)}</strong>
                    <span className="text-[13.5px] font-bold">{t("Ta réponse : {v}", { v: fmt(r.guess) + unit })}</span>
                  </span>
                  <span className="ml-2.5 font-d font-bold text-3xl">+{r.points}</span>
                </span>
              </div>
              <div className="relative h-[110px] mt-2" aria-hidden="true">
                <div className="absolute inset-x-0 top-[62px] h-3.5 cut-sm opacity-85" style={{ background: `linear-gradient(90deg, #6FB2FF, var(--danger) ${pos(r.answer)}, #6FB2FF)` }} />
                <div className="absolute top-7 flex flex-col items-center gap-1 -translate-x-1/2" style={{ left: pos(r.answer) }}>
                  <span className="w-[3px] h-[50px] bg-ink" />
                </div>
                <div className="absolute top-0 flex flex-col items-center -translate-x-1/2" style={{ left: pos(r.guess) }}>
                  <span className="px-2.5 py-1 bg-acc text-on-acc cut-sm font-d font-bold text-sm">{fmt(r.guess)}</span>
                </div>
                <div className="absolute inset-x-0 bottom-0 flex justify-between text-[13px] text-mut">
                  <span>{fmt(q.min)}</span>
                  <span>{fmt(q.max)}</span>
                </div>
              </div>
              {!round.over && (
                <div className="flex justify-end pt-1.5 border-t border-line">
                  <button type="button" autoFocus onClick={() => act({ type: "next" }).catch(() => null)} className="mt-3 h-[54px] px-10 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-base tracking-[0.05em] uppercase">
                    {pub.i + 1 < pub.total ? t("Question suivante ({n}/{total})", { n: pub.i + 2, total: pub.total }) : t("Voir le résultat")}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
        {flow.side}
      </main>

      {round.over && (
        <EndDialog
          flow={flow}
          label={`${t("Chaud-Froid")} · ${flow.multi ? t("groupe") : t("solo")}`}
          title={
            <>
              {t("Partie")} <span className="text-acc">{t("terminée")}</span>
            </>
          }
          stats={[
            { v: pub.score, l: t("Score"), acc: true },
            { v: pub.history.filter((p) => p === 100).length, l: t("Réponses exactes") },
            { v: pointsText(t, flow, round.points?.base ?? 0), l: pointsLabel(t, flow) }
          ]}
        />
      )}
    </div>
  );
}

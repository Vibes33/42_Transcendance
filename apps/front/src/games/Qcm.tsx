import { useEffect, useRef } from "react";
import { QCM_QUESTION_MS } from "@loltr/shared";
import { EndDialog, GameBar, modeSub, pointsLabel, pointsText } from "../components/game";
import { useT } from "../i18n";
import { clock, useNow } from "../lib/time";
import { useBi, type Bi } from "./common";
import type { GameProps } from "./types";

// QCM de la Faille : 10 questions, 4 réponses, 15 s chacune.

interface Pub {
  i: number;
  total: number;
  question: { category: "lore" | "gameplay" | "esport"; text: Bi; choices: Bi[] };
  deadline: number;
  result: { picked: number; correct: number } | null;
  history: boolean[];
  streak: number;
  score: number;
  over: boolean;
}

const CATEGORY = { lore: "Lore", gameplay: "Gameplay", esport: "Esport" };
const KEYS = ["A", "B", "C", "D"];

export function Qcm({ round, act, flow, groupSize }: GameProps<Pub>) {
  const t = useT();
  const bi = useBi();
  const now = useNow(100);
  const pub = round.public;
  const r = pub.result;
  const leftMs = flow.demo ? QCM_QUESTION_MS : Math.max(0, pub.deadline - now);
  const sent = useRef(-1);

  // Temps écoulé sans réponse : la question est comptée fausse (le serveur vérifie l'heure)
  useEffect(() => {
    if (r || round.over || flow.demo || leftMs > 0 || sent.current === pub.i) return;
    sent.current = pub.i;
    act({ type: "timeout" }).catch(() => (sent.current = -1));
  }, [leftMs <= 0, r, pub.i]);

  const timeColor = leftMs <= 5000 ? "var(--danger)" : "var(--acc)";
  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(1000px 620px at 45% 50%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar game="qcm" sub={modeSub(t, flow, groupSize)} counterLabel={t("Score")} counter={pub.score} onQuit={flow.onQuit} />
      <main className="flex-auto flex flex-wrap items-start content-center justify-center gap-x-10 gap-y-7 pt-6 pb-10 gutter">
        <section aria-label={t("Question")} className="flex-[1_1_820px] min-w-0 max-w-[980px] flex flex-col gap-[18px]">
          <div role="img" aria-label={t("Question {n} sur {total}", { n: pub.i + 1, total: pub.total })} className="flex gap-1.5">
            {Array.from({ length: pub.total }, (_, k) => (
              <span key={k} className="flex-1 h-2 cut-sm" style={{ background: k < pub.history.length ? (pub.history[k] ? "var(--ok)" : "var(--danger)") : k === pub.i ? "var(--acc)" : "var(--surf2)" }} />
            ))}
          </div>
          <div className="p-[2px] bg-acc cut-lg" style={{ filter: "drop-shadow(0 20px 44px color-mix(in srgb, var(--acc) 16%, transparent))" }}>
            <div className="flex flex-col gap-3.5 px-9 pt-[30px] pb-[26px] bg-surf cut-lg">
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <span className="inline-flex items-center h-8 px-3.5 bg-acc text-on-acc cut-sm font-d font-bold text-[13.5px] tracking-[0.06em] uppercase">{t(CATEGORY[pub.question.category])}</span>
                  <span className="label">{t("Question {n} sur {total}", { n: pub.i + 1, total: pub.total })}</span>
                </span>
                <span className="flex items-center gap-3">
                  {pub.streak >= 2 && <span className="font-d font-bold text-base text-acc">{t("Série ×{n}", { n: pub.streak })}</span>}
                  {!r && (
                    <span className="font-d font-bold text-[22px]" style={{ color: timeColor }}>
                      {clock(leftMs)}
                    </span>
                  )}
                </span>
              </span>
              <h1 className="m-0 font-d font-bold text-[clamp(26px,3vw,40px)] leading-tight">{bi(pub.question.text)}</h1>
              <div aria-hidden="true" className="h-1.5 bg-surf2 cut-sm">
                <div className="h-full" style={{ width: (r ? 0 : (leftMs / QCM_QUESTION_MS) * 100) + "%", background: timeColor, transition: "width .1s linear" }} />
              </div>
            </div>
          </div>

          <div role="radiogroup" aria-label={t("Réponses")} className="grid grid-cols-2 max-sm:grid-cols-1 gap-3.5">
            {pub.question.choices.map((c, k) => {
              const good = !!r && k === r.correct;
              const mine = !!r && k === r.picked;
              const colored = good || mine;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={mine}
                  disabled={!!r || round.over}
                  onClick={() => act({ type: "answer", choice: k }).catch(() => null)}
                  className="flex items-center gap-4 min-h-[96px] px-[22px] py-4 border-0 cut-md cursor-pointer text-left transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-default"
                  style={{ background: good ? "var(--ok)" : mine ? "var(--danger)" : "var(--surf)", color: colored ? "var(--on-acc)" : "var(--ink)", opacity: r && !colored ? 0.6 : 1 }}
                >
                  <span className="basis-11 shrink-0 h-11 flex items-center justify-center cut-sm font-d font-bold text-xl" style={{ background: colored ? "color-mix(in srgb, var(--on-acc) 22%, transparent)" : "var(--surf2)", color: colored ? "var(--on-acc)" : "var(--acc)" }}>
                    {KEYS[k]}
                  </span>
                  <span className="flex-auto font-bold text-xl">{bi(c)}</span>
                  {good && <span className="text-[13px] font-bold tracking-[0.06em] uppercase">{t("Bonne réponse")}</span>}
                  {mine && !good && <span className="text-[13px] font-bold tracking-[0.06em] uppercase">{t("Ton choix")}</span>}
                </button>
              );
            })}
          </div>

          {r && !round.over && (
            <div className="appear flex flex-wrap items-center justify-between gap-3.5 px-[22px] py-4 bg-surf cut-md">
              <strong className="font-d text-[22px]" style={{ color: r.picked === r.correct ? "var(--ok)" : "var(--danger)" }}>
                {r.picked === r.correct ? t("Bonne réponse · +100") : r.picked < 0 ? t("Temps écoulé") : t("Raté")}
              </strong>
              <button type="button" autoFocus onClick={() => act({ type: "next" }).catch(() => null)} className="h-[54px] px-10 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-base tracking-[0.05em] uppercase">
                {pub.i + 1 < pub.total ? t("Question suivante") : t("Voir le résultat")}
              </button>
            </div>
          )}
        </section>
        {flow.side}
      </main>

      {round.over && (
        <EndDialog
          flow={flow}
          label={`${t("QCM de la Faille")} · ${flow.multi ? t("groupe") : t("solo")}`}
          title={
            <>
              {t("Quiz")} <span className="text-acc">{t("terminé")}</span>
            </>
          }
          stats={[
            { v: `${pub.history.filter(Boolean).length}/${pub.total}`, l: t("Bonnes réponses"), acc: true },
            { v: pub.score, l: t("Score") },
            { v: pointsText(t, flow, round.points?.base ?? 0), l: pointsLabel(t, flow) }
          ]}
        />
      )}
    </div>
  );
}

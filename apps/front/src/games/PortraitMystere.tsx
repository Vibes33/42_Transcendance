import { useMemo, useState } from "react";
import { LITE_BY_ID } from "@loltr/content/lite";
import { PORTRAIT_LINES } from "@loltr/shared";
import { AnswerInput, EndDialog, GameBar, modeSub, pointsLabel, pointsText, useChampionOptions } from "../components/game";
import { useT } from "../i18n";
import { useBi, type Bi } from "./common";
import type { GameProps } from "./types";

// Portrait mystère : le champion est décrit ligne par ligne ; une erreur dévoile la ligne suivante.
// 100 points à la première ligne, 20 de moins à chaque ligne ; 5 portraits.

interface Pub {
  i: number;
  total: number;
  lines: Bi[];
  shown: number;
  worth: number;
  misses: string[];
  found: boolean | null;
  answer: { champion: string; image: string } | null;
  score: number;
  over: boolean;
}

export function PortraitMystere({ round, act, flow, groupSize, namesLang }: GameProps<Pub>) {
  const t = useT();
  const bi = useBi();
  const pub = round.public;
  const withAttrs = useMemo(() => (id: string) => !!LITE_BY_ID[id]?.attributes, []);
  const options = useChampionOptions(namesLang, withAttrs);
  const [shakeAt, setShakeAt] = useState(0);
  const playing = pub.found === null && !round.over;
  const name = (id: string) => LITE_BY_ID[id]?.names[namesLang] ?? id;

  const guess = async (a: { champion?: string; text?: string }) => {
    const res = await act({ type: "guess", ...a }).catch(() => null);
    if (res?.feedback?.wrong) setShakeAt(Date.now());
  };

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(1000px 620px at 45% 50%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar game="portrait" sub={modeSub(t, flow, groupSize)} counterLabel={t("Score")} counter={pub.score} onQuit={flow.onQuit} />
      <main className="flex-auto flex flex-wrap items-start content-center justify-center gap-x-10 gap-y-7 pt-6 pb-10 gutter">
        <section aria-label={t("Portrait")} className="flex-[1_1_760px] min-w-0 max-w-[900px] flex flex-col gap-[18px]">
          <span className="label">{t("Portrait {n} sur {total}", { n: pub.i + 1, total: pub.total })}</span>
          <div className="p-[2px] cut-lg" style={{ background: pub.found ? "var(--ok)" : pub.found === false ? "var(--danger)" : "var(--acc)" }}>
            <div className="flex flex-wrap gap-7 px-8 py-7 bg-surf cut-lg">
              <div className="basis-[200px] shrink-0 flex flex-col gap-3">
                <div className="relative h-[250px] overflow-hidden bg-surf2 cut-md flex items-center justify-center">
                  {pub.answer ? (
                    <img src={pub.answer.image} alt={name(pub.answer.champion)} className="appear block w-full h-full object-cover" />
                  ) : (
                    <span className="font-d font-bold text-[56px] text-acc" aria-hidden="true">
                      ?
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="label">{pub.answer ? t("C’était") : t("Vaut maintenant")}</span>
                  <span className="font-d font-bold text-[30px] text-acc">{pub.answer ? name(pub.answer.champion) : t("{n} pts", { n: pub.worth })}</span>
                </div>
              </div>
              <ol aria-label={t("Description du champion")} className="flex-[1_1_360px] min-w-0 flex flex-col gap-2.5 m-0 p-0 list-none">
                {Array.from({ length: PORTRAIT_LINES }, (_, k) => {
                  const line = pub.lines[k];
                  return (
                    <li key={k} className="flex items-center gap-3.5 min-h-[52px] py-2 pl-2 pr-4 cut-sm" style={{ background: line ? "var(--surf2)" : "color-mix(in srgb, var(--surf2) 55%, transparent)" }}>
                      <span className="basis-9 shrink-0 h-9 flex items-center justify-center cut-sm font-d font-bold" style={{ background: line ? "var(--acc)" : "var(--line)", color: line ? "var(--on-acc)" : "var(--mut)" }}>
                        {k + 1}
                      </span>
                      {line ? (
                        <span className="appear text-[17px] leading-normal font-medium">{bi(line)}</span>
                      ) : (
                        <span className="flex-auto flex items-center gap-3">
                          <span aria-hidden="true" className="flex-auto h-3 bg-line cut-sm opacity-60" />
                          <span className="text-[13.5px] text-mut whitespace-nowrap">{t("Masquée")}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          {playing ? (
            <>
              <AnswerInput options={options} exclude={new Set(pub.misses)} onAnswer={guess} disabled={!playing} placeholder={t("Tape le nom d’un champion…")} shake={Date.now() - shakeAt < 450}>
                <button
                  type="button"
                  onClick={() => act({ type: "reveal" }).catch(() => null)}
                  disabled={pub.shown >= PORTRAIT_LINES}
                  className="shrink-0 h-[57px] px-6 border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[15px] tracking-[0.04em] uppercase disabled:opacity-50"
                >
                  {t("Ligne suivante · −20")}
                </button>
              </AnswerInput>
              <div aria-live="polite" className="flex flex-wrap items-center gap-2 min-h-[34px]">
                {pub.misses.length > 0 && <span className="label">{t("Déjà proposés")}</span>}
                {pub.misses.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1.5 h-8 px-3.5 cut-sm text-sm font-semibold" style={{ background: "color-mix(in srgb, var(--danger) 16%, var(--surf2))" }}>
                    <span aria-hidden="true" className="text-danger">
                      ✕
                    </span>
                    {name(m)}
                  </span>
                ))}
                <span className="text-[13.5px] text-mut">{t("Une erreur dévoile aussi la ligne suivante.")}</span>
              </div>
            </>
          ) : (
            !round.over && (
              <div className="appear flex flex-wrap items-center justify-between gap-4 px-6 py-[18px] cut-md" style={{ background: `color-mix(in srgb, ${pub.found ? "var(--ok)" : "var(--danger)"} 14%, var(--surf))` }}>
                <span className="flex flex-col gap-0.5">
                  <span className="label" style={{ color: pub.found ? "var(--ok)" : "var(--danger)" }}>
                    {pub.found ? t("Trouvé à la ligne {n}", { n: pub.shown }) : t("Portrait raté")}
                  </span>
                  <span className="font-d font-bold text-[28px]">
                    {t("C’était")} <span className="text-acc">{pub.answer ? name(pub.answer.champion) : ""}</span>
                    {pub.found ? ` · +${pub.worth}` : ""}
                  </span>
                </span>
                <button type="button" autoFocus onClick={() => act({ type: "next" }).catch(() => null)} className="h-[54px] px-10 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-base tracking-[0.05em] uppercase">
                  {pub.i + 1 < pub.total ? t("Portrait suivant ({n}/{total})", { n: pub.i + 2, total: pub.total }) : t("Voir le résultat")}
                </button>
              </div>
            )
          )}
        </section>
        {flow.side}
      </main>

      {round.over && (
        <EndDialog
          flow={flow}
          label={`${t("Portrait mystère")} · ${flow.multi ? t("groupe") : t("solo")}`}
          title={
            <>
              {t("Portraits")} <span className="text-acc">{t("terminés")}</span>
            </>
          }
          stats={[
            { v: pub.score, l: t("Score"), acc: true },
            { v: pointsText(t, flow, round.points?.base ?? 0), l: pointsLabel(t, flow) }
          ]}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { LITE_BY_ID } from "@loltr/content/lite";
import { SPLASH_CHAMPION_POINTS, SPLASH_SKIN_POINTS } from "@loltr/shared";
import { AnswerInput, EndDialog, GameBar, modeSub, pointsLabel, pointsText, useChampionOptions } from "../components/game";
import { Zoom } from "../components/icons";
import { useT } from "../i18n";
import type { GameProps } from "./types";

// Splash mystère : un vrai splash art très zoomé et flou, qui se dévoile à chaque erreur (6 crans).
// Champion trouvé = 70 points ; ensuite une seule tentative sur le skin (4 choix) = 30 points.

interface Pub {
  step: number;
  scale: number;
  blur: number;
  origin: string;
  misses: string[];
  found: boolean;
  champion: string | null;
  skinChoices: { num: number; names: { fr: string; en: string } }[];
  skinPick: number | null;
  over: boolean;
  demoImage?: string;
}

export function SplashMystere({ round, act, finish, flow, groupSize, namesLang }: GameProps<Pub>) {
  const t = useT();
  const pub = round.public;
  const options = useChampionOptions(namesLang);
  const [wrongAt, setWrongAt] = useState(0);
  const [skinResult, setSkinResult] = useState<{ ok: boolean; num: number } | null>(null);
  const exclude = new Set(pub.misses);
  const reveal = round.reveal as { champion: string; skinNum: number; skin: { fr: string; en: string } | null } | null;
  const champ = LITE_BY_ID[pub.champion ?? reveal?.champion ?? ""];
  const img = pub.demoImage ?? `/api/jeux/rounds/${round.id}/image/0`;
  const tries = pub.misses.length + (pub.found ? 1 : 0);
  const bonus = pub.found && pub.skinPick === null && !round.over;
  const playing = !pub.found && !round.over;
  const scale = round.over ? 1 : pub.scale;
  const blur = round.over ? 0 : pub.blur;

  const guess = async (a: { champion?: string; text?: string }) => {
    const res = await act({ type: "guess", ...a }).catch(() => null);
    if (res?.feedback?.wrong) setWrongAt(Date.now());
  };
  const pickSkin = async (num: number) => {
    const res = await act({ type: "skin", num }).catch(() => null);
    if (res?.feedback) setSkinResult({ ok: !!res.feedback.skinCorrect, num });
  };

  const skinFound = reveal ? pub.skinPick === reveal.skinNum : skinResult?.ok;
  const wrongRecent = Date.now() - wrongAt < 600;

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(900px 600px at 50% 45%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar game="splash" sub={modeSub(t, flow, groupSize)} counterLabel={t("Essais")} counter={tries} onQuit={flow.onQuit} />
      <main className="flex-auto min-h-0 flex flex-wrap items-start content-center justify-center gap-x-10 gap-y-6 pt-3 pb-6 gutter">
        <section aria-label={t("Partie")} className="flex flex-col items-center gap-3.5 max-w-full" style={{ width: 880 }}>
          <div data-tuto="splash-image" className="relative w-full p-[2px] box-border cut-lg" style={{ background: pub.found ? "var(--ok)" : "var(--acc)", filter: "drop-shadow(0 20px 44px color-mix(in srgb, var(--acc) 18%, transparent))" }}>
            <div className="relative w-full overflow-hidden bg-surf2 cut-lg" style={{ aspectRatio: "1215 / 717" }}>
              <img
                src={img}
                alt={t("Splash art à deviner")}
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className="block w-full h-full object-cover select-none"
                style={{ transform: `scale(${scale})`, transformOrigin: pub.origin, filter: `blur(${blur}px)`, transition: "transform .7s ease, filter .7s ease" }}
              />
              <span className="absolute left-[22px] top-[18px] flex items-center gap-2 h-[34px] px-3.5 cut-sm font-d font-bold text-[15px]" style={{ background: "color-mix(in srgb, var(--bg) 72%, transparent)" }}>
                <Zoom className="text-acc" />
                {t("Zoom")} ×{scale.toFixed(1)}
              </span>
              {pub.found && champ && (
                <div className="rise absolute left-0 right-0 bottom-0 flex items-end justify-between gap-3 px-7 pt-[60px] pb-[22px]" style={{ background: "linear-gradient(to top, color-mix(in srgb, var(--bg) 88%, transparent), transparent)" }}>
                  <div className="flex flex-col gap-0.5">
                    <span className="label !text-ok">{t("Trouvé en {n}", { n: tries })}</span>
                    <span className="font-d font-bold text-[40px] leading-none text-acc">{champ.names[namesLang]}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div role="img" aria-label={t("Niveau de zoom {n} sur 6", { n: pub.step })} data-tuto="splash-steps" className="flex items-center gap-1.5 w-full">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="flex-1 h-1.5 cut-sm" style={{ background: i < pub.step ? "var(--acc)" : "var(--surf2)" }} />
            ))}
          </div>

          {playing && (
            <>
              <AnswerInput
                options={options}
                exclude={exclude}
                onAnswer={guess}
                listAbove
                tuto="splash-input"
                placeholder={t("Tape le nom d’un champion…")}
                shake={wrongRecent}
                edge={wrongRecent ? "var(--danger)" : undefined}
                width="min(100%, 640px)"
              />
              <div aria-live="polite" className="flex flex-wrap justify-center gap-2 min-h-8">
                {pub.misses.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1.5 h-8 px-3.5 cut-sm text-sm font-semibold" style={{ background: "color-mix(in srgb, var(--danger) 16%, var(--surf2))" }}>
                    <span aria-hidden="true" className="text-danger">
                      ✕
                    </span>
                    {LITE_BY_ID[m]?.names[namesLang] ?? m}
                  </span>
                ))}
              </div>
              {pub.step >= 6 && (
                <button type="button" className="tl text-sm" onClick={() => finish(true)}>
                  {t("Je donne ma langue au chat")}
                </button>
              )}
            </>
          )}

          {bonus && (
            <div className="rise flex flex-col items-center gap-3 w-full">
              <span className="font-d font-bold text-lg tracking-[0.04em] uppercase">
                {t("Bonus : quel est ce skin ?")} <span className="text-acc">+{SPLASH_SKIN_POINTS}</span>
              </span>
              <span className="text-[13.5px] text-mut">{t("Une seule tentative.")}</span>
              <div role="group" aria-label={t("Choix du skin")} className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                {pub.skinChoices.map((k) => (
                  <button key={k.num} type="button" onClick={() => pickSkin(k.num)} className="h-[54px] px-3.5 border-0 bg-surf2 text-ink para cursor-pointer font-bold text-[14.5px]">
                    {k.names[namesLang]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
        {flow.side}
      </main>

      {round.over && (
        <EndDialog
          flow={flow}
          width={580}
          pad="pt-0"
          visual={<img src={img} alt={reveal?.skin?.[namesLang] ?? ""} className="block w-full object-cover" style={{ aspectRatio: "1215 / 600", objectPosition: "50% 25%" }} />}
          label={`${t("Splash mystère")} · ${flow.ctx === "defi" ? t("défi du jour") : flow.ctx === "streamer" ? t("stream") : t("classique")} · ${flow.multi ? t("groupe") : t("solo")}`}
          title={
            <>
              {pub.found ? t("C’était") : t("Raté, c’était")} <span className="text-acc">{champ?.names[namesLang] ?? "…"}</span>
            </>
          }
          stats={[
            { v: tries, l: t("Essais"), acc: true },
            { v: pointsText(t, flow, round.points?.base ?? 0), l: pointsLabel(t, flow) },
            { v: skinFound ? "✓" : "✕", l: t("Bonus skin"), color: skinFound ? "var(--ok)" : "var(--mut)" }
          ]}
        >
          {reveal?.skin && <span className="-mt-1.5 text-[15px] text-mut">{t("Skin : {name}", { name: reveal.skin[namesLang] })}</span>}
          {flow.ctx === "defi" && <span className="text-[13px] text-mut">{t("{c} points pour le champion, {s} pour le skin", { c: SPLASH_CHAMPION_POINTS, s: SPLASH_SKIN_POINTS })}</span>}
        </EndDialog>
      )}
    </div>
  );
}

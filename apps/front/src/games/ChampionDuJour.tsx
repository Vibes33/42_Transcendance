import { useMemo, useState } from "react";
import { ATTRIBUTE_LABELS, CHIBI_BY_KEY, LITE_BY_ID, squareImg, type ChampionAttributes } from "@loltr/content/lite";
import { CDJ_MAX_MS, CDJ_MAX_TRIES } from "@loltr/shared";
import { AnswerInput, EndDialog, GameBar, modeSub, pointsLabel, pointsText, useChampionOptions } from "../components/game";
import { useT } from "../i18n";
import { clock, useNow } from "../lib/time";
import { useMe } from "../state/app";
import type { GameProps } from "./types";

// Champion du jour (proposition A de la maquette) : chaque essai ajoute une ligne de 7 cases qui se
// retournent une à une. Les indices utilisent une icône en plus de la couleur (✓ ≈ ✕, flèches pour l'année).

type Code = "g" | "p" | "r" | "u" | "d";
interface Pub {
  guesses: { champion: string; codes: Code[] }[];
  tries: number;
  maxTries: number;
  deadline: number;
  found: boolean;
  over: boolean;
}

const COLS = ["Genre", "Rôle", "Espèce", "Ressource", "Portée", "Région(s)", "Année"] as const;
const BG: Record<Code, string> = { g: "var(--cell-ok)", p: "var(--part)", r: "var(--ko)", u: "var(--ko)", d: "var(--ko)" };
const GLYPH: Record<Code, string> = { g: "✓", p: "≈", r: "✕", u: "↑", d: "↓" };
const WORD: Record<Code, string> = { g: "correct", p: "partiel", r: "incorrect", u: "le champion est sorti plus tard", d: "le champion est sorti plus tôt" };

function values(a: ChampionAttributes, lang: "fr" | "en"): string[] {
  const L = ATTRIBUTE_LABELS;
  return [
    L.gender[a.gender][lang],
    a.positions.map((p) => L.position[p][lang]).join(", "),
    a.species.map((s) => L.species[s][lang]).join(", "),
    L.resource[a.resource][lang],
    a.range.map((r) => L.range[r][lang]).join(", "),
    a.regions.map((r) => L.region[r][lang]).join(", "),
    String(a.year)
  ];
}

export function ChampionDuJour({ round, act, flow, groupSize, namesLang }: GameProps<Pub>) {
  const t = useT();
  const me = useMe();
  const tick = useNow(1000);
  const pub = round.public;
  // En démo (tutoriel), le temps est figé au départ de la manche
  const now = flow.demo ? pub.deadline - CDJ_MAX_MS : tick;
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const options = useChampionOptions(namesLang, (id) => !!LITE_BY_ID[id]?.attributes);
  const exclude = useMemo(() => new Set(pub.guesses.map((g) => g.champion)), [pub.guesses]);

  const multi = flow.multi;
  const tile = multi ? 74 : 84;
  const gap = multi ? 6 : 8;
  const tableW = 8 * tile + 7 * gap;
  const cellFont = tile < 80 ? 12 : 13;

  const guess = async (a: { champion?: string; text?: string }) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await act({ type: "guess", ...a }).catch((e) => {
      setError((e as Error).message);
      return null;
    });
    if (res?.feedback?.champion) setFresh(res.feedback.champion);
    setBusy(false);
  };

  const target = (round.reveal as { target?: string } | null)?.target ?? null;
  const tc = target ? LITE_BY_ID[target] : null;
  const chibi = target ? CHIBI_BY_KEY[target] : null;
  const showEnd = round.over;
  const leftMs = Math.max(0, pub.deadline - now);
  const rows = [...pub.guesses].reverse();

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(900px 600px at 50% 40%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar game="cdj" sub={multi ? undefined : modeSub(t, flow, groupSize)} counterLabel={t("Essais")} counter={`${pub.tries}/${pub.maxTries ?? CDJ_MAX_TRIES}`} onQuit={flow.onQuit} />
      <main className="flex-auto min-h-0 flex flex-wrap items-stretch justify-center gap-x-10 gap-y-6 pt-3.5 pb-6 gutter">
        <section aria-label={t("Partie")} className="min-w-0 min-h-0 max-h-full flex flex-col items-center gap-3.5" style={{ flex: `0 1 ${tableW}px` }}>
          <AnswerInput
            options={options}
            exclude={exclude}
            onAnswer={guess}
            disabled={round.over || busy}
            placeholder={t("Tape le nom d’un champion…")}
            tuto="cdj-input"
            width={`${Math.max(560, Math.min(tableW, 680))}px`}
          />
          <span role="status" className="min-h-5 text-sm" style={{ color: error ? "var(--danger)" : "var(--mut)" }}>
            {error || (!round.over ? t("{n} essais restants · {time}", { n: (pub.maxTries ?? CDJ_MAX_TRIES) - pub.tries, time: clock(leftMs) }) : "")}
          </span>
          <div className="w-full overflow-x-auto scroll flex-auto min-h-0 flex flex-col" data-tuto="cdj-grid">
            <div className="flex-auto min-h-0 flex flex-col pt-1.5 mx-auto" style={{ gap, width: tableW }}>
              <div role="row" className="grid" style={{ gridTemplateColumns: `repeat(8, ${tile}px)`, gap }}>
                {["Champion", ...COLS].map((h) => (
                  <span
                    key={h}
                    role="columnheader"
                    className="flex items-end justify-center min-h-[30px] pb-1.5 border-b-2 border-line font-bold leading-[1.1] text-center tracking-[0.03em] uppercase text-mut"
                    style={{ fontSize: 12 }}
                  >
                    {t(h)}
                  </span>
                ))}
              </div>
              <div className="scroll flex-auto min-h-0 overflow-y-auto flex flex-col" role="rowgroup" style={{ gap, maxHeight: "calc(100vh - 330px)" }}>
                {rows.map((g) => {
                  const c = LITE_BY_ID[g.champion];
                  const vals = c?.attributes ? values(c.attributes, namesLang) : COLS.map(() => "?");
                  const isFresh = fresh === g.champion;
                  const right = g.codes.every((x) => x === "g");
                  return (
                    <div role="row" key={g.champion} className="grid" style={{ gridTemplateColumns: `repeat(8, ${tile}px)`, gap }}>
                      <span role="cell" title={c?.names[namesLang]} aria-label={c?.names[namesLang]} className="p-[2px] box-border cut-sm" style={{ height: tile, background: right ? "var(--cell-ok)" : "var(--line)" }}>
                        <span className="block w-full h-full overflow-hidden cut-sm bg-surf2">
                          {c && <img src={squareImg(c)} alt="" className="block w-full h-full object-cover" />}
                        </span>
                      </span>
                      {g.codes.map((code, i) => (
                        <span
                          key={i}
                          role="cell"
                          aria-label={`${t(COLS[i])} : ${vals[i]}, ${t(WORD[code])}`}
                          className={`relative flex items-center justify-center p-1 box-border overflow-hidden cut-sm text-white font-bold leading-[1.15] text-center ${isFresh ? "flip" : ""}`}
                          style={{ height: tile, background: BG[code], fontSize: cellFont, overflowWrap: "anywhere", animationDelay: isFresh ? `${i * 0.22}s` : "0s" }}
                        >
                          {(code === "u" || code === "d") && (
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="absolute inset-1.5 opacity-[.28]" style={{ width: "calc(100% - 12px)", height: "calc(100% - 12px)", transform: code === "d" ? "rotate(180deg)" : "none" }}>
                              <path d="M12 2l9 10h-5.5v10h-7V12H3z" fill="#FFFFFF" />
                            </svg>
                          )}
                          <span aria-hidden="true" className="absolute top-[3px] right-[5px] text-[11px] opacity-80">
                            {GLYPH[code]}
                          </span>
                          <span className="relative">{vals[i]}</span>
                        </span>
                      ))}
                    </div>
                  );
                })}
                {rows.length === 0 && <span className="py-7 text-center text-[15px] text-mut">{t("Tes essais apparaîtront ici, du plus récent au plus ancien.")}</span>}
              </div>
            </div>
          </div>
        </section>
        {flow.side}
      </main>

      {showEnd && (
        <EndDialog
          flow={flow}
          visual={
            chibi?.skins[0].cut ? (
              <img src={chibi.skins[0].cut} alt={tc?.names[namesLang] ?? ""} className="block h-[170px] w-auto" style={{ filter: "drop-shadow(0 12px 24px color-mix(in srgb, var(--acc) 35%, transparent))" }} />
            ) : tc ? (
              <img src={squareImg(tc)} alt={tc.names[namesLang]} className="block h-[120px] w-[120px] cut-md" />
            ) : null
          }
          label={`${t("Champion du jour")} · ${flow.ctx === "defi" ? t("défi du jour") : flow.ctx === "streamer" ? t("stream") : t("classique")} · ${flow.multi ? t("groupe") : t("solo")}`}
          title={
            <>
              {pub.found ? t("C’était") : t("Raté, c’était")} <span className="text-acc">{tc?.names[namesLang] ?? "…"}</span>
            </>
          }
          stats={[
            { v: pub.tries, l: t("Essais"), acc: true },
            { v: pointsText(t, flow, round.points?.base ?? 0), l: pointsLabel(t, flow) },
            { v: me.streak, l: t("Jours de série") }
          ]}
        >
          {tc && <span className="-mt-2 text-[15px] text-mut">{tc.titles[namesLang]}</span>}
        </EndDialog>
      )}
    </div>
  );
}

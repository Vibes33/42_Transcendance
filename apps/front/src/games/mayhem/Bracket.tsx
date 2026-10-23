import type { MayhemEntrant, MayhemTournament } from "@loltr/content/lite";
import { useT } from "../../i18n";
import { CrestBadge, entrantName } from "./util";

// Phase finale : quarts (Bo1), demies (Bo3), finale (Bo5). Les cases se placent en % de la hauteur
// disponible pour tenir dans un écran. Un tour ne dévoile ses qualifiés qu'une fois le précédent regardé.

const TOPS = [
  [12.5, 37.5, 62.5, 87.5],
  [25, 75],
  [50]
];

function Row({ ent, mine, myId, names, score, won, lost, first }: { ent: MayhemEntrant | null; mine: boolean; myId?: string; names: Record<string, string>; score: string | number; won: boolean; lost: boolean; first: boolean }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 h-10 pl-1.5 pr-3" style={{ background: mine ? "color-mix(in srgb, var(--acc) 14%, var(--surf))" : "var(--surf)", borderTop: first ? 0 : "1px solid var(--line)" }}>
      {ent ? (
        <CrestBadge entrant={ent} names={names} myId={myId} className="basis-[30px] shrink-0 w-[30px] h-[30px]" />
      ) : (
        <span className="basis-[30px] shrink-0 h-[30px] flex items-center justify-center cut-sm bg-surf2 font-d font-bold text-mut">?</span>
      )}
      <span className="flex-auto min-w-0 flex flex-col leading-tight">
        <strong className="text-[13.5px] truncate" style={{ color: !ent || lost ? "var(--mut)" : "var(--ink)" }}>
          {ent ? entrantName(t, ent, names, myId) : t("À déterminer")}
        </strong>
        {ent && <span className="text-[11px] text-mut">{t("Note {n}", { n: ent.rating })}</span>}
      </span>
      <span className="font-d font-bold text-lg" style={{ color: won ? "var(--acc)" : "var(--mut)" }}>
        {score}
      </span>
    </div>
  );
}

/**
 * `known` : tours dont les participants sont connus ; `revealed` : matchs dont le résultat est dévoilé.
 * Un match aux participants connus se regarde d'un clic (`onWatch`).
 */
export function Bracket({
  tour,
  mine,
  names,
  myId,
  known,
  revealed,
  canWatch,
  onWatch
}: {
  tour: MayhemTournament;
  mine: number;
  names: Record<string, string>;
  myId?: string;
  known: number;
  revealed: (ri: number) => boolean;
  canWatch: (ri: number, mi: number) => boolean;
  onWatch: (ri: number, mi: number) => void;
}) {
  const t = useT();
  const labels = [t("Quarts · Bo1"), t("Demies · Bo3"), t("Finale · Bo5")];
  return (
    <div className="h-full min-h-[460px] flex flex-col gap-2">
      <div className="shrink-0 grid gap-x-7" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        {labels.map((l) => (
          <span key={l} className="label">
            {l}
          </span>
        ))}
      </div>
      <div className="relative flex-1 min-h-0 grid gap-x-7 [container-type:size]" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        {tour.rounds.map((round, ri) => (
          <div key={ri} className="relative">
            {round.map((m, mi) => {
              const isKnown = ri < known;
              const isShown = revealed(ri);
              const watchable = isKnown && canWatch(ri, mi);
              const mineIn = isKnown && (m.a === mine || m.b === mine);
              return (
                <div key={mi} className="absolute inset-x-0 -translate-y-1/2" style={{ top: TOPS[ri][mi] + "%" }}>
                  {/* Liaison vers le tour suivant */}
                  {ri < 2 && (
                    <span aria-hidden="true" className="absolute left-full w-3.5 h-[2px] bg-line" style={{ top: "50%" }}>
                      <span className="absolute right-0 w-[2px] bg-line" style={mi % 2 === 0 ? { top: 0, height: `calc(${(TOPS[ri][1] - TOPS[ri][0]) / 2}cqh + 1px)` } : { bottom: 0, height: `calc(${(TOPS[ri][1] - TOPS[ri][0]) / 2}cqh + 1px)` }} />
                    </span>
                  )}
                  {ri > 0 && <span aria-hidden="true" className="absolute right-full w-3.5 h-[2px] bg-line" style={{ top: "50%" }} />}
                  <button
                    type="button"
                    disabled={!watchable}
                    onClick={() => onWatch(ri, mi)}
                    aria-label={isKnown ? t("Regarder {a} contre {b}", { a: entrantName(t, tour.entrants[m.a], names, myId), b: entrantName(t, tour.entrants[m.b], names, myId) }) : t("Match à déterminer")}
                    className="group/m block w-full p-[1.5px] border-0 cut-sm text-left text-ink cursor-pointer disabled:cursor-default"
                    style={{ background: mineIn ? "var(--acc)" : "var(--line)" }}
                  >
                    <div className="relative flex flex-col bg-surf cut-sm">
                      {[m.a, m.b].map((e, k) => (
                        <Row key={k} first={k === 0} ent={isKnown ? tour.entrants[e] : null} mine={isKnown && e === mine} myId={myId} names={names} score={isShown ? m.wins[k] : isKnown ? 0 : "–"} won={isShown && m.winner === e} lost={isShown && m.winner !== e} />
                      ))}
                      {watchable && (
                        <span className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 group-hover/m:opacity-100 group-focus-visible/m:opacity-100 transition-opacity font-d font-bold text-xs tracking-[0.06em] uppercase" style={{ background: "color-mix(in srgb, var(--bg) 70%, transparent)" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          {isShown ? t("Revoir") : t("Regarder")}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

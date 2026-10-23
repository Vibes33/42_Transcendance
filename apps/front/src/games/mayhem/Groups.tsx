import { MAYHEM_GROUP_DAYS, groupRecord, type MayhemGroup, type MayhemTournament } from "@loltr/content/lite";
import { useT } from "../../i18n";
import { entrantColor, entrantName, entrantTag } from "./util";

// Phase de poules : 4 poules de 4, chacun contre chacun en Bo1 sur 3 journées. Les bilans se
// dévoilent journée après journée ; les 2 premiers de chaque poule vont en quarts.

function standingsAt(g: MayhemGroup, days: number, tour: MayhemTournament) {
  if (days >= MAYHEM_GROUP_DAYS) return g.standings;
  return [...g.members].sort((x, y) => groupRecord(g, y, days).wins - groupRecord(g, x, days).wins || tour.entrants[y].rating - tour.entrants[x].rating);
}

export function Groups({ tour, mine, names, myId, days }: { tour: MayhemTournament; mine: number; names: Record<string, string>; myId?: string; days: number }) {
  const t = useT();
  const done = days >= MAYHEM_GROUP_DAYS;
  return (
    <div className="h-full min-h-[460px] grid gap-3.5 grid-cols-1 md:grid-cols-2 md:grid-rows-2">
      {tour.groups.map((g) => {
        const last = days > 0 ? g.matches.slice((days - 1) * 2, days * 2) : [];
        return (
          <section key={g.name} aria-label={t("Poule {name}", { name: g.name })} className="min-h-0 flex flex-col gap-2 p-3.5 bg-surf cut-md" style={g.members.includes(mine) ? { boxShadow: "inset 0 0 0 1.5px var(--acc)" } : undefined}>
            <div className="flex items-baseline justify-between gap-3">
              <strong className="font-d text-lg uppercase">{t("Poule {name}", { name: g.name })}</strong>
              <span className="label !text-xs">{done ? t("Terminée") : days === 0 ? t("À venir") : t("Journée {n} sur {max}", { n: days, max: MAYHEM_GROUP_DAYS })}</span>
            </div>
            <ol className="m-0 p-0 list-none flex flex-col gap-1">
              {standingsAt(g, days, tour).map((e, i) => {
                const ent = tour.entrants[e];
                const rec = groupRecord(g, e, days);
                const qualified = done && i < 2;
                return (
                  <li key={e} className="flex items-center gap-2.5 h-9 px-2.5 cut-sm" style={{ background: e === mine ? "color-mix(in srgb, var(--acc) 14%, var(--surf2))" : "var(--surf2)" }}>
                    <span className="basis-4 shrink-0 font-d font-bold text-sm text-mut">{i + 1}</span>
                    <span className="basis-[34px] shrink-0 h-6 flex items-center justify-center cut-sm font-d font-bold text-[11px] text-white" style={{ background: entrantColor(ent, myId) }}>
                      {entrantTag(ent, names)}
                    </span>
                    <span className="flex-auto min-w-0 text-sm font-semibold truncate">{entrantName(t, ent, names, myId)}</span>
                    <span className="text-xs text-mut">{t("Note {n}", { n: ent.rating })}</span>
                    <span className="basis-12 shrink-0 text-right font-d font-bold text-sm">
                      {rec.wins}–{rec.losses}
                    </span>
                    <span className="basis-5 shrink-0 font-d font-bold text-xs" style={{ color: qualified ? "var(--ok)" : "transparent" }} aria-label={qualified ? t("Qualifié") : undefined}>
                      Q
                    </span>
                  </li>
                );
              })}
            </ol>
            {last.length > 0 && (
              <div className="mt-auto flex flex-col gap-0.5 text-xs text-mut">
                {last.map((m, k) => (
                  <span key={k} className="truncate">
                    {t("{a} bat {b}", { a: entrantName(t, tour.entrants[m.winner], names, myId), b: entrantName(t, tour.entrants[m.winner === m.a ? m.b : m.a], names, myId) })}
                  </span>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

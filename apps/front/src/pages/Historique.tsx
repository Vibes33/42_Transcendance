import { useHistory, type HistoryDay } from "../api/queries";
import { glow } from "../components/ui";
import { fmt, plural, useLang, useT } from "../i18n";
import { CARD_BY_KEY } from "../lib/games";
import { dayLabel, resultLine, topLabel } from "../lib/results";

// Historique du défi du jour : chaque journée jouée, avec le résultat, le percentile et les points
// de chaque jeu. Le jour en cours et la veille (avant 3 h 30) restent prévisionnels.

export function Historique() {
  const t = useT();
  const history = useHistory();
  const list = history.data ?? [];
  const played = list.length;
  const sum = list.reduce((s, d) => s + d.total, 0);
  const best = list.reduce((m, d) => Math.max(m, d.total), 0);

  return (
    <div className="relative flex-auto flex flex-col" style={{ background: glow("900px 520px at 50% 300px", 18) }}>
      <section className="w-full max-w-[1100px] mx-auto flex flex-col gap-7 pt-12 pb-14 gutter box-border">
        <div className="flex flex-col gap-3">
          <h1 className="m-0 font-d font-bold leading-[1.02] uppercase" style={{ fontSize: "clamp(34px, 4vw, 56px)" }}>
            {t("Historique")} <span className="text-acc">{t("des parties")}</span>
          </h1>
          <p className="m-0 max-w-[640px] text-[16px] leading-relaxed text-mut">
            {t("Tes défis du jour, jeu par jeu. Le classement d’une journée reste prévisionnel jusqu’à sa clôture, le lendemain à 3:30.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-4 pb-[22px] border-b border-line">
          <Big label={t("Jours joués")} value={fmt(played)} />
          <Big label={t("Points cumulés")} value={fmt(sum)} />
          <Big label={t("Meilleure journée")} value={t("{n} pts", { n: fmt(best) })} />
        </div>
        {history.isLoading ? (
          <span className="text-mut">{t("Chargement…")}</span>
        ) : list.length === 0 ? (
          <span className="text-mut">{t("Aucun défi joué pour l’instant. Ton premier défi du jour apparaîtra ici.")}</span>
        ) : (
          <ol className="m-0 p-0 list-none flex flex-col gap-3.5">
            {list.map((d) => (
              <DayCard key={d.day} d={d} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function DayCard({ d }: { d: HistoryDay }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const succeeded = d.games.filter((g) => g.base > 0).length;
  // Bonus de percentile pas encore versé (jour non clos)
  const pending = d.final ? 0 : d.games.reduce((s, g) => s + g.bonus, 0);
  return (
    <li className="p-[1.5px] bg-line cut-md">
      <div className="flex flex-col gap-3.5 px-5 py-4 bg-surf cut-md">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="font-d font-bold text-lg first-letter:uppercase">{dayLabel(d.day, lang)}</span>
          <span className="px-2 py-1 cut-sm font-d font-bold text-[11px] tracking-[0.1em] uppercase" style={{ background: d.final ? "var(--surf2)" : "color-mix(in srgb, var(--acc) 22%, var(--surf2))", color: d.final ? "var(--mut)" : "var(--acc)" }}>
            {d.final ? t("Définitif") : t("Prévisionnel")}
          </span>
          {!d.completed && <span className="text-[13px] text-mut">{t("Défi incomplet")}</span>}
          <span className="ml-auto text-[13.5px] text-mut">{t("{n} " + plural(succeeded, "jeu réussi", "jeux réussis"), { n: succeeded })}</span>
          <span className="flex flex-col items-end">
            <span className="font-d font-bold text-[22px] text-acc">{t("{n} pts", { n: fmt(d.total) })}</span>
            {pending > 0 && <span className="text-[12.5px] font-semibold text-warn">{t("dont +{n} en attente", { n: fmt(pending) })}</span>}
          </span>
        </div>
        {!d.final && <span className="-mt-1.5 text-[13px] text-mut">{t("Les points de classement (selon ton percentile) sont prévisionnels : ils sont versés à la clôture de la journée, le lendemain à 3:30.")}</span>}
        <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {d.games.map((g) => (
            <li key={g.game} className="flex items-center gap-3 p-2 pr-3 bg-surf2 cut-sm">
              <span className="basis-11 shrink-0 h-11 overflow-hidden cut-sm">
                <img src={CARD_BY_KEY[g.game].img} alt="" className="block w-full h-full object-cover" />
              </span>
              <span className="min-w-0 flex flex-col gap-0.5">
                <span className="font-d font-bold text-[14.5px] truncate">{t(CARD_BY_KEY[g.game].name)}</span>
                <span className="text-[12.5px] text-mut truncate">{resultLine(g)}</span>
                <span className="flex items-baseline gap-2">
                  <span className={`font-d font-bold text-[13px] ${g.ranked ? "text-acc" : "text-mut"}`}>{topLabel(g.ranked ? g.top : null, g.players)}</span>
                  {d.final ? (
                    <span className={`font-d font-bold text-[13px] ${g.projected > 0 ? "text-ok" : "text-mut"}`}>+{fmt(g.projected)}</span>
                  ) : (
                    <span className={`font-d font-bold text-[13px] ${g.base > 0 ? "text-ok" : "text-mut"}`}>+{fmt(g.base)}</span>
                  )}
                </span>
                {!d.final && g.bonus > 0 && <span className="font-d font-bold text-[12.5px] text-warn">{t("+{n} en attente", { n: fmt(g.bonus) })}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <span className="font-d font-bold text-[26px]">{value}</span>
    </div>
  );
}

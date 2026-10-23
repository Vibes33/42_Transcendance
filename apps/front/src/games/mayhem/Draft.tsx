import { MAYHEM_JOKERS, MAYHEM_LINK_CAP, MAYHEM_PLACE_LABEL, MAYHEM_ROLES, MAYHEM_ROLE_LABEL, MAYHEM_TEAM_BY_ID, mayhemLabel, type MayhemRole } from "@loltr/content/lite";
import { plural, useT } from "../../i18n";
import { Head, Rift, RoleIcon, rosterOf, type MayhemPub } from "./util";

// Draft : à gauche l'équipe tirée au sort (un joueur par poste libre, 3 jokers), au centre la carte
// avec les joueurs choisis à leur poste et leurs liens, à droite la note d'équipe. Tient sur un écran :
// la carte prend la hauteur disponible et ses pastilles sont proportionnées à sa taille.

/** Place de chaque poste sur la carte du draft (en %). */
const SLOT: Record<MayhemRole, [number, number]> = { top: [13, 26], jgl: [27, 56], mid: [50, 46], adc: [86, 80], sup: [66, 87] };

export function Draft({ pub, busy, rolling, onPick, onReroll, onLock }: { pub: MayhemPub; busy: boolean; rolling: string | null; onPick: (i: number) => void; onReroll: () => void; onLock: () => void }) {
  const t = useT();
  const roster = rosterOf(pub.picks);
  const filled = roster.filter(Boolean).length;
  const complete = filled === 5;
  const shown = rolling ? MAYHEM_TEAM_BY_ID[rolling] : pub.current ? MAYHEM_TEAM_BY_ID[pub.current] : null;
  const r = pub.rating;
  const lines = r.links.filter((l) => l.roles);

  return (
    <div className="flex-1 min-h-0 grid gap-x-6 gap-y-4 pt-3 pb-4 gutter grid-cols-1 lg:grid-cols-[minmax(270px,330px)_minmax(0,1fr)_minmax(270px,330px)] max-lg:overflow-y-auto">
      <aside aria-label={t("Tirage des équipes")} className="min-h-0 flex flex-col gap-3">
        {shown && !complete ? (
          <div className="shrink-0 p-[1.5px] bg-line cut-md" data-tuto="mayhem-draw">
            <div className="flex flex-col gap-3 p-4 bg-surf cut-md">
              <div className="flex justify-between items-center gap-3">
                <span className="label">{t("Tirage {n}", { n: pub.history.length + 1 })}</span>
                <span className="label !text-acc">{rolling ? t("Tirage en cours…") : t("Équipe tirée au sort")}</span>
              </div>
              <div key={shown.id + (rolling ? "r" : "")} className={"flex items-center gap-3 " + (rolling ? "opacity-60" : "appear")}>
                <span className="basis-12 shrink-0 h-12 flex items-center justify-center cut-sm font-d font-bold text-base text-white" style={{ background: shown.color }}>
                  {shown.tag}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="font-d font-bold text-[22px] leading-tight">
                    {shown.org} <span className="text-acc">{shown.year}</span>
                  </span>
                  <span className="text-[13px] text-mut">{t("Worlds {year} · {result}", { year: shown.year, result: t(MAYHEM_PLACE_LABEL[shown.place]) })}</span>
                </span>
              </div>
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {shown.players.map((p, i) => {
                  const role = MAYHEM_ROLES[i];
                  const taken = !!pub.picks[role];
                  return (
                    <li key={role}>
                      <button
                        type="button"
                        onClick={() => onPick(i)}
                        disabled={taken || !!rolling || busy}
                        aria-label={t("{name}, {role}, note {ovr}", { name: p.name, role: t(MAYHEM_ROLE_LABEL[role]), ovr: p.ovr }) + (taken ? ", " + t("poste déjà pris") : "")}
                        className="flex items-center gap-2.5 w-full min-h-[48px] py-1 pl-1 pr-3 border-0 bg-surf2 cut-sm text-left text-ink cursor-pointer disabled:cursor-not-allowed hover:enabled:bg-[color-mix(in_srgb,var(--acc)_18%,var(--surf2))]"
                        style={{ opacity: rolling ? 0.3 : taken ? 0.45 : 1 }}
                      >
                        <Head name={p.name} color={shown.color} className="basis-10 shrink-0 w-10 h-10 cut-sm text-sm" />
                        <span className="flex-auto min-w-0 flex flex-col">
                          <span className="font-d font-bold text-[15.5px] leading-tight">{p.name}</span>
                          <span className="text-xs text-mut">{t(MAYHEM_ROLE_LABEL[role]) + (rolling ? "" : taken ? " · " + t("poste déjà pris") : " · " + t("libre"))}</span>
                        </span>
                        <RoleIcon role={role} size={20} className="shrink-0 text-mut" />
                        <span className="basis-9 shrink-0 text-right font-d font-bold text-xl" style={{ color: taken ? "var(--mut)" : "var(--acc)" }}>
                          {p.ovr}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
                <div className="flex items-center gap-1.5" aria-label={t("{n} jokers sur {max}", { n: pub.jokers, max: MAYHEM_JOKERS })}>
                  <span className="label mr-1">{t("Jokers")}</span>
                  {Array.from({ length: MAYHEM_JOKERS }, (_, i) => (
                    <span key={i} className="w-[18px] h-[18px] cut-sm" style={{ background: i < pub.jokers ? "var(--acc)" : "var(--surf2)" }} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onReroll}
                  aria-label={t("Relancer l’équipe")}
                  disabled={pub.jokers === 0 || !!rolling || busy}
                  className="shrink-0 flex items-center gap-2 h-11 px-5 border-0 para font-d font-bold text-[13px] tracking-[0.04em] uppercase whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                  style={{ background: pub.jokers === 0 ? "var(--surf2)" : "var(--ink)", color: pub.jokers === 0 ? "var(--mut)" : "var(--bg)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 3v5h5M4 13a8 8 0 0 0 14.6 4.5L20 16M20 21v-5h-5" />
                  </svg>
                  {t("Relancer")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="shrink-0 p-[1.5px] bg-acc cut-md">
            <div className="flex flex-col gap-2 p-4 bg-surf cut-md">
              <span className="label !text-acc">{t("Draft terminé")}</span>
              <span className="font-d font-bold text-2xl leading-tight">{t("Les 5 postes sont pris")}</span>
              <span className="text-sm leading-normal text-mut">{t("Phase de poules puis phase finale : quarts en Bo1, demies en Bo3, finale en Bo5.")}</span>
            </div>
          </div>
        )}
        <div className="flex-1 min-h-[120px] flex flex-col gap-2 py-3 px-4 bg-surf cut-md overflow-hidden">
          <span className="label shrink-0">{t("Tirages précédents")}</span>
          {pub.history.length === 0 && <span className="text-sm text-mut">{t("Aucun tirage pour l’instant.")}</span>}
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5 overflow-y-auto scroll min-h-0">
            {[...pub.history].reverse().map((h, i) => {
              const tm = MAYHEM_TEAM_BY_ID[h.t];
              return (
                <li key={i} className="flex items-center gap-2.5 text-sm">
                  <span className="basis-[34px] shrink-0 h-[22px] flex items-center justify-center cut-sm font-d font-bold text-[11px] text-white" style={{ background: tm.color }}>
                    {tm.tag}
                  </span>
                  <span className="flex-auto text-mut truncate">{mayhemLabel(tm)}</span>
                  <span className="font-bold" style={{ color: h.what ? "var(--ink)" : "var(--mut)" }}>
                    {h.what ?? t("Relancé")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <section aria-label={t("Ton équipe sur la carte")} className="min-h-0 max-lg:h-[min(90vw,640px)] [container-type:size]">
        <div className="relative mx-auto aspect-square [container-type:size]" style={{ width: "min(100cqw, 100cqh)" }} data-tuto="mayhem-map">
          <div className="absolute inset-0 p-[2px] cut-lg" style={{ background: "color-mix(in srgb, var(--acc) 45%, var(--line))" }}>
            <div className="relative w-full h-full overflow-hidden cut-lg">
              <Rift />
            </div>
          </div>
          {lines.map((l, i) => {
            const [ax, ay] = SLOT[l.roles![0]];
            const [bx, by] = SLOT[l.roles![1]];
            const dx = bx - ax;
            const dy = by - ay;
            const strong = l.bonus >= 3;
            return (
              <div key={i}>
                <div className="absolute pointer-events-none" style={{ left: ax + "%", top: ay + "%", width: Math.hypot(dx, dy) + "%", height: strong ? 5 : 3, background: strong ? "var(--acc)" : "color-mix(in srgb, var(--acc) 55%, transparent)", transform: `translateY(-50%) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}deg)`, transformOrigin: "0 50%" }} />
                <span className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-bg cut-sm font-d font-bold text-xs" style={{ left: ax + dx / 2 + "%", top: ay + dy / 2 + "%", color: strong ? "var(--acc)" : "var(--ink)" }}>
                  +{l.bonus}
                </span>
              </div>
            );
          })}
          {MAYHEM_ROLES.map((role, i) => {
            const p = roster[i];
            const free = !p && !!shown && !complete && !rolling;
            return (
              <div key={role} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1" style={{ left: SLOT[role][0] + "%", top: SLOT[role][1] + "%", width: "20cqw" }}>
                {p ? (
                  <>
                    <div className="appear relative" style={{ width: "12.5cqw", height: "12.5cqw" }}>
                      <div className="w-full h-full p-[2px] bg-acc cut-sm">
                        <Head name={p.name} color={p.team.color} className="w-full h-full cut-sm text-xl" />
                      </div>
                      <span className="absolute -right-3 -top-2.5 px-1.5 h-6 flex items-center bg-acc text-on-acc cut-sm font-d font-bold text-sm">{p.ovr}</span>
                    </div>
                    <div className="flex flex-col items-center px-2 py-0.5 cut-sm max-w-full" style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}>
                      <span className="font-d font-bold text-sm truncate max-w-full">{p.name}</span>
                      <span className="text-[11px] text-mut whitespace-nowrap">
                        {p.team.tag} {p.team.year}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={(free ? "pulse " : "") + "flex items-center justify-center cut-sm"} style={{ width: "12.5cqw", height: "12.5cqw", background: free ? "color-mix(in srgb, var(--acc) 22%, var(--surf2))" : "var(--surf2)", color: free ? "var(--acc)" : "var(--mut)" }}>
                      <RoleIcon role={role} size={28} />
                    </div>
                    <span className="px-2 py-0.5 cut-sm font-d font-bold text-xs tracking-[0.04em] uppercase whitespace-nowrap" style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", color: free ? "var(--acc)" : "var(--mut)" }}>
                      {t(MAYHEM_ROLE_LABEL[role])}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <aside aria-label={t("Note de l’équipe")} className="min-h-0 flex flex-col gap-3">
        <div className="shrink-0 p-[1.5px] bg-line cut-md" data-tuto="mayhem-score">
          <div className="flex flex-col gap-2.5 p-4 bg-surf cut-md">
            <span className="label">{t("Note d’équipe")}</span>
            <div className="flex items-baseline gap-2">
              <span className="font-d font-bold text-[72px] leading-[0.9] text-acc">{filled ? r.rating : "–"}</span>
              <span className="font-d font-bold text-xl text-mut">/100</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex-auto flex gap-1">
                {MAYHEM_ROLES.map((role) => (
                  <span key={role} className="flex-1 h-1.5" style={{ background: pub.picks[role] ? "var(--acc)" : "var(--surf2)" }} />
                ))}
              </div>
              <span className="text-[13px] font-bold">{t("{n}/5 postes", { n: filled })}</span>
            </div>
            <div className="flex flex-col gap-1 pt-2 border-t border-line text-sm">
              <div className="flex justify-between">
                <span className="text-mut">{t("Moyenne des cartes")}</span>
                <strong>{filled ? r.avg.toFixed(1) : "–"}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-mut">{t("Liens d’équipe (max +{n})", { n: MAYHEM_LINK_CAP })}</span>
                <strong className="text-acc">+{r.linkBonus}</strong>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-[120px] flex flex-col gap-2 py-3 px-4 bg-surf cut-md overflow-hidden">
          <span className="label shrink-0">{t("Liens actifs")}</span>
          {r.links.length === 0 && <span className="text-sm leading-normal text-mut">{t("Aucun lien pour l’instant : associe des joueurs du même roster, ou de la même structure.")}</span>}
          <ul className="m-0 p-0 list-none flex flex-col gap-1 overflow-y-auto scroll min-h-0">
            {r.links.map((l, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5 px-2.5 bg-surf2 cut-sm">
                <span className="flex-auto min-w-0 flex flex-col">
                  <strong className="text-[13.5px] truncate">{l.names}</strong>
                  <span className="text-xs text-mut truncate">
                    {l.same === "noyau" ? t("Noyau de {n} joueurs du même roster", { n: l.ref }) : t("{kind} · {same} ({ref})", { kind: t(l.kind), same: l.same === "roster" ? t("même roster") : t("même structure"), ref: l.ref })}
                  </span>
                </span>
                <span className="font-d font-bold text-acc">+{l.bonus}</span>
              </li>
            ))}
          </ul>
          <span className="shrink-0 text-[11.5px] leading-snug text-mut">{t("Duo bot +4 · mid-jungle +3 · top-jungle et jungle-support +2 · autre paire du même roster +1 · même structure : moitié · 3 du même roster +3")}</span>
        </div>
        <div className="shrink-0 flex flex-col gap-2 py-3 px-4 bg-surf cut-md">
          <button
            type="button"
            onClick={onLock}
            disabled={!complete || busy}
            className="h-[52px] border-0 para font-d font-bold text-base tracking-[0.05em] uppercase cursor-pointer disabled:cursor-not-allowed"
            style={{ background: complete ? "var(--acc)" : "var(--surf2)", color: complete ? "var(--on-acc)" : "var(--mut)" }}
          >
            {pub.group ? t("Valider mon équipe") : t("Lancer le tournoi")}
          </button>
          <span className="text-[13px] leading-snug text-mut text-center">
            {!complete
              ? t(plural(5 - filled, "Encore {n} poste à pourvoir", "Encore {n} postes à pourvoir"), { n: 5 - filled })
              : pub.group
                ? t("Le tournoi démarre quand tout le groupe a validé son équipe")
                : t("16 équipes : ta poule, puis la phase finale")}
          </span>
        </div>
      </aside>
    </div>
  );
}

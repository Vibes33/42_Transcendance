import { useMemo, useState } from "react";
import { MAYHEM_CRESTS, MAYHEM_CREST_BY_ID, MAYHEM_NAME_MAX } from "@loltr/content/lite";
import { useT } from "../../i18n";
import { CrestLogo } from "./util";

// Avant le draft : l'écusson de l'équipe (structures passées par les Worlds 2020-2025, plus Karmine
// Corp) et son nom, prérempli avec celui de la structure et modifiable. Le dernier choix est retenu.

const LAST = "loltr:mayhem-ecusson";

function lastChoice(): { id: string; name: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST) ?? "null");
    return v && MAYHEM_CREST_BY_ID[v.id] ? v : null;
  } catch {
    return null;
  }
}

export function CrestPicker({ busy, onConfirm }: { busy: boolean; onConfirm: (id: string, name: string) => void }) {
  const t = useT();
  const prev = useMemo(lastChoice, []);
  const [sel, setSel] = useState(prev?.id ?? MAYHEM_CRESTS[0].id);
  const [name, setName] = useState(prev?.name ?? MAYHEM_CRESTS[0].name);
  // Tant que le nom n'a pas été retouché, il suit l'écusson choisi
  const [edited, setEdited] = useState(!!prev && prev.name !== MAYHEM_CREST_BY_ID[prev.id]?.name);
  const [q, setQ] = useState("");
  const crest = MAYHEM_CREST_BY_ID[sel];
  const clean = name.replace(/\s+/g, " ").trim();
  const shown = MAYHEM_CRESTS.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.tag.toLowerCase().includes(q.toLowerCase()));

  const pick = (id: string) => {
    setSel(id);
    if (!edited) setName(MAYHEM_CREST_BY_ID[id].name);
  };
  const confirm = () => {
    if (clean.length < 2) return;
    try {
      localStorage.setItem(LAST, JSON.stringify({ id: sel, name: clean }));
    } catch {
      /* stockage indisponible : le choix ne sera pas prérempli la prochaine fois */
    }
    onConfirm(sel, clean);
  };

  return (
    <div className="flex-1 min-h-0 grid gap-6 pt-3 pb-4 gutter grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] max-lg:overflow-y-auto">
      <section aria-label={t("Choisis ton écusson")} className="min-h-0 flex flex-col gap-3">
        <div className="shrink-0 flex flex-wrap items-end justify-between gap-3">
          <h1 className="m-0 font-d font-bold text-[clamp(28px,3vw,40px)] leading-none uppercase">
            {t("Choisis ton")} <span className="text-acc">{t("écusson")}</span>
          </h1>
          <label className="flex items-center gap-2 h-11 px-3 bg-surf cut-sm w-[min(100%,280px)]">
            <span className="sr-only">{t("Chercher une équipe")}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-mut">
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5L21 21" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Chercher une équipe")} className="flex-auto min-w-0 bg-transparent border-0 outline-none text-ink text-sm" />
          </label>
        </div>
        <div role="radiogroup" aria-label={t("Écussons des équipes des Worlds")} className="flex-1 min-h-0 overflow-y-auto scroll grid gap-2 content-start" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))" }}>
          {shown.map((c) => {
            const on = c.id === sel;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(c.id)}
                className="flex flex-col items-center gap-1.5 p-2 border-0 cut-sm cursor-pointer text-ink"
                style={{ background: on ? "color-mix(in srgb, var(--acc) 22%, var(--surf))" : "var(--surf)", boxShadow: on ? "inset 0 0 0 2px var(--acc)" : "none" }}
              >
                <CrestLogo crest={c} className="w-16 h-16" />
                <span className="w-full text-center text-xs font-semibold truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <aside aria-label={t("Ton équipe")} className="min-h-0 flex flex-col justify-center">
        <div className="p-[1.5px] bg-acc cut-lg">
          <div className="flex flex-col items-center gap-4 p-6 bg-surf cut-lg">
            <span className="label !text-acc self-start">{t("Ton équipe")}</span>
            <CrestLogo crest={crest} className="w-36 h-36" />
            <label className="flex flex-col gap-1.5 self-stretch">
              <span className="label">{t("Nom de l’équipe")}</span>
              <input
                value={name}
                maxLength={MAYHEM_NAME_MAX}
                onChange={(e) => {
                  setName(e.target.value);
                  setEdited(true);
                }}
                onKeyDown={(e) => e.key === "Enter" && confirm()}
                className="h-12 px-3.5 bg-surf2 border-0 cut-sm text-ink font-d font-bold text-xl outline-none focus:shadow-[inset_0_0_0_2px_var(--acc)]"
              />
              <span className="text-xs text-mut">{t("{n}/{max} caractères · prérempli avec le nom de la structure", { n: clean.length, max: MAYHEM_NAME_MAX })}</span>
            </label>
            <button type="button" onClick={confirm} disabled={busy || clean.length < 2} className="self-stretch h-[54px] border-0 para bg-acc text-on-acc cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 font-d font-bold text-base tracking-[0.05em] uppercase">
              {t("Commencer le draft")}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

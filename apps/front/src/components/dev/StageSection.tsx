import { useT } from "../../i18n";
import { animLabel, groupAnimations, useModelStage } from "../../lib/modelStage";
import { PanelBtn, Section } from "./controls";
import { TriLeft, TriRight } from "../icons";

// Rejoue une animation avec les bons accessoires, comme modelviewer.lol : les cases
// des parties suivent l'animation (liaison auto) sauf si on la coupe pour cocher à la main.
// Disposition large : sélecteur + options à gauche, liste des parties à droite.
export function StageSection() {
  const t = useT();
  const stage = useModelStage();
  const cur = stage.entries.find((e) => e.id === stage.sel) ?? stage.entries[0];
  if (!cur) {
    return (
      <Section title={t("Animation et parties")}>
        <span className="text-[13px] text-mut">{t("Aucun modèle 3D pilotable affiché.")}</span>
      </Section>
    );
  }
  const groups = groupAnimations(cur.animations, cur.stem);
  const curGid = cur.anim ?? groups.find((g) => g.parts.includes(cur.playing ?? ""))?.id;
  const idx = groups.findIndex((g) => g.id === curGid);
  const step = (d: number) => {
    if (!groups.length) return;
    stage.setAnim(cur.id, groups[idx < 0 ? (d > 0 ? 0 : groups.length - 1) : (idx + d + groups.length) % groups.length].id);
  };
  return (
    <Section title={t("Animation et parties")}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 min-w-0">
          {stage.entries.length > 1 && (
            <select
              value={cur.id}
              onChange={(e) => stage.select(Number(e.target.value))}
              aria-label={t("Modèle à animer")}
              className="h-9 px-2 border border-line bg-surf2 text-ink cut-sm text-[13px] font-semibold"
            >
              {stage.entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.stem} · {e.placement}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1.5">
            <PanelBtn busy={false} onClick={() => step(-1)}>
              <TriLeft size={14} />
            </PanelBtn>
            <select
              value={cur.anim ?? ""}
              onChange={(e) => stage.setAnim(cur.id, e.target.value || null)}
              aria-label={t("Animation et parties")}
              className="flex-auto min-w-0 h-10 px-2 border border-line bg-surf2 text-ink cut-sm text-[13px] font-semibold"
            >
              <option value="">
                {t("Attente auto")}
                {cur.playing ? ` (${animLabel(cur.playing)})` : ""}
              </option>
              {groups.map((g) => (
                <option key={g.id} value={g.id} title={g.parts.join(" → ")}>
                  {g.label}
                  {g.parts.length > 1 ? ` (${g.parts.length})` : ""}
                </option>
              ))}
            </select>
            <PanelBtn busy={false} onClick={() => step(1)}>
              <TriRight size={14} />
            </PanelBtn>
            <PanelBtn busy={false} onClick={() => stage.setPaused(cur.id, !cur.paused)}>
              <span className="px-1">{cur.paused ? t("Lecture") : t("Pause")}</span>
            </PanelBtn>
          </div>
          <label className="flex items-center gap-2 text-[13px] font-semibold cursor-pointer">
            <input type="checkbox" checked={cur.auto} onChange={(e) => stage.setAuto(cur.id, e.target.checked)} style={{ accentColor: "var(--acc)", width: 16, height: 16 }} />
            {t("Afficher/Masquer automatiquement")}
          </label>
          <label className="flex items-center gap-2 text-[13px] font-semibold cursor-pointer" title={t("À la fin d'une animation, revenir à l'attente")}>
            <input type="checkbox" checked={cur.autoReturn} onChange={(e) => stage.setAutoReturn(cur.id, e.target.checked)} style={{ accentColor: "var(--acc)", width: 16, height: 16 }} />
            {t("Retour auto à l’attente")}
          </label>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0 max-h-64 overflow-y-auto scroll pr-1">
          {cur.parts.length === 0 && <span className="text-[12.5px] text-mut">{t("Aucune partie listée.")}</span>}
          {cur.parts.map((p) => {
            const on = cur.auto ? (cur.base[p.hash] ?? p.visible) : (cur.manual[p.hash] ?? cur.base[p.hash] ?? p.visible);
            return (
              <label
                key={p.hash}
                className="flex items-center gap-2 px-2 h-8 shrink-0 cut-sm text-[13px] font-semibold"
                style={{ background: "var(--surf2)", opacity: cur.auto ? 0.75 : 1, cursor: cur.auto ? "default" : "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={cur.auto}
                  onChange={(e) => stage.setPart(cur.id, p.hash, e.target.checked)}
                  style={{ accentColor: "var(--acc)", width: 15, height: 15 }}
                />
                <span className="flex-auto truncate">{p.name}</span>
              </label>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

import { useState } from "react";
import { useT } from "../../i18n";
import { useUi } from "../../state/ui";
import { camera, exportCode, modelTuning, motion, placementTuning, useModelTuning } from "../../lib/modelTuning";
import { PanelBtn, Section, Slider } from "./controls";

// Réglage en direct des modèles 3D affichés : taille, position, rotation, animation ; code à recopier.
// Disposition large : géométrie à gauche, animation globale + caméra à droite.
export function ModelSection() {
  const t = useT();
  const tuning = useModelTuning();
  const stems = [...new Set(tuning.active.map((a) => a.stem))];
  const [sel, setSel] = useState("");
  const [scope, setScope] = useState<"model" | "placement">("model");
  const cur = stems.includes(sel) ? sel : stems[0];
  const placement = tuning.active.find((a) => a.stem === cur)?.placement ?? "accueil";
  const values = scope === "model" ? modelTuning(cur ?? "") : placementTuning(placement);
  const m = motion();
  const c = camera();
  const set = (k: "zoom" | "x" | "y" | "yaw", v: number) => (scope === "model" ? tuning.setModel(cur!, { [k]: v }) : tuning.setPlacement(placement, { [k]: v }));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportCode());
      useUi.getState().toast(t("Code copié : colle-le dans packages/content/src/chibis.ts."), "ok");
    } catch {
      useUi.getState().toast(t("Copie impossible dans ce navigateur."), "danger");
    }
  };

  return (
    <Section title={t("Modèles 3D")}>
      {!cur ? (
        <span className="text-[13px] text-mut">{t("Aucun modèle 3D affiché sur cette page (accueil, profil ou vitrine des skins).")}</span>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap gap-1.5 items-center">
              <select
                value={cur}
                onChange={(e) => setSel(e.target.value)}
                aria-label={t("Modèle à régler")}
                className="h-9 max-w-full px-2 border border-line bg-surf2 text-ink cut-sm text-[13px] font-semibold"
              >
                {stems.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span role="group" aria-label={t("Portée du réglage")} className="flex gap-1">
                {(
                  [
                    ["model", "Ce modèle"],
                    ["placement", "Cet emplacement"]
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setScope(id)}
                    aria-pressed={scope === id}
                    className="h-9 px-2.5 border-0 cut-sm cursor-pointer text-[12.5px] font-bold"
                    style={{ background: scope === id ? "var(--acc)" : "var(--surf2)", color: scope === id ? "var(--on-acc)" : "var(--ink)" }}
                  >
                    {t(label)}
                  </button>
                ))}
              </span>
            </div>
            <span className="text-[12px] text-mut">
              {scope === "model" ? t("Réglage de {m}, partout où il s’affiche.", { m: cur }) : t("Réglage de tous les modèles sur l’emplacement « {p} ».", { p: placement })}
            </span>
            <Slider label={t("Taille")} value={values.zoom ?? 1} min={0.4} max={2.5} step={0.01} format={(v) => "×" + v.toFixed(2)} onChange={(v) => set("zoom", v)} />
            <Slider label={t("Horizontal")} value={values.x ?? 0} min={-0.5} max={0.5} step={0.005} format={(v) => (v * 100).toFixed(1) + " %"} onChange={(v) => set("x", v)} />
            <Slider label={t("Vertical")} value={values.y ?? 0} min={-0.5} max={0.5} step={0.005} format={(v) => (v * 100).toFixed(1) + " %"} onChange={(v) => set("y", v)} />
            <Slider label={t("Rotation")} value={values.yaw ?? 0} min={-180} max={180} step={1} format={(v) => v + "°"} onChange={(v) => set("yaw", v)} />
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <span className="label !text-[11.5px]">{t("Animation (tous les modèles)")}</span>
            <Slider label={t("Balancement")} value={m.sway} min={0} max={25} step={1} format={(v) => v + "°"} onChange={(v) => tuning.setMotion({ sway: v })} />
            <Slider label={t("Flottement")} value={m.float} min={0} max={20} step={1} format={(v) => v + " px"} onChange={(v) => tuning.setMotion({ float: v })} />
            <span className="label !text-[11.5px] pt-1">{t("Caméra (tous les modèles)")}</span>
            <Slider label={t("Hauteur")} value={c.pitch} min={60} max={110} step={1} format={(v) => v + "°"} onChange={(v) => tuning.setCamera({ pitch: v })} />
            <Slider label={t("Perspective")} value={c.fov} min={10} max={60} step={1} format={(v) => v + "°"} onChange={(v) => tuning.setCamera({ fov: v })} />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <PanelBtn busy={false} onClick={copy}>
                {t("Copier le code")}
              </PanelBtn>
              <PanelBtn busy={false} danger onClick={() => tuning.reset()}>
                {t("Réinitialiser")}
              </PanelBtn>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

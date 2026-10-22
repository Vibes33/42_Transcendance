import { useState } from "react";
import { camera, exportCode, modelTuning, motion, placementTuning, useModelTuning } from "../lib/modelTuning";
import { post } from "../api/client";
import { keys, useInvalidate, useSession } from "../api/queries";
import { fmt, useT } from "../i18n";
import { useMe } from "../state/app";
import { useUi } from "../state/ui";
import { markTutorial } from "./Tutorial";
import { Close, Gear } from "./icons";

// Panneau de test : seulement pour les comptes de test (connexion de développement, AUTH_DEV_LOGIN=true).
// Les services refusent ces actions pour tout autre compte.

const TUTORIALS = ["site", "cdj", "meli", "se", "splash"];

export function DevPanel() {
  const t = useT();
  const session = useSession();
  const me = useMe();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("1000");
  const [streak, setStreak] = useState("7");
  const [busy, setBusy] = useState(false);
  if (!session.data?.testAccount) return null;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await invalidate(keys.me, keys.shop, keys.inventory, keys.daily, keys.profile, keys.stats);
      useUi.getState().toast(label, "ok");
    } catch (e) {
      useUi.getState().toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };
  const shards = (n: number) => run(n >= 0 ? t("+{n} éclats", { n: fmt(n) }) : t("{n} éclats", { n: fmt(n) }), () => post("/api/classement/dev/shards", { amount: n }));

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("Ouvrir le panneau de test")}
        className="fixed left-4 bottom-4 z-[70] flex items-center gap-2 h-11 px-4 border-0 cut-sm cursor-pointer font-d font-bold text-sm tracking-[0.06em] uppercase text-ink"
        style={{ background: "color-mix(in srgb, var(--warn) 30%, var(--surf2))", boxShadow: "0 10px 26px rgba(0,0,0,.35)" }}
      >
        <Gear />
        {t("Test")}
      </button>
    );

  return (
    <aside role="dialog" aria-labelledby="titre-test" className="fixed left-4 bottom-4 z-[70] w-[min(calc(100vw-32px),400px)] max-h-[calc(100vh-32px)] overflow-y-auto p-[1.5px] cut-md" style={{ background: "var(--warn)", boxShadow: "0 18px 50px rgba(0,0,0,.45)" }}>
      <div className="flex flex-col gap-4 p-5 bg-surf cut-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="titre-test" className="m-0 font-d font-bold text-xl uppercase tracking-[0.04em]">
              {t("Panneau de test")}
            </h2>
            <span className="text-[12.5px] text-mut">{t("Compte de test uniquement. Solde : {n} éclats", { n: fmt(me.balance) })}</span>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label={t("Fermer le panneau de test")} className="w-9 h-9 flex items-center justify-center border-0 bg-surf2 text-ink cut-sm cursor-pointer">
            <Close size={16} />
          </button>
        </div>

        <ModelSection />

        <section className="flex flex-col gap-2">
          <span className="label">{t("Éclats")}</span>
          <div className="flex flex-wrap gap-1.5">
            {[100, 500, 1000, 5000].map((n) => (
              <PanelBtn busy={busy} key={n} onClick={() => shards(n)}>
                +{fmt(n)}
              </PanelBtn>
            ))}
            <PanelBtn busy={busy} danger onClick={() => shards(-me.balance)}>
              {t("Mettre à 0")}
            </PanelBtn>
          </div>
          <div className="flex gap-1.5">
            <NumField value={amount} onChange={setAmount} label={t("Montant d’éclats")} />
            <PanelBtn busy={busy} onClick={() => shards(Math.trunc(Number(amount) || 0))}>{t("Ajouter / retirer")}</PanelBtn>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <span className="label">{t("Collection")}</span>
          <div className="flex flex-wrap gap-1.5">
            <PanelBtn busy={busy} onClick={() => run(t("Tout est débloqué."), () => post("/api/classement/dev/unlock-all"))}>{t("Tout débloquer")}</PanelBtn>
            <PanelBtn busy={busy} danger onClick={() => run(t("Inventaire vidé (premier chibi conservé)."), () => post("/api/classement/dev/reset-inventory"))}>
              {t("Vider l’inventaire")}
            </PanelBtn>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <span className="label">{t("Défi du jour et série")}</span>
          <div className="flex flex-wrap gap-1.5">
            <PanelBtn busy={busy}
              onClick={() =>
                run(t("Défi du jour réinitialisé."), async () => {
                  await post("/api/jeux/dev/reset-day");
                  await post("/api/classement/dev/reset-day");
                })
              }
            >
              {t("Rejouer le défi du jour")}
            </PanelBtn>
          </div>
          <div className="flex gap-1.5">
            <NumField value={streak} onChange={setStreak} label={t("Jours de série")} />
            <PanelBtn busy={busy} onClick={() => run(t("Série modifiée."), () => post("/api/classement/dev/streak", { days: Math.max(0, Math.trunc(Number(streak) || 0)) }))}>{t("Définir la série")}</PanelBtn>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <span className="label">{t("Tutoriels")}</span>
          <div className="flex flex-wrap gap-1.5">
            <PanelBtn busy={busy} onClick={() => run(t("Les tutoriels seront rejoués."), () => Promise.all(TUTORIALS.map((k) => markTutorial(k, false))))}>{t("Revoir tous les tutoriels")}</PanelBtn>
            <PanelBtn busy={busy} onClick={() => run(t("Tutoriels marqués comme vus."), () => Promise.all(TUTORIALS.map((k) => markTutorial(k, true))))}>{t("Passer tous les tutoriels")}</PanelBtn>
          </div>
        </section>
      </div>
    </aside>
  );
}

function PanelBtn({ onClick, children, danger, busy }: { onClick: () => void; children: React.ReactNode; danger?: boolean; busy: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="h-10 px-3.5 border-0 cut-sm cursor-pointer font-bold text-[13px] text-ink disabled:opacity-50"
      style={{ background: danger ? "color-mix(in srgb, var(--danger) 22%, var(--surf2))" : "var(--surf2)" }}
    >
      {children}
    </button>
  );
}

function NumField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="fr-in w-28 p-[1.5px] bg-line cut-sm">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="block w-full box-border h-[37px] px-3 border-0 outline-none bg-surf text-ink cut-sm font-b text-sm font-semibold"
      />
    </div>
  );
}

/** Réglage en direct des modèles 3D affichés : taille, position, rotation, animation ; code à recopier. */
function ModelSection() {
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
    <section className="flex flex-col gap-2">
      <span className="label">{t("Modèles 3D")}</span>
      {!cur ? (
        <span className="text-[13px] text-mut">{t("Aucun modèle 3D affiché sur cette page (accueil, profil ou vitrine des skins).")}</span>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 items-center">
            <select
              value={cur}
              onChange={(e) => setSel(e.target.value)}
              aria-label={t("Modèle à régler")}
              className="h-9 px-2 border border-line bg-surf2 text-ink cut-sm text-[13px] font-semibold"
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
        </>
      )}
      <span className="label !text-[11.5px] pt-1">{t("Animation (tous les modèles)")}</span>
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
    </section>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2.5 text-[13px] font-semibold">
      <span className="w-[78px] shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-auto" style={{ accentColor: "var(--acc)" }} />
      <span className="w-[58px] shrink-0 text-right font-d text-mut">{format(value)}</span>
    </label>
  );
}

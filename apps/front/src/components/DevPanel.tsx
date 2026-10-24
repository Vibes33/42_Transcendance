import { useState } from "react";
import { fmt, useT } from "../i18n";
import { useSession } from "../api/queries";
import { useMe } from "../state/app";
import { Close, Gear } from "./icons";
import { CollectionSection, DailySection, ShardsSection, StorageSection, TutorialsSection } from "./dev/accountSections";
import { ModelSection } from "./dev/ModelSection";
import { StageSection } from "./dev/StageSection";
import { useDevRun } from "./dev/useDevRun";

// Panneau de test : seulement pour les comptes de test (connexion de développement, AUTH_DEV_LOGIN=true).
// Les services refusent ces actions pour tout autre compte.

type TabId = "compte" | "3d" | "anims" | "systeme";

export function DevPanel() {
  const session = useSession();
  if (!session.data?.testAccount) return null;
  return <DevPanelInner />;
}

function DevPanelInner() {
  const t = useT();
  const me = useMe();
  const { busy, run } = useDevRun();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("compte");

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

  const tabs: { id: TabId; label: string }[] = [
    { id: "compte", label: t("Compte") },
    { id: "3d", label: t("3D") },
    { id: "anims", label: t("Anims") },
    { id: "systeme", label: t("Système") },
  ];

  return (
    <aside role="dialog" aria-labelledby="titre-test" className="fixed left-4 bottom-4 z-[70] w-[min(calc(100vw-32px),720px)] max-h-[calc(100vh-32px)] overflow-y-auto p-[1.5px] cut-md" style={{ background: "var(--warn)", boxShadow: "0 18px 50px rgba(0,0,0,.45)" }}>
      <div className="flex flex-col gap-4 p-5 bg-surf cut-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="titre-test" className="m-0 font-d font-bold text-xl uppercase tracking-[0.04em]">
              {t("Panneau de test")}
            </h2>
            <span className="text-[12.5px] text-mut">{t("Compte de test uniquement. Solde : {n} éclats", { n: fmt(me.balance) })}</span>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label={t("Fermer le panneau de test")} className="w-9 h-9 shrink-0 flex items-center justify-center border-0 bg-surf2 text-ink cut-sm cursor-pointer">
            <Close size={16} />
          </button>
        </div>

        <div role="tablist" aria-label={t("Panneau de test")} className="flex gap-1 p-1 bg-surf2 cut-sm">
          {tabs.map((tb) => {
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setTab(tb.id)}
                className="flex-auto h-9 px-2 border-0 cut-sm cursor-pointer text-[13px] font-bold uppercase tracking-[0.05em]"
                style={{ background: active ? "var(--acc)" : "transparent", color: active ? "var(--on-acc)" : "var(--mut)" }}
              >
                {tb.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-4">
          {tab === "compte" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ShardsSection busy={busy} run={run} />
              <CollectionSection busy={busy} run={run} />
              <DailySection busy={busy} run={run} />
              <TutorialsSection busy={busy} run={run} />
            </div>
          )}
          {tab === "3d" && <ModelSection />}
          {tab === "anims" && <StageSection />}
          {tab === "systeme" && <StorageSection busy={busy} />}
        </div>
      </div>
    </aside>
  );
}

import { useState } from "react";
import { post } from "../../api/client";
import { fmt, useT } from "../../i18n";
import { useMe } from "../../state/app";
import { markTutorial } from "../Tutorial";
import { wipeBrowserStorage } from "../../lib/browserStorage";
import { NumField, PanelBtn, Section } from "./controls";
import type { useDevRun } from "./useDevRun";

const TUTORIALS = ["site", "cdj", "meli", "se", "splash"];

type DevRun = ReturnType<typeof useDevRun>;

// Éclats : presets rapides + montant libre + remise à zéro.
export function ShardsSection({ busy, run }: DevRun) {
  const t = useT();
  const me = useMe();
  const [amount, setAmount] = useState("1000");
  const shards = (n: number) =>
    run(n >= 0 ? t("+{n} éclats", { n: fmt(n) }) : t("{n} éclats", { n: fmt(n) }), () => post("/api/classement/dev/shards", { amount: n }));

  return (
    <Section title={t("Éclats")}>
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
    </Section>
  );
}

// Collection : déblocage total ou reset (premier chibi conservé côté service).
export function CollectionSection({ busy, run }: DevRun) {
  const t = useT();
  return (
    <Section title={t("Collection")}>
      <div className="flex flex-wrap gap-1.5">
        <PanelBtn busy={busy} onClick={() => run(t("Tout est débloqué."), () => post("/api/classement/dev/unlock-all"))}>{t("Tout débloquer")}</PanelBtn>
        <PanelBtn busy={busy} danger onClick={() => run(t("Inventaire vidé (premier chibi conservé)."), () => post("/api/classement/dev/reset-inventory"))}>
          {t("Vider l’inventaire")}
        </PanelBtn>
      </div>
    </Section>
  );
}

// Défi du jour + série : rejouer le jour courant, forcer la série.
export function DailySection({ busy, run }: DevRun) {
  const t = useT();
  const [streak, setStreak] = useState("7");
  return (
    <Section title={t("Défi du jour et série")}>
      <div className="flex flex-wrap gap-1.5">
        <PanelBtn
          busy={busy}
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
    </Section>
  );
}

// Tutoriels : marquage local, rejouer ou passer.
export function TutorialsSection({ busy, run }: DevRun) {
  const t = useT();
  return (
    <Section title={t("Tutoriels")}>
      <div className="flex flex-wrap gap-1.5">
        <PanelBtn busy={busy} onClick={() => run(t("Les tutoriels seront rejoués."), () => Promise.all(TUTORIALS.map((k) => markTutorial(k, false))))}>{t("Revoir tous les tutoriels")}</PanelBtn>
        <PanelBtn busy={busy} onClick={() => run(t("Tutoriels marqués comme vus."), () => Promise.all(TUTORIALS.map((k) => markTutorial(k, true))))}>{t("Passer tous les tutoriels")}</PanelBtn>
      </div>
    </Section>
  );
}

// Stockage navigateur : purge complète puis reload.
export function StorageSection({ busy }: Pick<DevRun, "busy">) {
  const t = useT();
  return (
    <Section title={t("Stockage local")}>
      <p className="m-0 text-[13px] leading-relaxed text-mut">{t("Vide tout ce que le navigateur persiste (réglages 3D, thème, …) et recharge la page : utile si un vieux réglage coince l’affichage.")}</p>
      <div className="flex flex-wrap gap-1.5">
        <PanelBtn busy={busy} danger onClick={() => wipeBrowserStorage()}>
          {t("Vider le stockage et recharger")}
        </PanelBtn>
      </div>
    </Section>
  );
}

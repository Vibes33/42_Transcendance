import { useState } from "react";
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

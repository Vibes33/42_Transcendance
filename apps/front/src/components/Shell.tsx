import { Link } from "react-router-dom";
import { post } from "../api/client";
import { keys, queryClient } from "../api/queries";
import { useT } from "../i18n";
import { useMe } from "../state/app";
import { useUi } from "../state/ui";
import { Friends } from "./icons";
import { Dialog } from "./ui";

// Éléments globaux : fenêtre « il te faut un groupe », notifications et pied de page.

export function NeedGroupDialog() {
  const t = useT();
  const ui = useUi();
  const me = useMe();
  if (!ui.needGroup) return null;
  const empty = ui.needGroup === "vide";
  const action = async () => {
    ui.setNeedGroup(null);
    if (!empty && !me.inGroup) await post("/api/social/group").catch(() => {});
    await queryClient.invalidateQueries({ queryKey: keys.group });
    ui.setFriends(true);
  };
  return (
    <Dialog labelledBy="titre-groupe-requis" onClose={() => ui.setNeedGroup(null)} z={55}>
      <span aria-hidden="true" className="w-16 h-16 flex items-center justify-center text-acc cut-sm" style={{ background: "color-mix(in srgb, var(--acc) 22%, var(--surf2))" }}>
        <Friends size={32} />
      </span>
      <h2 id="titre-groupe-requis" className="m-0 font-d font-bold text-[28px] leading-[1.1]">
        {empty ? t("Ton groupe est vide") : t("Il te faut un groupe")}
      </h2>
      <p className="m-0 max-w-[360px] text-[15px] leading-relaxed text-mut">
        {empty
          ? t("Invite au moins un ami dans ton groupe pour lancer une partie ensemble.")
          : t("Les parties avec des amis se jouent en groupe. Crée un groupe depuis ta liste d’amis, puis invite jusqu’à 5 joueurs.")}
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-1.5">
        <button type="button" onClick={() => ui.setNeedGroup(null)} className="h-[52px] px-8 border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
          {t("Fermer")}
        </button>
        <button type="button" onClick={action} className="h-[52px] px-8 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
          {empty ? t("Inviter des amis") : t("Créer un groupe")}
        </button>
      </div>
    </Dialog>
  );
}

export function Toasts() {
  const ui = useUi();
  return (
    <div aria-live="polite" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center gap-2 w-[min(92vw,460px)] pointer-events-none">
      {ui.toasts.map((tst) => (
        <div
          key={tst.id}
          role="status"
          className="toast pointer-events-auto flex items-center gap-3 w-full px-4 py-3 cut-sm text-[14.5px] font-semibold"
          style={{ background: tst.tone === "danger" ? "color-mix(in srgb, var(--danger) 22%, var(--surf2))" : tst.tone === "ok" ? "color-mix(in srgb, var(--ok) 20%, var(--surf2))" : "var(--surf2)", boxShadow: "0 12px 30px rgba(0,0,0,.3)" }}
        >
          <span className="flex-auto">{tst.text}</span>
          {tst.action && (
            <button
              type="button"
              onClick={() => {
                tst.action!.run();
                ui.dismiss(tst.id);
              }}
              className="h-8 px-3 border-0 bg-acc text-on-acc cut-sm cursor-pointer font-bold text-[13px]"
            >
              {tst.action.label}
            </button>
          )}
          <button type="button" onClick={() => ui.dismiss(tst.id)} aria-label="×" className="border-0 bg-transparent text-mut cursor-pointer text-lg leading-none">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function Footer() {
  const t = useT();
  const me = useMe();
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-5 gutter text-[13px] text-mut border-t" style={{ borderColor: "color-mix(in srgb, var(--line) 55%, transparent)" }}>
      <span>© 2026 LolTR</span>
      <Link to="/conditions" className="text-mut hover:text-ink">
        {t("Conditions d’utilisation")}
      </Link>
      <Link to="/confidentialite" className="text-mut hover:text-ink">
        {t("Confidentialité")}
      </Link>
      {!me.isAnon && (
        <Link to="/parametres" className="text-mut hover:text-ink">
          {t("Paramètres")}
        </Link>
      )}
      {me.isUser && (
        <Link to="/stream" className="text-mut hover:text-ink">
          {t("Mode streamer")}
        </Link>
      )}
      <span className="basis-full text-center text-[12px] opacity-80">{t("LolTR n’est ni approuvé ni sponsorisé par Riot Games.")}</span>
    </footer>
  );
}

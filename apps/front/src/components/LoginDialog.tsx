import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Provider } from "@loltr/shared";
import { actions, useSession } from "../api/queries";
import { useT } from "../i18n";
import { refreshMe } from "../state/app";
import { connectLive } from "../state/live";
import { useUi, type LoginReason } from "../state/ui";
import { AppleLogo, DiscordLogo, GoogleLogo, Logo } from "./icons";
import { CloseBtn, Dialog } from "./ui";

// Connexion OAuth (Google, Apple, Discord) et « Jouer hors ligne ». Sur la page de connexion, la
// fenêtre ne se ferme pas et propose le mode invité ; ailleurs, elle explique pourquoi un compte est requis.

const REASONS: Record<LoginReason, [string, string, string]> = {
  profil: ["Connecte-toi pour", "ton profil", "Ton profil, tes chibis et tes skins sont liés à ton compte."],
  amis: ["Connecte-toi pour jouer", "avec tes amis", "La liste d’amis et les groupes demandent un compte."],
  boutique: ["Connecte-toi pour", "la boutique", "Les éclats, les chibis et les skins sont liés à ton compte."],
  classement: ["Connecte-toi pour voir", "tes copains", "Le classement entre copains et tes points demandent un compte."],
  stream: ["Connecte-toi pour", "streamer", "Le mode streamer est lié à ton compte."],
  compte: ["Connecte-toi à", "LolTR", "Garde tes points, ta série et tes chibis d’un appareil à l’autre."]
};

const PROVIDERS: { id: Provider; label: string; bg: string; fg: string; logo: () => React.ReactNode }[] = [
  { id: "google", label: "Continuer avec Google", bg: "#FFFFFF", fg: "#1F1F1F", logo: GoogleLogo },
  { id: "apple", label: "Continuer avec Apple", bg: "#000000", fg: "#FFFFFF", logo: AppleLogo },
  { id: "discord", label: "Continuer avec Discord", bg: "#5865F2", fg: "#FFFFFF", logo: DiscordLogo }
];

export function LoginDialog({ page = false }: { page?: boolean }) {
  const t = useT();
  const ui = useUi();
  const nav = useNavigate();
  const session = useSession();
  const reason = ui.login ?? "compte";
  const why = REASONS[reason];
  const providers = session.data?.providers ?? [];
  const [busy, setBusy] = useState(false);
  const [devName, setDevName] = useState("");
  const [err, setErr] = useState("");

  const offline = async () => {
    setBusy(true);
    try {
      await actions.guest();
      await refreshMe();
      connectLive();
      ui.closeLogin();
      nav("/");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const devLogin = async () => {
    if (!devName.trim()) return;
    setBusy(true);
    try {
      await actions.devLogin(devName.trim());
      await refreshMe();
      connectLive();
      ui.closeLogin();
      nav("/");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      labelledBy="titre-connexion"
      width={460}
      onClose={page ? undefined : ui.closeLogin}
      overlay={page ? "transparent" : undefined}
      blur={page ? "none" : undefined}
      innerClassName="flex flex-col items-center gap-[18px] px-9 pt-10 pb-[30px] text-center"
    >
      {!page && <CloseBtn onClick={ui.closeLogin} label={t("Fermer")} className="absolute top-3.5 right-3.5" />}
      <Logo size={52} className="text-acc" />
      <h2 id="titre-connexion" className="m-0 font-d font-bold text-[30px] leading-[1.1]">
        {t(why[0])} <span className="text-acc">{t(why[1])}</span>
      </h2>
      <p className="m-0 max-w-[340px] text-[15px] leading-relaxed text-mut">
        {page ? t("Garde tes points, ta série et tes chibis d’un appareil à l’autre, ou joue tout de suite hors ligne.") : t(why[2])}
      </p>
      <div className="flex flex-col gap-3 w-full pt-1.5">
        {PROVIDERS.map((p) => {
          const enabled = providers.includes(p.id);
          const Logo = p.logo;
          return (
            <a
              key={p.id}
              href={enabled ? `/api/auth/login/${p.id}` : undefined}
              aria-disabled={!enabled}
              title={enabled ? undefined : t("Ce mode de connexion n’est pas configuré sur ce serveur.")}
              className="flex items-center justify-center gap-3 h-[54px] px-5 cut-sm font-bold text-base no-underline"
              style={{ background: p.bg, color: p.fg, opacity: enabled ? 1 : 0.45, cursor: enabled ? "pointer" : "not-allowed" }}
            >
              <Logo />
              {t(p.label)}
            </a>
          );
        })}
      </div>
      {session.data?.devLogin && (
        <form
          className="flex gap-2 w-full"
          onSubmit={(e) => {
            e.preventDefault();
            devLogin();
          }}
        >
          <div className="fr-in flex-auto p-[1.5px] bg-line cut-sm">
            <input
              value={devName}
              onChange={(e) => setDevName(e.target.value)}
              placeholder={t("Compte de test (développement)")}
              aria-label={t("Compte de test (développement)")}
              className="block w-full box-border h-11 px-3.5 border-0 outline-none bg-surf text-ink cut-sm font-b text-sm font-semibold"
            />
          </div>
          <button type="submit" disabled={busy} className="h-[47px] px-4 border-0 bg-surf2 text-ink cut-sm cursor-pointer font-bold text-[13px]">
            {t("Tester")}
          </button>
        </form>
      )}
      {page && (
        <>
          <div aria-hidden="true" className="flex items-center gap-3 w-full text-[13px] text-mut">
            <span className="flex-auto h-px bg-line" />
            {t("ou")}
            <span className="flex-auto h-px bg-line" />
          </div>
          <button type="button" onClick={offline} disabled={busy} className="relative w-full h-[54px] px-5 border-0 bg-line cut-sm cursor-pointer text-ink font-bold text-base">
            <span aria-hidden="true" className="absolute inset-[1.5px] bg-surf2 cut-sm" />
            <span className="relative">{t("Jouer hors ligne")}</span>
          </button>
          <span className="-mt-2 text-[13px] leading-normal text-mut">{t("Sans compte : un chibi au hasard, pas de profil, d’amis ni de classement.")}</span>
        </>
      )}
      {err && (
        <span role="alert" className="text-sm font-semibold text-danger">
          {err}
        </span>
      )}
      <p className="mt-1 mb-0 max-w-[340px] text-[12.5px] leading-relaxed text-mut">
        {t("En continuant, tu acceptes les")}{" "}
        <Link to="/conditions" onClick={ui.closeLogin} className="text-ink">
          {t("conditions d’utilisation")}
        </Link>{" "}
        {t("et la")}{" "}
        <Link to="/confidentialite" onClick={ui.closeLogin} className="text-ink">
          {t("politique de confidentialité")}
        </Link>{" "}
        {t("de LolTR.")}
      </p>
    </Dialog>
  );
}

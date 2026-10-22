import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import type { Profile, SiteLang } from "@loltr/shared";
import { del, patch } from "../api/client";
import { actions, keys, queryClient } from "../api/queries";
import { markTutorial } from "../components/Tutorial";
import { Btn, Dialog, Pill, glow } from "../components/ui";
import { useLang, useT } from "../i18n";
import { refreshMe, toggleMode, useMe, useTheme } from "../state/app";
import { disconnectLive } from "../state/live";
import { useUi } from "../state/ui";
import { Toggle } from "./Onboarding";

// Paramètres : langues, thème, rappel du défi, tutoriels à revoir, déconnexion et suppression du compte.

export function Parametres() {
  const t = useT();
  const nav = useNavigate();
  const me = useMe();
  const { lang, setLang } = useLang();
  const mode = useTheme((s) => s.mode);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!me.loading && me.isAnon) return <Navigate to="/connexion" replace />;
  const p = me.profile;
  if (!p) return null;

  const save = async (body: Partial<Profile>) => {
    try {
      const next = await patch<Profile>("/api/profil/me", body);
      queryClient.setQueryData(keys.profile, next);
    } catch (e) {
      useUi.getState().toast((e as Error).message, "danger");
    }
  };
  const replay = async (key: string) => {
    await markTutorial(key, false);
    useUi.getState().toast(t("Le tutoriel sera rejoué à ta prochaine visite."), "ok");
    if (key === "site") nav("/");
  };
  const logout = async () => {
    await actions.logout().catch(() => {});
    disconnectLive();
    queryClient.clear();
    await refreshMe();
    nav("/connexion");
  };
  const remove = async () => {
    await del("/api/auth/me").catch(() => {});
    disconnectLive();
    queryClient.clear();
    nav("/connexion");
  };

  return (
    <div className="flex-auto flex flex-col items-center gap-8 pt-12 pb-16 gutter" style={{ background: glow("900px 520px at 50% 300px", 16) }}>
      <h1 className="m-0 font-d font-bold leading-[1.02] uppercase text-center" style={{ fontSize: "clamp(34px, 4vw, 56px)" }}>
        {t("Mes")} <span className="text-acc">{t("paramètres")}</span>
      </h1>
      <div className="flex flex-col gap-5 w-full max-w-[760px]">
        <Section title={t("Langues")}>
          <Row label={t("Langue du site")}>
            {(["fr", "en"] as SiteLang[]).map((l) => (
              <Pill key={l} para={false} on={lang === l} onClick={() => { setLang(l); if (p.kind === "user") save({ siteLang: l }); }}>
                {l === "fr" ? "Français" : "English"}
              </Pill>
            ))}
          </Row>
          <Row label={t("Noms des champions et des sorts")}>
            {(["fr", "en"] as SiteLang[]).map((l) => (
              <Pill key={l} para={false} on={p.namesLang === l} onClick={() => save({ namesLang: l })}>
                {l === "fr" ? "Français" : "English"}
              </Pill>
            ))}
          </Row>
        </Section>
        <Section title={t("Affichage")}>
          <Row label={t("Thème")}>
            <Pill para={false} on={mode === "dark"} onClick={() => mode !== "dark" && toggleMode(p)}>
              {t("Ardoise (sombre)")}
            </Pill>
            <Pill para={false} on={mode === "light"} onClick={() => mode !== "light" && toggleMode(p)}>
              {t("Porcelaine (clair)")}
            </Pill>
          </Row>
          {p.kind === "user" && (
            <Row label={t("Rappel du défi du jour")}>
              <Toggle on={p.reminder} onClick={() => save({ reminder: !p.reminder })} label={p.reminder ? t("Activé, à 18 h si tu n’as pas joué") : t("Désactivé")} />
            </Row>
          )}
        </Section>
        <Section title={t("Tutoriels")}>
          <p className="m-0 text-sm text-mut">{t("Revois la visite guidée du site ou le tutoriel d’un jeu : il se relancera à ta prochaine partie en solo.")}</p>
          <div className="flex flex-wrap gap-2">
            {[
              ["site", "Visite du site"],
              ["cdj", "Champion du jour"],
              ["meli", "Méli-MéLoL"],
              ["se", "Sorts éclair"],
              ["splash", "Splash mystère"]
            ].map(([k, l]) => (
              <button key={k} type="button" onClick={() => replay(k)} className="h-11 px-5 border-0 bg-surf2 text-ink cut-sm cursor-pointer font-bold text-[14.5px]">
                {t(l)}
              </button>
            ))}
          </div>
        </Section>
        {p.kind === "user" && (
          <Section title={t("Mode streamer")}>
            <p className="m-0 text-sm text-mut">{t("Joue en direct avec ton chat : tes viewers rejoignent la partie avec un code, sans compte.")}</p>
            <div>
              <Link to="/stream" className="inline-flex items-center h-11 px-7 bg-acc text-on-acc para no-underline font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                {t("Ouvrir le mode streamer")}
              </Link>
            </div>
          </Section>
        )}
        <Section title={t("Compte")}>
          <p className="m-0 text-sm text-mut">
            {t("LolTR ne collecte aucune donnée personnelle : seulement tes statistiques de jeu.")}{" "}
            <Link to="/confidentialite" className="text-ink">
              {t("Politique de confidentialité")}
            </Link>
          </p>
          <div className="flex flex-wrap gap-3">
            {p.kind === "user" ? (
              <Btn variant="soft" className="h-11 px-7 text-sm" onClick={logout}>
                {t("Se déconnecter")}
              </Btn>
            ) : (
              <Btn className="h-11 px-7 text-sm" onClick={() => useUi.getState().askLogin("compte")}>
                {t("Se connecter")}
              </Btn>
            )}
            {p.kind === "user" && (
              <button type="button" onClick={() => setConfirmDelete(true)} className="h-11 px-6 border-0 cut-sm cursor-pointer font-bold text-sm text-ink" style={{ background: "color-mix(in srgb, var(--danger) 20%, var(--surf2))" }}>
                {t("Supprimer mon compte")}
              </button>
            )}
          </div>
        </Section>
      </div>
      {confirmDelete && (
        <Dialog labelledBy="titre-suppr" onClose={() => setConfirmDelete(false)}>
          <h2 id="titre-suppr" className="m-0 font-d font-bold text-[28px]">
            {t("Supprimer ton compte ?")}
          </h2>
          <p className="m-0 max-w-[360px] text-[15px] leading-relaxed text-mut">{t("Ton profil, tes chibis, tes éclats et tes statistiques seront effacés. Cette action est définitive.")}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-1.5">
            <Btn variant="soft" className="h-[52px] px-8 text-[15px]" onClick={() => setConfirmDelete(false)}>
              {t("Annuler")}
            </Btn>
            <button type="button" onClick={remove} className="h-[52px] px-8 border-0 bg-danger text-white para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
              {t("Supprimer")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="p-[1.5px] bg-line cut-md">
      <div className="flex flex-col gap-4 px-6 py-5 bg-surf cut-md">
        <h2 className="m-0 font-d font-bold text-xl uppercase tracking-[0.04em]">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { CHIBI_BY_KEY, RANDOM_ART, STARTERS, STARTER_TAGLINES } from "@loltr/content/lite";
import { tagOf, validatePseudo, type Profile } from "@loltr/shared";
import { get, post } from "../api/client";
import { keys, queryClient } from "../api/queries";
import { LoginDialog } from "../components/LoginDialog";
import { Check } from "../components/icons";
import { glow } from "../components/ui";
import { useLang, useT } from "../i18n";
import { chibiName } from "../lib/chibi";
import { refreshMe, useMe, useThemeOverride } from "../state/app";
import { useUi } from "../state/ui";

// Première visite et première connexion : connexion (OAuth ou hors ligne), choix du pseudo (le site
// ajoute un tag), puis du premier chibi. L'en-tête est masqué pendant ces étapes.

export function Connexion() {
  const t = useT();
  const me = useMe();
  const [sp] = useSearchParams();
  useThemeOverride("neutre");
  const ui = useUi();
  useEffect(() => {
    if (sp.get("erreur")) ui.toast(t("La connexion a échoué. Réessaie."), "danger");
  }, []);
  if (!me.loading && !me.isAnon) return <Navigate to="/" replace />;
  return (
    <div className="flex-auto min-h-screen" style={{ background: "radial-gradient(1100px 700px at 50% 45%, color-mix(in srgb, var(--ink) 7%, transparent), transparent 70%), var(--bg)" }}>
      <LoginDialog page />
    </div>
  );
}

const ROLES: [string, string][] = [
  ["top", "Top"],
  ["jungle", "Jungle"],
  ["mid", "Mid"],
  ["bot", "Bot"],
  ["support", "Support"]
];

const PSEUDO_ERRORS: Record<string, string> = {
  empty: "Choisis un pseudo pour continuer.",
  short: "Au moins 3 caractères.",
  long: "16 caractères au maximum.",
  chars: "Lettres, chiffres et _ uniquement, sans espace.",
  banned: "Ce pseudo n’est pas autorisé."
};

export function Pseudo() {
  const t = useT();
  const nav = useNavigate();
  const me = useMe();
  const lang = useLang((s) => s.lang);
  useThemeOverride("lux");
  const [draft, setDraft] = useState(me.profile?.pseudo ?? "");
  const [role, setRole] = useState<string | null>(me.profile?.role ?? null);
  const [namesLang, setNamesLang] = useState<"fr" | "en">(me.profile?.namesLang ?? lang);
  const [reminder, setReminder] = useState(me.profile?.reminder ?? true);
  const [check, setCheck] = useState<{ p: string; ok: boolean; error: string | null; suggestions: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const pd = draft.trim();
  const local = validatePseudo(pd);

  // Disponibilité vérifiée auprès du service profil, après une courte pause de frappe
  useEffect(() => {
    if (local) return setCheck(null);
    const id = setTimeout(() => {
      get<{ ok: boolean; error: string | null; suggestions: string[] }>(`/api/profil/pseudo/check?p=${encodeURIComponent(pd)}`)
        .then((r) => setCheck({ p: pd, ...r }))
        .catch(() => setCheck(null));
    }, 300);
    return () => clearTimeout(id);
  }, [pd, local]);

  if (me.loading) return null;
  if (!me.isUser) return <Navigate to="/" replace />;

  const state = local ? (local === "empty" ? "vide" : "err") : check?.p === pd ? (check.ok ? "ok" : "pris") : "attente";
  const msg = local ? t(PSEUDO_ERRORS[local]) : state === "ok" ? "✓ " + t("{p} est disponible", { p: pd }) : state === "pris" ? "✕ " + t("{p} est déjà pris", { p: pd }) : t("Vérification…");
  const color = state === "ok" ? "var(--ok)" : state === "vide" || state === "attente" ? "var(--mut)" : "var(--danger)";
  const ok = state === "ok";
  const provider = me.session?.provider ? me.session.provider.charAt(0).toUpperCase() + me.session.provider.slice(1) : t("un compte de test");

  const confirm = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const p = await post<Profile>("/api/profil/pseudo", { pseudo: pd, role, namesLang, reminder });
      queryClient.setQueryData(keys.profile, p);
      nav("/bienvenue");
    } catch (e) {
      useUi.getState().toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex-auto min-h-screen flex flex-col items-center justify-center gap-7 pt-[30px] pb-10 gutter" style={{ background: glow("1000px 560px at 50% 560px", 18) }}>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-[13px] tracking-[0.1em] uppercase text-mut">{t("Première connexion · étape 1 sur 2")}</span>
        <h1 className="m-0 font-d font-bold leading-[1.02] uppercase" style={{ fontSize: "clamp(34px, 4vw, 56px)" }}>
          {t("Choisis ton")} <span className="text-acc">{t("pseudo")}</span>
        </h1>
      </div>

      <div className="flex flex-wrap justify-center items-stretch gap-7 w-full max-w-[1180px]">
        <section aria-label={t("Ton profil de joueur")} className="flex-[1_1_560px] min-w-0 p-[1.5px] bg-line cut-lg">
          <div className="h-full box-border flex flex-col gap-6 px-[34px] max-sm:px-5 pt-[30px] pb-[34px] bg-surf cut-lg">
            <span className="self-start inline-flex items-center gap-2 h-[34px] px-3.5 cut-sm text-[13.5px] font-bold" style={{ background: "color-mix(in srgb, var(--ok) 16%, var(--surf2))" }}>
              <Check className="text-ok" w={2.6} />
              {t("Connecté avec {provider}", { provider })}
            </span>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-baseline">
                <label htmlFor="champ-pseudo" className="text-[13px] font-bold tracking-[0.08em] uppercase text-mut">
                  {t("Pseudo en jeu")}
                </label>
                <span aria-hidden="true" className="text-[13px] text-mut">
                  {draft.length}/16
                </span>
              </div>
              <div className="fr-in p-[1.5px] cut-sm" style={{ background: state === "err" || state === "pris" ? "var(--danger)" : "var(--line)" }}>
                <input
                  id="champ-pseudo"
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, 16))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirm();
                    }
                  }}
                  maxLength={16}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="etat-pseudo"
                  aria-invalid={!ok}
                  placeholder={t("Ex. : Ryan")}
                  autoFocus
                  className="block w-full box-border h-[58px] px-[18px] border-0 outline-none bg-surf text-ink cut-sm font-d text-[22px] font-bold"
                />
              </div>
              <span id="etat-pseudo" role="status" className="flex items-center gap-2 min-h-[22px] text-sm font-semibold" style={{ color }}>
                {msg}
              </span>
              {state === "pris" && check && check.suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] text-mut">{t("Disponibles :")}</span>
                  {check.suggestions.map((g) => (
                    <button key={g} type="button" onClick={() => setDraft(g)} className="h-9 px-4 border-0 bg-surf2 text-ink cut-sm cursor-pointer font-d font-bold text-sm">
                      {g}
                    </button>
                  ))}
                </div>
              )}
              <span className="text-[13px] text-mut">{t("3 à 16 caractères : lettres, chiffres et _ , sans espace.")}</span>
            </div>

            <fieldset className="m-0 p-0 border-0 flex flex-col gap-2.5">
              <legend className="text-[13px] font-bold tracking-[0.08em] uppercase text-mut pb-2.5">
                {t("Rôle préféré")} <span className="font-medium normal-case tracking-normal">{t("(facultatif)")}</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {ROLES.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRole(role === id ? null : id)}
                    aria-pressed={role === id}
                    className="h-11 px-[22px] border-0 para cursor-pointer font-d font-bold text-[14.5px] tracking-[0.04em] uppercase"
                    style={{ background: role === id ? "var(--acc)" : "var(--surf2)", color: role === id ? "var(--on-acc)" : "var(--ink)" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-x-10 gap-y-6">
              <fieldset className="m-0 p-0 border-0 flex flex-col gap-2.5">
                <legend className="text-[13px] font-bold tracking-[0.08em] uppercase text-mut pb-2.5">{t("Noms des champions et des sorts")}</legend>
                <div className="flex gap-2">
                  {(
                    [
                      ["fr", "Français"],
                      ["en", "English"]
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setNamesLang(id)}
                      aria-pressed={namesLang === id}
                      className="h-11 px-[22px] border-0 cut-sm cursor-pointer font-bold text-[14.5px]"
                      style={{ background: namesLang === id ? "var(--acc)" : "var(--surf2)", color: namesLang === id ? "var(--on-acc)" : "var(--ink)" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-col gap-2.5">
                <span id="titre-rappel" className="text-[13px] font-bold tracking-[0.08em] uppercase text-mut">
                  {t("Rappel du défi du jour")}
                </span>
                <Toggle on={reminder} onClick={() => setReminder(!reminder)} labelledBy="titre-rappel" label={reminder ? t("Activé, à 18 h si tu n’as pas joué") : t("Désactivé")} />
              </div>
            </div>
          </div>
        </section>

        <aside aria-label={t("Aperçu de ton profil")} className="flex-[0_1_380px] min-w-[280px] p-[2px] bg-acc cut-lg">
          <div className="h-full box-border flex flex-col items-center gap-3.5 px-7 pt-[30px] pb-8 cut-lg text-center" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--acc) 16%, var(--surf)), var(--surf))" }}>
            <span className="text-[13px] font-bold tracking-[0.08em] uppercase text-mut">{t("Aperçu")}</span>
            <span className="w-[150px] h-[150px] overflow-hidden bg-surf2 cut-md">
              <img src={RANDOM_ART} alt="" className="block w-full h-full object-cover" style={{ filter: "grayscale(1) brightness(0.35) blur(3px)" }} />
            </span>
            <div className="flex flex-col gap-1 max-w-full">
              <span className="font-d font-bold text-[32px] leading-[1.05]" style={{ overflowWrap: "anywhere" }}>
                {pd || "…"}
                <span className="text-mut text-xl">#{tagOf(pd || "x")}</span>
              </span>
              <span className="text-sm text-mut">{role ? t("Rôle préféré : {r}", { r: ROLES.find((r) => r[0] === role)![1] }) : t("Aucun rôle préféré")}</span>
            </div>
            <div className="flex flex-col gap-1.5 w-full pt-3.5 border-t border-line text-left">
              <span className="text-[13px] text-mut">{t("Tes amis pourront t’ajouter avec")}</span>
              <span className="font-d font-bold text-[17px]">
                {pd || "…"}#{tagOf(pd || "x")}
              </span>
            </div>
            <span className="mt-auto text-[13.5px] leading-normal text-mut">{t("Ton chibi, qui colore le site et sert d’avatar, se choisit à l’étape suivante.")}</span>
          </div>
        </aside>
      </div>

      <button
        type="button"
        onClick={confirm}
        aria-disabled={!ok}
        className="h-[58px] px-14 border-0 para font-d font-bold text-[17px] tracking-[0.05em] uppercase"
        style={{ background: ok ? "var(--acc)" : "var(--surf2)", color: ok ? "var(--on-acc)" : "var(--mut)", cursor: ok ? "pointer" : "not-allowed" }}
      >
        {t("Continuer")}
      </button>
    </div>
  );
}

export function Toggle({ on, onClick, label, labelledBy }: { on: boolean; onClick: () => void; label: string; labelledBy?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-labelledby={labelledBy} onClick={onClick} className="flex items-center gap-3 h-11 p-0 border-0 bg-transparent text-ink cursor-pointer text-[14.5px] font-semibold text-left">
      <span aria-hidden="true" className="relative basis-16 shrink-0 h-[34px] cut-sm" style={{ background: on ? "var(--acc)" : "var(--surf2)" }}>
        <span className="absolute top-[5px] w-6 h-6 cut-sm" style={{ left: on ? 35 : 5, background: on ? "var(--on-acc)" : "var(--mut)", transition: "left .15s ease" }} />
      </span>
      {label}
    </button>
  );
}

export function Bienvenue() {
  const t = useT();
  const nav = useNavigate();
  const me = useMe();
  const lang = useLang((s) => s.lang);
  const [starter, setStarter] = useState<string>("lux");
  const [busy, setBusy] = useState(false);
  useThemeOverride(starter);
  if (me.loading) return null;
  if (!me.isUser) return <Navigate to="/" replace />;
  if (!me.profile?.pseudo) return <Navigate to="/pseudo" replace />;

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await post("/api/profil/starter", { chibi: starter });
      await refreshMe();
      nav("/");
    } catch (e) {
      useUi.getState().toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex-auto min-h-screen flex flex-col items-center justify-center gap-[18px] pt-[30px] pb-9 gutter text-center" style={{ background: glow("1000px 560px at 50% 560px", 22) }}>
      <span className="text-[13px] tracking-[0.1em] uppercase text-mut">{t("Première connexion · étape 2 sur 2")}</span>
      <h1 className="m-0 font-d font-bold leading-[1.02] uppercase" style={{ fontSize: "clamp(34px, 4vw, 56px)" }}>
        {t("Choisis ton")} <span className="text-acc">{t("premier chibi")}</span>
      </h1>
      <p className="m-0 max-w-[660px] text-base leading-relaxed text-mut">
        {t("Il colore tout le site, s’affiche sur ton profil et devient ton avatar au leaderboard. Les autres s’achètent à la boutique avec les éclats gagnés chaque jour.")}
      </p>
      <div role="radiogroup" aria-label={t("Chibis de départ")} className="grid gap-[22px] w-full max-w-[1180px] pt-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {STARTERS.map((k) => {
          const on = k === starter;
          const c = CHIBI_BY_KEY[k];
          const name = chibiName(k, lang);
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setStarter(k)}
              aria-label={`${name}, ${STARTER_TAGLINES[k][lang]}`}
              className="relative w-full h-[420px] p-0 border-0 bg-transparent cursor-pointer"
              style={{ transform: on ? "translateY(-10px)" : "none", transition: "transform .2s ease" }}
            >
              <span className="absolute inset-x-0 bottom-0 top-[70px] cut-lg" style={{ background: on ? "var(--acc)" : "var(--line)" }}>
                <span className="absolute inset-[2px] cut-lg bg-surf overflow-hidden">
                  <img src={c.skins[0].art} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "blur(8px) saturate(1.1)", transform: "scale(1.12)", opacity: on ? 0.85 : 0.35, transition: "opacity .2s ease" }} />
                  <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-4 pt-[50px] pb-[18px]" style={{ background: "linear-gradient(180deg, transparent, var(--surf) 60%)" }}>
                    <span className="font-d font-bold text-2xl text-ink">{name}</span>
                    <span className="text-sm text-mut">{STARTER_TAGLINES[k][lang]}</span>
                  </span>
                </span>
              </span>
              {c.skins[0].cut && (
                <img src={c.skins[0].cut} alt="" className="absolute top-0 left-[6%] w-[88%] h-[330px] object-contain" style={{ objectPosition: "50% 100%", filter: "drop-shadow(0 10px 18px rgba(0,0,0,.35))" }} />
              )}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={start} disabled={busy} className="h-[58px] px-[52px] border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[17px] tracking-[0.05em] uppercase">
        {t("Commencer avec {name}", { name: chibiName(starter, lang) })}
      </button>
    </div>
  );
}

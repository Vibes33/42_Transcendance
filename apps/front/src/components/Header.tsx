import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { SITE_LANGS, type SiteLang } from "@loltr/shared";
import { patch } from "../api/client";
import { actions, queryClient, useFriends } from "../api/queries";
import { fmt, useLang, useT } from "../i18n";
import { refreshMe, toggleMode, useMe, useTheme } from "../state/app";
import { disconnectLive, useLive } from "../state/live";
import { useUi, type LoginReason } from "../state/ui";
import { Broadcast, Chevron, Clock, Dots, Flame, Friends, Gear, Globe, Lock, Logo, Logout, Moon, Shard, Sun, UserIcon } from "./icons";

// En-tête collant : logo, 4 onglets, puis série, éclats, amis et le menu de l'avatar, qui regroupe
// profil, paramètres, mode streamer, langue, thème et déconnexion.

export function Header() {
  const t = useT();
  const me = useMe();
  const loc = useLocation();
  const nav = useNavigate();
  const ui = useUi();
  const friends = useFriends(me.isUser);
  const presence = useLive((s) => s.presence);

  const onlineCount = (friends.data?.friends ?? []).filter((f) => (presence[f.userId]?.state ?? f.presence) !== "offline").length;
  const path = loc.pathname;
  const inGameCtx = new URLSearchParams(loc.search).get("ctx");
  const on = {
    defi: path === "/" || path === "/recap" || (path === "/partie" && inGameCtx === "defi"),
    jeux: path === "/jeux" || path === "/mayhem" || (path === "/partie" && inGameCtx === "classique"),
    classement: path === "/classement",
    boutique: path === "/boutique",
    compte: path === "/profil" || path === "/historique" || path === "/parametres" || path === "/stream"
  };
  const guard = (reason: LoginReason, to: string) => () => (me.isUser ? nav(to) : ui.askLogin(reason));
  const groupCount = me.groupMembers.length || 1;

  // Hauteur réelle de l'en-tête : les pages qui doivent tenir dans un seul écran s'en servent via var(--header-h)
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--header-h", el.offsetHeight + "px");
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header
      ref={ref}
      className="sticky top-0 z-30 flex flex-wrap items-center gap-x-11 gap-y-3 py-5 gutter backdrop-blur-md"
      style={{ borderBottom: "1px solid color-mix(in srgb, var(--line) 55%, transparent)", background: "color-mix(in srgb, var(--bg) 82%, transparent)" }}
    >
      <Link to="/" className="flex items-center gap-3 min-h-11 text-ink no-underline font-d font-bold text-[22px] tracking-[0.02em]" data-tuto="logo">
        <Logo className="text-acc" />
        LolTR
      </Link>
      <nav aria-label={t("Navigation principale")} className="flex flex-wrap gap-x-8 gap-y-1 flex-auto" data-tuto="nav">
        <Link className={`nl ${on.defi ? "on" : ""}`} to="/">
          {t("Défi du jour")}
        </Link>
        <Link className={`nl ${on.jeux ? "on" : ""}`} to="/jeux">
          {t("Jeux")}
        </Link>
        <Link className={`nl ${on.classement ? "on" : ""}`} to="/classement">
          {t("Classement")}
        </Link>
        <button type="button" className={`nl ${on.boutique ? "on" : ""}`} onClick={guard("boutique", "/boutique")}>
          {t("Boutique")}
        </button>
      </nav>
      <div className="flex items-center gap-3.5 flex-wrap">
        {me.isUser && (
          <>
            <span role="img" aria-label={t("Série en cours : {n} jours", { n: me.streak })} className="flex items-center gap-1.5 h-11 px-3.5 bg-surf cut-sm font-d font-bold text-base" data-tuto="streak">
              <Flame className="text-acc" />
              {me.streak}
            </span>
            <button type="button" onClick={() => nav("/boutique")} aria-label={t("{n} éclats, ouvrir la boutique", { n: fmt(me.balance) })} className="flex items-center gap-2 h-11 px-4 border-0 bg-surf cut-sm cursor-pointer text-ink font-d font-bold text-base" data-tuto="shards">
              <Shard className="text-acc" />
              {fmt(me.balance)}
            </button>
            <button
              type="button"
              onClick={() => ui.setFriends(!ui.friendsOpen)}
              aria-label={me.inGroup ? t("Amis et groupe : {n} joueurs dans ton groupe", { n: groupCount }) : t("Amis : {n} en ligne", { n: onlineCount })}
              aria-expanded={ui.friendsOpen}
              data-tuto="friends"
              className="relative flex items-center justify-center gap-1.5 h-11 min-w-11 border-0 cut-sm cursor-pointer font-d font-bold text-[15px]"
              style={{
                padding: me.inGroup ? "0 14px" : 0,
                background: me.inGroup ? "var(--acc)" : ui.friendsOpen ? "var(--surf2)" : "var(--surf)",
                color: me.inGroup ? "var(--on-acc)" : "var(--ink)"
              }}
            >
              <Friends />
              {me.inGroup ? (
                <span>{groupCount}/6</span>
              ) : (
                <span aria-hidden="true" className="absolute top-1 right-1 min-w-4 h-4 box-border flex items-center justify-center px-1 rounded-lg bg-ok text-white font-b text-[10.5px] font-bold">
                  {onlineCount}
                </span>
              )}
            </button>
          </>
        )}
        {me.isGuest && (
          <button type="button" onClick={() => ui.askLogin("amis")} aria-label={t("Amis : connexion requise")} className="relative flex items-center justify-center w-11 h-11 p-0 border-0 bg-surf text-mut cut-sm cursor-pointer">
            <Friends />
            <span className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-lg bg-surf2 text-ink">
              <Lock size={11} />
            </span>
          </button>
        )}
        {me.isAnon && (
          <button type="button" onClick={() => ui.askLogin("compte")} className="h-11 px-7 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[15px] tracking-[0.04em] uppercase">
            {t("Se connecter")}
          </button>
        )}
        <AccountMenu active={on.compte} />
      </div>
    </header>
  );
}

/** Menu de l'avatar : compte, réglages rarement modifiés (langue, thème) et déconnexion. */
function AccountMenu({ active }: { active: boolean }) {
  const t = useT();
  const me = useMe();
  const nav = useNavigate();
  const ui = useUi();
  const { lang, setLang } = useLang();
  const mode = useTheme((s) => s.mode);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  useEffect(() => setOpen(false), [me.profile?.userId]);

  const go = (to: string) => () => {
    setOpen(false);
    nav(to);
  };
  const pickLang = (l: SiteLang) => {
    setLang(l);
    if (me.profile?.kind === "user") patch("/api/profil/me", { siteLang: l }).catch(() => {});
  };
  const logout = async () => {
    setOpen(false);
    await actions.logout().catch(() => {});
    disconnectLive();
    queryClient.clear();
    await refreshMe();
    nav("/connexion");
  };

  return (
    <div className="relative" ref={ref}>
      {me.isAnon ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("Langue et thème")}
          className="flex items-center justify-center w-11 h-11 p-0 border-0 cut-sm cursor-pointer text-ink"
          style={{ background: open ? "var(--surf2)" : "var(--surf)" }}
        >
          <Dots />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("Menu du compte")}
          data-tuto="account"
          className="flex items-center gap-2.5 h-11 pl-1 pr-3 border-0 cut-sm cursor-pointer text-ink text-left"
          style={{ background: open ? "var(--surf2)" : "var(--surf)", boxShadow: active ? "inset 0 -2px 0 var(--acc)" : undefined }}
        >
          <span className="block w-9 h-9 overflow-hidden bg-surf2 cut-sm">
            <img src={me.meImg} alt="" className="block w-full h-full object-cover" />
          </span>
          {me.isGuest ? (
            <span className="flex flex-col gap-px">
              <span className="font-bold text-sm leading-[1.1]">{t("Invité")}</span>
              <span className="text-xs font-bold leading-[1.1] text-acc">{t("Se connecter")}</span>
            </span>
          ) : (
            <span className="font-bold text-[15px]">{me.pseudo}</span>
          )}
          <Chevron className="text-mut" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </button>
      )}
      {open && (
        <div role="menu" aria-label={t("Menu du compte")} className="absolute top-[calc(100%+8px)] right-0 z-[41] w-[260px] p-[1.5px] bg-line cut-md" style={{ filter: "drop-shadow(0 16px 30px rgba(0,0,0,.35))" }}>
          <div className="flex flex-col gap-0.5 p-2 bg-surf cut-md">
            {me.isUser && (
              <>
                <MenuItem icon={<UserIcon />} label={t("Profil et collection")} onClick={go("/profil")} />
                <MenuItem icon={<Clock />} label={t("Historique des parties")} onClick={go("/historique")} />
                <MenuItem icon={<Gear />} label={t("Paramètres")} onClick={go("/parametres")} />
                <MenuItem icon={<Broadcast />} label={t("Mode streamer")} onClick={go("/stream")} />
              </>
            )}
            {me.isGuest && (
              <>
                <MenuItem
                  icon={<UserIcon />}
                  label={t("Se connecter")}
                  accent
                  onClick={() => {
                    setOpen(false);
                    ui.askLogin("compte");
                  }}
                />
                <MenuItem icon={<Clock />} label={t("Historique des parties")} onClick={go("/historique")} />
                <MenuItem icon={<Gear />} label={t("Paramètres")} onClick={go("/parametres")} />
              </>
            )}
            {!me.isAnon && <span aria-hidden="true" className="my-1 h-px bg-line" />}
            <div className="flex items-center gap-3 h-11 px-3 text-[15px] font-semibold">
              <Globe className="text-acc shrink-0" />
              <span className="flex-auto">{t("Langue")}</span>
              <span role="group" aria-label={t("Langue du site")} className="flex gap-1">
                {SITE_LANGS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="menuitemradio"
                    aria-checked={l === lang}
                    onClick={() => pickLang(l)}
                    className="h-8 px-2.5 border-0 cut-sm cursor-pointer font-d font-bold text-[13px]"
                    style={{ background: l === lang ? "var(--acc)" : "var(--surf2)", color: l === lang ? "var(--on-acc)" : "var(--ink)" }}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </span>
            </div>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={mode === "dark"}
              aria-label={t("Basculer entre le mode sombre et le mode clair")}
              onClick={() => toggleMode(me.profile)}
              className="flex items-center gap-3 h-11 px-3 border-0 bg-transparent text-ink cut-sm cursor-pointer text-left text-[15px] font-semibold hover:bg-surf2"
            >
              {mode === "dark" ? <Moon className="text-acc shrink-0" /> : <Sun className="text-acc shrink-0" />}
              <span className="flex-auto">{t("Thème")}</span>
              {/* Interrupteur soleil / lune, comme celui de la maquette en plus petit */}
              <span aria-hidden="true" className="relative shrink-0 w-[68px] h-[34px] bg-line cut-sm">
                <span className="absolute inset-[1.5px] bg-surf cut-sm" />
                <span className="absolute top-1 left-1 w-7 h-[26px] bg-acc cut-sm transition-transform duration-200" style={{ transform: mode === "dark" ? "translateX(32px)" : "none" }} />
                <span className="absolute inset-0 flex items-center justify-between px-2.5 text-mut">
                  <Sun className="relative w-4 h-4" style={{ color: mode === "light" ? "var(--on-acc)" : undefined }} />
                  <Moon className="relative w-4 h-4" style={{ color: mode === "dark" ? "var(--on-acc)" : undefined }} />
                </span>
              </span>
            </button>
            {me.isUser && (
              <>
                <span aria-hidden="true" className="my-1 h-px bg-line" />
                <MenuItem icon={<Logout />} label={t("Se déconnecter")} onClick={logout} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, accent }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex items-center gap-3 h-11 px-3 border-0 bg-transparent cut-sm cursor-pointer text-left text-[15px] font-semibold hover:bg-surf2" style={{ color: accent ? "var(--acc)" : "var(--ink)" }}>
      <span className="text-acc shrink-0 flex">{icon}</span>
      {label}
    </button>
  );
}

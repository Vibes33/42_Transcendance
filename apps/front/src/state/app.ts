import { useEffect } from "react";
import { create } from "zustand";
import { CHIBI_BY_KEY, RANDOM_ART } from "@loltr/content/lite";
import type { Profile } from "@loltr/shared";
import { patch } from "../api/client";
import { keys, queryClient, useClassementMe, useDaily, useGroup, useProfile, useSession } from "../api/queries";
import { useSkinAccent } from "../lib/accent";
import { accentFor, hasTheme, skinOf } from "../lib/chibi";
import { useLang } from "../i18n";

// État du joueur, dérivé des services : connecté, invité ou anonyme ; chibi, couleurs, solde, série.

type Mode = "dark" | "light";

function initialMode(): Mode {
  try {
    const m = localStorage.getItem("loltr:mode");
    if (m === "dark" || m === "light") return m;
  } catch {}
  return "dark";
}

interface ThemeState {
  mode: Mode;
  /** Couleur imposée par une page (connexion : neutre, pseudo : Lux, premier chibi : le chibi survolé). */
  override: string | null;
  setMode: (m: Mode) => void;
  setOverride: (k: string | null) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  mode: initialMode(),
  override: null,
  setMode: (mode) => {
    try {
      localStorage.setItem("loltr:mode", mode);
    } catch {}
    set({ mode });
  },
  setOverride: (override) => set({ override })
}));

/** Une page impose sa couleur tant qu'elle est affichée. */
export function useThemeOverride(key: string | null) {
  useEffect(() => {
    useTheme.getState().setOverride(key);
    return () => useTheme.getState().setOverride(null);
  }, [key]);
}

export function toggleMode(profile: Profile | undefined) {
  const next = useTheme.getState().mode === "dark" ? "light" : "dark";
  useTheme.getState().setMode(next);
  if (profile) patch("/api/profil/me", { mode: next === "dark" ? "sombre" : "clair" }).catch(() => {});
}

export function useMe() {
  const session = useSession();
  const kind = session.data?.kind ?? "anonymous";
  const hasSession = kind !== "anonymous";
  const isUser = kind === "user";
  const profile = useProfile(hasSession);
  const classement = useClassementMe(isUser);
  const daily = useDaily();
  const group = useGroup(isUser);
  const p = profile.data;

  const random = !p || p.chibi === "random";
  const dayChamp = daily.data?.cdjFound ? daily.data.cdjChampion : null;
  const skin = !random ? skinOf(p!.chibi, p!.skin) : null;
  // En aléatoire, le site prend les couleurs du champion du jour une fois trouvé.
  const themeKey = !random ? (hasTheme(p!.chibi) ? p!.chibi : "generic") : dayChamp && hasTheme(dayChamp) ? dayChamp : "generic";
  const dayChibi = dayChamp && CHIBI_BY_KEY[dayChamp] ? CHIBI_BY_KEY[dayChamp].skins[0] : null;
  const meImg = skin ? skin.art : dayChibi ? dayChibi.art : RANDOM_ART;
  const groupInfo = group.data ?? null;
  const groupMembers = groupInfo ? groupInfo.members.filter((m) => m.status === "member") : [];

  return {
    loading: session.isLoading || (hasSession && profile.isLoading),
    session: session.data,
    kind,
    isUser,
    isGuest: kind === "guest",
    isAnon: kind === "anonymous",
    profile: p,
    pseudo: p?.pseudo ?? "",
    tag: p?.tag ?? "",
    random,
    skin,
    themeKey,
    meImg,
    balance: classement.data?.balance ?? 0,
    streak: classement.data?.streak.current ?? 0,
    classement: classement.data,
    daily: daily.data,
    group: groupInfo,
    inGroup: !!groupInfo,
    groupMembers,
    /** Membres prêts à jouer (invitations acceptées), sans moi. */
    mates: groupMembers.filter((m) => m.userId !== p?.userId)
  };
}

/** Icône de l'onglet : le logo sur fond transparent, à la couleur d'accent du site. */
function setFavicon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><path d="M9 1h24v24l-8 8H1V9z" fill="none" stroke="${color}" stroke-width="2"/><path d="M17 8l9 9-9 9-9-9z" fill="${color}"/></svg>`;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = "data:image/svg+xml," + encodeURIComponent(svg);
}

/** Applique le mode, la langue et l'accent au document (variables CSS de la maquette). */
export function useApplyTheme() {
  const { themeKey, profile, skin, random } = useMe();
  // Un skin équipé (autre que l'apparence classique) impose sa propre couleur dominante
  const skinAccent = useSkinAccent(random ? null : skin);
  const mode = useTheme((s) => s.mode);
  const override = useTheme((s) => s.override);
  const lang = useLang((s) => s.lang);

  // Les préférences du compte priment sur celles de l'appareil
  useEffect(() => {
    if (!profile) return;
    useTheme.getState().setMode(profile.mode === "clair" ? "light" : "dark");
    if (profile.kind === "user" && profile.siteLang !== useLang.getState().lang) useLang.getState().setLang(profile.siteLang);
  }, [profile?.userId]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    root.classList.toggle("light", mode === "light");
    const acc = !override && skinAccent ? skinAccent[mode === "dark" ? 0 : 1] : accentFor(override ?? themeKey, mode);
    root.style.setProperty("--acc", acc);
    setFavicon(acc);
    root.lang = lang;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#0F1115" : "#F1F1EE");
  }, [mode, override, themeKey, lang, skinAccent]);
}

export const refreshMe = () =>
  Promise.all([keys.session, keys.profile, keys.daily, keys.me, keys.history, keys.group, keys.friends, keys.inventory, keys.shop].map((k) => queryClient.invalidateQueries({ queryKey: k })));

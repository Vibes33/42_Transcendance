import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CHIBIS, CHIBI_BY_KEY, RANDOM_ART, type Chibi } from "@loltr/content/lite";
import type { Profile } from "@loltr/shared";
import { post } from "../api/client";
import { keys, queryClient, useInventory, useLeaderboard, useStats } from "../api/queries";
import { ArrowBtn, Bar } from "../components/ui";
import { Gear, Lock, TriLeft, TriRight } from "../components/icons";
import { ChibiView } from "../components/ChibiView";
import { Vitrine } from "../components/Vitrine";
import { fmt, useLang, useT } from "../i18n";
import { chibiName, skinLabel } from "../lib/chibi";
import { CARD_BY_KEY } from "../lib/games";
import { EMBLEM_BOX, rankEmblem, tierLabel } from "../lib/ranks";
import { useMe } from "../state/app";

// Profil : statistiques, rang, classement des copains, activité récente, et le carrousel des 47
// chibis (lettre pour sauter, flèches, Entrée pour la vitrine des skins).

const LIT = "brightness(1) drop-shadow(0 0 26px color-mix(in srgb, var(--acc) 45%, transparent))";
const DARK = "brightness(0) drop-shadow(0 0 26px color-mix(in srgb, var(--acc) 70%, transparent))";

export function Profil() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const nav = useNavigate();
  const me = useMe();
  const inv = useInventory(me.isUser);
  const stats = useStats(me.isUser);
  const copains = useLeaderboard("copains", "saison", me.isUser);
  const owned = useMemo(() => new Set(inv.data ?? []), [inv.data]);
  const roster: (Chibi & { name: string; letter: string })[] = useMemo(
    () => CHIBIS.map((c) => ({ ...c, name: chibiName(c.key, lang), letter: chibiName(c.key, lang).charAt(0).toUpperCase() })).sort((a, b) => a.name.localeCompare(b.name)),
    [lang]
  );
  const home = Math.max(0, roster.findIndex((c) => c.key === (me.random ? "lux" : me.profile?.chibi)));
  const [cIdx, setCIdx] = useState<number | null>(null);
  const [vitrine, setVitrine] = useState<string | null>(null);
  // Carrousel fluide : la bande contient tous les chibis et défile en continu
  // (scrollLeft animé en easeInOut). La sélection ne change qu'à l'arrivée (sinon chaque carte
  // traversée grandit puis rapetisse : effet de rebond), puis la vitrine s'ouvre.
  // (Déclaré avant les retours anticipés : les hooks ne peuvent pas être conditionnels.)
  const stripRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const raf = useRef<number | null>(null);
  const gliding = useRef(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKey = useRef<string | null>(null);
  const cancelGlide = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    gliding.current = false;
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = null;
    pendingKey.current = null;
  };
  useEffect(() => () => cancelGlide(), []);
  const setCardRef = (key: string, el: HTMLButtonElement | null) => {
    if (el) cardRefs.current.set(key, el);
    else cardRefs.current.delete(key);
  };
  // Centre la carte `key` dans la bande, sans animation.
  const centerKey = (key: string) => {
    const strip = stripRef.current;
    const el = cardRefs.current.get(key);
    if (!strip || !el) return;
    const s = strip.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    strip.scrollLeft += r.left - s.left - (strip.clientWidth - el.clientWidth) / 2;
  };
  const selKey = cIdx != null ? (roster[cIdx]?.key ?? null) : me.random ? "__random" : (roster[home]?.key ?? null);
  // Recentre après un changement hors animation (montage, langue, équipement).
  useEffect(() => {
    if (!gliding.current && selKey) centerKey(selKey);
  }, [selKey]);
  const letterRefs = useRef(new Map<string, HTMLButtonElement>());
  // La barre de lettres suit la sélection du carrousel (lettre courante centrée).
  useEffect(() => {
    const el = letterRefs.current.get(roster[cIdx ?? home]?.letter ?? "");
    if (!el) return;
    const reduced = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ inline: "center", block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [cIdx, home, roster]);
  // Une lettre tapée n'importe où sur la page saute au champion correspondant
  // (sauf en saisie ou vitrine ouverte, qui gardent leurs propres touches).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!/^[a-zA-Z]$/.test(e.key)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (vitrine) return;
      e.preventDefault();
      jump(e.key.toUpperCase());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // Petite pause après l'arrivée du carrousel avant d'ouvrir la vitrine.
  const scheduleVitrine = (key: string) => {
    if (openTimer.current) clearTimeout(openTimer.current);
    pendingKey.current = key;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      if (pendingKey.current === key) {
        pendingKey.current = null;
        setVitrine(key);
      }
    }, 200);
  };
  const glideTo = (i: number, open: boolean) => {
    const list = rosterRef.current;
    const clamp = (v: number) => Math.max(0, Math.min(list.length - 1, v));
    const t = clamp(i);
    const key = list[t].key;
    const strip = stripRef.current;
    const el = cardRefs.current.get(key);
    const cur0 = cIdx ?? home;
    const reduced = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!strip || !el || reduced || cur0 === t) {
      cancelGlide();
      setCIdx(t);
      if (open) setVitrine(key);
      else centerKey(key);
      return;
    }
    cancelGlide();
    const s = strip.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const from = strip.scrollLeft;
    const to = from + (r.left - s.left) - (strip.clientWidth - el.clientWidth) / 2;
    const dist = Math.abs(t - cur0);
    const dur = Math.min(900, 220 + dist * 45);
    const t0 = performance.now();
    gliding.current = true;
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      strip.scrollLeft = from + (to - from) * e;
      if (p < 1) {
        raf.current = requestAnimationFrame(frame);
      } else {
        raf.current = null;
        gliding.current = false;
        setCIdx(t);
        if (open) scheduleVitrine(list[t].key);
      }
    };
    raf.current = requestAnimationFrame(frame);
  };
  if (!me.loading && !me.isUser) return <Navigate to="/" replace />;
  if (!me.profile) return null;

  const cur = cIdx ?? home;
  const jump = (L: string) => {
    const same = roster.map((c, i) => (c.letter === L ? i : -1)).filter((i) => i >= 0);
    if (!same.length) return;
    const after = same.find((i) => i > cur);
    glideTo(roster[cur].letter === L && after !== undefined ? after : same[0], false);
  };
  const present = new Set(roster.map((c) => c.letter));

  const random = me.random;
  const chibi = !random ? CHIBI_BY_KEY[me.profile.chibi] : null;
  const label = chibi && me.skin ? skinLabel(chibi, me.skin, lang) : "";
  const selArt = me.skin?.art ?? RANDOM_ART;
  const selCut = random ? CHIBI_BY_KEY.lux.skins[0].cut : (me.skin?.cut ?? null);
  const cl = me.classement;
  const projected = cl?.today.projected ?? me.daily?.projectedTotal ?? 0;
  const myFriendRank = copains.data?.rows.findIndex((r) => r.userId === me.profile?.userId);
  const chibisOwned = CHIBIS.filter((c) => owned.has("chibi:" + c.key)).length;

  const pickRandom = async () => {
    cancelGlide();
    const p = await post<Profile>("/api/profil/equip", { chibi: "random" }).catch(() => null);
    if (p) queryClient.setQueryData(keys.profile, p);
  };

  const recentLine = (r: NonNullable<typeof stats.data>["recent"][number]) => {
    const name = t(CARD_BY_KEY[r.game]?.name ?? r.game);
    const x = r.result ?? {};
    if (r.game === "cdj") return x.found ? t("{g} trouvé en {n} essais", { g: name, n: x.tries }) : t("{g} : pas trouvé", { g: name });
    if (r.game === "meli") return t("{g}, {n} champions", { g: name, n: x.champions ?? 0 });
    if (r.game === "se") return t("{g}, {n} bonnes réponses", { g: name, n: x.correct ?? 0 });
    return x.found ? t("{g} trouvé en {n} essais", { g: name, n: x.tries }) : t("{g} : pas trouvé", { g: name });
  };

  return (
    <div className="relative flex-auto flex flex-col min-h-[calc(100vh-85px)]">
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <img src={selArt} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: random ? "blur(36px) grayscale(1) brightness(0.6)" : "blur(36px) saturate(1.15)", transform: "scale(1.15)" }} />
        <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--bg) 55%, transparent)" }} />
      </div>

      <main className="relative flex-auto min-h-0 flex flex-wrap items-center content-center gap-x-6 gap-y-4 pt-5 pb-2.5 gutter">
        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3">
          <Panel>
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-semibold text-acc">{t("Invocateur · {name} équipé", { name: random ? t("chibi aléatoire") : label })}</span>
              <Link to="/parametres" aria-label={t("Paramètres")} className="flex items-center justify-center w-9 h-9 -mt-1.5 -mr-2 bg-surf2 text-mut cut-sm hover:text-ink">
                <Gear />
              </Link>
            </div>
            <h1 className="m-0 font-d font-bold text-[32px] leading-[1.05]">
              {me.pseudo}
              <span className="text-mut text-lg">#{me.tag}</span>
            </h1>
            <p className="mt-1 mb-0 text-sm leading-normal text-mut">
              {random
                ? t("Un chibi différent t’accueille à chaque visite, et le site prend les couleurs du champion du jour.")
                : t("Ton chibi équipé colore tout le site et sert d’avatar au leaderboard. Clique un chibi pour voir ses skins.")}
            </p>
          </Panel>
          <Panel gap="gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="label">{t("Points du jour")}</span>
              <span className="text-[13px] text-mut">{t("prévisionnels")}</span>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="font-d font-bold text-5xl leading-none">{fmt(projected)}</span>
              <span className="font-d font-medium text-xl text-mut">/ 1 000</span>
            </div>
            <Bar pct={(projected / 1000) * 100} label={t("{n} points sur 1 000", { n: projected })} />
          </Panel>
          <Panel gap="gap-2.5">
            <span className="label">{t("Rang du joueur")}</span>
            <div className="flex items-center gap-3.5">
              <RankEmblem tier={cl?.rank.tier ?? "bronze"} width={92} />
              <div className="flex flex-col gap-0.5">
                <span className="font-d font-bold text-[26px] text-acc">{cl ? tierLabel(cl.rank.tier, cl.rank.division) : "—"}</span>
                <span className="text-[13.5px] text-mut">
                  {cl?.rank.position ? t("n° {n} mondial", { n: fmt(cl.rank.position) }) : t("Pas encore classé cette saison")}
                  {myFriendRank !== undefined && myFriendRank >= 0 && copains.data ? " · " + t("n° {n} sur {total} copains", { n: myFriendRank + 1, total: copains.data.friendsTotal ?? 0 }) : ""}
                </span>
              </div>
            </div>
            <Bar pct={cl?.rank.position && cl.rank.total ? 100 - ((cl.rank.position - 1) / cl.rank.total) * 100 : 0} label={t("Saison {n} : {p} points", { n: cl?.season.number ?? 0, p: cl?.season.points ?? 0 })} />
          </Panel>
        </div>

        <div className="flex-[1.2_1_340px] min-w-0 flex justify-center">
          <div className="relative" style={{ width: "min(100%, 430px)", height: "min(510px, max(360px, calc(100vh - 360px)))" }}>
            <div className="absolute inset-x-0 top-20 bottom-[30px] bg-acc cut-lg">
              <div className="absolute inset-[2px] cut-lg bg-surf overflow-hidden">
                <img src={selArt} alt="" className="block w-full h-full object-cover" style={{ filter: random ? "blur(10px) grayscale(1) brightness(0.5)" : me.skin?.cut || me.skin?.model3d ? "blur(10px) saturate(1.1)" : "none", transform: "scale(1.12)" }} />
              </div>
            </div>
            <ChibiView
              img={selCut}
              model3d={random ? null : (me.skin?.model3d ?? null)}
              placement="profil"
              bleed={0.25}
              alt={random ? t("Ombre d’un chibi tiré au hasard") : t("Chibi {name}", { name: label })}
              className="absolute top-0 left-0 w-full object-contain"
              style={{ height: "calc(100% - 36px)", objectPosition: "50% 100%", filter: random ? DARK : LIT }}
            />
            <div className="absolute left-5 bottom-0 p-[1.5px] bg-acc cut-sm">
              <div className="flex flex-col gap-0.5 px-[18px] py-2 bg-surf cut-sm">
                <span className="font-d font-bold text-[19px] text-acc">{random ? t("Chibi aléatoire") : chibiName(me.profile.chibi, lang)}</span>
                <span className="text-[13px] text-mut">{random ? t("Change à chaque visite") : me.skin?.kind === "base" ? t("Apparence classique") : me.skin?.name[lang]}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3">
          <Panel>
            <span className="label">{t("Statistiques")}</span>
            <div className="grid grid-cols-4 gap-2.5">
              {[
                [me.streak, "Jours de série"],
                [cl?.streak.best ?? 0, "Meilleure série"],
                [stats.data?.defisCompleted ?? 0, "Défis terminés"],
                [chibisOwned, "Chibis débloqués"]
              ].map(([v, l]) => (
                <div key={l as string} className="flex flex-col items-center gap-1.5 text-center">
                  <div className="w-full max-w-16 h-[50px] bg-acc cut-sm p-[1.5px] box-border">
                    <div className="h-[47px] flex items-center justify-center bg-surf cut-sm font-d font-bold text-[21px] text-acc">{v}</div>
                  </div>
                  <span className="text-[12.5px] text-mut">{t(l as string)}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel gap="gap-1.5" pad="pt-3 pb-4">
            <div className="flex items-center justify-between gap-3">
              <span className="label">{t("Classement des copains")}</span>
              <button type="button" className="tl text-sm" onClick={() => nav("/classement")}>
                {t("Leaderboard")}
              </button>
            </div>
            {(copains.data?.rows ?? []).slice(0, 3).map((p) => (
              <div key={p.userId} className="flex items-center gap-3.5 py-[7px] px-3.5 cut-sm" style={{ background: p.userId === me.profile?.userId ? "color-mix(in srgb, var(--acc) 26%, var(--surf2))" : "var(--surf2)" }}>
                <span className="basis-[22px] shrink-0 font-d font-bold text-[17px] text-acc">{p.rank}</span>
                <span className="flex-auto min-w-0 font-semibold text-[14.5px]">
                  {p.pseudo}
                  {p.userId === me.profile?.userId ? " " + t("(toi)") : ""}
                </span>
                <span className="font-d font-semibold text-[14.5px] text-mut">{t("{n} pts", { n: fmt(p.points) })}</span>
              </div>
            ))}
            {copains.data && copains.data.rows.length === 0 && <span className="text-sm text-mut">{t("Ajoute des amis pour vous comparer.")}</span>}
          </Panel>
          <Panel gap="gap-2">
            <span className="label">{t("Activité récente")}</span>
            {(stats.data?.recent ?? [])
              .filter((r) => r.context === "defi")
              .slice(0, 3)
              .map((r, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3.5 text-sm">
                  <span>{recentLine(r)}</span>
                  <span className="shrink-0 font-d font-bold text-acc">+{r.basePoints ?? 0}</span>
                </div>
              ))}
            {stats.data && stats.data.recent.filter((r) => r.context === "defi").length === 0 && <span className="text-sm text-mut">{t("Joue ton premier défi du jour !")}</span>}
          </Panel>
        </div>
      </main>

      <section aria-label={t("Choix du chibi")} className="relative flex flex-col items-stretch gap-3.5 pt-3 pb-[26px] gutter">
        <div className="flex items-center gap-3 w-full">
          <ArrowBtn onClick={(e) => { glideTo(cur - 1, false); if (e.detail !== 0) stripRef.current?.focus({ preventScroll: true }); }} label={t("Chibi précédent")} size={48}>
            <TriLeft size={18} />
          </ArrowBtn>
          <div
            ref={stripRef}
            className="kb flex min-w-0 flex-1 items-center gap-3 box-border overflow-x-auto scroll"
            tabIndex={0}
            role="group"
            aria-label={t("Carrousel des chibis. Tape une lettre pour aller au premier champion qui commence par elle, flèches pour naviguer, Entrée pour ouvrir la vitrine des skins.")}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                glideTo(cur + 1, false);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                glideTo(cur - 1, false);
              } else if (e.key === "Enter") {
                e.preventDefault();
                cancelGlide();
                setVitrine(roster[cur].key);
              }
            }}
          >
            <button
              type="button"
              ref={(el) => setCardRef("__random", el)}
              onClick={pickRandom}
              aria-pressed={random}
              aria-label={t("Chibi aléatoire")}
              className="relative w-[calc((100%_-_96px)/9)] min-w-[84px] shrink-0 p-0 border-0 cut-sm cursor-pointer transition-[height,background-color] duration-150"
              style={{ height: random ? 156 : 134, background: random ? "var(--acc)" : "var(--line)" }}
            >
              <span className="absolute inset-[2px] flex flex-col items-center justify-between pt-3 bg-surf2 cut-sm">
                <span className="w-11 h-11 box-border flex items-center justify-center rounded-full border-2 border-acc font-d font-bold text-[26px] text-acc">?</span>
                <span className="w-full pt-1 pb-1.5 bg-surf text-xs font-bold text-ink text-center">{t("Aléatoire")}</span>
              </span>
            </button>
            {roster.map((c, i) => {
              const on = i === cur;
              const isEq = !random && c.key === me.profile?.chibi;
              const unlocked = owned.has("chibi:" + c.key);
              const extra = c.skins.length - 1;
              return (
                <button
                  key={c.key}
                  type="button"
                  ref={(el) => setCardRef(c.key, el)}
                  onClick={() => glideTo(i, true)}
                  aria-pressed={on}
                  aria-label={`${c.name}${unlocked ? "" : ", " + t("verrouillé")}${isEq ? ", " + t("équipé") : ""}, ${t("ouvrir la vitrine")}`}
                  className="relative w-[calc((100%_-_96px)/9)] min-w-[84px] shrink-0 p-0 border-0 cut-sm cursor-pointer transition-[height,background-color] duration-150"
                  style={{ height: on ? 156 : 134, background: on ? "var(--acc)" : isEq ? "var(--ink)" : "var(--line)" }}
                >
                  <span className="absolute inset-[2px] flex flex-col justify-end bg-surf2 cut-sm overflow-hidden">
                    <img src={isEq && me.skin ? me.skin.art : c.skins[0].art} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: unlocked ? "none" : "grayscale(1) brightness(0.4)" }} />
                    <span className="relative w-full pt-1 pb-1.5 bg-surf text-xs font-bold text-center" style={{ color: unlocked ? "var(--ink)" : "var(--mut)" }}>
                      {c.name}
                    </span>
                  </span>
                  {!unlocked && (
                    <span className="absolute top-2 right-2 text-white">
                      <Lock />
                    </span>
                  )}
                  <span className="absolute top-[7px] left-[7px] px-[5px] py-px bg-surf cut-sm font-d font-bold text-[10.5px] text-ink">{extra > 0 ? "+" + extra : "1"}</span>
                </button>
              );
            })}
          </div>
          <ArrowBtn onClick={(e) => { glideTo(cur + 1, false); if (e.detail !== 0) stripRef.current?.focus({ preventScroll: true }); }} label={t("Chibi suivant")} size={48}>
            <TriRight size={18} />
          </ArrowBtn>
        </div>
        <nav aria-label={t("Aller aux champions par lettre")} className="flex flex-nowrap items-center justify-start w-fit max-w-full mx-auto gap-0.5 overflow-x-auto scroll">
          {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((L) => {
            const ok = present.has(L);
            const isCur = roster[cur].letter === L;
            return (
              <button
                key={L}
                type="button"
                ref={(el) => {
                  if (el) letterRefs.current.set(L, el);
                  else letterRefs.current.delete(L);
                }}
                onClick={(e) => {
                  jump(L);
                  if (e.detail !== 0) stripRef.current?.focus({ preventScroll: true });
                }}
                disabled={!ok}
                aria-current={isCur}
                aria-label={ok ? t("Aller aux champions en {l}", { l: L }) : t("Aucun champion en {l}", { l: L })}
                className={`h-7 min-w-6 shrink-0 px-1 border-0 cut-sm font-d font-bold text-[13px] ${isCur ? "bg-acc text-on-acc" : ok ? "bg-transparent text-ink hover:bg-surf2" : "bg-transparent text-mut opacity-30 cursor-default"}`}
              >
                {L}
              </button>
            );
          })}
        </nav>
      </section>
      {vitrine && <Vitrine chibiKey={vitrine} owned={owned} onClose={() => { setVitrine(null); stripRef.current?.focus({ preventScroll: true }); }} />}
    </div>
  );
}

function Panel({ children, gap = "gap-3", pad = "py-4" }: { children: React.ReactNode; gap?: string; pad?: string }) {
  return (
    <div className="bg-line cut-md p-px">
      <div className={`flex flex-col ${gap} ${pad} px-[22px] bg-surf cut-md`}>{children}</div>
    </div>
  );
}


/** Emblème de palier recadré sur sa zone utile. */
function RankEmblem({ tier, width }: { tier: string; width: number }) {
  const t = useT();
  const k = width / EMBLEM_BOX.w;
  return (
    <span className="relative shrink-0 overflow-hidden" style={{ width, height: EMBLEM_BOX.h * k }}>
      <img
        src={rankEmblem(tier)}
        alt={t("Emblème {tier}", { tier: tierLabel(tier, null) })}
        className="absolute max-w-none"
        style={{ width: EMBLEM_BOX.imgW * k, height: EMBLEM_BOX.imgH * k, left: -EMBLEM_BOX.x * k, top: -EMBLEM_BOX.y * k }}
      />
    </span>
  );
}

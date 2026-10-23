import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CHIBI_BY_KEY, type ChibiSkin } from "@loltr/content/lite";
import type { Profile } from "@loltr/shared";
import { post } from "../api/client";
import { keys, queryClient, useInvalidate } from "../api/queries";
import { fmt, useLang, useT } from "../i18n";
import { chibiName } from "../lib/chibi";
import { useMe } from "../state/app";
import { useUi } from "../state/ui";
import { ChibiView } from "./ChibiView";
import { CloseBtn } from "./ui";

// Vitrine des skins d'un chibi : aperçu, statut (équipé, possédé, prix), équiper ou acheter en éclats.
// Les skins d'un chibi demandent d'avoir d'abord le chibi.

export function itemOf(s: ChibiSkin) {
  return s.kind === "base" ? "chibi:" + s.key : "skin:" + s.id;
}

export function Vitrine({ chibiKey, owned, onClose }: { chibiKey: string; owned: Set<string>; onClose: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const me = useMe();
  const nav = useNavigate();
  const invalidate = useInvalidate();
  const c = CHIBI_BY_KEY[chibiKey];
  const equippedSkin = me.profile?.chibi === chibiKey ? (me.skin?.id ?? c.skins[0].id) : null;
  const [sel, setSel] = useState(equippedSkin ?? c.skins[0].id);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const skin = c.skins.find((s) => s.id === sel) ?? c.skins[0];
  const idx = c.skins.indexOf(skin);
  const name = chibiName(chibiKey, lang);
  const hasChibi = owned.has("chibi:" + chibiKey);

  useEffect(() => ref.current?.focus(), []);

  const describe = (s: ChibiSkin) => {
    const got = owned.has(itemOf(s));
    const isEq = equippedSkin === s.id;
    const status = isEq ? t("Équipé") : got ? t("Possédé") : t("{n} éclats", { n: fmt(s.price) });
    const help = isEq
      ? t("Skin équipé : il colore le site et sert d’avatar dans le leaderboard.")
      : got
        ? t("Tu possèdes ce skin. Équipe-le pour l’afficher partout sur le site.")
        : s.kind !== "base" && !hasChibi
          ? t("Achète d’abord le chibi {name} pour débloquer ses skins.", { name })
          : s.kind === "prestige"
            ? t("Skin prestige : il s’achète avec des éclats gagnés au classement et aux défis du jour.")
            : s.kind === "base"
              ? t("Ce chibi s’achète avec des éclats. Une fois à toi, il est gardé pour toujours.")
              : t("Ce skin s’achète avec des éclats et reste dans ta collection pour toujours.");
    return { got, isEq, status, help };
  };
  const d = describe(skin);
  const blocked = !d.got && skin.kind !== "base" && !hasChibi;
  const missing = Math.max(0, skin.price - me.balance);

  const equip = async () => {
    setBusy(true);
    try {
      const p = await post<Profile>("/api/profil/equip", { chibi: chibiKey, skin: skin.kind === "base" ? null : skin.id });
      queryClient.setQueryData(keys.profile, p);
      onClose();
    } catch (e) {
      useUi.getState().toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };
  const buy = async () => {
    setBusy(true);
    try {
      await post("/api/classement/shop/buy", { itemId: itemOf(skin) });
      await invalidate(keys.inventory, keys.me, keys.shop);
      useUi.getState().toast(t("{name} rejoint ta collection !", { name: skin.kind === "base" ? name : name + " " + skin.name[lang] }), "ok");
    } catch (e) {
      useUi.getState().toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[45] flex items-center justify-center p-4 sm:p-6 box-border"
      style={{ background: "color-mix(in srgb, var(--bg) 40%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="kb p-[2px] bg-acc cut-lg max-h-full overflow-auto"
        tabIndex={0}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-vitrine"
        style={{ width: "min(100%, 1020px)" }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowRight") {
            e.preventDefault();
            setSel(c.skins[(idx + 1) % c.skins.length].id);
          } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
            e.preventDefault();
            setSel(c.skins[(idx - 1 + c.skins.length) % c.skins.length].id);
          } else if (e.key === "Escape") onClose();
        }}
      >
        <div className="relative flex flex-wrap gap-7 px-[30px] max-sm:px-4 py-7 bg-surf cut-lg">
          <CloseBtn onClick={onClose} label={t("Fermer la vitrine")} className="absolute top-3.5 right-3.5 z-10" />
          <div className="relative flex-[1_1_360px] min-w-0 h-[470px] max-sm:h-[380px]">
            <div className="absolute inset-x-0 bottom-0 top-16 bg-line cut-lg">
              <div className="absolute inset-[1.5px] cut-lg bg-surf2 overflow-hidden">
                <img src={skin.art} alt="" className="block w-full h-full object-cover" style={{ filter: skin.cut || skin.model3d ? "blur(10px) saturate(1.1)" : d.got ? "none" : "grayscale(.6) brightness(.7)", transform: "scale(1.12)" }} />
              </div>
            </div>
            <ChibiView
              key={skin.id}
              img={skin.cut}
              model3d={skin.model3d}
              placement="vitrine"
              bleed={0.08}
              alt={t("Chibi {name}", { name })}
              className="absolute top-0 left-0 w-full h-[456px] max-sm:h-[370px] object-contain"
              style={{ objectPosition: "50% 100%", filter: d.got ? "none" : "grayscale(.5) brightness(.75)" }}
            />
            <div className="absolute top-20 right-3.5 px-3 py-[7px] bg-surf cut-sm font-d font-bold text-[12.5px] tracking-[0.08em] uppercase">{d.status}</div>
          </div>
          <div className="flex-[1_1_400px] min-w-0 flex flex-col gap-3">
            <h2 id="titre-vitrine" className="m-0 pr-14 font-d font-bold text-[28px] uppercase">
              {t("Skins de")} <span className="text-acc">{name}</span>
            </h2>
            <span className="text-[13.5px] text-mut">
              {t("{n} " + (c.skins.length > 1 ? "skins" : "skin"), { n: c.skins.length })} · {t("↑ ↓ pour parcourir, Échap pour fermer")}
            </span>
            <div className="flex flex-col gap-2">
              {c.skins.map((k) => {
                const dk = describe(k);
                const on = k.id === skin.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setSel(k.id)}
                    aria-pressed={on}
                    aria-label={`${name} ${k.name[lang]}, ${dk.status}`}
                    className="flex items-center gap-3.5 w-full py-[7px] pl-[7px] pr-3.5 border-0 text-ink cut-sm cursor-pointer text-left"
                    style={{ background: on ? "color-mix(in srgb, var(--acc) 24%, var(--surf2))" : "var(--surf2)" }}
                  >
                    <span className="basis-14 shrink-0 h-14 overflow-hidden cut-sm">
                      <img src={k.art} alt="" className="block w-full h-full object-cover" style={{ filter: dk.got ? "none" : "grayscale(.7) brightness(.55)" }} />
                    </span>
                    <span className="flex-auto min-w-0 font-d font-bold text-[16.5px]">{k.kind === "base" ? t("Classique") : k.name[lang]}</span>
                    {k.kind === "prestige" && <span className="px-2 py-1 bg-acc text-on-acc cut-sm font-d font-bold text-[10.5px] tracking-[0.1em] uppercase">{t("Prestige")}</span>}
                    <span className="font-d font-semibold text-[12.5px] tracking-[0.08em] uppercase" style={{ color: dk.got ? "var(--acc)" : "var(--mut)" }}>
                      {dk.status}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="text-sm leading-[1.55] text-mut">{d.help}</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {d.got && !d.isEq && (
                <button type="button" onClick={equip} disabled={busy} className="h-[50px] px-9 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                  {t("Équiper")}
                </button>
              )}
              {!d.got && !blocked && missing === 0 && (
                <button type="button" onClick={buy} disabled={busy} className="h-[50px] px-9 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                  {t("Acheter · {n} éclats", { n: fmt(skin.price) })}
                </button>
              )}
              {!d.got && !blocked && missing > 0 && (
                <>
                  <span className="text-sm font-bold">{t("{p} éclats · il te manque {n} éclats", { p: fmt(skin.price), n: fmt(missing) })}</span>
                  <button type="button" className="tl text-sm" onClick={() => nav("/boutique")}>
                    {t("Gagner des éclats")}
                  </button>
                </>
              )}
              {blocked && (
                <button type="button" className="tl text-sm" onClick={() => setSel(c.skins[0].id)}>
                  {t("Voir le chibi {name}", { name })}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

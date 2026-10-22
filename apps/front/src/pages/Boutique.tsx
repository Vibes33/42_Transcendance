import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { CHIBI_BY_KEY, SKIN_BY_ID } from "@loltr/content/lite";
import { SHARDS, type ShopItem } from "@loltr/shared";
import { post } from "../api/client";
import { keys, useInvalidate, useShop } from "../api/queries";
import { Shard } from "../components/icons";
import { glow } from "../components/ui";
import { fmt, useLang, useT } from "../i18n";
import { chibiName } from "../lib/chibi";
import { useMe } from "../state/app";
import { useUi } from "../state/ui";

// Boutique : trois onglets (Chibis, Skins, Prestige), un skin prestige mis en avant chaque semaine.
// Tout s'achète en éclats, gagnés et jamais achetés ; les achats sont gardés pour toujours.

type Tab = "chibi" | "skin" | "prestige";

export function Boutique() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const me = useMe();
  const shop = useShop();
  const invalidate = useInvalidate();
  const [tab, setTab] = useState<Tab>("chibi");
  const [busy, setBusy] = useState<string | null>(null);
  const items = shop.data?.items ?? [];
  const balance = shop.data?.balance ?? me.balance;
  const owned = useMemo(() => new Set(items.filter((i) => i.owned).map((i) => i.id)), [items]);

  if (!me.loading && !me.isUser) return <Navigate to="/" replace />;

  // Carte : le nom du skin en gros, celui du chibi en petit dessous ; un chibi n'affiche que son nom
  const info = (it: ShopItem) => {
    if (it.kind === "chibi") {
      const c = CHIBI_BY_KEY[it.ref];
      const name = chibiName(it.ref, lang);
      return { name, title: name, note: "", art: c.skins[0].art };
    }
    const s = SKIN_BY_ID[it.ref];
    const chibi = chibiName(s.key, lang);
    return { name: `${chibi} ${s.name[lang]}`, title: s.name[lang], note: chibi, art: s.art };
  };

  const featured = items.find((i) => i.featured) ?? null;
  const fInfo = featured ? info(featured) : null;
  const fMissing = featured ? Math.max(0, featured.price - balance) : 0;
  const shown = items.filter((i) => i.kind === tab).sort((a, b) => Number(a.owned) - Number(b.owned) || a.price - b.price || info(a).name.localeCompare(info(b).name));

  const buy = async (it: ShopItem) => {
    if (it.requires && !owned.has(it.requires)) return useUi.getState().toast(t("Débloque d’abord ce chibi."), "danger");
    setBusy(it.id);
    try {
      await post("/api/classement/shop/buy", { itemId: it.id });
      await invalidate(keys.shop, keys.me, keys.inventory);
      useUi.getState().toast(t("{name} rejoint ta collection !", { name: info(it).name }), "ok");
    } catch (e) {
      useUi.getState().toast((e as Error).message, "danger");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative flex-auto flex flex-col" style={{ background: glow("900px 560px at 30% 420px", 20) }}>
      {featured && fInfo && (
        <section className="flex flex-wrap items-center gap-x-14 gap-y-9 pt-12 gutter">
          <div className="relative shrink basis-[460px] min-w-[260px] h-[480px] max-sm:h-[360px] bg-acc cut-lg">
            <div className="absolute inset-[2px] cut-lg bg-surf2 overflow-hidden">
              <img src={fInfo.art} alt={t("Chibi {name}, édition prestige", { name: fInfo.name })} className="block w-full h-full object-cover" />
            </div>
            <span className="absolute top-5 left-5 px-3.5 py-[7px] bg-acc text-on-acc cut-sm font-d font-bold text-[13px] tracking-[0.1em] uppercase">{t("Prestige de la semaine")}</span>
          </div>
          <div className="flex-[1_1_420px] min-w-0 flex flex-col items-start gap-5">
            <h1 className="m-0 font-d font-bold leading-none uppercase" style={{ fontSize: "clamp(38px, 4.8vw, 68px)" }}>
              {t("Boutique")} <span className="text-acc">{t("LolTR")}</span>
            </h1>
            <p className="m-0 max-w-[560px] text-[17px] leading-relaxed text-mut">
              {t("Chibis, skins et éditions prestige s’achètent avec les éclats gagnés aux défis du jour, avec tes points et au classement de fin de saison.")}
            </p>
            <div className="flex flex-col gap-1">
              <span className="font-d font-bold text-[26px]">{fInfo.title}</span>
              <span className="text-[15px] font-semibold text-ink">{fInfo.note}</span>
              <span className="text-[15px] text-mut">
                {t("Édition prestige · disponible encore {n} jours", { n: Math.max(1, Math.ceil(((featured.availableUntil ?? Date.now()) - Date.now()) / 86_400_000)) })}
              </span>
            </div>
            <div className="flex flex-col gap-2" style={{ width: "min(100%, 460px)" }}>
              <div className="flex justify-between text-sm text-mut">
                <span>{t("{b} sur {p}", { b: fmt(balance), p: fmt(featured.price) })}</span>
                <span>{Math.min(100, Math.round((balance / featured.price) * 100))}%</span>
              </div>
              <div role="img" aria-label={t("{b} éclats sur {p}", { b: fmt(balance), p: fmt(featured.price) })} className="h-2.5 bg-surf2">
                <div className="h-2.5 bg-acc" style={{ width: `${Math.min(100, (balance / featured.price) * 100)}%` }} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="flex items-center gap-2 font-d font-bold text-[30px] text-acc">
                <Shard size={26} />
                {fmt(featured.price)}
              </span>
              {featured.owned ? (
                <span className="text-[15px] text-mut">{t("Dans ta collection")}</span>
              ) : fMissing > 0 ? (
                <span className="text-[15px] text-mut">{t("Il te manque {n} éclats", { n: fmt(fMissing) })}</span>
              ) : (
                <button type="button" onClick={() => buy(featured)} disabled={busy === featured.id} className="h-[50px] px-9 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                  {t("Acheter")}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="titre-gagner" className="flex flex-col gap-5 pt-16 gutter">
        <h2 id="titre-gagner" className="m-0 font-d font-bold text-[26px] tracking-[0.04em] uppercase">
          {t("Gagner des éclats")}
        </h2>
        <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <EarnCard
            edge="var(--acc)"
            title={t("Classement mondial")}
            badge={<span className="text-[13px] text-acc font-bold">{t("Le plus généreux")}</span>}
            sub={t("Versée à la fin de chaque saison de 4 semaines, selon ta place.")}
            rows={[
              ...SHARDS.seasonGlobal.map((r) => [t("Top {n}", { n: fmt(r.top) }), r.shards] as [string, number]),
              [t("Participation ({n} jours joués)", { n: SHARDS.seasonGlobalParticipation.minDays }), SHARDS.seasonGlobalParticipation.shards]
            ]}
          />
          <EarnCard
            title={t("Classement copains")}
            badge={<span className="text-[13px] text-mut font-bold">{t("Environ 3 fois moins")}</span>}
            sub={t("Pour jouer entre amis sans pouvoir farmer la boutique.")}
            rows={[
              [t("1ʳᵉ place"), SHARDS.seasonFriends[0]],
              [t("2ᵉ place"), SHARDS.seasonFriends[1]],
              [t("3ᵉ place"), SHARDS.seasonFriends[2]],
              [t("Participation"), SHARDS.seasonFriendsParticipation]
            ]}
            foot={t("Comptée seulement avec au moins {n} copains actifs.", { n: SHARDS.seasonFriendsMinActive })}
          />
          <EarnCard
            title={t("Points et défis du jour")}
            sub={t("Chaque jour, même sans finir haut au classement.")}
            rows={[
              [t("Tranche de 500 points marqués"), SHARDS.per500Points],
              [t("Défi du jour terminé"), SHARDS.dailyCompleted],
              [t("Champion du jour trouvé"), SHARDS.cdjFound],
              [t("{n} défis dans la semaine", { n: SHARDS.weeklyBonus.minDays }), SHARDS.weeklyBonus.shards]
            ]}
          />
        </div>
      </section>

      <section aria-labelledby="titre-catalogue" className="flex flex-col gap-5 pt-16 pb-16 gutter">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h2 id="titre-catalogue" className="m-0 font-d font-bold text-[26px] tracking-[0.04em] uppercase">
            {t("Catalogue")}
          </h2>
          <div role="tablist" aria-label={t("Catégories de la boutique")} className="flex flex-wrap gap-1.5">
            {(
              [
                ["chibi", "Chibis"],
                ["skin", "Skins"],
                ["prestige", "Prestige"]
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className="h-12 px-9 border-0 para cursor-pointer font-d font-bold text-base tracking-[0.04em] uppercase"
                style={{ background: tab === id ? "var(--acc)" : "var(--surf2)", color: tab === id ? "var(--on-acc)" : "var(--ink)" }}
              >
                {t(label)}
              </button>
            ))}
          </div>
          <span className="text-[15px] text-mut">{t("Achetés une fois, gardés pour toujours.")}</span>
        </div>
        <div role="tabpanel" className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
          {shown.map((it) => {
            const i = info(it);
            const missing = Math.max(0, it.price - balance);
            const needsChibi = !!it.requires && !owned.has(it.requires);
            return (
              <div key={it.id} className="cut-md p-[1.5px]" style={{ background: it.owned ? "var(--acc)" : "var(--line)" }}>
                <div className="flex flex-col h-full bg-surf cut-md overflow-hidden">
                  <div className="relative h-[230px] bg-surf2">
                    <img src={i.art} alt={t("Chibi {name}", { name: i.name })} loading="lazy" className="block w-full h-full object-cover" style={{ filter: it.owned ? "none" : needsChibi ? "grayscale(.6) brightness(.7)" : "none" }} />
                    {it.kind === "prestige" && <span className="absolute top-3 left-3 px-2.5 py-[5px] bg-acc text-on-acc cut-sm font-d font-bold text-[11.5px] tracking-[0.1em] uppercase">{t("Prestige")}</span>}
                  </div>
                  <div className="flex flex-col gap-3 px-[18px] pt-4 pb-[18px] mt-auto">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-d font-bold text-lg">{i.title}</span>
                      {i.note && <span className="text-[13.5px] text-mut">{i.note}</span>}
                    </div>
                    {it.owned ? (
                      <span className="flex items-center h-[46px] font-d font-bold text-[15px] tracking-[0.05em] uppercase text-acc">{t("Dans ta collection")}</span>
                    ) : needsChibi ? (
                      <div className="flex items-center justify-between gap-2.5 h-[46px]">
                        <span className="font-d font-bold text-[17px] text-acc">{t("{n} éclats", { n: fmt(it.price) })}</span>
                        <span className="text-[13px] text-mut">{t("Chibi requis")}</span>
                      </div>
                    ) : missing === 0 ? (
                      <button type="button" onClick={() => buy(it)} disabled={busy === it.id} className="h-[46px] border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
                        {t("Acheter · {n} éclats", { n: fmt(it.price) })}
                      </button>
                    ) : (
                      <div className="flex items-center justify-between gap-2.5 h-[46px]">
                        <span className="font-d font-bold text-[17px] text-acc">{t("{n} éclats", { n: fmt(it.price) })}</span>
                        <span className="text-[13px] text-mut">{t("Il manque {n}", { n: fmt(missing) })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function EarnCard({ title, badge, sub, rows, foot, edge = "var(--line)" }: { title: string; badge?: React.ReactNode; sub: string; rows: [string, number][]; foot?: string; edge?: string }) {
  return (
    <div className="cut-md p-[1.5px]" style={{ background: edge }}>
      <div className="h-full box-border flex flex-col gap-2.5 px-[26px] py-[22px] bg-surf cut-md">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="font-d font-bold text-xl">{title}</span>
          {badge}
        </div>
        <span className="text-[13.5px] text-mut">{sub}</span>
        {rows.map(([l, v]) => (
          <div key={l} className="flex justify-between text-[14.5px]">
            <span>{l}</span>
            <span className="font-d font-bold text-acc">{v}</span>
          </div>
        ))}
        {foot && <span className="text-[13px] text-mut">{foot}</span>}
      </div>
    </div>
  );
}

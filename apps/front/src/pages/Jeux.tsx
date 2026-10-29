import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CLASSIC_UNLOCK_PRICE, type GameKey } from "@loltr/shared";
import { post } from "../api/client";
import { keys, useInventory, useInvalidate } from "../api/queries";
import { ArrowBtn, glow } from "../components/ui";
import { Shard, TriLeft, TriRight } from "../components/icons";
import { fmt, useT } from "../i18n";
import { GameInfo } from "../components/GameInfo";
import { GAME_CARDS, lastGameIndex, rememberGame, type GameCard } from "../lib/games";
import { partieUrl, startGroup } from "../lib/play";
import { useMe } from "../state/app";
import { useUi } from "../state/ui";

// Tous les jeux (mode classique) : carrousel, description et boutons. Un jeu se débloque une fois
// pour 500 éclats (le bouton affiche d'abord le prix) ; en groupe, un membre qui l'a débloqué suffit.

export function Jeux() {
  const t = useT();
  const nav = useNavigate();
  const me = useMe();
  const ui = useUi();
  const inv = useInventory(me.isUser);
  const invalidate = useInvalidate();
  // La roue revient sur le dernier jeu affiché (ou lancé) au lieu du jeu par défaut
  const [idx, setIdxState] = useState(() => lastGameIndex(1));
  const setIdx = (i: number) => {
    setIdxState(i);
    rememberGame(i);
  };
  const [busy, setBusy] = useState(false);
  const n = GAME_CARDS.length;
  const gl = GAME_CARDS[(idx - 1 + n) % n];
  const gc = GAME_CARDS[idx];
  const gr = GAME_CARDS[(idx + 1) % n];
  const playable = !!gc.key && gc.key !== "cdj";
  const owned = !!gc.key && (inv.data ?? []).includes("game:" + gc.key);
  const cdjDone = !!me.daily?.games.find((g) => g.key === "cdj")?.done;
  const missing = Math.max(0, CLASSIC_UNLOCK_PRICE - me.balance);

  const filterOf = (g: (typeof GAME_CARDS)[number]) => (g.key === "cdj" && !cdjDone ? "grayscale(1) brightness(0.3) blur(6px)" : "none");

  const unlock = async () => {
    if (!me.isUser) return ui.askLogin("boutique");
    if (missing > 0) return ui.toast(t("Il te manque {n} éclats.", { n: fmt(missing) }), "danger");
    setBusy(true);
    try {
      await post("/api/classement/shop/buy", { itemId: "game:" + gc.key });
      await invalidate(keys.inventory, keys.me, keys.shop);
      ui.toast(t("{game} est débloqué : joue autant que tu veux !", { game: t(gc.name) }), "ok");
    } catch (e) {
      ui.toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };

  const solo = () => {
    if (me.inGroup) return;
    if (!me.isUser) return ui.askLogin("compte");
    nav(partieUrl("classique", gc.key as GameKey));
  };
  const group = () => startGroup(nav, { isUser: me.isUser, inGroup: me.inGroup, mates: me.mates.length, context: "classique", game: gc.key as GameKey });


  return (
    <div className="relative flex flex-col h-[calc(100svh-var(--header-h,85px))] min-h-[480px] overflow-hidden" style={{ background: glow("900px 560px at 50% 520px", 24) }}>
      <section id="vedette" className="shrink-0 flex flex-col items-center gap-[1vh] pt-[3vh] gutter text-center">
        <h1 className="m-0 font-d font-bold leading-[1.02] tracking-[0.01em] uppercase" style={{ fontSize: "clamp(28px, min(3.6vw, 4.8vh), 52px)" }}>
          {t("Choisis ton")} <span className="text-acc">{t("mini-jeu")}</span>
        </h1>
        <p className="m-0 max-w-[720px] text-[clamp(14px,1.8vh,17px)] leading-normal text-mut">
          {t("Mode classique : rejoue tous les jeux autant que tu veux, seul ou avec ton groupe. Ces parties ne rapportent pas de points : ils se gagnent au défi du jour.")}
        </p>
      </section>

      <section aria-label={t("Jeu en vedette")} className="flex-1 min-h-0 flex flex-nowrap items-center justify-center gap-x-7 py-[2.4vh] gutter">
        <ArrowBtn onClick={() => setIdx((idx - 1 + n) % n)} label={t("Jeu précédent")}>
          <TriLeft />
        </ArrowBtn>
        <SideCard g={gl} filter={filterOf(gl)} onClick={() => setIdx((idx - 1 + n) % n)} />
        <div className="group relative shrink basis-[340px] min-w-[220px] h-full max-h-[420px]">
          <div className="absolute inset-0 bg-acc cut-lg">
            <div className="absolute inset-[2px] cut-lg bg-surf2 flex flex-col justify-end overflow-hidden">
              <img src={gc.img} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: filterOf(gc) }} />
              {/* Infobulle ouverte : le fond de la carte se floute pour qu'on lise mieux */}
              <span aria-hidden="true" className="absolute inset-0 z-[1] opacity-0 pointer-events-none transition-opacity duration-200 group-has-[[aria-expanded=true]]:opacity-100" style={{ backdropFilter: "blur(10px) brightness(.55)", WebkitBackdropFilter: "blur(10px) brightness(.55)" }} />
              <div className="relative px-6 pt-20 pb-[clamp(16px,2.8vh,30px)] font-d font-bold text-[clamp(22px,3vh,30px)] text-center" style={{ background: "linear-gradient(180deg, transparent, var(--bg) 62%)", color: ink(gc.tint) }}>
                {t(gc.name)}
              </div>
            </div>
          </div>
          <GameInfo card={gc} />
        </div>
        <SideCard g={gr} filter={filterOf(gr)} onClick={() => setIdx((idx + 1) % n)} />
        <ArrowBtn onClick={() => setIdx((idx + 1) % n)} label={t("Jeu suivant")}>
          <TriRight />
        </ArrowBtn>
      </section>

      <section className="shrink-0 flex flex-col items-center gap-[1.4vh] pb-[3.4vh] gutter text-center">
        <p className="m-0 max-w-[620px] min-h-[2lh] text-[clamp(14px,1.8vh,17px)] leading-normal text-mut line-clamp-2">{t(gc.desc)}</p>
        <div className="font-d font-semibold text-sm tracking-[0.1em] uppercase text-acc">
          {t(gc.tags)} · {idx + 1} / {n}
        </div>
        {/* Hauteur fixe : les cartes du carrousel gardent la même taille quel que soit le jeu */}
        <div className="flex flex-col items-center gap-[1.4vh]">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3.5 min-h-[clamp(48px,6vh,60px)]">
            {gc.key === "mayhem" && (
              <button type="button" onClick={() => nav("/mayhem")} className="h-[clamp(48px,6vh,60px)] px-[52px] border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-lg tracking-[0.06em] uppercase">
                {t("Ouvrir World Mayhem")}
              </button>
            )}
            {playable && gc.key !== "mayhem" && (
              <>
                {(owned || !me.isUser) && !gc.solo ? null : owned || !me.isUser ? (
                  <span className="tipw">
                    <button
                      type="button"
                      onClick={solo}
                      aria-disabled={me.inGroup}
                      aria-describedby="tip-solo-jeux"
                      className="h-[clamp(48px,6vh,60px)] px-[52px] border-0 para font-d font-bold text-lg tracking-[0.06em] uppercase"
                      style={{ background: me.inGroup ? "var(--surf2)" : "var(--acc)", color: me.inGroup ? "var(--mut)" : "var(--on-acc)", cursor: me.inGroup ? "not-allowed" : "pointer" }}
                    >
                      {t("Jouer en solo")}
                    </button>
                    {me.inGroup && (
                      <span role="tooltip" id="tip-solo-jeux" className="tip">
                        {t("Tu es dans un groupe : tu ne peux pas rejoindre une partie solo. Quitte le groupe pour jouer seul.")}
                      </span>
                    )}
                  </span>
                ) : (
                  <button type="button" onClick={unlock} disabled={busy} className="flex items-center gap-2.5 h-[clamp(48px,6vh,60px)] px-11 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-lg tracking-[0.06em] uppercase">
                    {t("Débloquer")} · <Shard size={20} /> {fmt(CLASSIC_UNLOCK_PRICE)}
                  </button>
                )}
                {/* Jeux seulement solo (Champion parfait, Sudoku) : pas de partie entre amis */}
                {gc.multi && (
                  <button type="button" onClick={group} className="relative h-[clamp(48px,6vh,60px)] px-12 border-0 bg-ink text-ink para cursor-pointer font-d font-bold text-lg tracking-[0.06em] uppercase">
                    <span aria-hidden="true" className="absolute inset-[2px] para" style={{ background: me.inGroup ? "color-mix(in srgb, var(--acc) 18%, var(--surf))" : "var(--surf)" }} />
                    <span className="relative">{t("Jouer avec des amis")}</span>
                  </button>
                )}
              </>
            )}
            {gc.key === "cdj" && (
              <span role="status" aria-disabled="true" className="inline-flex items-center gap-2.5 h-[clamp(48px,6vh,60px)] px-11 bg-surf2 text-mut para cursor-not-allowed font-d font-bold text-base tracking-[0.06em] uppercase">
                {cdjDone ? t("Déjà fait aujourd’hui") : t("Jouable uniquement dans le défi du jour")}
              </span>
            )}
            {!gc.key && (
              <span role="status" className="inline-flex items-center h-[clamp(48px,6vh,60px)] px-11 bg-surf2 text-mut para font-d font-bold text-base tracking-[0.06em] uppercase">
                {t("Bientôt jouable")}
              </span>
            )}
          </div>
          <span className="min-h-[1lh] text-[13.5px] leading-normal text-mut">
            {playable && !owned && gc.key !== "mayhem" ? t("Gratuit en finissant le défi du jour (2 jeux si tu en réussis 3 sur 4), ou {n} éclats. En groupe, un membre qui l’a suffit.", { n: fmt(CLASSIC_UNLOCK_PRICE) }) : ""}
          </span>
        </div>
      </section>
    </div>
  );
}

const ink = (tint: string) => `color-mix(in srgb, ${tint} 72%, var(--ink))`;

function SideCard({ g, filter, onClick }: { g: GameCard; filter: string; onClick: () => void }) {
  const t = useT();
  return (
    <div className="group relative shrink basis-[250px] min-w-[180px] h-[76%] max-h-80 max-lg:hidden">
      <button type="button" onClick={onClick} aria-label={t("Afficher {name}", { name: t(g.name) })} className="absolute inset-0 p-0 border-0 bg-line cut-lg cursor-pointer opacity-[.86]">
        <span className="absolute inset-[1.5px] cut-lg bg-surf2 flex flex-col justify-end overflow-hidden">
          <img src={g.img} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter }} />
          {/* Infobulle ouverte : le fond de la carte se floute pour qu'on lise mieux */}
          <span aria-hidden="true" className="absolute inset-0 z-[1] opacity-0 pointer-events-none transition-opacity duration-200 group-has-[[aria-expanded=true]]:opacity-100" style={{ backdropFilter: "blur(10px) brightness(.55)", WebkitBackdropFilter: "blur(10px) brightness(.55)" }} />
          <span className="relative block px-5 pt-16 pb-[clamp(14px,2.4vh,26px)] font-d font-bold text-[clamp(18px,2.4vh,22px)] text-center" style={{ background: "linear-gradient(180deg, transparent, var(--bg) 64%)", color: ink(g.tint) }}>
            {t(g.name)}
          </span>
        </span>
      </button>
      <GameInfo card={g} />
    </div>
  );
}

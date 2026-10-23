import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MAYHEM_ROLE_LABEL, MAYHEM_TEAM_BY_ID, type MayhemCrest, type MayhemRole } from "@loltr/content/lite";
import { CLASSIC_UNLOCK_PRICE, type PublicPlayer } from "@loltr/shared";
import { get, post } from "../api/client";
import { keys, useInventory, useInvalidate } from "../api/queries";
import { Shard } from "../components/icons";
import { glow } from "../components/ui";
import { CrestLogo, Head } from "../games/mayhem/util";
import { fmt, useT } from "../i18n";
import { partieUrl, startGroup } from "../lib/play";
import { useMe } from "../state/app";
import { useUi } from "../state/ui";

// World Mayhem, avant la partie : l'équipe du jour et le choix entre un
// tournoi solo (contre des équipes historiques) ou entre amis (le groupe, complété au besoin).

interface DayRow {
  rank: number;
  player: PublicPlayer | null;
  crest: MayhemCrest | null;
  rating: number;
  wins: number;
  score: number;
}
interface DayData {
  day: string;
  total: number;
  best: (DayRow & { team: { role: MayhemRole; teamId: string; name: string; ovr: number }[] }) | null;
  rows: DayRow[];
  me: DayRow | null;
}

export function Mayhem() {
  const t = useT();
  const nav = useNavigate();
  const me = useMe();
  const ui = useUi();
  const invalidate = useInvalidate();
  const inv = useInventory(me.isUser);
  const [mode, setMode] = useState<"solo" | "amis">(me.inGroup ? "amis" : "solo");
  const [busy, setBusy] = useState(false);
  const day = useQuery({ queryKey: ["mayhem-day", "mondial"], queryFn: () => get<DayData>("/api/jeux/mayhem/day?scope=mondial") });
  const owned = (inv.data ?? []).includes("game:mayhem");
  const best = day.data?.best ?? null;

  const unlock = async () => {
    if (!me.isUser) return ui.askLogin("boutique");
    setBusy(true);
    try {
      await post("/api/classement/shop/buy", { itemId: "game:mayhem" });
      await invalidate(keys.inventory, keys.me, keys.shop);
      ui.toast(t("{game} est débloqué : joue autant que tu veux !", { game: "World Mayhem" }), "ok");
    } catch (e) {
      ui.toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  };
  const begin = () => {
    if (!me.isUser) return ui.askLogin("compte");
    if (mode === "amis") return startGroup(nav, { isUser: me.isUser, inGroup: me.inGroup, mates: me.mates.length, context: "classique", game: "mayhem" });
    if (me.inGroup) return ui.toast(t("Tu es dans un groupe : tu ne peux pas rejoindre une partie solo. Quitte le groupe pour jouer seul."), "danger");
    nav(partieUrl("classique", "mayhem"));
  };

  const modes = [
    { id: "solo" as const, title: t("Solo"), icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21c.9-4 3.6-6 7-6s6.1 2 7 6" },
    { id: "amis" as const, title: t("Entre amis"), icon: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.6 5.2" }
  ];
  const canPlay = owned || mode === "amis" || !me.isUser;

  return (
    <div className="relative flex-auto flex flex-col" style={{ background: glow("1100px 640px at 50% 52%", 14) }}>
      <main className="w-full max-w-[1760px] mx-auto box-border min-h-[calc(100svh-var(--header-h,85px))] flex flex-wrap items-center justify-center gap-x-20 gap-y-8 py-6 gutter">
        <section aria-label={t("Lancer une partie")} className="flex-[1_1_640px] min-w-0 max-w-[820px] flex flex-col gap-6">
          <span className="text-xl font-medium text-mut">{t("Draft · Worlds 2020 à 2025")}</span>
          <h1 className="m-0 font-d font-bold leading-[0.96] tracking-[-0.01em]" style={{ fontSize: "clamp(40px, min(5vw, 8vh), 80px)" }}>
            {t("Compose ton")}
            <br />
            <span className="text-acc">{t("équipe de légende")}</span>
          </h1>
          <p className="m-0 max-w-[640px] text-[16.5px] leading-relaxed text-mut">
            {t("Prends un joueur dans chaque équipe tirée au sort, un par poste. Les joueurs d’un même roster se complètent : plus tes liens sont forts, meilleure est ta note.")}
          </p>
          <div role="radiogroup" aria-label={t("Type de tournoi")} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {modes.map((m) => {
              const on = mode === m.id;
              return (
                <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => setMode(m.id)} className="flex flex-col items-start gap-3 py-5 px-6 border-0 cut-md cursor-pointer text-left text-ink" style={{ background: on ? "color-mix(in srgb, var(--acc) 18%, var(--surf))" : "var(--surf)" }}>
                  <span className="flex items-center justify-between self-stretch gap-3">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-acc">
                      <path d={m.icon} />
                    </svg>
                    <span className="w-[22px] h-[22px] p-1 box-border cut-sm" style={{ background: on ? "var(--acc)" : "var(--line)" }}>
                      <span className="block w-full h-full cut-sm" style={{ background: on ? "var(--acc)" : "var(--surf)" }} />
                    </span>
                  </span>
                  <strong className="font-d text-2xl uppercase tracking-[0.03em]">{m.title}</strong>
                </button>
              );
            })}
          </div>
          {/* Hauteur fixe : passer de Solo à Entre amis ne décale rien */}
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3.5 min-h-[60px]">
            {canPlay ? (
              <button type="button" onClick={begin} className="h-[60px] w-[340px] max-w-full border-0 para bg-acc text-on-acc cursor-pointer font-d font-bold text-lg tracking-[0.05em] uppercase">
                {t("Commencer le draft")}
              </button>
            ) : (
              <button type="button" onClick={unlock} disabled={busy} className="flex items-center justify-center gap-2.5 h-[60px] w-[340px] max-w-full border-0 para bg-acc text-on-acc cursor-pointer font-d font-bold text-lg tracking-[0.05em] uppercase">
                {t("Débloquer")} · <Shard size={20} /> {fmt(CLASSIC_UNLOCK_PRICE)}
              </button>
            )}
            <span className="flex-[1_1_240px] text-[14.5px] leading-snug text-mut">{mode === "amis" ? t("Un membre du groupe qui a débloqué le jeu suffit.") : t("Sans points : ton score compte pour l’équipe du jour.")}</span>
          </div>
        </section>

        <aside aria-label={t("Équipe du jour")} className="flex-[0_1_520px] min-w-[300px] self-center flex flex-col">
          <div className="p-[2px] bg-acc cut-lg" style={{ filter: "drop-shadow(0 18px 40px color-mix(in srgb, var(--acc) 22%, transparent))" }}>
            <div className="flex flex-col gap-3 py-5 px-6 cut-lg" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--acc) 16%, var(--surf)), var(--surf))" }}>
              <div className="flex items-center justify-between gap-3">
                <span className="label !text-acc">{t("Équipe du jour")}</span>
                <span className="text-[13px] text-mut">{t("Mise en avant jusqu’à 3:00")}</span>
              </div>
              {best ? (
                <>
                  <div className="flex items-center gap-3.5">
                    {best.crest && <CrestLogo crest={best.crest} className="basis-14 shrink-0 w-14 h-14" />}
                    <div className="flex-auto min-w-0 flex flex-col">
                      <strong className="font-d text-[26px] leading-tight truncate">{best.crest?.name ?? best.player?.pseudo ?? "?"}</strong>
                      <span className="text-sm text-mut truncate">{t("{player} · {w} victoire(s) · score {s}", { player: best.player?.pseudo ?? "?", w: best.wins, s: best.score })}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-d font-bold text-5xl leading-none text-acc">{best.rating}</span>
                      <span className="label !text-[11.5px]">{t("Note")}</span>
                    </div>
                  </div>
                  <ul className="m-0 p-0 list-none flex flex-col gap-1">
                    {best.team.map((p) => {
                      const tm = MAYHEM_TEAM_BY_ID[p.teamId];
                      return (
                        <li key={p.role} className="flex items-center gap-3 py-1 pl-1 pr-3.5 bg-surf2 cut-sm">
                          <Head name={p.name} color={tm?.color} className="basis-9 shrink-0 w-9 h-9 cut-sm text-xs" />
                          <span className="flex-auto flex flex-col">
                            <strong className="text-[15px]">{p.name}</strong>
                            <span className="text-[12.5px] text-mut">
                              {t(MAYHEM_ROLE_LABEL[p.role])} · {tm?.tag} {tm?.year}
                            </span>
                          </span>
                          <span className="font-d font-bold text-[19px]">{p.ovr}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <span className="text-[15px] leading-normal text-mut">{t("Personne n’a encore fini de tournoi aujourd’hui : la première équipe sera mise en avant ici.")}</span>
              )}
              <span className="text-[13px] leading-normal text-mut">{t("Meilleur score du jour : note d’équipe + 2 points par victoire en tournoi.")}</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

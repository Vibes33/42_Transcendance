import { useQuery } from "@tanstack/react-query";
import { LITE_BY_ID, splashImg, squareImg } from "@loltr/content/lite";
import { get } from "../api/client";
import { GameBar } from "../components/game";
import { fmt, useT } from "../i18n";
import type { GameProps } from "./types";

// Champion parfait : 16 champions en duels à élimination directe ; le dernier debout est ton
// champion parfait, comparé ensuite au vote de la communauté.

interface Pub {
  pair: [string, string] | null;
  duel: number;
  total: number;
  stage: string;
  winner: string | null;
  finalist: string | null;
  log: [string, string][];
  over: boolean;
}

interface Stats {
  day: { total: number; top: { champion: string; share: number }[] };
  all: { total: number; top: { champion: string; share: number }[] };
  mine: { champion: string; rankToday: number | null; shareToday: number; rankAll: number | null } | null;
}

const pct = (x: number) => (Math.round(x * 1000) / 10).toString().replace(".", ",") + " %";

export function ChampionParfait({ round, act, flow, namesLang }: GameProps<Pub>) {
  const t = useT();
  const pub = round.public;
  const name = (id: string) => LITE_BY_ID[id]?.names[namesLang] ?? id;
  const stats = useQuery({ queryKey: ["parfait-stats", round.id], queryFn: () => get<Stats>("/api/jeux/parfait/stats"), enabled: round.over && !flow.demo });

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(1000px 620px at 50% 50%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar game="parfait" sub={t("Solo · vote communautaire")} counterLabel={t("Duel")} counter={round.over ? "15/15" : `${pub.duel}/${pub.total}`} onQuit={flow.onQuit} />

      {!round.over && pub.pair && (
        <main className="flex-auto flex flex-col items-center justify-center gap-6 pt-6 pb-10 gutter">
          <span className="flex flex-col items-center gap-2 text-center">
            <span className="label">
              {t(pub.stage)} · {t("duel {n} sur {total}", { n: pub.duel, total: pub.total })}
            </span>
            <h1 className="m-0 font-d font-bold text-[clamp(36px,4vw,56px)] leading-none">
              {t("Lequel")} <span className="text-acc">{t("préfères-tu")}</span> ?
            </h1>
            <span className="text-base text-mut">{t("16 champions, un tournoi à élimination directe : le dernier debout est ton champion parfait.")}</span>
          </span>
          <div role="img" aria-label={t("{n} duels joués sur {total}", { n: pub.duel - 1, total: pub.total })} className="flex gap-1.5 w-[min(100%,720px)]">
            {Array.from({ length: pub.total }, (_, k) => (
              <span key={k} className="flex-1 h-1.5 cut-sm" style={{ background: k < pub.duel - 1 ? "var(--acc)" : k === pub.duel - 1 ? "color-mix(in srgb, var(--acc) 45%, var(--surf2))" : "var(--surf2)" }} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {pub.pair.map((id, k) => {
              const c = LITE_BY_ID[id];
              return (
                <span key={id} className="contents">
                  {k === 1 && (
                    <span aria-hidden="true" className="flex items-center justify-center w-[72px] h-[72px] bg-acc text-on-acc cut-sm font-d font-bold text-[26px]">
                      VS
                    </span>
                  )}
                  <button type="button" onClick={() => act({ type: "pick", champion: id }).catch(() => null)} aria-label={t("Choisir {name}", { name: name(id) })} className="relative w-[min(400px,80vw)] h-[min(520px,60vh)] p-[2px] border-0 bg-line cut-lg cursor-pointer transition-transform hover:-translate-y-1">
                    <span className="absolute inset-[2px] block overflow-hidden bg-surf2 cut-lg">
                      {c && <img src={splashImg(c)} alt="" className="block w-full h-full object-cover" style={{ objectPosition: "60% 20%" }} />}
                      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-7 pt-20 pb-6 text-left" style={{ background: "linear-gradient(transparent, color-mix(in srgb, var(--bg) 92%, transparent))" }}>
                        <strong className="font-d text-[40px] leading-none uppercase text-ink">{name(id)}</strong>
                        <span className="text-[15px] text-mut">{c?.titles[namesLang]}</span>
                      </span>
                    </span>
                  </button>
                </span>
              );
            })}
          </div>
          <button type="button" onClick={() => act({ type: "pick" }).catch(() => null)} className="h-[50px] px-7 border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[14.5px] tracking-[0.04em] uppercase">
            {t("Je n’arrive pas à choisir")}
          </button>
        </main>
      )}

      {round.over && pub.winner && (
        <main className="flex-auto flex flex-wrap items-center justify-center gap-x-14 gap-y-8 pt-6 pb-10 gutter">
          <section aria-label={t("Ton champion parfait")} className="flex-[0_1_480px] min-w-[280px] flex flex-col gap-[18px]">
            <div className="p-[2px] bg-acc cut-lg" style={{ filter: "drop-shadow(0 20px 44px color-mix(in srgb, var(--acc) 22%, transparent))" }}>
              <div className="relative h-[min(540px,60vh)] overflow-hidden bg-surf2 cut-lg">
                {LITE_BY_ID[pub.winner] && <img src={splashImg(LITE_BY_ID[pub.winner])} alt="" className="block w-full h-full object-cover" style={{ objectPosition: "60% 20%" }} />}
                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-8 pt-24 pb-[30px]" style={{ background: "linear-gradient(transparent, color-mix(in srgb, var(--bg) 92%, transparent))" }}>
                  <span className="label !text-acc">{t("Ton champion parfait")}</span>
                  <strong className="font-d text-[60px] leading-[0.95] uppercase">{name(pub.winner)}</strong>
                  {pub.finalist && <span className="text-base text-mut">{t("Battu en finale : {name}", { name: name(pub.finalist) })}</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={flow.onNext} className="flex-auto h-14 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-base tracking-[0.05em] uppercase">
                {t("Revoter")}
              </button>
              <button type="button" onClick={flow.onQuit} className="h-14 px-[30px] border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[15px] tracking-[0.04em] uppercase">
                {t("Tous les jeux")}
              </button>
            </div>
          </section>
          <section aria-label={t("Vote de la communauté")} className="flex-[1_1_560px] min-w-0 max-w-[780px] flex flex-col gap-4">
            <div className="flex flex-wrap gap-3.5">
              <div className="flex-[1_1_200px] flex flex-col gap-1 px-[22px] py-[18px] bg-surf cut-md">
                <span className="label">{t("{name} aujourd’hui", { name: name(pub.winner) })}</span>
                <span className="font-d font-bold text-4xl text-acc">{stats.data?.mine?.rankToday ? (stats.data.mine.rankToday === 1 ? t("1er") : t("{n}ᵉ", { n: stats.data.mine.rankToday })) : "—"}</span>
                <span className="text-sm text-mut">{t("des champions élus")}</span>
              </div>
              <div className="flex-[1_1_200px] flex flex-col gap-1 px-[22px] py-[18px] bg-surf cut-md">
                <span className="label">{t("Même choix que toi")}</span>
                <span className="font-d font-bold text-4xl">{stats.data?.mine ? pct(stats.data.mine.shareToday) : "—"}</span>
                <span className="text-sm text-mut">{t("des votants du jour")}</span>
              </div>
              <div className="flex-[1_1_200px] flex flex-col gap-1 px-[22px] py-[18px] bg-surf cut-md">
                <span className="label">{t("Votants")}</span>
                <span className="font-d font-bold text-4xl">{fmt(stats.data?.day.total ?? 0)}</span>
                <span className="text-sm text-mut">{t("aujourd’hui · {n} au total", { n: fmt(stats.data?.all.total ?? 0) })}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 px-6 py-[22px] bg-surf cut-lg">
              <span className="flex items-center justify-between">
                <span className="font-d font-bold text-lg tracking-[0.04em] uppercase">{t("Top du jour")}</span>
                <span className="label">{t("Champions élus parfaits")}</span>
              </span>
              <ol className="flex flex-col gap-1.5 m-0 p-0 list-none">
                {(stats.data?.day.top ?? []).slice(0, 8).map((x, k, all) => {
                  const mine = x.champion === pub.winner;
                  const c = LITE_BY_ID[x.champion];
                  return (
                    <li key={x.champion} className="flex items-center gap-3.5 h-[52px] pl-1.5 pr-4 cut-sm" style={{ background: mine ? "color-mix(in srgb, var(--acc) 16%, var(--surf2))" : "var(--surf2)" }}>
                      <span className="basis-[22px] shrink-0 text-center font-d font-bold" style={{ color: mine ? "var(--acc)" : "var(--mut)" }}>
                        {k + 1}
                      </span>
                      <span className="basis-10 shrink-0 h-10 overflow-hidden cut-sm">{c && <img src={squareImg(c)} alt="" className="block w-full h-full object-cover" />}</span>
                      <span className="basis-[140px] shrink-0 font-bold text-[15px]">{name(x.champion)}</span>
                      <span aria-hidden="true" className="flex-auto h-2.5 bg-surf cut-sm">
                        <span className="block h-full" style={{ width: (x.share / (all[0]?.share || 1)) * 100 + "%", background: mine ? "var(--acc)" : "var(--line)" }} />
                      </span>
                      <span className="basis-[58px] shrink-0 text-right font-d font-bold">{pct(x.share)}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLeaderboard } from "../api/queries";
import { Back } from "../components/icons";
import { glow } from "../components/ui";
import { fmt, plural, useT } from "../i18n";
import { avatarOf } from "../lib/chibi";
import { tierLabel } from "../lib/ranks";
import { daysHoursMinutes, useNow } from "../lib/time";
import { useMe } from "../state/app";
import { useUi } from "../state/ui";

// Leaderboard : mondial ou entre copains, aujourd'hui, cette semaine ou depuis toujours ; podium,
// liste et ta position. La saison dure 4 semaines.

type Scope = "mondial" | "copains";

export function Classement() {
  const t = useT();
  const nav = useNavigate();
  const me = useMe();
  const ui = useUi();
  const now = useNow(60_000);
  const [scope, setScope] = useState<Scope>("mondial");
  // Classement de la saison en cours (4 semaines)
  const lb = useLeaderboard(scope, "saison", scope === "mondial" || me.isUser);
  const data = lb.data;
  const rows = data?.rows ?? [];
  const pts = (n: number) => t("{n} pts", { n: fmt(n) });
  const days = (n: number) => t("{n} " + plural(n, "jour", "jours"), { n });
  const myId = me.profile?.userId;
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean);
  const heights = { 1: 340, 2: 290, 3: 260 } as Record<number, number>;

  return (
    <div className="relative flex-auto flex flex-col" style={{ background: glow("900px 520px at 50% 470px", 22) }}>
      <div className="absolute top-12 left-0 gutter">
        <button type="button" onClick={() => nav(-1)} className="inline-flex items-center gap-2 min-h-11 text-mut font-semibold text-[15px] p-0 border-0 bg-transparent cursor-pointer">
          <Back />
          {t("Retour")}
        </button>
      </div>
      <section className="flex flex-col items-center gap-4 pt-12 gutter text-center">
        <h1 className="m-0 font-d font-bold leading-[1.02] tracking-[0.01em] uppercase" style={{ fontSize: "clamp(36px, 4.6vw, 64px)" }}>
          {t("Leaderboard")} <span className="text-acc">{scope === "copains" ? t("des copains") : t("mondial")}</span>
        </h1>
        <div className="flex flex-col items-center gap-3.5 pt-1">
          <div role="group" aria-label={t("Choisir le classement")} className="flex flex-wrap justify-center gap-x-1.5 gap-y-2">
            {(
              [
                ["mondial", "Mondial"],
                ["copains", "Copains"]
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => (id === "copains" && !me.isUser ? ui.askLogin("classement") : setScope(id))}
                aria-pressed={scope === id}
                className="h-12 px-10 border-0 para cursor-pointer font-d font-bold text-base tracking-[0.04em] uppercase"
                style={{ background: scope === id ? "var(--acc)" : "var(--surf2)", color: scope === id ? "var(--on-acc)" : "var(--ink)" }}
              >
                {t(label)}
              </button>
            ))}
          </div>
          {data && (
            <div className="flex flex-col items-center gap-1.5" title={t("Une saison dure 4 semaines. Le classement repart à zéro et les éclats sont versés à la fin.")}>
              <span className="flex items-baseline gap-2.5">
                <span className="label">{t("Saison {n} · se termine dans", { n: data.season.number })}</span>
                <span className="font-d font-bold text-xl leading-none">{daysHoursMinutes(data.season.endsAt - now)}</span>
              </span>
              <div role="img" aria-label={t("Saison écoulée à {n} %", { n: Math.round(data.season.progress * 100) })} className="h-1 bg-surf2" style={{ width: "min(100%, 320px)" }}>
                <div className="h-1 bg-acc" style={{ width: `${Math.round(data.season.progress * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      </section>

      <section aria-label={t("Podium")} className="flex flex-wrap items-end justify-center gap-x-7 gap-y-5 pt-11 gutter">
        {podium.map((p) => (
          <div key={p.userId} className="relative shrink basis-[250px] min-w-[190px] cut-lg" style={{ height: heights[p.rank], background: p.rank === 1 ? "var(--acc)" : "var(--line)" }}>
            <div className="absolute inset-[2px] cut-lg bg-surf2 overflow-hidden">
              <img src={p.userId === myId ? me.meImg : avatarOf(p)} alt="" className="block w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-4 pt-16 pb-[18px] text-center" style={{ background: "linear-gradient(180deg, transparent, var(--bg) 68%)" }}>
                <span className="font-d font-bold text-[21px]">{p.pseudo}</span>
                <span className="font-d font-semibold text-base text-acc">{pts(p.points)}</span>
              </div>
            </div>
            <div
              className="absolute top-3.5 right-3.5 w-[52px] h-12 flex items-center justify-center cut-sm font-d font-bold text-[26px]"
              style={{ background: p.rank === 1 ? "var(--acc)" : "var(--surf)", color: p.rank === 1 ? "var(--on-acc)" : "var(--ink)" }}
            >
              {p.rank}
            </div>
          </div>
        ))}
        {!lb.isLoading && rows.length === 0 && <p className="m-0 py-10 text-mut">{t("Personne n’a encore marqué de points sur cette période.")}</p>}
      </section>

      <section className="flex justify-center pt-9 pb-16 gutter">
        <div className="flex-auto max-w-[980px] min-w-0 bg-line cut-md p-px">
          <div className="px-[26px] max-sm:px-3 pt-[22px] pb-[26px] bg-surf cut-md overflow-x-auto scroll">
            <div className="min-w-[600px] flex flex-col gap-1.5">
              <div className="flex items-center gap-4 px-[18px] pb-2 label">
                <span className="basis-[52px] shrink-0">{t("Rang")}</span>
                <span className="flex-auto">{t("Joueur")}</span>
                <span className="basis-24 shrink-0">{t("Palier")}</span>
                <span className="basis-[84px] shrink-0">{t("Série")}</span>
                <span className="basis-[100px] shrink-0 text-right">{t("Points")}</span>
              </div>
              {rows.slice(3).map((r) => (
                <Row key={r.userId} rank={String(r.rank)} img={r.userId === myId ? me.meImg : avatarOf(r)} name={r.pseudo + (r.userId === myId ? " " + t("(toi)") : "")} tier={tierLabel(r.tier, r.division)} streak={days(r.streak)} pts={pts(r.points)} me={r.userId === myId} />
              ))}
              {scope === "mondial" && me.isUser && data?.myRank && (
                <div className="flex flex-col gap-1.5 mt-2.5 pt-3.5 border-t border-line">
                  <span className="px-[18px] label">{t("Ta position")}</span>
                  <Row
                    rank={data.me ? fmt(data.me.rank) : data.myRank.position ? fmt(data.myRank.position) : "—"}
                    img={me.meImg}
                    name={me.pseudo + " " + t("(toi)")}
                    tier={tierLabel(data.myRank.id, data.myRank.division)}
                    streak={days(me.streak)}
                    pts={pts(data.me?.points ?? 0)}
                    me
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({ rank, img, name, tier, streak, pts, me }: { rank: string; img: string; name: string; tier: string; streak: string; pts: string; me?: boolean }) {
  return (
    <div className="flex items-center gap-4 py-[9px] px-[18px] cut-sm" style={{ background: me ? "color-mix(in srgb, var(--acc) 26%, var(--surf2))" : "var(--surf2)" }}>
      <span className="basis-[52px] shrink-0 font-d font-bold text-xl text-acc">{rank}</span>
      <span className="flex-auto min-w-0 flex items-center gap-3.5">
        <span className="basis-11 shrink-0 h-11 overflow-hidden bg-surf2 cut-sm">
          <img src={img} alt="" className="block w-full h-full object-cover" />
        </span>
        <span className="font-semibold text-base">{name}</span>
      </span>
      <span className="basis-24 shrink-0 text-[14.5px] text-mut">{tier}</span>
      <span className="basis-[84px] shrink-0 text-[14.5px] text-mut">{streak}</span>
      <span className="basis-[100px] shrink-0 text-right font-d font-bold text-lg">{pts}</span>
    </div>
  );
}

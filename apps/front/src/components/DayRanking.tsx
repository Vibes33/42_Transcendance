import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type GameKey, type GameLeaderboard, type GameLeaderRow, type GameMetric } from "@loltr/shared";
import { get } from "../api/client";
import { fmt, useLang, useT } from "../i18n";
import { avatarOf } from "../lib/chibi";
import { CARD_BY_KEY } from "../lib/games";
import { useMe } from "../state/app";
import { Trophy } from "./icons";

// Classement du jour d'un mini-jeu : panneau complet (description du jeu, fin de partie) et ligne
// courte « Sorts éclair : 290e sur 2 418. Top 12 % » (fin de partie, récap de groupe).

const leaderboard = (game: GameKey, scope: string) => get<GameLeaderboard>(`/api/jeux/leaderboard/${game}?scope=${scope}`);
const topPct = (rank: number, total: number) => Math.max(1, Math.ceil((rank / total) * 100));

const METRIC_LABEL: Record<GameMetric, string> = { essais: "Essais", champions: "Champions", sorts: "Sorts trouvés", temps: "Temps", score: "Score" };

function fmtValue(metric: GameMetric, row: GameLeaderRow) {
  if (!row.performed && (metric === "essais" || metric === "temps")) return "—";
  if (metric === "temps") {
    const s = Math.round(row.value / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  return String(row.value);
}

/** Classement du jour du jeu, sous son principe : le top, puis ma ligne. */
/** `inset` : posé sur un fond déjà gris (ligne de fin de partie), les lignes prennent le fond de la page. */
export function DayRanking({ game, inset = false }: { game: GameKey; inset?: boolean }) {
  const t = useT();
  const me = useMe();
  const [scope, setScope] = useState<"mondial" | "copains">("mondial");
  const [all, setAll] = useState(false);
  const q = useQuery({ queryKey: ["game-leaderboard", game, scope], queryFn: () => leaderboard(game, scope), staleTime: 30_000 });
  const lb = q.data;
  const rows = lb ? (all ? lb.rows : lb.rows.slice(0, 3)) : [];
  const mine = lb?.me && !rows.some((r) => r.me) ? lb.me : null;

  const line = (r: GameLeaderRow) => (
    <div
      key={(r.player?.userId ?? "") + r.rank}
      className="flex items-center gap-2 h-8 px-2 cut-sm text-[13px]"
      style={{ background: `color-mix(in srgb, var(--acc) ${r.me ? 20 : 0}%, var(${inset ? "--surf" : "--surf2"}))` }}
    >
      <span className="min-w-6 text-center font-d font-bold" style={{ color: r.rank === 1 ? "var(--acc)" : "var(--mut)" }}>
        {r.rank}
      </span>
      <img src={avatarOf(r.player)} alt="" className="w-6 h-6 object-cover cut-sm" />
      <span className="flex-1 min-w-0 truncate font-semibold">{r.me ? t("Toi") : (r.player?.pseudo ?? "…")}</span>
      {r.me && r.performed && lb!.total > 1 && <span className="text-[11.5px] font-bold text-ok">{t("top {n} %", { n: topPct(r.rank, lb!.total) })}</span>}
      <span className="font-d font-bold">{fmtValue(lb!.metric, r)}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 font-d font-bold text-sm uppercase tracking-[0.04em] whitespace-nowrap">{t("Classement du jour")}</span>
        {lb && <span className="text-[11.5px] text-mut">{t(METRIC_LABEL[lb.metric])}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        {(["mondial", "copains"] as const)
          .filter((s) => s === "mondial" || me.isUser)
          .map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
              className="h-7 px-3 border-0 para cursor-pointer font-bold text-[11.5px]"
              style={{ background: scope === s ? "var(--acc)" : "var(--surf2)", color: scope === s ? "var(--on-acc)" : "var(--ink)" }}
            >
              {s === "mondial" ? t("Mondial") : t("Copains")}
            </button>
          ))}
        {lb && <span className="ml-auto text-[11.5px] text-mut">{lb.source === "defi" ? t("Défi du jour · {n} joueurs", { n: lb.total }) : t("Parties du jour · {n} joueurs", { n: lb.total })}</span>}
      </div>
      {q.isLoading && <span className="text-[12.5px] text-mut">{t("Chargement…")}</span>}
      {q.isError && <span className="text-[12.5px] text-mut">{t("Classement indisponible pour le moment.")}</span>}
      {lb && !lb.total && <span className="text-[12.5px] text-mut">{t("Personne n’a encore joué à ce jeu aujourd’hui.")}</span>}
      {lb && lb.total > 0 && (
        <div className="flex flex-col gap-1 max-h-[230px] overflow-y-auto">
          {rows.map(line)}
          {mine && (
            <>
              <span className="text-center text-[11px] leading-none text-mut">···</span>
              {line(mine)}
            </>
          )}
        </div>
      )}
      {lb && me.isUser && !lb.me && lb.total > 0 && <span className="text-[12px] text-mut">{t("Joue aujourd’hui pour entrer au classement.")}</span>}
      {lb && lb.rows.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="self-end p-0 border-0 bg-transparent cursor-pointer text-[12.5px] font-bold text-acc">
          {all ? t("Voir moins") : t("Voir le top 10")}
        </button>
      )}
    </div>
  );
}

/**
 * Fin de partie et récap de groupe : mon rang du moment sur ce jeu (il évolue pendant la journée),
 * et le classement complet en dépliant. Rien si je n'y figure pas (invité, partie hors classement).
 */
export function DayRankLine({ game }: { game: GameKey }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [open, setOpen] = useState(false);
  // Relu à chaque affichage : la manche qui vient de finir doit y être
  const q = useQuery({ queryKey: ["game-leaderboard", game, "mondial"], queryFn: () => leaderboard(game, "mondial"), refetchOnMount: "always" });
  const mine = q.data?.me;
  if (!mine || !q.data) return null;
  const rank = lang === "fr" ? (mine.rank === 1 ? "1er" : `${mine.rank}e`) : `#${mine.rank}`;
  return (
    <div className="flex flex-col gap-2 w-full max-w-[460px] px-4 py-2.5 bg-surf2 cut-sm text-left">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px]">
        <Trophy size={18} className="text-acc shrink-0" />
        <span className="flex-1 min-w-0">
          {t("{game} : {rank} sur {total}.", { game: t(CARD_BY_KEY[game].name), rank, total: fmt(q.data.total) })}
          {mine.performed && q.data.total > 1 && <b className="ml-1.5 text-ok">{t("Top {n} %", { n: topPct(mine.rank, q.data.total) })}</b>}
        </span>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="p-0 border-0 bg-transparent cursor-pointer font-bold text-[13.5px] text-acc">
          {open ? t("Masquer") : t("Voir le classement")}
        </button>
      </div>
      {open && <DayRanking game={game} inset />}
    </div>
  );
}

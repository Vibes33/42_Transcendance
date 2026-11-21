import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RANKED_GAMES, type GameKey, type GameLeaderboard, type GameLeaderRow, type GameMetric } from "@loltr/shared";
import { get } from "../api/client";
import { GAME_UI } from "../games";
import { useT } from "../i18n";
import { avatarOf } from "../lib/chibi";
import { Trophy } from "./icons";
import type { GameCard } from "../lib/games";
import { useMe } from "../state/app";

// Pastilles rondes en haut à droite d'une carte de jeu : « i » affiche le principe du jeu, le
// trophée son classement du jour. Placées hors de la carte coupée (clip-path), pour que
// l'infobulle ne soit pas rognée.

type Panel = "info" | "rank";

export function GameInfo({ card }: { card: GameCard }) {
  const t = useT();
  const [open, setOpen] = useState<Panel | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const steps = card.key ? GAME_UI[card.key].tutorial : [];
  const ranked = !!card.key && RANKED_GAMES.includes(card.key);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Changer de jeu referme l'infobulle
  useEffect(() => setOpen(null), [card.name]);

  const pill = (panel: Panel, label: string, content: React.ReactNode) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOpen(open === panel ? null : panel);
      }}
      aria-expanded={open === panel}
      aria-label={label}
      className="flex items-center justify-center w-9 h-9 p-0 rounded-full border-2 cursor-pointer font-d font-bold text-lg leading-none"
      style={{ borderColor: "var(--acc)", background: open === panel ? "var(--acc)" : "color-mix(in srgb, var(--bg) 70%, transparent)", color: open === panel ? "var(--on-acc)" : "var(--acc)" }}
    >
      {content}
    </button>
  );

  return (
    <div ref={ref} className="absolute top-3 right-3 z-10">
      <div className="flex gap-2">
        {ranked && pill("rank", t("Classement du jour de {name}", { name: t(card.name) }), <Trophy size={17} />)}
        {pill("info", t("Principe du jeu {name}", { name: t(card.name) }), "i")}
      </div>
      {open && (
        <div role="tooltip" className="absolute top-[calc(100%+8px)] right-0 w-[min(80vw,330px)] p-[1.5px] bg-acc cut-sm text-left" style={{ filter: "drop-shadow(0 14px 28px rgba(0,0,0,.4))" }}>
          <div className="flex flex-col gap-2 px-4 py-3.5 bg-surf cut-sm">
            <span className="font-d font-bold text-base uppercase tracking-[0.04em] text-acc">{t(card.name)}</span>
            {open === "rank" && card.key ? (
              <DayRanking game={card.key} />
            ) : (
              <>
                {/* Jeu sans tutoriel : sa description */}
                {steps.length ? (
                  steps.map((s) => (
                    <p key={s.title} className="m-0 text-[13.5px] leading-snug text-ink">
                      <b className="font-bold">{t(s.title)}.</b> <span className="text-mut">{t(s.text)}</span>
                    </p>
                  ))
                ) : (
                  <p className="m-0 text-[13.5px] leading-snug text-mut">{t(card.desc)}</p>
                )}
                <span className="label !text-[11.5px]">{t(card.tags)}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
function DayRanking({ game }: { game: GameKey }) {
  const t = useT();
  const me = useMe();
  const [scope, setScope] = useState<"mondial" | "copains">("mondial");
  const [all, setAll] = useState(false);
  const q = useQuery({ queryKey: ["game-leaderboard", game, scope], queryFn: () => get<GameLeaderboard>(`/api/jeux/leaderboard/${game}?scope=${scope}`), staleTime: 30_000 });
  const lb = q.data;
  const rows = lb ? (all ? lb.rows : lb.rows.slice(0, 3)) : [];
  const mine = lb?.me && !rows.some((r) => r.me) ? lb.me : null;

  const line = (r: GameLeaderRow) => (
    <div
      key={(r.player?.userId ?? "") + r.rank}
      className="flex items-center gap-2 h-8 px-2 cut-sm text-[13px]"
      style={{ background: r.me ? "color-mix(in srgb, var(--acc) 20%, var(--surf2))" : "var(--surf2)" }}
    >
      <span className="min-w-6 text-center font-d font-bold" style={{ color: r.rank === 1 ? "var(--acc)" : "var(--mut)" }}>
        {r.rank}
      </span>
      <img src={avatarOf(r.player)} alt="" className="w-6 h-6 object-cover cut-sm" />
      <span className="flex-1 min-w-0 truncate font-semibold">{r.me ? t("Toi") : (r.player?.pseudo ?? "…")}</span>
      {r.me && r.performed && lb!.total > 1 && <span className="text-[11.5px] font-bold text-ok">{t("top {n} %", { n: Math.max(1, Math.ceil((r.rank / lb!.total) * 100)) })}</span>}
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

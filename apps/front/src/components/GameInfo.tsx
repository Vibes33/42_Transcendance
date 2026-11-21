import { useEffect, useRef, useState } from "react";
import { RANKED_GAMES } from "@loltr/shared";
import { GAME_UI } from "../games";
import { useT } from "../i18n";
import type { GameCard } from "../lib/games";
import { DayRanking } from "./DayRanking";
import { Trophy } from "./icons";

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
        <div role="tooltip" className="absolute top-[calc(100%+8px)] right-0 w-[min(80vw,320px)] p-[1.5px] bg-acc cut-sm text-left" style={{ filter: "drop-shadow(0 14px 28px rgba(0,0,0,.4))" }}>
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
                      <b className="font-bold">{t(s.title)}.</b> <span className="text-mut">{t(s.text, s.params)}</span>
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

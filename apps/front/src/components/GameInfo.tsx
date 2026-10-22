import { useEffect, useRef, useState } from "react";
import { GAME_UI } from "../games";
import { useT } from "../i18n";
import type { GameCard } from "../lib/games";

// Pastille ronde en haut à droite d'une carte de jeu : un clic affiche le principe du jeu.
// Placée hors de la carte coupée (clip-path), pour que l'infobulle ne soit pas rognée.

export function GameInfo({ card }: { card: GameCard }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const steps = card.key ? GAME_UI[card.key].tutorial : null;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Changer de jeu referme l'infobulle
  useEffect(() => setOpen(false), [card.name]);

  return (
    <div ref={ref} className="absolute top-3 right-3 z-10">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-label={t("Principe du jeu {name}", { name: t(card.name) })}
        className="flex items-center justify-center w-9 h-9 p-0 rounded-full border-2 cursor-pointer font-d font-bold text-lg leading-none"
        style={{ borderColor: "var(--acc)", background: open ? "var(--acc)" : "color-mix(in srgb, var(--bg) 70%, transparent)", color: open ? "var(--on-acc)" : "var(--acc)" }}
      >
        i
      </button>
      {open && (
        <div role="tooltip" className="absolute top-[calc(100%+8px)] right-0 w-[min(80vw,300px)] p-[1.5px] bg-acc cut-sm text-left" style={{ filter: "drop-shadow(0 14px 28px rgba(0,0,0,.4))" }}>
          <div className="flex flex-col gap-2 px-4 py-3.5 bg-surf cut-sm">
            <span className="font-d font-bold text-base uppercase tracking-[0.04em] text-acc">{t(card.name)}</span>
            {steps ? (
              steps.map((s) => (
                <p key={s.title} className="m-0 text-[13.5px] leading-snug text-ink">
                  <b className="font-bold">{t(s.title)}.</b> <span className="text-mut">{t(s.text)}</span>
                </p>
              ))
            ) : (
              <p className="m-0 text-[13.5px] leading-snug text-mut">{t(card.desc)}</p>
            )}
            <span className="label !text-[11.5px]">{t(card.tags)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

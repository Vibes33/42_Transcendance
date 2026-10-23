import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { Close } from "./icons";

// Briques visuelles de la maquette : cadres à coins coupés, boutons parallélogrammes, fenêtres.

const CUT = { sm: "cut-sm", md: "cut-md", lg: "cut-lg" } as const;

/** Cadre à bord coloré : un fond (le bord) et un panneau intérieur coupés de la même façon. */
export function Frame({
  edge = "var(--line)",
  cut = "md",
  border = 1.5,
  className = "",
  innerClassName = "",
  innerStyle,
  style,
  children,
  as: Tag = "div",
  ...rest
}: {
  edge?: string;
  cut?: keyof typeof CUT;
  border?: number;
  className?: string;
  innerClassName?: string;
  innerStyle?: CSSProperties;
  style?: CSSProperties;
  children: ReactNode;
  as?: "div" | "section" | "aside";
} & Record<string, unknown>) {
  return (
    <Tag className={`${CUT[cut]} ${className}`} style={{ padding: border, background: edge, ...style }} {...rest}>
      <div className={`${CUT[cut]} bg-surf h-full box-border ${innerClassName}`} style={innerStyle}>
        {children}
      </div>
    </Tag>
  );
}

type Variant = "primary" | "soft" | "outline" | "muted";

/** Bouton parallélogramme (CTA) : accent, doux (surf2), contour encre ou désactivé. */
export function Btn({
  variant = "primary",
  className = "",
  style,
  children,
  inner,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; inner?: string }) {
  const base = "relative border-0 para cursor-pointer font-d font-bold uppercase tracking-[0.05em] disabled:cursor-not-allowed";
  if (variant === "outline")
    return (
      <button type="button" className={`${base} bg-ink text-ink ${className}`} style={style} {...rest}>
        <span aria-hidden="true" className="absolute inset-[2px] para" style={{ background: inner ?? "var(--surf)" }} />
        <span className="relative">{children}</span>
      </button>
    );
  const look = {
    primary: "bg-acc text-on-acc",
    soft: "bg-surf2 text-ink",
    muted: "bg-surf2 text-mut",
    outline: ""
  }[variant];
  return (
    <button type="button" className={`${base} ${look} ${className}`} style={style} {...rest}>
      {children}
    </button>
  );
}

/** Bouton carré à coins coupés (fermer, flèches…). */
export function IconBtn({ className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`flex items-center justify-center p-0 border-0 cut-sm cursor-pointer ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function CloseBtn({ onClick, label, className = "" }: { onClick: () => void; label: string; className?: string }) {
  return (
    <IconBtn onClick={onClick} aria-label={label} className={`w-11 h-11 bg-surf2 text-ink ${className}`}>
      <Close />
    </IconBtn>
  );
}

/** Flèche de carrousel : contour encre, triangle à l'accent. */
export function ArrowBtn({ onClick, label, size = 56, children }: { onClick: (e: { detail: number }) => void; label: string; size?: number; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="relative p-0 border-0 bg-ink cut-sm cursor-pointer" style={{ flex: `0 0 ${size}px`, height: size }}>
      <span className="absolute inset-[1.5px] flex items-center justify-center bg-surf cut-sm text-acc">{children}</span>
    </button>
  );
}

export function Avatar({ src, size = 44, className = "", style, alt = "" }: { src: string; size?: number; className?: string; style?: CSSProperties; alt?: string }) {
  return (
    <span className={`block overflow-hidden bg-surf2 cut-sm shrink-0 ${className}`} style={{ width: size, height: size, ...style }}>
      <img src={src} alt={alt} className="block w-full h-full object-cover" />
    </span>
  );
}

/** Statistique : petit libellé au-dessus d'un grand nombre. */
export function Stat({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <span className={`font-d font-bold text-[26px] ${accent ? "text-acc" : ""}`}>{value}</span>
    </div>
  );
}

/** Pastille de choix (rôle, langue, filtre) : accent quand active. */
export function Pill({ on, onClick, children, para = true, className = "" }: { on: boolean; onClick: () => void; children: ReactNode; para?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-11 px-[22px] border-0 cursor-pointer font-bold text-[14.5px] ${para ? "para font-d uppercase tracking-[0.04em]" : "cut-sm"} ${on ? "bg-acc text-on-acc" : "bg-surf2 text-ink"} ${className}`}
    >
      {children}
    </button>
  );
}

/** Fenêtre modale floutée, cadre à l'accent ; Échap la ferme. */
export function Dialog({
  onClose,
  labelledBy,
  width = 480,
  children,
  overlay = "color-mix(in srgb, var(--bg) 40%, transparent)",
  blur = "blur(14px)",
  z = 50,
  innerClassName = "flex flex-col items-center gap-4 px-9 pt-[38px] pb-[30px] text-center"
}: {
  onClose?: () => void;
  labelledBy: string;
  width?: number;
  children: ReactNode;
  overlay?: string;
  blur?: string;
  z?: number;
  innerClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input, [tabindex]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 sm:p-6 box-border" style={{ zIndex: z, background: overlay, backdropFilter: blur, WebkitBackdropFilter: blur }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="relative cut-lg bg-acc p-[2px] max-h-full overflow-auto" style={{ width: `min(100%, ${width}px)` }}>
        <div className={`relative bg-surf cut-lg ${innerClassName}`}>{children}</div>
      </div>
    </div>
  );
}

/** Barre de progression fine à l'accent. */
export function Bar({ pct, height = 8, color = "var(--acc)", label }: { pct: number; height?: number; color?: string; label?: string }) {
  return (
    <div role="img" aria-label={label} className="bg-surf2" style={{ height }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height, background: color, transition: "width .3s ease" }} />
    </div>
  );
}

/** Le mot-clé d'un titre, mis en avant à l'accent. */
export const Acc = ({ children }: { children: ReactNode }) => <span className="text-acc">{children}</span>;

/** Fond de page : halo radial à l'accent sur le fond. */
export function glow(pos: string, pct: number) {
  return `radial-gradient(${pos}, color-mix(in srgb, var(--acc) ${pct}%, transparent), transparent 72%), var(--bg)`;
}

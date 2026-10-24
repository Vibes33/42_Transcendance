import type { ReactNode } from "react";

// Petits contrôles partagés du panneau de test.

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="label">{title}</span>
      {children}
    </section>
  );
}

export function PanelBtn({ onClick, children, danger, busy }: { onClick: () => void; children: ReactNode; danger?: boolean; busy: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="h-10 px-3.5 border-0 cut-sm cursor-pointer font-bold text-[13px] text-ink disabled:opacity-50"
      style={{ background: danger ? "color-mix(in srgb, var(--danger) 22%, var(--surf2))" : "var(--surf2)" }}
    >
      {children}
    </button>
  );
}

export function NumField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="fr-in w-28 p-[1.5px] bg-line cut-sm">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="block w-full box-border h-[37px] px-3 border-0 outline-none bg-surf text-ink cut-sm font-b text-sm font-semibold"
      />
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 text-[13px] font-semibold">
      <span className="w-[78px] shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-auto" style={{ accentColor: "var(--acc)" }} />
      <span className="w-[58px] shrink-0 text-right font-d text-mut">{format(value)}</span>
    </label>
  );
}

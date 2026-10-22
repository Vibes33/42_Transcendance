import { useEffect, useState } from "react";
import { t } from "../i18n";

/** Heure courante, rafraîchie à intervalle régulier (chronos, comptes à rebours). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** « 07 h 42 » : temps restant jusqu'à la prochaine rotation (dans le fuseau du joueur). */
export function hoursMinutes(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return t("{h} h {m}", { h: pad(Math.floor(m / 60)), m: pad(m % 60) });
}

/** « 12 j 06 h 41 min » : temps restant de la saison. */
export function daysHoursMinutes(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440);
  return t("{d} j {h} h {m} min", { d, h: pad(Math.floor((m % 1440) / 60)), m: pad(m % 60) });
}

/** « 0:24 » pour les chronos de jeu. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ":" + pad(s % 60);
}

/** Heure locale du joueur (« 03:00 ») pour un instant donné. */
export const localTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

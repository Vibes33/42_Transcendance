import { DAY_CHANGE_HOUR, DAY_TIMEZONE, FORCE_CLOSE_MINUTES, SEASON_EPOCH, SEASON_WEEKS } from "./rules";

// Le « jour » de LolTR commence à 3 h, heure de Paris. Une clé de jour est une date "AAAA-MM-JJ".

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: DAY_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

function parisParts(t: number) {
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(new Date(t))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Décalage (ms) entre l'heure de Paris et l'UTC à l'instant t. */
function parisOffset(t: number): number {
  const p = parisParts(t);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** Instant UTC correspondant à une heure locale de Paris. */
export function parisToUtc(y: number, m: number, d: number, h = 0, mi = 0): number {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - parisOffset(guess);
  return guess - parisOffset(first);
}

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function parseDayKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** Ajoute n jours à une clé de jour. */
export function addDays(key: string, n: number): string {
  const { y, m, d } = parseDayKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Nombre de jours entre deux clés (b - a). */
export function daysBetween(a: string, b: string): number {
  const A = parseDayKey(a);
  const B = parseDayKey(b);
  return Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 86_400_000);
}

/** Clé du jour LolTR à l'instant t (le jour change à 3 h, heure de Paris). */
export function dayKey(t: number = Date.now()): string {
  const p = parisParts(t);
  const key = keyOf(p.year, p.month, p.day);
  return p.hour < DAY_CHANGE_HOUR ? addDays(key, -1) : key;
}

/** Instant où commence le jour `key` (3 h, heure de Paris). */
export function dayStart(key: string): number {
  const { y, m, d } = parseDayKey(key);
  return parisToUtc(y, m, d, DAY_CHANGE_HOUR, 0);
}

/** Prochain changement de jour (pour le compte à rebours, affiché à l'heure locale du joueur). */
export function nextRotationAt(t: number = Date.now()): number {
  return dayStart(addDays(dayKey(t), 1));
}

/** Un défi commencé le jour `key` peut être fini jusqu'au lendemain 3 h 30 ; après, il est clos d'office. */
export function forceCloseAt(key: string): number {
  return dayStart(addDays(key, 1)) + FORCE_CLOSE_MINUTES * 60_000;
}

/** Jour de la semaine ISO (1 = lundi) d'une clé de jour. */
export function isoWeekday(key: string): number {
  const { y, m, d } = parseDayKey(key);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** La semaine va du lundi 3 h au lundi suivant 3 h : sa clé est celle de son lundi. */
export function weekKey(key: string): string {
  return addDays(key, 1 - isoWeekday(key));
}

export interface SeasonInfo {
  number: number;
  startKey: string;
  endKey: string; // dernier jour inclus
  endsAt: number;
  progress: number;
}

/** Saisons de 4 semaines, numérotées à partir de SEASON_EPOCH. */
export function seasonOf(key: string, now: number = Date.now()): SeasonInfo {
  const len = SEASON_WEEKS * 7;
  const idx = Math.floor(daysBetween(SEASON_EPOCH, key) / len);
  const startKey = addDays(SEASON_EPOCH, idx * len);
  const endKey = addDays(startKey, len - 1);
  const startsAt = dayStart(startKey);
  const endsAt = dayStart(addDays(endKey, 1));
  return { number: idx + 1, startKey, endKey, endsAt, progress: Math.max(0, Math.min(1, (now - startsAt) / (endsAt - startsAt))) };
}

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  MAYHEM_ROLES,
  MAYHEM_TEAM_BY_ID,
  RIFT,
  mayhemLabel,
  type MayhemEntrant,
  type MayhemEvent,
  type MayhemPicks,
  type MayhemRating,
  type MayhemRole,
  type MayhemTournament
} from "@loltr/content/lite";
import type { useT } from "../../i18n";

// World Mayhem côté interface : données de la manche, têtes des joueurs, carte de la Faille.

export interface MayhemPub {
  current: string | null;
  picks: MayhemPicks;
  jokers: number;
  history: { t: string; what: string | null }[];
  locked: boolean;
  group: boolean;
  tournament: MayhemTournament | null;
  me: number;
  rating: MayhemRating;
  over: boolean;
}

/** Photo du joueur (Liquipedia, recadrée sur la tête). */
export const headOf = (name: string) => `/mayhem/players/${name.toLowerCase()}.jpg`;

/** Tête du joueur ; ses initiales si la photo manque. */
export function Head({ name, color, className = "", style, dim }: { name: string; color?: string; className?: string; style?: CSSProperties; dim?: boolean }) {
  const [missing, setMissing] = useState(false);
  const filter = dim ? "grayscale(1)" : "none";
  if (missing || !name)
    return (
      <span className={`flex items-center justify-center font-d font-bold text-white ${className}`} style={{ background: color ?? "var(--surf2)", filter, ...style }}>
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  return <img src={headOf(name)} alt="" onError={() => setMissing(true)} className={`block object-cover ${className}`} style={{ background: color, filter, ...style }} />;
}

/** Pictogrammes des postes. */
export const ROLE_ICON: Record<MayhemRole, string> = {
  top: "M4 20V4h16M9 15V9h6",
  jgl: "M12 3c-3 5-6 7-6 11a6 6 0 0 0 12 0c0-4-3-6-6-11zM12 11v7",
  mid: "M5 19L19 5M4 9V4h5M20 15v5h-5",
  adc: "M20 4v16H4M15 9v6H9",
  sup: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9 12h6M12 9v6"
};

export function RoleIcon({ role, size = 22, className, style }: { role: MayhemRole; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
      <path d={ROLE_ICON[role]} />
    </svg>
  );
}

/** Joueurs d'une équipe draftée, dans l'ordre des postes. */
export const rosterOf = (picks: MayhemPicks) =>
  MAYHEM_ROLES.map((role) => {
    const p = picks[role];
    if (!p) return null;
    const team = MAYHEM_TEAM_BY_ID[p.t];
    return { team, ...team.players[p.i] };
  });

/** Nom affiché d'un participant du tournoi. */
export function entrantName(t: ReturnType<typeof useT>, e: MayhemEntrant, names: Record<string, string>, myId?: string): string {
  if (e.kind === "histo") return mayhemLabel(MAYHEM_TEAM_BY_ID[e.teamId!]);
  if (e.kind === "me" || (myId && e.userId === myId)) return t("Ton équipe");
  return t("Équipe de {name}", { name: names[e.userId!] ?? "?" });
}

export const entrantTag = (e: MayhemEntrant, names: Record<string, string>) =>
  e.kind === "histo" ? MAYHEM_TEAM_BY_ID[e.teamId!].tag : e.kind === "me" ? "TOI" : (names[e.userId!] ?? "?").slice(0, 3).toUpperCase();

export const entrantColor = (e: MayhemEntrant, myId?: string) =>
  e.kind === "histo" ? MAYHEM_TEAM_BY_ID[e.teamId!].color : e.kind === "me" || e.userId === myId ? "var(--acc)" : "#4B5563";

/** Titre et détail d'une action du match. */
export function eventText(t: ReturnType<typeof useT>, e: MayhemEvent, side: { a: string; b: string }, players: { a: string[]; b: string[] }, champ: (s: "a" | "b", i: number) => string) {
  const o = e.side === "a" ? "b" : "a";
  const team = side[e.side];
  const who = (s: "a" | "b", i?: number) => (i === undefined ? "" : `${players[s][i]} (${champ(s, i)})`);
  const mine = e.side === "a" ? e.ka : e.kb;
  const theirs = e.side === "a" ? e.kb : e.ka;
  switch (e.kind) {
    case "firstblood":
      return { title: t("Premier sang"), detail: t("{killer} sur {victim}", { killer: who(e.side, e.killer), victim: who(o, e.victim) }) };
    case "kill":
      return { title: t("Élimination pour {team}", { team }), detail: t("{killer} sur {victim}", { killer: who(e.side, e.killer), victim: who(o, e.victim) }) };
    case "skirmish":
      return { title: t("Escarmouche : {a} pour {b}", { a: mine, b: theirs }), detail: t("{team} prend l’avantage", { team }) };
    case "teamfight":
      return { title: t("Combat d’équipe : {a} pour {b}", { a: mine, b: theirs }), detail: t("{team} gagne le combat", { team }) };
    case "dragon":
      return { title: t("Dragon pour {team}", { team }), detail: mine ? t("Combat gagné {a} pour {b} autour de la fosse", { a: mine, b: theirs }) : t("La rivière du bas est contrôlée") };
    case "herald":
      return { title: t("Héraut de la Faille pour {team}", { team }), detail: t("Une tour est en danger") };
    case "tower":
      return { title: t("Tour détruite par {team}", { team }), detail: t("La carte s’ouvre") };
    case "inhib":
      return { title: t("Inhibiteur détruit par {team}", { team }), detail: t("Les super-sbires arrivent") };
    case "baron":
      return { title: t("Baron Nashor pour {team}", { team }), detail: mine ? t("Combat gagné {a} pour {b}", { a: mine, b: theirs }) : t("Le Baron tombe sans combat") };
    case "nexus":
      return { title: t("Nexus détruit"), detail: t("Victoire de {team}", { team }) };
  }
}

/** Carte de la Faille : minimap officielle, structures et camps à leurs coordonnées. */
export function Rift({ children }: { children?: ReactNode }) {
  const camp = { blue: "#4FA3FF", red: "#FF6B4A", camp: "#D9C27A", scuttle: "#7BD3C0" };
  return (
    <div className="absolute inset-0" style={{ background: "#0B0F0D" }}>
      <img src="/mayhem/rift.png" alt="" draggable={false} className="absolute inset-0 w-full h-full select-none" />
      <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 w-full h-full">
        {RIFT.camps.map((c, i) => (
          <circle key={i} cx={c.at[0]} cy={c.at[1]} r={c.kind === "camp" ? 0.9 : c.kind === "scuttle" ? 0.8 : 1.1} fill={camp[c.kind]} stroke="#0B0F0D" strokeWidth="0.3" />
        ))}
        <path d={`M${RIFT.baron[0]} ${RIFT.baron[1] - 1.6}l1.6 1.6l-1.6 1.6l-1.6 -1.6z`} fill="#B58CFF" stroke="#0B0F0D" strokeWidth="0.3" />
        <path d={`M${RIFT.dragon[0]} ${RIFT.dragon[1] - 1.6}l1.6 1.6l-1.6 1.6l-1.6 -1.6z`} fill="#FFB25B" stroke="#0B0F0D" strokeWidth="0.3" />
        {(["a", "b"] as const).map((s) => {
          const col = s === "a" ? "#5B9BFF" : "#FF5A5A";
          const [nx, ny] = RIFT.nexus[s];
          return (
            <g key={s}>
              {RIFT.inhibs[s].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="1.1" fill={col} stroke="#0B0F0D" strokeWidth="0.3" />
              ))}
              <path d={`M${nx} ${ny - 2}l2 2l-2 2l-2 -2z`} fill={col} stroke="#0B0F0D" strokeWidth="0.4" />
              {RIFT.towers[s].map(([x, y], i) => (
                <rect key={i} x={x - 0.9} y={y - 0.9} width="1.8" height="1.8" fill={col} stroke="#0B0F0D" strokeWidth="0.3" />
              ))}
            </g>
          );
        })}
      </svg>
      {children}
    </div>
  );
}

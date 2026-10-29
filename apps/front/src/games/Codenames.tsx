import { useState } from "react";
import { EndDialog, GameBar } from "../components/game";
import { useT } from "../i18n";
import { avatarOf } from "../lib/chibi";
import { clock, useNow } from "../lib/time";
import { useMe } from "../state/app";
import { useLive } from "../state/live";
import { useBi, useParty, type Bi } from "./common";
import type { GameProps } from "./types";

// Codenames de la Faille : deux équipes, deux maîtres-espions, 25 mots de Runeterra. Le plateau est
// partagé par tout le groupe ; seul le maître-espion voit la couleur des cartes.

type Team = "a" | "b";
type Color = Team | "n" | "x";
interface View {
  teams: Record<Team, string[]>;
  spy: Record<Team, string>;
  me: { team: Team | null; spy: boolean };
  cards: { word: Bi; revealed: boolean; color: Color | null }[];
  left: Record<Team, number>;
  turn: Team;
  phase: "clue" | "guess";
  clue: { word: string; n: number } | null;
  guessesLeft: number;
  turnEndsAt: number;
  winner: Team | null;
  log: { team: Team; clue: string; n: number; found: string[] }[];
  over: boolean;
}

const TEAM = { a: { name: "Équipe bleue", color: "var(--team-a)" }, b: { name: "Équipe rouge", color: "var(--team-b)" } };
const CARD: Record<Color, string> = { a: "var(--team-a)", b: "var(--team-b)", n: "#8C8475", x: "#050608" };

export function Codenames({ round, flow }: GameProps) {
  const t = useT();
  const bi = useBi();
  const now = useNow(500);
  const session = useLive((s) => s.session);
  const myId = useMe().profile?.userId;
  const { view: v, act, error } = useParty<View>(round.id, flow.demo);
  const [clue, setClue] = useState("");
  const [n, setN] = useState(2);
  const member = (id: string) => session?.members.find((m) => m.userId === id);

  if (!v) return <div className="flex items-center justify-center min-h-[60vh] text-mut" role="status">{t("Préparation de la partie…")}</div>;
  const myTurn = v.me.team === v.turn && !v.over;
  const canClue = myTurn && v.me.spy && v.phase === "clue";
  const canGuess = myTurn && !v.me.spy && v.phase === "guess";
  const leftMs = Math.max(0, v.turnEndsAt - now);

  const teamPanel = (k: Team) => (
    <aside aria-label={t(TEAM[k].name)} className="flex-[0_1_280px] min-w-[220px] flex flex-col gap-2.5 p-5 bg-surf cut-lg" style={{ boxShadow: `inset 0 3px 0 ${TEAM[k].color}` }}>
      <span className="flex items-baseline justify-between">
        <strong className="font-d text-xl uppercase" style={{ color: TEAM[k].color }}>
          {t(TEAM[k].name)}
        </strong>
        <span className="font-d font-bold text-[34px]" style={{ color: TEAM[k].color }}>
          {v.left[k]}
        </span>
      </span>
      <span className="text-[13.5px] text-mut">{t("cartes restantes")}</span>
      {v.teams[k].map((id) => {
        const m = member(id);
        const spy = v.spy[k] === id;
        return (
          <span key={id} className="flex items-center gap-2.5 h-12 pl-1 pr-3 cut-sm" style={{ background: id === myId ? "color-mix(in srgb, var(--acc) 18%, var(--surf2))" : "var(--surf2)" }}>
            <span className="basis-10 shrink-0 h-10 overflow-hidden cut-sm">{m && <img src={avatarOf(m)} alt="" className="block w-full h-full object-cover" />}</span>
            <span className="flex-auto min-w-0 truncate font-bold text-[14.5px]">{m?.pseudo ?? "?"}</span>
            <span className="text-[12px] font-bold tracking-[0.06em] uppercase" style={{ color: spy ? "var(--acc)" : "var(--mut)" }}>
              {spy ? t("Espion") : t("Agent")}
            </span>
          </span>
        );
      })}
      {v.log.filter((l) => l.team === k).length > 0 && (
        <div className="flex flex-col gap-1 pt-2.5 border-t border-line">
          <span className="label">{t("Indices précédents")}</span>
          {v.log
            .filter((l) => l.team === k)
            .slice(-4)
            .map((l, i) => (
              <span key={i} className="text-sm">
                <strong className="font-d uppercase">
                  {l.clue} · {l.n}
                </strong>{" "}
                · {l.found.length ? l.found.join(", ") : "—"}
              </span>
            ))}
        </div>
      )}
    </aside>
  );

  const status = v.over
    ? ""
    : v.phase === "clue"
      ? canClue
        ? t("À toi : donne un indice d’un seul mot et le nombre de cartes qu’il relie.")
        : t("Le maître-espion de l’{team} cherche un indice…", { team: t(TEAM[v.turn].name).toLowerCase() })
      : canGuess
        ? t("Clique un mot pour le proposer ({n} proposition(s) restante(s)).", { n: v.guessesLeft })
        : t("L’{team} cherche ses mots…", { team: t(TEAM[v.turn].name).toLowerCase() });

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)] [--team-a:#6FB2FF] [--team-b:#FF7A7A]" style={{ background: "radial-gradient(900px 560px at 20% 55%, color-mix(in srgb, var(--team-a) 10%, transparent), transparent 70%), radial-gradient(900px 560px at 80% 55%, color-mix(in srgb, var(--team-b) 10%, transparent), transparent 70%), var(--bg)" }}>
      <GameBar game="codenames" sub={v.me.team ? (v.me.spy ? t("Tu es maître-espion de l’{team}", { team: t(TEAM[v.me.team].name).toLowerCase() }) : t("Tu es agent de l’{team}", { team: t(TEAM[v.me.team].name).toLowerCase() })) : t("Spectateur")} counterLabel={t("Tour")} counter={<span style={{ color: TEAM[v.turn].color }}>{t(TEAM[v.turn].name)} · {clock(leftMs)}</span>} onQuit={flow.onQuit} />
      <main className="flex-auto flex flex-wrap items-start content-center justify-center gap-x-8 gap-y-6 pt-5 pb-9 gutter">
        {teamPanel("a")}
        <section aria-label={t("Plateau")} className="flex-[1_1_760px] min-w-0 max-w-[960px] flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] py-4 cut-md" style={{ background: `color-mix(in srgb, ${TEAM[v.turn].color} 16%, var(--surf))` }}>
            {v.clue ? (
              <span className="flex flex-col gap-0.5">
                <span className="label">{t("Indice du maître-espion")}</span>
                <strong className="font-d text-[30px] tracking-[0.04em] uppercase">
                  {v.clue.word} · {v.clue.n}
                </strong>
              </span>
            ) : (
              <span className="font-semibold text-[15px]">{status}</span>
            )}
            {canGuess && (
              <button type="button" onClick={() => act({ type: "pass" })} className="h-[50px] px-7 border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[14.5px] tracking-[0.04em] uppercase">
                {t("Finir le tour")}
              </button>
            )}
          </div>
          {canClue && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act({ type: "clue", word: clue, n }).then((ok) => ok && setClue(""));
              }}
              className="flex flex-wrap items-center gap-3 px-[18px] py-3.5 cut-md"
              style={{ background: `color-mix(in srgb, ${TEAM[v.turn].color} 16%, var(--surf))` }}
            >
              <label className="flex-[1_1_260px] p-[1.5px] bg-line cut-sm">
                <span className="sr-only">{t("Indice")}</span>
                <input value={clue} onChange={(e) => setClue(e.target.value)} placeholder={t("Ex. : Piltover")} maxLength={30} className="block w-full box-border h-[52px] px-4 border-0 outline-none bg-surf text-ink cut-sm font-b text-[17px] font-bold" />
              </label>
              <span role="radiogroup" aria-label={t("Nombre de cartes")} className="flex gap-1.5">
                {[1, 2, 3, 4].map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={k === n} onClick={() => setN(k)} className="w-[52px] h-[52px] border-0 cut-sm cursor-pointer font-d font-bold text-lg" style={{ background: k === n ? "var(--acc)" : "var(--surf2)", color: k === n ? "var(--on-acc)" : "var(--ink)" }}>
                    {k}
                  </button>
                ))}
              </span>
              <button type="submit" disabled={!clue.trim()} className="h-[52px] px-[30px] border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase disabled:opacity-50">
                {t("Donner l’indice")}
              </button>
            </form>
          )}
          {error && (
            <span role="alert" className="text-sm font-semibold text-danger">
              {error}
            </span>
          )}
          <div role="grid" aria-label={t("Grille de 25 mots")} className="grid grid-cols-5 gap-2.5">
            {v.cards.map((c, i) => {
              const open = c.revealed;
              const hint = !open && c.color;
              return (
                <button
                  key={i}
                  type="button"
                  role="gridcell"
                  onClick={() => canGuess && !open && act({ type: "guess", card: i })}
                  disabled={!canGuess || open}
                  aria-label={bi(c.word) + (c.color ? " : " + t({ a: "bleu", b: "rouge", n: "neutre", x: "assassin" }[c.color]) : "") + (open ? ", " + t("révélé") : "")}
                  className="relative h-[100px] max-sm:h-16 px-2 border-0 cut-sm font-d font-bold text-[17px] max-sm:text-xs tracking-[0.03em] uppercase transition-transform enabled:hover:-translate-y-0.5 enabled:cursor-pointer disabled:cursor-default"
                  style={{
                    background: open ? CARD[c.color!] : hint ? `color-mix(in srgb, ${CARD[c.color!]} 26%, var(--surf2))` : "var(--surf2)",
                    color: open ? (c.color === "x" ? "#FFFFFF" : "#0F1115") : "var(--ink)",
                    boxShadow: hint ? `inset 0 -5px 0 ${CARD[c.color!]}` : "none",
                    opacity: open && v.me.spy ? 0.55 : 1
                  }}
                >
                  {bi(c.word)}
                  {hint && c.color === "x" && <span className="absolute top-2 right-2.5 text-[11px] tracking-[0.08em] text-danger">{t("Assassin")}</span>}
                </button>
              );
            })}
          </div>
          <span className="text-sm text-mut">{v.me.spy ? t("Toi seul vois la couleur des cartes : évite l’assassin, il fait perdre la partie à ton équipe.") : t("L’assassin fait perdre la partie immédiatement.")}</span>
        </section>
        {teamPanel("b")}
      </main>

      {v.over && (
        <EndDialog
          flow={flow}
          label={t("Codenames de la Faille")}
          title={<span style={{ color: TEAM[v.winner ?? "a"].color }}>{t("Victoire de l’{team}", { team: t(TEAM[v.winner ?? "a"].name).toLowerCase() })}</span>}
          stats={[
            { v: v.me.team === v.winner ? t("Gagné") : t("Perdu"), l: t("Ton équipe"), acc: true },
            { v: v.left.a, l: t("Cartes bleues restantes") },
            { v: v.left.b, l: t("Cartes rouges restantes") }
          ]}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { EndDialog, GameBar } from "../components/game";
import { useLang, useT } from "../i18n";
import { avatarOf } from "../lib/chibi";
import { clock, useNow } from "../lib/time";
import { useMe } from "../state/app";
import { useLive } from "../state/live";
import { useParty, type Bi } from "./common";
import type { GameProps } from "./types";

// Fais-moi deviner : par équipes de deux, l'un fait deviner un mot de l'univers LoL sans utiliser
// les mots interdits, l'autre devine. 60 s par tour, chacun fait deviner une fois.

interface View {
  teams: string[][];
  points: number[];
  turn: { n: number; total: number; team: number; teller: string };
  role: "conteur" | "devin" | "spectateur" | "fin";
  word: { fr: { word: string; banned: string[] }; en: { word: string; banned: string[] } } | null;
  mask: Bi;
  turnEndsAt: number;
  feed: { by: string; text: string; kind: "clue" | "guess" | "found" | "skip" }[];
  found: string[];
  over: boolean;
}

export function FaisMoiDeviner({ round, flow }: GameProps) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const now = useNow(500);
  const myId = useMe().profile?.userId;
  const session = useLive((s) => s.session);
  const { view: v, act, error } = useParty<View>(round.id, flow.demo);
  const [q, setQ] = useState("");
  const pseudo = (id: string) => (id === myId ? t("Toi") : (session?.members.find((m) => m.userId === id)?.pseudo ?? "?"));

  if (!v) return <div className="flex items-center justify-center min-h-[60vh] text-mut" role="status">{t("Préparation de la partie…")}</div>;
  const word = v.word?.[lang];
  const teller = v.role === "conteur";
  const guesser = v.role === "devin";
  const leftMs = Math.max(0, v.turnEndsAt - now);
  const send = async () => {
    if (!q.trim()) return;
    if (await act({ type: teller ? "clue" : "guess", text: q })) setQ("");
  };
  const mine = v.teams.findIndex((tm) => tm.includes(myId ?? ""));
  const best = Math.max(...v.points);

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(1000px 620px at 45% 50%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar
        game="devine"
        sub={teller ? t("Tu fais deviner {name}", { name: pseudo(v.teams[v.turn.team].find((x) => x !== myId) ?? "") }) : guesser ? t("{name} te fait deviner", { name: pseudo(v.turn.teller) }) : t("{name} fait deviner son équipe", { name: pseudo(v.turn.teller) })}
        counterLabel={t("Tour {n}/{total}", { n: v.turn.n, total: v.turn.total })}
        counter={clock(leftMs)}
        onQuit={flow.onQuit}
      />
      <main className="flex-auto flex flex-wrap items-stretch content-center justify-center gap-x-8 gap-y-7 pt-6 pb-10 gutter">
        <aside aria-label={t("Équipes")} className="flex-[0_1_320px] min-w-[260px] flex flex-col gap-2.5 p-[22px] bg-surf cut-lg">
          <span className="font-d font-bold text-lg tracking-[0.04em] uppercase">{t("Équipes")}</span>
          {v.teams.map((tm, k) => (
            <div key={k} className="flex flex-col gap-2 px-3.5 py-3 cut-sm" style={{ background: k === mine ? "color-mix(in srgb, var(--acc) 16%, var(--surf2))" : "var(--surf2)" }}>
              <span className="flex items-center justify-between">
                <span className="font-bold text-[14.5px]">{t("Équipe {n}", { n: k + 1 })}</span>
                <span className="font-d font-bold text-[22px]" style={{ color: k === mine ? "var(--acc)" : "var(--ink)" }}>
                  {v.points[k]}
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                {tm.map((id) => {
                  const m = session?.members.find((x) => x.userId === id);
                  return (
                    <span key={id} className="flex items-center gap-2 min-w-0">
                      <span className="basis-8 shrink-0 w-8 h-8 overflow-hidden cut-sm">{m && <img src={avatarOf(m)} alt="" className="block w-full h-full object-cover" />}</span>
                      <span className="text-[13.5px] font-semibold">{pseudo(id)}</span>
                    </span>
                  );
                })}
              </span>
              <span className="text-[12.5px] text-mut">{k === v.turn.team && !v.over ? t("Joue en ce moment") : t("Regarde")}</span>
            </div>
          ))}
        </aside>

        <section aria-label={t("Tour en cours")} className="flex-[1_1_640px] min-w-0 max-w-[760px] flex flex-col gap-[18px]">
          <div className="p-[2px] bg-acc cut-lg" style={{ filter: "drop-shadow(0 20px 44px color-mix(in srgb, var(--acc) 16%, transparent))" }}>
            <div className="flex flex-col items-center gap-3.5 px-8 py-[30px] bg-surf cut-lg text-center">
              <span className="label !text-acc">{t("Mot à faire deviner")}</span>
              {word ? (
                <>
                  <strong className="font-d text-[clamp(36px,4vw,56px)] leading-none uppercase">{word.word}</strong>
                  <span className="label">{t("Mots interdits")}</span>
                  <span className="flex flex-wrap justify-center gap-2">
                    {word.banned.map((b) => (
                      <span key={b} className="inline-flex items-center h-[38px] px-4 cut-sm font-bold text-[15px] line-through" style={{ background: "color-mix(in srgb, var(--danger) 14%, var(--surf2))" }}>
                        {b}
                      </span>
                    ))}
                  </span>
                </>
              ) : (
                <>
                  <strong className="font-d text-[clamp(32px,4vw,52px)] leading-none tracking-[0.12em] text-mut">{v.mask[lang]}</strong>
                  <span className="text-[15px] text-mut">{t("Trouve le mot grâce aux indices de ton équipier. Les fautes de frappe sont tolérées.")}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex-auto flex flex-col gap-2 min-h-[240px] px-5 py-[18px] bg-surf cut-md">
            <span className="label">{t("Indices et propositions")}</span>
            <ol aria-live="polite" className="flex flex-col gap-1.5 m-0 p-0 list-none">
              {v.feed.map((e, i) => {
                const own = e.by === myId;
                return (
                  <li key={i} className="flex items-center gap-2.5 max-w-[80%] px-4 py-2.5 cut-sm" style={{ alignSelf: own ? "flex-end" : "flex-start", background: e.kind === "found" ? "color-mix(in srgb, var(--ok) 22%, var(--surf2))" : own ? "color-mix(in srgb, var(--acc) 16%, var(--surf2))" : "var(--surf2)" }}>
                    <span className="text-[12.5px] font-bold text-mut">{pseudo(e.by)}</span>
                    <span className="text-base font-semibold" style={{ color: e.kind === "guess" ? "var(--mut)" : "var(--ink)" }}>
                      {e.kind === "skip" ? t("passe le mot (−1)") : e.kind === "found" ? t("{word} : trouvé ! +1", { word: e.text }) : e.text}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {(teller || guesser) && (
            <div className="flex flex-col gap-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex gap-3"
              >
                <label className="flex-auto p-[1.5px] cut-sm" style={{ background: error ? "var(--danger)" : "var(--line)" }}>
                  <span className="sr-only">{teller ? t("Indice") : t("Proposition")}</span>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={teller ? t("Décris le mot sans utiliser les mots interdits…") : t("Ta proposition…")} autoComplete="off" spellCheck={false} className="block w-full box-border h-14 px-[18px] border-0 outline-none bg-surf text-ink cut-sm font-b text-[17px] font-semibold" />
                </label>
                <button type="submit" className="h-[59px] px-[34px] border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-base tracking-[0.05em] uppercase">
                  {teller ? t("Envoyer") : t("Proposer")}
                </button>
                {teller && (
                  <button type="button" onClick={() => act({ type: "skip" })} className="h-[59px] px-6 border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[14.5px] tracking-[0.04em] uppercase">
                    {t("Passer · −1")}
                  </button>
                )}
              </form>
              <span aria-live="polite" className="text-sm font-bold" style={{ color: error ? "var(--danger)" : "var(--mut)" }}>
                {error ?? (teller ? t("Un indice par message. Les mots interdits sont bloqués avant l’envoi.") : t("Propose autant de mots que tu veux."))}
              </span>
            </div>
          )}
        </section>
      </main>

      {v.over && (
        <EndDialog
          flow={flow}
          label={t("Fais-moi deviner")}
          title={
            <>
              {mine >= 0 && v.points[mine] === best ? t("Ton équipe") : t("Partie")} <span className="text-acc">{mine >= 0 && v.points[mine] === best ? t("gagne !") : t("terminée")}</span>
            </>
          }
          stats={[
            { v: mine >= 0 ? v.points[mine] : 0, l: t("Mots trouvés par ton équipe"), acc: true },
            { v: v.found.length, l: t("Mots trouvés en tout") }
          ]}
        />
      )}
    </div>
  );
}

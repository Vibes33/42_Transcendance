import { useEffect, useRef, useState } from "react";
import { EndDialog, GameBar } from "../components/game";
import { Check } from "../components/icons";
import { useLang, useT } from "../i18n";
import { avatarOf } from "../lib/chibi";
import { clock, useNow } from "../lib/time";
import { useMe } from "../state/app";
import { useLive } from "../state/live";
import { useParty, type Bi } from "./common";
import type { GameProps } from "./types";

// Fais-moi deviner, comme skribbl.io : tout le groupe joue ensemble. À chaque tour, un joueur décrit
// un mot de l'univers LoL sans l'écrire, les autres le cherchent dans le chat. Plus on trouve vite,
// plus on marque ; le conteur marque pour chaque joueur qui trouve.

interface View {
  players: string[];
  points: Record<string, number>;
  turn: { n: number; total: number; teller: string };
  role: "conteur" | "devin" | "trouve" | "spectateur" | "fin";
  word: Bi | null;
  mask: Bi;
  turnEndsAt: number;
  foundBy: string[];
  feed: { by: string; text: string; kind: "clue" | "guess" | "found" | "skip" | "reveal"; points?: number; reveal?: Bi }[];
  wordsFound: number;
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
  const chat = useRef<HTMLOListElement>(null);
  const member = (id: string) => session?.members.find((m) => m.userId === id);
  const pseudo = (id: string) => (id === myId ? t("Toi") : (member(id)?.pseudo ?? "?"));

  // Le chat défile tout seul vers le dernier message (sa hauteur est fixe : la page ne s'allonge pas)
  const lastCount = v?.feed.length ?? 0;
  useEffect(() => {
    const el = chat.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastCount, v?.turn.n]);

  if (!v) return <div className="flex items-center justify-center min-h-[60vh] text-mut" role="status">{t("Préparation de la partie…")}</div>;
  const teller = v.role === "conteur";
  const seeker = v.role === "devin";
  const tellerId = v.turn.teller;
  const leftMs = Math.max(0, v.turnEndsAt - now);
  const ranking = [...v.players].sort((a, b) => (v.points[b] ?? 0) - (v.points[a] ?? 0));
  const myRank = myId ? ranking.indexOf(myId) + 1 : 0;
  const send = async () => {
    if (!q.trim()) return;
    if (await act({ type: teller ? "clue" : "guess", text: q })) setQ("");
  };
  const letters = (x: string) => x.replace(/[\s'-]/g, "").length;

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(1000px 620px at 45% 50%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar
        game="devine"
        sub={v.over ? t("Partie terminée") : teller ? t("C’est toi qui fais deviner") : t("{name} fait deviner", { name: pseudo(tellerId) })}
        counterLabel={t("Tour {n}/{total}", { n: v.turn.n, total: v.turn.total })}
        counter={clock(leftMs)}
        onQuit={flow.onQuit}
      />
      <main className="flex-auto flex flex-wrap items-start content-center justify-center gap-x-8 gap-y-7 pt-6 pb-10 gutter">
        <aside aria-label={t("Joueurs")} className="flex-[0_1_300px] min-w-[250px] flex flex-col gap-2 p-[22px] bg-surf cut-lg">
          <span className="font-d font-bold text-lg tracking-[0.04em] uppercase">{t("Joueurs")}</span>
          <ol className="flex flex-col gap-2 m-0 p-0 list-none">
            {ranking.map((id, k) => {
              const m = member(id);
              const isTeller = id === tellerId && !v.over;
              const found = v.foundBy.includes(id);
              return (
                <li
                  key={id}
                  className="flex items-center gap-2.5 px-3 py-2.5 cut-sm"
                  style={{
                    background: isTeller ? "color-mix(in srgb, var(--acc) 22%, var(--surf2))" : found ? "color-mix(in srgb, var(--ok) 16%, var(--surf2))" : "var(--surf2)",
                    outline: isTeller ? "2px solid var(--acc)" : "none",
                    outlineOffset: -2
                  }}
                >
                  <span className="basis-5 shrink-0 text-center font-d font-bold text-mut">{k + 1}</span>
                  <span className="basis-9 shrink-0 w-9 h-9 overflow-hidden cut-sm">{m && <img src={avatarOf(m)} alt="" className="block w-full h-full object-cover" />}</span>
                  <span className="flex-auto min-w-0 flex flex-col">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[14.5px] font-bold">{pseudo(id)}</span>
                    {isTeller ? (
                      <span className="text-[12px] font-bold tracking-[0.06em] uppercase text-acc">{t("Fait deviner")}</span>
                    ) : found ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-bold tracking-[0.06em] uppercase text-ok">
                        <Check w={3} /> {t("Trouvé")}
                      </span>
                    ) : (
                      !v.over && <span className="text-[12px] text-mut">{t("Cherche…")}</span>
                    )}
                  </span>
                  <span className="font-d font-bold text-[20px]" style={{ color: id === myId ? "var(--acc)" : "var(--ink)" }}>
                    {v.points[id] ?? 0}
                  </span>
                </li>
              );
            })}
          </ol>
          <span className="pt-1 text-[12.5px] leading-snug text-mut">{t("Trouver vite rapporte jusqu’à 300 points. Le conteur marque pour chaque joueur qui trouve.")}</span>
        </aside>

        <section aria-label={t("Tour en cours")} className="flex-[1_1_640px] min-w-0 max-w-[760px] flex flex-col gap-[18px]">
          <div className="p-[2px] bg-acc cut-lg" style={{ filter: "drop-shadow(0 20px 44px color-mix(in srgb, var(--acc) 16%, transparent))" }}>
            <div className="flex flex-col items-center gap-3 px-8 py-[26px] bg-surf cut-lg text-center">
              {v.word ? (
                <>
                  <span className="label !text-acc">{teller ? t("Mot à faire deviner") : t("Tu as trouvé le mot")}</span>
                  <strong className="font-d text-[clamp(34px,4vw,54px)] leading-none uppercase">{v.word[lang]}</strong>
                  <span className="text-[14.5px] text-mut">{teller ? t("Décris-le sans l’écrire : le mot et ses raccourcis sont bloqués.") : t("Attends que les autres trouvent.")}</span>
                </>
              ) : (
                <>
                  <span className="label !text-acc">{t("{name} fait deviner", { name: pseudo(tellerId) })}</span>
                  <strong className="font-d text-[clamp(30px,4vw,50px)] leading-none tracking-[0.12em] text-mut">{v.mask[lang]}</strong>
                  <span className="text-[14.5px] text-mut">{t("{n} lettres · les fautes de frappe et les raccourcis (ff, tp…) sont acceptés", { n: letters(v.mask[lang]) })}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 px-5 py-[18px] bg-surf cut-md">
            <span className="label">{t("Indices et propositions")}</span>
            <ol ref={chat} aria-live="polite" className="flex flex-col gap-1.5 m-0 p-0 pr-1 list-none h-[clamp(220px,38vh,420px)] overflow-y-auto scroll">
              {v.feed.length === 0 && <li className="text-[14.5px] text-mut">{teller ? t("Écris un premier indice.") : t("Les indices du conteur apparaissent ici.")}</li>}
              {v.feed.map((e, i) => {
                if (e.kind === "reveal")
                  return (
                    <li key={i} className="self-center px-4 py-2 text-[14px] font-semibold text-mut">
                      {t("Le mot était : {word}", { word: e.reveal?.[lang] ?? "" })}
                    </li>
                  );
                const clue = e.kind === "clue";
                const own = e.by === myId;
                return (
                  <li
                    key={i}
                    className="flex items-baseline gap-2.5 max-w-[85%] px-4 py-2.5 cut-sm"
                    style={{
                      alignSelf: own ? "flex-end" : "flex-start",
                      background: e.kind === "found" ? "color-mix(in srgb, var(--ok) 22%, var(--surf2))" : clue ? "color-mix(in srgb, var(--acc) 24%, var(--surf2))" : "var(--surf2)",
                      borderLeft: clue ? "3px solid var(--acc)" : "none"
                    }}
                  >
                    <span className="shrink-0 text-[12.5px] font-bold" style={{ color: clue ? "var(--acc)" : "var(--mut)" }}>
                      {pseudo(e.by)}
                      {clue ? " · " + t("indice") : ""}
                    </span>
                    <span className="text-base font-semibold break-words min-w-0" style={{ color: e.kind === "guess" ? "var(--mut)" : "var(--ink)" }}>
                      {e.kind === "skip" ? t("passe le mot") : e.kind === "found" ? t("a trouvé ! +{n}", { n: e.points ?? 0 }) : e.text}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {!v.over && (teller || seeker || v.role === "trouve") && (
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
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    disabled={v.role === "trouve"}
                    placeholder={teller ? t("Écris un indice…") : v.role === "trouve" ? t("Trouvé ! Attends les autres…") : t("Ta proposition…")}
                    autoComplete="off"
                    spellCheck={false}
                    className="block w-full box-border h-14 px-[18px] border-0 outline-none bg-surf text-ink cut-sm font-b text-[17px] font-semibold disabled:opacity-60"
                  />
                </label>
                <button type="submit" disabled={v.role === "trouve"} className="h-[59px] px-[34px] border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-base tracking-[0.05em] uppercase disabled:opacity-50 disabled:cursor-not-allowed">
                  {teller ? t("Envoyer") : t("Proposer")}
                </button>
                {teller && (
                  <button type="button" onClick={() => act({ type: "skip" })} disabled={v.foundBy.length > 0} className="h-[59px] px-6 border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[14.5px] tracking-[0.04em] uppercase disabled:opacity-50 disabled:cursor-not-allowed">
                    {t("Passer")}
                  </button>
                )}
              </form>
              <span aria-live="polite" className="text-sm font-bold" style={{ color: error ? "var(--danger)" : "var(--mut)" }}>
                {error ?? (teller ? t("Un indice par message. Le mot à deviner et ses raccourcis sont bloqués.") : t("Propose autant de mots que tu veux."))}
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
              {myRank === 1 ? t("Tu") : t("Partie")} <span className="text-acc">{myRank === 1 ? t("gagnes !") : t("terminée")}</span>
            </>
          }
          stats={[
            { v: myId ? (v.points[myId] ?? 0) : 0, l: t("Tes points"), acc: true },
            { v: myRank ? `${myRank}/${v.players.length}` : "—", l: t("Ta place") },
            { v: v.wordsFound, l: t("Mots trouvés") }
          ]}
        >
          <ol className="flex flex-col gap-1.5 w-[min(100%,380px)] m-0 p-0 list-none">
            {ranking.map((id, k) => (
              <li key={id} className="flex items-center justify-between gap-3 px-4 py-2 cut-sm" style={{ background: id === myId ? "color-mix(in srgb, var(--acc) 16%, var(--surf2))" : "var(--surf2)" }}>
                <span className="font-semibold">
                  {k + 1}. {pseudo(id)}
                </span>
                <span className="font-d font-bold">{v.points[id] ?? 0}</span>
              </li>
            ))}
          </ol>
        </EndDialog>
      )}
    </div>
  );
}

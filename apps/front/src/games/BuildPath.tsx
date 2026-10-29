import { useMemo, useState } from "react";
import { BUILDPATH_MS, WARMUP_MS } from "@loltr/shared";
import { EndDialog, GameBar, TimerBar, modeSub, pointsLabel, pointsText } from "../components/game";
import { fmt, useT } from "../i18n";
import { useNow } from "../lib/time";
import { useBi, useTimeUp, type Bi } from "./common";
import type { GameProps } from "./types";

// Build Path : retrouve les composants de l'objet dans la boutique (tous les composants, avec une
// recherche). 5 objets en 60 s.

interface ItemView {
  id: string;
  names: Bi;
  gold: number;
  basic: boolean;
  image: string;
}
type Part = ItemView & { parts: ItemView[] };
interface Pub {
  i: number;
  total: number;
  target: ItemView & { recipe: number; slots: number };
  /** Composants placés, avec leurs propres composants (sous-composants). */
  placed: Part[];
  /** Temps écoulé avant la fin : le build complet de l'objet en cours. */
  answer: (ItemView & { components: Part[] }) | null;
  catalog: ItemView[];
  done: number;
  wrong: number;
  last: { kind: "ok" | "wrong"; item: string } | null;
  score: number;
  endsAt: number;
  warmUntil: number;
  over: boolean;
}

export function BuildPath({ round, act, finish, flow, groupSize }: GameProps<Pub>) {
  const t = useT();
  const bi = useBi();
  const tick = useNow(100);
  const pub = round.public;
  const now = flow.demo ? pub.warmUntil : tick;
  const [shakeAt, setShakeAt] = useState(0);
  const [wrong, setWrong] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<"all" | "basic" | "epic">("all");
  const warming = now < pub.warmUntil;
  const leftMs = Math.max(0, pub.endsAt - Math.max(now, pub.warmUntil));
  const over = round.over;
  useTimeUp(!over && leftMs <= 0, finish);

  // Un composant déjà placé reste cliquable : certaines recettes le demandent deux fois
  const placedIds = new Set(pub.placed.map((p) => p.id));
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const shown = useMemo(() => {
    const nq = norm(q.trim());
    return pub.catalog.filter((it) => (tier === "all" || (tier === "basic") === it.basic) && (!nq || norm(it.names.fr).includes(nq) || norm(it.names.en).includes(nq)));
  }, [pub.catalog, q, tier]);

  const pick = async (id: string) => {
    if (over || warming) return;
    const res = await act({ type: "pick", item: id }).catch(() => null);
    setQ("");
    if (res?.feedback?.wrong) {
      setWrong(id);
      setShakeAt(Date.now());
    } else setWrong(null);
  };

  const wrongRecent = Date.now() - shakeAt < 1400;
  const msg = wrongRecent && wrong ? t("{item} ne fait pas partie de la recette (−10)", { item: bi(pub.catalog.find((p) => p.id === wrong)?.names) }) : pub.last?.kind === "ok" && pub.placed.length === 0 && pub.i > 0 ? t("Objet reconstitué ! +100") : t("Clique les composants de l’objet, dans n’importe quel ordre.");
  const msgColor = wrongRecent && wrong ? "var(--danger)" : pub.placed.length === 0 && pub.i > 0 && pub.last?.kind === "ok" ? "var(--ok)" : "var(--mut)";

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(1000px 620px at 45% 45%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar game="buildpath" sub={modeSub(t, flow, groupSize)} counterLabel={t("Objets")} counter={`${pub.done}/${pub.total}`} onQuit={flow.onQuit} />
      <main className="flex-auto flex flex-wrap items-start content-center justify-center gap-x-8 gap-y-7 pt-5 pb-8 gutter">
        <section aria-label={t("Arbre de fabrication")} className="flex-[1_1_520px] min-w-0 max-w-[660px] flex flex-col items-center gap-0" style={{ filter: warming ? `blur(${(10 * Math.max(0, (pub.warmUntil - now) / WARMUP_MS)).toFixed(1)}px)` : "none" }}>
          <div className="w-full pb-5">
            <TimerBar leftMs={warming ? BUILDPATH_MS : leftMs} totalMs={BUILDPATH_MS} />
          </div>
          <div className="p-[2px] bg-acc cut-md" style={{ filter: "drop-shadow(0 18px 40px color-mix(in srgb, var(--acc) 18%, transparent))" }}>
            <div className="flex items-center gap-[18px] w-[min(420px,100%)] px-[22px] py-[18px] box-border bg-surf cut-md">
              <span className="basis-[84px] shrink-0 h-[84px] p-[2px] box-border cut-sm" style={{ background: "#F2C14E" }}>
                <img src={pub.target.image} alt="" className="block w-full h-full object-cover cut-sm" />
              </span>
              <span className="flex flex-col gap-1">
                <span className="label !text-acc">{t("Objet {n} sur {total}", { n: pub.i + 1, total: pub.total })}</span>
                <strong className="font-d text-[26px] leading-tight">{bi(pub.target.names)}</strong>
                <span className="font-d font-bold text-base text-warn">{t("{n} PO", { n: fmt(pub.target.gold) })}</span>
              </span>
            </div>
          </div>
          <svg width="100%" height="56" viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden="true" className="block text-line">
            {(() => {
              // Un trait par composant, au-dessus du centre de sa case (24 px d'écart entre les cases)
              const xs = Array.from({ length: pub.target.slots }, (_, k) => ((k + 0.5) / pub.target.slots) * 100);
              return <path d={`M50 0v20M${xs[0]} 20H${xs[xs.length - 1]}` + xs.map((x) => `M${x} 20v36`).join("")} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />;
            })()}
          </svg>
          <div className={`grid gap-6 w-full ${Date.now() - shakeAt < 400 ? "shake" : ""}`} style={{ gridTemplateColumns: `repeat(${pub.target.slots}, minmax(0, 1fr))` }}>
            {Array.from({ length: pub.target.slots }, (_, k) => {
              const it = pub.placed[k];
              return (
                <div key={k} className="p-[2px] cut-md" style={{ background: it ? "var(--ok)" : k === pub.placed.length ? "var(--acc)" : "var(--line)" }}>
                  <div className="h-[150px] flex flex-col items-center justify-center gap-2 cut-md text-center px-2" style={{ background: it ? "color-mix(in srgb, var(--ok) 10%, var(--surf))" : "var(--surf)" }}>
                    {it ? (
                      <span className="appear flex flex-col items-center gap-1.5">
                        <img src={it.image} alt="" className="block w-14 h-14 object-cover cut-sm" />
                        <strong className="text-[15px] leading-tight">{bi(it.names)}</strong>
                        <SubParts parts={it.parts} />
                      </span>
                    ) : (
                      <>
                        <span className="font-d font-bold text-[34px] text-mut">?</span>
                        <span className="text-[13.5px] text-mut">{t("Composant {n}", { n: k + 1 })}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 w-full pt-[18px] pb-3">
            <span aria-live="polite" className="text-[15px] font-bold" style={{ color: msgColor }}>
              {msg}
            </span>
            <span className="text-sm text-mut">
              {t("Coût de la recette")} : <strong className="text-warn">{t("{n} PO", { n: fmt(pub.target.recipe) })}</strong>
            </span>
          </div>
        </section>

        <aside aria-label={t("Boutique")} className="flex-[1_1_520px] min-w-0 max-w-[720px] flex flex-col gap-3 p-5 bg-surf cut-lg">
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-d font-bold text-lg tracking-[0.04em] uppercase">{t("Boutique")}</span>
            <span className="text-[13px] text-mut">{t("{n} composants", { n: shown.length })}</span>
          </span>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Entrée : le premier résultat de la recherche
              if (q.trim() && shown[0]) pick(shown[0].id);
            }}
            className="flex flex-wrap gap-2.5"
          >
            <label className="flex-[1_1_220px] p-[1.5px] bg-line cut-sm focus-within:bg-acc">
              <span className="sr-only">{t("Chercher un composant")}</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} disabled={over || warming} placeholder={t("Chercher un composant…")} autoComplete="off" spellCheck={false} className="block w-full box-border h-11 px-3.5 border-0 outline-none bg-surf2 text-ink cut-sm font-b text-[15px] font-semibold" />
            </label>
            <span role="radiogroup" aria-label={t("Type de composant")} className="flex gap-1.5">
              {(
                [
                  ["all", "Tous"],
                  ["basic", "De base"],
                  ["epic", "Intermédiaires"]
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={tier === k} onClick={() => setTier(k)} className="h-11 px-3.5 border-0 cut-sm cursor-pointer font-bold text-[13.5px]" style={{ background: tier === k ? "var(--acc)" : "var(--surf2)", color: tier === k ? "var(--on-acc)" : "var(--ink)" }}>
                  {t(l)}
                </button>
              ))}
            </span>
          </form>
          <div role="group" aria-label={t("Composants disponibles")} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] content-start gap-2 overflow-y-auto scroll pr-1" style={{ height: "clamp(300px, calc(100svh - 340px), 640px)" }}>
            {shown.map((it) => (
              <button key={it.id} type="button" onClick={() => pick(it.id)} disabled={over || warming} title={bi(it.names)} className="flex items-center gap-2.5 h-[60px] pl-1.5 pr-2.5 border-0 cut-sm cursor-pointer text-left transition-colors hover:bg-[color-mix(in_srgb,var(--acc)_14%,var(--surf2))] disabled:cursor-default" style={{ background: placedIds.has(it.id) ? "color-mix(in srgb, var(--ok) 16%, var(--surf2))" : "var(--surf2)" }}>
                <img src={it.image} alt="" className="basis-12 shrink-0 w-12 h-12 object-cover cut-sm" />
                <span className="flex flex-col min-w-0">
                  <strong className="text-[13.5px] leading-tight line-clamp-2">{bi(it.names)}</strong>
                  <span className="font-d font-bold text-xs text-warn">{t("{n} PO", { n: fmt(it.gold) })}</span>
                </span>
              </button>
            ))}
            {shown.length === 0 && <span className="col-span-full py-6 text-center text-sm text-mut">{t("Aucun composant ne correspond.")}</span>}
          </div>
        </aside>
        {flow.side}
      </main>

      {over && (
        <EndDialog
          flow={flow}
          label={`${t("Build Path")} · ${flow.multi ? t("groupe") : t("solo")}`}
          title={pub.done === pub.total ? <>{t("Tous les objets")} <span className="text-acc">{t("reconstitués")}</span></> : <>{t("Temps")} <span className="text-acc">{t("écoulé")}</span></>}
          width={pub.answer ? 720 : 560}
          stats={[
            { v: `${pub.done}/${pub.total}`, l: t("Objets reconstitués"), acc: true },
            { v: pub.wrong, l: t("Erreurs") },
            { v: pub.score, l: t("Score") },
            { v: pointsText(t, flow, round.points?.base ?? 0), l: pointsLabel(t, flow) }
          ]}
        >
          {pub.answer && <FullBuild answer={pub.answer} />}
        </EndDialog>
      )}
    </div>
  );
}

/** Sous-composants d'un composant intermédiaire, en petites icônes. */
function SubParts({ parts }: { parts: ItemView[] }) {
  const bi = useBi();
  if (!parts.length) return null;
  return (
    <span className="flex items-center gap-1" aria-label={parts.map((p) => bi(p.names)).join(" + ")}>
      {parts.map((p, i) => (
        <img key={i} src={p.image} alt="" title={bi(p.names)} className="w-6 h-6 object-cover cut-sm opacity-90" />
      ))}
    </span>
  );
}

/** Fin de partie perdue : l'arbre complet de l'objet qui n'a pas été fini. */
function FullBuild({ answer }: { answer: ItemView & { components: Part[] } }) {
  const t = useT();
  const bi = useBi();
  return (
    <div className="flex flex-col items-center gap-3 w-[calc(100%-56px)] px-4 py-4 bg-surf2 cut-md">
      <span className="label">{t("Le build complet")}</span>
      <span className="flex items-center gap-3">
        <img src={answer.image} alt="" className="w-12 h-12 object-cover cut-sm" />
        <span className="flex flex-col items-start">
          <strong className="font-d text-lg leading-tight">{bi(answer.names)}</strong>
          <span className="font-d font-bold text-[13px] text-warn">{t("{n} PO", { n: fmt(answer.gold) })}</span>
        </span>
      </span>
      <div className="grid gap-2 w-full" style={{ gridTemplateColumns: `repeat(${answer.components.length}, minmax(0, 1fr))` }}>
        {answer.components.map((c, i) => (
          <div key={i} className="flex flex-col items-center gap-1 px-2 py-2.5 bg-surf cut-sm text-center">
            <img src={c.image} alt="" className="w-10 h-10 object-cover cut-sm" />
            <span className="text-[13px] font-bold leading-tight">{bi(c.names)}</span>
            <span className="font-d font-bold text-xs text-warn">{t("{n} PO", { n: fmt(c.gold) })}</span>
            {c.parts.length > 0 && (
              <span className="flex flex-col items-center gap-1 pt-1.5 mt-0.5 border-t border-line w-full">
                {c.parts.map((p, j) => (
                  <span key={j} className="flex items-center gap-1.5 text-[12px] text-mut">
                    <img src={p.image} alt="" className="w-5 h-5 object-cover cut-sm" />
                    {bi(p.names)}
                  </span>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { LITE_BY_ID } from "@loltr/content/lite";
import { EndDialog, GameBar, modeSub, pointsLabel, pointsText } from "../components/game";
import { useT } from "../i18n";
import { useBi, type Bi } from "./common";
import type { GameProps } from "./types";

// Connexions visuelles : 16 champions, 4 groupes de 4 qui partagent un lien caché. 4 erreurs permises.

interface Tile {
  id: string;
  image: string;
}
interface Group {
  index: number;
  label: Bi;
  champs: Tile[];
}
interface Pub {
  tiles: Tile[];
  found: Group[];
  missed: Group[];
  errors: number;
  maxErrors: number;
  score: number;
  over: boolean;
}

/** Couleurs des groupes trouvés : écartées en clarté, lisibles avec un texte sombre. */
const COLORS = ["#F2C14E", "#3DBE80", "#6FB2FF", "#B58CFF"];

export function ConnexionsVisuelles({ round, act, flow, groupSize, namesLang }: GameProps<Pub>) {
  const t = useT();
  const bi = useBi();
  const pub = round.public;
  const [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ text: string; color: string; at: number } | null>(null);
  // Partie finie : on regarde d'abord la grille complète (liens manqués dévoilés), puis le résultat
  const [showEnd, setShowEnd] = useState(false);
  const name = (id: string) => LITE_BY_ID[id]?.names[namesLang] ?? id;
  const over = round.over;

  const toggle = (id: string) => {
    if (over) return;
    setMsg(null);
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));
  };
  const submit = async () => {
    if (sel.length !== 4) return;
    const res = await act({ type: "submit", champions: sel }).catch(() => null);
    const f = res?.feedback;
    if (f?.correct !== undefined) {
      setSel([]);
      setMsg({ text: t("Bien vu !"), color: "var(--ok)", at: Date.now() });
    } else if (f?.already) setMsg({ text: t("Tu as déjà proposé ce groupe."), color: "var(--mut)", at: Date.now() });
    else if (f?.wrong) setMsg({ text: f.close ? t("Presque ! 3 champions sur 4 vont ensemble.") : t("Ces 4 champions n’ont pas de lien commun."), color: f.close ? "var(--warn)" : "var(--danger)", at: Date.now() });
  };

  const bar = (g: Group, done: boolean) => (
    <div key={g.index} className="appear flex flex-wrap items-center gap-4 min-h-[clamp(72px,calc((100svh-360px)/4),96px)] px-6 py-2 cut-md text-[#0F1115]" style={{ background: done ? COLORS[g.index % 4] : `repeating-linear-gradient(135deg, ${COLORS[g.index % 4]} 0 14px, color-mix(in srgb, ${COLORS[g.index % 4]} 82%, #0F1115) 14px 28px)` }}>
      <span className="flex-[0_0_240px] flex flex-col gap-0.5">
        <span className="text-[12.5px] font-bold tracking-[0.08em] uppercase opacity-75">{done ? t("Lien trouvé") : t("Lien manqué")}</span>
        <strong className="font-d text-[22px] uppercase">{bi(g.label)}</strong>
      </span>
      <span className="flex-auto flex flex-wrap gap-2.5 justify-end">
        {g.champs.map((c) => (
          <span key={c.id} className="flex items-center gap-2 h-14 pl-1 pr-3.5 cut-sm font-bold text-[14.5px]" style={{ background: "rgba(255,255,255,.45)" }}>
            <img src={c.image} alt="" className="w-12 h-12 object-cover cut-sm" />
            {name(c.id)}
          </span>
        ))}
      </span>
    </div>
  );

  const shake = !!msg && msg.color !== "var(--ok)" && Date.now() - msg.at < 400;
  return (
    <div className="relative flex flex-col min-h-[calc(100vh-85px)]" style={{ background: "radial-gradient(1000px 620px at 45% 50%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 72%), var(--bg)" }}>
      <GameBar
        game="connexions"
        sub={modeSub(t, flow, groupSize)}
        counterLabel={t("Erreurs")}
        counter={
          <span role="img" aria-label={t("{n} erreur(s) sur {max}", { n: pub.errors, max: pub.maxErrors })} className="flex gap-1.5">
            {Array.from({ length: pub.maxErrors }, (_, i) => (
              <span key={i} className="w-3.5 h-3.5 cut-sm" style={{ background: i < pub.errors ? "var(--danger)" : "var(--line)" }} />
            ))}
          </span>
        }
        onQuit={flow.onQuit}
      />
      <main className="flex-auto flex flex-wrap items-start content-center justify-center gap-x-10 gap-y-7 pt-5 pb-10 gutter">
        <section aria-label={t("Grille")} className="flex-[1_1_820px] min-w-0 max-w-[940px] flex flex-col gap-3">
          <span className="text-base text-mut">{t("Forme 4 groupes de 4 champions qui partagent un lien caché : région, espèce, poste, ressource, année de sortie…")}</span>
          {pub.found.map((g) => bar(g, true))}
          {pub.missed.map((g) => bar(g, false))}
          {pub.tiles.length > 0 && !over && (
            <div role="group" aria-label={t("Champions à regrouper")} className={`grid grid-cols-4 gap-3 ${shake ? "shake" : ""}`}>
              {pub.tiles.map((c) => {
                const on = sel.includes(c.id);
                return (
                  <button key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={on} className="relative h-[clamp(84px,calc((100svh-360px)/4),150px)] p-[3px] border-0 cut-md cursor-pointer transition-transform hover:-translate-y-0.5" style={{ background: on ? "var(--acc)" : "transparent" }}>
                    <span className="absolute inset-[3px] block overflow-hidden bg-surf2 cut-md">
                      <img src={c.image} alt="" className="block w-full h-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 px-3 pt-6 pb-2.5 text-left font-bold text-[15px] text-ink" style={{ background: "linear-gradient(transparent, color-mix(in srgb, var(--bg) 88%, transparent))" }}>
                        {name(c.id)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {over && !showEnd && (
            <div className="appear flex flex-wrap items-center justify-between gap-3.5 px-6 py-4 bg-surf cut-md">
              <span className="flex flex-col gap-0.5">
                <span className="label" style={{ color: pub.found.length === 4 ? "var(--ok)" : "var(--danger)" }}>
                  {pub.found.length === 4 ? t("Tous les liens trouvés") : t("4 erreurs : partie terminée")}
                </span>
                <span className="text-[15px] text-mut">{pub.missed.length ? t("Les liens manqués sont hachurés.") : t("Bravo, aucun lien manqué !")}</span>
              </span>
              <button type="button" autoFocus onClick={() => setShowEnd(true)} className="h-[54px] px-10 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-base tracking-[0.05em] uppercase">
                {t("Voir le résultat")}
              </button>
            </div>
          )}
          {!over && (
            <div className="flex flex-wrap items-center justify-between gap-3.5 pt-1.5">
              <span aria-live="polite" className="text-[15px] font-bold" style={{ color: msg?.color ?? "var(--mut)" }}>
                {msg?.text ?? (sel.length === 4 ? t("Valide pour vérifier ton groupe.") : t("Sélectionne 4 champions."))}
              </span>
              <span className="flex flex-wrap gap-2.5">
                <button type="button" onClick={() => act({ type: "shuffle" }).catch(() => null)} className="h-[54px] px-7 border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[15px] tracking-[0.04em] uppercase">
                  {t("Mélanger")}
                </button>
                <button type="button" onClick={() => setSel([])} className="h-[54px] px-7 border-0 bg-surf2 text-ink para cursor-pointer font-d font-bold text-[15px] tracking-[0.04em] uppercase">
                  {t("Désélectionner")}
                </button>
                <button type="button" onClick={submit} disabled={sel.length !== 4} className="h-[54px] px-10 border-0 para cursor-pointer font-d font-bold text-base tracking-[0.05em] uppercase disabled:cursor-not-allowed" style={{ background: sel.length === 4 ? "var(--acc)" : "var(--surf2)", color: sel.length === 4 ? "var(--on-acc)" : "var(--mut)" }}>
                  {t("Valider ({n}/4)", { n: sel.length })}
                </button>
              </span>
            </div>
          )}
        </section>
        {flow.side}
      </main>

      {over && showEnd && (
        <EndDialog
          flow={flow}
          label={`${t("Connexions visuelles")} · ${flow.multi ? t("groupe") : t("solo")}`}
          title={pub.found.length === 4 ? <>{t("Tous les liens")} <span className="text-acc">{t("trouvés")}</span></> : <>{t("Partie")} <span className="text-acc">{t("terminée")}</span></>}
          stats={[
            { v: `${pub.found.length}/4`, l: t("Groupes trouvés"), acc: true },
            { v: pub.errors, l: t("Erreurs") },
            { v: pub.score, l: t("Score") },
            { v: pointsText(t, flow, round.points?.base ?? 0), l: pointsLabel(t, flow) }
          ]}
        />
      )}
    </div>
  );
}

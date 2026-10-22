import { useEffect, useLayoutEffect, useState } from "react";
import { post } from "../api/client";
import { keys, queryClient } from "../api/queries";
import { useT } from "../i18n";

// Tutoriel guidé : l'élément présenté est mis en valeur, le reste de l'écran est assombri, avec un
// court texte puis la fonctionnalité suivante. Un bouton « Passer » est toujours disponible.

export interface TourStep {
  /** Élément à mettre en valeur (attribut data-tuto) ; sans cible, la bulle est centrée. */
  target?: string;
  title: string;
  text: string;
}

export const SITE_TOUR: TourStep[] = [
  { title: "Bienvenue sur LolTR", text: "Chaque jour, un défi de 4 mini-jeux League of Legends, seul ou avec tes amis. Petit tour du propriétaire !" },
  { target: "rotation", title: "La rotation du jour", text: "Champion du jour, puis 3 jeux tirés au sort. Elle change chaque jour à 3 h (heure de Paris)." },
  { target: "play", title: "Seul ou en groupe", text: "Chaque jour, tu fais le défi en solo ou en groupe, pas les deux. Ton score compte pour le classement." },
  { target: "streak", title: "Ta série", text: "Joue chaque jour pour faire grimper ta série." },
  { target: "shards", title: "Les éclats", text: "Gagnés avec tes points, tes défis et le classement de fin de saison. Ils s’échangent à la boutique contre des chibis et des skins." },
  { target: "friends", title: "Tes amis", text: "Ajoute des amis, crée un groupe jusqu’à 6 joueurs et lancez le défi ensemble." },
  { target: "nav", title: "Jeux, classement et boutique", text: "Rejoue les jeux en mode classique, compare-toi au classement et dépense tes éclats à la boutique." },
  { target: "account", title: "Ton compte", text: "Ton profil, ta collection, les paramètres, la langue et le thème sont dans le menu de ton avatar. Tu peux y revoir ce tutoriel." }
];

/** Marque un tutoriel comme vu (ou à revoir) sur le profil. */
export async function markTutorial(key: string, done = true) {
  await post("/api/profil/tutorials", { key, done }).catch(() => {});
  await queryClient.invalidateQueries({ queryKey: keys.profile });
}

export function Tutorial({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];

  useLayoutEffect(() => {
    let el: HTMLElement | null = null;
    let ro: ResizeObserver | null = null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => el && setRect(el.getBoundingClientRect());
    // L'élément peut apparaître juste après (jeu en démo, image en chargement) : on le cherche un instant
    const find = () => {
      el = step.target ? document.querySelector<HTMLElement>(`[data-tuto="${step.target}"]`) : null;
      if (!el) {
        if (step.target && tries++ < 20) timer = setTimeout(find, 50);
        else setRect(null);
        return;
      }
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      update();
      ro = new ResizeObserver(update);
      ro.observe(el);
    };
    find();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      clearTimeout(timer);
      ro?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      if (e.key === "ArrowRight" || e.key === "Enter") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const next = () => (i + 1 < steps.length ? setI(i + 1) : onDone());
  const pad = 8;
  const box = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad } : null;
  // La bulle se place sous l'élément, ou au-dessus s'il est en bas de l'écran
  const below = box ? box.top + box.height + 220 < window.innerHeight : true;
  const bubble: React.CSSProperties = box
    ? { position: "fixed", left: Math.max(16, Math.min(window.innerWidth - 376, box.left)), top: below ? box.top + box.height + 14 : undefined, bottom: below ? undefined : window.innerHeight - box.top + 14, width: 360 }
    : { position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "min(92vw, 440px)" };

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="titre-tuto">
      {/* Tout l'écran est assombri, sauf l'élément présenté (découpé à coins coupés, contour à l'accent) */}
      <svg aria-hidden="true" className="fixed inset-0 w-full h-full">
        <defs>
          <mask id="tuto-trou">
            <rect width="100%" height="100%" fill="white" />
            {box && <polygon points={cutPoints(box)} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" mask="url(#tuto-trou)" style={{ fill: "color-mix(in srgb, var(--bg) 80%, transparent)" }} />
        {box && <polygon points={cutPoints(box)} fill="none" style={{ stroke: "var(--acc)" }} strokeWidth={2} />}
      </svg>
      <div style={bubble} className="p-[2px] bg-acc cut-md">
        <div className="flex flex-col gap-2.5 p-5 bg-surf cut-md">
          <span className="label">{t("Étape {i} sur {n}", { i: i + 1, n: steps.length })}</span>
          <h2 id="titre-tuto" className="m-0 font-d font-bold text-[22px] leading-tight">
            {t(step.title)}
          </h2>
          <p className="m-0 text-[15px] leading-relaxed text-mut">{t(step.text)}</p>
          <div className="flex items-center justify-between gap-3 pt-1.5">
            <button type="button" className="tl text-sm" onClick={onDone}>
              {t("Passer")}
            </button>
            <button type="button" onClick={next} autoFocus className="h-11 px-7 border-0 bg-acc text-on-acc para cursor-pointer font-d font-bold text-[15px] tracking-[0.05em] uppercase">
              {i + 1 < steps.length ? t("Suivant") : t("C’est parti")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Rectangle à coins coupés (haut-gauche et bas-droite), comme --cut-sm. */
function cutPoints(b: { left: number; top: number; width: number; height: number }) {
  const c = Math.min(12, b.width / 4, b.height / 4);
  const r = b.left + b.width;
  const bt = b.top + b.height;
  return [`${b.left + c},${b.top}`, `${r},${b.top}`, `${r},${bt - c}`, `${r - c},${bt}`, `${b.left},${bt}`, `${b.left},${b.top + c}`].join(" ");
}

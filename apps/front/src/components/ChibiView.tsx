import { createElement, useEffect, useState, type CSSProperties } from "react";
import { MODEL_ZOOM } from "@loltr/content/lite";

// Affichage d'un chibi détouré, prêt pour la 3D : si le chibi a un modèle (Chibi.model3d, rempli via
// MODELS_3D dans packages/content/src/chibis.ts), il est affiché en 3D avec <model-viewer> ; sinon
// l'image détourée. Le lecteur 3D n'est chargé qu'au premier modèle affiché.

const MODEL_VIEWER_SRC = "/vendor/model-viewer.min.js";
let loading: Promise<void> | null = null;

// Les attributs booléens (autoplay…) doivent être posés via
// setAttribute : passés comme props React à l'élément personnalisé, ils
// arriveraient en propriétés avec une chaîne vide (falsy) et le lecteur 3D
// les ignorerait (modèle figé). La rotation est volontairement désactivée
// (pas de camera-controls) : le chibi joue son idle en boucle, sans interaction.
function fitCamera(el: Element) {
  const mv = el as unknown as {
    getDimensions?: () => { x: number; y: number; z: number };
    cameraOrbit?: string;
    jumpCameraToGoal?: () => void;
    src?: string;
  };
  try {
    const d = mv.getDimensions?.();
    if (!d || !(d.x > 0 && d.y > 0 && d.z > 0)) return;
    // Cadrage auto par chibi : rayon calcule depuis la taille reelle du modele
    // (chaque chibi a des proportions differentes), ajustable via MODEL_ZOOM.
    const key = (mv.src ?? "").split("/").pop()?.replace(/\.glb$/i, "") ?? "";
    const k = MODEL_ZOOM[key] ?? 1;
    const maxDim = Math.max(d.x, d.y, d.z);
    const radius = ((maxDim / 2) / Math.tan((20 * Math.PI) / 360)) * 0.92 * k;
    mv.cameraOrbit = `0deg 82deg ${radius.toFixed(3)}m`;
    mv.jumpCameraToGoal?.();
  } catch {
    /* sinon on garde le cadrage auto du lecteur */
  }
}

function setupViewer(el: Element | null) {
  if (!el) return;
  el.setAttribute("autoplay", "");
  el.addEventListener("load", () => fitCamera(el), { once: true });
}

function loadModelViewer(): Promise<void> {
  if (customElements.get("model-viewer")) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.type = "module";
    s.src = MODEL_VIEWER_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("model-viewer indisponible"));
    document.head.appendChild(s);
  });
  return loading;
}

export function ChibiView({ img, model3d, alt, style, className }: { img: string | null; model3d?: string | null; alt: string; style?: CSSProperties; className?: string }) {
  const [ready3d, setReady3d] = useState(false);
  useEffect(() => {
    if (!model3d) return;
    loadModelViewer()
      .then(() => setReady3d(true))
      .catch(() => setReady3d(false));
  }, [model3d]);

  if (model3d && ready3d)
    return createElement("model-viewer", {
      src: model3d,
      alt,
      ref: setupViewer,
      "animation-name": "Idle_Base",
      "interaction-prompt": "none",
      "shadow-intensity": "0",
      "camera-orbit": "0deg 82deg auto",
      "field-of-view": "20deg",
      class: className,
      style: { background: "transparent", ...style }
    });
  if (!img) return null;
  return <img src={img} alt={alt} className={className} style={style} />;
}

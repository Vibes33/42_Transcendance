import { createElement, useEffect, useState, type CSSProperties } from "react";

// Affichage d'un chibi détouré, prêt pour la 3D : si le chibi a un modèle (Chibi.model3d, rempli via
// MODELS_3D dans packages/content/src/chibis.ts), il est affiché en 3D avec <model-viewer> ; sinon
// l'image détourée. Le lecteur 3D n'est chargé qu'au premier modèle affiché.

const MODEL_VIEWER_SRC = "/vendor/model-viewer.min.js";
let loading: Promise<void> | null = null;

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
      "camera-controls": "",
      "disable-zoom": "",
      "disable-pan": "",
      autoplay: "",
      "interaction-prompt": "none",
      "shadow-intensity": "0",
      "camera-orbit": "0deg 82deg auto",
      "field-of-view": "26deg",
      class: className,
      style: { background: "transparent", ...style }
    });
  if (!img) return null;
  return <img src={img} alt={alt} className={className} style={style} />;
}

import { createElement, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ModelPlacement } from "@loltr/content/lite";
import { camera, effectiveTuning, modelStem, motion, useModelTuning } from "../lib/modelTuning";

// Chibi en 3D (<model-viewer>) quand le skin a un modèle, sinon son image détourée. Le lecteur 3D
// n'est chargé qu'au premier modèle affiché. Le modèle est rendu comme sur modelviewer.lol (parties visibles
// image par image, ordre de rendu des visages) et cadré automatiquement : tous les chibis à la même échelle,
// centrés, pieds en bas de la zone, tête qui dépasse du cadre placé derrière.
// Réglages fins (taille, décalage, rotation, caméra) : MODEL_TUNING / MODEL_PLACEMENTS / MODEL_CAMERA dans
// chibis.ts, ou en direct depuis le panneau de test.

const MODEL_VIEWER_SRC = "/vendor/model-viewer.min.js";
/** Hauteur d'un chibi type (m) : à la taille commune, il occupe FILL de la hauteur de la zone. */
const REF_HEIGHT = 1.45;
const FILL = 0.86;
/** Cadence des événements de visibilité des fichiers (images par seconde, comme dans le jeu). */
const FPS = 30;
/** Au-delà de cette taille (en m), une partie est un décor de « finisher » : ciel, sol, arène… */
const SCENERY = 5;
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

interface Viewer extends HTMLElement {
  loaded: boolean;
  availableAnimations: string[];
  animationName: string;
  currentTime: number;
  duration: number;
  cameraOrbit: string;
  cameraTarget: string;
  orientation: string;
  getDimensions(): { x: number; y: number; z: number };
  getBoundingBoxCenter(): { x: number; y: number; z: number };
  jumpCameraToGoal(): void;
  play(): void;
}

/** L'animation d'attente du modèle : celle indiquée par le fichier, sinon Idle_Base, une autre « idle », la première. */
function pickIdle(names: string[], initial?: string): string | null {
  return (
    (initial && names.includes(initial) ? initial : undefined) ??
    names.find((n) => /^idle_base$/i.test(n)) ??
    names.find((n) => /idle/i.test(n) && !/_in$|_out$|winddown/i.test(n)) ??
    names[0] ??
    null
  );
}

type Vec = { x: number; y: number; z: number };
interface Box {
  min: Vec;
  max: Vec;
}
interface VisEvent {
  startFrame?: number;
  endFrame?: number;
  hideSubmeshList?: number[];
  showSubmeshList?: number[];
}
interface Prepared {
  box: Box;
  /** Applique les parties visibles à l'image donnée de l'animation. */
  sync: (frame: number) => void;
}

// Objets three.js internes au lecteur, non typés
function sceneOf(mv: Viewer): any {
  const sym = Object.getOwnPropertySymbols(mv).find((s) => s.description === "scene");
  return sym && (mv as any)[sym];
}

function viewerBox(mv: Viewer): Box {
  const d = mv.getDimensions();
  const c = mv.getBoundingBoxCenter();
  return { min: { x: c.x - d.x / 2, y: c.y - d.y / 2, z: c.z - d.z / 2 }, max: { x: c.x + d.x / 2, y: c.y + d.y / 2, z: c.z + d.z / 2 } };
}

/** Réglages de rendu portés par les matériaux (extras), appliqués comme sur modelviewer.lol. */
function setupMaterial(me: any) {
  const mat = me.material;
  const ud = mat?.userData ?? {};
  me.frustumCulled = false;
  if (ud.renderOrder) me.renderOrder = ud.renderOrder;
  // Les décalques du visage (yeux, bouche) sont transparents : sans écriture de profondeur, le visage
  // dessiné ensuite les recouvre
  if (mat.transparent) mat.depthWrite = true;
  if (ud.depthWrite !== undefined) mat.depthWrite = ud.depthWrite;
  if (ud.blendMode === "Additive") {
    mat.blending = 2;
    mat.transparent = true;
    mat.depthWrite = false;
  } else if (ud.blendMode === "Normal") mat.blending = 1;
  else if (ud.blendMode === "Subtractive") mat.blending = 3;
  // Planche d'images (yeux animés) : on n'en montre qu'une case
  if (ud.flipbookSize && mat.map) {
    const [cols, rows] = ud.flipbookSize as [number, number];
    const i = ud.flipbookFrameIndex ?? 0;
    const map = mat.map.clone();
    map.repeat.set(map.repeat.x / cols, map.repeat.y / rows);
    map.offset.set(map.offset.x + (i % cols) * map.repeat.x, map.offset.y + Math.floor(i / cols) * map.repeat.y);
    map.wrapS = map.wrapT = 1000;
    map.needsUpdate = true;
    mat.map = map;
  }
  mat.needsUpdate = true;
}

/** Boîte englobante d'une partie dans la pose actuelle, sur les sommets réellement dessinés après skinning. */
function partBox(me: any, inv: any): Box | null {
  const g = me.geometry;
  const pos = g.attributes.position;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  if (!pos || !si || !sw) return null;
  const M = me.matrixWorld.constructor;
  const V = me.position.constructor;
  const m = new M();
  const v = new V();
  const t = new V();
  const acc = new V();
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const index: ArrayLike<number> = g.index?.array ?? Array.from({ length: pos.count }, (_, i) => i);
  const { bones, boneInverses } = me.skeleton;
  for (let n = 0; n < index.length; n++) {
    v.fromBufferAttribute(pos, index[n]);
    acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(index[n], k);
      if (!w) continue;
      const b = si.getComponent(index[n], k);
      m.multiplyMatrices(bones[b].matrixWorld, boneInverses[b]);
      acc.add(t.copy(v).applyMatrix4(m).multiplyScalar(w));
    }
    acc.applyMatrix4(inv);
    for (let a = 0; a < 3; a++) {
      const x = acc.getComponent(a);
      if (x < lo[a]) lo[a] = x;
      if (x > hi[a]) hi[a] = x;
    }
  }
  if (!(hi[1] >= lo[1])) return null;
  return { min: { x: lo[0], y: lo[1], z: lo[2] }, max: { x: hi[0], y: hi[1], z: hi[2] } };
}

/**
 * Prépare le modèle chargé : rendu des matériaux, parties visibles et mesure.
 *
 * Visibilité : chaque partie a une visibilité par défaut (extras.visible du matériau) et l'animation jouée
 * en montre ou en cache d'autres à certaines images (extras.submeshVisibilityEvents du squelette, par
 * empreinte de partie) : clignements, expressions, accessoires (Tibbers n'apparaît que dans certaines
 * animations). En secours, les décors géants et les parties rangées sous le sol (l'ombre de Vex…) sont
 * toujours masqués.
 *
 * Mesure : sur les sommets dessinés après skinning, dans la pose de départ. Celle de model-viewer est fausse
 * pour ces modèles (squelette mis à l'échelle à part : elle sort parfois 100 fois trop grande). Les ombres
 * plates posées au sol ne comptent pas. Repli sur la mesure de model-viewer si la scène est inaccessible.
 */
function prepare(mv: Viewer, anim: string | null): Prepared {
  const fallback = { box: viewerBox(mv), sync: () => {} };
  const scene = sceneOf(mv);
  if (!scene?.traverse) return fallback;
  const all: any[] = [];
  let events: VisEvent[] = [];
  scene.traverse((o: any) => {
    if (o.isSkinnedMesh) all.push(o);
    const ev = o.userData?.submeshVisibilityEvents;
    if (ev && anim && ev[anim]) events = ev[anim];
  });
  if (!all.length) return fallback;
  for (const me of all) setupMaterial(me);
  const byHash = new Map<number, any[]>();
  for (const me of all) {
    const h = me.material?.userData?.hash;
    if (h !== undefined) byHash.set(h, [...(byHash.get(h) ?? []), me]);
  }
  const banned = new Set<any>();
  const sync = (frame: number) => {
    const vis = new Map<any, boolean>(all.map((me) => [me, me.material?.userData?.visible !== false]));
    for (const e of events) {
      const from = e.startFrame ?? 0;
      if (frame < from || (e.endFrame != null && frame > e.endFrame)) continue;
      for (const h of e.hideSubmeshList ?? []) for (const me of byHash.get(h) ?? []) vis.set(me, false);
      for (const h of e.showSubmeshList ?? []) for (const me of byHash.get(h) ?? []) vis.set(me, true);
    }
    for (const me of all) me.visible = !banned.has(me) && vis.get(me)!;
  };
  sync(0);
  const start = new Set(all.filter((me) => me.visible));
  // Parties montrées à un moment de l'animation : elles peuvent être des décors à écarter
  const shown = new Set(events.flatMap((e) => e.showSubmeshList ?? []).flatMap((h) => byHash.get(h) ?? []));
  scene.updateMatrixWorld(true);
  // Repère du modèle (celui de camera-target) : le groupe glTF placé sous l'objet « Target » du lecteur
  let root = all[0];
  while (root.parent && root.parent.name !== "Target") root = root.parent;
  const inv = new root.matrixWorld.constructor().copy(root.matrixWorld).invert();
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const me of all) {
    if (!start.has(me) && !shown.has(me)) continue;
    const b = partBox(me, inv);
    if (!b) continue;
    const size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
    if (size > SCENERY || b.max.y < -0.02) {
      banned.add(me);
      me.visible = false;
      continue;
    }
    if (!start.has(me) || (b.max.y - b.min.y < 0.05 && Math.abs(b.min.y) < 0.05)) continue;
    for (const a of ["x", "y", "z"] as const) {
      min[a] = Math.min(min[a], b.min[a]);
      max[a] = Math.max(max[a], b.max[a]);
    }
  }
  if (!(max.y > min.y)) return { ...fallback, sync };
  return { box: { min, max }, sync };
}

/**
 * Cadrage commun : tous les chibis à la même échelle (un chibi type occupe FILL de la hauteur de la zone),
 * centrés sur leur position, pieds posés un peu au-dessus du bas de la zone. La zone 3D déborde du
 * composant (au-dessus et sur les côtés) : chapeaux, oreilles et ailes dépassent sans rapetisser le chibi.
 * Seul un modèle trop grand même pour ce débord (Kayle et ses ailes…) est réduit pour y tenir.
 */
function frame(mv: Viewer, box: Box, stem: string, placement: ModelPlacement, theta: number, jump: boolean) {
  const t = effectiveTuning(stem, placement);
  const cam = camera();
  const fov = `${cam.fov}deg`;
  for (const a of ["field-of-view", "min-field-of-view", "max-field-of-view"]) if (mv.getAttribute(a) !== fov) mv.setAttribute(a, fov);
  const tan = Math.tan((cam.fov * Math.PI) / 360);
  const aspect = mv.clientWidth / Math.max(1, mv.clientHeight);
  const bottom = Math.min(0, box.min.y);
  const halfWidth = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
  // Hauteur du composant (la zone) rapportée à celle de la zone 3D, débord compris
  const zone = (mv.parentElement?.clientHeight || mv.clientHeight) / Math.max(1, mv.clientHeight);
  const rRef = REF_HEIGHT / 2 / tan / (FILL * zone);
  const rHeight = (box.max.y - bottom) / 2 / tan / 0.97;
  const rWidth = halfWidth / (tan * aspect) / 0.98;
  const radius = Math.max(rRef, rHeight, rWidth) / t.zoom;
  const half = radius * tan;
  const ty = bottom + half - 0.03 * 2 * half - t.y * 2 * half;
  const tx = -t.x * 2 * half;
  mv.orientation = `0deg 0deg ${t.yaw}deg`;
  mv.cameraTarget = `${tx.toFixed(4)}m ${ty.toFixed(4)}m 0m`;
  mv.cameraOrbit = `${theta}deg ${cam.pitch}deg ${radius.toFixed(4)}m`;
  if (jump) mv.jumpCameraToGoal();
}

export function ChibiView({
  img,
  model3d,
  alt,
  style,
  className,
  placement = "accueil",
  bleed = 0,
  headroom = 0.25
}: {
  img: string | null;
  model3d?: string | null;
  alt: string;
  style?: CSSProperties;
  className?: string;
  placement?: ModelPlacement;
  /** Débord horizontal de la zone 3D de chaque côté (fraction de sa largeur) : ailes et armes dépassent du cadre sans rapetisser le chibi. */
  bleed?: number;
  /** Débord de la zone 3D au-dessus du composant (fraction de sa hauteur) : chapeaux et oreilles ne sont pas coupés. */
  headroom?: number;
}) {
  const [ready3d, setReady3d] = useState(false);
  const ref = useRef<Viewer | null>(null);

  useEffect(() => {
    if (!model3d) return;
    loadModelViewer()
      .then(() => setReady3d(true))
      .catch(() => setReady3d(false));
  }, [model3d]);

  // Le panneau de test liste les modèles affichés
  useEffect(() => (model3d ? useModelTuning.getState().register(modelStem(model3d), placement) : undefined), [model3d, placement]);

  useEffect(() => {
    const mv = ref.current;
    if (!mv || !model3d || !ready3d) return;
    // Les attributs booléens passent par setAttribute (en props React, l'élément les ignorerait)
    mv.setAttribute("autoplay", "");
    // Invisible jusqu'au premier cadrage (évite d'apercevoir le décor ou un mauvais cadrage)
    mv.style.opacity = "0";
    let theta = 0;
    let side = 1;
    const stem = modelStem(model3d);
    // Mesuré une fois au chargement : recadrer à chaque image ferait suivre l'animation à la caméra
    let prep: Prepared | null = null;
    const apply = (jump: boolean) => mv.loaded && prep && frame(mv, prep.box, stem, placement, theta, jump);
    let loads = 0;
    const onLoad = () => {
      prep = null;
      const id = ++loads;
      mv.style.opacity = "0";
      let initial: string | undefined;
      sceneOf(mv)?.traverse?.((o: any) => (initial ??= o.userData?.initialAnimation));
      const idle = pickIdle(mv.availableAnimations ?? [], initial);
      if (idle) {
        mv.animationName = idle;
        mv.play();
      }
      // Mesure après deux images, une fois la pose d'attente appliquée (certaines parties y sont repliées)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          // Un autre modèle a été demandé entre-temps : sa propre mesure suivra
          if (id !== loads || !mv.loaded) return;
          prep = prepare(mv, idle);
          apply(true);
          mv.style.opacity = "1";
        })
      );
    };
    // Parties visibles image par image (clignements, expressions) ; l'animation boucle
    let raf = 0;
    let last = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!prep) return;
      const d = mv.duration;
      const f = Math.floor((d > 0 ? mv.currentTime % d : mv.currentTime) * FPS);
      if (f !== last) prep.sync((last = f));
    };
    raf = requestAnimationFrame(tick);
    mv.addEventListener("load", onLoad);
    if (mv.loaded) onLoad();
    // Léger balancement de gauche à droite, que le lecteur interpole en douceur
    const sway = setInterval(() => {
      const amp = motion().sway;
      side = -side;
      theta = amp ? side * amp : 0;
      apply(false);
    }, 3600);
    const ro = new ResizeObserver(() => apply(true));
    ro.observe(mv);
    const unsub = useModelTuning.subscribe(() => apply(true));
    return () => {
      mv.removeEventListener("load", onLoad);
      cancelAnimationFrame(raf);
      clearInterval(sway);
      ro.disconnect();
      unsub();
    };
  }, [model3d, ready3d, placement]);

  const float = useModelTuning((s) => s.motion.float) ?? motion().float;
  const cam = camera();

  if (model3d && ready3d)
    return (
      <div className={className} style={style}>
        {createElement("model-viewer", {
          ref,
          src: model3d,
          alt,
          "interaction-prompt": "none",
          "shadow-intensity": "0",
          "camera-orbit": `0deg ${cam.pitch}deg auto`,
          // Le cadrage calcule la distance lui-même. Le lecteur règle ses plans de coupe d'après la distance
          // maximale : une limite trop grande ferait disparaître le modèle, d'où 60 m (un chibi mesure ~1,5 m)
          "min-camera-orbit": "auto auto 0m",
          "max-camera-orbit": "auto auto 60m",
          "field-of-view": `${cam.fov}deg`,
          "min-field-of-view": `${cam.fov}deg`,
          "max-field-of-view": `${cam.fov}deg`,
          "interpolation-decay": "320",
          class: "chibi-float",
          style: {
            position: "absolute",
            // Taille explicite : le lecteur impose 300 × 150 px par défaut
            top: `${-headroom * 100}%`,
            left: `${-bleed * 100}%`,
            width: `${100 + 2 * bleed * 100}%`,
            height: `${100 + headroom * 100}%`,
            pointerEvents: "none",
            background: "transparent",
            transition: "opacity .25s ease",
            "--float": `${float}px`
          }
        })}
      </div>
    );
  if (!img) return null;
  return <img src={img} alt={alt} className={className} style={style} />;
}

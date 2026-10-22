import { create } from "zustand";
import { MODEL_CAMERA, MODEL_MOTION, MODEL_PLACEMENTS, MODEL_TUNING, type ModelPlacement, type ModelTuning } from "@loltr/content/lite";

// Réglages des modèles 3D : valeurs du code (packages/content/src/chibis.ts), surchargées en direct
// depuis le panneau de test. Les surcharges restent dans ce navigateur ; le panneau donne le code à
// recopier dans chibis.ts pour les rendre définitives pour tout le monde.

const STORAGE = "loltr:model-tuning";

interface Overrides {
  models: Record<string, ModelTuning>;
  placements: Partial<Record<ModelPlacement, ModelTuning>>;
  motion: Partial<typeof MODEL_MOTION>;
  camera: Partial<typeof MODEL_CAMERA>;
}

interface TuningState extends Overrides {
  /** Modèles affichés en ce moment (pour que le panneau propose de les régler). */
  active: { stem: string; placement: ModelPlacement }[];
  setModel: (stem: string, t: ModelTuning) => void;
  setPlacement: (p: ModelPlacement, t: ModelTuning) => void;
  setMotion: (m: Partial<typeof MODEL_MOTION>) => void;
  setCamera: (c: Partial<typeof MODEL_CAMERA>) => void;
  reset: () => void;
  register: (stem: string, placement: ModelPlacement) => () => void;
}

function load(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return { models: {}, placements: {}, motion: {}, camera: {}, ...JSON.parse(raw) };
  } catch {}
  return { models: {}, placements: {}, motion: {}, camera: {} };
}

function save(s: Overrides) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify({ models: s.models, placements: s.placements, motion: s.motion, camera: s.camera }));
  } catch {}
}

export const useModelTuning = create<TuningState>((set, get) => ({
  ...load(),
  active: [],
  setModel: (stem, t) => {
    set({ models: { ...get().models, [stem]: { ...modelTuning(stem), ...t } } });
    save(get());
  },
  setPlacement: (p, t) => {
    set({ placements: { ...get().placements, [p]: { ...placementTuning(p), ...t } } });
    save(get());
  },
  setMotion: (m) => {
    set({ motion: { ...get().motion, ...m } });
    save(get());
  },
  setCamera: (c) => {
    set({ camera: { ...get().camera, ...c } });
    save(get());
  },
  reset: () => {
    set({ models: {}, placements: {}, motion: {}, camera: {} });
    save(get());
  },
  register: (stem, placement) => {
    const entry = { stem, placement };
    set({ active: [...get().active, entry] });
    return () => set({ active: get().active.filter((e) => e !== entry) });
  }
}));

/** Nom du modèle d'après son URL : « /models/lux-sg.glb » → « lux-sg ». */
export const modelStem = (src: string) => src.split("/").pop()?.replace(/\.glb$/i, "") ?? src;

export const modelTuning = (stem: string): ModelTuning => ({ ...MODEL_TUNING[stem], ...useModelTuning.getState().models[stem] });
export const placementTuning = (p: ModelPlacement): ModelTuning => ({ ...MODEL_PLACEMENTS[p], ...useModelTuning.getState().placements[p] });
export const motion = () => ({ ...MODEL_MOTION, ...useModelTuning.getState().motion });
export const camera = () => ({ ...MODEL_CAMERA, ...useModelTuning.getState().camera });

/** Réglage final d'un modèle à un emplacement : les tailles se multiplient, les décalages s'ajoutent. */
export function effectiveTuning(stem: string, placement: ModelPlacement) {
  const m = modelTuning(stem);
  const p = placementTuning(placement);
  return {
    zoom: (m.zoom ?? 1) * (p.zoom ?? 1),
    x: (m.x ?? 0) + (p.x ?? 0),
    y: (m.y ?? 0) + (p.y ?? 0),
    yaw: (m.yaw ?? 0) + (p.yaw ?? 0)
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function clean(t: ModelTuning): ModelTuning {
  const out: ModelTuning = {};
  if (t.zoom !== undefined && round(t.zoom) !== 1) out.zoom = round(t.zoom);
  if (t.x) out.x = round(t.x);
  if (t.y) out.y = round(t.y);
  if (t.yaw) out.yaw = Math.round(t.yaw);
  return out;
}

/** Code à coller dans packages/content/src/chibis.ts (valeurs du code + surcharges). */
export function exportCode(): string {
  const s = useModelTuning.getState();
  const models = Object.fromEntries(
    Object.entries({ ...MODEL_TUNING, ...s.models })
      .map(([k, v]) => [k, clean({ ...MODEL_TUNING[k], ...v })] as const)
      .filter(([, v]) => Object.keys(v).length)
      .sort(([a], [b]) => a.localeCompare(b))
  );
  const placements = Object.fromEntries((["accueil", "profil", "vitrine"] as ModelPlacement[]).map((p) => [p, clean(placementTuning(p))]));
  const fmt = (o: object) => JSON.stringify(o, null, 2).replace(/"(\w+)":/g, "$1:");
  return [
    `export const MODEL_TUNING: Record<string, ModelTuning> = ${fmt(models)};`,
    ``,
    `export const MODEL_PLACEMENTS: Record<ModelPlacement, ModelTuning> = ${fmt(placements)};`,
    ``,
    `export const MODEL_MOTION = ${fmt(motion())};`,
    ``,
    `export const MODEL_CAMERA = ${fmt(camera())};`
  ].join("\n");
}

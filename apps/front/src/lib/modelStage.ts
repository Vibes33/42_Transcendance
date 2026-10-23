import { create } from "zustand";
import type { ModelPlacement } from "@loltr/content/lite";

// Pilotage des modèles 3D affichés : quelle animation est jouée et quelles parties
// sont visibles. Par défaut (aucun pilotage), chaque modèle joue son attente avec la
// liaison automatique animation ↔ parties lue dans le fichier. Le panneau de test
// permet de rejouer une animation avec les bons accessoires, comme modelviewer.lol.

export interface StagePart {
  /** Empreinte du sous-mesh (userData.hash du matériau). */
  hash: number;
  /** Nom lisible (nom du matériau : Body, Tail1, Wink…). */
  name: string;
  /** Visibilité par défaut dans le fichier. */
  visible: boolean;
}

export interface StageEntry {
  id: number;
  stem: string;
  placement: ModelPlacement;
  animations: string[];
  parts: StagePart[];
  /** Animation jouée (identifiant de groupe, voir groupAnimations) ; null = attente automatique. */
  anim: string | null;
  /** Animation réellement en cours (attente résolue), pour l'affichage. */
  playing: string | null;
  paused: boolean;
  /** Enchaîner vers l'attente à la fin d'un groupe (transition à la frontière des clips). */
  autoReturn: boolean;
  /** Liaison automatique parties ↔ animation (cases de la liste). */
  auto: boolean;
  /** Visibilité de chaque partie à l'image 0 de l'animation en cours. */
  base: Record<number, boolean>;
  /** États manuels des cases quand auto est coupé. */
  manual: Record<number, boolean>;
}

interface StageState {
  entries: StageEntry[];
  sel: number | null;
  register(e: { stem: string; placement: ModelPlacement; animations: string[]; parts: StagePart[] }): number;
  update(id: number, e: { animations: string[]; parts: StagePart[] }): void;
  unregister(id: number): void;
  select(id: number | null): void;
  setAnim(id: number, anim: string | null): void;
  setPlaying(id: number, playing: string | null): void;
  setPaused(id: number, paused: boolean): void;
  setAutoReturn(id: number, autoReturn: boolean): void;
  setAuto(id: number, auto: boolean): void;
  setBase(id: number, base: Record<number, boolean>): void;
  setPart(id: number, hash: number, v: boolean): void;
}

let nextId = 1;

const patch = (s: StageState, id: number, p: Partial<StageEntry>): Partial<StageState> => ({
  entries: s.entries.map((e) => (e.id === id ? { ...e, ...p } : e))
});

export const useModelStage = create<StageState>((set, get) => ({
  entries: [],
  sel: null,
  register: (e) => {
    const id = nextId++;
    set((s) => ({ entries: [...s.entries, { ...e, id, anim: null, playing: null, paused: false, auto: true, autoReturn: true, base: {}, manual: {} }], sel: s.sel ?? id }));
    return id;
  },
  update: (id, e) => set((s) => patch(s, id, e)),
  unregister: (id) =>
    set((s) => ({
      entries: s.entries.filter((e) => e.id !== id),
      sel: s.sel === id ? (s.entries.find((e) => e.id !== id)?.id ?? null) : s.sel
    })),
  select: (sel) => set({ sel }),
  setAnim: (id, anim) => set((s) => patch(s, id, { anim, paused: false })),
  setAutoReturn: (id, autoReturn) => set((s) => patch(s, id, { autoReturn })),
  setPlaying: (id, playing) => {
    const e = get().entries.find((x) => x.id === id);
    if (e && e.playing !== playing) set((s) => patch(s, id, { playing }));
  },
  setPaused: (id, paused) => set((s) => patch(s, id, { paused })),
  // En manuel, on part de l'aspect actuel pour ne pas tout éteindre d'un coup.
  setAuto: (id, auto) => {
    const e = get().entries.find((x) => x.id === id);
    set((s) => patch(s, id, auto ? { auto } : { auto, manual: { ...e?.base } }));
  },
  setBase: (id, base) => set((s) => patch(s, id, { base })),
  setPart: (id, hash, v) => {
    const e = get().entries.find((x) => x.id === id);
    if (!e) return;
    set((s) => patch(s, id, { manual: { ...e.manual, [hash]: v } }));
  }
}));

/** Nom d'affichage d'une animation : « PetChibiAhri_base_Taunt.anm » → « Taunt ». */
export function animLabel(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const noExt = base.replace(/\.(anm|anim|fbx)$/i, "");
  const parts = noExt.split(/[_-]+/).filter((p) => !/^(pet|chibi|base|ctrl\d*|sg)$/i.test(p));
  return parts.length ? parts.join(" ") : noExt;
}

/** Un groupe = un enchaînement qui se joue comme une seule animation (intro → boucle → sortie). */
export interface AnimGroup {
  /** Identifiant stable (« dance », « idle », « sg_classroom »…). */
  id: string;
  label: string;
  /** Clips dans l'ordre de lecture. */
  parts: string[];
  /** Index du clip bouclé à la fin (attente : la base, pas l'intro). */
  loopIndex: number;
}

const PHASES = new Set(["in", "intro", "loop", "loops", "cycle", "out", "outro", "winddown", "windup", "base", "idle", "animation"]);

/** Rang d'un clip dans son groupe : intro (0), corps (1), boucle (2), sortie (3). */
function phaseRank(name: string): number {
  const n = name.toLowerCase().replace(/\.(anm|anim|fbx)$/, "");
  if (/_(in|intro)$/.test(n)) return 0;
  if (/_(out|outro|winddown|windup)$/.test(n)) return 3;
  if (/_(loop|loops|cycle)$/.test(n)) return 2;
  return 1;
}

function variantKey(name: string, stem: string): string {
  let s = name.toLowerCase().replace(/\.(anm|anim|fbx)$/, "");
  s = s.replace(/^petchibi[a-z0-9]*_/, "").replace(new RegExp(`^${stem.toLowerCase().replace(/[^a-z0-9]/g, "")}_`), "");
  let tokens = s.split(/[_-]+/).filter(Boolean).map((t) => t.replace(/^ctrl\d*$/, "")).filter(Boolean);
  if (tokens[0] === "base") tokens.shift();
  // Les marqueurs d'état stable ne distinguent pas deux versions (Idle_Base ≈ Base_Idle),
  // contrairement aux phases (Recall ≠ Recall_Winddown, Dance_In ≠ Dance_Loop).
  const steady = new Set(["base", "idle", "loop", "loops", "cycle", "animation"]);
  while (tokens.length > 1 && steady.has(tokens[tokens.length - 1])) tokens.pop();
  if (tokens.length) tokens[tokens.length - 1] = tokens[tokens.length - 1].replace(/\d+$/, "") || tokens[tokens.length - 1];
  return tokens.join("_");
}

/** Clé de regroupement : même famille sans la phase (Dance_In et Dance_Loop → « dance »). */
function groupKey(name: string, stem: string): string {
  let s = name.toLowerCase().replace(/\.(anm|anim|fbx)$/, "");
  s = s.replace(/^petchibi[a-z0-9]*_/, "").replace(new RegExp(`^${stem.toLowerCase().replace(/[^a-z0-9]/g, "")}_`), "");
  let tokens = s.split(/[_-]+/).filter(Boolean);
  // « Base_Ctrl1 » → variante d'attente ; « Base_Laugh » → « laugh » ; « Laugh01 » → « laugh »
  tokens = tokens.map((t) => t.replace(/^ctrl\d*$/, "")).filter(Boolean);
  if (tokens[0] === "base") tokens.shift();
  if (tokens.length && /^\d+$/.test(tokens[tokens.length - 1])) tokens.pop();
  else if (tokens.length) tokens[tokens.length - 1] = tokens[tokens.length - 1].replace(/\d+$/, "") || tokens[tokens.length - 1];
  while (tokens.length > 1 && PHASES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("_") || "idle";
}

/** Libellé d'un groupe : « sg_classroom » → « Sg Classroom ». */
export function groupLabel(id: string): string {
  return id
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Regroupe les clips multipart en une seule animation jouable : Dance_In + Dance_Loop,
 * Recall + Recall_Winddown… En revanche, deux versions d'un même passage (doublons
 * PetChibi*, variantes Laugh01/02) ne sont pas enchaînées : seule la première est gardée.
 */
export function groupAnimations(names: string[], stem: string): AnimGroup[] {
  const order = new Map<string, number>();
  names.forEach((n, i) => {
    if (!order.has(n)) order.set(n, i);
  });
  const byId = new Map<string, string[]>();
  for (const n of names) {
    const id = groupKey(n, stem);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push(n);
  }
  const groups: AnimGroup[] = [];
  for (const [id, parts] of byId) {
    const ranked = parts.map((p) => ({ p, rank: phaseRank(p), at: order.get(p) ?? 0 })).sort((a, b) => a.rank - b.rank || a.at - b.at);
    // Une seule version par passage et par phase : Cast_Animation + Cast_Cycle s'enchaînent
    // (intro + boucle), mais pas Dance_Loop + son doublon PetChibi*.
    const seen = new Set<string>();
    const kept = ranked.filter((r) => {
      const k = r.rank + "|" + variantKey(r.p, stem);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const loopIndex = Math.max(0, kept.findIndex((r) => r.rank >= 1));
    groups.push({ id, label: groupLabel(id), parts: kept.map((r) => r.p), loopIndex });
  }
  groups.sort((a, b) => {
    const ao = a.id === "idle" ? -1 : order.get(a.parts[0]) ?? 0;
    const bo = b.id === "idle" ? -1 : order.get(b.parts[0]) ?? 0;
    return ao - bo;
  });
  return groups;
}

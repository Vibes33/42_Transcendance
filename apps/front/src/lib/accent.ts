import { useEffect, useState } from "react";
import type { ChibiSkin } from "@loltr/content/lite";
import TABLE from "./skinAccents.json";

// Couleur dominante d'un skin, pour que le skin équipé colore le site. Calculée sur l'image détourée
// (sinon l'illustration) : on garde la teinte la plus présente parmi les pixels colorés, puis on en
// dérive un accent clair pour le mode sombre et un accent foncé pour le mode clair.
// skinAccents.json sert de cache pour les skins connus ; un nouveau skin est calculé à la volée.

export type AccentPair = [string, string];

const cache = new Map<string, AccentPair>(Object.entries(TABLE as unknown as Record<string, AccentPair>));

function hsl(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/** Teinte dominante (pixels opaques, assez saturés, ni trop sombres ni trop clairs). */
export function dominantAccent(img: HTMLImageElement): AccentPair | null {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) return null;
  x.drawImage(img, 0, 0, size, size);
  const d = x.getImageData(0, 0, size, size).data;
  const buckets = Array.from({ length: 36 }, () => ({ w: 0, hx: 0, hy: 0, s: 0 }));
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const r = d[i] / 255;
    const g = d[i + 1] / 255;
    const b = d[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const delta = max - min;
    if (delta < 0.12 || l < 0.15 || l > 0.92) continue;
    const s = delta / (1 - Math.abs(2 * l - 1));
    if (s < 0.3) continue;
    let h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
    const w = s * delta;
    const bk = buckets[Math.floor(h / 10) % 36];
    bk.w += w;
    bk.hx += Math.cos((h * Math.PI) / 180) * w;
    bk.hy += Math.sin((h * Math.PI) / 180) * w;
    bk.s += s * w;
  }
  // Fenêtre de 3 tranches voisines (30°) la plus chargée
  let best = -1;
  let bestW = 0;
  for (let i = 0; i < 36; i++) {
    const w = buckets[i].w + buckets[(i + 1) % 36].w + buckets[(i + 35) % 36].w;
    if (w > bestW) {
      bestW = w;
      best = i;
    }
  }
  if (best < 0 || bestW === 0) return null;
  const win = [buckets[(best + 35) % 36], buckets[best], buckets[(best + 1) % 36]];
  const w = win.reduce((a, b) => a + b.w, 0);
  const hue = ((Math.atan2(win.reduce((a, b) => a + b.hy, 0), win.reduce((a, b) => a + b.hx, 0)) * 180) / Math.PI + 360) % 360;
  const sat = Math.round((win.reduce((a, b) => a + b.s, 0) / w) * 100);
  return [hsl(hue, Math.min(95, Math.max(78, sat)), 72), hsl(hue, Math.min(85, Math.max(68, sat)), 36)];
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Accent d'un skin (null pour un skin classique : le chibi garde ses couleurs). */
export function useSkinAccent(skin: ChibiSkin | null | undefined): AccentPair | null {
  const id = skin && skin.kind !== "base" ? skin.id : null;
  const [pair, setPair] = useState<AccentPair | null>(id ? (cache.get(id) ?? null) : null);
  useEffect(() => {
    if (!id || !skin) return setPair(null);
    const hit = cache.get(id);
    if (hit) return setPair(hit);
    let alive = true;
    load(skin.cut ?? skin.art)
      .then((img) => {
        const p = dominantAccent(img);
        if (p) cache.set(id, p);
        if (alive) setPair(p);
      })
      .catch(() => alive && setPair(null));
    return () => {
      alive = false;
    };
  }, [id]);
  return pair;
}

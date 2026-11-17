// Carte des zones praticables de la Faille, tirée de l'image de la carte (apps/front/public/mayhem/rift.png) :
// les murs et le hors-carte sont sombres. Écrit packages/content/src/riftWalk.ts (grille 200 × 200,
// 1 bit par case de 0,5 % de la carte), qu'utilisent les déplacements de World Mayhem.
// Utilise `sips` (macOS) pour réduire l'image.
//
//   bun run scripts/rift-walk.ts

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const N = 200;
const dir = mkdtempSync(join(tmpdir(), "rift-"));
const bmp = join(dir, "rift.bmp");
Bun.spawnSync(["sips", "-z", String(N), String(N), "-s", "format", "bmp", "apps/front/public/mayhem/rift.png", "--out", bmp]);
const buf = await Bun.file(bmp).arrayBuffer();
rmSync(dir, { recursive: true });

const d = new DataView(buf);
const off = d.getUint32(10, true);
const w = d.getInt32(18, true);
const h = d.getInt32(22, true);
if (w !== N || Math.abs(h) !== N || d.getUint16(28, true) !== 32) throw new Error("BMP inattendu");
const bits = new Uint8Array((N * N) / 8);
let open = 0;
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    // BMP de haut en bas si la hauteur est négative ; pixels B, G, R, A
    const row = h < 0 ? y : N - 1 - y;
    const o = off + (row * N + x) * 4;
    const lum = 0.3 * d.getUint8(o + 2) + 0.59 * d.getUint8(o + 1) + 0.11 * d.getUint8(o);
    if (d.getUint8(o + 3) < 128 || lum < 55) continue;
    const k = y * N + x;
    bits[k >> 3] |= 1 << (k & 7);
    open++;
  }

const b64 = Buffer.from(bits).toString("base64");
await Bun.write(
  "packages/content/src/riftWalk.ts",
  `// Généré par scripts/rift-walk.ts : cases praticables de la Faille (${N} × ${N}, 1 bit par case, ligne par ligne).\nexport const RIFT_WALK_SIZE = ${N};\nexport const RIFT_WALK = "${b64}";\n`
);
console.log(`${open} cases praticables sur ${N * N} (${((100 * open) / (N * N)).toFixed(1)} %)`);

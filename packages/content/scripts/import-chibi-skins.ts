// Importe tous les skins des chibis depuis modelviewer.lol (la source des modèles 3D, voir download_chibi.py) :
// noms FR/EN, illustration (vignette officielle 400 × 300) et modèle 3D de chaque skin.
// Les skins déjà connus gardent leur identifiant, leurs noms, leurs images et leur prix.
//
// Usage (depuis la racine du dépôt) :
//   bun run packages/content/scripts/import-chibi-skins.ts             # catalogue seulement
//   bun run packages/content/scripts/import-chibi-skins.ts --download  # + images et modèles manquants
//   bun run packages/content/scripts/import-chibi-skins.ts --refresh   # + retélécharge tous les modèles
// Les modèles sont gardés tels quels : le lecteur du site applique lui-même les parties visibles de chaque
// animation (extras des fichiers), comme modelviewer.lol. Ne pas les passer dans strip_chibi_parts.py.
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHIBI_DATA } from "../src/chibis.data";
import { LITE_BY_ID } from "../src/lite";

const ROOT = join(import.meta.dir, "../../..");
const IMG_DIR = join(ROOT, "apps/front/public/img/chibis");
const MODELS_DIR = join(ROOT, "apps/front/public/models");
const SITE = "https://modelviewer.lol";
const CDN = "https://cdn.modelviewer.lol";
const UA = { "User-Agent": "Mozilla/5.0 (loltr-import)" };
const refresh = process.argv.includes("--refresh");
const download = refresh || process.argv.includes("--download");

type Skin = (typeof CHIBI_DATA)[number]["skins"][number] & { mv?: number; model?: string | null };

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** Skins listés sur la page du tacticien : [identifiant, nom] dans l'ordre (le premier est le skin de base). */
async function listing(key: string, lang: "fr" | "en"): Promise<[number, string][]> {
  const url = `${SITE}/tacticians/petchibi${key}${lang === "fr" ? "?lang=fr-FR" : ""}`;
  const html = await (await fetch(url, { headers: UA })).text();
  const re = new RegExp(`model-viewer\\?group=tft&amp;id=(\\d+)${lang === "fr" ? "&amp;lang=fr-FR" : ""}"[^>]*>([\\s\\S]*?)</a>`, "g");
  return [...html.matchAll(re)].map((m) => [Number(m[1]), decode(m[2])]);
}

/** « Lux gardienne des étoiles chibi » → « Gardienne des étoiles » ; « Chibi Star Guardian Lux » → « Star Guardian ». */
function cleanName(raw: string, champion: string): string {
  let s = raw.replace(/\bchibi\b/gi, " ");
  s = s.replace(new RegExp(champion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Corrections de noms mal saisis sur la source (clé « chibi-identifiant source »). */
const NAME_FIXES: Record<string, { fr?: string; en?: string; id?: string }> = {
  "blitzcrank-87003": { fr: "iBlitzcrank", en: "iBlitzcrank", id: "iblitzcrank" },
  "vex-151002": { fr: "Café Chouchous" },
  "zeri-159002": { fr: "PsyOps" },
  "zed-56002": { fr: "PROJET", en: "PROJECT" }
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

async function save(url: string, dest: string, force = false): Promise<boolean> {
  if (!force && existsSync(dest) && statSync(dest).size > 0) return true;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(String(res.status));
      await Bun.write(dest, await res.arrayBuffer());
      return true;
    } catch (e) {
      console.error(`  nouvel essai ${url} : ${(e as Error).message}`);
      await Bun.sleep(800 * (i + 1));
    }
  }
  return false;
}

const added: string[] = [];
const unmatched: string[] = [];
const out: { key: string; skins: Skin[] }[] = [];

for (const chibi of CHIBI_DATA) {
  const champ = LITE_BY_ID[chibi.key];
  const [fr, en] = await Promise.all([listing(chibi.key, "fr"), listing(chibi.key, "en")]);
  const enById = new Map(en);
  const known = [...chibi.skins] as Skin[];
  const skins: Skin[] = [];
  fr.forEach(([mv, frRaw], i) => {
    const enName = cleanName(enById.get(mv) ?? frRaw, champ?.names.en ?? chibi.key);
    const frName = cleanName(frRaw, champ?.names.fr ?? chibi.key);
    const prestige = /prestige/i.test(frRaw + " " + (enById.get(mv) ?? ""));
    // Skin déjà connu : le skin de base ; sinon même nom anglais (sans « prestige »), puis un nom qui
    // contient l'autre, puis le premier skin restant du même type (les noms de la maquette diffèrent parfois)
    const kind = prestige ? "prestige" : "normal";
    const bare = (s: string) => norm(s).replace("prestige", "");
    const pool = known.filter((k) => k.kind !== "base");
    const match =
      i === 0
        ? known.find((k) => k.kind === "base")
        : (pool.find((k) => k.kind === kind && bare(k.name.en) === bare(enName)) ??
          pool.find((k) => k.kind === kind && (bare(k.name.en).includes(bare(enName)) || bare(enName).includes(bare(k.name.en)))) ??
          pool.find((k) => k.kind === kind) ??
          // La boutique peut classer en prestige un skin que la source ne marque pas : on garde notre type
          pool.find((k) => bare(k.name.en) === bare(enName)));
    if (match) {
      skins.push({ ...match, mv });
      known.splice(known.indexOf(match), 1);
      return;
    }
    const fix = NAME_FIXES[`${chibi.key}-${mv}`] ?? {};
    let id = fix.id ?? (norm(fix.en ?? enName) || String(mv));
    while (skins.some((s) => s.id === id) || known.some((s) => s.id === id)) id += "2";
    skins.push({ id, name: { fr: fix.fr ?? frName, en: fix.en ?? enName }, kind: prestige ? "prestige" : "normal", art: `${chibi.key}-${id}.webp`, cut: null, mv });
    added.push(`${chibi.key}-${id}`);
  });
  // Skins de la maquette introuvables sur la source : on les garde tels quels (sans modèle)
  for (const k of known) {
    unmatched.push(`${chibi.key}-${k.id} (${k.name.en})`);
    skins.push(k);
  }
  out.push({ key: chibi.key, skins });
}

if (download) {
  const jobs: (() => Promise<void>)[] = [];
  for (const c of out)
    for (const s of c.skins) {
      if (!s.mv) continue;
      const art = join(IMG_DIR, s.art);
      if (!existsSync(art)) jobs.push(async () => void (await save(`${CDN}/tft/tiles/${s.mv}.webp`, art)));
      const file = s.kind === "base" ? `${c.key}.glb` : `${c.key}-${s.id}.glb`;
      jobs.push(async () => {
        const ok = await save(`${CDN}/tft/models/petchibi${c.key}/${s.mv}/model.glb`, join(MODELS_DIR, file), refresh);
        console.log(`${ok ? "  OK" : "  ÉCHEC"} ${file}`);
      });
    }
  // 6 téléchargements à la fois
  const queue = [...jobs];
  await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await queue.shift()!(); }));
}

// Modèle 3D de chaque skin, s'il est présent dans public/models
for (const c of out)
  for (const s of c.skins) {
    const file = s.kind === "base" ? `${c.key}.glb` : `${c.key}-${s.id}.glb`;
    s.model = existsSync(join(MODELS_DIR, file)) ? `/models/${file}` : null;
  }

const lines = out.map((c) => "  " + JSON.stringify({ key: c.key, skins: c.skins }).replace(/","/g, '", "').replace(/":/g, '": '));
writeFileSync(
  join(import.meta.dir, "../src/chibis.data.ts"),
  `// Généré par packages/content/scripts/import-chibi-skins.ts : les 47 chibis TFT et tous leurs skins
// (images dans apps/front/public/img/chibis, modèles 3D dans apps/front/public/models).
import type { ChibiSkinKind } from "./chibis";

export const CHIBI_DATA: {
  key: string;
  skins: { id: string; name: { fr: string; en: string }; kind: ChibiSkinKind; price?: number; art: string; cut: string | null; mv?: number; model?: string | null }[];
}[] = [
${lines.join(",\n")}
];
`
);

const total = out.reduce((n, c) => n + c.skins.length, 0);
console.log(`${out.length} chibis, ${total} skins (${added.length} ajoutés)`);
if (unmatched.length) console.log("Skins de la maquette sans équivalent sur la source :", unmatched.join(", "));
console.log(`Modèles 3D présents : ${out.reduce((n, c) => n + c.skins.filter((s) => s.model).length, 0)} / ${total}`);

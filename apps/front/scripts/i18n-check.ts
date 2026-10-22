// Liste les textes français de l'interface qui n'ont pas encore de traduction anglaise (src/i18n/en.ts).
// Textes repérés : appels t("…") et chaînes des catalogues (jeux, tutoriels, raisons de connexion…).
import { Glob } from "bun";
import { EN } from "../src/i18n/en";

const found = new Set<string>();
const callRe = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
// Fichiers dont les chaînes sont traduites plus tard via t(variable)
const CATALOGS = ["src/lib/games.ts", "src/games/index.ts", "src/components/Tutorial.tsx", "src/components/LoginDialog.tsx", "src/pages/Onboarding.tsx", "src/lib/ranks.ts", "src/games/ChampionDuJour.tsx", "src/pages/Profil.tsx", "src/pages/Parametres.tsx", "src/pages/Classement.tsx", "src/pages/Boutique.tsx", "src/api/client.ts"];
// Dans les catalogues : valeurs « clé: "texte" » et tableaux de textes ["…", "…"]
const propRe = /\b[a-zA-Z_]+:\s*"([^"\n]+)"/g;
const arrRe = /\[\s*"([^"\n]+)"\s*,\s*"([^"\n]+)"(?:\s*,\s*"([^"\n]+)")?\s*\]/g;
const isText = (s: string) => /[ \u00C0-\u017F’]/.test(s) && !/var\(|color-mix|px|rgba|^\/|https?:|cubic|translate|scale|blur|ease|%/.test(s);

for await (const file of new Glob("src/**/*.{ts,tsx}").scan(".")) {
  if (file.endsWith("en.ts")) continue;
  const src = await Bun.file(file).text();
  for (const m of src.matchAll(callRe)) found.add(JSON.parse(`"${m[1]}"`));
  if (CATALOGS.includes(file)) {
    for (const m of src.matchAll(propRe)) if (isText(m[1])) found.add(m[1]);
    for (const m of src.matchAll(arrRe)) for (const x of m.slice(1)) if (x && isText(x)) found.add(x);
  }
}
for (const n of ["jour", "jours", "essai", "essais", "skin", "skins", "skin à collectionner", "skins à collectionner"]) found.add("{n} " + n);

const missing = [...found].filter((s) => !(s in EN)).sort();
if (process.argv.includes("--json")) console.log(JSON.stringify(missing, null, 1));
else {
  for (const s of missing) console.log(s);
  console.log(`\n${missing.length} texte(s) sans traduction sur ${found.size}.`);
}

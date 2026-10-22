// Importe les champions, sorts et skins depuis Data Dragon (Riot) dans data/champions.generated.json.
// À relancer à chaque patch : bun run content:import
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://ddragon.leagueoflegends.com";
const LANGS = { fr: "fr_FR", en: "en_US" } as const;

const versions: string[] = await (await fetch(`${BASE}/api/versions.json`)).json();
const version = versions[0];
console.log("Data Dragon", version);

type DD = { data: Record<string, any> };
const full: Record<string, DD> = {};
for (const [k, l] of Object.entries(LANGS)) {
  full[k] = await (await fetch(`${BASE}/cdn/${version}/data/${l}/championFull.json`)).json();
}

const SLOTS = ["Q", "W", "E", "R"];
const champions = Object.keys(full.en.data)
  .sort()
  .map((id) => {
    const en = full.en.data[id];
    const fr = full.fr.data[id];
    return {
      id,
      slug: id.toLowerCase(),
      key: Number(en.key),
      names: { fr: fr.name, en: en.name },
      titles: { fr: fr.title, en: en.title },
      tags: en.tags,
      partype: en.partype,
      spells: [
        { slot: "P", names: { fr: fr.passive.name, en: en.passive.name }, image: "passive/" + en.passive.image.full },
        ...en.spells.map((s: any, i: number) => ({ slot: SLOTS[i], names: { fr: fr.spells[i].name, en: s.name }, image: "spell/" + s.image.full }))
      ],
      skins: en.skins.map((s: any, i: number) => ({
        num: s.num,
        names: { fr: s.num === 0 ? fr.name : fr.skins[i]?.name ?? s.name, en: s.num === 0 ? en.name : s.name }
      }))
    };
  });

// Les skins les plus récents n'ont parfois pas encore de splash sur Data Dragon : on les écarte,
// sinon Splash mystère pourrait tirer une image introuvable.
const SPLASH = (id: string, num: number) => `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_${num}.jpg`;
const checks = champions.flatMap((c) => c.skins.map((s: { num: number }) => ({ c, s })));
const missing = new Set<string>();
for (let i = 0; i < checks.length; i += 24) {
  await Promise.all(
    checks.slice(i, i + 24).map(async ({ c, s }) => {
      const res = await fetch(SPLASH(c.id, s.num), { method: "HEAD" }).catch(() => null);
      if (!res?.ok) missing.add(c.id + ":" + s.num);
    })
  );
}
for (const c of champions) c.skins = c.skins.filter((s: { num: number }) => s.num === 0 || !missing.has(c.id + ":" + s.num));
console.log(missing.size, "skins sans splash écartés");

// Portée d'attaque > 300 : champion à distance
const ranged = Object.values(full.en.data).filter((c: any) => c.stats.attackrange > 300).map((c: any) => c.id.toLowerCase()).sort();
writeFileSync(join(import.meta.dir, "../data/ranges.generated.json"), JSON.stringify({ ranged }, null, 1));

writeFileSync(join(import.meta.dir, "../data/champions.generated.json"), JSON.stringify({ version, champions }, null, 1));
console.log(champions.length, "champions écrits");

// Importe les objets de la Faille de l'invocateur depuis Data Dragon (Riot) pour Build Path :
// objets finaux et leurs composants directs. À relancer à chaque patch : bun run content:items
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://ddragon.leagueoflegends.com";
const versions: string[] = await (await fetch(`${BASE}/api/versions.json`)).json();
const version = versions[0];
console.log("Data Dragon", version);

type Item = { name: string; gold: { total: number; purchasable: boolean }; from?: string[]; into?: string[]; maps: Record<string, boolean>; image: { full: string }; requiredChampion?: string; requiredAlly?: string; inStore?: boolean; tags?: string[] };
const fr: Record<string, Item> = (await (await fetch(`${BASE}/cdn/${version}/data/fr_FR/item.json`)).json()).data;
const en: Record<string, Item> = (await (await fetch(`${BASE}/cdn/${version}/data/en_US/item.json`)).json()).data;

// Objets en boutique sur la Faille (carte 11), achetables, hors objets réservés à un champion
const store = (id: string) => {
  const it = en[id];
  return !!it && it.maps["11"] && it.gold.purchasable && it.inStore !== false && !it.requiredChampion && !it.requiredAlly && Number(id) < 10000;
};
// Objets finaux : au moins 2 composants, aucun objet au-dessus, au moins 2 200 PO
const finals = Object.keys(en).filter((id) => store(id) && (en[id].from?.length ?? 0) >= 2 && !(en[id].into?.length) && en[id].gold.total >= 2200 && en[id].from!.every(store));
// Noms en double (variantes d'un même objet) : on garde le premier identifiant
const seenName = new Set<string>();
const keep = finals.sort((a, b) => Number(a) - Number(b)).filter((id) => (seenName.has(en[id].name) ? false : (seenName.add(en[id].name), true)));
const components = new Set(keep.flatMap((id) => en[id].from!));
// Sous-composants des composants intermédiaires (Phage : Épée longue + Cristal de rubis…)
const subs = new Set([...components].flatMap((id) => en[id].from ?? []));
const ids = [...new Set([...keep, ...components, ...subs, ...Object.keys(en).filter((id) => store(id) && !en[id].from?.length && en[id].gold.total >= 300)])];

const items = ids
  .sort((a, b) => Number(a) - Number(b))
  .map((id) => ({ id, names: { fr: fr[id]?.name ?? en[id].name, en: en[id].name }, gold: en[id].gold.total, from: keep.includes(id) || components.has(id) ? (en[id].from ?? []).filter((c) => !!en[c]) : [], basic: !en[id].from?.length, image: en[id].image.full }));

writeFileSync(join(import.meta.dir, "../data/items.generated.json"), JSON.stringify({ version, finals: keep, items }, null, 1));
console.log(keep.length, "objets finaux,", items.length, "objets écrits");

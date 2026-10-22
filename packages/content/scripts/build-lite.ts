// Version allégée des champions pour le navigateur (le fichier complet pèse plus d'un mégaoctet) :
// noms, titres, noms des sorts et attributs du Champion du jour. Lancé par `bun run content:import`.
import { CHAMPIONS, DDRAGON_VERSION } from "../src/champions";

const lite = {
  version: DDRAGON_VERSION,
  champions: CHAMPIONS.map((c) => ({
    id: c.id,
    ddId: c.ddId,
    names: c.names,
    titles: c.titles,
    spells: c.spells.map((s) => ({ slot: s.slot, names: s.names, image: s.image })),
    attributes: c.attributes,
    matchNames: c.matchNames
  }))
};
await Bun.write(new URL("../data/champions.lite.json", import.meta.url), JSON.stringify(lite));
console.log(`champions.lite.json : ${lite.champions.length} champions`);

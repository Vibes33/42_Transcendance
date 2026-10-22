// Liste les champions Data Dragon sans attributs Champion du jour (à compléter dans src/attributes.ts).
import { CHAMPIONS } from "../src/champions";
const missing = CHAMPIONS.filter((c) => !c.attributes).map((c) => c.id);
console.log(missing.length ? "À compléter : " + missing.join(", ") : "Tous les champions sont complétés.");

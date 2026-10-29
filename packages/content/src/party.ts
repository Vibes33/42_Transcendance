import type { Lang } from "./champions";

// Contenus écrits à la main pour les jeux de groupe et le QCM : mots de Runeterra (Codenames),
// mots à faire deviner avec leurs mots interdits (Fais-moi deviner), questions d'esport (QCM).

type T = Record<Lang, string>;
const w = (fr: string, en: string): T => ({ fr, en });

/** Mots de la grille de Codenames de la Faille (25 tirés par partie). */
export const CODENAMES_WORDS: T[] = [
  w("Demacia", "Demacia"), w("Noxus", "Noxus"), w("Ionia", "Ionia"), w("Zaun", "Zaun"), w("Piltover", "Piltover"),
  w("Shurima", "Shurima"), w("Freljord", "Freljord"), w("Targon", "Targon"), w("Bilgewater", "Bilgewater"), w("Néant", "Void"),
  w("Bandle", "Bandle"), w("Ixtal", "Ixtal"), w("Baron", "Baron"), w("Dragon", "Dragon"), w("Héraut", "Herald"),
  w("Tourelle", "Turret"), w("Inhibiteur", "Inhibitor"), w("Nexus", "Nexus"), w("Sbire", "Minion"), w("Balise", "Ward"),
  w("Buisson", "Brush"), w("Rivière", "River"), w("Jungle", "Jungle"), w("Fontaine", "Fountain"), w("Poro", "Poro"),
  w("Hextech", "Hextech"), w("Brume", "Mist"), w("Arcane", "Arcane"), w("Poudre", "Powder"), w("Rune", "Rune"),
  w("Flash", "Flash"), w("Téléportation", "Teleport"), w("Châtiment", "Smite"), w("Embrasement", "Ignite"), w("Pentakill", "Pentakill"),
  w("Gank", "Gank"), w("Lane", "Lane"), w("Couronne", "Crown"), w("Lune", "Moon"), w("Soleil", "Sun"),
  w("Étoile", "Star"), w("Ombre", "Shadow"), w("Lame", "Blade"), w("Arc", "Bow"), w("Bouclier", "Shield"),
  w("Potion", "Potion"), w("Or", "Gold"), w("Glace", "Ice"), w("Sang", "Blood"), w("Renard", "Fox"),
  w("Chat", "Cat"), w("Ours", "Bear"), w("Requin", "Shark"), w("Faucon", "Hawk"), w("Démon", "Demon"),
  w("Ange", "Angel"), w("Horloge", "Clock"), w("Bombe", "Bomb"), w("Tempête", "Storm"), w("Roi", "King"),
  w("Reine", "Queen"), w("Pirate", "Pirate"), w("Ninja", "Ninja"), w("Robot", "Robot"), w("Champignon", "Mushroom")
];

/** Fais-moi deviner : mot à faire trouver et mots interdits, dans chaque langue. */
export const DEVINE_WORDS: Record<Lang, { word: string; banned: string[] }>[] = [
  { fr: { word: "Baron Nashor", banned: ["Baron", "Nashor", "Fosse", "Violet", "Buff"] }, en: { word: "Baron Nashor", banned: ["Baron", "Nashor", "Pit", "Purple", "Buff"] } },
  { fr: { word: "Dragon ancestral", banned: ["Dragon", "Ancestral", "Ancien", "Exécution", "Fosse"] }, en: { word: "Elder Dragon", banned: ["Dragon", "Elder", "Old", "Execute", "Pit"] } },
  { fr: { word: "Pentakill", banned: ["Penta", "Cinq", "Kill", "Tuer", "Équipe"] }, en: { word: "Pentakill", banned: ["Penta", "Five", "Kill", "Team", "Ace"] } },
  { fr: { word: "Balise de contrôle", banned: ["Balise", "Contrôle", "Ward", "Vision", "Rose"] }, en: { word: "Control Ward", banned: ["Ward", "Control", "Pink", "Vision", "Place"] } },
  { fr: { word: "Faker", banned: ["T1", "Corée", "Mid", "Démon", "Worlds"] }, en: { word: "Faker", banned: ["T1", "Korea", "Mid", "Demon", "Worlds"] } },
  { fr: { word: "Poro", banned: ["Freljord", "Blanc", "Mignon", "Biscuit", "Abîme"] }, en: { word: "Poro", banned: ["Freljord", "White", "Cute", "Snack", "Abyss"] } },
  { fr: { word: "Flash", banned: ["Sort", "Invocateur", "Téléporter", "Éclair", "F"] }, en: { word: "Flash", banned: ["Summoner", "Spell", "Teleport", "Blink", "F"] } },
  { fr: { word: "Tourelle", banned: ["Tour", "Détruire", "Sbire", "Plaque", "Lane"] }, en: { word: "Turret", banned: ["Tower", "Destroy", "Minion", "Plate", "Lane"] } },
  { fr: { word: "Nexus", banned: ["Base", "Détruire", "Victoire", "Cristal", "Fin"] }, en: { word: "Nexus", banned: ["Base", "Destroy", "Victory", "Crystal", "End"] } },
  { fr: { word: "Jinx", banned: ["Arcane", "Zaun", "Vi", "Roquette", "Bleu"] }, en: { word: "Jinx", banned: ["Arcane", "Zaun", "Vi", "Rocket", "Blue"] } },
  { fr: { word: "Teemo", banned: ["Champignon", "Yordle", "Bandle", "Scout", "Cécité"] }, en: { word: "Teemo", banned: ["Mushroom", "Yordle", "Bandle", "Scout", "Blind"] } },
  { fr: { word: "Gank", banned: ["Jungle", "Jungler", "Lane", "Surprise", "Attaquer"] }, en: { word: "Gank", banned: ["Jungle", "Jungler", "Lane", "Surprise", "Attack"] } },
  { fr: { word: "Buisson", banned: ["Herbe", "Cacher", "Vision", "Embuscade", "Vert"] }, en: { word: "Brush", banned: ["Bush", "Grass", "Hide", "Vision", "Ambush"] } },
  { fr: { word: "Héraut de la Faille", banned: ["Héraut", "Faille", "Œil", "Tour", "Monstre"] }, en: { word: "Rift Herald", banned: ["Herald", "Rift", "Eye", "Tower", "Monster"] } },
  { fr: { word: "Worlds", banned: ["Championnat", "Monde", "Coupe", "Esport", "Finale"] }, en: { word: "Worlds", banned: ["Championship", "World", "Cup", "Esports", "Final"] } },
  { fr: { word: "Lame d'infini", banned: ["Lame", "Infini", "Critique", "Épée", "Objet"] }, en: { word: "Infinity Edge", banned: ["Edge", "Infinity", "Critical", "Sword", "Item"] } },
  { fr: { word: "Sablier de Zhonya", banned: ["Sablier", "Zhonya", "Or", "Stase", "Temps"] }, en: { word: "Zhonya's Hourglass", banned: ["Hourglass", "Zhonya", "Gold", "Stasis", "Time"] } },
  { fr: { word: "Sbire", banned: ["Vague", "Farm", "Lane", "Or", "Creep"] }, en: { word: "Minion", banned: ["Wave", "Farm", "Lane", "Gold", "Creep"] } },
  { fr: { word: "Yasuo", banned: ["Vent", "Mur", "Ionia", "Yone", "Épée"] }, en: { word: "Yasuo", banned: ["Wind", "Wall", "Ionia", "Yone", "Sword"] } },
  { fr: { word: "Ahri", banned: ["Renard", "Queues", "Charme", "Ionia", "Vastaya"] }, en: { word: "Ahri", banned: ["Fox", "Tails", "Charm", "Ionia", "Vastaya"] } },
  { fr: { word: "Rappel", banned: ["Base", "Retour", "B", "Fontaine", "Téléporter"] }, en: { word: "Recall", banned: ["Base", "Back", "B", "Fountain", "Teleport"] } },
  { fr: { word: "Châtiment", banned: ["Jungle", "Sort", "Monstre", "Voler", "Smite"] }, en: { word: "Smite", banned: ["Jungle", "Spell", "Monster", "Steal", "Summoner"] } },
  { fr: { word: "Arcane", banned: ["Série", "Netflix", "Vi", "Jinx", "Animation"] }, en: { word: "Arcane", banned: ["Series", "Netflix", "Vi", "Jinx", "Animation"] } },
  { fr: { word: "Piltover", banned: ["Ville", "Progrès", "Caitlyn", "Hextech", "Zaun"] }, en: { word: "Piltover", banned: ["City", "Progress", "Caitlyn", "Hextech", "Zaun"] } },
  { fr: { word: "Carapateur", banned: ["Crabe", "Rivière", "Vision", "Jungle", "Faille"] }, en: { word: "Rift Scuttler", banned: ["Crab", "River", "Vision", "Jungle", "Scuttle"] } },
  { fr: { word: "Inhibiteur", banned: ["Super", "Sbire", "Base", "Détruire", "Réapparaît"] }, en: { word: "Inhibitor", banned: ["Super", "Minion", "Base", "Destroy", "Respawn"] } },
  { fr: { word: "Abandon", banned: ["Surrender", "FF", "Vote", "Quinze", "Perdre"] }, en: { word: "Surrender", banned: ["Give up", "FF", "Vote", "Fifteen", "Lose"] } },
  { fr: { word: "Thresh", banned: ["Lanterne", "Crochet", "Support", "Îles obscures", "Âmes"] }, en: { word: "Thresh", banned: ["Lantern", "Hook", "Support", "Shadow Isles", "Souls"] } },
  { fr: { word: "Bouclier", banned: ["Protéger", "Absorber", "Dégâts", "Support", "Barrière"] }, en: { word: "Shield", banned: ["Protect", "Absorb", "Damage", "Support", "Barrier"] } },
  { fr: { word: "Lee Sin", banned: ["Moine", "Aveugle", "Coup de pied", "Jungle", "Insec"] }, en: { word: "Lee Sin", banned: ["Monk", "Blind", "Kick", "Jungle", "Insec"] } }
];

/** Questions d'esport du QCM : la bonne réponse est la première, l'ordre est mélangé à l'affichage. */
export const QCM_ESPORT: { q: T; answers: T[] }[] = [
  { q: w("Quelle équipe a remporté les Worlds 2023 ?", "Which team won Worlds 2023?"), answers: [w("T1", "T1"), w("Weibo Gaming", "Weibo Gaming"), w("JD Gaming", "JD Gaming"), w("Bilibili Gaming", "Bilibili Gaming")] },
  { q: w("Quelle équipe a remporté les Worlds 2022 ?", "Which team won Worlds 2022?"), answers: [w("DRX", "DRX"), w("T1", "T1"), w("Gen.G", "Gen.G"), w("JD Gaming", "JD Gaming")] },
  { q: w("Quelle équipe a remporté les Worlds 2021 ?", "Which team won Worlds 2021?"), answers: [w("EDward Gaming", "EDward Gaming"), w("DWG KIA", "DWG KIA"), w("T1", "T1"), w("Gen.G", "Gen.G")] },
  { q: w("Quelle équipe a remporté les Worlds 2020 ?", "Which team won Worlds 2020?"), answers: [w("DAMWON Gaming", "DAMWON Gaming"), w("Suning", "Suning"), w("G2 Esports", "G2 Esports"), w("Top Esports", "Top Esports")] },
  { q: w("Quelle équipe a remporté les Worlds 2019 ?", "Which team won Worlds 2019?"), answers: [w("FunPlus Phoenix", "FunPlus Phoenix"), w("G2 Esports", "G2 Esports"), w("SK Telecom T1", "SK Telecom T1"), w("Invictus Gaming", "Invictus Gaming")] },
  { q: w("Quelle équipe a remporté les Worlds 2018 ?", "Which team won Worlds 2018?"), answers: [w("Invictus Gaming", "Invictus Gaming"), w("Fnatic", "Fnatic"), w("Cloud9", "Cloud9"), w("Gen.G", "Gen.G")] },
  { q: w("Quelle équipe a remporté les tout premiers Worlds, en 2011 ?", "Which team won the very first Worlds, in 2011?"), answers: [w("Fnatic", "Fnatic"), w("Against All Authority", "Against All Authority"), w("Team SoloMid", "Team SoloMid"), w("Counter Logic Gaming", "Counter Logic Gaming")] },
  { q: w("Quelle équipe a remporté les Worlds 2012 ?", "Which team won Worlds 2012?"), answers: [w("Taipei Assassins", "Taipei Assassins"), w("Azubu Frost", "Azubu Frost"), w("Moscow Five", "Moscow Five"), w("CLG Europe", "CLG Europe")] },
  { q: w("Dans quelle équipe Faker a-t-il fait toute sa carrière ?", "Which team has Faker played for his whole career?"), answers: [w("T1", "T1"), w("Gen.G", "Gen.G"), w("KT Rolster", "KT Rolster"), w("Hanwha Life Esports", "Hanwha Life Esports")] },
  { q: w("Dans quelle ligue joue G2 Esports ?", "Which league does G2 Esports play in?"), answers: [w("LEC", "LEC"), w("LCK", "LCK"), w("LPL", "LPL"), w("LTA", "LTA")] },
  { q: w("Quel poste occupait Rookie chez Invictus Gaming ?", "Which role did Rookie play on Invictus Gaming?"), answers: [w("Mid", "Mid"), w("Top", "Top"), w("Jungle", "Jungle"), w("Support", "Support")] },
  { q: w("Quelle équipe a remporté les Worlds 2024 ?", "Which team won Worlds 2024?"), answers: [w("T1", "T1"), w("Bilibili Gaming", "Bilibili Gaming"), w("Gen.G", "Gen.G"), w("Hanwha Life Esports", "Hanwha Life Esports")] },
  { q: w("Quelle équipe a remporté le MSI 2023 ?", "Which team won MSI 2023?"), answers: [w("JD Gaming", "JD Gaming"), w("Bilibili Gaming", "Bilibili Gaming"), w("T1", "T1"), w("Gen.G", "Gen.G")] },
  { q: w("Quelle équipe française a été fondée par Kameto ?", "Which French team was founded by Kameto?"), answers: [w("Karmine Corp", "Karmine Corp"), w("Vitality", "Vitality"), w("Solary", "Solary"), w("BDS", "BDS")] }
];

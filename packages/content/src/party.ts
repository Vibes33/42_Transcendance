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

/**
 * Fais-moi deviner : mot à faire trouver dans chaque langue, et raccourcis acceptés comme réponse
 * (« ff » pour Abandon). Seuls ces mots-là sont interdits dans les indices du conteur.
 */
export interface DevineWord {
  fr: string;
  en: string;
  alias?: string[];
}
const d = (fr: string, en: string, alias?: string[]): DevineWord => (alias ? { fr, en, alias } : { fr, en });
const c = (name: string, alias?: string[]) => d(name, name, alias);

export const DEVINE_WORDS: DevineWord[] = [
  // Champions
  c("Ahri"), c("Akali"), c("Ashe"), c("Annie"), c("Blitzcrank", ["blitz"]), c("Brand"), c("Braum"), c("Caitlyn", ["cait"]),
  c("Darius"), c("Draven"), c("Ekko"), c("Ezreal", ["ez"]), c("Fiora"), c("Garen"), c("Graves"), c("Heimerdinger", ["heimer", "donger"]),
  c("Irelia"), c("Janna"), c("Jax"), c("Jhin"), c("Jinx"), c("Kai'Sa", ["kaisa"]), c("Karthus"), c("Katarina", ["kata"]),
  c("Kayle"), c("Kindred"), c("Lee Sin", ["lee"]), c("Leona"), c("Lulu"), c("Lux"), c("Malphite", ["malph"]), c("Master Yi", ["yi"]),
  c("Miss Fortune", ["mf"]), c("Morgana", ["morg"]), c("Nami"), c("Nasus"), c("Pyke"), c("Rammus"), c("Riven"), c("Sett"),
  c("Shaco"), c("Singed"), c("Sona"), c("Soraka", ["raka"]), c("Thresh"), c("Tristana", ["trist"]), c("Twisted Fate", ["tf"]), c("Twitch"),
  c("Veigar"), c("Vi"), c("Viego"), c("Volibear", ["voli"]), c("Warwick", ["ww"]), c("Xayah"), c("Yasuo"), c("Yone"),
  c("Yuumi"), c("Zed"), c("Ziggs"), c("Zoe"), c("Mordekaiser", ["morde"]), c("Nautilus", ["naut"]), c("Kha'Zix", ["khazix", "kha"]), c("Kog'Maw", ["kogmaw", "kog"]),
  c("Cho'Gath", ["chogath", "cho"]), c("Dr. Mundo", ["mundo"]), c("Jarvan IV", ["jarvan", "j4"]), c("Aurelion Sol", ["asol"]), c("Gragas"), c("Hecarim", ["heca"]), c("Rengar"), c("Senna"),
  c("Lucian"), c("Samira"), c("Aphelios"), c("Vayne"), c("Kassadin", ["kass"]), c("Kennen"), c("Gnar"), c("Rumble"),
  c("Ornn"), c("Bard"), c("Taric"), c("Zilean", ["zil"]), c("Galio"), c("Orianna", ["ori"]), c("Syndra"), c("Viktor"),
  c("Azir"), c("Sylas"), c("Qiyana"), c("Aatrox"), c("Illaoi"), c("Kled"), c("Camille"), c("Teemo"),
  // Carte et objectifs
  d("Baron Nashor", "Baron Nashor", ["baron", "nashor"]), d("Dragon ancestral", "Elder Dragon", ["elder"]), d("Héraut de la Faille", "Rift Herald", ["herald", "héraut"]),
  d("Larves du Néant", "Voidgrubs", ["grubs", "larves"]), c("Atakhan"), d("Carapateur", "Rift Scuttler", ["scuttle", "crabe", "crab"]),
  d("Tourelle", "Turret", ["tour", "tower"]), d("Inhibiteur", "Inhibitor", ["inhib"]), c("Nexus"), d("Fontaine", "Fountain"),
  d("Buisson", "Brush", ["bush"]), d("Rivière", "River"), d("Buff bleu", "Blue buff", ["bleu", "blue"]), d("Buff rouge", "Red buff", ["rouge", "red"]),
  c("Gromp"), c("Krugs"), d("Raptors", "Raptors"), d("Loups", "Murk Wolves", ["wolves"]), d("Âme de dragon", "Dragon Soul", ["soul", "âme"]),
  d("Dragon infernal", "Infernal Drake", ["infernal"]), d("Dragon océan", "Ocean Drake", ["ocean", "océan"]), d("Faille de l'invocateur", "Summoner's Rift", ["sr", "faille"]),
  d("Abîme hurlant", "Howling Abyss", ["abyss", "abîme"]), d("ARAM", "ARAM"), d("Sbire", "Minion"), d("Sbire canon", "Cannon minion", ["canon", "cannon"]),
  d("Vague de sbires", "Minion wave", ["wave", "vague"]), d("Plaque de tourelle", "Turret plating", ["plaque", "plates", "plating"]),
  // Objets
  d("Lame d'infini", "Infinity Edge", ["ie"]), d("Sablier de Zhonya", "Zhonya's Hourglass", ["zhonya", "zhonyas"]), d("Coiffe de Rabadon", "Rabadon's Deathcap", ["rabadon", "deathcap"]),
  d("Lame du roi déchu", "Blade of the Ruined King", ["botrk"]), d("Force de la Trinité", "Trinity Force", ["triforce", "trinity"]), d("Ange gardien", "Guardian Angel", ["ga"]),
  d("Épée de Doran", "Doran's Blade", ["doran"]), d("Balise de contrôle", "Control Ward", ["pink", "pink ward", "balise rose", "control"]), d("Potion de soin", "Health Potion", ["potion", "pot"]),
  d("Sceptre de cristal de Rylai", "Rylai's Crystal Scepter", ["rylai", "rylais"]), d("Couperet noir", "Black Cleaver", ["cleaver"]), d("Coques en acier", "Plated Steelcaps", ["tabi", "steelcaps"]),
  d("Larme de la déesse", "Tear of the Goddess", ["tear", "larme"]), d("Soif-de-sang", "Bloodthirster", ["bt"]), d("Gage de Sterak", "Sterak's Gage", ["sterak"]),
  d("Bottes", "Boots"), d("Or", "Gold", ["gold", "golds"]), d("Boutique", "Shop"),
  // Sorts d'invocateur
  c("Flash"), d("Téléportation", "Teleport", ["tp"]), d("Châtiment", "Smite"), d("Embrasement", "Ignite"), d("Fantôme", "Ghost"),
  d("Soins", "Heal"), d("Purge", "Cleanse"), d("Barrière", "Barrier"), d("Épuisement", "Exhaust", ["exh"]),
  // Jeu et jargon
  d("Abandon", "Surrender", ["ff", "ff15", "ff 15", "forfeit", "go next"]), d("Rappel", "Recall", ["b", "back"]), c("Gank"), c("Farm"),
  d("Pentakill", "Pentakill", ["penta"]), d("Quadrakill", "Quadrakill", ["quadra"]), d("Double kill", "Double kill", ["double"]), d("Premier sang", "First blood", ["fb", "first"]),
  d("Ace", "Ace"), c("Shutdown"), c("Backdoor", ["bd"]), c("Split push", ["split"]), c("Teamfight"), c("Kite"), c("Peel"), c("Poke"),
  c("Roam"), c("Invade"), c("Dive"), c("Freeze"), d("Last hit", "Last hit", ["lh"]), c("Smurf"), c("Tilt"), c("Carry"),
  d("Toxique", "Toxic"), c("Feed", ["feeder", "int"]), d("AFK", "AFK"), c("Support", ["supp"]), c("ADC", ["ad carry", "marksman", "tireur"]), c("Jungler", ["jungle", "jgl"]),
  d("Mid lane", "Mid lane", ["mid"]), d("Top lane", "Top lane", ["top"]), d("Bot lane", "Bot lane", ["bot", "botlane"]), d("Vision", "Vision"), c("Ward"), c("Skin"),
  d("Ultime", "Ultimate", ["ult", "ulti", "r"]), d("Passif", "Passive"), d("Étourdissement", "Stun", ["stun"]), d("Bouclier", "Shield"), d("Coup critique", "Critical strike", ["crit", "critique"]),
  c("Snowball"), c("Comeback"), d("Classée", "Ranked", ["ranked", "classé"]), c("Challenger", ["chall"]), d("Fer", "Iron"),
  // Univers et esport
  c("Worlds", ["championnat du monde"]), c("Faker"), c("T1"), c("MSI"), c("Arcane"), c("Piltover"), c("Zaun"), c("Demacia"),
  c("Noxus"), c("Ionia"), c("Freljord"), c("Shurima"), c("Bilgewater"), d("Néant", "Void", ["void"]), d("Îles obscures", "Shadow Isles", ["shadow isles"]), c("Targon"),
  c("Bandle"), c("Poro"), c("Yordle"), c("Vastaya"), c("Hextech"), d("Shimmer", "Shimmer", ["chimère"]), c("Darkin"), c("Runeterra")
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

import { useLang, useT } from "../i18n";
import { glow } from "../components/ui";

// Politique de confidentialité et conditions d'utilisation (avec la mention Riot « fan content »).

function Page({ title, acc, children }: { title: string; acc: string; children: React.ReactNode }) {
  return (
    <div className="flex-auto flex flex-col items-center gap-8 pt-12 pb-16 gutter" style={{ background: glow("900px 520px at 50% 260px", 14) }}>
      <h1 className="m-0 font-d font-bold leading-[1.02] uppercase text-center" style={{ fontSize: "clamp(32px, 3.6vw, 52px)" }}>
        {title} <span className="text-acc">{acc}</span>
      </h1>
      <article className="w-full max-w-[820px] p-[1.5px] bg-line cut-md">
        <div className="flex flex-col gap-4 px-8 max-sm:px-5 py-7 bg-surf cut-md text-[15.5px] leading-[1.7] [&_h2]:m-0 [&_h2]:mt-3 [&_h2]:font-d [&_h2]:font-bold [&_h2]:text-xl [&_h2]:uppercase [&_p]:m-0 [&_p]:text-mut [&_li]:text-mut [&_ul]:m-0 [&_ul]:pl-5">
          {children}
        </div>
      </article>
    </div>
  );
}

export function Confidentialite() {
  const t = useT();
  const fr = useLang((s) => s.lang) === "fr";
  return (
    <Page title={t("Politique de")} acc={t("confidentialité")}>
      {fr ? (
        <>
          <p>Dernière mise à jour : 21 octobre 2026.</p>
          <h2>Aucune donnée personnelle</h2>
          <p>
            LolTR ne collecte ni nom, ni adresse e-mail, ni photo, ni date de naissance. Lors d’une connexion avec Google, Apple ou Discord, nous recevons seulement un identifiant technique du
            fournisseur, que nous transformons immédiatement en empreinte irréversible (SHA-256) : il est impossible d’en retrouver ton compte d’origine.
          </p>
          <h2>Ce que nous enregistrons</h2>
          <ul>
            <li>Ton pseudo, son tag, ton rôle préféré et tes préférences d’affichage.</li>
            <li>Tes statistiques de jeu : parties, essais, réponses, temps, contenus déjà vus, points, éclats et achats.</li>
            <li>Tes amis, demandes d’ami, blocages et signalements.</li>
            <li>Un cookie de session (connexion) et un identifiant d’appareil (une seule partie du défi par appareil pour les invités).</li>
          </ul>
          <h2>Pourquoi</h2>
          <p>Faire fonctionner le jeu, les classements et la boutique ; te proposer des statistiques personnelles et un entraînement ciblé ; publier des statistiques globales anonymes (« seuls 4 % ont trouvé ce splash »).</p>
          <h2>Partage</h2>
          <p>Aucune donnée n’est vendue ni transmise à des tiers. Les images des champions sont chargées depuis Data Dragon (Riot Games) et les emblèmes de rang depuis CommunityDragon : ces serveurs voient donc ton adresse IP, comme tout serveur web.</p>
          <h2>Tes droits</h2>
          <p>Tu peux supprimer ton compte à tout moment depuis les paramètres : ton profil, tes amis, tes éclats et tes statistiques sont alors effacés.</p>
        </>
      ) : (
        <>
          <p>Last updated: October 21, 2026.</p>
          <h2>No personal data</h2>
          <p>
            LolTR collects no name, email address, picture or birth date. When you sign in with Google, Apple or Discord, we only receive a technical identifier from the provider, which we immediately turn
            into an irreversible hash (SHA-256): your original account cannot be recovered from it.
          </p>
          <h2>What we store</h2>
          <ul>
            <li>Your nickname, its tag, your favourite role and display preferences.</li>
            <li>Your gameplay statistics: games, guesses, answers, timings, content already seen, points, shards and purchases.</li>
            <li>Your friends, friend requests, blocks and reports.</li>
            <li>A session cookie and a device identifier (guests can play one daily challenge per device).</li>
          </ul>
          <h2>Why</h2>
          <p>To run the game, leaderboards and shop; to give you personal insights and targeted practice; to publish anonymous global statistics.</p>
          <h2>Sharing</h2>
          <p>No data is sold or shared with third parties. Champion images are loaded from Data Dragon (Riot Games) and rank emblems from CommunityDragon: these servers see your IP address, like any web server.</p>
          <h2>Your rights</h2>
          <p>You can delete your account at any time from the settings: your profile, friends, shards and statistics are then erased.</p>
        </>
      )}
    </Page>
  );
}

export function Conditions() {
  const t = useT();
  const fr = useLang((s) => s.lang) === "fr";
  return (
    <Page title={t("Conditions")} acc={t("d’utilisation")}>
      {fr ? (
        <>
          <p>Dernière mise à jour : 21 octobre 2026.</p>
          <h2>Le service</h2>
          <p>LolTR est un site gratuit de mini-jeux autour de League of Legends. Les éclats ne s’achètent pas : ils se gagnent en jouant et n’ont aucune valeur monétaire.</p>
          <h2>Ton comportement</h2>
          <p>Choisis un pseudo correct, respecte les autres joueurs et ne triche pas (scripts, comptes multiples pour le classement). Les signalements sont examinés et un compte peut être suspendu.</p>
          <h2>Mode streamer</h2>
          <p>Les sessions de stream ne rapportent pas de points classés. Les viewers peuvent jouer en invité avec un pseudo aléatoire.</p>
          <h2>Responsabilité</h2>
          <p>Le service est fourni tel quel ; nous faisons de notre mieux pour qu’il reste disponible, sans garantie.</p>
          <h2>Mention Riot Games</h2>
          <p>
            LolTR n’est ni approuvé ni sponsorisé par Riot Games et ne reflète pas les opinions de Riot Games ou de toute personne officiellement impliquée dans la production ou la gestion des propriétés
            de Riot Games. Riot Games et toutes les propriétés associées sont des marques commerciales ou déposées de Riot Games, Inc.
          </p>
        </>
      ) : (
        <>
          <p>Last updated: October 21, 2026.</p>
          <h2>The service</h2>
          <p>LolTR is a free League of Legends mini-game website. Shards cannot be bought: they are earned by playing and have no monetary value.</p>
          <h2>Your behaviour</h2>
          <p>Pick a decent nickname, respect other players and do not cheat (scripts, multiple accounts for the leaderboard). Reports are reviewed and accounts can be suspended.</p>
          <h2>Streamer mode</h2>
          <p>Stream sessions do not award ranked points. Viewers can play as guests with a random nickname.</p>
          <h2>Liability</h2>
          <p>The service is provided as is; we do our best to keep it available, without warranty.</p>
          <h2>Riot Games notice</h2>
          <p>
            LolTR isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all
            associated properties are trademarks or registered trademarks of Riot Games, Inc.
          </p>
        </>
      )}
    </Page>
  );
}

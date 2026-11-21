# Audit des bugs LolTR (17 novembre 2026)

Sept agents ont audité le site en lecture seule, chacun sur une partie : connexion et profil ; amis, groupes et temps réel ; défi du jour et économie ; les 9 nouveaux jeux ; classements et saisons ; World Mayhem ; front, sécurité et infrastructure. Chaque bug a été vérifié dans le code, la plupart avec un script ou un test de preuve (scripts dans le dossier de travail de la session, `scratchpad/audit-*`). Les doublons trouvés par plusieurs agents sont fusionnés.

**Bilan : 4 critiques, 15 hauts, 26 moyens, 22 bas, plus 8 points de règle à trancher.**

Ce qui a été vérifié et trouvé correct est listé à la fin.

---

## Critiques

### C1. Classement mondial et paie de fin de saison cassés au-delà d'environ 440 joueurs
- **Où :** `services/classement/src/index.ts:10` et `:55`, `services/classement/src/app.ts:24,75`.
- **Problème :** tous les identifiants des joueurs de la saison partent dans l'URL d'un GET interne (`?ids=`). Au-delà de 16 Ko d'en-tête (environ 440 joueurs), Bun répond 431.
- **Effet :** la page Classement est cassée pour tout le monde, et `jobs()` échoue chaque minute avant `paySeasons`, donc la saison n'est jamais payée.
- **Correction :** ne demander les profils que pour les lignes affichées (top 100 + moi) et passer les routes internes en POST avec un corps JSON.

### C2. Le service profil se bloque pour de bon après 5 760 invités
- **Où :** `services/profil/src/app.ts:52-55`, `packages/shared/src/pseudo.ts:36-40`.
- **Problème :** il n'existe que 5 760 pseudos aléatoires possibles (8 × 8 × 90). La recherche d'un pseudo libre tourne dans une boucle synchrone sans limite, et les profils invités ne sont jamais supprimés.
- **Effet :** le 5 761e invité bloque tout le service profil (pseudo, équipement, `/internal/players` utilisé par jeux et classement). Un attaquant y arrive en une dizaine de minutes, l'usage normal aussi à terme.
- **Correction :** agrandir l'espace des pseudos, limiter les essais avec un suffixe unique en dernier recours, et supprimer les profils des invités fusionnés.

### C3. Champion du jour devinable presque gratuitement (essais simultanés)
- **Où :** `services/jeux/src/app.ts:331-336`.
- **Problème :** la route `act` lit l'état, applique l'action et réécrit l'état sans verrou. Dix essais envoyés en parallèle renvoient chacun leur comparaison, mais un seul est enregistré.
- **Effet :** triche sur le top 1 % (150 points). Chez un joueur honnête, deux bons clics rapides dans Méli-MéLoL : un des deux est perdu alors que l'interface l'a validé.
- **Correction :** sérialiser les actions par manche (transaction synchrone qui relit l'état, ou `UPDATE … WHERE version = ?`) et mettre les clics en file côté interface.

### C4. Splash mystère : l'image complète est envoyée au navigateur
- **Où :** `services/jeux/src/games/splash.ts:91-93`, `apps/front/src/games/SplashMystere.tsx:34,65`.
- **Problème :** le proxy sert le splash art entier, le zoom est fait uniquement en CSS.
- **Effet :** ouvrir `/api/jeux/rounds/<id>/image/0` dans un onglet montre toute l'image : champion trouvé au premier essai.
- **Correction :** recadrer côté serveur selon l'avancement et ne servir que la zone visible.

---

## Hauts

### Sécurité et comptes

**H1. Faille de connexion OAuth : vol de la progression d'un invité**
- **Où :** `services/auth/src/app.ts:112-136`.
- **Problème :** le `state` OAuth n'est vérifié qu'en base, il n'est lié à aucun navigateur.
- **Scénario :** l'attaquant s'authentifie, garde l'URL de retour sans l'ouvrir et l'envoie à sa victime. Celle-ci se retrouve connectée au compte de l'attaquant ; si elle était invitée, son défi du jour, ses éclats et sa série sont fusionnés dans ce compte.
- **Correction :** cookie HttpOnly contenant le `state`, posé au login et exigé au retour.

**H2. La suppression de compte n'efface rien en dehors du service auth**
- **Où :** `services/auth/src/app.ts:157-164`. Aucun événement `user.deleted` n'existe.
- **Effet :** le profil, le pseudo (pris à vie), les amis, l'inventaire, le portefeuille, les statistiques et la ligne au classement restent, alors que la page légale et le dialogue promettent leur effacement.
- **Correction :** publier `user.deleted` et le consommer dans profil, social, jeux, classement et temps réel.

**H3. Fusion invité → compte incohérente entre jeux et classement**
- **Où :** `services/classement/src/core.ts:243-256`, `services/jeux/src/app.ts:592-600`.
- **Problèmes :**
  - classement déplace les résultats de tous les jours de l'invité. Si le compte a joué l'un de ces jours, une erreur UNIQUE annule tout, et l'événement est rejoué et échoue à chaque redémarrage ;
  - jeux refuse la fusion si le défi du compte est commencé, classement seulement s'il a un jeu fini : les points de l'invité sont alors comptés et ceux du compte ignorés ;
  - un défi commencé avant 3 h et fusionné après n'est transféré que d'un côté ;
  - la série et le compteur de la semaine ne suivent pas la fusion.
- **Correction :** même règle des deux côtés (décidée par jeux, suivie par classement), filtrer sur le jour, et transférer série et semaine.

### Défi du jour et économie

**H4. Fin de défi publiée plusieurs fois : bonus hebdomadaire dès le premier jour**
- **Où :** `services/jeux/src/app.ts:127-152`, `services/classement/src/core.ts:118-124` et `:261-264`.
- **Problème :** plusieurs `finish` simultanés finalisent chacun la manche et publient chacun `round.finished` et `defi.completed`. Côté classement, `weeks.completed` augmente à chaque événement reçu ; les rejeux Redis Streams ont le même effet. Les points de communauté des streamers sont aussi doublés.
- **Effet :** 5 `finish` en parallèle donnent le bonus de 50 éclats dès le premier jour.
- **Correction :** finaliser avec `UPDATE … WHERE over = 0` et ne publier que si une ligne a changé ; ne compter la semaine que si le jour passe vraiment à « terminé » ; dédupliquer la communauté par manche.

**H5. Une manche du défi reste jouable après la fermeture de 3 h 30**
- **Où :** `services/jeux/src/app.ts:328-365` et `:146-152`, `services/classement/src/core.ts:95-105` et `:140-168`.
- **Problème :** aucun contrôle du jour sur `act` et `finish`, et Splash mystère n'a pas de chrono. Un défi fini deux jours plus tard passe de « clos » à « terminé » et rapporte éclats, déblocage et semaine.
- **Effet :** la série est cassée (le jour en retard réécrit `lastDay`), et les points arrivés après la clôture du jour ne sont jamais payés.
- **Correction :** refuser (clore à 0) les manches du défi après `forceCloseAt(jour)`, ignorer un jour antérieur à `lastDay`, et clore les manches expirées par un job.

**H6. La saison est payée avant la clôture de son dernier jour**
- **Où :** `services/classement/src/core.ts:171-180`.
- **Problème :** entre 3 h et 3 h 30, le premier jour de la nouvelle saison, la saison précédente est payée sans son dernier jour (encore jouable jusqu'à 3 h 30), puis plus aucune correction n'est possible.
- **Correction :** ne payer que lorsque `now ≥ forceCloseAt(dernier jour)` et que tous les jours de la saison sont finalisés.

**H7. Le service classement se bloque avec quelques milliers de joueurs par jour**
- **Où :** `services/classement/src/core.ts:229-240` et `:65`.
- **Problème :** le calcul des points projetés est quadratique : 2 s pour 1 000 joueurs, 8 s pour 2 000. SQLite est synchrone, donc tout le service est bloqué pendant ce temps, à chaque `/me` (rechargé par tous les clients à chaque `points.updated`).
- **Correction :** trier une fois par jour et par jeu, mettre en cache, et garder les totaux de saison en table.

### Groupes et temps réel

**H8. Un joueur déconnecté pendant le récap bloque tout le groupe**
- **Où :** `services/temps-reel/src/hub.ts:369`, `apps/front/src/pages/Recap.tsx:76-78` et `:182-200`.
- **Problème :** côté serveur, la barrière « prêt » attend aussi les joueurs déconnectés, et le récap n'a pas de bouton « Continuer sans lui ». Côté front, l'écran affiche « Tout le monde est prêt, c'est parti ! » alors que rien ne se passe.
- **Correction :** afficher le bandeau « continuer sans » sur le récap, et aligner le compte des joueurs prêts sur la règle du serveur.

**H9. Revenir dans le groupe pendant le récap casse le défi du joueur**
- **Où :** `services/temps-reel/src/hub.ts:411-413`, `services/jeux/src/app.ts:570`.
- **Problème :** le jeu du récap n'est ni joué ni forfaité. Au jeu suivant, le joueur revenu reçoit `not_next_game` et se fait éjecter.
- **Correction :** en phase récap, forfaiter aussi le jeu courant.

**H10. World Mayhem en groupe : un membre absent bloque le tournoi pour toujours**
- **Où :** `services/jeux/src/app.ts:463-466`, `services/temps-reel/src/hub.ts:391` et `:494`.
- **Problème :** même après « Continuer sans lui », le service jeux compte encore le joueur absent, et les autres restent sur « En attente du groupe ».
- **Correction :** exposer le statut des membres et compter un membre absent sans équipe validée comme parti.

**H11. Stream classique : « Manche suivante » termine la session**
- **Où :** `services/temps-reel/src/hub.ts:376` et `:269`.
- **Problème :** la manche n'est relancée que pour le contexte `classique`, or un stream est en contexte `streamer`. La session s'arrête au premier clic.
- **Correction :** relancer aussi la manche d'un stream à jeu unique, et refuser `streamNext` sur une session terminée.

**H12. Stream : un viewer peut refaire la manche en connaissant la réponse**
- **Où :** `services/temps-reel/src/hub.ts:326`, `services/jeux/src/app.ts:294-298`.
- **Problème :** recharger la page recrée une manche avec la même graine, et le nouveau résultat écrase l'ancien.
- **Effet :** le classement « streamer contre chat » et la carte « tu as battu X % » sont faussés.
- **Correction :** reprendre la manche existante, et ignorer un résultat déjà enregistré.

### Nouveaux jeux

**H13. Sudoku : triche sur le classement au temps**
- **Où :** `services/jeux/src/games/sudoku.ts:95`, `services/jeux/src/app.ts:421-425`.
- **Problème :** la solution est visible après un abandon. On relance la même grille du jour et on la remplit en 3 s ; c'est cette grille, la première réussie, qui compte.
- **Correction :** retenir la première grille commencée du jour, et ne dévoiler la solution qu'après 3 erreurs.

**H14. Mode streamer : n'importe quel jeu, verrouillé ou solo seulement, se joue gratuitement**
- **Où :** `services/jeux/src/app.ts:294-299`, `services/temps-reel/src/hub.ts:265`.
- **Problème :** le jeu demandé n'est pas comparé au jeu de la session, et les modes du manifeste ne sont jamais vérifiés.
- **Effet :** un compte ouvre son propre stream pour jouer un jeu à 500 éclats, et des invités votent dans Champion parfait ou entrent dans les stats Sudoku.
- **Correction :** exiger `game === session.game` et vérifier `GAMES[game].modes`. Reste à décider si un streamer doit posséder le jeu.

### Front

**H15. Tutoriel : Entrée saute deux étapes à chaque appui**
- **Où :** `apps/front/src/components/Tutorial.tsx:69-76` et `:123`.
- **Problème :** le raccourci global et le bouton « Suivant », qui a le focus, réagissent tous les deux à Entrée. On passe de l'étape 1 à 3, puis 5, et `onDone` est appelé deux fois.
- **Effet :** touche la visite du site, la visite de chaque jeu et la relecture depuis les Paramètres.
- **Correction :** retirer Entrée du raccourci global, ou ignorer l'événement quand il vient d'un bouton.

---

## Moyens

### Groupes et temps réel
- **M1. Relancer le défi entre 3 h et 3 h 30 détruit le défi de groupe de la veille**, encore jouable. C'est une régression du commit cf0ea83. Où : `hub.ts:213-217`. Correction : considérer le défi comme en cours tant que `now < forceCloseAt(jour)`.
- **M2. Un joueur qui a quitté le défi de groupe y est renvoyé en « fantôme ».** Le serveur renvoie la session où il est encore « parti », donc il ne reçoit plus aucun message. Où : `hub.ts:214` et `:518`, `lib/play.ts:44-47`. Correction : refuser avec un message clair, ou le réintégrer avec forfait.
- **M3. Un joueur exclu du groupe peut revenir dans la session** (`POST /rejoin`), et le groupe attend alors son résultat. Où : `hub.ts:403-416`. Correction : n'accepter `rejoin` que pour un membre absent ou déconnecté, et refuser `ready` et `continue` aux membres partis.
- **M4. Le tutoriel en groupe ne fonctionne pas.** Le bouton répond 409 pendant la partie, le drapeau est remis à zéro au récap, et la navigation vers le récap coupe le tutoriel. Où : `Partie.tsx:116-119` et `:206-211`, `hub.ts:366`.
- **M5. Une partie de groupe écrase la session de stream d'un membre**, parce que la clé `rt:member` n'a qu'une seule valeur. Où : `hub.ts:244`.
- **M6. Stream : un résultat tardif est compté sur la mauvaise manche**, quand le streamer passe à la suivante avant que le viewer ait fini. Où : `hub.ts:323`.
- **M7. Jeux de groupe : aucun contrôle du nombre de joueurs ni des modes au lancement.** Exemple : Codenames lancé à 2, tout le monde se retrouve sur une page d'erreur ; Connexions (max 4) se joue à 6 ; Sudoku et Champion parfait acceptent une session. Où : `hub.ts:206-222`, `lib/play.ts:33-47`. Correction : vérifier min, max et modes dans `createGroup`, et désactiver le bouton côté front.

### Défi du jour, classements et économie
- **M8. Rang différent entre le classement et le profil**, avec des ex æquo ou un joueur sans profil. Où : `classement/src/app.ts:23,29` et `core.ts:222-223`. Correction : une seule fonction de rang, appliquée avant le filtrage.
- **M9. Fin de saison payée à des joueurs à 0 point, et ex æquo à un seuil payés différemment.** Avant 10 000 joueurs, quiconque a joué un seul jour touche au moins 180 éclats, ce qui rend inutile la participation à 10 jours. Où : `core.ts:189-195`.
- **M10. Les chronos de l'interface suivent l'horloge locale du joueur**, sans correction du décalage avec le serveur. Un PC en retard de 10 s voit la grille floue 11 s pendant que le chrono serveur tourne. Où : `SortsEclair.tsx:33-35`, `MeliMelol.tsx:38`, `ChampionDuJour.tsx:76`.
- **M11. La règle « une participation par appareil et par jour » se contourne après une fusion** : on se reconnecte en invité et on refait le défi. Où : `jeux/src/app.ts:239` et `:596`.
- **M12. Course sur le choix du premier chibi** : deux requêtes simultanées offrent deux chibis gratuits. Où : `profil/src/app.ts:132-137`.

### Nouveaux jeux
- **M13. Codenames et Fais-moi deviner : une partie abandonnée revient à la relance suivante**, avec les anciennes équipes et les anciens espions, même le lendemain. Où : `jeux/src/app.ts:171-172` (`openParty`).
- **M14. Codenames : un spectateur reçoit le score de l'équipe rouge.** Où : `party.ts:117-119`.
- **M15. Codenames : la partie ne finit jamais si les deux maîtres-espions sont partis**, et le récap n'arrive jamais. Où : `party.ts:80-113`.
- **M16. Contrat « pas de répétition » non respecté** : QCM, Chaud-Froid et Connexions ignorent l'historique ; Portrait ne note qu'un champion sur cinq. Où : `qcm.ts:75`, `chaudfroid.ts:81`, `connexions.ts:66`, `portrait.ts:69`.

### World Mayhem
- **M17. Les tours du Nexus tombent avant tout inhibiteur dans 57 % des parties.** Où : `mayhemSim.ts:296`. Correction : exempter les tours 9 et 10 du plafond `end - 10`.
- **M18. Objectifs pris pendant leur réapparition, tours et inhibiteurs dans le désordre**, à cause des reports d'actions. Sur 1 084 parties : 110 dragons, 34 barons, 28 tours dans le désordre et 25 inhibiteurs avant leur tour. Où : `mayhemSim.ts:300-335`.
- **M19. Triche : l'écusson se change après le draft** par l'API (+1 ou +2 sur la note). Où : `mayhem.ts:86-97`. Correction : refuser `crest` dès qu'un joueur est pris.
- **M20. Performances** :
  - `buildMovement` est recalculé deux fois par partie (à-coup) ;
  - chaque `watched` renvoie le tournoi entier (229 Ko) ;
  - la simulation (117 ms) bloque la requête `lock` ;
  - `/mayhem/day` lit tous les états du jour.

  Où : `WorldMayhem.tsx:44-49`, `jeux/src/app.ts:383-397` et `:492-499`.

### Compte, front et infrastructure
- **M21. La langue et le thème choisis avant l'inscription sont écrasés** par le français et le thème sombre. Où : `profil/src/app.ts:63-66`, `state/app.ts:121-125`.
- **M22. « Supprimer mon compte » ignore les erreurs** : si l'appel échoue, on est redirigé sans message et toujours connecté. Où : `Parametres.tsx:49`.
- **M23. Codes d'erreur bruts et textes en français dans les notifications**, en anglais aussi. Environ 30 codes s'affichent tels quels (`account_required`, `not_in_session`…), ainsi qu'une vingtaine de messages serveur non traduits ; `i18n:check` ne lit pas les services. Où : `packages/shared/src/http.ts:25`, `api/client.ts:38`.
- **M24. Le `/daily/start` d'un défi rattache les manches à une session quelconque** sans vérifier l'appartenance. Où : `jeux/src/app.ts:231-233`.
- **M25. World Mayhem en groupe, à confirmer** : si un coéquipier lance un autre jeu, la page peut rester sur l'ancien Mayhem selon l'ordre des messages. Où : `Partie.tsx:56-61`. Correction : une clé sur `Partie` construite avec la session et le jeu.
- **M26. Le header ne se rafraîchit pas après certains gains d'éclats** (défi terminé, bonus hebdomadaire, tranche de 500 points, fin de saison), faute d'événement `wallet.updated`. Où : `classement/src/index.ts:37-41`.

---

## Bas
- **B1.** `leave` sur une session remplacée peut effacer l'appartenance à la nouvelle. Où : `hub.ts:429,440`.
- **B2.** Le chef peut s'exclure lui-même, et le groupe n'a plus de chef. Où : `social/src/app.ts:294-307`.
- **B3.** Les sockets OBS restent enregistrées après leur fermeture (fuite mémoire). Où : `temps-reel/src/app.ts:39`.
- **B4.** Avec un seul joueur, le meilleur est classé comme le dernier (Bronze 3), et le palier dépend de l'effectif. Où : `scoring.ts:90-94`.
- **B5.** L'Historique ne compte que les 60 derniers jours alors que les libellés suggèrent un total. Où : `api/queries.ts:112`.
- **B6.** Champion du jour : retaper un nom déjà proposé envoie un autre champion (« Vi » donne Viego) et coûte un essai. Où : `components/game.tsx:119-122`.
- **B7.** Chaud-Froid : un prix de 3 333 PO est impossible à trouver avec un curseur au pas de 50. Où : `chaudfroid.ts:49`.
- **B8.** Chaud-Froid : une même question peut tomber deux fois dans une partie (environ 2 %). Où : `chaudfroid.ts:29-33`.
- **B9.** Portrait mystère : le passif de Draven et Kindred donne leur nom dès la ligne 4. Où : `portrait.ts:38-39`.
- **B10.** Fais-moi deviner : « Passer » est gratuit à 0 point, et `DEVINE_TURNS = 6` n'est jamais utilisé (en pratique, un tour par joueur). Où : `party.ts:187`.
- **B11.** Codenames : l'historique des indices est toujours en français. Où : `party.ts:101`.
- **B12.** QCM : un timeout refusé par le serveur n'est jamais renvoyé, et le chrono reste à 0:00. À confirmer. Où : `Qcm.tsx:36-40`.
- **B13.** QCM : deux bonnes réponses sont possibles (Charge explosive : Tristana et Ziggs). Très rare. Où : `qcm.ts:54-58`.
- **B14.** World Mayhem : le « Score du jour » de l'écran de fin (note + 2 × victoires) diffère de la note utilisée pour le classement. Où : `WorldMayhem.tsx:336`.
- **B15.** World Mayhem : un vieux tournoi sans poules fait planter `result` (erreur 500, seulement par l'API). Où : `mayhem.ts:336`.
- **B16.** La redirection HTTP → HTTPS envoie sur le port 443 au lieu de 8443. Où : `traefik/traefik.yml:6-9`.
- **B17.** Page Profil : taper une lettre avant le chargement lève une `ReferenceError` (non bloquante). Où : `Profil.tsx:~90-99`.
- **B18.** L'image front tourne en mode développement de Bun : une URL mal encodée affiche une trace avec le code source. Où : `apps/front/Dockerfile`, `serve.ts:7`. Correction : `ENV NODE_ENV=production` et un try/catch.
- **B19.** Un défi commencé mais clos d'office à 3 h 30 casse la série, qui ne compte que les défis terminés. À rapprocher de la règle P2.
- **B20.** Le reste des points sous une tranche de 500 est perdu chaque jour : un joueur à 499 points par jour ne touche jamais rien. Voir la règle P3.
- **B21.** Sur la page de connexion, l'accent de l'étape « premier chibi » suit le chibi sélectionné, alors que CLAUDE.md demande le jaune Lux. Voir la règle P6.
- **B22.** Rappel de configuration : `AUTH_DEV_LOGIN=true` ne doit jamais aller en production. Il permet de créer des comptes de test, de se créditer des éclats et de rejouer le défi.

---

## Points de règle à trancher en équipe
- **P1.** Un streamer doit-il posséder le jeu classique qu'il diffuse ?
- **P2.** La série compte-t-elle les jours **joués** (CLAUDE.md) ou les défis **terminés** (le code) ? **Tranché le 21/11 :** jours joués, un jeu du défi terminé suffit (règle B19 corrigée du même coup).
- **P3.** Les 10 éclats par tranche de 500 points : calcul par jour (reste perdu) ou cumulé ? **Tranché le 21/11 :** cumulé d'un jour à l'autre, le reste est gardé (`wallets.points_carry`, B20 corrigé) ; le profil montre la progression vers les prochains éclats.
- **P4.** Splash mystère trouvé sans le skin (70 points) : compte-t-il comme réussi pour le second déblocage ?
- **P5.** Tolérance aux fautes : 0 faute pour les noms de 3 lettres ou moins et 1 pour 5 lettres ou moins, alors que la spécification dit ≤ 2. « Sena » est refusé à cause d'une égalité avec Sona.
- **P6.** Accent de l'étape « premier chibi » : jaune Lux (CLAUDE.md) ou celui du chibi sélectionné (le code) ?
- **P7.** Champion du jour est censé être jouable depuis l'accueil avant toute connexion ; le code redirige d'abord vers `/connexion`.
- **P8.** Méli-MéLoL et Sorts éclair : une erreur ne coûte rien, donc un bot peut tout essayer. **Tranché le 21/11 :** chaque erreur retire 1 s au chrono (`MELI_ERROR_MS`, `SE_ERROR_MS` dans `packages/shared/src/rules.ts`).

---

## Vérifié sans bug (extraits)
- **Sécurité :**
  - Traefik retire les en-têtes d'identité avant `forwardAuth`, sur toute l'API et sur `/ws` ;
  - les routes `/internal` sont protégées par jeton, les routes `/dev` renvoient 404 sans `AUTH_DEV_LOGIN` ;
  - aucun port de service n'est publié ;
  - cookies HttpOnly, Secure et Lax, pas de CORS, pas de `dangerouslySetInnerHTML`, SQL paramétré, entrées validées ;
  - les migrations sont à jour.
- **Heure :** le changement de jour à 3 h (Paris) est correct aux changements d'heure (3 ans testés jour par jour), ainsi que la fermeture à 3 h 30, les semaines et la rotation.
- **Jeux :** aucune réponse n'est dévoilée avant la fin dans les jeux (hors Splash, C4, et Sudoku après abandon, H13), et les actions après la fin du chrono sont refusées.
- **Économie :** achats atomiques, journal d'éclats idempotent, déblocages du jour idempotents, pas de double paiement de saison.
- **Amis et groupes :** demandes d'ami, blocage, limite de 6, cycle de vie du groupe, règle « solo OU groupe ». Le correctif cf0ea83 marche, avec une seule régression (M1).
- **World Mayhem :** classement des poules, arbre, Bo1/Bo3/Bo5, déterminisme, jokers, verrouillage, avancement qui ne recule jamais ; 0 % de joueurs dans les murs ; tueur et victime sur place dans 99,9 % des cas.
- **Contrôles automatiques :** `bun test` (66 tests), les deux typechecks et `i18n:check` passent.

# Cahiers — Nuit 2 : le téléphone devient l'appareil principal

Tu travailles **seul pendant 5 à 6 heures, sans intervention**. L'utilisateur dort. Toutes les décisions nécessaires sont ici ; tu ne poses aucune question. Le téléphone sera désormais **la majeure partie de l'usage** de Cahiers : tout ce que l'app sait faire sur PC doit se faire sur mobile, sans bug, vite, et sans rien ajouter d'inutile.

Quatre chantiers, dans cet ordre : **M0 parité** (chaque fonction PC existe sur mobile), **M1 débogage** (une session massive et systématique), **M2 performance** (bundle, démarrage, fluidité), **M3 recherche puis M4 implémentation** de mises à jour réellement utiles (dont « connexion Google »). Rapport dans `RAPPORT_NUIT2.md`, décisions dans `DECISIONS.md` section « Nuit 2 ».

Pré-requis : si les plugins `playwright` et `frontend-design` sont installés, utilise-les (Playwright pour piloter, capturer et enregistrer des traces ; frontend-design pour les composants mobiles que tu crées ou refais). S'ils ne sont pas là, `@playwright/test` du projet suffit.

---

## 0. Règles de la session

1. **Rien ne casse** : `npm test` et `npm run build` verts avant de commencer et après chaque section ; une correction qui laisse les tests rouges après deux tentatives est annulée (`git checkout`), notée, et on continue. Un commit par section (`nuit2/<section>: …`). Arbre jamais rouge. **Tu ne pousses pas** sur GitHub (`git push`) : l'utilisateur publiera lui-même après avoir regardé.
2. **Matrice d'appareils** pour toute vérification (descripteurs Playwright ; **les deux moteurs** parce que la plupart des bugs mobiles sont propres à Safari) :
   - WebKit : `iPhone SE` (375×667), `iPhone 14` (390×844), `iPhone 14 Pro Max` (430×932), `iPad Mini` (768×1024)
   - Chromium : `Pixel 7` (412×915), `Galaxy S9+` (320 px de large, le pire cas)
   - Portrait **et** paysage pour la session et la fiche ; thème sombre (par défaut) et clair.
   - `scripts/mobile-matrix.mjs` : pour chaque combinaison, charge chaque page avec la base de démonstration, **collecte les erreurs console et les exceptions non capturées**, mesure `document.documentElement.scrollWidth > window.innerWidth` (débordement horizontal = bug), capture d'écran, et écrit un rapport JSON + galerie HTML dans `docs/mobile/matrix/<étape>/`. Critère de sortie de la nuit : **0 erreur console, 0 débordement horizontal** sur toute la matrice.
3. **Test d'utilité** pour toute fonctionnalité nouvelle (M3/M4) : elle est ajoutée seulement si (a) elle sert une étape de la boucle centrale *capturer le cours → fiche → exercices → réviser → suivre* **sur téléphone**, (b) elle fonctionne sans serveur et sans clé API, (c) tu peux la vérifier cette nuit (émulation ou tests unitaires), (d) elle n'ajoute pas plus de 15 Ko gzip au bundle initial. Sinon elle va dans `docs/mobile/idees-ecartees.md` avec la raison. **Aucun** ajout de gamification, de réseau social, d'IA supplémentaire.
4. **Un bug = un cycle** : reproduction dans la matrice ou en test → correction → test de non-régression (Playwright ou unitaire) → vérification sur les deux moteurs. Chaque bug est une ligne de `docs/mobile/bugs.md` : symptôme, appareil/moteur, cause, correction, test.
5. **Ce que l'émulation ne prouve pas**, tu le listes pour l'utilisateur (section « À vérifier sur un vrai téléphone » du rapport) au lieu de le déclarer fait : gyroscope, `navigator.share` réel, presse-papiers iOS, installation, écrans de lancement, clavier virtuel réel, geste de retour iOS, quota de stockage Safari, Bluetooth/vibration.

---

## M0. Parité PC → mobile (tout ce qui existe sur PC existe sur téléphone)

1. **Inventaire mécanique, pas de mémoire.** Ajoute un attribut `data-action="<nom>"` sur chaque élément interactif de l'app (boutons, entrées de menu, liens d'action, raccourcis clavier via leur bouton équivalent). Écris `scripts/parity.mjs` : charge chaque route à 1440 px puis à 390 px (WebKit) avec la base de démonstration, ouvre les menus « ⋯ » et tiroirs, et **diffe l'ensemble des `data-action` réellement visibles et cliquables** (pas `display:none`, pas hors écran, taille ≥ 44 px sur mobile). Sortie : `docs/mobile/parite.md`, tableau route × action × PC × mobile.
2. **Comble chaque manque** avec le bon motif mobile, jamais en cachant : actions secondaires → feuille inférieure (« bottom sheet ») ouverte par « ⋯ » ; raccourcis clavier → boutons ; survol → appui long (400 ms, avec retour visuel) ou bouton explicite ; tableaux larges → cartes empilées ou défilement horizontal **contenu** dans son cadre ; glisser-déposer (classement, association, réordonnancement) → boutons ▲▼ ou appui-long-puis-glisser avec `touch-action: none` sur la poignée seulement ; carte mentale → pincer pour zoomer, deux doigts pour déplacer, double-tap pour ajuster, export par la feuille de partage ; import de fichiers → `<input type="file" accept multiple>` (les PDF/Word/photos arrivent par « Fichiers » ou la galerie) ; OneNote et OneDrive → flux MSAL par **redirection** (pas de popup : bloquées ou instables sur mobile), retour propre sur la page d'origine.
3. Vérifie que la **saisie de texte long** (rédaction manuelle d'une fiche, édition d'exercice, rappel libre) est utilisable : zone de texte qui grandit, barre d'outils minimale (gras, titre, formule `$…$`) au-dessus du clavier via `visualViewport`, aperçu KaTeX en direct sous le champ.
4. Critère : `parity.mjs` ne rapporte **aucune** action présente sur PC et absente sur mobile ; ce qui est volontairement différent (ex. raccourci clavier) est marqué « équivalent : … » dans le tableau.

## M1. Débogage massif et systématique

Passe la matrice, puis attaque **explicitement** chacune des classes de bugs ci-dessous (ce sont celles qui cassent presque toutes les web-apps sur téléphone) ; pour chacune, teste, corrige, ajoute un test :

1. **Hauteurs** : plus aucun `100vh` (→ `100dvh`, avec repli `-webkit-fill-available`) ; barre inférieure et en-têtes collants restent visibles quand la barre d'adresse Safari se rétracte ; `env(safe-area-inset-*)` sur les quatre côtés, y compris en paysage (encoche à gauche/droite).
2. **Clavier virtuel** : champ focalisé toujours visible (`visualViewport` `resize` + `scroll`) ; boutons de validation jamais cachés sous le clavier ; pas de saut de page à la fermeture du clavier ; `enterkeyhint` adapté (« Valider », « Suivant ») ; `inputmode` (`decimal` pour les nombres) ; **aucun zoom** à la mise au point (police ≥ 16 px partout dans les champs, y compris `select` et `textarea`).
3. **Débordement horizontal** : formules KaTeX longues dans un conteneur `overflow-x: auto` avec indication de défilement ; tableaux markdown idem ; mots longs et URL cassés (`overflow-wrap: anywhere`) ; images `max-width: 100%`. Le test de la matrice le mesure sur chaque page.
4. **Gestes** : le balayage des flashcards ne déclenche jamais le retour arrière du navigateur (zone morte de 24 px sur les bords, `touch-action: pan-y` sur la carte) ; pas de tirer-pour-rafraîchir accidentel (`overscroll-behavior-y: contain` sur le défilement principal) ; pas de double-tap-zoom sur les boutons (`touch-action: manipulation`) ; le glisser du classement n'entre pas en conflit avec le défilement.
5. **Modales et feuilles** : défilement de l'arrière-plan verrouillé sans perdre la position (`position: fixed` + restauration) ; fermeture par glisser vers le bas pour les feuilles ; focus et clavier : ouvrir une modale avec le clavier ouvert ne casse pas la mise en page ; le bouton de retour matériel/geste Android ferme la modale plutôt que la page (`history.pushState` + `popstate`).
6. **Mode installé (standalone)** : plus de barre d'adresse ni de bouton retour du navigateur → **bouton retour dans l'en-tête de chaque page qui n'est pas une racine d'onglet** ; les liens externes (`claude.ai`, Microsoft) s'ouvrent hors de l'app (`target="_blank" rel="noopener"`) et le retour se fait sans perdre l'état (prompt copié conservé, page restaurée) ; barre d'état lisible dans les deux thèmes ; l'app ne reste jamais sur un écran blanc au redémarrage (état de chargement + relance de la base).
7. **Hors ligne** : test Playwright avec `context.setOffline(true)` : toutes les pages s'ouvrent, réviser/s'entraîner/chrono fonctionnent, les actions réseau (OneNote, OneDrive, Claude) affichent un message clair au lieu d'échouer en silence ; mise à jour du service worker : bandeau « Nouvelle version — Recharger » plutôt qu'un rechargement forcé en pleine session.
8. **Stockage** : Safari en navigation privée refuse IndexedDB → message clair, pas d'écran blanc ; quota dépassé → message ; `storage.persist()` demandé au bon moment ; vérification que la base de démonstration n'est jamais semée en production.
9. **Canvas du fond sur iOS** : Safari limite la surface totale des canvas (≈ 16 M pixels par canvas et un budget mémoire global) : DPR plafonné à 1,5 sur mobile, taille recalculée à l'orientation, `OffscreenCanvas` remplacé par un canvas caché si absent (WebKit anciens), libération des `ImageBitmap` à la sortie de page ; par défaut « discret » sur mobile, jamais de `backdrop-filter` sur les cartes.
10. **Listes longues** : liste d'exercices d'une fiche (jusqu'à 300) et journal des statistiques : virtualisation (`@tanstack/react-virtual`, ~3 Ko) ou pagination si le rendu dépasse 100 ms sur Pixel 7 en CPU ×4.
11. **Orientation et redimensionnement** : passage portrait ↔ paysage sans perte d'état ni de position de défilement ; carte mentale et canvas recalculés.
12. **Erreurs console** : zéro sur toute la matrice — chaque avertissement React, chaque promesse rejetée non capturée est un bug à corriger.
13. Enfin, **une passe « à la main »** : pilote avec Playwright un parcours complet sur iPhone 14 WebKit : créer un cahier → coller un cours → générer (coller une réponse JSON de la fixture) → valider → réviser 10 exercices de types différents → chrono → résultats → carte mentale → statistiques → réglages → export. Enregistre une **trace Playwright** et une vidéo dans `docs/mobile/parcours/` ; regarde la vidéo image par image aux transitions et note ce qui saute, clignote ou se décale.

## M2. Performance mobile

1. **Bissection du TBT** (si le lot « Matin 1 » ne l'a pas fait — vérifie dans `DECISIONS.md`) : `scripts/tbt.mjs` (Lighthouse mobile, médiane de 3 passes), `git bisect` entre le commit d'avant la Nuit 1 et `nuit1/A3-7`, cause corrigée avant tout découpage.
2. **Découpage du bundle** (idem, si non fait) : routes en `React.lazy` avec squelettes de même hauteur ; KaTeX + mhchem à la demande au premier `$` ; MSAL uniquement quand OneNote/OneDrive est utilisé ; sql.js et JSZip pour l'export seulement ; moteur du fond et police STIX après le premier rendu ; test Playwright qui échoue si `katex`, `msal`, `sql-wasm` ou `depthField` sont chargés avant la première interaction sur le tableau de bord. Objectifs : bundle initial ≤ 250 Ko gzip, LCP ≤ 2,5 s et TBT ≤ 200 ms en Lighthouse mobile, perf ≥ 85 sur tableau de bord et session.
3. **Fluidité** : 60 fps sur la session, Pixel 7 CPU ×4, fond en « discret » ; pas de `backdrop-filter` ni d'ombres multicouches animées sur mobile ; `will-change` seulement pendant les gestes ; transitions de page à 150 ms sur mobile.
4. **Démarrage** : le tableau de bord affiche ses chiffres en < 1 s sur CPU ×4 après le cache du service worker (mesure « warm start ») ; les calculs lourds (récupérabilité moyenne, heatmap, simulation) sont différés après le premier rendu.
5. **Polices** : poids total au premier chargement mesuré et noté ; sous-ensemble latin ; `Fraunces` à la demande si absente de l'écran d'accueil.
6. Rapport : tableau avant/après (chunks, LCP, TBT, perf, fps, warm start).

## M3. Recherche (2 h maximum, avec WebSearch/WebFetch) puis décisions

Écris `docs/adr/0002-mises-a-jour-mobile.md`. Pour chaque sujet : ce que font les meilleures apps (Anki mobile/AnkiMobile, RemNote, Quizlet, Mochi, Duolingo pour les mécaniques mobiles), ce qui est faisable en PWA statique sans serveur, verdict selon le test d'utilité de la section 0, et estimation. Sujets imposés :

1. **« Connexion Google »**. Dans une app locale sans serveur, un compte Google ne sert qu'à une chose : **synchroniser via Google Drive `appDataFolder`** (dossier caché propre à l'app), comme alternative à OneDrive. Faisable côté client avec **Google Identity Services** (flux de jeton implicite pour SPA, sans secret) et l'API Drive v3 (`spaces=appDataFolder`), avec un identifiant client OAuth à créer par l'utilisateur dans Google Cloud (gratuit ; l'écran de consentement en mode test limite à 100 utilisateurs, à documenter). Verdict attendu : **retenu**, implémenté en M4 comme `GoogleDriveAppDataProvider` derrière l'interface `SyncProvider` existante (mêmes rondes, même manifeste, ETag via `headRevisionId` ou `modifiedTime` + `If-Match` si disponible). Il ne sert **pas** à « se connecter à l'app » : il n'y a pas de comptes dans Cahiers, dis-le dans l'ADR.
2. **Partager vers Cahiers** (`share_target` du manifeste) : depuis la galerie ou l'app Appareil photo, partager une ou plusieurs photos / un PDF directement vers Cahiers, qui ouvre « Rédiger avec Claude » avec les fichiers déjà attachés. C'est la fonction mobile la plus utile pour *capturer le cours* — vérifie le support (Android/Chromium : oui ; iOS Safari : non, à documenter) et implémente si le test d'utilité passe (le service worker doit intercepter le POST).
3. **Raccourcis du manifeste** (`shortcuts` : « Réviser », « Chrono », « Nouveau cours ») et **badge d'application** (`navigator.setAppBadge(nombreDus)`, iOS 16.4+ en mode installé, Android) : coût quasi nul, bénéfice réel. Verdict attendu : retenus.
4. **Notifications** : les rappels push exigent un serveur → écarté ; les notifications locales programmées n'existent pas en PWA → écarté ; le badge (point 3) est le substitut. Documente-le pour que la question ne revienne pas.
5. **Retour haptique** (`navigator.vibrate` 10 ms sur juste/faux, Android seulement) et **lecture audio** des flashcards (`speechSynthesis`, cahiers marqués « langue ») : retenus seulement si ≤ 1 jour et derrière un réglage.
6. **Widget d'écran d'accueil**, **Apple Watch**, **mode voiture**, **appels/Live Activities** : écartés (impossible en PWA), dis-le.
7. **Export « contenu seul »** (cahier sans historique ni état FSRS, pour donner ses fiches à des amis) et **import fusionnant** de ce fichier : retenu (déjà demandé), petit.
8. **Réviser depuis le téléphone avec Claude** : vérifie sur la doc publique si l'app Claude iOS/Android accepte le partage de texte + images via la feuille de partage et documente le meilleur enchaînement en 3 gestes ; si `navigator.share({ files })` est supporté, joindre les photos au partage.
9. Tout autre sujet trouvé pendant la recherche passe par le test d'utilité ; **au plus deux** retenus en plus de la liste ci-dessus.

## M4. Implémentation de ce qui a été retenu

Dans l'ordre : export contenu seul → raccourcis + badge → `share_target` → fournisseur Google Drive (tests contre un faux Drive : création du fichier dans `appDataFolder`, listing, mise à jour conditionnelle, 401/403 avec message citant l'autorisation `drive.appdata`, jeton expiré → reconnexion) + écran Réglages → Synchronisation avec Google comme troisième choix → haptique/audio si retenus. Chaque fonctionnalité : tests, entrée dans `DESCRIPTIF.md`, capture mobile.

Le fournisseur Google ne pourra pas être testé contre un vrai compte : le rapport doit donner **pas à pas** ce que l'utilisateur fait dans Google Cloud Console (créer un projet, activer l'API Drive, écran de consentement « externe » en mode test avec son adresse comme testeur, identifiant client « Application Web » avec les origines JavaScript autorisées `https://hadherbacheadem-ops.github.io` et `http://localhost:5173`, portée `https://www.googleapis.com/auth/drive.appdata`), puis où coller l'identifiant client dans Réglages.

## Fin de nuit — `RAPPORT_NUIT2.md`

1. Tableau des sections : fait / partiel / annulé, raison.
2. Matrice finale : erreurs console et débordements par page × appareil × moteur (doit être 0/0), lien vers la galerie.
3. `docs/mobile/bugs.md` : nombre de bugs trouvés/corrigés, les 10 plus graves en une ligne chacun.
4. Parité : nombre d'actions PC, nombre couvertes sur mobile, liste des « équivalents ».
5. Performance : avant/après.
6. ADR 0002 : décisions et écartés.
7. **À vérifier sur un vrai téléphone** (liste précise, avec ce qu'il faut observer).
8. **Actions manuelles** : Google Cloud (si retenu), `git push` pour publier, sur le téléphone : réinstaller l'app depuis le site publié après la mise à jour.

Commence par la section 0 (script de matrice) puis M0.

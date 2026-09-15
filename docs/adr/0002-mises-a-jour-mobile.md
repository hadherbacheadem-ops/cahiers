# ADR 0002 — Mises à jour, partage et capacités du téléphone

Statut : accepté (nuit 2, 15 septembre 2026). Décision prise sans l’utilisateur, selon la règle : données préservées > local sans serveur > simple > performant. Recherche limitée à deux heures ; les points « à vérifier sur un vrai téléphone » sont listés dans `RAPPORT_NUIT2.md`.

## Contexte

Cahiers est installé sur le téléphone (PWA, ADR 0001). Trois questions se posent au quotidien :

1. **Comment le contenu circule** entre le PC, le téléphone et des camarades : synchronisation d’un compte à l’autre, partage d’un cahier sans son historique de révision, aller-retour avec l’app Claude sur le téléphone.
2. **Ce que le téléphone sait faire de plus** qu’un onglet : raccourcis d’écran d’accueil, pastille de compteur, réception de partages, retour haptique, notifications, widgets.
3. **Ce qui reste hors de portée** sans serveur ni compte (la contrainte d’ADR 0001 tient : aucune donnée de cours ne transite par un service que l’utilisateur ne contrôle pas déjà, aucun compte créé dans Cahiers).

Chaque option est passée au **test d’utilité** : la fonctionnalité doit répondre à une action que l’utilisateur fait déjà (ou a demandée), sur au moins l’un des deux téléphones cibles (iPhone Safari, Android Chrome), sans dépendre d’un service payant. Ce qui échoue est consigné dans `docs/mobile/idees-ecartees.md`.

## Options étudiées

| # | Option | Ce que ça apporte | Contraintes techniques (vérifiées sur les docs plateformes, septembre 2026) | Coût | Effort | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Synchronisation Google Drive `appDataFolder`** via Google Identity Services (GIS), avec l’inscription OAuth *de l’utilisateur* (comme l’inscription Entra pour OneNote) | Le même moteur de fusion que OneDrive (`src/lib/sync/engine.ts`) pour ceux qui n’ont pas de compte Microsoft ; le dossier `appDataFolder` est invisible dans Drive, propre à l’app, sans quota supplémentaire | Périmètre `https://www.googleapis.com/auth/drive.appdata` (non sensible : pas de vérification Google pour passer en production). API Drive v3 : `files.list?spaces=appDataFolder`, `files.get?alt=media`, `upload/drive/v3/files?uploadType=multipart`. **Pas d’écriture conditionnelle (If-Match) sur Drive v3** : la concurrence optimiste du moteur est émulée avec le champ `version` du fichier (lecture → écriture → relecture ; si `version` a sauté de plus d’un cran, conflit et nouvelle tentative). Fenêtre de course de quelques centaines de ms, sans perte : les fichiers de changements sont nommés par appareil et jamais réécrits, seul le manifeste est contesté. GIS `initTokenClient` ouvre une popup ; en app installée iOS la popup est peu fiable → flux de redirection OAuth (`response_type=token`) en secours. Jeton d’une heure, pas de jeton de rafraîchissement côté navigateur : redemande silencieuse (`prompt: ''`) puis interactive. | 0 € | ½ nuit (fournisseur + faux Drive pour les tests + réglage + doc pas-à-pas) | **Retenu** |
| 2 | **`share_target`** (manifeste) : Cahiers reçoit un partage (texte, URL, titre) depuis n’importe quelle app | Depuis l’app Claude : « Partager » la réponse → Cahiers → la réponse est collée dans l’import. Depuis un navigateur ou une app de notes : un cours partagé → « Rédiger avec Claude » pré-rempli | Android Chrome, Edge, Samsung Internet : oui (`method: GET`, `params: {title, text, url}`). **iOS Safari : non pris en charge** (aucune date annoncée). Route `/partager?title=&text=&url=` ; en dehors d’un partage, la page redirige vers l’accueil | 0 € | 1 h | **Retenu** (Android ; sur iOS le presse-papiers reste le chemin) |
| 3 | **Raccourcis du manifeste** (« Réviser », « Nouvelle fiche », « Statistiques ») et **pastille** (`navigator.setAppBadge(dues)`) | Un appui long sur l’icône lance la session ; le nombre d’exercices dus sur l’icône, comme une app native | Raccourcis : Android Chrome, desktop ; iOS ignore. Pastille : Chromium (Android, desktop) sans autorisation ; iOS / iPadOS ≥ 17 pour les apps sur l’écran d’accueil, liée à l’autorisation de notifications. Mise à jour à chaque calcul de file (tableau de bord, fin de session), remise à zéro quand tout est fait | 0 € | 1 h | **Retenu** |
| 4 | **Notifications** de rappel (« 12 exercices dus ») | Le rappel quotidien, comme Anki ou Duolingo | Locales planifiées : l’API « Notification Triggers » n’a pas abouti ; il faut un **push** donc un serveur d’envoi et un abonnement par appareil ; iOS n’accepte le push web qu’en app installée. Contraire à « sans serveur » | 0 € puis serveur | 1–2 jours | **Écarté** (voir idées écartées : alternative = pastille + raccourci) |
| 5 | **Retour haptique et sonore** à la notation (`navigator.vibrate`, WebAudio) | Sentir « Su / Raté » sans regarder, comme un clavier | `vibrate` : Android Chrome oui ; **iOS Safari : non** (aucune API ; seul le `<input type=checkbox switch>` déclenche un haptique système depuis iOS 17.4). Son : WebAudio court, déverrouillé au premier toucher. Réglage « Retour à la notation » (vibration / son / aucun), vibration par défaut sur écran tactile, son désactivé par défaut | 0 € | ≤ 1 h | **Retenu** (≤ 1 jour de travail derrière un réglage, comme demandé) |
| 6 | Widgets d’écran d’accueil, complication / app Apple Watch | Le compteur sur l’écran d’accueil ou au poignet | Aucune API web ; il faudrait une app native (Swift) ou un wrapper (Capacitor) et un compte développeur Apple (99 €/an) | 99 €/an | Jours | **Écarté** |
| 7 | **Export « contenu seul »** et import fusionnant | Donner un cahier (fiches, exercices, cartes mentales, points de cours) à un camarade **sans** son journal FSRS, ses états de cartes ni ses réglages ; le camarade importe en fusion : les identifiants sont conservés, un second import met à jour au lieu de dupliquer | Même fichier JSON que la sauvegarde, tables `reviewLogs`, `settings`, `tombstones` vides et états FSRS remis à neuf ; l’import passe par `mergeBackup` (moteur de fusion existant). Partage par le bouton système (`navigator.share({ files })`, Android et iOS) ou téléchargement | 0 € | 1 h | **Retenu** |
| 8 | Flux avec l’app Claude sur téléphone | Le prompt part vers Claude, la réponse revient dans Cahiers sans copier-coller à la main | Aller : `navigator.share({ text: prompt })` (iOS et Android) → l’app Claude apparaît dans la feuille de partage. Retour : option 2 sur Android ; sur iOS, « Copier » dans Claude puis « Coller la réponse » dans Cahiers (bouton existant) | 0 € | ½ h (bouton « Envoyer à Claude » sur téléphone) | **Retenu** (avec 2) |
| 9 | *Idée supplémentaire* — `file_handlers` : ouvrir un `.cahiers.json` depuis l’app Fichiers directement dans Cahiers | Restaurer ou fusionner sans passer par Réglages | Chromium desktop et Android ; iOS non | 0 € | ½ h | Écarté pour cette nuit (faible fréquence d’usage ; à faire si demandé) |
| 10 | *Idée supplémentaire* — Synchronisation périodique en arrière-plan (`periodicSync`) | La sync tourne même app fermée | Chromium seulement, soumis à un score d’engagement du site, jamais sur iOS | 0 € | 1 h | Écarté (comportement imprévisible) |

## Décision

Retenus, dans l’ordre d’implémentation (M4) : **7** export « contenu seul » → **3** raccourcis + pastille → **2** `share_target` (+ **8** bouton « Envoyer à Claude ») → **1** `GoogleDriveAppDataProvider` (tests sur un faux Drive, troisième choix dans Réglages, guide Google Cloud pas à pas) → **5** retour haptique / sonore.

Principes tenus :

- **Aucun compte dans Cahiers** : Google, comme Microsoft, est l’inscription OAuth de l’utilisateur (son projet Google Cloud, son identifiant client), jamais une clé embarquée.
- **Rien ne transite ailleurs** : le dossier `appDataFolder` est dans le Drive de l’utilisateur ; les partages (`share_target`, export) sont déclenchés par lui.
- **Chaque capacité se dégrade proprement** : sans `share_target` (iOS) il reste le presse-papiers ; sans `vibrate` (iOS) il reste le son ou rien ; sans pastille il reste le compteur du tableau de bord.

## Addendum (Matin 2, 15 septembre 2026) — écriture du manifeste sur Google Drive

Drive v3 n’offre pas de précondition `If-Match` fiable sur `files.update` : la seule vérification par le champ `version` (nuit 2) laissait deux appareils synchronisant au même instant s’écraser mutuellement `manifest.json`. Le fournisseur Google applique désormais deux gardes autour de chaque écriture du manifeste, sans toucher aux autres fournisseurs :

1. **Avant d’écrire**, relire `headRevisionId` et le comparer à celui lu au début de la ronde ; s’il a changé, recommencer la ronde sans écrire.
2. **Chaque écriture porte un `writeToken` aléatoire** (`appProperties`, envoyé dans la même requête multipart que le contenu) ; après l’écriture, relire les métadonnées et comparer le jeton ; s’il diffère, un autre appareil a écrit entre-temps → recommencer la ronde (3 essais, comme pour le 412 OneDrive).

Les fichiers de lots restent créés une seule fois sous un nom unique et ne sont jamais réécrits : ils ne peuvent pas être perdus, seule la référence dans le manifeste peut l’être, et c’est ce que les deux gardes protègent. Testé contre le faux Drive : deux appareils écrivent le manifeste au même moment (le faux Drive intercale la ronde du second entre l’écriture et la relecture du premier) → le premier recommence, l’état final contient les lots des deux, les deux bases convergent.

**Fenêtre résiduelle** : entre la relecture de `headRevisionId` et l’arrivée de notre écriture chez Google, soit un aller-retour réseau (quelques centaines de millisecondes). Deux appareils d’un même utilisateur qui écrivent le manifeste dans cette fenêtre-là auraient chacun leur jeton contesté par l’autre et recommenceraient tous les deux ; pour qu’une référence de lot soit perdue, il faudrait que les deux relectures ratent aussi la course, ce qui demande deux coïncidences de l’ordre de la latence réseau sur une synchronisation automatique toutes les dix minutes. Acceptable pour un seul utilisateur sur deux appareils ; la sync est de toute façon idempotente et un lot dont la référence serait perdue reste dans le dossier, prêt à être ré-indexé par un instantané (« Réinitialiser le curseur » dans Réglages).

## Conséquences

- Un troisième fournisseur de synchronisation, avec les mêmes tests de fusion que OneDrive (faux Drive en mémoire qui reproduit l’absence d’If-Match).
- Un guide `docs/google-cloud.md` (projet, écran de consentement en mode *Test* avec l’utilisateur comme testeur, identifiant client Web, origines et URI de redirection, API Drive activée).
- Le manifeste gagne `shortcuts` et `share_target` ; la route `/partager` existe.
- Les captures et tests de la matrice restent le critère de sortie : 0 erreur console, 0 débordement.

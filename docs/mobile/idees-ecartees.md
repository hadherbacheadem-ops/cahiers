# Idées écartées — Nuit 2

Chaque fonctionnalité mobile a passé un test d’utilité (ADR 0002) : répondre à une action que l’utilisateur fait déjà, sur au moins un des deux téléphones cibles, sans service payant ni compte créé dans Cahiers. Ce qui échoue est ici, avec la raison, pour ne pas y revenir sans nouvel argument.

| Idée | Pourquoi écartée | Ce qui la remplace |
|---|---|---|
| Notifications de rappel (« 12 exercices dus ») | Pas de notification locale planifiée sur le web (« Notification Triggers » abandonné) ; il faudrait un push, donc un serveur d’envoi et un abonnement par appareil ; iOS n’accepte le push web qu’en app installée. Contraire à « sans serveur ». | Pastille sur l’icône (`setAppBadge`) + raccourci « Réviser » ; le tableau de bord reste la vérité. |
| Widgets d’écran d’accueil, Apple Watch | Aucune API web ; passer par une app native ou un wrapper (Capacitor) et un compte développeur Apple à 99 €/an. | Pastille + raccourcis du manifeste. |
| Synchronisation périodique en arrière-plan (`periodicSync`) | Chromium seulement, déclenchement soumis à un score d’engagement du site, jamais sur iOS : comportement imprévisible pour l’utilisateur. | Sync au démarrage, après une session et toutes les 10 minutes onglet visible (existant). |
| `file_handlers` (ouvrir un `.cahiers.json` depuis Fichiers) | Chromium desktop / Android seulement ; usage rare (une restauration par an). | « Restaurer » et « Fusionner » dans Réglages. |
| Clavier LaTeX complet (palette de 200 symboles) | Plus long à parcourir que taper `\alpha` ; l’essentiel tient sur une rangée. | `MathToolbar` : 30 touches, aperçu KaTeX, au-dessus du clavier (M0). |
| Menu contextuel par appui long sur les fiches et exercices | Invisible (rien ne signale qu’un appui long existe) ; les mêmes actions sont déjà dans le menu ⋯ et les boutons. | Menus ⋯ en feuille du bas (M0). |
| Virtualisation par fenêtre (react-window) des listes d’exercices | Dépendance et changement de structure pour des listes de 30 à 200 éléments ; `content-visibility: auto` donne le même effet sans code. | `cv-auto` sur les lignes (M1). |
| Compression Brotli / pré-compression des assets | GitHub Pages sert déjà gzip ; Brotli n’est pas contrôlable côté dépôt. | Découpage du bundle (M2). |
| Police STIX Two Math sous-ensemble (403 Ko → ~60 Ko) | `fonttools` absent de la machine ; la police n’est chargée que par le fond animé, désormais évitée sur téléphone. | Police mathématique système sur téléphone (M2). |
| Fraunces « standard » (67 Ko) à la place de « full » (121 Ko) | Le titre utilise l’axe SOFT (30) que seule la variante « full » porte ; 54 Ko économisés contre un changement de dessin des titres. | Inchangé ; `font-display: optional`, précaché. |
| Détection du presse-papiers au retour dans l’app (réponse Claude copiée) | `clipboard.readText()` exige un geste et une autorisation à chaque fois sur iOS ; surprend l’utilisateur. | Bouton « Coller la réponse » (existant) et `share_target` sur Android (M4). |

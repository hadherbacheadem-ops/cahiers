# Parité PC → mobile

Généré par `scripts/parity.mjs` le 15/09/2026 04:59:40. PC = Chromium 1440 px ; mobile = iPhone 14 WebKit 390 px. Une action compte comme couverte sur mobile si elle est rendue, visible, active et d’au moins 44 px de côté ; « équivalent » = choix délibéré documenté dans `scripts/lib/parity-equivalents.json`.
**Actions PC : 153 · couvertes sur mobile : 153 · manquantes : 0 · cibles < 44 px sur mobile : 0 · sans `data-action` explicite : 0**


## dashboard

| action | PC | mobile | note |
|---|---|---|---|
| accueil | – | ✓ | mobile seulement |
| chrono | ✓ | ✓ |  |
| nav-aujourd-hui | – | ✓ | mobile seulement |
| nav-cahier | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; les cahiers s’ouvrent depuis l’onglet « Cahiers » (ouvrir-le-cahier) |
| nav-cahiers | – | ✓ | mobile seulement |
| nav-reglages | ✓ | ✗ | équivalent : onglet « Réglages » de la barre du bas |
| nav-statistiques | ✓ | ✗ | équivalent : onglet « Statistiques » de la barre du bas |
| nav-tableau-de-bord | ✓ | ✗ | équivalent : onglet « Aujourd’hui » de la barre du bas (nav-aujourd-hui) |
| ne-plus-proposer | – | ✓ | mobile seulement |
| nouveau-cahier | ✓ | ✗ | équivalent : bouton « Nouveau cahier » de la page Cahiers (onglet du bas) ; le + de la barre latérale n’existe pas sur téléphone |
| ouvrir-le-cahier | ✓ | ✓ |  |
| replier-la-barre | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; la navigation est la barre du bas (nav-aujourd-hui, nav-cahiers, nav-statistiques, nav-reglages) |
| reviser | ✓ | ✓ |  |
| seance | ✓ | ✓ |  |
| statistiques | ✓ | ✗ | équivalent : onglet « Statistiques » de la barre du bas (nav-statistiques) |

## cahiers

| action | PC | mobile | note |
|---|---|---|---|
| accueil | – | ✓ | mobile seulement |
| nav-aujourd-hui | – | ✓ | mobile seulement |
| nav-cahier | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; les cahiers s’ouvrent depuis l’onglet « Cahiers » (ouvrir-le-cahier) |
| nav-cahiers | – | ✓ | mobile seulement |
| nav-reglages | ✓ | ✗ | équivalent : onglet « Réglages » de la barre du bas |
| nav-statistiques | ✓ | ✗ | équivalent : onglet « Statistiques » de la barre du bas |
| nav-tableau-de-bord | ✓ | ✗ | équivalent : onglet « Aujourd’hui » de la barre du bas (nav-aujourd-hui) |
| ne-plus-proposer | – | ✓ | mobile seulement |
| nouveau-cahier | ✓ | ✗ | équivalent : bouton « Nouveau cahier » de la page Cahiers (onglet du bas) ; le + de la barre latérale n’existe pas sur téléphone |
| ouvrir-le-cahier | ✓ | ✓ |  |
| replier-la-barre | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; la navigation est la barre du bas (nav-aujourd-hui, nav-cahiers, nav-statistiques, nav-reglages) |

## cahier

| action | PC | mobile | note |
|---|---|---|---|
| accueil | – | ✓ | mobile seulement |
| ajouter | ✓ | ✓ |  |
| ajouter-un-examen | ✓ | ✓ |  |
| avancer-des-revisions | ✓ | ✓ |  |
| chrono | ✓ | ✓ |  |
| fil-d-ariane | ✓ | ✓ |  |
| generer-avec-claude | ✓ | ✓ |  |
| importer-une-fiche | ✓ | ✓ |  |
| lancer-la-seance | ✓ | ✓ |  |
| modifier-l-examen | ✓ | ✓ |  |
| modifier-le-cahier | ✓ | ✓ |  |
| modifier-le-programme | ✓ | ✓ |  |
| nav-aujourd-hui | – | ✓ | mobile seulement |
| nav-cahier | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; les cahiers s’ouvrent depuis l’onglet « Cahiers » (ouvrir-le-cahier) |
| nav-cahiers | – | ✓ | mobile seulement |
| nav-reglages | ✓ | ✗ | équivalent : onglet « Réglages » de la barre du bas |
| nav-statistiques | ✓ | ✗ | équivalent : onglet « Statistiques » de la barre du bas |
| nav-tableau-de-bord | ✓ | ✗ | équivalent : onglet « Aujourd’hui » de la barre du bas (nav-aujourd-hui) |
| ne-plus-proposer | – | ✓ | mobile seulement |
| nouveau-cahier | ✓ | ✗ | équivalent : bouton « Nouveau cahier » de la page Cahiers (onglet du bas) ; le + de la barre latérale n’existe pas sur téléphone |
| ouvrir-la-fiche | ✓ | ✓ |  |
| photographier-un-cours | ✓ | ✓ |  |
| plus-d-actions | ✓ | ✓ |  |
| pre-test | ✓ | ✓ |  |
| rediger-avec-claude | ✓ | ✓ |  |
| replier-la-barre | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; la navigation est la barre du bas (nav-aujourd-hui, nav-cahiers, nav-statistiques, nav-reglages) |
| reporter-des-revisions | ✓ | ✓ |  |
| reviser | ✓ | ✓ |  |
| reviser-tout-maintenant | ✓ | ✓ |  |
| s-entrainer | ✓ | ✓ |  |
| supprimer-l-examen | ✓ | ✓ |  |
| supprimer-le-cahier | ✓ | ✓ |  |

## fiche

| action | PC | mobile | note |
|---|---|---|---|
| accueil | – | ✓ | mobile seulement |
| afficher-la-reponse | ✓ | ✓ |  |
| afficher-toute-la-fiche | – | ✓ | mobile seulement |
| completer | ✓ | ✓ |  |
| detail | ✓ | ✓ |  |
| fil-d-ariane | ✓ | ✓ |  |
| filtre-type | ✓ | ✓ |  |
| generer-des-exercices | ✓ | ✓ |  |
| generer-pour-ces-points | ✓ | ✓ |  |
| modifier | ✓ | ✓ |  |
| modifier-l-exercice | ✓ | ✓ |  |
| modifier-la-fiche | ✓ | ✓ |  |
| nav-aujourd-hui | – | ✓ | mobile seulement |
| nav-cahier | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; les cahiers s’ouvrent depuis l’onglet « Cahiers » (ouvrir-le-cahier) |
| nav-cahiers | – | ✓ | mobile seulement |
| nav-reglages | ✓ | ✗ | équivalent : onglet « Réglages » de la barre du bas |
| nav-statistiques | ✓ | ✗ | équivalent : onglet « Statistiques » de la barre du bas |
| nav-tableau-de-bord | ✓ | ✗ | équivalent : onglet « Aujourd’hui » de la barre du bas (nav-aujourd-hui) |
| ne-plus-proposer | – | ✓ | mobile seulement |
| nouveau-cahier | ✓ | ✗ | équivalent : bouton « Nouveau cahier » de la page Cahiers (onglet du bas) ; le + de la barre latérale n’existe pas sur téléphone |
| regenerer | ✓ | ✓ |  |
| replier-la-barre | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; la navigation est la barre du bas (nav-aujourd-hui, nav-cahiers, nav-statistiques, nav-reglages) |
| reviser | ✓ | ✓ |  |
| reviser-les-associations | ✓ | ✓ |  |
| reviser-les-cartes-mentales-a-trous | ✓ | ✓ |  |
| reviser-les-classements | désactivée | désactivée |  |
| reviser-les-demonstrations-methodes | désactivée | désactivée |  |
| reviser-les-flashcards | ✓ | ✓ |  |
| reviser-les-qcm | ✓ | ✓ |  |
| reviser-les-rappels-libres | désactivée | désactivée |  |
| reviser-les-textes-a-trous | ✓ | ✓ |  |
| reviser-les-vrai-faux | désactivée | désactivée |  |
| supprimer-l-exercice | ✓ | ✓ |  |
| supprimer-la-fiche | ✓ | ✓ |  |
| suspendre | ✓ | ✓ |  |
| tout-faire | ✓ | ✓ |  |
| voir-la-carte-mentale | ✓ | ✓ |  |

## train-before

| action | PC | mobile | note |
|---|---|---|---|
| aide-et-raccourcis | ✓ | ✓ |  |
| annuler-la-derniere-reponse | désactivée | désactivée |  |
| modifier-l-exercice | ✓ | ✓ |  |
| plus-d-actions | ✓ | ✓ |  |
| quitter | ✓ | ✓ |  |
| retourner-la-carte | ✓ | ✓ |  |
| revoir-demain | ✓ | ✓ |  |
| suspendre | ✓ | ✓ |  |

## train-after

| action | PC | mobile | note |
|---|---|---|---|
| aide-et-raccourcis | ✓ | ✓ |  |
| annuler-la-derniere-reponse | désactivée | désactivée |  |
| modifier-l-exercice | ✓ | ✓ |  |
| note-again | ✓ | ✓ |  |
| note-good | ✓ | ✓ |  |
| plus-d-actions | ✓ | ✓ |  |
| plus-de-nuances | ✓ | ✓ |  |
| quitter | ✓ | ✓ |  |
| retourner-la-carte | désactivée | désactivée |  |
| revoir-demain | ✓ | ✓ |  |
| suspendre | ✓ | ✓ |  |

## chrono

| action | PC | mobile | note |
|---|---|---|---|
| aide-et-raccourcis | ✓ | ✓ |  |
| annuler-la-derniere-reponse | désactivée | désactivée |  |
| modifier-l-exercice | ✓ | ✓ |  |
| plus-d-actions | ✓ | ✓ |  |
| quitter | ✓ | ✓ |  |
| reponse-faux | ✓ | ✓ |  |
| reponse-vrai | ✓ | ✓ |  |
| suspendre | ✓ | ✓ |  |

## results

| action | PC | mobile | note |
|---|---|---|---|
| quitter | ✓ | ✓ |  |
| recommencer | ✓ | ✓ |  |
| terminer | ✓ | ✓ |  |

## validate

| action | PC | mobile | note |
|---|---|---|---|
| garder | ✓ | ✓ |  |
| ignorer | ✓ | ✓ |  |
| modifier | ✓ | ✓ |  |
| quitter | ✓ | ✓ |  |
| tout-garder | ✓ | ✓ |  |

## mindmap

| action | PC | mobile | note |
|---|---|---|---|
| ajuster | ✓ | ✓ |  |
| noeud | ✓ | ✓ | cible 15 px |
| png | ✓ | ✓ |  |
| regenerer | ✓ | ✓ |  |
| retour | ✓ | ✓ |  |
| s-entrainer | ✓ | ✓ |  |
| supprimer | ✓ | ✓ |  |
| svg | ✓ | ✓ |  |
| tout-deplier | désactivée | désactivée |  |
| zoom-arriere | ✓ | ✓ |  |
| zoom-avant | ✓ | ✓ |  |

## stats

| action | PC | mobile | note |
|---|---|---|---|
| accueil | – | ✓ | mobile seulement |
| nav-aujourd-hui | – | ✓ | mobile seulement |
| nav-cahier | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; les cahiers s’ouvrent depuis l’onglet « Cahiers » (ouvrir-le-cahier) |
| nav-cahiers | – | ✓ | mobile seulement |
| nav-reglages | ✓ | ✗ | équivalent : onglet « Réglages » de la barre du bas |
| nav-statistiques | ✓ | ✗ | équivalent : onglet « Statistiques » de la barre du bas |
| nav-tableau-de-bord | ✓ | ✗ | équivalent : onglet « Aujourd’hui » de la barre du bas (nav-aujourd-hui) |
| ne-plus-proposer | – | ✓ | mobile seulement |
| nouveau-cahier | ✓ | ✗ | équivalent : bouton « Nouveau cahier » de la page Cahiers (onglet du bas) ; le + de la barre latérale n’existe pas sur téléphone |
| periode-30 | ✓ | ✓ |  |
| periode-7 | ✓ | ✓ |  |
| periode-90 | ✓ | ✓ |  |
| replier-la-barre | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; la navigation est la barre du bas (nav-aujourd-hui, nav-cahiers, nav-statistiques, nav-reglages) |

## settings

| action | PC | mobile | note |
|---|---|---|---|
| accueil | – | ✓ | mobile seulement |
| aide-identifiant | ✓ | ✓ |  |
| choisir-le-fichier-de-sauvegarde | ✓ | ✗ | équivalent : dossier local partagé = API File System Access, absente de WebKit (iPhone, iPad) ; sur téléphone la synchronisation passe par OneDrive ou Google Drive (M4) |
| demander-la-persistance | ✓ | ✓ |  |
| exercices-en-csv | ✓ | ✓ |  |
| exercices-en-tsv | ✓ | ✓ |  |
| exporter-le-journal-fsrs | ✓ | ✓ |  |
| exporter-maintenant | ✓ | ✓ |  |
| exporter-pour-anki | ✓ | ✓ |  |
| exporter-une-sauvegarde | ✓ | ✓ |  |
| fond-anime | ✓ | ✓ |  |
| fusionner-une-sauvegarde | ✓ | ✓ |  |
| nav-aujourd-hui | – | ✓ | mobile seulement |
| nav-cahier | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; les cahiers s’ouvrent depuis l’onglet « Cahiers » (ouvrir-le-cahier) |
| nav-cahiers | – | ✓ | mobile seulement |
| nav-reglages | ✓ | ✗ | équivalent : onglet « Réglages » de la barre du bas |
| nav-statistiques | ✓ | ✗ | équivalent : onglet « Statistiques » de la barre du bas |
| nav-tableau-de-bord | ✓ | ✗ | équivalent : onglet « Aujourd’hui » de la barre du bas (nav-aujourd-hui) |
| ne-plus-proposer | – | ✓ | mobile seulement |
| nouveau-cahier | ✓ | ✗ | équivalent : bouton « Nouveau cahier » de la page Cahiers (onglet du bas) ; le + de la barre latérale n’existe pas sur téléphone |
| ou-synchroniser | ✓ | ✓ |  |
| replier-la-barre | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; la navigation est la barre du bas (nav-aujourd-hui, nav-cahiers, nav-statistiques, nav-reglages) |
| restaurer-une-sauvegarde | ✓ | ✓ |  |
| section | ✓ | ✓ |  |
| theme | ✓ | ✓ |  |
| tout-effacer | ✓ | ✓ |  |

## aide

| action | PC | mobile | note |
|---|---|---|---|
| accueil | – | ✓ | mobile seulement |
| fil-d-ariane | ✓ | ✓ |  |
| nav-aujourd-hui | – | ✓ | mobile seulement |
| nav-cahier | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; les cahiers s’ouvrent depuis l’onglet « Cahiers » (ouvrir-le-cahier) |
| nav-cahiers | – | ✓ | mobile seulement |
| nav-reglages | ✓ | ✗ | équivalent : onglet « Réglages » de la barre du bas |
| nav-statistiques | ✓ | ✗ | équivalent : onglet « Statistiques » de la barre du bas |
| nav-tableau-de-bord | ✓ | ✗ | équivalent : onglet « Aujourd’hui » de la barre du bas (nav-aujourd-hui) |
| ne-plus-proposer | – | ✓ | mobile seulement |
| nouveau-cahier | ✓ | ✗ | équivalent : bouton « Nouveau cahier » de la page Cahiers (onglet du bas) ; le + de la barre latérale n’existe pas sur téléphone |
| replier-la-barre | ✓ | ✗ | équivalent : la barre latérale n’existe pas sur téléphone ; la navigation est la barre du bas (nav-aujourd-hui, nav-cahiers, nav-statistiques, nav-reglages) |

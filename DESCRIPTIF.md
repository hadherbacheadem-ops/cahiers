# Cahiers — descriptif

Application web locale de révision pour lycée / prépa / université. Elle transforme les cours en fiches, les fiches en exercices et en cartes mentales, puis fait réviser avec de la répétition espacée. **Aucune clé API** : chaque fonction « intelligente » construit un prompt, l'ouvre dans claude.ai avec le compte de l'utilisateur, et l'app importe la réponse JSON collée en retour, après validation.

## Principes

- **Tout est local** : React + Vite, données dans IndexedDB (Dexie), sauvegarde/restauration JSON versionnée. Rien n'est envoyé ailleurs que ce que l'utilisateur colle lui-même dans Claude.
- **Récupération active partout** : l'app ne propose aucun mode d'étude passif comme révision ; la lecture d'une fiche ou d'une carte est un support de vérification, pas une révision.
- **Un journal unique** (`reviewLogs`) enregistre chaque réponse ; toutes les statistiques et le planificateur en dérivent.

## Organisation

- **Cahier** = une matière (nom, couleur, programme de l'année : extrait du BO et plan de cours).
- **Fiche** (`chapitre`) = une page de cours en markdown léger, avec sa source (texte collé, Word, PDF, OneNote, rédigée par Claude).
- **Point de cours** = unité atomique d'une fiche (titre, nature — définition, formule, théorème, démonstration, méthode, ordre de grandeur, exemple, date — et *ancre* : citation courte du passage). Tout exercice est rattaché à un point ; les exercices d'un même point sont des *siblings*.
- **Exercice** : six types actuels (flashcard, texte à trous, QCM, vrai/faux, association, classement), difficulté 1–3, tags, statut (`à valider`, `actif`, `suspendu`, `leech`), origine (Claude, manuel, carte inverse automatique), état de planification.

## Entrer ses cours

- **Coller** du texte, **importer** `.docx` / PDF / `.txt` / `.md`, **OneNote** via Microsoft Graph (inscription d'application gratuite, guidée dans les réglages), ou **Rédiger avec Claude** : cours du prof + notes de classe (+ manuel) → fiche structurée, sans perte de contenu, avec « L'essentiel » et, si le programme est renseigné, la liste « À compléter ».
- **Compléter** une fiche : Claude la compare au programme et propose des compléments (notion manquante / à préciser / correction) dans une section à part ; chacun est gardé (ajouté à la fiche) ou ignoré.

## Exercices et révision

- **Génération** : types autorisés cochés, couverture exhaustive demandée (un exercice par point de cours, aussi petit soit-il), validation à l'import.
- **Modes** : *Réviser* (uniquement ce qui est dû ; seul mode qui déplace le planning), *S'entraîner* (tout, ratés re-proposés), *Chrono* (compte à rebours + N questions). Raccourcis clavier partout.
- **Planificateur** : SM-2 simplifié — remplacé par FSRS en phase 1.
- **Cartes mentales** : par fiche ou synthèse d'un cahier, dessinées dans l'app (zoom, déplacement, pliage, export PNG/SVG).

## Tableau de bord et réglages

Exercices dus, série de jours, réponses et précision de la semaine, statistiques par cahier. Réglages : niveau d'études (rappelé dans chaque prompt), types d'exercices par défaut, chrono, thème, OneNote, sauvegarde.

## Données et compatibilité

- Schéma IndexedDB **v3** : `cahiers, chapitres, points, exercises, reviewLogs, settings, supplements, mindmaps`.
- Sauvegarde JSON `schemaVersion: 3` ; les fichiers v1 et v2 restent importables (migration automatique, testée). L'import est idempotent (aucun doublon si un fichier est importé deux fois).
- Tests : `npm test` (vitest) — migrations et base de données.

## Historique des phases

- **Phase 0** (2026-09-12) : état des lieux, dépôt git, versionnage du schéma, journal `reviewLogs` (remplace `attempts`), table `points`, champs `pointId / status / origin` sur les exercices, migration des sauvegardes v1/v2, S'entraîner et Chrono ne déplacent plus le planning, tests unitaires.

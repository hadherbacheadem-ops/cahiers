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
- **Exercice** : huit types (flashcard, texte à trous, QCM, vrai/faux + correction, association, classement, **démonstration à estompage**, **rappel libre guidé**), difficulté 1–3, tags, statut (`à valider`, `actif`, `suspendu`, `leech`), origine (Claude, manuel, carte inverse automatique), état de planification FSRS, niveau d'estompage pour les démonstrations.

## Entrer ses cours

- **Coller** du texte, **importer** `.docx` / PDF / `.txt` / `.md`, **OneNote** via Microsoft Graph (inscription d'application gratuite, guidée dans les réglages), ou **Rédiger avec Claude** : cours du prof + notes de classe (+ manuel) → fiche structurée, sans perte de contenu, formules et unités en LaTeX, avec « L'essentiel » et, si le programme est renseigné, la liste « À compléter ».
- **Compléter** une fiche : Claude la compare au programme et propose des compléments (notion manquante / à préciser / correction, en LaTeX pour les formules) dans une section à part ; chacun est gardé (ajouté à la fiche) ou ignoré.

## Exercices et révision

- **Génération en deux temps** : Claude liste d'abord les *points de cours* de la fiche (titre, nature, citation exacte), puis écrit 1 à 3 exercices par point selon des règles strictes (un fait par exercice, question autonome, un seul trou, distracteurs compétitifs justifiés, énoncé corrigé pour les vrai/faux, formules en LaTeX). Le JSON est validé par schéma, chaque exercice passe un **linter** (14 règles) et un **dédoublonnage** ; tout arrive dans une **file « à valider »** (J garder, K ignorer, E modifier, Ctrl+A tout garder) avant d'entrer dans le planning — ou directement actif si l'option « toujours tout garder » est cochée.
- **Couverture** : la fiche affiche les points sans exercice et les passages sans point, avec un bouton « Générer pour ces points » ; chaque complément gardé propose « Générer les exercices de ce complément ».
- **Rendu** : markdown et **LaTeX (KaTeX, mhchem)** partout — fiches, compléments, exercices en session, résultats, validation, édition.
- **Édition** : chaque exercice est modifiable (formulaire par type, aperçu rendu, linter en direct), suspendable, réactivable.
- **Modes** : *Réviser* (uniquement ce qui est dû ; seul mode qui déplace le planning ; file **entrelacée** entre fiches et types, jamais deux exercices du même point à la suite, sauf cahiers « vocabulaire » gardés bloqués par fiche ; les frères d'un exercice répondu sont **enterrés** à demain), *S'entraîner* (tout, ratés re-proposés), *Chrono* (compte à rebours + N questions, **correction différée** en fin de quiz). En session : `E` modifier, `-` revoir demain, `@` suspendre, `Ctrl+Z` annuler, `?` aide. Un exercice raté 8 fois devient un **leech** : réécriture par Claude en exercices atomiques, suspension ou poursuite.
- **Préparation d'examen** : par cahier, un examen = nom, date, fiches concernées. Dès lors, les intervalles de ces fiches sont plafonnés à la moitié du temps restant, la rétention visée passe à 95 % à l'approche (J−14 par défaut), et un plan de **réapprentissage successif** en trois séances (ex. J−12, J−6, J−1) apparaît sur le cahier et le tableau de bord : à chaque séance, chaque exercice doit être rappelé correctement une fois. « Réviser tout maintenant » (cramming) passe tout en revue du plus fragile au plus solide sans toucher au planning. Après la date, tout revient aux réglages généraux et l'examen s'archive.
- **Carte mentale à trous / reconstruction** : chaque carte de fiche crée deux exercices — retrouver 30 à 50 % des nœuds masqués (masque différent à chaque révision), ou reconstruire les sous-nœuds de chaque branche de mémoire puis comparer. Ils arrivent dans la file « à valider » (ou directement actifs si le réglage « activer les exercices de carte » est coché) ; régénérer la carte les conserve avec leur historique, seule la suppression explicite les efface. Lire la carte reste possible mais n'est plus une révision.
- **Saisie de la réponse** : les flashcards marquées « à saisir » (formules, valeurs) ou toutes si le réglage est activé demandent d'écrire la réponse avant la révélation. Texte : comparaison tolérante (casse, accents) avec diff mot à mot, « Bien » suggéré à partir de 85 % de similarité, « Encore » sous 60 %, rien entre les deux. Formule : « Bien » suggéré uniquement si l'écriture LaTeX normalisée est identique (`\dfrac` = `\frac`, `\times` = `\cdot`, espaces et `{x}` superflus ignorés) ; sinon aucun bouton mis en avant et un diff caractère par caractère. La décision finale reste à l'élève.
- **Cartes inverses automatiques** : pour les points « définition » et « formule », la carte réponse → question est ajoutée à la validation.
- **Rappel libre guidé** : écrire tout ce qu'on sait sur la fiche, puis cocher la liste des notions attendues ; les notions manquées relancent leurs exercices en priorité. **Démonstrations** : exemple résolu avec une étape masquée, puis la moitié, puis reconstitution complète (deux réussites montent d'un niveau). **Vrai/Faux** : répondre « Faux » impose d'écrire l'énoncé corrigé avant la révélation ; un verdict faux vaut « Encore » d'office, un verdict juste avec correction affiche les deux énoncés côte à côte et laisse la note à l'élève (quatre boutons, le plus probable mis en avant).
- **Planificateur FSRS** (ts-fsrs, FSRS-6) : chaque exercice porte difficulté, stabilité et échéance ; la rétention visée (80–95 %, défaut 90 %) fixe la fréquence, avec la charge correspondante estimée par une simulation FSRS de 90 jours sur les cartes actives. Boutons *Encore / Difficile / Bien / Facile* avec l'intervalle qu'ils programment ; **annulation** de la dernière réponse (Ctrl+Z). Limites par jour (nouveaux, révisions) globales et par cahier, jours légers, intervalle maximal ; *Reporter* / *Avancer* des révisions depuis un cahier avec l'impact estimé. Export du journal au format de l'optimiseur FSRS.
- **Cartes mentales** : par fiche ou synthèse d'un cahier, dessinées dans l'app (zoom, déplacement, pliage, export PNG/SVG).

## Pré-test

Avant d'étudier un nouveau chapitre, un pré-test de 3 à 5 questions conceptuelles (générées depuis le programme) : réponses libres, corrigé en fin de test ; les questions sont ensuite proposées comme points à couvrir par les exercices de la fiche.

## Confiance et calibration

Avant de révéler une réponse (flashcard, démonstration, texte à trous), l'app demande « Sûr / Hésitant / Aucune idée » (S, H, A). Une erreur commise avec confiance est retestée à J+1 et J+7 en plus du planning (hypercorrection). La page Statistiques montre la calibration : quand « sûr » réussit sous 85 %, un message le signale.

## Tableau de bord, statistiques et réglages

- **Tableau de bord** : exercices dus (sous limites, temps estimé), examens à venir, série bienveillante (objectif minimal, gels automatiques, jamais de reproche), réponses et précision de la semaine, cahiers.
- **Statistiques** (`/stats`), recalculées depuis le journal : connaissance conservée (rétention estimée), true retention 7/30/90 jours et par cahier, prévision de charge à 30 jours, heatmap de l'année, réussite par heure, calibration.
- **Réglages** : niveau d'études (rappelé dans chaque prompt), types d'exercices par défaut, file de validation, FSRS (rétention visée, limites, jours légers, intervalle max, seuil leech), confiance, objectifs de série, siblings, chrono, thème, OneNote, sauvegarde et export du journal.

## Persistance et portabilité

- **Application installable (PWA)**, fonctionne hors ligne ; stockage persistant demandé au navigateur, état visible dans les réglages, avertissement Safari.
- **Sauvegarde automatique** dans un fichier choisi une fois (Chrome / Edge), réécrit après chaque modification ; restauration avec détection de conflit.
- **Exports** : sauvegarde JSON, paquet **Anki `.apkg`** (un paquet par fiche, structure alignée sur genanki, vérifiable avec `npm run verify:apkg -- fichier.apkg` ; l'import dans Anki desktop reste à confirmer à la main), exercices en CSV / TSV, journal au format de l'optimiseur FSRS.

## Données et compatibilité

- Schéma IndexedDB **v5** : `cahiers, chapitres, points, exercises, reviewLogs, settings, supplements, mindmaps, kv`. Avant chaque migration de schéma, un export complet de l'ancienne base est écrit dans `kv` (`backup_before_v<N>`) et proposé au téléchargement dans Réglages → « Sauvegardes de migration ».
- Sauvegarde JSON `schemaVersion: 4` ; les fichiers v1 à v3 restent importables (migration automatique, testée, y compris SM-2 → FSRS par rejeu du journal). L'import est idempotent (aucun doublon si un fichier est importé deux fois).
- Tests : `npm test` (vitest) — planificateur FSRS et simulation de charge, file de révision et limites, reporter/avancer, migrations et sauvegardes de secours, base de données, saisie de formules, Vrai/Faux, linter sur fixtures réalistes (`tests/fixtures`), trous LaTeX, export `.apkg` vérifié par script.

## Historique des phases

- **Revue 1** (2026-09-12) : sauvegarde de secours avant chaque migration de schéma (téléchargeable dans les réglages), saisie de formules en égalité exacte avec diff caractère, Vrai/Faux à note libre, exercices de carte mentale « à valider » par défaut, linter mesuré sur un lot réaliste (fixture annotée, précision et rappel ≥ 0,8), trous de formule `{{$…$}}` réparés à l'import, script de vérification `.apkg` aligné sur genanki, charge de révision estimée par simulation FSRS, LaTeX exigé dans les prompts de rédaction et de complément.
- **Phase 8** (2026-09-12, optionnelle) : QCM pondéré par la confiance (réglage, désactivé par défaut), pré-test avant un nouveau chapitre dont les questions deviennent des points à couvrir à la génération suivante.
- **Phase 7** (2026-09-12) : PWA installable, stockage persistant, sauvegarde automatique (File System Access) avec reprise après rechargement, détection de conflit à la restauration, exports Anki `.apkg`, CSV et TSV.
- **Phase 6** (2026-09-12) : exercices de carte mentale (trous, reconstruction) créés avec chaque carte de fiche, saisie de la réponse avec comparaison tolérante et LaTeX normalisé, cartes inverses automatiques pour définitions et formules.
- **Phase 5** (2026-09-12) : confiance avant la réponse, hypercorrection J+1/J+7, calibration, page Statistiques (true retention, prévision, heatmap, horaire, rétention estimée), série bienveillante avec objectif minimal et gels.
- **Phase 4** (2026-09-12) : examens par cahier, plafond d'intervalle et rétention 95 % pour leurs fiches, plan de réapprentissage successif (3 séances, cochées à la fin), séance d'examen (rappel correct de chaque exercice), cramming hors planning, archivage après la date, examens à venir sur le tableau de bord.
- **Phase 3** (2026-09-12) : types rappel libre guidé et démonstration à estompage, vrai/faux + correction obligatoire, entrelacement (cahiers lexicaux bloqués), siblings enterrés, feedback différé en Chrono avec correction complète, leeches (réécriture par Claude / suspension), édition en session, enterrer / suspendre / aide clavier, résumé enrichi (reportés, relancés, prochain rappel).
- **Phase 2** (2026-09-12) : KaTeX + markdown partout, prompt à deux temps (points de cours → exercices) avec schéma, génération ciblée, linter déterministe, dédoublonnage, file « à valider », vue couverture, éditeur d'exercice, génération depuis un complément gardé.
- **Phase 1** (2026-09-12) : FSRS via ts-fsrs (schéma v4), migration SM-2 → FSRS par rejeu du journal, intervalles affichés sur les boutons, annulation, rétention visée avec estimation de charge, fuzz, limites journalières globales et par cahier, jours légers, reporter/avancer, export CSV du journal.
- **Phase 0** (2026-09-12) : état des lieux, dépôt git, versionnage du schéma, journal `reviewLogs` (remplace `attempts`), table `points`, champs `pointId / status / origin` sur les exercices, migration des sauvegardes v1/v2, S'entraîner et Chrono ne déplacent plus le planning, tests unitaires.

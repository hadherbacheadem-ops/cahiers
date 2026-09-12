# Décisions de conception

Journal des choix non tranchés par le cahier des charges « Évolution fondée sur la recherche en sciences cognitives », avec la raison. Chaque phase ajoute sa section.

## Phase 0 — État des lieux et socle de données

### État des lieux (avant la phase)

- **Données** : Dexie v2, tables `cahiers / chapitres / exercises / attempts / settings / supplements / mindmaps`, timestamps en epoch ms. Un exercice = 6 types (`flashcard, cloze, mcq, truefalse, match, order`), `difficulty` 1–3, `tags`, état SM-2 `{ease, interval, due, reps, lapses}`. Aucun lien exercice → passage de la fiche, aucun statut (tout est actif dès l'import), pas de file « à valider ».
- **Journal** : `attempts` existait (exercice, ts, juste/faux, note, mode, durée) mais **tous les modes modifiaient le planning**, Chrono et S'entraîner compris. Pas de confiance, pas d'annulation.
- **Planificateur** : SM-2 simplifié (`lib/srs.ts`) — un échec remet `interval` et `reps` à zéro, plancher d'ease 1,3 (« ease hell »).
- **Sessions** : Réviser = dues triées par échéance, plafond 50, sans entrelacement ni gestion des siblings ; S'entraîner = 30 au hasard, ratés re-proposés ; Chrono = feedback immédiat, pas différé. Pas d'undo, pas d'édition en session, pas de leech.
- **Génération** : prompt « exhaustif » mais sans extraction de points de cours, sans ancre, sans schéma JSON strict ; validation zod des types à l'import ; pas de linter, pas de dédoublonnage.
- **Rendu** : `.prose-fiche` = texte brut (`white-space: pre-wrap`). Ni markdown ni LaTeX. Fiches texte seul, pas d'images stockées.
- **Sauvegarde** : JSON `version 1|2`, import par `bulkPut` sans migration ; les `attempts` étaient ré-ajoutés à chaque import (doublons).
- Ni tests, ni dépôt git, pas de PWA.

### Décisions

1. **Noms internes conservés.** Le cahier des charges parle de `ficheId`, `statut`, `source`, `affecteLePlanning` ; le code existant utilise `chapitreId`, des identifiants anglais et des timestamps numériques. On garde la convention du code (anglais, epoch ms) pour ne pas créer deux vocabulaires : `ficheId` → `chapitreId`, `statut` → `status` (`pending | active | suspended | leech`), `source` de l'exercice → `origin` (`claude | manual | inverse_auto`, pour ne pas confondre avec `Chapitre.source`), `affecteLePlanning` → `affectsScheduling`, `confiance` → `confidence`. Les libellés visibles restent en français.
2. **`attempts` remplacé par `reviewLogs`** (et non conservé à côté) : une seule source de vérité pour les stats, l'undo et la migration FSRS. La table `attempts` est supprimée par la version 3 de Dexie après conversion de chaque ligne. Les lignes historiques reçoivent `affectsScheduling: true` — elles ont réellement déplacé le planning SM-2 à l'époque, et le rejeu du journal doit reproduire ce qui s'est passé.
3. **Notes → ratings** : `again/hard/good/easy` → 1/2/3/4 (échelle FSRS). Une ligne sans note lisible prend 3 si juste, 1 si faux.
4. **Identifiants du journal** : UUID (chaîne) plutôt que l'auto-incrément de `attempts`, pour que l'import d'une sauvegarde soit idempotent (`bulkPut` par id) — c'est ce qui corrige les doublons d'attempts à l'import.
5. **Versionnage de la sauvegarde** : champ `schemaVersion` (autoritaire) + `version` conservé pour les anciens lecteurs. `migrateBackup()` est une fonction pure (`lib/migrations.ts`) partagée par l'import JSON et testée ; elle refuse les fichiers d'un schéma plus récent et tolère les tableaux manquants. Les hooks `upgrade` de Dexie réutilisent les mêmes fonctions (`attemptToReviewLog`, `upgradeExercise`).
6. **Statuts appliqués dès maintenant** : `loadScopeExercises` et les compteurs « dus » ne considèrent que `status === 'active'`. Tous les exercices existants sont migrés en `active`, donc aucun changement visible ; la file « à valider » (phase 2) n'aura qu'à insérer en `pending`.
7. **S'entraîner et Chrono ne déplacent plus le planning** (`affectsScheduling: false`) dès cette phase : le champ existe dans le journal et y écrire `true` pour ces modes aurait été faux. C'est la règle 3.4 appliquée par anticipation ; l'option « affecter quand même le planning » viendra avec la phase 3.
8. **Points de cours** : table `points` (`id, chapitreId, cahierId, anchor ≤ 200 caractères, title, nature, order`). Les exercices existants ont `pointId: null` ; ils seront rattachés lors de la prochaine génération (phase 2) ou manuellement.
9. **Tests** : vitest + `fake-indexeddb` ; `createDb(name)` exporté pour ouvrir des bases jetables. La migration Dexie est testée en écrivant réellement une base au schéma v2 puis en l'ouvrant avec le schéma v3.
10. **Image occlusion** : différée (P2). Les fiches sont du texte seul, aucune image n'est stockée — à reconsidérer après la phase 9 (stockage d'images en Blob).
11. **Git** : dépôt initialisé à cette phase (le projet n'en avait pas). Un commit par phase.

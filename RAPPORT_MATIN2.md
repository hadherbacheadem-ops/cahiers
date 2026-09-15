# Rapport du lot « Matin 2 » — blocage de la fiche, `motion`, mesures fiables, atomicité Google Drive

Session du 15 septembre 2026 (après-midi), à la suite de `RAPPORT_NUIT2.md`. Rien n’a été poussé.

**Règle de mesure** : chaque chiffre de performance est la **médiane de 5 passages** (`scripts/tbt.mjs --runs=5`, Pixel 7 émulé, Chromium, CPU ×4 ; « froid » = cache HTTP vidé et service worker désinscrit, « chaud » = seconde navigation avec service worker). Les « avant » ont été re-mesurés avec cette règle sur le build de fin de nuit 2 (`docs/perf/tbt-matin2-avant.json`) avant tout changement. Un passage isolé bouge de ±40 % ; cinq passages ramènent l’écart entre deux mesures identiques sous ±20–35 % sur la fiche, ±10 % sur les pages courtes (voir « Bruit » plus bas).

## Sections

| Section | Contenu | Commit | Tests + build |
|---|---|---|---|
| 1a | Fond animé sur mobile : plus aucune rasterisation (`fillText` direct, 40 formules, police système), démarrage à la première interaction ou 4 s après `load`, jamais pendant un rendu KaTeX. | `matin2/1a` | vert |
| 1b | KaTeX dans un Web Worker (protocole `{id, latex, display}` → `{id, html}`, repli synchrone sans `Worker`), cache LRU 500, rendu à l’approche du viewport (`IntersectionObserver`, marge 600 px), placeholders `<code>` à hauteur réservée. | `matin2/1b` | vert |
| 2 | `motion` hors du bundle de démarrage : inventaire, CSS pour les animations ponctuelles, chunk `overlays` chargé à la première ouverture (modale, tiroir, feuille, toasts), chunk `motion` séparé. | `matin2/2` | vert |
| 3 | Google Drive : écriture du manifeste gardée par `headRevisionId` (avant) et `writeToken` (après), test de concurrence sur le faux Drive, addendum ADR 0002. | `matin2/3` | vert |
| 4 | `DECISIONS.md` : commits de la nuit 2 non garantis constructibles isolément (`git bisect skip`). | `matin2/4` | — |
| 5 | Ce rapport, `DECISIONS.md` « Matin 2 ». | `matin2/fin` | vert |

## Performance — avant / après (médianes de 5)

Pixel 7 émulé, Chromium, CPU ×4, médianes de 5 passages, en millisecondes. Avant = `docs/perf/tbt-matin2-avant.json` (build de fin de nuit 2), après = `docs/perf/tbt-matin2-apres.json` (build final). Cibles entre parenthèses.

| Mesure | Avant | Après | Cible |
|---|---|---|---|
| Bundle initial (gzip, avant `load`) | 224 Ko | **174 Ko** (+ 49 Ko chargés à l'inactivité : sync, overlays, motion) | ≤ 190 Ko ✔ |
| Tableau de bord — TBT froid / chaud | 888 / 618 | **207 / 117** | ≤ 200 (froid : à 7 ms près) |
| Tableau de bord — LCP froid / chaud | 688 / 832 | **588 / 804** | — |
| Session — TBT froid / chaud | 1 853 / 669 | **1 061 / 243** | ≤ 200 chaud ✘ (243) |
| Session — LCP froid / chaud | 2 352 / 1 628 | 1 688 / 1 288 | — |
| Fiche — TBT froid / chaud | 3 275 / 2 150 | **2 326 / 1 017** | ≤ 600 / ≤ 300 ✘ |
| Fiche — LCP froid / chaud | 2 964 / 2 360 | 2 500 / 1 488 | — |
| Fiche sans fond — TBT froid / chaud | 1 397 / 1 005 | 2 174 / 1 208 | (bissection : égal au « avec fond » ✔) |
| Session, fps (CPU ×4) | 59,9 | 59,9 | 60 ✔ |
| Fond animé, coût par image | 1,9 ms (sprites, bureau émulé) | **0,1 ms sur téléphone** (`stats().directMs`, 40 `fillText`) ; 0,6 ms bureau | < 0,5 ms sur téléphone ✔ |
| CLS fiche | 0,017 | 0,075 | < 0,1 ✔ (en hausse : voir ci-dessous) |

**Bruit** : entre deux séries de cinq passages sur le même build, la fiche a donné 1 687 puis 2 326 ms à froid (+38 %), 1 116 puis 1 017 ms à chaud ; le tableau de bord 207 contre 339 (nuit) ; la ligne « sans fond » de la fiche a *monté* de 1 397 à 2 174 ms alors que rien de son chemin n'a changé sauf le worker KaTeX. Cinq passages ramènent le bruit d'un passage seul (±40 %) à ±20–35 % sur la fiche, moins sur les pages courtes. Lecture honnête : le tableau de bord et la session ont clairement gagné (÷3 à ÷4, cohérent sur toutes les séries) ; la fiche a gagné sur la part « fond » (bissection à plat) mais son blocage restant, natif, est du même ordre qu'avant et n'est pas mesurable à mieux qu'un tiers avec cet outillage. Pour trancher des écarts plus fins il faudrait dix passages ou plus et une machine hôte au repos.

**CLS de la fiche en hausse (0,017 → 0,075)** : le remplacement en place d'un placeholder `<code>` (hauteur réservée 2,6 em) par la formule rendue (hauteur réelle 1,5 à 4 em) décale ce qui suit ; sous 0,1 mais à surveiller. Piste : mesurer la hauteur réelle des formules d'affichage courantes et réserver par classe (fraction, intégrale, somme).

## Fiche : bissection « sans fond » après 1a

Médianes de 5 sur la fiche (froid / chaud, ms), Pixel 7 CPU ×4 :

| Build | Avec fond | Sans fond | Écart |
|---|---|---|---|
| Avant (fin nuit 2) | 3 275 / 2 150 | 1 397 / 1 005 | ×2,3 : le fond pesait plus de la moitié |
| Après 1a (première version) | 1 459 / 853 | 1 540 / 990 | égaux à ±10 % |
| Après 1a + 1b (première version du worker) | 2 454 / 1 945 | 2 695 / 1 517 | égaux, mais tout a monté (re-rendus) |
| Après 1a + 1b, avant l'armement complet | 1 973 / 929 | 969 / 532 | ×2 : le fond était revenu |
| Après 1a + 1b, patch en place, armement complet | **1 687 / 1 116** | **1 958 / 1 094** | égaux : le fond a disparu de la bissection |

Ce que la bissection a appris, dans l'ordre : (1) le fond démarrait dès le montage parce que ses *setters* lançaient la boucle avant `start()` ; (2) une fois la boucle retenue, « sans fond » restait deux fois plus rapide, parce que le composant lisait toutes les fiches et en extrayait les formules au montage ; (3) une fois tout cela reporté à l'armement, l'écart tombe dans le bruit (la ligne « sans fond » est même plus lente : 5 passages ne suffisent pas à départager ±15 %).

## Fiche : ce qui reste après 1a + 1b

Profil CPU (`scripts/cpu-profile.mjs --page=fiche`, 3,5 s après `load`, CPU ×4, `docs/perf/cpu-fiche.json`) après 1a + 1b :

- Tâches longues : 102, 79, 133, 95, **727** (t+1,1 s), 159, **1 004** (t+2,7 s), 161, 333 ms → 2 343 ms de blocage sur la fenêtre.
- Par fichier : natif **2 691 ms** (« program » : parse HTML des cartes et des formules, style, mise en page, GC), vendor (React, Dexie) 733 ms, app 442 ms (marked, DOMPurify), `ClaudeRoundTrip` 124 ms (code d'édition et de génération compilé avec la page de fiche), `ui` 48, `ExerciseEditModal` 45, `ChapitrePage` 23.
- Par fonction (temps propre) : « program » 2 497 ms ; le reste est éparpillé (aucune fonction JS au-dessus de 120 ms).

Autrement dit : le JS de l'app n'est plus le problème ; ce qui reste est la construction et la mise en page du DOM de la fiche (32 formules KaTeX = plusieurs centaines de nœuds chacune avec `htmlAndMathml`) et des cartes, plus le premier rendu React. Pistes chiffrables pour un lot suivant, non tentées ici comme demandé : sortie KaTeX `html` seule (moitié moins de nœuds), première peinture de la fiche sans les cartes d'exercices (cartes à l'inactivité), `ExerciseEditModal` et `ClaudeRoundTrip` hors du chunk de la fiche, `contain: content` sur les cartes.

## Inventaire `motion`

Douze imports au départ (`grep "motion/react"`) :

| Fichier | Usage | Reproductible en CSS ? | Sort |
|---|---|---|---|
| `ui.tsx` — `Modal` | présence (fondu + glissement à la sortie), glisser pour fermer sur téléphone | non (sortie, geste) | `overlays.tsx`, chunk chargé à la première ouverture (préchargé à l'inactivité) |
| `ui.tsx` — `Drawer` | présence avec sortie | non | idem |
| `ui.tsx` — `Toaster` | entrée/sortie des toasts | non (sortie) | `ToastListImpl` dans `overlays.tsx`, monté au premier toast |
| `Menu.tsx` — `Sheet` | glissement d'entrée/sortie, glisser pour fermer | non | `SheetImpl` dans `overlays.tsx` |
| `ClozePlayer` — `motion.input` | impulsion 1,04 à la validation | oui | `.pulse-once` |
| `McqPlayer`, `MatchPlayer`, `TrueFalsePlayer` — `motion.button` | impulsion 1,015–1,02 à la sélection | oui | `.pulse-once` |
| `TrueFalsePlayer` — bloc verdict | fondu + translation d'entrée | oui | `data-anim="fade-in-up"` |
| `Feedback` | fondu d'entrée ; pouls ambre (juste) / secousse 2 px (faux) | oui | `fade-in-up`, `pulse-ok`, `shake-x` |
| `TrainPage` — chrono | pouls infini sous 10 s | oui | `pulse-timer` |
| `TrainPage`, `ValidatePage` — barre de progression | largeur animée | oui | `transition: width 300ms` |
| `TrainPage` — résultats | fondu d'entrée | oui | `fade-in-up` |
| `TrainPage`, `ValidatePage` — transition entre exercices | `AnimatePresence mode="wait"` (sortie puis entrée) | non (sortie) | conservé, dans les chunks des pages (paresseuses) |
| `OrderPlayer` — `motion.li layout` | réordonnancement animé (FLIP) | non | conservé, chunk de la session |
| `useReducedMotion` (9 fichiers) | lecture de `prefers-reduced-motion` | oui | `useReducedMotion` maison (`media.ts`) |

Résultat : `motion` (43 Ko gzip) est un chunk partagé automatique des pages paresseuses et de `overlays` ; absent des requêtes avant `load` sur le tableau de bord (test Playwright `bundle.spec.ts`). Bundle initial avant `load` : **174 Ko gzip** (vendor 129, app 26, ui 8, media/types/format/runtime 11) ; chargés après `load`, à l'inactivité : 49 Ko (moteur de sync, overlays, motion). Dépendance conservée (toujours utilisée). Piège rencontré : nommer un chunk `motion` dans `manualChunks` y faisait ranger le runtime JSX de React par rolldown, importé alors par toutes les pages. Captures iPhone 14 dans `docs/mobile/matin2/` : feuille en cours d'ouverture puis ouverte, feedback faux, transition d'exercice, modale.

## Google Drive : concurrence

Protocole du fournisseur Google (seul fournisseur touché) : lecture du manifeste → `headRevisionId` mémorisé ; écriture = relecture de `headRevisionId` (différent → conflit sans écrire) → PATCH multipart `{ appProperties: { writeToken } }` + contenu → relecture des métadonnées (jeton différent → conflit) ; conflit = `SyncConflictError`, le moteur recommence la ronde (3 essais). Faux Drive enrichi (`headRevisionId`, `appProperties`, PATCH multipart, crochets `beforeUpload` / `afterUpload`). Tests (9, tous verts) : jeton écrasé après notre écriture → conflit, notre contenu n'est pas gardé ; manifeste déplacé depuis le début de la ronde → conflit avant toute écriture (0 PATCH) ; **deux appareils dont la ronde du second s'intercale entre l'écriture et la relecture du premier** → le premier recommence (`attempts > 1`), le manifeste final référence les lots des deux, les deux bases contiennent `e1`, `e-pc`, `e-phone`. Fenêtre résiduelle : un aller-retour réseau, documentée dans l'ADR 0002.

## Commits de la nuit 2 non bissectables

Vérifié plutôt que supposé : chaque commit depuis `nuit2/M1` a été extrait (`git archive`) dans un arbre séparé, relié aux `node_modules` du projet, et construit (`npm run build` = `tsc -b && vite build`).

| Commit | Section | Construit seul |
|---|---|---|
| `dcd7929` | nuit2/M1 | oui |
| `dc00a03` | nuit2/M2 | oui |
| `dbdd898` | nuit2/M3 | oui |
| `7b2fc1c` | nuit2/M4 | oui |
| `70a9c88` | nuit2/fin | oui |
| `26239ca` | matin2/1a | oui |
| `98b5d95` | matin2/1b | oui |
| `e8be042` | matin2/2 | oui |
| `0e50512` | matin2/3 | oui |

**Liste à sauter : vide.** La crainte de la nuit (fichiers partagés rangés dans le dernier commit qui les touche) ne s'est pas traduite par un import cassé : les fichiers partagés n'introduisaient que des dépendances vers des fichiers déjà commités. Ce qui reste vrai : ces commits ne se *lisent* pas seuls (le commit « M1 » contient des morceaux de M2 et M4). Noté dans `DECISIONS.md` ; à partir de ce lot, chaque commit est construit seul avant d'être créé (tests + build sur l'arbre du commit).

## À vérifier sur un vrai téléphone (en plus de la liste de nuit)

- **Animations conservées après le retrait de `motion`** : ouverture et fermeture d’une feuille ⋯ (glissement), d’une modale (fondu + glissement, glisser pour fermer), d’un toast ; feedback juste (impulsion ambre) et faux (secousse) ; transition entre deux exercices ; impulsion du chrono sous 10 s ; barre de progression.
- **Fluidité de la fiche longue** : ouvrir la fiche la plus longue, faire défiler jusqu’en bas d’un coup : les formules doivent apparaître au plus tard un instant après leur arrivée à l’écran, sans saut de mise en page ; le fond animé ne doit démarrer qu’après le premier toucher (ou 4 s).
- **Google Drive à deux appareils** : synchroniser en même temps depuis le PC et le téléphone plusieurs fois ; le message « N tentatives » peut apparaître, jamais une perte.

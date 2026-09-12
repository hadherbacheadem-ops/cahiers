# Rapport de la nuit 1 — design en profondeur + accès mobile

Session autonome du 12 au 13 septembre 2026. Ce rapport est écrit au fil des étapes ; la synthèse finale est en tête une fois la nuit terminée.

## Étapes

| Étape | Contenu | État | Commit |
|---|---|---|---|
| A0 | Tokens « nuit d'encre », polices auto-hébergées (Inter, Fraunces, JetBrains Mono, STIX Two Math), lucide-react installé, page `/design` (dev), scripts `seed-demo`, `screenshots`, `perf`, `a11y`, `lighthouse`, captures « avant » | fait | `nuit1/A0` |
| A2 | Système de composants sur les tokens : boutons (4 variantes, 3 tailles, chargement), cartes (4 élévations, verre), champs, cases, badges (type d'exercice avec icône, statut), modale et tiroir (200 ms, Échap, focus piégé et rendu), toasts, info-bulles, anneaux / barres / barre segmentée, compteur, squelettes à reflet, états vides illustrés en traits d'encre ; barre latérale fine repliable en verre ; migration complète des icônes vers lucide-react ; page `/design` ; 0 violation axe | fait | `nuit1/A2` |
| A1 | `<DepthField>` : champ d'équations en cinq plans (sprites pré-rasterisés, pool, dégradation automatique, arrêt onglet caché / reduced-motion / batterie), convertisseur `latexToUnicode` (31 tests), liste générique (80 équations), réglage « Fond animé » + gyroscope, contexte calme en session sans fuite de réponse | fait | `nuit1/A1` |

## Budgets mesurés (début de nuit, build d'avant A0 pour le bundle)

| Mesure | Avant (00-avant) | Budget |
|---|---|---|
| Bundle JS principal (gzip, chunks `index-*`) | 539,5 Ko | +150 Ko max en fin de nuit (≤ 689,5 Ko) |
| Session Réviser, desktop | 59,9 fps médian, frame 16,7 ms | ≥ 55 fps |
| Session Réviser, CPU ×4 | 59,9 fps médian | ≥ 55 fps |
| Fond animé | pas encore de fond | ≤ 3 ms / frame |
| CLS | tableau de bord 0, cahier 0, fiche 0,017, session 0, stats 0, réglages 0,012 | 0 |
| axe (serious/critical), 7 pages × 2 thèmes × 2 largeurs | 20 violations (contraste de l'accent sur `accent-soft` en thème clair, `aria-label` sur un `div` des points de difficulté, zone défilante non focusable dans Statistiques) | 0 |
| Lighthouse mobile, tableau de bord | perf 76 (LCP 5,2 s, TBT 273 ms), accessibilité 100 | perf ≥ 90, a11y ≥ 95 |
| Lighthouse mobile, session | perf 81 (LCP 5,1 s, TBT 121 ms), accessibilité 100 | idem |

Les chiffres bruts sont dans `docs/perf/00-avant.json`, `docs/perf/a11y-00-avant.json`, `docs/perf/lighthouse-00-avant.json`.

## Journal des étapes

### A0 — outillage et tokens

- `scripts/seed-demo.mjs` : base de démonstration déterministe (PRNG mulberry32) : 3 cahiers (Physique, Chimie, Mathématiques), 6 fiches en markdown + LaTeX, 65 exercices actifs de tous types (+ 4 « à valider » dont un réparé, 2 exercices de carte mentale, 2 compléments proposés), un examen « DS de physique » à J+21 avec plan J−12 / J−6 / J−1, 60 jours de journal (≈ 320 réponses) rejoués avec ts-fsrs pour un état FSRS cohérent, ≈ 40 exercices dus. Le nombre d'exercices (65) est un peu sous les ~80 demandés : le contenu est réel (pas de remplissage), je préfère moins d'exercices justes.
- Crochet `window.__cahiers` dans `main.tsx` (importBackup, setTheme, count, clear) : ce que Réglages permet déjà, exposé pour les scripts.
- `scripts/screenshots.mjs` : 11 pages × 3 largeurs × 2 thèmes = 66 captures (`--dev` ajoute `/design`). Les flux « session après révélation » (saisie remplie puis validée) et « résultats » (répond jusqu'à l'écran de fin) sont pilotés par Playwright.
- `scripts/perf.mjs` (fps rAF 5 s, desktop et CPU ×4 via CDP, stats du fond quand il existera, CLS par page, tailles gzip), `scripts/a11y.mjs` (axe, échec si serious/critical), `scripts/lighthouse.mjs` (Chromium de Playwright avec port de débogage, base semée avant l'audit ; `chrome-launcher` ne parvient pas à lancer ce Chromium sur cette machine : `spawn UNKNOWN`).
- Tokens : `src/index.css` réécrit (palette marine et papier, un seul accent ambre, `--elev-1..4` multicouches teintées marine, `--radius-*`, `--dur-*`, `--ease-*`, dégradé + vignette + grain en CSS sur `body::before/::after`). Les anciens noms d'utilitaires (`bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-accent`…) restent des alias : aucune page ne casse avant sa refonte. Thème marine par défaut (`DEFAULT_SETTINGS.theme = 'dark'`).
- Vu sur les captures `a0` : le passage à l'ambre et aux titres Fraunces tient sur toutes les pages ; le thème clair papier est propre. Rien de tronqué. Le fond n'a pas encore de profondeur (A1).

### A1 — le champ d'équations

- `src/lib/depthField.ts` (moteur, sans React) + `src/components/DepthField.tsx` (câblage : réglages, thème, contexte, formules des fiches, pointeur, gyroscope, batterie, visibilité). Un seul canvas fixe (`z-index: −1`, au-dessus du dégradé `body::before`), DPR ≤ 2. Sprites : une rasterisation par (texte, plan, thème) dans un `OffscreenCanvas` (STIX Two Math, halo par `shadowBlur` sur les plans proches, flou par `ctx.filter`), conservée en `ImageBitmap`, cache LRU de 120, **au plus une rasterisation par frame** (file d'attente) ; la boucle ne fait que `drawImage` + `globalAlpha`. Pool de 60 objets, `dt` réel, vocabulaire actif limité à 24 formules de l'utilisateur (ré-échantillonné toutes les 2 min avec fondu) pour ne pas faire tourner le cache.
- Mesures (`docs/perf/a1.json`, compositing GPU) : desktop 59,9 fps, fond 0,9 ms/frame à 60 particules et 5 plans ; CPU ×4 : 59,9 fps, le moteur s'est dégradé seul à 24 particules / 4 plans, fond 2,6 ms/frame (budget mobile 3 ms). Rasterisation totale ≈ 250 ms desktop, ≈ 2 s à ×4, étalée sur les frames (échauffement à 59,9 fps dans les deux cas).
- **Piège de mesure trouvé** : en headless, Chromium composite avec SwiftShader (GL logiciel) ; un canvas plein écran qui change à chaque frame y coûte 40 ms à ×4 (15–20 fps) alors que le moteur ne prend que 1,5 ms. Sans fond : 59,9 fps ; avec `--enable-gpu` (ANGLE) : 59,9 fps. `scripts/perf.mjs` mesure donc avec le GPU par défaut (`--software` pour le pire cas) et le rapport le dit. Le grain (`body::after` en `mix-blend-mode: overlay` au-dessus du canvas) forçait aussi une recomposition complète : il est maintenant cuit dans la couche statique `body::before`.
- CLS : les polices en `font-display: optional` déclarées à la main + premier rendu après `document.fonts.load` (plafonné à 800 ms) → plus de décalage au swap ; barre latérale `sticky h-dvh` (son bloc « Réglages » descendait quand le contenu chargeait : 0,012 sur chaque page). Restent : tableau de bord 0–0,05 (les sections chargent à des hauteurs différentes des squelettes, à traiter en A3.1), fiche 0,0004.
- Regard sur `docs/screenshots/a1/field-dark-t{0,5,15}s.png` et `field-light-t5s.png` : cinq plans lisibles (tailles 12→27 px, flous, opacités échelonnés), pas de trou après 15 s, pas de texte cassé après correction de `^\circ` → `°` et des indices sans équivalent Unicode (`E_c` → `Ec`). Le plan le plus proche pourrait être un peu plus lumineux ; je l'ai laissé à 21 % (fourchette 18–24 %) pour ne pas concurrencer le contenu. Thème clair : encre diluée, sans halo, propre.
### A2 — composants

- `src/components/ui.tsx` réécrit sur les tokens, API conservée (aucune page cassée) : `Button` (primaire ambre avec élévation et levée de 1 px au survol, secondaire, fantôme, danger ; `loading`), `IconButton`, `Card` (`elevation` 1–4, `interactive`), `Glass`, `Badge`, `ExerciseTypeBadge` / `ExerciseTypeIcon` (une icône lucide par type), `StatusBadge`, `Field` / `Input` / `Textarea` / `Select` / `Checkbox`, `Modal` et `Drawer` (piège de focus, retour du focus à l'ouvreur, Échap, 200 ms, `aria-labelledby`), `toast()` + `Toaster` (bas d'écran, `aria-live`), `Tooltip`, `ProgressRing` / `ProgressBar` / `SegmentedBar`, `Counter`, `Skeleton` (reflet), `EmptyState` + `InkIllustration` (4 dessins SVG en traits).
- Icônes : 39 fichiers migrés de Phosphor vers lucide-react par script (table de correspondance, chaînes protégées) ; un seul style désormais. Bundle principal : 549 → 541 Ko gzip.
- Barre latérale desktop : verre translucide, repliable (icônes + info-bulles, mémorisé en `localStorage`), la couleur du cahier passe en `--cahier` sur son lien. Barre mobile : B1.
- Accessibilité : les 20 violations axe du départ sont à 0 (`docs/perf/a11y-a2.json`) : accent clair recalé sur un seul ambre AA (`#8f5f0c`, 5,0:1 sur papier, texte blanc dessus 5,5:1), `role="img"` sur les points de difficulté, zones défilantes des statistiques focusables et nommées.
- Regard sur `docs/screenshots/a2/design-*.png` : les quatre élévations se distinguent, les chips de tokens lisent bien la hiérarchie marine ; en thème clair, `--line` et `--line-strong` sont proches (voulu : le papier reste calme). Les états vides en traits d'encre sont sobres ; l'illustration « étoiles » est un peu maigre, je la garde pour les écrans de fin de session uniquement.

- Contenu : 60 % formules `$…$` des fiches de l'utilisateur (du cahier courant quand on est dedans), 40 % génériques ; en session, `TrainPage` pose `calm` (intensité ×0,4, vitesse ×0,5) et exclut les fiches de la file (aucune fuite de réponse) ; `CahierPage` / `ChapitrePage` posent le cahier.

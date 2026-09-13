# Rapport de la nuit 1 — design en profondeur + accès mobile

Session autonome du 12 au 13 septembre 2026. Ce rapport est écrit au fil des étapes ; la synthèse finale est en tête une fois la nuit terminée.

## Étapes

| Étape | Contenu | État | Commit |
|---|---|---|---|
| A0 | Tokens « nuit d'encre », polices auto-hébergées (Inter, Fraunces, JetBrains Mono, STIX Two Math), lucide-react installé, page `/design` (dev), scripts `seed-demo`, `screenshots`, `perf`, `a11y`, `lighthouse`, captures « avant » | fait | `nuit1/A0` |
| A2 | Système de composants sur les tokens : boutons (4 variantes, 3 tailles, chargement), cartes (4 élévations, verre), champs, cases, badges (type d'exercice avec icône, statut), modale et tiroir (200 ms, Échap, focus piégé et rendu), toasts, info-bulles, anneaux / barres / barre segmentée, compteur, squelettes à reflet, états vides illustrés en traits d'encre ; barre latérale fine repliable en verre ; migration complète des icônes vers lucide-react ; page `/design` ; 0 violation axe | fait | `nuit1/A2` |
| A3.1 | Tableau de bord : action unique « Réviser · N dus · ~M min », anneaux (objectif du jour, connaissance conservée), heatmap 16 semaines intégrée, cahiers avec accent local, examens avec compte à rebours et barre segmentée ; sections gardées à hauteur fixe pendant le chargement | fait | `nuit1/A3-1` |
| A3.2 | Session : en-tête en verre avec barre de progression fine, carte à élévation 3 inclinable au survol (pointeur fin seulement), boutons de note partagés `GradeButtons` (intervalle qui monte de 4 px au survol, marqueur examen, suggestion annelée), feedback juste = impulsion d'accent / faux = tremblement 2 px, transition entre exercices 150 ms, transitions de page (View Transitions), surfaces des dix joueurs harmonisées | fait | `nuit1/A3-2` |
| A3.3 | Résultats : anneau de réussite (132 px, teinte selon le score), trois chiffres (temps, réponses, prochain rappel), notes avec icônes et teintes (calibration < 85 % en avertissement), « À retravailler » avec badges de type | fait | `nuit1/A3-3` |
| A3.4 | Cahier et fiche : accent local `--cahier` sur la page du cahier (badge « N à revoir » dans sa couleur), menu « … » en verre, lignes de fiches avec pictogramme, fiche typographiée avec encadrés « L'essentiel » / « À compléter » (wrap présentation dans `renderMarkdown`, testé), couverture avec barre de progression, filtres de type avec icônes, badges partagés dans la liste d'exercices, en-tête de page qui passe à la ligne au lieu d'écraser le titre | fait | `nuit1/A3-4` |
| A3.5 | Validation : en-tête en verre collant avec progression, carte à élévation 3 (liseré ambre, ou avertissement si le linter signale), badge de type avec icône, exercices réparés déjà en tête ; raccourcis J / K / E / Ctrl+A inchangés | fait | `nuit1/A3-5` |
| A3.6 | Carte mentale : moteur SVG conservé ; **régression corrigée** (les variables `--surface`, `--ink`, `--muted`, `--bg` lues par le SVG n'existaient plus depuis A0 : nœuds noirs sans texte sur les captures `a2`/`a3-2`) via des alias CSS ; nœuds sur `surface-2`, traits à 80 %, police d'export Inter, couleurs de repli papier, en-tête en verre | fait | `nuit1/A3-6` |
| A3.7 | Statistiques et réglages (titres serif, tuiles en Fraunces, sections), aller-retour Claude (gros bouton, zone de collage plus haute, bandeaux) ; passe de mesure de fin de chantier A : 0 violation axe, CLS, fps, Lighthouse ; moteur du fond allégé (contexte de mesure partagé, sprite mis en cache sur la particule, éviction LRU sans réordonner la map) ; fiche : corps de page gardé en squelette tant que exercices et points ne sont pas là, compléments déplacés sous la fiche ; session : réglages « saisie » et « QCM pondéré » transmis par la session au lieu d'un hook tardif | fait | `nuit1/A3-7` |
| B1 | Tactile : barre inférieure à 4 entrées (Aujourd'hui, Cahiers, Statistiques, Réglages) avec `env(safe-area-inset-bottom)`, page `/cahiers`, page `/aide` (l'aide « ? » n'est plus qu'une modale au clavier), cibles ≥ 44 px et `kbd` masqués sur pointeur grossier, actions des cartes d'exercice visibles sans survol, session : carte en bas de l'écran sur téléphone + boutons Modifier / Demain / Suspendre / Aide, balayage des flashcards (gauche Encore, droite Bien, seuil 40 %, intervalle affiché, réglage), clavier virtuel suivi via `visualViewport`, champs ≥ 16 px, aller-retour Claude : `navigator.share` + « Coller depuis le presse-papiers » | fait | `nuit1/B1` |
| B2 | ADR `docs/adr/0001-acces-mobile.md` : six options comparées (hébergement statique, OneDrive appfolder, Google Drive appData, PouchDB/CouchDB, pair-à-pair local, Supabase/Firebase) ; décision 1 + 2 avec mode dégradé par fichier | fait | `nuit1/B2` |
| B3 | Moteur de fusion pur `src/lib/sync/merge.ts` (22 tests) + format d'échange `format.ts` (6 tests) + base Dexie v6 (`backup_before_v6` automatique, `deviceId` sur chaque ligne via un middleware, `updatedAt` sur points et suppléments, table `tombstones`, tampons de réglages par clé) + 7 tests d'intégration ; toutes les suppressions posent des tombstones (purge à 90 jours) ; Réglages → « Fusionner une sauvegarde », distinct de « Restaurer » | fait | `nuit1/B3` |
| B4 | Fournisseurs de synchronisation : interface `SyncProvider` (`list / read / write(ifMatch) / delete`), `MemoryProvider` (tests), `FileProvider` (dossier local, File System Access), `OneDriveAppFolderProvider` (Graph `/me/drive/special/approot`, sous-dossier `sync`, `If-Match`, 412 → conflit, session d'envoi > 4 Mo) ; moteur de ronde `engine.ts` (manifest avec ETag, 3 tentatives, instantané tous les 500 changements ou 7 jours, curseur en `kv`) ; rondes automatiques ; écran Réglages → Synchronisation ; 16 tests (deux appareils simulés, conflits d'ETag, Graph simulé : approot, création de dossier, If-Match, 412, 401) ; portée `Files.ReadWrite.AppFolder` ajoutée sans retirer les autres. **Non testé contre un vrai compte OneDrive** | fait | `nuit1/B4` |
| B5 | Base configurable `VITE_BASE` (Vite `base`, manifest PWA `start_url`/`scope`/icônes relatives, `navigateFallback`, `basename` du routeur, URI de redirection MSAL = origine + base), `404.html` copie d'`index.html` pour les liens profonds, workflow `.github/workflows/deploy.yml` (npm ci, tests, build avec `VITE_BASE=/<dépôt>/`, deploy-pages), `docs/deploiement.md` (5 commandes, adresse attendue, variante Cloudflare, rappel sécurité) ; build vérifié avec `VITE_BASE=/cahiers/` et servi sous `/cahiers/` en preview. **Aucun dépôt distant créé, rien déployé** | fait | `nuit1/B5` |
| B6 | PWA mobile : icônes maskable 192/512 + `apple-touch-icon` régénérés par `make:icon` (palette marine/ambre, glyphe dans la zone sûre), 9 écrans de lancement iOS (`apple-touch-startup-image` par appareil), `apple-mobile-web-app-*`, `theme-color` par thème (deux `meta` à requête média, réécrits quand le thème est forcé), manifest `orientation: any`, `id`, couleurs marine ; bannière d'installation (`beforeinstallprompt` natif, instructions iOS une fois, mémorisée), vérification `navigator.storage.persist()` au lancement dès qu'il y a un cahier. Lighthouse 12 n'a plus d'audit « installable » : manifest vérifié par script (`install:shots`) | fait | `nuit1/B6` |
| Dette 1 | Dépendances mortes retirées (`@fontsource-variable/geist`, `geist-mono`, `@phosphor-icons/react` : plus aucun import depuis A0/A2) ; tests et build inchangés (même hash de bundle). Non engagé, listé pour plus tard : découpage du bundle (KaTeX, MSAL, sql.js en chunks à la demande) pour Lighthouse ; seconde passe A3.1 / A3.2 non faite faute de temps | partiel | `nuit1/dette-1` |
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

### Fin de nuit (build final, commit `nuit1/B6`)

| Mesure | Avant (00-avant) | Après (fin) | Budget | Tenu |
|---|---|---|---|---|
| Bundle JS principal (gzip) | 539,5 Ko | 540,6 Ko (+1,1 Ko ; le champ d'équations, la fusion, la sync et MSAL déjà présent ont été compensés par le passage Phosphor → lucide) | +150 Ko max | oui |
| Session Réviser, desktop | 59,9 fps | 59,9 fps (p95 16,7 ms) | ≥ 55 fps | oui |
| Session Réviser, CPU ×4 | 59,9 fps | 59,9 fps (p95 16,8 ms), fond dégradé seul à 24 particules / 4 plans | ≥ 55 fps | oui |
| Fond animé | — | 0,4 ms / frame desktop, 2,8 ms / frame à ×4 | ≤ 3 ms / frame | oui (juste, à ×4) |
| CLS | tdb 0, fiche 0,017, réglages 0,012 | tdb 0,0035, cahier 0, fiche 0,0017, session 0, stats 0, réglages 0,0008 | 0 | presque : trois pages sous 0,004 (sous-pixel du compte animé, KaTeX) |
| axe serious/critical (7 pages × 2 thèmes × 2 largeurs) | 20 | **0** (`docs/perf/a11y-fin.json`) | 0 | oui |
| Lighthouse mobile, tableau de bord | perf 76 (TBT 273 ms), a11y 100 | perf **56** (LCP 5,6 s, TBT 1,06 s), a11y 100, bonnes pratiques 100 | perf ≥ 90, a11y ≥ 95 | **non** (perf) |
| Lighthouse mobile, session | perf 81 (TBT 121 ms), a11y 100 | perf **71** (LCP 5,5 s, TBT 369 ms), a11y 100 | idem | **non** (perf) |

Chiffres bruts : `docs/perf/fin.json`, `docs/perf/a11y-fin.json`, `docs/perf/lighthouse-B6.json`.

**Lighthouse perf, honnêtement** : le score mobile a baissé (76 → 56 sur le tableau de bord). Le LCP (~5,5 s) vient du bundle unique de 540 Ko gzip chargé avant tout rendu (déjà 5,2 s au départ) ; le TBT a grimpé (0,27 → 1,06 s) et persiste **fond désactivé** (`lighthouse-a3-7-nofield.json`), donc ce n'est pas le champ d'équations. Le profil CPU (`scripts/profile.mjs`) montre l'exécution du module principal (KaTeX, MSAL, sql.js loader, motion, dexie) et le premier rendu React sous CPU ×4 sans coupable unique. La piste sérieuse est un **découpage du bundle** (KaTeX et MSAL en chunks à la demande, page par page avec `lazy`) : c'est un chantier de structure, pas de design, que je n'ai pas engagé dans la nuit pour ne pas risquer la règle « rien ne casse » ; il est listé en dette. Sur l'appareil réel (Wi-Fi local, CPU non bridé ×4), l'app s'ouvre en moins de deux secondes.

## Avant / après

Quatre pages les plus transformées, côte à côte (début de nuit à gauche, fin à droite), en thème sombre, mobile 390 px et desktop 1440 px — `docs/screenshots/avant-apres/` (composées par `npm run avant:apres -- 00-avant fin dashboard,train-after,fiche,settings`) :

| Page | Mobile | Desktop |
|---|---|---|
| Tableau de bord | `dashboard-mobile-dark.png` | `dashboard-desktop-dark.png` |
| Session (réponse révélée) | `train-after-mobile-dark.png` | `train-after-desktop-dark.png` |
| Fiche | `fiche-mobile-dark.png` | `fiche-desktop-dark.png` |
| Réglages | `settings-mobile-dark.png` | `settings-desktop-dark.png` |

Toutes les pages, trois largeurs et deux thèmes : `docs/screenshots/00-avant/` (départ) et `docs/screenshots/fin/` (arrivée), plus une étape par dossier (`a0` … `B6`).

## Essai sur le téléphone (le matin)

1. Sur le PC : `npm run build` puis `npm run preview -- --host` (le serveur écoute sur toutes les interfaces, port 4173).
2. Sur le téléphone, même Wi-Fi : ouvrir **http://192.168.1.89:4173** (adresse IPv4 de la carte « Wi-Fi » lue cette nuit ; si elle a changé, `ipconfig` la donne). Pas de HTTPS en local : l'installation « sur l'écran d'accueil » et `navigator.share` fonctionnent, la persistance du stockage et le gyroscope peuvent être limités hors HTTPS ; l'hébergement B5 règle ça.
3. La base y est vide : Réglages → Restaurer une sauvegarde avec un export JSON du PC (ou Réglages → « Fusionner une sauvegarde » après B3).

## Actions manuelles pour toi (rien de tout cela n'a été fait cette nuit)

1. **Portail Entra** (portal.azure.com → Microsoft Entra ID → Inscriptions d'applications → ton app « Cahiers ») :
   - « Autorisations d'API » → Ajouter → Microsoft Graph → autorisations déléguées → **`Files.ReadWrite.AppFolder`** (garde `Notes.Read` et `User.Read`). Pas de consentement administrateur pour un compte personnel : la première connexion redemandera ton accord.
   - « Authentification » → plateforme SPA → ajouter l'URI de redirection **exacte** de chaque adresse où tu ouvres l'app : `http://localhost:5173/` (dev), `http://localhost:4173/` (preview), et l'adresse hébergée `https://<utilisateur>.github.io/cahiers/` (Réglages → OneNote l'affiche telle quelle).
2. **Vérifier OneDrive** (fournisseur écrit sans compte de test) : Réglages → Synchronisation → « OneDrive — dossier d'application » → « Se connecter » → « Tester la connexion » (doit répondre « Connexion réussie : OneDrive › Applications › Cahiers › sync, 0 fichier ») → « Synchroniser maintenant » (première ronde = « instantané complet envoyé »). Sur le second appareil, même chose : la ronde doit dire « reçu N ajouts ». Si un 401/403 apparaît, c'est l'autorisation du point 1.
3. **Mettre en ligne** : les cinq commandes de `docs/deploiement.md` (`gh repo create` … `gh run watch`), puis ouvrir `https://<utilisateur>.github.io/cahiers/` sur le téléphone et « Ajouter à l'écran d'accueil ».
4. **Sur le téléphone**, en attendant : `npm run build` puis `npm run preview -- --host` et http://192.168.1.89:4173 (voir « Essai sur le téléphone »).
5. **Regarder les captures** `docs/screenshots/avant-apres/` et dire ce qui te déplaît (voir « Doutes de goût »).

## Retour du matin : « le fond doit être vivant »

Sur ton PC, Windows a « Effets d'animation » désactivé ; Chrome le traduit en `prefers-reduced-motion`, et le champ d'équations restait une image fixe (règle de la nuit : aucune animation non essentielle en reduced-motion). Correction : un fond choisi **à la main** (Réglages → Apparence → Plein ou Discret) anime toujours ; seul le mode automatique suit le système. Les vitesses de montée ont été relevées de moitié (9 → 33 px/s selon le plan) pour que la montée se voie sur un écran de bureau. Commit `nuit1/fond-vivant`.

## Retour du matin : « mon cours est sur papier »

« Rédiger avec Claude » accepte désormais des photos des pages (bouton « Prendre une photo » sur téléphone, « Ajouter des photos » partout, vignettes numérotées, 20 au plus). Le prompt commence par une règle de transcription fidèle (LaTeX, `[illisible]`, `(?)`), puis rédige la fiche comme avant. Sur téléphone, les photos partent avec le prompt dans l'application Claude par la feuille de partage ; sur PC, il faut les glisser dans la conversation ouverte (le texte de l'étape 2 le rappelle). Commit `nuit1/cours-papier`.

## Retour du matin : « regarde ce qui est écrit dans la carte mentale »

Les notes des nœuds montraient le LaTeX brut. Les nœuds SVG dessinent maintenant les formules en Unicode (`Zeq = ∑ Zₖ`, `E = mc²`, `e^(iωt + φ)`) via `plainMath`, variante indulgente du convertisseur du fond (tests ajoutés). Les exercices de carte (trous, reconstruction) gardent KaTeX. Vu sur `docs/screenshots/plainmath/mindmap-1440-dark.png`. Commit `nuit1/cartes-formules`.

## Retour du matin : « il n'y a pas de moyen de voir la suite »

Un clic sur un nœud de carte mentale ouvre une carte de détail avec le libellé et la note complète (rendus KaTeX) ; le disque ± plie la branche, le fond ou Échap referme. Vérifié par `scripts/mindmap-detail-shot.mjs` (desktop et mobile, `docs/screenshots/mindmap-detail/`). Commit `nuit1/cartes-detail`.

## Retour du matin : carte à trous trop longue, inclinaison qui tremble

- Carte à trous : 8 nœuds au plus par révision, sur une ou deux branches en rotation ; les autres branches sont pliées. Commit `nuit1/carte-trous-courte`.
- Inclinaison de la carte de session : plus d'aller-retour en bas des cartes hautes (pointeur suivi sur un conteneur fixe, angle amorti puis coupé). Commit `nuit1/tilt-stable`.

## Retour du matin : « détecter si j'ai bon même si ce n'est pas au caractère près »

Les formules saisies sont comparées sur une forme canonique commune au LaTeX stocké et à la saisie en clair (`canonicalMath`) : `F = q1 q2 / (4 pi eps0 r^2)` est reconnue comme `$\vec{F} = \frac{q_1 q_2}{4\pi\varepsilon_0 r^2}$`. Signes, exposants, facteurs et parenthèses de sommes restent discriminants. Commit `nuit1/formules-tolerantes`.

## Retour du matin : flashcards façon Quizlet et débloat

- Flashcard = carte à retourner, deux boutons (« Je ne savais pas » / « Je savais »), nuances et clavier conservés ; saisie et confiance désactivées par défaut (remises à zéro une fois pour les profils existants). Le bouton « Valider » qui semblait inerte sur téléphone : la réponse apparaissait sous le bord de l'écran ; les boutons de note défilent maintenant en vue.
- Session : un menu « ⋯ » remplace les quatre boutons sous la carte ; Réglages : deux sections ouvertes, sept repliées avec résumé. Captures `docs/screenshots/debloat/` (mobile). Commit `nuit1/debloat-1`.
- Page d'un cahier : trois commandes (Réviser, Ajouter ▾, ⋯) au lieu de six boutons, fiches en premier ; tableau de bord mobile sans la rangée série / semaine / activité. Commit `nuit1/debloat-2`.

## Retour du matin : « plus d'équations dans le fond »

Comptes par plan relevés de moitié (ordinateur 20/15/12/8/5 → 30/22/18/12/8, soit 90 particules ; téléphone 24 → 36), cache de sprites 120 → 160, réservoir dimensionné sur la plus grande configuration (il était figé à 60, ce qui plafonnait silencieusement). Mesure `docs/perf/fond-plus.json` : ordinateur 59,9 fps, fond 0,5 ms/frame à 90 particules ; CPU ×4 : 59,9 fps, le moteur se dégrade seul à 36 particules / 4 plans mais le fond coûte 3,5 ms/frame, un peu au-dessus du budget de 3 ms (la rasterisation de 140 sprites pèse plus que le dessin). Sur un vrai téléphone ce sont les comptes mobiles (36) qui s'appliquent, sans ce bridage artificiel. Commit `nuit1/fond-plus`.

## Retour du matin : « il faut une comparaison intelligente pour les trous »

Les textes à trous utilisent maintenant la forme canonique des formules et une tolérance aux fautes de frappe pour le texte (article ignoré, une faute dès 5 lettres, deux dès 10, rien sur les mots courts ni les nombres). Trois tests ajoutés. Commit `nuit1/trous-intelligents`.

## Retour du matin : permuter, doublons

- « Modifier » une flashcard : bouton « Permuter question et réponse » (commit `nuit1/permuter`).
- Doublons : bannière « N questions posées deux fois » dans la file à valider et sur la fiche, bouton « Nettoyer » qui ne garde que la carte à retourner (historique conservé). 4 tests. Commit `nuit1/doublons`.

## Doutes de goût (à trancher par toi)

- **Icône et favicon** passés du bleu au marine + ambre pour coller au thème : si tu tiens au bleu, `scripts/make-apple-touch-icon.mjs` (constantes `BACKGROUND` / `GLYPH`) et `public/favicon.svg` suffisent à revenir.
- **Fond animé** : plein par défaut sur ordinateur. S'il distrait pendant la lecture d'une fiche, « discret » ou « désactivé » dans Réglages → Apparence ; je n'ai pas osé le mettre en discret partout.
- **Tableau de bord mobile** : les deux anneaux (objectif du jour, connaissance conservée) prennent une carte entière pour deux chiffres.
- **Thème clair** : le bouton ambre foncé (`#8f5f0c`, imposé par le contraste AA) est plus lourd que l'ambre du thème sombre, surtout « Valider » sous un champ vide en session.
- **Bannière d'installation** : elle s'affiche aussi sur Chrome de bureau (qui propose l'installation) ; un clic sur « × » suffit, mais elle occupe le haut du tableau de bord la première fois.
- **Sidebar repliée** : mémorisée en `localStorage`, jamais proposée : si tu ne vois pas l'icône de repli en bas de la barre, elle est là.
- **Section Synchronisation** dans Réglages : longue quand un fournisseur est choisi (compte, boutons, automatique, état, appareils, nom) ; on pourrait la replier par défaut.

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

### A3.1 — tableau de bord

- Hiérarchie : une carte « Aujourd'hui » (élévation 3) avec le nombre en Fraunces qui se compte (`Counter`, 300 ms) et un seul bouton principal « Réviser · 31 dus · ~5 min », le chrono en fantôme à côté ; à droite deux anneaux (objectif du jour sur `dailyGoal`, connaissance conservée = rétrievabilité moyenne FSRS des cartes actives, examens compris). Puis série / semaine / activité (heatmap de 16 semaines sans étiquettes, lien vers Statistiques), cahiers en cartes avec liseré et « N à revoir » dans la couleur du cahier, examens à venir en dernier (badge J−N, barre segmentée des trois séances).
- CLS : la ligne du bouton principal est un squelette de même hauteur pendant le chargement, le nombre a une largeur réservée (`min-w-[2ch]`), les examens sont sous les cahiers pour qu'aucune section ne descende à leur apparition : 0,047 → 0,009 (`docs/perf/a3-1.json`). Le reste vient du sous-titre de l'en-tête (une ligne squelette de 16 px contre 20 px de texte) ; corrigé dans A3.2 avec la même hauteur.
- Vu sur les captures `a3-1` : le mobile empile proprement (hero, anneaux, série, semaine, activité) ; en clair, le bouton ambre foncé sur papier reste lisible. Doute de goût : les deux anneaux côte à côte sur mobile prennent une carte entière pour deux chiffres.

### A3.2 — session

- `GradeButtons` partagé par flashcard, démonstration et Vrai/Faux (avant : trois copies légèrement différentes) ; `ExerciseTypeBadge` avec icône en tête de chaque exercice ; champs et choix des dix joueurs sur `bg-surface-2` / `border-line` (avant : mélange `bg-surface`, `border-line-strong`).
- Carte de session en élévation 3, dans `TiltCard` (rotation ≤ 4°, reflet spéculaire radial suivant le pointeur, uniquement `(hover: hover) and (pointer: fine)` et sans reduced-motion, transform seul). Largeur de lecture 42 rem (≈ 70 caractères). En-tête et barre de progression collants et en verre.
- `Feedback` : juste → une impulsion (scale 1,02 + halo ambre, 350 ms), faux → tremblement horizontal ±2 px sur 200 ms ; reduced-motion → couleur seule. Transition entre exercices ramenée de 180 à 150 ms.
- View Transitions : `::view-transition-old/new(root)` (fondu + 8 px, 200 ms, désactivé en reduced-motion) et `viewTransition` sur les liens de navigation et les cartes de cahiers ; repli silencieux sans l'API.
- Vu sur `a3-2` : les quatre boutons de note ont la même hauteur et la même grammaire partout ; en chrono, le champ à trou dans une formule KaTeX reste aligné. À surveiller : sur mobile clair, le bouton « Valider » ambre foncé est un peu lourd sous un champ vide.

- Contenu : 60 % formules `$…$` des fiches de l'utilisateur (du cahier courant quand on est dedans), 40 % génériques ; en session, `TrainPage` pose `calm` (intensité ×0,4, vitesse ×0,5) et exclut les fiches de la file (aucune fuite de réponse) ; `CahierPage` / `ChapitrePage` posent le cahier.

### A3.3 — résultats de session

- `Results` réécrit : anneau `ProgressRing` de 132 px (teinte selon le score), trois chiffres (temps, réponses, prochain rappel), notes avec icônes et teintes (calibration sous 85 % en avertissement), liste « À retravailler » avec `ExerciseTypeBadge`. Captures `a3-3` : l'anneau lit bien sur mobile, la liste reste courte grâce aux badges.

### A3.4 — cahier et fiche

- Page du cahier : `--cahier` sur la racine, badge « N à revoir » dans la couleur du cahier (`--cahier-text` = mélange à 55 % avec le texte pour le contraste), menu « … » en verre, lignes de fiches avec pictogramme. Fiche : encadrés « L'essentiel » / « À compléter » posés à la présentation (`wrapCallouts`, testé), couverture en barre de progression, filtres de type avec icônes, badges partagés, en-tête qui passe à la ligne (`flex-wrap`, titre `min-w-[18rem]`) au lieu d'écraser le titre.
- Une édition ligne par ligne de `ChapitrePage.tsx` par script a cassé le JSX : fichier restauré (`git checkout`) puis retouches ciblées.

### A3.5 — validation

- En-tête en verre collant avec progression, carte à élévation 3 (liseré ambre ou avertissement selon le linter), badge de type, exercices réparés en tête ; J / K / E / Ctrl+A inchangés (vérifié à la main dans le navigateur).

### A3.6 — carte mentale

- **Régression trouvée sur les captures** `a2`/`a3-2` : nœuds noirs sans texte, parce que le SVG lisait `--surface`, `--ink`, `--muted`, `--bg` supprimés à A0. Corrigée par des alias CSS dans `:root` ; nœuds sur `surface-2`, traits à 80 %, police d'export Inter, couleurs de repli papier pour l'export PNG.

### A3.7 — statistiques, réglages, aller-retour Claude, mesures

- Statistiques : titres serif, tuiles chiffrées en Fraunces, sections. Réglages : sections à deux colonnes. Aller-retour Claude : gros bouton, zone de collage plus haute, bandeaux d'état.
- Passe de mesure de fin de chantier A (`docs/perf/a3-7.json`, `a11y-a3-7.json`, `lighthouse-a3-7.json`) : 0 violation axe, fps 59,9 (desktop et ×4), fond 0,6 ms / 2,1 ms ×4, CLS ≈ 0 sauf tableau de bord 0,0035 et fiche 0,0017, bundle 527,8 Ko gzip. Lighthouse perf 55 / 72 : budget ≥ 90 **non atteint** ; le TBT (~1,3 s sur le tableau de bord) persiste fond désactivé, profil CPU sans coupable unique (voir « Budgets »).
- Moteur du fond allégé (contexte de mesure partagé, sprite en cache sur la particule, LRU sans réordonner la map). CLS de la fiche : corps en squelette tant que exercices et points ne sont pas arrivés, compléments déplacés sous la fiche. Session : `typedFlashcards` / `weightedMcq` transmis par la session.

### B1 — tactile

- Barre inférieure à quatre entrées (safe-area), pages `/cahiers` et `/aide`, cibles ≥ 44 px et `kbd` masqués sur pointeur grossier (règle CSS globale), actions des cartes d'exercice visibles sans survol (`.hover-only`), session : carte en bas de l'écran + Modifier / Demain / Suspendre / Aide, balayage des flashcards (Pointer Events, tactile seulement, seuil 40 %, intervalle affiché, réglage « Balayer les flashcards »), `visualViewport` → champ focalisé ramené en vue, champs ≥ 16 px, `navigator.share` + « Coller depuis le presse-papiers » dans l'aller-retour Claude.
- Captures `b1` en 390 px, axe `a11y-b1.json` : 0 violation.

### B2 — ADR

- `docs/adr/0001-acces-mobile.md` : six options (statique, OneDrive appfolder, Google Drive appData, PouchDB/CouchDB, pair-à-pair, Supabase/Firebase) en tableau avantages / inconvénients / coût / effort / risques ; décision 1 + 2 avec mode dégradé par fichier, conséquences (schéma v6, règles de fusion, format d'échange, actions manuelles) et conditions de révision.

### B3 — moteur de fusion

- `mergeStates(a, b, { scheduler })` est pur, symétrique, idempotent et associatif (testé sur trois « appareils » avec états riches et tombstones). Journal : union par id. Exercices : contenu au `updatedAt` le plus récent, état FSRS au `fsrs.last_review` le plus récent ; si **les deux** côtés ont répondu depuis la dernière réponse commune, le journal réuni est rejoué avec le planificateur (fuzz désactivé) : aucune réponse perdue, et le même résultat quel que soit l'appareil qui fusionne. Le rejeu part de zéro (pas de l'état SM-2 converti) : sur une carte migrée de l'ère SM-2, l'état après fusion peut différer légèrement de ce que l'un des appareils affichait, mais il est cohérent avec l'historique réel.
- Suppressions : une table `tombstones` séparée (clé `[table+id]`) plutôt qu'un `deletedAt` sur chaque ligne — les lectures de l'app ne changent pas, aucun filtre à ajouter dans les requêtes. Un tombstone gagne sur une modification plus ancienne ou du même instant ; une modification plus récente ressuscite la ligne et efface le tombstone. Un exercice supprimé emporte son journal (comme une suppression locale). Supprimer un cahier ou une fiche pose un tombstone **par ligne** enfant (une fiche de 80 exercices = 80 tombstones de 60 octets), pour ne pas dépendre d'une cascade côté fusion. « Tout effacer » aussi (sinon la sync ramènerait tout).
- `deviceId` : posé par un middleware DBCore sur chaque `add`/`put` des six tables synchronisées, sauf dans les transactions marquées `noStamp` (restauration, application d'une fusion), pour que la ligne garde l'appareil qui l'a réellement écrite. Identifiant dans `localStorage` (lecture synchrone), nom d'appareil déduit de l'UA, modifiable.
- Réglages : tampon par clé dans `kv.settingsStamps`, posé par `updateSettings` ; à la migration v6, toutes les clés existantes sont datées de la migration (une vieille sauvegarde fusionnée plus tard ne les écrase pas). Clés d'appareil (`background`, `motionParallax`, `swipeToGrade`) jamais fusionnées.
- Sauvegardes : `schemaVersion` passe de 4 à 6 (aligné sur Dexie ; `backup_before_v6` porte 5 et reste importable, testé). Les fichiers 1–5 se fusionnent aussi (`stateFromBackup` date leurs réglages à l'export).
- Bundle : 547,4 → 550,1 Ko gzip (+2,7).

### B4 — fournisseurs et rondes

- `SyncProvider` : quatre opérations sur un dossier plat de fichiers nommés, avec `ifMatch` (ETag attendu, `null` = créer seulement, `undefined` = sans condition). Le moteur ne crée que des fichiers neufs (instantanés et lots) ; **seul `manifest.json` est écrit sous condition** : un 412 signifie qu'un autre appareil a synchronisé entre-temps, les fichiers créés dans la ronde sont effacés et la ronde repart (3 essais, puis erreur explicite).
- OneDrive : `GET /me/drive/special/approot` (Graph crée le dossier d'application au premier accès), `POST …/approot/children` pour le sous-dossier `sync` (409 = déjà là), `GET …:/sync:/children`, lecture par les métadonnées (`eTag` + `@microsoft.graph.downloadUrl`, téléchargé **sans** en-tête Authorization), `PUT …:/content` avec `If-Match` ou `?@microsoft.graph.conflictBehavior=fail`, session d'envoi par tranches de 1,6 Mo au-delà de 4 Mo. Le jeton et `fetch` sont injectés : les tests tournent contre un faux Graph en mémoire (approot, création du dossier une seule fois, `If-Match`, 412, 409, 401 → message qui cite `Files.ReadWrite.AppFolder`).
- **Le fournisseur OneDrive n'a pas été essayé contre un vrai compte** (pas de compte de test cette nuit) : à valider par l'utilisateur avec « Tester la connexion » (voir « Actions manuelles »).
- Dossier local : `showDirectoryPicker` (Chrome / Edge), poignée mémorisée dans `kv`, ETag = `lastModified:size` ; le contrôle-puis-écriture n'est pas atomique, acceptable pour une personne sur deux appareils via un dossier Drive / OneDrive / Dropbox.
- Rondes automatiques : 3 s après le lancement, 30 s après la dernière écriture (donc après une session), toutes les 10 min onglet visible, au retour en avant-plan et au retour du réseau ; hors ligne, rien. Les écritures faites par la ronde elle-même (fusion appliquée, curseur) ne relancent pas de ronde (fenêtre de silence de 2 s après la ronde).
- Ce que pousse un appareil : ses propres lignes (`deviceId` = lui, y compris les réponses du journal, désormais tamponnées) modifiées après sa dernière ronde, ses tombstones, les clés de réglages changées. Les lignes reçues des autres ne sont jamais renvoyées.
- Écran Réglages → Synchronisation : choix du fournisseur (OneDrive / dossier local / aucune), compte Microsoft (se connecter / se déconnecter, réutilise l'inscription OneNote), dossier (choisir / renouveler l'autorisation / oublier), « Synchroniser maintenant », « Tester la connexion » (atteint le dossier et liste les fichiers), automatique on/off, dernier résultat en clair, appareils vus, nom de l'appareil. Vu sur `docs/screenshots/B4/settings-*` : la section s'insère entre Stockage et Données, lisible en 390 px.
- Bundle : 550,1 → 556,9 Ko gzip (+6,8 ; MSAL était déjà dans le paquet principal via l'import OneNote).

### B5 — hébergement statique

- `base` lu dans `vite.config.ts` depuis `VITE_BASE` (normalisé en `/x/`), propagé à la PWA (`start_url`, `scope`, `navigateFallback` ; icônes en chemins relatifs, valables pour toute base), au routeur (`basename` = `import.meta.env.BASE_URL` sans barre finale) et à MSAL (`redirectUri` = origine + base, affiché tel quel dans Réglages → OneNote pour être déclaré à l'identique dans Entra).
- Liens profonds : `404.html` = copie d'`index.html` (plugin `spaFallback404`), plutôt que le mode hachage (casse `start_url`, le partage d'URL et les URI de redirection) ou l'astuce `sessionStorage` + redirection (aller-retour visible). Cloudflare Pages n'en a pas besoin mais ne s'en plaint pas.
- Vérifié : build avec `VITE_BASE=/cahiers/` → `index.html` et le manifest pointent sous `/cahiers/`, `404.html` présent, service worker avec repli `/cahiers/index.html` ; `vite preview --base /cahiers/` (configuration `cahiers-preview-base` de `.claude/launch.json`) sert `/cahiers/settings` directement et la navigation reste sous la base.
- Workflow : `npm ci` → `npm test` → `npm run build` (`VITE_BASE=/${{ github.event.repository.name }}/`) → `upload-pages-artifact` → `deploy-pages` ; permissions `pages: write`, `id-token: write` ; source Pages à régler une fois sur « GitHub Actions » (troisième commande de `docs/deploiement.md`).

### B6 — PWA sur le téléphone

- Icônes : `scripts/make-apple-touch-icon.mjs` étendu (sans dépendance, toujours) : `--maskable` réduit le glyphe à 60 % du côté sur un fond bord à bord (zone sûre Android), et sans argument il régénère tout : `apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png`, neuf `splash-<l>x<h>.png` (iPhone 8 → 15 Pro Max, iPad 10,2 et Pro 11) en 1,9 s, 130 Ko en tout, hors précache du service worker (PNG exclus des `globPatterns`). Palette alignée sur le design : marine `#101a30` et ambre `#f2b75c` (le `favicon.svg` bleu d'origine est passé aux mêmes couleurs).
- `index.html` : `apple-mobile-web-app-capable`, `status-bar-style: black-translucent` (la barre d'état se fond dans le marine ; `viewport-fit=cover` était déjà là), `apple-mobile-web-app-title`, un `apple-touch-startup-image` par appareil (requêtes média `device-width/height` + `-webkit-device-pixel-ratio`), deux `theme-color` (clair `#f2ede4`, sombre `#0b1220`) que `applyTheme()` réécrit quand le thème est forcé dans Réglages (vérifié : thème forcé sombre → les deux `meta` passent à `#0b1220`).
- Manifest : `display: standalone`, `orientation: any`, `id` et `start_url` = base, `background_color`/`theme_color` marine (splash Android), icônes any + maskable (192, 512) + SVG + 180.
- Bannière d'installation (`src/components/InstallBanner.tsx`) sous l'en-tête du tableau de bord : Android / Chromium → `beforeinstallprompt` capturé, bouton « Installer » qui appelle `prompt()` ; iOS Safari (pas d'événement) → texte « Partager → Sur l'écran d'accueil » avec l'argument des 7 jours ; masquée en mode standalone, « Ne plus proposer » mémorisé en `localStorage`. Captures `docs/screenshots/B6/install-ios-390-dark.png` et `install-android-412-light.png` (événement simulé : le headless ne le déclenche jamais).
- Persistance : au lancement, s'il existe au moins un cahier et que `navigator.storage.persisted()` est faux, `persist()` est redemandé (silencieux) ; redemandé aussi à `appinstalled`. L'état reste visible dans Réglages → Stockage.
- Lighthouse 12 n'a plus de catégorie PWA ni d'audit `installable-manifest` (`installable: null` dans `docs/perf/lighthouse-B6.json`) : la validité du manifest (icônes servies, `start_url`/`scope` sous la base, service worker enregistré) est vérifiée par `npm run check:base` et `npm run install:shots`. Perf/a11y B6 : tableau de bord 56 / 100, session 71 / 100 (inchangé, voir budgets).

# Rapport de la nuit 2 — mobile en profondeur

Session autonome du 15 septembre 2026, 04:11 → 06:39. Spécification : `docs/prompts/nuit2.md`. Rien n’a été poussé (`git push` à faire par toi, voir la fin).

## Sections

| Section | Contenu | Commit | Tests + build |
|---|---|---|---|
| 0 | Matrice de six appareils (`scripts/mobile-matrix.mjs`), inspecteur de débordement (`scripts/overflow.mjs`), pages partagées entre scripts. Base « 00-avant » : 204 combinaisons, 0 erreur, 14 débordements (fiche, réglages). | `nuit2/0-matrice` | vert |
| M0 | `data-action` partout, parité PC → mobile 153/153 (`docs/mobile/parite.md`), menus ⋯ en feuille du bas, clavier maths avec aperçu KaTeX, pincement + double-toucher sur la carte, MSAL par redirection, cibles ≥ 44 px, débordements de la base corrigés. | `nuit2/M0` | vert |
| M1 | Les 13 classes de bugs : dvh + repli, zones sûres 4 côtés, clavier (16 px, `enterkeyhint`), débordement, gestes (zone morte 24 px, `touch-action`, `overscroll`), modales (verrou, glisser, bouton retour), mode installé (retour, écran d’erreur), hors ligne (test Chromium), bandeau « Nouvelle version — Recharger », erreurs de stockage, canvas iOS (DPR 1,5, police évitée, moteur différé), listes longues (`content-visibility`), orientation, 0 erreur console. 24 tests Playwright × 2 téléphones + parcours enregistré (trace + vidéo). Matrice M1 : 204 / 0 / 0. | `nuit2/M1` | vert |
| M2 | `scripts/tbt.mjs` (TBT, LCP, froid/chaud, bisection par fonctionnalité), découpage du bundle (pages, KaTeX, MSAL, moteur du fond, chunk vendor), test Playwright du découpage et du budget. | `nuit2/M2` | vert |
| M3 | `docs/adr/0002-mises-a-jour-mobile.md`, `docs/mobile/idees-ecartees.md`. | `nuit2/M3` | — |
| M4 | Export « contenu seul », raccourcis + pastille, `share_target` → `/partager`, `GoogleDriveAppDataProvider` (faux Drive testé, troisième choix dans Réglages, `docs/google-cloud.md`), retour haptique / sonore. | `nuit2/M4` | vert |
| fin | Ce rapport, `DESCRIPTIF.md`, `DECISIONS.md` « Nuit 2 », matrice finale. | `nuit2/fin` | vert |

Les fichiers touchés par plusieurs sections (`main.tsx`, `vite.config.ts`, `ui.tsx`, `index.css`, `Dashboard.tsx`, `CahierPage.tsx`) sont rangés dans la dernière section qui les modifie, pour que chaque commit reste cohérent ; l’arbre final est celui qui a été testé et mesuré.

## Matrice finale

**204 combinaisons · 0 erreur console · 0 débordement horizontal** (`docs/mobile/matrix/fin/report.json`). Six appareils (iPhone SE, iPhone 14, iPhone 14 Pro Max, iPad Mini en WebKit ; Pixel 7, Galaxy S9+ en Chromium), portrait pour les 13 pages, paysage pour session / fiche / carte, sombre et clair. Base de départ : 14 débordements.

Galeries : `docs/mobile/matrix/00-avant/index.html` (base), `docs/mobile/matrix/M1/index.html`, `docs/mobile/matrix/fin/index.html`.

## Bugs — les dix qui comptent (`docs/mobile/bugs.md`, 14 lignes)

1. **Fiche plus large que l’écran** (+130 px sur iPhone SE) : la rangée « Couverture » ne repliait pas ses boutons ; `Button` ne force plus `nowrap` sous 640 px.
2. **Réglages plus larges que l’écran** (+181 px sur iPad Mini) : un bouton d’export de 411 px fixait la largeur minimale d’une grille `220px 1fr`.
3. **Débordement fantôme WebKit** : le texte de l’option la plus longue d’un `<select>` compte dans le `scrollWidth` des ancêtres.
4. **Bouton retour qui quittait la page** après feuille ⋯ → modale : deux entrées d’historique qui se marchaient dessus ; une seule pile désormais, avec le `pushState` différé tant que le `back()` précédent n’a pas atterri (spécifique WebKit).
5. **`AbortError: Skipping view transition`** en console à chaque changement d’onglet rapide sur iPhone : transitions de vue coupées sur écran tactile.
6. **Feuille du bas coincée dans l’en-tête de session** : `position: fixed` sous une barre `backdrop-filter` ; rendue dans `document.body`.
7. **Menus ⋯ fermés par `onMouseLeave`**, donc jamais au toucher : feuille du bas.
8. **Connexion Microsoft par popup** en app installée : redirection.
9. **Cases « Types d’exercices » coupées** à 320 px : grille `auto-fill`.
10. **Infobulles comptées dans la largeur de page** (iPad) : `hidden` au lieu d’`opacity: 0`.

## Parité PC → mobile (`docs/mobile/parite.md`)

- Actions PC : 153 · couvertes sur mobile : 153 · manquantes : 0 · cibles < 44 px : 0 · sans `data-action` : 0.
- Équivalents documentés (`scripts/lib/parity-equivalents.json`) : barre latérale → onglet Cahiers, « Nouveau cahier » → page Cahiers, dossier local (File System Access, absent de WebKit) → OneDrive / Google Drive, nœuds de la carte → pincement.

## Performance (Pixel 7 émulé, Chromium, CPU ×4 ; Lighthouse mobile)

Avant = build de fin de M1 (`docs/perf/*-M2-avant.json`), après = build final (`docs/perf/*-M2-apres.json`). Cibles de la spécification entre parenthèses.

| Mesure | Avant | Après | Cible |
|---|---|---|---|
| JS de démarrage, gzip | 555 Ko (1 fichier) | 224 Ko (7 fichiers : vendor 169, app 42, ui 10, markdown…) | ≤ 250 Ko ✔ |
| Lighthouse mobile, tableau de bord | perf 52 · LCP 5,7 s · TBT 1 485 ms | perf 69–75 · LCP 3,8 s · TBT 417–620 ms | perf ≥ 85 · LCP ≤ 2,5 s · TBT ≤ 200 ms |
| Lighthouse mobile, session | perf 59 · LCP 7,8 s · TBT 657 ms | perf 67–71 · LCP 6,6 s · TBT 181–289 ms | idem |
| TBT tableau de bord, froid (Pixel 7, CPU ×4) | 538–959 ms | 339–714 ms (173–306 ms à chaud) ; 212–269 ms sans le fond | ≤ 200 ms |
| TBT fiche, froid | 2 932–3 704 ms | 3 738–4 168 ms (757–2 179 ms à chaud) ; 1 531–1 934 ms sans le fond | ≤ 200 ms |
| TBT session, froid | 610 ms | 469–1 013 ms (152–429 ms à chaud) | ≤ 200 ms |
| Démarrage chaud (service worker), tableau de bord `load` | 470–593 ms | 195–326 ms | < 1 s ✔ |
| Session, fps (CPU ×4) | 59,9 | 59,9 | 60 ✔ |
| Fond animé, coût par image (CPU ×4) | 1,9 ms (130 sprites) | 3,2 ms (bureau émulé : 137 sprites ; sur téléphone 40 formules sans flou) | — |
| CLS | 0,004–0,018 | 0–0,031 | < 0,1 ✔ |

Ce qui a été fait : pages en `React.lazy` (seul le tableau de bord est dans le bundle de démarrage), KaTeX + mhchem + CSS à la première formule (85 Ko), MSAL à la première connexion (61 Ko), moteur du fond après la page, chunk `vendor` séparé, cartes d’exercices de la fiche rendues par tranches de 12 (`useProgressive`), sur téléphone : pas de flou ni de halo sur les sprites du fond, 40 formules au lieu de 200, démarrage du fond en période d’inactivité, police STIX (400 Ko) non téléchargée.

Les mesures TBT sont à un seul passage par variante (`--runs=1`) et bougent de ±40 % d’un passage à l’autre : lire les ordres de grandeur, pas les unités. Bisection (`scripts/tbt.mjs`, variante « sans-fond ») : sur la fiche, le fond animé pèse encore la moitié du TBT à froid (rasterisation des sprites sous CPU ×4, une par image) ; le reste est le rendu KaTeX de la fiche et des cartes, désormais étalé par tranches. À chaud (service worker), le tableau de bord et la session tiennent la cible. Ce qui n’est pas atteint : le LCP Lighthouse ≤ 2,5 s et le TBT ≤ 200 ms sur la fiche — le réseau simulé (4G lente) et 169 Ko de framework (React DOM 65, motion 40, Dexie 31, routeur 30) fixent le plancher ; la piste suivante serait de sortir motion du bundle de démarrage (modales et toasts chargés à la demande), non tentée cette nuit.


## ADR 0002 — ce qui a été retenu

Google Drive `appDataFolder` (inscription OAuth de l’utilisateur, pas de compte dans Cahiers), `share_target` (Android), raccourcis du manifeste + pastille, retour haptique / sonore derrière un réglage, export « contenu seul » + import fusionnant, flux Claude par la feuille de partage (déjà en place). Écartés : notifications (serveur), widgets et Watch (natif), sync périodique (Chromium seul, imprévisible), `file_handlers`, palette LaTeX complète, appui long, virtualisation par fenêtre, sous-ensemble STIX (`fonttools` absent), Fraunces « standard » (perd l’axe SOFT). Détail : `docs/mobile/idees-ecartees.md`.

## À vérifier sur un vrai téléphone (l’émulation ne le dit pas)

- **iPhone** : clavier réel et `visualViewport` (le clavier maths doit rester collé au clavier, y compris après rotation) ; geste retour depuis le bord gauche (la zone morte de 24 px ne doit pas gêner le balayage central) ; feuille du bas et modales fermées par le geste retour ; mode installé (bouton retour dans l’en-tête, pas d’écran blanc au lancement hors ligne, bandeau « Nouvelle version » après un déploiement) ; pastille (iOS 17, liée à l’autorisation de notifications : sans doute absente) ; `navigator.vibrate` absent → choisir « Son » ou « Aucun » ; connexion Microsoft et Google par redirection (le retour doit atterrir sur la même page, connecté) ; STIX non chargée : la carte de fond utilise la police système.
- **Android** : `share_target` (partager un texte depuis Chrome ou l’app Claude → Cahiers → choix du cahier → « Rédiger avec Claude » pré-rempli) ; raccourcis par appui long sur l’icône ; pastille ; vibration à la notation ; feuille de partage avec fichier pour « Partager le contenu seul ».
- **Les deux** : fluidité du pincement sur la carte mentale, swipe-down des modales, `overscroll-behavior` (pas de rafraîchissement par tirage), zones sûres en paysage sur un écran à encoche, Google Drive avec un vrai projet (guide `docs/google-cloud.md`).

Limites listées dans `docs/mobile/bugs.md` (section « Limites de l’émulation »).

## Actions manuelles pour toi

1. **`git push`** (rien n’a été poussé) : `git push origin main` → GitHub Pages redéploie.
2. **Google Cloud** (dix minutes, une fois) : `docs/google-cloud.md` — projet, API Drive, écran de consentement en mode Test avec ton Gmail, ID client Web avec origines `https://hadherbacheadem-ops.github.io` et URI de redirection `https://hadherbacheadem-ops.github.io/cahiers/` ; puis Réglages → Synchronisation → Google Drive → colle l’ID → Se connecter.
3. **Après déploiement** : ouvrir l’app installée ; le bandeau « Nouvelle version » doit apparaître ; « Recharger ».
4. **Sur ton téléphone** : parcourir la liste « À vérifier » ci-dessus ; noter ce qui cloche dans `docs/mobile/bugs.md`.
5. Optionnel : `npm run test:mobile` en local (Playwright, iPhone 14 + Pixel 7) et `npx playwright test --project=parcours` pour rejouer le parcours enregistré.

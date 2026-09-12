# Rapport de la nuit 1 — design en profondeur + accès mobile

Session autonome du 12 au 13 septembre 2026. Ce rapport est écrit au fil des étapes ; la synthèse finale est en tête une fois la nuit terminée.

## Étapes

| Étape | Contenu | État | Commit |
|---|---|---|---|
| A0 | Tokens « nuit d'encre », polices auto-hébergées (Inter, Fraunces, JetBrains Mono, STIX Two Math), lucide-react installé, page `/design` (dev), scripts `seed-demo`, `screenshots`, `perf`, `a11y`, `lighthouse`, captures « avant » | fait | `nuit1/A0` |

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

# Parcours enregistré — iPhone 14 (WebKit)

`tests/mobile/parcours.spec.ts`, projet Playwright `parcours` : tableau de bord → Cahiers → cahier → fiche → session (flashcards + vrai/faux) → résultats → statistiques → réglages. À chaque étape : pas de débordement horizontal, pas d’erreur console.

- `iphone-14-trace.zip` : trace Playwright (captures, DOM, réseau, console à chaque action). Ouvrir avec `npx playwright show-trace docs/mobile/parcours/iphone-14-trace.zip` ou sur https://trace.playwright.dev.
- `iphone-14.webm` : vidéo du parcours.
- `raw/` : sortie brute de la dernière exécution (`npx playwright test --project=parcours`), non versionnée.

Rejouer : `npm run build && npx playwright test --project=parcours`.

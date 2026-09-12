# Cahiers

Application locale de révision : tu importes tes fiches de cours (OneNote, Word, PDF ou texte collé), tu génères des exercices avec Claude **sans clé API** (le prompt s'ouvre dans claude.ai avec ton compte), puis tu t'entraînes : flashcards à répétition espacée, textes à trous, QCM, vrai/faux, associations, classements, et un mode chrono.

Toutes les données restent dans le navigateur (IndexedDB). Pense à exporter une sauvegarde depuis les réglages.

## Lancer

```bash
npm install
npm run dev
```

Puis ouvre http://localhost:5173.

## Flux de travail

1. **Cahier** — un par matière.
2. **Fiche** — colle le texte d'une page OneNote (`Ctrl+A`, `Ctrl+C`), importe un export Word/PDF, ou connecte ton compte Microsoft (voir ci-dessous).
3. **Générer avec Claude** — choisis le nombre d'exercices par type, le prompt est copié et claude.ai s'ouvre. Colle la réponse JSON de Claude dans l'app : les exercices sont rangés dans la fiche.
4. **S'entraîner** — *Réviser* (uniquement ce qui est dû, répétition espacée), *S'entraîner* (tout), *Chrono* (compte à rebours, N questions).
   Pas de nombre d'exercices imposé : tu coches les types autorisés et le prompt demande *autant d'exercices qu'il y a de points de cours, aussi petits soient-ils*.
5. **Rédiger une fiche avec Claude** — sur un cahier, « Rédiger avec Claude » : tu donnes tes sources (le cours du prof, tes notes, un extrait de manuel… collés ou importés en PDF/Word), Claude les fusionne en une fiche structurée (ou une par chapitre) sans rien perdre, avec une section « L'essentiel ». Si le programme du cahier est renseigné, il sert de fil conducteur et les notions absentes des sources sont listées sous « À compléter ».
6. **Compléter une fiche** — renseigne le *Programme de l'année* du cahier (extrait du BO, plan de cours ; texte collé ou PDF/Word importé), puis « Compléter » sur une fiche : Claude compare la fiche au programme et propose des compléments (notion manquante, à préciser, correction). Ils arrivent dans une section « Compléments proposés » où tu gardes (ajouté à la fiche) ou ignores chaque proposition.
7. **Cartes mentales** — par fiche, ou synthèse d'un cahier entier (une branche par fiche). Zoom, déplacement, pliage des branches, export PNG/SVG.

Le *niveau d'études* (réglages) est rappelé dans tous les prompts.

## Import OneNote direct (Microsoft Graph)

Gratuit, mais il faut déclarer une application chez Microsoft une fois :

1. https://portal.azure.com → **Microsoft Entra ID** → **Inscriptions d'applications** → **Nouvelle inscription**.
2. Nom libre. Types de comptes : *Comptes dans un annuaire organisationnel et comptes Microsoft personnels*.
3. URI de redirection : plateforme **Application monopage (SPA)**, valeur `http://localhost:5173` (l'origine exacte est rappelée dans les réglages).
4. Copier l'**ID d'application (client)** dans *Réglages → OneNote*.
5. *Autorisations d'API* → Microsoft Graph → déléguées → `Notes.Read`, `User.Read`.

## Stack

Vite · React 19 · TypeScript · Tailwind v4 · Dexie (IndexedDB) · Motion · Phosphor Icons · mammoth (.docx) · pdf.js · MSAL (Microsoft Graph).

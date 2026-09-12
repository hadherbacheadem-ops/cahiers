# Lot externe — mesurer le linter sur de vrais lots

Les fixtures `lot-physique.json` et `lot-maths-corrects.json` ont été écrites en connaissant les règles du linter : leur précision et leur rappel de 1,00 ne prouvent rien sur un lot réel. Ce dossier sert à mesurer le linter sur **tes** lots, sans seuil : c'est un outil de mesure, pas un test de régression.

## Déposer un lot

1. Dans l'app, génère des exercices pour une de tes fiches (Générer des exercices → Copier le prompt et ouvrir Claude).
2. Copie **toute la réponse brute de Claude** (le bloc ```json inclus, texte autour toléré) dans un fichier texte de ce dossier, par exemple `electrostatique.txt`. Un fichier par lot ; seuls les fichiers `.txt` sont lus.
3. Lance `npm test` (ou `npx vitest run src/lib/lint.external.test.ts`). Le test parse chaque fichier comme le ferait l'import, applique le linter et écrit `rapport.md` ici.

Les fichiers `.txt` et le `rapport.md` sont ignorés par git : tes fiches restent sur ta machine.

## Lire le rapport

Pour chaque fichier : nombre d'exercices, nombre rejetés au parsing (avec la raison et le texte brut), nombre de réparations d'antislashs, nombre d'exercices signalés par code de linter, puis la liste des exercices signalés avec leur texte.

À toi de compter :

- les **faux positifs** : exercices signalés qui sont en fait corrects ;
- les **défauts manqués** : exercices non signalés qui contiennent un défaut (relis aussi la liste des exercices non signalés, en fin de rapport).

Si un code de linter produit surtout des faux positifs sur tes lots, note-le dans `DECISIONS.md` avec des exemples : c'est la matière pour ajuster la règle.

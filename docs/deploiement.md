# Mettre Cahiers en ligne (pour y accéder depuis le téléphone)

L'application est entièrement locale : l'hébergeur ne sert que le code compilé, il ne voit jamais les cours ni l'historique (IndexedDB du navigateur). Rien n'est déployé automatiquement par cette documentation : les commandes ci-dessous sont à lancer par toi.

## GitHub Pages (retenu)

Le workflow `.github/workflows/deploy.yml` construit et publie le site à chaque push sur `main` : `npm ci`, `npm test`, `npm run build` avec `VITE_BASE=/<dépôt>/`, puis déploiement Pages.

Cinq commandes, depuis le dossier du projet (remplace `<utilisateur>` ; le dépôt peut être **privé**, GitHub Pages fonctionne quand même sur un compte gratuit pour un dépôt public, et pour un dépôt privé avec GitHub Pro) :

```bash
gh repo create cahiers --private --source=. --remote=origin
```

```bash
git push -u origin main
```

```bash
gh api -X POST repos/<utilisateur>/cahiers/pages -f build_type=workflow
```

```bash
gh workflow run deploy
```

```bash
gh run watch
```

Adresse attendue : **https://<utilisateur>.github.io/cahiers/** (deux à trois minutes après le premier déploiement). Si le dépôt porte un autre nom, l'adresse et la base suivent automatiquement (`github.event.repository.name`).

Sans `gh` : crée le dépôt sur github.com, `git remote add origin …`, `git push -u origin main`, puis Settings → Pages → Source « GitHub Actions » ; le workflow part au push suivant (ou via l'onglet Actions → deploy → Run workflow).

### Routage sur un hôte statique

Les liens profonds (`/cahiers/cahier/xyz`) sont servis par `404.html`, copie de `index.html` produite au build (`spaFallback404` dans `vite.config.ts`) : GitHub Pages renvoie cette page (avec un statut 404 sans conséquence) et le routeur React reprend l'URL. Le mode hachage (`#/…`) aurait évité ce fichier mais casse le partage d'URL, `start_url` de la PWA et les URI de redirection MSAL ; l'astuce de redirection (`sessionStorage` + `replaceState`) ajoute un aller-retour visible. La copie est la solution la plus simple qui garde des adresses propres.

## Variante Cloudflare Pages (cinq lignes)

1. `npm i -g wrangler && wrangler login`
2. `npm run build` (base `/`, rien à régler : le site est servi à la racine)
3. `wrangler pages project create cahiers`
4. `wrangler pages deploy dist --project-name cahiers`
5. Adresse : `https://cahiers.pages.dev` (Cloudflare sert `index.html` pour toute route inconnue : `404.html` n'est pas nécessaire mais ne gêne pas).

## Sécurité, à garder en tête

- L'app est **entièrement locale** : aucune donnée ne transite par GitHub ni Cloudflare. La synchronisation, si tu l'actives, passe par **ton** OneDrive (dossier d'application privé) ou un dossier de ton choix.
- L'ID d'application Microsoft (client) **n'est pas un secret** : c'est un identifiant public, comme pour toute application monopage (flux PKCE, sans secret client). Il peut figurer dans le code déployé sans risque.
- L'**URI de redirection** déclarée dans le portail Entra doit correspondre **exactement** à l'adresse de l'app : `http://localhost:5173/` en développement, `https://<utilisateur>.github.io/cahiers/` une fois hébergée (Réglages → OneNote affiche l'adresse exacte à déclarer). Une inscription peut porter plusieurs URI.
- Le dépôt peut rester privé ; le site publié, lui, est accessible à qui connaît l'adresse (il ne contient aucune donnée : juste l'app vide, chaque navigateur a sa propre base).

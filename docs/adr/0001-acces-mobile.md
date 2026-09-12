# ADR 0001 — Accéder à Cahiers depuis le téléphone

Statut : accepté (nuit 1, 13 septembre 2026). Décision prise sans l'utilisateur, selon la règle : données préservées > local sans serveur > simple > performant.

## Contexte et contraintes

- Toutes les données (fiches, exercices, journal FSRS) vivent dans IndexedDB du navigateur ; aucune clé API, aucun serveur applicatif, gratuité.
- Vie privée : les cours de l'utilisateur ne doivent transiter que par des services qu'il contrôle déjà.
- L'utilisateur a **déjà une inscription d'application Microsoft Entra** (flux navigateur PKCE) pour importer OneNote via Microsoft Graph.
- Le téléphone doit pouvoir réviser hors ligne, et l'état FSRS révisé sur un appareil doit finir par arriver sur l'autre sans écraser le travail fait ailleurs.

## Options étudiées

| # | Option | Avantages | Inconvénients | Coût | Effort | Risques |
|---|---|---|---|---|---|---|
| 1 | **Hébergement statique** du build (GitHub Pages, Cloudflare Pages, Netlify, Vercel) | HTTPS gratuit, PWA installable sur l'écran d'accueil, aucune donnée côté hébergeur (l'app est 100 % locale), déploiement par `git push` | Le téléphone a **sa propre** base IndexedDB : aucune synchronisation par elle-même | 0 € | 1 h (workflow + base configurable) | Stockage effaçable par le navigateur mobile sous pression ; à compenser par la sync ou des exports |
| 2 | **Synchronisation OneDrive « dossier d'application »** (`/me/drive/special/approot`, permission `Files.ReadWrite.AppFolder`) avec l'inscription Entra existante | Zéro serveur, compte déjà en place, quota OneDrive de l'utilisateur, le dossier n'est visible que par l'app, ETag natif pour l'écriture optimiste, fonctionne depuis n'importe quel appareil connecté | Nécessite la fusion locale (conflits) ; dépend de Microsoft ; la permission doit être ajoutée dans le portail Entra ; token à renouveler (MSAL le gère) | 0 € | 1 nuit (moteur de fusion + fournisseur + écran) | Fournisseur écrit sans compte de test réel : à valider par l'utilisateur ; limites de débit Graph (négligeables à notre volume) |
| 3 | Google Drive `appDataFolder` | Équivalent de 2 pour un compte Google | Nouvelle inscription OAuth Google (écran de consentement, vérification), pas de compte en place | 0 € | 1 jour | Décrit seulement ; à faire si l'utilisateur préfère Google |
| 4 | PouchDB ↔ CouchDB | Réplication native, résolution de conflits intégrée, hors ligne d'abord | Un CouchDB à héberger et maintenir (Cloudant a un palier gratuit mais reste un service tiers), réécriture de la couche Dexie, documents de cours chez un tiers | 0–5 €/mois | Plusieurs jours | Non retenu : service à maintenir, données chez un tiers |
| 5 | Pair-à-pair sur le réseau local (WebRTC + QR code de jumelage) | Aucun compte, rien ne quitte la maison | Les deux appareils doivent être allumés et sur le même réseau au même moment ; signalisation pénible (un service ou un QR code par session) ; pas de réplication différée | 0 € | Plusieurs jours | Non retenu : usage réel trop contraint |
| 6 | Serveur de sync minimal (Supabase / Firebase) | Simple à mettre en place, temps réel | Compte tiers, cours de l'utilisateur stockés chez un tiers, quotas et conditions qui changent, clé de projet à embarquer | 0 € puis payant | 1–2 jours | Non retenu : contraire à la contrainte de vie privée |

## Décision

**1 + 2** : hébergement statique sur GitHub Pages **et** synchronisation OneDrive appfolder avec fusion locale.

- L'app hébergée reste entièrement locale : GitHub ne voit que le code compilé.
- La sync est manuelle (« Synchroniser maintenant ») ou automatique : au démarrage, après une session, puis toutes les 10 minutes quand l'onglet est visible.
- **Mode dégradé sans compte Microsoft** : export / import **fusionnant** par fichier (le même moteur de fusion, un fichier déposé dans un dossier partagé ou envoyé par AirDrop / mail). L'import « Restaurer » existant (écrasement) reste disponible et clairement distingué.

## Conséquences

- Schéma Dexie v6 : `updatedAt` et `deviceId` sur chaque enregistrement, suppressions en tombstones (`deletedAt`, purgées après 90 jours), sauvegarde de migration `backup_before_v6` écrite par le mécanisme existant.
- Le journal `reviewLogs` est en ajout seul : union sans conflit. Les exercices fusionnent l'état FSRS par `fsrs.last_review` le plus récent ; les autres tables au dernier `updatedAt`, avec résurrection possible d'un enregistrement supprimé si une modification est plus récente que la suppression.
- Format d'échange dans le dossier d'application : `manifest.json` (ETag), `snapshot-<n>.json` (état complet, tous les 500 changements ou 7 jours), `changes-<deviceId>-<seq>.json` (lots depuis le snapshot). Chaque fichier porte `schemaVersion` et passe par `migrateBackup()` si nécessaire.
- Réglages d'appareil (fond animé, mouvement, balayage) jamais synchronisés.
- Actions manuelles pour l'utilisateur (listées dans `RAPPORT_NUIT.md`) : ajouter la permission déléguée `Files.ReadWrite.AppFolder` et l'URI de redirection de l'origine hébergée dans le portail Entra ; créer le dépôt GitHub et activer Pages.

## Ce qui ferait changer la décision

- Si OneDrive s'avère trop lent ou trop capricieux à l'usage (tokens, quotas) : l'option 3 est symétrique et le moteur de fusion est indépendant du fournisseur (`SyncProvider`).
- Si un jour plusieurs personnes doivent partager des cahiers : seule une option avec serveur (4 ou 6) le permettrait proprement.

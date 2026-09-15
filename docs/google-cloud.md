# Synchroniser par Google Drive — créer ton identifiant client Google

Comme pour OneNote (inscription Microsoft Entra), Cahiers n’embarque aucune clé : la synchronisation Google Drive utilise **ton** projet Google Cloud, gratuit, et n’écrit que dans le dossier d’application de **ton** Drive (`appDataFolder`, invisible dans l’interface Drive, propre à l’app). Compte dix minutes, une seule fois.

## 1. Créer le projet

1. Ouvre https://console.cloud.google.com et connecte-toi avec ton compte Google.
2. En haut, menu du projet → **Nouveau projet** → nom « Cahiers » → **Créer**. Attends la notification, puis sélectionne le projet.

## 2. Activer l’API Drive

1. Menu ☰ → **API et services** → **Bibliothèque**.
2. Cherche « Google Drive API » → **Activer**.

## 3. Écran de consentement (mode Test)

1. **API et services** → **Écran de consentement OAuth** (ou « Google Auth Platform » → *Branding*).
2. Type d’utilisateur : **Externe** → Créer.
3. Nom de l’application : « Cahiers » ; e-mail d’assistance : le tien ; coordonnées du développeur : le tien. Enregistrer.
4. **Audience** / *Utilisateurs test* : ajoute **ton adresse Gmail** (et celles des camarades qui utiliseront l’app). Le statut de publication reste **Test** : c’est suffisant, sans vérification Google, puisque le périmètre `drive.appdata` n’est pas sensible.
5. **Accès aux données** / *Champs d’application* : **Ajouter ou supprimer des champs d’application** → coche `https://www.googleapis.com/auth/drive.appdata` (« Voir, créer et supprimer ses propres données de configuration dans votre Google Drive ») → Mettre à jour → Enregistrer.

## 4. L’identifiant client

1. **API et services** → **Identifiants** → **Créer des identifiants** → **ID client OAuth**.
2. Type d’application : **Application Web**. Nom : « Cahiers web ».
3. **Origines JavaScript autorisées** — ajoute une ligne par adresse où tu ouvres Cahiers :
   - `https://hadherbacheadem-ops.github.io`
   - `http://localhost:5173` et `http://localhost:4199` si tu lances l’app sur ton PC.
4. **URI de redirection autorisés** — l’adresse exacte de l’app, avec la barre finale (utilisée sur téléphone et en app installée) :
   - `https://hadherbacheadem-ops.github.io/cahiers/`
   - `http://localhost:5173/` et `http://localhost:4199/` le cas échéant.
5. **Créer** → copie l’**ID client** (`xxxxxxxx-xxxxxxxx.apps.googleusercontent.com`). Aucun secret n’est nécessaire (flux navigateur).

## 5. Dans Cahiers

1. Réglages → **Synchronisation** → « Où synchroniser » : **Google Drive — dossier d’application**.
2. Colle l’ID client dans le champ, puis **Se connecter à Google** : sur PC une fenêtre Google s’ouvre ; sur téléphone ou en app installée la page part vers Google et revient.
3. **Tester la connexion**, puis **Synchroniser maintenant**. Sur le second appareil : mêmes réglages, même compte Google.

## Ce qu’il faut savoir

- Le jeton dure **une heure** et n’est gardé que pour la session du navigateur : quand il expire, Google redemande l’accord silencieusement (PC) ou par un aller-retour (téléphone) à la synchronisation suivante ; la synchronisation automatique attend alors ton clic sur « Se connecter ».
- Google Drive n’a pas d’écriture conditionnelle : deux appareils qui synchronisent à la même seconde se détectent par le numéro de version du fichier et rejouent le tour. Aucune réponse ni fiche n’est perdue (les journaux sont ajoutés, jamais réécrits).
- En mode **Test**, seuls les comptes listés comme testeurs peuvent se connecter (100 maximum). Pour ouvrir à tout le monde il faudrait « Publier » l’app, ce qui n’est pas nécessaire ici.
- Pour révoquer : https://myaccount.google.com/permissions → « Cahiers » → Supprimer l’accès. Le dossier d’application est effacé avec.

// Kept separate from graph.ts so the settings page does not pull MSAL into the main bundle.

/** OneNote import (User.Read, Notes.Read) and the sync folder (Files.ReadWrite.AppFolder: only the app's own folder in OneDrive). */
export const GRAPH_SCOPES = ['User.Read', 'Notes.Read', 'Files.ReadWrite.AppFolder']

/** Exact redirect URI to register: origin + base (e.g. https://moi.github.io/cahiers/). */
export const GRAPH_REDIRECT_URI = () => `${window.location.origin}${import.meta.env.BASE_URL}`
export const GRAPH_REDIRECT_HINT = GRAPH_REDIRECT_URI

export const GRAPH_SETUP_STEPS: string[] = [
  'Ouvre portal.azure.com et connecte-toi avec ton compte Microsoft (le portail est gratuit).',
  'Va dans « Microsoft Entra ID », puis « Inscriptions d’applications » et clique sur « Nouvelle inscription ».',
  'Donne un nom libre (ex. Cahiers).',
  'Types de comptes pris en charge : choisis « Comptes dans un annuaire organisationnel et comptes Microsoft personnels » (ou « Comptes Microsoft personnels uniquement »).',
  `URI de redirection : plateforme « Application monopage (SPA) », valeur = l’adresse exacte de cette app (${typeof window !== 'undefined' ? GRAPH_REDIRECT_URI() : 'ex. http://localhost:5173/'}) ; ajoute-en une par adresse utilisée (locale et hébergée).`,
  'Clique sur « Inscrire », puis copie l’« ID d’application (client) » affiché sur la page de vue d’ensemble.',
  'Dans « Autorisations d’API », ajoute Microsoft Graph → autorisations déléguées → Notes.Read, User.Read et Files.ReadWrite.AppFolder (ce dernier pour la synchronisation : l’app ne voit que son propre dossier dans OneDrive ; aucun consentement administrateur n’est nécessaire pour un compte personnel).',
  'Colle l’ID d’application (client) ci-dessous.',
]

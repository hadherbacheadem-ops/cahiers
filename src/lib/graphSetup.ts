// Kept separate from graph.ts so the settings page does not pull MSAL into the main bundle.

export const GRAPH_SCOPES = ['User.Read', 'Notes.Read']

export const GRAPH_REDIRECT_HINT = () => window.location.origin

export const GRAPH_SETUP_STEPS: string[] = [
  'Ouvre portal.azure.com et connecte-toi avec ton compte Microsoft (le portail est gratuit).',
  'Va dans « Microsoft Entra ID », puis « Inscriptions d’applications » et clique sur « Nouvelle inscription ».',
  'Donne un nom libre (ex. Cahiers).',
  'Types de comptes pris en charge : choisis « Comptes dans un annuaire organisationnel et comptes Microsoft personnels » (ou « Comptes Microsoft personnels uniquement »).',
  `URI de redirection : plateforme « Application monopage (SPA) », valeur = l’adresse de cette app (${typeof window !== 'undefined' ? window.location.origin : 'ex. http://localhost:5173'}).`,
  'Clique sur « Inscrire », puis copie l’« ID d’application (client) » affiché sur la page de vue d’ensemble.',
  'Dans « Autorisations d’API », ajoute Microsoft Graph → autorisations déléguées → Notes.Read et User.Read (aucun consentement administrateur n’est nécessaire pour un compte personnel).',
  'Colle l’ID d’application (client) ci-dessous.',
]

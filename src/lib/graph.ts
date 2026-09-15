// Microsoft Graph / OneNote access through MSAL (single-page app, PKCE, popup).
// The user supplies their own free Entra app registration id (Settings.graphClientId).

import type { AccountInfo, PublicClientApplication } from '@azure/msal-browser'
import { htmlToText } from './htmlToText'
import { GRAPH_REDIRECT_URI, GRAPH_SCOPES } from './graphSetup'
import { isPhone, isStandalone } from './media'

export { GRAPH_REDIRECT_HINT, GRAPH_SCOPES, GRAPH_SETUP_STEPS } from './graphSetup'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

// ---- MSAL ------------------------------------------------------------------

const instances = new Map<string, Promise<PublicClientApplication>>()

export function getMsal(clientId: string): Promise<PublicClientApplication> {
  let p = instances.get(clientId)
  if (!p) {
    p = (async () => {
      // MSAL is only needed once the user connects Microsoft: loaded here, not at start-up.
      const { PublicClientApplication } = await import('@azure/msal-browser')
      const pca = new PublicClientApplication({
        auth: { clientId, authority: 'https://login.microsoftonline.com/common', redirectUri: GRAPH_REDIRECT_URI() },
        cache: { cacheLocation: 'localStorage' },
      })
      await pca.initialize()
      // Back from a redirect sign-in (phones, installed app): adopt the account it carries.
      try {
        const back = await pca.handleRedirectPromise()
        if (back?.account) pca.setActiveAccount(back.account)
      } catch {
        /* surfaced by the next signIn */
      }
      return pca
    })()
    instances.set(clientId, p)
  }
  return p
}

/** Popups are blocked or lost in installed apps and on iOS: there, sign in by full-page redirect. */
export function usesRedirectFlow(): boolean {
  return isPhone() || isStandalone()
}

export async function signIn(clientId: string): Promise<AccountInfo> {
  const pca = await getMsal(clientId)
  if (usesRedirectFlow()) {
    await pca.loginRedirect({ scopes: GRAPH_SCOPES, prompt: 'select_account' })
    // The page is leaving; the account is picked up by handleRedirectPromise on return.
    return new Promise<AccountInfo>(() => {})
  }
  const res = await pca.loginPopup({ scopes: GRAPH_SCOPES, prompt: 'select_account' })
  const account = res.account ?? pca.getAllAccounts()[0]
  if (!account) throw new Error('Connexion Microsoft impossible : aucun compte renvoyé.')
  pca.setActiveAccount(account)
  return account
}

export async function getActiveAccount(clientId: string): Promise<AccountInfo | null> {
  const pca = await getMsal(clientId)
  const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null
  if (account) pca.setActiveAccount(account)
  return account
}

/** Clears the local token cache without navigating away from the app. */
export async function signOut(clientId: string): Promise<void> {
  const pca = await getMsal(clientId)
  const account = pca.getActiveAccount() ?? undefined
  await pca.clearCache(account ? { account } : undefined)
  pca.setActiveAccount(null)
}

export async function acquireToken(clientId: string): Promise<string> {
  const pca = await getMsal(clientId)
  const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0]
  if (!account) throw new Error('Tu n’es pas connecté à Microsoft.')
  try {
    const res = await pca.acquireTokenSilent({ scopes: GRAPH_SCOPES, account })
    return res.accessToken
  } catch (err) {
    if ((err as { name?: string } | null)?.name === 'InteractionRequiredAuthError') {
      const res = await pca.acquireTokenPopup({ scopes: GRAPH_SCOPES, account })
      return res.accessToken
    }
    throw err
  }
}

// ---- Graph calls -----------------------------------------------------------

export interface GraphNotebook {
  id: string
  displayName: string
  lastModifiedDateTime?: string
}

export interface GraphSection {
  id: string
  displayName: string
  parentNotebookId?: string
}

export interface GraphPage {
  id: string
  title: string
  lastModifiedDateTime: string
  parentSectionId?: string
}

async function graphFetch(clientId: string, url: string, accept = 'application/json'): Promise<Response> {
  const token = await acquireToken(clientId)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: accept } })
  if (!res.ok) throw new Error(await describeError(res))
  return res
}

async function describeError(res: Response): Promise<string> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    detail = body.error?.message ?? ''
  } catch {
    // Body was not JSON; the status alone is informative enough.
  }
  const suffix = detail ? ` (${detail})` : ''
  if (res.status === 401 || res.status === 403) {
    return `Accès refusé par Microsoft Graph (HTTP ${res.status}). Vérifie que l’application dispose des autorisations Notes.Read et User.Read, puis reconnecte-toi.${suffix}`
  }
  if (res.status === 404) return `Élément introuvable dans OneNote (HTTP 404).${suffix}`
  if (res.status === 429) return `Microsoft Graph limite les requêtes (HTTP 429). Réessaie dans quelques secondes.${suffix}`
  return `Erreur Microsoft Graph (HTTP ${res.status}).${suffix}`
}

/** Follows @odata.nextLink until every item has been collected. */
async function graphList<T>(clientId: string, firstUrl: string): Promise<T[]> {
  const items: T[] = []
  let url: string | undefined = firstUrl
  while (url) {
    const res = await graphFetch(clientId, url)
    const body = (await res.json()) as { value?: T[]; '@odata.nextLink'?: string }
    items.push(...(body.value ?? []))
    url = body['@odata.nextLink']
  }
  return items
}

export function listNotebooks(clientId: string): Promise<GraphNotebook[]> {
  return graphList<GraphNotebook>(clientId, `${GRAPH_BASE}/me/onenote/notebooks?$select=id,displayName,lastModifiedDateTime&$orderby=displayName&$top=100`)
}

export async function listSections(clientId: string, notebookId: string): Promise<GraphSection[]> {
  const sections = await graphList<GraphSection>(clientId, `${GRAPH_BASE}/me/onenote/notebooks/${encodeURIComponent(notebookId)}/sections?$select=id,displayName&$top=100`)
  return sections.map((s) => ({ ...s, parentNotebookId: notebookId }))
}

export async function listPages(clientId: string, sectionId: string): Promise<GraphPage[]> {
  const pages = await graphList<GraphPage>(
    clientId,
    `${GRAPH_BASE}/me/onenote/sections/${encodeURIComponent(sectionId)}/pages?$select=id,title,lastModifiedDateTime&$orderby=lastModifiedDateTime desc&$top=100`,
  )
  return pages.map((p) => ({ ...p, title: p.title || 'Sans titre', parentSectionId: sectionId }))
}

export async function getPageHtml(clientId: string, pageId: string): Promise<string> {
  const res = await graphFetch(clientId, `${GRAPH_BASE}/me/onenote/pages/${encodeURIComponent(pageId)}/content?includeIDs=false`, 'text/html')
  return res.text()
}

/** Page content as light markdown, without the title OneNote repeats at the top of the body. */
export async function getPageText(clientId: string, pageId: string, title?: string): Promise<string> {
  const html = await getPageHtml(clientId, pageId)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const pageTitle = (title ?? doc.title ?? '').trim()
  doc.querySelectorAll('title').forEach((n) => n.remove())
  const text = htmlToText(doc.body.innerHTML)
  if (!pageTitle) return text
  // Drop a leading heading identical to the title (OneNote puts the title in the body as well).
  const m = text.match(/^(#{1,6}\s+)?(.+)\n*/)
  if (m && m[2].trim().toLowerCase() === pageTitle.toLowerCase()) return text.slice(m[0].length).trim()
  return text
}

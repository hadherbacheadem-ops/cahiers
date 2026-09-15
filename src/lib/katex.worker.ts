// KaTeX off the main thread: receives { id, latex, display }, answers { id, html }.
// Bundled by Vite as its own worker chunk, fetched with the first formula.
import katex from 'katex'
import 'katex/contrib/mhchem'
import { handleRequest, type MathRequest } from './katexWorkerCore'

self.onmessage = (e: MessageEvent<MathRequest | MathRequest[]>) => {
  const reqs = Array.isArray(e.data) ? e.data : [e.data]
  self.postMessage(reqs.map((r) => handleRequest(katex, r)))
}

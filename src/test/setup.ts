// In-memory IndexedDB so Dexie can run under Node in the tests.
import 'fake-indexeddb/auto'

// KaTeX is lazy in the app; the tests render formulas synchronously.
import katex from 'katex'
import 'katex/contrib/mhchem'
import { setKatex } from '../lib/markdown'
setKatex(katex)

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { DEFAULT_SETTINGS, type Settings } from '../types'

/** Live settings merged with defaults; undefined while the first read is pending. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => {
    const stored = await db.settings.get('app')
    return { ...DEFAULT_SETTINGS, ...stored }
  }, [])
}

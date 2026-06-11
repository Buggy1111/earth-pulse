/** Wikimedia EventStreams (SSE) — parse recentchange events into a small ticker model. */

export const WIKI_STREAM_URL = 'https://stream.wikimedia.org/v2/stream/recentchange'

export interface WikiEdit {
  title: string
  wiki: string
  user: string
  isBot: boolean
  url: string
}

interface RecentChange {
  type?: string
  title?: string
  server_name?: string
  user?: string
  bot?: boolean
  meta?: { uri?: string }
  namespace?: number
}

/** Human edits to articles on real wikipedias; null for everything else. */
export function parseWikiEvent(raw: string): WikiEdit | null {
  let data: RecentChange
  try {
    data = JSON.parse(raw) as RecentChange
  } catch {
    return null
  }
  if (data.type !== 'edit' && data.type !== 'new') return null
  if (data.bot) return null
  if (data.namespace !== 0) return null // only articles
  const server = data.server_name ?? ''
  if (!server.endsWith('wikipedia.org')) return null
  if (!data.title || !data.user) return null
  return {
    title: data.title,
    wiki: server.replace('.wikipedia.org', ''),
    user: data.user,
    isBot: false,
    url: data.meta?.uri ?? `https://${server}/wiki/${encodeURIComponent(data.title)}`,
  }
}

/** Keep the newest `max` edits, newest first. */
export function pushEdit(list: WikiEdit[], edit: WikiEdit, max = 7): WikiEdit[] {
  return [edit, ...list].slice(0, max)
}

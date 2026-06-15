import axios from 'axios'

import { anticheatClient, isAnticheatConfigured } from './anticheat-client'
import { setExtraBlockedProcesses } from './blocklist'
import type { BlockedProcess } from '../types'

// Pulls the admin-managed extra blocklist from the anti-cheating service and
// feeds it into the in-memory store (see blocklist.ts). The request is signed
// with HMAC-SHA256 by anticheatClient, so the endpoint can't be scraped/forged
// by anything that doesn't hold the shared secret baked into this app.
const REQUEST_PATH = '/api/v1/app-blocks'
const SYNC_INTERVAL_MS = 15 * 60 * 1000

type ApiItem = { name?: string; patterns?: string[]; enabled?: boolean }
type ApiResponse = { data?: ApiItem[] }

const fetchExtras = async (): Promise<BlockedProcess[] | null> => {
  try {
    const res = await anticheatClient.get<ApiResponse>(REQUEST_PATH)
    const items = Array.isArray(res.data?.data) ? res.data.data : []

    return items
      .filter((it) => it && it.name && Array.isArray(it.patterns) && it.patterns.length > 0)
      .map((it) => ({ name: String(it.name), patterns: it.patterns!.map(String) }))
  } catch (err) {
    console.warn(
      '[Blocklist] sync failed (keeping baseline + last-known extras):',
      axios.isAxiosError(err) ? err.message : err
    )
    return null
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

export const startBlocklistSync = (): void => {
  if (!isAnticheatConfigured()) {
    console.warn(
      '[Blocklist] VITE_API_ANTI_URL / VITE_APP_HMAC_SECRET not set — ' +
        'using the hardcoded baseline only.'
    )
    return
  }

  const run = async (): Promise<void> => {
    const fetched = await fetchExtras()
    if (fetched) setExtraBlockedProcesses(fetched)
  }

  void run()
  intervalId = setInterval(() => void run(), SYNC_INTERVAL_MS)
}

export const stopBlocklistSync = (): void => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

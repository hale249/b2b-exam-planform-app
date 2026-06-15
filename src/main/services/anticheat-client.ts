import { createHmac } from 'crypto'

import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_ANTI_URL
const HMAC_SECRET = import.meta.env.VITE_APP_HMAC_SECRET
const REQUEST_TIMEOUT_MS = 10_000

export const isAnticheatConfigured = (): boolean => Boolean(BASE_URL && HMAC_SECRET)

const sign = (timestamp: string, method: string, path: string): string =>
  createHmac('sha256', HMAC_SECRET).update(`${timestamp}\n${method}\n${path}`).digest('hex')

export const anticheatClient = axios.create({
  baseURL: BASE_URL ? BASE_URL.replace(/\/+$/, '') : undefined,
  timeout: REQUEST_TIMEOUT_MS
})

anticheatClient.interceptors.request.use((config) => {
  if (!HMAC_SECRET) return config
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const method = (config.method ?? 'get').toUpperCase()
  // Sign the path only (no query/host) — it's what the server hashes.
  const path = (config.url ?? '').split('?')[0]
  config.headers.set('X-Timestamp', timestamp)
  config.headers.set('X-Signature', sign(timestamp, method, path))
  return config
})

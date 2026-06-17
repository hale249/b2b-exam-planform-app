import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

import { renameSync, writeFileSync } from 'fs'

import { app } from 'electron'
import { readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'

import { anticheatClient, isAnticheatConfigured } from './anticheat-client'

// Native app events (OS-level anti-cheat signals the web can't see) are written
// to a LOCAL on-disk outbox the moment they happen — even before we know which
// user is sitting the exam. The file is encrypted + authenticated (AES-256-GCM)
// with a key derived from the embedded HMAC secret, so a candidate can't read
// it, and can't edit it to inject fake events (a tampered file fails the GCM
// auth tag and is dropped). Once we learn the user's token (read from the web's
// localStorage), the outbox is flushed and the synced entries deleted.
//
// Identity = the candidate's token (server resolves the user via VerifyToken);
// batch_candidate_id is sent too for exam correlation when known. The request is
// HMAC-signed (anticheatClient) → tagged source="app" server-side.
//
// Honest limit: on a machine the candidate controls this raises the bar but is
// not unbreakable (the secret is extractable). The backend allowlists event
// names + rate-limits, and these are supporting signals, not sole proof.

type OutboxEvent = {
  event: string
  properties?: Record<string, unknown>
  occurred_at: string // first occurrence, UTC ISO
  local_time: string // first occurrence, local wall-clock + offset
  count: number // how many identical occurrences were coalesced
  last_occurred_at: string // last occurrence, UTC ISO (only meaningful if count > 1)
  last_local_time: string // last occurrence, local
}

const REQUEST_PATH = '/api/v1/app-events'
const MAX_OUTBOX = 1000 // hard cap so a long offline stretch can't grow unbounded
const MAX_PER_SYNC = 200
// Send shortly after an action happens (there's normally network). The short
// debounce just coalesces a burst into one request.
const SYNC_DEBOUNCE_MS = 1_500
// Safety-net retry: drains the outbox even with no new events — this is what
// recovers events that piled up while offline once the network is back.
const SYNC_INTERVAL_MS = 60_000
// Events never synced within this age (e.g. the machine generated events but
// nobody logged in) are dropped — stale anti-cheat signals have no value.
const RETENTION_MS = 2 * 24 * 60 * 60 * 1000 // 2 days
// Same event within this window is grouped into ONE row (count + first/last
// time) so we get "in this period, event X happened N times" instead of a row
// per occurrence.
const GROUP_WINDOW_MS = 60_000

// Only IMPORTANT events are buffered/synced — not every native signal needs to
// reach the server. Focus lost/regained are intentionally excluded: the web SDK
// already logs focus/unfocus, so logging them again from the app is noise.
const IMPORTANT_EVENTS = new Set<string>([
  'app_blocked_process_detected',
  'app_screenshot_blocked',
  'app_screen_recording_detected',
  'app_kiosk_exit_attempt',
  'app_exam_exit',
  'app_display_changed'
])

// Local wall-clock time of the action, with timezone offset (e.g.
// "2026-06-15T14:32:05+07:00") — alongside the canonical UTC occurred_at.
const localIso = (ms: number): string => {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`
  )
}

const sameProps = (a?: Record<string, unknown>, b?: Record<string, unknown>): boolean =>
  JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})

// 32-byte key derived from the shared secret. (If the secret is unset there's no
// sync anyway, so the at-rest key being weak doesn't matter — nothing leaves.)
const ENC_KEY = createHash('sha256')
  .update(import.meta.env.VITE_APP_HMAC_SECRET || '')
  .digest()

const encrypt = (plain: string): string => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64')
}

const decrypt = (data: string): string | null => {
  try {
    const buf = Buffer.from(data, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', ENC_KEY, buf.subarray(0, 12))
    decipher.setAuthTag(buf.subarray(12, 28))
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
  } catch {
    return null // tampered / wrong key / corrupt → treat as no data
  }
}

let outbox: OutboxEvent[] = []
let authToken: string | null = null
let batchCandidateId = 0
let filePath = ''
let started = false
let syncing = false
let persistChain: Promise<void> = Promise.resolve()
let intervalTimer: ReturnType<typeof setInterval> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Trigger a sync soon after an action (debounced to batch bursts). On failure
// (e.g. offline) the periodic timer keeps retrying.
const scheduleSync = (): void => {
  if (debounceTimer) return
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void syncNow()
  }, SYNC_DEBOUNCE_MS)
}

const persist = (): void => {
  const blob = encrypt(JSON.stringify(outbox))
  // Serialize writes and write atomically (tmp + rename) so a crash mid-write
  // can't corrupt the outbox.
  persistChain = persistChain.then(async () => {
    const tmp = `${filePath}.tmp`
    await writeFile(tmp, blob, 'utf-8')
    await rename(tmp, filePath)
  })
  persistChain.catch((err) =>
    console.warn('[AppEvents] failed to persist outbox:', err instanceof Error ? err.message : err)
  )
}

// Drop events older than the retention window (by their last occurrence). Runs
// on load and each periodic tick, so stale logs are deleted even if they never
// sync.
const pruneOldEvents = (): void => {
  if (outbox.length === 0) return
  const cutoff = Date.now() - RETENTION_MS
  const before = outbox.length
  outbox = outbox.filter((e) => Date.parse(e.last_occurred_at) >= cutoff)
  if (outbox.length !== before) persist()
}

// Triggered shortly after each action (debounced) and by the periodic safety
// net. Drains the whole outbox in batches; on the first failure it stops and
// keeps the rest for the next attempt. Requires the token (identity) to be known.
const syncNow = async (): Promise<void> => {
  if (syncing || !isAnticheatConfigured() || !authToken || outbox.length === 0) return
  syncing = true
  try {
    while (outbox.length > 0) {
      const batch = outbox.slice(0, MAX_PER_SYNC)
      // Flatten coalesced metadata into properties so it lands in the row.
      const events = batch.map((e) => ({
        event: e.event,
        occurred_at: e.occurred_at,
        properties: {
          ...e.properties,
          local_time: e.local_time,
          count: e.count,
          ...(e.count > 1
            ? { last_occurred_at: e.last_occurred_at, last_local_time: e.last_local_time }
            : {})
        }
      }))
      await anticheatClient.post(REQUEST_PATH, {
        token: authToken,
        batch_candidate_id: batchCandidateId,
        events
      })
      // Success → drop exactly what we sent (only ever appended to the tail, so
      // the first N are still the same N) and persist the shrunk outbox.
      outbox.splice(0, events.length)
      persist()
    }
  } catch (err) {
    // Offline / server down / bad signature / bad token: keep the events, retry
    // on the next tick. Never throw — must not affect the exam.
    console.warn(
      '[AppEvents] sync failed (keeping outbox):',
      err instanceof Error ? err.message : err
    )
  } finally {
    syncing = false
  }
}

/** Record a native app event. Safe to call anytime, even before login.
 * Only IMPORTANT events are kept; the rest are ignored. Same event within the
 * same GROUP_WINDOW_MS window is merged into one row (count + first/last time),
 * so each row summarises a time window rather than a single occurrence. */
export const emitAppEvent = (event: string, properties?: Record<string, unknown>): void => {
  if (!started || !IMPORTANT_EVENTS.has(event)) return
  const nowMs = Date.now()
  const iso = new Date(nowMs).toISOString()
  const local = localIso(nowMs)

  // Group with an OPEN window of the same event+props (within GROUP_WINDOW_MS of
  // its first occurrence) — even if other events came in between.
  const group = outbox.find(
    (e) =>
      e.event === event &&
      sameProps(e.properties, properties) &&
      nowMs - Date.parse(e.occurred_at) < GROUP_WINDOW_MS
  )
  if (group) {
    group.count += 1
    group.last_occurred_at = iso
    group.last_local_time = local
  } else {
    outbox.push({
      event,
      properties,
      occurred_at: iso,
      local_time: local,
      count: 1,
      last_occurred_at: iso,
      last_local_time: local
    })
    if (outbox.length > MAX_OUTBOX) outbox.splice(0, outbox.length - MAX_OUTBOX)
  }
  persist()
  scheduleSync() // send shortly after the action (debounced)
}

/** The candidate's token (read from the web's localStorage), used as identity
 * for the next periodic sync. Empty string clears it (e.g. on logout). */
export const setAuthToken = (token: string): void => {
  authToken = token && token.length > 0 ? token : null
}

/** Optional: which exam attempt this candidate is on, for correlation. */
export const setExamContext = (id: number): void => {
  if (typeof id === 'number' && id > 0) batchCandidateId = id
}

export const clearExamContext = (): void => {
  batchCandidateId = 0
}

export const startAppEvents = async (): Promise<void> => {
  if (started) return
  filePath = join(app.getPath('userData'), 'app-events-outbox.enc')
  try {
    const decrypted = decrypt(await readFile(filePath, 'utf-8'))
    const parsed = decrypted ? JSON.parse(decrypted) : null
    if (Array.isArray(parsed)) outbox = parsed
  } catch {
    outbox = [] // missing / corrupt / tampered → start clean
  }
  started = true
  pruneOldEvents() // drop anything stale carried over from a previous session
  intervalTimer = setInterval(() => {
    pruneOldEvents()
    void syncNow()
  }, SYNC_INTERVAL_MS)
}

export const stopAppEvents = (): void => {
  if (intervalTimer) clearInterval(intervalTimer)
  if (debounceTimer) clearTimeout(debounceTimer)
  intervalTimer = null
  debounceTimer = null
  // Persist SYNCHRONOUSLY on quit so events recorded right before exit (e.g.
  // app_exam_exit via:'quit') aren't lost to the async write racing app.quit().
  // They sync on the next launch after login.
  try {
    const tmp = `${filePath}.tmp`
    writeFileSync(tmp, encrypt(JSON.stringify(outbox)), 'utf-8')
    renameSync(tmp, filePath)
  } catch {
    // ignore — best effort on shutdown
  }
}

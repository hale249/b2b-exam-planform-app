import { app, BrowserWindow, crashReporter } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Crash resilience for the exam window:
//   - renderer crash / hang  -> show a "recovering" screen, then reload the exam
//   - main-process crash      -> relaunch, but with a loop guard so a reproducible
//                                crash can't relaunch forever
// All loads go through the window the getter returns; the navigation lock in
// index.ts only allows the exam URL for renderer-initiated navigations, so the
// main-process loads below are not affected.

let getWindow: () => BrowserWindow | null = () => null
let examUrl = ''
let started = false

const page = (title: string, body: string, spinner: boolean): string =>
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{height:100%;margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#fff;color:#1f2937}
      .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center}
      .spin{width:44px;height:44px;border:4px solid #e5e7eb;border-top-color:#0071F9;border-radius:50%;animation:s .8s linear infinite}
      @keyframes s{to{transform:rotate(360deg)}}
      h1{font-size:18px;font-weight:600;margin:0}p{color:#6b7280;font-size:14px;margin:0;max-width:360px}
    </style></head><body><div class="wrap">${spinner ? '<div class="spin"></div>' : ''}
    <h1>${title}</h1><p>${body}</p></div></body></html>`
  )

const RECOVERY_HTML = page(
  'Recovering your exam…',
  'Please wait a moment and do not close the app.',
  true
)
const FATAL_HTML = page(
  'Something went wrong',
  'We tried several times but could not continue. Please restart the app, or ask your proctor for help.',
  false
)
const OFFLINE_HTML = page(
  'No internet connection',
  'We can’t reach the exam server. The app will reconnect automatically when you’re back online. Please check your Wi-Fi or network cable.',
  true
)

// A failed navigation leaves the window on whatever was committed before —
// which on first launch is NOTHING (pure white). Commit an explicit offline
// screen so the student sees what is happening from the very first failure.
// No-op if it is already showing, so the 5s retry loop doesn't flicker it.
export const showOfflineScreen = (): void => {
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  if (win.webContents.getURL() === OFFLINE_HTML) return
  console.warn('[Offline] showing offline screen, will keep retrying')
  win.loadURL(OFFLINE_HTML)
}

// --- Renderer recovery loop guard (in-memory, per run) ---
let recoveries: number[] = []
const RECOVERY_WINDOW_MS = 60_000
const MAX_RECOVERIES = 3

// --- Relaunch loop guard (persisted across relaunches) ---
const RELAUNCH_WINDOW_MS = 60_000
const MAX_RELAUNCHES = 3
const relaunchLogPath = (): string => join(app.getPath('userData'), 'relaunch-history.json')

export const initCrashRecovery = (windowGetter: () => BrowserWindow | null, url: string): void => {
  getWindow = windowGetter
  examUrl = url
  if (started) return
  started = true

  // Capture native (renderer/GPU) crashes locally for diagnosis. Not uploaded.
  try {
    crashReporter.start({ uploadToServer: false })
  } catch (err) {
    console.error('[Crash] crashReporter failed to start:', err)
  }

  // Log but do NOT relaunch on unhandled rejections — too aggressive mid-exam.
  process.on('unhandledRejection', (reason) => {
    console.error('[Crash] unhandledRejection:', reason)
  })

  // A child (GPU/utility) process died. If the GPU is gone, reloading the
  // renderer usually brings rendering back.
  app.on('child-process-gone', (_event, details) => {
    console.error('[Crash] child-process-gone:', details.type, details.reason)
    if (details.type === 'GPU') recoverRenderer()
  })
}

export const recoverRenderer = (): void => {
  const win = getWindow()
  if (!win || win.isDestroyed()) return

  const now = Date.now()
  recoveries = recoveries.filter((t) => now - t < RECOVERY_WINDOW_MS)
  recoveries.push(now)

  if (recoveries.length > MAX_RECOVERIES) {
    console.error('[Crash] renderer recovery loop detected — showing fatal screen')
    win.loadURL(FATAL_HTML)
    return
  }

  win.loadURL(RECOVERY_HTML)
  setTimeout(() => {
    const w = getWindow()
    if (w && !w.isDestroyed()) w.loadURL(examUrl)
  }, 1200)
}

// Call when the exam page has loaded successfully: clears both loop guards so a
// later, unrelated one-off crash starts from a clean count.
export const noteSuccessfulLoad = (): void => {
  recoveries = []
  try {
    writeFileSync(relaunchLogPath(), '[]')
  } catch {
    // ignore — guard file is best-effort
  }
}

export const relaunchWithGuard = (): void => {
  let history: number[] = []
  try {
    history = JSON.parse(readFileSync(relaunchLogPath(), 'utf8'))
  } catch {
    // no/invalid history file — keep the default []
  }

  const now = Date.now()
  history = history.filter((t) => now - t < RELAUNCH_WINDOW_MS)

  if (history.length >= MAX_RELAUNCHES) {
    console.error('[Crash] relaunch loop detected — aborting auto-relaunch')
    try {
      writeFileSync(relaunchLogPath(), '[]')
    } catch {
      // ignore
    }
    const win = getWindow()
    if (win && !win.isDestroyed()) win.loadURL(FATAL_HTML)
    return
  }

  history.push(now)
  try {
    writeFileSync(relaunchLogPath(), JSON.stringify(history))
  } catch {
    // ignore
  }

  app.relaunch()
  app.exit(0)
}

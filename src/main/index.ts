import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen, session } from 'electron'
import { join } from 'path'
import { armExamLock, disarmExamLock, isExamLocked } from './exam-lock'
import { startProcessMonitor, stopProcessMonitor } from './handlers/process-blocker'
import { registerIpcHandlers } from './handlers/ipc'
import {
  initSecurityLock,
  isSecurityBlockActive,
  setMultipleDisplaysActive,
  suppressFullscreenRequests
} from './security-lock'
import {
  initCrashRecovery,
  noteSuccessfulLoad,
  recoverRenderer,
  relaunchWithGuard,
  showOfflineScreen
} from './crash-recovery'
import { runUpdateGate } from './updater'
import { registerManualUpdater } from './manual-updater'
import { startBlocklistSync, stopBlocklistSync } from './services/blocklist-sync'
import { startNetworkStatus, stopNetworkStatus } from './services/network-status'
import {
  reassertScreenRecordingState,
  startScreenRecordingGuard,
  stopScreenRecordingGuard
} from './screen-recording-guard'
import { emitAppEvent, startAppEvents, stopAppEvents } from './services/app-events'
import { initLogger, logger } from './logger'
import { getAppName } from './app-name'
import { IPC_CONSTANTS } from '../shared/ipc-channels'

const EXAM_URL = import.meta.env.VITE_EXAM_URL
const APP_NAME = getAppName()

const ALLOW_SCREENSHOT = import.meta.env.VITE_ALLOW_SCREENSHOT === 'true'
const ALLOW_DEVTOOLS = import.meta.env.VITE_ALLOW_DEVTOOLS === 'true'

let mainWindow: BrowserWindow | null = null
let allowQuit = false
let forceQuit = false
let pendingQuitConfirmId: string | null = null
let appFocusLost = false

// Force the exam window in front of every other app (Chrome, etc.). A plain
// show()/focus() does not steal focus from whatever app is currently active —
// especially on macOS — but app.focus({ steal: true }) + moveTop() do.
const bringToFront = (): void => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (process.platform === 'darwin') app.focus({ steal: true })
  mainWindow.moveTop()
  mainWindow.focus()
}

const createWindow = (): void => {
  const isProduction = app.isPackaged

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    kiosk: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !isProduction || ALLOW_DEVTOOLS
    }
  })

  mainWindow.setMenu(null)

  mainWindow.on('close', (e) => {
    // Allow quit from dock menu / Cmd+Q / allow-quit IPC
    if (allowQuit || forceQuit) return

    e.preventDefault()

    // Show confirm overlay in renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      const id = `quit_${Date.now()}`
      pendingQuitConfirmId = id
      mainWindow.webContents.send(IPC_CONSTANTS.SHOW_CONFIRM, {
        id,
        icon: '',
        iconColor: '',
        title: 'Quit the app?',
        message:
          'Are you sure you want to quit? If an exam is in progress, quitting may end your session.',
        confirmLabel: 'Quit',
        confirmColor: '#E20D2C',
        cancelLabel: 'Stay in exam'
      })
    }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(EXAM_URL)) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // When in kiosk/exam mode: detect blur, force focus back, notify renderer.
  // While a security violation is active we let the window lose focus so the
  // student can switch to the prohibited app and close it.
  mainWindow.on('blur', () => {
    if (isSecurityBlockActive()) return
    if (mainWindow && !mainWindow.isDestroyed() && !forceQuit && isExamLocked(mainWindow)) {
      mainWindow.webContents.send(IPC_CONSTANTS.TAB_VIOLATION)
      if (!appFocusLost) {
        appFocusLost = true
        emitAppEvent('app_focus_lost')
      }
      // Pull focus back to the exam. On macOS Cmd+Tab is OS-reserved and can't be
      // disabled, and a plain focus() won't yank the app in front of whatever the
      // student switched to — app.focus({ steal: true }) + moveTop() do. Run it
      // immediately and again once the app-switch settles.
      const refocus = (): void => {
        if (!mainWindow || !isExamLocked(mainWindow)) return
        bringToFront()
      }
      refocus()
      setTimeout(refocus, 100)
    }
  })

  mainWindow.on('focus', () => {
    if (appFocusLost) {
      appFocusLost = false
      emitAppEvent('app_focus_regained')
    }
  })

  mainWindow.setContentProtection(!ALLOW_SCREENSHOT)

  // Only show window after EXAM_URL is fully loaded (no white flash).
  // Then force it in front: the student may have switched to another app
  // (e.g. Chrome) while the exam was loading.
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow!.setTitle(APP_NAME)
    mainWindow!.maximize()
    mainWindow!.show()
    bringToFront()
    // Re-assert once the show/maximize settles — macOS can give focus back to
    // the previously active app right after the first attempt.
    setTimeout(bringToFront, 150)
  })

  // Retry loading the exam on transient failures (e.g. flaky network) with
  // backoff, instead of leaving the student on a dead page.
  let loadRetries = 0
  const MAX_LOAD_RETRIES = 5
  // Chromium net error ranges: -1xx = connection-level, -8xx = DNS. Both mean
  // "no network", not a broken app: show the offline screen immediately
  // (a failed FIRST load otherwise leaves the window pure white) and retry
  // forever — when the proctor fixes the Wi-Fi the exam must come back on its
  // own. The capped-retries → recovery path is reserved for real app errors.
  const isNetworkError = (code: number): boolean =>
    (code <= -100 && code > -200) || (code <= -800 && code > -900)

  mainWindow.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    // -3 = ERR_ABORTED (our own redirects); only care about the main frame.
    if (!isMainFrame || code === -3) return
    console.error('[LoadError]:', code, description)

    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.setTitle(APP_NAME)
      mainWindow.maximize()
      mainWindow.show()
      bringToFront()
    }

    if (isNetworkError(code)) {
      showOfflineScreen()
      setTimeout(() => mainWindow?.loadURL(EXAM_URL), 5_000)
      return
    }

    if (loadRetries < MAX_LOAD_RETRIES) {
      loadRetries++
      const delay = Math.min(1000 * loadRetries, 5000)
      setTimeout(() => mainWindow?.loadURL(EXAM_URL), delay)
    } else {
      recoverRenderer()
    }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    // Re-apply content protection after every page load.
    mainWindow?.setContentProtection(!ALLOW_SCREENSHOT)
    // Restore the recording cover if a capture is in progress (the overlay
    // resets to hidden on every load).
    reassertScreenRecordingState(mainWindow)
    // Only a successful EXAM load resets the crash guards. The recovery/fatal
    // screens are data: URLs and fire did-finish-load too — counting them as
    // success would wipe the loop guards and recover forever instead of ever
    // reaching the fatal screen.
    if (!mainWindow?.webContents.getURL().startsWith(EXAM_URL)) return
    loadRetries = 0
    noteSuccessfulLoad()
  })

  // Renderer crashed ("Aw, snap") — recover unless it exited cleanly.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Crash] render-process-gone:', details.reason, details.exitCode)
    if (details.reason === 'clean-exit') return
    recoverRenderer()
  })

  // Window hung — force a reload to kill the stuck renderer.
  mainWindow.on('unresponsive', () => {
    console.error('[Crash] window unresponsive — recovering')
    recoverRenderer()
  })
  mainWindow.on('responsive', () => {
    console.warn('[Crash] window responsive again')
  })

  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault()
  })

  // Force-update gate: show the updater screen and only navigate to the exam
  // once it clears (no update / error / timeout). If an update is found it
  // downloads, installs and relaunches — no student ever runs a stale build.
  // In dev (unpackaged) the gate falls through to the exam immediately.
  runUpdateGate(mainWindow, () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(EXAM_URL)
  })

  if (!isProduction) {
    mainWindow.webContents.openDevTools()
  }

  initSecurityLock(() => mainWindow)
  initCrashRecovery(() => mainWindow, EXAM_URL)
  startProcessMonitor(mainWindow)
  // macOS-only: detect screen RECORDING (which content protection can't block on
  // macOS) and cover the exam while it's active. Skipped when screenshots are
  // explicitly allowed (dev/QA) so the cover doesn't ruin captures/recordings.
  if (!ALLOW_SCREENSHOT) startScreenRecordingGuard(() => mainWindow)
  startDisplayMonitor(mainWindow)
  // Live Wi-Fi signal for the exam status bar (best-effort, native).
  startNetworkStatus(() => mainWindow)
}

let displayIntervalId: ReturnType<typeof setInterval> | null = null
let lastDisplayCount = 0

const checkDisplayCount = (win: BrowserWindow): void => {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  const displays = screen.getAllDisplays()
  const count = displays.length
  setMultipleDisplaysActive(count > 1)
  // Emit only on a real change (skip the very first baseline measurement).
  if (lastDisplayCount !== 0 && count !== lastDisplayCount) {
    emitAppEvent('app_display_changed', { count })
  }
  lastDisplayCount = count
  win.webContents.send(IPC_CONSTANTS.DISPLAY_COUNT, count)
}

const startDisplayMonitor = (win: BrowserWindow): void => {
  win.webContents.once('did-finish-load', () => checkDisplayCount(win))

  // Check every 5 seconds
  displayIntervalId = setInterval(() => {
    if (win.isDestroyed()) {
      if (displayIntervalId) clearInterval(displayIntervalId)
      return
    }
    checkDisplayCount(win)
  }, 5_000)

  // Also check immediately when displays change
  screen.on('display-added', () => checkDisplayCount(win))
  screen.on('display-removed', () => checkDisplayCount(win))
}

// Disable macOS window restore dialog
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
// Never touch the real macOS Keychain ("Chromium Safe Storage") — avoids the
// system password prompt on first launch. Cookie encryption is also disabled
// via the enableCookieEncryption fuse in electron-builder.json.
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('use-mock-keychain')
}
app.on('will-finish-launching', () => {
  app.on('open-file', (event) => event.preventDefault())
})

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      bringToFront()
    }
  })
}

registerIpcHandlers()
// User-initiated update flow (batch screen): the renderer checks/downloads/installs
// on demand, separate from the startup force-update gate.
registerManualUpdater(() => mainWindow)

ipcMain.handle(IPC_CONSTANTS.ALLOW_QUIT, () => {
  allowQuit = true
})

// Cmd+Q / Dock quit → quit immediately
app.on('before-quit', () => {
  forceQuit = true
})

app.whenReady().then(() => {
  if (!gotTheLock) return

  // A build without .env bakes `undefined` into EXAM_URL and loadURL(undefined)
  // throws at startup — in production that relaunch-loops a dead white app.
  // Fail loudly and immediately instead.
  if (!EXAM_URL || !/^https?:\/\//.test(EXAM_URL)) {
    dialog.showErrorBox(
      'Configuration error',
      'VITE_EXAM_URL is missing or invalid — the app was built without a valid .env file.'
    )
    app.exit(1)
    return
  }

  // Auto-allow the media permissions the exam needs. Register the handlers
  // BEFORE the window loads the exam URL — otherwise an early getUserMedia call
  // during page load can hit Electron's default behaviour and pop a permission
  // prompt even though access is already granted.
  //
  // We do NOT pre-ask for the microphone at startup: macOS shows its own one-time
  // system prompt the first time getUserMedia actually runs (i.e. when entering the
  // Speaking skill). If the user denied it, the WEB app already detects the
  // NotAllowedError and routes to its own mic-permission-guide page (with an
  // "Open Settings" button), so the desktop side just grants and stays out of the
  // way — no native dialog of our own.
  const allowedPermissions = [
    'clipboard-read',
    'clipboard-sanitized-write',
    'media',
    'microphone',
    'audioCapture',
    'videoCapture'
  ]
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.includes(permission)
  })
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.includes(permission))
  })

  // Set up file logging (daily files + retention) before anything else, so
  // startup diagnostics are captured.
  initLogger()
  logger.info('App starting', { version: app.getVersion(), platform: process.platform })

  // Tag every request originating inside the app with a UA suffix, so the
  // backend can passively tell "from the desktop app" vs a plain browser.
  const baseUserAgent = session.defaultSession.getUserAgent()
  session.defaultSession.setUserAgent(
    `${baseUserAgent} PrepExamApp/${app.getVersion()} (${process.platform})`
  )

  // Load the local native-events outbox (synced once the candidate is known).
  void startAppEvents()

  createWindow()
  registerBlockedShortcuts()
  // Pull the admin-managed extra blocklist in the background (HMAC-signed).
  // The hardcoded baseline already protects the exam, so this never blocks.
  startBlocklistSync()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Leave the exam lockdown: undo kiosk + the always-on-top / all-Spaces flags
// applied when entering fullscreen, so the window behaves normally afterwards.
// Also cancels any in-flight arm so the lock can't re-engage afterwards.
const exitExamLock = (): void => {
  if (!mainWindow) return
  disarmExamLock(mainWindow)
}

const registerBlockedShortcuts = (): void => {
  // Swallow the screenshot shortcut AND record the attempt as a native event.
  const blockScreenshot = (accelerator: string): void => {
    globalShortcut.register(accelerator, () =>
      emitAppEvent('app_screenshot_blocked', { shortcut: accelerator })
    )
  }
  if (!ALLOW_SCREENSHOT) {
    blockScreenshot('PrintScreen')
    blockScreenshot('CommandOrControl+Shift+3')
    blockScreenshot('CommandOrControl+Shift+4')
    blockScreenshot('CommandOrControl+Shift+5')
    blockScreenshot('CommandOrControl+Control+Shift+3')
    blockScreenshot('CommandOrControl+Control+Shift+4')
  }

  // Block Alt+Tab / Cmd+Tab. NOTE: on macOS Cmd+Tab (and Mission Control's
  // Control+Arrow) are OS-reserved — register() returns false and the switcher
  // still works. We log that so it's visible; the blur→refocus trap above is what
  // actually enforces the lockdown on macOS.
  const blockShortcut = (accelerator: string): void => {
    if (!globalShortcut.register(accelerator, () => {})) {
      console.warn(
        `[Lockdown] Could not block "${accelerator}" (OS-reserved) — relying on the focus-trap instead.`
      )
    }
  }
  blockShortcut('Alt+Tab')
  blockShortcut('CommandOrControl+Tab')

  // Block Mission Control / Exposé shortcuts
  blockShortcut('Control+Up')
  blockShortcut('Control+Down')
  blockShortcut('Control+Left')
  blockShortcut('Control+Right')

  // Custom confirm dialog via renderer overlay
  const pendingConfirms = new Map<string, () => void>()
  let confirmCounter = 0
  let isConfirmShowing = false

  let escCooldownUntil = 0

  // Bypass the page's beforeunload for a user-confirmed navigation. One
  // permanent listener + a flag (instead of adding a listener per confirm)
  // so repeated confirms don't accumulate listeners. Disarmed again once the
  // navigation lands (see did-finish-load below).
  let bypassUnloadArmed = false
  mainWindow?.webContents.on('will-prevent-unload', (event) => {
    if (bypassUnloadArmed) event.preventDefault()
  })
  const bypassUnload = (): void => {
    bypassUnloadArmed = true
  }

  // If the page navigates/reloads while a confirm overlay is open (e.g. the
  // web app redirects on its own), the overlay context is gone and
  // confirm-response never arrives — without this reset isConfirmShowing
  // would stay true and every confirm-gated shortcut (Esc, F11, reload, home)
  // would be dead until the app restarts.
  mainWindow?.webContents.on('did-finish-load', () => {
    isConfirmShowing = false
    pendingConfirms.clear()
    bypassUnloadArmed = false
  })

  ipcMain.on(
    IPC_CONSTANTS.CONFIRM_RESPONSE,
    (_event, { id, confirmed }: { id: string; confirmed: boolean }) => {
      isConfirmShowing = false
      // Cooldown to prevent Esc from immediately reopening confirm
      escCooldownUntil = Date.now() + 500
      // Handle quit confirm
      if (id === pendingQuitConfirmId) {
        pendingQuitConfirmId = null
        if (confirmed) {
          // Quitting the app while in the locked exam = an exit. Persisted
          // synchronously on quit (stopAppEvents), synced on next launch.
          if (mainWindow && isExamLocked(mainWindow)) emitAppEvent('app_exam_exit', { via: 'quit' })
          forceQuit = true
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.destroy()
          }
          app.quit()
        }
        return
      }
      // Handle other confirms (reload, go home, fullscreen, esc)
      if (confirmed) {
        const action = pendingConfirms.get(id)
        action?.()
      }
      pendingConfirms.delete(id)
    }
  )

  const showConfirm = (options: {
    icon: string
    iconColor: string
    title: string
    message: string
    confirmLabel: string
    confirmColor: string
    cancelLabel: string
    onConfirm: () => void
  }) => {
    if (!mainWindow || isConfirmShowing) return
    isConfirmShowing = true
    const id = `confirm_${++confirmCounter}`
    pendingConfirms.set(id, options.onConfirm)
    const { onConfirm: _, ...sendOptions } = options
    mainWindow.webContents.send(IPC_CONSTANTS.SHOW_CONFIRM, { id, ...sendOptions })
  }

  // Reload shortcuts
  const confirmReload = (ignoreCache: boolean) => {
    showConfirm({
      icon: '🔄',
      iconColor: '#3b82f6',
      title: 'Reload Page',
      message: 'Are you sure you want to reload? Any unsaved progress may be lost.',
      confirmLabel: 'Reload',
      confirmColor: '#2563eb',
      cancelLabel: 'Cancel',
      onConfirm: () => {
        // Stay in native fullscreen across the reload — exiting kiosk here would
        // play the macOS Space-exit animation and flash the desktop (B2B-2498).
        bypassUnload()
        if (ignoreCache) {
          mainWindow?.webContents.reloadIgnoringCache()
        } else {
          mainWindow?.webContents.reload()
        }
      }
    })
  }
  globalShortcut.register('CommandOrControl+Shift+R', () => confirmReload(true))
  globalShortcut.register('CommandOrControl+R', () => confirmReload(false))
  globalShortcut.register('F5', () => confirmReload(false))

  // Go back to home — Ctrl/Cmd+Home (and the status bar "Exit" button).
  const confirmGoHome = (via: 'home' | 'statusbar') => {
    showConfirm({
      icon: '🏠',
      iconColor: '#f59e0b',
      title: 'Return to Home',
      message:
        'Are you sure you want to go back to the home page? Your current test session will be interrupted.',
      confirmLabel: 'Go to Home',
      confirmColor: '#d97706',
      cancelLabel: 'Stay',
      onConfirm: () => {
        // Only count as an exam exit if we were actually in the locked exam.
        if (mainWindow && isExamLocked(mainWindow)) emitAppEvent('app_exam_exit', { via })
        bypassUnload()
        if (via === 'statusbar') {
          // The visible "Exit" button is an explicit "leave the exam" action, so
          // it really exits fullscreen (kiosk) — unlike the silent Cmd+Home
          // shortcut, which stays fullscreen to avoid the macOS Space-exit flash
          // (B2B-2498). Suppress any late set-fullscreen(true) the leaving page
          // may still fire, so kiosk doesn't immediately re-arm on the way home.
          suppressFullscreenRequests(2000)
          exitExamLock()
        }
        // Cmd+Home navigates home WHILE STAYING fullscreen — do not disarm kiosk
        // there, or macOS plays the Space-exit animation and flashes the desktop.
        mainWindow?.loadURL(EXAM_URL)
      }
    })
  }
  globalShortcut.register('CommandOrControl+Home', () => confirmGoHome('home'))

  // Exam status-bar buttons reuse the exact same confirm flows as the shortcuts,
  // so a button press is never a one-click destructive action.
  ipcMain.on(IPC_CONSTANTS.STATUSBAR_RELOAD, () => confirmReload(false))
  ipcMain.on(IPC_CONSTANTS.STATUSBAR_EXIT_HOME, () => confirmGoHome('statusbar'))
  // Esc in fullscreen → confirm → go to the home page (STAYING fullscreen).
  // Do NOT reload(): reloading keeps the in-exam URL, and the web app re-enters
  // fullscreen as soon as it sees the exam still in progress.
  mainWindow?.webContents.on('before-input-event', (event, input) => {
    // Block Esc from reaching renderer when confirm is showing
    if (input.key === 'Escape' && input.type === 'keyDown' && isConfirmShowing) {
      event.preventDefault()
      return
    }
    if (
      input.key === 'Escape' &&
      input.type === 'keyDown' &&
      !!mainWindow &&
      isExamLocked(mainWindow) &&
      !isConfirmShowing &&
      Date.now() > escCooldownUntil
    ) {
      event.preventDefault()
      emitAppEvent('app_kiosk_exit_attempt', { via: 'esc' })
      showConfirm({
        icon: '',
        iconColor: '',
        title: 'Return to Home',
        message: 'Are you sure you want to exit? You will be returned to the home page.',
        confirmLabel: 'Exit',
        confirmColor: '#E20D2C',
        cancelLabel: 'Cancel',
        onConfirm: () => {
          // Actually confirmed leaving the exam (was in kiosk) → track exit.
          emitAppEvent('app_exam_exit', { via: 'esc' })
          // Navigate home WHILE STAYING fullscreen — do not disarm kiosk, or macOS
          // plays the Space-exit animation and flashes the desktop (B2B-2498).
          bypassUnload()
          mainWindow?.loadURL(EXAM_URL)
        }
      })
    }
  })

  // Fullscreen/kiosk toggle — entering is instant, exiting requires confirm
  globalShortcut.register('F11', () => {
    if (!mainWindow) return
    if (isExamLocked(mainWindow)) {
      emitAppEvent('app_kiosk_exit_attempt', { via: 'f11' })
      showConfirm({
        icon: '',
        iconColor: '',
        title: 'Exit Fullscreen',
        message: 'Are you sure you want to exit fullscreen mode?',
        confirmLabel: 'Exit Fullscreen',
        confirmColor: '#2563eb',
        cancelLabel: 'Cancel',
        onConfirm: () => {
          emitAppEvent('app_exam_exit', { via: 'f11' })
          exitExamLock()
        }
      })
    } else {
      armExamLock(mainWindow)
    }
  })

  if (!ALLOW_SCREENSHOT) {
    blockScreenshot('Super+Shift+S')
    blockScreenshot('Super+PrintScreen')
  }

  if (app.isPackaged) {
    if (ALLOW_DEVTOOLS) {
      // Debug build: let F12 / Cmd+Shift+I / Cmd+Shift+J toggle DevTools instead
      // of swallowing them. Requires webPreferences.devTools to be true (above).
      const toggleDevTools = (): void => mainWindow?.webContents.toggleDevTools()
      globalShortcut.register('F12', toggleDevTools)
      globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools)
      globalShortcut.register('CommandOrControl+Shift+J', toggleDevTools)
    } else {
      globalShortcut.register('CommandOrControl+Shift+I', () => {})
      globalShortcut.register('F12', () => {})
      globalShortcut.register('CommandOrControl+Shift+J', () => {})
    }
  }
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopProcessMonitor()
  stopScreenRecordingGuard()
  stopBlocklistSync()
  stopNetworkStatus()
  stopAppEvents()
  if (displayIntervalId) clearInterval(displayIntervalId)
})

app.on('window-all-closed', () => {
  forceQuit = true
  app.quit()
})

// --- Process event handlers (production only) ---

if (app.isPackaged) {
  process.on('uncaughtException', (err) => {
    console.error('[ProcessEvent] uncaughtException:', err)
    relaunchWithGuard()
  })

  process.on('SIGTERM', () => {
    console.warn('[ProcessEvent] SIGTERM')
    relaunchWithGuard()
  })
}

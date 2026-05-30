import { app, BrowserWindow, globalShortcut, ipcMain, screen, session } from 'electron'
import { join } from 'path'
import { startProcessMonitor, stopProcessMonitor } from './handlers/process-blocker'
import { registerIpcHandlers } from './handlers/ipc'
import { initSecurityLock, isSecurityBlockActive, setMultipleDisplaysActive } from './security-lock'
import {
  initCrashRecovery,
  noteSuccessfulLoad,
  recoverRenderer,
  relaunchWithGuard
} from './crash-recovery'

const EXAM_URL = import.meta.env.VITE_EXAM_URL
const APP_NAME = import.meta.env.VITE_APP_NAME

let mainWindow: BrowserWindow | null = null
let allowQuit = false
let forceQuit = false
let pendingQuitConfirmId: string | null = null

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
      devTools: !isProduction
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
      mainWindow.webContents.send('show-confirm', {
        id,
        icon: '',
        iconColor: '',
        title: 'Quit Application',
        message: 'Are you sure you want to quit?',
        confirmLabel: 'Quit',
        confirmColor: '#E20D2C',
        cancelLabel: 'Cancel'
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
    if (mainWindow && !mainWindow.isDestroyed() && !forceQuit && mainWindow.isKiosk()) {
      mainWindow.webContents.send('tab-violation')
      // Pull focus back to the exam. On macOS Cmd+Tab is OS-reserved and can't be
      // disabled, and a plain focus() won't yank the app in front of whatever the
      // student switched to — app.focus({ steal: true }) + moveTop() do. Run it
      // immediately and again once the app-switch settles.
      const refocus = (): void => {
        if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isKiosk()) return
        if (process.platform === 'darwin') app.focus({ steal: true })
        mainWindow.moveTop()
        mainWindow.focus()
      }
      refocus()
      setTimeout(refocus, 100)
    }
  })

  mainWindow.setContentProtection(true)

  // Only show window after EXAM_URL is fully loaded (no white flash)
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow!.setTitle(APP_NAME)
    mainWindow!.maximize()
    mainWindow!.show()
  })

  // Retry loading the exam on transient failures (e.g. flaky network) with
  // backoff, instead of leaving the student on a dead page.
  let loadRetries = 0
  const MAX_LOAD_RETRIES = 5
  mainWindow.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    // -3 = ERR_ABORTED (our own redirects); only care about the main frame.
    if (!isMainFrame || code === -3) return
    console.error('[LoadError]:', code, description)

    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.setTitle(APP_NAME)
      mainWindow.maximize()
      mainWindow.show()
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
    mainWindow?.setContentProtection(true)
    // Page loaded fine — reset the retry/loop guards.
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

  mainWindow.loadURL(EXAM_URL)

  if (!isProduction) {
    mainWindow.webContents.openDevTools()
  }

  initSecurityLock(() => mainWindow)
  initCrashRecovery(() => mainWindow, EXAM_URL)
  startProcessMonitor(mainWindow)
  startDisplayMonitor(mainWindow)
}

let displayIntervalId: ReturnType<typeof setInterval> | null = null

const checkDisplayCount = (win: BrowserWindow): void => {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  const displays = screen.getAllDisplays()
  setMultipleDisplaysActive(displays.length > 1)
  win.webContents.send('display-count', displays.length)
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
      mainWindow.focus()
    }
  })
}

registerIpcHandlers()

ipcMain.handle('allow-quit', () => {
  allowQuit = true
})

// Cmd+Q / Dock quit → quit immediately
app.on('before-quit', () => {
  forceQuit = true
})

app.whenReady().then(() => {
  if (!gotTheLock) return

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

  createWindow()
  registerBlockedShortcuts()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Leave the exam lockdown: undo kiosk + the always-on-top / all-Spaces flags
// applied when entering fullscreen, so the window behaves normally afterwards.
const exitExamLock = (): void => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setVisibleOnAllWorkspaces(false)
  mainWindow.setAlwaysOnTop(false)
  if (mainWindow.isKiosk()) mainWindow.setKiosk(false)
}

const registerBlockedShortcuts = (): void => {
  globalShortcut.register('PrintScreen', () => {})
  globalShortcut.register('CommandOrControl+Shift+3', () => {})
  globalShortcut.register('CommandOrControl+Shift+4', () => {})
  globalShortcut.register('CommandOrControl+Shift+5', () => {})
  globalShortcut.register('CommandOrControl+Control+Shift+3', () => {})
  globalShortcut.register('CommandOrControl+Control+Shift+4', () => {})

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

  ipcMain.on(
    'confirm-response',
    (_event, { id, confirmed }: { id: string; confirmed: boolean }) => {
      isConfirmShowing = false
      // Cooldown to prevent Esc from immediately reopening confirm
      escCooldownUntil = Date.now() + 500
      // Handle quit confirm
      if (id === pendingQuitConfirmId) {
        pendingQuitConfirmId = null
        if (confirmed) {
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
    mainWindow.webContents.send('show-confirm', { id, ...sendOptions })
  }

  const bypassUnload = () => {
    mainWindow?.webContents.on('will-prevent-unload', (event) => {
      event.preventDefault()
    })
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
        bypassUnload()
        exitExamLock()
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

  // Go back to home — Ctrl/Cmd+Home
  globalShortcut.register('CommandOrControl+Home', () => {
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
        bypassUnload()
        exitExamLock()
        mainWindow?.loadURL(EXAM_URL)
      }
    })
  })
  // Esc in fullscreen → confirm → exit fullscreen + reload (auto redirects to dashboard)
  mainWindow?.webContents.on('before-input-event', (event, input) => {
    // Block Esc from reaching renderer when confirm is showing
    if (input.key === 'Escape' && input.type === 'keyDown' && isConfirmShowing) {
      event.preventDefault()
      return
    }
    if (
      input.key === 'Escape' &&
      input.type === 'keyDown' &&
      mainWindow?.isKiosk() &&
      !isConfirmShowing &&
      Date.now() > escCooldownUntil
    ) {
      event.preventDefault()
      showConfirm({
        icon: '',
        iconColor: '',
        title: 'Return to Home',
        message: 'Are you sure you want to exit? You will be returned to the home page.',
        confirmLabel: 'Exit',
        confirmColor: '#E20D2C',
        cancelLabel: 'Cancel',
        onConfirm: () => {
          bypassUnload()
          exitExamLock()
          mainWindow?.webContents.reload()
        }
      })
    }
  })

  // Fullscreen/kiosk toggle — entering is instant, exiting requires confirm
  globalShortcut.register('F11', () => {
    if (!mainWindow) return
    if (mainWindow.isKiosk()) {
      showConfirm({
        icon: '',
        iconColor: '',
        title: 'Exit Fullscreen',
        message: 'Are you sure you want to exit fullscreen mode?',
        confirmLabel: 'Exit Fullscreen',
        confirmColor: '#2563eb',
        cancelLabel: 'Cancel',
        onConfirm: () => {
          exitExamLock()
        }
      })
    } else {
      mainWindow.setKiosk(true)
    }
  })

  globalShortcut.register('Super+Shift+S', () => {})
  globalShortcut.register('Super+PrintScreen', () => {})

  if (app.isPackaged) {
    globalShortcut.register('CommandOrControl+Shift+I', () => {})
    globalShortcut.register('F12', () => {})
    globalShortcut.register('CommandOrControl+Shift+J', () => {})
  }
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopProcessMonitor()
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

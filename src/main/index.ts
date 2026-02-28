import { app, BrowserWindow, globalShortcut, ipcMain, screen, session, systemPreferences } from 'electron'
import { join } from 'path'
import { startProcessMonitor, stopProcessMonitor } from './handlers/process-blocker'
import { registerIpcHandlers } from './handlers/ipc'

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

  // When in kiosk/exam mode: detect blur, force focus back, notify renderer
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !forceQuit && mainWindow.isKiosk()) {
      mainWindow.webContents.send('tab-violation')
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isKiosk()) {
          mainWindow.focus()
        }
      }, 100)
    }
  })

  mainWindow.setContentProtection(true)

  // Only show window after EXAM_URL is fully loaded (no white flash)
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow!.setTitle(APP_NAME)
    mainWindow!.maximize()
    mainWindow!.show()
  })

  // Re-apply content protection after every page load
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.setContentProtection(true)
  })

  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault()
  })

  mainWindow.loadURL(EXAM_URL)

  if (!isProduction) {
    mainWindow.webContents.openDevTools()
  }

  startProcessMonitor(mainWindow)
  startDisplayMonitor(mainWindow)
}

let displayIntervalId: ReturnType<typeof setInterval> | null = null

const checkDisplayCount = (win: BrowserWindow): void => {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  const displays = screen.getAllDisplays()
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

app.whenReady().then(async () => {
  if (!gotTheLock) return

  // Request microphone permission on macOS
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'not-determined') {
      await systemPreferences.askForMediaAccess('microphone')
    }
  }

  createWindow()
  registerBlockedShortcuts()

  // Allow media permissions
  const allowedPermissions = ['clipboard-read', 'clipboard-sanitized-write', 'media', 'microphone', 'audioCapture', 'videoCapture']
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.includes(permission)
  })
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.includes(permission))
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

const registerBlockedShortcuts = (): void => {
  globalShortcut.register('PrintScreen', () => {})
  globalShortcut.register('CommandOrControl+Shift+3', () => {})
  globalShortcut.register('CommandOrControl+Shift+4', () => {})
  globalShortcut.register('CommandOrControl+Shift+5', () => {})
  globalShortcut.register('CommandOrControl+Control+Shift+3', () => {})
  globalShortcut.register('CommandOrControl+Control+Shift+4', () => {})

  // Block Alt+Tab / Cmd+Tab
  globalShortcut.register('Alt+Tab', () => {})
  globalShortcut.register('CommandOrControl+Tab', () => {})

  // Block Mission Control / Exposé shortcuts
  globalShortcut.register('Control+Up', () => {})
  globalShortcut.register('Control+Down', () => {})
  globalShortcut.register('Control+Left', () => {})
  globalShortcut.register('Control+Right', () => {})

  // Custom confirm dialog via renderer overlay
  const pendingConfirms = new Map<string, () => void>()
  let confirmCounter = 0
  let isConfirmShowing = false

  let escCooldownUntil = 0

  ipcMain.on('confirm-response', (_event, { id, confirmed }: { id: string; confirmed: boolean }) => {
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
  })

  const showConfirm = (options: {
    icon: string; iconColor: string; title: string; message: string
    confirmLabel: string; confirmColor: string; cancelLabel: string
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
        if (mainWindow?.isKiosk()) mainWindow.setKiosk(false)
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
      message: 'Are you sure you want to go back to the home page? Your current test session will be interrupted.',
      confirmLabel: 'Go to Home',
      confirmColor: '#d97706',
      cancelLabel: 'Stay',
      onConfirm: () => {
        bypassUnload()
        if (mainWindow?.isKiosk()) mainWindow.setKiosk(false)
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
    if (input.key === 'Escape' && input.type === 'keyDown' && mainWindow?.isKiosk() && !isConfirmShowing && Date.now() > escCooldownUntil) {
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
          mainWindow?.setKiosk(false)
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
          mainWindow?.setKiosk(false)
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

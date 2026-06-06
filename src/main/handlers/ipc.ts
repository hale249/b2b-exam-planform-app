import { BrowserWindow, ipcMain, screen, shell } from 'electron'

import { armExamLock, disarmExamLock } from '../exam-lock'
import { checkBlockedApps } from '../services/process-blocker'
import {
  isFullscreenSuppressed,
  setBlockedProcessesActive,
  setMultipleDisplaysActive
} from '../security-lock'

export const registerIpcHandlers = (): void => {
  ipcMain.handle('open-external-url', (_event, url: string) => {
    // The exam page is remote content — never pass through non-web schemes
    // (file://, smb://, ...) to the OS.
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return
    return shell.openExternal(url)
  })

  ipcMain.handle('check-blocked-processes', async (event) => {
    const blocked = await checkBlockedApps()
    setBlockedProcessesActive(blocked.length > 0)

    if (blocked.length > 0) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        win.webContents.send('check-blocked-processes', blocked)
      }
    }

    return blocked
  })

  ipcMain.handle('check-exam-security', async (event) => {
    const [blocked, displayCount] = await Promise.all([
      checkBlockedApps(),
      Promise.resolve(screen.getAllDisplays().length)
    ])

    setBlockedProcessesActive(blocked.length > 0)
    setMultipleDisplaysActive(displayCount > 1)

    const hasViolation = blocked.length > 0 || displayCount > 1
    const win = BrowserWindow.fromWebContents(event.sender)
    if (hasViolation && win && !win.isDestroyed()) {
      win.webContents.send('force-security-check', {
        blockedProcesses: blocked,
        displayCount
      })
    }

    return hasViolation
  })

  ipcMain.handle('set-fullscreen', (event, enabled: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      if (enabled) {
        // The user just confirmed leaving the exam — ignore late requests
        // from the previous page so kiosk doesn't re-arm right away.
        if (isFullscreenSuppressed()) return
        // Staged arm: kiosk first, lock flags only after fullscreen really
        // engaged, retry if macOS dropped the request mid Space-swipe.
        armExamLock(win)
      } else {
        disarmExamLock(win)
      }
    }
  })

  ipcMain.handle('get-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? win.isKiosk() : false
  })
}

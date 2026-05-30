import { BrowserWindow, ipcMain, screen, shell } from 'electron'

import { checkBlockedApps } from '../services/process-blocker'
import { setBlockedProcessesActive, setMultipleDisplaysActive } from '../security-lock'

export const registerIpcHandlers = (): void => {
  ipcMain.handle('open-external-url', (_event, url: string) => {
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
        win.setKiosk(true)
        // Keep the exam above everything and present on every Space, so a
        // trackpad swipe between desktops/full-screen apps can't reveal
        // anything behind it (macOS won't let an app block the swipe itself).
        win.setAlwaysOnTop(true, 'screen-saver')
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      } else {
        win.setVisibleOnAllWorkspaces(false)
        win.setAlwaysOnTop(false)
        win.setKiosk(false)
      }
    }
  })

  ipcMain.handle('get-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? win.isKiosk() : false
  })
}

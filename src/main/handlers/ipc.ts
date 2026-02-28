import { BrowserWindow, ipcMain, screen, shell } from 'electron'

import { checkBlockedProcesses } from '../services/process-blocker'

export const registerIpcHandlers = (): void => {
  ipcMain.handle('open-external-url', (_event, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle('check-blocked-processes', async (event) => {
    const blocked = await checkBlockedProcesses()

    if (blocked.length > 0) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        win.webContents.send('check-blocked-processes', blocked)
      }
    }

    return blocked
  })

  ipcMain.handle('check-security-violations', async (event) => {
    const [blocked, displayCount] = await Promise.all([
      checkBlockedProcesses(),
      Promise.resolve(screen.getAllDisplays().length)
    ])

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
      win.setKiosk(enabled)
    }
  })

  ipcMain.handle('get-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? win.isKiosk() : false
  })
}

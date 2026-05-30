import { BrowserWindow } from 'electron'

import { checkBlockedApps } from '../services/process-blocker'
import { setBlockedProcessesActive } from '../security-lock'

let intervalId: ReturnType<typeof setInterval> | null = null

const safeSend = (mainWindow: BrowserWindow, blocked: string[]): void => {
  setBlockedProcessesActive(blocked.length > 0)

  if (
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isDestroyed() ||
    mainWindow.webContents.isCrashed()
  )
    return

  mainWindow.webContents.send('blocked-processes', blocked)
}

export const startProcessMonitor = (mainWindow: BrowserWindow): void => {
  // Wait for page to be ready before first check
  mainWindow.webContents.once('did-finish-load', async () => {
    const blocked = await checkBlockedApps()
    safeSend(mainWindow, blocked)
  })

  // Periodic check every 5 seconds
  intervalId = setInterval(async () => {
    if (mainWindow.isDestroyed()) {
      stopProcessMonitor()
      return
    }
    const blocked = await checkBlockedApps()
    safeSend(mainWindow, blocked)
  }, 30_000)
}

export const stopProcessMonitor = (): void => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

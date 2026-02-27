import { BrowserWindow } from 'electron'

import { checkBlockedProcesses } from '../services/process-blocker'

let intervalId: ReturnType<typeof setInterval> | null = null

const safeSend = (mainWindow: BrowserWindow, blocked: string[]): void => {
  if (
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isDestroyed() ||
    mainWindow.webContents.isCrashed()
  ) return

  mainWindow.webContents.send('blocked-processes', blocked)
}

export const startProcessMonitor = (mainWindow: BrowserWindow): void => {
  // Wait for page to be ready before first check
  mainWindow.webContents.once('did-finish-load', async () => {
    const blocked = await checkBlockedProcesses()
    safeSend(mainWindow, blocked)
  })

  // Periodic check every 5 seconds
  intervalId = setInterval(async () => {
    if (mainWindow.isDestroyed()) {
      stopProcessMonitor()
      return
    }
    const blocked = await checkBlockedProcesses()
    safeSend(mainWindow, blocked)
  }, 30_000)
}

export const stopProcessMonitor = (): void => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

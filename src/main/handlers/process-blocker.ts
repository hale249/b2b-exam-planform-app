import { BrowserWindow } from 'electron'

import { checkBlockedApps } from '../services/process-blocker'
import { setBlockedProcessesActive } from '../security-lock'
import { IPC_CONSTANTS } from '../../shared/ipc-channels'

let intervalId: ReturnType<typeof setInterval> | null = null

const safeSend = (mainWindow: BrowserWindow, blocked: string[]): void => {
  setBlockedProcessesActive(blocked.length > 0)

  if (
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isDestroyed() ||
    mainWindow.webContents.isCrashed()
  )
    return

  mainWindow.webContents.send(IPC_CONSTANTS.BLOCKED_PROCESSES, blocked)
}

export const startProcessMonitor = (mainWindow: BrowserWindow): void => {
  // Wait for page to be ready before first check
  mainWindow.webContents.once('did-finish-load', async () => {
    const blocked = await checkBlockedApps()
    safeSend(mainWindow, blocked)
  })

  // Periodic check every 30 seconds
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

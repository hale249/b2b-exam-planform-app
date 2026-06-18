import { BrowserWindow } from 'electron'

import { checkBlockedApps, reportBlockedApps } from '../services/process-blocker'
import { setBlockedProcessesActive } from '../security-lock'
import { IPC_CONSTANTS } from '../../shared/ipc-channels'

// Idle cadence. While nothing is blocked, scanning the OS process/window list
// every 30s is plenty.
const IDLE_INTERVAL_MS = 30_000
// Fast cadence WHILE a block is active. Once a prohibited app is detected we
// re-check every few seconds so the warning clears promptly after the student
// closes it — instead of lingering for up to a full idle interval. (Many chat
// apps like Zalo keep running in the tray after the window is closed, so the
// warning correctly persists until the process is fully quit; this just makes
// the eventual clear fast.)
const ACTIVE_INTERVAL_MS = 3_000

let timer: ReturnType<typeof setTimeout> | null = null
let stopped = false

const safeSend = (mainWindow: BrowserWindow, blocked: string[]): void => {
  setBlockedProcessesActive(blocked.length > 0)
  reportBlockedApps(blocked)

  if (
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isDestroyed() ||
    mainWindow.webContents.isCrashed()
  )
    return

  // Always send — including the empty list — so the overlay clears as soon as
  // the offending app is gone, not only when a violation appears.
  mainWindow.webContents.send(IPC_CONSTANTS.BLOCKED_PROCESSES, blocked)
}

export const startProcessMonitor = (mainWindow: BrowserWindow): void => {
  stopped = false

  const tick = async (): Promise<void> => {
    if (stopped || mainWindow.isDestroyed()) return
    const blocked = await checkBlockedApps()
    safeSend(mainWindow, blocked)
    if (stopped || mainWindow.isDestroyed()) return
    // Re-check fast while blocked so the warning clears quickly; back to idle
    // cadence once clean.
    const next = blocked.length > 0 ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS
    timer = setTimeout(() => void tick(), next)
  }

  // Wait for the page to be ready before the first check, then self-schedule.
  mainWindow.webContents.once('did-finish-load', () => void tick())
}

export const stopProcessMonitor = (): void => {
  stopped = true
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

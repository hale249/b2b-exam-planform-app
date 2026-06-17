import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'

import { armExamLock, disarmExamLock } from '../exam-lock'
import { clearExamContext, setAuthToken, setExamContext } from '../services/app-events'
import { checkBlockedApps, reportBlockedApps } from '../services/process-blocker'
import {
  isFullscreenSuppressed,
  setBlockedProcessesActive,
  setMultipleDisplaysActive
} from '../security-lock'
import { IPC_CONSTANTS } from '../../shared/ipc-channels'

export const registerIpcHandlers = (): void => {
  ipcMain.handle(IPC_CONSTANTS.GET_APP_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC_CONSTANTS.SET_EXAM_CONTEXT, (_event, batchCandidateId: number) => {
    setExamContext(Number(batchCandidateId))
  })

  ipcMain.handle(IPC_CONSTANTS.CLEAR_EXAM_CONTEXT, () => {
    clearExamContext()
  })

  // One-way from preload: the candidate's token read from the web's localStorage.
  ipcMain.on(IPC_CONSTANTS.SET_AUTH_TOKEN, (_event, token: string) => {
    setAuthToken(typeof token === 'string' ? token : '')
  })

  ipcMain.handle(IPC_CONSTANTS.OPEN_EXTERNAL_URL, (_event, url: string) => {
    // The exam page is remote content — never pass through non-web schemes
    // (file://, smb://, ...) to the OS.
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return
    return shell.openExternal(url)
  })

  ipcMain.handle(IPC_CONSTANTS.CHECK_BLOCKED_PROCESSES, async (event) => {
    const blocked = await checkBlockedApps()
    setBlockedProcessesActive(blocked.length > 0)
    reportBlockedApps(blocked)

    // Push the result to the overlay — INCLUDING the empty list — so it clears
    // immediately when the app is gone, not only when a violation appears.
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CONSTANTS.CHECK_BLOCKED_PROCESSES, blocked)
    }

    return blocked
  })

  ipcMain.handle(IPC_CONSTANTS.CHECK_EXAM_SECURITY, async (event) => {
    const [blocked, displayCount] = await Promise.all([
      checkBlockedApps(),
      Promise.resolve(screen.getAllDisplays().length)
    ])

    setBlockedProcessesActive(blocked.length > 0)
    setMultipleDisplaysActive(displayCount > 1)
    reportBlockedApps(blocked)

    const hasViolation = blocked.length > 0 || displayCount > 1
    // Push the current state EVERY time — including when clean — so the overlay
    // clears as soon as the violation is resolved instead of lingering until the
    // next background scan.
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CONSTANTS.FORCE_SECURITY_CHECK, {
        blockedProcesses: blocked,
        displayCount
      })
    }

    return hasViolation
  })

  ipcMain.handle(IPC_CONSTANTS.SET_FULLSCREEN, (event, enabled: boolean) => {
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

  ipcMain.handle(IPC_CONSTANTS.GET_FULLSCREEN, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? win.isKiosk() : false
  })
}

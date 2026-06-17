import { BrowserWindow, systemPreferences } from 'electron'

import { emitAppEvent } from './services/app-events'
import { IPC_CONSTANTS } from '../shared/ipc-channels'

// macOS screen-RECORDING mitigation.
//
// setContentProtection(true) (see index.ts) hides the window from screenshots
// on macOS but NOT from screen recording — a long-standing Electron/macOS
// limitation. There is no API to *block* recording, so we DETECT it and react:
// macOS fires "com.apple.screenIsBeingCapturedDidChange" whenever capture
// starts/stops (Cmd+Shift+5, QuickTime, Zoom share, etc.). On capture we tell
// the renderer to drop an opaque cover over the exam (screen-recording-overlay)
// so the recording captures a warning instead of the questions, and log it.
//
// Caveats: this is reactive (a few frames may slip through before the cover
// appears), it is macOS-only, and nothing stops an external phone camera.
//
// The OS notification carries no state, so we TRACK capture by toggling a flag
// on each fire (assumed off at launch). Worst case — recording already running
// before launch — desyncs the flag; re-running the gate on a fresh launch
// resets it. Acceptable for a supporting anti-cheat signal.

const CAPTURE_NOTIFICATION = 'com.apple.screenIsBeingCapturedDidChange'

let subscriptionId: number | null = null
let capturing = false

export const startScreenRecordingGuard = (getWindow: () => BrowserWindow | null): void => {
  if (process.platform !== 'darwin') return
  if (subscriptionId !== null) return

  const notify = (): void => {
    const win = getWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(IPC_CONSTANTS.SCREEN_RECORDING, capturing)
    }
  }

  subscriptionId = systemPreferences.subscribeNotification(CAPTURE_NOTIFICATION, () => {
    capturing = !capturing
    notify()
    if (capturing) {
      console.warn('[ScreenRec] screen capture detected — covering exam')
      emitAppEvent('app_screen_recording_detected')
    } else {
      console.warn('[ScreenRec] screen capture stopped — uncovering exam')
    }
  })
}

// Re-assert the cover after a page (re)load: the renderer overlay resets to
// hidden on every load, but the OS notification only fires on a STATE CHANGE —
// so a reload during active recording would drop the cover without this.
export const reassertScreenRecordingState = (win: BrowserWindow | null): void => {
  if (process.platform !== 'darwin' || !capturing) return
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(IPC_CONSTANTS.SCREEN_RECORDING, true)
  }
}

export const stopScreenRecordingGuard = (): void => {
  if (process.platform !== 'darwin' || subscriptionId === null) return
  systemPreferences.unsubscribeNotification(subscriptionId)
  subscriptionId = null
  capturing = false
}

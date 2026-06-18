import { BrowserWindow, globalShortcut } from 'electron'

import { isExamLocked } from './exam-lock'
// Single source of truth for whether a security violation (prohibited app or
// extra display) is currently active. While active we LOOSEN the kiosk lockdown
// just enough that the student can switch to the offending app and close it:
// the focus-trap is suspended (see the window 'blur' handler) and the
// window-switch shortcuts are released. Kiosk/fullscreen itself stays on.
// Once everything is clean again the lockdown is re-armed.

let procsBlocked = false
let displayBlocked = false
let active = false
let getWindow: () => BrowserWindow | null = () => null

export const initSecurityLock = (windowGetter: () => BrowserWindow | null): void => {
  getWindow = windowGetter
}

export const isSecurityBlockActive = (): boolean => active

export const setBlockedProcessesActive = (blocked: boolean): void => {
  procsBlocked = blocked
  apply()
}

export const setMultipleDisplaysActive = (multiple: boolean): void => {
  displayBlocked = multiple
  apply()
}

// After a user-confirmed exit from the exam (Esc), ignore set-fullscreen(true)
// requests for a short window. The page being navigated away from may still
// have an IPC call in flight that would otherwise re-arm kiosk immediately
// after the user chose to leave.
let fullscreenSuppressedUntil = 0

export const suppressFullscreenRequests = (ms: number): void => {
  fullscreenSuppressedUntil = Date.now() + ms
}

export const isFullscreenSuppressed = (): boolean => Date.now() < fullscreenSuppressedUntil

const apply = (): void => {
  const next = procsBlocked || displayBlocked
  if (next === active) return
  active = next

  if (active) {
    // Let the student reach the prohibited app to close it.
    globalShortcut.unregister('Alt+Tab')
    globalShortcut.unregister('CommandOrControl+Tab')
  } else {
    // Everything is clean — re-arm the lockdown and pull focus back to the exam.
    globalShortcut.register('Alt+Tab', () => {})
    globalShortcut.register('CommandOrControl+Tab', () => {})
    const win = getWindow()
    if (win && isExamLocked(win)) win.focus()
  }
}

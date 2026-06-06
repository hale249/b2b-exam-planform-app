import { app, BrowserWindow } from 'electron'

// Entering kiosk on macOS is asynchronous (a fullscreen-Space animation), and
// a setKiosk(true) issued while a trackpad Space-swipe is still mid-flight is
// silently dropped — no error, no event. Worse, the always-on-top /
// all-Spaces flags the lockdown needs actively BLOCK the fullscreen
// transition when they are set on a window that is not fullscreen yet
// (visibleOnFullScreen marks the window as a fullscreen *auxiliary*, which
// macOS refuses to take fullscreen itself). So arming is staged:
//
//   1. clear the lock flags, then request setKiosk(true) only
//   2. wait for the 'enter-full-screen' event (the transition really happened)
//   3. only then apply alwaysOnTop('screen-saver') + visibleOnAllWorkspaces
//   4. if the event never fires (request dropped mid-swipe), retry from 1.

const ENGAGE_TIMEOUT_MS = 1500
const REARM_DELAY_MS = 300
const MAX_RETRIES = 5

// Whether the exam lock is supposed to be on right now. Guards the pending
// listener/timers: if the user exits the exam while an arm is in flight, the
// pending step must not re-enter kiosk.
let desired = false
let cancelPendingArm: (() => void) | null = null

const clearPendingArm = (): void => {
  if (cancelPendingArm) {
    cancelPendingArm()
    cancelPendingArm = null
  }
}

// Keep the exam above everything and present on every Space, so a trackpad
// swipe between desktops/full-screen apps can't reveal anything behind it
// (macOS won't let an app block the swipe itself). Only safe to call once the
// window IS fullscreen — see the staging comment above.
const applyLockFlags = (win: BrowserWindow): void => {
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (process.platform === 'darwin') app.focus({ steal: true })
  win.moveTop()
  win.focus()
}

const clearLockFlags = (win: BrowserWindow): void => {
  win.setVisibleOnAllWorkspaces(false)
  win.setAlwaysOnTop(false)
}

export const armExamLock = (win: BrowserWindow, attempt = 0): void => {
  if (win.isDestroyed()) return
  desired = true
  clearPendingArm()

  // Already fullscreen (e.g. F11 after the page re-requested the lock) —
  // no transition needed, just make sure kiosk + flags are asserted.
  if (win.isFullScreen()) {
    win.setKiosk(true)
    applyLockFlags(win)
    return
  }

  // The flags must be OFF while the transition runs, or macOS drops it.
  clearLockFlags(win)

  const onEnter = (): void => {
    clearPendingArm()
    if (!desired || win.isDestroyed()) return
    applyLockFlags(win)
  }

  let rearmTimer: ReturnType<typeof setTimeout> | null = null
  const engageTimer = setTimeout(() => {
    win.removeListener('enter-full-screen', onEnter)

    if (!desired || win.isDestroyed()) {
      cancelPendingArm = null
      return
    }
    // Transition may have finished without us catching the event (e.g. the
    // window was already mid-transition when we attached) — check the state.
    if (win.isFullScreen()) {
      cancelPendingArm = null
      win.setKiosk(true)
      applyLockFlags(win)
      return
    }

    if (attempt >= MAX_RETRIES) {
      cancelPendingArm = null
      console.error('[ExamLock] kiosk failed to engage after retries')
      return
    }

    // The request was dropped (mid Space-swipe). Reset the kiosk flag so the
    // next request is not treated as a no-op, then try again shortly.
    console.warn(`[ExamLock] kiosk did not engage — re-arming (attempt ${attempt + 1})`)
    win.setKiosk(false)
    rearmTimer = setTimeout(() => {
      cancelPendingArm = null
      if (desired && !win.isDestroyed()) armExamLock(win, attempt + 1)
    }, REARM_DELAY_MS)
  }, ENGAGE_TIMEOUT_MS)

  cancelPendingArm = (): void => {
    clearTimeout(engageTimer)
    if (rearmTimer) clearTimeout(rearmTimer)
    if (!win.isDestroyed()) win.removeListener('enter-full-screen', onEnter)
  }

  win.once('enter-full-screen', onEnter)
  win.setKiosk(true)
}

export const disarmExamLock = (win: BrowserWindow): void => {
  desired = false
  clearPendingArm()
  if (win.isDestroyed()) return
  clearLockFlags(win)
  if (win.isKiosk()) win.setKiosk(false)
}

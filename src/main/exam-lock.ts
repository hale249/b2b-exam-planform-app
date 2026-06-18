import { app, BrowserWindow } from 'electron'

import { IPC_CONSTANTS } from '../shared/ipc-channels'

// Exam lockdown uses macOS NATIVE fullscreen (setKiosk). Native fullscreen lays
// web content out below the camera-notch safe-area automatically, so the exam UI
// is never obscured by the notch (unlike setSimpleFullScreen, which covers the
// whole display incl. the notch). The downside — exiting native fullscreen plays
// a Space slide animation that briefly reveals the desktop (B2B-2498) — is avoided
// at the call sites: returning "home" navigates WHILE STAYING fullscreen instead
// of disarming, so we only ever exit the Space on explicit F11 / quit.
//
// Entering kiosk on macOS is asynchronous (a fullscreen-Space animation), and a
// setKiosk(true) issued while a trackpad Space-swipe is still mid-flight is
// silently dropped — no error, no event. Worse, the always-on-top / all-Spaces
// flags the lockdown needs actively BLOCK the fullscreen transition when they are
// set on a window that is not fullscreen yet. So arming is staged:
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
// True once kiosk + lock flags are actually applied. Lets a repeated arm request
// (the web re-asserts setFullScreen(true) on every exam-route mount: test →
// finish → device-check → next skill) short-circuit instead of re-stealing focus /
// moveTop, which used to flicker the window between skills (looked like a brief
// "fullscreen off"). Cleared whenever the flags come back off.
let engaged = false
let cancelPendingArm: (() => void) | null = null

const clearPendingArm = (): void => {
  if (cancelPendingArm) {
    cancelPendingArm()
    cancelPendingArm = null
  }
}

// Tell the renderer to show/hide the exam status bar (top-right) with the lock.
const sendLockState = (win: BrowserWindow, locked: boolean): void => {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send(IPC_CONSTANTS.EXAM_LOCK_STATE, locked)
}

// Keep the exam above everything and present on every Space, so a trackpad swipe
// between desktops/full-screen apps can't reveal anything behind it (macOS won't
// let an app block the swipe itself). Only safe to call once the window IS
// fullscreen — see the staging comment above.
const applyLockFlags = (win: BrowserWindow): void => {
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (process.platform === 'darwin') app.focus({ steal: true })
  win.moveTop()
  win.focus()
  engaged = true
  sendLockState(win, true)
}

const clearLockFlags = (win: BrowserWindow): void => {
  win.setVisibleOnAllWorkspaces(false)
  win.setAlwaysOnTop(false)
  engaged = false
}

// Single source of truth for "is the exam lockdown engaged right now".
export const isExamLocked = (win: BrowserWindow): boolean =>
  !win.isDestroyed() && win.isKiosk()

export const armExamLock = (win: BrowserWindow, attempt = 0): void => {
  if (win.isDestroyed()) return
  desired = true
  clearPendingArm()

  // Already locked — repeated arm is a no-op so the web re-asserting
  // setFullScreen(true) on each exam-route mount doesn't re-steal focus / moveTop
  // (that flickered the window between skills). Just keep the status bar shown.
  if (win.isFullScreen() && win.isKiosk() && engaged) {
    sendLockState(win, true)
    return
  }

  // Already fullscreen but flags not applied yet (e.g. F11 after the page
  // re-requested the lock) — assert kiosk + flags, no transition needed.
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
  sendLockState(win, false)
  clearLockFlags(win)
  if (win.isKiosk()) win.setKiosk(false)
}

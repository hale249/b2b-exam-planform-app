import { desktopCapturer } from 'electron'

import { findBlockedProcesses, getRunningProcesses } from '../utils'

export const checkBlockedProcesses = async (): Promise<string[]> => {
  try {
    const output = await getRunningProcesses()
    return findBlockedProcesses(output)
  } catch (error) {
    console.error('Error checking processes:', error)
    return []
  }
}

// Scans currently-open WINDOW TITLES (not just process names) against the same
// blocklist. Catches apps that renamed their executable, since the window title
// usually still reveals the product name (e.g. "ChatGPT", "Zalo").
//
// macOS note: reading other apps' window titles requires Screen Recording
// permission. Without it titles are unavailable, so this is effective mainly on
// Windows; the ps-based scan above stays the primary check on macOS.
// The window-title scan runs on every monitor tick. On macOS without Screen
// Recording permission getSources() throws every time, which would spam the log
// with identical errors. Log it once, then stay silent until it recovers (e.g.
// permission is granted), so a genuine new failure is still surfaced.
let windowScanErrorLogged = false
export const checkBlockedWindows = async (): Promise<string[]> => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false
    })
    windowScanErrorLogged = false
    const titles = sources
      .map((s) => s.name)
      .filter(Boolean)
      .join('\n')
    return findBlockedProcesses(titles)
  } catch (error) {
    if (!windowScanErrorLogged) {
      windowScanErrorLogged = true
      console.warn(
        '[ProcessBlocker] Window-title scan unavailable (needs macOS Screen Recording permission); ' +
          'relying on the process-name scan. Further identical messages suppressed.',
        error instanceof Error ? error.message : error
      )
    }
    return []
  }
}

// Combined detection: blocked processes (by executable) + blocked windows
// (by title), de-duplicated by app name.
export const checkBlockedApps = async (): Promise<string[]> => {
  const [byProcess, byWindow] = await Promise.all([checkBlockedProcesses(), checkBlockedWindows()])
  return Array.from(new Set([...byProcess, ...byWindow]))
}

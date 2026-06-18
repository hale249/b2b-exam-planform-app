import { exec } from 'child_process'

import { BrowserWindow } from 'electron'

import { IPC_CONSTANTS } from '../../shared/ipc-channels'

// Best-effort Wi-Fi signal strength for the exam status bar. There is no portable
// (or non-deprecated) API for this, so we shell out per platform and map the
// result to 0-4 bars. Anything unreadable becomes -1 ("connected, strength
// unknown") and the bar falls back to a plain Wi-Fi glyph. Online/offline itself
// is decided in the renderer via navigator.onLine, which is always reliable — this
// service only adds the signal-strength detail.

const POLL_MS = 12_000

let timer: ReturnType<typeof setInterval> | null = null
let getWindow: () => BrowserWindow | null = () => null

const run = (cmd: string): Promise<string> =>
  new Promise((resolve) => {
    exec(cmd, { timeout: 8_000, maxBuffer: 1024 * 1024 }, (err, stdout) =>
      resolve(err ? '' : stdout)
    )
  })

// RSSI (dBm) -> 0..4 bars. Typical: -50 excellent ... -80 poor.
const rssiToBars = (rssi: number): number => {
  if (rssi >= -55) return 4
  if (rssi >= -65) return 3
  if (rssi >= -72) return 2
  if (rssi >= -80) return 1
  return 0
}

// Percent (Windows / Linux quality) -> 0..4 bars.
const percentToBars = (pct: number): number => {
  if (pct >= 75) return 4
  if (pct >= 50) return 3
  if (pct >= 25) return 2
  if (pct > 0) return 1
  return 0
}

const AIRPORT =
  '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport'

const readSignalBars = async (): Promise<number> => {
  try {
    if (process.platform === 'darwin') {
      // 1) airport -I — fast, but removed on macOS 14.4+.
      const ap = await run(`${AIRPORT} -I 2>/dev/null`)
      let m = ap.match(/agrCtlRSSI:\s*(-?\d+)/)
      if (m) return rssiToBars(Number(m[1]))
      // 2) system_profiler — slower, no airport needed.
      const sp = await run('system_profiler SPAirPortDataType 2>/dev/null')
      m = sp.match(/Signal\s*\/\s*Noise:\s*(-?\d+)\s*dBm/i)
      if (m) return rssiToBars(Number(m[1]))
      return -1
    }
    if (process.platform === 'win32') {
      const out = await run('netsh wlan show interfaces')
      const m = out.match(/Signal\s*:\s*(\d+)%/i)
      if (m) return percentToBars(Number(m[1]))
      return -1
    }
    // Linux: /proc/net/wireless link quality is out of 70.
    const w = await run('cat /proc/net/wireless 2>/dev/null')
    const m = w.match(/:\s*\d+\s+(\d+)\./)
    if (m) return percentToBars(Math.round((Number(m[1]) / 70) * 100))
    return -1
  } catch {
    return -1
  }
}

const tick = async (): Promise<void> => {
  const bars = await readSignalBars()
  const win = getWindow()
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(IPC_CONSTANTS.NETWORK_SIGNAL, bars)
  }
}

export const startNetworkStatus = (windowGetter: () => BrowserWindow | null): void => {
  getWindow = windowGetter
  if (timer) return
  void tick()
  timer = setInterval(() => void tick(), POLL_MS)
}

export const stopNetworkStatus = (): void => {
  if (timer) clearInterval(timer)
  timer = null
}

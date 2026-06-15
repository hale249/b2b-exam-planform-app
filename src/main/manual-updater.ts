import { app, BrowserWindow, ipcMain } from 'electron'
// electron-updater is CommonJS with named exports and NO default export — use a
// named import (see updater.ts for the full explanation).
import { autoUpdater } from 'electron-updater'

import { IPC_CONSTANTS } from '../shared/ipc-channels'
import { applyUpdateChannel } from './updater-channel'

// User-initiated ("manual") update flow shown ON the batch screen.
//
// Unlike the startup force-update gate in updater.ts (which downloads + installs
// before the exam can load), this flow hands control to the user: the renderer
// asks whether a newer build exists, and the student decides when to download and
// when to restart-and-install. The renderer drives it entirely over IPC:
//
//   updater:check     -> { available, version, currentVersion }
//   updater:download  -> starts the download; progress streams back as events
//   updater:install   -> quitAndInstall (relaunch into the new build)
//
// Events pushed to the renderer:
//   updater:progress    { percent, bytesPerSecond, transferred, total }
//   updater:downloaded  { version }
//   updater:error       { message }
//
// electron-updater only works in a packaged app. In dev we report "no update"
// unless TEST_UPDATER=1 forces it to run against dev-app-update.yml.

const updaterEnabled = (): boolean => app.isPackaged || process.env.TEST_UPDATER === '1'

let bound = false
let downloading = false

export const registerManualUpdater = (getWindow: () => BrowserWindow | null): void => {
  const send = (channel: string, payload: unknown): void => {
    const win = getWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }

  // Bind our listeners lazily on first use. removeAllListeners() drops the
  // startup gate's handlers first — by the time the student reaches the batch
  // screen the gate has already settled, so this is safe and prevents the gate's
  // "update-downloaded -> quitAndInstall" listener from firing mid-session.
  const ensureBound = (): void => {
    if (bound) return
    bound = true
    autoUpdater.removeAllListeners()
    autoUpdater.autoDownload = false // manual: the user clicks to download
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.logger = console
    applyUpdateChannel()
    if (process.env.TEST_UPDATER === '1') autoUpdater.forceDevUpdateConfig = true

    autoUpdater.on('download-progress', (p) => {
      send(IPC_CONSTANTS.UPDATER_PROGRESS, {
        percent: Number(p?.percent) || 0,
        bytesPerSecond: Number(p?.bytesPerSecond) || 0,
        transferred: Number(p?.transferred) || 0,
        total: Number(p?.total) || 0
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      downloading = false
      send(IPC_CONSTANTS.UPDATER_DOWNLOADED, { version: String(info?.version || '') })
    })

    autoUpdater.on('error', (err) => {
      downloading = false
      send(IPC_CONSTANTS.UPDATER_ERROR, { message: err?.message || String(err) })
    })
  }

  ipcMain.handle(IPC_CONSTANTS.UPDATER_CHECK, async () => {
    const currentVersion = app.getVersion()
    if (!updaterEnabled()) return { available: false, currentVersion }
    ensureBound()
    try {
      const result = await autoUpdater.checkForUpdates()
      const info = result?.updateInfo
      const version = String(info?.version || '')
      // releaseNotes may be a string (HTML/markdown) or an array of
      // { version, note } entries depending on the feed — normalise to a string.
      let releaseNotes = ''
      if (typeof info?.releaseNotes === 'string') {
        releaseNotes = info.releaseNotes
      } else if (Array.isArray(info?.releaseNotes)) {
        releaseNotes = info.releaseNotes
          .map((n) => (typeof n === 'string' ? n : n?.note || ''))
          .filter(Boolean)
          .join('\n\n')
      }
      const releaseName = String(info?.releaseName || '')
      const releaseDate = String(info?.releaseDate || '')
      // v6 exposes isUpdateAvailable; fall back to a version diff if absent.
      const available = result?.isUpdateAvailable ?? (!!version && version !== currentVersion)
      return { available, version, currentVersion, releaseNotes, releaseName, releaseDate }
    } catch (err) {
      return {
        available: false,
        currentVersion,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle(IPC_CONSTANTS.UPDATER_DOWNLOAD, async () => {
    if (!updaterEnabled()) return { ok: false }
    ensureBound()
    if (downloading) return { ok: true }
    downloading = true
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (err) {
      downloading = false
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CONSTANTS.UPDATER_INSTALL, () => {
    if (!updaterEnabled()) return
    try {
      // isSilent=true, isForceRunAfter=true → reinstall and reopen automatically.
      autoUpdater.quitAndInstall(true, true)
    } catch (err) {
      console.error('[ManualUpdater] quitAndInstall failed:', err)
    }
  })
}

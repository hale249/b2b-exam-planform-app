import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CONSTANTS } from '../shared/ipc-channels'

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke(IPC_CONSTANTS.GET_APP_VERSION)
  },
  onBlockedProcesses: (callback: (processes: string[]) => void) => {
    ipcRenderer.on(IPC_CONSTANTS.BLOCKED_PROCESSES, (_event, processes: string[]) => callback(processes))
  },
  checkBlockedProcesses: (): Promise<string[]> => {
    return ipcRenderer.invoke(IPC_CONSTANTS.CHECK_BLOCKED_PROCESSES)
  },
  checkSecurityViolations: (): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CONSTANTS.CHECK_EXAM_SECURITY)
  },
  openExternalUrl: (url: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CONSTANTS.OPEN_EXTERNAL_URL, url)
  },
  allowQuit: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CONSTANTS.ALLOW_QUIT)
  },
  setFullScreen: (enabled: boolean): Promise<void> => {
    return ipcRenderer.invoke(IPC_CONSTANTS.SET_FULLSCREEN, enabled)
  },
  getFullScreen: (): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CONSTANTS.GET_FULLSCREEN)
  },
  onTabViolation: (callback: () => void) => {
    ipcRenderer.on(IPC_CONSTANTS.TAB_VIOLATION, () => callback())
  },

  // --- User-initiated update flow (batch screen) ---
  checkForUpdate: (): Promise<{
    available: boolean
    version?: string
    currentVersion?: string
    releaseNotes?: string
    releaseName?: string
    releaseDate?: string
    error?: string
  }> => {
    return ipcRenderer.invoke(IPC_CONSTANTS.UPDATER_CHECK)
  },
  downloadUpdate: (): Promise<{ ok: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CONSTANTS.UPDATER_DOWNLOAD)
  },
  installUpdate: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CONSTANTS.UPDATER_INSTALL)
  },
  onUpdateProgress: (
    callback: (p: {
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }) => void
  ) => {
    ipcRenderer.on(IPC_CONSTANTS.UPDATER_PROGRESS, (_event, p) => callback(p))
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on(IPC_CONSTANTS.UPDATER_DOWNLOADED, (_event, info) => callback(info))
  },
  onUpdateError: (callback: (err: { message: string }) => void) => {
    ipcRenderer.on(IPC_CONSTANTS.UPDATER_ERROR, (_event, err) => callback(err))
  }
})

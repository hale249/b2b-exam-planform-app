import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke('get-app-version')
  },
  onBlockedProcesses: (callback: (processes: string[]) => void) => {
    ipcRenderer.on('blocked-processes', (_event, processes: string[]) => callback(processes))
  },
  checkBlockedProcesses: (): Promise<string[]> => {
    return ipcRenderer.invoke('check-blocked-processes')
  },
  checkSecurityViolations: (): Promise<boolean> => {
    return ipcRenderer.invoke('check-exam-security')
  },
  openExternalUrl: (url: string): Promise<void> => {
    return ipcRenderer.invoke('open-external-url', url)
  },
  allowQuit: (): Promise<void> => {
    return ipcRenderer.invoke('allow-quit')
  },
  setFullScreen: (enabled: boolean): Promise<void> => {
    return ipcRenderer.invoke('set-fullscreen', enabled)
  },
  getFullScreen: (): Promise<boolean> => {
    return ipcRenderer.invoke('get-fullscreen')
  },
  onTabViolation: (callback: () => void) => {
    ipcRenderer.on('tab-violation', () => callback())
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
    return ipcRenderer.invoke('updater:check')
  },
  downloadUpdate: (): Promise<{ ok: boolean; error?: string }> => {
    return ipcRenderer.invoke('updater:download')
  },
  installUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('updater:install')
  },
  onUpdateProgress: (
    callback: (p: {
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }) => void
  ) => {
    ipcRenderer.on('updater:progress', (_event, p) => callback(p))
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('updater:downloaded', (_event, info) => callback(info))
  },
  onUpdateError: (callback: (err: { message: string }) => void) => {
    ipcRenderer.on('updater:error', (_event, err) => callback(err))
  }
})

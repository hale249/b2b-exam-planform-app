import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onBlockedProcesses: (callback: (processes: string[]) => void) => {
    ipcRenderer.on('blocked-processes', (_event, processes: string[]) => callback(processes))
  },
  checkBlockedProcesses: (): Promise<string[]> => {
    return ipcRenderer.invoke('check-blocked-processes')
  },
  checkSecurityViolations: (): Promise<boolean> => {
    return ipcRenderer.invoke('check-security-violations')
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
  }
})

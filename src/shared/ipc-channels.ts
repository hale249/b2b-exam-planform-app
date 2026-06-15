export const IPC_CONSTANTS = {
  // Request/response: ipcMain.handle <-> ipcRenderer.invoke
  GET_APP_VERSION: 'get-app-version',
  OPEN_EXTERNAL_URL: 'open-external-url',
  CHECK_BLOCKED_PROCESSES: 'check-blocked-processes',
  CHECK_EXAM_SECURITY: 'check-exam-security',
  SET_FULLSCREEN: 'set-fullscreen',
  GET_FULLSCREEN: 'get-fullscreen',
  ALLOW_QUIT: 'allow-quit',
  UPDATER_CHECK: 'updater:check',
  UPDATER_DOWNLOAD: 'updater:download',
  UPDATER_INSTALL: 'updater:install',

  // Events: webContents.send / ipcRenderer.send <-> .on
  BLOCKED_PROCESSES: 'blocked-processes',
  FORCE_SECURITY_CHECK: 'force-security-check',
  TAB_VIOLATION: 'tab-violation',
  SHOW_CONFIRM: 'show-confirm',
  CONFIRM_RESPONSE: 'confirm-response',
  DISPLAY_COUNT: 'display-count',
  UPDATER_AVAILABLE: 'updater:available',
  UPDATER_PROGRESS: 'updater:progress',
  UPDATER_DOWNLOADED: 'updater:downloaded',
  UPDATER_ERROR: 'updater:error'
} as const

export type IpcChannel = (typeof IPC_CONSTANTS)[keyof typeof IPC_CONSTANTS]

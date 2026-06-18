export const IPC_CONSTANTS = {
  // Request/response: ipcMain.handle <-> ipcRenderer.invoke
  GET_APP_VERSION: 'get-app-version',
  OPEN_EXTERNAL_URL: 'open-external-url',
  CHECK_BLOCKED_PROCESSES: 'check-blocked-processes',
  CHECK_EXAM_SECURITY: 'check-exam-security',
  SET_FULLSCREEN: 'set-fullscreen',
  GET_FULLSCREEN: 'get-fullscreen',
  ALLOW_QUIT: 'allow-quit',
  SET_EXAM_CONTEXT: 'set-exam-context',
  CLEAR_EXAM_CONTEXT: 'clear-exam-context',
  SET_AUTH_TOKEN: 'set-auth-token',
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
  SCREEN_RECORDING: 'screen-recording',
  // Exam status bar (top-right): show/hide with the lock, live Wi-Fi signal, and
  // its action buttons (reload / exit-to-home reuse the existing confirm flows).
  EXAM_LOCK_STATE: 'exam-lock-state',
  NETWORK_SIGNAL: 'network-signal',
  STATUSBAR_RELOAD: 'statusbar-reload',
  STATUSBAR_EXIT_HOME: 'statusbar-exit-home',
  UPDATER_AVAILABLE: 'updater:available',
  UPDATER_PROGRESS: 'updater:progress',
  UPDATER_DOWNLOADED: 'updater:downloaded',
  UPDATER_ERROR: 'updater:error'
} as const

export type IpcChannel = (typeof IPC_CONSTANTS)[keyof typeof IPC_CONSTANTS]

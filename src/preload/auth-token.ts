import { ipcRenderer } from 'electron'

import { IPC_CONSTANTS } from '../shared/ipc-channels'

// The web stores the candidate's auth token in localStorage on login. We read it
// from here (the preload shares the page's DOM/localStorage) and forward it to
// the main process, which uses it as the identity when syncing native app
// events. Polled because the SPA sets the token after login without a reload.
const reportToken = (): void => {
  try {
    ipcRenderer.send(IPC_CONSTANTS.SET_AUTH_TOKEN, window.localStorage.getItem('token') || '')
  } catch {
    // localStorage may be unavailable very early — ignore, the poll retries.
  }
}

window.addEventListener('DOMContentLoaded', reportToken)
setInterval(reportToken, 15_000)

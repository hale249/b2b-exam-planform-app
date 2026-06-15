import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

// Each env build carries its channel in the version prerelease tag:
//   1.2.0      -> production (channel "latest")
//   1.2.0-stg  -> staging    (channel "stg")
//   1.2.0-dev  -> dev        (channel "dev")
// Point the updater at the matching channel so a dev install only ever updates
// to the latest dev build, stg->stg, prod->prod — like VS Code Stable vs Insiders.
// Must be called before checkForUpdates / downloadUpdate.
export const applyUpdateChannel = (): void => {
  const version = app.getVersion()
  const prerelease = version.includes('-') ? version.split('-')[1].split('.')[0] : ''
  if (prerelease) {
    autoUpdater.channel = prerelease
    autoUpdater.allowPrerelease = true
  }
}

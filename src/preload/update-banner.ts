import { ipcRenderer } from 'electron'

import { IPC_CONSTANTS } from '../shared/ipc-channels'

// In-app "new version" banner (top-right toast). The main process detects a
// newer build by polling (manual-updater.ts) and only emits UPDATER_AVAILABLE
// when NOT in an exam — so this banner never appears during a test session.
// Flow: available -> [Update now] -> downloading (progress) -> ready -> [Restart].

let el: HTMLDivElement | null = null
let state: 'available' | 'downloading' | 'ready' | 'restarting' | 'error' = 'available'
let version = ''
let percent = 0

function injectStyles(): void {
  if (document.getElementById('__upd_styles')) return
  const s = document.createElement('style')
  s.id = '__upd_styles'
  s.textContent = `
    #__upd_banner{position:fixed;top:20px;right:20px;width:344px;max-width:calc(100vw - 40px);
      background:#fff;border:1px solid #eef1f6;border-radius:16px;
      box-shadow:0 16px 44px rgba(15,23,42,.16);padding:16px 18px;
      font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;
      z-index:2147483630;transform:translateX(130%);opacity:0;
      transition:transform .35s cubic-bezier(.16,1,.3,1),opacity .35s ease}
    #__upd_banner.show{transform:translateX(0);opacity:1}
    .__upd_head{display:flex;align-items:center;gap:12px}
    .__upd_ic{width:38px;height:38px;border-radius:11px;flex-shrink:0;
      background:linear-gradient(135deg,#0071F9,#4f9bff);display:flex;align-items:center;justify-content:center}
    .__upd_ic svg{width:20px;height:20px;fill:#fff}
    .__upd_tt{font-size:14px;font-weight:650;margin:0;line-height:1.3}
    .__upd_sb{font-size:12.5px;color:#64748b;margin:2px 0 0}
    .__upd_bar{height:6px;border-radius:99px;background:#eef2f7;overflow:hidden;margin:14px 0 0;display:none}
    .__upd_fill{height:100%;width:0%;border-radius:99px;
      background:linear-gradient(90deg,#0071F9,#5aa6ff);transition:width .3s ease}
    .__upd_pct{font-size:12px;color:#94a3b8;margin:8px 0 0;font-variant-numeric:tabular-nums;display:none}
    .__upd_act{display:flex;gap:8px;margin-top:14px}
    .__upd_btn{flex:1;padding:9px 12px;border-radius:10px;border:none;cursor:pointer;
      font-family:inherit;font-size:13px;font-weight:600;transition:filter .15s ease}
    .__upd_btn:active{filter:brightness(.93)}
    .__upd_primary{background:#0071F9;color:#fff}
    .__upd_primary:hover{background:#1a56db}
    .__upd_ghost{background:#f3f4f6;color:#23242d;flex:0 0 auto;padding:9px 14px}
    .__upd_ghost:hover{background:#e5e7eb}
    body.__upd_dl .__upd_bar,body.__upd_dl .__upd_pct{display:block}
    .__upd_spin{width:20px;height:20px;border:2.5px solid #dbe7fb;border-top-color:#0071F9;
      border-radius:50%;animation:__upd_sp .7s linear infinite;margin:4px auto 0}
    @keyframes __upd_sp{to{transform:rotate(360deg)}}
  `
  document.head.appendChild(s)
}

function build(): HTMLDivElement {
  injectStyles()
  const d = document.createElement('div')
  d.id = '__upd_banner'
  d.innerHTML = `
    <div class="__upd_head">
      <div class="__upd_ic"><svg viewBox="0 0 24 24"><path d="M13 3h-2v8.59L8.21 8.79 6.79 10.2 12 15.41l5.21-5.21-1.42-1.41L13 11.59V3zM5 18h14v2H5z"/></svg></div>
      <div><p class="__upd_tt" id="__upd_tt">Update available</p><p class="__upd_sb" id="__upd_sb"></p></div>
    </div>
    <div class="__upd_bar"><div class="__upd_fill" id="__upd_fill"></div></div>
    <div class="__upd_pct" id="__upd_pct"></div>
    <div class="__upd_act" id="__upd_act"></div>
  `
  document.body.appendChild(d)
  return d
}

function hide(): void {
  if (el) el.classList.remove('show')
}

function startDownload(): void {
  state = 'downloading'
  percent = 0
  render()
  ipcRenderer.invoke(IPC_CONSTANTS.UPDATER_DOWNLOAD)
}

function render(): void {
  if (!el) el = build()
  const tt = el.querySelector('#__upd_tt') as HTMLElement
  const sb = el.querySelector('#__upd_sb') as HTMLElement
  const act = el.querySelector('#__upd_act') as HTMLElement
  const fill = el.querySelector('#__upd_fill') as HTMLElement
  const pctEl = el.querySelector('#__upd_pct') as HTMLElement
  document.body.classList.toggle('__upd_dl', state === 'downloading')

  if (state === 'available') {
    tt.textContent = 'Update available'
    sb.textContent = version ? 'Version ' + version : ''
    act.innerHTML =
      '<button class="__upd_btn __upd_primary" id="__upd_go">Update now</button>' +
      '<button class="__upd_btn __upd_ghost" id="__upd_later">Later</button>'
    ;(el.querySelector('#__upd_go') as HTMLElement).onclick = startDownload
    ;(el.querySelector('#__upd_later') as HTMLElement).onclick = hide
  } else if (state === 'downloading') {
    tt.textContent = 'Downloading update…'
    sb.textContent = version ? 'Version ' + version : ''
    fill.style.width = percent.toFixed(0) + '%'
    pctEl.textContent = percent.toFixed(0) + '%'
    act.innerHTML = ''
  } else if (state === 'ready') {
    tt.textContent = 'Update ready'
    sb.textContent = 'Restart to finish updating'
    act.innerHTML =
      '<button class="__upd_btn __upd_primary" id="__upd_restart">Restart now</button>' +
      '<button class="__upd_btn __upd_ghost" id="__upd_later">Later</button>'
    ;(el.querySelector('#__upd_restart') as HTMLElement).onclick = restart
    ;(el.querySelector('#__upd_later') as HTMLElement).onclick = hide
  } else if (state === 'error') {
    tt.textContent = 'Update failed'
    sb.textContent = 'Download was interrupted. Please try again.'
    act.innerHTML =
      '<button class="__upd_btn __upd_primary" id="__upd_retry">Retry</button>' +
      '<button class="__upd_btn __upd_ghost" id="__upd_later">Later</button>'
    ;(el.querySelector('#__upd_retry') as HTMLElement).onclick = startDownload
    ;(el.querySelector('#__upd_later') as HTMLElement).onclick = hide
  } else {
    tt.textContent = 'Restarting to update…'
    sb.textContent = 'The app will reopen automatically.'
    act.innerHTML = '<div class="__upd_spin"></div>'
  }
}

function restart(): void {
  state = 'restarting'
  render()
  // Brief "restarting" state, then quitAndInstall (relaunch into the new build).
  setTimeout(() => ipcRenderer.invoke(IPC_CONSTANTS.UPDATER_INSTALL), 150)
}

function show(): void {
  if (!el) el = build()
  render()
  requestAnimationFrame(() => el && el.classList.add('show'))
}

ipcRenderer.on(IPC_CONSTANTS.UPDATER_AVAILABLE, (_e, info: { version: string }) => {
  // Never interrupt an in-progress flow with a fresh "update available" toast —
  // while downloading / ready / restarting / retrying, keep the current banner.
  if (state !== 'available') return
  version = info?.version || ''
  show()
})

ipcRenderer.on(IPC_CONSTANTS.UPDATER_PROGRESS, (_e, p: { percent: number }) => {
  if (state !== 'downloading') return
  percent = Math.max(0, Math.min(100, Number(p?.percent) || 0))
  render()
})

ipcRenderer.on(IPC_CONSTANTS.UPDATER_DOWNLOADED, (_e, info: { version: string }) => {
  version = info?.version || version
  state = 'ready'
  render()
})

ipcRenderer.on(IPC_CONSTANTS.UPDATER_ERROR, () => {
  // A download error shows an explicit "Update failed / Retry" state instead of
  // silently reverting to "Update available" (which looked like a brand-new toast
  // popping up mid-download). Only react if a download was actually running.
  if (state === 'downloading') {
    state = 'error'
    render()
  }
})

import { ipcRenderer } from 'electron'

import { IPC_CONSTANTS } from '../shared/ipc-channels'

// Screen-recording cover.
//
// On macOS, setContentProtection(true) blocks SCREENSHOTS but NOT screen
// RECORDING (a long-standing Electron/macOS limitation). The main process
// detects active capture via the OS notification and toggles this overlay over
// IPC. The overlay is FULLY OPAQUE: because a recorder captures whatever the
// window currently shows, covering the exam with an opaque screen means the
// recording captures this warning instead of the questions.
//
// Reactive by nature: a few frames may be captured before the cover appears,
// and nothing can stop a phone camera pointed at the screen.

let overlay: HTMLDivElement | null = null

function injectStyles(): void {
  if (document.getElementById('__rec_styles')) return
  const s = document.createElement('style')
  s.id = '__rec_styles'
  s.textContent = `
    #__rec_overlay{position:fixed;inset:0;width:100%;height:100%;
      background:#0b1220;color:#fff;z-index:2147483646;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
      text-align:center;padding:24px;pointer-events:all;
      font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    #__rec_overlay .ic{width:72px;height:72px;border-radius:50%;background:#7f1d1d;
      display:flex;align-items:center;justify-content:center}
    #__rec_overlay .ic svg{width:38px;height:38px;fill:none;stroke:#fff;stroke-width:1.8}
    #__rec_overlay h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.01em}
    #__rec_overlay p{font-size:15px;line-height:1.55;color:#cbd5e1;margin:0;max-width:460px}
  `
  document.head.appendChild(s)
}

function build(): HTMLDivElement {
  injectStyles()
  const d = document.createElement('div')
  d.id = '__rec_overlay'
  d.innerHTML = `
    <div class="ic">
      <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="14" height="14" rx="3"/><path d="M16 10l6-4v12l-6-4"/>
        <line x1="3" y1="3" x2="21" y2="21" stroke="#fca5a5"/>
      </svg>
    </div>
    <h1>Screen recording detected</h1>
    <p>Your exam has been hidden for security. Please stop recording or sharing your screen to continue.</p>
  `
  return d
}

function show(): void {
  if (!overlay) overlay = build()
  if (!overlay.isConnected) document.body.appendChild(overlay)
  overlay.style.display = 'flex'
}

function hide(): void {
  if (overlay) overlay.style.display = 'none'
}

ipcRenderer.on(IPC_CONSTANTS.SCREEN_RECORDING, (_e, capturing: boolean) => {
  if (capturing) show()
  else hide()
})

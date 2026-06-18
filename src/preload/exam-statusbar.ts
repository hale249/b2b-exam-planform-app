import { ipcRenderer } from 'electron'

import { IPC_CONSTANTS } from '../shared/ipc-channels'

// Exam status bar — a slim pill pinned to the TOP-RIGHT while the exam is locked
// (inspired by the SafeExamBrowser dock). Kept compact so it doesn't crowd the
// web app / TRT (IELTS iframe) header on the right; can be dragged left/right and
// the chosen x is remembered (localStorage) across reloads. Shows Wi-Fi (signal),
// battery and the clock, plus Reload / Exit-to-Home actions. The actions just ask
// the main process to run the SAME confirm flows as the Cmd+R / Esc shortcuts, so
// nothing destructive happens without a confirmation.
//
// Online/offline is read locally (navigator.onLine — always reliable); the signal
// strength bars come from the main process (native, best-effort) over
// NETWORK_SIGNAL. Visibility is driven by EXAM_LOCK_STATE (and queried once on
// load via GET_FULLSCREEN so a reload mid-exam keeps the bar).

const POS_KEY = '__sb_pos_x' // remembered drag position (left, px)
const EDGE_MARGIN = 6
let el: HTMLDivElement | null = null
let bars = -1 // 0..4, or -1 = connected/strength unknown
let online = navigator.onLine
let battery: { level: number; charging: boolean } | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null

function injectStyles(): void {
  if (document.getElementById('__sb_styles')) return
  const s = document.createElement('style')
  s.id = '__sb_styles'
  s.textContent = `
    #__sb_bar{position:fixed;right:6px;top:calc(env(safe-area-inset-top, 0px) + 8px);
      z-index:2147483628;display:none;align-items:center;gap:9px;
      padding:4px 8px;border-radius:999px;background:rgba(17,24,39,.92);
      -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
      box-shadow:0 6px 20px rgba(0,0,0,.25);color:#fff;
      font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
      font-size:11px;font-variant-numeric:tabular-nums;user-select:none;-webkit-user-select:none;
      cursor:grab;touch-action:none}
    #__sb_bar.__sb_dragging{cursor:grabbing}
    #__sb_bar.show{display:flex}
    .__sb_item{display:flex;align-items:center;gap:5px;white-space:nowrap}
    .__sb_sep{width:1px;height:14px;background:rgba(255,255,255,.16)}
    .__sb_wifi{display:flex;align-items:flex-end;gap:1.5px;height:11px}
    .__sb_wifi i{width:2.5px;border-radius:1px;background:#3f4654;display:block}
    .__sb_wifi i.on{background:#34d399}
    .__sb_wifi i:nth-child(1){height:4px}.__sb_wifi i:nth-child(2){height:6px}
    .__sb_wifi i:nth-child(3){height:9px}.__sb_wifi i:nth-child(4){height:11px}
    .__sb_off{color:#fca5a5;font-weight:600}
    .__sb_batt{display:flex;align-items:center;gap:4px}
    .__sb_batt_shell{position:relative;width:22px;height:11px;border:1.5px solid rgba(255,255,255,.55);
      border-radius:3px;padding:1.5px}
    .__sb_batt_shell::after{content:'';position:absolute;right:-3.5px;top:2.5px;width:2px;height:4px;
      border-radius:0 1px 1px 0;background:rgba(255,255,255,.55)}
    .__sb_batt_fill{height:100%;border-radius:1px;background:#34d399;transition:width .3s ease}
    .__sb_batt_fill.low{background:#f87171}
    .__sb_bolt{color:#fbbf24}
    .__sb_btn{display:flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;
      border:none;cursor:pointer;background:rgba(255,255,255,.10);color:#fff;
      font-family:inherit;font-size:11px;font-weight:600;transition:background .15s ease}
    .__sb_btn:hover{background:rgba(255,255,255,.20)}
    .__sb_btn.danger:hover{background:#dc2626}
    .__sb_btn svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;
      stroke-linecap:round;stroke-linejoin:round}
  `
  document.head.appendChild(s)
}

function build(): HTMLDivElement {
  injectStyles()
  const d = document.createElement('div')
  d.id = '__sb_bar'
  d.innerHTML = `
    <div class="__sb_item" id="__sb_net"></div>
    <div class="__sb_sep"></div>
    <div class="__sb_item __sb_batt" id="__sb_battery"></div>
    <div class="__sb_sep"></div>
    <div class="__sb_item" id="__sb_clock"></div>
    <div class="__sb_sep"></div>
    <button class="__sb_btn" id="__sb_reload" title="Reload page">
      <svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      Reload
    </button>
    <button class="__sb_btn danger" id="__sb_exit" title="Exit to home">
      <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
      Exit
    </button>
  `
  document.body.appendChild(d)
  d.querySelector('#__sb_reload')!.addEventListener('click', () =>
    ipcRenderer.send(IPC_CONSTANTS.STATUSBAR_RELOAD)
  )
  d.querySelector('#__sb_exit')!.addEventListener('click', () =>
    ipcRenderer.send(IPC_CONSTANTS.STATUSBAR_EXIT_HOME)
  )
  enableDrag(d)
  return d
}

// Keep an x (left, px) inside the viewport, accounting for the pill's width.
function clampX(x: number, width: number): number {
  const max = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN)
  return Math.min(Math.max(x, EDGE_MARGIN), max)
}

// Switch the pill from right-anchored to an explicit left, clamped in view.
function setLeft(d: HTMLDivElement, x: number): void {
  d.style.right = 'auto'
  d.style.left = `${clampX(x, d.offsetWidth)}px`
}

// Re-apply a remembered x once the pill is visible (offsetWidth needs layout).
function applySavedPosition(d: HTMLDivElement): void {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(POS_KEY)
  } catch {
    /* localStorage may be blocked — fall back to the default right anchor */
  }
  if (saved !== null && saved !== '') setLeft(d, parseFloat(saved))
}

// Horizontal drag. Starts only off the buttons, so Reload/Exit still click. A tiny
// threshold means a plain click never nudges the bar. The x is persisted on drop.
function enableDrag(d: HTMLDivElement): void {
  let dragging = false
  let moved = false
  let startPointerX = 0
  let startLeft = 0
  d.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    dragging = true
    moved = false
    startLeft = d.getBoundingClientRect().left
    setLeft(d, startLeft)
    startPointerX = e.clientX
    d.classList.add('__sb_dragging')
    d.setPointerCapture(e.pointerId)
  })
  d.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const dx = e.clientX - startPointerX
    if (Math.abs(dx) > 3) moved = true
    setLeft(d, startLeft + dx)
  })
  const end = (e: PointerEvent): void => {
    if (!dragging) return
    dragging = false
    d.classList.remove('__sb_dragging')
    try {
      d.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
    if (moved) {
      try {
        localStorage.setItem(POS_KEY, d.style.left.replace('px', ''))
      } catch {
        /* persisting is best-effort */
      }
    }
  }
  d.addEventListener('pointerup', end)
  d.addEventListener('pointercancel', end)
  // Keep it on-screen if the window is resized while parked at an explicit x.
  window.addEventListener('resize', () => {
    if (d.style.left && d.style.left !== 'auto') setLeft(d, parseFloat(d.style.left))
  })
}

function renderNet(): void {
  if (!el) return
  const net = el.querySelector('#__sb_net') as HTMLElement
  if (!online) {
    net.innerHTML = `<span class="__sb_off">⚠︎ No internet</span>`
    return
  }
  if (bars < 0) {
    // Connected but strength unknown — plain Wi-Fi label.
    net.innerHTML = `<span class="__sb_wifi"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i></span><span>Wi‑Fi</span>`
    return
  }
  let i = ''
  for (let k = 1; k <= 4; k++) i += `<i class="${k <= bars ? 'on' : ''}"></i>`
  net.innerHTML = `<span class="__sb_wifi">${i}</span>`
}

function renderBattery(): void {
  if (!el) return
  const b = el.querySelector('#__sb_battery') as HTMLElement
  if (!battery) {
    b.style.display = 'none'
    return
  }
  b.style.display = 'flex'
  const pct = Math.round(battery.level * 100)
  const low = pct <= 20 && !battery.charging
  b.innerHTML =
    `<span class="__sb_batt_shell"><span class="__sb_batt_fill ${low ? 'low' : ''}" style="width:${pct}%"></span></span>` +
    `${battery.charging ? '<span class="__sb_bolt">⚡</span>' : ''}<span>${pct}%</span>`
}

function renderClock(): void {
  if (!el) return
  const c = el.querySelector('#__sb_clock') as HTMLElement
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  c.textContent = `${hh}:${mm}`
}

function show(): void {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', show, { once: true })
    return
  }
  if (!el) el = build()
  renderNet()
  renderBattery()
  renderClock()
  el.classList.add('show')
  applySavedPosition(el) // restore a dragged x now that the pill has layout
  if (!clockTimer) clockTimer = setInterval(renderClock, 15_000)
}

function hide(): void {
  if (el) el.classList.remove('show')
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
}

// --- live inputs ---
window.addEventListener('online', () => {
  online = true
  renderNet()
})
window.addEventListener('offline', () => {
  online = false
  renderNet()
})

ipcRenderer.on(IPC_CONSTANTS.NETWORK_SIGNAL, (_e, value: number) => {
  bars = typeof value === 'number' ? value : -1
  online = navigator.onLine
  renderNet()
})

ipcRenderer.on(IPC_CONSTANTS.EXAM_LOCK_STATE, (_e, locked: boolean) => {
  if (locked) show()
  else hide()
})

// Battery (best-effort; not all platforms expose it).
type BatteryLike = {
  level: number
  charging: boolean
  addEventListener: (t: string, cb: () => void) => void
}
const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }
if (nav.getBattery) {
  nav
    .getBattery()
    .then((b) => {
      const update = (): void => {
        battery = { level: b.level, charging: b.charging }
        renderBattery()
      }
      update()
      b.addEventListener('levelchange', update)
      b.addEventListener('chargingchange', update)
    })
    .catch(() => {})
}

// On (re)load, re-show if the exam is still locked (e.g. an in-exam reload).
ipcRenderer
  .invoke(IPC_CONSTANTS.GET_FULLSCREEN)
  .then((locked: boolean) => {
    if (locked) show()
  })
  .catch(() => {})

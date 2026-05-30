import { ipcRenderer } from 'electron'

const DISMISS_COOLDOWN_MS = 30_000

let blockedProcesses: string[] = []
let multipleDisplays = false
let dismissedUntil = 0

function injectStyles(): void {
  if (document.getElementById('__blocked_styles')) return
  const style = document.createElement('style')
  style.id = '__blocked_styles'
  style.textContent = `
    @keyframes __blocked_overlay_in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes __blocked_card_in {
      from { opacity: 0; transform: translateY(12px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    #__blocked_overlay {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(17, 24, 39, 0.78);
      -webkit-backdrop-filter: blur(6px);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483640;
      pointer-events: all;
      animation: __blocked_overlay_in 0.2s ease both;
    }

    #__blocked_card {
      background: #ffffff;
      border-radius: 20px;
      padding: 32px 32px 28px;
      max-width: 460px;
      width: 92%;
      font-family: ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji';
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
      animation: __blocked_card_in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    /* --- Header: icon + title --- */
    .__blocked_header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 22px;
    }

    .__blocked_icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #FEF2F2;
      box-shadow: 0 0 0 8px #FEF2F299;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 18px;
    }

    .__blocked_icon svg {
      width: 28px;
      height: 28px;
    }

    .__blocked_title {
      color: #05060f;
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 26px;
      margin: 0 0 6px;
      text-align: center;
    }

    .__blocked_subtitle {
      color: #6B7280;
      font-size: 14px;
      line-height: 21px;
      margin: 0;
      text-align: center;
      max-width: 340px;
    }

    /* --- Issue rows --- */
    .__blocked_issue {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px;
      background: #F9FAFB;
      border: 1px solid #F0F1F3;
      border-radius: 14px;
    }

    .__blocked_issue + .__blocked_issue {
      margin-top: 8px;
    }

    .__blocked_issue_icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 18px;
    }

    .__blocked_issue_icon.--display {
      background: #FEF3C7;
    }

    .__blocked_issue_icon.--software {
      background: #FEE2E2;
    }

    .__blocked_issue_body {
      flex: 1;
      min-width: 0;
    }

    .__blocked_issue_title {
      font-size: 14px;
      font-weight: 600;
      line-height: 20px;
      margin: 0 0 2px;
    }

    .__blocked_issue_title.--display { color: #92400E; }
    .__blocked_issue_title.--software { color: #991B1B; }

    .__blocked_issue_desc {
      color: #6B7280;
      font-size: 13px;
      line-height: 19px;
      margin: 0;
    }

    .__blocked_app_list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 10px 0 0;
      padding: 0;
      list-style: none;
    }

    .__blocked_app_tag {
      display: inline-block;
      background: #ffffff;
      color: #B91C1C;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 6px;
      border: 1px solid #FECACA;
    }

    /* --- Footer --- */
    .__blocked_footer {
      margin-top: 22px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .__blocked_dismiss_btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 11px 32px;
      background: #0071F9;
      color: #ffffff;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      transition: background 0.15s ease, opacity 0.15s ease;
    }

    .__blocked_dismiss_btn:hover {
      background: #1a56db;
    }

    .__blocked_hint {
      color: #9CA3AF;
      font-size: 12px;
      line-height: 16px;
      margin: 0;
      text-align: center;
    }
  `
  document.head.appendChild(style)
}

function createOverlay(): HTMLDivElement {
  injectStyles()
  const overlay = document.createElement('div')
  overlay.id = '__blocked_overlay'

  overlay.innerHTML = `
    <div id="__blocked_card" role="alertdialog" aria-modal="true" aria-labelledby="__blocked_title">
      <div class="__blocked_header">
        <div class="__blocked_icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 class="__blocked_title" id="__blocked_title">Security check required</h2>
        <p class="__blocked_subtitle" id="__blocked_subtitle"></p>
      </div>
      <div id="__blocked_issues"></div>
      <div class="__blocked_footer">
        <button id="__blocked_check_btn" class="__blocked_dismiss_btn" type="button">I understand</button>
        <p class="__blocked_hint">This window updates automatically once everything is resolved.</p>
      </div>
    </div>
  `

  overlay.querySelector('#__blocked_check_btn')!.addEventListener('click', () => {
    // Dismiss the overlay and stay hidden for the cooldown. The periodic
    // monitor (and force-security-check) re-render after that, so it pops
    // back up if the violation is still present.
    dismissedUntil = Date.now() + DISMISS_COOLDOWN_MS
    overlay.style.display = 'none'
  })

  return overlay
}

function renderOverlay(): void {
  const hasIssues = blockedProcesses.length > 0 || multipleDisplays

  let overlay = document.getElementById('__blocked_overlay') as HTMLDivElement | null

  if (!hasIssues) {
    dismissedUntil = 0
    if (overlay) overlay.style.display = 'none'
    return
  }

  // User dismissed — stay hidden until the cooldown elapses.
  if (Date.now() < dismissedUntil) return

  if (!overlay) {
    overlay = createOverlay()
    document.body.appendChild(overlay)
  }

  // Count issues
  const issueCount = (multipleDisplays ? 1 : 0) + (blockedProcesses.length > 0 ? 1 : 0)

  const subtitle = overlay.querySelector('#__blocked_subtitle') as HTMLParagraphElement
  subtitle.textContent =
    issueCount === 1
      ? 'Resolve the issue below to return to your exam.'
      : `Resolve the ${issueCount} issues below to return to your exam.`

  const issues = overlay.querySelector('#__blocked_issues') as HTMLDivElement

  let html = ''

  if (multipleDisplays) {
    html += `
      <div class="__blocked_issue">
        <div class="__blocked_issue_icon --display">&#9783;</div>
        <div class="__blocked_issue_body">
          <p class="__blocked_issue_title --display">More than one screen detected</p>
          <p class="__blocked_issue_desc">Only one screen is allowed during the exam. Disconnect any external monitors, then re-check.</p>
        </div>
      </div>
    `
  }

  if (blockedProcesses.length > 0) {
    const isPlural = blockedProcesses.length > 1
    html += `
      <div class="__blocked_issue">
        <div class="__blocked_issue_icon --software">&#9888;</div>
        <div class="__blocked_issue_body">
          <p class="__blocked_issue_title --software">${isPlural ? 'Prohibited apps are running' : 'A prohibited app is running'}</p>
          <p class="__blocked_issue_desc">Fully close ${isPlural ? 'these apps' : 'this app'}, then re-check:</p>
          <div class="__blocked_app_list">
            ${blockedProcesses.map((p) => `<span class="__blocked_app_tag">${p}</span>`).join('')}
          </div>
        </div>
      </div>
    `
  }

  issues.innerHTML = html
  overlay.style.display = 'flex'
}

ipcRenderer.on('blocked-processes', (_event, processes: string[]) => {
  blockedProcesses = processes
  renderOverlay()
})

ipcRenderer.on('check-blocked-processes', (_event, processes: string[]) => {
  blockedProcesses = processes
  renderOverlay()
})

ipcRenderer.on('display-count', (_event, count: number) => {
  multipleDisplays = count > 1
  renderOverlay()
})

// Listen for force-check from main (triggered by web app's checkSecurityViolations)
ipcRenderer.on(
  'force-security-check',
  (_event, data: { blockedProcesses: string[]; displayCount: number }) => {
    blockedProcesses = data.blockedProcesses
    multipleDisplays = data.displayCount > 1
    dismissedUntil = 0
    renderOverlay()
  }
)

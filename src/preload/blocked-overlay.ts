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
    #__blocked_overlay {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: #303030cc;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483640;
      pointer-events: all;
    }

    #__blocked_card {
      background: #ffffff;
      border-radius: 20px;
      padding: 36px 32px 32px;
      max-width: 540px;
      width: 92%;
      font-family: ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji';
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    /* --- Header: icon + badge --- */
    .__blocked_header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 20px;
    }

    .__blocked_icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #FEF2F2;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }

    .__blocked_icon svg {
      width: 32px;
      height: 32px;
    }

    .__blocked_title {
      color: #05060f;
      font-size: 20px;
      font-weight: 700;
      line-height: 28px;
      margin: 0 0 6px;
      text-align: center;
    }

    .__blocked_subtitle {
      color: #6B7280;
      font-size: 14px;
      line-height: 22px;
      margin: 0;
      text-align: center;
    }

    /* --- Divider --- */
    .__blocked_divider {
      height: 1px;
      background: #E5E7EB;
      margin: 0 0 16px;
    }

    /* --- Issue rows --- */
    .__blocked_issue {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 0;
    }

    .__blocked_issue + .__blocked_issue {
      border-top: 1px solid #F3F4F6;
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
      margin-top: 2px;
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
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }

    .__blocked_app_tag {
      display: inline-block;
      background: #F3F4F6;
      color: #1F2937;
      font-size: 12px;
      font-weight: 500;
      padding: 3px 10px;
      border-radius: 6px;
      border: 1px solid #E5E7EB;
    }

    /* --- Footer --- */
    .__blocked_footer {
      margin-top: 20px;
      text-align: center;
    }

    .__blocked_dismiss_btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 32px;
      background: #0071F9;
      color: #ffffff;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      transition: background 0.15s ease;
    }

    .__blocked_dismiss_btn:hover {
      background: #1a56db;
    }
  `
  document.head.appendChild(style)
}

function createOverlay(): HTMLDivElement {
  injectStyles()
  const overlay = document.createElement('div')
  overlay.id = '__blocked_overlay'

  overlay.innerHTML = `
    <div id="__blocked_card">
      <div class="__blocked_header">
        <div class="__blocked_icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 class="__blocked_title">Security Warning</h2>
        <p class="__blocked_subtitle" id="__blocked_subtitle"></p>
      </div>
      <div class="__blocked_divider"></div>
      <div id="__blocked_issues"></div>
      <div class="__blocked_footer">
        <button id="__blocked_check_btn" class="__blocked_dismiss_btn">I Understand</button>
      </div>
    </div>
  `

  overlay.querySelector('#__blocked_check_btn')!.addEventListener('click', () => {
    // Dismiss overlay, auto re-check after 30s
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

  // User dismissed, wait 30s before showing again
  if (Date.now() < dismissedUntil) return

  if (!overlay) {
    overlay = createOverlay()
    document.body.appendChild(overlay)
  }

  // Count issues
  const issueCount = (multipleDisplays ? 1 : 0) + (blockedProcesses.length > 0 ? 1 : 0)

  const subtitle = overlay.querySelector('#__blocked_subtitle') as HTMLParagraphElement
  subtitle.textContent = issueCount === 1
    ? 'We detected an issue that must be resolved before you can continue.'
    : `We detected ${issueCount} issues that must be resolved before you can continue.`

  const issues = overlay.querySelector('#__blocked_issues') as HTMLDivElement

  let html = ''

  if (multipleDisplays) {
    html += `
      <div class="__blocked_issue">
        <div class="__blocked_issue_icon --display">&#9783;</div>
        <div class="__blocked_issue_body">
          <p class="__blocked_issue_title --display">Multiple displays detected</p>
          <p class="__blocked_issue_desc">Only one display is allowed. Please disconnect all external monitors to continue.</p>
        </div>
      </div>
    `
  }

  if (blockedProcesses.length > 0) {
    html += `
      <div class="__blocked_issue">
        <div class="__blocked_issue_icon --software">&#9888;</div>
        <div class="__blocked_issue_body">
          <p class="__blocked_issue_title --software">Prohibited software detected</p>
          <p class="__blocked_issue_desc">Please close the following applications:</p>
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
ipcRenderer.on('force-security-check', (_event, data: { blockedProcesses: string[]; displayCount: number }) => {
  blockedProcesses = data.blockedProcesses
  multipleDisplays = data.displayCount > 1
  dismissedUntil = 0
  renderOverlay()
})

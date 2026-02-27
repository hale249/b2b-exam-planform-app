import { ipcRenderer } from 'electron'

interface ConfirmOptions {
  id: string
  icon: string
  iconColor: string
  title: string
  message: string
  confirmLabel: string
  confirmColor: string
  cancelLabel: string
}

let overlay: HTMLDivElement | null = null
let activeKeydownHandler: ((e: KeyboardEvent) => void) | null = null
let cancelAction = (): void => {}

function injectStyles(): void {
  if (document.getElementById('__confirm_styles')) return
  const style = document.createElement('style')
  style.id = '__confirm_styles'
  style.textContent = `
    #__confirm_overlay {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: #303030cc;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      pointer-events: all;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    #__confirm_card {
      background: #ffffff;
      border-radius: 20px;
      padding: 20px;
      max-width: 400px;
      width: fit-content;
      min-width: 320px;
      margin: 20px;
      max-height: 100%;
      overflow: auto;
      text-align: center;
      font-family: ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      transform: scale(0.95);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      z-index: 20;
    }

    #__confirm_card.show {
      transform: scale(1);
    }

    .__confirm_title {
      color: #05060f;
      text-align: center;
      font-size: 20px;
      font-weight: 700;
      line-height: 28px;
      margin: 0 0 8px 0;
    }

    .__confirm_message {
      color: #374151;
      text-align: center;
      font-size: 16px;
      font-style: normal;
      font-weight: 400;
      line-height: 24px;
      letter-spacing: 0.08px;
      margin: 0 0 16px 0;
    }

    .__confirm_actions {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }

    .__confirm_btn {
      flex: 1;
      padding: 10px 16px;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      line-height: 20px;
      text-align: center;
      transition: background 0.15s ease, filter 0.15s ease;
      outline: none;
    }

    .__confirm_btn:active {
      filter: brightness(0.92);
    }

    .__confirm_btn_cancel {
      background: #f3f4f6;
      color: #23242d;
    }
    .__confirm_btn_cancel:hover {
      background: #e5e7eb;
    }

    .__confirm_btn_ok {
      background: #0071f9;
      color: #ffffff;
    }
    .__confirm_btn_ok:hover {
      background: #1a56db;
    }
  `
  document.head.appendChild(style)
}

function createOverlay(): HTMLDivElement {
  injectStyles()
  const el = document.createElement('div')
  el.id = '__confirm_overlay'

  el.innerHTML = `
    <div id="__confirm_card">
      <h2 id="__confirm_title" class="__confirm_title"></h2>
      <p id="__confirm_message" class="__confirm_message"></p>
      <div class="__confirm_actions">
        <button id="__confirm_cancel_btn" class="__confirm_btn __confirm_btn_cancel"></button>
        <button id="__confirm_ok_btn" class="__confirm_btn __confirm_btn_ok"></button>
      </div>
    </div>
  `

  el.addEventListener('click', (e) => {
    if (e.target === el) cancelAction()
  })

  return el
}

function showConfirm(options: ConfirmOptions): void {
  if (!overlay) {
    overlay = createOverlay()
    document.body.appendChild(overlay)
  }

  const card = overlay.querySelector('#__confirm_card') as HTMLDivElement
  const title = overlay.querySelector('#__confirm_title') as HTMLHeadingElement
  const message = overlay.querySelector('#__confirm_message') as HTMLParagraphElement
  const okBtn = overlay.querySelector('#__confirm_ok_btn') as HTMLButtonElement
  const cancelBtn = overlay.querySelector('#__confirm_cancel_btn') as HTMLButtonElement

  title.textContent = options.title
  message.textContent = options.message
  okBtn.textContent = options.confirmLabel
  cancelBtn.textContent = options.cancelLabel

  // Show
  overlay.style.display = 'flex'
  card.classList.remove('show')
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay!.style.opacity = '1'
      card.classList.add('show')
      okBtn.focus()
    })
  })

  const cleanup = () => {
    okBtn.onclick = null
    cancelBtn.onclick = null
    if (activeKeydownHandler) {
      document.removeEventListener('keydown', activeKeydownHandler)
      activeKeydownHandler = null
    }
    overlay!.style.opacity = '0'
    card.classList.remove('show')
    setTimeout(() => { overlay!.style.display = 'none' }, 200)
  }

  const confirm = () => {
    cleanup()
    ipcRenderer.send('confirm-response', { id: options.id, confirmed: true })
  }

  const cancel = () => {
    cleanup()
    ipcRenderer.send('confirm-response', { id: options.id, confirmed: false })
  }

  okBtn.onclick = confirm
  cancelBtn.onclick = cancel
  cancelAction = cancel

  if (activeKeydownHandler) {
    document.removeEventListener('keydown', activeKeydownHandler, true)
  }
  // Delay registering keydown to avoid catching the same Esc that opened the confirm
  setTimeout(() => {
    activeKeydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        cancel()
      } else if (e.key === 'Enter') {
        e.stopPropagation()
        e.preventDefault()
        confirm()
      }
    }
    document.addEventListener('keydown', activeKeydownHandler, true)
  }, 200)
}

ipcRenderer.on('show-confirm', (_event, options: ConfirmOptions) => {
  showConfirm(options)
})
